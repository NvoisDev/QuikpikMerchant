import { db } from "../db";
import { orders, orderItems } from "@shared/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";

const BROADCAST_VALID_STATUSES = ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'];

// ── Order Stats ───────────────────────────────────────────────────────────────

export interface OrderStats {
  ordersCount: number;
  totalRevenue: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  avgOrderValue: number;
  activeCount: number;
  archivedCount: number;
}

/**
 * Computes the order statistics KPIs for the given wholesaler using a single
 * SQL aggregate query.  This replaces the previous pattern of loading up to
 * ANALYTICS_ORDER_CAP rows into Node.js memory and then filtering / summing
 * in JavaScript.
 *
 * The "archive" classification mirrors the route logic:
 *   archived = status='cancelled'  OR  (status='fulfilled' AND payment_status='paid')
 *   active   = everything else
 */
export async function getOrderStats(
  wholesalerId: string,
  archiveTab: string,
): Promise<OrderStats> {
  const isArchived = sql`(${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`;
  const isActive = sql`NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`;
  const isRevenue = sql`${orders.status} NOT IN ('cancelled', 'refunded')`;
  const net = sql`${orders.subtotal}::numeric - ${orders.platformFee}::numeric`;

  const [row] = await db.select({
    activeCount:        sql<string>`COUNT(*) FILTER (WHERE ${isActive})`,
    archivedCount:      sql<string>`COUNT(*) FILTER (WHERE ${isArchived})`,
    totalCount:         sql<string>`COUNT(*)`,

    activePaidCount:    sql<string>`COUNT(*) FILTER (WHERE ${isActive} AND ${orders.status} IN ('paid', 'completed', 'processing', 'shipped'))`,
    activePendingCount: sql<string>`COUNT(*) FILTER (WHERE ${isActive} AND ${orders.status} = 'pending')`,
    activeRevenue:      sql<string>`COALESCE(SUM(${net}) FILTER (WHERE ${isActive} AND ${isRevenue}), 0)`,

    archivedPaidCount:    sql<string>`COUNT(*) FILTER (WHERE ${isArchived} AND ${orders.status} IN ('paid', 'completed', 'processing', 'shipped'))`,
    archivedPendingCount: sql<string>`COUNT(*) FILTER (WHERE ${isArchived} AND ${orders.status} = 'pending')`,
    archivedRevenue:      sql<string>`COALESCE(SUM(${net}) FILTER (WHERE ${isArchived} AND ${isRevenue}), 0)`,

    allPaidCount:    sql<string>`COUNT(*) FILTER (WHERE ${orders.status} IN ('paid', 'completed', 'processing', 'shipped'))`,
    allPendingCount: sql<string>`COUNT(*) FILTER (WHERE ${orders.status} = 'pending')`,
    allRevenue:      sql<string>`COALESCE(SUM(${net}) FILTER (WHERE ${isRevenue}), 0)`,
  }).from(orders).where(and(eq(orders.wholesalerId, wholesalerId), sql`${orders.status} != 'draft'`));

  if (!row) {
    return { ordersCount: 0, totalRevenue: 0, paidOrdersCount: 0, pendingOrdersCount: 0, avgOrderValue: 0, activeCount: 0, archivedCount: 0 };
  }

  const activeCount   = Number(row.activeCount);
  const archivedCount = Number(row.archivedCount);
  const totalCount    = Number(row.totalCount);

  let ordersCount: number;
  let totalRevenue: number;
  let paidOrdersCount: number;
  let pendingOrdersCount: number;

  if (archiveTab === 'archived') {
    ordersCount       = archivedCount;
    totalRevenue      = Number(row.archivedRevenue);
    paidOrdersCount   = Number(row.archivedPaidCount);
    pendingOrdersCount = Number(row.archivedPendingCount);
  } else if (archiveTab === 'all') {
    ordersCount       = totalCount;
    totalRevenue      = Number(row.allRevenue);
    paidOrdersCount   = Number(row.allPaidCount);
    pendingOrdersCount = Number(row.allPendingCount);
  } else {
    ordersCount       = activeCount;
    totalRevenue      = Number(row.activeRevenue);
    paidOrdersCount   = Number(row.activePaidCount);
    pendingOrdersCount = Number(row.activePendingCount);
  }

  return {
    ordersCount,
    totalRevenue,
    paidOrdersCount,
    pendingOrdersCount,
    avgOrderValue: paidOrdersCount > 0 ? totalRevenue / paidOrdersCount : 0,
    activeCount,
    archivedCount,
  };
}

// ── Broadcast Product Metrics ─────────────────────────────────────────────────

export interface BroadcastProductMetrics {
  orderCount: number;
  revenue: number;
}

/**
 * For a given broadcast (identified by wholesaler + product + sent date),
 * counts how many orders contained that product and sums the revenue — all in
 * a single JOIN query instead of loading all orders into memory and doing N+1
 * getOrderItems calls.
 */
export async function getBroadcastProductMetrics(
  wholesalerId: string,
  productId: number | null | undefined,
  sentAfter: Date,
): Promise<BroadcastProductMetrics> {
  if (!productId) return { orderCount: 0, revenue: 0 };

  const [row] = await db.select({
    orderCount: sql<string>`COUNT(DISTINCT ${orders.id})`,
    revenue:    sql<string>`COALESCE(SUM(${orderItems.unitPrice}::numeric * ${orderItems.quantity}), 0)`,
  })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.wholesalerId, wholesalerId),
      eq(orderItems.productId, productId),
      gte(orders.createdAt, sentAfter),
      inArray(orders.status, BROADCAST_VALID_STATUSES),
    ));

  return {
    orderCount: Number(row?.orderCount ?? 0),
    revenue:    Number(row?.revenue ?? 0),
  };
}
