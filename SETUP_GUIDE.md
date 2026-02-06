# Seleric Tracker - Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Start PostgreSQL (1 minute)

**Using Docker (Recommended):**
```bash
cd seleric-tracker
docker-compose up -d
```

This starts PostgreSQL on port 5432 and PgAdmin on http://localhost:5050

**OR use existing PostgreSQL** and update DATABASE_URL in `.env`

### Step 2: Install & Setup (2 minutes)

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
```

### Step 3: Start Development Server (1 minute)

```bash
npm run dev
```

You'll see output like:
```
┌──────────────────────────────────────────────────────┐
│  Preview your app:                                   │
│  https://your-tunnel.ngrok.io                        │
│  To install and start using your app:                │
│  https://your-tunnel.ngrok.io/api/auth?shop=...     │
```

### Step 4: Create Your First Brand (1 minute)

1. Install the app on your development store
2. Navigate to the dashboard (redirects automatically after install)
3. Click "Add New Brand":
   - **Name**: "My Brand"
   - **Umami Website UUID**: Get from your Umami dashboard → Settings → Websites
   - **Currency**: USD (or your currency)
4. Click "Create Brand"

### Step 5: Configure Your Shop

1. In the Configuration section:
   - Select your brand from dropdown
   - ✅ Enable Pixel Tracking
   - ✅ Enable Webhook Tracking
   - Consent Mode: Relaxed (for testing)
2. Click "Save Configuration"

### ✅ Done! Your shop is now tracking events to Umami.

---

## 🧪 Test Your Setup

### Quick Test Checklist

1. **Visit your storefront**
   ```
   https://your-store.myshopify.com/?utm_source=test&utm_campaign=setup
   ```

2. **Check Dashboard**
   - Go to `/dashboard?shop=your-store.myshopify.com`
   - You should see a `page_view` event

3. **Add Product to Cart**
   - Add any product to cart
   - Dashboard should show `add_to_cart` event

4. **Complete a Test Order**
   - Use Shopify's test mode
   - Complete checkout
   - Dashboard should show:
     - `begin_checkout`
     - `purchase_client` (from pixel)
     - `purchase` (from webhook - the authoritative one)

5. **Verify in Umami**
   - Login to your Umami dashboard
   - Select your website
   - You should see the events with UTM parameters

---

## 🔧 Common Issues & Fixes

### ❌ "Shop not configured" error
**Fix**: Make sure you've created a brand and mapped your shop to it in the dashboard.

### ❌ Events not showing in Umami
**Check**:
1. Umami Website UUID is correct (copy from Umami → Settings)
2. Umami endpoint is reachable: `https://umami.seleric.cloud/api/send`
3. Check Health Logs in dashboard for errors

### ❌ Webhooks not firing
**Fix**:
1. Register webhooks in Shopify Admin:
   - Settings → Notifications → Webhooks
   - Add webhook for "Order payment"
   - URL: `https://your-tunnel.ngrok.io/webhooks/orders/paid`

2. Or use GraphQL Admin API:
```graphql
mutation {
  webhookSubscriptionCreate(
    topic: ORDERS_PAID
    webhookSubscription: {
      format: JSON
      callbackUrl: "https://your-app.com/webhooks/orders/paid"
    }
  ) {
    webhookSubscription {
      id
    }
  }
}
```

### ❌ Duplicate events in Umami
**This is expected during testing!** The dedupe system stores both:
- `purchase_client` (pixel)
- `purchase` (webhook - counts as the conversion)

Only `purchase` is counted in conversions. The pixel event is kept for attribution debugging.

---

## 📊 Understanding Your Dashboard

### Event Statistics
Shows last 7 days:
- **Total Events**: All events received (pixel + webhook + provider)
- **Forwarded to Umami**: Successfully sent events
- **Forward Rate**: Success rate (should be ~100%)
- **Event Types**: Breakdown by category

### By Source
- **pixel**: Client-side events (Web Pixel)
- **webhook**: Server-side events (Shopify webhooks)
- **provider**: Third-party payment provider events (Razorpay, etc.)

### Health Logs
Real-time status of:
- `pixel` component
- `webhook` component  
- `umami_forward` component
- `provider_webhook` component

**Green** = Success | **Red** = Error | **Orange** = Warning

---

## 🎯 Next Steps

### 1. Add More Brands (Multi-Brand Setup)

If you have multiple brands/stores:

