import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Vite plugin that handles the pixel ingestion endpoint ENTIRELY outside
 * React Router. This avoids React Router's CSRF protection (which blocks
 * cross-origin POST) and handles CORS directly.
 */
let pixelPrisma: any = null;

function pixelIngestPlugin(): Plugin {
  return {
    name: "pixel-ingest-cors",
    configureServer(server) {
      console.log("[pixel-ingest-cors] Middleware registered");
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const url = req.url || "";
          if (!url.startsWith("/api/ingest/pixel")) {
            return next();
          }
          console.log(`[pixel-ingest-cors] Intercepted ${req.method} ${url}`);

          const origin = (req.headers.origin as string) || "*";

          // CORS headers on every response
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Shopify-Shop-Domain");

          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          // Read the POST body and handle it
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", async () => {
            try {
              const pixelEvent = JSON.parse(body);
              const shopDomain =
                (req.headers["x-shopify-shop-domain"] as string) ||
                pixelEvent.shopDomain ||
                null;

              if (!shopDomain) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Shop not identified" }));
                return;
              }

              // Use a singleton Prisma client for the middleware
              if (!pixelPrisma) {
                const { PrismaClient } = await import("@prisma/client");
                pixelPrisma = new PrismaClient();
              }
              const prisma = pixelPrisma;

              try {
                const normalizedShop = shopDomain.trim().toLowerCase().replace(/^www\./, "");
                const shopConfig = await prisma.shopConfig.findUnique({
                  where: { shopifyShop: normalizedShop },
                  include: { brand: true },
                });

                if (!shopConfig) {
                  res.statusCode = 404;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: "Shop not configured" }));
                  return;
                }

                if (!shopConfig.pixelEnabled) {
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ message: "Pixel tracking disabled" }));
                  return;
                }

                // Log the received event
                console.log(`[Pixel] Received ${pixelEvent.name} from ${normalizedShop}`);

                // Generate a unique event key for deduplication
                const eventKey = `${normalizedShop}:pixel:${pixelEvent.name}:${pixelEvent.id || Date.now()}`;

                // Store event in EventReceived table
                try {
                  await prisma.eventReceived.create({
                    data: {
                      shopConfigId: shopConfig.id,
                      eventKey,
                      eventType: pixelEvent.name === "page_viewed" ? "page_view" : pixelEvent.name,
                      eventSource: "pixel",
                      eventName: pixelEvent.name,
                      eventData: JSON.stringify(pixelEvent.data || {}),
                      forwardedToUmami: false,
                    },
                  });
                  console.log(`[Pixel] Stored event: ${eventKey}`);
                } catch (storeErr: any) {
                  // Duplicate key = already processed, skip
                  if (storeErr?.code === "P2002") {
                    console.log(`[Pixel] Duplicate event ignored: ${eventKey}`);
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ message: "Duplicate event", eventKey }));
                    return;
                  }
                  console.error("[Pixel] DB store error:", storeErr);
                }

                // Forward to Umami if configured
                const umamiEndpoint = shopConfig.umamiEndpoint || process.env.UMAMI_ENDPOINT;
                const umamiWebsiteId = shopConfig.brand?.umamiWebsiteUuid;
                let forwarded = false;

                if (umamiEndpoint && umamiWebsiteId) {
                  try {
                    // Use Umami v2 /api/send format
                    const umamiBody = {
                      type: pixelEvent.name === "page_viewed" ? "event" : "event",
                      payload: {
                        website: umamiWebsiteId,
                        hostname: pixelEvent.context?.document?.location?.hostname || normalizedShop,
                        url: pixelEvent.context?.document?.location?.pathname || "/",
                        referrer: pixelEvent.context?.document?.referrer || "",
                        title: pixelEvent.context?.document?.title || "",
                        language: "en-US",
                        screen: "1920x1080",
                        name: pixelEvent.name !== "page_viewed" ? pixelEvent.name : undefined,
                        data: pixelEvent.name !== "page_viewed" ? pixelEvent.data : undefined,
                      },
                    };

                    console.log(`[Pixel] Sending to Umami: ${umamiEndpoint}`);
                    console.log(`[Pixel] Umami payload:`, JSON.stringify(umamiBody));

                    const umamiResp = await fetch(umamiEndpoint, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        // Must use a real browser User-Agent or Umami's isbot filter silently drops the event
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                      },
                      body: JSON.stringify(umamiBody),
                    });

                    const umamiStatus = umamiResp.status;
                    const umamiText = await umamiResp.text();
                    console.log(`[Pixel] Umami response: ${umamiStatus} ${umamiText}`);

                    forwarded = umamiResp.ok;

                    // Update EventReceived with forward status
                    try {
                      await prisma.eventReceived.update({
                        where: { eventKey },
                        data: {
                          forwardedToUmami: forwarded,
                          umamiResponse: umamiText,
                        },
                      });
                    } catch { /* ignore update error */ }
                  } catch (umamiErr) {
                    console.error("[Pixel] Umami forward error:", umamiErr);
                  }
                } else {
                  console.warn(`[Pixel] Umami not configured: endpoint=${umamiEndpoint}, websiteId=${umamiWebsiteId}`);
                }

                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  success: true,
                  eventKey,
                  forwarded,
                }));
              } finally {
                // Don't disconnect - reuse the singleton
              }
            } catch (err) {
              console.error("[Pixel] Ingestion error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Internal server error" }));
            }
          });
        }
      );
    },
  };
}

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host, "hypochlorous-steve-mortifiedly.ngrok-free.dev", ".ngrok-free.dev", ".trycloudflare.com"],
    cors: {
      origin: true,
      methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "X-Shopify-Shop-Domain"],
      credentials: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    pixelIngestPlugin(),
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
