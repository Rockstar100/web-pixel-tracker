# System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        SELERIC TRACKER ARCHITECTURE                               │
│                  (Production-Ready for Razorpay Magic Checkout)                   │
└──────────────────────────────────────────────────────────────────────────────────┘


                              ┌──────────────────────────────┐
                              │        CUSTOMER              │
                              │    (Browser / Mobile)        │
                              └──────────────┬───────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
              CLIENT-SIDE              PAYMENT GATEWAY        SHOPIFY ADMIN
              TRACKING                 (Razorpay)             (Webhooks)
                    │                       │                       │
                    ▼                       ▼                       ▼


┌──────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT-SIDE                                        │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────┐                 │
│  │         SHOPIFY WEB PIXEL EXTENSION                         │                 │
│  │     (extensions/seleric-pixel/src/index.ts)                 │                 │
│  │                                                              │                 │
│  │  Events Captured:                                            │                 │
│  │  ✅ page_viewed                                             │                 │
│  │  ✅ product_viewed                                          │                 │
│  │  ✅ collection_viewed                                       │                 │
│  │  ✅ search_submitted                                        │                 │
│  │  ✅ product_added_to_cart                                   │                 │
│  │  ✅ product_removed_from_cart                               │                 │
│  │  ✅ cart_viewed                                             │                 │
│  │  ⚠️ checkout_started (may be missing with Razorpay)        │                 │
│  │  ⚠️ payment_info_submitted (may be missing with Razorpay)  │                 │
│  │  ⚠️ checkout_completed (may be missing with Razorpay)      │                 │
│  │                                                              │                 │
│  │  Session Management:                                         │                 │
│  │  - Generates unique sessionId (_seleric_sid cookie)         │                 │
│  │  - Tracks across pages                                       │                 │
│  │  - Captures UTM params from URL                              │                 │
│  └──────────────────────┬───────────────────────────────────────┘                 │
│                         │                                                         │
│                         │ POST /api/ingest.pixel                                  │
│                         │                                                         │
└─────────────────────────┼─────────────────────────────────────────────────────────┘
                          │
                          ▼


┌──────────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION SERVER                                      │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    PIXEL INGESTION API                                     │  │
│  │              (app/routes/api/ingest.pixel.ts)                              │  │
│  │                                                                             │  │
│  │  1. Receive pixel event                                                    │  │
│  │  2. Extract shop domain                                                    │  │
│  │  3. Check if pixel tracking enabled                                        │  │
│  │  4. Normalize event → NormalizedEvent                                      │  │
│  │  5. Apply privacy policy (consent check)                                   │  │
│  │  6. Check deduplication                                                    │  │
│  │  7. Capture attribution (if page_view with UTM)                            │  │
│  │  8. Store in database                                                      │  │
│  │  9. Forward to analytics (optional)                                        │  │
│  └───────────────────────────────┬───────────────────────────────────────────┘  │
│                                  │                                               │
│                                  ▼                                               │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                       SERVICES LAYER                                       │  │
│  │                                                                             │  │
│  │  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  │  │
│  │  │ EventNormalizer     │  │ EventDeduplicator    │  │ PrivacyManager  │  │  │
│  │  │ (normalizer.ts)     │  │ (deduplicator.ts)    │  │ (privacy.ts)    │  │  │
│  │  │                     │  │                      │  │                 │  │  │
│  │  │ Maps event names    │  │ Generates event key  │  │ Checks consent  │  │  │
│  │  │ Extracts UTM params │  │ Prevents duplicates  │  │ Anonymizes data │  │  │
│  │  │ Standardizes data   │  │ Handles retries      │  │ GDPR compliant  │  │  │
│  │  └─────────────────────┘  └──────────────────────┘  └─────────────────┘  │  │
│  │                                                                             │  │
│  │  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  │  │
│  │  │ AttributionTracker  │  │ CustomerJourney      │  │ UmamiForwarder  │  │  │
│  │  │ (attribution.ts)    │  │ Service              │  │ (optional)      │  │  │
│  │  │                     │  │ (journey.ts)         │  │                 │  │  │
│  │  │ Captures UTM        │  │ Tracks funnel        │  │ Forwards events │  │  │
│  │  │ First/last touch    │  │ Updates journey      │  │ to analytics    │  │  │
│  │  │ Links to orders     │  │ Calculates metrics   │  │ (if configured) │  │  │
│  │  └─────────────────────┘  └──────────────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                  │                                               │
│                                  ▼                                               │
└──────────────────────────────────┼───────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────────────┐
│                           WEBHOOK HANDLERS                                        │
├──────────────────────────────────┼───────────────────────────────────────────────┤
│                                  │                                               │
│                                  │  Shopify triggers webhooks                    │
│                                  │  when order events occur                      │
│                                  │                                               │
│  ┌───────────────────────────────▼──────────────────────────────────────────┐  │
│  │                    POST /webhooks/orders/paid                             │  │
│  │              (app/routes/webhooks/orders.paid.ts)                         │  │
│  │                                                                            │  │
│  │  ✅ PRIMARY CONVERSION TRACKING (Razorpay-safe)                           │  │
│  │                                                                            │  │
│  │  1. Verify webhook authenticity (shop domain, topic)                      │  │
│  │  2. Parse order payload                                                   │  │
│  │  3. Check if webhook tracking enabled                                     │  │
│  │  4. Normalize event → NormalizedEvent                                     │  │
│  │  5. Check deduplication (prevent double-counting)                         │  │
│  │  6. Enrich with stored attribution (from earlier page_view)               │  │
│  │  7. Store attribution for this order                                      │  │
│  │  8. Record event in customer journey                                      │  │
│  │  9. Track order status (paid/fulfilled)                                   │  │
│  │ 10. Forward to analytics (optional)                                       │  │
│  │ 11. Log health status                                                     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │               POST /webhooks/orders/create                                 │  │
│  │         (app/routes/webhooks/orders.create.ts)                             │  │
│  │                                                                            │  │
│  │  Captures order creation (before payment)                                  │  │
│  │  - Useful for abandoned cart tracking                                      │  │
│  │  - Not a conversion (financial_status != "paid")                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │            POST /webhooks/orders/cancelled                                 │  │
│  │         (app/routes/webhooks/orders.cancelled.ts)                          │  │
│  │                                                                            │  │
│  │  Tracks order cancellations                                                │  │
│  │  - Updates customer journey (reversal)                                     │  │
│  │  - Adjusts metrics                                                         │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │              POST /webhooks/orders/refund                                  │  │
│  │          (app/routes/webhooks/orders.refund.ts)                            │  │
│  │                                                                            │  │
│  │  Tracks order refunds                                                      │  │
│  │  - Updates customer journey (reversal)                                     │  │
│  │  - Adjusts revenue metrics                                                 │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
└───────────────────────────────────────────┬───────────────────────────────────────┘
                                            │
                                            ▼


