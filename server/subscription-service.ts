import Stripe from "stripe";
import { db } from "./db";
import { users, subscriptionPlans, userSubscriptions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
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
            "Up to 5 broadcasts per month", 
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
          monthlyPrice: "9.99",
          currency: "GBP",
          description: "Perfect for growing wholesale businesses",
          features: [
            "Up to 50 products",
            "Up to 25 broadcasts per month",
            "Advanced analytics and insights",
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
          monthlyPrice: "19.99",
          currency: "GBP", 
          description: "Everything you need to scale your wholesale business",
          features: [
            "Unlimited products",
            "Unlimited broadcasts", 
            "Full business performance analytics",
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
   * Update user subscription status from Stripe webhook
   */
  static async updateUserSubscriptionFromWebhook(stripeSubscriptionId: string, subscriptionData: any) {
    try {
      console.log('🔄 Updating user subscription from webhook:', stripeSubscriptionId);
      
      // Find user by Stripe subscription ID
      const [user] = await db.select().from(users)
        .where(eq(users.stripeSubscriptionId, stripeSubscriptionId));
        
      if (!user) {
        console.log('❌ User not found for subscription:', stripeSubscriptionId);
        return;
      }

      // Get plan info from Stripe subscription
      const priceId = subscriptionData.items?.data?.[0]?.price?.id;
      const plan = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, priceId));

      const planId = plan?.[0]?.planId || 'free';
      
      // Update user's subscription fields
      await db.update(users).set({
        subscriptionStatus: subscriptionData.status,
        currentPlan: planId,
        subscriptionPeriodStart: new Date(subscriptionData.current_period_start * 1000),
        subscriptionPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
        stripeSubscriptionId: stripeSubscriptionId,
        updatedAt: new Date()
      }).where(eq(users.id, user.id));

      // Update or create user subscription record
      const existingSub = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, user.id));

      if (existingSub.length > 0) {
        // Update existing subscription
        await db.update(userSubscriptions).set({
          planId: planId,
          stripeSubscriptionId: stripeSubscriptionId,
          status: subscriptionData.status,
          currentPeriodStart: new Date(subscriptionData.current_period_start * 1000),
          currentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
          cancelAtPeriodEnd: subscriptionData.cancel_at_period_end,
          updatedAt: new Date()
        }).where(eq(userSubscriptions.userId, user.id));
      } else {
        // Create new subscription record
        await db.insert(userSubscriptions).values({
          userId: user.id,
          planId: planId,
          stripeSubscriptionId: stripeSubscriptionId,
          status: subscriptionData.status,
          currentPeriodStart: new Date(subscriptionData.current_period_start * 1000),
          currentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
          cancelAtPeriodEnd: subscriptionData.cancel_at_period_end
        });
      }

      console.log('✅ User subscription updated successfully:', user.id, planId);
      
    } catch (error) {
      console.error('❌ Failed to update user subscription from webhook:', error);
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