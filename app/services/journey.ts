import { PrismaClient } from '@prisma/client';
import type { NormalizedEvent } from './types';

const prisma = new PrismaClient();

/**
 * Customer Journey & Funnel Tracking Service
 * Tracks complete customer journey from first pixel event through to purchase completion/cancellation
 * Handles full funnel: page_view -> add_to_cart -> begin_checkout -> purchase -> refund/cancel
 */
export class CustomerJourneyService {
  /**
   * Record a customer event in the journey
   */
  static async recordEvent(
    event: NormalizedEvent,
    shopConfigId: string
  ): Promise<void> {
    if (!event.customerHash) {
      console.warn('Event missing customerHash, skipping journey tracking');
      return;
    }

    try {
      // Insert the event into customer event stream
      await prisma.customerEvent.create({
        data: {
          shopConfigId,
          customerHash: event.customerHash,
          sessionId: event.sessionId,
          eventType: event.name,
          eventName: this.getEventDisplayName(event.name),
          pageUrl: event.url,
          pageTitle: event.title,
          pageReferrer: event.referrer,
          orderId: event.orderId,
          checkoutId: event.checkoutId,
          utmSource: event.utm?.source,
          utmMedium: event.utm?.medium,
          utmCampaign: event.utm?.campaign,
          utmTerm: event.utm?.term,
          utmContent: event.utm?.content,
          value: event.value,
          currency: event.currency,
          itemsCount: event.itemsCount,
          source: event.source,
          eventData: event.data ? JSON.stringify(event.data) : null,
          timestamp: event.timestamp
        }
      });

      // Update or create customer journey summary
      await this.updateJourneySummary(
        event.customerHash,
        shopConfigId,
        event
      );
    } catch (error) {
      console.error('Failed to record customer event:', error);
    }
  }

