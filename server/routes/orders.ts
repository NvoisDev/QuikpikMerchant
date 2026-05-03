import type { Express } from "express";

import { registerOrderReadRoutes } from "./orders-read";
import { registerOrderLifecycleRoutes } from "./orders-lifecycle";
import { registerOrderCommsRoutes } from "./orders-comms";

export function registerOrderRoutes(app: Express): void {
  registerOrderReadRoutes(app);
  registerOrderLifecycleRoutes(app);
  registerOrderCommsRoutes(app);
}
