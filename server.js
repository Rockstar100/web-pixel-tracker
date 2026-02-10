/**
 * Custom production server for Seleric-Tracker.
 *
 * Why this exists:
 *   react-router-serve cannot add middleware *before* React Router processes the
 *   request. Shopify Web Pixels send cross-origin POST requests to
 *   /api/ingest/pixel, which React Router's built-in CSRF protection rejects
 *   (Origin != Host).  This custom server intercepts those requests at the
 *   Express level, fully handles CORS + pixel ingestion, and forwards
 *   everything else to React Router as normal.
 */

import express from "express";
import compression from "compression";
import { createRequestHandler } from "@react-router/express";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Singleton Prisma client for pixel ingestion
// ---------------------------------------------------------------------------
let prisma = null;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Shopify-Shop-Domain"
  );
}

// ---------------------------------------------------------------------------
// Browser User-Agent (Umami's isbot filter silently drops non-browser UAs)
// ---------------------------------------------------------------------------
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Pixel ingestion handler
// ---------------------------------------------------------------------------
async function handlePixelIngestion(req, res) {
  try {
    const pixelEvent = req.body;
    const shopDomain =
      req.headers["x-shopify-shop-domain"] ||
      pixelEvent.shopDomain ||
      null;

    if (!shopDomain) {
      return res.status(400).json({ error: "Shop not identified" });
    }

    const db = getPrisma();
    const normalizedShop = shopDomain
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");

    // Look up shop configuration — try direct match first, then custom domain fallback
    let shopConfig = await db.shopConfig.findUnique({
      where: { shopifyShop: normalizedShop },
      include: { brand: true },
    });

    // Fallback: if not found by exact domain, search brands whose domains list
    // contains this custom domain (e.g. "tiltingheads.com" → brand → shopConfig)
    if (!shopConfig) {
      const allBrands = await db.brand.findMany({
        where: { enabled: true },
        include: { shops: true },
      });

      for (const brand of allBrands) {
        try {
          const brandDomains = JSON.parse(brand.domains || "[]");
          // Check if the custom domain matches any brand domain or myshopify domain
          const match = brandDomains.some(
            (d) => d.replace(/^www\./, "").toLowerCase() === normalizedShop
          );
          if (match && brand.shops.length > 0) {
            shopConfig = await db.shopConfig.findUnique({
              where: { shopifyShop: brand.shops[0].shopifyShop },
              include: { brand: true },
            });
            if (shopConfig) {
              console.log(
                `[Pixel] Resolved custom domain ${normalizedShop} → ${shopConfig.shopifyShop}`
              );
              break;
            }
          }
        } catch {
          // ignore JSON parse errors
        }
      }
    }

    // Still try one more fallback: search all shop configs for custom domain match
    if (!shopConfig) {
      // Check if any shopConfig's brand has this domain in its domains list
      const allConfigs = await db.shopConfig.findMany({
        include: { brand: true },
      });
      for (const cfg of allConfigs) {
        const myshopDomain = cfg.shopifyShop.replace(".myshopify.com", "");
        // Check if custom domain contains the shop name pattern
        if (normalizedShop.includes(myshopDomain)) {
          shopConfig = cfg;
          console.log(
            `[Pixel] Fuzzy matched ${normalizedShop} → ${cfg.shopifyShop}`
          );
          break;
        }
      }
    }

    if (!shopConfig) {
      console.warn(`[Pixel] Shop not configured for domain: ${normalizedShop}`);
      return res.status(404).json({ error: "Shop not configured" });
    }

    if (!shopConfig.pixelEnabled) {
      return res.status(200).json({ message: "Pixel tracking disabled" });
    }

    console.log(`[Pixel] Received ${pixelEvent.name} from ${normalizedShop}`);

    // Deduplication key
    const eventKey = `${normalizedShop}:pixel:${pixelEvent.name}:${
      pixelEvent.id || Date.now()
    }`;

    // Store event
    try {
      await db.eventReceived.create({
        data: {
          shopConfigId: shopConfig.id,
          eventKey,
          eventType:
            pixelEvent.name === "page_viewed"
              ? "page_view"
              : pixelEvent.name,
          eventSource: "pixel",
          eventName: pixelEvent.name,
          eventData: JSON.stringify(pixelEvent.data || {}),
          forwardedToUmami: false,
        },
      });
      console.log(`[Pixel] Stored event: ${eventKey}`);
    } catch (storeErr) {
      if (storeErr?.code === "P2002") {
        console.log(`[Pixel] Duplicate event ignored: ${eventKey}`);
        return res
          .status(200)
          .json({ message: "Duplicate event", eventKey });
      }
      console.error("[Pixel] DB store error:", storeErr);
    }

    // Forward to Umami
    const umamiEndpoint =
      shopConfig.umamiEndpoint || process.env.UMAMI_ENDPOINT;
    const umamiWebsiteId = shopConfig.brand?.umamiWebsiteUuid;
    let forwarded = false;

    if (umamiEndpoint && umamiWebsiteId) {
      try {
        const umamiBody = {
          type: "event",
          payload: {
            website: umamiWebsiteId,
            hostname:
              pixelEvent.context?.document?.location?.hostname ||
              normalizedShop,
            url:
              pixelEvent.context?.document?.location?.pathname || "/",
            referrer:
              pixelEvent.context?.document?.referrer || "",
            title:
              pixelEvent.context?.document?.title || "",
            language: "en-US",
            screen: "1920x1080",
            name:
              pixelEvent.name !== "page_viewed"
                ? pixelEvent.name
                : undefined,
            data:
              pixelEvent.name !== "page_viewed"
                ? pixelEvent.data
                : undefined,
          },
        };

        console.log(`[Pixel] Forwarding to Umami: ${umamiEndpoint}`);

        const umamiResp = await fetch(umamiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": BROWSER_UA,
          },
          body: JSON.stringify(umamiBody),
        });

        const umamiText = await umamiResp.text();
        console.log(
          `[Pixel] Umami response: ${umamiResp.status} ${umamiText}`
        );

        forwarded = umamiResp.ok;

        // Update DB record with forward result
        try {
          await db.eventReceived.update({
            where: { eventKey },
            data: {
              forwardedToUmami: forwarded,
              umamiResponse: umamiText,
            },
          });
        } catch {
          /* ignore update error */
        }
      } catch (umamiErr) {
        console.error("[Pixel] Umami forward error:", umamiErr);
      }
    } else {
      console.warn(
        `[Pixel] Umami not configured: endpoint=${umamiEndpoint}, websiteId=${umamiWebsiteId}`
      );
    }

    return res.status(200).json({ success: true, eventKey, forwarded });
  } catch (err) {
    console.error("[Pixel] Ingestion error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// HMAC verification for Shopify webhooks
// ---------------------------------------------------------------------------
import crypto from "crypto";

function verifyShopifyHmac(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !hmacHeader) return false;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(hmacHeader)
  );
}

