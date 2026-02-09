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
  
  // UTM attribution
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  
  // Customer identity (hashed)
  customerHash?: string;
  sessionId?: string;
  
  // Order/transaction data
  orderId?: string;
  checkoutId?: string;
  value?: number;
  currency?: string;
  itemsCount?: number;
  
  // Event metadata
  timestamp: Date;
  source: 'pixel' | 'webhook' | 'provider';
  
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
