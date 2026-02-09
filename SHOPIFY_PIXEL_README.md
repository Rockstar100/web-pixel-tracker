# Seleric Tracker - Shopify App Pixel + Umami Analytics Integration

Complete implementation guide for tracking customer events from your Shopify storefront to self-hosted Umami analytics.

## 📋 Quick Start

### 1. Prerequisites

- **Node.js** 20.19+ or 22.12+ ([Download](https://nodejs.org))
- **PostgreSQL** database (local or remote)
- **Shopify CLI** ([Install](https://shopify.dev/docs/apps/tools/cli/install))
- **ngrok** or similar tunnel service ([Download](https://ngrok.com))
- **Umami Analytics** instance ([Self-hosted](https://umami.is/docs/install) or [Cloud](https://cloud.umami.is))

### 2. Environment Setup

```bash
# Clone and navigate to project
cd seleric-tracker

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost:5432/seleric_tracker"
export SHOPIFY_API_KEY="your_key_from_partner_dashboard"
export SHOPIFY_API_SECRET="your_secret"
export SESSION_SECRET="random_secret_string"

# Install dependencies
npm install

# Setup database
npm run setup
```

### 3. Start Development Server

```bash
# Terminal 1: Start ngrok tunnel
ngrok http 39351

# Copy the tunnel URL (format: https://xxxx.ngrok-free.dev)

# Terminal 2: Start development server
cd seleric-tracker
npm run dev --tunnel-url https://xxxx.ngrok-free.dev
```

### 4. Complete Setup

1. **Authenticate with Shopify:**
   - Browser opens Shopify login
   - Select development store
   - Click "Install app"

2. **Verify Pixel Activation:**
   - Go to Shopify Admin → Settings → Customer events → App pixels
   - Should see "Seleric-Tracker" with **Connected** status

3. **Test Event Flow:**
   - Install [Pixel Helper](https://shopify.app/services/google_pixel_helper)
   - Navigate store and check events appear in Pixel Helper
   - Verify events appear in your Umami dashboard

## 📚 Documentation

This project includes comprehensive guides:

### Getting Started
- **[UMAMI_INTEGRATION_GUIDE.md](UMAMI_INTEGRATION_GUIDE.md)** - Complete setup and configuration guide
- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Development environment setup

### Testing & Troubleshooting
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Step-by-step event testing procedures
- **[PIXEL_ACTIVATION.md](PIXEL_ACTIVATION.md)** - Web pixel creation and troubleshooting

### Quick Reference
- **[setup.sh](setup.sh)** - Linux/Mac setup script
- **[setup.bat](setup.bat)** - Windows setup script

## 🏗️ Architecture Overview

```
Shopify Storefront
    ↓
[Web Pixel Extension] (extensions/seleric-pixel/)
    ↓ (POST events)
[Ingestion Endpoint] (app/routes/api/ingest.pixel.ts)
    ↓ (Validate & Normalize)
[Event Pipeline]
    ├→ EventNormalizer (standardize events)
    ├→ EventDeduplicator (prevent duplicates)
    ├→ PrivacyManager (apply privacy rules)
    ├→ AttributionTracker (capture UTM)
    └→ UmamiForwarder (send to Umami)
    ↓
[Umami Analytics]
    ↓
[Analytics Dashboard]
```

## 🚀 Key Features

### Event Tracking
- ✅ Page views with URLs and referrers
- ✅ Product views with variant details
- ✅ Add to cart / Remove from cart
- ✅ Checkout initiated
- ✅ Purchase completed with revenue tracking
- ✅ UTM parameter capture and attribution
- ✅ Search queries and results

### Data Quality
- ✅ Automatic deduplication
- ✅ Privacy policy enforcement
- ✅ Customer consent handling
- ✅ Data validation and normalization
- ✅ Event logging for debugging

### Multi-Store Support
- ✅ Isolated tracking per store
- ✅ Multiple Umami websites
- ✅ Brand-level configuration
- ✅ Provider-specific settings (Razorpay, Stripe, etc.)

### Reliability
- ✅ Async event forwarding (non-blocking)
- ✅ Health monitoring and logging
- ✅ Error tracking in database
- ✅ Automatic retry capability

## 📊 Event Flow Example

### Page View Event

1. **Client-side (storefront):**
   ```javascript
   // Pixel detects page load
   analytics.subscribe('page_viewed', (event) => {
     // Send to app server
     fetch('/api/ingest/pixel', {
       method: 'POST',
       body: JSON.stringify({
         name: 'page_viewed',
         url: 'https://store.com/products/123',
         referrer: 'https://google.com',
         // ... more data
       })
     });
   });
   ```

2. **Server-side (app):**
   ```typescript
   // POST /api/ingest/pixel
   // 1. Extract shop domain
   // 2. Normalize event
   // 3. Check privacy policy
   // 4. Deduplicate
   // 5. Capture UTM attribution
   // 6. Forward to Umami
   // 7. Return 200 OK
   ```

3. **Analytics (Umami):**
   ```
   Website: brand-uuid
   Type: pageview
   URL: https://store.com/products/123
   Referrer: https://google.com
   Title: Product Name
   ```

## 🔧 Configuration

### Database Schema

Key tables:
- **Session** - Shopify session management
- **Brand** - Multi-brand configuration
- **ShopConfig** - Store-specific settings
- **EventReceived** - Event audit log
- **Attribution** - UTM and attribution tracking
- **ProviderConnector** - Third-party integrations

### Extension Settings

The Web Pixel Extension accepts:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `serverEndpoint` | Text | Required | Ingestion endpoint URL |
| `accountID` | Text | Optional | Umami website UUID |
| `enableDebug` | Text | false | Console logging |

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Shopify
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=https://your-tunnel.ngrok-free.dev

# Security
SESSION_SECRET=random_secret

# Umami
UMAMI_ENDPOINT=https://umami.example.com
```

## 📡 API Endpoints

### POST /api/ingest/pixel

Receives events from Web Pixel Extension.

**Request:**
```json
{
  "name": "page_viewed",
  "timestamp": "2024-02-09T12:00:00Z",
  "shopDomain": "store.myshopify.com",
  "context": {
    "document": {
      "location": {
        "href": "https://store.com/products/123?utm_source=google",
        "hostname": "store.com",
        "pathname": "/products/123",
        "search": "?utm_source=google"
      },
      "referrer": "https://google.com",
      "title": "Product Name"
    }
  },
  "data": {
    "productVariant": { /* ... */ },
    "cart": { /* ... */ }
  }
}
```

**Response:**
```json
{
  "success": true,
  "eventKey": "store.myshopify.com-order-123-checkout_completed",
  "forwarded": true
}
```

**CORS:** Automatically allows requests from Shopify storefront

## 🧪 Testing

### Quick Test

```bash
# 1. Navigate store with Pixel Helper open
# 2. Check Pixel Helper shows events (green ✓)
# 3. Check database
sqlite3> SELECT COUNT(*) FROM "EventReceived";

# 4. Check Umami dashboard
# Should see events in Analytics → Pages or Events
```

### Full Test Procedure

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for:
- Step-by-step event generation
- Pixel Helper verification
- Database checks
- Umami validation
- Troubleshooting common issues

## 🔐 Security & Privacy

### Data Protection
- HTTPS-only communication
- Request validation
- CORS enforcement
- Shop domain verification

### Privacy Compliance
- Consent checking (ready for Shopify Privacy API)
- Customer data hashing
- Anonymization support
- GDPR/CCPA compliance hooks

### Best Practices
- Never expose Umami credentials to browser
- Use website UUID (public) instead
- Server-side validation of all events
- Deduplication to prevent tracking inflation

## 📈 Monitoring

### Database Monitoring

```sql
-- Check events received
SELECT event_name, COUNT(*) as count
FROM "EventReceived"
GROUP BY event_name
ORDER BY count DESC;

-- Check forwarding success rate
SELECT 
  forwarded_to_umami,
  COUNT(*) as count
FROM "EventReceived"
GROUP BY forwarded_to_umami;

-- Check for errors
SELECT event_name, umami_response
FROM "EventReceived"
WHERE forwarded_to_umami = false
LIMIT 10;
```

### Health Checks

```sql
-- Check recent errors
SELECT component, status, message, COUNT(*) as count
FROM "health_log"
WHERE created_at > now() - interval '1 hour'
GROUP BY component, status, message;

-- Monitor forwarding performance
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as events,
  SUM(CASE WHEN forwarded_to_umami THEN 1 ELSE 0 END) as forwarded
FROM "EventReceived"
WHERE created_at > now() - interval '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

## 🚢 Deployment

### Before Production

- [ ] Enable HTTPS everywhere
- [ ] Set `enableDebug: false` in pixel settings
- [ ] Configure error alerting
- [ ] Set up database backups
- [ ] Test with real payment processor
- [ ] Verify Umami goals and funnels configured

### Deploy App

```bash
# Test build
npm run build

# Deploy to Shopify
shopify app deploy

# Deploy extension (if modified)
shopify extension push
```

### Verify Production

1. Install app on live store
2. Test events with Pixel Helper
3. Verify events in Umami
4. Monitor error logs for issues

## 🐛 Troubleshooting

### Pixel Shows "Disconnected"

1. Check server logs: `npm run dev`
2. Look for `webPixelCreate` errors
3. Verify `SHOPIFY_APP_URL` is set
4. Clear browser cookies and retry

See [PIXEL_ACTIVATION.md](PIXEL_ACTIVATION.md) for detailed troubleshooting.

### Events Not Reaching Umami

1. Check `health_log` table for errors
2. Verify Umami website UUID is correct
3. Test Umami endpoint manually:
   ```bash
   curl -X POST https://umami.example.com/api/send \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```
4. Check Umami firewall/network access

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for full troubleshooting guide.

### High Duplicate Rate

1. Check `EventReceived` deduplication key
2. Verify event key uniqueness
3. Review browser console for duplicate events
4. Check if page is being refreshed

## 📞 Support & Resources

### Documentation
- [Shopify Web Pixel Extension](https://shopify.dev/docs/apps/build/pixel-apps)
- [Shopify Admin API](https://shopify.dev/api/admin-graphql)
- [Umami Analytics](https://umami.is/docs)
- [Shopify Pixel Helper](https://help.shopify.com/en/manual/products/pixel)

### Key Files
- `extensions/seleric-pixel/src/index.ts` - Pixel code
- `app/routes/api/ingest.pixel.ts` - Ingestion endpoint
- `app/services/umami-forwarder.ts` - Umami integration
- `app/routes/auth.$.tsx` - Pixel activation

### Common Commands

```bash
# Development
npm run dev --tunnel-url https://xxxx.ngrok-free.dev

# Building
npm run build

# Database
npm run setup              # Initialize/migrate
npx prisma studio         # Visual database browser
npx prisma db push        # Deploy schema

# Deployment
shopify app deploy         # Deploy app
shopify extension push     # Deploy extension
npm run lint              # Check code quality
npm run typecheck         # TypeScript validation
```

## 📝 License

Proprietary - All rights reserved

## 🤝 Contributing

For issues and improvements:

1. Create a test case in [TESTING_GUIDE.md](TESTING_GUIDE.md)
2. Document the expected behavior
3. Implement the fix
4. Verify with integration tests
5. Update relevant documentation

---

**Last Updated:** February 9, 2026  
**Version:** 1.0.0  
**Status:** Production Ready

For detailed setup instructions, see [UMAMI_INTEGRATION_GUIDE.md](UMAMI_INTEGRATION_GUIDE.md)
