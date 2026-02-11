# Razorpay Magic Checkout - Setup & Verification Guide

## Overview
This guide explains how to configure Seleric Tracker for stores using **Razorpay Magic Checkout**, where checkout happens outside of Shopify's standard checkout flow.

---

## Why This Matters

### The Razorpay Challenge
When customers use Razorpay Magic Checkout:
1. They're redirected to Razorpay's interface
2. Shopify's client-side events (`checkout_started`, `checkout_completed`) may not fire
3. Standard client-side tracking becomes incomplete

### The Solution
Seleric Tracker uses **server-side webhooks** to capture conversions regardless of where checkout happens:
- **Client-side**: Tracks browsing, product views, cart actions
- **Server-side**: Tracks orders, payments, cancellations via Shopify webhooks
- **Unified**: Both sources feed into the same analytics pipeline

---

## Setup Steps

### 1. Ensure Webhooks Are Configured

#### In Shopify Admin
Navigate to: **Settings → Notifications → Webhooks**

Verify these webhooks are registered and pointing to your app:

| Event | Endpoint | Required |
|-------|----------|----------|
| Orders creation | `https://your-app.com/webhooks/orders/create` | ✅ Recommended |
| Orders payment | `https://your-app.com/webhooks/orders/paid` | ✅ **CRITICAL** |
| Orders cancelled | `https://your-app.com/webhooks/orders/cancelled` | ✅ Recommended |
| Orders refunded | `https://your-app.com/webhooks/orders/refund` | ✅ Recommended |
| Customers creation | `https://your-app.com/webhooks/customers/create` | ⚠️ Optional |

**Critical:** The `orders/paid` webhook is your **primary conversion tracking** for Razorpay.

#### In Your App Code
Webhooks are already implemented in:
- [app/routes/webhooks/orders.create.ts](app/routes/webhooks/orders.create.ts)
- [app/routes/webhooks/orders.paid.ts](app/routes/webhooks/orders.paid.ts) ← **Main one**
- [app/routes/webhooks/orders.cancelled.ts](app/routes/webhooks/orders.cancelled.ts)
- [app/routes/webhooks/orders.refund.ts](app/routes/webhooks/orders.refund.ts)

### 2. Enable Webhook Tracking in Shop Config

For each shop using your app, ensure `webhookEnabled = true`:

```typescript
// In your database (ShopConfig table)
await prisma.shopConfig.update({
  where: { shopifyShop: 'your-store.myshopify.com' },
  data: {
    webhookEnabled: true,  // ← Must be enabled
    pixelEnabled: true      // Also enable pixel for client-side tracking
  }
});
```

**Default Settings:**
- `webhookEnabled`: Should be `true` for all shops
- `pixelEnabled`: Should be `true` for all shops
- Both work together for complete tracking

### 3. Configure Web Pixel Extension

The Web Pixel captures client-side events before Razorpay redirect:

**Settings in Shopify Admin:**
```typescript
{
  "serverEndpoint": "https://your-app.com/api/ingest/pixel",
  "enableDebug": "false"  // Set to "true" for development
}
```

**What Gets Tracked Client-Side:**
- ✅ Page views (with UTM params)
- ✅ Product views
- ✅ Add to cart
- ✅ Remove from cart
- ✅ Cart view
- ⚠️ Checkout started (may be missed with Razorpay)
- ❌ Payment info (not tracked - happens in Razorpay)
- ❌ Checkout completed (not tracked - handled by webhook)

### 4. Test the Integration

#### Test Flow 1: Normal Shopify Checkout (Baseline)

1. **Add product to cart**
   - Expected: `product_added_to_cart` event (client-side)
   
2. **Go to checkout**
   - Expected: `checkout_started` event (client-side)
   
3. **Complete payment**
   - Expected: 
     - `checkout_completed` event (client-side)
     - `orders/paid` webhook (server-side)
     - **Deduplication**: Only one `purchase` event recorded

#### Test Flow 2: Razorpay Magic Checkout (Your Use Case)

1. **Add product to cart**
   - Expected: ✅ `product_added_to_cart` event (client-side)
   - Verify in: `CustomerEvent` table, `eventType = 'add_to_cart'`
   
2. **Click checkout (redirect to Razorpay)**
   - Expected: ⚠️ `checkout_started` may or may not fire
   - Not critical - webhook will capture the order
   
3. **Complete payment in Razorpay**
   - Expected: ❌ No client-side events (customer is on Razorpay)
   
4. **Razorpay notifies Shopify → Shopify triggers webhook**
   - Expected: ✅ `orders/paid` webhook (server-side)
   - Verify in: `CustomerEvent` table, `eventType = 'purchase'`, `source = 'webhook'`

#### Verification Queries

