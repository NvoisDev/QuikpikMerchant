/**
 * Stripe dual-mode configuration
 *
 * STRIPE_ENVIRONMENT = "live" → use live keys
 * STRIPE_ENVIRONMENT = "test" (default) → use test keys
 *
 * Accounts where is_test_account = true ALWAYS use the test client,
 * even when the platform is running in live mode.
 */

import Stripe from "stripe";

const API_VERSION = "2025-08-27.basil" as const;

export const STRIPE_ENVIRONMENT = (process.env.STRIPE_ENVIRONMENT ?? "test") as "test" | "live";

export function isLiveMode(): boolean {
  return STRIPE_ENVIRONMENT === "live";
}

// ── Test-mode credentials ──────────────────────────────────────────────────
const TEST_SECRET      = process.env.STRIPE_SECRET_KEY;
const TEST_PUBLISHABLE = process.env.STRIPE_TEST_PUBLISHABLE_KEY
                      ?? process.env.VITE_STRIPE_PUBLIC_KEY;
const TEST_WEBHOOK     = process.env.STRIPE_WEBHOOK_SECRET;

// ── Live-mode credentials ──────────────────────────────────────────────────
const LIVE_SECRET      = process.env.STRIPE_LIVE_SECRET_KEY;
const LIVE_PUBLISHABLE = process.env.STRIPE_LIVE_PUBLISHABLE_KEY;
const LIVE_WEBHOOK     = process.env.STRIPE_LIVE_WEBHOOK_SECRET;

// ── Pre-built client instances (null when key missing) ──────────────────────
export const stripeTest: Stripe | null = TEST_SECRET
  ? new Stripe(TEST_SECRET, { apiVersion: API_VERSION })
  : null;

export const stripeLive: Stripe | null = LIVE_SECRET
  ? new Stripe(LIVE_SECRET, { apiVersion: API_VERSION })
  : null;

if (!stripeTest) {
  console.warn("⚠️  STRIPE_SECRET_KEY not set — test Stripe client unavailable.");
}
if (isLiveMode() && !stripeLive) {
  console.warn("⚠️  STRIPE_ENVIRONMENT=live but STRIPE_LIVE_SECRET_KEY not set — falling back to test client.");
}

/**
 * Returns the appropriate Stripe client.
 * @param forceTest  Pass `true` for test accounts so they never hit live Stripe.
 */
export function getStripeClient(forceTest = false): Stripe {
  const useLive = isLiveMode() && !forceTest;

  if (useLive) {
    if (stripeLive) return stripeLive;
    console.warn("⚠️  Live Stripe client not available — falling back to test client.");
  }
  if (!stripeTest) throw new Error("No Stripe client available — STRIPE_SECRET_KEY not configured.");
  return stripeTest;
}

/**
 * Returns the publishable key for the given context.
 * Used by the /api/config/stripe-key endpoint to tell the browser which key to load.
 */
export function getPublishableKey(forceTest = false): string {
  const useLive = isLiveMode() && !forceTest;
  if (useLive && LIVE_PUBLISHABLE) return LIVE_PUBLISHABLE;
  return TEST_PUBLISHABLE ?? "";
}

/**
 * Returns an ordered list of webhook secrets to try during signature verification.
 * We try the active-environment secret first, then the other one as a fallback
 * so that a mode switch doesn't immediately break in-flight webhooks.
 */
export function getWebhookSecrets(): string[] {
  const primary   = isLiveMode() ? LIVE_WEBHOOK : TEST_WEBHOOK;
  const secondary = isLiveMode() ? TEST_WEBHOOK : LIVE_WEBHOOK;
  return [primary, secondary].filter((s): s is string => Boolean(s));
}
