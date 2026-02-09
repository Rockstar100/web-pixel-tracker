
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);
  console.log("🔐 AUTH CALLBACK TRIGGERED:", requestUrl.pathname, requestUrl.toString());

  let admin: { graphql: (query: string, options?: unknown) => Promise<Response> };
  try {
    ({ admin } = await authenticate.admin(request));
  } catch (error) {
    if (error instanceof Response) {
      console.error("🚧 authenticate.admin returned a Response:", {
        status: error.status,
        statusText: error.statusText,
        location: error.headers.get("location")
      });
    } else {
      console.error("❌ authenticate.admin threw an error:", error);
    }
    throw error;
  }

  const envAppUrl = process.env.SHOPIFY_APP_URL;
  const appUrl = envAppUrl || new URL(request.url).origin;
  const serverEndpoint = `${appUrl.replace(/\/$/, "")}/api/ingest/pixel`;

  console.log("📍 Server endpoint for pixel:", serverEndpoint);

  if (!envAppUrl) {
    console.warn("SHOPIFY_APP_URL is not set; using request origin for web pixel:", appUrl);
  }

  console.log("🎯 Calling ensureWebPixel...");
  await ensureWebPixel(admin, serverEndpoint);
  console.log("✅ ensureWebPixel completed");

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

type WebPixelUserError = {
  field?: string[];
  message: string;
};

type WebPixelCreateResponse = {
  data?: {
    webPixelCreate?: {
      webPixel?: { id: string };
      userErrors?: WebPixelUserError[];
    };
  };
};

type WebPixelUpdateResponse = {
  data?: {
    webPixelUpdate?: {
      webPixel?: { id: string };
      userErrors?: WebPixelUserError[];
    };
  };
};

type WebPixelListResponse = {
  data?: {
    webPixels?: {
      nodes?: { id: string }[];
    };
  };
};

async function ensureWebPixel(admin: { graphql: (query: string, options?: unknown) => Promise<Response> }, serverEndpoint: string) {
  try {
    console.log("🔍 ensureWebPixel starting...");
    const settings = {
      serverEndpoint,
      accountID: "server-side",
      enableDebug: "false"
    };

    console.log("📋 Pixel settings:", JSON.stringify(settings));

    const existingPixelId = await getExistingWebPixelId(admin);
    console.log("🔎 Existing pixel ID:", existingPixelId);
    
    if (existingPixelId) {
      console.log("📝 Updating existing pixel...");
      await updateWebPixel(admin, existingPixelId, settings);
      console.log("✅ Pixel updated successfully");
      return;
    }

    console.log("🆕 Creating new pixel...");
    const response = await admin.graphql(
      `#graphql
        mutation CreateWebPixel($settings: JSON!) {
          webPixelCreate(webPixel: { settings: $settings }) {
            webPixel {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          settings
        }
      }
    );

    const payload = (await response.json()) as WebPixelCreateResponse;
    const errors = payload.data?.webPixelCreate?.userErrors ?? [];
    
    console.log("📦 webPixelCreate response:", JSON.stringify(payload, null, 2));
    
    if (errors.length > 0) {
      console.warn("⚠️ Web pixel creation returned errors:", errors);
    } else {
      console.log("✅ Web pixel created successfully!");
    }
  } catch (error) {
    console.error("❌ Failed to create web pixel:", error);
  }
}

async function getExistingWebPixelId(admin: { graphql: (query: string, options?: unknown) => Promise<Response> }) {
  try {
    const response = await admin.graphql(
      `#graphql
        query ExistingWebPixels {
          webPixels(first: 1) {
            nodes {
              id
            }
          }
        }`
    );

    const payload = (await response.json()) as WebPixelListResponse;
    return payload.data?.webPixels?.nodes?.[0]?.id ?? null;
  } catch (error) {
    console.warn("Failed to fetch existing web pixels:", error);
    return null;
  }
}

async function updateWebPixel(
  admin: { graphql: (query: string, options?: unknown) => Promise<Response> },
  id: string,
  settings: { serverEndpoint: string; enableDebug: string }
) {
  try {
    const response = await admin.graphql(
      `#graphql
        mutation UpdateWebPixel($id: ID!, $settings: JSON!) {
          webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
            webPixel {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          id,
          settings
        }
      }
    );

    const payload = (await response.json()) as WebPixelUpdateResponse;
    const errors = payload.data?.webPixelUpdate?.userErrors ?? [];
    if (errors.length > 0) {
      console.warn("Web pixel update returned errors:", errors);
    }
  } catch (error) {
    console.error("Failed to update web pixel:", error);
  }
}
