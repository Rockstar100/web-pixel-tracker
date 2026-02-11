import type { 
  NormalizedEvent, 
  PixelEvent, 
  ShopifyWebhookPayload,
  ShopConfigData 
} from './types';
import crypto from 'crypto';

/**
 * Event normalization service
 * Converts pixel events and webhook payloads into a unified NormalizedEvent format
 */
export class EventNormalizer {
  /**
   * Normalize a Web Pixel event
   */
  static normalizePixelEvent(
    pixelEvent: PixelEvent,
    shopConfig: ShopConfigData
  ): NormalizedEvent {
    const eventName = pixelEvent.name;
    const context = pixelEvent.context;
    const data = pixelEvent.data || {};

    // Extract URL and referrer
    const url = context.document?.location?.href || 
                context.window?.location?.href || '';
    const referrer = context.document?.referrer || '';
    const title = context.document?.title || '';
    const hostname = context.document?.location?.hostname || '';

    // Parse UTM parameters and ad platform click IDs
    const utm = this.extractUtmParams(url);
    const clickIds = this.extractClickIds(url);

    // Map Shopify pixel event names to normalized event names
    const normalizedName = this.mapPixelEventName(eventName);

    // Extract customer data if available
    const emailHash = data.customer?.email
      ? this.hashEmail(data.customer.email)
      : undefined;
    const sessionId = pixelEvent.clientId ? String(pixelEvent.clientId) : undefined;
    const sessionHash = !emailHash && sessionId
      ? this.hashSessionId(sessionId)
      : undefined;
    const fallbackHash = !emailHash && !sessionHash
      ? this.hashFallback(pixelEvent.id || pixelEvent.timestamp)
      : undefined;
    const customerHash = emailHash || sessionHash || fallbackHash;
    const customerIdentity = emailHash
      ? 'email'
      : sessionHash
        ? 'session'
        : fallbackHash
          ? 'session'
          : undefined;

    // Extract order/checkout data
    const orderId = data.checkout?.order?.id || data.order_id;
    const checkoutId = data.checkout?.token || data.checkout_id;
    const value = data.checkout?.totalPrice?.amount || 
                  data.checkout?.subtotalPrice?.amount ||
                  data.total_price;
    const currency = data.checkout?.currencyCode || 
                     shopConfig.brand.defaultCurrency;
    const itemsCount = data.checkout?.lineItems?.length || 
                       data.cart?.lines?.length;

    return {
      type: this.getEventType(normalizedName),
      name: normalizedName,
      shop: shopConfig.shopifyShop,
      brandId: shopConfig.brandId,
      url,
      referrer,
      title,
      hostname,
      utm,
      clickIds,
      customerHash,
      sessionId,
      customerIdentity,
      isAnonymous: customerIdentity === 'session',
      orderId: orderId ? String(orderId) : undefined,
      checkoutId: checkoutId ? String(checkoutId) : undefined,
      value: value ? parseFloat(value) : undefined,
      currency,
      itemsCount,
      timestamp: new Date(pixelEvent.timestamp),
      source: 'pixel',
      data: this.sanitizeEventData(data)
    };
  }

  /**
   * Normalize a Shopify webhook payload
   */
  static normalizeWebhookEvent(
    topic: string,
    payload: ShopifyWebhookPayload,
    shopConfig: ShopConfigData
  ): NormalizedEvent {
    const normalizedName = this.mapWebhookTopic(topic);
    
    // Extract common fields
    const orderId = payload.id ? String(payload.id) : undefined;
    const customerEmail = payload.customer?.email || payload.email;
    const customerHash = customerEmail ? this.hashEmail(customerEmail) : undefined;

    // Extract order data for purchase events
    let value: number | undefined;
    let currency: string | undefined;
    let itemsCount: number | undefined;

    if (topic.startsWith('orders/')) {
      value = payload.total_price ? parseFloat(payload.total_price) : undefined;
      currency = payload.currency || shopConfig.brand.defaultCurrency;
      itemsCount = payload.line_items?.length;
    }

    return {
      type: this.getEventType(normalizedName),
      name: normalizedName,
      shop: shopConfig.shopifyShop,
      brandId: shopConfig.brandId,
      customerHash,
      orderId,
      value,
      currency,
      itemsCount,
      timestamp: payload.created_at ? new Date(payload.created_at) : new Date(),
      source: 'webhook',
      data: this.sanitizeEventData(payload)
    };
  }

