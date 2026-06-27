import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./replitAuth";
import compression from "compression";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { performanceMiddleware } from "./middleware/performance";
import { registerSystemRoutes } from "./routes/system";
import { registerAuthRoutes } from "./routes/auth";
import { registerCustomerAuthRoutes } from "./routes/customer-auth";
import { registerProductRoutes } from "./routes/products";
import { registerCategoryRoutes } from "./routes/categories";
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
import { registerCollectionAddressRoutes } from "./routes/collection-addresses";
import { registerPublicStoreRoutes } from "./routes/public-store";
import { logServerError } from "./lib/errorLogger";
import { getRouteMeta, injectMeta } from "./seo";

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
  registerCategoryRoutes(app);
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
  registerCollectionAddressRoutes(app);
  registerPublicStoreRoutes(app);

  // ---------------------------------------------------------------------------
  // SEO metadata injection for public HTML routes
  // ---------------------------------------------------------------------------
  // This middleware intercepts GET requests for public pages (/, /blog, /blog/:slug,
  // /w/:slug, /product/:slug, /welcome/:wholesalerId, /terms, /privacy) and injects
  // route-specific <title>, <meta>, OG, and Twitter tags into the HTML shell before
  // it is delivered to the client.
  //
  // This runs BEFORE Vite's catch-all so crawlers and social preview bots receive
  // meaningful head tags in the initial HTTP response without executing JavaScript.
  // ---------------------------------------------------------------------------
  const PUBLIC_HTML_PATTERNS = [
    /^\/$/,
    /^\/blog(\/[^/]+)?$/,
    /^\/terms$/,
    /^\/privacy$/,
    /^\/w\/[^/]+$/,
    /^\/product\/[^/]+$/,
    /^\/welcome\/[^/]+$/,
  ];

  app.get("*", async (req: Request, res: Response, next: NextFunction) => {
    const pathname = req.path;

    // Only intercept HTML routes — skip API requests and static assets
    if (pathname.startsWith("/api/") || pathname.includes(".")) {
      return next();
    }

    const isPublic = PUBLIC_HTML_PATTERNS.some((re) => re.test(pathname));
    if (!isPublic) return next();

    try {
      // Locate the appropriate index.html:
      //   dev  → client/index.html  (source; Vite processes JS on-demand)
      //   prod → server/public/index.html  (pre-built output)
      const isDev = app.get("env") === "development";
      const htmlPath = isDev
        ? path.resolve(import.meta.dirname, "..", "client", "index.html")
        : path.resolve(import.meta.dirname, "public", "index.html");

      if (!fs.existsSync(htmlPath)) return next();

      const template = await fs.promises.readFile(htmlPath, "utf-8");
      const meta = await getRouteMeta(pathname);
      const html = injectMeta(template, meta);

      res
        .status(200)
        .set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        })
        .end(html);
    } catch (err) {
      console.error("[seo] Failed to inject metadata for", pathname, err);
      next();
    }
  });

  // Global error middleware — captures unhandled route errors and persists them to system_error_logs
  app.use(async (err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[server] Unhandled route error ${req.method} ${req.url}:`, err);
    const user = req.user as { id?: string } | undefined;
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
