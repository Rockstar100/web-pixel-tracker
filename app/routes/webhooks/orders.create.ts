import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../shopify.server";
import { EventNormalizer } from "../../services/normalizer";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";
import type { ShopifyWebhookPayload, ShopConfigData } from "../../services/types";

const prisma = new PrismaClient();

/**
 * Orders/Create webhook handler
 * Captures order creation (before payment)
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

    const typedShopConfig = shopConfig as ShopConfigData;
    const normalizedEvent = EventNormalizer.normalizeWebhookEvent(
      "orders/create",
      payload,
      typedShopConfig
    );

    const dedupeResult = await EventDeduplicator.checkAndStore(
      normalizedEvent,
      shopConfig.id
    );

    if (!dedupeResult.isDuplicate) {
      await UmamiForwarder.forward(normalizedEvent, typedShopConfig);
    }

    return Response.json({ success: true, eventKey: dedupeResult.eventKey });

  } catch (error) {
    console.error("Orders/Create webhook error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
