# Testing Guide: Shopify Pixel + Umami Integration

This guide walks you through testing the complete event flow from your Shopify storefront to Umami analytics.

## Pre-Test Checklist

Before running tests, ensure:

- [ ] App is installed on a Shopify development store
- [ ] Web Pixel Extension is showing as **Connected** (not "Disconnected")
- [ ] `SHOPIFY_APP_URL` environment variable is set to your tunnel URL
- [ ] Umami instance is running and accessible
- [ ] PostgreSQL database is running and migrations are applied
- [ ] Development server is running (`npm run dev --tunnel-url ...`)
- [ ] Pixel Helper browser extension is installed

## Step 1: Verify Pixel is Connected

### In Shopify Admin

1. Go to **Settings** → **Customer events** → **App pixels**
2. Find **Seleric-Tracker** (or your app name)
3. Check status - should show **Connected** (green checkmark)

### If Status is "Disconnected"

1. Check app server logs for webPixelCreate errors:
   ```bash
   # Look for logs like:
   # "Web pixel creation returned errors:" or "Failed to create web pixel:"
   ```

2. Verify `SHOPIFY_APP_URL` environment variable:
   ```bash
   # Should match your tunnel URL
   # Example: https://abc123.ngrok-free.dev
   ```

3. Check that the pixel extension built successfully:
   ```bash
   ls -la extensions/seleric-pixel/dist/
   # Should contain compiled JavaScript
   ```

4. Manually test webPixelCreate mutation:
   - In Shopify Admin, go to **Settings** → **Apps and integrations** → **Develop apps**
   - Select your app → **Configuration** → **Admin API access scopes**
   - Verify `write_pixels` is enabled
   - Click **GraphiQL app** in the left sidebar
   - Run the test mutation from `PIXEL_ACTIVATION.md`

## Step 2: Install Shopify Pixel Helper

