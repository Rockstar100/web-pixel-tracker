-- Migration 0003: Add Industry Best Practices Tables
-- Adds comprehensive analytics, compliance, and attribution features

-- CreateTable MultiTouchAttribution
-- Tracks attribution across multiple conversion models (first, last, linear, time-decay, position-based)
CREATE TABLE "MultiTouchAttribution" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "model" TEXT NOT NULL, -- 'first', 'last', 'linear', 'time_decay', 'position_based'
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "attributedRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "touchCount" INTEGER NOT NULL DEFAULT 1,
    "conversionWindow" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultiTouchAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerEventAttribution
-- Links individual customer events to their attribution records
CREATE TABLE "CustomerEventAttribution" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "touchPosition" INTEGER, -- Position in the customer journey (1st, 2nd, last, etc.)
    "attributionWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEventAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerProfile
-- Enhanced customer data with attributes and segments
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "customerHash" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "zipCode" TEXT,
    "lastActivityDate" TIMESTAMP(3),
    "totalOrderCount" INTEGER NOT NULL DEFAULT 0,
    "totalOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstOrderDate" TIMESTAMP(3),
    "lastOrderDate" TIMESTAMP(3),
    "repeatCustomer" BOOLEAN NOT NULL DEFAULT false,
    "lifetime_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable DataRetentionPolicy
-- GDPR/CCPA compliance and automated data lifecycle management
CREATE TABLE "DataRetentionPolicy" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "dataType" TEXT NOT NULL, -- 'events', 'personal_data', 'payment_data', 'logs', 'deleted_data'
    "retentionDays" INTEGER NOT NULL,
    "deleteAfterDays" INTEGER,
    "anonymizeAfterDays" INTEGER,
    "policy" TEXT, -- JSON with detailed policy
    "gdprCompliant" BOOLEAN NOT NULL DEFAULT true,
    "ccpaCompliant" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerSegment
-- Behavioral segmentation (RFM, predictive, cohort-based)
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "segmentType" TEXT NOT NULL, -- 'manual', 'rfm', 'behavioral', 'predictive', 'cohort'
    "criteria" TEXT NOT NULL, -- JSON with segment criteria
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable CohortAnalysis
-- Track user groups by acquisition period and their behavior
CREATE TABLE "CohortAnalysis" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "cohortDate" TIMESTAMP(3) NOT NULL,
    "cohortSize" INTEGER NOT NULL DEFAULT 0,
    "cohortName" TEXT NOT NULL,
    "day0Retention" INTEGER NOT NULL DEFAULT 0,
    "day1Retention" INTEGER NOT NULL DEFAULT 0,
    "day7Retention" INTEGER NOT NULL DEFAULT 0,
    "day30Retention" INTEGER NOT NULL DEFAULT 0,
    "day90Retention" INTEGER NOT NULL DEFAULT 0,
    "day0Revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "day7Revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "day30Revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "day90Revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "churnRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "repeatPurchaseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerLifecycle
-- Track customer journey through lifecycle stages
CREATE TABLE "CustomerLifecycle" (
    "id" TEXT NOT NULL,
    "customerHash" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "stage" TEXT NOT NULL, -- 'prospect', 'customer', 'loyal', 'at_risk', 'churned', 'reactivated'
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "daysInStage" INTEGER NOT NULL DEFAULT 0,
    "triggerEvent" TEXT,
    "triggerData" TEXT, -- JSON with trigger context
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventSchema
-- Event payload versioning and schema evolution tracking
CREATE TABLE "EventSchema" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schema" TEXT NOT NULL, -- JSON Schema for validation
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deprecatedAt" TIMESTAMP(3),

    CONSTRAINT "EventSchema_pkey" PRIMARY KEY ("id")
);

-- CreateTable Experiment
-- A/B testing framework and experiment management
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL, -- 'draft', 'running', 'paused', 'completed'
    "controlGroup" TEXT NOT NULL,
    "treatmentGroup" TEXT NOT NULL,
    "trafficPercentage" INTEGER NOT NULL DEFAULT 50,
    "primaryMetric" TEXT NOT NULL,
    "secondaryMetrics" TEXT, -- JSON array
    "controlConversions" INTEGER NOT NULL DEFAULT 0,
    "treatmentConversions" INTEGER NOT NULL DEFAULT 0,
    "statisticalSignificance" DOUBLE PRECISION,
    "winnerVariant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable FunnelDefinition
-- Multi-step user journey tracking and conversion analysis
CREATE TABLE "FunnelDefinition" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL, -- JSON array of FunnelStep objects
    "conversionWindow" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventReplay
-- Complete audit trail and event correction history
CREATE TABLE "EventReplay" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "originalEventId" TEXT NOT NULL,
    "customerHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT NOT NULL, -- JSON with full event payload
    "replayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayReason" TEXT NOT NULL, -- 'duplicate_fix', 'data_correction', 'testing', 'audit'
    "replayedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable HealthLog
