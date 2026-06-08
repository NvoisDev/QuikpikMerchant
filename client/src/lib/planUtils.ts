/**
 * Normalises any plan ID (including annual variants) to its base tier.
 *
 * listing / listing_annual / listing_annual_intro  → "listing"
 * starter / starter_annual / starter_annual_intro  → "starter"
 * standard / standard_annual / standard_annual_intro → "standard"
 * premium  / premium_annual  / premium_annual_intro  → "premium"
 * free / anything else                              → "listing"
 *   ('free' is the legacy base tier — maps to listing access)
 */
export type BaseTier = 'listing' | 'starter' | 'standard' | 'premium';

/**
 * Client-side plan hierarchy for upgrade/downgrade detection.
 * Higher number = higher tier. Keep in sync with server/config/plan-limits.ts.
 */
export const PLAN_HIERARCHY: Record<string, number> = {
  listing: 0, listing_annual: 0, listing_annual_intro: 0,
  free: 0,
  starter: 1, starter_annual: 1, starter_annual_intro: 1,
  standard: 2, standard_annual: 2, standard_annual_intro: 2,
  premium: 3, premium_annual: 3, premium_annual_intro: 3,
};

export function getBaseTier(planId: string | null | undefined): BaseTier {
  if (!planId) return 'listing';
  if (planId.startsWith('premium')) return 'premium';
  if (planId.startsWith('standard')) return 'standard';
  if (planId.startsWith('starter')) return 'starter';
  if (planId.startsWith('listing')) return 'listing';
  // 'free' is the legacy base tier — treated as listing
  return 'listing';
}
