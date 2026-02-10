import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Ensure web pixel is registered and has the current server endpoint
  try {
    const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
    const serverEndpoint = `${appUrl.replace(/\/$/, "")}/api/ingest/pixel`;
    await ensureWebPixel(admin, serverEndpoint);
  } catch (error) {
    console.error("Failed to ensure web pixel on app load:", error);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

/**
 * Ensure the web pixel is created or updated with the current server endpoint.
 * This runs on every app load to keep the pixel settings in sync with the current URL.
 */
type AdminGraphql = { graphql: (query: string, options?: unknown) => Promise<Response> };

type WebPixelUserError = { field?: string[] | null; message: string };
type WebPixelCreateResponse = { data?: { webPixelCreate?: { webPixel?: { id: string }; userErrors?: WebPixelUserError[] } } };
type WebPixelUpdateResponse = { data?: { webPixelUpdate?: { webPixel?: { id: string }; userErrors?: WebPixelUserError[] } } };
type WebPixelGetResponse = { data?: { currentAppInstallation?: { id: string } }; extensions?: { cost?: unknown } };

async function ensureWebPixel(admin: AdminGraphql, serverEndpoint: string) {
  const settings = { serverEndpoint, accountID: "server-side", enableDebug: "false" };

  // Step 1: Try to find existing pixel via currentAppInstallation
  const existingPixelId = await getExistingWebPixelId(admin);

  if (existingPixelId) {
    // Step 2a: Update existing pixel
    const response = await admin.graphql(
      `#graphql
        mutation UpdateWebPixel($id: ID!, $settings: JSON!) {
          webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
            webPixel { id }
            userErrors { field message }
          }
        }`,
      { variables: { id: existingPixelId, settings } }
    );
    const payload = (await response.json()) as WebPixelUpdateResponse;
    const errors = payload.data?.webPixelUpdate?.userErrors ?? [];
    if (errors.length > 0) {
      console.warn("Web pixel update errors:", errors);
    } else {
      console.log("Web pixel updated successfully with endpoint:", serverEndpoint);
    }
    return;
  }

  // Step 2b: Create new pixel
  const createResponse = await admin.graphql(
    `#graphql
      mutation CreateWebPixel($settings: JSON!) {
        webPixelCreate(webPixel: { settings: $settings }) {
          webPixel { id }
          userErrors { field message }
        }
      }`,
    { variables: { settings } }
  );
  const createPayload = (await createResponse.json()) as WebPixelCreateResponse;
  const createErrors = createPayload.data?.webPixelCreate?.userErrors ?? [];

  if (createErrors.length > 0) {
    // If creation fails because pixel already exists, try to find and update it
    const alreadyExists = createErrors.some(e => e.message.includes("already been set"));
    if (alreadyExists) {
      console.log("Pixel already exists, attempting update via webPixel query...");
      // Use the singular webPixel query as fallback
      try {
        const pixelQuery = await admin.graphql(
          `#graphql
            query GetWebPixel {
              webPixel { id }
            }`
        );
        const pixelData = (await pixelQuery.json()) as { data?: { webPixel?: { id: string } } };
        const pixelId = pixelData.data?.webPixel?.id;
        if (pixelId) {
          const updateResp = await admin.graphql(
            `#graphql
              mutation UpdateWebPixel($id: ID!, $settings: JSON!) {
                webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
                  webPixel { id }
                  userErrors { field message }
                }
              }`,
            { variables: { id: pixelId, settings } }
          );
          const updatePayload = (await updateResp.json()) as WebPixelUpdateResponse;
          const updateErrors = updatePayload.data?.webPixelUpdate?.userErrors ?? [];
          if (updateErrors.length > 0) {
            console.warn("Web pixel update errors (fallback):", updateErrors);
          } else {
            console.log("Web pixel updated successfully (fallback) with endpoint:", serverEndpoint);
          }
        }
      } catch (err) {
        console.error("Failed to update existing pixel (fallback):", err);
      }
    } else {
      console.warn("Web pixel creation errors:", createErrors);
    }
  } else {
    console.log("Web pixel created successfully with endpoint:", serverEndpoint);
  }
}

async function getExistingWebPixelId(admin: AdminGraphql): Promise<string | null> {
  try {
    // Try singular webPixel query (for current app's pixel)
    const response = await admin.graphql(
      `#graphql
        query GetWebPixel {
          webPixel { id }
        }`
    );
    const payload = (await response.json()) as { data?: { webPixel?: { id: string } | null } };
    if (payload.data?.webPixel?.id) {
      return payload.data.webPixel.id;
    }
  } catch {
    // Ignore - query might not exist in this API version
  }

  try {
    // Fallback: try the list query
    const response = await admin.graphql(
      `#graphql
        query ExistingWebPixels {
          webPixels(first: 1) { nodes { id } }
        }`
    );
    const payload = (await response.json()) as { data?: { webPixels?: { nodes?: { id: string }[] } } };
    return payload.data?.webPixels?.nodes?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/additional">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
