import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { registerBrowsingRoutes } from "./marketplace-browsing";
import { registerUtilityRoutes } from "./marketplace-utils";
import { registerPaymentRoutes } from "./marketplace-payments";
import { registerOrderRoutes } from "./marketplace-orders";

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  marketplace.ts — ORCHESTRATOR ONLY                                         ║
// ║                                                                              ║
// ║  This file registers customer-facing marketplace routes. It should           ║
// ║  remain an orchestrator: wiring routes, calling helpers, returning           ║
// ║  responses. Business logic does NOT belong here.                             ║
// ║                                                                              ║
// ║  Where to put NEW code:                                                      ║
// ║    Payment logic   → server/routes/marketplace-payments.ts                  ║
// ║    Order logic     → server/routes/marketplace-orders.ts                    ║
// ║    Browsing routes → server/routes/marketplace-browsing.ts                  ║
// ║    Price-list helpers → server/routes/marketplace-price-lists.ts            ║
// ║    Utilities/misc  → server/routes/marketplace-utils.ts                     ║
// ║    Shared fees     → shared/utils/fees.ts                                   ║
// ║    Shared currency → shared/utils/currency.ts                               ║
// ║                                                                              ║
// ║  DO NOT add inline business logic, fee formulas, or data-shaping            ║
// ║  functions directly to this file.                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const orderCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many order requests, please try again later." },
});

// Covers unauthenticated customer-action endpoints (payment initiation, order
// placement, access requests, reorders, cancellations).  30 per 15 min is more
// permissive than orderCreateLimiter (20/15 min) to allow legitimate browsing
// and multi-step checkout flows while still blocking automated abuse.
const customerActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/**
 * Registers customer-facing marketplace routes (store browsing, cart, payment intents, orders).
 *
 * ⚠️  New payment logic belongs in `server/routes/marketplace-payments.ts`, not here.
 * ⚠️  New order logic belongs in `server/routes/marketplace-orders.ts`, not here.
 * Any Stripe call in sub-files MUST use `getStripeClient(Boolean(wholesaler.isTestAccount))`
 * — never the module-level `stripe` singleton (which has no per-request account context).
 */
export function registerMarketplaceRoutes(app: Express): void {
  // Browsing/discovery routes (featured, products, wholesalers, product detail)
  registerBrowsingRoutes(app);
  // Utility routes (fee config, registration, accessible wholesalers, stats)
  registerUtilityRoutes(app, customerActionLimiter);
  // Payment routes (Stripe checkout intent creation, payment-link resend)
  registerPaymentRoutes(app, customerActionLimiter);
  // Order routes (order history, create, pay-later, cancellation, reorder, invoice)
  registerOrderRoutes(app, orderCreateLimiter, customerActionLimiter);
}
