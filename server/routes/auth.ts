import type { Express } from "express";

import { registerAuthCoreRoutes } from "./auth-core";
import { registerAuthTeamRoutes } from "./auth-team";

export function registerAuthRoutes(app: Express): void {
  registerAuthCoreRoutes(app);
  registerAuthTeamRoutes(app);
}
