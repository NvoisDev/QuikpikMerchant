import { Request, Response, NextFunction } from 'express';
import SubscriptionService from '../subscription-service';
import { db } from '../db';
import { teamMembers, priceLists } from '@shared/schema';
import { eq, and, count as drizzleCount } from 'drizzle-orm';
import { PLAN_LIMITS, PLAN_HIERARCHY, getPlanLimits, hasFeatureFlag, type BooleanFeature } from '../config/plan-limits';

/**
 * Boolean feature gate middleware.
 * Blocks requests from Listing-tier users (and any future tiers where the flag is disabled).
 * Returns 403 with code: 'FEATURE_NOT_IN_PLAN' so the frontend can show an upgrade prompt.
 *
 * Team members inherit the wholesaler owner's subscription plan, matching the pattern
 * used by requireFeatureAccess and requireTeamMemberLimits.
 */
export function requireBooleanFeature(feature: BooleanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }

      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;

      const { currentPlan, user } = await SubscriptionService.getUserSubscription(userId);
      const tierFromDb = user?.subscriptionTier || 'free';
      const tierFromPlan = currentPlan || 'free';
      const tier = (PLAN_HIERARCHY[tierFromPlan] ?? 0) < (PLAN_HIERARCHY[tierFromDb] ?? 0)
        ? tierFromPlan : tierFromDb;

      if (!hasFeatureFlag(tier, feature)) {
        return res.status(403).json({
          error: 'This feature is not available on your current plan. Upgrade to Starter or above to unlock it.',
          feature,
          currentPlan: tier,
          code: 'FEATURE_NOT_IN_PLAN',
          upgradeUrl: '/subscription/pricing',
        });
      }
      next();
    } catch (error) {
      console.error('❌ Boolean feature gate error:', error);
      res.status(500).json({ error: 'Failed to check feature access', feature, code: 'FEATURE_CHECK_FAILED' });
    }
  };
}

/**
 * Feature gating middleware - checks if user has access to specific features
 */
export function requireFeatureAccess(feature: string, maxValue?: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          feature,
          code: 'AUTH_REQUIRED'
        });
      }

      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;
      const hasAccess = await SubscriptionService.checkFeatureAccess(userId, feature, maxValue);

      if (!hasAccess) {
        const { plan, currentPlan } = await SubscriptionService.getUserSubscription(userId);
        const limits = (plan?.limits || getDefaultLimits()) as Record<string, number | undefined>;
        
        return res.status(403).json({
          error: 'Feature access denied - subscription upgrade required',
          feature,
          currentPlan: currentPlan || 'free',
          currentLimit: limits[feature] || 0,
          requestedValue: maxValue,
          code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
          upgradeUrl: '/subscription/pricing'
        });
      }

      next();
    } catch (error) {
      console.error('❌ Feature gating error:', error);
      res.status(500).json({ 
        error: 'Failed to check feature access',
        feature,
        code: 'FEATURE_CHECK_FAILED'
      });
    }
  };
}

/**
 * Check specific feature limits before allowing operations
 */
export async function checkFeatureLimits(userId: string, feature: string, currentCount: number): Promise<{
  allowed: boolean;
  limit: number;
  currentCount: number;
  plan: string;
  upgradeRequired: boolean;
}> {
  try {
    const { plan, currentPlan, user } = await SubscriptionService.getUserSubscription(userId);
    // When a user has no user_subscriptions row, plan is null and we must not fall back to
    // free-tier defaults — instead derive limits from the user's actual subscriptionTier /
    // currentPlan, exactly as getUserPlanLimits does. getPlanLimits falls back to free if
    // the tier is unrecognised, so this is always safe.
    const tierFromDb = user?.subscriptionTier || 'free';
    const tierFromPlan = currentPlan || 'free';
    const resolvedTier = (PLAN_HIERARCHY[tierFromPlan] ?? 0) < (PLAN_HIERARCHY[tierFromDb] ?? 0)
      ? tierFromPlan : tierFromDb;
    const planLimits = getPlanLimits(resolvedTier);
    const fallbackLimits = {
      products: planLimits.products,
      broadcasts: planLimits.broadcasts,
      teamMembers: planLimits.teamMembers,
      customGroups: planLimits.groups,
      priceLists: planLimits.priceLists,
    };
    const limits = (plan?.limits || fallbackLimits) as Record<string, number | undefined>;
    const limit = limits[feature] ?? -1; // -1 = unlimited
    
    const allowed = limit === -1 || currentCount < limit;
    
    return {
      allowed,
      limit,
      currentCount,
      plan: currentPlan || 'free',
      upgradeRequired: !allowed
    };
  } catch (error) {
    console.error('❌ Error checking feature limits:', error);
    return {
      allowed: false,
      limit: 0,
      currentCount,
      plan: 'free',
      upgradeRequired: true
    };
  }
}

