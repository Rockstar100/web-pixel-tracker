/**
 * Core types for event tracking system
 */

export interface NormalizedEvent {
  type: string;
  name: string;
  shop: string;
  brandId: string;

  // Page context
  url?: string;
  referrer?: string;
  title?: string;
  hostname?: string;

  // UTM attribution (campaign level)
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };

  /**
   * Ad / marketing metadata
   * These fields are intentionally generic so they can represent Meta, Google, TikTok, email, etc.
   * and map cleanly into MultiTouchAttribution.channel/source/medium/campaign/content.
   */
  marketing?: {
    // High-level channel classification (paid_search, paid_social, organic_search, direct, email, referral, affiliate, other)
    channel?: string;
    // Platform or network, e.g. facebook, instagram, google, tiktok, klaviyo, mailchimp
    platform?: string;
    // Ad platform identifiers (optional, for later server-side API uploads)
    campaignId?: string;
    adSetId?: string;
    adId?: string;
  };

  /**
   * Raw click identifiers pulled from query params, kept for potential
   * server-side conversion uploads to ad platforms.
   */
  clickIds?: {
    fbclid?: string;
    gclid?: string;
    ttclid?: string;
    [key: string]: string | undefined;
  };

  // Customer identity (hashed)
  customerHash?: string;
  sessionId?: string;
  customerIdentity?: "email" | "session";
  isAnonymous?: boolean;

  // Order/transaction data
  orderId?: string;
  checkoutId?: string;
  value?: number;
  currency?: string;
  itemsCount?: number;

  // Event metadata
  timestamp: Date;
  source: "pixel" | "webhook" | "provider";

  // Additional properties
  data?: Record<string, unknown>;
}

export interface UmamiPayload {
  website: string; // Umami website UUID
  hostname?: string;
  language?: string;
  referrer?: string;
  screen?: string;
  title?: string;
  url: string;
  name?: string; // Event name
  data?: Record<string, unknown>; // Event properties
  tag?: string; // Segmentation tag
}

export interface PixelEvent {
  id?: string;
  name: string;
  timestamp: string;
  shopDomain?: string | null;
  context: {
    document?: {
      location?: {
        href?: string;
        hostname?: string;
        pathname?: string;
        search?: string;
      };
      referrer?: string;
      title?: string;
    };
    window?: {
      location?: {
        href?: string;
      };
    };
  };
  clientId?: string;
  data?: unknown;
}

export interface ShopifyWebhookPayload {
  // Generic webhook structure
  id?: number | string;
  admin_graphql_api_id?: string;
  [key: string]: unknown;
}

export interface BrandConfig {
  id: string;
  name: string;
  umamiWebsiteUuid: string;
  domains: string[];
  defaultCurrency: string;
  enabled: boolean;
}

export interface ShopConfigData {
  id: string;
  shopifyShop: string;
  brandId: string;
  brand: BrandConfig;
  umamiEndpoint: string;
  pixelEnabled: boolean;
  webhookEnabled: boolean;
  consentMode: 'strict' | 'relaxed';
  requireConsent: boolean;
  providerSettings?: Record<string, unknown>;
}

export interface DedupeResult {
  isDuplicate: boolean;
  existingEvent?: unknown;
  eventKey: string;
}

export interface ForwardResult {
  success: boolean;
  eventId: string;
  umamiResponse?: unknown;
  error?: string;
}
