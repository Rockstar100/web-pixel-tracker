# Documentation Index

## 📚 Complete Documentation for Seleric Tracker

Welcome to the Seleric Tracker documentation! This index helps you find the right document for your needs.

---

## 🚀 Quick Start

**New to Razorpay Magic Checkout?**
→ Start with [RAZORPAY_QUICK_REFERENCE.md](RAZORPAY_QUICK_REFERENCE.md) (2-minute read)

**Setting up for production?**
→ Follow [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md) (complete setup)

**Need to understand how it works?**
→ Read [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md) (executive summary)

---

## 📖 Documentation by Purpose

### For Developers

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [RAZORPAY_QUICK_REFERENCE.md](RAZORPAY_QUICK_REFERENCE.md) | Quick answers and code references | 2 min |
| [SYSTEM_ARCHITECTURE_DIAGRAM.md](SYSTEM_ARCHITECTURE_DIAGRAM.md) | Complete visual system architecture | 5 min |
| [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md) | In-depth technical architecture | 15 min |
| [EVENT_FLOW_DIAGRAMS.md](EVENT_FLOW_DIAGRAMS.md) | Visual flow diagrams for all scenarios | 10 min |

### For Implementation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md) | Step-by-step setup and configuration | 20 min |
| [README.md](README.md) | Project overview and API reference | 10 min |

### For Decision Makers

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md) | Executive summary of Razorpay support | 5 min |
| [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md) | Complete architecture overview | 15 min |

---

## 📋 Documentation by Task

