import type { NormalizedEvent, DedupeResult } from './types';
import { PrismaClient } from '@prisma/client';
import { EventNormalizer } from './normalizer';

const prisma = new PrismaClient();

/**
 * Event deduplication service
 * Prevents double-counting of events from multiple sources
 */
export class EventDeduplicator {
  /**
   * Check if event is duplicate and store it
   */
  static async checkAndStore(
    event: NormalizedEvent,
    shopConfigId: string,
    customEventKey?: string
  ): Promise<DedupeResult> {
    // Generate dedupe key (or use custom key for special events like refunds/cancellations)
    const eventKey = customEventKey || EventNormalizer.generateEventKey(
      event.shop,
      event.name,
      event.orderId,
      event.checkoutId,
      event.timestamp
    );

    try {
      // Try to find existing event
      const existing = await prisma.eventReceived.findUnique({
        where: { eventKey }
      });

      if (existing) {
        // Duplicate found
        return {
          isDuplicate: true,
          existingEvent: existing,
          eventKey
        };
      }

      // Not a duplicate - store it
      await prisma.eventReceived.create({
        data: {
          shopConfigId,
          eventKey,
          eventType: event.type,
          eventSource: event.source,
          shopifyOrderId: event.orderId,
          shopifyCheckoutId: event.checkoutId,
          eventName: event.name,
          eventData: JSON.stringify({
            url: event.url,
            referrer: event.referrer,
            value: event.value,
            currency: event.currency,
            itemsCount: event.itemsCount,
            utm: event.utm,
            data: event.data
          }),
          forwardedToUmami: false
        }
      });

      return {
        isDuplicate: false,
        eventKey
      };
    } catch (error) {
      console.error('Dedupe check failed:', error);
      // On error, assume not duplicate to avoid data loss
      return {
        isDuplicate: false,
        eventKey
      };
    }
  }

  /**
   * Mark event as forwarded to Umami
   */
  static async markForwarded(
    eventKey: string,
    umamiResponse: unknown
  ): Promise<void> {
    try {
      await prisma.eventReceived.update({
        where: { eventKey },
        data: {
          forwardedToUmami: true,
          umamiResponse: JSON.stringify(umamiResponse)
        }
      });
    } catch (error) {
      console.error('Failed to mark event as forwarded:', error);
    }
  }

  /**
   * Handle special case: purchase events from both pixel and webhook
   * Strategy: Prefer webhook (server truth) over pixel (client)
   */
  static async handlePurchaseConflict(
    pixelEvent: NormalizedEvent,
    webhookEvent: NormalizedEvent
  ): Promise<'pixel' | 'webhook' | 'both'> {
    // If webhook is already stored, skip pixel
    const webhookKey = EventNormalizer.generateEventKey(
      webhookEvent.shop,
      'purchase',
      webhookEvent.orderId
    );

    const existingWebhook = await prisma.eventReceived.findUnique({
      where: { eventKey: webhookKey }
    });

    if (existingWebhook) {
      return 'webhook'; // Webhook takes precedence
    }

    // If pixel is stored first, mark it as "pending" and wait for webhook
    const pixelKey = EventNormalizer.generateEventKey(
      pixelEvent.shop,
      'purchase_client',
      pixelEvent.orderId
    );

    const existingPixel = await prisma.eventReceived.findUnique({
      where: { eventKey: pixelKey }
    });

    if (existingPixel && !existingPixel.forwardedToUmami) {
      // Pixel exists but not forwarded - now webhook arrived, forward webhook only
      return 'webhook';
    }

    // Store both with different names
    return 'both';
  }

  /**
   * Clean up old events (retention policy)
   */
  static async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.eventReceived.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }

  /**
   * Get event statistics for a shop
   */
  static async getStats(shopConfigId: string, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [total, bySource, byType, forwarded] = await Promise.all([
      // Total events
      prisma.eventReceived.count({
        where: {
          shopConfigId,
          createdAt: { gte: since }
        }
      }),

      // By source
      prisma.eventReceived.groupBy({
        by: ['eventSource'],
        where: {
          shopConfigId,
          createdAt: { gte: since }
        },
        _count: true
      }),

      // By type
      prisma.eventReceived.groupBy({
        by: ['eventType'],
        where: {
          shopConfigId,
          createdAt: { gte: since }
        },
        _count: true
      }),

      // Forwarded count
      prisma.eventReceived.count({
        where: {
          shopConfigId,
          createdAt: { gte: since },
          forwardedToUmami: true
        }
      })
    ]);

    return {
      total,
      bySource: bySource.reduce((acc, item) => {
        acc[item.eventSource] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byType: byType.reduce((acc, item) => {
        acc[item.eventType] = item._count;
        return acc;
      }, {} as Record<string, number>),
      forwarded,
      forwardRate: total > 0 ? (forwarded / total) * 100 : 0
    };
  }
}
