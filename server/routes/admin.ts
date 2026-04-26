import type { Express } from "express";
import { ilike } from "drizzle-orm";
import {
  ADMIN_EMAILS, and, count, db, desc, eq, geocodePostcode, getPlanLimits, getStripeClient, gte, inArray, isNull, lte, or, orders,
  requireAuth, storage, subscriptionPlans, userSubscriptions, users, products, orderItems,
  sendCustomerInvoiceEmail, asc, sql, productBatches, subscriptionAuditLogs, refundAcrossPaymentIntents,
  adminAuditLogs, systemErrorLogs, stockMovements, customerProfileUpdateNotifications, SubscriptionService,
  smsVerificationCodes, stockUpdateNotifications,
  customerGroups, customerGroupMembers, wholesalerCustomerRelationships,
  customerRegistrationRequests, orderCancellationRequests, teamMembers, priceLists, priceListItems,
  priceListAssignments, campaignOrders, sendEmail,
} from "./shared";
import {
  broadcasts, tabPermissions, userBadges, onboardingMilestones, deliveryAddresses,
  messageTemplates, templateProducts, templateCampaigns, stockAlerts,
  customerInsights, businessIntelligence, inventoryInsights, financialPerformance,
  productPerformanceSummary, promotionAnalytics, customerInvitationTokens,
} from "@shared/schema";

// Helper: get the effective admin email (handles impersonation mode)
function getAdminEmail(req: any): string | undefined {
  return req._adminEmail || req.user?.email;
}

