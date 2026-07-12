/**
 * ADMIN SECURITY AUDIT — admin-core.ts
 * Audited: 2026-06-23
 *
 * Guard pattern: ALL routes use requireAuth + ADMIN_EMAILS.includes(getAdminEmail(req))
 * getAdminEmail reads req._adminEmail (impersonation) || req.user?.email (session)
 *
 * Route → Guard                                              Data isolation
 * ─────────────────────────────────────────────────────────────────────────
 * GET  /api/admin/platform-stats                             ✅ admin-only; no per-wholesaler param
 * GET  /api/admin/wholesalers                                ✅ admin-only; returns all, intentional
 * GET  /api/admin/revenue                                    ✅ admin-only; filters by isTestAccount
 * PATCH /api/admin/wholesalers/:id/customer-fee-override     ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/custom-pricing            ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/toggle-status             ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/toggle-test-account       ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/toggle-inactive           ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/toggle-show-on-homepage   ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/verify                     ✅ admin-only; validates wholesaler role; body { verified, notes? }
 * PATCH /api/admin/wholesalers/:id/custom-subscription-pricing ✅ admin-only; validates wholesaler role
 * PATCH /api/admin/wholesalers/:id/custom-fee                ✅ admin-only; validates wholesaler role
 * GET  /api/admin/customers/map                              ✅ admin-only; no tenant param accepted
 * PATCH /api/admin/customers/:id/type                        ✅ admin-only; role validated
 * POST /api/admin/customers/geocode-all                      ✅ admin-only; bulk op, no tenant scope needed
 * GET  /api/admin/customers                                  ✅ admin-only; returns all customers
 * GET  /api/admin/customers/:id/orders                       ✅ admin-only; no wholesaler scoping (cross-tenant by design)
 * PATCH /api/admin/customers/:id/flag                        ✅ admin-only; is_suspicious flag
 * POST /api/admin/subscriptions/activate                     ✅ admin-only; validates user before mutating
 * POST /api/admin/subscriptions/sync-by-customer             ✅ admin-only; validates user before mutating
 * GET  /api/admin/stock-reconcile                            ✅ admin-only; cross-tenant read, intentional
 * POST /api/admin/subscriptions/backfill-stripe              ✅ admin-only; bulk backfill
 */
import type { Express } from "express";
import Stripe from "stripe";
import { ilike, isNotNull } from "drizzle-orm";
import {
  ADMIN_EMAILS, and, asc, count, db, desc, eq, geocodePostcode, getAdminEmail, getPlanLimits, getStripeClient,
  gte, inArray, isNull, lte, or, orders, requireAuth, sql, storage,
  subscriptionAuditLogs, subscriptionPlans, SubscriptionService, teamMembers, unlockForUpgrade, userSubscriptions, users,
} from "./shared";
import { getProductLimit } from "../utils/plan-tier";
import { sendWholesalerSuspendedEmail, sendWholesalerReinstatedEmail } from "../sendgrid-service";

