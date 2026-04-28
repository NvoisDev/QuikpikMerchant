/**
 * Normalises any subscription plan ID to its base tier.
 * Annual variants (standard_annual_intro, standard_annual, etc.) map to their monthly equivalent.
 */
export function getBaseTier(planId: string | null | undefined): 'free' | 'standard' | 'premium' {
  if (!planId) return 'free';
  if (planId.startsWith('premium')) return 'premium';
  if (planId.startsWith('standard')) return 'standard';
  return 'free';
}

/**
 * Returns the product limit for a given plan ID.
 * premium → unlimited (-1)
 * standard → 5
 * free / unknown → 2
 */
export function getProductLimit(planId: string | null | undefined): number {
  const tier = getBaseTier(planId);
  return tier === 'premium' ? -1 : tier === 'standard' ? 5 : 2;
}
