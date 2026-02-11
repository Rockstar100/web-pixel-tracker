#!/usr/bin/env node

/**
 * Migration Validation Script
 * Verifies that the order tracking tables are properly created
 * Run after: npx prisma migrate deploy
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function validateMigration() {
  console.log('🔍 Validating Order Tracking Migration...\n');

  try {
    // Test 1: Check if tables exist by querying them
    console.log('✓ Testing OrderTracking table...');
    const orderCount = await prisma.orderTracking.count();
    console.log(`  - OrderTracking table exists (${orderCount} records)`);

    console.log('✓ Testing CustomerEvent table...');
    const eventCount = await prisma.customerEvent.count();
    console.log(`  - CustomerEvent table exists (${eventCount} records)`);

    console.log('✓ Testing CustomerJourney table...');
    const journeyCount = await prisma.customerJourney.count();
    console.log(`  - CustomerJourney table exists (${journeyCount} records)`);

    // Test 2: Verify relationships
    console.log('\n✓ Checking relationships...');
    const shopConfigs = await prisma.shopConfig.count();
    console.log(`  - Found ${shopConfigs} ShopConfig records`);

    // Test 3: Sample query - would fail if schema is wrong
    console.log('\n✓ Running sample queries...');
    
    const sampleOrder = await prisma.orderTracking.findFirst({
      include: {
        shopConfig: true,
        events: { take: 1 }
      }
    });

    if (sampleOrder) {
      console.log(`  - Sample order found: ${sampleOrder.shopifyOrderId}`);
      console.log(`    Status: ${sampleOrder.status}`);
      console.log(`    Events linked: ${sampleOrder.events.length}`);
    }

    // Test 4: Verify indexes exist (PostgreSQL specific)
    console.log('\n✓ Checking indexes...');
    const indexes = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes 
      WHERE tablename IN ('OrderTracking', 'CustomerEvent', 'CustomerJourney')
      ORDER BY indexname;
    `;
    console.log(`  - Found ${(indexes as any[]).length} indexes`);

    console.log('\n✅ Migration validation successful!');
    console.log('\nNext steps:');
    console.log('1. Register webhooks in Shopify:');
    console.log('   - orders/paid');
    console.log('   - orders/cancelled');
    console.log('   - orders/refund');
    console.log('2. Start receiving order events');
    console.log('3. Query customer journeys via /api/customer-journey');
    console.log('4. Monitor Umami for event tracking');

  } catch (error) {
    console.error('\n❌ Migration validation failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

validateMigration();
