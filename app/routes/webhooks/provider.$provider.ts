import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { ProviderRegistry } from "../../services/providers/base";
import { RazorpayProvider } from "../../services/providers/razorpay";
import { EventDeduplicator } from "../../services/deduplicator";
import { UmamiForwarder } from "../../services/umami-forwarder";

const prisma = new PrismaClient();

// Register providers
ProviderRegistry.register(new RazorpayProvider());

/**
 * Provider webhook handler
 * Receives webhooks from third-party payment providers (Razorpay, Stripe, etc.)
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const providerName = params.provider;

  if (!providerName) {
    return Response.json({ error: "Provider not specified" }, { status: 400 });
  }

  try {
    // Get provider connector
    const provider = ProviderRegistry.get(providerName);

    if (!provider) {
      return Response.json({ error: "Provider not supported" }, { status: 404 });
    }

    // Get shop from query param or header
    const shop = new URL(request.url).searchParams.get('shop') ||
                 request.headers.get("X-Shop-Domain");

    if (!shop) {
      return Response.json({ error: "Shop not specified" }, { status: 400 });
    }

    // Get provider connector config
    const connectorConfig = await prisma.providerConnector.findUnique({
      where: {
        shopifyShop_providerName: {
          shopifyShop: shop,
          providerName
        }
      }
    });

    if (!connectorConfig || !connectorConfig.enabled) {
      return Response.json({ message: "Provider connector not enabled" }, { status: 200 });
    }

    // Get webhook signature
    const signature = request.headers.get("X-Razorpay-Signature") ||
                     request.headers.get("X-Webhook-Signature") ||
                     "";

    // Get raw body
    const rawBody = await request.text();

    // Verify webhook
    const isValid = provider.verifyWebhook(
      rawBody,
      signature,
      connectorConfig.webhookSecret || ""
    );

    if (!isValid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse payload
    const payload = JSON.parse(rawBody);

    // Get shop config
    const shopConfig = await prisma.shopConfig.findUnique({
      where: { shopifyShop: shop },
      include: { brand: true }
    });

    if (!shopConfig) {
      return Response.json({ error: "Shop not configured" }, { status: 404 });
    }

    // Normalize provider webhook
    const normalizedEvent = provider.normalizeWebhook(
      payload,
      shop,
      shopConfig.brandId
    );

    if (!normalizedEvent) {
      return Response.json({ message: "Event not tracked" }, { status: 200 });
    }

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

    // Forward to Umami
    const forwardResult = await UmamiForwarder.forward(
      normalizedEvent,
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
        component: 'provider_webhook',
        status: forwardResult.success ? 'success' : 'error',
        message: `Processed ${providerName} webhook: ${normalizedEvent.name}`,
        details: JSON.stringify({
          provider: providerName,
          event: normalizedEvent.name,
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
    console.error(`Provider ${providerName} webhook error:`, error);
    
    return Response.json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