**Check recent events:**
```sql
SELECT 
  eventType, 
  source, 
  customerHash, 
  orderId, 
  value, 
  timestamp
FROM "CustomerEvent"
WHERE shopConfigId = 'YOUR_SHOP_CONFIG_ID'
ORDER BY timestamp DESC
LIMIT 20;
```

**Check conversion tracking:**
```sql
-- Should see exactly 1 purchase per order
SELECT 
  orderId,
  COUNT(*) as event_count,
  MAX(source) as source
FROM "CustomerEvent"
WHERE eventType = 'purchase'
GROUP BY orderId
HAVING COUNT(*) > 1;  -- Should return 0 rows (no duplicates)
```

**Check attribution linkage:**
```sql
-- Verify UTM params are linked to orders
SELECT 
  ce.orderId,
  ce.eventType,
  ce.timestamp,
  a.utmSource,
  a.utmMedium,
  a.utmCampaign
FROM "CustomerEvent" ce
LEFT JOIN "Attribution" a ON ce.customerHash = a.customerHash AND ce.orderId = a.orderId
WHERE ce.orderId = 'YOUR_ORDER_ID';
```

**Check for missed webhooks:**
```sql
-- Orders in Shopify but not in CustomerEvent
-- (Run this query against your Shopify data and compare)
SELECT COUNT(*) 
FROM orders 
WHERE financial_status = 'paid' 
  AND created_at > NOW() - INTERVAL '7 days'
  AND id NOT IN (
    SELECT DISTINCT orderId 
    FROM "CustomerEvent" 
    WHERE eventType = 'purchase'
  );
```

---

## Troubleshooting

### Problem: Conversions Not Being Tracked

**Symptoms:**
- Orders exist in Shopify
- No `purchase` events in `CustomerEvent` table

**Possible Causes:**

1. **Webhook not configured in Shopify**
   - Check: Settings → Notifications → Webhooks
   - Fix: Add `orders/paid` webhook pointing to your app

2. **Webhook disabled in ShopConfig**
   - Check: `shopConfig.webhookEnabled` in database
   - Fix: Set to `true`

3. **Webhook URL incorrect**
   - Check: Webhook endpoint format
   - Should be: `https://your-app.com/webhooks/orders/paid`
   - NOT: `https://your-app.com/api/webhooks/orders/paid`

4. **App not installed on shop**
   - Check: Shop has authorized your app
   - Fix: Reinstall app if needed

### Problem: Duplicate Conversions

**Symptoms:**
- Same order has 2+ `purchase` events

**Possible Causes:**

1. **Deduplication not working**
   - Check: `DeduplicationStore` table
   - Should have entries for each event
   - Check: Event key generation logic

2. **Webhook retries**
   - Shopify retries failed webhooks
   - Check: Your webhook returns `200 OK` on success
   - Check: Error logs for webhook failures

3. **Both client + webhook tracked**
   - This is expected behavior
   - Deduplication should handle it
   - Check: `isDuplicate` flag in deduplication result

**Debug Query:**
```sql
SELECT 
  eventKey,
  eventType,
  source,
  isDuplicate,
  timestamp
FROM "DeduplicationStore"
WHERE eventData LIKE '%ORDER_ID%'
ORDER BY timestamp;
```

### Problem: Attribution Lost

**Symptoms:**
- Conversion tracked
- UTM params missing

**Possible Causes:**

1. **Customer arrived without UTM params**
   - Normal for direct/organic traffic
   - Attribution will be `null`

2. **Attribution not captured on first visit**
   - Should be captured on `page_view` with UTM
   - Check: `Attribution` table has entry for customer

3. **Session expired**
   - Session ID cookie expired before conversion
   - Check: Cookie settings and expiry

**Debug Query:**
```sql
-- Check attribution flow
SELECT 
  timestamp,
  eventType,
  utmSource,
  utmCampaign,
  sessionId
FROM "CustomerEvent"
WHERE customerHash = 'CUSTOMER_HASH'
ORDER BY timestamp;
```

### Problem: Razorpay Orders Not Converting

**Symptoms:**
- Order shows as "pending" or "authorized"
- No `orders/paid` webhook fired

**Possible Causes:**

1. **Payment not fully settled**
   - Razorpay may authorize but not capture immediately
   - Check: Shopify order `financial_status`
   - Webhook fires when status = "paid"

2. **Razorpay webhook to Shopify not working**
   - This is between Razorpay and Shopify
   - Check: Razorpay webhook settings
   - Should notify Shopify when payment succeeds

3. **Order created but payment failed**
   - Order exists but never paid
   - Check: Shopify order status

**Resolution:**
- Ensure Razorpay → Shopify webhook is configured
- Test payment flow end-to-end
- Check Razorpay dashboard for webhook delivery logs

---

## Monitoring & Alerts

### Health Check Queries

