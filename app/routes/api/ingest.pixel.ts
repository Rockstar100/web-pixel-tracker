import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import { AttributionTracker } from "../../services/attribution";
import { PrivacyManager } from "../../services/privacy";
import type { PixelEvent } from "../../services/types";

const prisma = new PrismaClient();

/**
 * Pixel event ingestion endpoint
 * Receives events from Web Pixel extension
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const pixelEvent: PixelEvent = await request.json();

    // Extract shop from request (could be from subdomain or header)
    const shop = request.headers.get("X-Shopify-Shop-Domain") ||
                 extractShopFromUrl(request.headers.get("referer") || "");

    if (!shop) {
      return Response.json({ error: "Shop not identified" }, { status: 400 });
    }

    // Get shop configuration
    const shopConfig = await prisma.shopConfig.findUnique({
      where: { shopifyShop: shop },
      include: { brand: true }
    });

    if (!shopConfig) {
      return Response.json({ error: "Shop not configured" }, { status: 404 });
    }

    // Check if pixel tracking is enabled
    if (!shopConfig.pixelEnabled) {
      return Response.json({ message: "Pixel tracking disabled" }, { status: 200 });
    }

    // Normalize the event
    let normalizedEvent = EventNormalizer.normalizePixelEvent(
      pixelEvent,
      shopConfig as any
    );

    // Apply privacy policy (consent check + anonymization if needed)
    const hasConsent = true; // TODO: Get from Shopify Customer Privacy API
    const privacyCheckedEvent = PrivacyManager.applyPrivacyPolicy(
      normalizedEvent,
      shopConfig as any,
      hasConsent
    );

    if (!privacyCheckedEvent) {
      return Response.json({ message: "Event blocked by privacy policy" }, { status: 200 });
    }

    normalizedEvent = privacyCheckedEvent;

    // Check for duplicates
    const dedupeResult = await EventDeduplicator.checkAndStore(
      normalizedEvent,
      shopConfig.id
    );

    if (dedupeResult.isDuplicate) {
      return Response.json({ 
        message: "Duplicate event ignored",
        eventKey: dedupeResult.eventKey 
      }, { status: 200 });
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
      shopConfig as any
    );

    if (forwardResult.success) {
      await EventDeduplicator.markForwarded(
        dedupeResult.eventKey,
        forwardResult.umamiResponse
      );
    }

    return Response.json({ 
      success: true,
      eventKey: dedupeResult.eventKey,
      forwarded: forwardResult.success
    });

  } catch (error) {
    console.error("Pixel ingestion error:", error);
    
    return Response.json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
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
