/**
 * Practical Examples - Industry Best Practices Implementation
 * Real-world usage patterns and integration examples
 */

// ============================================================================
// EXAMPLE 1: RFM SEGMENTATION FOR EMAIL MARKETING
// ============================================================================

import { RFMAnalysisService } from '~/services';

/**
 * Use Case: Segment customers for targeted email campaigns
 */
async function emailMarketingExample(db: any, shopId: string) {
  const rfmService = new RFMAnalysisService(db);

  // Step 1: Calculate RFM scores for all customers
  const rfmScores = await rfmService.calculateRFMScores(shopId);

  // Step 2: Group customers by segment
  const segments = await rfmService.getSegmentSummary(shopId);

  // Step 3: Create email lists based on segments
  const emailLists = {
    // VIP customers - send exclusive deals
    vip: rfmScores.filter((s) => s.rfmSegment === 'VIP'),

    // At-risk customers - send winback campaign
    atRisk: rfmScores.filter((s) => s.rfmSegment === 'AtRisk'),

    // Potential high-value - nurture campaigns
    potential: rfmScores.filter((s) => s.rfmSegment === 'Potential'),

    // New customers - onboarding sequence
    new: rfmScores.filter((s) => s.rfmSegment === 'New'),
  };

  // Step 4: Send segmented emails
  for (const [segment, customers] of Object.entries(emailLists)) {
    const subject = getSubjectLine(segment);
    const template = getEmailTemplate(segment);

    for (const customer of customers) {
      // Send email via your email service
      await sendEmail({
        customerHash: customer.customerHash,
        subject,
        template,
        personalization: {
          rfmScore: customer.rfmSegment,
          ltv: customer.customerLTV,
        },
      });
    }
  }

  return {
    totalCustomers: rfmScores.length,
    segmentBreakdown: segments,
    emailsSent: emailLists,
  };
}

// ============================================================================
// EXAMPLE 2: COHORT ANALYSIS FOR ACQUISITION QUALITY
// ============================================================================

import { CohortAnalysisService } from '~/services';

/**
 * Use Case: Compare acquisition channels by retention metrics
 */
async function acquisitionQualityExample(db: any, shopId: string) {
  const cohortService = new CohortAnalysisService(db);

  // Create cohorts for the last 4 weeks of acquisitions
  const cohorts = [];
  for (let i = 0; i < 4; i++) {
    const cohortDate = new Date();
    cohortDate.setDate(cohortDate.getDate() - i * 7);
    const cohortName = `Week_${i + 1}`;

    const cohort = await cohortService.createOrUpdateCohort(shopId, cohortDate, cohortName);
    cohorts.push(cohort);
  }

  // Get retention matrix for visualization
  const matrix = await cohortService.getCohortMatrix(shopId);

  // Analyze which acquisition period performed best
  const topCohorts = await cohortService.getTopPerformingCohorts(shopId, 3);

  // Find problem cohorts (poor retention)
  const poorCohorts = await cohortService.getPoorRetentionCohorts(shopId, 20);

  // Calculate average metrics across all cohorts
  const avgMetrics = await cohortService.getAverageCohortMetrics(shopId);

  // Make business decisions
  const insights = {
    message: `Average day-30 retention: ${Math.round(avgMetrics.avgDay30Retention)}%`,
    topPerformers: topCohorts.map((c) => ({
      name: c.cohortName,
      retention: c.day30Retention,
      revenue: c.day30Revenue,
      ltv: c.day30Revenue / c.cohortSize,
    })),
    problemAreas: poorCohorts.map((c) => ({
      name: c.cohortName,
      retention: c.day30Retention,
      reason: 'Low retention - investigate acquisition source or product issues',
    })),
    recommendation:
      topCohorts[0].day30Retention > avgMetrics.avgDay30Retention
        ? `Double down on acquisition from top performer: ${topCohorts[0].cohortName}`
        : 'Need to improve acquisition quality',
  };

  return {
    cohortMatrix: matrix,
    insights,
    avgMetrics,
  };
}

// ============================================================================
// EXAMPLE 3: CHURN PREVENTION CAMPAIGN
// ============================================================================

/**
 * Use Case: Identify at-risk customers and send retention campaigns
 */
