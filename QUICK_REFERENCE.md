# Shopify App Pixel + Umami Integration - Quick Reference Card

## 🚀 Quick Start (5 minutes)

```bash
# 1. Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost/seleric_tracker"
export SHOPIFY_API_KEY="your_key"
export SHOPIFY_API_SECRET="your_secret"
export SESSION_SECRET="random_string"

# 2. Setup database
cd seleric-tracker
npm install
npm run setup

# 3. Start ngrok tunnel (Terminal 1)
ngrok http 39351
# Get tunnel URL: https://xxxx.ngrok-free.dev

# 4. Start dev server (Terminal 2)
npm run dev --tunnel-url https://xxxx.ngrok-free.dev

# 5. Complete OAuth in browser
# Select development store, install app
```

## 📊 Event Flow Diagram

```
┌─────────────────┐
│ Shopify         │
│ Storefront      │
└────────┬────────┘
         │ Customer Action
         │ (page view, click product, checkout)
         ▼
┌─────────────────────────────────┐
│ Web Pixel Extension             │ ← extensions/seleric-pixel/
│ (Client-side, runs in sandbox)  │
│ - Subscribe to events           │
│ - Capture data                  │
│ - Send to server                │
└────────┬────────────────────────┘
         │ POST /api/ingest/pixel
         │ (JSON payload)
         ▼
┌─────────────────────────────────┐
│ Ingestion Endpoint              │ ← app/routes/api/ingest.pixel.ts
│ - Validate shop domain          │
│ - Normalize event               │
│ - Check privacy policy          │
│ - Deduplicate                   │
│ - Capture attribution           │
│ - Return 200 OK                 │
└────────┬────────────────────────┘
         │ (async in background)
         ▼
┌─────────────────────────────────┐
│ Umami Forwarder Service         │ ← app/services/umami-forwarder.ts
│ - Convert to Umami format       │
│ - Add website UUID              │
│ - Include custom data           │
│ - Log forwarding attempt        │
└────────┬────────────────────────┘
         │ POST /api/send
         │ (to Umami instance)
         ▼
┌─────────────────┐
│ Umami Analytics │
│ Dashboard       │
└─────────────────┘
```

## ✅ Verification Checklist

| Item | Check | Details |
|------|-------|---------|
| Prerequisites | ✅ | Node 20.19+, npm, Shopify CLI |
| Database | ✅ | PostgreSQL running, migrations applied |
| Environment | ✅ | All 4 env vars set |
| Tunnel | ✅ | ngrok running, URL copied |
| Dev Server | ✅ | `npm run dev --tunnel-url ...` running |
| OAuth | ✅ | App installed on dev store |
| Pixel Status | ✅ | "Seleric-Tracker" shows "Connected" |
| Pixel Helper | ✅ | Extension installed, bar visible |
| Test Event | ✅ | Page view shows ✅ green |
| Database | ✅ | EventReceived table has rows |
| Umami | ✅ | Events visible in dashboard |

## 🔧 Key Configuration

### shopify.app.toml
```toml
[access_scopes]
scopes = "read_products,read_orders,read_customers,read_customer_events,write_pixels"

[build]
automatically_update_urls_on_dev = true
dev_server_port = 39351
```

### Extension Settings (Set Automatically)
```json
{
  "serverEndpoint": "https://your-tunnel.ngrok-free.dev/api/ingest/pixel",
  "enableDebug": false,
  "accountID": "umami-website-uuid"
}
```

### Database
```sql
-- Check events received
SELECT COUNT(*) FROM "EventReceived";

-- Check forwarding success
SELECT forwarded_to_umami, COUNT(*) FROM "EventReceived" 
GROUP BY forwarded_to_umami;

-- Check errors
SELECT * FROM "health_log" 
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

## 📱 Event Testing Sequence

| Step | Action | Expected Result | Pixel Helper |
|------|--------|-----------------|--------------|
| 1 | Load homepage | Page load | `page_viewed` ✅ |
| 2 | Click product | Product page | `product_viewed` ✅ |
| 3 | Add to cart | Item added | `product_added_to_cart` ✅ |
| 4 | Go to checkout | Checkout page | `checkout_started` ✅ |
| 5 | Complete purchase | Order confirmation | `checkout_completed` ✅ |

## 🐛 Troubleshooting Flowchart

```
Pixel shows "Disconnected"?
├─ Check auth.$.tsx ran
├─ Verify SHOPIFY_APP_URL set
├─ Check extension built
└─ Review server logs

