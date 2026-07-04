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
 *       tier resolution logic maps 'free' → 'listing' access (the base tier).
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
    products: 40,
    broadcasts: 10,
    teamMembers: 1,
    groups: 5,
    priceLists: 5,
  },
  standard: {
    products: 60,
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
 * 'free' maps to the same level as 'listing' — the base discovery tier.
 */
export const PLAN_HIERARCHY: Record<string, number> = {
  listing: 0,
  free: 0,
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

/** Returns the limits for the given tier, falling back to listing if unknown. */
export function getPlanLimits(tier: string): PlanLimitShape {
  // 'free' resolves to listing limits — it is the base discovery tier
  const resolved = tier === 'free' ? 'listing' : tier;
  return (PLAN_LIMITS as Record<string, PlanLimitShape>)[resolved] ?? PLAN_LIMITS.listing;
}

// ─── Boolean feature flags ────────────────────────────────────────────────────
// The Listing tier is discovery-only; Starter and above get full operational access.
// Only add entries here when a feature needs to be DISABLED for a specific tier.

export type BooleanFeature =
  | 'invoices'
  | 'payments'
  | 'analytics'
  | 'order_management'
  | 'customer_management'
  | 'batch_tracking'
  | 'reports'
  | 'draft_invoices'
  | 'price_lists_operational';

const ALL_ENABLED: Record<BooleanFeature, boolean> = {
  invoices: true,
  payments: true,
  analytics: true,
  order_management: true,
  customer_management: true,
  batch_tracking: true,
  reports: true,
  draft_invoices: true,
  price_lists_operational: true,
};

const LISTING_DISABLED: Record<BooleanFeature, boolean> = {
  invoices: false,
  payments: false,
  analytics: false,
  order_management: false,
  customer_management: false,
  batch_tracking: false,
  reports: false,
  draft_invoices: false,
  price_lists_operational: false,
};

export const FEATURE_FLAGS: Record<string, Record<BooleanFeature, boolean>> = {
  listing: LISTING_DISABLED,
  listing_annual_intro: LISTING_DISABLED,
  listing_annual: LISTING_DISABLED,
  free: LISTING_DISABLED,
  starter: ALL_ENABLED,
  starter_annual_intro: ALL_ENABLED,
  starter_annual: ALL_ENABLED,
  standard: ALL_ENABLED,
  standard_annual_intro: ALL_ENABLED,
  standard_annual: ALL_ENABLED,
  premium: ALL_ENABLED,
  premium_annual_intro: ALL_ENABLED,
  premium_annual: ALL_ENABLED,
};

/**
 * Returns true if the given tier has access to the given boolean feature.
 * Unknown tiers default to true (permissive) to avoid blocking existing users.
 */
export function hasFeatureFlag(tier: string, feature: BooleanFeature): boolean {
  return FEATURE_FLAGS[tier]?.[feature] ?? true;
}
