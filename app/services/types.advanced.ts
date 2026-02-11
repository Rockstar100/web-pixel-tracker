/**
 * Types for Industry Best Practices Tables
 * Supports advanced analytics, compliance, and attribution
 */

// Data Retention Policy Types
export interface DataRetentionPolicy {
  id: string;
  shopConfigId: string;
  dataType: 'events' | 'personal_data' | 'payment_data' | 'logs' | 'deleted_data';
  retentionDays: number;
  deleteAfterDays?: number;
  anonymizeAfterDays?: number;
  policy?: string; // JSON
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Customer Segment Types
export type SegmentType = 'manual' | 'rfm' | 'behavioral' | 'predictive' | 'cohort';

export interface CustomerSegment {
  id: string;
  shopConfigId: string;
  name: string;
  description?: string;
  segmentType: SegmentType;
  criteria: string; // JSON
  totalCount: number;
  lastUpdatedAt: Date;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

// RFM Segment Criteria
export interface RFMCriteria {
  minRecencyDays?: number;
  maxRecencyDays?: number;
  minFrequency?: number;
  maxFrequency?: number;
  minMonetary?: number;
  maxMonetary?: number;
  rScoreMin?: number;
  rScoreMax?: number;
  fScoreMin?: number;
  fScoreMax?: number;
  mScoreMin?: number;
  mScoreMax?: number;
}

// Predefined RFM Segments
export const RFM_SEGMENTS = {
  VIP: { r: 5, f: 5, m: 5, name: 'VIP Customers' },
  LOYAL: { r: 4, f: 4, m: 4, name: 'Loyal Customers' },
  POTENTIAL: { r: 5, f: 3, m: 3, name: 'Potential High Value' },
  NEW: { r: 5, f: 1, m: 2, name: 'New Customers' },
  AT_RISK: { r: 1, f: 2, m: 3, name: 'At Risk' },
  CHURNED: { r: 1, f: 1, m: 1, name: 'Churned' },
  LOST: { r: 1, f: 1, m: 2, name: 'Lost High Value' },
};

// Cohort Analysis Types
export interface CohortAnalysis {
  id: string;
  shopConfigId: string;
  cohortDate: Date;
  cohortSize: number;
  cohortName: string;
  
  // Retention metrics
  day0Retention: number;
  day1Retention: number;
  day7Retention: number;
  day30Retention: number;
  day90Retention: number;
  
  // Revenue metrics
  day0Revenue: number;
  day7Revenue: number;
  day30Revenue: number;
  day90Revenue: number;
  
  // Churn & repeat
  churnRate: number;
  repeatPurchaseRate: number;
  
