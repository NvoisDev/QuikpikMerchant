import { Request, Response, NextFunction } from 'express';
import SubscriptionService from '../subscription-service';
import { db } from '../db';
import { teamMembers, priceLists } from '@shared/schema';
import { eq, and, count as drizzleCount } from 'drizzle-orm';

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role?: string;
    currentPlan?: string;
    subscriptionStatus?: string;
  }
}

/**
 * Feature gating middleware - checks if user has access to specific features
 */
export function requireFeatureAccess(feature: string, maxValue?: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          feature,
          code: 'AUTH_REQUIRED'
        });
      }

      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && (req.user as any).wholesalerId)
        ? (req.user as any).wholesalerId
        : req.user.id;
      const hasAccess = await SubscriptionService.checkFeatureAccess(userId, feature, maxValue);

      if (!hasAccess) {
        const { plan, currentPlan } = await SubscriptionService.getUserSubscription(userId);
        const limits = plan?.limits || getDefaultLimits();
        
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
    const { plan, currentPlan } = await SubscriptionService.getUserSubscription(userId);
    const limits = plan?.limits || getDefaultLimits();
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
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get current product count for this wholesaler
      const currentCount = await getCurrentProductCount(req.user.id);
      const limits = await checkFeatureLimits(req.user.id, 'products', currentCount);

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
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get current broadcast count for this month
      const currentCount = await getCurrentBroadcastCount(req.user.id);
      const limits = await checkFeatureLimits(req.user.id, 'broadcasts', currentCount);

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
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const currentCount = await getCurrentTeamMemberCount(req.user.id);
      const limits = await checkFeatureLimits(req.user.id, 'teamMembers', currentCount);

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
 * Get default limits for free plan
 */
function getDefaultLimits() {
  return {
    products: 2,
    broadcasts: 5,
    teamMembers: 0, // Free plan: 0 invited members (owner only, not in teamMembers table)
    customGroups: 2,
    priceLists: 2,
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
    const planHierarchy: Record<string, number> = { free: 0, standard: 1, premium: 2 };
    const resolvedTier =
      (planHierarchy[tierFromPlan] ?? 0) < (planHierarchy[tierFromDb] ?? 0)
        ? tierFromPlan
        : tierFromDb;
    const userTier = resolvedTier;
    
    console.log(`🔍 getUserPlanLimits for user ${userId}: tier=${userTier}, plan=${JSON.stringify(plan?.limits)}`);
    
    if (userTier === 'premium') {
      // Premium users get unlimited everything
      limits = {
        products: -1,
        broadcasts: -1, 
        teamMembers: -1,
        customGroups: -1,
        priceLists: -1,
      };
      console.log('✅ Premium user detected - applying unlimited limits');
    } else if (userTier === 'standard') {
      // Standard users get higher limits
      limits = {
        products: 5,
        broadcasts: 25,
        teamMembers: 3,
        customGroups: 5,
        priceLists: 5,
      };
      console.log('📊 Standard user detected - applying standard limits');
    } else {
      // Free users get basic limits
      limits = getDefaultLimits();
      console.log('🆓 Free user detected - applying free limits');
    }
    
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