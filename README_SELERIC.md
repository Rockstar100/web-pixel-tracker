# Seleric Tracker - Shopify to Umami Analytics

A comprehensive Shopify app that provides **client-side + server-side tracking** to Umami Analytics with multi-brand support, attribution tracking, and third-party payment provider integration.

## 🎯 Features

### Core Tracking
- **Client-Side Tracking**: Web Pixel extension captures high-fidelity storefront/checkout events
- **Server-Side Tracking**: Webhooks provide authoritative conversion data (no missed conversions)
- **Event Deduplication**: Smart dedupe logic prevents double-counting across sources
- **Multi-Brand Support**: Route events to different Umami website IDs per brand

### Advanced Capabilities
- **UTM Attribution**: Capture and persist first-touch/last-touch attribution
- **Payment Provider Connectors**: Modular framework for Razorpay, Stripe, etc.
- **Privacy-First**: SHA256 hashed customer identifiers, consent management
- **Health Monitoring**: Real-time event tracking health dashboard

## 🏗️ Architecture

```
┌─────────────────┐
│  Shopify Store  │
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
┌────────┐  ┌──────────┐
│ Pixel  │  │ Webhooks │
│ Events │  │ (Server) │
└───┬────┘  └────┬─────┘
    │            │
    └──────┬─────┘
           │
    ┌──────▼────────┐
    │ Normalization │
    │  + Dedupe     │
    └──────┬────────┘
           │
    ┌──────▼────────┐
    │   Attribution │
    │    Enrichment │
    └──────┬────────┘
           │
    ┌──────▼────────┐
    │ Umami Forward │
    │  (Multi-Brand)│
    └───────────────┘
```

## 📦 Installation

### 1. Prerequisites
- Node.js 20+ or 22.12+
- Shopify Partner account
- Umami Analytics instance

### 2. Clone and Setup
```bash
cd seleric-tracker
npm install
```

### 3. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init
```

### 4. Configure App
Create `.env` file:
```env
DATABASE_URL="file:./dev.sqlite"
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products,read_orders,read_customers,write_pixels

# Umami Configuration
UMAMI_ENDPOINT=https://umami.seleric.cloud/api/send
```

### 5. Start Development
```bash
npm run dev
```

## 🔧 Configuration

### Create a Brand
1. Navigate to `/dashboard?shop=your-store.myshopify.com`
2. Click "Add New Brand"
3. Enter:
   - **Brand Name**: Your brand name
   - **Umami Website UUID**: Get from Umami dashboard settings
   - **Default Currency**: e.g., USD, INR

### Map Shop to Brand
1. In Configuration section, select your brand
2. Enable tracking options:
   - ☑️ Pixel Tracking (client-side)
   - ☑️ Webhook Tracking (server-side)
3. Set consent mode (relaxed/strict)
4. Save configuration

### Register Webhooks
After installing the app on a shop, register these webhook topics:

```bash
# Via Shopify Admin API or app dashboard
- orders/create
- orders/paid
- orders/updated
- customers/create
- customers/update
```

Webhook URLs:
- `https://your-app.com/webhooks/orders/paid`
- `https://your-app.com/webhooks/orders/create`
- `https://your-app.com/webhooks/customers/create`

## 📊 Tracked Events

### Storefront (Pixel)
| Event | Umami Event Name | When Fired |
|-------|------------------|------------|
| Page View | `page_view` | Every page load |
| Product View | `product_view` | Product page visit |
| Add to Cart | `add_to_cart` | Item added to cart |
| Checkout Started | `begin_checkout` | Checkout initiated |
| Checkout Completed | `purchase_client` | Thank you page (may miss) |

### Server-Side (Webhooks)
| Webhook | Umami Event Name | Purpose |
|---------|------------------|---------|
| orders/paid | `purchase` | **Authoritative conversion** |
| orders/create | `order_created` | Order created (pre-payment) |
| customers/create | `customer_created` | New customer signup |

### Priority Rules
- **Server-side `purchase` > Client-side `purchase_client`**
- If both fire for same order, only `purchase` counts
- Pixel events used for attribution, webhooks for conversions

## 🔌 Provider Connectors

### Razorpay Integration

#### Setup
1. Create provider connector:
```sql
INSERT INTO ProviderConnector (shopifyShop, providerName, enabled, webhookSecret)
VALUES ('your-store.myshopify.com', 'razorpay', 1, 'your_razorpay_webhook_secret');
```

2. Configure Razorpay webhook:
   - **URL**: `https://your-app.com/webhooks/provider/razorpay?shop=your-store.myshopify.com`
   - **Secret**: Your webhook secret
   - **Events**: `payment.authorized`, `payment.captured`, `order.paid`

#### Tracked Events
- `payment.authorized` → `payment_authorized`
- `payment.captured` → `payment_captured` (conversion)
- `order.paid` → `razorpay_order_paid`

## 🎨 Admin UI

### Dashboard (`/dashboard`)
- **Event Statistics**: 7-day overview with forward rates
- **Brand Management**: Add/edit brands and Umami mappings
- **Shop Configuration**: Enable/disable tracking, consent settings
- **Health Logs**: Real-time component status monitoring

