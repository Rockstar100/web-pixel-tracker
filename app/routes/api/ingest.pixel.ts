import { PrismaClient } from "@prisma/client";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import { AttributionTracker } from "../../services/attribution";
import { PrivacyManager } from "../../services/privacy";
import type { PixelEvent, ShopConfigData } from "../../services/types";

const prisma = new PrismaClient();

// Basic CORS headers so the web pixel (running on the storefront domain)
// can POST events to this API on a different origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type ActionArgs = { request: Request };

/**
 * Pixel event ingestion endpoint
 * Receives events from Web Pixel extension
 */
export async function action({ request }: ActionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: CORS_HEADERS },
    );
  }

  try {
    const pixelEvent: PixelEvent = await request.json();

    // Extract shop from request (could be from subdomain or header)
  const shop = request.headers.get("X-Shopify-Shop-Domain") ||
               pixelEvent.shopDomain ||
               extractShopFromUrl(request.headers.get("referer") || "");
    const normalizedShop = normalizeShopDomain(shop);

    if (!shop) {
      return Response.json(
        { error: "Shop not identified" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Get shop configuration
    if (!normalizedShop) {
      return Response.json(
        { error: "Shop not identified" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const shopConfig = await findShopConfig(normalizedShop);

    if (!shopConfig) {
      return Response.json(
        { error: "Shop not configured" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Check if pixel tracking is enabled
    if (!shopConfig.pixelEnabled) {
      return Response.json(
        { message: "Pixel tracking disabled" },
        { status: 200, headers: CORS_HEADERS },
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
        { status: 200, headers: CORS_HEADERS },
      );
    }

    normalizedEvent = privacyCheckedEvent;

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
        { status: 200, headers: CORS_HEADERS },
      );
    }

    // Capture attribution if it's a page view with UTM params
    if (normalizedEvent.name === 'page_view' && normalizedEvent.utm) {
      const isFirstTouch = !await prisma.attribution.findFirst({
        where: { 
          sessionId: normalizedEvent.sessionId 
        }
      });

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
      { headers: CORS_HEADERS },
    );

  } catch (error) {
    console.error("Pixel ingestion error:", error);
    
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: CORS_HEADERS },
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