Events not reaching server?
├─ Check browser console for CORS
├─ Verify serverEndpoint setting
├─ Test curl to endpoint
└─ Check Pixel Helper for red ❌

Events not in Umami?
├─ Verify Umami website UUID correct
├─ Check Umami endpoint reachable
├─ Review health_log table
└─ Check Umami firewall
```

## 📋 Common Commands

```bash
# Development
npm run dev --tunnel-url https://xxxx.ngrok-free.dev
npm run build
npm run lint
npm run typecheck

# Database
npm run setup                    # Initialize DB
npx prisma studio              # Visual browser
npx prisma migrate dev         # Create migration
npx prisma db push             # Deploy schema

# Deployment
shopify app deploy              # Deploy app
shopify extension push          # Deploy extension

# Debugging
tail -f logs/server.log         # Watch logs
curl -X POST https://.../api/ingest/pixel ...  # Test endpoint
```

## 🎯 Testing Endpoints

```bash
# Test pixel endpoint
curl -X POST https://your-tunnel.ngrok-free.dev/api/ingest/pixel \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Shop-Domain: yourstore.myshopify.com" \
  -d '{
    "name": "page_viewed",
    "timestamp": "2024-02-09T12:00:00Z",
    "context": {"document": {"location": {"href": "https://store.com"}}}
  }'

# Test Umami endpoint
curl -X POST https://umami.example.com/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pageview",
    "payload": {
      "website": "umami-website-uuid",
      "url": "https://store.com",
      "title": "Home"
    }
  }'
```

## 🔑 Key Files & Their Purpose

| File | Purpose | Lines |
|------|---------|-------|
| `extensions/seleric-pixel/src/index.ts` | Pixel logic | 339 |
| `app/routes/api/ingest.pixel.ts` | Event receiver | 234 |
| `app/services/umami-forwarder.ts` | Umami sender | 200+ |
| `app/routes/auth.$.tsx` | Pixel activation | 157 |
| `prisma/schema.prisma` | Database schema | 173 |

## 📚 Documentation Files

| File | Purpose | Pages |
|------|---------|-------|
| `SHOPIFY_PIXEL_README.md` | Overview | 1 |
| `UMAMI_INTEGRATION_GUIDE.md` | Complete guide | 2 |
| `TESTING_GUIDE.md` | Test procedures | 2 |
| `PIXEL_ACTIVATION.md` | Activation details | 2 |
| `IMPLEMENTATION_COMPLETE.md` | Summary | 2 |
| `INTEGRATION_SUMMARY.md` | Changes summary | 2 |

## 🚢 Deployment Checklist

- [ ] Set `enableDebug: false`
- [ ] Verify all scopes enabled
- [ ] Test with payment processor
- [ ] Set up error monitoring
- [ ] Configure database backups
- [ ] Test Umami goals/funnels
- [ ] Document event names
- [ ] Train team on Umami
- [ ] Monitor health_log
- [ ] Verify multi-store isolation

## 📞 Support Links

| Issue | Resource |
|-------|----------|
| Setup help | [UMAMI_INTEGRATION_GUIDE.md](UMAMI_INTEGRATION_GUIDE.md) |
| Testing | [TESTING_GUIDE.md](TESTING_GUIDE.md) |
| Pixel issues | [PIXEL_ACTIVATION.md](PIXEL_ACTIVATION.md) |
| Troubleshooting | [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) |
| API reference | [SHOPIFY_PIXEL_README.md](SHOPIFY_PIXEL_README.md) |

## 🎓 Learning Resources

1. **Start here:** `SHOPIFY_PIXEL_README.md` (5 min read)
2. **Setup:** `UMAMI_INTEGRATION_GUIDE.md` (20 min read)
3. **Test:** `TESTING_GUIDE.md` (30 min hands-on)
4. **Deploy:** Deployment section in guides (15 min)

---

**Bookmark this page for quick reference!**

Last Updated: 2026-02-09
