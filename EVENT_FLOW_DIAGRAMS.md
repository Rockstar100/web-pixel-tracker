# Event Flow Diagrams

## 1. Normal Shopify Checkout Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER JOURNEY                                 │
│                    (Standard Shopify Checkout)                           │
└─────────────────────────────────────────────────────────────────────────┘

Customer                Web Pixel              Server              Shopify
   │                        │                     │                    │
   │  Visit Store           │                     │                    │
   ├───────────────────────>│                     │                    │
   │                        │  page_view          │                    │
   │                        ├────────────────────>│                    │
   │                        │  (UTM captured)     │                    │
   │                        │                     │ Store Attribution  │
   │                        │                     │────────┐           │
   │                        │                     │        │           │
   │  View Product          │                     │<───────┘           │
   ├───────────────────────>│                     │                    │
   │                        │  product_viewed     │                    │
   │                        ├────────────────────>│                    │
   │                        │                     │ Store Event        │
   │                        │                     │────────┐           │
   │  Add to Cart           │                     │<───────┘           │
   ├───────────────────────>│                     │                    │
   │                        │  add_to_cart        │                    │
   │                        ├────────────────────>│                    │
   │                        │                     │ Store Event        │
   │                        │                     │────────┐           │
   │  Go to Checkout        │                     │<───────┘           │
   ├───────────────────────>│                     │                    │
   │                        │  checkout_started   │                    │
   │                        ├────────────────────>│                    │
   │                        │                     │ Store Event        │
   │                        │                     │────────┐           │
   │  Enter Payment Info    │                     │<───────┘           │
   ├───────────────────────>│                     │                    │
   │                        │  payment_info       │                    │
   │                        ├────────────────────>│                    │
   │                        │                     │ Store Event        │
   │                        │                     │────────┐           │
   │  Complete Payment      │                     │<───────┘           │
   ├───────────────────────>│                     │                    │
   │                        │  checkout_completed │                    │
   │                        ├────────────────────>│                    │
   │                        │                     │ Store Event        │
   │                        │                     │ (purchase_client)  │
   │                        │                     │────────┐           │
   │                        │                     │<───────┘           │
   │                        │                     │                    │
   │                        │                     │<──────orders/paid──┤
   │                        │                     │   webhook          │
   │                        │                     │                    │
   │                        │                     │ DEDUPLICATION      │
   │                        │                     │────────┐           │
   │                        │                     │ Check: │           │
   │                        │                     │ - Same order ID    │
   │                        │                     │ - Same customer    │
   │                        │                     │ - Same timestamp   │
   │                        │                     │<───────┘           │
   │                        │                     │                    │
   │                        │                     │ Store ONLY 1       │
   │                        │                     │ purchase event     │
   │                        │                     │────────┐           │
   │                        │                     │<───────┘           │
   │                        │                     │                    │
   │  Order Confirmation    │                     │ Link Attribution   │
   │<───────────────────────┼─────────────────────┼────────┐           │
   │                        │                     │<───────┘           │

