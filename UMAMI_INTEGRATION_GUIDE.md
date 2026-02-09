# Shopify App Pixel + Umami Analytics Integration Guide

This document explains how to set up and use the custom Shopify app pixel integration with Umami Analytics for the Seleric Tracker application.

## Overview

The Seleric Tracker uses a **Web Pixel Extension** to capture customer events from your Shopify storefront and forward them to your self-hosted Umami analytics instance. This provides privacy-friendly tracking across multiple stores with proper event attribution.

### Key Components

1. **Web Pixel Extension** (`extensions/seleric-pixel/`) - Client-side event capture
2. **Ingestion Endpoint** (`app/routes/api/ingest.pixel.ts`) - Server-side event processing
3. **Umami Forwarder** (`app/services/umami-forwarder.ts`) - Sends events to Umami
4. **Event Normalizer** - Standardizes events from different sources
5. **Deduplicator** - Prevents duplicate event tracking
6. **Attribution Tracker** - Captures UTM parameters and attribution data

## Setup Instructions

### 1. Development Environment Setup

#### Prerequisites

- Node.js 20.19+ or 22.12+
- PostgreSQL database
- Self-hosted Umami instance or cloud account
- ngrok or alternative tunnel service (for local testing)

#### Configuration

1. **Set up your tunnel URL:**

   If using ngrok:
   ```bash
   ngrok http 39351
   ```

   This gives you a public HTTPS URL like `https://your-tunnel.ngrok-free.dev`.

2. **Start the development server:**

   ```bash
   cd seleric-tracker
   shopify app dev --tunnel-url https://your-tunnel.ngrok-free.dev
   ```

   **Important:** Do NOT hardcode the tunnel URL in `shopify.app.toml`. Use the `--tunnel-url` flag instead. The CLI will:
   - Use the provided tunnel URL as the public address
   - Set `SHOPIFY_APP_URL` environment variable automatically
   - Update your app's whitelist URLs in Shopify Partner Dashboard
   - Listen on the local port (39351 by default)

