/**
 * Maximum number of orders loaded for analytics queries.
 *
 * Passing { unpaginated: true } to getOrders would load every order into memory
 * in a single query, which causes slow responses and eventual OOM errors for
 * wholesalers with thousands of orders.  This cap keeps analytics accurate for
 * realistic data volumes (most recent N orders, newest-first) while bounding
 * memory use.  If a wholesaler exceeds this limit the response will include
 * isCapped: true so the frontend can surface a "showing results for most
 * recent N orders" notice.
 *
 * Raise this value — or introduce proper server-side aggregation — if you need
 * accurate analytics beyond 5 000 orders.
 */
export const ANALYTICS_ORDER_CAP = 5_000;
