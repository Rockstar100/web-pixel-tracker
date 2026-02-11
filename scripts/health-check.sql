-- Comprehensive System Health Check
-- Run this to verify all database components

-- 1. Check all tables exist
SELECT 
    schemaname,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- 2. Check OrderTracking columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'OrderTracking'
ORDER BY ordinal_position;

-- 3. Check all indexes
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename IN ('OrderTracking', 'CustomerEvent', 'CustomerJourney', 
                  'MultiTouchAttribution', 'CustomerSegment', 'CohortAnalysis')
ORDER BY tablename, indexname;

-- 4. Check foreign key relationships
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema='public'
ORDER BY tc.table_name;

-- 5. Check migration history
SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 10;

-- 6. Quick data count
SELECT 
    'OrderTracking' as table_name, COUNT(*) as record_count FROM "OrderTracking"
UNION ALL
SELECT 'CustomerEvent', COUNT(*) FROM "CustomerEvent"
UNION ALL
SELECT 'CustomerJourney', COUNT(*) FROM "CustomerJourney"
UNION ALL
SELECT 'MultiTouchAttribution', COUNT(*) FROM "MultiTouchAttribution"
UNION ALL
SELECT 'CustomerSegment', COUNT(*) FROM "CustomerSegment"
UNION ALL
SELECT 'CohortAnalysis', COUNT(*) FROM "CohortAnalysis"
UNION ALL
SELECT 'ShopConfig', COUNT(*) FROM "ShopConfig";