Result: 1 purchase event, with attribution from initial page_view
```

---

## 2. Razorpay Magic Checkout Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER JOURNEY                                 │
│                    (Razorpay Magic Checkout)                             │
└─────────────────────────────────────────────────────────────────────────┘

Customer                Web Pixel              Server          Razorpay    Shopify
   │                        │                     │                │           │
   │  Visit Store           │                     │                │           │
   ├───────────────────────>│                     │                │           │
   │                        │  page_view          │                │           │
   │                        ├────────────────────>│                │           │
   │                        │  (UTM captured)     │                │           │
   │                        │                     │ Store          │           │
   │                        │                     │ Attribution    │           │
   │                        │                     │────────┐       │           │
   │  View Product          │                     │<───────┘       │           │
   ├───────────────────────>│                     │                │           │
   │                        │  product_viewed     │                │           │
   │                        ├────────────────────>│                │           │
   │                        │                     │ Store Event    │           │
   │                        │                     │────────┐       │           │
   │  Add to Cart           │                     │<───────┘       │           │
   ├───────────────────────>│                     │                │           │
   │                        │  add_to_cart        │                │           │
   │                        ├────────────────────>│                │           │
   │                        │                     │ Store Event    │           │
   │                        │                     │────────┐       │           │
   │  Click Checkout        │                     │<───────┘       │           │
   ├───────────────────────>│                     │                │           │
   │ (Redirect to Razorpay) │                     │                │           │
   │                        │  ⚠️ checkout_started │                │           │
   │                        │  (may not fire)     │                │           │
   │                        │                     │                │           │
   ├────────────────────────┼─────────────────────┼───────────────>│           │
   │  RAZORPAY UI           │                     │                │           │
   │  (Customer on          │    ❌ No Tracking   │                │           │
   │   Razorpay domain)     │                     │                │           │
   │                        │                     │                │           │
   │  Enter Address         │                     │                │           │
   │  Enter Payment         │                     │                │           │
   │  Complete Payment      │                     │                │           │
   ├────────────────────────┤                     │                │           │
   │                        │                     │                │           │
   │                        │                     │<────payment────┤           │
   │                        │                     │  notification  │           │
   │                        │                     │                │           │
   │                        │                     │      order     │           │
   │                        │                     │<───────────────┴──created──┤
   │                        │                     │                 in Shopify │
   │                        │                     │                            │
   │                        │                     │<──────orders/paid──────────┤
   │                        │                     │      webhook               │
   │                        │                     │                            │
   │                        │                     │ ✅ WEBHOOK TRACKING        │
   │                        │                     │────────┐                   │
   │                        │                     │ Create:│                   │
   │                        │                     │ - purchase event           │
   │                        │                     │ - Link attribution         │
   │                        │                     │ - Update journey           │
   │                        │                     │ - Record conversion        │
   │                        │                     │<───────┘                   │
   │                        │                     │                            │
   │  Order Confirmation    │                     │                            │
   │<───────────────────────┼─────────────────────┤                            │
   │  (Redirected back)     │                     │                            │

Result: 1 purchase event (from webhook), with attribution from initial page_view
        Checkout events missing, but conversion still tracked! ✅
```

---

## 3. Attribution Flow (Cross-Session)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MULTI-SESSION ATTRIBUTION                              │
│            How UTM parameters persist across sessions                     │
└──────────────────────────────────────────────────────────────────────────┘

SESSION 1 (First Touch)
─────────────────────────
Visit from Google Ad
utm_source=google&utm_campaign=summer_sale

Customer           Web Pixel              Server              Database
   │                   │                     │                     │
   │  Page View        │                     │                     │
   │  (with UTM)       │                     │                     │
   ├──────────────────>│  page_view          │                     │
   │                   ├────────────────────>│                     │
   │                   │                     │  Store Attribution  │
   │                   │                     ├────────────────────>│
   │                   │                     │  customerHash       │
   │                   │                     │  utmSource=google   │
   │                   │                     │  utmCampaign=...    │
   │                   │                     │  firstTouch=true    │
   │                   │                     │  timestamp          │
   │  Browse products  │                     │                     │
   │  Add to cart      │                     │                     │
   │  Leave site       │                     │                     │


SESSION 2 (Return - Direct)
─────────────────────────
Return visit (direct, no UTM)

Customer           Web Pixel              Server              Database
   │                   │                     │                     │
   │  Page View        │                     │                     │
   │  (no UTM)         │                     │                     │
   ├──────────────────>│  page_view          │                     │
   │                   ├────────────────────>│                     │
   │                   │                     │  Attribution exists │
   │                   │                     │<────────────────────┤
   │                   │                     │  (keep existing)    │
   │  Browse more      │                     │                     │
   │  Leave again      │                     │                     │


SESSION 3 (Return via Email)
─────────────────────────
Return from email campaign
utm_source=email&utm_campaign=abandoned_cart

