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

    const shopKey = shopConfig.shopifyShop;

    console.log(
      `[Pixel] Received ${pixelEvent.name} from ${shopKey} (domain ${normalizedShop})`
    );

    // Deduplication key — always use myshopify domain for consistency
    const eventKey = `${shopKey}:pixel:${pixelEvent.name}:${
      pixelEvent.id || Date.now()
    }`;

    // Extract pixel context
    const sessionId = pixelEvent.clientId || null;
    const pageUrl = pixelEvent.context?.document?.location?.pathname || "/";
    const pageTitle = pixelEvent.context?.document?.title || "";
    const referrer = pixelEvent.context?.document?.referrer || "";
    const urlSearch = pixelEvent.context?.document?.location?.search || "";

    // Extract checkout/order data for conversion events
    const checkout = pixelEvent.data?.checkout;
    const pixelOrderId = checkout?.order?.id
      ? String(checkout.order.id)
      : pixelEvent.data?.order_id
        ? String(pixelEvent.data.order_id)
        : null;
    const pixelValue = checkout?.totalPrice?.amount
      ? parseFloat(checkout.totalPrice.amount)
      : pixelEvent.data?.total_price
        ? parseFloat(pixelEvent.data.total_price)
        : null;
    const pixelCurrency =
      checkout?.currencyCode ||
      shopConfig.brand?.defaultCurrency ||
      "INR";

    // Store event in EventReceived (dedup log)
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
          shopifyOrderId: pixelOrderId || undefined,
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

    // ── Store to CustomerEvent (same table the React Router route uses) ──
    const customerHash = sessionId ? hashSessionId(sessionId) : null;
    if (customerHash) {
      try {
        await db.customerEvent.create({
          data: {
            shopConfigId: shopConfig.id,
            customerHash,
            sessionId,
            eventType: pixelEvent.name,
            eventName:
              pixelEvent.name === "page_viewed"
                ? "Page View"
                : pixelEvent.name === "product_viewed"
                  ? "Product Viewed"
                  : pixelEvent.name === "product_added_to_cart"
                    ? "Added to Cart"
                    : pixelEvent.name === "checkout_started"
                      ? "Checkout Started"
                      : pixelEvent.name === "checkout_completed"
                        ? "Checkout Completed"
                        : pixelEvent.name,
            pageUrl,
            pageTitle: pageTitle || null,
            pageReferrer: referrer || null,
            orderId: pixelOrderId || null,
            checkoutId: checkout?.token || null,
            value: pixelValue || null,
            currency: pixelValue ? pixelCurrency : null,
            itemsCount: checkout?.lineItems?.length || null,
            source: "pixel",
            eventData: JSON.stringify(pixelEvent.data || {}),
          },
        });
      } catch (ceErr) {
        console.error("[Pixel] CustomerEvent store error:", ceErr.message);
      }

      // ── Upsert CustomerProfile ──
      try {
        const isPurchase = pixelEvent.name === "checkout_completed";
        const existing = await db.customerProfile.findUnique({
          where: {
            shopConfigId_customerHash: {
              shopConfigId: shopConfig.id,
              customerHash,
            },
          },
        });

        const totalOrderCount =
          (existing?.totalOrderCount || 0) + (isPurchase ? 1 : 0);
        const totalOrderValue =
          (existing?.totalOrderValue || 0) +
          (isPurchase ? pixelValue || 0 : 0);
        const averageOrderValue =
          totalOrderCount > 0 ? totalOrderValue / totalOrderCount : 0;

        await db.customerProfile.upsert({
          where: {
            shopConfigId_customerHash: {
              shopConfigId: shopConfig.id,
              customerHash,
            },
          },
          update: {
            lastActivityDate: new Date(),
            ...(isPurchase
              ? {
                  totalOrderCount,
                  totalOrderValue,
                  averageOrderValue,
                  lifetimeValue: totalOrderValue,
                  lastOrderDate: new Date(),
                  repeatCustomer: totalOrderCount > 1,
                }
              : {}),
          },
          create: {
            shopConfigId: shopConfig.id,
            customerHash,
            lastActivityDate: new Date(),
            totalOrderCount,
            totalOrderValue,
            averageOrderValue,
            lifetimeValue: totalOrderValue,
            firstOrderDate: isPurchase ? new Date() : null,
            lastOrderDate: isPurchase ? new Date() : null,
          },
        });
      } catch (cpErr) {
        console.error("[Pixel] CustomerProfile upsert error:", cpErr.message);
      }

      // ── Upsert CustomerJourney ──
      try {
        const now = new Date();
        const isPageView = pixelEvent.name === "page_viewed";
        const isAddToCart = pixelEvent.name === "product_added_to_cart";
        const isCheckoutStart = pixelEvent.name === "checkout_started";
        const isPurchase = pixelEvent.name === "checkout_completed";

        await db.customerJourney.upsert({
          where: {
            shopConfigId_customerHash: {
              shopConfigId: shopConfig.id,
              customerHash,
            },
          },
          update: {
            lastEventAt: now,
            totalEvents: { increment: 1 },
            ...(isPageView ? { pageViewCount: { increment: 1 } } : {}),
            ...(isAddToCart ? { addToCartCount: { increment: 1 } } : {}),
            ...(isCheckoutStart
              ? { beginCheckoutCount: { increment: 1 } }
              : {}),
            ...(isPurchase
              ? {
                  purchaseCount: { increment: 1 },
                  totalOrderValue: { increment: pixelValue || 0 },
                  totalOrdersCompleted: { increment: 1 },
                  frequency: { increment: 1 },
                  monetaryValue: { increment: pixelValue || 0 },
                }
              : {}),
          },
          create: {
            shopConfigId: shopConfig.id,
            customerHash,
            firstEventAt: now,
            lastEventAt: now,
            totalEvents: 1,
            pageViewCount: isPageView ? 1 : 0,
            addToCartCount: isAddToCart ? 1 : 0,
            beginCheckoutCount: isCheckoutStart ? 1 : 0,
            purchaseCount: isPurchase ? 1 : 0,
            totalOrderValue: isPurchase ? pixelValue || 0 : 0,
            totalOrdersCompleted: isPurchase ? 1 : 0,
            frequency: isPurchase ? 1 : 0,
            monetaryValue: isPurchase ? pixelValue || 0 : 0,
          },
        });
      } catch (cjErr) {
        console.error("[Pixel] CustomerJourney upsert error:", cjErr.message);
      }
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
// Auto-provision ShopConfig for unknown shops (prevents webhook data loss)
// ---------------------------------------------------------------------------
async function ensureShopConfig(db, shopDomain) {
  let shopConfig = await db.shopConfig.findUnique({
    where: { shopifyShop: shopDomain },
    include: { brand: true },
  });

  if (!shopConfig) {
    console.log(`[AutoConfig] Auto-creating Brand + ShopConfig for ${shopDomain}`);
    try {
      const brandName = shopDomain.replace(".myshopify.com", "");
      const placeholderUuid = `auto-${crypto.randomUUID()}`;
      const brand = await db.brand.create({
        data: {
          name: brandName,
          umamiWebsiteUuid: placeholderUuid,
          domains: JSON.stringify([shopDomain]),
          defaultCurrency: "INR",
          enabled: true,
        },
      });
      shopConfig = await db.shopConfig.create({
        data: {
          shopifyShop: shopDomain,
          brandId: brand.id,
          pixelEnabled: true,
          webhookEnabled: true,
          consentMode: "relaxed",
          requireConsent: false,
        },
        include: { brand: true },
      });
      console.log(`[AutoConfig] Created provisional config for ${shopDomain}`);
    } catch (err) {
      if (err?.code === "P2002") {
        shopConfig = await db.shopConfig.findUnique({
          where: { shopifyShop: shopDomain },
          include: { brand: true },
        });
      } else {
        console.error("[AutoConfig] Failed:", err);
      }
    }
  }
  return shopConfig;
}

// ---------------------------------------------------------------------------
// Helper: hash a sessionId to use as customerHash when no email is available
// ---------------------------------------------------------------------------
function hashSessionId(sessionId) {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

// ---------------------------------------------------------------------------
// Helper: find pixel session ID by matching a recent checkout_completed pixel
// event for the same order, so we can link the webhook to the browsing session
// ---------------------------------------------------------------------------
async function findPixelSessionForOrder(db, shopConfigId, orderId) {
  if (!orderId) return null;
  try {
    // Look for a recent checkout_completed pixel event that contains this order ID
    const recentPixelEvents = await db.customerEvent.findMany({
      where: {
        shopConfigId,
        source: "pixel",
        eventType: { in: ["checkout_completed", "checkout_started", "payment_info_submitted"] },
        timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // last hour
      },
      orderBy: { timestamp: "desc" },
      take: 10,
      select: { sessionId: true, customerHash: true, orderId: true, eventData: true },
    });

    // Try to match by orderId directly or by parsing eventData
    for (const ev of recentPixelEvents) {
      if (ev.orderId === orderId || ev.orderId === String(orderId)) {
        return ev.sessionId;
      }
      // Check eventData for order ID match
      if (ev.eventData) {
        try {
          const data = JSON.parse(ev.eventData);
          const pixelOrderId =
            data.order_id || data.checkout?.order?.id;
          if (
            pixelOrderId &&
            (String(pixelOrderId) === String(orderId) ||
             String(pixelOrderId).includes(String(orderId)))
          ) {
            return ev.sessionId;
          }
        } catch { /* ignore */ }
      }
    }

    // Fallback: return the most recent checkout session (best guess)
    if (recentPixelEvents.length > 0 && recentPixelEvents[0].sessionId) {
      console.log(`[Webhook] Using most recent pixel checkout session as fallback`);
      return recentPixelEvents[0].sessionId;
    }
  } catch (err) {
    console.error("[Webhook] findPixelSessionForOrder error:", err.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Webhook handler — processes Shopify order/customer webhooks
// Now writes to OrderTracking, CustomerEvent, CustomerProfile, CustomerJourney
// to match the same pipeline that pixel events go through.
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

    // Look up or auto-create shop configuration
    const shopConfig = await ensureShopConfig(db, shop);

    if (!shopConfig) {
      console.warn(`[Webhook] Shop not configured and auto-create failed: ${shop}`);
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
      eventName === "purchase" || eventName === "order_created"
        ? "conversion"
        : eventName.includes("order")
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
    const paymentMethod =
      payload.payment_gateway_names?.join(", ") || payload.gateway || "";

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

    // ── Store event in EventReceived (dedup log) ──
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
            payment_method: paymentMethod,
            line_items: (payload.line_items || []).map((li) => ({
              title: li.title,
              quantity: li.quantity,
              price: li.price,
              sku: li.sku,
            })),
          }),
          forwardedToUmami: false,
        },
      });
      console.log(`[Webhook] Stored EventReceived: ${eventKey}`);
    } catch (storeErr) {
      if (storeErr?.code === "P2002") {
        console.log(`[Webhook] Duplicate event ignored: ${eventKey}`);
        return res.status(200).json({ message: "Duplicate event", eventKey });
      }
      console.error("[Webhook] EventReceived store error:", storeErr);
    }

    // ── Try to find the matching pixel session (bridges browsing → purchase) ──
    const pixelSessionId = await findPixelSessionForOrder(
      db,
      shopConfig.id,
      orderId
    );
    if (pixelSessionId) {
      console.log(`[Webhook] Linked to pixel session: ${pixelSessionId}`);
    }

    // ── Store to CustomerEvent (same table pixel events use) ──
    const effectiveCustomerHash =
      customerHash || (pixelSessionId ? hashSessionId(pixelSessionId) : null);

    if (effectiveCustomerHash) {
      try {
        await db.customerEvent.create({
          data: {
            shopConfigId: shopConfig.id,
            customerHash: effectiveCustomerHash,
            sessionId: pixelSessionId || null,
            eventType: eventName,
            eventName:
              eventName === "purchase"
                ? "Purchase"
                : eventName === "order_created"
                  ? "Order Created"
                  : eventName === "order_updated"
                    ? "Order Updated"
                    : eventName === "customer_created"
                      ? "Customer Created"
                      : eventName,
            orderId: orderId || null,
            value: totalPrice || null,
            currency: currency || null,
            itemsCount: itemsCount || null,
            source: "webhook",
            eventData: JSON.stringify({
              order_number: payload.order_number,
              financial_status: payload.financial_status,
              payment_method: paymentMethod,
            }),
          },
        });
        console.log(
          `[Webhook] Stored CustomerEvent for hash=${effectiveCustomerHash.substring(0, 8)}`
        );
      } catch (ceErr) {
        console.error("[Webhook] CustomerEvent store error:", ceErr.message);
      }

      // ── Backfill customerHash on pixel events from the same session ──
      // This links anonymous browsing events to the identified customer.
      if (customerHash && pixelSessionId) {
        try {
          const updated = await db.customerEvent.updateMany({
            where: {
              shopConfigId: shopConfig.id,
              sessionId: pixelSessionId,
              customerHash: hashSessionId(pixelSessionId), // only update session-hashed ones
            },
            data: { customerHash },
          });
          if (updated.count > 0) {
            console.log(
              `[Webhook] Backfilled customerHash on ${updated.count} pixel events (session=${pixelSessionId})`
            );
          }
        } catch (bfErr) {
          console.error("[Webhook] Backfill error:", bfErr.message);
        }
      }
    }

    // ── Store/update OrderTracking (order lifecycle) ──
    if (orderId && (topic === "orders/create" || topic === "orders/paid" || topic === "orders/updated")) {
      try {
        const isOnlinePayment =
          paymentMethod &&
          !paymentMethod.toLowerCase().includes("cod") &&
          !paymentMethod.toLowerCase().includes("cash");
        const status =
          topic === "orders/paid"
            ? "paid"
            : topic === "orders/create"
              ? "created"
              : payload.cancelled_at
                ? "cancelled"
                : "updated";

        await db.orderTracking.upsert({
          where: {
            shopConfigId_shopifyOrderId: {
              shopConfigId: shopConfig.id,
              shopifyOrderId: orderId,
            },
          },
          update: {
            status,
            financialStatus: payload.financial_status || "pending",
            fulfillmentStatus: payload.fulfillment_status || null,
            paidAmount: topic === "orders/paid" ? (totalPrice || 0) : undefined,
            paidAt: topic === "orders/paid" ? new Date() : undefined,
            cancelledAt: payload.cancelled_at
              ? new Date(payload.cancelled_at)
              : undefined,
          },
          create: {
            shopConfigId: shopConfig.id,
            shopifyOrderId: orderId,
            customerEmail: customerEmail || "unknown@unknown.com",
            customerHash: customerHash || "unknown",
            status,
            financialStatus: payload.financial_status || "pending",
            fulfillmentStatus: payload.fulfillment_status || null,
            paymentMethod: isOnlinePayment ? "online_payment" : "cod",
            paymentGateway: paymentMethod || null,
            totalPrice: totalPrice || 0,
            paidAmount: topic === "orders/paid" ? (totalPrice || 0) : 0,
            currency,
            lineItems: itemsCount,
            paidAt: topic === "orders/paid" ? new Date() : null,
          },
        });
        console.log(`[Webhook] Stored OrderTracking for order ${orderId}`);
      } catch (otErr) {
        console.error("[Webhook] OrderTracking store error:", otErr.message);
      }
    }

    // ── Upsert CustomerProfile ──
    if (effectiveCustomerHash) {
      try {
        const isPurchase = eventName === "purchase";
        const existing = await db.customerProfile.findUnique({
          where: {
            shopConfigId_customerHash: {
              shopConfigId: shopConfig.id,
              customerHash: effectiveCustomerHash,
            },
          },
        });

        const totalOrderCount =
          (existing?.totalOrderCount || 0) + (isPurchase ? 1 : 0);
        const totalOrderValue =
          (existing?.totalOrderValue || 0) +
          (isPurchase ? totalPrice || 0 : 0);
        const averageOrderValue =
          totalOrderCount > 0 ? totalOrderValue / totalOrderCount : 0;

        await db.customerProfile.upsert({
          where: {
            shopConfigId_customerHash: {
              shopConfigId: shopConfig.id,
              customerHash: effectiveCustomerHash,
            },
          },
          update: {
            lastActivityDate: new Date(),
            totalOrderCount,
            totalOrderValue,
            averageOrderValue,
            lifetimeValue: totalOrderValue,
            ...(isPurchase
              ? {
                  lastOrderDate: new Date(),
                  repeatCustomer: totalOrderCount > 1,
                }
              : {}),
          },
          create: {
            shopConfigId: shopConfig.id,
            customerHash: effectiveCustomerHash,
            lastActivityDate: new Date(),
            totalOrderCount,
            totalOrderValue,
            averageOrderValue,
            lifetimeValue: totalOrderValue,
            firstOrderDate: isPurchase ? new Date() : null,
            lastOrderDate: isPurchase ? new Date() : null,
            repeatCustomer: false,
          },
        });
      } catch (cpErr) {
        console.error("[Webhook] CustomerProfile upsert error:", cpErr.message);
      }
    }

    // ── Upsert CustomerJourney summary ──
    if (effectiveCustomerHash) {
      try {
        const isPurchase = eventName === "purchase";
        const isOrderCreated = eventName === "order_created";
        const isOnlinePay =
          paymentMethod &&
          !paymentMethod.toLowerCase().includes("cod") &&
          !paymentMethod.toLowerCase().includes("cash");
        const now = new Date();

        await db.customerJourney.upsert({
          where: {
            shopConfigId_customerHash: {
              shopConfigId: shopConfig.id,
              customerHash: effectiveCustomerHash,
            },
          },
          update: {
            lastEventAt: now,
            totalEvents: { increment: 1 },
            ...(isPurchase
              ? {
                  purchaseCount: { increment: 1 },
                  totalOrderValue: { increment: totalPrice || 0 },
                  totalOrdersCompleted: { increment: 1 },
                  frequency: { increment: 1 },
                  monetaryValue: { increment: totalPrice || 0 },
                  ...(isOnlinePay
                    ? { onlinePaymentCount: { increment: 1 } }
                    : { codPaymentCount: { increment: 1 } }),
                }
              : {}),
          },
          create: {
            shopConfigId: shopConfig.id,
            customerHash: effectiveCustomerHash,
            firstEventAt: now,
            lastEventAt: now,
            totalEvents: 1,
            purchaseCount: isPurchase ? 1 : 0,
            totalOrderValue: isPurchase ? totalPrice || 0 : 0,
            totalOrdersCompleted: isPurchase ? 1 : 0,
            frequency: isPurchase ? 1 : 0,
            monetaryValue: isPurchase ? totalPrice || 0 : 0,
            onlinePaymentCount:
              isPurchase && isOnlinePay ? 1 : 0,
            codPaymentCount:
              isPurchase && !isOnlinePay ? 1 : 0,
          },
        });
      } catch (cjErr) {
        console.error("[Webhook] CustomerJourney upsert error:", cjErr.message);
      }
    }

    // ── Forward to Umami ──
    const umamiEndpoint =
      shopConfig.umamiEndpoint || process.env.UMAMI_ENDPOINT;
    const umamiWebsiteId = shopConfig.brand?.umamiWebsiteUuid;
    let forwarded = false;

    if (
      umamiEndpoint &&
      umamiWebsiteId &&
      !umamiWebsiteId.startsWith("auto-")
    ) {
      try {
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

        if (customerHash) eventData.customer_id = customerHash;

        if (
          (topic === "orders/paid" || topic === "orders/create") &&
          payload.line_items?.length > 0
        ) {
          eventData.products = payload.line_items
            .slice(0, 5)
            .map((li) => li.title)
            .join(", ");
        }

        // CRITICAL: Include revenue + currency for Umami revenue tracking
        if (totalPrice && totalPrice > 0) {
          eventData.revenue = totalPrice;
          eventData.currency = currency;
        }

        // Resolve custom hostname for Umami
        let storeHostname = shop.replace(".myshopify.com", "");
        try {
          const brandDomains = JSON.parse(shopConfig.brand?.domains || "[]");
          const customDomain = brandDomains.find(
            (d) => !d.includes("myshopify.com")
          );
          if (customDomain) storeHostname = customDomain;
        } catch { /* ignore */ }

        const umamiBody = {
          type: "event",
          payload: {
            website: umamiWebsiteId,
            hostname: storeHostname,
            url: `/orders/${payload.order_number || orderId}`,
            referrer: "",
            title: `Order #${payload.order_number || orderId}`,
            language: "en-US",
            screen: "1920x1080",
            name: eventName,
            data: eventData,
          },
        };

        console.log(
          `[Webhook] Forwarding ${eventName} to Umami (revenue=${totalPrice} ${currency})`
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

    // ── Log health status ──
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
            pixelSessionLinked: !!pixelSessionId,
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
      pixelSessionLinked: !!pixelSessionId,
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

// ---------------------------------------------------------------------------
// Dashboard Authentication (password-protected admin area)
// ---------------------------------------------------------------------------
const DASHBOARD_TOKEN_SECRET =
  process.env.SHOPIFY_API_SECRET || "seleric-dashboard-fallback-key";

function generateDashboardToken() {
  const payload = `dashboard:${Date.now()}`;
  const sig = crypto
    .createHmac("sha256", DASHBOARD_TOKEN_SECRET)
    .update(payload)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${sig}`;
}

function verifyDashboardToken(token) {
  if (!token) return false;
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return false;
    const payload = Buffer.from(payloadB64, "base64").toString();
    const expected = crypto
      .createHmac("sha256", DASHBOARD_TOKEN_SECRET)
      .update(payload)
      .digest("hex");
    if (sig !== expected) return false;
    // Check token age (valid for 24 hours)
    const ts = parseInt(payload.split(":")[1], 10);
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seleric Tracker — Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); width: 100%; max-width: 400px; }
    .logo { font-size: 24px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-weight: 600; font-size: 13px; color: #374151; margin-bottom: 6px; }
    input[type=password] { width: 100%; padding: 10px 14px; font-size: 15px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; transition: border 0.2s; }
    input[type=password]:focus { border-color: #008060; box-shadow: 0 0 0 3px rgba(0,128,96,0.12); }
    button { width: 100%; padding: 11px; margin-top: 18px; font-size: 15px; font-weight: 600; color: #fff; background: #008060; border: none; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #006e52; }
    .error { margin-top: 14px; padding: 10px 14px; background: #fef2f2; color: #b91c1c; border-radius: 8px; font-size: 13px; display: none; }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Seleric Tracker</div>
    <div class="subtitle">Sign in to access the admin dashboard</div>
    <form method="POST" action="/dashboard/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Enter dashboard password" required autofocus />
      <button type="submit">Sign In</button>
    </form>
    <div class="error __ERROR_CLASS__">Invalid password. Please try again.</div>
  </div>
</body>
</html>`;

// Login page GET
app.get("/dashboard/login", (req, res) => {
  const failed = req.query.error === "1";
  const html = LOGIN_PAGE_HTML.replace(
    "__ERROR_CLASS__",
    failed ? "show" : ""
  );
  res.type("html").send(html);
});

// Login POST (validates password, sets cookie)
app.post("/dashboard/login", express.urlencoded({ extended: false }), (req, res) => {
  const password = req.body?.password || "";
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    // No password set — block access entirely
    return res.status(503).send("Dashboard password not configured on server.");
  }

  if (password === expected) {
    const token = generateDashboardToken();
    res.cookie("__seleric_dash", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
    });
    return res.redirect("/dashboard");
  }

  return res.redirect("/dashboard/login?error=1");
});

// Logout
app.get("/dashboard/logout", (req, res) => {
  res.clearCookie("__seleric_dash", { path: "/" });
  res.redirect("/dashboard/login");
});

// Auth middleware — protect /dashboard (except /dashboard/login & /dashboard/logout)
import cookieParser from "cookie-parser";
app.use(cookieParser());

app.use("/dashboard", (req, res, next) => {
  // Allow login/logout routes through
  if (req.path === "/login" || req.path === "/logout") return next();

  const token = req.cookies?.__seleric_dash;
  if (verifyDashboardToken(token)) {
    return next();
  }

  // Not authenticated — redirect to login
  return res.redirect("/dashboard/login");
});

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
});
