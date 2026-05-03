import type { Express } from "express";
import { ilike } from "drizzle-orm";
import {
  ADMIN_EMAILS, and, asc, count, db, desc, eq, geocodePostcode, gte, inArray, isNull, lte, or,
  orders, orderItems, products, productBatches, requireAuth, sql, stockMovements,
  subscriptionAuditLogs, systemErrorLogs, teamMembers, userSubscriptions, users,
  sendCustomerInvoiceEmail, formatPackDescriptor, customerProfileUpdateNotifications,
  subscriptionPlans,
} from "./shared";

function getAdminEmail(req: any): string | undefined {
  return req._adminEmail || req.user?.email;
}

export function registerAdminCoreRoutes(app: Express): void {
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

      const activeStandard = allWholesalers.filter(w => w.subscriptionTier === 'standard' && !w.archived).length;
      const activePremium  = allWholesalers.filter(w => w.subscriptionTier === 'premium'  && !w.archived).length;
      const subscriptionMRR = (activeStandard * PLAN_PRICES.standard) + (activePremium * PLAN_PRICES.premium);
      const subscriptionBreakdown = {
        standard: { count: activeStandard, mrr: activeStandard * PLAN_PRICES.standard },
        premium:  { count: activePremium,  mrr: activePremium  * PLAN_PRICES.premium  },
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
        totalWholesalers, activeWholesalers, suspendedWholesalers, wholesalersByPlan,
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
          isTestAccount: w.isTestAccount ?? false,
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
          legalBusinessName: w.legalBusinessName ?? null,
          vatNumber: w.vatNumber ?? null,
          companyRegistrationNumber: w.companyRegistrationNumber ?? null,
          isCustomPricing: subscriptionByWholesaler[w.id]?.isCustomPricing ?? false,
          internalNote: subscriptionByWholesaler[w.id]?.internalNote ?? null,
          customPriceExpiresAt: subscriptionByWholesaler[w.id]?.customPriceExpiresAt ?? null,
        };
      }).sort((a, b) => {
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
          id: orders.id, orderNumber: orders.orderNumber, wholesalerId: orders.wholesalerId,
          wholesalerName: users.businessName, customerName: orders.customerName,
          subtotal: orders.subtotal, customerTransactionFee: orders.customerTransactionFee,
          platformFee: orders.platformFee, total: orders.total, status: orders.status,
          paymentStatus: orders.paymentStatus, createdAt: orders.createdAt,
          stripeActualFee: orders.stripeActualFee, paymentMethod: orders.paymentMethod,
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

      res.json({
        orders: processedOrders,
        totals: {
          totalCustomerFees, totalPlatformFees, totalGrossRevenue, totalGMV,
          totalStripeProcessingFees: parseFloat(totalStripeProcessingFees.toFixed(2)),
          totalGrossProfit, grossMarginPct,
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

  // GET /api/admin/products
  app.get('/api/admin/products', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { sort = 'margin_asc' } = req.query as Record<string, string>;

      const productList = await db.select({
        id: products.id, name: products.name, wholesalerId: products.wholesalerId,
        wholesalerName: users.businessName, price: products.price, costPrice: products.costPrice,
        status: products.status,
        baseUnitStock: sql<number>`COALESCE((
          SELECT SUM(${productBatches.quantity})
          FROM ${productBatches}
          WHERE ${productBatches.productId} = ${products.id}
            AND ${productBatches.status} = 'active'
            AND (${productBatches.expiryDate} IS NULL OR ${productBatches.expiryDate} >= CURRENT_DATE)
        ), 0)`,
        category: products.category, quantityInPack: products.quantityInPack,
        unitSize: products.unitSize, unitOfMeasure: products.unitOfMeasure,
      }).from(products)
        .leftJoin(users, eq(products.wholesalerId, users.id))
        .where(and(inArray(products.status, ['active', 'inactive', 'locked']), eq(users.isTestAccount, false)))
        .orderBy(desc(products.id))
        .limit(2000);

      const enriched = productList.map(p => {
        const price = parseFloat(p.price || '0');
        const cost = p.costPrice ? parseFloat(p.costPrice) : null;
        const margin = cost !== null && price > 0 ? ((price - cost) / price) * 100 : null;
        return {
          ...p, price, costPrice: cost, margin,
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

  // GET /api/admin/alerts
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
        db.select({ id: productBatches.id, productId: productBatches.productId, expiryDate: productBatches.expiryDate, batchCode: productBatches.batchNumber, quantity: productBatches.quantity })
          .from(productBatches)
          .where(and(sql`${productBatches.expiryDate} IS NOT NULL`, sql`${productBatches.expiryDate} >= ${todayStr}`, sql`${productBatches.expiryDate} <= ${sevenDaysOutStr}`))
          .orderBy(asc(productBatches.expiryDate)).limit(20),
        db.select({ id: subscriptionAuditLogs.id, userId: subscriptionAuditLogs.userId, createdAt: subscriptionAuditLogs.timestamp })
          .from(subscriptionAuditLogs)
          .where(and(eq(subscriptionAuditLogs.eventType, 'payment_failed'), gte(subscriptionAuditLogs.timestamp, thirtyDaysAgo)))
          .orderBy(desc(subscriptionAuditLogs.timestamp)).limit(20),
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

  // GET /api/admin/wholesalers/:id/orders
  app.get('/api/admin/wholesalers/:id/orders', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const recentOrders = await db.select({
        id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName,
        subtotal: orders.subtotal, status: orders.status, paymentStatus: orders.paymentStatus, createdAt: orders.createdAt,
      }).from(orders).where(eq(orders.wholesalerId, req.params.id))
        .orderBy(desc(orders.createdAt)).limit(10);
      res.json({ orders: recentOrders });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch wholesaler orders' });
    }
  });

  // GET /api/admin/orders/:id/items
  app.get('/api/admin/orders/:id/items', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const orderId = parseInt(req.params.id, 10);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const items = await db.select({
        id: orderItems.id, productName: products.name, quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice, total: orderItems.total, sellingType: orderItems.sellingType,
        quantityInPack: products.quantityInPack, unitSize: products.unitSize,
        unitOfMeasure: products.unitOfMeasure, appliedOfferLabel: orderItems.appliedOfferLabel,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, orderId));
      res.json({ items });
    } catch (error) {
      console.error('Admin order items error:', error);
      res.status(500).json({ error: 'Failed to fetch order items' });
    }
  });

  // POST /api/admin/orders/:id/resend-invoice
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
        productName: products.name, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice,
        total: orderItems.total, quantityInPack: products.quantityInPack, unitSize: products.unitSize, unitOfMeasure: products.unitOfMeasure,
      }).from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, order.id));

      await sendCustomerInvoiceEmail(customer, order, items.map(i => ({
        name: i.productName || 'Product',
        productName: i.productName || 'Product',
        quantity: i.quantity,
        unitPrice: parseFloat(i.unitPrice || '0'),
        total: parseFloat(i.total || '0'),
        packDescriptor: formatPackDescriptor(i.quantityInPack, i.unitSize, i.unitOfMeasure),
        product: { name: i.productName || 'Product', quantityInPack: i.quantityInPack, unitSize: i.unitSize, unitOfMeasure: i.unitOfMeasure },
      })), wholesaler);

      res.json({ success: true });
    } catch (error) {
      console.error('Admin resend-invoice error:', error);
      res.status(500).json({ error: 'Failed to resend invoice' });
    }
  });

  // GET /api/admin/activity
  app.get('/api/admin/activity', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { offset = '0', limit = '50', wholesalerId: wFilter } = req.query as Record<string, string>;
      const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      const allWholesalers = await db.select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.role, 'wholesaler'));
      const wMap: Record<string, string> = {};
      for (const w of allWholesalers) wMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';

      const [movements, subLogs, profileUpdates, recentOrders] = await Promise.all([
        db.select({
          id: stockMovements.id, productId: stockMovements.productId, wholesalerId: stockMovements.wholesalerId,
          movementType: stockMovements.movementType, quantity: stockMovements.quantity,
          reason: stockMovements.reason, customerName: stockMovements.customerName, createdAt: stockMovements.createdAt,
        }).from(stockMovements)
          .where(wFilter ? eq(stockMovements.wholesalerId, wFilter) : undefined)
          .orderBy(desc(stockMovements.createdAt)).limit(200),

        db.select({
          id: subscriptionAuditLogs.id, userId: subscriptionAuditLogs.userId,
          eventType: subscriptionAuditLogs.eventType, fromTier: subscriptionAuditLogs.fromTier,
          toTier: subscriptionAuditLogs.toTier, amount: subscriptionAuditLogs.amount,
          reason: subscriptionAuditLogs.reason, timestamp: subscriptionAuditLogs.timestamp,
        }).from(subscriptionAuditLogs)
          .where(wFilter ? eq(subscriptionAuditLogs.userId, wFilter) : undefined)
          .orderBy(desc(subscriptionAuditLogs.timestamp)).limit(200),

        db.select({
          id: customerProfileUpdateNotifications.id, customerId: customerProfileUpdateNotifications.customerId,
          wholesalerId: customerProfileUpdateNotifications.wholesalerId,
          updateType: customerProfileUpdateNotifications.updateType,
          newValue: customerProfileUpdateNotifications.newValue, createdAt: customerProfileUpdateNotifications.createdAt,
        }).from(customerProfileUpdateNotifications)
          .where(wFilter ? eq(customerProfileUpdateNotifications.wholesalerId, wFilter) : undefined)
          .orderBy(desc(customerProfileUpdateNotifications.createdAt)).limit(200),

        db.select({
          id: orders.id, orderNumber: orders.orderNumber, wholesalerId: orders.wholesalerId,
          customerName: orders.customerName, status: orders.status,
          subtotal: orders.subtotal, createdAt: orders.createdAt,
        }).from(orders)
          .where(wFilter ? eq(orders.wholesalerId, wFilter) : undefined)
          .orderBy(desc(orders.createdAt)).limit(200),
      ]);

      const subUserIds = Array.from(new Set(subLogs.map(l => l.userId)));
      const subUsers: Record<string, string> = {};
      if (subUserIds.length > 0) {
        const fetched = await db.select({ id: users.id, email: users.email, businessName: users.businessName }).from(users).where(inArray(users.id, subUserIds));
        for (const u of fetched) subUsers[u.id] = u.businessName || u.email || u.id;
      }

      type ActivityEntry = { timestamp: Date; type: string; description: string; wholesalerName: string; actorName: string };
      const events: ActivityEntry[] = [];

      for (const m of movements) {
        events.push({
          timestamp: m.createdAt || new Date(), type: 'stock_movement',
          description: `Stock ${m.movementType?.replace(/_/g, ' ')} of ${Math.abs(m.quantity)} units${m.reason ? ` — ${m.reason}` : ''}`,
          wholesalerName: wMap[m.wholesalerId] || 'Unknown', actorName: m.customerName || 'System',
        });
      }
      for (const s of subLogs) {
        const isFailure = s.eventType?.includes('fail') || s.eventType?.includes('error');
        events.push({
          timestamp: s.timestamp || new Date(), type: isFailure ? 'payment_failure' : 'subscription_event',
          description: `Subscription ${s.eventType?.replace(/_/g, ' ')}${s.fromTier && s.toTier ? ` (${s.fromTier} → ${s.toTier})` : ''}${s.amount ? ` £${parseFloat(String(s.amount)).toFixed(2)}` : ''}`,
          wholesalerName: subUsers[s.userId] || 'Unknown', actorName: subUsers[s.userId] || 'System',
        });
      }
      for (const p of profileUpdates) {
        events.push({
          timestamp: p.createdAt || new Date(), type: 'profile_update',
          description: `Customer updated ${p.updateType?.replace(/_/g, ' ')}`,
          wholesalerName: wMap[p.wholesalerId] || 'Unknown', actorName: 'Customer',
        });
      }
      for (const o of recentOrders) {
        events.push({
          timestamp: o.createdAt || new Date(), type: 'order',
          description: `Order ${o.orderNumber} placed — £${parseFloat(o.subtotal || '0').toFixed(2)} (${o.status})`,
          wholesalerName: wMap[o.wholesalerId] || 'Unknown', actorName: o.customerName || 'Customer',
        });
      }

      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const total = events.length;
      const page = events.slice(offsetNum, offsetNum + limitNum).map(e => ({ ...e, timestamp: e.timestamp.toISOString() }));

      res.json({ events: page, total, offset: offsetNum, limit: limitNum });
    } catch (error) {
      console.error('Admin activity error:', error);
      res.status(500).json({ error: 'Failed to fetch activity feed' });
    }
  });

  // GET /api/admin/errors
  app.get('/api/admin/errors', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });

      const { limit = '50' } = req.query as Record<string, string>;
      const limitNum = Math.min(200, parseInt(limit, 10) || 50);
      const fetchCap = Math.min(400, limitNum * 4);

      const [dbErrors, paymentFailures] = await Promise.all([
        db.select().from(systemErrorLogs).orderBy(desc(systemErrorLogs.createdAt)).limit(fetchCap),
        db.select({
          id: subscriptionAuditLogs.id, userId: subscriptionAuditLogs.userId,
          eventType: subscriptionAuditLogs.eventType, amount: subscriptionAuditLogs.amount,
          reason: subscriptionAuditLogs.reason, timestamp: subscriptionAuditLogs.timestamp,
        }).from(subscriptionAuditLogs)
          .where(inArray(subscriptionAuditLogs.eventType, [
            'payment_failed', 'subscription_payment_failed', 'subscription_cancelled',
            'subscription_expired', 'invoice_failed',
          ]))
          .orderBy(desc(subscriptionAuditLogs.timestamp)).limit(fetchCap),
      ]);

      const failureUserIds = Array.from(new Set(paymentFailures.map(f => f.userId)));
      const failureUsers: Record<string, string> = {};
      if (failureUserIds.length > 0) {
        const fetched = await db.select({ id: users.id, email: users.email, businessName: users.businessName }).from(users).where(inArray(users.id, failureUserIds));
        for (const u of fetched) failureUsers[u.id] = u.businessName || u.email || u.id;
      }

      const errorWholesalerIds = dbErrors.map(e => e.wholesalerId).filter(Boolean) as string[];
      const errorWholesalers: Record<string, string> = {};
      if (errorWholesalerIds.length > 0) {
        const fetched = await db.select({ id: users.id, businessName: users.businessName }).from(users).where(inArray(users.id, errorWholesalerIds));
        for (const u of fetched) errorWholesalers[u.id] = u.businessName || u.id;
      }

      const allErrors = [
        ...dbErrors.map(e => ({
          id: `sys-${e.id}`, errorType: e.errorType, message: e.message, severity: e.severity,
          wholesalerName: e.wholesalerId ? (errorWholesalers[e.wholesalerId] || 'Unknown') : null,
          context: e.context, timestamp: e.createdAt?.toISOString() || new Date().toISOString(), source: 'system',
        })),
        ...paymentFailures.map(f => ({
          id: `pay-${f.id}`, errorType: 'payment_failed', message: f.reason || 'Payment failed',
          severity: 'error', wholesalerName: failureUsers[f.userId] || 'Unknown',
          context: { amount: f.amount, eventType: f.eventType },
          timestamp: f.timestamp?.toISOString() || new Date().toISOString(), source: 'stripe',
        })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const errors = allErrors.slice(0, limitNum);
      res.json({ errors, total: allErrors.length });
    } catch (error) {
      console.error('Admin errors error:', error);
      res.status(500).json({ error: 'Failed to fetch error log' });
    }
  });

  // GET /api/admin/service-errors
  app.get('/api/admin/service-errors', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const entries = await db
        .select().from(systemErrorLogs)
        .where(inArray(systemErrorLogs.errorType, ['sendgrid', 'twilio', 'openai']))
        .orderBy(desc(systemErrorLogs.createdAt)).limit(50);
      res.json({ errors: entries.map(e => ({
        id: e.id, service: e.errorType,
        endpoint: (e.context as Record<string, unknown>)?.endpoint ?? null,
        message: e.message, severity: e.severity, context: e.context,
        wholesalerId: e.wholesalerId, timestamp: e.createdAt?.toISOString(),
      })) });
    } catch (error) {
      console.error('Admin service-errors error:', error);
      res.status(500).json({ error: 'Failed to fetch service error log' });
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
}