Customer           Web Pixel              Server              Database
   │                   │                     │                     │
   │  Page View        │                     │                     │
   │  (with UTM)       │                     │                     │
   ├──────────────────>│  page_view          │                     │
   │                   ├────────────────────>│                     │
   │                   │                     │  Update Attribution │
   │                   │                     ├────────────────────>│
   │                   │                     │  lastTouch=email    │
   │                   │                     │  (firstTouch kept)  │
   │  Go to Razorpay   │                     │                     │
   │  Complete Payment │                     │                     │
   │                   │                     │<────orders/paid────┤
   │                   │                     │  webhook            │
   │                   │                     │                     │
   │                   │                     │  Link Attribution   │
   │                   │                     │<────────────────────┤
   │                   │                     │  Get stored UTM:    │
   │                   │                     │  - First: google    │
   │                   │                     │  - Last: email      │
   │                   │                     │                     │
   │                   │                     │  Record Conversion  │
   │                   │                     ├────────────────────>│
   │                   │                     │  orderId            │
   │                   │                     │  customerHash       │
   │                   │                     │  utmSource=email    │
   │                   │                     │  firstTouchSrc=google│

Result: Conversion credited to email (last touch), but first touch preserved
```

---

## 4. Deduplication Logic

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      EVENT DEDUPLICATION                                  │
│         Preventing double-counting of conversions                         │
└──────────────────────────────────────────────────────────────────────────┘

SCENARIO: Both client and webhook fire for same order


Client Event                                    Webhook Event
─────────────                                   ──────────────
checkout_completed                              orders/paid
(if Shopify checkout)                           (always fires)
   │                                                │
   │  Event arrives                                 │  Event arrives
   │  at server                                     │  at server
   │                                                │
   ▼                                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    EventDeduplicator                          │
│                                                               │
│  Generate Event Key:                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Hash of:                                             │    │
│  │ - shopConfigId                                       │    │
│  │ - customerHash                                       │    │
│  │ - eventType ("purchase")                             │    │
│  │ - orderId                                            │    │
│  │ - timestamp (rounded to minute)                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  eventKey = "abc123def456..."                                │
│                                                               │
│  Check DeduplicationStore:                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ SELECT * FROM DeduplicationStore                     │    │
│  │ WHERE eventKey = "abc123def456..."                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  Found?                                                       │
│  ├─ YES ──> isDuplicate = true  ──> SKIP                     │
│  └─ NO  ──> isDuplicate = false ──> PROCESS & STORE          │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                 │                              │
                 │ (duplicate)                  │ (unique)
                 ▼                              ▼
        Return 200 OK                   Process Event:
        (skip processing)                - Store in CustomerEvent
                                        - Update CustomerJourney
                                        - Link Attribution
                                        - Forward to analytics
                                        - Store in DeduplicationStore

Result: Only ONE purchase event stored, regardless of source
```

---

## 5. Customer Journey Reconstruction

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     CUSTOMER JOURNEY TRACKING                             │
│              Complete funnel across multiple sessions                     │
└──────────────────────────────────────────────────────────────────────────┘

Time    Event                   Source      Data Captured
────────────────────────────────────────────────────────────────────────────
10:00   page_view              pixel       URL, referrer, UTM params
                                           ✅ Attribution stored

10:02   product_view           pixel       Product ID, title, price
                                           ✅ Engagement tracked

10:05   add_to_cart            pixel       Product, quantity, cart value
                                           ✅ Cart intent recorded

10:06   [Customer leaves site]
        ────────────────────────────────────────────────────────────
        SESSION ENDS
        ────────────────────────────────────────────────────────────

14:00   page_view              pixel       Return visit (same customer)
                                           ✅ Session linked via customerHash

14:05   add_to_cart            pixel       More items added
                                           ✅ Cart updated

14:10   checkout_started       pixel       Checkout initiated
        (may be missing)       ❓          ⚠️ Not critical for Razorpay

        [Redirect to Razorpay]
        ────────────────────────────────────────────────────────────
        TRACKING GAP (Razorpay UI)
        ────────────────────────────────────────────────────────────

14:15   [Payment completed in Razorpay]
        ────────────────────────────────────────────────────────────
        Razorpay → Shopify → Webhook
        ────────────────────────────────────────────────────────────

