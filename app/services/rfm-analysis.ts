/**
 * RFM Analysis Service
 * Implements Recency, Frequency, Monetary value analysis for customer segmentation
 */

import type { PrismaClient } from '@prisma/client';
import type { RFMScore } from './types.advanced';

export class RFMAnalysisService {
  constructor(private db: PrismaClient) {}

  /**
   * Calculate RFM scores for all customers in a shop
   */
  async calculateRFMScores(
    shopConfigId: string,
    lookbackDays: number = 365
  ): Promise<RFMScore[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const customerMetrics = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        createdAt: { gte: cutoffDate },
        paymentStatus: 'completed',
      },
      _count: {
        id: true,
      },
      _sum: {
        totalValue: true,
      },
      _max: {
        createdAt: true,
      },
    });

    const now = new Date();
    const rfmScores: RFMScore[] = [];

    for (const metric of customerMetrics) {
      if (!metric._max.createdAt) continue;

      const recency = Math.floor(
        (now.getTime() - metric._max.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const frequency = metric._count.id;
      const monetary = metric._sum.totalValue || 0;

      // Calculate scores (1-5, where 5 is best)
      const rScore = this.scoreRecency(recency, lookbackDays);
      const fScore = this.scoreFrequency(frequency);
      const mScore = this.scoreMonetary(monetary, shopConfigId);

      // Calculate customer LTV
      const customerLTV = frequency > 0 ? monetary : 0;

      // Determine segment
      const rfmSegment = this.determineSegment(rScore, fScore, mScore);

      rfmScores.push({
        customerHash: metric.customerHash,
        recency,
        frequency,
        monetary,
        rScore,
        fScore,
        mScore,
        rfmSegment,
        customerLTV,
      });
    }

    return rfmScores;
  }

  /**
   * Score recency (1-5, where 5 is most recent)
   */
  private scoreRecency(recencyDays: number, maxDays: number): number {
    if (recencyDays <= maxDays * 0.2) return 5;
    if (recencyDays <= maxDays * 0.4) return 4;
    if (recencyDays <= maxDays * 0.6) return 3;
    if (recencyDays <= maxDays * 0.8) return 2;
    return 1;
  }

  /**
   * Score frequency (1-5, where 5 is most frequent)
   */
  private scoreFrequency(frequency: number): number {
    if (frequency >= 10) return 5;
    if (frequency >= 6) return 4;
    if (frequency >= 3) return 3;
    if (frequency >= 2) return 2;
    return 1;
  }

  /**
   * Score monetary value (1-5, where 5 is highest)
   * Uses percentile-based scoring for fairness
   */
  private scoreMonetary(monetary: number, shopConfigId: string): number {
    // This would ideally be based on shop-specific percentiles
    // For now, using relative scoring
    if (monetary >= 10000) return 5;
    if (monetary >= 5000) return 4;
    if (monetary >= 1000) return 3;
    if (monetary >= 100) return 2;
    return 1;
  }

  /**
   * Determine RFM segment based on scores
   */
  private determineSegment(rScore: number, fScore: number, mScore: number): string {
    // VIP: High on all dimensions
    if (rScore >= 4 && fScore >= 4 && mScore >= 4) {
      return 'VIP';
    }

    // Loyal: Recent and frequent
    if (rScore >= 3 && fScore >= 3) {
      return 'Loyal';
    }

    // High Value: Spent a lot even if not recent
    if (mScore >= 4 && fScore >= 2) {
      return 'HighValue';
    }

    // Potential: Recent and potentially valuable
    if (rScore >= 4 && mScore >= 3) {
      return 'Potential';
    }

    // At Risk: Was good but not recently active
    if (rScore <= 2 && fScore >= 3 && mScore >= 3) {
      return 'AtRisk';
    }

    // Lost High Value: Was a top customer but gone inactive
    if (rScore <= 2 && mScore >= 4) {
      return 'LostHighValue';
    }

    // New: Recent but low frequency/spend
    if (rScore >= 4 && fScore <= 1) {
      return 'New';
    }

    // Churned: Inactive for long
    if (rScore <= 1) {
      return 'Churned';
    }

    return 'Standard';
  }

  /**
   * Get customer segment summary
   */
  async getSegmentSummary(shopConfigId: string) {
    const rfmScores = await this.calculateRFMScores(shopConfigId);

    const segments = new Map<string, { count: number; totalLTV: number; avgLTV: number }>();

    for (const score of rfmScores) {
      const segment = score.rfmSegment;
      const current = segments.get(segment) || { count: 0, totalLTV: 0, avgLTV: 0 };
      current.count += 1;
      current.totalLTV += score.customerLTV;
      current.avgLTV = current.totalLTV / current.count;
      segments.set(segment, current);
    }

    return Object.fromEntries(segments);
  }

  /**
   * Identify customers at risk of churning
   */
  async identifyAtRiskCustomers(
    shopConfigId: string,
    recencyThresholdDays: number = 60,
    minHistoricalValue: number = 100
  ): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - recencyThresholdDays);

    // Customers who have spent well but not purchased recently
    const atRiskCustomers = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        paymentStatus: 'completed',
        createdAt: {
          lt: cutoffDate, // Not active recently
        },
      },
      _sum: {
        totalValue: true,
      },
      having: {
        totalValue: {
          gte: minHistoricalValue,
        },
      },
    });

    return atRiskCustomers.map((c) => c.customerHash);
  }

  /**
   * Get high-value customer identifiers
   */
  async getHighValueCustomers(
    shopConfigId: string,
    minLTV: number = 500
  ): Promise<
    Array<{
      customerHash: string;
      totalSpent: number;
      purchaseCount: number;
      lastPurchaseDate: Date;
    }>
  > {
    const highValueCustomers = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        paymentStatus: 'completed',
      },
      _sum: {
        totalValue: true,
      },
      _count: {
        id: true,
      },
      _max: {
        createdAt: true,
      },
      having: {
        totalValue: {
          gte: minLTV,
        },
      },
    });

    return highValueCustomers
      .map((c) => ({
        customerHash: c.customerHash,
        totalSpent: c._sum.totalValue || 0,
        purchaseCount: c._count.id,
        lastPurchaseDate: c._max.createdAt || new Date(),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }
}