  createdAt: Date;
  updatedAt: Date;
}

// Cohort Retention Matrix
export interface CohortMatrix {
  cohortName: string;
  cohortDate: Date;
  cohortSize: number;
  retention: {
    day0: number;
    day1: number;
    day7: number;
    day30: number;
    day90: number;
  };
  revenue: {
    day0: number;
    day7: number;
    day30: number;
    day90: number;
  };
  metrics: {
    churnRate: number;
    repeatPurchaseRate: number;
    ltv: number;
  };
}

// Customer Lifecycle Stages
export type LifecycleStage = 'prospect' | 'customer' | 'loyal' | 'at_risk' | 'churned' | 'reactivated';

export interface CustomerLifecycle {
  id: string;
  customerHash: string;
  shopConfigId: string;
  stage: LifecycleStage;
  enteredAt: Date;
  exitedAt?: Date;
  daysInStage: number;
  triggerEvent?: string;
  triggerData?: string; // JSON
  createdAt: Date;
}

// Lifecycle Transition Rule
export interface LifecycleRule {
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  triggerEvent: string;
  triggerConditions?: Record<string, unknown>;
  autoTransition: boolean;
}

// Event Schema Types
export interface EventSchema {
  id: string;
  eventType: string;
  version: string;
  schema: string; // JSON Schema
  description?: string;
  createdAt: Date;
  deprecatedAt?: Date;
}

// Standard Event Schemas
export const EVENT_SCHEMAS = {
  page_view: {
    v1: {
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        referrer: { type: 'string' },
      },
      required: ['url'],
    },
  },
  purchase: {
    v1: {
      properties: {
        value: { type: 'number' },
        currency: { type: 'string' },
        items: { type: 'array' },
        orderId: { type: 'string' },
      },
      required: ['value', 'currency', 'items'],
    },
  },
  add_to_cart: {
    v1: {
      properties: {
        productId: { type: 'string' },
        value: { type: 'number' },
        quantity: { type: 'number' },
      },
      required: ['productId', 'value'],
    },
  },
};

// A/B Testing Types
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface Experiment {
  id: string;
  shopConfigId: string;
  name: string;
  description?: string;
  
  startDate: Date;
  endDate?: Date;
  status: ExperimentStatus;
  
  controlGroup: string;
  treatmentGroup: string;
  
  trafficPercentage: number;
  
  primaryMetric: string;
  secondaryMetrics?: string; // JSON array
  
  controlConversions: number;
  treatmentConversions: number;
  statisticalSignificance?: number;
  winnerVariant?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// Experiment Result
export interface ExperimentResult {
  experimentId: string;
  controlRate: number;
  treatmentRate: number;
  improvement: number; // percentage
  isStatisticallySignificant: boolean;
  confidenceLevel: number; // 95, 99, etc.
  sampleSize: number;
  recommendation: 'implement' | 'keep_testing' | 'reject';
}

// Funnel Definition Types
export interface FunnelStep {
  step: number;
  eventType: 'page_view' | 'event' | 'purchase';
  name: string;
  eventName?: string;
  url?: string;
  duration?: number; // in seconds
}

export interface FunnelDefinition {
  id: string;
  shopConfigId: string;
  name: string;
  description?: string;
  steps: FunnelStep[];
  conversionWindow: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Funnel Analysis Result
export interface FunnelAnalysis {
  funnelName: string;
  steps: Array<{
    step: number;
    name: string;
    users: number;
    conversions: number;
    conversionRate: number;
    dropoffFromPrevious: number;
  }>;
  totalEntrants: number;
  totalConverters: number;
  conversionRate: number;
  averageDaysToConvert: number;
  timeRange: {
    from: Date;
    to: Date;
  };
}

// Predefined Funnels
export const PREDEFINED_FUNNELS: Record<string, FunnelDefinition> = {
  purchase_funnel: {
    id: 'purchase_funnel',
    shopConfigId: '',
    name: 'Purchase Funnel',
    description: 'Standard e-commerce purchase funnel',
    steps: [
      { step: 1, eventType: 'page_view', name: 'Landing Page', url: '/' },
      { step: 2, eventType: 'page_view', name: 'Product Browse', url: '/products' },
      { step: 3, eventType: 'event', name: 'Add to Cart', eventName: 'add_to_cart' },
      { step: 4, eventType: 'page_view', name: 'Checkout', url: '/checkout' },
      { step: 5, eventType: 'purchase', name: 'Order Placed', eventName: 'purchase' },
    ],
    conversionWindow: 30,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  onboarding_funnel: {
    id: 'onboarding_funnel',
    shopConfigId: '',
    name: 'Onboarding Funnel',
    description: 'New customer onboarding flow',
    steps: [
      { step: 1, eventType: 'event', name: 'Sign Up', eventName: 'sign_up' },
      { step: 2, eventType: 'event', name: 'First Event', eventName: 'first_interaction' },
      { step: 3, eventType: 'event', name: 'Complete Profile', eventName: 'profile_complete' },
      { step: 4, eventType: 'purchase', name: 'First Purchase', eventName: 'purchase' },
    ],
    conversionWindow: 30,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

// Event Replay Types
export type ReplayReason = 'duplicate_fix' | 'data_correction' | 'testing' | 'audit';

export interface EventReplay {
  id: string;
  shopConfigId: string;
  originalEventId: string;
  customerHash: string;
  eventType: string;
  eventData: string; // JSON
  replayedAt: Date;
  replayReason: ReplayReason;
  replayedBy?: string;
  createdAt: Date;
}

// Health Log Types
export type ComponentType = 'pixel' | 'webhook' | 'umami_forward' | 'attribution' | 'cohort' | 'export' | 'cleanup' | 'database';
export type HealthStatus = 'success' | 'error' | 'warning';

export interface HealthLog {
  id: string;
  shopifyShop: string;
  component: ComponentType;
  status: HealthStatus;
  message: string;
  details?: string; // JSON
  timestamp: Date;
}

// Health Check Result
export interface HealthCheckResult {
  component: ComponentType;
  status: HealthStatus;
  message: string;
  lastCheck: Date;
  successRate: number; // percentage
  errorCount: number;
  recommendation?: string;
}

// Analytics Dashboard Types
export interface DashboardMetrics {
  cohorts: CohortMatrix[];
  segments: {
    name: string;
    count: number;
    percentage: number;
  }[];
  lifecycle: {
    stage: LifecycleStage;
    count: number;
    avgDaysInStage: number;
  }[];
  attribution: {
    model: string;
    topChannels: { name: string; revenue: number }[];
  };
  experiments: ExperimentResult[];
  funnels: FunnelAnalysis[];
  health: HealthCheckResult[];
}

// RFM Calculation Types
export interface RFMScore {
  customerHash: string;
  recency: number; // days since last purchase
  frequency: number; // purchase count
  monetary: number; // total spend
  rScore: number; // 1-5
  fScore: number; // 1-5
  mScore: number; // 1-5
  rfmSegment: string;
  customerLTV: number;
}

// Churn Prediction Types
export interface ChurnPrediction {
  customerHash: string;
  churnRisk: number; // 0-1 probability
  riskLevel: 'low' | 'medium' | 'high';
  daysUntilChurn: number;
  reason: string; // Main reason for churn risk
  recommendations: string[];
}

// Customer LTV Prediction
export interface LTVPrediction {
  customerHash: string;
  predictedLTV: number;
  confidence: number; // 0-1
  timeHorizon: number; // months
  growthTrend: 'increasing' | 'stable' | 'decreasing';
  recommendations: string[];
}
