import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./replitAuth";
import compression from "compression";
import cookieParser from "cookie-parser";
import { performanceMiddleware } from "./middleware/performance";
import { registerSystemRoutes } from "./routes/system";
import { registerAuthRoutes } from "./routes/auth";
import { registerCustomerAuthRoutes } from "./routes/customer-auth";
import { registerProductRoutes } from "./routes/products";
import { registerOrderRoutes } from "./routes/orders";
import { registerCustomerRoutes } from "./routes/customers";
import { registerAddressRoutes } from "./routes/addresses";
import { registerMarketplaceRoutes } from "./routes/marketplace";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerCampaignRoutes } from "./routes/campaigns";
import { registerPaymentRoutes } from "./routes/payments";
import { registerAdminRoutes } from "./routes/admin";
import { registerPriceListRoutes } from "./routes/price-lists";
import { registerBatchRoutes } from "./routes/batches";
import { registerBusinessProfileRoutes } from "./routes/business-profiles";
import { logServerError } from "./lib/errorLogger";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log(`🔧 Registering routes... Express env: ${app.get('env')}, NODE_ENV: ${process.env.NODE_ENV}`);
  console.log('🔧 Setting up session middleware...');
  await setupAuth(app);
  console.log('✅ Session middleware configured successfully');

  app.use(compression());
  app.use(performanceMiddleware.securityHeadersMiddleware());
  app.set("trust proxy", 1);
  app.use(cookieParser());

  registerSystemRoutes(app);
  registerAuthRoutes(app);
  registerCustomerAuthRoutes(app);
  registerProductRoutes(app);
  registerOrderRoutes(app);
  registerCustomerRoutes(app);
  registerAddressRoutes(app);
  registerMarketplaceRoutes(app);
  registerAnalyticsRoutes(app);
  registerCampaignRoutes(app);
  registerPaymentRoutes(app);
  registerAdminRoutes(app);
  registerPriceListRoutes(app);
  registerBatchRoutes(app);
  registerBusinessProfileRoutes(app);

  // Global error middleware — captures unhandled route errors and persists them to system_error_logs
  app.use(async (err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[server] Unhandled route error ${req.method} ${req.url}:`, err);
    const user = (req as any).user as { id?: string } | undefined;
    await logServerError("server_error", err.message || "Unknown error", {
      context: { method: req.method, url: req.url, stack: err.stack?.slice(0, 500) },
      wholesalerId: user?.id,
      severity: "error",
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
