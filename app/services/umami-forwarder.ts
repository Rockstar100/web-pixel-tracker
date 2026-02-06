import type { 
  NormalizedEvent, 
  UmamiPayload, 
  ShopConfigData,
  ForwardResult 
} from './types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Umami forwarding service
 * Handles sending events to Umami analytics
 */
export class UmamiForwarder {
  /**
   * Forward a normalized event to Umami
   */
  static async forward(
    event: NormalizedEvent,
    shopConfig: ShopConfigData
  ): Promise<ForwardResult> {
    try {
      // Build Umami payload
      const payload = this.buildUmamiPayload(event, shopConfig);

      // Send to Umami
      const response = await fetch(shopConfig.umamiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Seleric-Tracker/1.0'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json().catch(() => ({}));

      // Log the forward attempt
      await this.logForwardAttempt(event, shopConfig, response.ok, responseData);

      if (!response.ok) {
        return {
          success: false,
          eventId: '',
          error: `Umami returned ${response.status}: ${JSON.stringify(responseData)}`
        };
      }

      return {
        success: true,
        eventId: responseData.id || '',
        umamiResponse: responseData
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.logForwardAttempt(event, shopConfig, false, { error: errorMessage });

      return {
        success: false,
        eventId: '',
        error: errorMessage
      };
    }
  }

  /**
   * Build Umami API payload from normalized event
   */
  private static buildUmamiPayload(
    event: NormalizedEvent,
    shopConfig: ShopConfigData
  ): UmamiPayload {
    // Build URL (use event URL or construct default)
    const url = event.url || `https://${event.shop}`;
    
    // Build segmentation tag
    const tags = [
      `brand:${shopConfig.brand.name}`,
      `shop:${event.shop}`,
      `source:${event.source}`
    ];

    // Add event properties
    const data: Record<string, any> = {
      event_type: event.type,
      ...event.data
    };

    // Add transaction data
    if (event.orderId) data.order_id = event.orderId;
    if (event.checkoutId) data.checkout_id = event.checkoutId;
    if (event.value !== undefined) data.value = event.value;
    if (event.currency) data.currency = event.currency;
    if (event.itemsCount) data.items_count = event.itemsCount;

    // Add UTM attribution
    if (event.utm) {
      if (event.utm.source) data.utm_source = event.utm.source;
      if (event.utm.medium) data.utm_medium = event.utm.medium;
      if (event.utm.campaign) data.utm_campaign = event.utm.campaign;
      if (event.utm.term) data.utm_term = event.utm.term;
      if (event.utm.content) data.utm_content = event.utm.content;
    }

    // Add customer identity (hashed)
    if (event.customerHash) {
      data.customer_id = event.customerHash;
    }

    return {
      website: shopConfig.brand.umamiWebsiteUuid,
      hostname: event.hostname || event.shop,
      language: 'en-US',
      referrer: event.referrer,
      screen: '1920x1080', // Default, can be made dynamic
      title: event.title || event.name,
      url,
      name: event.name, // Event name for Umami custom events
      data,
      tag: tags.join(',')
    };
  }

  /**
   * Log forward attempt to database
   */
  private static async logForwardAttempt(
    event: NormalizedEvent,
    shopConfig: ShopConfigData,
    success: boolean,
    response: any
  ): Promise<void> {
    try {
      await prisma.healthLog.create({
        data: {
          shopifyShop: event.shop,
          component: 'umami_forward',
          status: success ? 'success' : 'error',
          message: `Forwarded ${event.name} event`,
          details: JSON.stringify({
            eventName: event.name,
            eventType: event.type,
            orderId: event.orderId,
            brandId: event.brandId,
            response
          })
        }
      });
    } catch (error) {
      console.error('Failed to log forward attempt:', error);
    }
  }

  /**
   * Batch forward multiple events
   */
  static async forwardBatch(
    events: NormalizedEvent[],
    shopConfig: ShopConfigData
  ): Promise<ForwardResult[]> {
    const results: ForwardResult[] = [];

    // Process events sequentially to avoid rate limiting
    for (const event of events) {
      const result = await this.forward(event, shopConfig);
      results.push(result);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}