### "I need to set up Razorpay tracking"
1. Read [RAZORPAY_QUICK_REFERENCE.md](RAZORPAY_QUICK_REFERENCE.md) for overview
2. Follow [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md) for implementation
3. Test using verification queries in the setup guide
4. Monitor using [RAZORPAY_SETUP_GUIDE.md § Monitoring](RAZORPAY_SETUP_GUIDE.md#monitoring--alerts)

### "I need to understand how tracking works"
1. Start with [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md) for overview
2. Review [EVENT_FLOW_DIAGRAMS.md](EVENT_FLOW_DIAGRAMS.md) for visual flows
3. Dive into [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md) for details
4. Reference [SYSTEM_ARCHITECTURE_DIAGRAM.md](SYSTEM_ARCHITECTURE_DIAGRAM.md) for complete picture

### "I'm debugging tracking issues"
1. Check [RAZORPAY_QUICK_REFERENCE.md § Troubleshooting](RAZORPAY_QUICK_REFERENCE.md#troubleshooting)
2. Run verification queries from [RAZORPAY_SETUP_GUIDE.md § Verification Queries](RAZORPAY_SETUP_GUIDE.md#verification-queries)
3. Review [RAZORPAY_SETUP_GUIDE.md § Troubleshooting](RAZORPAY_SETUP_GUIDE.md#troubleshooting)
4. Check [EVENT_FLOW_DIAGRAMS.md § Deduplication](EVENT_FLOW_DIAGRAMS.md#4-deduplication-logic)

### "I'm onboarding new team members"
1. Share [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md) for context
2. Walk through [SYSTEM_ARCHITECTURE_DIAGRAM.md](SYSTEM_ARCHITECTURE_DIAGRAM.md)
3. Review [README.md](README.md) for API reference
4. Show [EVENT_FLOW_DIAGRAMS.md](EVENT_FLOW_DIAGRAMS.md) for visual understanding

### "I need to explain this to stakeholders"
1. Use [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md) as presentation
2. Reference [TRACKING_ARCHITECTURE.md § Data Completeness Matrix](TRACKING_ARCHITECTURE.md#8-data-completeness-matrix)
3. Show [EVENT_FLOW_DIAGRAMS.md § Razorpay Flow](EVENT_FLOW_DIAGRAMS.md#2-razorpay-magic-checkout-flow)
4. Highlight [TRACKING_ARCHITECTURE.md § Summary](TRACKING_ARCHITECTURE.md#11-summary)

---

## 🎯 Document Descriptions

### [RAZORPAY_QUICK_REFERENCE.md](RAZORPAY_QUICK_REFERENCE.md)
**2-minute quick reference card**
- TL;DR summary
- Event mapping table
- Key files reference
- Verification queries
- Quick troubleshooting
- FAQ

**Best for:** Quick answers while coding

### [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md)
**Complete setup and troubleshooting guide**
- Step-by-step configuration
- Webhook setup instructions
- Testing procedures
- Verification queries
- Troubleshooting flowcharts
- Monitoring and alerts
- Best practices

**Best for:** Production setup and operations

### [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md)
**Executive summary and findings**
- What was asked
- What was found
- Architecture strengths
- Implementation details
- Configuration checklist
- Testing procedures
- FAQ

**Best for:** Understanding the solution

### [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md)
**Complete technical architecture**
- System overview
- Client-side tracking details
- Server-side tracking details
- Razorpay handling explanation
- Data flow and deduplication
- Attribution tracking
- Customer journey tracking
- Data completeness matrix
- Verification procedures

**Best for:** Deep technical understanding

### [EVENT_FLOW_DIAGRAMS.md](EVENT_FLOW_DIAGRAMS.md)
**Visual flow diagrams**
- Normal Shopify checkout flow
- Razorpay Magic Checkout flow
- Multi-session attribution flow
- Deduplication logic
- Customer journey reconstruction
- Webhook retry mechanism

**Best for:** Visual learners and presentations

### [SYSTEM_ARCHITECTURE_DIAGRAM.md](SYSTEM_ARCHITECTURE_DIAGRAM.md)
**Complete system architecture diagram**
- Full ASCII architecture diagram
- Component descriptions
- Data flow visualization
- Razorpay flow integration
- Configuration checklist

**Best for:** System overview and onboarding

### [README.md](README.md)
**Project overview and reference**
- Quick start guide
- Features list
- Project structure
- API documentation
- Database schema
- Development guide

**Best for:** General project reference

---

## 🔍 Quick Answers

### Common Questions

**Q: Does this support Razorpay Magic Checkout?**
→ Yes! See [RAZORPAY_SUMMARY.md](RAZORPAY_SUMMARY.md)

**Q: How do I set it up?**
→ [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md)

**Q: How does it work?**
→ [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md)

**Q: What if checkout events are missing?**
→ No problem! [TRACKING_ARCHITECTURE.md § Razorpay Handling](TRACKING_ARCHITECTURE.md#7-special-handling-for-razorpay)

**Q: How is attribution preserved?**
→ [EVENT_FLOW_DIAGRAMS.md § Attribution Flow](EVENT_FLOW_DIAGRAMS.md#3-attribution-flow-cross-session)

**Q: What if webhooks fail?**
→ [EVENT_FLOW_DIAGRAMS.md § Webhook Retry](EVENT_FLOW_DIAGRAMS.md#6-webhook-retry--recovery)

**Q: How do I test?**
→ [RAZORPAY_SETUP_GUIDE.md § Testing](RAZORPAY_SETUP_GUIDE.md#test-flow-2-razorpay-magic-checkout-your-use-case)

**Q: How do I debug?**
→ [RAZORPAY_SETUP_GUIDE.md § Troubleshooting](RAZORPAY_SETUP_GUIDE.md#troubleshooting)

---

## 📊 Diagrams Index

### Architecture Diagrams
- [Complete System Architecture](SYSTEM_ARCHITECTURE_DIAGRAM.md)
- [Client-Side Flow](EVENT_FLOW_DIAGRAMS.md#1-normal-shopify-checkout-flow)
- [Razorpay Flow](EVENT_FLOW_DIAGRAMS.md#2-razorpay-magic-checkout-flow)

### Process Diagrams
- [Attribution Flow](EVENT_FLOW_DIAGRAMS.md#3-attribution-flow-cross-session)
- [Deduplication Logic](EVENT_FLOW_DIAGRAMS.md#4-deduplication-logic)
- [Journey Reconstruction](EVENT_FLOW_DIAGRAMS.md#5-customer-journey-reconstruction)
- [Webhook Retry](EVENT_FLOW_DIAGRAMS.md#6-webhook-retry--recovery)

### Data Flow
- [Event Deduplication](TRACKING_ARCHITECTURE.md#4-data-flow--deduplication)
- [Attribution Tracking](TRACKING_ARCHITECTURE.md#5-attribution-tracking)
- [Customer Journey](TRACKING_ARCHITECTURE.md#6-customer-journey-tracking)

---

## 🛠️ Code References

### Key Implementation Files

**Webhook Handlers:**
- [app/routes/webhooks/orders.paid.ts](app/routes/webhooks/orders.paid.ts) - Primary conversion tracking
- [app/routes/webhooks/orders.create.ts](app/routes/webhooks/orders.create.ts) - Order initiation
- [app/routes/webhooks/orders.cancelled.ts](app/routes/webhooks/orders.cancelled.ts) - Cancellations
- [app/routes/webhooks/orders.refund.ts](app/routes/webhooks/orders.refund.ts) - Refunds

**API Endpoints:**
- [app/routes/api/ingest.pixel.ts](app/routes/api/ingest.pixel.ts) - Pixel event ingestion
- [app/routes/api/customer-journey.ts](app/routes/api/customer-journey.ts) - Customer data API

**Services:**
- [app/services/normalizer.ts](app/services/normalizer.ts) - Event normalization
- [app/services/deduplicator.ts](app/services/deduplicator.ts) - Duplicate prevention
- [app/services/attribution.ts](app/services/attribution.ts) - Attribution tracking
- [app/services/journey.ts](app/services/journey.ts) - Customer journey
- [app/services/privacy.ts](app/services/privacy.ts) - Privacy compliance

**Client-Side:**
- [extensions/seleric-pixel/src/index.ts](extensions/seleric-pixel/src/index.ts) - Web Pixel extension

**Database:**
- [prisma/schema.prisma](prisma/schema.prisma) - Database schema

---

## 📈 Monitoring & Operations

### Health Monitoring
- [RAZORPAY_SETUP_GUIDE.md § Health Check Queries](RAZORPAY_SETUP_GUIDE.md#health-check-queries)
- [RAZORPAY_SETUP_GUIDE.md § Setting Up Alerts](RAZORPAY_SETUP_GUIDE.md#setting-up-alerts)

### Verification
- [RAZORPAY_SETUP_GUIDE.md § Verification Queries](RAZORPAY_SETUP_GUIDE.md#verification-queries)
- [TRACKING_ARCHITECTURE.md § Verification](TRACKING_ARCHITECTURE.md#10-verification--testing)

### Best Practices
- [RAZORPAY_SETUP_GUIDE.md § Best Practices](RAZORPAY_SETUP_GUIDE.md#best-practices)
- [TRACKING_ARCHITECTURE.md § Recommended Next Steps](TRACKING_ARCHITECTURE.md#12-recommended-next-steps)

---

## ✅ Checklists

### Setup Checklist
→ [RAZORPAY_SUMMARY.md § Configuration Checklist](RAZORPAY_SUMMARY.md#configuration-checklist)
→ [RAZORPAY_SETUP_GUIDE.md § Summary Checklist](RAZORPAY_SETUP_GUIDE.md#summary-checklist)

### Testing Checklist
→ [RAZORPAY_SETUP_GUIDE.md § Test Flow](RAZORPAY_SETUP_GUIDE.md#test-flow-2-razorpay-magic-checkout-your-use-case)
→ [TRACKING_ARCHITECTURE.md § Testing](TRACKING_ARCHITECTURE.md#12-recommended-next-steps)

### Production Checklist
→ [SYSTEM_ARCHITECTURE_DIAGRAM.md § Configuration Checklist](SYSTEM_ARCHITECTURE_DIAGRAM.md)

---

## 🤝 Contributing

When adding new documentation:
1. Add entry to this index
2. Link to related documents
3. Update relevant checklists
4. Add to appropriate category

---

## 📞 Support

- **Quick questions:** [RAZORPAY_QUICK_REFERENCE.md](RAZORPAY_QUICK_REFERENCE.md)
- **Setup help:** [RAZORPAY_SETUP_GUIDE.md](RAZORPAY_SETUP_GUIDE.md)
- **Technical details:** [TRACKING_ARCHITECTURE.md](TRACKING_ARCHITECTURE.md)
- **Troubleshooting:** [RAZORPAY_SETUP_GUIDE.md § Troubleshooting](RAZORPAY_SETUP_GUIDE.md#troubleshooting)

---

**Last Updated:** Feb 11, 2026
**System Status:** ✅ Production-Ready for Razorpay Magic Checkout
