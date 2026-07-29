import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shopify.server";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import { CustomerJourneyService } from "../../services/journey";
import type { ShopifyWebhookPayload, ShopConfigData } from "../../services/types";

const prisma = new PrismaClient();

/**
 * Orders/Cancelled webhook handler
 * Captures order cancellation events
 * IMPORTANT: Cancelled orders should NOT count as conversions
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // authenticate.webhook verifies the X-Shopify-Hmac-Sha256 signature
    // and throws (401) if it's missing or invalid.
    const { shop, payload: rawPayload } = await authenticate.webhook(request);

    if (!shop) {
      return Response.json({ error: "Invalid webhook" }, { status: 400 });
    }

    const payload = rawPayload as ShopifyWebhookPayload;

    const shopConfig = await prisma.shopConfig.findUnique({
      where: { shopifyShop: shop },
      include: { brand: true }
    });

    if (!shopConfig?.webhookEnabled) {
      return Response.json({ message: "Webhook tracking disabled" }, { status: 200 });
    }

    const orderId = payload.id ? String(payload.id) : undefined;
    if (!orderId) {
      return Response.json({ error: "Missing order ID" }, { status: 400 });
    }

    const typedShopConfig = shopConfig as ShopConfigData;

    // Normalize the cancellation event
    const normalizedEvent = EventNormalizer.normalizeWebhookEvent(
      "orders/cancelled",
      payload,
      typedShopConfig
    );

    // Create unique event key for cancellation
    const cancelEventKey = `${shop}|${orderId}|cancel|${new Date().toISOString().split('T')[0]}`;

    // Check for duplicates
    const dedupeResult = await EventDeduplicator.checkAndStore(
      normalizedEvent,
      shopConfig.id,
      cancelEventKey
    );

    if (dedupeResult.isDuplicate) {
      return Response.json({
        message: "Duplicate cancellation event ignored",
        eventKey: dedupeResult.eventKey
      }, { status: 200 });
    }

    // Record cancellation in customer journey
    await CustomerJourneyService.recordEvent(normalizedEvent, shopConfig.id);

    // Track order cancellation status
    const totalPrice = payload.total_price ? parseFloat(payload.total_price) : 0;
    const currency = payload.currency || typedShopConfig.brand.defaultCurrency;
    const lineItems = payload.line_items?.length || 0;

    await CustomerJourneyService.trackOrderStatus(
      orderId,
      payload.customer?.email || payload.email || "unknown@unknown.com",
      'cancelled',
      payload.financial_status || 'cancelled',
      payload.fulfillment_status,
      totalPrice,
      currency,
      lineItems,
      shopConfig.id
    );

    // Forward cancellation event to Umami
    const forwardResult = await UmamiForwarder.forward(
      normalizedEvent,
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
        status: forwardResult.success ? 'success' : 'warning',
        message: `Processed orders/cancelled webhook - order removed from conversion tracking`,
        details: JSON.stringify({
          orderId,
          customerHash: normalizedEvent.customerHash,
          cancelledValue: totalPrice,
          forwarded: forwardResult.success
        })
      }
    });

    return Response.json({
      success: true,
      eventKey: dedupeResult.eventKey,
      forwarded: forwardResult.success,
      orderId,
      note: "Order cancelled - not counted as conversion"
    });

  } catch (error) {
    console.error("Orders/Cancelled webhook error:", error);

    return Response.json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
