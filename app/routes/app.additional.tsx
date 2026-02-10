import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const shopConfig = await prisma.shopConfig.findUnique({ where: { shopifyShop: shop }, include: { brand: true } });
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const pixelEndpoint = `${appUrl.replace(/\/$/, "")}/api/ingest/pixel`;
  return { shop, shopConfig, pixelEndpoint, umamiEndpoint: shopConfig?.umamiEndpoint || process.env.UMAMI_ENDPOINT || "" };
};

export default function SettingsPage() {
  const { shop, shopConfig, pixelEndpoint, umamiEndpoint } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Settings & Integration">
      <s-section heading="Integration Details">
        <s-paragraph>Technical details of your Seleric Tracker integration for debugging or manual configuration.</s-paragraph>
        <s-stack direction="block" gap="base" style={{ marginTop: "12px" }}>
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-text fontWeight="bold">Shop Domain</s-text><br /><code>{shop}</code></s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-text fontWeight="bold">Pixel Ingestion Endpoint</s-text><br /><code>{pixelEndpoint}</code><br /><s-text variant="bodyXs" tone="subdued">Where the web pixel sends storefront events.</s-text></s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-text fontWeight="bold">Umami Forwarding Endpoint</s-text><br /><code>{umamiEndpoint}</code><br /><s-text variant="bodyXs" tone="subdued">Events are forwarded here for analytics.</s-text></s-box>
          {shopConfig && (
            <>
              <s-box padding="base" borderWidth="base" borderRadius="base"><s-text fontWeight="bold">Brand</s-text><br /><s-text>{shopConfig.brand.name}</s-text><br /><s-text variant="bodyXs" tone="subdued">Currency: {shopConfig.brand.defaultCurrency}</s-text></s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base"><s-text fontWeight="bold">Umami Website UUID</s-text><br /><code>{shopConfig.brand.umamiWebsiteUuid}</code></s-box>
            </>
          )}
        </s-stack>
      </s-section>
      <s-section slot="aside" heading="Tracked Events">
        <s-unordered-list>
          <s-list-item>page_viewed</s-list-item><s-list-item>product_viewed</s-list-item><s-list-item>collection_viewed</s-list-item>
          <s-list-item>search_submitted</s-list-item><s-list-item>product_added_to_cart</s-list-item><s-list-item>product_removed_from_cart</s-list-item>
          <s-list-item>cart_viewed</s-list-item><s-list-item>checkout_started</s-list-item><s-list-item>checkout_completed</s-list-item><s-list-item>payment_info_submitted</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
