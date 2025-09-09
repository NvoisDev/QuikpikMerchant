import { Request, Response, NextFunction } from 'express';
import SubscriptionService from '../subscription-service';

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

      const userId = req.user.id;
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
    const { eq } = await import('drizzle-orm');

    const result = await db.select({ count: products.id }).from(products)
      .where(eq(products.wholesalerId, userId));

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
    // For now, return 1 (the user themselves) as team member functionality isn't fully implemented
    // This can be expanded when team member tables are added
    return 1;
  } catch (error) {
    console.error('❌ Error getting team member count:', error);
    return 1;
  }
}

/**
 * Get default limits for free plan
 */
function getDefaultLimits() {
  return {
    products: 10,
    broadcasts: 5,
    teamMembers: 1,
    customGroups: 2
  };
}

/**
 * Utility function to get user's current plan info and limits
 */
export async function getUserPlanLimits(userId: string) {
  try {
    const { plan, currentPlan } = await SubscriptionService.getUserSubscription(userId);
    const limits = plan?.limits || getDefaultLimits();
    
    // 🐛 DEBUG: Log subscription data to identify Premium limits issue
    console.log('🔍 DEBUG getUserPlanLimits:', {
      userId,
      currentPlan,
      planExists: !!plan,
      planLimits: plan?.limits,
      finalLimits: limits,
      isPremium: currentPlan === 'premium',
      productsLimit: limits.products
    });
    
    // Get current usage counts
    const [productCount, broadcastCount, teamMemberCount] = await Promise.all([
      getCurrentProductCount(userId),
      getCurrentBroadcastCount(userId), 
      getCurrentTeamMemberCount(userId)
    ]);

    return {
      plan: currentPlan || 'free',
      limits,
      usage: {
        products: productCount,
        broadcasts: broadcastCount,
        teamMembers: teamMemberCount
      },
      percentUsed: {
        products: limits.products === -1 ? 0 : Math.round((productCount / limits.products) * 100),
        broadcasts: limits.broadcasts === -1 ? 0 : Math.round((broadcastCount / limits.broadcasts) * 100),
        teamMembers: limits.teamMembers === -1 ? 0 : Math.round((teamMemberCount / limits.teamMembers) * 100)
      }
    };
  } catch (error) {
    console.error('❌ Error getting user plan limits:', error);
    throw error;
  }
}