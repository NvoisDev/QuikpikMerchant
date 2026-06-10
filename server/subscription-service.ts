import Stripe from "stripe";
import { db } from "./db";
import { users, subscriptionPlans, userSubscriptions } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

import { getStripeClient } from "./stripeConfig";
import { getPlanLimits } from "./config/plan-limits";

function requireStripe(isTestAccount: boolean | null | undefined) {
  if (isTestAccount == null) throw new Error("Missing isTestAccount context for Stripe operation");
  return getStripeClient(isTestAccount);
}

/**
 * Returns true while we are within the introductory pricing window
 * (now → 30 April 2027 inclusive). On 1 May 2027 UTC this returns false
 * and the system reverts to the original prices automatically.
 */
export function isIntroPricingPeriod(): boolean {
  return new Date() < new Date('2027-05-01T00:00:00Z');
}

export class SubscriptionService {
  
  /**
   * Initialize default subscription plans in the database
   */
  static async initializePlans() {
    try {
      // Check if plans already exist
      const existingPlans = await db.select().from(subscriptionPlans);

      // Create default plans
      const defaultPlans = [
        {
          name: "Listing",
          planId: "listing",
          stripeProductId: null,
          stripePriceId: null,
          monthlyPrice: "19.99",
          currency: "GBP",
          description: "Get discovered by retailers",
          features: [
            "Public supplier profile",
            "Up to 10 product listings",
            "Up to 2 price lists",
            "Marketplace & search visibility",
            "Retailer enquiries & leads",
            "Basic supplier dashboard",
          ],
          limits: {
            products: 10,
            broadcasts: 0,
            teamMembers: 1,
            customGroups: 2,
            priceLists: 2,
          },
          sortOrder: 0
        },
        {
          name: "Starter",
          planId: "starter",
          stripeProductId: null,
          stripePriceId: null,
          monthlyPrice: "29.99",
          currency: "GBP",
          description: "Everything you need to run your wholesale business",
          features: [
            "Up to 20 products",
            "Up to 5 price lists",
            "Invoices & payments",
            "Customer management",
            "Order management",
            "Stock history & tracking",
            "Basic reporting",
            "Customer portal",
          ],
          limits: {
            products: 20,
            broadcasts: 10,
            teamMembers: 1,
            customGroups: 5,
            priceLists: 5,
          },
          sortOrder: 1
        },
        {
          name: "Free",
          planId: "free",
          stripeProductId: null,
          stripePriceId: null,
          monthlyPrice: "0.00",
          currency: "GBP",
          description: "Legacy free plan — grandfathered to Starter access",
          features: [
            "Up to 20 products",
            "Up to 5 price lists",
            "Invoices & payments",
            "Customer management",
            "Order management",
            "Standard email support",
          ],
          limits: {
            products: 20,
            broadcasts: 10,
            teamMembers: 1,
            customGroups: 5,
            priceLists: 5,
          },
          sortOrder: 2
        },
        {
          name: "Standard",
          planId: "standard",
          stripeProductId: null,
          stripePriceId: null,
          monthlyPrice: "49.99",
          currency: "GBP",
          description: "Built for growing wholesale operations",
          features: [
            "Up to 50 products",
            "Up to 10 price lists",
            "Up to 3 team members",
            "Everything in Starter",
            "Picking & checklists",
            "Advanced analytics",
            "Lead management",
            "Enhanced reporting",
            "Priority support",
          ],
          limits: {
            products: 50,
            broadcasts: 25,
            teamMembers: 3,
            customGroups: 10,
            priceLists: 10,
          },
          sortOrder: 3
        },
        {
          name: "Premium",
          planId: "premium",
          stripeProductId: null,
          stripePriceId: null,
          monthlyPrice: "99.99",
          currency: "GBP",
          description: "Advanced tools for scaling wholesalers",
          features: [
            "Unlimited products",
            "Unlimited price lists",
            "Unlimited team members",
            "Everything in Standard",
            "Automation features",
            "Broadcast & marketing tools",
            "Advanced permissions",
            "Priority supplier ranking",
            "Premium support",
          ],
          limits: {
            products: -1,
            broadcasts: -1,
            teamMembers: -1,
            customGroups: -1,
            priceLists: -1,
          },
          sortOrder: 4
        }
      ];

      if (existingPlans.length === 0) {
        const createdPlans = await db.insert(subscriptionPlans).values(defaultPlans).returning();
        console.log('✅ Default subscription plans created:', createdPlans.map(p => p.name).join(', '));
        return createdPlans;
      }

      // Upsert: update existing plans and insert any new ones that don't exist yet
      const existingPlanIds = new Set(existingPlans.map(p => p.planId));
      const toInsert = defaultPlans.filter(p => !existingPlanIds.has(p.planId));
      if (toInsert.length > 0) {
        await db.insert(subscriptionPlans).values(toInsert);
        console.log('✅ New subscription plans inserted:', toInsert.map(p => p.name).join(', '));
      }

      // Always sync all plan fields so any code-level change is reflected in DB on restart
      for (const plan of defaultPlans) {
        await db.update(subscriptionPlans)
          .set({
            monthlyPrice: plan.monthlyPrice,
            currency: plan.currency,
            description: plan.description,
            features: plan.features,
            limits: plan.limits,
            sortOrder: plan.sortOrder,
          })
          .where(eq(subscriptionPlans.planId, plan.planId));
      }
      console.log('✅ Subscription plan data synced');
      return await db.select().from(subscriptionPlans);
      
    } catch (error) {
      console.error('❌ Failed to initialize subscription plans:', error);
      throw error;
    }
  }

