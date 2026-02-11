/**
 * Cohort Analysis Service
 * Tracks user groups acquired in the same period and their behavior over time
 */

import type { PrismaClient } from '@prisma/client';
import type { CohortAnalysis, CohortMatrix } from './types.advanced';

export class CohortAnalysisService {
  constructor(private db: PrismaClient) {}

  /**
   * Create or update a cohort for a given acquisition date
   */
  async createOrUpdateCohort(
    shopConfigId: string,
    cohortDate: Date,
    cohortName: string
  ): Promise<CohortAnalysis | null> {
    // Get all customers acquired in this period
    const cohortStart = new Date(cohortDate);
    const cohortEnd = new Date(cohortDate);
    cohortEnd.setDate(cohortEnd.getDate() + 1);

    const cohortCustomers = await this.db.orderTracking.findMany({
      where: {
        shopConfigId,
        paymentStatus: 'completed',
        createdAt: {
          gte: cohortStart,
          lt: cohortEnd,
        },
      },
      distinct: ['customerHash'],
      select: {
        customerHash: true,
      },
    });

    if (cohortCustomers.length === 0) {
      return null;
    }

    const cohortSize = cohortCustomers.length;
    const customerHashes = cohortCustomers.map((c) => c.customerHash);

    // Calculate retention at different time periods
    const retention = await this.calculateRetention(
      shopConfigId,
      customerHashes,
      cohortStart
    );

    // Calculate revenue metrics
    const revenue = await this.calculateCohortRevenue(
      shopConfigId,
      customerHashes,
      cohortStart
    );

    // Calculate churn and repeat purchase
    const churnRate = (1 - retention.day30 / cohortSize) * 100;
    const repeatPurchaseRate = await this.calculateRepeatPurchaseRate(
      shopConfigId,
      customerHashes,
      cohortStart
    );

    // Create or update cohort record
    const cohort = await this.db.cohortAnalysis.upsert({
      where: {
        id: `${shopConfigId}-${cohortDate.toISOString().split('T')[0]}`,
      },
      create: {
        id: `${shopConfigId}-${cohortDate.toISOString().split('T')[0]}`,
        shopConfigId,
        cohortDate,
        cohortSize,
        cohortName,
        day0Retention: cohortSize,
        day1Retention: retention.day1,
        day7Retention: retention.day7,
        day30Retention: retention.day30,
        day90Retention: retention.day90,
        day0Revenue: revenue.day0,
        day7Revenue: revenue.day7,
        day30Revenue: revenue.day30,
        day90Revenue: revenue.day90,
        churnRate,
        repeatPurchaseRate,
      },
      update: {
        day1Retention: retention.day1,
        day7Retention: retention.day7,
        day30Retention: retention.day30,
        day90Retention: retention.day90,
        day0Revenue: revenue.day0,
        day7Revenue: revenue.day7,
        day30Revenue: revenue.day30,
        day90Revenue: revenue.day90,
        churnRate,
        repeatPurchaseRate,
      },
    });

    return cohort;
  }

