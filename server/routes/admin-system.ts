import type { Express } from "express";
import { ilike } from "drizzle-orm";
import {
  ADMIN_EMAILS, and, asc, count, db, desc, eq, getAdminEmail, getStripeClient, inArray, isNull, lte, or,
  orders, orderItems, products, requireAuth, sql, storage, SubscriptionService,
  subscriptionPlans, userSubscriptions, users, getPlanLimits,
  stockMovements, stockUpdateNotifications, customerProfileUpdateNotifications,
  smsVerificationCodes, sendEmail,
} from "./shared";
import { getCurrentFeeConfig, saveFeeConfig, getFeeConfigHistory } from "../utils/fee-config";
import {
  broadcasts, tabPermissions, userBadges, onboardingMilestones, deliveryAddresses,
  messageTemplates, templateProducts, templateCampaigns, stockAlerts,
  customerInsights, businessIntelligence, inventoryInsights, financialPerformance,
  productPerformanceSummary, promotionAnalytics, customerInvitationTokens,
  productBatches, subscriptionAuditLogs, customerGroups, customerGroupMembers,
  wholesalerCustomerRelationships, customerRegistrationRequests,
  teamMembers, priceLists, priceListItems, priceListAssignments,
  orderCancellationRequests,
} from "@shared/schema";

const getExistingTables = async (): Promise<Set<string>> => {
  const result = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  return new Set(result.rows.map(r => r.tablename));
};