  /**
   * Create or update a subscription - handles both new subscriptions and plan changes
   */
  static async createSubscription(stripeCustomerId: string, priceId: string, isTestAccount: boolean): Promise<Stripe.Subscription> {
    const stripe = requireStripe(isTestAccount);
    try {
      // Look for an existing subscription for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all', // Include canceled subscriptions
      });

      if (subscriptions.data.length > 0) {
        // If a subscription exists, update it to the new price
        const subscription = subscriptions.data[0];
        const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
          proration_behavior: 'always_invoice', // Handle pro-rated billing
          items: [{
            id: subscription.items.data[0].id,
            price: priceId, // Switch to the new plan's price ID
          }],
        });
        return updatedSubscription;
        
      } else {
        // If no subscription exists, create a new one
        const newSubscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: priceId }],
          // For a Free plan, you can set a trial period
          trial_period_days: priceId === 'free_plan_price_id' ? 30 : undefined,
        });
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
    newPlanId: string,
    isTestAccount: boolean,
  ): Promise<Stripe.Subscription> {
    const stripe = requireStripe(isTestAccount);
    try {
      // Get the current subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update subscription with immediate proration.
      // cancel_at_period_end is explicitly cleared so that upgrading re-commits the
      // customer to the subscription — a pending cancellation should not survive a
      // plan upgrade.
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        proration_behavior: 'create_prorations', // Create prorations for immediate billing
        billing_cycle_anchor: 'unchanged', // Keep the same billing cycle
        cancel_at_period_end: false, // Clear any scheduled cancellation on upgrade
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

      return updatedSubscription;
    } catch (error: any) {
      console.error('❌ Failed to upgrade subscription with proration:', {
        type: error?.type,
        code: error?.code,
        message: error?.message,
        raw: error
      });
      throw error;
    }
  }

  /**
   * Downgrade subscription with immediate proration - instant access change and credit refund
   */
  static async immediateDowngradeWithProration(
    subscriptionId: string, 
    newPriceId: string, 
    newPlanId: string,
    isTestAccount: boolean,
  ): Promise<Stripe.Subscription> {
    const stripe = requireStripe(isTestAccount);
    try {
      // Get the current subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update subscription with no proration — user simply pays the new (lower) rate
      // from the next billing date. Using 'create_prorations' caused duplicate proration
      // items if the endpoint was retried (e.g. stripeSubscriptionId missing from DB on
      // first attempt), stacking credits/debits and inflating the next invoice.
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        proration_behavior: 'none',
        billing_cycle_anchor: 'unchanged', // Keep the same billing cycle
        cancel_at_period_end: false, // Clear any scheduled cancellation so downgrade can proceed
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

      // CRITICAL FIX: Update database immediately after Stripe call
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
        cancelAtPeriodEnd: false,
        subscriptionPeriodStart: updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000) : null,
        subscriptionPeriodEnd: updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : null,
        updatedAt: new Date()
      } as Partial<typeof users.$inferInsert>).where(eq(users.id, user.id));

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
      }

      return updatedSubscription;
    } catch (error) {
      console.error('❌ Failed to downgrade subscription with proration:', error);
      throw error;
    }
  }

  /**
   * Get current active subscription for a user
   */
  static async getCurrentSubscription(userId: string, isTestAccount: boolean) {
    const stripe = requireStripe(isTestAccount);
    const activeStatuses = ['active', 'trialing', 'past_due'];
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return null;

      // 1. Try the subscription ID stored directly on the user row
      if (user.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          if (activeStatuses.includes(stripeSubscription.status)) {
            return {
              userId: user.id,
              stripeSubscriptionId: user.stripeSubscriptionId,
              currentPlan: user.currentPlan,
              subscriptionStatus: user.subscriptionStatus,
              stripeSubscription,
            };
          }
        } catch { /* fall through to next lookup */ }
      }

      // 2. Try the userSubscriptions table (written by the subscription.created/updated webhook)
      const [userSub] = await db
        .select({ stripeSubscriptionId: userSubscriptions.stripeSubscriptionId })
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId));
      if (userSub?.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(userSub.stripeSubscriptionId);
          if (activeStatuses.includes(stripeSubscription.status)) {
            // Backfill the users table so future lookups skip this fallback
            await db.update(users).set({ stripeSubscriptionId: userSub.stripeSubscriptionId }).where(eq(users.id, userId));
            return {
              userId: user.id,
              stripeSubscriptionId: userSub.stripeSubscriptionId,
              currentPlan: user.currentPlan,
              subscriptionStatus: user.subscriptionStatus,
              stripeSubscription,
            };
          }
        } catch { /* fall through */ }
      }

      // 3. Last resort: look up by Stripe customer ID (handles IDs known to Stripe but not persisted in DB)
      if (user.stripeCustomerId) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: 'active',
            limit: 1,
          });
          const stripeSubscription = subscriptions.data[0];
          if (stripeSubscription && activeStatuses.includes(stripeSubscription.status)) {
            // Backfill both tables so subsequent calls don't need this fallback
            await db.update(users).set({ stripeSubscriptionId: stripeSubscription.id }).where(eq(users.id, userId));
            await db.update(userSubscriptions).set({ stripeSubscriptionId: stripeSubscription.id })
              .where(eq(userSubscriptions.userId, userId));
            return {
              userId: user.id,
              stripeSubscriptionId: stripeSubscription.id,
              currentPlan: user.currentPlan,
              subscriptionStatus: user.subscriptionStatus,
              stripeSubscription,
            };
          }
        } catch { /* fall through */ }
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
  static async getOrCreateStripeCustomer(userId: string, isTestAccount: boolean): Promise<string> {
    const stripe = requireStripe(isTestAccount);
    try {
      // Get user from database
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw new Error('User not found');
      }

      // Validate stored customer ID exists in the current Stripe mode (live vs test).
      // This guard handles BOTH mismatch directions:
      //   • test ID stored → live-mode client   (e.g. account created in test mode, now going live)
      //   • live ID stored → test-mode client   (e.g. test-account flag set after live customer created)
      // In either case the Stripe API returns resource_missing, which we catch and recover from
      // by clearing the stale ID and creating a fresh customer in the correct mode.
      if (user.stripeCustomerId) {
        try {
          await stripe.customers.retrieve(user.stripeCustomerId);
          return user.stripeCustomerId;
        } catch (verifyErr: any) {
          // resource_missing is returned regardless of which direction the mode mismatch
          // goes — clear the stale ID and fall through to create a fresh customer below.
          if (verifyErr?.code === 'resource_missing') {
            console.warn(`⚠️ Stored Stripe customer ${user.stripeCustomerId} is invalid in current mode (mode mismatch) — creating a new one.`);
            await db.update(users)
              .set({ stripeCustomerId: null })
              .where(eq(users.id, userId));
          } else {
            throw verifyErr;
          }
        }
      }

      // Create new Stripe customer
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

      // Strip admin-only fields from the subscription before returning to the client
      let publicSubscription: Record<string, unknown> | null = null;
      if (userSub?.subscription) {
        const { internalNote: _note, isCustomPricing, customPriceExpiresAt, ...rest } = userSub.subscription;
        publicSubscription = { ...rest, isCustomPricing };
      }

      return {
        user,
        subscription: publicSubscription,
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
   * Handle prorated cancel-to-base-tier downgrade with credit calculation and immediate effect.
   * @param targetPlanId - The plan to land on after cancellation ('listing' or 'free'). Defaults to 'free' for backward compat.
   */
  static async proratedFreeDowngrade(subscriptionId: string, userId: string, isTestAccount: boolean, targetPlanId: string = 'free'): Promise<{
    success: boolean;
    proratedCredit: number;
    message: string;
  }> {
    const stripe = requireStripe(isTestAccount);
    try {
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

      // CRITICAL FIX: Update database immediately after Stripe cancellation
      // Find user by user ID
      const [user] = await db.select().from(users)
        .where(eq(users.id, userId));
        
      if (!user) {
        console.error('❌ User not found for userId:', userId);
        throw new Error('User not found');
      }

      // Update user's subscription fields to the target base tier immediately
      await db.update(users).set({
        subscriptionStatus: targetPlanId,
        currentPlan: targetPlanId,
        stripeSubscriptionId: null, // Clear subscription ID since cancelled
        subscriptionPeriodStart: null,
        subscriptionPeriodEnd: null,
        updatedAt: new Date()
      }).where(eq(users.id, userId));

      // Update or create user subscription record immediately
      const existingSub = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId));

      if (existingSub.length > 0) {
        // Update existing subscription to cancelled/base-tier
        await db.update(userSubscriptions).set({
          planId: targetPlanId,
          stripeSubscriptionId: null, // Clear since cancelled
          status: 'canceled',
          cancelAtPeriodEnd: null, // No longer relevant
          updatedAt: new Date()
        }).where(eq(userSubscriptions.userId, userId));
        
      } else {
        // Create new base-tier subscription record
        await db.insert(userSubscriptions).values({
          userId: userId,
          planId: targetPlanId,
          stripeSubscriptionId: null,
          status: targetPlanId,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null
        });
      }

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
  static async cancelSubscription(subscriptionId: string, isTestAccount: boolean, options?: {
    cancelAtPeriodEnd?: boolean;
    prorate?: boolean;
  }): Promise<Stripe.Subscription> {
    const stripe = requireStripe(isTestAccount);
    try {
      if (options?.cancelAtPeriodEnd) {
        // Schedule cancellation at period end
        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
        return subscription;
      } else {
        // Cancel immediately
        const cancelledSubscription = await stripe.subscriptions.cancel(subscriptionId, {
          prorate: options?.prorate ?? true,
          invoice_now: true
        });
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
   * Create the four annual subscription plans (intro + full-rate) if they don't already exist.
   * Called once at server startup — idempotent.
   */
  static async initializeAnnualPlans() {
    const annualPlanDefs = [
      {
        planId: 'listing_annual',
        name: 'Listing Annual',
        price: 199.99,
        description: 'Annual Listing plan — save 16% vs monthly',
        features: [
          'Up to 10 products',
          'Public storefront listing',
          'Basic product catalogue',
          'WhatsApp enquiries',
          'Save 16% vs monthly',
        ],
        limits: { products: 10, broadcasts: 0, teamMembers: 1, customGroups: 2, priceLists: 2 },
        sortOrder: 5,
        skipStripe: true, // Admin creates the Stripe product manually; prevents blocking at startup
      },
      {
        planId: 'starter_annual',
        name: 'Starter Annual',
        price: 299.99,
        description: 'Annual Starter plan — save 16% vs monthly',
        features: [
          'Up to 20 products',
          'Invoices & payments',
          'Order management',
          'Up to 5 price lists',
          'Customer tools',
          'Save 16% vs monthly',
        ],
        limits: { products: 20, broadcasts: 10, teamMembers: 1, customGroups: 5, priceLists: 5 },
        sortOrder: 6,
        skipStripe: true, // Admin creates the Stripe product manually; prevents blocking at startup
      },
      {
        planId: 'standard_annual_intro',
        name: 'Standard Annual (Intro)',
        price: 399.99,
        description: 'Annual plan — introductory rate until May 2027',
        features: [
          'Up to 50 products',
          'Up to 10 price lists',
          'Broadcast tools coming soon',
          'Basic dashboard analytics',
          'Priority email support',
          'Save vs monthly billing',
        ],
        limits: { products: 50, broadcasts: 25, teamMembers: 3, customGroups: 10, priceLists: 10 },
        sortOrder: 10,
      },
      {
        planId: 'premium_annual_intro',
        name: 'Premium Annual (Intro)',
        price: 899.99,
        description: 'Annual plan — introductory rate until May 2027',
        features: [
          'Unlimited products',
          'Unlimited price lists',
          'Broadcast tools coming soon',
          'Custom reports and insights',
          'Priority email and phone support',
          'Save vs monthly billing',
        ],
        limits: { products: -1, broadcasts: -1, teamMembers: -1, customGroups: -1, priceLists: -1 },
        sortOrder: 11,
      },
      {
        planId: 'standard_annual',
        name: 'Standard Annual',
        price: 499.99,
        description: 'Full-rate annual Standard plan (from May 2027)',
        features: [
          'Up to 50 products',
          'Up to 10 price lists',
          'Broadcast tools coming soon',
          'Basic dashboard analytics',
          'Priority email support',
        ],
        limits: { products: 50, broadcasts: 25, teamMembers: 3, customGroups: 10, priceLists: 10 },
        sortOrder: 12,
        isPubliclyVisible: false,
      },
      {
        planId: 'premium_annual',
        name: 'Premium Annual',
        price: 999.99,
        description: 'Full-rate annual Premium plan (from May 2027)',
        features: [
          'Unlimited products',
          'Unlimited price lists',
          'Broadcast tools coming soon',
          'Custom reports and insights',
          'Priority email and phone support',
        ],
        limits: { products: -1, broadcasts: -1, teamMembers: -1, customGroups: -1, priceLists: -1 },
        sortOrder: 13,
        isPubliclyVisible: false,
      },
    ];

    // Check each plan individually so partial failures can be backfilled on next startup
    const existingRows = await db.select({ planId: subscriptionPlans.planId })
      .from(subscriptionPlans)
      .where(inArray(subscriptionPlans.planId, annualPlanDefs.map(p => p.planId)));
    const existingIds = new Set(existingRows.map(r => r.planId));

    const missing = annualPlanDefs.filter(p => !existingIds.has(p.planId));

    let platformStripe: ReturnType<typeof getStripeClient> | null = null;
    try { platformStripe = getStripeClient(); } catch { /* no Stripe key configured */ }

    for (const plan of missing) {
      let stripeProductId: string | null = null;
      let stripePriceId: string | null = null;

      if (platformStripe && !(plan as any).skipStripe) {
        // Create Stripe product+price; throw on failure so we don't store a plan without a price
        const product = await platformStripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: { planId: plan.planId, platform: 'quikpik' },
        });
        stripeProductId = product.id;
        const price = await platformStripe.prices.create({
          product: product.id,
          unit_amount: Math.round(plan.price * 100),
          currency: 'gbp',
          recurring: { interval: 'year' },
          metadata: { planId: plan.planId, platform: 'quikpik' },
        });
        stripePriceId = price.id;
      }

      await db.insert(subscriptionPlans).values({
        name: plan.name,
        planId: plan.planId,
        stripeProductId,
        stripePriceId,
        monthlyPrice: plan.price.toFixed(2),
        currency: 'GBP',
        description: plan.description,
        features: plan.features,
        limits: plan.limits,
        billingInterval: 'yearly',
        version: 1,
        // Full-rate annual plans (standard_annual, premium_annual) start inactive.
        // They are activated by runAnnualPlanMigrationIfDue() in May 2027 to replace intro plans.
        isActive: plan.isPubliclyVisible !== false,
        sortOrder: plan.sortOrder,
      });
      console.log(`✅ Created annual plan: ${plan.planId} (£${plan.price}/yr, active=${plan.isPubliclyVisible !== false})`);
    }

    // Always sync price, features, and limits for existing plans so code changes take effect on restart.
    // (Same pattern as initializePlans — insert loop above handles only missing plans.)
    for (const plan of annualPlanDefs) {
      if (!existingIds.has(plan.planId)) continue; // just inserted above
      await db.update(subscriptionPlans)
        .set({
          monthlyPrice: plan.price.toFixed(2),
          description: plan.description,
          features: plan.features,
          limits: plan.limits,
          sortOrder: plan.sortOrder,
        })
        .where(eq(subscriptionPlans.planId, plan.planId));
    }

    if (missing.length > 0) {
      console.log(`✅ Annual plans created: ${missing.map(p => p.planId).join(', ')}`);
    }
    console.log('✅ Annual plan data synced');
  }

  /**
   * Migrate subscribers from intro annual plans to full-rate annual plans.
   * No-op until 1 May 2027. Safe to run daily.
   */
  static async runAnnualPlanMigrationIfDue() {
    const migrationDate = new Date('2027-05-01T00:00:00Z');
    if (new Date() < migrationDate) return;

    const planMap: Record<string, string> = {
      standard_annual_intro: 'standard_annual',
      premium_annual_intro: 'premium_annual',
    };

    const subsToMigrate = await db.select()
      .from(userSubscriptions)
      .where(and(
        inArray(userSubscriptions.planId, ['standard_annual_intro', 'premium_annual_intro']),
        eq(userSubscriptions.status, 'active'),
        eq(userSubscriptions.isCustomPricing, false),
      ));

    if (subsToMigrate.length === 0) {
    }

    for (const sub of subsToMigrate) {
      const targetPlanId = planMap[sub.planId];
      if (!targetPlanId) continue;
      const [targetPlan] = await db.select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.planId, targetPlanId));
      if (!targetPlan?.stripePriceId) {
        console.error(`⚠️ No Stripe price for ${targetPlanId} — skipping user ${sub.userId}`);
        continue;
      }

      if (sub.stripeSubscriptionId) {
        try {
          const stripeClient = getStripeClient();
          const stripeSub = await stripeClient.subscriptions.retrieve(sub.stripeSubscriptionId);
          await stripeClient.subscriptions.update(sub.stripeSubscriptionId, {
            items: [{ id: stripeSub.items.data[0].id, price: targetPlan.stripePriceId }],
            proration_behavior: 'none',
          });
        } catch (stripeErr: any) {
          console.error(`⚠️ Stripe update failed for ${sub.userId}:`, stripeErr?.message);
          continue;
        }
      }

      await db.update(userSubscriptions)
        .set({ planId: targetPlanId, updatedAt: new Date() })
        .where(eq(userSubscriptions.id, sub.id));
      await db.update(users)
        .set({ currentPlan: targetPlanId, subscriptionTier: targetPlanId })
        .where(eq(users.id, sub.userId));
      }

    // Activate full-rate annual plans so they appear in the pricing UI
    await db.update(subscriptionPlans)
      .set({ isActive: true })
      .where(inArray(subscriptionPlans.planId, ['standard_annual', 'premium_annual']));

    // Archive the intro plans — they will no longer appear in the pricing UI
    await db.update(subscriptionPlans)
      .set({ isActive: false })
      .where(inArray(subscriptionPlans.planId, ['standard_annual_intro', 'premium_annual_intro']));

  }

  /**
   * Switch monthly Standard/Premium prices from intro to full rates on 1 May 2027.
   * No-op before that date. Safe to run daily — idempotent.
   * After updating the DB, fixStripePricesIfNeeded() (called by the same cron job in index.ts)
   * will detect the mismatch and create the correct Stripe prices automatically.
   */
  static async runMonthlyPriceSwitchIfDue(): Promise<void> {
    if (isIntroPricingPeriod()) return;


    const updates: Array<{ planId: string; price: string }> = [
      { planId: 'standard', price: '49.99' },
      { planId: 'premium',  price: '99.99' },
    ];

    let changed = 0;
    for (const { planId, price } of updates) {
      const [current] = await db.select({ monthlyPrice: subscriptionPlans.monthlyPrice })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.planId, planId));

      if (!current || current.monthlyPrice === price) continue;

      await db.update(subscriptionPlans)
        .set({ monthlyPrice: price })
        .where(eq(subscriptionPlans.planId, planId));
      changed++;
    }


    // Ensure all Standard subscribers have the raised product limit (idempotent — safe to repeat)
    await db.execute(
      sql`UPDATE users SET product_limit = 20 WHERE subscription_tier = 'standard' AND product_limit NOT IN (-1, 20)`
    );
  }

  /**
   * Check if user has access to a feature based on their plan.
   * Uses getPlanLimits() so 'free' users are resolved to starter-tier limits.
   */
  static async checkFeatureAccess(userId: string, feature: string, value?: number): Promise<boolean> {
    try {
      const { currentPlan } = await this.getUserSubscription(userId);
      
      // getPlanLimits handles 'free' → 'starter' mapping and all tier normalisation
      const limits = getPlanLimits(currentPlan || 'listing');

      const limit = (limits as Record<string, unknown>)[feature];

      // Feature not in limits = unlimited access
      if (limit === undefined) return true;
      // -1 = unlimited
      if (limit === -1) return true;

      if (value !== undefined) {
        return value <= (limit as number);
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to check feature access:', error);
      return false; // Fail safe - deny access on error
    }
  }

  /**
   * Safety net for missed Stripe webhooks.
   * Finds all users with cancelAtPeriodEnd=true whose subscription period has
   * already ended but whose plan wasn't downgraded (webhook was missed/failed).
   * Downgrades them to free, enforces limits, and sends the standard email.
   */
  static async runExpiredSubscriptionDowngrades(): Promise<void> {
    // Use raw SQL to avoid circular-import issues with Drizzle column references.
    // cancelAtPeriodEnd lives on userSubscriptions; subscription_status = 'cancel_at_period_end'
    // is set on users at the same time, so we filter on that column instead.
    const result = await db.execute(sql`
      SELECT id, email, first_name, last_name, business_name
      FROM users
      WHERE subscription_status = 'cancel_at_period_end'
        AND subscription_period_end < NOW()
        AND current_plan != 'free'
    `);

    const expiredUsers = result.rows as { id: string; email: string | null; first_name: string | null; last_name: string | null; business_name: string | null }[];

    if (expiredUsers.length === 0) {
      console.log('✅ Expired subscription check: no missed downgrades found.');
      return;
    }

    console.log(`⚠️  Expired subscription check: ${expiredUsers.length} missed downgrade(s) found — applying now.`);

    // Dynamic imports to avoid circular dependencies at module evaluation time
    const { sendEmail } = await import('./sendgrid-service');
    const { generateDowngradeEffectiveEmail } = await import('./email-templates');
    const { enforceNewPlanLimits } = await import('./routes/shared');

    for (const user of expiredUsers) {
      try {
        await db.execute(sql`
          UPDATE users SET
            subscription_tier = 'free',
            subscription_status = 'free',
            current_plan = 'free',
            product_limit = 2,
            stripe_subscription_id = NULL,
            subscription_period_start = NULL,
            subscription_period_end = NULL,
            updated_at = NOW()
          WHERE id = ${user.id}
        `);

        await db.execute(sql`
          UPDATE user_subscriptions SET
            plan_id = 'free',
            stripe_subscription_id = NULL,
            status = 'free',
            cancel_at_period_end = NULL,
            current_period_start = NULL,
            current_period_end = NULL,
            updated_at = NOW()
          WHERE user_id = ${user.id}
        `);

        const enforcement = await enforceNewPlanLimits(user.id, 'free');

        if (user.email) {
          try {
            const { subject, html, text } = generateDowngradeEffectiveEmail({
              firstName: user.first_name || '',
              email: user.email,
              businessName: user.business_name || 'Quikpik',
              productsLocked: enforcement.productsLocked || undefined,
              teamMembersSuspended: enforcement.teamMembersSuspended || undefined,
              groupsArchived: enforcement.groupsArchived || undefined,
            });
            await sendEmail({ to: user.email, from: 'hello@quikpik.co', subject, html, text });
          } catch (emailErr) {
            console.error(`❌ Failed to send downgrade email to ${user.email}:`, emailErr);
          }
        }

        console.log(`✅ Downgraded ${user.email || user.id} to free (missed webhook recovery).`);
      } catch (err) {
        console.error(`❌ Failed to downgrade user ${user.id}:`, err);
      }
    }
  }
}

export default SubscriptionService;