3. **Environment Variables:**

   The app requires these environment variables:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/seleric_tracker
   SHOPIFY_APP_URL=https://your-tunnel.ngrok-free.dev  # Set by CLI if using --tunnel-url
   SHOPIFY_API_KEY=your_shopify_api_key
   SHOPIFY_API_SECRET=your_shopify_api_secret
   SESSION_SECRET=your_session_secret
   ```

### 2. Shopify App Configuration

Your app has the required scopes for pixel management already configured in `shopify.app.toml`:

```toml
[access_scopes]
scopes = "read_products,read_orders,read_customers,read_customer_events,write_pixels"
```

These scopes allow the app to:
- Create and update web pixels (`write_pixels`)
- Read customer events (`read_customer_events`)
- Access product and order data

### 3. Web Pixel Extension Setup

The pixel extension is configured in `extensions/seleric-pixel/shopify.extension.toml`.

#### Settings Schema

The extension accepts these configurable settings:

| Setting | Description | Type |
|---------|-------------|------|
| `serverEndpoint` | Full URL to your ingestion endpoint | Text |
| `enableDebug` | Enable console logging (for troubleshooting) | Text |

These settings are passed to the pixel when it's created via the `webPixelCreate` mutation in `app/routes/auth.$.tsx`.

#### How the Extension Works

1. **Registration**: When the pixel loads on the storefront, it registers with Shopify's Pixel API
2. **Session Tracking**: A session ID cookie (`_seleric_sid`) is created/retrieved for user tracking
3. **Event Subscription**: The pixel subscribes to all relevant Shopify events:
   - `page_viewed` - User views a page
   - `product_viewed` - User views a product
   - `product_added_to_cart` - Item added to cart
   - `checkout_started` - Checkout begins
   - `checkout_completed` - Purchase completes
   - And more...

4. **Data Forwarding**: For each event, the extension:
   - Extracts event data and page context
   - Builds a payload with event details
   - Sends it to your app's `/api/ingest/pixel` endpoint via POST

### 4. Pixel Activation (webPixelCreate)

When the app is installed on a Shopify store:

1. The `auth.$.tsx` loader runs on first authentication
2. It checks if a web pixel already exists for your app
3. If not, it calls `webPixelCreate` mutation to create one with:
   - `serverEndpoint`: Points to your app's `/api/ingest/pixel` route
   - `enableDebug`: Set to false for production
4. If one exists, it updates it with the current settings
5. The pixel becomes **Connected** in Shopify Admin (Settings → Customer events → App pixels)

### 5. Event Ingestion Flow

When the pixel captures an event on the storefront:

1. **Client-side** (pixel extension):
   - Event fires in Shopify Pixel API
   - Extension builds JSON payload
   - Sends `POST` request to `/api/ingest/pixel`

2. **Server-side** (ingest endpoint):
   - Receives raw pixel event
   - Extracts shop domain from request headers or payload
   - Looks up shop configuration in database
   - Normalizes event using `EventNormalizer`
   - Checks privacy policy via `PrivacyManager`
   - Deduplicates using `EventDeduplicator`
   - Captures UTM attribution via `AttributionTracker`
   - Enriches event with attribution data
   - Forwards to Umami via `UmamiForwarder`
   - Returns 200 OK to pixel (non-blocking)

3. **Umami forwarding**:
   - Converts normalized event to Umami payload format
   - Sends `POST` to Umami's `/api/send` endpoint
   - Includes website ID, URL, referrer, event name, and custom data
   - Logs success/failure to database

### 6. Configuring Umami

#### Multi-Brand Setup

For each Shopify store (brand), create a corresponding Umami website:

1. **In Umami Dashboard**:
   - Create a new Website with a name like "MyStore - Shopify"
   - Get the Website UUID (shown in settings)

2. **In Seleric Tracker**:
   - Create a `Brand` record with the Umami website UUID
   - Create a `ShopConfig` record linking the Shopify store to the brand
   - The app will use the brand's Umami UUID when forwarding events

#### Event Mapping

Shopify events are mapped to Umami event names:

| Shopify Event | Umami Type | Description |
|--------------|-----------|-------------|
| `page_viewed` | Page View | Page load (tracked as pageview) |
| `product_viewed` | Custom Event | Product page viewed |
| `product_added_to_cart` | Custom Event | Item added to cart |
| `product_removed_from_cart` | Custom Event | Item removed from cart |
| `checkout_started` | Custom Event | Checkout initiated |
| `checkout_completed` | Custom Event (Revenue) | Purchase completed |

All events include:
- **Referrer**: Where the user came from
- **URL**: Page/checkout URL with UTM parameters
- **Custom Data**: Product IDs, order totals, etc.

### 7. Testing the Integration

#### Using Shopify Pixel Helper

1. **Install the Pixel Helper browser extension** (from Shopify App Store)

2. **In Shopify Admin**:
   - Go to Settings → Customer events → App pixels
   - Find "Seleric-Tracker" pixel
   - Click the ⋮ (More) button and select **Test**
   - A red banner with event details appears at the top of your store

3. **Generate test events**:
   - **Page View**: Browse to your store homepage
   - **Product View**: Click on a product
   - **Add to Cart**: Add a product to your cart
   - **Checkout**: Proceed through checkout (use a test payment method)
   - **Purchase**: Complete the order

4. **Monitor results**:
   - ✅ **Green** = Event fired successfully and sent to your endpoint
   - ❌ **Red** = Error occurred (check error message in Pixel Helper)

#### Checking Server Logs

Watch your app server logs during testing:

```bash
npm run dev
```

You should see requests like:

```
POST /api/ingest/pixel - 200 OK
```

Look for any errors about:
- CORS issues (check request origin)
- Shop not found (verify shop domain)
- Umami forwarding failures (check endpoint and network)

#### Verifying in Umami

1. **Check Dashboard**:
   - Pages should show in the Pages report
   - Custom events should appear in the Events section
   - Revenue should be tracked for purchases

2. **Verify Data Quality**:
   - Session count matches your test sessions
   - Event names are correct
   - Event data (product ID, order total) is populated
   - UTM parameters are captured

### 8. Best Practices

#### Performance

- The pixel uses `fetch` with `keepalive: true` to send events asynchronously
- The ingestion endpoint responds immediately (200 OK) without waiting for Umami
- Events are forwarded to Umami as background tasks
- Minimal data is sent (only necessary fields)

#### Reliability

- **Deduplication**: Prevents duplicate events from the same action
- **Session Tracking**: Maintains user sessions with cookies
- **Error Logging**: All failures are logged to `health_log` table
- **Retry Logic**: Failed events can be retried via the health check system

#### Privacy

- Implement consent checking (TODO: integrate Shopify Privacy API)
- Use `PrivacyManager` to apply privacy policies
- Anonymize customer data via `privacy.ts` service
- GDPR/CCPA compliance via consent mode settings

#### Multi-Store Support

- Each store has its own `ShopConfig` and Umami website
- Events are isolated per store/brand
- Attribution is tracked per session
- Provider settings (Razorpay, Stripe) are stored per shop

### 9. Troubleshooting

#### Pixel shows "Disconnected"

**Problem**: Web pixel appears disconnected in Shopify Admin

**Solution**:
1. Check that the app is installed on the store
2. Verify `auth.$.tsx` loader ran (check logs for webPixelCreate attempt)
3. Ensure `SHOPIFY_APP_URL` environment variable is set correctly
4. Try manually running the webPixelCreate mutation from GraphiQL

#### Events not reaching server

**Problem**: Pixel Helper shows ✅ but `/api/ingest/pixel` logs show no requests

**Possible causes**:
1. **CORS Error**: Check browser console for CORS errors
   - Fix: Ensure `getCorsHeaders()` in ingest endpoint includes storefront origin
   - The current implementation uses `request.headers.get("Origin")` which should work

2. **Wrong Endpoint URL**: Check Pixel Helper settings
   - Verify `serverEndpoint` setting matches your `SHOPIFY_APP_URL`
   - Should be: `https://your-tunnel.ngrok-free.dev/api/ingest/pixel`

