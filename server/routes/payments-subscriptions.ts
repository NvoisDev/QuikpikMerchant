import type { Express } from "express";
import {
  SubscriptionService, db, eq, enforceNewPlanLimits, getUserPlanLimits, getPlanLimits,
  generateDowngradeScheduledEmail, generateDowngradeEffectiveEmail,
  getProjectedDowngradeImpact, requireAuth, requireOwner, sendEmail,
  storage, subscriptionPlans, unlockForUpgrade, userSubscriptions, users, z,
} from "./shared";
import { getStripeClient } from "../stripeConfig";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import { getProductLimit } from "../utils/plan-tier";
import { paymentLimiter } from "./payments-connect";

/**
 * If a wholesaler has a custom price tied to a specific plan and they switch to a
 * different plan, clear the stale override so the pricing page no longer shows a
 * "Your price" badge that no longer applies.
 */
async function clearCustomPriceIfPlanChanged(userId: number, newPlanId: string): Promise<void> {
  const [user] = await db
    .select({ customPricePlanId: (users as any).customPricePlanId })
    .from(users)
    .where(eq(users.id, userId));
  const existingCustomPlanId = user?.customPricePlanId as string | null | undefined;
  if (existingCustomPlanId && existingCustomPlanId !== newPlanId) {
    await db.update(users).set({
      customPricePlanId: null,
      customMonthlyPrice: null,
      customAnnualPrice: null,
    } as any).where(eq(users.id, userId));
    console.log(`💰 Cleared stale custom price for user ${userId} (was tied to plan "${existingCustomPlanId}", now on "${newPlanId}")`);
  }
}

