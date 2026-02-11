import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import { AttributionTracker } from "../../services/attribution";
import { CustomerJourneyService } from "../../services/journey";
import type { ShopifyWebhookPayload, ShopConfigData } from "../../services/types";

const prisma = new PrismaClient();

/**
 * Orders/Paid webhook handler
 * This is the authoritative conversion event (server-side truth)
 * IMPORTANT: Only orders with financial_status="paid" are counted as conversions
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
    const typedShopConfig = shopConfig as ShopConfigData;
    const normalizedEvent = EventNormalizer.normalizeWebhookEvent(
      "orders/paid",
      payload,
      typedShopConfig
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

    // Enrich with attribution from order / previous touches
    const enrichedEvent = await AttributionTracker.enrichEvent(normalizedEvent);

    // Store order-level attribution using multi-touch history (last-click model)
    await AttributionTracker.assignOrderAttributionForPurchase(
      enrichedEvent,
      shopConfig.id
    );

    // Record purchase event in customer journey
    await CustomerJourneyService.recordEvent(enrichedEvent, shopConfig.id);

    // Track order status as paid/completed
    const orderId = normalizedEvent.orderId;
    const customerEmail = payload.customer?.email || payload.email || "unknown@unknown.com";
    const totalPrice = enrichedEvent.value || 0;
    const currency = enrichedEvent.currency || typedShopConfig.brand.defaultCurrency;
    const lineItems = enrichedEvent.itemsCount || payload.line_items?.length || 0;

    if (orderId) {
      await CustomerJourneyService.trackOrderStatus(
        orderId,
        customerEmail,
        'paid',
        payload.financial_status || 'paid',
        payload.fulfillment_status,
        totalPrice,
        currency,
        lineItems,
        shopConfig.id
      );
    }

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

    // Log health status
    await prisma.healthLog.create({
      data: {
        shopifyShop: shop,
        component: 'webhook',
        status: forwardResult.success ? 'success' : 'error',
        message: `Processed orders/paid webhook - conversion recorded`,
        details: JSON.stringify({
          orderId: normalizedEvent.orderId,
          customerHash: normalizedEvent.customerHash,
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
