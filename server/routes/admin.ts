import type { Express } from "express";
import { ilike } from "drizzle-orm";
import {
  ADMIN_EMAILS, and, count, db, desc, eq, geocodePostcode, gte, inArray, isNull, lte, or, orders,
  requireAuth, storage, stripe, subscriptionPlans, userSubscriptions, users, products, orderItems,
  sendCustomerInvoiceEmail, asc, sql, productBatches, subscriptionAuditLogs, refundAcrossPaymentIntents,
} from "./shared";

export function registerAdminRoutes(app: Express): void {
  // GET /api/admin/platform-stats
  app.get('/api/admin/platform-stats', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const PLAN_PRICES: Record<string, number> = { free: 0, standard: 19.99, premium: 39.99 };

      const [allWholesalers, allOrdersData, newWholesalers, ordersThisMonth, todayOrdersData] = await Promise.all([
        db.select({ subscriptionTier: users.subscriptionTier, archived: users.archived, subscriptionStatus: users.subscriptionStatus })
          .from(users).where(eq(users.role, 'wholesaler')),
        db.select({
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
        }).from(orders),
        db.select({ count: count() }).from(users)
          .where(and(eq(users.role, 'wholesaler'), gte(users.createdAt, monthStart))),
        db.select({ count: count() }).from(orders)
          .where(gte(orders.createdAt, monthStart)),
        db.select({ subtotal: orders.subtotal }).from(orders)
          .where(gte(orders.createdAt, todayStart)),
      ]);

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

      let totalGMV = 0, totalCustomerFees = 0, totalPlatformFees = 0;
      for (const o of allOrdersData) {
        totalGMV += parseFloat(o.subtotal || '0');
        totalCustomerFees += parseFloat(o.customerTransactionFee || '0');
        totalPlatformFees += parseFloat(o.platformFee || '0');
      }

      const todayOrders = todayOrdersData.length;
      const todayRevenue = todayOrdersData.reduce((sum, o) => sum + parseFloat(o.subtotal || '0'), 0);

      res.json({
        totalWholesalers,
        activeWholesalers,
        suspendedWholesalers,
        wholesalersByPlan,
        totalOrders: allOrdersData.length,
        ordersThisMonth: Number(ordersThisMonth[0]?.count || 0),
        todayOrders,
        todayRevenue,
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const wholesalersList = await db.select().from(users).where(eq(users.role, 'wholesaler')).orderBy(desc(users.createdAt));

      const wholesalerIds = wholesalersList.map(w => w.id);
      let ordersByWholesaler: Record<string, { count: number; gmv: number; customerFees: number; platformFees: number; lastOrderAt: Date | null }> = {};

      if (wholesalerIds.length > 0) {
        const orderStats = await db.select({
          wholesalerId: orders.wholesalerId,
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
          createdAt: orders.createdAt,
        }).from(orders).where(inArray(orders.wholesalerId, wholesalerIds));

        for (const o of orderStats) {
          const wid = o.wholesalerId;
          if (!ordersByWholesaler[wid]) ordersByWholesaler[wid] = { count: 0, gmv: 0, customerFees: 0, platformFees: 0, lastOrderAt: null };
          ordersByWholesaler[wid].count++;
          ordersByWholesaler[wid].gmv += parseFloat(o.subtotal || '0');
          ordersByWholesaler[wid].customerFees += parseFloat(o.customerTransactionFee || '0');
          ordersByWholesaler[wid].platformFees += parseFloat(o.platformFee || '0');
          const oDate = o.createdAt ? new Date(o.createdAt) : null;
          if (oDate && (!ordersByWholesaler[wid].lastOrderAt || oDate > ordersByWholesaler[wid].lastOrderAt!)) {
            ordersByWholesaler[wid].lastOrderAt = oDate;
          }
        }
      }

      const result = wholesalersList.map(w => {
        const stats = ordersByWholesaler[w.id] || { count: 0, gmv: 0, customerFees: 0, platformFees: 0, lastOrderAt: null };
        return {
          id: w.id,
          email: w.email,
          firstName: w.firstName,
          lastName: w.lastName,
          businessName: w.businessName,
          phoneNumber: w.phoneNumber,
          subscriptionTier: w.subscriptionTier || 'free',
          createdAt: w.createdAt,
          archived: w.archived,
          orderCount: stats.count,
          totalGMV: stats.gmv,
          customerFeesEarned: stats.customerFees,
          platformFeesEarned: stats.platformFees,
          totalFeesEarned: stats.customerFees + stats.platformFees,
          lastOrderAt: stats.lastOrderAt,
        };
      }).sort((a, b) => b.totalFeesEarned - a.totalFeesEarned);

      res.json(result);
    } catch (error) {
      console.error('Admin wholesalers error:', error);
      res.status(500).json({ error: 'Failed to fetch wholesalers' });
    }
  });

  // GET /api/admin/revenue
  app.get('/api/admin/revenue', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

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
        })
        .from(orders)
        .leftJoin(users, eq(orders.wholesalerId, users.id))
        .where(and(
          from ? gte(orders.createdAt, new Date(from)) : undefined,
          toDate ? lte(orders.createdAt, toDate) : undefined,
          filterWholesalerId ? eq(orders.wholesalerId, filterWholesalerId) : undefined,
        ))
        .orderBy(desc(orders.createdAt))
        .limit(1000);

      let totalCustomerFees = 0, totalPlatformFees = 0, totalGMV = 0;
      const processedOrders = recentOrders.map(o => {
        const custFee = parseFloat(o.customerTransactionFee || '0');
        const platFee = parseFloat(o.platformFee || '0');
        const sub = parseFloat(o.subtotal || '0');
        totalCustomerFees += custFee;
        totalPlatformFees += platFee;
        totalGMV += sub;
        return {
          ...o,
          customerTransactionFee: custFee,
          platformFee: platFee,
          subtotal: sub,
          totalQuikpikIncome: custFee + platFee,
        };
      });

      res.json({
        orders: processedOrders,
        totals: {
          totalCustomerFees,
          totalPlatformFees,
          totalGrossRevenue: totalCustomerFees + totalPlatformFees,
          totalGMV,
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

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

  // GET /api/admin/customers/map
  app.get('/api/admin/customers/map', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

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
        .where(eq(users.role, 'retailer'))
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

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
      if (target[0].role !== 'retailer') return res.status(400).json({ error: 'Target user is not a customer' });

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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const pending = await db
        .select({ id: users.id, postalCode: users.postalCode })
        .from(users)
        .where(and(eq(users.role, 'retailer'), or(isNull(users.latitude), isNull(users.longitude))));

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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const { stripeSubscriptionId, planId: overridePlanId } = req.body;
      if (!stripeSubscriptionId) {
        return res.status(400).json({ error: 'stripeSubscriptionId is required' });
      }
      if (overridePlanId !== undefined && !['standard', 'premium'].includes(overridePlanId)) {
        return res.status(400).json({ error: 'planId override must be "standard" or "premium"' });
      }

      // Fetch subscription from Stripe
      let stripeSub: Stripe.Subscription;
      try {
        stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
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

  // GET /api/admin/customers — search across all customers/retailers
  app.get('/api/admin/customers', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
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
        archived: users.archived,
        createdAt: users.createdAt,
      }).from(users).where(and(
        eq(users.role, 'retailer'),
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
      const [targetUser] = await db.select({ id: users.id, role: users.role })
        .from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
      if (targetUser.role !== 'retailer') return res.status(400).json({ error: 'Can only flag customers (retailer role)' });
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
      const { sort = 'margin_asc' } = req.query as Record<string, string>;

      const productList = await db.select({
        id: products.id,
        name: products.name,
        wholesalerId: products.wholesalerId,
        wholesalerName: users.businessName,
        price: products.price,
        costPrice: products.costPrice,
        status: products.status,
        baseUnitStock: products.baseUnitStock,
        category: products.category,
      }).from(products)
        .leftJoin(users, eq(products.wholesalerId, users.id))
        .where(inArray(products.status, ['active', 'inactive', 'locked']))
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
          hasZeroStock: (p.baseUnitStock || 0) === 0,
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

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
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, order.id));

      await sendCustomerInvoiceEmail(customer, order, items.map(i => ({
        name: i.productName || 'Product',
        quantity: i.quantity,
        unitPrice: parseFloat(i.unitPrice || '0'),
        total: parseFloat(i.total || '0'),
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
      const key = process.env.STRIPE_SECRET_KEY || '';
      const mode = key.startsWith('sk_live_') ? 'live' : 'test';
      res.json({ mode, keyPrefix: key.slice(0, 8) + '...' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to determine Stripe mode' });
    }
  });

  // GET /api/admin/payout-status — Stripe platform balance and last payout
  app.get('/api/admin/payout-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
      if (!stripe) return res.json({ available: 0, pending: 0, lastPayout: null, currency: 'gbp' });

      const [balance, payouts] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.payouts.list({ limit: 1 }),
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
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const refundOrderId = parseInt(req.params.id, 10);
      if (isNaN(refundOrderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const [order] = await db.select().from(orders).where(eq(orders.id, refundOrderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!order.stripePaymentIntentId) return res.status(400).json({ error: 'No payment intent on this order' });

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

}
