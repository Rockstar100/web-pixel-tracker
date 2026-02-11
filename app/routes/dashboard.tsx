import { useLoaderData, Form, useActionData } from "react-router";
import { PrismaClient } from "@prisma/client";
import { EventDeduplicator } from "../services/deduplicator";
import { FunnelAnalyticsService } from "../services/funnels";

const prisma = new PrismaClient();

/**
 * Loader: Fetch brands and shop configurations
 */
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const [brands, shopConfig, healthLogs] = await Promise.all([
    prisma.brand.findMany({
      include: {
        shops: true
      }
    }),
    shop ? prisma.shopConfig.findUnique({
      where: { shopifyShop: shop },
      include: { brand: true }
    }) : null,
    shop ? prisma.healthLog.findMany({
      where: { shopifyShop: shop },
      orderBy: { timestamp: 'desc' },
      take: 50
    }) : []
  ]);

  // Get event stats and behavioral insights if shop is configured
  let stats = null;
  let channelPerformance: any[] = [];
  let channelFunnels: any[] = [];
  let lowRoasCampaigns: any[] = [];
  if (shopConfig) {
    stats = await EventDeduplicator.getStats(shopConfig.id, 7);

    // Simple channel-level performance for last 30 days using OrderAttribution + AdSpendDaily
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [attributions, adSpend] = await Promise.all([
      (prisma as any).orderAttribution.findMany({
        where: {
          shopConfigId: shopConfig.id,
          createdAt: { gte: since }
        }
      }),
      (prisma as any).adSpendDaily.findMany({
        where: {
          shopConfigId: shopConfig.id,
          date: { gte: since }
        }
      })
    ]);

    const spendByKey = new Map<string, { spend: number }>();
    adSpend.forEach((row: any) => {
      const key = [row.platform, row.campaignId || '', row.adId || ''].join('|');
      const bucket = spendByKey.get(key) || { spend: 0 };
      bucket.spend += row.spend;
      spendByKey.set(key, bucket);
    });

    const perfByKey = new Map<
      string,
      { channel: string; source: string; campaign?: string | null; adId?: string | null; orders: number; revenue: number; spend: number }
    >();

    attributions.forEach((attr: any) => {
      const key = [attr.channel, attr.source || '', attr.campaign || '', attr.adId || ''].join('|');
      const bucket =
        perfByKey.get(key) || {
          channel: attr.channel,
          source: attr.source,
          campaign: attr.campaign,
          adId: attr.adId || null,
          orders: 0,
          revenue: 0,
          spend: 0
        };

      bucket.orders += 1;
      bucket.revenue += attr.revenue;

      const spendKey = [attr.platform || '', attr.campaign || '', attr.adId || ''].join('|');
      const spendBucket = spendByKey.get(spendKey);
      if (spendBucket) {
        bucket.spend = spendBucket.spend;
      }

      perfByKey.set(key, bucket);
    });

    const perfArray = Array.from(perfByKey.values())
      .map((row) => ({
        ...row,
        roas: row.spend > 0 ? row.revenue / row.spend : null,
        mer: row.spend > 0 ? row.revenue / row.spend : null // same metric at this aggregation level
      }))
      .sort((a, b) => b.revenue - a.revenue);

    channelPerformance = perfArray.slice(0, 20);

    // Low-ROAS segments (campaigns performing poorly)
    lowRoasCampaigns = perfArray
      .filter((row) => row.spend > 0 && row.revenue > 0 && row.roas !== null && row.roas < 1)
      .slice(0, 20);

    // Funnel per channel based on pixel events
    channelFunnels = await FunnelAnalyticsService.getFunnelByChannel(shopConfig.id, 30);
  }

  return Response.json({
    brands,
    shopConfig,
    healthLogs,
    stats,
    channelPerformance,
    channelFunnels,
    lowRoasCampaigns,
    shop
  });
}

/**
 * Action: Handle form submissions
 */
