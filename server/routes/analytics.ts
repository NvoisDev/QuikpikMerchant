import type { Express } from "express";
import {
  and, count, customerGroups, db, eq, gte, inArray, isNull, lte, openai, or, orderCancellationRequests,
  orderItems, orders, products, requireAuth, requireNotViewer, requireBooleanFeature, sql, storage, sum
} from "./shared";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import { productBatches } from "@shared/schema";
import { computeOrderNetValue } from "../utils/customer-spend";

export function registerAnalyticsRoutes(app: Express): void {
  // GET /api/analytics/cancellations
  app.get('/api/analytics/cancellations', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      
      const { timeRange = '30d' } = req.query;
      const now = new Date();
      let startDate: Date;
      
      switch (timeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      
      // Date-bounded queries — avoids loading all orders into memory on every analytics request
      const [cancelledOrders, [totalOrdersRow]] = await Promise.all([
        db.select().from(orders).where(and(
          eq(orders.wholesalerId, wholesalerId),
          eq(orders.status, 'cancelled'),
          gte(orders.createdAt, startDate)
        )),
        db.select({ count: count() }).from(orders).where(and(
          eq(orders.wholesalerId, wholesalerId),
          gte(orders.createdAt, startDate)
        )),
      ]);
      
      // Get cancellation requests
      const requests = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.wholesalerId, wholesalerId),
          gte(orderCancellationRequests.requestedAt, startDate)
        ));
      
      // Calculate metrics
      const totalCancelled = cancelledOrders.length;
      const totalRefunded = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.amountRefunded || '0'), 0);
      const totalValue = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
      
      // Cancellation reason breakdown
      const reasonBreakdown: Record<string, number> = {};
      cancelledOrders.forEach(o => {
        const reason = o.refundReason?.split(':')[0]?.trim() || 'Unknown';
        reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
      });
      
      // Customer-initiated vs wholesaler-initiated
      const customerInitiated = requests.filter(r => r.status === 'approved').length;
      const wholesalerInitiated = totalCancelled - customerInitiated;
      
      // Pending requests
      const pendingRequests = requests.filter(r => r.status === 'pending').length;
      const approvedRequests = requests.filter(r => r.status === 'approved').length;
      const rejectedRequests = requests.filter(r => r.status === 'rejected').length;
      
      // Calculate cancellation rate
      const totalOrders = Number(totalOrdersRow?.count ?? 0);
      const cancellationRate = totalOrders > 0 ? (totalCancelled / totalOrders * 100).toFixed(1) : '0';
      
      res.json({
        totalCancelled,
        totalRefunded: totalRefunded.toFixed(2),
        totalValue: totalValue.toFixed(2),
        cancellationRate,
        reasonBreakdown: Object.entries(reasonBreakdown).map(([reason, count]) => ({ reason, count })),
        initiatedBy: {
          customer: customerInitiated,
          wholesaler: wholesalerInitiated
        },
        requests: {
          pending: pendingRequests,
          approved: approvedRequests,
          rejected: rejectedRequests,
          total: requests.length
        }
      });
    } catch (error) {
      console.error("Error fetching cancellation analytics:", error);
      res.status(500).json({ message: "Failed to fetch cancellation analytics" });
    }
  });

  // GET /api/analytics/stats
  app.get('/api/analytics/stats', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const { fromDate, toDate } = req.query;
      
      let stats;
      if (fromDate && toDate) {
        stats = await storage.getWholesalerStatsForDateRange(targetUserId, new Date(fromDate), new Date(toDate));
      } else {
        stats = await storage.getWholesalerStats(targetUserId);
      }
      
      // Calculate WhatsApp reach from broadcasts
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      const whatsappReach = broadcastStats.recipientsReached || 0;
      
      // Get total customer count for calculating coverage
      const customerGroups = await storage.getCustomerGroups(targetUserId);
      const totalCustomers = customerGroups.reduce((total, group) => total + 0, 0); // memberCount not available in schema
      
      res.json({
        ...stats,
        whatsappReach,
        customerCount: totalCustomers
      });
    } catch (error) {
      console.error("Error fetching analytics stats:", error);
      res.status(500).json({ message: "Failed to fetch analytics stats" });
    }
  });

  // GET /api/analytics/chart-data
  app.get('/api/analytics/chart-data', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const targetUserId = resolveWholesalerId(req);
      const { fromDate, toDate } = req.query;
      
      if (!fromDate || !toDate) {
        return res.status(400).json({ message: "fromDate and toDate are required" });
      }
      
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      const now = new Date();
      
      // Ensure endDate doesn't exceed current time
      const actualEndDate = endDate > now ? now : endDate;
      
      // Fetch SQL-aggregated hourly buckets — avoids loading all order columns into memory
      const dataPoints = await storage.getChartDataAggregated(targetUserId, startDate, actualEndDate);

      // Helper: sum orderCount and revenue for aggregated points within a time window
      const bucketSlice = (from: Date, to: Date) => {
        const pts = dataPoints.filter(p => p.bucket >= from && p.bucket < to);
        return {
          orders: pts.reduce((s, p) => s + p.orderCount, 0),
          revenue: Math.round(pts.reduce((s, p) => s + p.revenue, 0) * 100) / 100,
        };
      };
      
      // Calculate time span to determine chart granularity
      const hoursDifference = (actualEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

      // Normalize the label start to a UTC calendar day boundary.
      // The frontend sends midnight local time as the fromDate. For UTC+ users this
      // arrives as late-night UTC on the previous calendar day (e.g. BST midnight =
      // UTC 23:00 yesterday). Snapping forward to UTC midnight when hours >= 12 fixes
      // the off-by-one day shift for all populated UTC+ timezones.
      const labelStart = new Date(startDate);
      labelStart.setUTCHours(0, 0, 0, 0);
      if (startDate.getUTCHours() >= 12) {
        labelStart.setUTCDate(labelStart.getUTCDate() + 1);
      }
      
      let chartData = [];

      if (hoursDifference <= 24) {
        // Hourly — today or yesterday
        const isToday = actualEndDate.toDateString() === now.toDateString();
        const maxHour = isToday
          ? Math.floor((now.getTime() - startDate.getTime()) / 3_600_000)
          : 23;

        for (let hour = 0; hour <= maxHour; hour++) {
          const hourStart = new Date(startDate.getTime() + hour * 3_600_000);
          const hourEnd   = new Date(startDate.getTime() + (hour + 1) * 3_600_000);
          const { orders, revenue } = bucketSlice(hourStart, hourEnd);
          chartData.push({ name: `${hour}:00`, revenue, orders });
        }
      } else if (hoursDifference <= 168) {
        // Daily with weekday names — 2 to 7 days
        const daysDiff = Math.round((actualEndDate.getTime() - labelStart.getTime()) / 86_400_000) + 1;
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(labelStart.getTime() + i * 86_400_000);
          const dayEnd   = new Date(labelStart.getTime() + (i + 1) * 86_400_000);
          if (dayStart > now) break;
          const { orders, revenue } = bucketSlice(dayStart, dayEnd);
          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
            revenue,
            orders,
          });
        }
      } else if (hoursDifference <= 744) {
        // Daily with date labels — 8 to 31 days
        const daysDiff = Math.round((actualEndDate.getTime() - labelStart.getTime()) / 86_400_000) + 1;
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(labelStart.getTime() + i * 86_400_000);
          const dayEnd   = new Date(labelStart.getTime() + (i + 1) * 86_400_000);
          if (dayStart > now) break;
          const { orders, revenue } = bucketSlice(dayStart, dayEnd);
          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue,
            orders,
          });
        }
      } else if (hoursDifference <= 2190) {
        // Weekly buckets with date label — 32 to 90 days
        const weeks = Math.ceil((actualEndDate.getTime() - labelStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
        for (let i = 0; i < weeks; i++) {
          const weekStart = new Date(labelStart.getTime() + i * 7 * 86_400_000);
          const weekEnd   = new Date(labelStart.getTime() + (i + 1) * 7 * 86_400_000);
          if (weekStart > now) break;
          const { orders, revenue } = bucketSlice(weekStart, weekEnd);
          chartData.push({
            name: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue,
            orders,
          });
        }
      } else {
        // Monthly buckets — 90+ days
        const spanYears = actualEndDate.getFullYear() - startDate.getFullYear();
        const multiYear = spanYears >= 1;
        let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

        while (cursor <= actualEndDate) {
          if (cursor > now) break;
          const monthStart = new Date(cursor);
          const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
          const { orders, revenue } = bucketSlice(monthStart, monthEnd);
          const label = multiYear
            ? monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            : monthStart.toLocaleDateString('en-US', { month: 'short' });
          chartData.push({ name: label, revenue, orders });
          cursor = monthEnd;
        }
      }
      
      res.json(chartData);
    } catch (error) {
      console.error("Error fetching chart data:", error);
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  // GET /api/analytics/top-products
  app.get('/api/analytics/top-products', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const { limit } = req.query;
      const topProducts = await storage.getTopProducts(targetUserId, limit ? parseInt(limit as string) : 5);
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).json({ message: "Failed to fetch top products" });
    }
  });

  // GET /api/analytics/recent-orders
  app.get('/api/analytics/recent-orders', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const { limit } = req.query;
      const recentOrders = await storage.getRecentOrders(targetUserId, limit ? parseInt(limit as string) : 10);
      res.json(recentOrders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ message: "Failed to fetch recent orders" });
    }
  });

  // GET /api/analytics/broadcast-stats
  app.get('/api/analytics/broadcast-stats', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      res.json(broadcastStats);
    } catch (error) {
      console.error("Error fetching broadcast stats:", error);
      res.status(500).json({ message: "Failed to fetch broadcast stats" });
    }
  });

  // GET /api/analytics/margin-summary
  app.get('/api/analytics/margin-summary', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const targetUserId = resolveWholesalerId(req);

      const { fromDate, toDate } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({ message: "fromDate and toDate are required" });
      }

      const startDate = new Date(fromDate as string);
      const endDate = new Date(toDate as string);
      // Ensure the end boundary covers the full day, capped to now
      const now = new Date();
      const actualEndDate = endDate > now ? now : endDate;

      const ordersInRange = await db
        .select({ id: orders.id, isQuote: orders.isQuote, orderSource: orders.orderSource, status: orders.status })
        .from(orders)
        .where(and(
          eq(orders.wholesalerId, targetUserId),
          gte(orders.createdAt, startDate),
          lte(orders.createdAt, actualEndDate),
        ));

      const validOrders = ordersInRange.filter(o => o.status !== 'cancelled' && o.status !== 'draft');

      const empty = { revenue: 0, cost: 0, margin: 0, marginPercent: 0, hasMissingCost: false };
      if (validOrders.length === 0) {
        return res.json({ quotes: { ...empty }, online: { ...empty }, total: { ...empty }, products: [] });
      }

      const orderIds = validOrders.map(o => o.id);

      const items = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          productName: products.name,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          batchId: orderItems.batchId,
          batchCostPrice: productBatches.costPrice,
          productCostPrice: products.costPrice,
          sellingType: orderItems.sellingType,
          unitsPerPallet: products.unitsPerPallet,
        })
        .from(orderItems)
        .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      // Compute WAC for every product referenced by these order items so we can
      // use it as the fallback cost instead of the stale products.costPrice.
      const uniqueProductIds = [...new Set(items.map(i => i.productId).filter((id): id is number => id != null))];
      const wacByProductId = new Map<number, string | null>();
      if (uniqueProductIds.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const wacRows = await db
          .select({
            productId: productBatches.productId,
            wac: sql<string | null>`
              SUM(CASE WHEN ${productBatches.costPrice} IS NOT NULL
                THEN ${productBatches.quantity}::numeric * ${productBatches.costPrice}::numeric
                ELSE 0 END) /
              NULLIF(SUM(CASE WHEN ${productBatches.costPrice} IS NOT NULL
                THEN ${productBatches.quantity} ELSE 0 END), 0)
            `,
          })
          .from(productBatches)
          .where(and(
            inArray(productBatches.productId, uniqueProductIds),
            eq(productBatches.status, 'active'),
            or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
          ))
          .groupBy(productBatches.productId);
        for (const row of wacRows) {
          wacByProductId.set(row.productId, row.wac != null ? String(row.wac) : null);
        }
      }

      const orderQuoteMap = new Map(validOrders.map(o => [o.id, (o.isQuote ?? false) || o.orderSource === 'wholesaler']));

      let quotesCoveredRevenue = 0, quotesCost = 0, quotesUncoveredRevenue = 0, quotesMissingCost = false;
      let onlineCoveredRevenue = 0, onlineCost = 0, onlineUncoveredRevenue = 0, onlineMissingCost = false;

      // Per-product accumulator for the breakdown table
      interface ProductAccum {
        productId: number;
        name: string;
        wac: number | null;
        // Mirror the top-level covered/uncovered split per product for accurate margin %
        coveredRevenue: number;
        uncoveredRevenue: number;
        cost: number;
        totalQty: number;
        coveredQty: number;
      }
      const productAccum = new Map<number, ProductAccum>();

      const getOrInitProduct = (productId: number, name: string, wac: number | null): ProductAccum => {
        if (!productAccum.has(productId)) {
          productAccum.set(productId, { productId, name, wac, coveredRevenue: 0, uncoveredRevenue: 0, cost: 0, totalQty: 0, coveredQty: 0 });
        }
        return productAccum.get(productId)!;
      };

      for (const item of items) {
        const isQuote = orderQuoteMap.get(item.orderId) ?? false;
        // Fallback chain: batch cost → WAC from current active batches → product-level fallback
        const productWAC = item.productId ? (wacByProductId.get(item.productId) ?? null) : null;
        const resolvedCostPrice = item.batchCostPrice ?? productWAC ?? item.productCostPrice ?? null;
        const hasCost = resolvedCostPrice !== null && resolvedCostPrice !== undefined;

        const revenue = parseFloat(item.unitPrice) * item.quantity;

        if (!hasCost) {
          // Track uncovered revenue separately so it appears in totals but doesn't
          // inflate margin percentages (which are only meaningful when cost is known)
          if (isQuote) {
            quotesUncoveredRevenue += revenue;
            quotesMissingCost = true;
          } else {
            onlineUncoveredRevenue += revenue;
            onlineMissingCost = true;
          }
          // Still accumulate revenue in per-product breakdown (with no cost)
          if (item.productId) {
            const acc = getOrInitProduct(item.productId, item.productName ?? 'Unknown', productWAC != null ? parseFloat(productWAC) : null);
            acc.uncoveredRevenue += revenue;
            acc.totalQty += item.quantity;
          }
          continue;
        }

        const unitMultiplier = item.sellingType === 'pallets' ? (item.unitsPerPallet || 1) : 1;
        const cost = parseFloat(resolvedCostPrice!) * item.quantity * unitMultiplier;

        if (isQuote) {
          quotesCoveredRevenue += revenue;
          quotesCost += cost;
        } else {
          onlineCoveredRevenue += revenue;
          onlineCost += cost;
        }

        // Accumulate per-product breakdown
        if (item.productId) {
          const acc = getOrInitProduct(item.productId, item.productName ?? 'Unknown', productWAC != null ? parseFloat(productWAC) : null);
          acc.coveredRevenue += revenue;
          acc.cost += cost;
          acc.totalQty += item.quantity;
          acc.coveredQty += item.quantity;
          if (acc.wac === null && productWAC != null) acc.wac = parseFloat(productWAC);
        }
      }

      // Revenue shown = covered + uncovered (real sales figure); margin is only on covered items
      const calcMetrics = (coveredRevenue: number, cost: number, uncoveredRevenue: number, hasMissingCost: boolean) => {
        const margin = coveredRevenue - cost;
        const marginPercent = coveredRevenue > 0 ? (margin / coveredRevenue) * 100 : 0;
        const totalRevenue = coveredRevenue + uncoveredRevenue;
        return {
          revenue: Math.round(totalRevenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: Math.round(marginPercent * 10) / 10,
          hasMissingCost,
        };
      };

      const totalPeriodRevenue = quotesCoveredRevenue + onlineCoveredRevenue + quotesUncoveredRevenue + onlineUncoveredRevenue;

      // Build per-product breakdown sorted by margin % ascending (worst first)
      const productBreakdown = Array.from(productAccum.values())
        .map(acc => {
          const totalRevenue = acc.coveredRevenue + acc.uncoveredRevenue;
          // margin % is computed only on covered revenue (same semantics as top-level calcMetrics)
          const margin = acc.coveredRevenue - acc.cost;
          const marginPercent = acc.coveredRevenue > 0 ? (margin / acc.coveredRevenue) * 100 : null;
          const revenueShare = totalPeriodRevenue > 0 ? (totalRevenue / totalPeriodRevenue) * 100 : 0;
          // Weighted-average selling price across all sold units (covered + uncovered)
          const avgSellingPrice = acc.totalQty > 0 ? totalRevenue / acc.totalQty : null;
          // Effective cost per unit: batch WAC if available, otherwise derive from what was
          // actually used in the margin calculation (product-level cost price fallback)
          const effectiveCostPerUnit = acc.wac != null
            ? acc.wac
            : acc.coveredQty > 0 ? acc.cost / acc.coveredQty : null;
          return {
            productId: acc.productId,
            name: acc.name,
            wac: effectiveCostPerUnit != null ? Math.round(effectiveCostPerUnit * 100) / 100 : null,
            avgSellingPrice: avgSellingPrice != null ? Math.round(avgSellingPrice * 100) / 100 : null,
            revenue: Math.round(totalRevenue * 100) / 100,
            cost: Math.round(acc.cost * 100) / 100,
            margin: Math.round(margin * 100) / 100,
            marginPercent: marginPercent != null ? Math.round(marginPercent * 10) / 10 : null,
            revenueShare: Math.round(revenueShare * 10) / 10,
            hasCost: acc.coveredRevenue > 0,
          };
        })
        .sort((a, b) => {
          // Products with no cost go to the bottom; among the rest sort by marginPercent ascending
          if (a.marginPercent === null && b.marginPercent === null) return 0;
          if (a.marginPercent === null) return 1;
          if (b.marginPercent === null) return -1;
          return a.marginPercent - b.marginPercent;
        });

      res.json({
        quotes: calcMetrics(quotesCoveredRevenue, quotesCost, quotesUncoveredRevenue, quotesMissingCost),
        online: calcMetrics(onlineCoveredRevenue, onlineCost, onlineUncoveredRevenue, onlineMissingCost),
        total: calcMetrics(
          quotesCoveredRevenue + onlineCoveredRevenue,
          quotesCost + onlineCost,
          quotesUncoveredRevenue + onlineUncoveredRevenue,
          quotesMissingCost || onlineMissingCost,
        ),
        products: productBreakdown,
      });
    } catch (error) {
      console.error("Error fetching margin summary:", error);
      res.status(500).json({ message: "Failed to fetch margin summary" });
    }
  });

  // GET /api/analytics/margin-product-orders
  // Returns per-invoice margin breakdown for a single product within a date window.
  app.get('/api/analytics/margin-product-orders', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const targetUserId = resolveWholesalerId(req);
      const { productId, fromDate, toDate } = req.query;
      if (!productId || !fromDate || !toDate) {
        return res.status(400).json({ message: "productId, fromDate and toDate are required" });
      }
      const pid = parseInt(productId as string, 10);
      if (isNaN(pid)) return res.status(400).json({ message: "productId must be a number" });

      const startDate = new Date(fromDate as string);
      const endDate = new Date(toDate as string);
      const now = new Date();
      const actualEndDate = endDate > now ? now : endDate;

      // Fetch valid orders in range for this wholesaler
      const ordersInRange = await db
        .select({ id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName, createdAt: orders.createdAt, isQuote: orders.isQuote, orderSource: orders.orderSource, status: orders.status })
        .from(orders)
        .where(and(
          eq(orders.wholesalerId, targetUserId),
          gte(orders.createdAt, startDate),
          lte(orders.createdAt, actualEndDate),
        ));

      const validOrders = ordersInRange.filter(o => o.status !== 'cancelled' && o.status !== 'draft');
      if (validOrders.length === 0) return res.json([]);

      const orderIds = validOrders.map(o => o.id);
      const orderMap = new Map(validOrders.map(o => [o.id, o]));

      // Fetch order items for this product only
      const items = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          batchId: orderItems.batchId,
          batchCostPrice: productBatches.costPrice,
          productCostPrice: products.costPrice,
          sellingType: orderItems.sellingType,
          unitsPerPallet: products.unitsPerPallet,
        })
        .from(orderItems)
        .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(and(
          inArray(orderItems.orderId, orderIds),
          eq(orderItems.productId, pid),
        ));

      // Compute WAC for this product from active batches
      const today = new Date().toISOString().split('T')[0];
      const wacRows = await db
        .select({
          wac: sql<string | null>`
            SUM(CASE WHEN ${productBatches.costPrice} IS NOT NULL
              THEN ${productBatches.quantity}::numeric * ${productBatches.costPrice}::numeric
              ELSE 0 END) /
            NULLIF(SUM(CASE WHEN ${productBatches.costPrice} IS NOT NULL
              THEN ${productBatches.quantity} ELSE 0 END), 0)
          `,
        })
        .from(productBatches)
        .where(and(
          eq(productBatches.productId, pid),
          eq(productBatches.status, 'active'),
          or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
        ));
      const wac = wacRows[0]?.wac != null ? parseFloat(wacRows[0].wac) : null;

      // Aggregate by order (a product can appear more than once per order in edge cases)
      interface LineAccum { orderId: number; revenue: number; cost: number | null; qty: number; unitPrice: number; unitCost: number | null; hasCost: boolean; }
      const lineMap = new Map<number, LineAccum>();

      for (const item of items) {
        const resolvedCostPrice = item.batchCostPrice ?? (wac != null ? String(wac) : null) ?? item.productCostPrice ?? null;
        const hasCost = resolvedCostPrice !== null;
        const revenue = parseFloat(item.unitPrice) * item.quantity;
        const unitMultiplier = item.sellingType === 'pallets' ? (item.unitsPerPallet || 1) : 1;
        const cost = hasCost ? parseFloat(resolvedCostPrice!) * item.quantity * unitMultiplier : null;
        const unitCost = hasCost ? parseFloat(resolvedCostPrice!) * unitMultiplier : null;

        const existing = lineMap.get(item.orderId);
        if (existing) {
          existing.revenue += revenue;
          existing.qty += item.quantity;
          if (cost !== null) existing.cost = (existing.cost ?? 0) + cost;
          if (!existing.hasCost && hasCost) { existing.hasCost = true; existing.unitCost = unitCost; }
        } else {
          lineMap.set(item.orderId, { orderId: item.orderId, revenue, cost, qty: item.quantity, unitPrice: parseFloat(item.unitPrice), unitCost, hasCost });
        }
      }

      const result = Array.from(lineMap.values()).map(line => {
        const order = orderMap.get(line.orderId)!;
        const margin = line.cost !== null ? line.revenue - line.cost : null;
        const marginPercent = (margin !== null && line.revenue > 0) ? (margin / line.revenue) * 100 : null;
        return {
          orderId: line.orderId,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          createdAt: order.createdAt,
          quantity: line.qty,
          unitPrice: Math.round(line.unitPrice * 100) / 100,
          unitCost: line.unitCost !== null ? Math.round(line.unitCost * 100) / 100 : null,
          revenue: Math.round(line.revenue * 100) / 100,
          cost: line.cost !== null ? Math.round(line.cost * 100) / 100 : null,
          margin: margin !== null ? Math.round(margin * 100) / 100 : null,
          marginPercent: marginPercent !== null ? Math.round(marginPercent * 10) / 10 : null,
          hasCost: line.hasCost,
        };
      }).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      res.json(result);
    } catch (error) {
      console.error("Error fetching margin product orders:", error);
      res.status(500).json({ message: "Failed to fetch margin product orders" });
    }
  });

  // GET /api/analytics/dashboard
  app.get('/api/analytics/dashboard', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const { timeRange = '30d' } = req.query;
      
      const stats = await storage.getWholesalerStats(targetUserId);
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      
      // Calculate change percentages (simplified - would need historical data)
      const analyticsData = {
        revenue: {
          total: stats.totalRevenue,
          change: 12.5, // Mock change percentage
          trend: []
        },
        orders: {
          total: stats.ordersCount,
          change: 8.3,
          trend: []
        },
        customers: {
          total: 25,
          new: 5,
          returning: 20,
          trend: []
        },
        products: {
          active: stats.activeProducts,
          lowStock: stats.lowStockCount,
          topPerformers: []
        },
        geography: [
          { region: "London", orders: 15, revenue: 1250 },
          { region: "Manchester", orders: 8, revenue: 680 },
          { region: "Birmingham", orders: 5, revenue: 420 }
        ],
        channels: [
          { channel: "WhatsApp", orders: 18, revenue: 1500 },
          { channel: "Direct", orders: 10, revenue: 850 }
        ],
        broadcasts: {
          sent: broadcastStats.totalBroadcasts,
          delivered: broadcastStats.recipientsReached,
          opened: Math.floor(broadcastStats.recipientsReached * 0.7),
          clicked: Math.floor(broadcastStats.recipientsReached * 0.3)
        }
      };
      
      res.json(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics dashboard:", error);
      res.status(500).json({ message: "Failed to fetch analytics dashboard" });
    }
  });

  // GET /api/analytics/revenue
  app.get('/api/analytics/revenue', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const { timeRange = '30d' } = req.query;
      
      // Generate sample revenue trend data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const revenueData = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        revenueData.push({
          date: date.toISOString().split('T')[0],
          amount: Math.floor(Math.random() * 200) + 50
        });
      }
      
      res.json(revenueData);
    } catch (error) {
      console.error("Error fetching revenue data:", error);
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  });

  // GET /api/analytics/products
  app.get('/api/analytics/products', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = resolveWholesalerId(req);
        
      const topProducts = await storage.getTopProducts(targetUserId, 10);
      
      // Format for chart display
      const productPerformance = topProducts.map(product => ({
        name: product.name.substring(0, 15) + (product.name.length > 15 ? '...' : ''),
        orders: product.orderCount,
        revenue: product.revenue
      }));
      
      res.json(productPerformance);
    } catch (error) {
      console.error("Error fetching product performance:", error);
      res.status(500).json({ message: "Failed to fetch product performance" });
    }
  });

  // GET /api/financial-health
  app.get('/api/financial-health', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      const userId = req.user.id;
      const period = req.query.period || '3months';

      // Compute date bound for the selected period
      const now = new Date();
      const periodDays: Record<string, number> = { '30days': 30, '3months': 90, '6months': 180, '12months': 365 };
      const lookbackDays = periodDays[period as string] ?? 90;
      const periodStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      // Get comprehensive financial data — orders bounded to the selected period.
      // Note: getWholesalerStats returns all-time aggregates (totalRevenue etc.);
      // bounded order count is used for in-period metrics (costs, growth, LTV).
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrdersForDateRange(userId, periodStart, now),
        storage.getProducts(userId)
      ]);

      // Calculate key metrics using actual order data
      const totalRevenue = stats.totalRevenue || 0;
      const totalCosts = orders.reduce((sum: number, order: any) => {
        return sum + (parseFloat(order.total) * 0.7);
      }, 0); // Estimated costs
      const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue * 100) : 0;
      const revenueGrowth = 12.5; // Default growth rate for demo
      
      // Calculate customer metrics
      const uniqueCustomers = new Set(orders.map((o: any) => o.retailerId)).size;
      const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
      const customerLifetimeValue = avgOrderValue * 3; // Simplified LTV calculation
      const customerAcquisitionCost = uniqueCustomers > 0 ? (totalRevenue * 0.1) / uniqueCustomers : 0;
      
      // Calculate burn rate (monthly expenses)
      const monthlyBurnRate = totalCosts / 3; // Simplified monthly burn
      const monthsOfRunway = monthlyBurnRate > 0 ? (totalRevenue - totalCosts) / monthlyBurnRate : 12;

      // Calculate health score components
      const revenueScore = Math.min(90, Math.max(10, revenueGrowth + 50));
      const profitabilityScore = Math.min(90, Math.max(10, profitMargin * 2));
      const cashFlowScore = Math.min(90, Math.max(10, monthsOfRunway * 10));
      const growthScore = Math.min(90, Math.max(10, (orders.length / 30) * 20 + 40));
      const efficiencyScore = Math.min(90, Math.max(10, (products.filter((p: any) => p.status === 'active').length / Math.max(products.length, 1)) * 100));

      const healthScore = Math.round((revenueScore + profitabilityScore + cashFlowScore + growthScore + efficiencyScore) / 5);

      // Generate AI insights (simplified for demo)
      const insights = {
        summary: `Your business shows ${healthScore >= 70 ? 'strong' : healthScore >= 50 ? 'moderate' : 'concerning'} financial health with a score of ${healthScore}/100. ${totalRevenue > 1000 ? 'Revenue performance is solid' : 'Focus on revenue growth opportunities'}.`,
        recommendations: [
          "Optimize pricing strategy for better profit margins",
          "Expand product offerings in high-demand categories", 
          "Implement customer retention programs",
          "Automate order processing to reduce costs"
        ],
        warnings: monthsOfRunway < 6 ? [
          "Cash flow runway below 6 months - monitor expenses closely",
          "Consider diversifying revenue streams"
        ] : [
          "Monitor seasonal sales fluctuations"
        ],
        opportunities: [
          "WhatsApp marketing showing 25% higher engagement",
          "Bulk order discounts could increase average order value",
          "Premium subscription features available"
        ]
      };

      const predictions = {
        nextMonthRevenue: totalRevenue * (1 + (revenueGrowth / 100)),
        quarterProjection: totalRevenue * 3 * (1 + (revenueGrowth / 100)),
        riskFactors: [
          "Seasonal demand fluctuations",
          "Supply chain cost increases"
        ],
        growthOpportunities: [
          "Market expansion to new customer segments",
          "Product line diversification",
          "Enhanced digital marketing campaigns"
        ]
      };

      const healthData = {
        healthScore,
        scoreBreakdown: {
          revenue: Math.round(revenueScore),
          profitability: Math.round(profitabilityScore),
          cashFlow: Math.round(cashFlowScore),
          growth: Math.round(growthScore),
          efficiency: Math.round(efficiencyScore)
        },
        insights,
        metrics: {
          revenueGrowth: Math.round(revenueGrowth * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          customerAcquisitionCost: Math.round(customerAcquisitionCost),
          customerLifetimeValue: Math.round(customerLifetimeValue),
          burnRate: Math.round(monthlyBurnRate),
          monthsOfRunway: Math.round(monthsOfRunway)
        },
        predictions
      };

      res.json(healthData);
    } catch (error) {
      console.error("Error generating financial health analysis:", error);
      res.status(500).json({ message: "Failed to generate financial health analysis" });
    }
  });

  // POST /api/financial-health/insights
  app.post('/api/financial-health/insights', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { analysis_type, period } = req.body;

      // Compute date bound — default to 3 months if no period specified
      const now = new Date();
      const periodDays: Record<string, number> = { '30days': 30, '3months': 90, '6months': 180, '12months': 365 };
      const lookbackDays = periodDays[period as string] ?? 90;
      const periodStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      // Get financial data for AI analysis — orders bounded to the selected period
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrdersForDateRange(userId, periodStart, now),
        storage.getProducts(userId)
      ]);

      // Use OpenAI to generate advanced insights
      if (!openai) {
        throw new Error("OpenAI not configured");
      }

      const prompt = `As a financial advisor, analyze this wholesale business data:

Revenue: $${stats.totalRevenue}
Orders: ${stats.ordersCount}
Active Products: ${stats.activeProducts}
Low Stock Items: ${stats.lowStockCount}
Recent Orders: ${orders.length}

Provide specific, actionable insights for:
1. Revenue optimization opportunities
2. Cost reduction strategies  
3. Growth potential areas
4. Risk factors to monitor
5. Recommended next steps

Focus on practical B2B wholesale strategies. Be concise and specific.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert financial advisor specializing in B2B wholesale businesses. Provide actionable insights based on the business data."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }, { signal: AbortSignal.timeout(25_000) });

      const aiInsights = JSON.parse(response.choices[0].message.content || '{}');
      
      res.json({
        success: true,
        insights: aiInsights,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  // PATCH /api/stock-alerts/:alertId/read
  app.patch('/api/stock-alerts/:alertId/read', requireAuth, requireBooleanFeature('analytics'), requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      await storage.markStockAlertAsRead(parseInt(alertId), userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  // PATCH /api/stock-alerts/:alertId/resolve
  app.patch('/api/stock-alerts/:alertId/resolve', requireAuth, requireBooleanFeature('analytics'), requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      await storage.resolveStockAlert(parseInt(alertId), userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  // GET /api/analytics/customers
  app.get('/api/analytics/customers', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // 24-month lookback: captures all meaningful customer lifetime activity without unbounded scans
      const now = new Date();
      const twentyFourMonthsAgo = new Date(now.getTime() - 24 * 30 * 24 * 60 * 60 * 1000);

      const [allOrders, customers] = await Promise.all([
        storage.getOrdersForDateRange(targetUserId, twentyFourMonthsAgo, now),
        storage.getAllCustomers(targetUserId)
      ]);

      // Exclude orders placed by test accounts (getAllCustomers already filters test accounts,
      // so we use the resulting customer ID set as the filter for orders too).
      const nonTestCustomerIds = new Set(customers.map(c => c.id));
      const orders = allOrders.filter(order => nonTestCustomerIds.has(order.retailerId));

      const validOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(order.status)
      );

      // Customer segmentation — iterate ALL orders so the count matches the customer portal,
      // but only accumulate spend from paid/completed orders.
      // paidOrderCount is tracked separately so avgOrderValue uses a spend-meaningful denominator.
      const customerOrderMap = new Map();
      for (const order of orders) {
        const customerId = order.retailerId;
        const current = customerOrderMap.get(customerId) || {
          orderCount: 0,
          paidOrderCount: 0,
          totalSpent: 0,
          lastOrderDate: null,
          firstOrderDate: null,
          customerName: ''
        };
        if (!current.customerName && order.customerName) {
          current.customerName = order.customerName;
        }

        // Add to spend and order count for all non-cancelled, non-draft orders (includes pending invoices)
        // Exclude fully-refunded orders (amountRefunded >= subtotal) so they don't inflate counts or avgOrderValue
        if (order.status !== 'cancelled' && order.status !== 'draft') {
          const orderSubtotal = parseFloat(order.subtotal || order.total || '0');
          const orderPlatformFee = parseFloat(order.platformFee || '0');
          const amountRefunded = parseFloat(order.amountRefunded || '0');
          const isFullyRefunded = amountRefunded > 0 && amountRefunded >= orderSubtotal;
          if (!isFullyRefunded) {
            current.totalSpent += computeOrderNetValue(order);
            current.orderCount++;
            current.paidOrderCount++;
          }
        }
        
        const orderDate = new Date(order.createdAt ?? '');
        if (!current.firstOrderDate || orderDate < current.firstOrderDate) {
          current.firstOrderDate = orderDate;
        }
        if (!current.lastOrderDate || orderDate > current.lastOrderDate) {
          current.lastOrderDate = orderDate;
        }

        customerOrderMap.set(customerId, current);
      }

      // Classify customers
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      let newCustomers = 0;
      let returningCustomers = 0;
      let atRiskCustomers = 0;
      
      for (const [customerId, data] of Array.from(customerOrderMap.entries())) {
        if (data.firstOrderDate && data.firstOrderDate >= thirtyDaysAgo) {
          newCustomers++;
        } else if (data.lastOrderDate && data.lastOrderDate >= thirtyDaysAgo) {
          returningCustomers++;
        } else {
          atRiskCustomers++;
        }
      }

      // Top customers by value — exclude customers who only have draft/cancelled orders
      const topCustomers = Array.from(customerOrderMap.entries())
        .filter(([, data]) => data.orderCount > 0 && data.totalSpent > 0)
        .map(([customerId, data]) => {
          const customer = customers.find(c => c.id === customerId);
          return {
            id: customerId,
            name: customer?.businessName || (customer?.firstName ? `${customer.firstName} ${customer.lastName || ''}`.trim() : null) || data.customerName || 'Unknown Customer',
            phone: customer?.phoneNumber || '',
            orderCount: data.orderCount,
            totalSpent: Math.round(data.totalSpent * 100) / 100,
            lastOrderDate: data.lastOrderDate?.toISOString().split('T')[0] || '',
            avgOrderValue: Math.round((data.totalSpent / (data.paidOrderCount || 1)) * 100) / 100
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      const insights = {
        segmentation: {
          newCustomers,
          returningCustomers,
          atRiskCustomers,
          totalActiveCustomers: customerOrderMap.size
        },
        topCustomers,
        metrics: {
          averageOrderValue: validOrders.length > 0 ? 
            Math.round((validOrders.reduce((sum, order) => sum + (parseFloat(order.subtotal || order.total || '0') - parseFloat(order.platformFee || '0')), 0) / validOrders.length) * 100) / 100 : 0,
          repeatCustomerRate: customers.length > 0 ? 
            Math.round((returningCustomers / customers.length) * 100) : 0
        }
      };

      res.json(insights);
    } catch (error) {
      console.error("Error fetching customer insights:", error);
      res.status(500).json({ message: "Failed to fetch customer insights" });
    }
  });

  // GET /api/analytics/inventory
  app.get('/api/analytics/inventory', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // 12-month lookback for product performance — sufficient for ranking and trend analysis
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const [products, orders] = await Promise.all([
        storage.getProducts(targetUserId),
        storage.getOrdersForDateRange(targetUserId, twelveMonthsAgo, now)
      ]);

      const validOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(order.status)
      );

      // Product performance analysis — single batch query instead of N+1 loop
      const productSales = new Map();
      if (validOrders.length > 0) {
        const validOrderIds = validOrders.map(o => o.id);
        const allOrderItems = await db
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, validOrderIds));

        for (const item of allOrderItems) {
          const current = productSales.get(item.productId) || { quantity: 0, revenue: 0 };
          current.quantity += item.quantity;
          current.revenue += parseFloat(item.unitPrice || '0') * item.quantity;
          productSales.set(item.productId, current);
        }
      }

      // Categorize products
      const categories = new Map();
      for (const product of products) {
        const category = product.category || 'Uncategorized';
        const current = categories.get(category) || {
          productCount: 0,
          totalStock: 0,
          totalValue: 0
        };
        
        current.productCount++;
        current.totalStock += product.stock || 0;
        current.totalValue += (product.stock || 0) * parseFloat(product.price || '0');
        categories.set(category, current);
      }

      // Performance metrics
      const topPerformers = products
        .map(product => {
          const sales = productSales.get(product.id) || { quantity: 0, revenue: 0 };
          return {
            id: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            stock: product.stock || 0,
            price: parseFloat(product.price || '0'),
            quantitySold: sales.quantity,
            revenue: Math.round(sales.revenue * 100) / 100,
            stockValue: Math.round((product.stock || 0) * parseFloat(product.price || '0') * 100) / 100
          };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const slowMovers = products
        .map(product => {
          const sales = productSales.get(product.id) || { quantity: 0, revenue: 0 };
          return {
            id: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            stock: product.stock || 0,
            price: parseFloat(product.price || '0'),
            quantitySold: sales.quantity,
            daysSinceLastSale: sales.quantity > 0 ? 
              Math.floor((Date.now() - new Date((product.updatedAt ?? product.createdAt) ?? '').getTime()) / (1000 * 60 * 60 * 24)) : 
              999,
            stockValue: Math.round((product.stock || 0) * parseFloat(product.price || '0') * 100) / 100
          };
        })
        .filter(product => product.quantitySold === 0 || product.daysSinceLastSale > 30)
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 10);

      const categoryData = Array.from(categories.entries()).map(([name, data]) => ({
        name,
        productCount: data.productCount,
        totalStock: data.totalStock,
        totalValue: Math.round(data.totalValue * 100) / 100
      }));

      const insights = {
        overview: {
          totalProducts: products.length,
          totalStockValue: Math.round(products.reduce((sum, product) => 
            sum + (product.stock || 0) * parseFloat(product.price || '0'), 0
          ) * 100) / 100,
          lowStockCount: products.filter(p => (p.stock || 0) <= (p.lowStockThreshold || 10)).length,
          outOfStockCount: products.filter(p => (p.stock || 0) === 0).length
        },
        performance: {
          topPerformers,
          slowMovers,
          categories: categoryData
        }
      };

      res.json(insights);
    } catch (error) {
      console.error("Error fetching inventory insights:", error);
      res.status(500).json({ message: "Failed to fetch inventory insights" });
    }
  });

  // GET /api/stock-alerts
  app.get('/api/stock-alerts', requireAuth, requireBooleanFeature('analytics'), async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const unreadOnly = req.query.unreadOnly === 'true';

      await storage.syncStockAlerts(wholesalerId);
      const alerts = await storage.getStockAlerts(wholesalerId, unreadOnly);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

}
