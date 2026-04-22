/**
 * PLAN_LIMITS — single source of truth for all subscription tier limits.
 *
 * All enforcement logic (middleware, downgrade locking, UI checks) must
 * read from here so the numbers only need to change in one place.
 *
 * -1 means unlimited.
 */
export const PLAN_LIMITS = {
  free: {
    products: 2,
    broadcasts: 5,
    teamMembers: 0,
    groups: 2,
    priceLists: 2,
  },
  standard: {
    products: 5,
    broadcasts: 25,
    teamMembers: 2,
    groups: 5,
    priceLists: 5,
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

/** Returns the limits for the given tier, falling back to free if unknown. */
export function getPlanLimits(tier: string): PlanLimitShape {
  return (PLAN_LIMITS as Record<string, PlanLimitShape>)[tier] ?? PLAN_LIMITS.free;
}
