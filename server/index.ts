import express, { type Request, Response, NextFunction } from "express";
import { log } from "./vite";
import { validateDatabaseConnection } from "./health";

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

    // Lazy load heavy modules
    const { registerRoutes } = await import("./routes");
    const { setupVite, serveStatic } = await import("./vite");
    
    const server = await registerRoutes(app);
    
    // Start standalone webhook server for Stripe webhooks
    try {
      const { startStandaloneWebhook } = await import("./standalone-webhook");
      const webhookServer = startStandaloneWebhook();
      console.log("🔗 Standalone webhook server started on port 5001");
    } catch (error: any) {
      if (error.code === 'EADDRINUSE') {
        console.log("⚠️ Webhook server already running on port 5001");
      } else {
        console.error("⚠️ Failed to start webhook server:", error);
      }
    }

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
  }, () => {
    console.log(`✅ Server successfully started on port ${port}`);
    console.log(`🌐 Health check available at: http://localhost:${port}/api/health`);
    log(`serving on port ${port}`);
  });
  
} catch (error) {
  console.error("❌ Server startup failed:", error);
  process.exit(1);
}
})();