/**
 * Middleware to validate product creation limits
 */
export function requireProductLimits() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;

      // Get current product count for this wholesaler
      const currentCount = await getCurrentProductCount(userId);
      const limits = await checkFeatureLimits(userId, 'products', currentCount);

      if (!limits.allowed) {
        return res.status(403).json({
          error: 'Product limit exceeded',
          currentPlan: limits.plan,
          currentCount: limits.currentCount,
          limit: limits.limit,
          code: 'PRODUCT_LIMIT_EXCEEDED',
          upgradeUrl: '/subscription/pricing',
          message: `You've reached your ${limits.plan} plan limit of ${limits.limit} products. Upgrade to add more products.`
        });
      }

      next();
    } catch (error) {
      console.error('❌ Product limits check error:', error);
      res.status(500).json({ error: 'Failed to check product limits' });
    }
  };
}

/**
 * Middleware to validate broadcast/campaign limits
 */
export function requireBroadcastLimits() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;

      // Get current broadcast count for this month
      const currentCount = await getCurrentBroadcastCount(userId);
      const limits = await checkFeatureLimits(userId, 'broadcasts', currentCount);

      if (!limits.allowed) {
        return res.status(403).json({
          error: 'Broadcast limit exceeded',
          currentPlan: limits.plan,
          currentCount: limits.currentCount,
          limit: limits.limit,
          code: 'BROADCAST_LIMIT_EXCEEDED',
          upgradeUrl: '/subscription/pricing',
          message: `You've reached your ${limits.plan} plan limit of ${limits.limit} broadcasts this month. Upgrade for more broadcasts.`
        });
      }

      next();
    } catch (error) {
      console.error('❌ Broadcast limits check error:', error);
      res.status(500).json({ error: 'Failed to check broadcast limits' });
    }
  };
}

/**
 * Middleware to validate team member limits
 */
export function requireTeamMemberLimits() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;

      const currentCount = await getCurrentTeamMemberCount(userId);
      const limits = await checkFeatureLimits(userId, 'teamMembers', currentCount);

      if (!limits.allowed) {
        return res.status(403).json({
          error: 'Team member limit exceeded',
          currentPlan: limits.plan,
          currentCount: limits.currentCount,
          limit: limits.limit,
          code: 'TEAM_LIMIT_EXCEEDED',
          upgradeUrl: '/subscription/pricing',
          message: `You've reached your ${limits.plan} plan limit of ${limits.limit} team members. Upgrade to add more team members.`
        });
      }

      next();
    } catch (error) {
      console.error('❌ Team member limits check error:', error);
      res.status(500).json({ error: 'Failed to check team member limits' });
    }
  };
}

/**
 * Helper function to get current product count for a user
 */
async function getCurrentProductCount(userId: string): Promise<number> {
  try {
    const { db } = await import('../db');
    const { products } = await import('../../shared/schema');
    const { eq, and, inArray } = await import('drizzle-orm');

    // Count only active and inactive products (not locked, which are overflow beyond plan limit)
    const result = await db.select({ count: products.id }).from(products)
      .where(and(
        eq(products.wholesalerId, userId),
        inArray(products.status, ['active', 'inactive'])
      ));

    return result.length;
  } catch (error) {
    console.error('❌ Error getting product count:', error);
    return 0;
  }
}

/**
 * Helper function to get current broadcast count for the current month
 */
async function getCurrentBroadcastCount(userId: string): Promise<number> {
  try {
    const { db } = await import('../db');
    const { broadcasts } = await import('../../shared/schema');
    const { eq, and, gte } = await import('drizzle-orm');

    // Get broadcasts from the current month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const result = await db.select({ count: broadcasts.id }).from(broadcasts)
      .where(and(
        eq(broadcasts.wholesalerId, userId),
        gte(broadcasts.createdAt, startOfMonth)
      ));

    return result.length;
  } catch (error) {
    console.error('❌ Error getting broadcast count:', error);
    return 0;
  }
}

/**
 * Helper function to get current team member count
 */
async function getCurrentTeamMemberCount(userId: string): Promise<number> {
  try {
    const result = await db.select({ value: drizzleCount() })
      .from(teamMembers)
      .where(and(
        eq(teamMembers.wholesalerId, userId),
        eq(teamMembers.status, 'active')
      ));
    // Returns count of active invited rows in the teamMembers table (excludes the owner)
    return result[0]?.value ?? 0;
  } catch (error) {
    console.error('❌ Error getting team member count:', error);
    return 0;
  }
}

