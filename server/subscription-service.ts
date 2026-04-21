import Stripe from "stripe";
import { db } from "./db";
import { users, subscriptionPlans, userSubscriptions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
});

export class SubscriptionService {
  
  /**
   * Initialize default subscription plans in the database
   */
  static async initializePlans() {
    try {
      // Check if plans already exist
      const existingPlans = await db.select().from(subscriptionPlans);
      if (existingPlans.length > 0) {
        console.log('📋 Subscription plans already initialized');
        return existingPlans;
      }

      // Create default plans
      const defaultPlans = [
        {
          name: "Free",
          planId: "free",
          stripeProductId: null,
          stripePriceId: null,
          monthlyPrice: "0.00",
          currency: "GBP",
          description: "Get started with basic features",
          features: [
            "Up to 10 products",
            "Broadcast tools coming soon",
            "Basic dashboard analytics",
            "Standard email support"
          ],
          limits: {
            products: 10,
            broadcasts: 5,
            teamMembers: 1,
            customGroups: 2
          },
          sortOrder: 0
        },
        {
          name: "Standard",
          planId: "standard", 
          stripeProductId: "prod_standard", // Will be updated with real Stripe product ID
          stripePriceId: "price_standard", // Will be updated with real Stripe price ID
          monthlyPrice: "19.99",
          currency: "GBP",
          description: "Perfect for growing wholesale businesses",
          features: [
            "Up to 50 products",
            "Broadcast tools coming soon",
            "Basic dashboard analytics",
            "Priority email support"
          ],
          limits: {
            products: 50,
            broadcasts: 25,
            teamMembers: 3,
            customGroups: 5
          },
          sortOrder: 1
        },
        {
          name: "Premium",
          planId: "premium",
          stripeProductId: "prod_premium", // Will be updated with real Stripe product ID  
          stripePriceId: "price_premium", // Will be updated with real Stripe price ID
          monthlyPrice: "39.99",
          currency: "GBP", 
          description: "Everything you need to scale your wholesale business",
          features: [
            "Unlimited products",
            "Broadcast tools coming soon",
            "Custom reports and insights",
            "Priority email and phone support"
          ],
          limits: {
            products: -1, // unlimited
            broadcasts: -1, // unlimited  
            teamMembers: -1, // unlimited
            customGroups: -1 // unlimited
          },
          sortOrder: 2
        }
      ];

      const createdPlans = await db.insert(subscriptionPlans).values(defaultPlans).returning();
      console.log('✅ Default subscription plans created:', createdPlans.map(p => p.name).join(', '));
      return createdPlans;
      
    } catch (error) {
      console.error('❌ Failed to initialize subscription plans:', error);
      throw error;
    }
  }

  /**
   * Create or update a subscription - handles both new subscriptions and plan changes
   */
  static async createSubscription(stripeCustomerId: string, priceId: string): Promise<Stripe.Subscription> {
    try {
      console.log('🔄 Creating/updating subscription:', { stripeCustomerId, priceId });

      // Look for an existing subscription for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all', // Include canceled subscriptions
      });