async function churnPreventionExample(db: any, shopId: string) {
  const rfmService = new RFMAnalysisService(db);

  // Find high-value customers who haven't purchased in 60 days
  const atRiskCustomers = await rfmService.identifyAtRiskCustomers(
    shopId,
    60, // 60 days without purchase
    500 // Who spent at least $500
  );

  // Get high-value customer details
  const customerDetails = await rfmService.getHighValueCustomers(shopId, 500);

  // Create retention campaign
  const retentionCampaign = {
    name: `Churn_Prevention_${new Date().toISOString().split('T')[0]}`,
    targetAudience: atRiskCustomers.length,
    customers: atRiskCustomers.map((customerHash) => ({
      customerHash,
      offerType: 'exclusive_discount', // 15% off their last category
      campaignDuration: 7, // days
      trackingPixel: 'churn_prevention_campaign',
    })),
    expectedImpact: {
      conversionRateTarget: 0.15, // 15% conversion
      expectedRevenue: customerDetails
        .filter((c) => atRiskCustomers.includes(c.customerHash))
        .reduce((sum, c) => sum + c.totalSpent * 0.15, 0),
    },
  };

  // Send campaign
  for (const customer of retentionCampaign.customers) {
    await sendRetentionEmail({
      customerHash: customer.customerHash,
      offerType: customer.offerType,
      trackingId: customer.trackingPixel,
    });
  }

  return {
    campaignDetails: retentionCampaign,
    estimatedSavings: `$${Math.round(retentionCampaign.expectedImpact.expectedRevenue)}`,
  };
}

// ============================================================================
// EXAMPLE 4: HEALTH MONITORING & ALERTING
// ============================================================================

import { HealthMonitoringService } from '~/services';

/**
 * Use Case: Monitor system health and alert on issues
 */
async function healthMonitoringExample(db: any, shopifyShop: string) {
  const healthService = new HealthMonitoringService(db);

  // Get system-wide health
  const systemHealth = await healthService.getSystemHealth(shopifyShop);

  // Check for slow/failing components
  const slowComponents = await healthService.getSlowComponents(shopifyShop, 20); // Alert if > 20% error

  // Get recent errors
  const recentErrors = await healthService.getRecentErrors(shopifyShop, 10, 60);

  // Build alert message if there are issues
  const alerts = [];

  for (const component of slowComponents) {
    alerts.push({
      severity: component.status === 'error' ? 'critical' : 'warning',
      message: `${component.component} health is ${component.status} (${Math.round(component.successRate)}% success)`,
      action: 'investigate',
    });
  }

  // Detailed error analysis
  const errorAnalysis = {
    totalErrorsLastHour: recentErrors.reduce((sum, e) => sum + e.count, 0),
    topErrors: recentErrors.slice(0, 3),
    recommendations: recentErrors.map((e) => ({
      error: e.message,
      frequency: e.count,
      action: getRemediationAction(e.message),
    })),
  };

  // Send alerts to monitoring system (Slack, PagerDuty, etc.)
  if (alerts.length > 0) {
    await sendAlert({
      channel: 'devops',
      alerts,
      errorAnalysis,
      timestamp: new Date(),
    });
  }

  return {
    systemHealth,
    alerts,
    errorAnalysis,
  };
}

// ============================================================================
// EXAMPLE 5: A/B TESTING FRAMEWORK
// ============================================================================

/**
 * Use Case: Run controlled experiment on checkout flow
 */
async function abTestingExample(db: any, shopConfigId: string) {
  // Create experiment
  const experiment = await db.experiment.create({
    data: {
      shopConfigId,
      name: 'Checkout Optimization - One-Click Payment',
      description: 'Test one-click payment button vs traditional checkout',
      startDate: new Date(),
      status: 'running',
      controlGroup: 'Traditional Checkout',
      treatmentGroup: 'One-Click Payment',
      trafficPercentage: 50, // 50% of traffic to each variant
      primaryMetric: 'conversion_rate',
      secondaryMetrics: JSON.stringify(['aov', 'cart_abandonment']),
    },
  });

  // Track experiment results (updated as customers interact)
  // This would be updated in your pixel collection logic
  const experimentTracking = {
    trackingCode: `
      if (window.experiment && window.experiment.id === '${experiment.id}') {
        const variant = window.experiment.variant; // 'control' or 'treatment'
        // Track purchase event with variant
        trackEvent('purchase', {
          variant,
          experimentId: '${experiment.id}',
          conversionValue: cartTotal,
        });
      }
    `,
  };

  // After sufficient data, analyze results
  const analysisAfter30Days = async () => {
    const result = await db.experiment.findUnique({
      where: { id: experiment.id },
    });

    const controlRate = result.controlConversions / (result.controlConversions + 1);
    const treatmentRate = result.treatmentConversions / (result.treatmentConversions + 1);
    const improvement = ((treatmentRate - controlRate) / controlRate) * 100;

    return {
      experiment: result.name,
      duration: '30 days',
      results: {
        controlConversion: `${(controlRate * 100).toFixed(2)}%`,
        treatmentConversion: `${(treatmentRate * 100).toFixed(2)}%`,
        improvementPercent: `${improvement.toFixed(2)}%`,
        isSignificant: result.statisticalSignificance < 0.05,
      },
      recommendation:
        improvement > 0
          ? `Implement ${result.treatmentGroup} - ${improvement.toFixed(2)}% improvement`
          : `Keep ${result.controlGroup} - no significant improvement`,
      estimatedMonthlyImpact: `$${Math.round(improvement * 100000)}`,
    };
  };

  return {
    experiment,
    trackingCode: experimentTracking.trackingCode,
    analysisFunction: analysisAfter30Days,
  };
}