┌──────────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE (PostgreSQL)                                │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────────────┐   │
│  │  CustomerEvent     │  │  CustomerJourney   │  │  Attribution            │   │
│  │                    │  │                    │  │                         │   │
│  │  - eventType       │  │  - customerHash    │  │  - customerHash         │   │
│  │  - source          │  │  - firstInteraction│  │  - orderId              │   │
│  │  - customerHash    │  │  - lastInteraction │  │  - utmSource            │   │
│  │  - sessionId       │  │  - pageViewCount   │  │  - utmMedium            │   │
│  │  - orderId         │  │  - addToCartCount  │  │  - utmCampaign          │   │
│  │  - value           │  │  - purchaseCount   │  │  - landingPage          │   │
│  │  - utm params      │  │  - totalRevenue    │  │  - referrer             │   │
│  │  - timestamp       │  │  - funnel_progress │  │  - firstTouch           │   │
│  └────────────────────┘  └────────────────────┘  └─────────────────────────┘   │
│                                                                                   │
│  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────────────┐   │
│  │ DeduplicationStore │  │  OrderTracking     │  │  HealthLog              │   │
│  │                    │  │                    │  │                         │   │
│  │  - eventKey        │  │  - orderId         │  │  - component            │   │
│  │  - shopConfigId    │  │  - customerEmail   │  │  - status               │   │
│  │  - eventType       │  │  - orderStatus     │  │  - message              │   │
│  │  - isDuplicate     │  │  - paymentStatus   │  │  - timestamp            │   │
│  │  - forwarded       │  │  - totalAmount     │  │                         │   │
│  │  - timestamp       │  │  - paymentMethod   │  │                         │   │
│  └────────────────────┘  └────────────────────┘  └─────────────────────────┘   │
│                                                                                   │
│  ┌────────────────────┐  ┌────────────────────┐                                 │
│  │  ShopConfig        │  │  CustomerProfile   │                                 │
│  │                    │  │  (RFM segments)    │                                 │
│  │  - shopifyShop     │  │                    │                                 │
│  │  - webhookEnabled  │  │  - customerHash    │                                 │
│  │  - pixelEnabled    │  │  - recency         │                                 │
│  │  - consentMode     │  │  - frequency       │                                 │
│  │  - brandId         │  │  - monetaryValue   │                                 │
│  └────────────────────┘  └────────────────────┘                                 │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────┐
│                         RAZORPAY CHECKOUT FLOW                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  Customer Journey with Razorpay Magic Checkout:                                  │
│                                                                                   │
│  1. Customer visits store                                                        │
│     └─> Web Pixel: page_view (UTM params captured & stored)                     │
│                                                                                   │
│  2. Customer views products                                                      │
│     └─> Web Pixel: product_viewed                                               │
│                                                                                   │
│  3. Customer adds to cart                                                        │
│     └─> Web Pixel: product_added_to_cart                                        │
│                                                                                   │
│  4. Customer clicks checkout                                                     │
│     └─> Web Pixel: checkout_started (may not fire if redirected immediately)    │
│                                                                                   │
│  5. ⚠️ REDIRECT TO RAZORPAY                                                      │
│     └─> Customer now on Razorpay's domain                                       │
│     └─> No client-side tracking possible                                        │
│                                                                                   │
│  6. Customer completes payment in Razorpay                                       │
│     └─> Razorpay processes payment                                              │
│     └─> Razorpay notifies Shopify                                               │
│                                                                                   │
│  7. Shopify creates/updates order                                                │
│     └─> Order status: paid                                                      │
│     └─> Triggers: orders/paid webhook → Your app                                │
│                                                                                   │
│  8. ✅ YOUR APP RECEIVES WEBHOOK                                                 │
│     └─> Extracts order data (ID, amount, customer, items)                       │
│     └─> Retrieves stored attribution (from step 1's page_view)                  │
│     └─> Links attribution to order                                              │
│     └─> Records conversion in CustomerEvent table                               │
│     └─> Updates CustomerJourney (purchaseCount++, totalRevenue+=amount)         │
│     └─> Deduplicates (if client event also fired)                               │
│     └─> Forwards to analytics (optional)                                        │
│                                                                                   │
│  Result: ✅ COMPLETE CONVERSION TRACKING                                         │
│          ✅ Attribution preserved from initial visit                             │
│          ✅ Customer journey updated                                             │
│          ✅ No duplicate conversions                                             │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────┐
│                              KEY FEATURES                                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ✅ Dual Tracking (Client + Server)                                              │
│     - Client: Captures early funnel (browsing, cart)                             │
│     - Server: Captures conversions (payments, orders)                            │
│     - Combined: Complete customer journey                                        │
│                                                                                   │
│  ✅ Payment Gateway Agnostic                                                     │
│     - Works with any payment gateway (Razorpay, Stripe, PayPal, etc.)           │
│     - No dependency on client-side checkout events                               │
│     - Webhook-based conversion tracking (always reliable)                        │
│                                                                                   │
│  ✅ Attribution Preservation                                                     │
│     - UTM params captured on first page_view                                     │
│     - Stored in database linked to customer                                      │
│     - Retrieved when conversion happens (days/weeks later)                       │
│     - Multi-touch attribution (first touch + last touch)                         │
│                                                                                   │
│  ✅ Deduplication                                                                │
│     - Prevents double-counting from multiple sources                             │
│     - Handles webhook retries gracefully                                         │
│     - Event key based on order + customer + timestamp                            │
│     - Idempotent processing                                                      │
│                                                                                   │
│  ✅ Privacy Compliant                                                            │
│     - Email hashing (SHA256)                                                     │
│     - IP anonymization                                                           │
│     - Consent mode support                                                       │
│     - GDPR/CCPA ready                                                            │
│                                                                                   │
│  ✅ Resilient & Reliable                                                         │
│     - Shopify retries webhooks (up to 48 hours)                                  │
│     - Health monitoring & logging                                                │
│     - Error tracking                                                             │
│     - Automatic recovery                                                         │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────┐
│                          CONFIGURATION CHECKLIST                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  Shopify Admin:                                                                   │
│  ☐ Enable webhooks (Settings → Notifications → Webhooks)                        │
│    - orders/paid → https://your-app.com/webhooks/orders/paid                    │
│    - orders/create → https://your-app.com/webhooks/orders/create                │
│    - orders/cancelled → https://your-app.com/webhooks/orders/cancelled          │
│    - orders/refund → https://your-app.com/webhooks/orders/refund                │
│                                                                                   │
│  Database (ShopConfig):                                                           │
│  ☐ webhookEnabled = true                                                         │
│  ☐ pixelEnabled = true                                                           │
│  ☐ consentMode = "relaxed" or "strict"                                          │
│                                                                                   │
│  Web Pixel Extension (Shopify Admin):                                             │
│  ☐ serverEndpoint = "https://your-app.com/api/ingest/pixel"                     │
│  ☐ enableDebug = "false" (set to "true" for development)                        │
│                                                                                   │
│  Testing:                                                                         │
│  ☐ Test order through Razorpay (use test mode)                                  │
│  ☐ Verify webhook fires (check HealthLog table)                                 │
│  ☐ Verify conversion recorded (check CustomerEvent table)                       │
│  ☐ Verify attribution linked (check Attribution table)                          │
│  ☐ Verify no duplicates (check DeduplicationStore table)                        │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## Summary

This architecture provides:

✅ **Complete tracking** even when checkout happens externally (Razorpay)
✅ **Attribution preservation** across multiple sessions and days
✅ **No duplicate conversions** through intelligent deduplication
✅ **Privacy compliance** with GDPR/CCPA standards
✅ **Resilient delivery** via Shopify's webhook retry mechanism
✅ **No third-party dependencies** for core functionality

The key insight: **Server-side webhook tracking is authoritative**, with client-side pixel tracking providing enrichment data. This makes the system robust against payment gateway redirects, ad blockers, and client-side tracking gaps.