// ---------------------------------------------------------------------------
// Webhook handler — processes Shopify order/customer webhooks
// ---------------------------------------------------------------------------
async function handleShopifyWebhook(req, res, rawBody) {
  try {
    const shop = req.headers["x-shopify-shop-domain"];
    const topic = req.headers["x-shopify-topic"];
    const hmac = req.headers["x-shopify-hmac-sha256"];

    if (!shop || !topic) {
      return res.status(400).json({ error: "Missing shop or topic header" });
    }

    // Verify HMAC
    if (!verifyShopifyHmac(rawBody, hmac)) {
      console.warn(`[Webhook] Invalid HMAC for ${topic} from ${shop}`);
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody);
    const db = getPrisma();

    console.log(`[Webhook] Received ${topic} from ${shop}`);

    // Look up shop configuration
    const shopConfig = await db.shopConfig.findUnique({
      where: { shopifyShop: shop },
      include: { brand: true },
    });

    if (!shopConfig) {
      console.warn(`[Webhook] Shop not configured: ${shop}`);
      return res.status(404).json({ error: "Shop not configured" });
    }

    if (!shopConfig.webhookEnabled) {
      return res.status(200).json({ message: "Webhook tracking disabled" });
    }

    // Normalize event name
    const eventNameMap = {
      "orders/create": "order_created",
      "orders/paid": "purchase",
      "orders/updated": "order_updated",
      "customers/create": "customer_created",
    };
    const eventName = eventNameMap[topic] || topic.replace("/", "_");

    // Determine event type
    const eventType =
      eventName.includes("purchase") || eventName.includes("order")
        ? "conversion"
        : eventName.includes("customer")
          ? "customer"
          : "other";

    // Extract order data
    const orderId = payload.id ? String(payload.id) : undefined;
    const totalPrice = payload.total_price
      ? parseFloat(payload.total_price)
      : undefined;
    const currency =
      payload.currency || shopConfig.brand?.defaultCurrency || "USD";
    const itemsCount = payload.line_items?.length || 0;

    // Hash customer email for privacy
    let customerHash = null;
    const customerEmail = payload.customer?.email || payload.email;
    if (customerEmail) {
      customerHash = crypto
        .createHash("sha256")
        .update(customerEmail.toLowerCase().trim())
        .digest("hex");
    }

    // Build dedupe key
    const eventKey = `${shop}:webhook:${eventName}:${orderId || Date.now()}`;

    // Store event (with deduplication)
    try {
      await db.eventReceived.create({
        data: {
          shopConfigId: shopConfig.id,
          eventKey,
          eventType,
          eventSource: "webhook",
          eventName,
          shopifyOrderId: orderId,
          eventData: JSON.stringify({
            total_price: totalPrice,
            currency,
            items_count: itemsCount,
            financial_status: payload.financial_status,
            fulfillment_status: payload.fulfillment_status,
            order_number: payload.order_number,
            line_items: (payload.line_items || []).map((li) => ({
              title: li.title,
              quantity: li.quantity,
              price: li.price,
              sku: li.sku,
              variant_title: li.variant_title,
              product_id: li.product_id,
            })),
          }),
          forwardedToUmami: false,
        },
      });
      console.log(`[Webhook] Stored event: ${eventKey}`);
    } catch (storeErr) {
      if (storeErr?.code === "P2002") {
        console.log(`[Webhook] Duplicate event ignored: ${eventKey}`);
        return res.status(200).json({ message: "Duplicate event", eventKey });
      }
      console.error("[Webhook] DB store error:", storeErr);
    }

    // Forward to Umami
    const umamiEndpoint =
      shopConfig.umamiEndpoint || process.env.UMAMI_ENDPOINT;
    const umamiWebsiteId = shopConfig.brand?.umamiWebsiteUuid;
    let forwarded = false;

    if (umamiEndpoint && umamiWebsiteId) {
      try {
        // Build Umami event data with order details
        const eventData = {
          event_type: eventType,
          order_id: orderId,
          order_number: payload.order_number,
          value: totalPrice,
          currency,
          items_count: itemsCount,
          financial_status: payload.financial_status,
          source: "webhook",
        };

        // Add customer hash (not PII)
        if (customerHash) {
          eventData.customer_id = customerHash;
        }

        // Add line item summaries for purchase events
        if (
          topic === "orders/paid" &&
          payload.line_items?.length > 0
        ) {
          eventData.products = payload.line_items
            .slice(0, 5)
            .map((li) => li.title)
            .join(", ");
        }

        const umamiBody = {
          type: "event",
          payload: {
            website: umamiWebsiteId,
            hostname: shop.replace(".myshopify.com", ".com"),
            url: `/orders/${payload.order_number || orderId}`,
            referrer: "",
            title: `${eventName} - Order #${payload.order_number || orderId}`,
            language: "en-US",
            screen: "1920x1080",
            name: eventName,
            data: eventData,
          },
        };

        console.log(
          `[Webhook] Forwarding ${eventName} to Umami: ${umamiEndpoint}`
        );

        const umamiResp = await fetch(umamiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": BROWSER_UA,
          },
          body: JSON.stringify(umamiBody),
        });

        const umamiText = await umamiResp.text();
        console.log(
          `[Webhook] Umami response: ${umamiResp.status} ${umamiText}`
        );

        forwarded = umamiResp.ok;

        // Update DB record
        try {
          await db.eventReceived.update({
            where: { eventKey },
            data: {
              forwardedToUmami: forwarded,
              umamiResponse: umamiText,
            },
          });
        } catch {
          /* ignore update error */
        }
      } catch (umamiErr) {
        console.error("[Webhook] Umami forward error:", umamiErr);
      }
    }

    // Log health status
    try {
      await db.healthLog.create({
        data: {
          shopifyShop: shop,
          component: "webhook",
          status: forwarded ? "success" : "warning",
          message: `Processed ${topic} webhook`,
          details: JSON.stringify({
            orderId,
            orderNumber: payload.order_number,
            value: totalPrice,
            currency,
            forwarded,
          }),
        },
      });
    } catch {
      /* ignore health log error */
    }

    return res.status(200).json({
      success: true,
      eventKey,
      forwarded,
      event: eventName,
    });
  } catch (err) {
    console.error("[Webhook] Handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// Gzip compression for all responses
app.use(compression());

// ---- Pixel ingestion (BEFORE React Router, bypasses CSRF) ----

// CORS preflight
app.options("/api/ingest/pixel", (req, res) => {
  setCorsHeaders(req, res);
  res.status(204).end();
});

// Pixel POST handler
app.post("/api/ingest/pixel", express.json(), (req, res) => {
  setCorsHeaders(req, res);
  handlePixelIngestion(req, res);
});

// ---- Shopify webhook handlers (BEFORE React Router, bypasses CSRF) ----
// Raw body needed for HMAC verification
app.post(
  "/api/webhooks/orders-create",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = req.body.toString("utf8");
    req.body = undefined; // clear so handler can use rawBody
    handleShopifyWebhook(req, res, rawBody);
  }
);

app.post(
  "/api/webhooks/orders-paid",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = req.body.toString("utf8");
    req.body = undefined;
    handleShopifyWebhook(req, res, rawBody);
  }
);

