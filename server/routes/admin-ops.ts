/**
 * ADMIN SECURITY AUDIT — admin-ops.ts
 * Audited: 2026-06-23
 *
 * Guard pattern: ALL routes use requireAuth + ADMIN_EMAILS.includes(getAdminEmail(req))
 * getAdminEmail reads req._adminEmail (impersonation) || req.user?.email (session)
 *
 * Route → Guard                                              Notes
 * ─────────────────────────────────────────────────────────────────────────
 * GET  /api/admin/products                                   ✅ admin-only; cross-tenant, intentional
 * GET  /api/admin/alerts                                     ✅ admin-only; bounded queries (limit 20)
 * GET  /api/admin/wholesalers/:id/orders                     ✅ admin-only; limit 10, no pagination leak
 * GET  /api/admin/orders/:id/items                           ✅ admin-only; integer orderId validated
 * POST /api/admin/orders/:id/resend-invoice                  ✅ admin-only; integer orderId validated
 * POST /api/admin/orders/:id/issue-refund                    ✅ admin-only; uses wholesaler stripe mode
 * GET  /api/admin/stripe-mode                                ✅ admin-only; returns configured booleans only (no key material)
 * GET  /api/admin/payout-status                              ✅ admin-only; platform Stripe account
 * GET  /api/admin/activity                                   ✅ admin-only; paginated (max 100/page)
 * GET  /api/admin/errors                                     ✅ admin-only; paginated (max 200)
 * GET  /api/admin/service-errors                             ✅ admin-only; limit 50
 * POST /api/admin/impersonate/exit                           ✅ admin-only; wholesalerId mismatch check + audit log
 * POST /api/admin/impersonate/:wholesalerId                  ✅ admin-only + impersonateLimiter (5/15 min); verifies wholesaler role; audit logged
 * GET  /api/admin/impersonate/status                         ✅ admin-only; read-only session header check
 */
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import {
  ADMIN_EMAILS, adminAuditLogs, and, asc, count, db, desc, eq, formatPackDescriptor,
  getAdminEmail, getStripeClient, gte, inArray, lte, or, orderItems, orders, products, productBatches,
  refundAcrossPaymentIntents, requireAuth, sendCustomerInvoiceEmail, sql,
  stockMovements, subscriptionAuditLogs, customerProfileUpdateNotifications,
  systemErrorLogs, users,
} from "./shared";

const impersonateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many impersonation requests from this IP. Please try again later.' },
});

export function registerAdminOpsRoutes(app: Express): void {
  // GET /api/admin/products
  app.get('/api/admin/products', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { sort = 'margin_asc' } = req.query as Record<string, string>;

      const productList = await db.select({
        id: products.id, name: products.name, wholesalerId: products.wholesalerId,
        wholesalerName: users.businessName, price: products.price, costPrice: products.costPrice,
        status: products.status,
        stock: products.stock, palletStock: products.palletStock,
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
          hasZeroStock: (Number(p.stock) || 0) === 0 && (Number(p.palletStock) || 0) === 0,
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

  // GET /api/admin/stripe-mode
  app.get('/api/admin/stripe-mode', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { isLiveMode: liveMode, STRIPE_ENVIRONMENT: env } = await import('../stripeConfig');
      res.json({
        mode: liveMode() ? 'live' : 'test',
        environment: env,
        testKeyConfigured: (process.env.STRIPE_SECRET_KEY || '').length > 0,
        liveKeyConfigured: (process.env.STRIPE_LIVE_SECRET_KEY || '').length > 0,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to determine Stripe mode' });
    }
  });

  // GET /api/admin/payout-status
  app.get('/api/admin/payout-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const { from, to } = req.query as Record<string, string>;
      const toDate = to ? new Date(to) : null;
      if (toDate) toDate.setHours(23, 59, 59, 999);
      const hasPeriodFilter = !!(from || to);

      const platformStripe = getStripeClient();

      const payoutListParams: Record<string, any> = { limit: hasPeriodFilter ? 100 : 1 };
      if (hasPeriodFilter) {
        payoutListParams.created = {};
        if (from) payoutListParams.created.gte = Math.floor(new Date(from).getTime() / 1000);
        if (toDate) payoutListParams.created.lte = Math.floor(toDate.getTime() / 1000);
      }

      const [balance, payouts, lastPayoutList] = await Promise.all([
        platformStripe.balance.retrieve(),
        hasPeriodFilter ? platformStripe.payouts.list(payoutListParams) : Promise.resolve(null),
        platformStripe.payouts.list({ limit: 1 }),
      ]);

      const gbpAvailable = balance.available.find((b: any) => b.currency === 'gbp');
      const gbpPending   = balance.pending.find((b: any)   => b.currency === 'gbp');

      const periodPayouts = (payouts?.data ?? []).map((p: any) => ({
        amount: p.amount / 100,
        status: p.status,
        arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
      }));
      const periodPayoutTotal = periodPayouts
        .filter((p: any) => p.status === 'paid' || p.status === 'in_transit')
        .reduce((s: number, p: any) => s + p.amount, 0);
      const periodPayoutCount = periodPayouts.length;

      res.json({
        available: (gbpAvailable?.amount ?? 0) / 100,
        pending:   (gbpPending?.amount   ?? 0) / 100,
        currency:  'gbp',
        lastPayout: lastPayoutList.data[0]
          ? { amount: lastPayoutList.data[0].amount / 100, status: lastPayoutList.data[0].status, arrivalDate: new Date(lastPayoutList.data[0].arrival_date * 1000).toISOString() }
          : null,
        hasPeriodFilter,
        periodPayoutTotal,
        periodPayoutCount,
        periodPayouts: periodPayouts.slice(0, 10),
      });
    } catch (error) {
      console.error('Admin payout-status error:', error);
      res.status(500).json({ error: 'Failed to fetch payout status' });
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
}
