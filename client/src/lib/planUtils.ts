/**
 * Normalises any plan ID (including annual variants) to its base tier.
 *
 * listing / listing_annual / listing_annual_intro  → "listing"
 * starter / starter_annual / starter_annual_intro  → "starter"
 * standard / standard_annual / standard_annual_intro → "standard"
 * premium  / premium_annual  / premium_annual_intro  → "premium"
 * free / anything else                              → "starter"
 *   (existing free users are grandfathered onto Starter access)
 */
export type BaseTier = 'listing' | 'starter' | 'standard' | 'premium';

export function getBaseTier(planId: string | null | undefined): BaseTier {
  if (!planId) return 'starter';
  if (planId.startsWith('premium')) return 'premium';
  if (planId.startsWith('standard')) return 'standard';
  if (planId.startsWith('starter')) return 'starter';
  if (planId.startsWith('listing')) return 'listing';
  // 'free' maps to starter so existing free users keep full operational access
  return 'starter';
}