  /**
   * Calculate retention at different time periods
   */
  private async calculateRetention(
    shopConfigId: string,
    customerHashes: string[],
    cohortStart: Date
  ): Promise<{
    day1: number;
    day7: number;
    day30: number;
    day90: number;
  }> {
    // Day 0 retention is all customers
    const totalCustomers = customerHashes.length;

    // Day 1 retention
    const day1Date = new Date(cohortStart);
    day1Date.setDate(day1Date.getDate() + 1);
    const day1Customers = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day1Date },
      },
    });
    const day1Retention = day1Customers.length;

    // Day 7 retention
    const day7Date = new Date(cohortStart);
    day7Date.setDate(day7Date.getDate() + 7);
    const day7Customers = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day7Date },
      },
    });
    const day7Retention = day7Customers.length;

    // Day 30 retention
    const day30Date = new Date(cohortStart);
    day30Date.setDate(day30Date.getDate() + 30);
    const day30Customers = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day30Date },
      },
    });
    const day30Retention = day30Customers.length;

    // Day 90 retention
    const day90Date = new Date(cohortStart);
    day90Date.setDate(day90Date.getDate() + 90);
    const day90Customers = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day90Date },
      },
    });
    const day90Retention = day90Customers.length;

    return {
      day1: day1Retention,
      day7: day7Retention,
      day30: day30Retention,
      day90: day90Retention,
    };
  }

  /**
   * Calculate revenue metrics for cohort at different time periods
   */
  private async calculateCohortRevenue(
    shopConfigId: string,
    customerHashes: string[],
    cohortStart: Date
  ): Promise<{
    day0: number;
    day7: number;
    day30: number;
    day90: number;
  }> {
    // Day 0 revenue (acquisition day)
    const day0Orders = await this.db.orderTracking.aggregate({
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: {
          gte: cohortStart,
          lt: new Date(cohortStart.getTime() + 86400000), // +1 day
        },
      },
      _sum: {
        totalValue: true,
      },
    });
    const day0Revenue = day0Orders._sum.totalValue || 0;

    // Day 7 revenue
    const day7Date = new Date(cohortStart);
    day7Date.setDate(day7Date.getDate() + 7);
    const day7Orders = await this.db.orderTracking.aggregate({
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day7Date },
      },
      _sum: {
        totalValue: true,
      },
    });
    const day7Revenue = day7Orders._sum.totalValue || 0;

    // Day 30 revenue
    const day30Date = new Date(cohortStart);
    day30Date.setDate(day30Date.getDate() + 30);
    const day30Orders = await this.db.orderTracking.aggregate({
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day30Date },
      },
      _sum: {
        totalValue: true,
      },
    });
    const day30Revenue = day30Orders._sum.totalValue || 0;

    // Day 90 revenue
    const day90Date = new Date(cohortStart);
    day90Date.setDate(day90Date.getDate() + 90);
    const day90Orders = await this.db.orderTracking.aggregate({
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: day90Date },
      },
      _sum: {
        totalValue: true,
      },
    });
    const day90Revenue = day90Orders._sum.totalValue || 0;

    return {
      day0: day0Revenue,
      day7: day7Revenue,
      day30: day30Revenue,
      day90: day90Revenue,
    };
  }

  /**
   * Calculate repeat purchase rate for cohort
   */
  private async calculateRepeatPurchaseRate(
    shopConfigId: string,
    customerHashes: string[],
    cohortStart: Date
  ): Promise<number> {
    const customersWithRepeatPurchases = await this.db.orderTracking.groupBy({
      by: ['customerHash'],
      where: {
        shopConfigId,
        customerHash: { in: customerHashes },
        paymentStatus: 'completed',
        createdAt: { gte: cohortStart },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _gt: 1, // More than 1 purchase
        },
      },
    });

    return (customersWithRepeatPurchases.length / customerHashes.length) * 100;
  }

  /**
   * Get cohort retention matrix for visualization
   */
  async getCohortMatrix(
    shopConfigId: string,
    weeksToShow: number = 12
  ): Promise<CohortMatrix[]> {
    const cohorts = await this.db.cohortAnalysis.findMany({
      where: {
        shopConfigId,
        cohortDate: {
          gte: new Date(Date.now() - weeksToShow * 7 * 86400000),
        },
      },
      orderBy: {
        cohortDate: 'desc',
      },
    });

    return cohorts.map((cohort) => ({
      cohortName: cohort.cohortName,
      cohortDate: cohort.cohortDate,
      cohortSize: cohort.cohortSize,
      retention: {
        day0: cohort.day0Retention,
        day1: cohort.day1Retention,
        day7: cohort.day7Retention,
        day30: cohort.day30Retention,
        day90: cohort.day90Retention,
      },
      revenue: {
        day0: cohort.day0Revenue,
        day7: cohort.day7Revenue,
        day30: cohort.day30Revenue,
        day90: cohort.day90Revenue,
      },
      metrics: {
        churnRate: cohort.churnRate,
        repeatPurchaseRate: cohort.repeatPurchaseRate,
        ltv: cohort.day30Revenue / (cohort.cohortSize || 1),
      },
    }));
  }

  /**
   * Calculate average metrics across all cohorts
   */
  async getAverageCohortMetrics(shopConfigId: string) {
    const cohorts = await this.db.cohortAnalysis.findMany({
      where: { shopConfigId },
    });

    if (cohorts.length === 0) {
      return null;
    }

    const avgDay7Retention =
      cohorts.reduce((sum, c) => sum + c.day7Retention, 0) / cohorts.length;
    const avgDay30Retention =
      cohorts.reduce((sum, c) => sum + c.day30Retention, 0) / cohorts.length;
    const avgChurnRate =
      cohorts.reduce((sum, c) => sum + c.churnRate, 0) / cohorts.length;
    const avgRepeatPurchaseRate =
      cohorts.reduce((sum, c) => sum + c.repeatPurchaseRate, 0) / cohorts.length;
    const avgLTV = cohorts.reduce((sum, c) => sum + c.day30Revenue, 0) / cohorts.length;

    return {
      avgDay7Retention,
      avgDay30Retention,
      avgChurnRate,
      avgRepeatPurchaseRate,
      avgLTV,
      totalCohorts: cohorts.length,
    };
  }

  /**
   * Identify cohorts with strong performance
   */
  async getTopPerformingCohorts(
    shopConfigId: string,
    limit: number = 5
  ): Promise<CohortAnalysis[]> {
    const cohorts = await this.db.cohortAnalysis.findMany({
      where: { shopConfigId },
      orderBy: {
        day30Revenue: 'desc',
      },
      take: limit,
    });

    return cohorts;
  }

  /**
   * Identify cohorts with poor retention (potential issues)
   */
  async getPoorRetentionCohorts(
    shopConfigId: string,
    day30RetentionThreshold: number = 10
  ): Promise<CohortAnalysis[]> {
    const cohorts = await this.db.cohortAnalysis.findMany({
      where: {
        shopConfigId,
        day30Retention: {
          lt: day30RetentionThreshold,
        },
      },
      orderBy: {
        cohortDate: 'desc',
      },
    });

    return cohorts;
  }
}
