---
name: Stripe Live Webhook Setup
description: How the live Stripe webhook is configured and what went wrong historically
---

# Stripe Live Webhook Setup

## Current state (as of June 2026)
- **Active endpoint**: `brilliant-wonder` → `https://quikpik.app/api/webhooks/stripe`
- **Payload style**: Snapshot (required for v1 events like checkout/subscription)
- **Events**: 21 total — includes `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, plus the full Subscriptions bundle (18 events)
- **Secret**: stored as `STRIPE_LIVE_WEBHOOK_SECRET` in Replit Secrets

## What went wrong
Two conflicting webhook endpoints existed simultaneously:
1. `memorable-wonder-thin` — Thin payload (v2 format only), 0% error rate, but only had `v2.core.account.*` events — no subscription/checkout events
2. `memorable-wonder-snapshot` — Snapshot payload, 100% error rate (wrong secret in app)

Result: checkout events fired but were never processed → upgrades didn't activate.

**Why:** Thin payload endpoints only support v2 API events. `checkout.session.completed` and `customer.subscription.*` are v1 events and are incompatible with Thin endpoints. Always use **Snapshot** payload for subscription/checkout webhooks.

## How to apply
- Always use **Snapshot** payload style for endpoints that handle subscription/checkout events
- Only one webhook endpoint should point to `/api/webhooks/stripe` in live mode
- If webhook errors spike: check `STRIPE_LIVE_WEBHOOK_SECRET` matches the active endpoint's signing secret
- The `memorable-wonder-thin` endpoint (15 events, all v2.core.account.*) handles Stripe Connect account events separately — leave it alone
