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
 * Orders/Refunded webhook handler
 * Captures order refund events (partial or full)
 * IMPORTANT: This is a REVERSAL of a purchase, not a new conversion
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

    // Get the order ID from refund payload
    const orderId = payload.order_id ? String(payload.order_id) : undefined;
    if (!orderId) {
      return Response.json({ error: "Missing order_id" }, { status: 400 });
    }

    // Fetch the full order data from Shopify to get customer info
    // Note: The refund webhook doesn't include customer info, we need to look it up
    const orderTracking = await prisma.orderTracking.findUnique({
      where: {
        shopConfigId_shopifyOrderId: {
          shopConfigId: shopConfig.id,
          shopifyOrderId: orderId
        }
      }
    });

    if (!orderTracking) {
      console.warn(`Order ${orderId} not found in tracking, cannot process refund`);
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const typedShopConfig = shopConfig as ShopConfigData;

    // Normalize the refund event
    const normalizedEvent = EventNormalizer.normalizeWebhookEvent(
      "orders/refund",
      {
        ...payload,
        id: orderId,
        email: orderTracking.customerEmail,
        total_price: String(orderTracking.totalPrice),
        currency: orderTracking.currency
      },
      typedShopConfig
    );

    // Create a unique event key for deduplication
    const refundEventKey = `${shop}|${orderId}|refund|${new Date().toISOString().split('T')[0]}`;

    // Check for duplicates
    const dedupeResult = await EventDeduplicator.checkAndStore(
      normalizedEvent,
      shopConfig.id,
      refundEventKey
    );

    if (dedupeResult.isDuplicate) {
      return Response.json({
        message: "Duplicate refund event ignored",
        eventKey: dedupeResult.eventKey
      }, { status: 200 });
    }

    // Record the refund in customer journey
    await CustomerJourneyService.recordEvent(normalizedEvent, shopConfig.id);

    // Update order tracking status to refunded
    const refundAmount = payload.transactions?.[0]?.amount
      ? parseFloat(payload.transactions[0].amount)
      : orderTracking.totalPrice;

    await CustomerJourneyService.trackOrderStatus(
      orderId,
      orderTracking.customerEmail,
      'refunded',
      'refunded',
      orderTracking.fulfillmentStatus,
      refundAmount,
      orderTracking.currency,
      orderTracking.lineItems,
      shopConfig.id
    );

    // Forward refund event to Umami
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
        status: forwardResult.success ? 'success' : 'error',
        message: `Processed orders/refund webhook`,
        details: JSON.stringify({
          orderId,
          customerHash: normalizedEvent.customerHash,
          refundAmount,
          forwarded: forwardResult.success
        })
      }
    });

    return Response.json({
      success: true,
      eventKey: dedupeResult.eventKey,
      forwarded: forwardResult.success,
      orderId
    });

  } catch (error) {
    console.error("Orders/Refund webhook error:", error);

    return Response.json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
