# Quick Reference: Razorpay Magic Checkout

## TL;DR

✅ **Your app already supports Razorpay Magic Checkout!**

The `orders/paid` webhook captures all conversions, regardless of where checkout happens.

---

## What Happens with Razorpay

| Stage | Tracked? | How? |
|-------|----------|------|
| Browse store | ✅ Yes | Web Pixel (client-side) |
| View product | ✅ Yes | Web Pixel (client-side) |
| Add to cart | ✅ Yes | Web Pixel (client-side) |
| Go to Razorpay | ⚠️ Maybe | May lose tracking |
| Pay in Razorpay | ❌ No | External payment flow |
| **Order completed** | **✅ YES** | **`orders/paid` webhook** |

**Bottom line:** Conversions are **always tracked** via webhook.

---

## Required Setup

1. **Enable webhooks in Shopify Admin:**
   ```
   Settings → Notifications → Webhooks
   
   Add: orders/paid → https://your-app.com/webhooks/orders/paid
   ```

2. **Enable webhook tracking in database:**
   ```typescript
   shopConfig.webhookEnabled = true
   ```

3. **That's it!** ✅

---

## Key Files

| File | Purpose |
|------|---------|
| [app/routes/webhooks/orders.paid.ts](app/routes/webhooks/orders.paid.ts) | **Main conversion tracking** |
| [extensions/seleric-pixel/src/index.ts](extensions/seleric-pixel/src/index.ts) | Client-side events |
| [app/services/normalizer.ts](app/services/normalizer.ts) | Event mapping |
| [app/services/deduplicator.ts](app/services/deduplicator.ts) | Prevents duplicates |
| [app/services/attribution.ts](app/services/attribution.ts) | UTM tracking |

---

## Event Mapping

### Client Events
```typescript
'checkout_started'    → 'begin_checkout'      (may be missing)
'checkout_completed'  → 'purchase_client'     (may be missing)
'payment_info_submitted' → 'payment_info'     (may be missing)
```

### Webhook Events (Reliable)
```typescript
'orders/paid'         → 'purchase'            ✅ ALWAYS FIRES
'orders/create'       → 'order_created'       ✅ Backup
'orders/cancelled'    → 'order_cancelled'     ✅ Refunds
```

---

## Verification Query

```sql
-- Check if conversions are being tracked
SELECT 
  orderId,
  source,
  value,
  timestamp
FROM "CustomerEvent"
WHERE eventType = 'purchase'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC
LIMIT 10;
```

**Expected:** `source = 'webhook'` for Razorpay orders

---

## Troubleshooting

### ❌ No conversions tracked

**Check:**
1. Webhook configured in Shopify? (Settings → Notifications)
2. `shopConfig.webhookEnabled = true`?
3. Webhook URL correct?

**Test:**
```typescript
// Create test order in Shopify
// Check HealthLog table:
SELECT * FROM "HealthLog" 
WHERE component = 'webhook' 
ORDER BY timestamp DESC 
LIMIT 5;
```

### ❌ Duplicate conversions

**Check:**
- `DeduplicationStore` table has entries?
- Webhook returns `200 OK` on success?

**Fix:** Already handled by `EventDeduplicator`

### ❌ Attribution missing

**Check:**
- Customer arrived via UTM link?
- Attribution captured on first `page_view`?

**Query:**
```sql
SELECT * FROM "Attribution"
WHERE customerHash = 'YOUR_CUSTOMER_HASH'
ORDER BY createdAt DESC;
```

---

## Testing

### Test with Razorpay

1. Add item to cart
2. Go to Razorpay checkout
3. Complete payment (use test card in test mode)
4. Wait 30 seconds
5. Check database:

```sql
SELECT * FROM "CustomerEvent"
WHERE eventType IN ('add_to_cart', 'purchase')
ORDER BY timestamp DESC
LIMIT 5;
```

**Expected:**
- `add_to_cart` from pixel (source = 'pixel')
- `purchase` from webhook (source = 'webhook')
- Only 1 purchase per order

---

## FAQ

**Q: Do I need to modify code for Razorpay?**
A: No! Already supported via webhooks.

**Q: What if checkout events are missing?**
A: Not a problem. `orders/paid` webhook is authoritative.

**Q: How is attribution preserved?**
A: Captured on `page_view`, linked to conversion via `customerHash`.

**Q: Can I test without real payments?**
A: Yes! Use Shopify test orders + Razorpay test mode.

---

## See Also

- [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md) - Complete system overview
- [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md) - Detailed setup instructions
- [EVENT_FLOW_DIAGRAMS.md](EVENT_FLOW_DIAGRAMS.md) - Visual flow diagrams

---

## Need Help?

Your implementation is **production-ready** for Razorpay Magic Checkout. The webhook-based approach ensures all conversions are tracked, even when client-side events are missing.

🚀 **You're good to go!**
