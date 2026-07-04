/**
 * Integration tests verifying that product cap enforcement reflects the
 * updated plan limits (40 Starter, 60 Standard).
 *
 * checkFeatureLimits — resolves limits from the DB plan record when present,
 *   falling back to PLAN_LIMITS. The new caps (40/60) must block on the n+1th
 *   product for Starter and Standard respectively.
 *
 * getUserPlanLimits — must prefer the DB plan's limits JSONB over the static
 *   PLAN_LIMITS fallback so an admin can adjust caps without a redeploy.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock SubscriptionService before importing the module under test so that
// the dynamic import inside checkFeatureLimits resolves to our stub.
vi.mock('../server/subscription-service', () => ({
  default: {
    getUserSubscription: vi.fn(),
  },
}));

// Mock the DB module so internal count helpers (getCurrentTeamMemberCount,
// getCurrentPriceListCount) that use the top-level db import return 0 rows.
vi.mock('../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}));

import SubscriptionService from '../server/subscription-service';
import { checkFeatureLimits, getUserPlanLimits } from '../server/middleware/feature-gating';
import { PLAN_LIMITS } from '../server/config/plan-limits';

const mockGetUserSubscription = SubscriptionService.getUserSubscription as ReturnType<typeof vi.fn>;

function makeSubscriptionResult(tier: string, dbLimits?: Record<string, number>) {
  return {
    plan: dbLimits
      ? { limits: dbLimits }
      : null,
    currentPlan: tier,
    user: { subscriptionTier: tier },
    subscription: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── checkFeatureLimits: Starter plan (40 products) ──────────────────────────

describe('checkFeatureLimits — Starter plan (40 product cap)', () => {
  it('allows creating the 40th product (currentCount = 39)', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter')
    );

    const result = await checkFeatureLimits('user-starter', 'products', 39);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.starter.products); // 40
    expect(result.plan).toBe('starter');
    expect(result.upgradeRequired).toBe(false);
  });

  it('allows creating when currentCount equals the limit minus 1 (boundary)', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter')
    );

    const result = await checkFeatureLimits('user-starter', 'products', 39);

    expect(result.allowed).toBe(true);
  });

  it('blocks the 41st product (currentCount = 40, which equals the limit)', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter')
    );

    const result = await checkFeatureLimits('user-starter', 'products', 40);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(40);
    expect(result.upgradeRequired).toBe(true);
  });

  it('still blocks when currentCount exceeds the limit', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter')
    );

    const result = await checkFeatureLimits('user-starter', 'products', 55);

    expect(result.allowed).toBe(false);
  });
});

// ─── checkFeatureLimits: Standard plan (60 products) ─────────────────────────

describe('checkFeatureLimits — Standard plan (60 product cap)', () => {
  it('allows creating the 60th product (currentCount = 59)', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('standard')
    );

    const result = await checkFeatureLimits('user-standard', 'products', 59);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.standard.products); // 60
    expect(result.plan).toBe('standard');
    expect(result.upgradeRequired).toBe(false);
  });

  it('blocks the 61st product (currentCount = 60, which equals the limit)', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('standard')
    );

    const result = await checkFeatureLimits('user-standard', 'products', 60);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(60);
    expect(result.upgradeRequired).toBe(true);
  });

  it('still blocks when currentCount exceeds the limit', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('standard')
    );

    const result = await checkFeatureLimits('user-standard', 'products', 75);

    expect(result.allowed).toBe(false);
  });
});

// ─── checkFeatureLimits: DB plan limits override static caps ─────────────────

describe('checkFeatureLimits — DB plan limits override PLAN_LIMITS fallback', () => {
  it('uses the DB product limit when the plan row has a limits JSONB', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter', { products: 80, broadcasts: 10, teamMembers: 1, customGroups: 5, priceLists: 5 })
    );

    // With DB limit 80, count of 75 should be allowed
    const allowed = await checkFeatureLimits('user-starter', 'products', 75);
    expect(allowed.allowed).toBe(true);
    expect(allowed.limit).toBe(80);

    // Count of 80 should be blocked (80 >= 80)
    const blocked = await checkFeatureLimits('user-starter', 'products', 80);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(80);
  });
});

// ─── PLAN_LIMITS values match the expected new caps ──────────────────────────

describe('PLAN_LIMITS — static caps reflect the updated values', () => {
  it('Starter plan has a product cap of 40', () => {
    expect(PLAN_LIMITS.starter.products).toBe(40);
  });

  it('Standard plan has a product cap of 60', () => {
    expect(PLAN_LIMITS.standard.products).toBe(60);
  });
});

// ─── getUserPlanLimits — prefers DB limits over static fallback ───────────────

describe('getUserPlanLimits — DB limits take precedence over PLAN_LIMITS', () => {
  it('returns DB product limit when plan.limits is populated', async () => {
    const customDbLimit = 99;
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter', {
        products: customDbLimit,
        broadcasts: 10,
        teamMembers: 1,
        customGroups: 5,
        priceLists: 5,
      })
    );

    const result = await getUserPlanLimits('user-starter');

    expect(result.limits.products).toBe(customDbLimit);
    // Static PLAN_LIMITS.starter.products is 40 — DB must win
    expect(result.limits.products).not.toBe(PLAN_LIMITS.starter.products);
  });

  it('falls back to PLAN_LIMITS when plan.limits is null', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter') // no DB limits
    );

    const result = await getUserPlanLimits('user-starter');

    expect(result.limits.products).toBe(PLAN_LIMITS.starter.products); // 40
  });

  it('falls back to PLAN_LIMITS when plan row is absent', async () => {
    mockGetUserSubscription.mockResolvedValue({
      plan: null,
      currentPlan: 'standard',
      user: { subscriptionTier: 'standard' },
      subscription: null,
    });

    const result = await getUserPlanLimits('user-standard');

    expect(result.limits.products).toBe(PLAN_LIMITS.standard.products); // 60
  });

  it('reports the correct plan tier on the result', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter')
    );

    const result = await getUserPlanLimits('user-starter');

    expect(result.plan).toBe('starter');
  });
});