### Features
- Real-time event counts by source (pixel/webhook/provider)
- Event type breakdown
- Forward success rate tracking
- Recent activity logs with status indicators

## 🔐 Privacy & Consent

### Data Handling
- **Customer Emails**: SHA256 hashed before storage
- **No Raw PII**: Email, phone, addresses stripped from event payloads
- **Consent Modes**:
  - **Relaxed**: Track all events with hashed IDs
  - **Strict**: Only track when analytics consent granted

### GDPR Compliance
- Data retention: 90 days (events), 180 days (attribution)
- Auto-cleanup jobs available
- Customer identity anonymization

## 📈 Attribution Tracking

### Capture Strategy
- **First Touch**: UTM params from initial landing page
- **Last Touch**: Most recent UTM params before conversion
- **Order Attribution**: Attach UTM data to orders

### UTM Parameters Captured
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`

### Usage in Umami
All UTM params forwarded in event `data` object:
```json
{
  "name": "purchase",
  "data": {
    "order_id": "12345",
    "value": 99.99,
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "spring_sale"
  }
}
```

## 🛠️ Development

### Project Structure
```
seleric-tracker/
├── app/
│   ├── routes/
│   │   ├── dashboard.tsx          # Admin UI
│   │   ├── api/
│   │   │   └── ingest.pixel.ts    # Pixel ingestion
│   │   └── webhooks/
│   │       ├── orders.paid.ts     # Order webhooks
│   │       └── provider.$provider.ts  # Provider webhooks
│   └── services/
│       ├── normalizer.ts          # Event normalization
│       ├── deduplicator.ts        # Dedupe logic
│       ├── umami-forwarder.ts     # Umami API client
│       ├── attribution.ts         # Attribution tracking
│       └── providers/             # Payment provider connectors
│           ├── base.ts
│           └── razorpay.ts
├── extensions/
│   └── seleric-pixel/             # Web Pixel extension
│       └── src/index.ts
├── prisma/
│   └── schema.prisma              # Database schema
└── package.json
```

### Key Services

#### EventNormalizer
Converts pixel/webhook payloads → unified `NormalizedEvent` format

#### EventDeduplicator
Prevents duplicate events using composite keys (shop + order_id + event_type)

#### UmamiForwarder
Sends normalized events to Umami `/api/send` with correct website UUID

#### AttributionTracker
Captures, stores, and enriches events with UTM attribution

## 🧪 Testing

### Test Checklist
- [ ] Pixel events fire on storefront
- [ ] Checkout completion tracked (client + server)
- [ ] Duplicate purchase events deduped
- [ ] Multi-brand routing works correctly
- [ ] UTM parameters captured and forwarded
- [ ] Provider webhooks processed (if enabled)
- [ ] Dashboard shows correct stats

### Manual Test Flow
1. Visit storefront with `?utm_source=test&utm_campaign=demo`
2. Add product to cart
3. Complete checkout
4. Check dashboard:
   - Should see `add_to_cart`, `begin_checkout`, `purchase_client`, `purchase`
   - Only 1 purchase counted (not 2)
   - UTM data visible in Umami

## 🚀 Deployment

### Environment Variables
```env
DATABASE_URL=your_production_db_url
SHOPIFY_API_KEY=prod_key
SHOPIFY_API_SECRET=prod_secret
UMAMI_ENDPOINT=https://umami.seleric.cloud/api/send
NODE_ENV=production
```

### Database Migration
```bash
npx prisma migrate deploy
```

### Start Server
```bash
npm start
```

## 📝 API Endpoints

### Pixel Ingestion
```
POST /api/ingest/pixel
Headers:
  Content-Type: application/json
  X-Shopify-Shop-Domain: store.myshopify.com
Body: PixelEvent (see types.ts)
```

### Webhooks
```
POST /webhooks/orders/paid
POST /webhooks/orders/create
POST /webhooks/customers/create
Headers:
  X-Shopify-Shop-Domain: store.myshopify.com
  X-Shopify-Topic: orders/paid
  X-Shopify-Hmac-Sha256: signature
```

### Provider Webhooks
```
POST /webhooks/provider/razorpay?shop=store.myshopify.com
Headers:
  X-Razorpay-Signature: signature
Body: Provider-specific payload
```

## 🤝 Contributing

### Adding a New Provider
1. Create `app/services/providers/your-provider.ts`
2. Implement `PaymentProvider` interface
3. Register in `provider.$provider.ts`:
   ```typescript
   import { YourProvider } from "~/services/providers/your-provider";
   ProviderRegistry.register(new YourProvider());
   ```

## 📄 License

MIT

## 🆘 Support

For issues or questions:
1. Check dashboard health logs
2. Verify Umami website UUID is correct
3. Ensure webhooks are registered
4. Check network tab for failed requests

## 🎉 Credits

Built with:
- [Shopify Remix App](https://shopify.dev/docs/apps/tools/remix)
- [Umami Analytics](https://umami.is)
- [Prisma ORM](https://prisma.io)