```sql
-- Create additional brands
INSERT INTO Brand (id, name, umamiWebsiteUuid, domains, defaultCurrency, enabled)
VALUES 
  ('uuid1', 'Brand A', 'umami-uuid-a', '["brand-a.com"]', 'USD', 1),
  ('uuid2', 'Brand B', 'umami-uuid-b', '["brand-b.com"]', 'EUR', 1);

-- Map shops to brands
INSERT INTO ShopConfig (shopifyShop, brandId)
VALUES
  ('brand-a.myshopify.com', 'uuid1'),
  ('brand-b.myshopify.com', 'uuid2');
```

Or use the dashboard UI!

### 2. Enable Razorpay Tracking (Optional)

If using Razorpay Magic Checkout:

1. Create provider connector:
```sql
INSERT INTO ProviderConnector (shopifyShop, providerName, enabled, webhookSecret)
VALUES ('your-store.myshopify.com', 'razorpay', 1, 'your_webhook_secret');
```

2. Add webhook in Razorpay Dashboard:
   - URL: `https://your-app.com/webhooks/provider/razorpay?shop=your-store.myshopify.com`
   - Secret: Your webhook secret
   - Events: `payment.captured`, `order.paid`

### 3. Set Up Attribution Reporting

Umami will receive UTM parameters in event data. Query examples:

**Top Campaigns (Last 30 Days)**
```sql
-- In Umami database
SELECT 
  JSON_EXTRACT(event_data, '$.utm_campaign') as campaign,
  COUNT(*) as conversions,
  SUM(CAST(JSON_EXTRACT(event_data, '$.value') AS DECIMAL)) as revenue
FROM event
WHERE event_name = 'purchase'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY campaign
ORDER BY revenue DESC;
```

### 4. Production Deployment

Before going live:

1. **Switch to Production Database**
   ```env
   # Update .env
   DATABASE_URL="postgresql://user:pass@host/dbname"
   ```

2. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

3. **Set Environment Variables**
   ```env
   NODE_ENV=production
   SHOPIFY_API_KEY=prod_key
   SHOPIFY_API_SECRET=prod_secret
   ```

4. **Enable HMAC Verification**
   - Uncomment HMAC verification in webhook handlers
   - Get webhook secret from Shopify

5. **Deploy to Hosting**
   - Recommended: Railway, Heroku, or AWS
   - Ensure persistent database (not SQLite)

---

## 📚 Advanced Configuration

### Custom Event Tracking

To track custom events from your theme:

```javascript
// Add to theme.liquid or custom script
fetch('/api/ingest/pixel', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Shop-Domain': '{{ shop.domain }}'
  },
  body: JSON.stringify({
    name: 'custom_event',
    timestamp: new Date().toISOString(),
    clientId: 'session-' + Date.now(),
    context: {
      document: {
        location: {
          href: window.location.href
        }
      }
    },
    data: {
      custom_field: 'value'
    }
  })
});
```

### Consent Management Integration

To integrate with Shopify's consent API:

```javascript
// In pixel extension (extensions/seleric-pixel/src/index.ts)
analytics.subscribe('consent_tracking_api_loaded', async (event) => {
  const consent = event.data.consent;
  
  if (!consent.analytics) {
    // Don't track events without analytics consent
    return;
  }
  
  // Continue normal tracking
});
```

### Custom Provider Connector

Create `app/services/providers/stripe.ts`:

```typescript
import type { PaymentProvider } from './base';

export class StripeProvider implements PaymentProvider {
  name = 'stripe';

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    // Implement Stripe signature verification
    return true;
  }

  normalizeWebhook(payload: any, shop: string, brandId: string) {
    // Convert Stripe webhook to NormalizedEvent
    return null;
  }

  getConfigSchema() {
    return {
      webhookSecret: { type: 'string', required: true }
    };
  }
}
```

Register in `provider.$provider.ts`:
```typescript
import { StripeProvider } from "~/services/providers/stripe";
ProviderRegistry.register(new StripeProvider());
```

---

## 🆘 Support Resources

- **Documentation**: See `README_SELERIC.md`
- **Schema**: Check `prisma/schema.prisma` for data model
- **Services**: Browse `app/services/` for business logic
- **Dashboard**: `/dashboard?shop=your-store.myshopify.com`

---

## ✅ Setup Verification Checklist

- [ ] App installed on Shopify store
- [ ] Brand created with correct Umami UUID
- [ ] Shop mapped to brand
- [ ] Pixel tracking enabled
- [ ] Webhook tracking enabled
- [ ] Test order completed
- [ ] Events visible in dashboard
- [ ] Events visible in Umami
- [ ] UTM parameters captured
- [ ] No errors in Health Logs

**All checked?** 🎉 You're ready to track!