export function registerSubscriptionRoutes(app: Express): void {
  // GET /api/subscriptions/plans
  app.get('/api/subscriptions/plans', async (req, res) => {
    try {
      const plans = await SubscriptionService.getPlans();
      res.json(plans);
    } catch (error) {
      console.error('❌ Failed to get subscription plans:', error);
      res.status(500).json({ 
        message: 'Failed to get subscription plans',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/subscriptions/current
  app.get('/api/subscriptions/current', requireAuth, async (req: any, res) => {
    try {
      // Team members inherit their wholesaler's subscription plan
      const userId = resolveWholesalerId(req);
      const subscription = await SubscriptionService.getUserSubscription(userId);

      // Augment with payment method details from Stripe (non-blocking)
      let paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null = null;
      const stripeSubId = subscription?.subscription?.stripeSubscriptionId;
      if (stripeSubId) {
        try {
          const stripe = getStripeClient(false);
          const sub = await stripe.subscriptions.retrieve(stripeSubId, {
            expand: ['default_payment_method'],
          });
          const pm = sub.default_payment_method;
          if (pm && typeof pm === 'object' && (pm as any).card) {
            const card = (pm as any).card;
            paymentMethod = {
              brand: card.brand ?? 'card',
              last4: card.last4 ?? '????',
              expMonth: card.exp_month ?? 0,
              expYear: card.exp_year ?? 0,
            };
          }
        } catch {
          // Non-fatal — just omit payment method from response
        }
      }

      res.json({ ...subscription, paymentMethod });
    } catch (error) {
      console.error('❌ Failed to get user subscription:', error);
      res.status(500).json({ 
        message: 'Failed to get user subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/subscriptions/billing-portal
  app.post('/api/subscriptions/billing-portal', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Only users with an active Stripe subscription may open the portal
      // (this includes Listing-plan users who subscribed via Stripe, not just higher tiers)
      const subscription = await SubscriptionService.getUserSubscription(userId);
      const stripeSubId = subscription?.subscription?.stripeSubscriptionId;
      if (!stripeSubId) {
        return res.status(400).json({ message: 'No active Stripe subscription found — upgrade first to manage billing.' });
      }

      const stripeCustomerId = await SubscriptionService.getOrCreateStripeCustomer(userId, false);
      const returnUrl = `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing`;
      const stripe = getStripeClient(false);
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });
      res.json({ url: portalSession.url });
    } catch (error: any) {
      console.error('❌ Failed to create billing portal session:', error);
      res.status(500).json({ message: error?.message || 'Failed to open billing portal' });
    }
  });

  // POST /api/subscriptions/create-checkout-session
  app.post('/api/subscriptions/create-checkout-session', paymentLimiter, requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { priceId, idempotencyKey } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: 'Price ID is required' });
      }

      // Validate priceId exists in our subscription plans
      const validPlans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, priceId));
      
      if (validPlans.length === 0) {
        return res.status(400).json({ message: 'Invalid price ID' });
      }

      const targetPlan = validPlans[0];

      // Check for a negotiated custom price override on this wholesaler's account.
      // If set for the plan's billing interval AND tied to this specific plan, create an
      // ad-hoc Stripe price so the wholesaler is charged their negotiated amount instead of the standard rate.
      const [wholesalerRecord] = await db.select({
        customAnnualPrice: users.customAnnualPrice,
        customMonthlyPrice: users.customMonthlyPrice,
        customPricePlanId: (users as any).customPricePlanId,
      }).from(users).where(eq(users.id, userId));

      const isAnnualPlan = (targetPlan.billingInterval ?? 'monthly') === 'yearly';
      // Only apply the custom price when the plan being purchased exactly matches the tied plan ID.
      // If customPricePlanId is null (legacy record), no override is applied.
      const planMatches = wholesalerRecord?.customPricePlanId !== null &&
        wholesalerRecord?.customPricePlanId !== undefined &&
        wholesalerRecord.customPricePlanId === targetPlan.planId;
      const customPriceAmount = planMatches
        ? (isAnnualPlan
            ? (wholesalerRecord?.customAnnualPrice ? parseFloat(wholesalerRecord.customAnnualPrice) : null)
            : (wholesalerRecord?.customMonthlyPrice ? parseFloat(wholesalerRecord.customMonthlyPrice) : null))
        : null;

      // All subscription plan price IDs are live-mode prices. Even if an account is
      // flagged is_test_account, we must use the live Stripe client for checkout —
      // test-mode Stripe keys cannot see live-mode prices and will return a 404.
      const isTestAccount = false;
      const stripe = getStripeClient(false);

      // Create ad-hoc Stripe price for this wholesaler if a custom amount is set.
      let effectivePriceId = priceId;
      if (customPriceAmount !== null && targetPlan.stripeProductId) {
        const adHocPrice = await stripe.prices.create({
          unit_amount: Math.round(customPriceAmount * 100),
          currency: 'gbp',
          recurring: { interval: isAnnualPlan ? 'year' : 'month' },
          product: targetPlan.stripeProductId,
          metadata: { customPrice: 'true', userId, planId: targetPlan.planId },
        });
        effectivePriceId = adHocPrice.id;
        console.log(`💰 Custom subscription price applied for user ${userId}: £${customPriceAmount} → ${effectivePriceId}`);
      }

      // Get or create Stripe customer.
      // Any mode-mismatch (live customer ID used against a test client, or vice-versa)
      // is detected and recovered from inside getOrCreateStripeCustomer — no extra guard needed here.
      const stripeCustomerId = await SubscriptionService.getOrCreateStripeCustomer(userId, isTestAccount);
      
      // Check for existing active subscription
      const existingSubscription = await SubscriptionService.getCurrentSubscription(userId, isTestAccount);
      
      if (existingSubscription && existingSubscription.stripeSubscriptionId) {
        // UPGRADE FLOW: User has existing subscription - modify it with proration
        
        try {
          const updatedSubscription = await SubscriptionService.upgradeSubscriptionWithProration(
            existingSubscription.stripeSubscriptionId,
            effectivePriceId,
            targetPlan.planId,
            isTestAccount,
          );
          
          // Update user's plan immediately for upgrades (instant access).
          await storage.updateUser(userId, {
            currentPlan: targetPlan.planId,
            subscriptionStatus: 'active',
            productLimit: getProductLimit(targetPlan.planId),
            subscriptionEndsAt: new Date(updatedSubscription.current_period_end * 1000)
          });

          // Auto-clear any custom price tied to a different plan so the pricing page
          // never shows a stale "Your price" badge after the wholesaler switches plans.
          await clearCustomPriceIfPlanChanged(userId, targetPlan.planId);

          // Clear the scheduled cancellation flag on userSubscriptions so that the
          // "Cancellation Scheduled" badge disappears immediately after upgrade.
          await db.update(userSubscriptions).set({
            cancelAtPeriodEnd: false,
            status: 'active',
            updatedAt: new Date()
          }).where(eq(userSubscriptions.userId, userId));

          await unlockForUpgrade(userId);
          
          return res.json({ 
            success: true, 
            type: 'upgrade',
            newPlan: targetPlan.planId,
            subscription: {
              id: updatedSubscription.id,
              status: updatedSubscription.status,
              current_period_end: updatedSubscription.current_period_end
            },
            message: 'Subscription upgraded successfully with proration applied'
          });
        } catch (upgradeError: any) {
          // Structured error log — every field here is useful for diagnosing which
          // Stripe error caused the direct update to fail (e.g. resource_missing,
          // subscription_update_forbidden, payment_method_unexpected_state, etc.)
          console.error('❌ Direct subscription upgrade failed — attempting Billing Portal fallback:', {
            stripeType: upgradeError?.type,
            stripeCode: upgradeError?.code,
            stripeDeclineCode: upgradeError?.decline_code ?? null,
            message: upgradeError?.message,
            subscriptionId: existingSubscription.stripeSubscriptionId,
            customerId: stripeCustomerId,
            targetPlanId: targetPlan.planId,
            targetPriceId: priceId,
          });

          // Fallback: redirect the user to the Stripe Billing Portal so they can
          // complete the upgrade there. The portal is the correct Stripe primitive
          // for modifying an *existing* subscription — unlike a new Checkout Session
          // (mode:'subscription') it never conflicts with an existing active sub.
          const returnBase = process.env.FRONTEND_URL || 'https://quikpik.app';
          try {
            const portalSession = await stripe.billingPortal.sessions.create({
              customer: stripeCustomerId,
              return_url: `${returnBase}/subscription-pricing?success=true`,
            });
            return res.json({
              success: true,
              type: 'portal',
              url: portalSession.url,
            });
          } catch (portalError: any) {
            console.error('❌ Billing Portal fallback also failed:', {
              stripeType: portalError?.type,
              stripeCode: portalError?.code,
              message: portalError?.message,
            });
            return res.status(500).json({
              message: 'We could not process your upgrade automatically. Please contact support or try again later.',
              stripeCode: portalError?.code ?? upgradeError?.code ?? 'unknown',
            });
          }
        }
      } else {
        // NEW SUBSCRIPTION FLOW: User has no existing subscription - use checkout session

        // Determine trial eligibility: Listing plan only, never-subscribed users only.
        // We query Stripe directly for all subscriptions (including canceled) because our
        // DB nulls stripeSubscriptionId on cancellation — making a local table check an
        // unreliable "ever had paid subscription" test for returning users.
        let trialPeriodDays: number | undefined;
        if (targetPlan.planId.startsWith('listing')) {
          try {
            const allSubs = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              status: 'all',
              limit: 1,
            });
            if (allSubs.data.length === 0) {
              trialPeriodDays = 90;
            }
          } catch (subCheckErr) {
            console.warn('⚠️ Could not check prior subscriptions for trial eligibility — skipping trial:', subCheckErr);
          }
        }

        // Check whether this wholesaler has a custom subscription price override.
        // If so, and it is tied to this specific plan, create an ad-hoc Stripe Price
        // tied to the plan's product and use it instead of the standard plan price ID.
        const [wholesalerRow] = await db.select({
          customMonthlyPrice: (users as any).customMonthlyPrice,
          customAnnualPrice: (users as any).customAnnualPrice,
          customPricePlanId: (users as any).customPricePlanId,
        }).from(users).where(eq(users.id, userId)).limit(1);

        const isAnnualPlan = targetPlan.billingInterval === 'yearly';
        // Only apply the custom price when the plan being purchased exactly matches the tied plan ID.
        // If customPricePlanId is null (legacy record), no override is applied.
        const rowPlanMatches = wholesalerRow?.customPricePlanId !== null &&
          wholesalerRow?.customPricePlanId !== undefined &&
          wholesalerRow.customPricePlanId === targetPlan.planId;
        const customPriceGBP = rowPlanMatches
          ? (isAnnualPlan ? wholesalerRow?.customAnnualPrice : wholesalerRow?.customMonthlyPrice)
          : null;

        let resolvedPriceId = priceId;
        if (customPriceGBP !== null && customPriceGBP !== undefined && targetPlan.stripeProductId) {
          const customAmountPence = Math.round(parseFloat(String(customPriceGBP)) * 100);
          console.log(`[subscriptions] Using custom price override for user ${userId}: £${customPriceGBP} (${customAmountPence}p) on plan ${targetPlan.planId}`);
          const adHocPrice = await stripe.prices.create({
            unit_amount: customAmountPence,
            currency: 'gbp',
            recurring: {
              interval: isAnnualPlan ? 'year' : 'month',
            },
            product: targetPlan.stripeProductId,
            metadata: {
              userId,
              planId: targetPlan.planId,
              customPrice: 'true',
            },
          });
          resolvedPriceId = adHocPrice.id;
        }

        const sessionOptions: any = {
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [{
            price: resolvedPriceId,
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing?cancelled=true`,
          metadata: {
            userId: userId,
            planId: targetPlan.planId,
            subscriptionType: 'new'
          }
        };

        if (trialPeriodDays) {
          sessionOptions.subscription_data = { trial_period_days: trialPeriodDays };
        }

        // Create Stripe checkout session with correct API syntax
        const session = idempotencyKey 
          ? await stripe.checkout.sessions.create(sessionOptions, { idempotencyKey })
          : await stripe.checkout.sessions.create(sessionOptions);

        return res.json({ 
          success: true, 
          type: 'checkout',
          sessionId: session.id,
          url: session.url 
        });
      }
    } catch (error) {
      console.error('❌ Failed to create checkout session:', error);
      res.status(500).json({ 
        message: 'Failed to create checkout session',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/subscriptions/downgrade
  app.post('/api/subscriptions/downgrade', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { targetPlan } = req.body;

      // Zod validation for targetPlan
      const targetPlanSchema = z.object({
        targetPlan: z.enum(['listing', 'free', 'starter', 'standard', 'premium'], {
          errorMap: () => ({ message: 'targetPlan must be one of: listing, starter, standard, premium' })
        })
      });

      const validation = targetPlanSchema.safeParse({ targetPlan });
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Invalid target plan',
          errors: validation.error.errors
        });
      }

      const isTestAccount = Boolean(req.user.isTestAccount);

      // Get current subscription — primary path checks users.stripeSubscriptionId via Stripe
      let currentSubscription = await SubscriptionService.getCurrentSubscription(userId, isTestAccount);

      // Fallback: users.stripeSubscriptionId can be null when the checkout.session.completed
      // handler already set currentPlan/subscriptionStatus, causing the subsequent
      // customer.subscription.created webhook to early-return before writing the ID to users.
      // In that case, userSubscriptions still has the correct stripeSubscriptionId.
      if (!currentSubscription?.stripeSubscriptionId) {
        const [userSub] = await db
          .select({ stripeSubscriptionId: userSubscriptions.stripeSubscriptionId, planId: userSubscriptions.planId })
          .from(userSubscriptions)
          .where(eq(userSubscriptions.userId, userId));
        if (userSub?.stripeSubscriptionId) {
          currentSubscription = {
            userId,
            stripeSubscriptionId: userSub.stripeSubscriptionId,
            currentPlan: userSub.planId ?? 'free',
            subscriptionStatus: 'active',
            stripeSubscription: null as any,
          };
        }
      }

      // No Stripe subscription at all (admin-assigned plan) — DB-only downgrade path
      if (!currentSubscription?.stripeSubscriptionId) {
        const targetProductLimit = getPlanLimits(targetPlan).products;
        await storage.updateUser(userId, {
          currentPlan: targetPlan,
          subscriptionTier: targetPlan,
          subscriptionStatus: targetPlan === 'free' || targetPlan === 'listing' ? 'inactive' : 'active',
          productLimit: targetProductLimit,
        });
        const [existingUserSub] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId));
        if (existingUserSub) {
          await db.update(userSubscriptions).set({ planId: targetPlan, updatedAt: new Date() })
            .where(eq(userSubscriptions.userId, userId));
        }
        await enforceNewPlanLimits(userId, targetPlan);
        await clearCustomPriceIfPlanChanged(userId, targetPlan);
        return res.json({ success: true, type: 'downgrade_db_only', targetPlan, message: 'Plan updated (no Stripe subscription)' });
      }

      // Get target plan details to get the price ID
      const plans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.planId, targetPlan));
      
      if (plans.length === 0) {
        return res.status(400).json({ message: 'Target plan not found' });
      }

      const targetPlanData = plans[0];

      // Handle downgrade to listing or free — both have no Stripe price, so cancel the subscription
      if (targetPlan === 'free' || targetPlan === 'listing') {
        const effectiveCancelPlan = targetPlan; // 'free' (legacy) or 'listing' (new base tier)
        // Compute projected impact BEFORE proratedFreeDowngrade mutates the DB
        const projectedImpact = await getProjectedDowngradeImpact(userId, effectiveCancelPlan);

        const result = await SubscriptionService.proratedFreeDowngrade(
          currentSubscription.stripeSubscriptionId,
          userId,
          isTestAccount,
          effectiveCancelPlan,
        );

        // Auto-clear stale custom price if it was tied to a different plan.
        await clearCustomPriceIfPlanChanged(userId, effectiveCancelPlan);

        // Enforce limits immediately (immediate downgrade path)
        const enforcedNow = await enforceNewPlanLimits(userId, effectiveCancelPlan);

        // Send downgrade scheduled/immediate confirmation email
        // The webhook will also send the "effective" email when customer.subscription.deleted fires
        const [downgradedUser] = await db.select().from(users).where(eq(users.id, userId));
        if (downgradedUser?.email) {
          try {
            const { subject, html, text } = generateDowngradeScheduledEmail({
              firstName: downgradedUser.firstName || '',
              email: downgradedUser.email,
              businessName: downgradedUser.businessName || 'Quikpik',
              currentPlan: currentSubscription.currentPlan || 'standard', // captured before proratedFreeDowngrade mutated the DB
              effectiveDate: new Date(), // immediate cancellation — effective today
              productsToLock: enforcedNow.productsLocked || undefined,
              totalProducts: projectedImpact.totalProducts || undefined,
              teamMembersToSuspend: enforcedNow.teamMembersSuspended || undefined,
              groupsToArchive: enforcedNow.groupsArchived || undefined,
            });
            await sendEmail({ to: downgradedUser.email, from: 'hello@quikpik.co', subject, html, text });
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade scheduled email:', emailErr);
          }
        }
        
        res.json({
          success: true,
          type: 'downgrade_immediate',
          targetPlan: targetPlan,
          proratedCredit: result.proratedCredit,
          message: result.message
        });
        return;
      }

      // Handle downgrade to paid plan with immediate proration
      if (!targetPlanData.stripePriceId) {
        return res.status(400).json({ message: 'Target plan price ID not configured' });
      }

      const result = await SubscriptionService.immediateDowngradeWithProration(
        currentSubscription.stripeSubscriptionId,
        targetPlanData.stripePriceId,
        targetPlan,
        isTestAccount,
      );

      // Auto-clear stale custom price if it was tied to a different plan.
      await clearCustomPriceIfPlanChanged(userId, targetPlan);

      // Enforce paid→paid downgrade limits (e.g. Premium→Standard: lock products >50)
      await enforceNewPlanLimits(userId, targetPlan);

      res.json({
        success: true,
        type: 'downgrade_immediate',
        targetPlan: targetPlan,
        subscriptionId: result.id,
        message: 'Subscription downgraded immediately with pro-rated credit'
      });
    } catch (error) {
      console.error('❌ Failed to downgrade subscription:', error);
      res.status(500).json({ 
        message: 'Failed to downgrade subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/subscriptions/cancel
  app.post('/api/subscriptions/cancel', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { user } = await SubscriptionService.getUserSubscription(userId);
      
      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      try {
        // Cancel subscription at period end using service method
        const subscription = await SubscriptionService.cancelSubscription(
          user.stripeSubscriptionId,
          Boolean(req.user.isTestAccount),
          { cancelAtPeriodEnd: true }
        );

        // CRITICAL: Sync cancel_at_period_end back to the DB immediately so the next
        // GET /api/subscriptions/current returns fresh data (not a 304 with stale ETag).
        const cancelPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        await db.update(userSubscriptions).set({
          cancelAtPeriodEnd: true,
          status: 'active', // stays active until period end
          currentPeriodEnd: cancelPeriodEnd,
          updatedAt: new Date(),
        }).where(eq(userSubscriptions.userId, userId));

        // Keep users table in sync so any code reading users.subscriptionStatus sees the correct state
        await db.update(users).set({
          subscriptionStatus: 'cancel_at_period_end',
          updatedAt: new Date(),
        }).where(eq(users.id, userId));

        // Compute projected impact for the scheduled email (cancel = at period end, nothing locked yet)
        const cancelProjectedImpact = await getProjectedDowngradeImpact(userId, 'free');

        // Send downgrade scheduled confirmation email
        if (user.email) {
          try {
            const effectiveDate = new Date(subscription.current_period_end * 1000);
            const { subject, html, text } = generateDowngradeScheduledEmail({
              firstName: user.firstName || '',
              email: user.email,
              businessName: user.businessName || 'Quikpik',
              currentPlan: user.currentPlan || 'standard',
              effectiveDate,
              productsToLock: cancelProjectedImpact.productsToLock || undefined,
              totalProducts: cancelProjectedImpact.totalProducts || undefined,
              teamMembersToSuspend: cancelProjectedImpact.teamMembersToSuspend || undefined,
              groupsToArchive: cancelProjectedImpact.groupsToArchive || undefined,
            });
            await sendEmail({ to: user.email, from: 'hello@quikpik.co', subject, html, text });
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade scheduled email:', emailErr);
          }
        }

        return res.json({ 
          success: true, 
          message: 'Subscription will be canceled at the end of the current period',
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: subscription.current_period_end
        });
      } catch (stripeError: any) {
        // If Stripe says the subscription doesn't exist, it's already gone — clean up the DB
        const isStaleSubscription = 
          stripeError?.message?.includes('No such subscription') ||
          stripeError?.code === 'resource_missing';

        if (isStaleSubscription) {
          console.warn('⚠️ Stripe subscription not found — cleaning up stale ID for user:', userId, user.stripeSubscriptionId);

          await db.update(users).set({
            subscriptionStatus: 'inactive',
            currentPlan: 'listing',
            subscriptionTier: 'listing',
            productLimit: 2,
            stripeSubscriptionId: null,
            subscriptionPeriodStart: null,
            subscriptionPeriodEnd: null,
            updatedAt: new Date()
          }).where(eq(users.id, userId));

          const existingSub = await db.select().from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId));

          if (existingSub.length > 0) {
            await db.update(userSubscriptions).set({
              planId: 'listing',
              stripeSubscriptionId: null,
              status: 'canceled',
              cancelAtPeriodEnd: null,
              updatedAt: new Date()
            }).where(eq(userSubscriptions.userId, userId));
          } else {
            await db.insert(userSubscriptions).values({
              userId,
              planId: 'listing',
              stripeSubscriptionId: null,
              status: 'inactive',
              currentPeriodStart: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: null
            });
          }

          return res.json({
            success: true,
            message: 'Subscription cancelled and plan reverted to Listing'
          });
        }

        throw stripeError;
      }
    } catch (error) {
      console.error('❌ Failed to cancel subscription:', error);
      res.status(500).json({ 
        message: 'Failed to cancel subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/subscriptions/plan-limits
  app.get('/api/subscriptions/plan-limits', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const planLimits = await getUserPlanLimits(userId);
      res.json(planLimits);
    } catch (error) {
      console.error('❌ Failed to get plan limits:', error);
      res.status(500).json({ 
        message: 'Failed to get plan limits',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
