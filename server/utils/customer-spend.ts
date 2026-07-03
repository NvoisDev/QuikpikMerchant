/**
 * Shared helpers for computing a customer's net spend from a list of orders.
 *
 * Two distinct "totalSpent" views exist in the platform:
 *
 *   - DETAIL view  (getCustomerDetails, getCustomers bulk stats):
 *       Only paid orders count. Refunded amount is deducted so the figure
 *       represents money the customer has actually transferred net of returns.
 *       formula: subtotal - platformFee - amountRefunded  (paid, non-cancelled, non-draft)
 *
 *   - ANALYTICS view  (/api/analytics/customers top-customers ranking):
 *       All active (non-cancelled, non-draft) orders are included regardless of
 *       payment status so that outstanding invoices appear in the ranking too.
 *       Fully-refunded orders are excluded to avoid inflating counts.
 *       formula: subtotal - platformFee - amountRefunded  (non-cancelled, non-draft, not fully refunded)
 *
 * For the common case — a paid order with a partial refund — both views produce
 * identical arithmetic. The helpers below centralise that arithmetic so a single
 * change keeps both views in sync.
 */

export interface OrderSpendFields {
  status: string;
  paymentStatus: string | null | undefined;
  subtotal: string | null | undefined;
  total: string | null | undefined;
  platformFee: string | null | undefined;
  amountRefunded: string | null | undefined;
}

/**
 * Net value of a single order: subtotal (falling back to total) minus platform
 * fee and any refunded amount.  Returns a plain number; caller is responsible
 * for further filtering.
 */
export function computeOrderNetValue(order: OrderSpendFields): number {
  const subtotal = parseFloat(order.subtotal || order.total || '0');
  const platformFee = parseFloat(order.platformFee || '0');
  const amountRefunded = parseFloat(order.amountRefunded || '0');
  return subtotal - platformFee - amountRefunded;
}

/**
 * DETAIL-view total spend.
 *
 * Matches the logic in getCustomerDetails() and the getCustomers() bulk SQL.
 * Only paid, non-cancelled, non-draft orders are counted.
 */
export function computeDetailTotalSpent(orders: OrderSpendFields[]): number {
  return orders
    .filter(
      (o) =>
        o.paymentStatus === 'paid' &&
        o.status !== 'cancelled' &&
        o.status !== 'draft'
    )
    .reduce((sum, o) => sum + computeOrderNetValue(o), 0);
}

/**
 * ANALYTICS-view total spend.
 *
 * Matches the accumulator in /api/analytics/customers.
 * All non-cancelled, non-draft orders are included regardless of payment status,
 * but fully-refunded orders (amountRefunded >= subtotal) are excluded to keep
 * counts and average order values meaningful.
 */
export function computeAnalyticsTotalSpent(orders: OrderSpendFields[]): number {
  let total = 0;
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'draft') continue;
    const subtotal = parseFloat(o.subtotal || o.total || '0');
    const amountRefunded = parseFloat(o.amountRefunded || '0');
    const isFullyRefunded = amountRefunded > 0 && amountRefunded >= subtotal;
    if (!isFullyRefunded) {
      total += computeOrderNetValue(o);
    }
  }
  return total;
}
