/**
 * Health Monitoring Service
 * Tracks system component health, errors, and performance
 */

import type { PrismaClient } from '@prisma/client';
import type { ComponentType, HealthStatus, HealthCheckResult } from './types.advanced';

export class HealthMonitoringService {
  constructor(private db: PrismaClient) {}

  /**
   * Log a health event
   */
  async logHealth(
    shopifyShop: string,
    component: ComponentType,
    status: HealthStatus,
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.db.healthLog.create({
      data: {
        shopifyShop,
        component,
        status,
        message,
        details: details ? JSON.stringify(details) : undefined,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Get health check result for a component
   */
  async getComponentHealth(
    shopifyShop: string,
    component: ComponentType,
    timeWindowMinutes: number = 60
  ): Promise<HealthCheckResult> {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60000);

    const logs = await this.db.healthLog.findMany({
      where: {
        shopifyShop,
        component,
        timestamp: { gte: cutoffTime },
      },
      orderBy: { timestamp: 'desc' },
    });

    const successCount = logs.filter((l) => l.status === 'success').length;
    const errorCount = logs.filter((l) => l.status === 'error').length;
    const warningCount = logs.filter((l) => l.status === 'warning').length;

    const totalCount = logs.length;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

    // Determine overall status
    let overallStatus: HealthStatus = 'success';
    if (errorCount > 0) {
      overallStatus = 'error';
    } else if (warningCount > 0) {
      overallStatus = 'warning';
    }

    // Get last log for message
    const lastLog = logs[0];
    const message = lastLog
      ? lastLog.message
      : `No logs in last ${timeWindowMinutes} minutes`;

    return {
      component,
      status: overallStatus,
      message,
      lastCheck: lastLog?.timestamp || new Date(),
      successRate,
      errorCount,
    };
  }

  /**
   * Get overall system health
   */
  async getSystemHealth(
    shopifyShop: string,
    timeWindowMinutes: number = 60
  ): Promise<HealthCheckResult[]> {
    const components: ComponentType[] = [
      'pixel',
      'webhook',
      'umami_forward',
      'attribution',
      'cohort',
      'export',
      'cleanup',
      'database',
    ];

    const results: HealthCheckResult[] = [];

    for (const component of components) {
      const health = await this.getComponentHealth(shopifyShop, component, timeWindowMinutes);
      results.push(health);
    }

    return results;
  }

  /**
   * Get recent errors
   */
  async getRecentErrors(
    shopifyShop: string,
    limit: number = 20,
    minutesBack: number = 60
  ): Promise<
    Array<{
      component: ComponentType;
      message: string;
      count: number;
      lastOccurrence: Date;
    }>
  > {
    const cutoffTime = new Date(Date.now() - minutesBack * 60000);

    const errorLogs = await this.db.healthLog.findMany({
      where: {
        shopifyShop,
        status: 'error',
        timestamp: { gte: cutoffTime },
      },
    });

    // Group by component and message
    const grouped = new Map<
      string,
      { component: ComponentType; message: string; count: number; lastOccurrence: Date }
    >();

    for (const log of errorLogs) {
      const key = `${log.component}:${log.message}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.count += 1;
        existing.lastOccurrence = log.timestamp;
      } else {
        grouped.set(key, {
          component: log.component as ComponentType,
          message: log.message,
          count: 1,
          lastOccurrence: log.timestamp,
        });
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get error rate for a component over time
   */
  async getComponentErrorRate(
    shopifyShop: string,
    component: ComponentType,
    intervalMinutes: number = 5,
    lookbackHours: number = 24
  ): Promise<
    Array<{
      timestamp: Date;
      errorRate: number;
      errorCount: number;
      successCount: number;
    }>
  > {
    const cutoffTime = new Date(Date.now() - lookbackHours * 3600000);

    const logs = await this.db.healthLog.findMany({
      where: {
        shopifyShop,
        component,
        timestamp: { gte: cutoffTime },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Group by interval
    const intervals = new Map<
      number,
      { errorCount: number; successCount: number; timestamp: Date }
    >();

    for (const log of logs) {
      const intervalStart = Math.floor(log.timestamp.getTime() / (intervalMinutes * 60000));
      const existing = intervals.get(intervalStart) || {
        errorCount: 0,
        successCount: 0,
        timestamp: new Date(intervalStart * intervalMinutes * 60000),
      };

      if (log.status === 'error') {
        existing.errorCount += 1;
      } else {
        existing.successCount += 1;
      }

      intervals.set(intervalStart, existing);
    }

    return Array.from(intervals.values())
      .map((interval) => ({
        timestamp: interval.timestamp,
        errorRate:
          (interval.errorCount / (interval.errorCount + interval.successCount)) * 100,
        errorCount: interval.errorCount,
        successCount: interval.successCount,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Check if component is healthy
   */
  async isComponentHealthy(
    shopifyShop: string,
    component: ComponentType,
    errorThresholdPercent: number = 10,
    timeWindowMinutes: number = 60
  ): Promise<boolean> {
    const health = await this.getComponentHealth(shopifyShop, component, timeWindowMinutes);
    return health.successRate >= 100 - errorThresholdPercent;
  }

  /**
   * Get slow components (high error rates)
   */
  async getSlowComponents(
    shopifyShop: string,
    errorThresholdPercent: number = 20
  ): Promise<HealthCheckResult[]> {
    const systemHealth = await this.getSystemHealth(shopifyShop);
    return systemHealth.filter(
      (h) => h.successRate < 100 - errorThresholdPercent || h.status !== 'success'
    );
  }

  /**
   * Clean up old health logs
   */
  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 86400000);

    const result = await this.db.healthLog.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
      },
    });

    await this.logHealth(
      'system',
      'cleanup',
      'success',
      `Cleaned up ${result.count} health logs older than ${retentionDays} days`
    );

    return result.count;
  }

  /**
   * Get component statistics
   */
  async getComponentStats(
    shopifyShop: string,
    component: ComponentType,
    days: number = 7
  ): Promise<{
    component: ComponentType;
    totalEvents: number;
    successCount: number;
    errorCount: number;
    warningCount: number;
    successRate: number;
    averageErrorsPerDay: number;
    topErrors: Array<{ message: string; count: number }>;
  }> {
    const cutoffDate = new Date(Date.now() - days * 86400000);

    const logs = await this.db.healthLog.findMany({
      where: {
        shopifyShop,
        component,
        timestamp: { gte: cutoffDate },
      },
    });

    const successCount = logs.filter((l) => l.status === 'success').length;
    const errorCount = logs.filter((l) => l.status === 'error').length;
    const warningCount = logs.filter((l) => l.status === 'warning').length;
    const totalEvents = logs.length;

    // Group errors
    const errorGroups = new Map<string, number>();
    for (const log of logs.filter((l) => l.status === 'error')) {
      errorGroups.set(log.message, (errorGroups.get(log.message) || 0) + 1);
    }

    const topErrors = Array.from(errorGroups.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      component,
      totalEvents,
      successCount,
      errorCount,
      warningCount,
      successRate: totalEvents > 0 ? (successCount / totalEvents) * 100 : 0,
      averageErrorsPerDay: errorCount / days,
      topErrors,
    };
  }
}