  /**
   * Update customer journey summary with new event
   */
  private static async updateJourneySummary(
    customerHash: string,
    shopConfigId: string,
    event: NormalizedEvent
  ): Promise<void> {
    const eventType = event.name;

    const journey = await prisma.customerJourney.findUnique({
      where: {
        shopConfigId_customerHash: {
          shopConfigId,
          customerHash
        }
      }
    });

    // Get all events for this customer to recalculate
    const events = await prisma.customerEvent.findMany({
      where: {
        shopConfigId,
        customerHash
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    if (events.length === 0) return;

    // Count events by type
    const eventCounts = {
      page_view: 0,
      add_to_cart: 0,
      begin_checkout: 0,
      purchase: 0,
      refund: 0,
      cancel: 0
    };

    events.forEach(e => {
      if (e.eventType in eventCounts) {
        eventCounts[e.eventType as keyof typeof eventCounts]++;
      }
    });

    // Get first and last touch
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    // Calculate days as customer and recency (days since last purchase)
    const now = new Date();
    const daysAsCustomer = Math.max(
      0,
      Math.floor(
        (now.getTime() - firstEvent.timestamp.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Find all purchase events to derive recency / frequency / monetary
    const purchaseEvents = events.filter((e) => e.eventType === 'purchase');
    const lastPurchase = purchaseEvents[purchaseEvents.length - 1];
    const recency =
      lastPurchase
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - lastPurchase.timestamp.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : null;
    const frequency = purchaseEvents.length;
    const monetaryValue = purchaseEvents.reduce(
      (sum, e) => sum + (e.value || 0),
      0
    );

    // Approximate totalSessions by counting distinct non-null sessionIds
    const distinctSessions = new Set(
      events
        .map((e) => e.sessionId)
        .filter((sid): sid is string => !!sid)
    );
    const totalSessions = distinctSessions.size;

    if (journey) {
      // Update existing journey
      await prisma.customerJourney.update({
        where: {
          shopConfigId_customerHash: {
            shopConfigId,
            customerHash
          }
        },
        data: {
          lastEventAt: lastEvent.timestamp,
          totalEvents: events.length,
          totalSessions,
          pageViewCount: eventCounts.page_view,
          addToCartCount: eventCounts.add_to_cart,
          beginCheckoutCount: eventCounts.begin_checkout,
          purchaseCount: eventCounts.purchase,
          refundCount: eventCounts.refund,
          cancelCount: eventCounts.cancel,
          recency,
          frequency,
          monetaryValue,
          daysAsCustomer,
          lastTouchSource: lastEvent.utmSource,
          lastTouchMedium: lastEvent.utmMedium,
          lastTouchCampaign: lastEvent.utmCampaign,
          lastSyncedAt: new Date()
        }
      });
    } else {
      // Create new journey
      await prisma.customerJourney.create({
        data: {
          shopConfigId,
          customerHash,
          firstEventAt: firstEvent.timestamp,
          lastEventAt: lastEvent.timestamp,
          totalEvents: events.length,
          totalSessions,
          pageViewCount: eventCounts.page_view,
          addToCartCount: eventCounts.add_to_cart,
          beginCheckoutCount: eventCounts.begin_checkout,
          purchaseCount: eventCounts.purchase,
          refundCount: eventCounts.refund,
          cancelCount: eventCounts.cancel,
          recency,
          frequency,
          monetaryValue,
          daysAsCustomer,
          firstTouchSource: firstEvent.utmSource,
          firstTouchMedium: firstEvent.utmMedium,
          firstTouchCampaign: firstEvent.utmCampaign,
          lastTouchSource: lastEvent.utmSource,
          lastTouchMedium: lastEvent.utmMedium,
          lastTouchCampaign: lastEvent.utmCampaign,
          lastSyncedAt: new Date()
        }
      });
    }
  }

  /**
   * Track order status changes (paid, refunded, cancelled)
   */
  static async trackOrderStatus(
    orderId: string,
    customerEmail: string,
    status: 'created' | 'paid' | 'refunded' | 'cancelled' | 'completed',
    financialStatus: string,
    fulfillmentStatus: string | null,
    totalPrice: number,
    currency: string,
    lineItems: number,
    shopConfigId: string
  ): Promise<void> {
    try {
      const customerHash = this.hashEmail(customerEmail);

      // Check if order already tracked
      const existing = await prisma.orderTracking.findUnique({
        where: {
          shopConfigId_shopifyOrderId: {
            shopConfigId,
            shopifyOrderId: orderId
          }
        }
      });

      if (existing) {
        // Update order status
        const updateData: any = {
          status,
          financialStatus,
          fulfillmentStatus
        };

        // Set status timestamps
        if (status === 'paid' && !existing.paidAt) {
          updateData.paidAt = new Date();
        }
        if (status === 'refunded' && !existing.refundedAt) {
          updateData.refundedAt = new Date();
        }
        if (status === 'cancelled' && !existing.cancelledAt) {
          updateData.cancelledAt = new Date();
        }
        if (status === 'completed' && !existing.completedAt) {
          updateData.completedAt = new Date();
        }

        await prisma.orderTracking.update({
          where: {
            shopConfigId_shopifyOrderId: {
              shopConfigId,
              shopifyOrderId: orderId
            }
          },
          data: updateData
        });
      } else {
        // Create new order tracking
        const now = new Date();
        const timestampData: any = {};

        if (status === 'paid') timestampData.paidAt = now;
        if (status === 'refunded') timestampData.refundedAt = now;
        if (status === 'cancelled') timestampData.cancelledAt = now;
        if (status === 'completed') timestampData.completedAt = now;

        await prisma.orderTracking.create({
          data: {
            shopConfigId,
            shopifyOrderId: orderId,
            customerEmail,
            customerHash,
            status,
            financialStatus,
            fulfillmentStatus,
            totalPrice,
            currency,
            lineItems,
            ...timestampData
          }
        });
      }

      // Update customer journey with order totals
      await this.updateOrderTotals(customerHash, shopConfigId, status, totalPrice);
    } catch (error) {
      console.error('Failed to track order status:', error);
    }
  }

  /**
   * Update order totals in customer journey
   */
  private static async updateOrderTotals(
    customerHash: string,
    shopConfigId: string,
    status: string,
    totalPrice: number
  ): Promise<void> {
    const journey = await prisma.customerJourney.findUnique({
      where: {
        shopConfigId_customerHash: {
          shopConfigId,
          customerHash
        }
      }
    });

    if (!journey) return;

    const updateData: any = {};

    if (status === 'paid' || status === 'completed') {
      updateData.totalOrderValue = (journey.totalOrderValue || 0) + totalPrice;
      updateData.totalOrdersCompleted = (journey.totalOrdersCompleted || 0) + 1;
    } else if (status === 'refunded') {
      updateData.totalOrderValue = Math.max(0, (journey.totalOrderValue || 0) - totalPrice);
      updateData.totalOrdersRefunded = (journey.totalOrdersRefunded || 0) + 1;
    } else if (status === 'cancelled') {
      updateData.totalOrderValue = Math.max(0, (journey.totalOrderValue || 0) - totalPrice);
      updateData.totalOrdersCancelled = (journey.totalOrdersCancelled || 0) + 1;
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date();
      await prisma.customerJourney.update({
        where: {
          shopConfigId_customerHash: {
            shopConfigId,
            customerHash
          }
        },
        data: updateData
      });
    }
  }

  /**
   * Get complete customer journey
   */
  static async getCustomerJourney(customerHash: string, shopConfigId: string) {
    const [summary, events] = await Promise.all([
      prisma.customerJourney.findUnique({
        where: {
          shopConfigId_customerHash: {
            shopConfigId,
            customerHash
          }
        }
      }),
      prisma.customerEvent.findMany({
        where: {
          shopConfigId,
          customerHash
        },
        orderBy: {
          timestamp: 'asc'
        }
      })
    ]);

    // Compute additional lifecycle metrics: days between first visit and first purchase,
    // and average days between purchases
    let daysToFirstPurchase: number | null = null;
    let avgDaysBetweenPurchases: number | null = null;

    const purchaseEvents = events.filter((e) => e.eventType === 'purchase');
    if (purchaseEvents.length > 0) {
      const firstVisit = events[0]?.timestamp;
      const firstPurchase = purchaseEvents[0]?.timestamp;
      if (firstVisit && firstPurchase) {
        daysToFirstPurchase = Math.max(
          0,
          Math.floor(
            (firstPurchase.getTime() - firstVisit.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );
      }

      if (purchaseEvents.length > 1) {
        let totalDiffDays = 0;
        for (let i = 1; i < purchaseEvents.length; i++) {
          const prev = purchaseEvents[i - 1].timestamp;
          const curr = purchaseEvents[i].timestamp;
          totalDiffDays += Math.max(
            0,
            Math.floor(
              (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
            )
          );
        }
        avgDaysBetweenPurchases = totalDiffDays / (purchaseEvents.length - 1);
      }
    }

    return {
      summary,
      events,
      funnel: this.calculateFunnel(events),
      lifecycle: {
        daysToFirstPurchase,
        avgDaysBetweenPurchases
      }
    };
  }

  /**
   * Calculate conversion funnel metrics
   */
  private static calculateFunnel(events: any[]) {
    const stages = {
      page_view: 0,
      add_to_cart: 0,
      begin_checkout: 0,
      purchase: 0
    };

    let conversions = 0;
    let cancellations = 0;
    let refunds = 0;

    events.forEach(e => {
      if (e.eventType in stages) {
        stages[e.eventType as keyof typeof stages]++;
      }
      if (e.eventType === 'purchase') conversions++;
      if (e.eventType === 'cancel') cancellations++;
      if (e.eventType === 'refund') refunds++;
    });

    // Calculate conversion rates
    const pageViewToCartRate = stages.page_view > 0
      ? ((stages.add_to_cart / stages.page_view) * 100).toFixed(2)
      : 0;
    const cartToCheckoutRate = stages.add_to_cart > 0
      ? ((stages.begin_checkout / stages.add_to_cart) * 100).toFixed(2)
      : 0;
    const checkoutToConversionRate = stages.begin_checkout > 0
      ? ((conversions / stages.begin_checkout) * 100).toFixed(2)
      : 0;

    return {
      stages,
      conversions,
      cancellations,
      refunds,
      conversionRates: {
        pageViewToCart: parseFloat(pageViewToCartRate as string),
        cartToCheckout: parseFloat(cartToCheckoutRate as string),
        checkoutToConversion: parseFloat(checkoutToConversionRate as string)
      }
    };
  }

  /**
   * Get customers by conversion status
   */
  static async getCustomersByStatus(
    shopConfigId: string,
    status: 'converted' | 'abandoned' | 'refunded' | 'all',
    limit = 100
  ) {
    let whereCondition: any = { shopConfigId };

    if (status === 'converted') {
      whereCondition.purchaseCount = { gt: 0 };
      whereCondition.totalOrdersCancelled = 0;
      whereCondition.totalOrdersRefunded = 0;
    } else if (status === 'abandoned') {
      whereCondition.addToCartCount = { gt: 0 };
      whereCondition.purchaseCount = 0;
    } else if (status === 'refunded') {
      whereCondition.totalOrdersRefunded = { gt: 0 };
    }

    return await prisma.customerJourney.findMany({
      where: whereCondition,
      orderBy: { lastEventAt: 'desc' },
      take: limit
    });
  }

  /**
   * Helper: Hash email for privacy
   */
  private static hashEmail(email: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
  }

  /**
   * Get human-readable event display name
   */
  private static getEventDisplayName(eventType: string): string {
    const displayNames: Record<string, string> = {
      'page_view': 'Page Viewed',
      'product_view': 'Product Viewed',
      'add_to_cart': 'Added to Cart',
      'remove_from_cart': 'Removed from Cart',
      'begin_checkout': 'Started Checkout',
      'purchase': 'Purchase Completed',
      'order_created': 'Order Created',
      'order_paid': 'Order Paid',
      'order_cancelled': 'Order Cancelled',
      'order_refunded': 'Order Refunded',
      'refund': 'Refund Processed',
      'cancel': 'Cancelled'
    };

    return displayNames[eventType] || eventType;
  }
}
