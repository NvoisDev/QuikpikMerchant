/**
 * Integration tests verifying that broadcast and team-member cap enforcement
 * reflects the plan limits defined in PLAN_LIMITS.
 *
 * PLAN_LIMITS (as of writing):
 *   starter  — broadcasts: 10, teamMembers: 1
 *   standard — broadcasts: 25, teamMembers: 3
 *
 * checkFeatureLimits is the shared enforcement helper used by both
 * requireBroadcastLimits and requireTeamMemberLimits middleware.  These tests
 * exercise it directly (same approach as product-cap-enforcement.test.ts) so
 * that a silent regression in the broadcast or team-member path is caught
 * without needing a running HTTP server.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock SubscriptionService before importing the module under test so the
// dynamic import inside checkFeatureLimits resolves to our stub.
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
import { checkFeatureLimits } from '../server/middleware/feature-gating';
import { PLAN_LIMITS } from '../server/config/plan-limits';

const mockGetUserSubscription = SubscriptionService.getUserSubscription as ReturnType<typeof vi.fn>;

function makeSubscriptionResult(tier: string, dbLimits?: Record<string, number>) {
  return {
    plan: dbLimits ? { limits: dbLimits } : null,
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

// ─── PLAN_LIMITS static values ────────────────────────────────────────────────

describe('PLAN_LIMITS — broadcast and team-member caps reflect expected values', () => {
  it('Starter plan has a broadcast cap of 10', () => {
    expect(PLAN_LIMITS.starter.broadcasts).toBe(10);
  });

  it('Standard plan has a broadcast cap of 25', () => {
    expect(PLAN_LIMITS.standard.broadcasts).toBe(25);
  });

  it('Starter plan has a team-member cap of 1', () => {
    expect(PLAN_LIMITS.starter.teamMembers).toBe(1);
  });

  it('Standard plan has a team-member cap of 3', () => {
    expect(PLAN_LIMITS.standard.teamMembers).toBe(3);
  });
});

// ─── checkFeatureLimits: Starter — broadcast cap (10) ────────────────────────

describe('checkFeatureLimits — Starter plan (10 broadcast cap)', () => {
  it('allows the 10th broadcast (currentCount = 9)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('starter'));

    const result = await checkFeatureLimits('user-starter', 'broadcasts', 9);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.starter.broadcasts); // 10
    expect(result.plan).toBe('starter');
    expect(result.upgradeRequired).toBe(false);
  });

  it('blocks the 11th broadcast (currentCount = 10, equals the limit)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('starter'));

    const result = await checkFeatureLimits('user-starter', 'broadcasts', 10);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
    expect(result.upgradeRequired).toBe(true);
  });

  it('still blocks when currentCount exceeds the limit', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('starter'));

    const result = await checkFeatureLimits('user-starter', 'broadcasts', 15);

    expect(result.allowed).toBe(false);
  });
});

// ─── checkFeatureLimits: Standard — broadcast cap (25) ───────────────────────

describe('checkFeatureLimits — Standard plan (25 broadcast cap)', () => {
  it('allows the 25th broadcast (currentCount = 24)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('standard'));

    const result = await checkFeatureLimits('user-standard', 'broadcasts', 24);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.standard.broadcasts); // 25
    expect(result.plan).toBe('standard');
    expect(result.upgradeRequired).toBe(false);
  });

  it('blocks the 26th broadcast (currentCount = 25, equals the limit)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('standard'));

    const result = await checkFeatureLimits('user-standard', 'broadcasts', 25);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(25);
    expect(result.upgradeRequired).toBe(true);
  });

  it('still blocks when currentCount exceeds the limit', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('standard'));

    const result = await checkFeatureLimits('user-standard', 'broadcasts', 30);

    expect(result.allowed).toBe(false);
  });
});

// ─── checkFeatureLimits: Starter — team-member cap (1) ───────────────────────

describe('checkFeatureLimits — Starter plan (1 team-member cap)', () => {
  it('allows adding the 1st team member (currentCount = 0)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('starter'));

    const result = await checkFeatureLimits('user-starter', 'teamMembers', 0);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.starter.teamMembers); // 1
    expect(result.plan).toBe('starter');
    expect(result.upgradeRequired).toBe(false);
  });

  it('blocks the 2nd team member (currentCount = 1, equals the limit)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('starter'));

    const result = await checkFeatureLimits('user-starter', 'teamMembers', 1);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(1);
    expect(result.upgradeRequired).toBe(true);
  });

  it('still blocks when currentCount exceeds the limit', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('starter'));

    const result = await checkFeatureLimits('user-starter', 'teamMembers', 3);

    expect(result.allowed).toBe(false);
  });
});

// ─── checkFeatureLimits: Standard — team-member cap (3) ──────────────────────

describe('checkFeatureLimits — Standard plan (3 team-member cap)', () => {
  it('allows adding the 3rd team member (currentCount = 2)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('standard'));

    const result = await checkFeatureLimits('user-standard', 'teamMembers', 2);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.standard.teamMembers); // 3
    expect(result.plan).toBe('standard');
    expect(result.upgradeRequired).toBe(false);
  });

  it('blocks the 4th team member (currentCount = 3, equals the limit)', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('standard'));

    const result = await checkFeatureLimits('user-standard', 'teamMembers', 3);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(3);
    expect(result.upgradeRequired).toBe(true);
  });

  it('still blocks when currentCount exceeds the limit', async () => {
    mockGetUserSubscription.mockResolvedValue(makeSubscriptionResult('standard'));

    const result = await checkFeatureLimits('user-standard', 'teamMembers', 5);

    expect(result.allowed).toBe(false);
  });
});

// ─── DB plan limits override static caps ─────────────────────────────────────

describe('checkFeatureLimits — DB plan limits override PLAN_LIMITS fallback for broadcasts', () => {
  it('uses the DB broadcast limit when the plan row has a limits JSONB', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter', { products: 40, broadcasts: 50, teamMembers: 1, customGroups: 5, priceLists: 5 })
    );

    // With DB limit 50, count of 45 should be allowed
    const allowed = await checkFeatureLimits('user-starter', 'broadcasts', 45);
    expect(allowed.allowed).toBe(true);
    expect(allowed.limit).toBe(50);

    // Count of 50 should be blocked (50 >= 50)
    const blocked = await checkFeatureLimits('user-starter', 'broadcasts', 50);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(50);
  });
});

describe('checkFeatureLimits — DB plan limits override PLAN_LIMITS fallback for teamMembers', () => {
  it('uses the DB team-member limit when the plan row has a limits JSONB', async () => {
    mockGetUserSubscription.mockResolvedValue(
      makeSubscriptionResult('starter', { products: 40, broadcasts: 10, teamMembers: 5, customGroups: 5, priceLists: 5 })
    );

    // With DB limit 5, count of 4 should be allowed
    const allowed = await checkFeatureLimits('user-starter', 'teamMembers', 4);
    expect(allowed.allowed).toBe(true);
    expect(allowed.limit).toBe(5);

    // Count of 5 should be blocked (5 >= 5)
    const blocked = await checkFeatureLimits('user-starter', 'teamMembers', 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(5);
  });
});
