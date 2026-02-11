import { PrismaClient } from "@prisma/client";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import { AttributionTracker } from "../../services/attribution";
import { PrivacyManager } from "../../services/privacy";
import { CustomerJourneyService } from "../../services/journey";
import type { PixelEvent, ShopConfigData } from "../../services/types";

const prisma = new PrismaClient();

type ActionArgs = { request: Request };

/**
 * Get CORS headers based on request origin
 * Reflects the Origin header for better security (allows specific domains)
 */
function getCorsHeaders(request: Request): Headers {
  const origin = request.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
  });
}

/**
 * Handle GET/HEAD/OPTIONS requests (CORS preflight lands here in React Router)
 */
export async function loader({ request }: ActionArgs) {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return handlePixelRequest(request, corsHeaders);
}

/**
 * Pixel event ingestion endpoint
 * Receives events from Web Pixel extension (POST)
 */
export async function action({ request }: ActionArgs) {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  return handlePixelRequest(request, corsHeaders);
}

async function parsePixelEvent(request: Request): Promise<PixelEvent> {
  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    const dataParam = url.searchParams.get("data");
    if (!dataParam) {
      throw new Error("Missing data parameter");
    }
    return JSON.parse(dataParam) as PixelEvent;
  }

  return (await request.json()) as PixelEvent;
}

async function handlePixelRequest(request: Request, corsHeaders: Headers) {
  try {
    const pixelEvent = await parsePixelEvent(request);

    // Extract shop from request (could be from subdomain or header)
    const shop = request.headers.get("X-Shopify-Shop-Domain") ||
                 pixelEvent.shopDomain ||
                 extractShopFromUrl(request.headers.get("referer") || "");
    const normalizedShop = normalizeShopDomain(shop);

    if (!normalizedShop) {
      return Response.json(
        { error: "Shop not identified" },
        { status: 400, headers: corsHeaders },
      );
    }

    const shopConfig = await findShopConfig(normalizedShop);

    if (!shopConfig) {
      return Response.json(
        { error: "Shop not configured" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Check if pixel tracking is enabled
    if (!shopConfig.pixelEnabled) {
      return Response.json(
        { message: "Pixel tracking disabled" },
        { status: 200, headers: corsHeaders },
      );
    }

    // Normalize the event
    const typedShopConfig: ShopConfigData = {
      ...shopConfig,
      consentMode: shopConfig.consentMode === "strict" ? "strict" : "relaxed",
      providerSettings: shopConfig.providerSettings
        ? (JSON.parse(shopConfig.providerSettings) as Record<string, unknown>)
        : undefined,
      brand: {
        ...shopConfig.brand,
        // Brand.domains is stored as JSON string in the DB; parse to string[]
        domains: JSON.parse(shopConfig.brand.domains) as string[],
      },
    };
    let normalizedEvent = EventNormalizer.normalizePixelEvent(
      pixelEvent,
      typedShopConfig
    );

    // Apply privacy policy (consent check + anonymization if needed)
    const hasConsent = true; // TODO: Get from Shopify Customer Privacy API
    const privacyCheckedEvent = PrivacyManager.applyPrivacyPolicy(
      normalizedEvent,
      typedShopConfig,
      hasConsent
    );

    if (!privacyCheckedEvent) {
      return Response.json(
        { message: "Event blocked by privacy policy" },
        { status: 200, headers: corsHeaders },
      );
    }

    normalizedEvent = privacyCheckedEvent;

    await CustomerJourneyService.recordEvent(normalizedEvent, shopConfig.id);

    // Check for duplicates
    const dedupeResult = await EventDeduplicator.checkAndStore(
      normalizedEvent,
      shopConfig.id
    );

    if (dedupeResult.isDuplicate) {
      return Response.json(
        { 
          message: "Duplicate event ignored",
          eventKey: dedupeResult.eventKey,
        },
        { status: 200, headers: corsHeaders },
      );
    }

    // Capture attribution for any event with UTM/referrer
    if (normalizedEvent.utm || normalizedEvent.referrer) {
      const isFirstTouch = normalizedEvent.sessionId
        ? !await prisma.attribution.findFirst({
            where: { sessionId: normalizedEvent.sessionId }
          })
        : false;

      await AttributionTracker.capture(normalizedEvent, shopConfig.id, isFirstTouch);
    }

    // Enrich with stored attribution
    const enrichedEvent = await AttributionTracker.enrichEvent(normalizedEvent);

    // Forward to Umami
    const forwardResult = await UmamiForwarder.forward(
      enrichedEvent,
      typedShopConfig
    );

    if (forwardResult.success) {
      await EventDeduplicator.markForwarded(
        dedupeResult.eventKey,
        forwardResult.umamiResponse
      );
    }

    return Response.json(
      {
        success: true,
        eventKey: dedupeResult.eventKey,
        forwarded: forwardResult.success,
      },
      { headers: corsHeaders },
    );

  } catch (error) {
    console.error("Pixel ingestion error:", error);

    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

/**
 * Extract shop domain from URL
 */
function extractShopFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check if it's a myshopify.com domain
    if (hostname.endsWith('.myshopify.com')) {
      return hostname;
    }

    // Check if it's a custom domain - would need to lookup in database
    // For now, return null for custom domains
    return null;
  } catch {
    return null;
  }
}

function normalizeShopDomain(shop: string | null): string | null {
  if (!shop) {
    return null;
  }

  const normalized = shop.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

async function findShopConfig(shop: string) {
  const shopConfig = await prisma.shopConfig.findUnique({
    where: { shopifyShop: shop },
    include: { brand: true }
  });

  if (shopConfig) {
    return shopConfig;
  }

  return prisma.shopConfig.findFirst({
    where: {
      brand: {
        domains: { contains: shop }
      }
    },
    include: { brand: true }
  });
}
