import type { Express } from "express";

import { registerPaymentConnectRoutes } from "./payments-connect";
import { registerSubscriptionRoutes } from "./payments-subscriptions";
import { registerQuoteRoutes } from "./payments-quotes";

export function registerPaymentRoutes(app: Express): void {
  registerPaymentConnectRoutes(app);
  registerSubscriptionRoutes(app);
  registerQuoteRoutes(app);
}
