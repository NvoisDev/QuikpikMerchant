import type { Express } from "express";
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

  const httpServer = createServer(app);
  return httpServer;
}
