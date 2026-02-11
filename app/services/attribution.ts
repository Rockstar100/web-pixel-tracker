import type { NormalizedEvent } from './types';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Attribution tracking service
 * Captures and persists UTM parameters and attribution data
 */
export class AttributionTracker {
  /**
   * Capture attribution from an event
   */
  static async capture(
    event: NormalizedEvent,
    shopConfigId: string,
    isFirstTouch: boolean = false
  ): Promise<void> {
    // Only capture if we have UTM data or significant attribution info
    if (!event.utm && !event.referrer) {
      return;
    }

    try {
      await prisma.attribution.create({
        data: {
          shopConfigId,
          sessionId: event.sessionId,
          customerHash: event.customerHash,
          orderId: event.orderId,
          utmSource: event.utm?.source,
          utmMedium: event.utm?.medium,
          utmCampaign: event.utm?.campaign,
          utmTerm: event.utm?.term,
          utmContent: event.utm?.content,
          firstTouch: isFirstTouch,
          landingPage: event.url,
          referrer: event.referrer,
          capturedAt: event.timestamp
        }
      });

      await this.captureMultiTouch(event, shopConfigId);
    } catch (error) {
      console.error('Failed to capture attribution:', error);
    }
  }

  private static deriveAttributionIdentity(event: NormalizedEvent): string | null {
    if (event.customerHash) {
      return event.customerHash;
    }

    if (event.sessionId) {
      return this.hashValue(`session:${event.sessionId}`);
    }

    return null;
  }

  private static hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private static deriveChannel(event: NormalizedEvent): {
    channel: string;
    source: string;
    medium?: string;
    campaign?: string;
    content?: string;
  } {
    const source = event.utm?.source || "direct";
    const medium = event.utm?.medium || undefined;
    const campaign = event.utm?.campaign || undefined;
    const content = event.utm?.content || undefined;

    const mediumLower = medium?.toLowerCase() || "";
    const sourceLower = source.toLowerCase();

    // Default channel classification inspired by common analytics practice
    let channel = "direct";

    if (mediumLower.includes("email") || sourceLower.includes("mail")) {
      channel = "email";
    } else if (
      mediumLower.includes("cpc") ||
      mediumLower.includes("ppc") ||
      mediumLower.includes("paid")
    ) {
      channel = "paid_search";
    } else if (
      mediumLower.includes("social") ||
      ["facebook", "instagram", "tiktok", "twitter", "linkedin", "youtube", "pinterest"].includes(
        sourceLower
      )
    ) {
      // Distinguish paid vs organic social based on medium if available
      if (mediumLower.includes("paid") || mediumLower.includes("cpc")) {
        channel = "paid_social";
      } else {
        channel = "organic_social";
      }
    } else if (mediumLower.includes("affiliate")) {
      channel = "affiliate";
    } else if (mediumLower.includes("organic")) {
      channel = "organic_search";
    } else if (event.referrer && source === "direct") {
      channel = "referral";
    }

    return { channel, source, medium, campaign, content };
  }

  private static async captureMultiTouch(
    event: NormalizedEvent,
    shopConfigId: string
  ): Promise<void> {
    const attributionIdentity = this.deriveAttributionIdentity(event);
    if (!attributionIdentity) {
      return;
    }

    const { channel, source, medium, campaign, content } = this.deriveChannel(event);

    const existingCount = await prisma.multiTouchAttribution.count({
      where: {
        shopConfigId,
        customerHash: attributionIdentity
      }
    });

    await prisma.multiTouchAttribution.create({
      data: {
        shopConfigId,
        customerHash: attributionIdentity,
        orderId: event.orderId || null,
        touchPosition: existingCount + 1,
        touchType: event.name === 'page_view' ? 'view' : 'interaction',
        channel,
        source,
        medium,
        campaign,
        content,
        attributionWeight: 0.0,
        attributionModel: 'last_click',
        touchAt: event.timestamp
      }
    });
  }