3. **Network Error**: Check browser Network tab
   - Look for failed POST requests to your ingestion endpoint
   - Check response status and error messages

#### Events not in Umami

**Problem**: Events reach your server but don't appear in Umami

**Possible causes**:
1. **Wrong Umami Website ID**:
   - Verify `shopConfig.brand.umamiWebsiteUuid` matches the website in Umami
   - Check that website exists and is enabled in Umami

2. **Wrong Umami Endpoint**:
   - Verify `shopConfig.umamiEndpoint` points to your Umami instance
   - Default: `https://umami.seleric.cloud/api/send`
   - Check connectivity: `curl -X POST https://your-umami/api/send`

3. **Payload Format Error**:
   - Check `UmamiForwarder.buildUmamiPayload()`
   - Compare against Umami API documentation
   - Check `health_log` table for error details

4. **Blocked by Ad Blocker**:
   - Umami requests might be blocked by browser extensions
   - Test in a private/incognito window

#### High Duplicate Rates

**Problem**: Same events appearing multiple times in Umami

**Solution**:
1. Check event deduplication logic in `EventDeduplicator`
2. Verify event key generation is unique
3. Review `eventKey` in database to spot patterns
4. Increase deduplication window if needed

### 10. Advanced Configuration

#### Custom Event Naming

Modify the `analyticsEventNameMap` in `EventNormalizer` to create custom event names:

```typescript
private static analyticsEventNameMap: Record<string, string> = {
  'page_viewed': 'Page View',
  'product_added_to_cart': 'Added to Cart',
  'checkout_completed': 'Purchase',
  // Add your custom mappings
};
```

#### Provider Integration (Razorpay, Stripe)

The system supports third-party payment providers. Configuration is stored in `providerSettings`:

```json
{
  "razorpay": {
    "enabled": true,
    "webhookSecret": "your_webhook_secret"
  }
}
```

See `app/routes/api/ingest.pixel.ts` for integration details.

#### Custom Privacy Rules

Implement consent checking in `PrivacyManager.applyPrivacyPolicy()`:

```typescript
// TODO: Integrate Shopify Customer Privacy API
const hasConsent = await getConssentStatus(shopifyCustomerId);
```

### 11. Production Deployment

#### Before Going Live

1. ✅ Test all event types (page view, add to cart, purchase)
2. ✅ Verify data in Umami dashboard
3. ✅ Configure privacy settings and consent
4. ✅ Set up database backups
5. ✅ Configure monitoring/alerting on health_log table
6. ✅ Set `enableDebug: false` in pixel settings

#### Deployment Steps

1. **Deploy app**:
   ```bash
   shopify app deploy
   ```

2. **Deploy extension**:
   ```bash
   shopify extension push
   ```

3. **Verify on production store**:
   - Install app on live store
   - Test events with Pixel Helper
   - Monitor Umami dashboard

4. **Monitor health**:
   ```sql
   SELECT status, COUNT(*) FROM health_log
   WHERE component = 'umami_forward'
   AND created_at > now() - interval '1 hour'
   GROUP BY status;
   ```

### 12. Reference Links

- [Shopify Web Pixel Extension Docs](https://shopify.dev/docs/apps/build/pixel-apps)
- [Umami Analytics API](https://umami.is/docs/api)
- [Shopify Admin API - Web Pixels](https://shopify.dev/api/admin-graphql/2024-01/mutations/webPixelCreate)
- [Shopify Pixel Helper](https://help.shopify.com/en/manual/products/pixel)

---

## Support

For issues or questions:
1. Check `health_log` table for error details
2. Review browser console in Pixel Helper
3. Verify database connectivity
4. Check environment variables
5. Review logs in your Umami instance

