/**
 * marketplace-orders-write.ts
 *
 * Thin orchestrator for write routes — delegates to domain sub-modules.
 * Registered via registerOrderWriteRoutes(app, orderCreateLimiter, customerActionLimiter).
 *
 * Sub-modules:
 *   marketplace-orders-checkout.ts  — POST /api/marketplace/create-order
 *   marketplace-orders-pay-later.ts — POST /api/marketplace/create-order-pay-later
 *   marketplace-orders-actions.ts   — shipping-choice, cancellation, single-product,
 *                                     customer/orders, reorder
 */
import type { Express, RequestHandler } from "express";
import { registerOrderCheckoutRoutes } from "./marketplace-orders-checkout";
import { registerOrderPayLaterRoutes } from "./marketplace-orders-pay-later";
import { registerOrderActionsRoutes } from "./marketplace-orders-actions";

export function registerOrderWriteRoutes(
  app: Express,
  orderCreateLimiter: RequestHandler,
  customerActionLimiter: RequestHandler
): void {
  registerOrderCheckoutRoutes(app, orderCreateLimiter);
  registerOrderPayLaterRoutes(app, orderCreateLimiter);
  registerOrderActionsRoutes(app, customerActionLimiter);
}
