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
    const source = event.utm?.source || 'direct';
    const medium = event.utm?.medium || undefined;
    const campaign = event.utm?.campaign || undefined;
    const content = event.utm?.content || undefined;

    const mediumLower = medium?.toLowerCase() || '';
    const sourceLower = source.toLowerCase();

    let channel = 'direct';

    if (mediumLower.includes('email') || sourceLower.includes('mail')) {
      channel = 'email';
    } else if (mediumLower.includes('cpc') || mediumLower.includes('ppc') || mediumLower.includes('paid')) {
      channel = 'paid_search';
    } else if (
      mediumLower.includes('social') ||
      ['facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest'].includes(sourceLower)
    ) {
      channel = 'social';
    } else if (mediumLower.includes('affiliate')) {
      channel = 'affiliate';
    } else if (event.referrer && source === 'direct') {
      channel = 'referral';
    } else if (mediumLower.includes('organic')) {
      channel = 'organic';
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