export function registerAdminRoutes(app: Express): void {
  // GET /api/admin/platform-stats
  app.get('/api/admin/platform-stats', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [allWholesalers, allOrdersData, newWholesalers, planRows] = await Promise.all([
        db.select({ subscriptionTier: users.subscriptionTier, archived: users.archived, subscriptionStatus: users.subscriptionStatus })
          .from(users).where(and(eq(users.role, 'wholesaler'), eq(users.isTestAccount, false))),
        // Fetch ALL orders (all statuses) so we can derive both operational counts and financial totals
        db.select({
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
          status: orders.status,
          createdAt: orders.createdAt,
        }).from(orders)
          .innerJoin(users, eq(orders.wholesalerId, users.id))
          .where(eq(users.isTestAccount, false)),
        db.select({ count: count() }).from(users)
          .where(and(eq(users.role, 'wholesaler'), gte(users.createdAt, monthStart), eq(users.isTestAccount, false))),
        db.select({ planId: subscriptionPlans.planId, monthlyPrice: subscriptionPlans.monthlyPrice })
          .from(subscriptionPlans),
      ]);

      // Build price map from real DB values so MRR is always accurate
      const PLAN_PRICES: Record<string, number> = { free: 0 };
      for (const p of planRows) {
        PLAN_PRICES[p.planId] = parseFloat(p.monthlyPrice as string) || 0;
      }

      const totalWholesalers = allWholesalers.length;
      const activeWholesalers = allWholesalers.filter(w => !w.archived).length;
      const suspendedWholesalers = allWholesalers.filter(w => w.archived).length;
      const wholesalersByPlan = {
        free: allWholesalers.filter(w => !w.subscriptionTier || w.subscriptionTier === 'free').length,
        standard: allWholesalers.filter(w => w.subscriptionTier === 'standard').length,
        premium: allWholesalers.filter(w => w.subscriptionTier === 'premium').length,
      };

      // Subscription MRR — count active paying wholesalers
      const activeStandard = allWholesalers.filter(w => w.subscriptionTier === 'standard' && !w.archived).length;
      const activePremium  = allWholesalers.filter(w => w.subscriptionTier === 'premium'  && !w.archived).length;
      const subscriptionMRR = (activeStandard * PLAN_PRICES.standard) + (activePremium * PLAN_PRICES.premium);
      const subscriptionBreakdown = {
        standard: { count: activeStandard, mrr: activeStandard * PLAN_PRICES.standard },
        premium:  { count: activePremium,  mrr: activePremium  * PLAN_PRICES.premium  },
      };

      // Derive operational counts (all statuses) and financial totals (non-cancelled only)
      let totalGMV = 0, totalCustomerFees = 0, totalPlatformFees = 0;
      let totalOrders = 0, cancelledOrders = 0, completedOrders = 0;
      let ordersThisMonth = 0, cancelledOrdersThisMonth = 0, completedOrdersThisMonth = 0;
      let todayOrders = 0, todayRevenue = 0;

      for (const o of allOrdersData) {
        const isCancelled = o.status === 'cancelled';
        const createdAt = o.createdAt ? new Date(o.createdAt) : null;
        const isThisMonth = createdAt && createdAt >= monthStart;
        const isToday = createdAt && createdAt >= todayStart;

        // Operational counts — every order counts
        totalOrders++;
        if (isCancelled) cancelledOrders++; else completedOrders++;
        if (isThisMonth) { ordersThisMonth++; if (isCancelled) cancelledOrdersThisMonth++; else completedOrdersThisMonth++; }
        if (isToday) { todayOrders++; }

        // Financial totals — only non-cancelled
        if (!isCancelled) {
          totalGMV += parseFloat(o.subtotal || '0');
          totalCustomerFees += parseFloat(o.customerTransactionFee || '0');
          totalPlatformFees += parseFloat(o.platformFee || '0');
          if (isToday) todayRevenue += parseFloat(o.subtotal || '0');
        }
      }

      res.json({
        totalWholesalers,
        activeWholesalers,
        suspendedWholesalers,
        wholesalersByPlan,
        // Operational order counts (all statuses)
        totalOrders,
        completedOrders,
        cancelledOrders,
        ordersThisMonth,
        completedOrdersThisMonth,
        cancelledOrdersThisMonth,
        todayOrders,
        todayRevenue,
        // Financial totals (non-cancelled only)
        totalGMV,
        totalCustomerFees,
        totalPlatformFees,
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

      const wholesalersList = await db.select().from(users).where(eq(users.role, 'wholesaler')).orderBy(desc(users.createdAt));

      const wholesalerIds = wholesalersList.map(w => w.id);
      let ordersByWholesaler: Record<string, { count: number; cancelledCount: number; gmv: number; gmvWithFees: number; gmvWithoutFees: number; customerFees: number; platformFees: number; lastOrderAt: Date | null }> = {};

      if (wholesalerIds.length > 0) {
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
          id: w.id,
          email: w.email,
          firstName: w.firstName,
          lastName: w.lastName,
          businessName: w.businessName,
          phoneNumber: w.phoneNumber,
          subscriptionTier: w.subscriptionTier || 'free',
          currentPlan: w.currentPlan || w.subscriptionTier || 'free',
          stripeSubscriptionId: w.stripeSubscriptionId || null,
          createdAt: w.createdAt,
          archived: w.archived,
          orderCount: stats.count,           // completed (non-cancelled)
          cancelledCount: stats.cancelledCount,
          totalOrderCount,                   // all statuses
          cancellationRate,                  // %
          totalGMV: stats.gmv,
          gmvWithFees: stats.gmvWithFees,
          gmvWithoutFees: stats.gmvWithoutFees,
          customerFeesEarned: stats.customerFees,
          platformFeesEarned: stats.platformFees,
          totalFeesEarned: stats.customerFees + stats.platformFees,
          lastOrderAt: stats.lastOrderAt,
          customFeePercentage: w.customFeePercentage !== null && w.customFeePercentage !== undefined
            ? parseFloat(w.customFeePercentage)
            : null,
          isTestAccount: w.isTestAccount ?? false,
          lastLoginAt: w.lastLoginAt ?? null,
          enableMultiProfile: w.enableMultiProfile ?? false,
          legalBusinessName: w.legalBusinessName ?? null,
          vatNumber: w.vatNumber ?? null,
          companyRegistrationNumber: w.companyRegistrationNumber ?? null,
        };
      }).sort((a, b) => {
        // Test accounts always sort to the bottom
        if (a.isTestAccount !== b.isTestAccount) return a.isTestAccount ? 1 : -1;
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
          id: orders.id,
          orderNumber: orders.orderNumber,
          wholesalerId: orders.wholesalerId,
          wholesalerName: users.businessName,
          customerName: orders.customerName,
          subtotal: orders.subtotal,
          customerTransactionFee: orders.customerTransactionFee,
          platformFee: orders.platformFee,
          total: orders.total,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          createdAt: orders.createdAt,
          stripeActualFee: orders.stripeActualFee,
        })
        .from(orders)
        .innerJoin(users, eq(orders.wholesalerId, users.id))
        .where(and(
          eq(users.isTestAccount, false),
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
        // Use actual Stripe fee if captured at payment time; fall back to formula estimate
        const actualFee = o.stripeActualFee != null ? parseFloat(o.stripeActualFee) : null;
        const stripeFeIsEstimated = actualFee === null && !isCancelled;
        const stripeFee = isCancelled ? 0 : (actualFee ?? parseFloat(((sub + custFee) * 0.014 + 0.20).toFixed(2)));
        const grossProfit = isCancelled ? 0 : parseFloat((custFee + platFee - stripeFee).toFixed(2));
        if (!isCancelled) {
          totalCustomerFees += custFee;
          totalPlatformFees += platFee;
          totalGMV += sub;
          totalStripeProcessingFees += stripeFee;
        }
        return {
          ...o,
          customerTransactionFee: custFee,
          platformFee: platFee,
          subtotal: sub,
          totalQuikpikIncome: isCancelled ? 0 : custFee + platFee,
          stripeProcessingFee: stripeFee,
          stripeFeIsEstimated,
          grossProfit,
        };
      });

      const totalGrossRevenue = totalCustomerFees + totalPlatformFees;
      const totalGrossProfit = parseFloat((totalGrossRevenue - totalStripeProcessingFees).toFixed(2));
      const grossMarginPct = totalGrossRevenue > 0
        ? parseFloat(((totalGrossProfit / totalGrossRevenue) * 100).toFixed(1))
        : 0;

      res.json({
        orders: processedOrders,
        totals: {
          totalCustomerFees,
          totalPlatformFees,
          totalGrossRevenue,
          totalGMV,
          totalStripeProcessingFees: parseFloat(totalStripeProcessingFees.toFixed(2)),
          totalGrossProfit,
          grossMarginPct,
        },
      });
    } catch (error) {
      console.error('Admin revenue error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue data' });
    }
  });

  // PATCH /api/admin/wholesalers/:id/toggle-status
  app.patch('/api/admin/wholesalers/:id/toggle-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const targetUser = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser.length || targetUser[0].role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }

      const newArchived = !targetUser[0].archived;
      await db.update(users).set({ archived: newArchived }).where(eq(users.id, req.params.id));

      res.json({ id: req.params.id, archived: newArchived, businessName: targetUser[0].businessName });
    } catch (error) {
      console.error('Admin toggle-status error:', error);
      res.status(500).json({ error: 'Failed to toggle status' });
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

      console.log(`✅ Admin set custom fee for wholesaler ${req.params.id}: ${customFeePercentage === null ? 'reset to default' : customFeePercentage + '%'}`);
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
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          businessName: users.businessName,
          phoneNumber: users.phoneNumber,
          postalCode: users.postalCode,
          customerType: users.customerType,
          latitude: users.latitude,
          longitude: users.longitude,
          geocodeStatus: users.geocodeStatus,
          wholesalerId: users.wholesalerId,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(inArray(users.role, ['customer', 'retailer']))
        .orderBy(desc(users.createdAt));

      const customerIds = customers.map(c => c.id);
      let orderCountMap: Record<string, number> = {};
      if (customerIds.length > 0) {
        const counts = await db
          .select({ retailerId: orders.retailerId, count: count() })
          .from(orders)
          .where(inArray(orders.retailerId, customerIds))
          .groupBy(orders.retailerId);
        for (const row of counts) {
          if (row.retailerId) orderCountMap[row.retailerId] = Number(row.count);
        }
      }

      const wholesalerIds = [...new Set(customers.map(c => c.wholesalerId).filter(Boolean))] as string[];
      let wholesalerMap: Record<string, string> = {};
      if (wholesalerIds.length > 0) {
        const ws = await db
          .select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(inArray(users.id, wholesalerIds));
        for (const w of ws) {
          wholesalerMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';
        }
      }

      const result = customers.map(c => ({
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.businessName || 'Unknown',
        businessName: c.businessName,
        phoneNumber: c.phoneNumber,
        postalCode: c.postalCode,
        customerType: c.customerType,
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

      // Verify target is a customer/retailer record
      const target = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, req.params.id))
        .limit(1);
      if (!target[0]) return res.status(404).json({ error: 'Customer not found' });
      if (!['customer', 'retailer'].includes(target[0].role)) return res.status(400).json({ error: 'Target user is not a customer' });

      const updateData: Record<string, string | null> = {};
      if (customerType !== undefined) updateData.customerType = customerType || null;

      if (postalCode !== undefined) {
        // Explicit postcode supplied — update it and always re-geocode
        updateData.postalCode = postalCode || null;

        if (!postalCode) {
          // Postcode cleared — clear coordinates and flag the record
          updateData.latitude = null;
          updateData.longitude = null;
          updateData.geocodeStatus = 'flagged';
        } else {
          // Postcode provided — attempt geocoding
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
        // No postcode in request — re-geocode using the customer's existing postcode
        // if they have one and haven't been successfully geocoded yet
        const existing = await db
          .select({ postalCode: users.postalCode, geocodeStatus: users.geocodeStatus })
          .from(users)
          .where(eq(users.id, req.params.id))
          .limit(1);
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
        .where(and(inArray(users.role, ['customer', 'retailer']), or(isNull(users.latitude), isNull(users.longitude))));

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
            latitude: coords.lat.toString(),
            longitude: coords.lng.toString(),
            geocodeStatus: 'success',
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

      // Fetch subscription from Stripe — try live first, fall back to test (admin spans both envs)
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

      // Resolve the plan: use override if provided, otherwise look up by price ID
      let resolvedPlanId: string;
      if (overridePlanId) {
        resolvedPlanId = overridePlanId;
        console.log(`🔧 Admin using planId override "${resolvedPlanId}" (price ${recoverPriceId} may be archived)`);
      } else {
        const [recoverPlan] = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, recoverPriceId));
        if (!recoverPlan || !recoverPlan.planId || recoverPlan.planId === 'free') {
          return res.status(400).json({ error: `No paid plan found for price ${recoverPriceId} — pass planId to override` });
        }
        resolvedPlanId = recoverPlan.planId;
      }

      const recoverProductLimit = resolvedPlanId === 'premium' ? -1 : (resolvedPlanId === 'standard' ? 5 : 2);
      const recoverPeriodEnd = new Date(stripeSub.current_period_end * 1000);
      const recoverPeriodStart = new Date(stripeSub.current_period_start * 1000);

      await storage.updateUser(recoverUser.id, {
        currentPlan: resolvedPlanId,
        subscriptionTier: resolvedPlanId,
        subscriptionStatus: 'active',
        productLimit: recoverProductLimit,
        stripeSubscriptionId: stripeSub.id,
        subscriptionEndsAt: recoverPeriodEnd,
      });

      const [existingRecoverSub] = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, recoverUser.id));
      if (existingRecoverSub) {
        await db.update(userSubscriptions).set({
          planId: resolvedPlanId,
          stripeSubscriptionId: stripeSub.id,
          status: 'active',
          currentPeriodStart: recoverPeriodStart,
          currentPeriodEnd: recoverPeriodEnd,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        }).where(eq(userSubscriptions.userId, recoverUser.id));
      } else {
        await db.insert(userSubscriptions).values({
          userId: recoverUser.id,
          planId: resolvedPlanId,
          stripeSubscriptionId: stripeSub.id,
          status: 'active',
          currentPeriodStart: recoverPeriodStart,
          currentPeriodEnd: recoverPeriodEnd,
          cancelAtPeriodEnd: false,
        });
      }

      console.log(`🔧 Admin activated ${resolvedPlanId} for user ${recoverUser.id} (${recoverUser.email}) via sub ${stripeSub.id}`);
      return res.json({
        success: true,
        userId: recoverUser.id,
        userEmail: recoverUser.email,
        planId: resolvedPlanId,
        stripeSubscriptionId: stripeSub.id,
        periodEnd: recoverPeriodEnd.toISOString(),
      });
    } catch (error) {
      console.error('❌ Admin subscription activate error:', error);
      res.status(500).json({ error: 'Failed to activate subscription' });
    }
  });

  // POST /api/admin/subscriptions/sync-by-customer — find user by email/customerId and pull active sub from Stripe
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

      // Find the user in our DB
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

      // Find their active subscription in Stripe (use user's mode so test accounts use test client)
      const syncStripe = getStripeClient(Boolean(syncUser.isTestAccount));
      const syncSubs = await syncStripe.subscriptions.list({ customer: syncCustId, status: 'active', limit: 1 });
      const syncSub = syncSubs.data[0];
      if (!syncSub) {
        return res.status(404).json({ error: `No active Stripe subscription found for customer ${syncCustId}` });
      }

      const syncPriceId = syncSub.items?.data?.[0]?.price?.id;
      const syncUnitAmount = syncSub.items?.data?.[0]?.price?.unit_amount ?? 0;

      // Resolve plan: override → DB lookup → amount fallback; track resolution source
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

      // Safely parse period timestamps — newer Stripe API versions may return undefined
      const rawPeriodEnd = (syncSub as any).current_period_end;
      const rawPeriodStart = (syncSub as any).current_period_start;
      const syncPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const syncPeriodStart = rawPeriodStart ? new Date(rawPeriodStart * 1000) : new Date();
      const isPeriodValid = !isNaN(syncPeriodEnd.getTime()) && !isNaN(syncPeriodStart.getTime());

      await storage.updateUser(syncUser.id, {
        currentPlan: resolvedPlanId,
        subscriptionTier: resolvedPlanId,
        subscriptionStatus: 'active',
        productLimit: syncProductLimit,
        stripeSubscriptionId: syncSub.id,
        ...(isPeriodValid ? { subscriptionEndsAt: syncPeriodEnd, subscriptionPeriodEnd: syncPeriodEnd, subscriptionPeriodStart: syncPeriodStart } : {}),
      });

      const [existingSyncSub] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, syncUser.id));
      if (existingSyncSub) {
        await db.update(userSubscriptions).set({
          planId: resolvedPlanId,
          stripeSubscriptionId: syncSub.id,
          status: 'active',
          ...(isPeriodValid ? { currentPeriodStart: syncPeriodStart, currentPeriodEnd: syncPeriodEnd } : {}),
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        }).where(eq(userSubscriptions.userId, syncUser.id));
      } else {
        await db.insert(userSubscriptions).values({
          userId: syncUser.id,
          planId: resolvedPlanId,
          stripeSubscriptionId: syncSub.id,
          status: 'active',
          currentPeriodStart: syncPeriodStart,
          currentPeriodEnd: syncPeriodEnd,
          cancelAtPeriodEnd: false,
        });
      }

      console.log(`🔧 Admin sync-by-customer: set ${resolvedPlanId} for ${syncUser.email} (${syncUser.id}) via sub ${syncSub.id}`);
      return res.json({
        success: true,
        userId: syncUser.id,
        userEmail: syncUser.email,
        planId: resolvedPlanId,
        stripeCustomerId: syncCustId,
        stripeSubscriptionId: syncSub.id,
        periodEnd: syncPeriodEnd.toISOString(),
        source: planSource,
      });
    } catch (error) {
      console.error('❌ Admin sync-by-customer error:', error);
      res.status(500).json({ error: 'Failed to sync subscription' });
    }
  });

  // GET /api/admin/customers — search across all customers/retailers
  app.get('/api/admin/customers', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { q = '' } = req.query as Record<string, string>;

      const searchTerm = q.trim() ? `%${q.trim()}%` : null;
      const customerList = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        businessName: users.businessName,
        phoneNumber: users.phoneNumber,
        email: users.email,
        wholesalerId: users.wholesalerId,
        postalCode: users.postalCode,
        customerType: users.customerType,
        isSuspicious: users.isSuspicious,
        isTestAccount: users.isTestAccount,
        archived: users.archived,
        createdAt: users.createdAt,
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

      const wholesalerIds = [...new Set(customerList.map(c => c.wholesalerId).filter(Boolean))] as string[];
      let wholesalerMap: Record<string, string> = {};
      if (wholesalerIds.length > 0) {
        const ws = await db.select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, wholesalerIds));
        for (const w of ws) wholesalerMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';
      }

      const result = customerList.map(c => ({
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.businessName || 'Unknown',
        businessName: c.businessName,
        email: c.email,
        phoneNumber: c.phoneNumber,
        postalCode: c.postalCode,
        customerType: c.customerType,
        isSuspicious: c.isSuspicious,
        isTestAccount: c.isTestAccount,
        archived: c.archived,
        wholesalerName: c.wholesalerId ? (wholesalerMap[c.wholesalerId] || 'Unknown') : 'No wholesaler',
        wholesalerId: c.wholesalerId,
        orderCount: orderCountMap[c.id] || 0,
        createdAt: c.createdAt,
      }));

      res.json({ customers: result });
    } catch (error) {
      console.error('Admin customers error:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  // GET /api/admin/customers/:id/orders — order history for a specific customer
  app.get('/api/admin/customers/:id/orders', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const customerOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        wholesalerId: orders.wholesalerId,
        wholesalerName: users.businessName,
        subtotal: orders.subtotal,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,
      }).from(orders).leftJoin(users, eq(orders.wholesalerId, users.id))
        .where(eq(orders.retailerId, req.params.id))
        .orderBy(desc(orders.createdAt)).limit(50);
      res.json({ orders: customerOrders });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customer orders' });
    }
  });

  // PATCH /api/admin/customers/:id/flag — toggle suspicious flag
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

  // GET /api/admin/products — all products across all wholesalers with cost/margin/stock
  app.get('/api/admin/products', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { sort = 'margin_asc' } = req.query as Record<string, string>;

      const productList = await db.select({
        id: products.id,
        name: products.name,
        wholesalerId: products.wholesalerId,
        wholesalerName: users.businessName,
        price: products.price,
        costPrice: products.costPrice,
        status: products.status,
        baseUnitStock: sql<number>`COALESCE((
          SELECT SUM(${productBatches.quantity})
          FROM ${productBatches}
          WHERE ${productBatches.productId} = ${products.id}
            AND ${productBatches.status} = 'active'
            AND (${productBatches.expiryDate} IS NULL OR ${productBatches.expiryDate} >= CURRENT_DATE)
        ), 0)`,
        category: products.category,
      }).from(products)
        .leftJoin(users, eq(products.wholesalerId, users.id))
        .where(and(inArray(products.status, ['active', 'inactive', 'locked']), eq(users.isTestAccount, false)))
        .orderBy(desc(products.id));

      const enriched = productList.map(p => {
        const price = parseFloat(p.price || '0');
        const cost = p.costPrice ? parseFloat(p.costPrice) : null;
        const margin = cost !== null && price > 0 ? ((price - cost) / price) * 100 : null;
        return {
          ...p,
          price,
          costPrice: cost,
          margin,
          hasMissingCost: cost === null,
          hasLowMargin: margin !== null && margin < 10,
          hasZeroStock: (Number(p.baseUnitStock) || 0) === 0,
        };
      });

      let sorted = enriched;
      if (sort === 'margin_asc') sorted = [...enriched].sort((a, b) => {
        if (a.margin === null && b.margin === null) return 0;
        if (a.margin === null) return -1;
        if (b.margin === null) return 1;
        return a.margin - b.margin;
      });

      res.json({ products: sorted });
    } catch (error) {
      console.error('Admin products error:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  // GET /api/admin/alerts — platform alert items
  app.get('/api/admin/alerts', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const todayStr = now.toISOString().slice(0, 10);
      const sevenDaysOutStr = sevenDaysOut.toISOString().slice(0, 10);

      const [stuckOrders, expiringBatches, failedPayments] = await Promise.all([
        db.select({ id: orders.id, orderNumber: orders.orderNumber, wholesalerName: users.businessName, createdAt: orders.createdAt })
          .from(orders).leftJoin(users, eq(orders.wholesalerId, users.id))
          .where(and(eq(orders.status, 'processing'), lte(orders.createdAt, oneDayAgo)))
          .orderBy(asc(orders.createdAt)).limit(20),
        db.select({ id: productBatches.id, productId: productBatches.productId, expiryDate: productBatches.expiryDate, batchCode: productBatches.batchCode, quantity: productBatches.quantity })
          .from(productBatches)
          .where(and(sql`${productBatches.expiryDate} IS NOT NULL`, sql`${productBatches.expiryDate} >= ${todayStr}`, sql`${productBatches.expiryDate} <= ${sevenDaysOutStr}`))
          .orderBy(asc(productBatches.expiryDate)).limit(20),
        db.select({ id: subscriptionAuditLogs.id, userId: subscriptionAuditLogs.userId, createdAt: subscriptionAuditLogs.createdAt })
          .from(subscriptionAuditLogs)
          .where(and(eq(subscriptionAuditLogs.eventType, 'payment_failed'), gte(subscriptionAuditLogs.createdAt, thirtyDaysAgo)))
          .orderBy(desc(subscriptionAuditLogs.createdAt)).limit(20),
      ]);

      res.json({
        stuckOrders: stuckOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, wholesalerName: o.wholesalerName, createdAt: o.createdAt })),
        stuckOrdersCount: stuckOrders.length,
        expiringBatches: expiringBatches.map(b => ({ id: b.id, productId: b.productId, expiryDate: b.expiryDate, batchCode: b.batchCode, quantity: b.quantity })),
        expiringBatchesCount: expiringBatches.length,
        failedPayments: failedPayments.map(p => ({ id: p.id, userId: p.userId, createdAt: p.createdAt })),
        failedPaymentsCount: failedPayments.length,
      });
    } catch (error) {
      console.error('Admin alerts error:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // GET /api/admin/wholesalers/:id/orders — recent orders for a wholesaler
  app.get('/api/admin/wholesalers/:id/orders', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const recentOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        subtotal: orders.subtotal,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,
      }).from(orders).where(eq(orders.wholesalerId, req.params.id))
        .orderBy(desc(orders.createdAt)).limit(10);
      res.json({ orders: recentOrders });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch wholesaler orders' });
    }
  });

  // POST /api/admin/orders/:id/resend-invoice — resend invoice email
  app.post('/api/admin/orders/:id/resend-invoice', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const orderId = parseInt(req.params.id, 10);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const [wholesaler] = await db.select().from(users).where(eq(users.id, order.wholesalerId)).limit(1);
      if (!wholesaler) return res.status(404).json({ error: 'Wholesaler not found' });

      let customer = null;
      if (order.retailerId) {
        const [c] = await db.select().from(users).where(eq(users.id, order.retailerId)).limit(1);
        customer = c || null;
      }
      if (!customer) customer = { email: null, firstName: order.customerName, lastName: '', phoneNumber: order.customerPhone };

      const items = await db.select({
        productName: products.name,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        total: orderItems.total,
        quantityInPack: products.quantityInPack,
        unitSize: products.unitSize,
        unitOfMeasure: products.unitOfMeasure,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, order.id));

      await sendCustomerInvoiceEmail(customer, order, items.map(i => ({
        name: i.productName || 'Product',
        quantity: i.quantity,
        unitPrice: parseFloat(i.unitPrice || '0'),
        total: parseFloat(i.total || '0'),
        product: { name: i.productName || 'Product', quantityInPack: i.quantityInPack, unitSize: i.unitSize, unitOfMeasure: i.unitOfMeasure },
      })), wholesaler);

      res.json({ success: true });
    } catch (error) {
      console.error('Admin resend-invoice error:', error);
      res.status(500).json({ error: 'Failed to resend invoice' });
    }
  });

  // GET /api/admin/stripe-mode — returns whether Stripe is in test or live mode
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

  // GET /api/admin/payout-status — Stripe platform balance and last payout
  app.get('/api/admin/payout-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      // Platform-level balance — always uses the configured STRIPE_ENVIRONMENT (live or test)
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

  // POST /api/admin/orders/:id/issue-refund — admin-initiated full or partial refund
  app.post('/api/admin/orders/:id/issue-refund', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const refundOrderId = parseInt(req.params.id, 10);
      if (isNaN(refundOrderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const [order] = await db.select().from(orders).where(eq(orders.id, refundOrderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!order.stripePaymentIntentId) return res.status(400).json({ error: 'No payment intent on this order' });

      // Derive Stripe client from the order's wholesaler so test accounts use the test environment
      const [refundWholesaler] = await db.select({ isTestAccount: users.isTestAccount })
        .from(users).where(eq(users.id, order.wholesalerId)).limit(1);
      const stripe = getStripeClient(Boolean(refundWholesaler?.isTestAccount));

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

  // ── Impersonation ────────────────────────────────────────────────────────────

  // POST /api/admin/impersonate/exit — clear session token + log audit (must be before :wholesalerId route)
  app.post('/api/admin/impersonate/exit', requireAuth, async (req: any, res) => {
    try {
      const adminEmail = getAdminEmail(req) || req.user.email;
      if (!ADMIN_EMAILS.includes(adminEmail)) return res.status(403).json({ error: 'Forbidden' });

      const { wholesalerId: bodyWholesalerId } = req.body as { wholesalerId?: string };
      const session = req.session as any;

      // Always prefer the server-authoritative session token for the audit write;
      // reject client-supplied wholesalerId if it doesn't match the session (tamper-resistance)
      const sessionWholesalerId = session.impersonationToken?.wholesalerId;
      if (bodyWholesalerId && sessionWholesalerId && bodyWholesalerId !== sessionWholesalerId) {
        delete session.impersonationToken;
        return res.status(400).json({ error: 'Wholesaler ID mismatch' });
      }
      const resolvedWholesalerId = sessionWholesalerId || bodyWholesalerId;

      // Clear the session token so the impersonation proof is invalidated
      delete session.impersonationToken;

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

  // POST /api/admin/impersonate/:wholesalerId — issue session token + log audit start
  app.post('/api/admin/impersonate/:wholesalerId', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const [target] = await db.select().from(users).where(eq(users.id, req.params.wholesalerId)).limit(1);
      if (!target || target.role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }

      const effectiveAdminEmail = getAdminEmail(req) || '';
      const businessName = target.businessName || `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.email || '';

      // Issue a server-side token that proves this impersonation was audited
      // Token expires after 30 minutes for defence-in-depth
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 30 * 60 * 1000;
      (req.session as any).impersonationToken = { token, wholesalerId: target.id, adminEmail: effectiveAdminEmail, expiresAt };

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

  // GET /api/admin/impersonate/status — check header-based impersonation state
  app.get('/api/admin/impersonate/status', requireAuth, async (req: any, res) => {
    try {
      const adminEmail = getAdminEmail(req) || req.user.email;
      if (!ADMIN_EMAILS.includes(adminEmail)) return res.status(403).json({ error: 'Forbidden' });

      const impersonateHeader = req.headers['x-admin-impersonate'] as string | undefined;
      res.json({
        impersonating: !!impersonateHeader,
        wholesalerId: impersonateHeader || null,
        businessName: (req as any)._impersonatingBusinessName || null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get impersonation status' });
    }
  });

  // ── Activity Feed ────────────────────────────────────────────────────────────

  // GET /api/admin/activity — merged activity feed from multiple tables
  app.get('/api/admin/activity', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { offset = '0', limit = '50', wholesalerId: wFilter } = req.query as Record<string, string>;
      const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      // Build wholesaler lookup
      const allWholesalers = await db.select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.role, 'wholesaler'));
      const wMap: Record<string, string> = {};
      for (const w of allWholesalers) wMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';

      // Fetch from all sources in parallel
      const [movements, subLogs, profileUpdates, recentOrders] = await Promise.all([
        db.select({
          id: stockMovements.id,
          productId: stockMovements.productId,
          wholesalerId: stockMovements.wholesalerId,
          movementType: stockMovements.movementType,
          quantity: stockMovements.quantity,
          reason: stockMovements.reason,
          customerName: stockMovements.customerName,
          createdAt: stockMovements.createdAt,
        }).from(stockMovements)
          .where(wFilter ? eq(stockMovements.wholesalerId, wFilter) : undefined)
          .orderBy(desc(stockMovements.createdAt))
          .limit(200),

        db.select({
          id: subscriptionAuditLogs.id,
          userId: subscriptionAuditLogs.userId,
          eventType: subscriptionAuditLogs.eventType,
          fromTier: subscriptionAuditLogs.fromTier,
          toTier: subscriptionAuditLogs.toTier,
          amount: subscriptionAuditLogs.amount,
          reason: subscriptionAuditLogs.reason,
          timestamp: subscriptionAuditLogs.timestamp,
        }).from(subscriptionAuditLogs)
          .where(wFilter ? eq(subscriptionAuditLogs.userId, wFilter) : undefined)
          .orderBy(desc(subscriptionAuditLogs.timestamp))
          .limit(200),

        db.select({
          id: customerProfileUpdateNotifications.id,
          customerId: customerProfileUpdateNotifications.customerId,
          wholesalerId: customerProfileUpdateNotifications.wholesalerId,
          updateType: customerProfileUpdateNotifications.updateType,
          newValue: customerProfileUpdateNotifications.newValue,
          createdAt: customerProfileUpdateNotifications.createdAt,
        }).from(customerProfileUpdateNotifications)
          .where(wFilter ? eq(customerProfileUpdateNotifications.wholesalerId, wFilter) : undefined)
          .orderBy(desc(customerProfileUpdateNotifications.createdAt))
          .limit(200),

        db.select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          wholesalerId: orders.wholesalerId,
          customerName: orders.customerName,
          status: orders.status,
          subtotal: orders.subtotal,
          createdAt: orders.createdAt,
        }).from(orders)
          .where(wFilter ? eq(orders.wholesalerId, wFilter) : undefined)
          .orderBy(desc(orders.createdAt))
          .limit(200),
      ]);

      // User lookup for subscription events
      const subUserIds = [...new Set(subLogs.map(l => l.userId))];
      const subUsers: Record<string, string> = {};
      if (subUserIds.length > 0) {
        const fetched = await db.select({ id: users.id, email: users.email, businessName: users.businessName }).from(users).where(inArray(users.id, subUserIds));
        for (const u of fetched) subUsers[u.id] = u.businessName || u.email || u.id;
      }

      // Normalise all events
      type ActivityEntry = { timestamp: Date; type: string; description: string; wholesalerName: string; actorName: string };
      const events: ActivityEntry[] = [];

      for (const m of movements) {
        events.push({
          timestamp: m.createdAt || new Date(),
          type: 'stock_movement',
          description: `Stock ${m.movementType?.replace(/_/g, ' ')} of ${Math.abs(m.quantity)} units${m.reason ? ` — ${m.reason}` : ''}`,
          wholesalerName: wMap[m.wholesalerId] || 'Unknown',
          actorName: m.customerName || 'System',
        });
      }

      for (const s of subLogs) {
        const isFailure = s.eventType?.includes('fail') || s.eventType?.includes('error');
        events.push({
          timestamp: s.timestamp || new Date(),
          type: isFailure ? 'payment_failure' : 'subscription_event',
          description: `Subscription ${s.eventType?.replace(/_/g, ' ')}${s.fromTier && s.toTier ? ` (${s.fromTier} → ${s.toTier})` : ''}${s.amount ? ` £${parseFloat(String(s.amount)).toFixed(2)}` : ''}`,
          wholesalerName: subUsers[s.userId] || 'Unknown',
          actorName: subUsers[s.userId] || 'System',
        });
      }

      for (const p of profileUpdates) {
        events.push({
          timestamp: p.createdAt || new Date(),
          type: 'profile_update',
          description: `Customer updated ${p.updateType?.replace(/_/g, ' ')}`,
          wholesalerName: wMap[p.wholesalerId] || 'Unknown',
          actorName: 'Customer',
        });
      }

      for (const o of recentOrders) {
        events.push({
          timestamp: o.createdAt || new Date(),
          type: 'order',
          description: `Order ${o.orderNumber} placed — £${parseFloat(o.subtotal || '0').toFixed(2)} (${o.status})`,
          wholesalerName: wMap[o.wholesalerId] || 'Unknown',
          actorName: o.customerName || 'Customer',
        });
      }

      // Sort descending by timestamp
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const total = events.length;
      const page = events.slice(offsetNum, offsetNum + limitNum).map(e => ({ ...e, timestamp: e.timestamp.toISOString() }));

      res.json({ events: page, total, offset: offsetNum, limit: limitNum });
    } catch (error) {
      console.error('Admin activity error:', error);
      res.status(500).json({ error: 'Failed to fetch activity feed' });
    }
  });

  // ── Error Log ────────────────────────────────────────────────────────────────

  // GET /api/admin/errors — recent system error logs
  app.get('/api/admin/errors', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { limit = '50' } = req.query as Record<string, string>;
      const limitNum = Math.min(200, parseInt(limit, 10) || 50);
      // Fetch more than limitNum per source so the global merge+sort+slice is accurate
      const fetchCap = Math.min(400, limitNum * 4);

      // Fetch payment failures from subscription_audit_logs as errors
      const [dbErrors, paymentFailures] = await Promise.all([
        db.select().from(systemErrorLogs).orderBy(desc(systemErrorLogs.createdAt)).limit(fetchCap),
        db.select({
          id: subscriptionAuditLogs.id,
          userId: subscriptionAuditLogs.userId,
          eventType: subscriptionAuditLogs.eventType,
          reason: subscriptionAuditLogs.reason,
          amount: subscriptionAuditLogs.amount,
          timestamp: subscriptionAuditLogs.timestamp,
        }).from(subscriptionAuditLogs)
          .where(inArray(subscriptionAuditLogs.eventType, [
            'payment_failed',
            'payment_failure',
            'payment_action_required',
            'subscription_error',
            'subscription_cancelled',
            'subscription_expired',
            'invoice_failed',
          ]))
          .orderBy(desc(subscriptionAuditLogs.timestamp))
          .limit(fetchCap),
      ]);

      // Enrich payment failures with user info
      const failureUserIds = [...new Set(paymentFailures.map(f => f.userId))];
      const failureUsers: Record<string, string> = {};
      if (failureUserIds.length > 0) {
        const fetched = await db.select({ id: users.id, email: users.email, businessName: users.businessName }).from(users).where(inArray(users.id, failureUserIds));
        for (const u of fetched) failureUsers[u.id] = u.businessName || u.email || u.id;
      }

      // Enrich system errors with wholesaler names
      const errorWholesalerIds = dbErrors.map(e => e.wholesalerId).filter(Boolean) as string[];
      const errorWholesalers: Record<string, string> = {};
      if (errorWholesalerIds.length > 0) {
        const fetched = await db.select({ id: users.id, businessName: users.businessName }).from(users).where(inArray(users.id, errorWholesalerIds));
        for (const u of fetched) errorWholesalers[u.id] = u.businessName || u.id;
      }

      const allErrors = [
        ...dbErrors.map(e => ({
          id: `sys-${e.id}`,
          errorType: e.errorType,
          message: e.message,
          severity: e.severity,
          wholesalerName: e.wholesalerId ? (errorWholesalers[e.wholesalerId] || 'Unknown') : null,
          context: e.context,
          timestamp: e.createdAt?.toISOString() || new Date().toISOString(),
          source: 'system',
        })),
        ...paymentFailures.map(f => ({
          id: `pay-${f.id}`,
          errorType: 'payment_failed',
          message: f.reason || 'Payment failed',
          severity: 'error',
          wholesalerName: failureUsers[f.userId] || 'Unknown',
          context: { amount: f.amount, eventType: f.eventType },
          timestamp: f.timestamp?.toISOString() || new Date().toISOString(),
          source: 'stripe',
        })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit globally after merge+sort so `limit` is a true contract
      const errors = allErrors.slice(0, limitNum);
      res.json({ errors, total: allErrors.length });
    } catch (error) {
      console.error('Admin errors error:', error);
      res.status(500).json({ error: 'Failed to fetch error log' });
    }
  });

  // ── Subscription Plan Management (admin-only) ────────────────────────────────

  // GET /api/admin/plans — list all plans with subscriber count + MRR
  app.get('/api/admin/plans', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const plans = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.createdAt));

      // Count active subscribers per planId (exclude test accounts)
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

  // POST /api/admin/plans — create new plan + Stripe Product + Price
  app.post('/api/admin/plans', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { name, price, billingInterval = 'monthly', features = [], limits = {}, description = '' } = req.body;
      if (!name || price === undefined || price === null) return res.status(400).json({ error: 'name and price are required' });
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'price must be a non-negative number' });

      // Derive a planId slug from the name
      const basePlanId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      // Determine version: match exact base slug OR versioned variants (e.g. "growth", "growth_v2")
      const existing = await db.select({ planId: subscriptionPlans.planId })
        .from(subscriptionPlans)
        .where(or(
          eq(subscriptionPlans.planId, basePlanId),
          sql`${subscriptionPlans.planId} LIKE ${basePlanId + '_v%'}`,
        ));
      const version = existing.length > 0 ? existing.length + 1 : 1;
      const planId = version === 1 ? basePlanId : `${basePlanId}_v${version}`;

      // Determine sortOrder (after existing plans)
      const maxSort = await db.select({ s: sql<number>`MAX(${subscriptionPlans.sortOrder})` }).from(subscriptionPlans);
      const sortOrder = (Number(maxSort[0]?.s) || 0) + 1;

      let stripeProductId: string | null = null;
      let stripePriceId: string | null = null;

      // For paid plans, create Stripe Product + Price (platform-level — always uses STRIPE_ENVIRONMENT)
      if (priceNum > 0) {
        try {
          const platformStripe = getStripeClient();
          const product = await platformStripe.products.create({
            name,
            description: description || `Quikpik ${name} plan`,
            metadata: { planId, platform: 'quikpik' },
          });
          stripeProductId = product.id;

          const stripeInterval = billingInterval === 'yearly' ? 'year' : 'month';
          const stripePrice = await platformStripe.prices.create({
            product: product.id,
            unit_amount: Math.round(priceNum * 100),
            currency: 'gbp',
            recurring: { interval: stripeInterval },
            metadata: { planId, platform: 'quikpik' },
          });
          stripePriceId = stripePrice.id;
        } catch (stripeError: any) {
          console.error('Stripe product/price creation failed:', stripeError?.message);
          return res.status(502).json({ error: `Stripe error: ${stripeError?.message || 'unknown'}` });
        }
      }

      const [created] = await db.insert(subscriptionPlans).values({
        name,
        planId,
        stripeProductId,
        stripePriceId,
        monthlyPrice: priceNum.toFixed(2),
        currency: 'GBP',
        description,
        features: Array.isArray(features) ? features : [],
        limits,
        billingInterval,
        version,
        isActive: true,
        sortOrder,
      }).returning();

      res.status(201).json({ plan: created });
    } catch (error) {
      console.error('Admin create plan error:', error);
      res.status(500).json({ error: 'Failed to create plan' });
    }
  });

  // PATCH /api/admin/plans/:id/archive — set isActive = false (safe, non-destructive)
  app.patch('/api/admin/plans/:id/archive', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const planRecord = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, parseInt(req.params.id))).limit(1);
      if (!planRecord[0]) return res.status(404).json({ error: 'Plan not found' });

      await db.update(subscriptionPlans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(subscriptionPlans.id, parseInt(req.params.id)));

      res.json({ success: true, planId: planRecord[0].planId });
    } catch (error) {
      console.error('Admin archive plan error:', error);
      res.status(500).json({ error: 'Failed to archive plan' });
    }
  });

  // POST /api/admin/wholesalers/:id/change-plan — manual plan reassignment
  app.post('/api/admin/wholesalers/:id/change-plan', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { planId: newPlanId } = req.body;
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

      if (currentStripeSubId) {
        if (newPlanId === 'free') {
          // Downgrade to free: cancel the Stripe subscription with proration
          await SubscriptionService.proratedFreeDowngrade(currentStripeSubId, targetUser.id);
        } else if (targetPlan.stripePriceId) {
          // Paid → paid: branch upgrade vs downgrade by comparing prices
          const [currentPlan] = await db.select({ monthlyPrice: subscriptionPlans.monthlyPrice })
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.planId, targetUser.currentPlan || targetUser.subscriptionTier || 'free'));
          const currentPrice = parseFloat((currentPlan?.monthlyPrice as string) || '0');
          const newPrice = parseFloat(targetPlan.monthlyPrice as string);
          const isDowngrade = newPrice < currentPrice;

          if (isDowngrade) {
            await SubscriptionService.immediateDowngradeWithProration(
              currentStripeSubId,
              targetPlan.stripePriceId,
              newPlanId,
            );
          } else {
            await SubscriptionService.upgradeSubscriptionWithProration(
              currentStripeSubId,
              targetPlan.stripePriceId,
              newPlanId,
            );
          }
          // Update DB to reflect new plan
          await storage.updateUser(targetUser.id, {
            currentPlan: newPlanId,
            subscriptionTier: newPlanId,
            subscriptionStatus: 'active',
            productLimit,
          });
          await db.update(userSubscriptions).set({
            planId: newPlanId,
            status: 'active',
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, targetUser.id));
        }
      } else {
        // No active Stripe subscription — admin comped / force-set
        await storage.updateUser(targetUser.id, {
          currentPlan: newPlanId,
          subscriptionTier: newPlanId,
          subscriptionStatus: newPlanId === 'free' ? 'free' : 'active',
          productLimit,
          stripeSubscriptionId: null,
        });
        // Upsert userSubscriptions record
        const [existingSub] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, targetUser.id));
        if (existingSub) {
          await db.update(userSubscriptions).set({
            planId: newPlanId,
            status: newPlanId === 'free' ? 'canceled' : 'active',
            updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, targetUser.id));
        } else if (newPlanId !== 'free') {
          await db.insert(userSubscriptions).values({
            userId: targetUser.id,
            planId: newPlanId,
            status: 'active',
          });
        }
      }

      res.json({ success: true, userId: targetUser.id, newPlanId });
    } catch (error) {
      console.error('Admin change-plan error:', error);
      res.status(500).json({ error: 'Failed to change plan' });
    }
  });

  // ── Global Search ────────────────────────────────────────────────────────────

  // GET /api/admin/search?q= — search orders, customers, products
  app.get('/api/admin/search', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { q = '' } = req.query as Record<string, string>;
      const term = q.trim();
      if (!term || term.length < 2) return res.json({ orders: [], customers: [], products: [] });

      const searchPat = `%${term}%`;

      const [matchedOrders, matchedCustomers, matchedProducts] = await Promise.all([
        db.select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          wholesalerName: users.businessName,
          status: orders.status,
          createdAt: orders.createdAt,
        }).from(orders)
          .leftJoin(users, eq(orders.wholesalerId, users.id))
          .where(or(
            ilike(orders.orderNumber, searchPat),
            ilike(orders.customerName, searchPat),
          ))
          .orderBy(desc(orders.createdAt))
          .limit(5),

        db.select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          businessName: users.businessName,
          phoneNumber: users.phoneNumber,
          email: users.email,
          wholesalerId: users.wholesalerId,
        }).from(users)
          .where(and(
            inArray(users.role, ['customer', 'retailer']),
            or(
              ilike(users.firstName, searchPat),
              ilike(users.lastName, searchPat),
              ilike(users.businessName, searchPat),
              ilike(users.phoneNumber, searchPat),
              ilike(users.email, searchPat),
            ),
          ))
          .limit(5),

        db.select({
          id: products.id,
          name: products.name,
          category: products.category,
          wholesalerName: users.businessName,
          status: products.status,
          price: products.price,
        }).from(products)
          .leftJoin(users, eq(products.wholesalerId, users.id))
          .where(ilike(products.name, searchPat))
          .limit(5),
      ]);

      // Resolve wholesaler names for customers
      const custWholesalerIds = [...new Set(matchedCustomers.map(c => c.wholesalerId).filter(Boolean))] as string[];
      const custWholesalers: Record<string, string> = {};
      if (custWholesalerIds.length > 0) {
        const ws = await db.select({ id: users.id, businessName: users.businessName }).from(users).where(inArray(users.id, custWholesalerIds));
        for (const w of ws) custWholesalers[w.id] = w.businessName || 'Unknown';
      }

      res.json({
        orders: matchedOrders.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          wholesalerName: o.wholesalerName,
          status: o.status,
          createdAt: o.createdAt,
        })),
        customers: matchedCustomers.map(c => ({
          id: c.id,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.businessName || 'Unknown',
          phoneNumber: c.phoneNumber,
          email: c.email,
          wholesalerName: c.wholesalerId ? (custWholesalers[c.wholesalerId] || 'Unknown') : 'No wholesaler',
        })),
        products: matchedProducts.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          wholesalerName: p.wholesalerName,
          status: p.status,
          price: parseFloat(p.price || '0'),
        })),
      });
    } catch (error) {
      console.error('Admin search error:', error);
      res.status(500).json({ error: 'Failed to search' });
    }
  });

  // POST /api/admin/cleanup-test-data
  // Deletes all orders, order items, stock movements, notifications, and SMS codes
  // for users flagged as is_test_account = true.
  app.post('/api/admin/cleanup-test-data', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) return res.status(403).json({ error: 'Forbidden' });

      // Step 1: Find all test account user IDs
      const testUsers = await db.select({ id: users.id }).from(users).where(eq(users.isTestAccount, true));
      const testUserIds = testUsers.map(u => u.id);

      if (testUserIds.length === 0) {
        return res.json({ message: 'No test accounts found. Nothing to delete.', deleted: {} });
      }

      // Wrap all deletions in a transaction so a mid-operation failure leaves no partial state
      const { deleted } = await db.transaction(async (trx) => {
        // Step 2: Find all order IDs belonging to test accounts
        const testOrders = await trx.select({ id: orders.id })
          .from(orders)
          .where(inArray(orders.retailerId, testUserIds));
        const txOrderIds = testOrders.map(o => o.id);

        const counts: Record<string, number> = {
          orderItems: 0,
          orders: 0,
          stockMovements: 0,
          stockUpdateNotifications: 0,
          customerProfileUpdateNotifications: 0,
          smsVerificationCodes: 0,
        };

        // Step 3: Delete order dependencies first, then orders themselves
        if (txOrderIds.length > 0) {
          const di = await trx.delete(orderItems)
            .where(inArray(orderItems.orderId, txOrderIds))
            .returning({ id: orderItems.id });
          counts.orderItems = di.length;

          const dm = await trx.delete(stockMovements)
            .where(inArray(stockMovements.orderId, txOrderIds))
            .returning({ id: stockMovements.id });
          counts.stockMovements = dm.length;

          const do_ = await trx.delete(orders)
            .where(inArray(orders.id, txOrderIds))
            .returning({ id: orders.id });
          counts.orders = do_.length;
        }

        // Step 4: Delete stock update notifications by wholesaler ID (covers test wholesaler accounts)
        const dsn = await trx.delete(stockUpdateNotifications)
          .where(inArray(stockUpdateNotifications.wholesalerId, testUserIds))
          .returning({ id: stockUpdateNotifications.id });
        counts.stockUpdateNotifications = dsn.length;

        // Step 5: Delete customer-scoped notifications and SMS codes
        const dpn = await trx.delete(customerProfileUpdateNotifications)
          .where(inArray(customerProfileUpdateNotifications.customerId, testUserIds))
          .returning({ id: customerProfileUpdateNotifications.id });
        counts.customerProfileUpdateNotifications = dpn.length;

        const dsms = await trx.delete(smsVerificationCodes)
          .where(inArray(smsVerificationCodes.customerId, testUserIds))
          .returning({ id: smsVerificationCodes.id });
        counts.smsVerificationCodes = dsms.length;

        return { deleted: counts };
      });

      console.log(`🧹 Admin cleanup-test-data: removed`, deleted, `for ${testUserIds.length} test account(s)`);
      res.json({
        message: `Cleanup complete. Deleted data for ${testUserIds.length} test account(s).`,
        testAccounts: testUserIds,
        deleted,
      });
    } catch (error) {
      console.error('Admin cleanup-test-data error:', error);
      res.status(500).json({ error: 'Failed to clean up test data' });
    }
  });

  // PATCH /api/admin/users/:id/test-account
  // Toggles the is_test_account flag on any user.
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

      console.log(`🏷️ Admin set is_test_account=${isTestAccount} on user ${userId} (${updated.email})`);
      res.json({ success: true, user: updated });
    } catch (error) {
      console.error('Admin test-account toggle error:', error);
      res.status(500).json({ error: 'Failed to update test account flag' });
    }
  });

  // Shared helper: fetch the set of table names that actually exist in public schema.
  // Used by both the preview and reset endpoints to guard against missing tables
  // in older production databases where not all migrations have run yet.
  const getExistingTables = async (): Promise<Set<string>> => {
    const result = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    return new Set(result.rows.map(r => r.tablename));
  };

  // GET /api/admin/go-live-reset/preview
  // Returns row counts of everything that would be deleted — no data changes.
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
        wholesalers: wholesalerCount,
        customers: retailerCount,
        orders: orderCount,
        orderItems: orderItemCount,
        stockMovements: stockMovementCount,
        products: productCount,
        productBatches: productBatchCount,
        stockAlerts: stockAlertCount,
        broadcasts: broadcastCount,
        messageTemplates: messageTemplateCount,
        campaigns: templateCampaignCount,
        templateProducts: templateProductCount,
        customerGroups: customerGroupCount,
        customerGroupMembers: customerGroupMemberCount,
        relationships: relationshipCount,
        invitations: invitationCount,
        registrationRequests: registrationCount,
        deliveryAddresses: deliveryAddressCount,
        smsCodes: smsCodeCount,
        onboardingMilestones: onboardingCount,
        userBadges: userBadgeCount,
        subscriptions: subscriptionCount,
        teamMembers: teamMemberCount,
        tabPermissions: tabPermissionCount,
        priceLists: priceListCount,
        priceListItems: priceListItemCount,
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
  // Wipes all test data from the platform, preserving only the admin account.
  // Body: { confirm: "RESET" }
  //
  // Strategy: TRUNCATE ... CASCADE on every table except `users` and `sessions`.
  // PostgreSQL handles FK ordering automatically and CASCADE clears any legacy
  // tables that reference the truncated tables (e.g. old renamed tables in prod).
  // User rows that must be preserved are handled with WHERE-clause DELETEs after
  // the TRUNCATE.  Row counts are captured before the TRUNCATE for the response.
  app.post('/api/admin/go-live-reset', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || '')) return res.status(403).json({ error: 'Forbidden' });

      const { confirm } = req.body;
      if (confirm !== 'RESET') {
        return res.status(400).json({ error: 'Confirmation text must be exactly "RESET"' });
      }

      // Find admin user ID (hello@quikpik.co)
      const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'hello@quikpik.co'));
      if (!adminUser) return res.status(500).json({ error: 'Admin user not found' });

      // Discover every table currently in the public schema.
      const existing = await getExistingTables();

      // Tables we deliberately exclude from the TRUNCATE list:
      //  - 'users' / 'sessions' / 'session': handled separately with WHERE clauses
      //    or must be preserved entirely.
      //  - 'user_subscriptions': handled with a WHERE-clause DELETE so the admin's
      //    own subscription row is kept; TRUNCATE would wipe it before we could filter.
      //  - 'subscription_plans': platform config (free/standard/premium plan definitions)
      //    — never test data and must never be wiped. Also prevents CASCADE from reaching
      //    user_subscriptions via the planId FK (user_subscriptions.planId → subscription_plans).
      const preservedTables = new Set([
        'users', 'session', 'sessions',
        'user_subscriptions',    // handled with WHERE DELETE — admin sub must survive
        'subscription_plans',    // platform config; also blocks CASCADE into user_subscriptions
        '__drizzle_migrations',  // migration bookkeeping — never test data
      ]);

      // Build the TRUNCATE target list — everything else in the schema.
      // This automatically includes any legacy tables in prod that reference
      // our current tables, so CASCADE handles them without needing to name them.
      const truncateTargets = [...existing].filter(t => !preservedTables.has(t));

      // ── Pre-count rows for the success response ────────────────────────────
      // Capture counts before wiping so the response mirrors the preview breakdown
      // the admin saw before confirming. Legacy tables are wiped implicitly by CASCADE
      // but aren't counted here (they weren't shown in the preview either).
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

      console.log(`🗑️  Go-live reset: TRUNCATE CASCADE targeting ${truncateTargets.length} tables: ${truncateTargets.join(', ')}`);

      // ── Transaction ────────────────────────────────────────────────────────
      await db.transaction(async (trx) => {
        // Step 1: TRUNCATE all non-user tables with CASCADE.
        // Postgres handles FK ordering automatically; CASCADE clears any
        // referencing legacy tables (e.g. whatsapp_broadcast_campaigns) that
        // aren't in the current schema.
        if (truncateTargets.length > 0) {
          const tableList = truncateTargets.map(t => `"${t}"`).join(', ');
          await trx.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
        }

        // Step 2: Delete non-admin users (need WHERE, so can't TRUNCATE).
        await trx.delete(users).where(inArray(users.role, ['customer', 'retailer']));
        await trx.delete(users).where(
          and(eq(users.role, 'wholesaler'), sql`email != 'hello@quikpik.co'`)
        );

        // Step 3: Delete non-admin subscriptions (preserve admin sub).
        if (existing.has('user_subscriptions')) {
          await trx.delete(userSubscriptions).where(sql`user_id != ${adminUser.id}`);
        }

        // Step 4: Reset order number counter on admin user.
        await trx.update(users).set({ orderNumberCounter: 0 }).where(eq(users.id, adminUser.id));
      });

      const deleted: Record<string, number> = {
        wholesalers: wholesalerCount,
        customers: retailerCount,
        orders: orderCount,
        orderItems: orderItemCount,
        stockMovements: stockMovementCount,
        products: productCount,
        productBatches: productBatchCount,
        stockAlerts: stockAlertCount,
        broadcasts: broadcastCount,
        messageTemplates: messageTemplateCount,
        campaigns: templateCampaignCount,
        templateProducts: templateProductCount,
        customerGroups: customerGroupCount,
        customerGroupMembers: customerGroupMemberCount,
        relationships: relationshipCount,
        invitations: invitationCount,
        registrationRequests: registrationCount,
        deliveryAddresses: deliveryAddressCount,
        smsCodes: smsCodeCount,
        onboardingMilestones: onboardingCount,
        userBadges: userBadgeCount,
        subscriptions: subscriptionCount,
        teamMembers: teamMemberCount,
        tabPermissions: tabPermissionCount,
        priceLists: priceListCount,
        priceListItems: priceListItemCount,
        priceListAssignments: priceListAssignmentCount,
        analyticsInsights: customerInsightCount + businessIntelligenceCount + inventoryInsightCount + financialPerformanceCount + productPerfCount + promotionAnalyticsCount,
        notifications: stockUpdateNotifCount + customerProfileNotifCount,
      };
      const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);

      console.log(`🚀 Go-live reset complete via TRUNCATE CASCADE. Key counts:`, deleted);
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
        createdAt: new Date(),
        updatedAt: new Date(),
      }, password);

      const appUrl = process.env.APP_URL || 'https://quikpik.co';
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1a7a3d;">Welcome to Quikpik — Your Test Account is Ready</h2>
          <p>Hi ${firstName.trim()},</p>
          <p>Your tester account has been created by the Quikpik team. Here are your login credentials:</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:4px 0;"><strong>Email:</strong> ${emailNorm}</p>
            <p style="margin:4px 0;"><strong>Password:</strong> ${password}</p>
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
          to: emailNorm,
          from: 'hello@quikpik.co',
          subject: 'Your Quikpik Tester Account',
          html,
          text: `Welcome to Quikpik!\n\nHi ${firstName.trim()},\n\nYour tester account has been set up.\n\nEmail: ${emailNorm}\nPassword: ${password}\n\nLog in at: ${appUrl}/login\n\nPlease change your password after first login.`,
        });
      } catch (emailErr) {
        emailSent = false;
        console.warn(`⚠️ Invite email failed for new tester ${emailNorm}:`, emailErr);
      }

      console.log(`✅ Admin created test account for ${emailNorm} (emailSent=${emailSent})`);
      res.json({ success: true, id: newUser.id, email: newUser.email, emailSent });
    } catch (error) {
      console.error('Admin create-test-account error:', error);
      res.status(500).json({ error: 'Failed to create tester account.' });
    }
  });

}
