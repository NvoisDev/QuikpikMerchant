import type { Express } from "express";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import {
  storage, db, requireAuth, requireNotViewer, requireMemberPermission,
  orders, orderCancellationRequests, products, productBatches,
  sql, eq, and, desc, inArray, or, count, sum, isNull,
  buildInvoicePdf, getStripeClient, isLiveMode,
  users, wholesalerCustomerRelationships,
} from "./shared";
import { businessProfiles } from "@shared/schema";
import { getOrderStats } from "../services/analyticsService";

export async function resolveInvoiceWholesaler(order: any, wholesaler: any): Promise<any> {
  if (!order.businessProfileId) return wholesaler;
  const profile = await storage.getBusinessProfile(order.businessProfileId);
  if (!profile || profile.wholesalerId !== order.wholesalerId) return wholesaler;
  return {
    ...wholesaler,
    businessName: profile.name,
    ...(profile.address ? { businessAddress: profile.address, city: null, postalCode: null, country: null } : {}),
    ...(profile.logoUrl ? { logoUrl: profile.logoUrl, logoType: null } : {}),
  };
}

export function registerOrderReadRoutes(app: Express): void {
  // GET /api/orders/drafts — list draft orders for the authenticated wholesaler
  app.get('/api/orders/drafts', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const drafts = await db.select().from(orders)
        .where(and(eq(orders.wholesalerId, wholesalerId), sql`${orders.status} = 'draft'`))
        .orderBy(desc(orders.createdAt));
      const today = new Date().toISOString().split('T')[0];
      const draftsWithItems = await Promise.all(drafts.map(async (draft) => {
        const items = await storage.getOrderItems(draft.id);
        // Check stock for each item to surface warnings on the draft list
        const stockIssues: { productName: string; available: number; requested: number }[] = [];
        for (const item of items) {
          if (!item.productId) continue;
          const [product] = await db.select().from(products).where(eq(products.id, item.productId));
          if (!product) continue;
          const sellingType = (item.sellingType || 'units') as 'units' | 'pallets';
          const unitsPerPallet = product.unitsPerPallet ?? 1;
          const quantityInPack = product.quantityInPack ?? 1;
          const baseUnitsNeeded = sellingType === 'pallets'
            ? item.quantity * unitsPerPallet * quantityInPack
            : item.quantity;
          const [batchRow] = await db.select({ total: sum(productBatches.quantity) })
            .from(productBatches)
            .where(and(
              eq(productBatches.productId, item.productId),
              eq(productBatches.status, 'active'),
              or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
            ));
          const available = batchRow?.total != null ? Number(batchRow.total) : (product.stock ?? 0);
          if (available < baseUnitsNeeded) {
            stockIssues.push({ productName: product.name, available, requested: baseUnitsNeeded });
          }
        }
        return { ...draft, items, hasStockIssue: stockIssues.length > 0, stockIssues };
      }));
      res.json(draftsWithItems);
    } catch (error) {
      console.error('Error fetching drafts:', error);
      res.status(500).json({ error: 'Failed to fetch drafts' });
    }
  });

  // GET /api/orders/pending-count
  app.get('/api/orders/pending-count', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);

      const result = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.wholesalerId, wholesalerId),
          sql`${orders.status} != 'draft'`,
          sql`NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`
        ));

      res.json({ count: Number(result[0]?.count || 0) });
    } catch (error) {
      console.error("Error fetching pending order count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // GET /api/orders/stale-count — orders unfulfilled for 15+ days
  app.get('/api/orders/stale-count', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      const UNFULFILLED_STATUSES = ['pending', 'paid', 'confirmed', 'processing'];

      const staleCondition = and(
        eq(orders.wholesalerId, wholesalerId),
        inArray(orders.status, UNFULFILLED_STATUSES),
        sql`${orders.createdAt} < ${fifteenDaysAgo.toISOString()}`
      );

      const [countResult, previewResult] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(orders).where(staleCondition),
        db.select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          createdAt: orders.createdAt,
          status: orders.status,
        }).from(orders).where(staleCondition).orderBy(orders.createdAt).limit(3),
      ]);

      res.json({ count: Number(countResult[0]?.count || 0), orders: previewResult });
    } catch (error) {
      console.error("Error fetching stale order count:", error);
      res.status(500).json({ message: "Failed to fetch stale count" });
    }
  });

  // GET /api/orders
  app.get('/api/orders', requireAuth, async (req: any, res) => {
    try {
      const search = req.query.search; // search term
      
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = resolveWholesalerId(req);
      
      const ordersList = await storage.getOrders(wholesalerId, undefined, search);
      
      res.json(ordersList);
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace available');
      res.status(500).json({ 
        message: "Failed to fetch orders",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/orders/by-number/:orderNumber
  app.get('/api/orders/by-number/:orderNumber', async (req: any, res) => {
    try {
      const { orderNumber } = req.params;
      const { session_id } = req.query;

      // Session ID is required for security
      if (!session_id) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      // Validate Stripe session ID — use environment-aware fallback (test-account sessions
      // are created with the test client and are invisible to the live client)
      try {
        const primaryClient = getStripeClient(!isLiveMode());
        const secondaryClient = getStripeClient(isLiveMode());
        let session: any;
        try {
          session = await primaryClient.checkout.sessions.retrieve(session_id as string);
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.code === 'resource_missing') {
            session = await secondaryClient.checkout.sessions.retrieve(session_id as string);
          } else {
            throw e;
          }
        }
        // Verify the session's order number matches
        if (session.metadata?.orderNumber !== orderNumber) {
          return res.status(403).json({ error: 'Session does not match order' });
        }
        // Verify session is completed/paid
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          return res.status(403).json({ error: 'Payment not completed' });
        }
      } catch (stripeError) {
        console.error('Stripe session validation failed:', stripeError);
        return res.status(403).json({ error: 'Invalid session' });
      }
      
      const [order] = await db.select({
        orderNumber: orders.orderNumber,
        total: orders.total,
        amountPaid: orders.amountPaid,
        amountOutstanding: orders.amountOutstanding,
        paymentStatus: orders.paymentStatus,
      })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Error fetching order by number:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  // GET /api/orders/stats  ← must be before /:id to avoid 'stats' being parsed as an orderId
  app.get('/api/orders/stats', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const stats = await getOrderStats(wholesalerId, req.query.archiveTab as string || 'active');
      res.json({ ...stats, isCapped: false });
    } catch (error) {
      console.error("❌ Error fetching order statistics:", error);
      res.status(500).json({ 
        message: "Failed to fetch order statistics",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/orders/:id
  app.get('/api/orders/:id', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the user has access to this order (data isolation)
      const userId = resolveWholesalerId(req);
      
      if (order.wholesalerId !== userId && order.retailerId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Fetch cancellation request for this order if exists
      const [cancellationRequest] = await db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.orderId, orderId))
        .orderBy(desc(orderCancellationRequests.requestedAt))
        .limit(1);

      res.json({
        ...order,
        vatEnabled: order.wholesaler?.vatEnabled ?? false,
        vatRate: order.wholesaler?.vatRate ?? '0.2000',
        cancellationRequest: cancellationRequest ? {
          id: cancellationRequest.id,
          status: cancellationRequest.status,
          reasonCategory: cancellationRequest.reasonCategory,
          reasonNotes: cancellationRequest.reasonNotes,
          requestedAt: cancellationRequest.requestedAt,
          respondedAt: cancellationRequest.respondedAt,
          responseMessage: cancellationRequest.responseMessage,
          refundType: cancellationRequest.refundType
        } : null
      });
    } catch (error) {
      console.error(`❌ Error fetching order ${req.params.id}:`, error);
      res.status(500).json({ 
        message: "Failed to fetch order details",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/orders-paginated
  app.get('/api/orders-paginated', requireAuth, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page || '1');
      const limit = parseInt(req.query.limit || '20');
      const search = req.query.search;
      const customerId = req.query.customerId;
      const archiveTab = req.query.archiveTab || 'active';
      const paymentStatusParam = req.query.paymentStatus as string | undefined;
      const fulfillmentTypeParam = req.query.fulfillmentType as string | undefined;
      const statusParam = req.query.status as string | undefined;
      const staleParam = req.query.stale as string | undefined;
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = resolveWholesalerId(req);
      
      // Build search conditions - customerId takes priority over text search
      // Always exclude draft orders from the main orders list
      const searchConditions: any[] = [eq(orders.wholesalerId, wholesalerId), sql`${orders.status} != 'draft'`];
      if (customerId) {
        searchConditions.push(eq(orders.retailerId, customerId));
      } else if (search && search.trim()) {
        const searchValue = '%' + search.trim() + '%';
        searchConditions.push(or(
          sql`${orders.orderNumber} ILIKE ${searchValue}`,
          sql`${orders.customerName} ILIKE ${searchValue}`,
          sql`${orders.customerEmail} ILIKE ${searchValue}`,
          sql`${orders.customerPhone} ILIKE ${searchValue}`
        ));
      }
      // Payment status filter
      if (paymentStatusParam === 'paid') {
        // Paid = paymentStatus is paid AND not cancelled (refunded orders are cancelled)
        searchConditions.push(eq(orders.paymentStatus, 'paid'));
        searchConditions.push(sql`${orders.status} != 'cancelled'`);
      } else if (paymentStatusParam === 'part_paid') {
        searchConditions.push(eq(orders.paymentStatus, 'part_paid'));
      } else if (paymentStatusParam === 'unpaid') {
        // Unpaid = no payment at all (excludes part_paid)
        searchConditions.push(sql`(${orders.paymentStatus} IS NULL OR ${orders.paymentStatus} = 'unpaid')`);
      }

      // Delivery type filter (pickup = collection, delivery = delivery)
      if (fulfillmentTypeParam) {
        searchConditions.push(eq(orders.fulfillmentType, fulfillmentTypeParam));
      }

      // Status filter (unfulfilled = multiple statuses, otherwise exact match)
      if (statusParam) {
        const UNFULFILLED_STATUSES = ['pending', 'paid', 'confirmed', 'processing'];
        if (statusParam === 'unfulfilled') {
          searchConditions.push(inArray(orders.status, UNFULFILLED_STATUSES));
        } else {
          searchConditions.push(eq(orders.status, statusParam));
        }
      }

      // Stale filter: unfulfilled orders created more than 15 days ago
      if (staleParam === '1') {
        const UNFULFILLED_STATUSES = ['pending', 'paid', 'confirmed', 'processing'];
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        searchConditions.push(inArray(orders.status, UNFULFILLED_STATUSES));
        searchConditions.push(sql`${orders.createdAt} < ${fifteenDaysAgo.toISOString()}`);
      }

      // Archived = cancelled OR (fulfilled AND paid)
      // Active = everything else
      const archivedCondition = or(
        eq(orders.status, 'cancelled'),
        and(eq(orders.status, 'fulfilled'), eq(orders.paymentStatus, 'paid'))
      );

      const tabFilter = archiveTab === 'all'
        ? and(...searchConditions)
        : archiveTab === 'archived'
          ? and(...searchConditions, archivedCondition!)
          : and(...searchConditions, sql`NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`);

      // Also get counts for both tabs (using search filter but not tab filter)
      const baseFilter = and(...searchConditions);

      // Run count, paginated results, and stats all in parallel — no full-table fetch
      const [totalCountResult, ordersResult, tabStatsResult, baseStatsResult] = await Promise.all([
        db.select({ count: count() }).from(orders).where(tabFilter),
        db.select().from(orders).where(tabFilter).orderBy(desc(orders.createdAt)).limit(limit).offset((page - 1) * limit),
        db.select({
          paidOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.paymentStatus} = 'paid' AND ${orders.status} != 'cancelled' THEN 1 END)::int`,
          pendingOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'pending' THEN 1 END)::int`,
          totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} != 'cancelled' THEN (${orders.subtotal}::numeric - ${orders.platformFee}::numeric) ELSE 0 END), 0)::float`,
        }).from(orders).where(tabFilter),
        db.select({
          activeCount: sql<number>`COUNT(CASE WHEN NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid')) THEN 1 END)::int`,
          archivedCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid') THEN 1 END)::int`,
        }).from(orders).where(baseFilter),
      ]);

      const totalOrders = totalCountResult[0].count;
      const totalPages = Math.ceil(totalOrders / limit);
      const { paidOrdersCount, pendingOrdersCount, totalRevenue } = tabStatsResult[0];
      const { activeCount, archivedCount } = baseStatsResult[0];

      // Fetch cancellation requests for this page's orders only
      const orderIds = ordersResult.map(o => o.id);
      let cancellationRequestsMap: Record<number, any> = {};

      if (orderIds.length > 0) {
        const requests = await db.select()
          .from(orderCancellationRequests)
          .where(inArray(orderCancellationRequests.orderId, orderIds));

        requests.forEach(req => {
          cancellationRequestsMap[req.orderId] = {
            id: req.id,
            status: req.status,
            reasonCategory: req.reasonCategory,
            reasonNotes: req.reasonNotes,
            requestedAt: req.requestedAt,
            respondedAt: req.respondedAt,
            responseMessage: req.responseMessage,
            refundType: req.refundType
          };
        });
      }

      // Batch-fetch business profile names for orders that have a businessProfileId
      const profileIds = Array.from(new Set(ordersResult.map(o => o.businessProfileId).filter((id): id is number => id != null)));
      let profileNameMap: Record<number, string> = {};
      if (profileIds.length > 0) {
        const profiles = await db
          .select({ id: businessProfiles.id, name: businessProfiles.name })
          .from(businessProfiles)
          .where(inArray(businessProfiles.id, profileIds));
        profileNameMap = profiles.reduce((acc, p) => { acc[p.id] = p.name; return acc; }, {} as Record<number, string>);
      }

      // Batch-fetch picking status for this page's orders
      let pickingStatusMap: Record<number, string> = {};
      if (orderIds.length > 0) {
        const { orderPicking } = await import("@shared/schema");
        const pickingRows = await db.select({ orderId: orderPicking.orderId, pickingStatus: orderPicking.pickingStatus })
          .from(orderPicking)
          .where(inArray(orderPicking.orderId, orderIds));
        pickingRows.forEach(p => { pickingStatusMap[p.orderId] = p.pickingStatus; });
      }

      // Batch-fetch live retailer (customer) records for all orders on this page
      const retailerIds = Array.from(new Set(ordersResult.map(o => o.retailerId).filter(Boolean)));
      let retailerMap: Record<string, { firstName: string | null; lastName: string | null; businessName: string | null; phoneNumber: string | null }> = {};
      if (retailerIds.length > 0) {
        const [retailerRows, displayNameRows] = await Promise.all([
          db.select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            businessName: users.businessName,
            phoneNumber: users.phoneNumber,
          }).from(users).where(inArray(users.id, retailerIds)),
          db.select({
            retailerId: wholesalerCustomerRelationships.customerId,
            displayName: wholesalerCustomerRelationships.displayName,
          }).from(wholesalerCustomerRelationships).where(
            and(
              eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
              inArray(wholesalerCustomerRelationships.customerId, retailerIds)
            )
          ),
        ]);
        const displayNameByRetailer: Record<string, string | null> = {};
        displayNameRows.forEach(r => { displayNameByRetailer[r.retailerId] = r.displayName ?? null; });
        retailerRows.forEach(r => {
          retailerMap[r.id] = {
            firstName: displayNameByRetailer[r.id] ?? r.firstName,
            lastName: displayNameByRetailer[r.id] ? null : r.lastName,
            businessName: r.businessName,
            phoneNumber: r.phoneNumber,
          };
        });
      }

      // Attach cancellation request, business profile name, picking status, and live retailer to each order
      const ordersWithRequests = ordersResult.map(order => ({
        ...order,
        cancellationRequest: cancellationRequestsMap[order.id] || null,
        businessProfileName: order.businessProfileId ? (profileNameMap[order.businessProfileId] ?? null) : null,
        pickingStatus: pickingStatusMap[order.id] ?? 'not_started',
        retailer: order.retailerId ? (retailerMap[order.retailerId] ?? null) : null,
      }));
      
      res.json({
        orders: ordersWithRequests,
        currentPage: page,
        totalPages,
        total: totalOrders,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        stats: {
          activeCount,
          archivedCount,
          paidOrdersCount,
          pendingOrdersCount,
          totalRevenue,
          ordersCount: activeCount
        }
      });
    } catch (error) {
      console.error("❌ Error fetching paginated orders:", error);
      res.status(500).json({ 
        message: "Failed to fetch orders",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/cancellation-requests
  app.get('/api/cancellation-requests', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const status = req.query.status as string || undefined;
      
      let query = db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.wholesalerId, wholesalerId));
      
      if (status) {
        query = db.select()
          .from(orderCancellationRequests)
          .where(and(
            eq(orderCancellationRequests.wholesalerId, wholesalerId),
            eq(orderCancellationRequests.status, status as 'pending' | 'approved' | 'rejected')
          ));
      }
      
      const requests = await query.orderBy(desc(orderCancellationRequests.requestedAt));
      
      // Enrich with order and customer details
      const enrichedRequests = await Promise.all(requests.map(async (request) => {
        const order = await storage.getOrder(request.orderId);
        const customer = await storage.getUser(request.customerId);
        return {
          ...request,
          order: order ? {
            id: order.id,
            orderNumber: order.orderNumber,
            total: order.total,
            status: order.status,
            createdAt: order.createdAt,
          } : null,
          customer: customer ? {
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phoneNumber: customer.phoneNumber,
            businessName: customer.businessName,
          } : null,
        };
      }));
      
      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching cancellation requests:", error);
      res.status(500).json({ message: "Failed to fetch cancellation requests" });
    }
  });

  // GET /api/cancellation-requests/pending-count
  app.get('/api/cancellation-requests/pending-count', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.wholesalerId, wholesalerId),
          eq(orderCancellationRequests.status, 'pending')
        ));
      
      res.json({ count: Number(result[0]?.count || 0) });
    } catch (error) {
      console.error("Error fetching pending cancellation count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // GET /api/orders/:id/invoice
  app.get('/api/orders/:id/invoice', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: "Not authorized" });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: "Wholesaler not found" });

      const effectiveWholesaler = await resolveInvoiceWholesaler(order, wholesaler);
      const bankProfile = await storage.getDefaultBusinessProfile(order.wholesalerId);

      const pdfAmountPaid = order.amountPaid ? parseFloat(order.amountPaid) : undefined;
      const pdfAmountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : undefined;
      const pdfBuffer = await buildInvoicePdf(order, effectiveWholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod), pdfAmountPaid, pdfAmountOutstanding, bankProfile ?? undefined);
      const filename = `invoice-${order.orderNumber || order.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // GET /api/orders/:id/invoice/customer
  app.get('/api/orders/:id/invoice/customer', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });

      const [effectiveWholesaler, bankProfile] = await Promise.all([
        resolveInvoiceWholesaler(order, wholesaler),
        storage.getDefaultBusinessProfile(order.wholesalerId),
      ]);

      const pdfAmountPaid = order.amountPaid ? parseFloat(order.amountPaid) : undefined;
      const pdfAmountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : undefined;
      const pdfBuffer = await buildInvoicePdf(order, effectiveWholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod), pdfAmountPaid, pdfAmountOutstanding, bankProfile ?? undefined);
      const filename = `invoice-${order.orderNumber || order.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating customer invoice:', error);
      res.status(500).json({ message: 'Failed to generate invoice' });
    }
  });

  // GET /api/orders/:id/stripe-customer-data
  app.get('/api/orders/:id/stripe-customer-data', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can view customer data for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view customer data for this order" });
      }

      if (!order.stripePaymentIntentId) {
        return res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

      try {
        const wholesaler = await storage.getUser(order.wholesalerId);
        const stripe = getStripeClient(Boolean(wholesaler?.isTestAccount));
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        const customerData = {
          customerName: paymentIntent.metadata?.customerName || order.customerName || null,
          customerEmail: paymentIntent.metadata?.customerEmail || order.customerEmail || null,
          customerPhone: paymentIntent.metadata?.customerPhone || order.customerPhone || null
        };

        res.json(customerData);
      } catch (stripeError) {
        console.error("Error retrieving Stripe customer data:", stripeError);
        // Return stored data as fallback
        res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ message: "Failed to fetch customer data" });
    }
  });
}
