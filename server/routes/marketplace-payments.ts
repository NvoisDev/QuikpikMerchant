/**
 * marketplace-payments.ts
 *
 * Home for NEW Stripe / payment-related helpers that serve the customer
 * marketplace. Keep payment intent creation, webhook handling helpers,
 * and fee-related utilities here instead of adding them to marketplace.ts.
 *
 * marketplace.ts is the orchestrator — it registers routes and calls into
 * this module. Business logic lives here.
 *
 * Usage pattern:
 *   import { myNewHelper } from "./marketplace-payments";
 *   // then call it from the relevant route handler in marketplace.ts
 */

// placeholder — remove when the first real export is added
export const _marketplacePaymentsReady = true;
