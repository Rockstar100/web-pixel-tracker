import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type FunnelStageCounts = {
  page_view: number;
  add_to_cart: number;
  begin_checkout: number;
  purchase: number;
};

export type ChannelFunnel = {
  channel: string;
  source: string;
  stages: FunnelStageCounts;
  conversionRates: {
    pageViewToCart: number;
    cartToCheckout: number;
    checkoutToConversion: number;
  };
};

/**
 * Funnel analytics by channel using pixel-tracked events.
 * Answers: for each channel, how many users reach each stage and where do they drop off.
 */
export class FunnelAnalyticsService {
  /**
   * Get funnel counts per channel for a shop over the last N days.
   * Only considers events where source === 'pixel'.
   */
  static async getFunnelByChannel(
    shopConfigId: string,
    days: number = 30
  ): Promise<ChannelFunnel[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await prisma.customerEvent.findMany({
      where: {
        shopConfigId,
        source: "pixel",
        timestamp: { gte: since },
        eventType: {
          in: ["page_view", "add_to_cart", "begin_checkout", "purchase"],
        },
      },
    });

    const byKey = new Map<
      string,
      { channel: string; source: string; stages: FunnelStageCounts }
    >();

    events.forEach((e) => {
      const { channel, source } = this.deriveChannelFromEvent(e);
      const key = `${channel}|${source}`;

      const bucket =
        byKey.get(key) || {
          channel,
          source,
          stages: {
            page_view: 0,
            add_to_cart: 0,
            begin_checkout: 0,
            purchase: 0,
          },
        };

      if (e.eventType in bucket.stages) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (bucket.stages as any)[e.eventType]++;
      }

      byKey.set(key, bucket);
    });

    const result: ChannelFunnel[] = [];

    byKey.forEach((bucket) => {
      const s = bucket.stages;
      const pageViewToCart =
        s.page_view > 0 ? (s.add_to_cart / s.page_view) * 100 : 0;
      const cartToCheckout =
        s.add_to_cart > 0 ? (s.begin_checkout / s.add_to_cart) * 100 : 0;
      const checkoutToConversion =
        s.begin_checkout > 0 ? (s.purchase / s.begin_checkout) * 100 : 0;

      result.push({
        channel: bucket.channel,
        source: bucket.source,
        stages: bucket.stages,
        conversionRates: {
          pageViewToCart: Number(pageViewToCart.toFixed(2)),
          cartToCheckout: Number(cartToCheckout.toFixed(2)),
          checkoutToConversion: Number(
            checkoutToConversion.toFixed(2)
          ),
        },
      });
    });

    // Sort by purchases desc
    return result.sort(
      (a, b) => b.stages.purchase - a.stages.purchase
    );
  }

  /**
   * Lightweight channel classification based on UTM fields on CustomerEvent.
   */
  private static deriveChannelFromEvent(e: {
    utmSource: string | null;
    utmMedium: string | null;
    pageReferrer: string | null;
  }): { channel: string; source: string } {
    const source = e.utmSource || "direct";
    const medium = e.utmMedium || undefined;
    const mediumLower = medium?.toLowerCase() || "";
    const sourceLower = source.toLowerCase();

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
      channel = mediumLower.includes("paid") || mediumLower.includes("cpc")
        ? "paid_social"
        : "organic_social";
    } else if (mediumLower.includes("affiliate")) {
      channel = "affiliate";
    } else if (mediumLower.includes("organic")) {
      channel = "organic_search";
    } else if (e.pageReferrer && source === "direct") {
      channel = "referral";
    }

    return { channel, source };
  }
}


