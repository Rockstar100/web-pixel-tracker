
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (appUrl) {
    const serverEndpoint = `${appUrl.replace(/\/$/, "")}/api/ingest/pixel`;
    await ensureWebPixel(admin, serverEndpoint);
  } else {
    console.warn("SHOPIFY_APP_URL is not set; skipping web pixel creation.");
  }

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
    const settings = {
      serverEndpoint,
      enableDebug: false
    };

    const existingPixelId = await getExistingWebPixelId(admin);
    if (existingPixelId) {
      await updateWebPixel(admin, existingPixelId, settings);
      return;
    }

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
    if (errors.length > 0) {
      console.warn("Web pixel creation returned errors:", errors);
    }
  } catch (error) {
    console.error("Failed to create web pixel:", error);
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
  settings: { serverEndpoint: string; enableDebug: boolean }
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
