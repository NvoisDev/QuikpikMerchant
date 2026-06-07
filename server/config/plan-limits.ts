/**
 * PLAN_LIMITS — single source of truth for all subscription tier limits.
 *
 * All enforcement logic (middleware, downgrade locking, UI checks) must
 * read from here so the numbers only need to change in one place.
 *
 * -1 means unlimited.
 *
 * Tier order (ascending): listing → starter → standard → premium
 * Note: 'free' is kept for backwards compatibility with existing DB records;
 *       tier resolution logic maps 'free' → 'starter' access.
 */
export const PLAN_LIMITS = {
  listing: {
    products: 10,
    broadcasts: 0,
    teamMembers: 1,
    groups: 2,
    priceLists: 2,
  },
  free: {
    products: 20,
    broadcasts: 10,
    teamMembers: 1,
    groups: 5,
    priceLists: 5,
  },
  starter: {
    products: 20,
    broadcasts: 10,
    teamMembers: 1,
    groups: 5,
    priceLists: 5,
  },
  standard: {
    products: 50,
    broadcasts: 25,
    teamMembers: 3,
    groups: 10,
    priceLists: 10,
  },
  premium: {
    products: -1,
    broadcasts: -1,
    teamMembers: -1,
    groups: -1,
    priceLists: -1,
  },
} as const satisfies Record<string, PlanLimitShape>;

export interface PlanLimitShape {
  products: number;
  broadcasts: number;
  teamMembers: number;
  groups: number;
  priceLists: number;
}

export type PlanTier = keyof typeof PLAN_LIMITS;

/**
 * Canonical plan hierarchy — higher number = higher tier.
 * Import this everywhere instead of inlining { free: 0, standard: 1, premium: 2 }.
 * 'free' maps to the same level as 'starter' so existing free users are never
 * treated as lower access than Starter.
 */
export const PLAN_HIERARCHY: Record<string, number> = {
  listing: 0,
  free: 1,
  starter: 1,
  standard: 2,
  // annual / intro variants
  standard_annual_intro: 2,
  standard_annual: 2,
  premium: 3,
  premium_annual_intro: 3,
  premium_annual: 3,
  listing_annual_intro: 0,
  listing_annual: 0,
  starter_annual_intro: 1,
  starter_annual: 1,
};

/** Returns the limits for the given tier, falling back to starter (free) if unknown. */
export function getPlanLimits(tier: string): PlanLimitShape {
  // 'free' resolves to starter limits so existing free users keep operational access
  const resolved = tier === 'free' ? 'starter' : tier;
  return (PLAN_LIMITS as Record<string, PlanLimitShape>)[resolved] ?? PLAN_LIMITS.starter;
}