1. [Download Pixel Helper](https://shopify.app/services/google_pixel_helper) from Chrome Web Store
2. Pin it to your toolbar for easy access
3. Reload your store page

## Step 3: Test Page View Event

### Generate the Event

1. Open your development store's storefront
2. Navigate to **Home** page (fresh page load)
3. The browser should send a `page_viewed` event

### Check Pixel Helper

1. Click **Pixel Helper** icon in toolbar
2. You should see the **red banner** at the top with events
3. Look for **page_viewed** event:
   - ✅ Green check = Event fired successfully
   - ❌ Red X = Error occurred

### Check Server Logs

```
POST /api/ingest/pixel 200 OK
```

### Check Umami Dashboard

1. Log into your Umami instance
2. Select the correct **Website** (should match your store's brand)
3. Go to **Pages** report
4. You should see your storefront URL listed

## Step 4: Test Product Viewed Event

### Generate the Event

1. From homepage, click on any product to view product details
2. The extension should fire a `product_viewed` event

### Check Pixel Helper

1. In the red Pixel Helper banner, you should see a new event
2. Event name: `product_viewed`
3. Event data should include product information

### Check Server Logs

```
POST /api/ingest/pixel 200 OK
```

### Check Umami Dashboard

1. Go to **Events** section
2. Look for **product_viewed** in the event list
3. Click to see event details and properties

## Step 5: Test Add to Cart Event

### Generate the Event

1. On a product page, click **Add to cart**
2. Confirm the product was added

### Check Pixel Helper

1. New event should appear: `product_added_to_cart`
2. Event data should show:
   - Cart ID
   - Product variant info
   - Cart totals

### Check Server Logs

```
POST /api/ingest/pixel 200 OK
```

### Check Umami Dashboard

1. Go to **Events**
2. Filter by **product_added_to_cart**
3. Verify event data includes cart information

## Step 6: Test Checkout Started Event

### Generate the Event

1. Click **Go to checkout** or **Proceed to checkout**
2. You'll be redirected to the checkout page

### Check Pixel Helper

1. New event: `checkout_started`
2. Event data should include:
   - Checkout token
   - Line items
   - Total price
   - Currency code

### Check Server Logs

```
POST /api/ingest/pixel 200 OK
```

## Step 7: Test Checkout Completed (Purchase) Event

### Generate the Event

1. Complete the checkout:
   - Fill in customer information
   - Select shipping method
   - Select payment method
   - Click **Complete purchase**

2. For test payment:
   - Card number: **4111 1111 1111 1111**
   - Expiry: Any future date (e.g., 12/25)
   - CVV: Any 3 digits (e.g., 123)

3. You'll be redirected to order confirmation page

### Check Pixel Helper

1. New event: `checkout_completed`
2. Event data should include:
   - Order ID
   - Order total (amount)
   - Currency code
   - Line items with quantities and prices

### Check Server Logs

```
POST /api/ingest/pixel 200 OK
```

### Check Umami Dashboard

1. Go to **Conversions** (if configured) or **Events**
2. Look for **checkout_completed** event
3. This is your **revenue event** - verify:
   - Order total is captured
   - Product details are included
   - Currency is correct

## Step 8: Test UTM Attribution

### Generate the Event

1. In your browser address bar, add UTM parameters:
   ```
   https://yourstore.myshopify.com/?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale
   ```

2. Load the page
3. Navigate through and make a purchase

### Check Pixel Helper

1. All events should fire normally
2. `page_viewed` event should show URL with UTM parameters

### Check Server Logs

```
POST /api/ingest/pixel 200 OK
```

### Check Umami Dashboard

1. Go to **Goals** or **Events**
2. For the purchase event, check **Event Data**
3. You should see:
   - `utm_source: google`
   - `utm_medium: cpc`
   - `utm_campaign: summer_sale`

## Step 9: Test Multi-Store Support

If you have multiple stores configured:

### Setup

1. Install app on another Shopify development store
2. Go through web pixel activation for that store
3. Ensure each store's `ShopConfig` points to the correct Umami website UUID

### Test

1. Navigate the first store and make a purchase
2. Navigate the second store and make a purchase
3. Check Umami:
   - First store's events appear in first website
   - Second store's events appear in second website
   - No data mixing between stores

## Step 10: Troubleshooting Common Issues

### Issue: Pixel Helper Shows Red X (Event Error)

**Possible causes:**

1. **CORS Error** - Check browser console:
   ```
   Access to XMLHttpRequest from storefront blocked by CORS policy
   ```
   
   **Fix:**
   - Check `getCorsHeaders()` in `app/routes/api/ingest.pixel.ts`
   - Verify `serverEndpoint` setting has correct origin
   - Restart development server

2. **Network Error** - Check browser console:
   ```
   Failed to fetch POST /api/ingest/pixel
   ```
   
   **Fix:**
   - Verify tunnel URL is correct
   - Check that development server is running
   - Verify `serverEndpoint` setting matches tunnel URL

3. **JavaScript Error** - Pixel Helper shows error message
   
   **Fix:**
   - Check browser console for errors
   - Look for syntax errors in pixel extension code
   - Verify `extensions/seleric-pixel/dist/` exists and has compiled code

### Issue: Events Reach Server but Not Umami

**Check database:**

```sql
-- Check if events were received
SELECT event_name, COUNT(*) as count
FROM "EventReceived"
GROUP BY event_name;

-- Check if events were forwarded
SELECT event_type, forwarded_to_umami, COUNT(*) as count
FROM "EventReceived"
GROUP BY event_type, forwarded_to_umami;

-- Check for forwarding errors
SELECT event_name, umami_response
FROM "EventReceived"
WHERE forwarded_to_umami = false;
```

**Check server logs for Umami errors:**

```
Failed to forward event to Umami: Network error
Failed to forward event to Umami: 404 Not Found
Failed to forward event to Umami: Invalid website UUID
```

**Verify Umami connection:**

```bash
# Test Umami endpoint
curl -X POST https://your-umami.com/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pageview",
    "payload": {
      "website": "your-umami-website-uuid",
      "url": "https://example.com",
      "title": "Test Page",
      "referrer": ""
    }
  }'
```

### Issue: High Duplicate Event Rate

**Check deduplication:**

```sql
-- Look for events with same key
SELECT event_key, COUNT(*) as count
FROM "EventReceived"
GROUP BY event_key
HAVING COUNT(*) > 1;
```

**Possible causes:**

1. User refreshed page (same event fired twice)
2. Event subscription fired multiple times
3. Deduplication window too short

**Fix:**

- Check `EventDeduplicator` configuration
- Adjust deduplication TTL if needed
- Verify event key generation in `normalizer.ts`

### Issue: Umami Shows Events but Page View Count is Wrong

**Possible causes:**

1. `page_viewed` events not being tracked as pageviews
2. Multiple page views for single page load
3. Bot/crawler traffic being tracked

**Check:**

```javascript
// In browser console on storefront
console.log('_seleric_sid cookie:', document.cookie)
```

**Fix:**

- Verify `page_viewed` event mapping in `UmamiForwarder`
- Check if Umami is filtering out duplicate pageviews
- Review Umami's bot detection settings

## Performance Testing

### Monitor Resource Usage

1. **Browser DevTools** → **Network** tab
2. Load a product page
3. Check for:
   - Pixel extension load time
   - Event POST size (should be <5KB)
   - POST response time (should be <500ms)

### Test Page Performance Impact

1. Use **Lighthouse** in Chrome DevTools
2. Compare performance metrics:
   - Without pixel: Baseline
   - With pixel: Should have <5% impact
3. Check for layout shifts caused by pixel

## Data Quality Testing

### Verify Event Data Completeness

```sql
-- Check for missing data fields
SELECT
  event_name,
  (event_data::jsonb ? 'orderId')::int as has_order_id,
  (event_data::jsonb ? 'productId')::int as has_product_id,
  COUNT(*) as count
FROM "EventReceived"
WHERE event_name = 'checkout_completed'
GROUP BY event_name, has_order_id, has_product_id;
```

### Verify UTM Capture

```sql
-- Check UTM parameter capture rate
SELECT
  (event_data::jsonb ->> 'utm_source') as source,
  (event_data::jsonb ->> 'utm_medium') as medium,
  COUNT(*) as count
FROM "EventReceived"
WHERE event_data::jsonb ? 'utm_source'
GROUP BY source, medium;
```

### Verify Customer Hashing

```sql
-- Check for properly hashed customer data
SELECT
  (event_data::jsonb ? 'customer_id')::int as has_customer_id,
  COUNT(*) as count
FROM "EventReceived"
GROUP BY has_customer_id;
```

## Load Testing

### Simulate High Traffic

Use Apache Bench or similar:

```bash
# Simulate 100 concurrent requests
ab -n 1000 -c 100 \
  -H "X-Shopify-Shop-Domain: teststore.myshopify.com" \
  -H "Content-Type: application/json" \
  -p payload.json \
  https://your-app.ngrok-free.dev/api/ingest/pixel
```

### Monitor Performance

- Watch server response times
- Monitor database connection pool
- Check Umami API rate limits
- Verify no timeouts or errors

## Final Verification Checklist

- [ ] Pixel shows as "Connected" in Shopify Admin
- [ ] All event types fire successfully (green check in Pixel Helper)
- [ ] Events appear in Umami dashboard
- [ ] Event data is complete and accurate
- [ ] UTM parameters are captured
- [ ] Multi-store data is properly isolated
- [ ] No CORS errors in browser console
- [ ] Server logs show successful POST requests
- [ ] Database contains all events
- [ ] Page performance impact is minimal (<5%)

## Next Steps

Once testing is complete:

1. **Enable debug logging** - Set `enableDebug: false` in pixel settings
2. **Monitor health** - Set up alerts on `health_log` table errors
3. **Prepare for production** - Follow deployment guide in `UMAMI_INTEGRATION_GUIDE.md`
4. **Configure Umami Goals** - Set up revenue tracking and custom goals
5. **Train team** - Show them how to use Umami dashboard for analytics

## Support

If you encounter issues:

1. Check `health_log` table for error details
2. Review browser console in Pixel Helper for error messages
3. Check server logs for exceptions
4. Verify database connectivity
5. Confirm Umami endpoint is accessible

---

Last updated: 2026-02-09
