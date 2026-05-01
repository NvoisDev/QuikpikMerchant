import { getStripeClient } from '../stripeConfig';

/**
 * Returns true when the wholesaler's Stripe Connect account has both
 * charges_enabled and payouts_enabled — i.e. it can fully process payments
 * and receive payouts. Returns false if the account ID is absent, incomplete,
 * or if the Stripe API call fails.
 */
export async function isConnectAccountReady(
  stripeAccountId: string | null | undefined,
  isTestAccount: boolean = false,
): Promise<boolean> {
  if (!stripeAccountId) return false;
  try {
    const stripe = getStripeClient(isTestAccount);
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return !!(account.charges_enabled && account.payouts_enabled);
  } catch (err: any) {
    console.warn(`⚠️ Could not verify Stripe Connect readiness for ${stripeAccountId}:`, err?.message);
    return false;
  }
}
