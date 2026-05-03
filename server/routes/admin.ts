import type { Express } from "express";

import { registerAdminCoreRoutes } from "./admin-core";
import { registerAdminOpsRoutes } from "./admin-ops";
import { registerAdminSystemRoutes } from "./admin-system";

export function registerAdminRoutes(app: Express): void {
  registerAdminCoreRoutes(app);
  registerAdminOpsRoutes(app);
  registerAdminSystemRoutes(app);
}