      if (subscriptions.data.length > 0) {
        // If a subscription exists, update it to the new price
        const subscription = subscriptions.data[0];
        console.log('📝 Updating existing subscription:', subscription.id);
        
        const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
          proration_behavior: 'always_invoice', // Handle pro-rated billing
          items: [{
            id: subscription.items.data[0].id,
            price: priceId, // Switch to the new plan's price ID
          }],
        });
        
        console.log('✅ Subscription updated successfully:', updatedSubscription.id);
        return updatedSubscription;
        
      } else {
        // If no subscription exists, create a new one
        console.log('🆕 Creating new subscription');
        
        const newSubscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: priceId }],
          // For a Free plan, you can set a trial period
          trial_period_days: priceId === 'free_plan_price_id' ? 30 : undefined,
        });
        
        console.log('✅ New subscription created successfully:', newSubscription.id);
        return newSubscription;
      }
      
    } catch (error) {
      console.error('❌ Failed to create or update subscription:', error);
      throw error;
    }
  }

  /**
   * Upgrade subscription with proration - instant access, prorated billing
   */
  static async upgradeSubscriptionWithProration(
    subscriptionId: string, 
    newPriceId: string, 
    newPlanId: string
  ): Promise<Stripe.Subscription> {
    try {
      console.log('🚀 Upgrading subscription with proration:', { subscriptionId, newPriceId, newPlanId });

      // Get the current subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update subscription with immediate proration
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        proration_behavior: 'create_prorations', // Create prorations for immediate billing
        billing_cycle_anchor: 'unchanged', // Keep the same billing cycle
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId,
        }],
        metadata: {
          ...subscription.metadata,
          upgraded_from: subscription.items.data[0].price.id,
          upgraded_to: newPriceId,
          upgrade_timestamp: new Date().toISOString(),
          planId: newPlanId
        }
      });

      console.log('✅ Subscription upgraded with proration:', updatedSubscription.id);
      return updatedSubscription;
    } catch (error) {
      console.error('❌ Failed to upgrade subscription with proration:', error);
      throw error;
    }
  }

  /**
   * Downgrade subscription with immediate proration - instant access change and credit refund
   */
  static async immediateDowngradeWithProration(
    subscriptionId: string, 
    newPriceId: string, 
    newPlanId: string
  ): Promise<Stripe.Subscription> {
    try {
      console.log('📉 Downgrading subscription with immediate proration:', { subscriptionId, newPriceId, newPlanId });

      // Get the current subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update subscription with immediate proration (creates credit for unused time)
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        proration_behavior: 'create_prorations', // Create prorations for immediate billing/credit
        billing_cycle_anchor: 'unchanged', // Keep the same billing cycle
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId, // Switch to the new (lower) plan's price ID
        }],
        metadata: {
          ...subscription.metadata,
          downgraded_from: subscription.items.data[0].price.id,
          downgraded_to: newPriceId,
          downgrade_timestamp: new Date().toISOString(),
          planId: newPlanId
        }
      });

      console.log('✅ Stripe subscription downgraded with immediate proration:', updatedSubscription.id);

      // CRITICAL FIX: Update database immediately after Stripe call
      console.log('🔄 Updating database immediately after downgrade...');
      
      // Find user by subscription ID
      const [user] = await db.select().from(users)
        .where(eq(users.stripeSubscriptionId, subscriptionId));
        
      if (!user) {
        console.error('❌ User not found for subscription:', subscriptionId);
        throw new Error('User not found for subscription');
      }

      // Update user's subscription fields immediately
      await db.update(users).set({
        subscriptionStatus: updatedSubscription.status,
        currentPlan: newPlanId,
        subscriptionPeriodStart: updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : null,
        subscriptionPeriodEnd: updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : null,
        updatedAt: new Date()
      }).where(eq(users.id, user.id));

      // Update or create user subscription record immediately
      const existingSub = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, user.id));

      if (existingSub.length > 0) {
        // Update existing subscription
        await db.update(userSubscriptions).set({
          planId: newPlanId,
          stripeSubscriptionId: subscriptionId,
          status: updatedSubscription.status,
          currentPeriodStart: updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : null,
          currentPeriodEnd: updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : null,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
          updatedAt: new Date()
        }).where(eq(userSubscriptions.userId, user.id));
        
        console.log('✅ Updated existing subscription record for user:', user.id);
      } else {
        // Create new subscription record
        await db.insert(userSubscriptions).values({
          userId: user.id,
          planId: newPlanId,
          stripeSubscriptionId: subscriptionId,
          status: updatedSubscription.status,
          currentPeriodStart: updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : null,
          currentPeriodEnd: updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : null,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end
        });
        
        console.log('✅ Created new subscription record for user:', user.id);
      }

      console.log('✅ Database updated immediately after downgrade for user:', user.id, 'New plan:', newPlanId);
      return updatedSubscription;
    } catch (error) {
      console.error('❌ Failed to downgrade subscription with proration:', error);
      throw error;
    }
  }

  /**
   * Get current active subscription for a user
   */
  static async getCurrentSubscription(userId: string) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return null;
      }

      if (user.stripeSubscriptionId) {
        // Verify subscription is still active in Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        if (stripeSubscription.status === 'active') {
          return {
            userId: user.id,
            stripeSubscriptionId: user.stripeSubscriptionId,
            currentPlan: user.currentPlan,
            subscriptionStatus: user.subscriptionStatus,
            stripeSubscription
          };
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Failed to get current subscription:', error);
      return null;
    }
  }

  /**
   * Get or create Stripe customer for a user
   */
  static async getOrCreateStripeCustomer(userId: string): Promise<string> {
    try {
      // Get user from database
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw new Error('User not found');
      }

      // Return existing Stripe customer ID if exists
      if (user.stripeCustomerId) {
        console.log('📋 Using existing Stripe customer:', user.stripeCustomerId);
        return user.stripeCustomerId;
      }

      // Create new Stripe customer
      console.log('🆕 Creating new Stripe customer for user:', userId);
      const stripeCustomer = await stripe.customers.create({
        email: user.email || undefined,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
        metadata: {
          userId: userId,
          businessName: user.businessName || '',
        }
      });

      // Update user with Stripe customer ID
      await db.update(users)
        .set({ stripeCustomerId: stripeCustomer.id })
        .where(eq(users.id, userId));

      console.log('✅ Stripe customer created:', stripeCustomer.id);
      return stripeCustomer.id;
      
    } catch (error) {
      console.error('❌ Failed to get or create Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Get user's current subscription status and plan
   */
  static async getUserSubscription(userId: string) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw new Error('User not found');
      }

      // Get current subscription details from our database
      const [userSub] = await db
        .select({
          subscription: userSubscriptions,
          plan: subscriptionPlans
        })
        .from(userSubscriptions)
        .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.planId))
        .where(eq(userSubscriptions.userId, userId))
        .orderBy(userSubscriptions.createdAt);

      return {
        user,
        subscription: userSub?.subscription || null,
        plan: userSub?.plan || null,
        currentPlan: user.currentPlan || 'free',
        subscriptionStatus: user.subscriptionStatus || 'free'
      };
      
    } catch (error) {
      console.error('❌ Failed to get user subscription:', error);
      throw error;
    }
  }

  /**
   * Handle prorated free downgrade with credit calculation and immediate effect
   */
  static async proratedFreeDowngrade(subscriptionId: string, userId: string): Promise<{
    success: boolean;
    proratedCredit: number;
    message: string;
  }> {
    try {
      console.log('🆓 Processing prorated free downgrade:', { subscriptionId, userId });

      // Get current subscription details for credit calculation
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Calculate prorated credit for unused time
      const now = Math.floor(Date.now() / 1000);
      const periodStart = subscription.current_period_start;
      const periodEnd = subscription.current_period_end;
      const totalPeriod = periodEnd - periodStart;
      const remainingPeriod = periodEnd - now;
      const currentPrice = subscription.items.data[0].price.unit_amount || 0;
      
      // Calculate prorated credit (what they get back)
      const proratedCredit = remainingPeriod > 0 
        ? (currentPrice / 100) * (remainingPeriod / totalPeriod)
        : 0;

      console.log('💰 Proration calculation:', {
        currentPrice: currentPrice / 100,
        remainingPeriod,
        totalPeriod,
        proratedCredit: proratedCredit.toFixed(2)
      });

      // Create credit note/invoice item for the prorated amount before cancellation
      if (proratedCredit > 0) {
        await stripe.invoiceItems.create({
          customer: subscription.customer as string,
          amount: -Math.round(proratedCredit * 100), // Negative amount = credit
          currency: subscription.items.data[0].price.currency,
          description: `Pro-rated credit for early downgrade to Free plan from ${new Date(now * 1000).toLocaleDateString()}`,
          metadata: {
            type: 'free_downgrade_credit',
            originalSubscriptionId: subscriptionId,
            userId: userId,
            creditAmount: proratedCredit.toFixed(2)
          }
        });
      }

      // Cancel subscription immediately after applying credit
      const cancelledSubscription = await stripe.subscriptions.cancel(subscriptionId, {
        prorate: true, // Ensure any final proration is applied
        invoice_now: true // Create final invoice with credit
      });

      console.log('✅ Stripe subscription cancelled successfully:', subscriptionId);

      // CRITICAL FIX: Update database immediately after Stripe cancellation
      console.log('🔄 Updating database immediately after free downgrade...');
      
      // Find user by user ID
      const [user] = await db.select().from(users)
        .where(eq(users.id, userId));
        
      if (!user) {
        console.error('❌ User not found for userId:', userId);
        throw new Error('User not found');
      }

      // Update user's subscription fields to free plan immediately
      await db.update(users).set({
        subscriptionStatus: 'free',
        currentPlan: 'free',
        stripeSubscriptionId: null, // Clear subscription ID since cancelled
        subscriptionPeriodStart: null,
        subscriptionPeriodEnd: null,
        updatedAt: new Date()
      }).where(eq(users.id, userId));

      // Update or create user subscription record immediately
      const existingSub = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId));

      if (existingSub.length > 0) {
        // Update existing subscription to cancelled/free
        await db.update(userSubscriptions).set({
          planId: 'free',
          stripeSubscriptionId: null, // Clear since cancelled
          status: 'canceled',
          cancelAtPeriodEnd: null, // No longer relevant
          updatedAt: new Date()
        }).where(eq(userSubscriptions.userId, userId));
        
        console.log('✅ Updated existing subscription record to free for user:', userId);
      } else {
        // Create new free subscription record
        await db.insert(userSubscriptions).values({
          userId: userId,
          planId: 'free',
          stripeSubscriptionId: null,
          status: 'free',
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null
        });
        
        console.log('✅ Created new free subscription record for user:', userId);
      }

      console.log('✅ Database updated immediately after free downgrade for user:', userId);
      console.log('✅ Free downgrade with proration completed successfully');
      return {
        success: true,
        proratedCredit: Math.max(0, proratedCredit),
        message: proratedCredit > 0 
          ? `Subscription cancelled with £${proratedCredit.toFixed(2)} credit applied to your account`
          : 'Subscription cancelled and downgraded to Free plan'
      };
    } catch (error) {
      console.error('❌ Failed to process prorated free downgrade:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription with proper Stripe integration (delegated from routes)
   */
  static async cancelSubscription(subscriptionId: string, options?: {
    cancelAtPeriodEnd?: boolean;
    prorate?: boolean;
  }): Promise<Stripe.Subscription> {
    try {
      console.log('🛑 Cancelling subscription:', subscriptionId, options);

      if (options?.cancelAtPeriodEnd) {
        // Schedule cancellation at period end
        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
        console.log('📅 Subscription scheduled for cancellation at period end');
        return subscription;
      } else {
        // Cancel immediately
        const cancelledSubscription = await stripe.subscriptions.cancel(subscriptionId, {
          prorate: options?.prorate ?? true,
          invoice_now: true
        });
        console.log('✅ Subscription cancelled immediately');
        return cancelledSubscription;
      }
    } catch (error) {
      console.error('❌ Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Get all available subscription plans
   */
  static async getPlans() {
    try {
      const plans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(subscriptionPlans.sortOrder);
        
      return plans;
    } catch (error) {
      console.error('❌ Failed to get subscription plans:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to a feature based on their plan
   */
  static async checkFeatureAccess(userId: string, feature: string, value?: number): Promise<boolean> {
    try {
      const { plan, currentPlan } = await this.getUserSubscription(userId);
      
      // Free plan users get basic access
      if (!plan || currentPlan === 'free') {
        const freeLimits = {
          products: 10,
          broadcasts: 5,
          teamMembers: 1,
          customGroups: 2
        };
        
        if (value !== undefined) {
          return value <= (freeLimits[feature as keyof typeof freeLimits] || 0);
        }
        return feature in freeLimits;
      }

      // Check plan limits
      const limits = plan.limits as any;
      if (!limits || !limits[feature]) {
        return true; // No limit defined = unlimited access
      }

      const limit = limits[feature];
      if (limit === -1) {
        return true; // -1 = unlimited
      }

      if (value !== undefined) {
        return value <= limit;
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to check feature access:', error);
      return false; // Fail safe - deny access on error
    }
  }
}

export default SubscriptionService;