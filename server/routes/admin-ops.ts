import type { Express } from "express";
import Stripe from "stripe";
import rateLimit from "express-rate-limit";
import {
  ADMIN_EMAILS, adminAuditLogs, and, asc, count, db, desc, eq, getPlanLimits, getStripeClient,
  inArray, or, orders, requireAuth, sql, storage, subscriptionPlans, SubscriptionService,
  userSubscriptions, users, refundAcrossPaymentIntents,
} from "./shared";
import { getProductLimit } from "../utils/plan-tier";

function getAdminEmail(req: any): string | undefined {
  return req._adminEmail || req.user?.email;
}

const impersonateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many impersonation requests from this IP. Please try again later.' },
});

export function registerAdminOpsRoutes(app: Express): void {
  // POST /api/admin/subscriptions/activate
  app.post('/api/admin/subscriptions/activate', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { stripeSubscriptionId, planId: overridePlanId } = req.body;
      if (!stripeSubscriptionId) {
        return res.status(400).json({ error: 'stripeSubscriptionId is required' });
      }
      if (overridePlanId !== undefined && !['standard', 'premium'].includes(overridePlanId)) {
        return res.status(400).json({ error: 'planId override must be "standard" or "premium"' });
      }

      let stripeSub: Stripe.Subscription;
      try {
        try {
          stripeSub = await getStripeClient(false).subscriptions.retrieve(stripeSubscriptionId);
        } catch (primaryErr: any) {
          if (primaryErr?.statusCode === 404 || primaryErr?.code === 'resource_missing') {
            stripeSub = await getStripeClient(true).subscriptions.retrieve(stripeSubscriptionId);
          } else {
            throw primaryErr;
          }
        }
      } catch (e) {
        return res.status(400).json({ error: `Stripe subscription not found: ${stripeSubscriptionId}` });
      }

      if (stripeSub.status !== 'active') {
        return res.status(400).json({ error: `Subscription is not active (status: ${stripeSub.status})` });
      }

      const recoverCustId = typeof stripeSub.customer === 'string'
        ? stripeSub.customer : stripeSub.customer.id;
      const recoverPriceId = stripeSub.items?.data?.[0]?.price?.id;

      if (!recoverCustId || !recoverPriceId) {
        return res.status(400).json({ error: 'Could not extract customer or price from subscription' });
      }

      const [recoverUser] = await db.select().from(users).where(eq(users.stripeCustomerId, recoverCustId));
      if (!recoverUser) {
        return res.status(404).json({ error: `No user found with Stripe customer ID ${recoverCustId}` });
      }

      let resolvedPlanId: string;
      if (overridePlanId) {
        resolvedPlanId = overridePlanId;
      } else {
        const [recoverPlan] = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, recoverPriceId));
        if (!recoverPlan || !recoverPlan.planId || recoverPlan.planId === 'free') {
          return res.status(400).json({ error: `No paid plan found for price ${recoverPriceId} — pass planId to override` });
        }
        resolvedPlanId = recoverPlan.planId;
      }

      const recoverProductLimit = getProductLimit(resolvedPlanId);
      const recoverPeriodEnd = new Date(stripeSub.current_period_end * 1000);
      const recoverPeriodStart = new Date(stripeSub.current_period_start * 1000);

      await storage.updateUser(recoverUser.id, {
        currentPlan: resolvedPlanId, subscriptionTier: resolvedPlanId,
        subscriptionStatus: 'active', productLimit: recoverProductLimit,
        stripeSubscriptionId: stripeSub.id, subscriptionEndsAt: recoverPeriodEnd,
      });

      const [existingRecoverSub] = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, recoverUser.id));
      if (existingRecoverSub) {
        await db.update(userSubscriptions).set({
          planId: resolvedPlanId, stripeSubscriptionId: stripeSub.id, status: 'active',
          currentPeriodStart: recoverPeriodStart, currentPeriodEnd: recoverPeriodEnd,
          cancelAtPeriodEnd: false, updatedAt: new Date(),
        }).where(eq(userSubscriptions.userId, recoverUser.id));
      } else {
        await db.insert(userSubscriptions).values({
          userId: recoverUser.id, planId: resolvedPlanId, stripeSubscriptionId: stripeSub.id,
          status: 'active', currentPeriodStart: recoverPeriodStart,
          currentPeriodEnd: recoverPeriodEnd, cancelAtPeriodEnd: false,
        });
      }

      return res.json({
        success: true, userId: recoverUser.id, userEmail: recoverUser.email,
        planId: resolvedPlanId, stripeSubscriptionId: stripeSub.id,
        periodEnd: recoverPeriodEnd.toISOString(),
      });
    } catch (error) {
      console.error('❌ Admin subscription activate error:', error);
      res.status(500).json({ error: 'Failed to activate subscription' });
    }
  });

  // POST /api/admin/subscriptions/sync-by-customer
  app.post('/api/admin/subscriptions/sync-by-customer', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { email, stripeCustomerId, planId: overridePlanId } = req.body;
      if (!email && !stripeCustomerId) {
        return res.status(400).json({ error: 'email or stripeCustomerId is required' });
      }
      if (overridePlanId !== undefined && !['standard', 'premium'].includes(overridePlanId)) {
        return res.status(400).json({ error: 'planId override must be "standard" or "premium"' });
      }

      const condition = email
        ? eq(users.email, email.trim().toLowerCase())
        : eq(users.stripeCustomerId, stripeCustomerId.trim());
      const [syncUser] = await db.select().from(users).where(condition);
      if (!syncUser) {
        return res.status(404).json({ error: `No user found matching ${email || stripeCustomerId}` });
      }

      const syncCustId = syncUser.stripeCustomerId;
      if (!syncCustId) {
        return res.status(400).json({ error: `User ${syncUser.email} has no Stripe customer ID` });
      }

      const syncStripe = getStripeClient(Boolean(syncUser.isTestAccount));
      const syncSubs = await syncStripe.subscriptions.list({ customer: syncCustId, status: 'active', limit: 1 });
      const syncSub = syncSubs.data[0];
      if (!syncSub) {
        return res.status(404).json({ error: `No active Stripe subscription found for customer ${syncCustId}` });
      }

      const syncPriceId = syncSub.items?.data?.[0]?.price?.id;
      const syncUnitAmount = syncSub.items?.data?.[0]?.price?.unit_amount ?? 0;

      let resolvedPlanId: string | undefined = overridePlanId;
      let planSource: 'override' | 'db_lookup' | 'amount_fallback' = 'override';
      if (!resolvedPlanId) {
        const [syncPlanRow] = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, syncPriceId || ''));
        if (syncPlanRow?.planId && syncPlanRow.planId !== 'free') {
          resolvedPlanId = syncPlanRow.planId;
          planSource = 'db_lookup';
        }
      }
      if (!resolvedPlanId) {
        if (syncUnitAmount >= 4999) resolvedPlanId = 'premium';
        else if (syncUnitAmount >= 1999) resolvedPlanId = 'standard';
        if (resolvedPlanId) planSource = 'amount_fallback';
      }
      if (!resolvedPlanId || resolvedPlanId === 'free') {
        return res.status(400).json({ error: `Could not resolve paid plan for price ${syncPriceId} (amount ${syncUnitAmount}p) — pass planId to override` });
      }

      const syncLimits = getPlanLimits(resolvedPlanId);
      const syncProductLimit = syncLimits.products;

      const rawPeriodEnd = syncSub.current_period_end;
      const rawPeriodStart = syncSub.current_period_start;
      const syncPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const syncPeriodStart = rawPeriodStart ? new Date(rawPeriodStart * 1000) : new Date();
      const isPeriodValid = !isNaN(syncPeriodEnd.getTime()) && !isNaN(syncPeriodStart.getTime());

      await storage.updateUser(syncUser.id, {
        currentPlan: resolvedPlanId, subscriptionTier: resolvedPlanId,
        subscriptionStatus: 'active', productLimit: syncProductLimit,
        stripeSubscriptionId: syncSub.id,
        ...(isPeriodValid ? { subscriptionEndsAt: syncPeriodEnd, subscriptionPeriodEnd: syncPeriodEnd, subscriptionPeriodStart: syncPeriodStart } : {}),
      });

      const [existingSyncSub] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, syncUser.id));
      if (existingSyncSub) {
        await db.update(userSubscriptions).set({
          planId: resolvedPlanId, stripeSubscriptionId: syncSub.id, status: 'active',
          ...(isPeriodValid ? { currentPeriodStart: syncPeriodStart, currentPeriodEnd: syncPeriodEnd } : {}),
          cancelAtPeriodEnd: false, updatedAt: new Date(),
        }).where(eq(userSubscriptions.userId, syncUser.id));
      } else {
        await db.insert(userSubscriptions).values({
          userId: syncUser.id, planId: resolvedPlanId, stripeSubscriptionId: syncSub.id,
          status: 'active', currentPeriodStart: syncPeriodStart, currentPeriodEnd: syncPeriodEnd,
          cancelAtPeriodEnd: false,
        });
      }

      return res.json({
        success: true, userId: syncUser.id, userEmail: syncUser.email,
        planId: resolvedPlanId, stripeCustomerId: syncCustId,
        stripeSubscriptionId: syncSub.id, periodEnd: syncPeriodEnd.toISOString(), source: planSource,
      });
    } catch (error) {
      console.error('❌ Admin sync-by-customer error:', error);
      res.status(500).json({ error: 'Failed to sync subscription' });
    }
  });

  // GET /api/admin/stripe-mode
  app.get('/api/admin/stripe-mode', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { isLiveMode: liveMode, STRIPE_ENVIRONMENT: env } = await import('../stripeConfig');
      const testKey = process.env.STRIPE_SECRET_KEY || '';
      const liveKey = process.env.STRIPE_LIVE_SECRET_KEY || '';
      res.json({
        mode: liveMode() ? 'live' : 'test',
        environment: env,
        testKeyConfigured: testKey.length > 0,
        liveKeyConfigured: liveKey.length > 0,
        keyPrefix: (liveMode() ? liveKey : testKey).slice(0, 8) + '...',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to determine Stripe mode' });
    }
  });

  // GET /api/admin/payout-status
  app.get('/api/admin/payout-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const platformStripe = getStripeClient();
      const [balance, payouts] = await Promise.all([
        platformStripe.balance.retrieve(),
        platformStripe.payouts.list({ limit: 1 }),
      ]);
      const gbpAvailable = balance.available.find((b: any) => b.currency === 'gbp');
      const gbpPending   = balance.pending.find((b: any)   => b.currency === 'gbp');
      res.json({
        available: (gbpAvailable?.amount ?? 0) / 100,
        pending:   (gbpPending?.amount   ?? 0) / 100,
        currency:  'gbp',
        lastPayout: payouts.data[0]
          ? { amount: payouts.data[0].amount / 100, status: payouts.data[0].status, arrivalDate: new Date(payouts.data[0].arrival_date * 1000).toISOString() }
          : null,
      });
    } catch (error) {
      console.error('Admin payout-status error:', error);
      res.status(500).json({ error: 'Failed to fetch payout status' });
    }
  });

  // POST /api/admin/orders/:id/issue-refund
  app.post('/api/admin/orders/:id/issue-refund', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const refundOrderId = parseInt(req.params.id, 10);
      if (isNaN(refundOrderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const [order] = await db.select().from(orders).where(eq(orders.id, refundOrderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!order.stripePaymentIntentId) return res.status(400).json({ error: 'No payment intent on this order' });

      const [refundWholesaler] = await db.select({ isTestAccount: users.isTestAccount })
        .from(users).where(eq(users.id, order.wholesalerId)).limit(1);
      if (!refundWholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found for this order' });
      }
      const stripe = getStripeClient(Boolean(refundWholesaler.isTestAccount));

      const { amountPounds, reason = 'requested_by_customer' } = req.body;
      const refundAmount = amountPounds ? parseFloat(amountPounds) : parseFloat(order.subtotal || '0');
      if (isNaN(refundAmount) || refundAmount <= 0) return res.status(400).json({ error: 'Invalid refund amount' });

      const result = await refundAcrossPaymentIntents(stripe, order.stripePaymentIntentId, refundAmount, { reason, orderId: String(order.id), adminEmail: req.user.email });

      if (result.remaining === 0) {
        await db.update(orders).set({ status: 'refunded' }).where(eq(orders.id, order.id));
      }

      res.json({ success: true, totalRefunded: result.totalRefunded, remaining: result.remaining, fullyRefunded: result.remaining === 0 });
    } catch (error) {
      console.error('Admin issue-refund error:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  });

  // POST /api/admin/impersonate/exit (must be before :wholesalerId route)
  app.post('/api/admin/impersonate/exit', requireAuth, async (req: any, res) => {
    try {
      const adminEmail = getAdminEmail(req) || req.user.email;
      if (!ADMIN_EMAILS.includes(adminEmail)) return res.status(403).json({ error: 'Forbidden' });

      const { wholesalerId: bodyWholesalerId } = req.body as { wholesalerId?: string };
      const sessionWholesalerId = req.session?.impersonationToken?.wholesalerId;
      if (bodyWholesalerId && sessionWholesalerId && bodyWholesalerId !== sessionWholesalerId) {
        delete req.session!.impersonationToken;
        return res.status(400).json({ error: 'Wholesaler ID mismatch' });
      }
      const resolvedWholesalerId = sessionWholesalerId || bodyWholesalerId;
      delete req.session!.impersonationToken;

      if (resolvedWholesalerId) {
        await db.insert(adminAuditLogs).values({
          adminEmail,
          action: 'impersonate_exit',
          targetWholesalerId: resolvedWholesalerId,
          metadata: {},
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Admin impersonate exit error:', error);
      res.status(500).json({ error: 'Failed to log impersonation exit' });
    }
  });

  // POST /api/admin/impersonate/:wholesalerId
  app.post('/api/admin/impersonate/:wholesalerId', impersonateLimiter, requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const [target] = await db.select().from(users).where(eq(users.id, req.params.wholesalerId)).limit(1);
      if (!target || target.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }

      const effectiveAdminEmail = getAdminEmail(req) || '';
      const businessName = target.businessName || `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.email || '';

      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 30 * 60 * 1000;
      req.session!.impersonationToken = { token, wholesalerId: target.id, adminEmail: effectiveAdminEmail, expiresAt };

      await db.insert(adminAuditLogs).values({
        adminEmail: effectiveAdminEmail,
        action: 'impersonate_start',
        targetWholesalerId: target.id,
        metadata: { businessName: target.businessName, targetEmail: target.email },
      });

      res.json({ success: true, wholesalerId: target.id, businessName, token });
    } catch (error) {
      console.error('Admin impersonate error:', error);
      res.status(500).json({ error: 'Failed to start impersonation' });
    }
  });

  // GET /api/admin/impersonate/status
  app.get('/api/admin/impersonate/status', requireAuth, async (req: any, res) => {
    try {
      const adminEmail = getAdminEmail(req) || req.user.email;
      if (!ADMIN_EMAILS.includes(adminEmail)) return res.status(403).json({ error: 'Forbidden' });
      const impersonateHeader = req.headers['x-admin-impersonate'] as string | undefined;
      res.json({
        impersonating: !!impersonateHeader,
        wholesalerId: impersonateHeader || null,
        businessName: req.headers["x-impersonating-business"] as string | undefined || null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get impersonation status' });
    }
  });

  // GET /api/admin/plans
  app.get('/api/admin/plans', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const plans = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.createdAt));

      const subCounts = await db
        .select({ planId: userSubscriptions.planId, cnt: count() })
        .from(userSubscriptions)
        .innerJoin(users, eq(userSubscriptions.userId, users.id))
        .where(and(
          sql`${userSubscriptions.status} IN ('active','trialing','past_due')`,
          eq(users.isTestAccount, false),
        ))
        .groupBy(userSubscriptions.planId);
      const countMap: Record<string, number> = {};
      for (const row of subCounts) { if (row.planId) countMap[row.planId] = Number(row.cnt); }

      const result = plans.map(p => ({
        ...p,
        subscriberCount: countMap[p.planId] || 0,
        mrr: (countMap[p.planId] || 0) * parseFloat(p.monthlyPrice as string),
      }));

      res.json({ plans: result });
    } catch (error) {
      console.error('Admin plans error:', error);
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  // POST /api/admin/plans
  app.post('/api/admin/plans', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { name, price, billingInterval = 'monthly', features = [], limits = {}, description = '' } = req.body;
      if (!name || price === undefined || price === null) return res.status(400).json({ error: 'name and price are required' });
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'price must be a non-negative number' });

      const basePlanId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      const existing = await db.select({ planId: subscriptionPlans.planId })
        .from(subscriptionPlans)
        .where(or(
          eq(subscriptionPlans.planId, basePlanId),
          sql`${subscriptionPlans.planId} LIKE ${basePlanId + '_v%'}`,
        ));
      const version = existing.length > 0 ? existing.length + 1 : 1;
      const planId = version === 1 ? basePlanId : `${basePlanId}_v${version}`;

      const maxSort = await db.select({ s: sql<number>`MAX(${subscriptionPlans.sortOrder})` }).from(subscriptionPlans);
      const sortOrder = (Number(maxSort[0]?.s) || 0) + 1;

      let stripeProductId: string | null = null;
      let stripePriceId: string | null = null;

      if (priceNum > 0) {
        try {
          const platformStripe = getStripeClient();
          const product = await platformStripe.products.create({
            name, description: description || `Quikpik ${name} plan`,
            metadata: { planId, platform: 'quikpik' },
          });
          stripeProductId = product.id;

          const stripeInterval = billingInterval === 'yearly' ? 'year' : 'month';
          const stripePrice = await platformStripe.prices.create({
            product: product.id, unit_amount: Math.round(priceNum * 100),
            currency: 'gbp', recurring: { interval: stripeInterval },
            metadata: { planId, platform: 'quikpik' },
          });
          stripePriceId = stripePrice.id;
        } catch (stripeError: any) {
          console.error('Stripe product/price creation failed:', stripeError?.message);
          return res.status(502).json({ error: `Stripe error: ${stripeError?.message || 'unknown'}` });
        }
      }

      const [created] = await db.insert(subscriptionPlans).values({
        name, planId, stripeProductId, stripePriceId,
        monthlyPrice: priceNum.toFixed(2), currency: 'GBP', description,
        features: Array.isArray(features) ? features : [],
        limits, billingInterval, version, isActive: true, sortOrder,
      }).returning();

      res.status(201).json({ plan: created });
    } catch (error) {
      console.error('Admin create plan error:', error);
      res.status(500).json({ error: 'Failed to create plan' });
    }
  });

  // PATCH /api/admin/plans/:id/archive
  app.patch('/api/admin/plans/:id/archive', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const planId = parseInt(req.params.id, 10);
      if (isNaN(planId)) return res.status(400).json({ error: 'Invalid plan ID' });
      const planRecord = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId)).limit(1);
      if (!planRecord[0]) return res.status(404).json({ error: 'Plan not found' });
      await db.update(subscriptionPlans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(subscriptionPlans.id, planId));
      res.json({ success: true, planId: planRecord[0].planId });
    } catch (error) {
      console.error('Admin archive plan error:', error);
      res.status(500).json({ error: 'Failed to archive plan' });
    }
  });

  // POST /api/admin/wholesalers/:id/remove-custom-pricing
  app.post('/api/admin/wholesalers/:id/remove-custom-pricing', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select().from(users)
        .where(and(eq(users.id, req.params.id), eq(users.role, 'wholesaler')));
      if (!targetUser) return res.status(404).json({ error: 'Wholesaler not found' });
      await db.update(userSubscriptions).set({
        isCustomPricing: false, internalNote: null, customPriceExpiresAt: null, updatedAt: new Date(),
      }).where(eq(userSubscriptions.userId, targetUser.id));
      res.json({ success: true, userId: targetUser.id });
    } catch (error) {
      console.error('Admin remove-custom-pricing error:', error);
      res.status(500).json({ error: 'Failed to remove custom pricing' });
    }
  });

  // POST /api/admin/wholesalers/:id/change-plan
  app.post('/api/admin/wholesalers/:id/change-plan', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { planId: newPlanId, customPriceId, internalNote, customPriceExpiresAt } = req.body;
      if (!newPlanId) return res.status(400).json({ error: 'planId is required' });

      const [targetUser] = await db.select().from(users)
        .where(and(eq(users.id, req.params.id), eq(users.role, 'wholesaler')));
      if (!targetUser) return res.status(404).json({ error: 'Wholesaler not found' });

      const [targetPlan] = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.planId, newPlanId));
      if (!targetPlan) return res.status(400).json({ error: 'Plan not found' });

      const limits = (targetPlan.limits as { products?: number } | null);
      const productLimit = (limits?.products ?? 2);
      const currentStripeSubId = targetUser.stripeSubscriptionId;
      const isTargetTestAccount = Boolean(targetUser.isTestAccount);

      if (currentStripeSubId) {
        if (newPlanId === 'free') {
          await SubscriptionService.proratedFreeDowngrade(currentStripeSubId, targetUser.id, isTargetTestAccount);
        } else if (customPriceId || targetPlan.stripePriceId) {
          const effectivePriceId = customPriceId || targetPlan.stripePriceId!;
          const isCustom = Boolean(customPriceId);

          const [currentPlan] = await db.select({ monthlyPrice: subscriptionPlans.monthlyPrice })
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.planId, targetUser.currentPlan || targetUser.subscriptionTier || 'free'));
          const currentPrice = parseFloat((currentPlan?.monthlyPrice as string) || '0');
          const newPrice = parseFloat(targetPlan.monthlyPrice as string);
          const isDowngrade = !isCustom && newPrice < currentPrice;

          if (isDowngrade) {
            await SubscriptionService.immediateDowngradeWithProration(
              currentStripeSubId, effectivePriceId, newPlanId, isTargetTestAccount,
            );
          } else {
            await SubscriptionService.upgradeSubscriptionWithProration(
              currentStripeSubId, effectivePriceId, newPlanId, isTargetTestAccount,
            );
          }
          await storage.updateUser(targetUser.id, {
            currentPlan: newPlanId, subscriptionTier: newPlanId,
            subscriptionStatus: 'active', productLimit,
          });
          await db.update(userSubscriptions).set({
            planId: newPlanId, status: 'active', cancelAtPeriodEnd: false,
            isCustomPricing: isCustom,
            internalNote: (internalNote as string) || null,
            customPriceExpiresAt: customPriceExpiresAt ? new Date(customPriceExpiresAt as string) : null,
            updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, targetUser.id));
        }
      } else {
        await storage.updateUser(targetUser.id, {
          currentPlan: newPlanId, subscriptionTier: newPlanId,
          subscriptionStatus: newPlanId === 'free' ? 'free' : 'active',
          productLimit, stripeSubscriptionId: null,
        });
        const [existingSub] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, targetUser.id));
        if (existingSub) {
          await db.update(userSubscriptions).set({
            planId: newPlanId, status: newPlanId === 'free' ? 'canceled' : 'active', updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, targetUser.id));
        } else if (newPlanId !== 'free') {
          await db.insert(userSubscriptions).values({
            userId: targetUser.id, planId: newPlanId, status: 'active',
          });
        }
      }

      res.json({ success: true, userId: targetUser.id, newPlanId });
    } catch (error) {
      console.error('Admin change-plan error:', error);
      res.status(500).json({ error: 'Failed to change plan' });
    }
  });
}
