import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import { AttributionTracker } from "../../services/attribution";
import type { ShopifyWebhookPayload } from "../../services/types";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * Orders/Paid webhook handler
 * This is the authoritative conversion event (server-side truth)
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Verify webhook authenticity
    const shop = request.headers.get("X-Shopify-Shop-Domain");
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
    const topic = request.headers.get("X-Shopify-Topic");

    if (!shop || !hmac || topic !== "orders/paid") {
      return Response.json({ error: "Invalid webhook" }, { status: 400 });
    }

    // Get raw body for HMAC verification
    const rawBody = await request.text();
    
    // TODO: Verify HMAC in production
    // const isValid = verifyWebhookHmac(rawBody, hmac, webhookSecret);
    // if (!isValid) return json({ error: "Invalid signature" }, { status: 401 });

    const payload: ShopifyWebhookPayload = JSON.parse(rawBody);

    // Get shop configuration
    const shopConfig = await prisma.shopConfig.findUnique({
      where: { shopifyShop: shop },
      include: { brand: true }
    });

    if (!shopConfig) {
      return Response.json({ error: "Shop not configured" }, { status: 404 });
    }

    // Check if webhook tracking is enabled
    if (!shopConfig.webhookEnabled) {
      return Response.json({ message: "Webhook tracking disabled" }, { status: 200 });
    }

    // Normalize the webhook event
    const normalizedEvent = EventNormalizer.normalizeWebhookEvent(
      "orders/paid",
      payload,
      shopConfig as any
    );

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

    // Enrich with attribution from order
    const enrichedEvent = await AttributionTracker.enrichEvent(normalizedEvent);

    // Store attribution for this order
    if (normalizedEvent.customerHash) {
      const lastTouch = await AttributionTracker.getLastTouch(
        normalizedEvent.customerHash
      );

      if (lastTouch) {
        await prisma.attribution.create({
          data: {
            shopConfigId: shopConfig.id,
            customerHash: normalizedEvent.customerHash,
            orderId: normalizedEvent.orderId!,
            utmSource: lastTouch.utmSource,
            utmMedium: lastTouch.utmMedium,
            utmCampaign: lastTouch.utmCampaign,
            utmTerm: lastTouch.utmTerm,
            utmContent: lastTouch.utmContent,
            landingPage: lastTouch.landingPage,
            referrer: lastTouch.referrer,
            firstTouch: false,
          }
        });
      }
    }

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

    // Log health status
    await prisma.healthLog.create({
      data: {
        shopifyShop: shop,
        component: 'webhook',
        status: forwardResult.success ? 'success' : 'error',
        message: `Processed orders/paid webhook`,
        details: JSON.stringify({
          orderId: normalizedEvent.orderId,
          value: normalizedEvent.value,
          forwarded: forwardResult.success
        })
      }
    });

    return Response.json({ 
      success: true,
      eventKey: dedupeResult.eventKey,
      forwarded: forwardResult.success
    });

  } catch (error) {
    console.error("Orders/Paid webhook error:", error);
    
    return Response.json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

/**
 * Verify Shopify webhook HMAC
 */
function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return hash === hmacHeader;
}
