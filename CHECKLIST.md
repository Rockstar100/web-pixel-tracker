# 📋 Seleric Tracker - Complete Checklist

## ✅ Pre-Development Setup

### Environment Setup
- [ ] Node.js 20+ or 22.12+ installed
- [ ] Git installed and configured
- [ ] Code editor ready (VS Code recommended)
- [ ] Terminal/command line access

### Shopify Setup
- [ ] Shopify Partner account created
- [ ] Development store created
- [ ] App created in Partners dashboard
- [ ] API key and secret obtained
- [ ] OAuth redirect URLs configured

### Umami Setup
- [ ] Umami instance accessible (https://umami.seleric.cloud)
- [ ] Account created and logged in
- [ ] At least one website created
- [ ] Website UUID copied from settings

---

## 🔧 Installation & Configuration

### 1. Install Dependencies
```bash
cd seleric-tracker
npm install
```
- [ ] Dependencies installed successfully
- [ ] No critical errors in output

### 2. Database Setup
```bash
npx prisma generate
npx prisma migrate dev --name init
```
- [ ] Prisma client generated
- [ ] Database created (dev.sqlite)
- [ ] All tables created successfully

### 3. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your values
```
- [ ] `.env` file created
- [ ] `SHOPIFY_API_KEY` set
- [ ] `SHOPIFY_API_SECRET` set
- [ ] `DATABASE_URL` configured
- [ ] `UMAMI_ENDPOINT` verified

### 4. Extension Build
```bash
cd extensions/seleric-pixel
npm install
```
- [ ] Pixel extension dependencies installed
- [ ] No build errors

---

## 🚀 Development Testing

### 1. Start Development Server
```bash
npm run dev
```
- [ ] Server starts without errors
- [ ] ngrok tunnel URL displayed
- [ ] App URL accessible

### 2. Install on Dev Store
- [ ] Navigate to install URL
- [ ] Approve permissions
- [ ] App installed successfully
- [ ] Redirected to dashboard

### 3. Create First Brand
**Dashboard Actions:**
- [ ] Click "Add New Brand"
- [ ] Enter brand name
- [ ] Paste Umami Website UUID
- [ ] Set currency (e.g., USD)
- [ ] Click "Create Brand"
- [ ] Brand appears in list

### 4. Configure Shop
- [ ] Select brand from dropdown
- [ ] Enable "Pixel Tracking"
- [ ] Enable "Webhook Tracking"
- [ ] Set consent mode to "Relaxed"
- [ ] Click "Save Configuration"
- [ ] Success message appears

---

## 🧪 Functionality Testing

### Pixel Events

**Test 1: Page View**
- [ ] Visit storefront: `https://your-store.myshopify.com/?utm_source=test&utm_campaign=demo`
- [ ] Check dashboard → Event Statistics
- [ ] See `page_view` event
- [ ] UTM captured in event

**Test 2: Product View**
- [ ] Click on any product
- [ ] Dashboard shows `product_view` event
- [ ] Product data visible in logs

**Test 3: Add to Cart**
- [ ] Add product to cart
- [ ] Dashboard shows `add_to_cart` event
- [ ] Cart data captured

**Test 4: Checkout Started**
- [ ] Go to cart, click checkout
- [ ] Dashboard shows `begin_checkout` event
- [ ] Checkout token captured

**Test 5: Checkout Completed (Pixel)**
- [ ] Complete checkout (use Shopify test mode)
- [ ] Dashboard shows `purchase_client` event
- [ ] Order data present

### Webhook Events

**Test 6: Order Paid (Server)**
- [ ] After completing checkout, wait 10-30 seconds
- [ ] Dashboard should show `purchase` event
- [ ] Event source: `webhook`
- [ ] Order ID matches test order

**Test 7: Deduplication**
- [ ] Both `purchase_client` and `purchase` visible
- [ ] Different event keys
- [ ] Both forwarded to Umami
- [ ] Only 1 conversion counted (verify in Umami)

### Umami Verification

**Test 8: Events in Umami**
- [ ] Login to Umami dashboard
- [ ] Select your website
- [ ] Navigate to Events tab
- [ ] See event names: `page_view`, `add_to_cart`, `purchase`
- [ ] Click on `purchase` event
- [ ] View event data:
  - [ ] `order_id` present
  - [ ] `value` present
  - [ ] `currency` correct
  - [ ] `utm_source` = "test"
  - [ ] `utm_campaign` = "demo"

### Attribution Testing

**Test 9: UTM Capture**
- [ ] Visit with UTM: `?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale`
- [ ] Add product to cart
- [ ] Complete checkout
- [ ] Check Attribution table in database (or Prisma Studio)
- [ ] UTM params stored correctly
- [ ] Attached to order

**Test 10: First-Touch Attribution**
- [ ] Clear cookies/use incognito
- [ ] Visit with UTM params
- [ ] Attribution record created with `firstTouch: true`
- [ ] Later visits update but don't overwrite first-touch

---

## 🔌 Provider Integration (Optional)

### Razorpay Setup (if needed)

**Database Configuration:**
```sql
INSERT INTO ProviderConnector (id, shopifyShop, providerName, enabled, webhookSecret)
VALUES ('uuid-here', 'your-store.myshopify.com', 'razorpay', 1, 'your_webhook_secret');
```
- [ ] Connector record created
- [ ] Webhook secret set

**Razorpay Dashboard:**
- [ ] Login to Razorpay
- [ ] Navigate to Webhooks
- [ ] Create webhook
- [ ] URL: `https://your-app.com/webhooks/provider/razorpay?shop=your-store.myshopify.com`
- [ ] Secret entered
- [ ] Events selected: `payment.captured`, `order.paid`
- [ ] Webhook active

**Test Razorpay:**
- [ ] Complete Razorpay payment
- [ ] Webhook received
- [ ] Event normalized
- [ ] Forwarded to Umami
- [ ] Visible in dashboard

---

## 📊 Dashboard Verification

### Statistics Panel
- [ ] Shows "Total Events" count
- [ ] Shows "Forwarded to Umami" count
- [ ] Shows "Forward Rate" percentage
- [ ] Breakdown by source (pixel, webhook, provider)
- [ ] Breakdown by type (pageview, cart, checkout, conversion)

### Health Logs
- [ ] Recent events visible
- [ ] Green status for successful operations
- [ ] No red errors (or errors are understood)
- [ ] Timestamps recent and correct
- [ ] Component names clear (pixel, webhook, umami_forward)

### Brand Management
- [ ] All brands listed
- [ ] Correct Umami UUIDs displayed
- [ ] Shop counts accurate
- [ ] Enable/disable status working

---

## 🔒 Privacy & Security Testing

### Privacy Compliance
- [ ] Customer emails hashed (not stored in plain text)
- [ ] PII stripped from event data
- [ ] Consent mode respected
- [ ] Test strict mode: events blocked without consent

### Security
- [ ] HTTPS in production
- [ ] Webhook HMAC verification (production only)
- [ ] Environment variables not committed to git
- [ ] API keys secure

---

## 🚀 Production Readiness

### Pre-Production Checklist

**Database:**
- [ ] Switch to PostgreSQL (not SQLite)
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Backup strategy in place
- [ ] Connection pooling configured

**Environment:**
- [ ] `NODE_ENV=production`
- [ ] All secrets in environment variables
- [ ] No hardcoded credentials
- [ ] Logging configured

**Security:**
- [ ] HMAC verification enabled in webhook handlers
- [ ] Webhook secret obtained from Shopify
- [ ] HTTPS enforced
- [ ] CORS configured properly

**Performance:**
- [ ] Database indexes created
- [ ] Query optimization reviewed
- [ ] Rate limiting configured
- [ ] Caching strategy (if needed)

**Monitoring:**
- [ ] Health logs being written
- [ ] Error tracking setup (Sentry, etc.)
- [ ] Uptime monitoring configured
- [ ] Alert system ready

### Deployment Steps

**1. Build:**
```bash
npm run build
```
- [ ] Build successful
- [ ] No TypeScript errors
- [ ] Assets compiled

**2. Deploy:**
- [ ] Hosting provider chosen (Railway, Heroku, AWS)
- [ ] Environment variables configured
- [ ] Database connected
- [ ] App deployed and accessible

**3. Shopify Configuration:**
- [ ] Production app URL updated
- [ ] OAuth redirects updated
- [ ] Webhooks registered:
  - [ ] `orders/create`
  - [ ] `orders/paid`
  - [ ] `orders/updated`
  - [ ] `customers/create`

**4. Verification:**
- [ ] Install app on production store
- [ ] Complete test order
- [ ] Verify events in Umami
- [ ] Check health logs
- [ ] Monitor for 24 hours

---

## 📈 Post-Launch

### Week 1
- [ ] Monitor health logs daily
- [ ] Check forward success rate (should be >95%)
- [ ] Verify events in Umami
- [ ] Address any errors
- [ ] User feedback collected

### Week 2-4
- [ ] Review attribution data
- [ ] Analyze conversion funnel
- [ ] Optimize any bottlenecks
- [ ] Consider scaling needs

### Ongoing
- [ ] Weekly health check
- [ ] Monthly cleanup: `EventDeduplicator.cleanup(90)`
- [ ] Quarterly attribution reports
- [ ] Feature requests & improvements

---

## 🎓 Training & Documentation

### For Developers
- [ ] Read `IMPLEMENTATION_SUMMARY.md`
- [ ] Review service layer (`app/services/`)
- [ ] Understand event flow
- [ ] Know how to add providers

### For Admins
- [ ] Read `README_SELERIC.md`
- [ ] Understand dashboard sections
- [ ] Know how to create brands
- [ ] Can troubleshoot common issues

### For Support
- [ ] Read `SETUP_GUIDE.md`
- [ ] Familiar with health logs
- [ ] Know common error fixes
- [ ] Can verify Umami setup

---

## 🐛 Common Issues & Solutions

### Issue: "Shop not configured"
**Fix:**
- [ ] Brand created
- [ ] Shop mapped to brand
- [ ] Configuration saved

### Issue: Events not in Umami
**Check:**
- [ ] Umami Website UUID correct
- [ ] Umami endpoint reachable
- [ ] Health logs show successful forwards
- [ ] Network tab shows 200 responses

### Issue: Duplicate purchases
**Explanation:**
- [ ] This is expected!
- [ ] `purchase_client` (pixel) stored
- [ ] `purchase` (webhook) stored
- [ ] Only webhook counts as conversion
- [ ] Both useful for debugging

### Issue: Missing UTM
**Fix:**
- [ ] UTM in URL on first visit
- [ ] Attribution capture enabled
- [ ] Check Attribution table
- [ ] Verify enrichment logic

### Issue: Webhooks not firing
**Fix:**
- [ ] Webhooks registered in Shopify
- [ ] Correct webhook URLs
- [ ] HMAC verification working
- [ ] Check Shopify webhook delivery logs

---

## ✅ Final Sign-Off

### Development Complete
- [ ] All features implemented
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Code reviewed

### Testing Complete
- [ ] Unit tests (if any)
- [ ] Integration tests passed
- [ ] Manual testing done
- [ ] Edge cases handled

### Production Ready
- [ ] Security hardened
- [ ] Performance optimized
- [ ] Monitoring in place
- [ ] Deployment tested

### Launch Ready
- [ ] Stakeholders informed
- [ ] Support team trained
- [ ] Documentation published
- [ ] Rollout plan ready

---

## 🎉 Congratulations!

If all items are checked, you're **100% ready** to launch Seleric Tracker!

**Your tracking system is:**
- ✅ Fully functional
- ✅ Privacy compliant
- ✅ Multi-brand capable
- ✅ Production ready
- ✅ Well documented

**Now go track some conversions!** 🚀📈