  /**
   * Map Shopify Web Pixel event names to normalized names
   */
  private static mapPixelEventName(eventName: string): string {
    const mapping: Record<string, string> = {
      'page_viewed': 'page_view',
      'product_viewed': 'product_view',
      'collection_viewed': 'collection_view',
      'search_submitted': 'search',
      'product_added_to_cart': 'add_to_cart',
      'product_removed_from_cart': 'remove_from_cart',
      'cart_viewed': 'cart_view',
      'checkout_started': 'begin_checkout',
      'checkout_completed': 'purchase_client',
      'checkout_address_info_submitted': 'shipping_info_submitted',
      'payment_info_submitted': 'payment_info_submitted',
    };

    return mapping[eventName] || eventName;
  }

  /**
   * Map Shopify webhook topics to normalized event names
   */
  private static mapWebhookTopic(topic: string): string {
    const mapping: Record<string, string> = {
      'orders/create': 'order_created',
      'orders/paid': 'purchase',
      'orders/updated': 'order_updated',
      'orders/cancelled': 'order_cancelled',
      'orders/refund': 'order_refunded',
      'checkouts/create': 'checkout_created',
      'checkouts/update': 'checkout_updated',
      'customers/create': 'customer_created',
      'customers/update': 'customer_updated',
      'carts/create': 'cart_created',
      'carts/update': 'cart_updated',
    };

    return mapping[topic] || topic.replace('/', '_');
  }

  /**
   * Get event type category
   */
  private static getEventType(eventName: string): string {
    // Handle refunds and cancellations - these are reversals, not conversions
    if (eventName.includes('refund') || eventName.includes('cancelled') || eventName.includes('cancel')) {
      return 'reversal';
    }
    if (eventName.includes('purchase') || eventName.includes('order_created')) {
      return 'conversion';
    }
    if (eventName.includes('checkout') || eventName.includes('payment')) {
      return 'checkout';
    }
    if (eventName.includes('cart')) {
      return 'cart';
    }
    if (eventName.includes('product') || eventName.includes('collection')) {
      return 'engagement';
    }
    if (eventName.includes('customer')) {
      return 'customer';
    }
    return 'pageview';
  }

  /**
   * Extract UTM parameters from URL
   */
  private static extractUtmParams(url: string): NormalizedEvent["utm"] {
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      return {
        source: params.get("utm_source") || undefined,
        medium: params.get("utm_medium") || undefined,
        campaign: params.get("utm_campaign") || undefined,
        term: params.get("utm_term") || undefined,
        content: params.get("utm_content") || undefined,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Extract common ad platform click identifiers from URL
   * (fbclid, gclid, ttclid, etc.).
   */
  private static extractClickIds(url: string): NormalizedEvent["clickIds"] {
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      const fbclid = params.get("fbclid") || undefined;
      const gclid = params.get("gclid") || undefined;
      const ttclid = params.get("ttclid") || undefined;

      const hasAny = fbclid || gclid || ttclid;
      if (!hasAny) {
        return undefined;
      }

      return {
        fbclid,
        gclid,
        ttclid,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Hash email for privacy-preserving identity
   */
  static hashEmail(email: string): string {
    return crypto
      .createHash('sha256')
      .update(email.toLowerCase().trim())
      .digest('hex');
  }

  private static hashSessionId(sessionId: string): string {
    return crypto
      .createHash('sha256')
      .update(`session:${sessionId}`)
      .digest('hex');
  }

  private static hashFallback(value: string): string {
    return crypto
      .createHash('sha256')
      .update(`fallback:${value}`)
      .digest('hex');
  }

  /**
   * Sanitize event data (remove PII, limit size)
   */
  private static sanitizeEventData(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    // Create a shallow copy
    const sanitized = { ...(data as Record<string, unknown>) };

    // Remove direct PII fields
    const piiFields = [
      'email', 
      'phone', 
      'first_name', 
      'last_name',
      'address',
      'billing_address',
      'shipping_address',
      'customer'
    ];

    piiFields.forEach(field => {
      delete sanitized[field];
    });

    // Limit data size
    const jsonStr = JSON.stringify(sanitized);
    if (jsonStr.length > 10000) {
      return { _truncated: true, _size: jsonStr.length };
    }

    return sanitized;
  }

  /**
   * Generate dedupe event key
   */
  static generateEventKey(
    shop: string,
    eventName: string,
    orderId?: string,
    checkoutId?: string,
    timestamp?: Date
  ): string {
    const parts = [shop, eventName];
    
    if (orderId) parts.push(orderId);
    else if (checkoutId) parts.push(checkoutId);
    else if (timestamp) parts.push(timestamp.getTime().toString());
    
    return parts.join(':');
  }
}