14:16   orders/paid            webhook     ✅ Order ID, customer, amount
                                           ✅ CONVERSION TRACKED
                                           ✅ Attribution linked
                                           ✅ Journey completed


RESULTING CUSTOMER JOURNEY RECORD:
───────────────────────────────────
CustomerJourney {
  customerHash: "hash_abc123...",
  firstInteraction: 10:00,
  lastInteraction: 14:16,
  
  eventCounts: {
    page_view: 2,
    product_view: 1,
    add_to_cart: 2,
    begin_checkout: 0,        ← Missing (Razorpay)
    purchase: 1               ← ✅ Tracked via webhook
  },
  
  sessionsCount: 2,
  purchaseCount: 1,
  totalRevenue: 1299.00,
  averageOrderValue: 1299.00,
  
  utmSource: "google",        ← From initial page_view
  utmCampaign: "summer_sale",
  
  funnel_progress: "converted" ✅
}

Result: Complete journey tracked despite Razorpay redirect gap
```

---

## 6. Webhook Retry & Recovery

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK RELIABILITY                                    │
│              How Shopify ensures webhook delivery                         │
└──────────────────────────────────────────────────────────────────────────┘

Order Completed                    Your App Server              Database
in Shopify                         (Webhook Handler)            
    │                                      │                        │
    │  orders/paid webhook                 │                        │
    ├─────────────────────────────────────>│                        │
    │                                      │  Process event         │
    │                                      ├───────────────────────>│
    │                                      │                        │
    │                                      │  ❌ ERROR              │
    │                                      │  (database timeout)    │
    │                                      │<───────────────────────┤
    │                                      │                        │
    │  Response: 500 Error                 │                        │
    │<─────────────────────────────────────┤                        │
    │                                      │                        │
    │  [Shopify webhook retry logic]       │                        │
    │  Wait 1 minute...                    │                        │
    │                                      │                        │
    │  orders/paid webhook (retry 1)       │                        │
    ├─────────────────────────────────────>│                        │
    │                                      │  Process event         │
    │                                      ├───────────────────────>│
    │                                      │                        │
    │                                      │  Check deduplication   │
    │                                      │<───────────────────────┤
    │                                      │  (not stored yet)      │
    │                                      │                        │
    │                                      │  ✅ SUCCESS            │
    │                                      │<───────────────────────┤
    │                                      │                        │
    │  Response: 200 OK                    │                        │
    │<─────────────────────────────────────┤                        │
    │                                      │                        │
    │  ✅ Webhook delivered                │                        │

SHOPIFY RETRY SCHEDULE:
- Immediate: First attempt
- 1 minute later: Retry 1
- 5 minutes later: Retry 2
- 15 minutes later: Retry 3
- 1 hour later: Retry 4
- Up to 48 hours of retries

YOUR APP'S PROTECTION:
- ✅ Deduplication handles multiple deliveries
- ✅ Idempotent webhook processing
- ✅ 200 OK only when successfully stored
- ✅ Error responses trigger Shopify retry

Result: Eventual consistency - all conversions tracked even if initial delivery fails
```

---

## Summary

### Key Takeaways

1. **Client + Server = Complete Tracking**
   - Client-side: Captures browsing, engagement, cart actions
   - Server-side: Captures conversions (payment gateways)

2. **Razorpay-Safe Architecture**
   - Webhooks ensure conversions are never missed
   - Attribution preserved from earlier sessions
   - No dependency on client-side checkout events

3. **Deduplication Prevents Issues**
   - Same conversion from multiple sources → Counted once
   - Webhook retries → Handled gracefully
   - Race conditions → Resolved by event key hashing

4. **Attribution Persistence**
   - UTM captured early (first page_view)
   - Stored in database
   - Linked to conversion later
   - Works across sessions and days

5. **Reliable Delivery**
   - Shopify retries failed webhooks
   - Your app is idempotent
   - Conversions tracked even with temporary failures

---

This architecture is production-ready for Razorpay Magic Checkout! 🚀