  /**
   * Resolve and store order-level attribution for a purchase event.
   * Currently uses a simple last-click model within a 7-day window.
   */
  static async assignOrderAttributionForPurchase(
    event: NormalizedEvent,
    shopConfigId: string,
    model: string = 'last_click'
  ): Promise<void> {
    if (!event.orderId) {
      return;
    }

    const attributionIdentity = this.deriveAttributionIdentity(event);
    if (!attributionIdentity) {
      return;
    }

    // Attribution window: last 7 days by default
    const windowDays = 7;
    const cutoff = new Date(event.timestamp);
    cutoff.setDate(cutoff.getDate() - windowDays);

    const touches = await prisma.multiTouchAttribution.findMany({
      where: {
        shopConfigId,
        customerHash: attributionIdentity,
        touchAt: {
          gte: cutoff,
          lte: event.timestamp
        }
      },
      orderBy: {
        touchAt: 'asc'
      }
    });

    if (!touches.length) {
      // Nothing to attribute – skip rather than creating "direct" rows here.
      return;
    }

    // Last-click model: pick the last eligible touch
    const winningTouch = touches[touches.length - 1];

    const platform = this.inferPlatform(winningTouch.source);
    const clickIds = event.clickIds || {};

    await prisma.orderAttribution.create({
      data: {
        shopConfigId,
        orderId: event.orderId,
        model,
        channel: winningTouch.channel,
        source: winningTouch.source,
        medium: winningTouch.medium,
        campaign: winningTouch.campaign,
        content: winningTouch.content,
        platform,
        clickId: clickIds.fbclid || clickIds.gclid || clickIds.ttclid || null,
        fbclid: clickIds.fbclid,
        gclid: clickIds.gclid,
        ttclid: clickIds.ttclid,
        revenue: event.value || 0,
        currency: event.currency || 'USD',
        attributionWeight: 1.0
      }
    });
  }

  /**
   * Infer platform from source string (very lightweight heuristic).
   */
  private static inferPlatform(source: string | null | undefined): string | null {
    if (!source) return null;
    const s = source.toLowerCase();
    if (s.includes('facebook') || s.includes('instagram') || s.includes('meta')) return 'meta';
    if (s.includes('google')) return 'google';
    if (s.includes('tiktok')) return 'tiktok';
    if (s.includes('klaviyo') || s.includes('mailchimp') || s.includes('sendgrid')) return 'email';
    if (s.includes('bing') || s.includes('microsoft')) return 'msads';
    return null;
  }

  /**
   * Get first-touch attribution for a customer
   */
  static async getFirstTouch(customerHash: string) {
    return await prisma.attribution.findFirst({
      where: {
        customerHash,
        firstTouch: true
      },
      orderBy: {
        capturedAt: 'asc'
      }
    });
  }

  /**
   * Get last-touch attribution for a customer
   */
  static async getLastTouch(customerHash: string) {
    return await prisma.attribution.findFirst({
      where: {
        customerHash
      },
      orderBy: {
        capturedAt: 'desc'
      }
    });
  }

  /**
   * Get attribution for an order
   */
  static async getOrderAttribution(orderId: string) {
    return await prisma.attribution.findFirst({
      where: {
        orderId
      },
      orderBy: {
        capturedAt: 'desc'
      }
    });
  }

  /**
   * Enrich event with stored attribution data
   */
  static async enrichEvent(event: NormalizedEvent): Promise<NormalizedEvent> {
    // If event already has UTM data, return as-is
    if (event.utm && Object.values(event.utm).some(v => v)) {
      return event;
    }

    // Try to get attribution from customer or session
    let attribution = null;

    if (event.customerHash) {
      attribution = await this.getLastTouch(event.customerHash);
    } else if (event.sessionId) {
      attribution = await prisma.attribution.findFirst({
        where: { sessionId: event.sessionId },
        orderBy: { capturedAt: 'desc' }
      });
    }

    if (attribution) {
      // Enrich event with stored attribution
      event.utm = {
        source: attribution.utmSource || undefined,
        medium: attribution.utmMedium || undefined,
        campaign: attribution.utmCampaign || undefined,
        term: attribution.utmTerm || undefined,
        content: attribution.utmContent || undefined
      };

      if (!event.referrer) {
        event.referrer = attribution.referrer || undefined;
      }
    }

    return event;
  }

  /**
   * Get attribution report for a shop
   */
  static async getReport(shopConfigId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const attributions = await prisma.attribution.findMany({
      where: {
        shopConfigId,
        capturedAt: { gte: since }
      }
    });

    // Aggregate by source
    const bySource = attributions.reduce((acc, attr) => {
      const source = attr.utmSource || 'direct';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Aggregate by medium
    const byMedium = attributions.reduce((acc, attr) => {
      const medium = attr.utmMedium || 'none';
      acc[medium] = (acc[medium] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Aggregate by campaign
    const byCampaign = attributions.reduce((acc, attr) => {
      const campaign = attr.utmCampaign || 'none';
      acc[campaign] = (acc[campaign] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: attributions.length,
      bySource,
      byMedium,
      byCampaign,
      firstTouch: attributions.filter(a => a.firstTouch).length
    };
  }

  /**
   * Clean up old attributions
   */
  static async cleanup(retentionDays: number = 180): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.attribution.deleteMany({
      where: {
        capturedAt: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }
}