/**
 * Helper function to get current price list count (unlocked only)
 */
async function getCurrentPriceListCount(userId: string): Promise<number> {
  try {
    const result = await db.select({ value: drizzleCount() })
      .from(priceLists)
      .where(and(
        eq(priceLists.wholesalerId, userId),
        eq(priceLists.isLocked, false)
      ));
    return result[0]?.value ?? 0;
  } catch (error) {
    console.error('❌ Error getting price list count:', error);
    return 0;
  }
}

/**
 * Get default limits for free plan — derived from canonical PLAN_LIMITS.
 */
function getDefaultLimits() {
  return {
    products: PLAN_LIMITS.free.products,
    broadcasts: PLAN_LIMITS.free.broadcasts,
    teamMembers: PLAN_LIMITS.free.teamMembers,
    customGroups: PLAN_LIMITS.free.groups,
    priceLists: PLAN_LIMITS.free.priceLists,
  };
}

/**
 * Utility function to get user's current plan info and limits
 */
export async function getUserPlanLimits(userId: string) {
  try {
    const { plan, currentPlan, user, subscription } = await SubscriptionService.getUserSubscription(userId);
    
    // Use the most restrictive of subscriptionTier and currentPlan.
    // This guards against the case where currentPlan has been set to 'free'
    // (e.g. after cancellation) but subscriptionTier still holds the old tier.
    let limits;
    const tierFromDb = user?.subscriptionTier || 'free';
    const tierFromPlan = currentPlan || 'free';
    const resolvedTier =
      (PLAN_HIERARCHY[tierFromPlan] ?? 0) < (PLAN_HIERARCHY[tierFromDb] ?? 0)
        ? tierFromPlan
        : tierFromDb;
    const userTier = resolvedTier;
    
    console.log(`🔍 getUserPlanLimits for user ${userId}: tier=${userTier}, plan=${JSON.stringify(plan?.limits)}`);
    
    // Prefer DB plan limits when set (allows admin to edit them without a redeploy),
    // falling back to the canonical PLAN_LIMITS config as a safety net.
    const planLimits = getPlanLimits(userTier);
    const fallbackLimits = {
      products: planLimits.products,
      broadcasts: planLimits.broadcasts,
      teamMembers: planLimits.teamMembers,
      customGroups: planLimits.groups,
      priceLists: planLimits.priceLists,
    };
    const dbLimits = plan?.limits as Record<string, number> | null | undefined;
    const hasDbLimits = dbLimits && Object.keys(dbLimits).length > 0;
    limits = hasDbLimits ? {
      products: dbLimits.products ?? fallbackLimits.products,
      broadcasts: dbLimits.broadcasts ?? fallbackLimits.broadcasts,
      teamMembers: dbLimits.teamMembers ?? fallbackLimits.teamMembers,
      customGroups: dbLimits.customGroups ?? fallbackLimits.customGroups,
      priceLists: dbLimits.priceLists ?? fallbackLimits.priceLists,
    } : fallbackLimits;
    console.log(`📊 ${userTier} user detected - applying limits from ${hasDbLimits ? 'DB plan' : 'PLAN_LIMITS'}`);
    
    // Get current usage counts
    const [productCount, broadcastCount, teamMemberCount, priceListCount] = await Promise.all([
      getCurrentProductCount(userId),
      getCurrentBroadcastCount(userId), 
      getCurrentTeamMemberCount(userId),
      getCurrentPriceListCount(userId),
    ]);

    const result = {
      plan: userTier,
      limits,
      usage: {
        products: productCount,
        broadcasts: broadcastCount,
        teamMembers: teamMemberCount,
        priceLists: priceListCount,
      },
      percentUsed: {
        products: limits.products === -1 ? 0 : Math.round((productCount / limits.products) * 100),
        broadcasts: limits.broadcasts === -1 ? 0 : Math.round((broadcastCount / limits.broadcasts) * 100),
        // Guard against zero limit (Free plan: 0 invited members allowed)
        // If limit is 0, show 100% when there are members, 0% otherwise
        teamMembers: limits.teamMembers === -1 ? 0 : limits.teamMembers === 0 ? (teamMemberCount > 0 ? 100 : 0) : Math.round((teamMemberCount / limits.teamMembers) * 100),
        priceLists: limits.priceLists === -1 ? 0 : Math.round((priceListCount / limits.priceLists) * 100),
      },
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      subscriptionPeriodEnd: user?.subscriptionPeriodEnd ?? null,
    };
    
    console.log(`✅ Final limits for ${userTier} user:`, result);
    return result;
  } catch (error) {
    console.error('❌ Error getting user plan limits:', error);
    throw error;
  }
}