app.post(
  "/api/webhooks/orders-updated",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = req.body.toString("utf8");
    req.body = undefined;
    handleShopifyWebhook(req, res, rawBody);
  }
);

app.post(
  "/api/webhooks/customers-create",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = req.body.toString("utf8");
    req.body = undefined;
    handleShopifyWebhook(req, res, rawBody);
  }
);

// ---- Razorpay webhook handler ----
async function handleRazorpayWebhook(req, res, rawBody) {
  try {
    const signature =
      req.headers["x-razorpay-signature"] || "";
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

    // Verify HMAC signature
    if (secret) {
      const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("hex");
      if (expected !== signature) {
        console.warn("[Razorpay] Invalid webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    } else {
      console.warn(
        "[Razorpay] RAZORPAY_WEBHOOK_SECRET not set — skipping signature check"
      );
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event; // e.g. "payment.authorized"
    const entity =
      payload.payload?.payment?.entity ||
      payload.payload?.order?.entity ||
      {};

    console.log(`[Razorpay] Received ${event}`);

    // Map Razorpay events → normalized event names
    const eventMap = {
      "payment.authorized": { name: "payment_authorized", type: "checkout" },
      "payment.captured": { name: "payment_captured", type: "conversion" },
      "payment.failed": { name: "payment_failed", type: "checkout" },
      "order.paid": { name: "razorpay_order_paid", type: "conversion" },
    };

    const mapped = eventMap[event];
    if (!mapped) {
      console.log(`[Razorpay] Ignoring event: ${event}`);
      return res.status(200).json({ message: "Event not tracked" });
    }

    // Extract order data (Razorpay amounts are in paise → divide by 100)
    const value = entity.amount ? entity.amount / 100 : undefined;
    const currency = (entity.currency || "INR").toUpperCase();
    const razorpayOrderId = entity.order_id || entity.id || "";
    const paymentId = entity.id || "";
    const paymentMethod = entity.method || "";

    // Hash customer email for privacy
    let customerHash = null;
    const email =
      entity.email || entity.customer_details?.email || "";
    if (email) {
      customerHash = crypto
        .createHash("sha256")
        .update(email.toLowerCase().trim())
        .digest("hex");
    }

    // Resolve shop — use Razorpay notes or find by checking all enabled shops
    // Razorpay notes often contain shopify_order_id or shop domain
    const notes = entity.notes || {};
    let shopDomain =
      notes.shopify_domain ||
      notes.shop_domain ||
      notes.shop ||
      req.query.shop ||
      "";

    const db = getPrisma();
    let shopConfig = null;

    if (shopDomain) {
      shopConfig = await db.shopConfig.findUnique({
        where: { shopifyShop: shopDomain },
        include: { brand: true },
      });
    }

    // Fallback: find shop that has Razorpay enabled via ProviderConnector
    if (!shopConfig) {
      const connectors = await db.providerConnector.findMany({
        where: { providerName: "razorpay", enabled: true },
      });
      if (connectors.length > 0) {
        shopConfig = await db.shopConfig.findUnique({
          where: { shopifyShop: connectors[0].shopifyShop },
          include: { brand: true },
        });
        if (shopConfig) shopDomain = shopConfig.shopifyShop;
      }
    }

    // Last fallback: use first enabled shop config
    if (!shopConfig) {
      const firstShop = await db.shopConfig.findFirst({
        where: { webhookEnabled: true },
        include: { brand: true },
      });
      if (firstShop) {
        shopConfig = firstShop;
        shopDomain = firstShop.shopifyShop;
      }
    }

    if (!shopConfig) {
      console.warn("[Razorpay] No shop configured");
      return res.status(404).json({ error: "No shop configured" });
    }

    // Build dedupe key
    const eventKey = `${shopDomain}:razorpay:${mapped.name}:${paymentId || razorpayOrderId || Date.now()}`;

    // Store event
    try {
      await db.eventReceived.create({
        data: {
          shopConfigId: shopConfig.id,
          eventKey,
          eventType: mapped.type,
          eventSource: "provider",
          eventName: mapped.name,
          shopifyOrderId: notes.shopify_order_id
            ? String(notes.shopify_order_id)
            : undefined,
          eventData: JSON.stringify({
            provider: "razorpay",
            razorpay_event: event,
            payment_id: paymentId,
            order_id: razorpayOrderId,
            method: paymentMethod,
            status: entity.status,
            value,
            currency,
            customer_hash: customerHash,
          }),
          forwardedToUmami: false,
        },
      });
      console.log(`[Razorpay] Stored event: ${eventKey}`);
    } catch (storeErr) {
      if (storeErr?.code === "P2002") {
        console.log(`[Razorpay] Duplicate event ignored: ${eventKey}`);
        return res
          .status(200)
          .json({ message: "Duplicate event", eventKey });
      }
      console.error("[Razorpay] DB store error:", storeErr);
    }

    // Forward to Umami
    const umamiEndpoint =
      shopConfig.umamiEndpoint || process.env.UMAMI_ENDPOINT;
    const umamiWebsiteId = shopConfig.brand?.umamiWebsiteUuid;
    let forwarded = false;

    if (umamiEndpoint && umamiWebsiteId) {
      try {
        const umamiBody = {
          type: "event",
          payload: {
            website: umamiWebsiteId,
            hostname: shopDomain.replace(".myshopify.com", ".com"),
            url: `/checkout/razorpay/${mapped.name}`,
            referrer: "",
            title: `${mapped.name} — Razorpay`,
            language: "en-US",
            screen: "1920x1080",
            name: mapped.name,
            data: {
              event_type: mapped.type,
              provider: "razorpay",
              payment_id: paymentId,
              order_id: razorpayOrderId,
              method: paymentMethod,
              value,
              currency,
              source: "provider",
            },
          },
        };

        const umamiResp = await fetch(umamiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": BROWSER_UA,
          },
          body: JSON.stringify(umamiBody),
        });

        const umamiText = await umamiResp.text();
        console.log(
          `[Razorpay] Umami response: ${umamiResp.status} ${umamiText}`
        );
        forwarded = umamiResp.ok;

        try {
          await db.eventReceived.update({
            where: { eventKey },
            data: { forwardedToUmami: forwarded, umamiResponse: umamiText },
          });
        } catch {
          /* ignore */
        }
      } catch (umamiErr) {
        console.error("[Razorpay] Umami forward error:", umamiErr);
      }
    }

    // Health log
    try {
      await db.healthLog.create({
        data: {
          shopifyShop: shopDomain,
          component: "provider_webhook",
          status: forwarded ? "success" : "warning",
          message: `Processed Razorpay ${event}`,
          details: JSON.stringify({
            paymentId,
            orderId: razorpayOrderId,
            value,
            currency,
            method: paymentMethod,
            forwarded,
          }),
        },
      });
    } catch {
      /* ignore */
    }

    return res
      .status(200)
      .json({ success: true, eventKey, forwarded, event: mapped.name });
  } catch (err) {
    console.error("[Razorpay] Webhook error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

app.post(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = req.body.toString("utf8");
    req.body = undefined;
    handleRazorpayWebhook(req, res, rawBody);
  }
);

// ---- Static files from the React Router client build ----
app.use(
  express.static("build/client", {
    immutable: true,
    maxAge: "1y",
  })
);

// Serve static assets that aren't fingerprinted with a shorter cache
app.use(express.static("build/client", { maxAge: "1h" }));

// ---- React Router handles everything else ----
app.all(
  "{*splat}",
  createRequestHandler({
    // In production the build is pre-built on disk
    build: () => import("./build/server/index.js"),
  })
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = Number(process.env.PORT) || 4201;

app.listen(port, "0.0.0.0", () => {
  console.log(`[Seleric-Tracker] Production server listening on port ${port}`);
  console.log(`[Seleric-Tracker] Pixel ingestion:    POST /api/ingest/pixel`);
  console.log(`[Seleric-Tracker] Webhook endpoints:`);
  console.log(`  POST /api/webhooks/orders-create    (Shopify)`);
  console.log(`  POST /api/webhooks/orders-paid      (Shopify)`);
  console.log(`  POST /api/webhooks/orders-updated   (Shopify)`);
  console.log(`  POST /api/webhooks/customers-create (Shopify)`);
  console.log(`  POST /api/webhooks/razorpay         (Razorpay)`);
});
