import express, { type Request, Response, NextFunction } from "express";
import { log } from "./vite";
import { validateDatabaseConnection } from "./health";
import { startDatabaseMaintenance } from "./database-maintenance";
import { checkAndSendPaymentReminders } from "./payment-reminders";
import cron from 'node-cron';
import { db } from "./db";
import { sql, eq, inArray } from "drizzle-orm";
import { subscriptionPlans } from "@shared/schema";
import Stripe from "stripe";

async function runStartupMigrations() {
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS geocode_status VARCHAR(10)`,
    `ALTER TABLE customer_registration_requests ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20)`,
    // Task #19: customer group enforcement status field
    `ALTER TABLE customer_groups ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    // Task #23: Performance indexes — idempotent, safe to run on every startup
    `CREATE INDEX IF NOT EXISTS products_wholesaler_id_idx ON products (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id)`,
    `CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items (product_id)`,
    `CREATE INDEX IF NOT EXISTS team_members_wholesaler_id_idx ON team_members (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS customer_groups_wholesaler_id_idx ON customer_groups (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS customer_group_members_customer_id_idx ON customer_group_members (customer_id)`,
    `CREATE INDEX IF NOT EXISTS customer_group_members_group_id_idx ON customer_group_members (group_id)`,
    `CREATE INDEX IF NOT EXISTS broadcasts_wholesaler_id_idx ON broadcasts (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS delivery_addresses_customer_id_idx ON delivery_addresses (customer_id)`,
    `CREATE INDEX IF NOT EXISTS delivery_addresses_wholesaler_id_idx ON delivery_addresses (wholesaler_id)`,
    // Task #46: Security — clear stale google_id from team_member records so they cannot
    // match in the googleId-first lookup and leak another wholesaler's data.
    `UPDATE users SET google_id = NULL WHERE role = 'team_member' AND google_id IS NOT NULL`,
    // Task #49 fix: Correct free-tier users whose product_limit was set to 3 (old default).
    // Free plan allows 10 products; any free wholesaler with limit < 10 gets corrected here.
    `UPDATE users SET product_limit = 10 WHERE subscription_tier = 'free' AND product_limit IS NOT NULL AND product_limit < 10`,
    // Task #72: Add phone number to team members for SMS stock alerts
    `ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)`,
    // Task #73: Add expiry date to products
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE`,
  ];
  for (const stmt of migrations) {
    await db.execute(sql.raw(stmt));
  }
  console.log("✅ Startup DB migrations applied (customer map columns)");
}

// Idempotent fix: ensures the Stripe Price objects for Standard and Premium match the
// monthly_price stored in the subscription_plans table. Stripe prices are immutable —
// if the unit_amount, currency, interval, or product is wrong a new price is created
// and the old one is archived.
// Set env var STRIPE_PRICE_FIX_SKIP=true to disable after a successful production run.
async function fixStripePricesIfNeeded() {
  if (!process.env.STRIPE_SECRET_KEY) return;
  if (process.env.STRIPE_PRICE_FIX_SKIP === 'true') {
    console.log('ℹ️ Stripe price fix skipped (STRIPE_PRICE_FIX_SKIP=true)');
    return;
  }
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });

  const EXPECTED: Record<string, { unitAmount: number; currency: string; interval: string; productId: string }> = {
    standard: { unitAmount: 1999, currency: 'gbp', interval: 'month', productId: 'prod_U7iIITiYIFwLA2' },
    premium:  { unitAmount: 3999, currency: 'gbp', interval: 'month', productId: 'prod_U7iHoOyKGNk4CG' },
  };

  const plans = await db.select({
    planId: subscriptionPlans.planId,
    stripePriceId: subscriptionPlans.stripePriceId,
  }).from(subscriptionPlans).where(inArray(subscriptionPlans.planId, ['standard', 'premium']));

  let checked = 0, fixed = 0;
  for (const plan of plans) {
    const expected = EXPECTED[plan.planId];
    if (!expected || !plan.stripePriceId) continue;
    checked++;

    try {
      const price = await stripeClient.prices.retrieve(plan.stripePriceId);
      const productId = typeof price.product === 'string' ? price.product : price.product?.id;
      const isCorrect =
        price.active &&
        price.unit_amount === expected.unitAmount &&
        price.currency === expected.currency &&
        price.recurring?.interval === expected.interval &&
        productId === expected.productId;

      if (isCorrect) {
        console.log(`✅ Stripe price for ${plan.planId} is correct (${expected.unitAmount}p GBP/month)`);
        continue;
      }

      console.log(`🔧 Stripe price for ${plan.planId} is incorrect — creating correct price (amount=${price.unit_amount}, currency=${price.currency}, interval=${price.recurring?.interval}, product=${productId})`);
      const newPrice = await stripeClient.prices.create({
        unit_amount: expected.unitAmount,
        currency: expected.currency,
        recurring: { interval: 'month' },
        product: expected.productId,
      });

      // Archive the old incorrect price
      try {
        await stripeClient.prices.update(plan.stripePriceId, { active: false });
        console.log(`🗄️ Archived old price ${plan.stripePriceId}`);
      } catch (archiveErr) {
        console.error(`⚠️ Could not archive old price ${plan.stripePriceId}:`, archiveErr);
      }

      // Update DB to point to the new correct price
      await db.update(subscriptionPlans)
        .set({ stripePriceId: newPrice.id })
        .where(eq(subscriptionPlans.planId, plan.planId));

      console.log(`✅ Fixed ${plan.planId} Stripe price: ${plan.stripePriceId} → ${newPrice.id}`);
      fixed++;
    } catch (err) {
      console.error(`❌ Failed to check/fix Stripe price for ${plan.planId}:`, err);
    }
  }
  console.log(`✅ Stripe price check complete: ${checked} checked, ${fixed} fixed`);
}

// Set OAuth redirect URI for production deployment
if (process.env.CUSTOM_DOMAIN === 'quikpik.app') {
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://quikpik.app/api/auth/google/callback';
}

const app = express();
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/webhooks/stripe')) {
    express.raw({ type: 'application/json', limit: '10mb' })(req, res, next);
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
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

    // Apply idempotent schema migrations (ADD COLUMN IF NOT EXISTS)
    await runStartupMigrations();

    // Ensure Stripe prices for Standard/Premium match the correct monthly_price amounts
    await fixStripePricesIfNeeded();

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
    
    // Start stock alert monitoring (runs once daily at 8 AM)
    const { stockAlertService } = await import("./services/stockAlertService");
    cron.schedule('0 8 * * *', async () => {
      console.log('📦 Running daily stock level check...');
      try {
        await stockAlertService.checkAndSendLowStockAlerts();
      } catch (error) {
        console.error('❌ Stock alert check failed:', error);
      }
    });
    console.log(`🔔 Stock alert system enabled (daily at 8 AM)`);
    
    // Start payment reminder scheduler (runs daily at 9 AM)
    cron.schedule('0 9 * * *', async () => {
      console.log('📧 Running payment reminder check...');
      try {
        await checkAndSendPaymentReminders();
      } catch (error) {
        console.error('❌ Payment reminder check failed:', error);
      }
    });
    console.log(`📧 Payment reminder system enabled (daily at 9 AM)`);

    // Start promotion start/end notifications (runs daily at 10 AM)
    const { promotionNotificationService } = await import("./services/promotionNotificationService");
    cron.schedule('0 10 * * *', async () => {
      console.log('🎯 Running promotion notification check...');
      try {
        await promotionNotificationService.checkAndSendPromotionNotifications();
      } catch (error) {
        console.error('❌ Promotion notification check failed:', error);
      }
    });
    console.log(`🎯 Promotion notification system enabled (daily at 10 AM)`);
    
    log(`serving on port ${port}`);
  });
  
} catch (error) {
  console.error("❌ Server startup failed:", error);
  process.exit(1);
}
})();