// ============================================================================
// EXAMPLE 6: GDPR COMPLIANCE
// ============================================================================

/**
 * Use Case: Handle GDPR data deletion request
 */
async function gdprDeletionExample(db: any, shopConfigId: string, customerHash: string) {
  // Step 1: Get data retention policies
  const policies = await db.dataRetentionPolicy.findMany({
    where: { shopConfigId },
  });

  // Step 2: Audit the deletion
  const deletionAudit = await db.eventReplay.create({
    data: {
      shopConfigId,
      originalEventId: customerHash,
      customerHash,
      eventType: 'gdpr_deletion_request',
      eventData: JSON.stringify({
        requestDate: new Date(),
        requesterEmail: 'customer@example.com',
        reason: 'GDPR Right to be Forgotten',
      }),
      replayedAt: new Date(),
      replayReason: 'gdpr_deletion',
    },
  });

  // Step 3: Execute deletion according to policies
  const deletionResults = {
    completedAt: new Date(),
    actions: [],
  };

  // Delete personal data immediately
  const personalDataPolicy = policies.find((p) => p.dataType === 'personal_data');
  if (personalDataPolicy && personalDataPolicy.deleteAfterDays === 0) {
    await db.customerProfile.delete({
      where: { customerHash },
    });
    deletionResults.actions.push('Customer profile deleted');
  }

  // Anonymize events instead of deleting (for analytics)
  const eventsPolicy = policies.find((p) => p.dataType === 'events');
  if (eventsPolicy && eventsPolicy.anonymizeAfterDays === 0) {
    await db.customerEvent.updateMany({
      where: { customerHash },
      data: {
        customerHash: `anonymized_${Date.now()}`,
      },
    });
    deletionResults.actions.push('Customer events anonymized');
  }

  // Delete orders
  await db.orderTracking.deleteMany({
    where: { customerHash },
  });
  deletionResults.actions.push('Order history deleted');

  // Log successful completion
  await db.healthLog.create({
    data: {
      shopifyShop: 'system',
      component: 'cleanup',
      status: 'success',
      message: `GDPR deletion completed for customer ${customerHash}`,
      details: JSON.stringify(deletionResults),
    },
  });

  return {
    deletionAudit,
    deletionResults,
    complianceStatus: 'GDPR Compliant',
  };
}

// ============================================================================
// EXAMPLE 7: CUSTOMER LIFECYCLE AUTOMATION
// ============================================================================

/**
 * Use Case: Automatically move customers through lifecycle stages
 */