export function registerAdminSystemRoutes(app: Express): void {
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

      // If the wholesaler had a custom price tied to a specific plan and the new plan
      // is different, clear the custom price plan binding (and its tied price overrides)
      // so the pricing page no longer shows a stale "Your price" badge.
      // If split bindings (customPricePlanIdAnnual / customPricePlanIdMonthly) are present,
      // do NOT auto-clear them on plan change — the admin explicitly set separate deals per
      // billing interval and they must persist when the wholesaler switches monthly↔annual.
      // Only clear the legacy single-field system when no split bindings exist.
      const hasSplitBindings = !!(
        (targetUser as any).customPricePlanIdAnnual ||
        (targetUser as any).customPricePlanIdMonthly
      );
      if (!hasSplitBindings) {
        const existingCustomPricePlanId = (targetUser as any).customPricePlanId as string | null | undefined;
        if (existingCustomPricePlanId && existingCustomPricePlanId !== newPlanId) {
          await db.update(users).set({
            customPricePlanId: null,
            customMonthlyPrice: null,
            customAnnualPrice: null,
          } as any).where(eq(users.id, targetUser.id));
        }
      }

      res.json({ success: true, userId: targetUser.id, newPlanId });
    } catch (error) {
      console.error('Admin change-plan error:', error);
      res.status(500).json({ error: 'Failed to change plan' });
    }
  });

  // GET /api/admin/search
  app.get('/api/admin/search', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { q = '' } = req.query as Record<string, string>;
      const term = q.trim();
      if (!term || term.length < 2) return res.json({ orders: [], customers: [], products: [] });
      const searchPat = `%${term}%`;

      const [matchedOrders, matchedCustomers, matchedProducts] = await Promise.all([
        db.select({
          id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName,
          wholesalerName: users.businessName, status: orders.status, createdAt: orders.createdAt,
        }).from(orders).leftJoin(users, eq(orders.wholesalerId, users.id))
          .where(or(ilike(orders.orderNumber, searchPat), ilike(orders.customerName, searchPat)))
          .orderBy(desc(orders.createdAt)).limit(5),

        db.select({
          id: users.id, firstName: users.firstName, lastName: users.lastName,
          businessName: users.businessName, phoneNumber: users.phoneNumber,
          email: users.email, wholesalerId: users.wholesalerId,
        }).from(users).where(and(
          inArray(users.role, ['customer', 'retailer']),
          or(
            ilike(users.firstName, searchPat), ilike(users.lastName, searchPat),
            ilike(users.businessName, searchPat), ilike(users.phoneNumber, searchPat),
            ilike(users.email, searchPat),
          ),
        )).limit(5),

        db.select({
          id: products.id, name: products.name, category: products.category,
          wholesalerName: users.businessName, status: products.status, price: products.price,
        }).from(products).leftJoin(users, eq(products.wholesalerId, users.id))
          .where(ilike(products.name, searchPat)).limit(5),
      ]);

      const custWholesalerIds = Array.from(new Set(matchedCustomers.map(c => c.wholesalerId).filter(Boolean))) as string[];
      const custWholesalers: Record<string, string> = {};
      if (custWholesalerIds.length > 0) {
        const ws = await db.select({ id: users.id, businessName: users.businessName }).from(users).where(inArray(users.id, custWholesalerIds));
        for (const w of ws) custWholesalers[w.id] = w.businessName || 'Unknown';
      }

      res.json({
        orders: matchedOrders.map(o => ({
          id: o.id, orderNumber: o.orderNumber, customerName: o.customerName,
          wholesalerName: o.wholesalerName, status: o.status, createdAt: o.createdAt,
        })),
        customers: matchedCustomers.map(c => ({
          id: c.id, name: c.businessName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
          phoneNumber: c.phoneNumber, email: c.email,
          wholesalerName: c.wholesalerId ? (custWholesalers[c.wholesalerId] || 'Unknown') : 'No wholesaler',
        })),
        products: matchedProducts.map(p => ({
          id: p.id, name: p.name, category: p.category,
          wholesalerName: p.wholesalerName, status: p.status, price: parseFloat(p.price || '0'),
        })),
      });
    } catch (error) {
      console.error('Admin search error:', error);
      res.status(500).json({ error: 'Failed to search' });
    }
  });

  // GET /api/admin/fee-config
  app.get('/api/admin/fee-config', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [current, history] = await Promise.all([
        getCurrentFeeConfig(),
        getFeeConfigHistory(20),
      ]);
      res.json({ current, history });
    } catch (error) {
      console.error('Admin fee-config GET error:', error);
      res.status(500).json({ error: 'Failed to fetch fee configuration.' });
    }
  });

  // POST /api/admin/fee-config
  app.post('/api/admin/fee-config', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { percentage, fixed, platformFeePercentage, notes } = req.body as {
        percentage: number;
        fixed: number;
        platformFeePercentage?: number;
        notes?: string;
      };
      if (typeof percentage !== 'number' || typeof fixed !== 'number') {
        return res.status(400).json({ error: 'percentage and fixed must be numbers.' });
      }
      if (percentage < 0 || percentage > 1) {
        return res.status(400).json({ error: 'percentage must be between 0 and 1 (e.g. 0.015 for 1.5%).' });
      }
      if (fixed < 0) {
        return res.status(400).json({ error: 'fixed must be >= 0.' });
      }
      if (platformFeePercentage !== undefined) {
        if (typeof platformFeePercentage !== 'number' || platformFeePercentage < 0 || platformFeePercentage > 1) {
          return res.status(400).json({ error: 'platformFeePercentage must be a number between 0 and 1.' });
        }
      }
      const adminEmail = getAdminEmail(req) || 'unknown';
      const saved = await saveFeeConfig({ percentage, fixed, platformFeePercentage, notes, changedBy: adminEmail });
      res.json({ ok: true, config: saved });
    } catch (error) {
      console.error('Admin fee-config POST error:', error);
      res.status(500).json({ error: 'Failed to save fee configuration.' });
    }
  });

  // GET /api/fee-rates — public endpoint returning current platform & customer fee rates
  app.get('/api/fee-rates', async (_req, res) => {
    try {
      const config = await getCurrentFeeConfig();
      res.json({
        platformFee: { percentage: config.platformFeePercentage },
        customerFee: { percentage: config.percentage, fixed: config.fixed },
      });
    } catch (error) {
      console.error('fee-rates GET error:', error);
      res.status(500).json({ error: 'Failed to fetch fee rates.' });
    }
  });

  // POST /api/admin/cleanup-test-data
  app.post('/api/admin/cleanup-test-data', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) return res.status(403).json({ error: 'Forbidden' });

      const testUsers = await db.select({ id: users.id }).from(users).where(eq(users.isTestAccount, true));
      const testUserIds = testUsers.map(u => u.id);

      if (testUserIds.length === 0) {
        return res.json({ message: 'No test accounts found. Nothing to delete.', deleted: {} });
      }

      const { deleted } = await db.transaction(async (trx) => {
        const testOrders = await trx.select({ id: orders.id })
          .from(orders).where(inArray(orders.retailerId, testUserIds));
        const txOrderIds = testOrders.map(o => o.id);

        const counts: Record<string, number> = {
          orderItems: 0, orders: 0, stockMovements: 0,
          stockUpdateNotifications: 0, customerProfileUpdateNotifications: 0, smsVerificationCodes: 0,
        };

        if (txOrderIds.length > 0) {
          const di = await trx.delete(orderItems)
            .where(inArray(orderItems.orderId, txOrderIds)).returning({ id: orderItems.id });
          counts.orderItems = di.length;

          const dm = await trx.delete(stockMovements)
            .where(inArray(stockMovements.orderId, txOrderIds)).returning({ id: stockMovements.id });
          counts.stockMovements = dm.length;

          const do_ = await trx.delete(orders)
            .where(inArray(orders.id, txOrderIds)).returning({ id: orders.id });
          counts.orders = do_.length;
        }

        const dsn = await trx.delete(stockUpdateNotifications)
          .where(inArray(stockUpdateNotifications.wholesalerId, testUserIds)).returning({ id: stockUpdateNotifications.id });
        counts.stockUpdateNotifications = dsn.length;

        const dpn = await trx.delete(customerProfileUpdateNotifications)
          .where(inArray(customerProfileUpdateNotifications.customerId, testUserIds)).returning({ id: customerProfileUpdateNotifications.id });
        counts.customerProfileUpdateNotifications = dpn.length;

        const dsms = await trx.delete(smsVerificationCodes)
          .where(inArray(smsVerificationCodes.customerId, testUserIds)).returning({ id: smsVerificationCodes.id });
        counts.smsVerificationCodes = dsms.length;

        return { deleted: counts };
      });

      res.json({
        message: `Cleanup complete. Deleted data for ${testUserIds.length} test account(s).`,
        testAccounts: testUserIds, deleted,
      });
    } catch (error) {
      console.error('Admin cleanup-test-data error:', error);
      res.status(500).json({ error: 'Failed to clean up test data' });
    }
  });

  // PATCH /api/admin/users/:id/test-account
  app.patch('/api/admin/users/:id/test-account', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) return res.status(403).json({ error: 'Forbidden' });

      const userId = req.params.id;
      const { isTestAccount } = req.body;
      if (typeof isTestAccount !== 'boolean') {
        return res.status(400).json({ error: 'isTestAccount must be a boolean' });
      }

      const [updated] = await db.update(users)
        .set({ isTestAccount })
        .where(eq(users.id, userId))
        .returning({ id: users.id, email: users.email, isTestAccount: users.isTestAccount });

      if (!updated) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, user: updated });
    } catch (error) {
      console.error('Admin test-account toggle error:', error);
      res.status(500).json({ error: 'Failed to update test account flag' });
    }
  });

  // GET /api/admin/go-live-reset/preview
  app.get('/api/admin/go-live-reset/preview', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) return res.status(403).json({ error: 'Forbidden' });

      const existing = await getExistingTables();
      const has = (t: string) => existing.has(t);
      const n = (rows: { n: unknown }[]) => Number(rows[0].n);
      const sc = (tableName: string, q: Promise<{ n: unknown }[]>) =>
        has(tableName) ? q.then(n) : Promise.resolve(0);

      const [
        wholesalerCount, retailerCount, orderCount, orderItemCount, stockMovementCount,
        productCount, productBatchCount, stockAlertCount,
        broadcastCount, messageTemplateCount, templateCampaignCount, templateProductCount,
        customerGroupCount, customerGroupMemberCount,
        relationshipCount, invitationCount, registrationCount,
        deliveryAddressCount, smsCodeCount,
        onboardingCount, userBadgeCount,
        subscriptionCount, teamMemberCount, tabPermissionCount,
        priceListCount, priceListItemCount, priceListAssignmentCount,
        customerInsightCount, businessIntelligenceCount, inventoryInsightCount,
        financialPerformanceCount, productPerfCount, promotionAnalyticsCount,
        stockUpdateNotifCount, customerProfileNotifCount,
      ] = await Promise.all([
        sc('users',                                  db.select({ n: count() }).from(users).where(and(eq(users.role, 'wholesaler'), sql`email != 'hello@quikpik.co'`))),
        sc('users',                                  db.select({ n: count() }).from(users).where(inArray(users.role, ['customer', 'retailer']))),
        sc('orders',                                 db.select({ n: count() }).from(orders)),
        sc('order_items',                            db.select({ n: count() }).from(orderItems)),
        sc('stock_movements',                        db.select({ n: count() }).from(stockMovements)),
        sc('products',                               db.select({ n: count() }).from(products)),
        sc('product_batches',                        db.select({ n: count() }).from(productBatches)),
        sc('stock_alerts',                           db.select({ n: count() }).from(stockAlerts)),
        sc('broadcasts',                             db.select({ n: count() }).from(broadcasts)),
        sc('message_templates',                      db.select({ n: count() }).from(messageTemplates)),
        sc('template_campaigns',                     db.select({ n: count() }).from(templateCampaigns)),
        sc('template_products',                      db.select({ n: count() }).from(templateProducts)),
        sc('customer_groups',                        db.select({ n: count() }).from(customerGroups)),
        sc('customer_group_members',                 db.select({ n: count() }).from(customerGroupMembers)),
        sc('wholesaler_customer_relationships',      db.select({ n: count() }).from(wholesalerCustomerRelationships)),
        sc('customer_invitation_tokens',             db.select({ n: count() }).from(customerInvitationTokens)),
        sc('customer_registration_requests',         db.select({ n: count() }).from(customerRegistrationRequests)),
        sc('delivery_addresses',                     db.select({ n: count() }).from(deliveryAddresses)),
        sc('sms_verification_codes',                 db.select({ n: count() }).from(smsVerificationCodes)),
        sc('onboarding_milestones',                  db.select({ n: count() }).from(onboardingMilestones)),
        sc('user_badges',                            db.select({ n: count() }).from(userBadges)),
        sc('user_subscriptions',                     db.select({ n: count() }).from(userSubscriptions).where(sql`user_id != (SELECT id FROM users WHERE email = 'hello@quikpik.co' LIMIT 1)`)),
        sc('team_members',                           db.select({ n: count() }).from(teamMembers)),
        sc('tab_permissions',                        db.select({ n: count() }).from(tabPermissions)),
        sc('price_lists',                            db.select({ n: count() }).from(priceLists)),
        sc('price_list_items',                       db.select({ n: count() }).from(priceListItems)),
        sc('price_list_assignments',                 db.select({ n: count() }).from(priceListAssignments)),
        sc('customer_insights',                      db.select({ n: count() }).from(customerInsights)),
        sc('business_intelligence',                  db.select({ n: count() }).from(businessIntelligence)),
        sc('inventory_insights',                     db.select({ n: count() }).from(inventoryInsights)),
        sc('financial_performance',                  db.select({ n: count() }).from(financialPerformance)),
        sc('product_performance_summary',            db.select({ n: count() }).from(productPerformanceSummary)),
        sc('promotion_analytics',                    db.select({ n: count() }).from(promotionAnalytics)),
        sc('stock_update_notifications',             db.select({ n: count() }).from(stockUpdateNotifications)),
        sc('customer_profile_update_notifications',  db.select({ n: count() }).from(customerProfileUpdateNotifications)),
      ]);

      const preview: Record<string, number> = {
        wholesalers: wholesalerCount, customers: retailerCount, orders: orderCount,
        orderItems: orderItemCount, stockMovements: stockMovementCount, products: productCount,
        productBatches: productBatchCount, stockAlerts: stockAlertCount,
        broadcasts: broadcastCount, messageTemplates: messageTemplateCount,
        campaigns: templateCampaignCount, templateProducts: templateProductCount,
        customerGroups: customerGroupCount, customerGroupMembers: customerGroupMemberCount,
        relationships: relationshipCount, invitations: invitationCount,
        registrationRequests: registrationCount, deliveryAddresses: deliveryAddressCount,
        smsCodes: smsCodeCount, onboardingMilestones: onboardingCount,
        userBadges: userBadgeCount, subscriptions: subscriptionCount,
        teamMembers: teamMemberCount, tabPermissions: tabPermissionCount,
        priceLists: priceListCount, priceListItems: priceListItemCount,
        priceListAssignments: priceListAssignmentCount,
        analyticsInsights: customerInsightCount + businessIntelligenceCount + inventoryInsightCount + financialPerformanceCount + productPerfCount + promotionAnalyticsCount,
        notifications: stockUpdateNotifCount + customerProfileNotifCount,
      };
      const totalRows = Object.values(preview).reduce((a, b) => a + b, 0);
      res.json({ preview, totalRows });
    } catch (error) {
      console.error('Go-live preview error:', error);
      res.status(500).json({ error: 'Failed to fetch preview counts' });
    }
  });

  // POST /api/admin/go-live-reset
  app.post('/api/admin/go-live-reset', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) return res.status(403).json({ error: 'Forbidden' });

      const { confirm } = req.body;
      if (confirm !== 'RESET') {
        return res.status(400).json({ error: 'Confirmation text must be exactly "RESET"' });
      }

      const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'hello@quikpik.co'));
      if (!adminUser) return res.status(500).json({ error: 'Admin user not found' });

      const existing = await getExistingTables();

      const TRUNCATE_WHITELIST = [
        'orders', 'order_items', 'order_cancellation_requests',
        'products', 'product_batches', 'stock_movements', 'stock_alerts', 'stock_update_notifications',
        'broadcasts', 'message_templates', 'template_campaigns', 'template_products', 'campaign_orders',
        'customer_groups', 'customer_group_members',
        'wholesaler_customer_relationships', 'customer_invitation_tokens', 'customer_registration_requests',
        'delivery_addresses', 'sms_verification_codes',
        'onboarding_milestones', 'user_badges',
        'team_members', 'tab_permissions',
        'price_lists', 'price_list_items', 'price_list_assignments',
        'customer_insights', 'business_intelligence', 'inventory_insights',
        'financial_performance', 'product_performance_summary', 'promotion_analytics',
        'customer_profile_update_notifications',
        'admin_audit_logs', 'system_error_logs',
        'business_profiles', 'collection_addresses',
        'subscription_audit_logs',
      ];

      const truncateTargets = TRUNCATE_WHITELIST.filter(t => existing.has(t));

      const n = (rows: { n: unknown }[]) => Number(rows[0].n);
      const sc = (tableName: string, q: Promise<{ n: unknown }[]>) =>
        existing.has(tableName) ? q.then(n) : Promise.resolve(0);

      const [
        wholesalerCount, retailerCount, orderCount, orderItemCount, stockMovementCount,
        productCount, productBatchCount, stockAlertCount,
        broadcastCount, messageTemplateCount, templateCampaignCount, templateProductCount,
        customerGroupCount, customerGroupMemberCount,
        relationshipCount, invitationCount, registrationCount,
        deliveryAddressCount, smsCodeCount,
        onboardingCount, userBadgeCount,
        subscriptionCount, teamMemberCount, tabPermissionCount,
        priceListCount, priceListItemCount, priceListAssignmentCount,
        customerInsightCount, businessIntelligenceCount, inventoryInsightCount,
        financialPerformanceCount, productPerfCount, promotionAnalyticsCount,
        stockUpdateNotifCount, customerProfileNotifCount,
      ] = await Promise.all([
        sc('users',                                  db.select({ n: count() }).from(users).where(and(eq(users.role, 'wholesaler'), sql`email != 'hello@quikpik.co'`))),
        sc('users',                                  db.select({ n: count() }).from(users).where(inArray(users.role, ['customer', 'retailer']))),
        sc('orders',                                 db.select({ n: count() }).from(orders)),
        sc('order_items',                            db.select({ n: count() }).from(orderItems)),
        sc('stock_movements',                        db.select({ n: count() }).from(stockMovements)),
        sc('products',                               db.select({ n: count() }).from(products)),
        sc('product_batches',                        db.select({ n: count() }).from(productBatches)),
        sc('stock_alerts',                           db.select({ n: count() }).from(stockAlerts)),
        sc('broadcasts',                             db.select({ n: count() }).from(broadcasts)),
        sc('message_templates',                      db.select({ n: count() }).from(messageTemplates)),
        sc('template_campaigns',                     db.select({ n: count() }).from(templateCampaigns)),
        sc('template_products',                      db.select({ n: count() }).from(templateProducts)),
        sc('customer_groups',                        db.select({ n: count() }).from(customerGroups)),
        sc('customer_group_members',                 db.select({ n: count() }).from(customerGroupMembers)),
        sc('wholesaler_customer_relationships',      db.select({ n: count() }).from(wholesalerCustomerRelationships)),
        sc('customer_invitation_tokens',             db.select({ n: count() }).from(customerInvitationTokens)),
        sc('customer_registration_requests',         db.select({ n: count() }).from(customerRegistrationRequests)),
        sc('delivery_addresses',                     db.select({ n: count() }).from(deliveryAddresses)),
        sc('sms_verification_codes',                 db.select({ n: count() }).from(smsVerificationCodes)),
        sc('onboarding_milestones',                  db.select({ n: count() }).from(onboardingMilestones)),
        sc('user_badges',                            db.select({ n: count() }).from(userBadges)),
        sc('user_subscriptions',                     db.select({ n: count() }).from(userSubscriptions).where(sql`user_id != ${adminUser.id}`)),
        sc('team_members',                           db.select({ n: count() }).from(teamMembers)),
        sc('tab_permissions',                        db.select({ n: count() }).from(tabPermissions)),
        sc('price_lists',                            db.select({ n: count() }).from(priceLists)),
        sc('price_list_items',                       db.select({ n: count() }).from(priceListItems)),
        sc('price_list_assignments',                 db.select({ n: count() }).from(priceListAssignments)),
        sc('customer_insights',                      db.select({ n: count() }).from(customerInsights)),
        sc('business_intelligence',                  db.select({ n: count() }).from(businessIntelligence)),
        sc('inventory_insights',                     db.select({ n: count() }).from(inventoryInsights)),
        sc('financial_performance',                  db.select({ n: count() }).from(financialPerformance)),
        sc('product_performance_summary',            db.select({ n: count() }).from(productPerformanceSummary)),
        sc('promotion_analytics',                    db.select({ n: count() }).from(promotionAnalytics)),
        sc('stock_update_notifications',             db.select({ n: count() }).from(stockUpdateNotifications)),
        sc('customer_profile_update_notifications',  db.select({ n: count() }).from(customerProfileUpdateNotifications)),
      ]);

      await db.transaction(async (trx) => {
        if (truncateTargets.length > 0) {
          const tableList = truncateTargets.map(t => `"${t}"`).join(', ');
          await trx.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
        }
        await trx.delete(users).where(inArray(users.role, ['customer', 'retailer']));
        await trx.delete(users).where(
          and(eq(users.role, 'wholesaler'), sql`email != 'hello@quikpik.co'`)
        );
        if (existing.has('user_subscriptions')) {
          await trx.delete(userSubscriptions).where(sql`user_id != ${adminUser.id}`);
        }
        await trx.update(users).set({ orderNumberCounter: 0 }).where(eq(users.id, adminUser.id));
      });

      const deleted: Record<string, number> = {
        wholesalers: wholesalerCount, customers: retailerCount, orders: orderCount,
        orderItems: orderItemCount, stockMovements: stockMovementCount, products: productCount,
        productBatches: productBatchCount, stockAlerts: stockAlertCount,
        broadcasts: broadcastCount, messageTemplates: messageTemplateCount,
        campaigns: templateCampaignCount, templateProducts: templateProductCount,
        customerGroups: customerGroupCount, customerGroupMembers: customerGroupMemberCount,
        relationships: relationshipCount, invitations: invitationCount,
        registrationRequests: registrationCount, deliveryAddresses: deliveryAddressCount,
        smsCodes: smsCodeCount, onboardingMilestones: onboardingCount,
        userBadges: userBadgeCount, subscriptions: subscriptionCount,
        teamMembers: teamMemberCount, tabPermissions: tabPermissionCount,
        priceLists: priceListCount, priceListItems: priceListItemCount,
        priceListAssignments: priceListAssignmentCount,
        analyticsInsights: customerInsightCount + businessIntelligenceCount + inventoryInsightCount + financialPerformanceCount + productPerfCount + promotionAnalyticsCount,
        notifications: stockUpdateNotifCount + customerProfileNotifCount,
      };
      const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);

      res.json({ success: true, message: 'Platform reset complete. Ready for real customers.', deleted, totalDeleted });
    } catch (error) {
      console.error('Go-live reset error:', error);
      res.status(500).json({ error: 'Reset failed. No data was changed (transaction rolled back).' });
    }
  });

  // POST /api/admin/create-test-account
  app.post('/api/admin/create-test-account', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { firstName, lastName, email, password } = req.body as {
        firstName: string; lastName: string; email: string; password: string;
      };

      if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
        return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      const emailNorm = email.trim().toLowerCase();
      const existing = await storage.getUserByEmail(emailNorm);
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const newUser = await storage.createUserWithPassword({
        id: crypto.randomUUID(),
        email: emailNorm,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        businessName: `${firstName.trim()} ${lastName.trim()} (Test)`,
        role: 'wholesaler',
        isTestAccount: true,
        isFirstLogin: false,
      }, password);

      const appUrl = process.env.APP_URL || 'https://quikpik.co';
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1a7a3d;">Welcome to Quikpik — Your Test Account is Ready</h2>
          <p>Hi ${firstName.trim()},</p>
          <p>Your tester account has been created by the Quikpik team. Use the email address below to log in. Your password will be shared with you separately by the team.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:4px 0;"><strong>Email:</strong> ${emailNorm}</p>
          </div>
          <p>
            <a href="${appUrl}/login" style="display:inline-block;background:#1a7a3d;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
              Log in to Quikpik
            </a>
          </p>
          <p style="color:#6b7280;font-size:13px;">Please change your password after your first login. If you have any questions, reach out to us at hello@quikpik.co.</p>
        </div>
      `;

      let emailSent = true;
      try {
        await sendEmail({
          to: emailNorm, from: 'hello@quikpik.co',
          subject: 'Your Quikpik Tester Account', html,
          text: `Welcome to Quikpik!\n\nHi ${firstName.trim()},\n\nYour tester account has been set up.\n\nEmail: ${emailNorm}\n\nLog in at: ${appUrl}/login\n\nYour password will be shared with you separately by the team. Please change it after your first login.`,
        });
      } catch (emailErr) {
        emailSent = false;
        console.warn(`⚠️ Invite email failed for new tester ${emailNorm}:`, emailErr);
      }

      res.json({ success: true, id: newUser.id, email: newUser.email, emailSent });
    } catch (error) {
      console.error('Admin create-test-account error:', error);
      res.status(500).json({ error: 'Failed to create tester account.' });
    }
  });

  // GET /api/admin/products/invalid-units-per-pallet
  app.get('/api/admin/products/invalid-units-per-pallet', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const invalidProducts = await db
        .select({
          id: products.id, name: products.name, wholesalerId: products.wholesalerId,
          wholesalerEmail: users.email, unitsPerPallet: products.unitsPerPallet, status: products.status,
        })
        .from(products)
        .leftJoin(users, eq(products.wholesalerId, users.id))
        .where(or(isNull(products.unitsPerPallet), lte(products.unitsPerPallet, 0)));

      res.json({ count: invalidProducts.length, products: invalidProducts });
    } catch (error) {
      console.error('Admin invalid-units-per-pallet error:', error);
      res.status(500).json({ error: 'Failed to query products.' });
    }
  });
}
