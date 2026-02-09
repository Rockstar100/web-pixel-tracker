
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

async function ensureWebPixel(admin: { graphql: (query: string, options?: unknown) => Promise<Response> }, serverEndpoint: string) {
  try {
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
          settings: {
            serverEndpoint,
            enableDebug: false
          }
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