async function lifecycleAutomationExample(db: any, customerHash: string, shopConfigId: string) {
  // Check customer's current stage
  const currentStage = await db.customerLifecycle.findFirst({
    where: { customerHash, shopConfigId },
    orderBy: { enteredAt: 'desc' },
  });

  // Determine next stage based on behavior
  const purchaseCount = await db.orderTracking.count({
    where: { customerHash, paymentStatus: 'completed' },
  });

  const lastPurchaseDate = await db.orderTracking.findFirst({
    where: { customerHash, paymentStatus: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const daysSinceLastPurchase =
    lastPurchaseDate && (Date.now() - lastPurchaseDate.createdAt.getTime()) / 86400000;

  // Lifecycle logic
  let nextStage = currentStage?.stage || 'prospect';

  if (purchaseCount === 0) {
    nextStage = 'prospect';
  } else if (purchaseCount === 1) {
    nextStage = 'customer';
  } else if (purchaseCount >= 3 && daysSinceLastPurchase < 90) {
    nextStage = 'loyal';
  } else if (daysSinceLastPurchase > 180) {
    nextStage = 'churned';
  } else if (daysSinceLastPurchase > 90 && daysSinceLastPurchase <= 180) {
    nextStage = 'at_risk';
  }

  // Update lifecycle if stage changed
  if (nextStage !== currentStage?.stage) {
    // Exit current stage
    if (currentStage) {
      await db.customerLifecycle.update({
        where: { id: currentStage.id },
        data: { exitedAt: new Date() },
      });
    }

    // Enter new stage
    await db.customerLifecycle.create({
      data: {
        customerHash,
        shopConfigId,
        stage: nextStage,
        enteredAt: new Date(),
        triggerEvent: 'purchase_activity_change',
        triggerData: JSON.stringify({
          purchaseCount,
          daysSinceLastPurchase,
        }),
      },
    });
  }

  return {
    customerHash,
    previousStage: currentStage?.stage,
    newStage: nextStage,
    stageChanged: nextStage !== currentStage?.stage,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getSubjectLine(segment: string): string {
  const lines: Record<string, string> = {
    vip: '🎁 Exclusive offer for our best customers',
    atRisk: 'We miss you - 20% off your next order',
    potential: 'Special rewards for you',
    new: 'Welcome! Here\'s 15% off',
  };
  return lines[segment] || 'Special offer';
}

function getEmailTemplate(segment: string): string {
  // Return email template based on segment
  return `email_template_${segment}`;
}

function getRemediationAction(errorMessage: string): string {
  if (errorMessage.includes('timeout')) {
    return 'Increase timeout limits or optimize database queries';
  }
  if (errorMessage.includes('connection')) {
    return 'Check database connection and restart service';
  }
  return 'Review logs and investigate root cause';
}

async function sendEmail(payload: any) {
  // Implement email sending logic
  console.log('Email sent:', payload);
}

async function sendRetentionEmail(payload: any) {
  // Implement email sending logic
  console.log('Retention email sent:', payload);
}

async function sendAlert(payload: any) {
  // Implement alert sending logic (Slack, PagerDuty, etc.)
  console.log('Alert sent:', payload);
}

// ============================================================================
// BONUS: SCHEDULED JOB SETUP
// ============================================================================

/**
 * Setup all scheduled jobs for analytics
 */
async function setupScheduledJobs(db: any) {
  const schedule = require('node-schedule');

  // Daily cohort analysis (1 AM)
  schedule.scheduleJob('0 1 * * *', async () => {
    console.log('Running daily cohort analysis...');
    const cohortService = new CohortAnalysisService(db);
    const shops = await db.shopConfig.findMany();

    for (const shop of shops) {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await cohortService.createOrUpdateCohort(
          shop.id,
          yesterday,
          `Cohort_${yesterday.toISOString().split('T')[0]}`
        );
      } catch (error) {
        console.error(`Cohort analysis failed for ${shop.id}:`, error);
      }
    }
  });

  // Daily RFM analysis (2 AM)
  schedule.scheduleJob('0 2 * * *', async () => {
    console.log('Running daily RFM analysis...');
    const rfmService = new RFMAnalysisService(db);
    const shops = await db.shopConfig.findMany();

    for (const shop of shops) {
      try {
        await rfmService.calculateRFMScores(shop.id);
      } catch (error) {
        console.error(`RFM analysis failed for ${shop.id}:`, error);
      }
    }
  });

  // Daily health log cleanup (3 AM)
  schedule.scheduleJob('0 3 * * *', async () => {
    console.log('Running health log cleanup...');
    const healthService = new HealthMonitoringService(db);
    const deleted = await healthService.cleanupOldLogs(30);
    console.log(`Deleted ${deleted} old health logs`);
  });

  // Hourly health check (every hour)
  schedule.scheduleJob('0 * * * *', async () => {
    const healthService = new HealthMonitoringService(db);
    const shops = await db.shopConfig.findMany();

    for (const shop of shops) {
      const health = await healthService.getSystemHealth(shop.name);
      const slowComponents = health.filter((h) => h.status !== 'success');

      if (slowComponents.length > 0) {
        await sendAlert({
          channel: 'devops',
          severity: 'warning',
          message: `${slowComponents.length} components have issues`,
          details: slowComponents,
        });
      }
    }
  });

  console.log('All scheduled jobs configured');
}

// Export all examples
export {
  emailMarketingExample,
  acquisitionQualityExample,
  churnPreventionExample,
  healthMonitoringExample,
  abTestingExample,
  gdprDeletionExample,
  lifecycleAutomationExample,
  setupScheduledJobs,
};