export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "create-brand") {
      const brand = await prisma.brand.create({
        data: {
          name: formData.get("name") as string,
          umamiWebsiteUuid: formData.get("umamiWebsiteUuid") as string,
          domains: formData.get("domains") as string || "[]",
          defaultCurrency: formData.get("defaultCurrency") as string || "USD",
          enabled: formData.get("enabled") === "true"
        }
      });

      return Response.json({ success: true, brand });
    }

    if (action === "update-shop-config") {
      const shop = formData.get("shop") as string;
      const brandId = formData.get("brandId") as string;

      const shopConfig = await prisma.shopConfig.upsert({
        where: { shopifyShop: shop },
        update: {
          brandId,
          pixelEnabled: formData.get("pixelEnabled") === "true",
          webhookEnabled: formData.get("webhookEnabled") === "true",
          consentMode: formData.get("consentMode") as string || "relaxed",
          requireConsent: formData.get("requireConsent") === "true"
        },
        create: {
          shopifyShop: shop,
          brandId,
          pixelEnabled: formData.get("pixelEnabled") === "true",
          webhookEnabled: formData.get("webhookEnabled") === "true",
          consentMode: formData.get("consentMode") as string || "relaxed",
          requireConsent: formData.get("requireConsent") === "true"
        }
      });

      return Response.json({ success: true, shopConfig });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });

  } catch (error) {
    console.error("Action error:", error);
    return Response.json({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}

/**
 * Dashboard UI Component
 */
export default function Dashboard() {
  const {
    brands,
    shopConfig,
    healthLogs,
    stats,
    channelPerformance,
    channelFunnels,
    lowRoasCampaigns,
    shop,
  } = useLoaderData() as any;
  const actionData = useActionData() as any;

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Seleric Tracker Dashboard</h1>
      
      {/* Shop Info */}
      {shop && (
        <div style={{ marginBottom: "30px", padding: "15px", background: "#f5f5f5", borderRadius: "8px" }}>
          <h2>Shop: {shop}</h2>
          {shopConfig && (
            <p>Brand: <strong>{shopConfig.brand.name}</strong> | 
               Umami Website: <code>{shopConfig.brand.umamiWebsiteUuid}</code></p>
          )}
        </div>
      )}

      {/* Event Statistics */}
      {stats && (
        <div style={{ marginBottom: "30px", padding: "15px", background: "#e8f5e9", borderRadius: "8px" }}>
          <h2>📊 Event Statistics (Last 7 Days)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "15px" }}>
            <div>
              <h3>{stats.total}</h3>
              <p>Total Events</p>
            </div>
            <div>
              <h3>{stats.forwarded}</h3>
              <p>Forwarded to Umami</p>
            </div>
            <div>
              <h3>{stats.forwardRate.toFixed(1)}%</h3>
              <p>Forward Rate</p>
            </div>
            <div>
              <h3>{Object.keys(stats.byType).length}</h3>
              <p>Event Types</p>
            </div>
          </div>
          <div style={{ marginTop: "15px" }}>
            <h4>By Source:</h4>
            <ul>
              {Object.entries(stats.bySource).map(([source, count]) => (
                <li key={source}><strong>{source}:</strong> {count as number}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Channel & Campaign Performance */}
      {shopConfig && channelPerformance && channelPerformance.length > 0 && (
        <div style={{ marginBottom: "30px", padding: "15px", background: "#e0f2f1", borderRadius: "8px" }}>
          <h2>📈 Channel & Campaign Performance (Last 30 Days)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "10px" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>Channel</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Source</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Campaign</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Orders</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Revenue</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Spend</th>
                <th style={{ padding: "8px", textAlign: "right" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {channelPerformance.map((row: any) => (
                <tr key={`${row.channel}-${row.source}-${row.campaign || ''}-${row.adId || ''}`} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>{row.channel}</td>
                  <td style={{ padding: "8px" }}>{row.source}</td>
                  <td style={{ padding: "8px" }}>{row.campaign || "-"}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.orders}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.revenue.toFixed(2)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.spend > 0 ? row.spend.toFixed(2) : "-"}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.roas ? row.roas.toFixed(2) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Funnels by Channel (behavioral drop-off) */}
      {shopConfig && channelFunnels && channelFunnels.length > 0 && (
        <div style={{ marginBottom: "30px", padding: "15px", background: "#f1f5f9", borderRadius: "8px" }}>
          <h2>🧭 Funnels by Channel (Last 30 Days, Pixel Events)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "10px" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>Channel</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Source</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Page Views</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Add to Cart</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Begin Checkout</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Purchases</th>
                <th style={{ padding: "8px", textAlign: "right" }}>PV→Cart %</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Cart→Checkout %</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Checkout→Purchase %</th>
              </tr>
            </thead>
            <tbody>
              {channelFunnels.map((row: any) => (
                <tr key={`${row.channel}-${row.source}`} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>{row.channel}</td>
                  <td style={{ padding: "8px" }}>{row.source}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.stages.page_view}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.stages.add_to_cart}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.stages.begin_checkout}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.stages.purchase}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.conversionRates.pageViewToCart.toFixed(2)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.conversionRates.cartToCheckout.toFixed(2)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.conversionRates.checkoutToConversion.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Low-ROAS Campaign Segments */}
      {shopConfig && lowRoasCampaigns && lowRoasCampaigns.length > 0 && (
        <div style={{ marginBottom: "30px", padding: "15px", background: "#fef2f2", borderRadius: "8px" }}>
          <h2>⚠️ Low-ROAS Campaign Segments (ROAS &lt; 1, Last 30 Days)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "10px" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>Channel</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Source</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Campaign</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Orders</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Revenue</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Spend</th>
                <th style={{ padding: "8px", textAlign: "right" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {lowRoasCampaigns.map((row: any) => (
                <tr key={`low-${row.channel}-${row.source}-${row.campaign || ''}-${row.adId || ''}`} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>{row.channel}</td>
                  <td style={{ padding: "8px" }}>{row.source}</td>
                  <td style={{ padding: "8px" }}>{row.campaign || "-"}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.orders}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.revenue.toFixed(2)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.spend > 0 ? row.spend.toFixed(2) : "-"}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{row.roas ? row.roas.toFixed(2) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Configuration Form */}
      {shop && (
        <div style={{ marginBottom: "30px", padding: "15px", background: "#fff3e0", borderRadius: "8px" }}>
          <h2>⚙️ Configuration</h2>
          <Form method="post">
            <input type="hidden" name="action" value="update-shop-config" />
            <input type="hidden" name="shop" value={shop} />
            
            <div style={{ marginBottom: "15px" }}>
              <label>
                <strong>Brand:</strong>
                <select name="brandId" defaultValue={shopConfig?.brandId} style={{ marginLeft: "10px", padding: "5px" }}>
                  <option value="">Select a brand...</option>
                  {brands.map((brand: any) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <label>
                <input 
                  type="checkbox" 
                  name="pixelEnabled" 
                  value="true"
                  defaultChecked={shopConfig?.pixelEnabled ?? true}
                />
                {" "}Enable Pixel Tracking
              </label>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <label>
                <input 
                  type="checkbox" 
                  name="webhookEnabled" 
                  value="true"
                  defaultChecked={shopConfig?.webhookEnabled ?? true}
                />
                {" "}Enable Webhook Tracking
              </label>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <label>
                <strong>Consent Mode:</strong>
                <select name="consentMode" defaultValue={shopConfig?.consentMode || "relaxed"} style={{ marginLeft: "10px", padding: "5px" }}>
                  <option value="relaxed">Relaxed</option>
                  <option value="strict">Strict</option>
                </select>
              </label>
            </div>

            <button type="submit" style={{ padding: "10px 20px", background: "#4CAF50", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
              Save Configuration
            </button>
          </Form>

          {actionData?.success && (
            <div style={{ marginTop: "15px", padding: "10px", background: "#d4edda", color: "#155724", borderRadius: "4px" }}>
              ✓ Configuration saved successfully
            </div>
          )}
        </div>
      )}

      {/* Brand Management */}
      <div style={{ marginBottom: "30px", padding: "15px", background: "#e3f2fd", borderRadius: "8px" }}>
        <h2>🏷️ Brands</h2>
        
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ padding: "10px", textAlign: "left" }}>Name</th>
              <th style={{ padding: "10px", textAlign: "left" }}>Umami Website UUID</th>
              <th style={{ padding: "10px", textAlign: "left" }}>Currency</th>
              <th style={{ padding: "10px", textAlign: "left" }}>Shops</th>
              <th style={{ padding: "10px", textAlign: "left" }}>Status</th>
            </tr>
          </thead>
          <tbody>
              {brands.map((brand: any) => (
              <tr key={brand.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "10px" }}><strong>{brand.name}</strong></td>
                <td style={{ padding: "10px" }}><code>{brand.umamiWebsiteUuid}</code></td>
                <td style={{ padding: "10px" }}>{brand.defaultCurrency}</td>
                <td style={{ padding: "10px" }}>{brand.shops.length}</td>
                <td style={{ padding: "10px" }}>
                  <span style={{ padding: "3px 8px", background: brand.enabled ? "#4CAF50" : "#f44336", color: "white", borderRadius: "3px", fontSize: "12px" }}>
                    {brand.enabled ? "Active" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <details>
          <summary style={{ cursor: "pointer", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
            <strong>+ Add New Brand</strong>
          </summary>
          <Form method="post" style={{ marginTop: "15px" }}>
            <input type="hidden" name="action" value="create-brand" />
            
            <div style={{ marginBottom: "10px" }}>
              <input type="text" name="name" placeholder="Brand Name" required style={{ width: "100%", padding: "8px" }} />
            </div>
            
            <div style={{ marginBottom: "10px" }}>
              <input type="text" name="umamiWebsiteUuid" placeholder="Umami Website UUID" required style={{ width: "100%", padding: "8px" }} />
            </div>
            
            <div style={{ marginBottom: "10px" }}>
              <input type="text" name="defaultCurrency" placeholder="Currency (e.g., USD)" defaultValue="USD" style={{ width: "100%", padding: "8px" }} />
            </div>
            
            <button type="submit" style={{ padding: "8px 16px", background: "#2196F3", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
              Create Brand
            </button>
          </Form>
        </details>
      </div>

      {/* Health Logs */}
      {healthLogs.length > 0 && (
        <div style={{ padding: "15px", background: "#fafafa", borderRadius: "8px" }}>
          <h2>🏥 Health Logs (Recent 50)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>Time</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Component</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Status</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {healthLogs.map((log: any) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>{new Date(log.timestamp).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}><code>{log.component}</code></td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ 
                      padding: "2px 6px", 
                      background: log.status === 'success' ? '#4CAF50' : log.status === 'error' ? '#f44336' : '#ff9800', 
                      color: "white", 
                      borderRadius: "3px", 
                      fontSize: "11px" 
                    }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px" }}>{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
