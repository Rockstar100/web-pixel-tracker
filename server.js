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

    // Look up shop configuration
    const shopConfig = await db.shopConfig.findUnique({
      where: { shopifyShop: normalizedShop },
      include: { brand: true },
    });

    if (!shopConfig) {
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
  console.log(`[Seleric-Tracker] Pixel ingestion: POST /api/ingest/pixel`);
});