-- Real-time system health and component status monitoring
CREATE TABLE "HealthLog" (
    "id" TEXT NOT NULL,
    "shopifyShop" TEXT NOT NULL,
    "component" TEXT NOT NULL, -- 'pixel', 'webhook', 'umami_forward', 'attribution', 'cohort', 'export', 'cleanup', 'database'
    "status" TEXT NOT NULL, -- 'success', 'error', 'warning'
    "message" TEXT NOT NULL,
    "details" TEXT, -- JSON with error/warning details
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for MultiTouchAttribution
CREATE INDEX "MultiTouchAttribution_orderId_idx" ON "MultiTouchAttribution"("orderId");

CREATE INDEX "MultiTouchAttribution_model_idx" ON "MultiTouchAttribution"("model");

CREATE INDEX "MultiTouchAttribution_source_idx" ON "MultiTouchAttribution"("source");

CREATE INDEX "MultiTouchAttribution_createdAt_idx" ON "MultiTouchAttribution"("createdAt");

-- CreateIndex for CustomerEventAttribution
CREATE INDEX "CustomerEventAttribution_eventId_idx" ON "CustomerEventAttribution"("eventId");

CREATE INDEX "CustomerEventAttribution_attributionId_idx" ON "CustomerEventAttribution"("attributionId");

-- CreateIndex for CustomerProfile
CREATE UNIQUE INDEX "CustomerProfile_shopConfigId_customerHash_key" ON "CustomerProfile"("shopConfigId", "customerHash");

CREATE INDEX "CustomerProfile_email_idx" ON "CustomerProfile"("email");

CREATE INDEX "CustomerProfile_totalOrderValue_idx" ON "CustomerProfile"("totalOrderValue");

-- CreateIndex for DataRetentionPolicy
CREATE UNIQUE INDEX "DataRetentionPolicy_shopConfigId_dataType_key" ON "DataRetentionPolicy"("shopConfigId", "dataType");

CREATE INDEX "DataRetentionPolicy_dataType_idx" ON "DataRetentionPolicy"("dataType");

-- CreateIndex for CustomerSegment
CREATE INDEX "CustomerSegment_segmentType_idx" ON "CustomerSegment"("segmentType");

CREATE UNIQUE INDEX "CustomerSegment_shopConfigId_name_key" ON "CustomerSegment"("shopConfigId", "name");

-- CreateIndex for CohortAnalysis
CREATE INDEX "CohortAnalysis_cohortDate_idx" ON "CohortAnalysis"("cohortDate");

CREATE INDEX "CohortAnalysis_shopConfigId_idx" ON "CohortAnalysis"("shopConfigId");

-- CreateIndex for CustomerLifecycle
CREATE INDEX "CustomerLifecycle_customerHash_stage_idx" ON "CustomerLifecycle"("customerHash", "stage");

CREATE INDEX "CustomerLifecycle_stage_enteredAt_idx" ON "CustomerLifecycle"("stage", "enteredAt");

CREATE INDEX "CustomerLifecycle_shopConfigId_idx" ON "CustomerLifecycle"("shopConfigId");

-- CreateIndex for EventSchema
CREATE UNIQUE INDEX "EventSchema_eventType_version_key" ON "EventSchema"("eventType", "version");

CREATE INDEX "EventSchema_deprecatedAt_idx" ON "EventSchema"("deprecatedAt");

-- CreateIndex for Experiment
CREATE INDEX "Experiment_status_startDate_idx" ON "Experiment"("status", "startDate");

-- CreateIndex for FunnelDefinition
CREATE UNIQUE INDEX "FunnelDefinition_shopConfigId_name_key" ON "FunnelDefinition"("shopConfigId", "name");

-- CreateIndex for EventReplay
CREATE INDEX "EventReplay_customerHash_replayedAt_idx" ON "EventReplay"("customerHash", "replayedAt");

CREATE INDEX "EventReplay_originalEventId_idx" ON "EventReplay"("originalEventId");

-- CreateIndex for HealthLog
CREATE INDEX "HealthLog_shopifyShop_timestamp_idx" ON "HealthLog"("shopifyShop", "timestamp");

CREATE INDEX "HealthLog_component_status_idx" ON "HealthLog"("component", "status");

-- AddForeignKey for MultiTouchAttribution
ALTER TABLE "MultiTouchAttribution" ADD CONSTRAINT "MultiTouchAttribution_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MultiTouchAttribution" ADD CONSTRAINT "MultiTouchAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderTracking"("shopifyOrderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for CustomerEventAttribution
ALTER TABLE "CustomerEventAttribution" ADD CONSTRAINT "CustomerEventAttribution_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerEventAttribution" ADD CONSTRAINT "CustomerEventAttribution_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "MultiTouchAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for CustomerProfile
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for DataRetentionPolicy
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for CustomerSegment
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for CohortAnalysis
ALTER TABLE "CohortAnalysis" ADD CONSTRAINT "CohortAnalysis_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for CustomerLifecycle
ALTER TABLE "CustomerLifecycle" ADD CONSTRAINT "CustomerLifecycle_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for Experiment
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for FunnelDefinition
ALTER TABLE "FunnelDefinition" ADD CONSTRAINT "FunnelDefinition_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for EventReplay
ALTER TABLE "EventReplay" ADD CONSTRAINT "EventReplay_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