**Daily webhook health:**
```sql
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as webhook_count,
  COUNT(DISTINCT shopConfigId) as shops_active
FROM "HealthLog"
WHERE component = 'webhook'
  AND status = 'success'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

**Failed webhooks:**
```sql
SELECT 
  shopifyShop,
  message,
  details,
  timestamp
FROM "HealthLog"
WHERE component = 'webhook'
  AND status = 'error'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

**Conversion rate by source:**
```sql
SELECT 
  source,
  COUNT(*) as total_events,
  COUNT(DISTINCT orderId) as unique_orders
FROM "CustomerEvent"
WHERE eventType = 'purchase'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY source;
```

### Setting Up Alerts

**Alert 1: No webhooks in 1 hour**
```sql
-- If this returns > 0, webhook system may be down
SELECT COUNT(*) 
FROM "HealthLog"
WHERE component = 'webhook'
  AND timestamp < NOW() - INTERVAL '1 hour';
```

**Alert 2: High webhook failure rate**
```sql
-- If failure rate > 10%, investigate
SELECT 
  COUNT(CASE WHEN status = 'error' THEN 1 END)::float / COUNT(*) as failure_rate
FROM "HealthLog"
WHERE component = 'webhook'
  AND timestamp > NOW() - INTERVAL '1 hour';
```

---

## Best Practices

### 1. Always Enable Both Tracking Methods

```typescript
await prisma.shopConfig.update({
  where: { shopifyShop: shop },
  data: {
    pixelEnabled: true,    // Client-side tracking
    webhookEnabled: true   // Server-side tracking (Razorpay-safe)
  }
});
```

**Why both?**
- Pixel tracks early funnel (browsing, cart)
- Webhooks track conversions (payment completed)
- Together they give complete picture

### 2. Test Payment Flow Regularly

Create test orders monthly to verify:
- [ ] Razorpay payment flow works
- [ ] Shopify receives payment confirmation
- [ ] `orders/paid` webhook fires
- [ ] Event appears in `CustomerEvent`
- [ ] Attribution is preserved

### 3. Monitor Webhook Delivery

Set up daily/weekly checks:
- [ ] Webhook delivery success rate
- [ ] Average webhook processing time
- [ ] Failed webhooks (investigate immediately)

### 4. Keep Customer Privacy in Mind

Your implementation already has:
- ✅ Email hashing (PII protection)
- ✅ Consent mode support
- ✅ GDPR-compliant data handling

**For Razorpay:**
- Don't capture payment card details
- Only track order ID and amount
- Hash customer identifiers

---

## FAQ

**Q: Do I need to configure anything in Razorpay?**
A: No. Razorpay handles payment and notifies Shopify. Shopify then triggers the `orders/paid` webhook to your app. Your app doesn't need direct Razorpay integration.

**Q: What if a customer abandons cart in Razorpay?**
A: No `orders/paid` webhook fires. The cart abandonment is visible in your analytics via the `add_to_cart` event without a corresponding `purchase`.

**Q: Can I track which orders came through Razorpay vs. Shopify checkout?**
A: Not directly in the webhook. Both use `orders/paid`. You could add custom order tags in Shopify or check payment gateway in webhook payload.

**Q: What if webhooks are delayed?**
A: Shopify retries webhooks for up to 48 hours. Your app's deduplication handles multiple deliveries. The conversion will be tracked when the webhook succeeds.

**Q: How do I test without making real purchases?**
A: Use Shopify's test orders:
1. Enable "Accept test orders" in Razorpay test mode
2. Create test order in Shopify
3. Use Razorpay test card numbers
4. Verify webhook fires

**Q: What happens to attribution if customer takes multiple sessions to convert?**
A: 
- First touch: Captured on initial visit with UTM
- Last touch: Updated on return visit with UTM
- Conversion: Links to both first and last touch attribution
- All tracked in `Attribution` table

---

## Summary Checklist

Before going live with Razorpay:

- [ ] `orders/paid` webhook configured in Shopify Admin
- [ ] Webhook URL points to your app correctly
- [ ] `webhookEnabled = true` in ShopConfig
- [ ] `pixelEnabled = true` in ShopConfig  
- [ ] Web Pixel extension installed and configured
- [ ] Test order completed through Razorpay
- [ ] Conversion appears in `CustomerEvent` table
- [ ] Attribution preserved from earlier session
- [ ] Deduplication working (no duplicate conversions)
- [ ] Health monitoring queries set up
- [ ] Alerts configured for webhook failures

---

## Support

If conversions are not being tracked:
1. Check [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md) for system overview
2. Run verification queries above
3. Check `HealthLog` table for errors
4. Verify Shopify webhook configuration
5. Test with a real order in test mode

Your implementation is production-ready for Razorpay Magic Checkout! 🎉