export function registerAdminCoreRoutes(app: Express): void {
  // GET /api/admin/platform-stats
  app.get('/api/admin/platform-stats', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      // Compute midnight Europe/London as a UTC timestamp (handles BST +1 and GMT +0 automatically)
      const todayStart = (() => {
        const ukDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
        const refUTC = new Date(ukDate + 'T00:00:00Z');
        const ukH = +new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(refUTC);
        return new Date(refUTC.getTime() - ukH * 3_600_000);
      })();

      const [allWholesalers, allOrdersData, newWholesalers, planRows, subPlanRows] = await Promise.all([
        db.select({ id: users.id, subscriptionTier: users.subscriptionTier, archived: users.archived, subscriptionStatus: users.subscriptionStatus, showOnHomepage: users.showOnHomepage })
          .from(users).where(and(eq(users.role, 'wholesaler'), eq(users.isTestAccount, false), eq(users.isInactive, false))),
        db.select({
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
          status: orders.status,
          createdAt: orders.createdAt,
        }).from(orders)
          .innerJoin(users, eq(orders.wholesalerId, users.id))
          .where(and(eq(users.isTestAccount, false), eq(users.isInactive, false), isNotNull(orders.orderNumber))),
        db.select({ count: count() }).from(users)
          .where(and(eq(users.role, 'wholesaler'), gte(users.createdAt, monthStart), eq(users.isTestAccount, false), eq(users.isInactive, false))),
        db.select({ planId: subscriptionPlans.planId, monthlyPrice: subscriptionPlans.monthlyPrice, billingInterval: subscriptionPlans.billingInterval })
          .from(subscriptionPlans),
        db.select({ userId: userSubscriptions.userId, planId: userSubscriptions.planId })
          .from(userSubscriptions)
          .where(sql`${userSubscriptions.status} IN ('active','trialing','past_due')`),
      ]);

      // Map userId → exact planId from active subscription record
      const subPlanMap: Record<string, string> = {};
      for (const s of subPlanRows) { if (s.userId) subPlanMap[s.userId] = s.planId; }

      // Effective monthly revenue per plan — annual plans divided by 12 for MRR
      const PLAN_MRR: Record<string, number> = { free: 0 };
      for (const p of planRows) {
        const price = parseFloat(p.monthlyPrice as string) || 0;
        PLAN_MRR[p.planId] = p.billingInterval === 'yearly' ? price / 12 : price;
      }

      const totalWholesalers = allWholesalers.length;
      const activeWholesalers = allWholesalers.filter(w => !w.archived).length;
      const suspendedWholesalers = allWholesalers.filter(w => w.archived).length;
      const homepageFeaturedWholesalers = allWholesalers.filter(w => w.showOnHomepage).length;
      const wholesalersByPlan = {
        listing:  allWholesalers.filter(w => !w.subscriptionTier || w.subscriptionTier === 'free' || w.subscriptionTier === 'listing' || w.subscriptionTier?.startsWith('listing_')).length,
        starter:  allWholesalers.filter(w => w.subscriptionTier === 'starter' || w.subscriptionTier?.startsWith('starter_')).length,
        standard: allWholesalers.filter(w => w.subscriptionTier === 'standard' || w.subscriptionTier?.startsWith('standard_')).length,
        premium:  allWholesalers.filter(w => w.subscriptionTier === 'premium'  || w.subscriptionTier?.startsWith('premium_')).length,
      };

      // Sum MRR using each wholesaler's exact planId from userSubscriptions (captures custom pricing)
      // Fall back to subscriptionTier if no subscription record exists
      let starterCount = 0, listingCount = 0, standardCount = 0, premiumCount = 0;
      let starterMRR = 0, listingMRR = 0, standardMRR = 0, premiumMRR = 0;
      for (const w of allWholesalers) {
        if (w.archived) continue;
        const tier = w.subscriptionTier || 'free';
        const exactPlanId = subPlanMap[w.id] ?? tier;
        const mrrContrib = PLAN_MRR[exactPlanId] ?? PLAN_MRR[tier] ?? 0;
        if (!tier || tier === 'free' || tier === 'listing' || tier.startsWith('listing_')) {
          listingCount++; listingMRR += mrrContrib;
        } else if (tier === 'starter' || tier.startsWith('starter_')) {
          starterCount++; starterMRR += mrrContrib;
        } else if (tier === 'standard' || tier.startsWith('standard_')) {
          standardCount++; standardMRR += mrrContrib;
        } else if (tier === 'premium' || tier.startsWith('premium_')) {
          premiumCount++; premiumMRR += mrrContrib;
        }
      }
      const subscriptionMRR = starterMRR + listingMRR + standardMRR + premiumMRR;
      const subscriptionBreakdown = {
        starter:  { count: starterCount,  mrr: starterMRR  },
        listing:  { count: listingCount,  mrr: listingMRR  },
        standard: { count: standardCount, mrr: standardMRR },
        premium:  { count: premiumCount,  mrr: premiumMRR  },
      };

      let totalGMV = 0, totalCustomerFees = 0, totalPlatformFees = 0;
      let totalOrders = 0, cancelledOrders = 0, completedOrders = 0;
      let ordersThisMonth = 0, cancelledOrdersThisMonth = 0, completedOrdersThisMonth = 0;
      let todayOrders = 0, todayRevenue = 0;

      for (const o of allOrdersData) {
        const isCancelled = o.status === 'cancelled';
        const createdAt = o.createdAt ? new Date(o.createdAt) : null;
        const isThisMonth = createdAt && createdAt >= monthStart;
        const isToday = createdAt && createdAt >= todayStart;

        totalOrders++;
        if (isCancelled) cancelledOrders++; else completedOrders++;
        if (isThisMonth) { ordersThisMonth++; if (isCancelled) cancelledOrdersThisMonth++; else completedOrdersThisMonth++; }
        if (isToday) { todayOrders++; }

        if (!isCancelled) {
          totalGMV += parseFloat(o.subtotal || '0');
          totalCustomerFees += parseFloat(o.customerTransactionFee || '0');
          totalPlatformFees += parseFloat(o.platformFee || '0');
          if (isToday) todayRevenue += parseFloat(o.subtotal || '0');
        }
      }

      res.json({
        totalWholesalers, activeWholesalers, suspendedWholesalers, homepageFeaturedWholesalers, wholesalersByPlan,
        totalOrders, completedOrders, cancelledOrders, ordersThisMonth,
        completedOrdersThisMonth, cancelledOrdersThisMonth, todayOrders, todayRevenue,
        totalGMV, totalCustomerFees, totalPlatformFees,
        totalGrossRevenue: totalCustomerFees + totalPlatformFees,
        newWholesalersThisMonth: Number(newWholesalers[0]?.count || 0),
        subscriptionRevenueMRR: subscriptionMRR,
        subscriptionBreakdown,
      });
    } catch (error) {
      console.error('Admin platform-stats error:', error);
      res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
  });

  // GET /api/admin/wholesalers
  app.get('/api/admin/wholesalers', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const wholesalersList = await db.select().from(users).where(eq(users.role, 'wholesaler')).orderBy(desc(users.createdAt)).limit(500);
      const wholesalerIds = wholesalersList.map(w => w.id);

      let subscriptionByWholesaler: Record<string, { isCustomPricing: boolean | null; internalNote: string | null; customPriceExpiresAt: Date | null }> = {};
      if (wholesalerIds.length > 0) {
        const subs = await db.select({
          userId: userSubscriptions.userId,
          isCustomPricing: userSubscriptions.isCustomPricing,
          internalNote: userSubscriptions.internalNote,
          customPriceExpiresAt: userSubscriptions.customPriceExpiresAt,
        }).from(userSubscriptions).where(inArray(userSubscriptions.userId, wholesalerIds));
        for (const s of subs) {
          subscriptionByWholesaler[s.userId] = {
            isCustomPricing: s.isCustomPricing ?? false,
            internalNote: s.internalNote,
            customPriceExpiresAt: s.customPriceExpiresAt,
          };
        }
      }

      let ordersByWholesaler: Record<string, { count: number; cancelledCount: number; gmv: number; gmvWithFees: number; gmvWithoutFees: number; customerFees: number; platformFees: number; lastOrderAt: Date | null }> = {};
      let teamMemberLastLoginByWholesaler: Record<string, Date | null> = {};

      if (wholesalerIds.length > 0) {
        const teamMemberLogins = await db.select({
          wholesalerId: teamMembers.wholesalerId,
          maxLastLoginAt: sql<string | null>`max(${teamMembers.lastLoginAt})`,
        }).from(teamMembers)
          .where(inArray(teamMembers.wholesalerId, wholesalerIds))
          .groupBy(teamMembers.wholesalerId);

        for (const row of teamMemberLogins) {
          teamMemberLastLoginByWholesaler[row.wholesalerId] = row.maxLastLoginAt ? new Date(row.maxLastLoginAt) : null;
        }

        const orderStats = await db.select({
          wholesalerId: orders.wholesalerId,
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
          createdAt: orders.createdAt,
          status: orders.status,
        }).from(orders).where(inArray(orders.wholesalerId, wholesalerIds));

        for (const o of orderStats) {
          const wid = o.wholesalerId;
          if (!ordersByWholesaler[wid]) ordersByWholesaler[wid] = { count: 0, cancelledCount: 0, gmv: 0, gmvWithFees: 0, gmvWithoutFees: 0, customerFees: 0, platformFees: 0, lastOrderAt: null };
          const oDate = o.createdAt ? new Date(o.createdAt) : null;
          if (oDate && (!ordersByWholesaler[wid].lastOrderAt || oDate > ordersByWholesaler[wid].lastOrderAt!)) {
            ordersByWholesaler[wid].lastOrderAt = oDate;
          }
          if (o.status === 'cancelled') {
            ordersByWholesaler[wid].cancelledCount++;
            continue;
          }
          const subtotal = parseFloat(o.subtotal || '0');
          const custFee = parseFloat(o.customerTransactionFee || '0');
          const platFee = parseFloat(o.platformFee || '0');
          const hasFees = (custFee + platFee) > 0;
          ordersByWholesaler[wid].count++;
          ordersByWholesaler[wid].gmv += subtotal;
          ordersByWholesaler[wid].gmvWithFees += hasFees ? subtotal : 0;
          ordersByWholesaler[wid].gmvWithoutFees += hasFees ? 0 : subtotal;
          ordersByWholesaler[wid].customerFees += custFee;
          ordersByWholesaler[wid].platformFees += platFee;
        }
      }

      const result = wholesalersList.map(w => {
        const stats = ordersByWholesaler[w.id] || { count: 0, cancelledCount: 0, gmv: 0, gmvWithFees: 0, gmvWithoutFees: 0, customerFees: 0, platformFees: 0, lastOrderAt: null };
        const totalOrderCount = stats.count + stats.cancelledCount;
        const cancellationRate = totalOrderCount > 0 ? Math.round((stats.cancelledCount / totalOrderCount) * 100) : 0;
        return {
          id: w.id, email: w.email, firstName: w.firstName, lastName: w.lastName,
          businessName: w.businessName, phoneNumber: w.phoneNumber,
          subscriptionTier: w.subscriptionTier || 'free',
          currentPlan: w.currentPlan || w.subscriptionTier || 'free',
          stripeSubscriptionId: w.stripeSubscriptionId || null,
          createdAt: w.createdAt, archived: w.archived,
          orderCount: stats.count, cancelledCount: stats.cancelledCount,
          totalOrderCount, cancellationRate,
          totalGMV: stats.gmv, gmvWithFees: stats.gmvWithFees, gmvWithoutFees: stats.gmvWithoutFees,
          customerFeesEarned: stats.customerFees, platformFeesEarned: stats.platformFees,
          totalFeesEarned: stats.customerFees + stats.platformFees,
          lastOrderAt: stats.lastOrderAt,
          customFeePercentage: w.customFeePercentage !== null && w.customFeePercentage !== undefined
            ? parseFloat(w.customFeePercentage) : null,
          customerFeePercentage: w.customerFeePercentage !== null && w.customerFeePercentage !== undefined
            ? parseFloat(w.customerFeePercentage) : null,
          customerFixedFee: w.customerFixedFee !== null && w.customerFixedFee !== undefined
            ? parseFloat(w.customerFixedFee) : null,
          isTestAccount: w.isTestAccount ?? false,
          isInactive: w.isInactive ?? false,
          lastLoginAt: (() => {
            const ownerLogin = w.lastLoginAt ? new Date(w.lastLoginAt) : null;
            const teamLogin = teamMemberLastLoginByWholesaler[w.id] ?? null;
            const candidates = [ownerLogin, teamLogin].filter(Boolean) as Date[];
            if (candidates.length === 0) return null;
            return candidates.reduce((a, b) => (a > b ? a : b));
          })(),
          lastSeenAt: w.lastSeenAt ?? null,
          lastRealUserActivityAt: w.lastRealUserActivityAt ?? null,
          enableMultiProfile: w.enableMultiProfile ?? false,
          showOnHomepage: w.showOnHomepage ?? false,
          legalBusinessName: w.legalBusinessName ?? null,
          vatNumber: w.vatNumber ?? null,
          companyRegistrationNumber: w.companyRegistrationNumber ?? null,
          isCustomPricing: subscriptionByWholesaler[w.id]?.isCustomPricing ?? false,
          internalNote: subscriptionByWholesaler[w.id]?.internalNote ?? null,
          customPriceExpiresAt: subscriptionByWholesaler[w.id]?.customPriceExpiresAt ?? null,
          logoUrl: w.logoUrl ?? null,
          customMonthlyPrice: w.customMonthlyPrice !== null && w.customMonthlyPrice !== undefined ? parseFloat(w.customMonthlyPrice) : null,
          customAnnualPrice: w.customAnnualPrice !== null && w.customAnnualPrice !== undefined ? parseFloat(w.customAnnualPrice) : null,
          customPricePlanId: (w as any).customPricePlanId ?? null,
          customPricePlanIdAnnual: (w as any).customPricePlanIdAnnual ?? null,
          customPricePlanIdMonthly: (w as any).customPricePlanIdMonthly ?? null,
          isVerified: w.isVerified ?? false,
          verifiedAt: w.verifiedAt ?? null,
          verifiedBy: w.verifiedBy ?? null,
          verificationNotes: w.verificationNotes ?? null,
        };
      }).sort((a, b) => {
        if (a.isTestAccount !== b.isTestAccount) return a.isTestAccount ? 1 : -1;
        if (a.isInactive !== b.isInactive) return a.isInactive ? 1 : -1;
        return b.totalFeesEarned - a.totalFeesEarned;
      });

      res.json(result);
    } catch (error) {
      console.error('Admin wholesalers error:', error);
      res.status(500).json({ error: 'Failed to fetch wholesalers' });
    }
  });

  // GET /api/admin/revenue
  app.get('/api/admin/revenue', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { from, to, wholesalerId: filterWholesalerId } = req.query as Record<string, string>;
      const toDate = to ? new Date(to) : null;
      if (toDate) toDate.setHours(23, 59, 59, 999);

      const recentOrders = await db
        .select({
          id: orders.id, orderNumber: orders.orderNumber, wholesalerId: orders.wholesalerId,
          wholesalerName: users.businessName, customerName: orders.customerName,
          subtotal: orders.subtotal, customerTransactionFee: orders.customerTransactionFee,
          platformFee: orders.platformFee, total: orders.total, status: orders.status,
          paymentStatus: orders.paymentStatus, createdAt: orders.createdAt,
          stripeActualFee: orders.stripeActualFee, paymentMethod: orders.paymentMethod,
          refundedAt: orders.refundedAt, amountRefunded: orders.amountRefunded,
        })
        .from(orders)
        .innerJoin(users, eq(orders.wholesalerId, users.id))
        .where(and(
          eq(users.isTestAccount, false),
          eq(users.isInactive, false),
          from ? gte(orders.createdAt, new Date(from)) : undefined,
          toDate ? lte(orders.createdAt, toDate) : undefined,
          filterWholesalerId ? eq(orders.wholesalerId, filterWholesalerId) : undefined,
        ))
        .orderBy(desc(orders.createdAt))
        .limit(1000);

      let totalCustomerFees = 0, totalPlatformFees = 0, totalGMV = 0, totalStripeProcessingFees = 0;
      const processedOrders = recentOrders.map(o => {
        const custFee = parseFloat(o.customerTransactionFee || '0');
        const platFee = parseFloat(o.platformFee || '0');
        const sub = parseFloat(o.subtotal || '0');
        const isCancelled = o.status === 'cancelled';
        const stripePaymentMethods = ['card', 'payment_link'];
        const isStripePayment = stripePaymentMethods.includes(o.paymentMethod ?? '');
        const actualFee = o.stripeActualFee != null ? parseFloat(o.stripeActualFee) : null;
        const stripeFeIsEstimated = isStripePayment && actualFee === null && !isCancelled;
        const stripeFee = isCancelled || !isStripePayment ? 0 : (actualFee ?? parseFloat(((sub + custFee) * 0.014 + 0.20).toFixed(2)));
        const grossProfit = isCancelled ? 0 : parseFloat((custFee + platFee - stripeFee).toFixed(2));
        if (!isCancelled) {
          totalCustomerFees += custFee;
          totalPlatformFees += platFee;
          totalGMV += sub;
          totalStripeProcessingFees += stripeFee;
        }
        return {
          ...o, customerTransactionFee: custFee, platformFee: platFee, subtotal: sub,
          totalQuikpikIncome: isCancelled ? 0 : custFee + platFee,
          stripeProcessingFee: stripeFee, stripeFeIsEstimated, grossProfit,
        };
      });

      const totalGrossRevenue = totalCustomerFees + totalPlatformFees;
      const totalGrossProfit = parseFloat((totalGrossRevenue - totalStripeProcessingFees).toFixed(2));
      const grossMarginPct = totalGrossRevenue > 0
        ? parseFloat(((totalGrossProfit / totalGrossRevenue) * 100).toFixed(1)) : 0;

      const subPaymentConditions = [
        eq(subscriptionAuditLogs.eventType, 'payment_success'),
        ...(from ? [gte(subscriptionAuditLogs.timestamp, new Date(from))] : []),
        ...(toDate ? [lte(subscriptionAuditLogs.timestamp, toDate)] : []),
        ...(filterWholesalerId ? [eq(subscriptionAuditLogs.userId, filterWholesalerId)] : []),
      ];
      const subPayments = await db
        .select({ amount: subscriptionAuditLogs.amount, userId: subscriptionAuditLogs.userId })
        .from(subscriptionAuditLogs)
        .where(and(...subPaymentConditions));
      const totalSubscriptionRevenue = parseFloat(
        subPayments.reduce((s, p) => s + parseFloat(p.amount ?? '0'), 0).toFixed(2)
      );
      const subscriptionPaymentCount = subPayments.length;

      const subRevenueByWholesaler: Record<string, number> = {};
      for (const p of subPayments) {
        if (!p.userId) continue;
        subRevenueByWholesaler[p.userId] = parseFloat(
          ((subRevenueByWholesaler[p.userId] ?? 0) + parseFloat(p.amount ?? '0')).toFixed(2)
        );
      }

      res.json({
        orders: processedOrders,
        totals: {
          totalCustomerFees, totalPlatformFees, totalGrossRevenue, totalGMV,
          totalStripeProcessingFees: parseFloat(totalStripeProcessingFees.toFixed(2)),
          totalGrossProfit, grossMarginPct,
          totalSubscriptionRevenue, subscriptionPaymentCount,
        },
        subRevenueByWholesaler,
      });
    } catch (error) {
      console.error('Admin revenue error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue data' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/customer-fee-override
  // Sets or clears the per-wholesaler customer fee override.
  // Body: { customerFeePercentage: number | null, customerFixedFee: number | null }
  // customerFeePercentage is supplied as a human-friendly % (e.g. 2.0 for 2%) and stored as a decimal rate (0.0200).
  app.patch('/api/admin/wholesalers/:id/customer-fee-override', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const [targetUser] = await db.select({ id: users.id, role: users.role })
        .from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') return res.status(404).json({ error: 'Wholesaler not found' });

      const { customerFeePercentage, customerFixedFee } = req.body as {
        customerFeePercentage: number | null;
        customerFixedFee: number | null;
      };

      if (customerFeePercentage !== null && customerFeePercentage !== undefined) {
        if (typeof customerFeePercentage !== 'number' || customerFeePercentage < 0 || customerFeePercentage > 100) {
          return res.status(400).json({ error: 'customerFeePercentage must be a number between 0 and 100' });
        }
      }
      if (customerFixedFee !== null && customerFixedFee !== undefined) {
        if (typeof customerFixedFee !== 'number' || customerFixedFee < 0 || customerFixedFee > 99) {
          return res.status(400).json({ error: 'customerFixedFee must be a number between 0 and 99' });
        }
      }

      // Convert human-friendly % to decimal rate for storage (e.g. 2.0 → "0.0200")
      const pctValue = customerFeePercentage !== null && customerFeePercentage !== undefined
        ? (customerFeePercentage / 100).toFixed(4)
        : null;
      const fixedValue = customerFixedFee !== null && customerFixedFee !== undefined
        ? customerFixedFee.toFixed(2)
        : null;

      await db.update(users)
        .set({ customerFeePercentage: pctValue, customerFixedFee: fixedValue })
        .where(eq(users.id, req.params.id));

      res.json({
        id: req.params.id,
        customerFeePercentage: pctValue !== null ? parseFloat(pctValue) : null,
        customerFixedFee: fixedValue !== null ? parseFloat(fixedValue) : null,
      });
    } catch (error) {
      console.error('Admin customer-fee-override error:', error);
      res.status(500).json({ error: 'Failed to update customer fee override' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/custom-pricing
  // Sets or clears per-wholesaler custom subscription prices.
  // Body: { customMonthlyPrice: number | null, customAnnualPrice: number | null,
  //         customPricePlanIdAnnual: string | null, customPricePlanIdMonthly: string | null }
  // Legacy field customPricePlanId still accepted for backward compat.
  app.patch('/api/admin/wholesalers/:id/custom-pricing', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const [targetUser] = await db.select({ id: users.id, role: users.role })
        .from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') return res.status(404).json({ error: 'Wholesaler not found' });

      const body = req.body as Record<string, unknown>;

      // True partial patch — only update fields explicitly present in the request body.
      let newMonthly: string | null | undefined = undefined;
      let newAnnual: string | null | undefined = undefined;
      let newPlanIdAnnual: string | null | undefined = undefined;
      let newPlanIdMonthly: string | null | undefined = undefined;

      if ('customMonthlyPrice' in body) {
        const val = body.customMonthlyPrice;
        if (val !== null) {
          if (typeof val !== 'number' || val < 0 || val > 99999) {
            return res.status(400).json({ error: 'customMonthlyPrice must be a number between 0 and 99999' });
          }
          newMonthly = (val as number).toFixed(2);
        } else {
          newMonthly = null;
        }
      }

      if ('customAnnualPrice' in body) {
        const val = body.customAnnualPrice;
        if (val !== null) {
          if (typeof val !== 'number' || val < 0 || val > 99999) {
            return res.status(400).json({ error: 'customAnnualPrice must be a number between 0 and 99999' });
          }
          newAnnual = (val as number).toFixed(2);
        } else {
          newAnnual = null;
        }
      }

      if ('customPricePlanIdAnnual' in body) {
        const val = body.customPricePlanIdAnnual;
        newPlanIdAnnual = (val === null || val === '') ? null : String(val);
      }

      if ('customPricePlanIdMonthly' in body) {
        const val = body.customPricePlanIdMonthly;
        newPlanIdMonthly = (val === null || val === '') ? null : String(val);
      }

      // Legacy backward-compat: accept the old single customPricePlanId field and map it
      // to the correct split field based on the plan's billing_interval.
      if ('customPricePlanId' in body && newPlanIdAnnual === undefined && newPlanIdMonthly === undefined) {
        const val = body.customPricePlanId;
        const legacyPlanId = (val === null || val === '') ? null : String(val);
        if (legacyPlanId) {
          const [planRow] = await db.select({ billingInterval: subscriptionPlans.billingInterval })
            .from(subscriptionPlans).where(eq(subscriptionPlans.planId, legacyPlanId)).limit(1);
          if (planRow?.billingInterval === 'yearly') {
            newPlanIdAnnual = legacyPlanId;
          } else {
            newPlanIdMonthly = legacyPlanId;
          }
        } else {
          // Clearing legacy field — clear both split fields
          newPlanIdAnnual = newPlanIdAnnual ?? null;
          newPlanIdMonthly = newPlanIdMonthly ?? null;
        }
      }

      if (newMonthly === undefined && newAnnual === undefined && newPlanIdAnnual === undefined && newPlanIdMonthly === undefined) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      const [currentRow] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);

      // Validate plan bindings: if a price is being set it must have a plan tied to it
      const effectiveAnnualPlanId = newPlanIdAnnual !== undefined ? newPlanIdAnnual : (currentRow as any)?.customPricePlanIdAnnual ?? null;
      const effectiveMonthlyPlanId = newPlanIdMonthly !== undefined ? newPlanIdMonthly : (currentRow as any)?.customPricePlanIdMonthly ?? null;
      const effectiveAnnual = newAnnual !== undefined ? newAnnual : (currentRow as any)?.customAnnualPrice ?? null;
      const effectiveMonthly = newMonthly !== undefined ? newMonthly : (currentRow as any)?.customMonthlyPrice ?? null;
      if (effectiveAnnual !== null && !effectiveAnnualPlanId) {
        return res.status(400).json({ error: 'An annual plan must be selected when setting a custom annual price' });
      }
      if (effectiveMonthly !== null && !effectiveMonthlyPlanId) {
        return res.status(400).json({ error: 'A monthly plan must be selected when setting a custom monthly price' });
      }

      const setPayload: Partial<typeof users.$inferInsert> = {};
      if (newMonthly !== undefined) (setPayload as any).customMonthlyPrice = newMonthly;
      if (newAnnual !== undefined) (setPayload as any).customAnnualPrice = newAnnual;
      if (newPlanIdAnnual !== undefined) (setPayload as any).customPricePlanIdAnnual = newPlanIdAnnual;
      if (newPlanIdMonthly !== undefined) (setPayload as any).customPricePlanIdMonthly = newPlanIdMonthly;

      await db.update(users).set(setPayload).where(eq(users.id, req.params.id));

      const [updatedRow] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);

      res.json({
        id: req.params.id,
        customMonthlyPrice: (updatedRow as any)?.customMonthlyPrice !== null && (updatedRow as any)?.customMonthlyPrice !== undefined
          ? parseFloat((updatedRow as any).customMonthlyPrice) : null,
        customAnnualPrice: (updatedRow as any)?.customAnnualPrice !== null && (updatedRow as any)?.customAnnualPrice !== undefined
          ? parseFloat((updatedRow as any).customAnnualPrice) : null,
        customPricePlanIdAnnual: (updatedRow as any)?.customPricePlanIdAnnual ?? null,
        customPricePlanIdMonthly: (updatedRow as any)?.customPricePlanIdMonthly ?? null,
      });
    } catch (error) {
      console.error('Admin custom-pricing error:', error);
      res.status(500).json({ error: 'Failed to update custom subscription pricing' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/toggle-status
  app.patch('/api/admin/wholesalers/:id/toggle-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const newArchived = !targetUser.archived;
      await db.update(users).set({ archived: newArchived }).where(eq(users.id, req.params.id));
      const wholesalerEmail = targetUser.email;
      const wholesalerName = targetUser.businessName || targetUser.email || 'Wholesaler';
      if (wholesalerEmail) {
        if (newArchived) {
          sendWholesalerSuspendedEmail({ wholesalerEmail, wholesalerName }).catch((err: any) =>
            console.error('[admin] Failed to send suspension email:', err)
          );
        } else {
          sendWholesalerReinstatedEmail({ wholesalerEmail, wholesalerName }).catch((err: any) =>
            console.error('[admin] Failed to send reinstatement email:', err)
          );
        }
      }
      res.json({ id: req.params.id, archived: newArchived, businessName: targetUser.businessName });
    } catch (error) {
      console.error('Admin toggle-status error:', error);
      res.status(500).json({ error: 'Failed to toggle status' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/toggle-test-account
  app.patch('/api/admin/wholesalers/:id/toggle-test-account', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const newValue = !targetUser.isTestAccount;
      await db.update(users).set({ isTestAccount: newValue }).where(eq(users.id, req.params.id));
      console.log(`[admin] isTestAccount toggled to ${newValue} for ${targetUser.email}`);
      res.json({ id: req.params.id, isTestAccount: newValue, businessName: targetUser.businessName });
    } catch (error) {
      console.error('Admin toggle-test-account error:', error);
      res.status(500).json({ error: 'Failed to toggle test account status' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/toggle-inactive
  app.patch('/api/admin/wholesalers/:id/toggle-inactive', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const newValue = !targetUser.isInactive;
      await db.update(users).set({ isInactive: newValue }).where(eq(users.id, req.params.id));
      console.log(`[admin] isInactive toggled to ${newValue} for ${targetUser.email}`);
      res.json({ id: req.params.id, isInactive: newValue, businessName: targetUser.businessName });
    } catch (error) {
      console.error('Admin toggle-inactive error:', error);
      res.status(500).json({ error: 'Failed to toggle inactive status' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/toggle-show-on-homepage
  app.patch('/api/admin/wholesalers/:id/toggle-show-on-homepage', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const newValue = !targetUser.showOnHomepage;
      await db.update(users).set({ showOnHomepage: newValue }).where(eq(users.id, req.params.id));
      console.log(`[admin] showOnHomepage toggled to ${newValue} for ${targetUser.email}`);
      res.json({ id: req.params.id, showOnHomepage: newValue });
    } catch (error) {
      console.error('Admin toggle-show-on-homepage error:', error);
      res.status(500).json({ error: 'Failed to toggle homepage visibility' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/verify  — explicit set/unset with optional notes
  app.patch('/api/admin/wholesalers/:id/verify', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { verified, notes } = req.body as { verified: boolean; notes?: string };
      if (typeof verified !== 'boolean') return res.status(400).json({ error: 'verified (boolean) is required' });
      const [targetUser] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser || targetUser.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const adminEmail = getAdminEmail(req) || req.user?.email || '';
      await db.update(users).set({
        isVerified: verified,
        verifiedAt: verified ? new Date() : null,
        verifiedBy: verified ? adminEmail : null,
        verificationNotes: verified ? (notes ?? null) : null,
      }).where(eq(users.id, req.params.id));
      console.log(`[admin] isVerified set to ${verified} for ${targetUser.email} by ${adminEmail}`);
      const now = new Date();
      res.json({
        id: req.params.id,
        isVerified: verified,
        verifiedAt: verified ? now.toISOString() : null,
        verifiedBy: verified ? adminEmail : null,
        verificationNotes: verified ? (notes ?? null) : null,
      });
    } catch (error) {
      console.error('Admin verify error:', error);
      res.status(500).json({ error: 'Failed to update verified status' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/custom-subscription-pricing
  app.patch('/api/admin/wholesalers/:id/custom-subscription-pricing', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { customAnnualPrice, customMonthlyPrice } = req.body as { customAnnualPrice: number | null; customMonthlyPrice: number | null };
      if (customAnnualPrice !== null && customAnnualPrice !== undefined) {
        if (typeof customAnnualPrice !== 'number' || customAnnualPrice <= 0) {
          return res.status(400).json({ error: 'Annual price must be a positive number' });
        }
      }
      if (customMonthlyPrice !== null && customMonthlyPrice !== undefined) {
        if (typeof customMonthlyPrice !== 'number' || customMonthlyPrice <= 0) {
          return res.status(400).json({ error: 'Monthly price must be a positive number' });
        }
      }
      const [updated] = await db
        .update(users)
        .set({
          customAnnualPrice: customAnnualPrice !== null && customAnnualPrice !== undefined ? customAnnualPrice.toFixed(2) : null,
          customMonthlyPrice: customMonthlyPrice !== null && customMonthlyPrice !== undefined ? customMonthlyPrice.toFixed(2) : null,
        })
        .where(and(eq(users.id, req.params.id), eq(users.role, 'wholesaler')))
        .returning({ id: users.id, customAnnualPrice: users.customAnnualPrice, customMonthlyPrice: users.customMonthlyPrice });
      if (!updated) return res.status(404).json({ error: 'Wholesaler not found' });
      res.json({
        id: updated.id,
        customAnnualPrice: updated.customAnnualPrice !== null ? parseFloat(updated.customAnnualPrice) : null,
        customMonthlyPrice: updated.customMonthlyPrice !== null ? parseFloat(updated.customMonthlyPrice) : null,
      });
    } catch (error) {
      console.error('Admin set-custom-subscription-pricing error:', error);
      res.status(500).json({ error: 'Failed to update custom subscription pricing' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/custom-fee
  app.patch('/api/admin/wholesalers/:id/custom-fee', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { customFeePercentage } = req.body as { customFeePercentage: number | null };
      if (customFeePercentage !== null) {
        if (typeof customFeePercentage !== 'number' || customFeePercentage < 0 || customFeePercentage > 100) {
          return res.status(400).json({ error: 'Fee must be a number between 0 and 100' });
        }
      }
      const [updated] = await db
        .update(users)
        .set({ customFeePercentage: customFeePercentage !== null ? customFeePercentage.toFixed(2) : null })
        .where(and(eq(users.id, req.params.id), eq(users.role, 'wholesaler')))
        .returning({ id: users.id, customFeePercentage: users.customFeePercentage });
      if (!updated) return res.status(404).json({ error: 'Wholesaler not found' });
      res.json({ id: updated.id, customFeePercentage: updated.customFeePercentage });
    } catch (error) {
      console.error('Admin set-custom-fee error:', error);
      res.status(500).json({ error: 'Failed to update custom fee' });
    }
  });

  // GET /api/admin/customers/map
  app.get('/api/admin/customers/map', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const customers = await db
        .select({
          id: users.id, firstName: users.firstName, lastName: users.lastName,
          businessName: users.businessName, phoneNumber: users.phoneNumber,
          postalCode: users.postalCode, customerType: users.customerType, role: users.role,
          latitude: users.latitude, longitude: users.longitude, geocodeStatus: users.geocodeStatus,
          wholesalerId: users.wholesalerId, createdAt: users.createdAt,
        })
        .from(users)
        .where(inArray(users.role, ['customer', 'retailer', 'wholesaler']))
        .orderBy(desc(users.createdAt));

      const customerIds = customers.map(c => c.id);
      let orderCountMap: Record<string, number> = {};
      if (customerIds.length > 0) {
        const counts = await db
          .select({ retailerId: orders.retailerId, count: count() })
          .from(orders).where(inArray(orders.retailerId, customerIds)).groupBy(orders.retailerId);
        for (const row of counts) {
          if (row.retailerId) orderCountMap[row.retailerId] = Number(row.count);
        }
      }

      const wholesalerIds = Array.from(new Set(customers.map(c => c.wholesalerId).filter(Boolean))) as string[];
      let wholesalerMap: Record<string, string> = {};
      if (wholesalerIds.length > 0) {
        const ws = await db
          .select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, wholesalerIds));
        for (const w of ws) {
          wholesalerMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';
        }
      }

      const deriveType = (role: string, customerType: string | null): string | null => {
        if (customerType) return customerType;
        if (role === 'wholesaler') return 'wholesale';
        if (role === 'retailer') return 'retail';
        return 'individual';
      };

      const result = customers.map(c => ({
        id: c.id,
        name: c.businessName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        businessName: c.businessName, phoneNumber: c.phoneNumber, postalCode: c.postalCode,
        customerType: deriveType(c.role, c.customerType), role: c.role,
        latitude: c.latitude != null ? parseFloat(String(c.latitude)) : null,
        longitude: c.longitude != null ? parseFloat(String(c.longitude)) : null,
        geocodeStatus: c.geocodeStatus,
        wholesalerName: c.wholesalerId ? (wholesalerMap[c.wholesalerId] || 'Unknown') : 'No wholesaler',
        orderCount: orderCountMap[c.id] || 0,
      }));

      res.json({ customers: result });
    } catch (error) {
      console.error('Admin customers/map error:', error);
      res.status(500).json({ error: 'Failed to fetch customer map data' });
    }
  });

  // PATCH /api/admin/customers/:id/type
  app.patch('/api/admin/customers/:id/type', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { customerType, postalCode } = req.body;
      const validTypes = ['retail', 'wholesale', 'individual', null, ''];
      if (customerType !== undefined && !validTypes.includes(customerType)) {
        return res.status(400).json({ error: 'Invalid customer type. Must be retail, wholesale, or individual.' });
      }

      const target = await db
        .select({ id: users.id, role: users.role }).from(users)
        .where(eq(users.id, req.params.id)).limit(1);
      if (!target[0]) return res.status(404).json({ error: 'Customer not found' });
      if (!['customer', 'retailer', 'wholesaler'].includes(target[0].role)) return res.status(400).json({ error: 'Target user is not a customer' });

      const updateData: Record<string, string | null> = {};
      if (customerType !== undefined) updateData.customerType = customerType || null;

      if (postalCode !== undefined) {
        updateData.postalCode = postalCode || null;
        if (!postalCode) {
          updateData.latitude = null;
          updateData.longitude = null;
          updateData.geocodeStatus = 'flagged';
        } else {
          const coords = await geocodePostcode(postalCode);
          if (coords) {
            updateData.latitude = coords.lat.toString();
            updateData.longitude = coords.lng.toString();
            updateData.geocodeStatus = 'success';
          } else {
            updateData.latitude = null;
            updateData.longitude = null;
            updateData.geocodeStatus = 'flagged';
          }
        }
      } else {
        const existing = await db
          .select({ postalCode: users.postalCode, geocodeStatus: users.geocodeStatus })
          .from(users).where(eq(users.id, req.params.id)).limit(1);
        const existingPostcode = existing[0]?.postalCode;
        const alreadyGeocoded = existing[0]?.geocodeStatus === 'success';

        if (existingPostcode && !alreadyGeocoded) {
          const coords = await geocodePostcode(existingPostcode);
          if (coords) {
            updateData.latitude = coords.lat.toString();
            updateData.longitude = coords.lng.toString();
            updateData.geocodeStatus = 'success';
          } else {
            updateData.latitude = null;
            updateData.longitude = null;
            updateData.geocodeStatus = 'flagged';
          }
        }
      }

      await db.update(users).set(updateData).where(eq(users.id, req.params.id));

      const updated = await db.select({
        id: users.id, customerType: users.customerType, postalCode: users.postalCode,
        latitude: users.latitude, longitude: users.longitude, geocodeStatus: users.geocodeStatus,
      }).from(users).where(eq(users.id, req.params.id)).limit(1);

      res.json(updated[0] || {});
    } catch (error) {
      console.error('Admin customers/:id/type error:', error);
      res.status(500).json({ error: 'Failed to update customer type' });
    }
  });

  // POST /api/admin/customers/geocode-all
  app.post('/api/admin/customers/geocode-all', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const pending = await db
        .select({ id: users.id, postalCode: users.postalCode })
        .from(users)
        .where(and(inArray(users.role, ['customer', 'retailer', 'wholesaler']), or(isNull(users.latitude), isNull(users.longitude))));

      let success = 0, flagged = 0;
      for (const customer of pending) {
        if (!customer.postalCode) {
          await db.update(users).set({ geocodeStatus: 'flagged' }).where(eq(users.id, customer.id));
          flagged++;
          continue;
        }
        const coords = await geocodePostcode(customer.postalCode);
        if (coords) {
          await db.update(users).set({
            latitude: coords.lat.toString(), longitude: coords.lng.toString(), geocodeStatus: 'success',
          }).where(eq(users.id, customer.id));
          success++;
        } else {
          await db.update(users).set({ geocodeStatus: 'flagged', latitude: null, longitude: null }).where(eq(users.id, customer.id));
          flagged++;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      res.json({ processed: pending.length, success, flagged });
    } catch (error) {
      console.error('Admin geocode-all error:', error);
      res.status(500).json({ error: 'Failed to geocode customers' });
    }
  });

  // GET /api/admin/customers
  app.get('/api/admin/customers', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { q = '' } = req.query as Record<string, string>;
      const searchTerm = q.trim() ? `%${q.trim()}%` : null;
      const customerList = await db.select({
        id: users.id, firstName: users.firstName, lastName: users.lastName,
        businessName: users.businessName, phoneNumber: users.phoneNumber,
        email: users.email, wholesalerId: users.wholesalerId, postalCode: users.postalCode,
        customerType: users.customerType, isSuspicious: users.isSuspicious,
        isTestAccount: users.isTestAccount, archived: users.archived,
        createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
      }).from(users).where(and(
        inArray(users.role, ['customer', 'retailer']),
        searchTerm ? or(
          ilike(users.firstName, searchTerm),
          ilike(users.lastName, searchTerm),
          ilike(users.businessName, searchTerm),
          ilike(users.phoneNumber, searchTerm),
          ilike(users.email, searchTerm),
        ) : undefined,
      )).orderBy(desc(users.createdAt)).limit(200);

      const customerIds = customerList.map(c => c.id);
      let orderCountMap: Record<string, number> = {};
      if (customerIds.length > 0) {
        const counts = await db.select({ retailerId: orders.retailerId, cnt: count() })
          .from(orders).where(inArray(orders.retailerId, customerIds)).groupBy(orders.retailerId);
        for (const row of counts) { if (row.retailerId) orderCountMap[row.retailerId] = Number(row.cnt); }
      }

      const wholesalerIds = Array.from(new Set(customerList.map(c => c.wholesalerId).filter(Boolean))) as string[];
      let wholesalerMap: Record<string, string> = {};
      if (wholesalerIds.length > 0) {
        const ws = await db.select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, wholesalerIds));
        for (const w of ws) wholesalerMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';
      }

      const result = customerList.map(c => ({
        id: c.id,
        name: c.businessName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        businessName: c.businessName, email: c.email, phoneNumber: c.phoneNumber,
        postalCode: c.postalCode, customerType: c.customerType,
        isSuspicious: c.isSuspicious, isTestAccount: c.isTestAccount, archived: c.archived,
        wholesalerName: c.wholesalerId ? (wholesalerMap[c.wholesalerId] || 'Unknown') : 'No wholesaler',
        wholesalerId: c.wholesalerId, orderCount: orderCountMap[c.id] || 0,
        createdAt: c.createdAt, lastLoginAt: c.lastLoginAt ?? null,
      }));

      res.json({ customers: result });
    } catch (error) {
      console.error('Admin customers error:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  // GET /api/admin/customers/:id/orders
  app.get('/api/admin/customers/:id/orders', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const customerOrders = await db.select({
        id: orders.id, orderNumber: orders.orderNumber, wholesalerId: orders.wholesalerId,
        wholesalerName: users.businessName, subtotal: orders.subtotal,
        status: orders.status, paymentStatus: orders.paymentStatus, createdAt: orders.createdAt,
      }).from(orders).leftJoin(users, eq(orders.wholesalerId, users.id))
        .where(eq(orders.retailerId, req.params.id))
        .orderBy(desc(orders.createdAt)).limit(50);
      res.json({ orders: customerOrders });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customer orders' });
    }
  });

  // PATCH /api/admin/customers/:id/flag
  app.patch('/api/admin/customers/:id/flag', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select({ id: users.id, role: users.role })
        .from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
      if (!['customer', 'retailer'].includes(targetUser.role)) return res.status(400).json({ error: 'Can only flag customer accounts' });
      const { isSuspicious } = req.body;
      await db.update(users).set({ isSuspicious: !!isSuspicious }).where(eq(users.id, req.params.id));
      res.json({ id: req.params.id, isSuspicious: !!isSuspicious });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update flag' });
    }
  });

  // POST /api/admin/subscriptions/activate
  app.post('/api/admin/subscriptions/activate', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { stripeSubscriptionId, planId: overridePlanId } = req.body;
      if (!stripeSubscriptionId) {
        return res.status(400).json({ error: 'stripeSubscriptionId is required' });
      }
      if (overridePlanId !== undefined && !['listing', 'starter', 'standard', 'premium'].includes(overridePlanId)) {
        return res.status(400).json({ error: 'planId override must be one of: listing, starter, standard, premium' });
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

      const recoverUnlock = await unlockForUpgrade(recoverUser.id);

      return res.json({
        success: true, userId: recoverUser.id, userEmail: recoverUser.email,
        planId: resolvedPlanId, stripeSubscriptionId: stripeSub.id,
        periodEnd: recoverPeriodEnd.toISOString(),
        unlocked: recoverUnlock,
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
      if (overridePlanId !== undefined && !['listing', 'starter', 'standard', 'premium'].includes(overridePlanId)) {
        return res.status(400).json({ error: 'planId override must be one of: listing, starter, standard, premium' });
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

      const syncUnlock = await unlockForUpgrade(syncUser.id);

      return res.json({
        success: true, userId: syncUser.id, userEmail: syncUser.email,
        planId: resolvedPlanId, stripeCustomerId: syncCustId,
        stripeSubscriptionId: syncSub.id, periodEnd: syncPeriodEnd.toISOString(), source: planSource,
        unlocked: syncUnlock,
      });
    } catch (error) {
      console.error('❌ Admin sync-by-customer error:', error);
      res.status(500).json({ error: 'Failed to sync subscription' });
    }
  });

  // GET /api/admin/stock-reconcile
  // Read-only drift report: products where products.stock != SUM of active batch quantities.
  // Returns an array sorted by drift magnitude (worst first). No auto-repair — reporting only.
  app.get('/api/admin/stock-reconcile', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const today = new Date().toISOString().split('T')[0];

      const rows = await db.execute(sql`
        SELECT
          p.id                                      AS product_id,
          p.name                                    AS product_name,
          p.wholesaler_id,
          u.business_name                           AS wholesaler_name,
          p.stock                                   AS product_stock,
          COALESCE(
            SUM(pb.quantity) FILTER (
              WHERE pb.status = 'active'
                AND (pb.expiry_date IS NULL OR pb.expiry_date >= ${today})
            ), 0
          )::int                                    AS batch_total,
          (
            p.stock - COALESCE(
              SUM(pb.quantity) FILTER (
                WHERE pb.status = 'active'
                  AND (pb.expiry_date IS NULL OR pb.expiry_date >= ${today})
              ), 0
            )
          )::int                                    AS drift
        FROM products p
        LEFT JOIN product_batches pb ON pb.product_id = p.id
        LEFT JOIN users u ON u.id = p.wholesaler_id
        WHERE p.status IN ('active', 'inactive', 'locked')
        GROUP BY p.id, p.name, p.wholesaler_id, p.stock, u.business_name
        HAVING p.stock != COALESCE(
          SUM(pb.quantity) FILTER (
            WHERE pb.status = 'active'
              AND (pb.expiry_date IS NULL OR pb.expiry_date >= ${today})
          ), 0
        )
        ORDER BY ABS(
          p.stock - COALESCE(
            SUM(pb.quantity) FILTER (
              WHERE pb.status = 'active'
                AND (pb.expiry_date IS NULL OR pb.expiry_date >= ${today})
            ), 0
          )
        ) DESC
        LIMIT 500
      `);

      const driftItems = rows.rows.map(r => ({
        productId: Number(r.product_id),
        productName: String(r.product_name),
        wholesalerId: String(r.wholesaler_id),
        wholesalerName: r.wholesaler_name ? String(r.wholesaler_name) : null,
        productStock: Number(r.product_stock),
        batchTotal: Number(r.batch_total),
        drift: Number(r.drift),
      }));

      res.json({
        checkedAt: new Date().toISOString(),
        driftCount: driftItems.length,
        items: driftItems,
      });
    } catch (error) {
      console.error('❌ Admin stock-reconcile error:', error);
      res.status(500).json({ error: 'Failed to run stock reconciliation report' });
    }
  });

  // POST /api/admin/subscriptions/backfill-stripe
  // One-time (idempotent) backfill: imports all historical paid Stripe invoices
  // into subscriptionAuditLogs so past revenue appears in the dashboard.
  // Fetches invoices per-customer (per known Quikpik wholesaler) for reliable matching.
  app.post('/api/admin/subscriptions/backfill-stripe', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      // Only skip explicitly manual/upcoming invoices. null/undefined billing_reason is fine —
      // non-subscription invoices are caught later by the !subId guard.
      const SKIP_BILLING_REASONS = new Set(['manual', 'upcoming']);

      let inserted = 0;
      let skippedDuplicate = 0;
      let skippedBillingReason = 0;
      let skippedZeroAmount = 0;
      let invalidPlan = 0;
      let failed = 0;

      // Live Stripe only — test-account payments must not appear in revenue dashboards
      let stripe: ReturnType<typeof getStripeClient>;
      try {
        stripe = getStripeClient(false);
      } catch {
        return res.status(500).json({ error: 'Live Stripe key not configured' });
      }

      // Fetch all non-test Quikpik wholesalers that have both a Stripe customer ID and
      // a subscription ID. Iterating per-subscription (not per-customer) means the subId
      // is always known from our DB — we never need to read invoice.subscription from the
      // Stripe response (which is null in SDK v18 list responses by default).
      const wholesalers = await db
        .select({
          id: users.id,
          businessName: users.businessName,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
        })
        .from(users)
        .where(and(
          eq(users.isTestAccount, false),
          eq(users.isInactive, false),
          sql`${users.stripeCustomerId} IS NOT NULL`,
          sql`${users.stripeSubscriptionId} IS NOT NULL`,
        ));

      console.log(`🔄 Backfill: processing invoices for ${wholesalers.length} wholesalers`);

      for (const wholesaler of wholesalers) {
        const custId = wholesaler.stripeCustomerId!;
        const subId = wholesaler.stripeSubscriptionId!;
        console.log(`  → ${wholesaler.businessName} (sub=${subId})`);

        // Page through all paid invoices for this subscription.
        // Using subscription filter means subId is always known from our DB —
        // no dependency on invoice.subscription field (null in Stripe SDK v18 lists).
        let hasMore = true;
        let startingAfter: string | undefined;

        while (hasMore) {
          const params: Stripe.InvoiceListParams = { subscription: subId, status: 'paid', limit: 100 };
          if (startingAfter) params.starting_after = startingAfter;

          let invoices: Stripe.ApiList<Stripe.Invoice>;
          try {
            invoices = await stripe.invoices.list(params);
          } catch (err) {
            console.error(`❌ Backfill: failed to list invoices for sub ${subId}:`, err);
            break;
          }

          console.log(`    Stripe returned ${invoices.data.length} paid invoice(s)`);

          for (const invoice of invoices.data) {
            try {
              const invoiceId = invoice.id;
              const billingReason = (invoice as any).billing_reason as string | null | undefined;
              const amountPaid = (invoice.amount_paid ?? 0) / 100;

              console.log(`    Invoice ${invoiceId}: billing_reason=${billingReason}, amount=${amountPaid}`);

              if (billingReason != null && SKIP_BILLING_REASONS.has(billingReason)) {
                console.log(`      → SKIP: billing_reason=${billingReason}`);
                skippedBillingReason++;
                continue;
              }

              if (amountPaid <= 0) {
                console.log(`      → SKIP: zero amount`);
                skippedZeroAmount++;
                continue;
              }

              // Idempotency: check by stripeInvoiceId (new rows) OR by reason LIKE %invoiceId%
              // (pre-existing rows written before this column existed).
              const paidAt = (invoice.status_transitions as any)?.paid_at ?? null;
              const invoiceTimestamp = new Date((paidAt ?? invoice.created) * 1000);
              const [existing] = await db.select({ id: subscriptionAuditLogs.id })
                .from(subscriptionAuditLogs)
                .where(
                  or(
                    invoiceId ? eq(subscriptionAuditLogs.stripeInvoiceId, invoiceId) : sql`1=0`,
                    and(
                      eq(subscriptionAuditLogs.stripeSubscriptionId, subId),
                      sql`${subscriptionAuditLogs.reason} LIKE ${`%${invoiceId}%`}`,
                    ),
                  )
                )
                .limit(1);

              if (existing) {
                console.log(`      → SKIP: already in audit log (id=${existing.id})`);
                skippedDuplicate++;
                continue;
              }

              // Resolve plan tier from invoice line items first (reflects plan at billing time),
              // fall back to current subscription if needed.
              let planId: string | undefined;
              const lineItem = invoice.lines?.data?.[0];
              const invPriceId = (lineItem as any)?.price?.id as string | undefined;
              const invUnitAmount: number = (lineItem as any)?.price?.unit_amount ?? 0;

              if (invPriceId) {
                const [planRow] = await db.select().from(subscriptionPlans)
                  .where(eq(subscriptionPlans.stripePriceId, invPriceId));
                planId = planRow?.planId && planRow.planId !== 'free' ? planRow.planId : undefined;
              }
              if (!planId) {
                // Fallback: derive from amount paid or unit_amount
                const cents = invUnitAmount || Math.round(amountPaid * 100);
                if (cents >= 9999) planId = 'premium';
                else if (cents >= 4999) planId = 'standard';
                else if (cents >= 2999) planId = 'starter';
                else if (cents >= 1999) planId = 'listing';
              }

              console.log(`      → planId=${planId} (priceId=${invPriceId}, unitAmount=${invUnitAmount})`);

              if (!planId || planId === 'free') {
                console.log(`      → SKIP: could not resolve plan`);
                invalidPlan++;
                continue;
              }

              const currency = (invoice.currency ?? 'gbp').toUpperCase();

              await db.insert(subscriptionAuditLogs).values({
                userId: wholesaler.id,
                eventType: 'payment_success',
                toTier: planId,
                amount: amountPaid.toFixed(2),
                currency,
                stripeSubscriptionId: subId,
                stripeInvoiceId: invoiceId,
                stripeCustomerId: custId,
                reason: `Stripe invoice ${invoiceId} — ${billingReason ?? 'subscription'} [backfilled]`,
                timestamp: invoiceTimestamp,
              });

              console.log(`      ✅ INSERTED: £${amountPaid} ${planId} for ${wholesaler.businessName}`);
              inserted++;
            } catch (rowErr) {
              console.error(`❌ Backfill: error processing invoice ${invoice.id}:`, rowErr);
              failed++;
            }
          }

          hasMore = invoices.has_more && invoices.data.length > 0;
          if (invoices.data.length > 0) {
            startingAfter = invoices.data[invoices.data.length - 1]!.id;
          }
        }
      }

      const skipped = skippedDuplicate + skippedBillingReason + skippedZeroAmount;
      console.log(`✅ Backfill complete: ${inserted} inserted, ${skippedDuplicate} duplicates, ${skippedBillingReason} billing-reason, ${skippedZeroAmount} zero-amount, ${invalidPlan} no-plan, ${failed} failed`);
      return res.json({ success: true, inserted, skipped, failed, invalidPlan, skippedDuplicate });
    } catch (error) {
      console.error('❌ Admin backfill-stripe error:', error);
      res.status(500).json({ error: 'Failed to run Stripe backfill' });
    }
  });
}
