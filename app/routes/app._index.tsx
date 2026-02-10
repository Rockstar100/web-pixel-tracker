import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopConfig = await prisma.shopConfig.findUnique({
    where: { shopifyShop: shop },
    include: { brand: true },
  });

  const brands = await prisma.brand.findMany({
    where: { enabled: true },
    include: { shops: true },
  });

  let stats = null;
  let recentEvents: { eventName: string; eventSource: string; createdAt: Date; forwardedToUmami: boolean }[] = [];
  if (shopConfig) {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [total, forwarded, byType, bySource, recent] = await Promise.all([
      prisma.eventReceived.count({
        where: { shopConfigId: shopConfig.id, createdAt: { gte: since } },
      }),
      prisma.eventReceived.count({
        where: { shopConfigId: shopConfig.id, createdAt: { gte: since }, forwardedToUmami: true },
      }),
      prisma.eventReceived.groupBy({
        by: ["eventType"],
        where: { shopConfigId: shopConfig.id, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.eventReceived.groupBy({
        by: ["eventSource"],
        where: { shopConfigId: shopConfig.id, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.eventReceived.findMany({
        where: { shopConfigId: shopConfig.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { eventName: true, eventSource: true, createdAt: true, forwardedToUmami: true },
      }),
    ]);

    stats = {
      total,
      forwarded,
      forwardRate: total > 0 ? (forwarded / total) * 100 : 0,
      byType: byType.reduce((acc, item) => { acc[item.eventType] = item._count; return acc; }, {} as Record<string, number>),
      bySource: bySource.reduce((acc, item) => { acc[item.eventSource] = item._count; return acc; }, {} as Record<string, number>),
    };
    recentEvents = recent;
  }

  return { shop, shopConfig, brands, stats, recentEvents, isConfigured: !!shopConfig };
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "setup") {
      const umamiWebsiteUuid = (formData.get("umamiWebsiteUuid") as string).trim();
      const brandName = (formData.get("brandName") as string).trim();
      const defaultCurrency = (formData.get("defaultCurrency") as string || "USD").trim();

      if (!umamiWebsiteUuid) return { error: "Umami Website ID is required." };
      if (!brandName) return { error: "Brand name is required." };

      let brand = await prisma.brand.findUnique({ where: { umamiWebsiteUuid } });
      if (!brand) {
        brand = await prisma.brand.create({
          data: { name: brandName, umamiWebsiteUuid, domains: JSON.stringify([shop]), defaultCurrency, enabled: true },
        });
      } else {
        const existingDomains: string[] = JSON.parse(brand.domains || "[]");
        if (!existingDomains.includes(shop)) {
          existingDomains.push(shop);
          await prisma.brand.update({ where: { id: brand.id }, data: { domains: JSON.stringify(existingDomains) } });
        }
      }

      await prisma.shopConfig.upsert({
        where: { shopifyShop: shop },
        update: { brandId: brand.id },
        create: { shopifyShop: shop, brandId: brand.id, pixelEnabled: true, webhookEnabled: true, consentMode: "relaxed", requireConsent: false },
      });

      return { success: true, message: "Configuration saved! Pixel tracking is now active." };
    }

    if (intent === "update-settings") {
      const pixelEnabled = formData.get("pixelEnabled") === "on";
      const webhookEnabled = formData.get("webhookEnabled") === "on";
      const consentMode = (formData.get("consentMode") as string) || "relaxed";
      await prisma.shopConfig.update({ where: { shopifyShop: shop }, data: { pixelEnabled, webhookEnabled, consentMode } });
      return { success: true, message: "Settings updated successfully." };
    }

    if (intent === "update-website-id") {
      const umamiWebsiteUuid = (formData.get("umamiWebsiteUuid") as string).trim();
      if (!umamiWebsiteUuid) return { error: "Umami Website ID is required." };
      const shopConfig = await prisma.shopConfig.findUnique({ where: { shopifyShop: shop }, include: { brand: true } });
      if (shopConfig) {
        const existingBrand = await prisma.brand.findUnique({ where: { umamiWebsiteUuid } });
        if (existingBrand && existingBrand.id !== shopConfig.brandId) {
          await prisma.shopConfig.update({ where: { shopifyShop: shop }, data: { brandId: existingBrand.id } });
        } else if (!existingBrand) {
          await prisma.brand.update({ where: { id: shopConfig.brandId }, data: { umamiWebsiteUuid } });
        }
      }
      return { success: true, message: "Website ID updated successfully." };
    }

    return { error: "Invalid action." };
  } catch (error) {
    console.error("Action error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function Index() {
  const { shop, shopConfig, brands, stats, recentEvents, isConfigured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) shopify.toast.show(actionData.message || "Saved!");
  }, [actionData, shopify]);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", fontSize: "14px", borderRadius: "8px", border: "1px solid #8c9196", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, fontSize: "13px", marginBottom: "4px" };

  if (!isConfigured) {
    return (
      <s-page heading="Welcome to Seleric Tracker">
        <s-section heading="Set up tracking for your store">
          <s-paragraph>
            Connect your store to Seleric analytics by entering your <s-text fontWeight="bold">Umami Website ID</s-text>.
            This ID links your Shopify events (page views, add-to-cart, purchases) to your analytics dashboard.
          </s-paragraph>
          <s-box padding="base" background="subdued" borderRadius="base" style={{ marginTop: "12px" }}>
            <s-paragraph><s-text fontWeight="bold">Your store:</s-text> <s-text>{shop}</s-text></s-paragraph>
          </s-box>
          {actionData?.error && <s-banner tone="critical" style={{ marginTop: "12px" }}>{actionData.error}</s-banner>}
          <Form method="post" style={{ marginTop: "16px" }}>
            <input type="hidden" name="intent" value="setup" />
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Brand Name *</label>
              <input type="text" name="brandName" placeholder="e.g. My Store" required style={inputStyle} />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Umami Website ID *</label>
              <input type="text" name="umamiWebsiteUuid" placeholder="e.g. 42031c15-26b4-41ab-9b59-76e0a629f0a5" required style={inputStyle} />
              <p style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>Find this in your Umami dashboard under Settings &rarr; Websites.</p>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Default Currency</label>
              <select name="defaultCurrency" defaultValue="USD" style={{ ...inputStyle, appearance: "auto", background: "#fff" }}>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="INR">INR — Indian Rupee</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="JPY">JPY — Japanese Yen</option>
                <option value="CNY">CNY — Chinese Yuan</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="SGD">SGD — Singapore Dollar</option>
              </select>
            </div>
            <button type="submit" disabled={isSubmitting} style={{ padding: "10px 24px", fontSize: "14px", fontWeight: 600, color: "#fff", background: isSubmitting ? "#8c9196" : "#008060", border: "none", borderRadius: "8px", cursor: isSubmitting ? "not-allowed" : "pointer" }}>
              {isSubmitting ? "Connecting..." : "Connect Store"}
            </button>
          </Form>
        </s-section>
        <s-section slot="aside" heading="How It Works">
          <s-unordered-list>
            <s-list-item>Enter your <s-text fontWeight="bold">Brand Name</s-text> and <s-text fontWeight="bold">Umami Website ID</s-text>.</s-list-item>
            <s-list-item>Your store domain (<s-text fontWeight="bold">{shop}</s-text>) is detected automatically.</s-list-item>
            <s-list-item>Once connected, the pixel starts tracking page views, add-to-cart, checkout, and purchase events.</s-list-item>
            <s-list-item>Events are forwarded to Umami for analytics in real time.</s-list-item>
          </s-unordered-list>
        </s-section>
      </s-page>
    );
  }

  const brand = shopConfig!.brand;
  return (
    <s-page heading="Seleric Tracker">
      {actionData?.error && <s-banner tone="critical">{actionData.error}</s-banner>}
      <s-section heading="Connection Status">
        <s-stack direction="inline" gap="base" wrap>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, minWidth: "200px" }}>
            <s-text variant="bodyXs" tone="subdued">Store</s-text><br /><s-text fontWeight="bold">{shop}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, minWidth: "200px" }}>
            <s-text variant="bodyXs" tone="subdued">Brand</s-text><br /><s-text fontWeight="bold">{brand.name}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, minWidth: "200px" }}>
            <s-text variant="bodyXs" tone="subdued">Umami Website ID</s-text><br /><s-text fontWeight="bold" variant="bodyXs">{brand.umamiWebsiteUuid}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, minWidth: "200px" }}>
            <s-text variant="bodyXs" tone="subdued">Pixel Status</s-text><br />
            <s-text fontWeight="bold" tone={shopConfig!.pixelEnabled ? "success" : "critical"}>{shopConfig!.pixelEnabled ? "Active" : "Disabled"}</s-text>
          </s-box>
        </s-stack>
      </s-section>
      {stats && (
        <s-section heading="Event Statistics (Last 7 Days)">
          <s-stack direction="inline" gap="base" wrap>
            <StatCard label="Total Events" value={String(stats.total)} />
            <StatCard label="Forwarded to Umami" value={String(stats.forwarded)} />
            <StatCard label="Forward Rate" value={`${stats.forwardRate.toFixed(1)}%`} />
            <StatCard label="Event Types" value={String(Object.keys(stats.byType).length)} />
          </s-stack>
          {Object.keys(stats.byType).length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginTop: "12px" }}>
              <s-text fontWeight="bold" variant="bodySm">Events by Type</s-text>
              <table style={{ width: "100%", marginTop: "8px", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead><tr style={{ borderBottom: "1px solid #e1e3e5" }}><th style={{ textAlign: "left", padding: "6px 8px" }}>Event Type</th><th style={{ textAlign: "right", padding: "6px 8px" }}>Count</th></tr></thead>
                <tbody>{Object.entries(stats.byType).map(([type, count]) => (
                  <tr key={type} style={{ borderBottom: "1px solid #f1f2f3" }}><td style={{ padding: "6px 8px" }}>{type}</td><td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{count as number}</td></tr>
                ))}</tbody>
              </table>
            </s-box>
          )}
        </s-section>
      )}
      {recentEvents.length > 0 && (
        <s-section heading="Recent Events">
          <s-box borderWidth="base" borderRadius="base" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead><tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}><th style={{ textAlign: "left", padding: "8px 12px" }}>Event</th><th style={{ textAlign: "left", padding: "8px 12px" }}>Source</th><th style={{ textAlign: "left", padding: "8px 12px" }}>Forwarded</th><th style={{ textAlign: "left", padding: "8px 12px" }}>Time</th></tr></thead>
              <tbody>{recentEvents.map((event, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f2f3" }}><td style={{ padding: "8px 12px" }}>{event.eventName}</td><td style={{ padding: "8px 12px" }}>{event.eventSource}</td><td style={{ padding: "8px 12px" }}>{event.forwardedToUmami ? "Yes" : "No"}</td><td style={{ padding: "8px 12px", color: "#6d7175" }}>{new Date(event.createdAt).toLocaleString()}</td></tr>
              ))}</tbody>
            </table>
          </s-box>
        </s-section>
      )}
      <s-section slot="aside" heading="Tracking Settings">
        <Form method="post">
          <input type="hidden" name="intent" value="update-settings" />
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}><input type="checkbox" name="pixelEnabled" defaultChecked={shopConfig!.pixelEnabled} style={{ width: "16px", height: "16px" }} /><span style={{ fontWeight: 600, fontSize: "13px" }}>Pixel Tracking</span></label>
            <p style={{ fontSize: "12px", color: "#6d7175", margin: "2px 0 0 24px" }}>Capture client-side events (page views, add to cart, etc.)</p>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}><input type="checkbox" name="webhookEnabled" defaultChecked={shopConfig!.webhookEnabled} style={{ width: "16px", height: "16px" }} /><span style={{ fontWeight: 600, fontSize: "13px" }}>Webhook Tracking</span></label>
            <p style={{ fontSize: "12px", color: "#6d7175", margin: "2px 0 0 24px" }}>Capture server-side events (orders, refunds, etc.)</p>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Consent Mode</label>
            <select name="consentMode" defaultValue={shopConfig!.consentMode} style={{ ...inputStyle, appearance: "auto", background: "#fff" }}>
              <option value="relaxed">Relaxed — track without explicit consent</option>
              <option value="strict">Strict — require consent before tracking (GDPR)</option>
            </select>
          </div>
          <button type="submit" disabled={isSubmitting} style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, color: "#fff", background: "#008060", border: "none", borderRadius: "8px", cursor: "pointer" }}>Save Settings</button>
        </Form>
      </s-section>
      <s-section slot="aside" heading="Update Website ID">
        <Form method="post">
          <input type="hidden" name="intent" value="update-website-id" />
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Umami Website ID</label>
            <input type="text" name="umamiWebsiteUuid" defaultValue={brand.umamiWebsiteUuid} style={inputStyle} />
            <p style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>Change the Umami Website ID linked to this store.</p>
          </div>
          <button type="submit" disabled={isSubmitting} style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, color: "#333", background: "#e3e5e7", border: "1px solid #8c9196", borderRadius: "8px", cursor: "pointer" }}>Update</button>
        </Form>
      </s-section>
    </s-page>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, minWidth: "140px", textAlign: "center" }}>
      <s-text variant="headingLg">{value}</s-text><br /><s-text variant="bodyXs" tone="subdued">{label}</s-text>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
