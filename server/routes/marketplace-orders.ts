/**
 * marketplace-orders.ts
 *
 * Thin orchestrator: delegates to read and write sub-modules.
 * Registered via registerOrderRoutes(app, orderCreateLimiter, customerActionLimiter).
 *
 * Routes:
 *   GET  /api/customer-orders/:wholesalerId/:phoneNumber         → read
 *   GET  /api/quick-order-templates/:wholesalerId/:phoneNumber   → read
 *   GET  /api/frequently-ordered/:wholesalerId/:phoneNumber      → read
 *   GET  /api/last-order-reorder/:wholesalerId/:phoneNumber      → read
 *   GET  /api/customer-orders/stats/:wholesalerId/:phoneNumber   → read
 *   GET  /api/customer/orders/:id/can-cancel                     → read
 *   GET  /api/customer-orders/:wholesalerId/:phoneNumber/:orderId/invoice → read
 *   GET  /api/customer/orders/:orderId/reorder-preview/:phoneNumber      → read
 *   POST /api/customer/shipping-choice                           → write
 *   POST /api/marketplace/create-order                          → write
 *   POST /api/marketplace/create-order-pay-later                → write
 *   POST /api/customer/orders/:id/request-cancellation          → write
 *   POST /api/marketplace/orders                                → write
 *   POST /api/customer/orders                                   → write
 *   POST /api/customer/orders/:orderId/reorder/:phoneNumber     → write
 */
import type { Express, RequestHandler } from "express";
import { registerOrderReadRoutes } from "./marketplace-orders-read";
import { registerOrderWriteRoutes } from "./marketplace-orders-write";

export { resolveCustomerAuth } from "./marketplace-orders-read";

export function registerOrderRoutes(
  app: Express,
  orderCreateLimiter: RequestHandler,
  customerActionLimiter: RequestHandler
): void {
  registerOrderReadRoutes(app);
  registerOrderWriteRoutes(app, orderCreateLimiter, customerActionLimiter);
}
