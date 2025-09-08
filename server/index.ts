import express, { type Request, Response, NextFunction } from "express";
import { log } from "./vite";
import { validateDatabaseConnection } from "./health";
import { startDatabaseMaintenance } from "./database-maintenance";
import cron from 'node-cron';

// Set OAuth redirect URI for production deployment
if (process.env.CUSTOM_DOMAIN === 'quikpik.app') {
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://quikpik.app/api/auth/google/callback';
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("🚀 Starting Quikpik server...");
    
    // Validate database connection first
    const dbConnected = await validateDatabaseConnection();
    if (!dbConnected) {
      console.error("❌ Server startup failed: Database connection could not be established");
      process.exit(1);
    }
    
    // Stripe subscription system removed

    // Lazy load heavy modules
    const { registerRoutes } = await import("./routes");
    const { setupVite, serveStatic } = await import("./vite");
    
    const server = await registerRoutes(app);
    
    // Webhook server removed with subscription system

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    console.log(`✅ Server successfully started on port ${port}`);
    console.log(`🌐 Health check available at: http://localhost:${port}/api/health`);
    
    // Start automatic database maintenance
    startDatabaseMaintenance();
    console.log(`🧹 Database maintenance scheduler enabled`);
    
    // Start stock alert monitoring (runs every 2 hours)
    const { stockAlertService } = await import("./services/stockAlertService");
    cron.schedule('0 */2 * * *', async () => {
      console.log('📦 Running automated stock level check...');
      try {
        await stockAlertService.checkAndSendLowStockAlerts();
      } catch (error) {
        console.error('❌ Stock alert check failed:', error);
      }
    });
    console.log(`🔔 Stock alert system enabled (every 2 hours)`);
    
    log(`serving on port ${port}`);
  });
  
} catch (error) {
  console.error("❌ Server startup failed:", error);
  process.exit(1);
}
})();
