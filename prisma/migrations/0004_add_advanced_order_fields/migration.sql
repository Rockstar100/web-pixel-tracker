-- Add advanced order tracking fields to OrderTracking table

-- Add payment fields
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT DEFAULT 'online_payment';
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "paymentGateway" TEXT;
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION DEFAULT 0;

-- Add risk assessment fields
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT DEFAULT 'low';
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "riskSignals" TEXT;

-- Add timeline fields
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

-- Add analytics flags
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "isReturningCustomer" BOOLEAN DEFAULT false;
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "firstTimeCustomer" BOOLEAN DEFAULT false;
ALTER TABLE "OrderTracking" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN DEFAULT false;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS "OrderTracking_paymentMethod_idx" ON "OrderTracking"("paymentMethod");
CREATE INDEX IF NOT EXISTS "OrderTracking_riskLevel_idx" ON "OrderTracking"("riskLevel");
CREATE INDEX IF NOT EXISTS "OrderTracking_status_paymentMethod_idx" ON "OrderTracking"("status", "paymentMethod");
CREATE INDEX IF NOT EXISTS "OrderTracking_createdAt_paymentMethod_idx" ON "OrderTracking"("createdAt", "paymentMethod");
