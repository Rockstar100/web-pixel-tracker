-- CreateTable OrderTracking (Enhanced with payment type support)
CREATE TABLE "OrderTracking" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "lineItems" INTEGER NOT NULL,
    -- Payment type handling (online, cod, wallet, bank_transfer)
    "paymentType" TEXT NOT NULL DEFAULT 'online',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    -- Attribution and source tracking
    "attributionModel" TEXT,
    "firstTouchSource" TEXT,
    "lastTouchSource" TEXT,
    "sourceChannel" TEXT,
    -- Timestamps
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerEvent
CREATE TABLE "CustomerEvent" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "customerHash" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "pageUrl" TEXT,
    "pageTitle" TEXT,
    "pageReferrer" TEXT,
    "orderId" TEXT,
    "checkoutId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "itemsCount" INTEGER,
    "source" TEXT NOT NULL,
    "eventData" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forwardedToUmami" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerJourney
CREATE TABLE "CustomerJourney" (
    "id" TEXT NOT NULL,
    "shopConfigId" TEXT NOT NULL,
    "customerHash" TEXT NOT NULL,
    "firstEventAt" TIMESTAMP(3) NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "totalEvents" INTEGER NOT NULL,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "addToCartCount" INTEGER NOT NULL DEFAULT 0,
    "beginCheckoutCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "cancelCount" INTEGER NOT NULL DEFAULT 0,
    "totalOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalOrdersCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalOrdersCancelled" INTEGER NOT NULL DEFAULT 0,
    "totalOrdersRefunded" INTEGER NOT NULL DEFAULT 0,
    "firstTouchSource" TEXT,
    "firstTouchMedium" TEXT,
    "firstTouchCampaign" TEXT,
    "lastTouchSource" TEXT,
    "lastTouchMedium" TEXT,
    "lastTouchCampaign" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerJourney_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for OrderTracking
CREATE UNIQUE INDEX "OrderTracking_shopConfigId_shopifyOrderId_key" ON "OrderTracking"("shopConfigId", "shopifyOrderId");

CREATE UNIQUE INDEX "OrderTracking_shopifyOrderId_key" ON "OrderTracking"("shopifyOrderId");

CREATE INDEX "OrderTracking_customerHash_idx" ON "OrderTracking"("customerHash");

CREATE INDEX "OrderTracking_status_idx" ON "OrderTracking"("status");

CREATE INDEX "OrderTracking_financialStatus_idx" ON "OrderTracking"("financialStatus");

CREATE INDEX "OrderTracking_paymentType_idx" ON "OrderTracking"("paymentType");

CREATE INDEX "OrderTracking_paymentStatus_idx" ON "OrderTracking"("paymentStatus");

CREATE INDEX "OrderTracking_createdAt_idx" ON "OrderTracking"("createdAt");

CREATE INDEX "OrderTracking_sourceChannel_idx" ON "OrderTracking"("sourceChannel");

CREATE INDEX "OrderTracking_paymentType_status_idx" ON "OrderTracking"("paymentType", "paymentStatus");

-- CreateIndex
CREATE INDEX "CustomerEvent_customerHash_timestamp_idx" ON "CustomerEvent"("customerHash", "timestamp");

-- CreateIndex
CREATE INDEX "CustomerEvent_sessionId_timestamp_idx" ON "CustomerEvent"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "CustomerEvent_eventType_timestamp_idx" ON "CustomerEvent"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "CustomerEvent_orderId_idx" ON "CustomerEvent"("orderId");

-- CreateIndex
CREATE INDEX "CustomerEvent_source_idx" ON "CustomerEvent"("source");

-- CreateIndex
CREATE INDEX "CustomerEvent_timestamp_idx" ON "CustomerEvent"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerJourney_shopConfigId_customerHash_key" ON "CustomerJourney"("shopConfigId", "customerHash");

-- CreateIndex
CREATE INDEX "CustomerJourney_firstEventAt_idx" ON "CustomerJourney"("firstEventAt");

-- CreateIndex
CREATE INDEX "CustomerJourney_lastEventAt_idx" ON "CustomerJourney"("lastEventAt");

-- AddForeignKey
ALTER TABLE "OrderTracking" ADD CONSTRAINT "OrderTracking_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderTracking"("shopifyOrderId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerJourney" ADD CONSTRAINT "CustomerJourney_shopConfigId_fkey" FOREIGN KEY ("shopConfigId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
