/**
 * Normalises any plan ID (including annual variants) to its base tier.
 * standard_annual_intro → "standard"
 * premium_annual_intro  → "premium"
 * standard_annual       → "standard"
 * premium_annual        → "premium"
 * standard              → "standard"
 * premium               → "premium"
 * free / anything else  → "free"
 */
export function getBaseTier(planId: string | null | undefined): 'free' | 'standard' | 'premium' {
  if (!planId) return 'free';
  if (planId.startsWith('premium')) return 'premium';
  if (planId.startsWith('standard')) return 'standard';
  return 'free';
}
