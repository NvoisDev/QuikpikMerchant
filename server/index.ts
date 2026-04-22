import express, { type Request, Response, NextFunction } from "express";
import { log } from "./vite";

// Global safety nets — ensure unexpected errors are always visible in logs.
// pool.on('error') in db.ts handles the common Neon idle-connection drop case.
// uncaughtException exits so the process manager (deployment platform) can
// perform a clean restart; unhandledRejection logs but stays alive because
// promise rejections are typically non-fatal and recoverable.
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught exception — exiting for clean restart:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('🔴 Unhandled promise rejection (non-fatal, process kept alive):', reason);
});
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
    // Task #46: Security — clear stale google_id from team_member records so they cannot
    // match in the googleId-first lookup and leak another wholesaler's data.
    `UPDATE users SET google_id = NULL WHERE role = 'team_member' AND google_id IS NOT NULL`,
    // Task #49/#305: Align product_limit for all tiers to new limits (Free=2, Standard=5, Premium=-1).
    // This corrects any stale values from old defaults.
    `UPDATE users SET product_limit = 2 WHERE subscription_tier = 'free'`,
    `UPDATE users SET product_limit = 5 WHERE subscription_tier = 'standard' AND product_limit NOT IN (-1, 5)`,
    // Task #305: Add is_locked column to price_lists for plan enforcement
    `ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE`,
    // Task #72: Add phone number to team members for SMS stock alerts
    `ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)`,
    // Task #73: Add expiry date to products
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE`,
    // Task #88: Add payment method to orders for display in order detail
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar`,
    // Task #154: Update Premium plan display price to £49.99
    `UPDATE subscription_plans SET monthly_price = '49.99' WHERE plan_id = 'premium' AND monthly_price != '49.99'`,
    // Task #160: Customer-owned addresses — deduplicate rows that differ only by wholesaler,
    // keep lowest-id winner per customer+address combination, then drop the wholesaler_id column.
    // Step 1: Remap any orders that reference a non-canonical (duplicate) address to the min-id canonical address
    `UPDATE orders o SET delivery_address_id = (SELECT MIN(da.id) FROM delivery_addresses da JOIN delivery_addresses da2 ON da2.id = o.delivery_address_id WHERE da.customer_id = da2.customer_id AND LOWER(da.address_line1) = LOWER(da2.address_line1) AND COALESCE(LOWER(da.address_line2),'') = COALESCE(LOWER(da2.address_line2),'') AND LOWER(da.city) = LOWER(da2.city) AND COALESCE(LOWER(da.state),'') = COALESCE(LOWER(da2.state),'') AND da.postal_code = da2.postal_code AND LOWER(da.country) = LOWER(da2.country)) WHERE delivery_address_id IS NOT NULL AND delivery_address_id NOT IN (SELECT MIN(id) FROM delivery_addresses GROUP BY customer_id, LOWER(address_line1), COALESCE(LOWER(address_line2),''), LOWER(city), COALESCE(LOWER(state),''), postal_code, LOWER(country))`,
    // Step 2: Delete duplicate addresses (all orders now reference canonical ids)
    `DELETE FROM delivery_addresses WHERE id NOT IN (SELECT MIN(id) FROM delivery_addresses GROUP BY customer_id, LOWER(address_line1), COALESCE(LOWER(address_line2),''), LOWER(city), COALESCE(LOWER(state),''), postal_code, LOWER(country))`,
    // Step 3: Fix multi-default conflicts — keep only the lowest-id default per customer
    `UPDATE delivery_addresses SET is_default = false WHERE is_default = true AND id NOT IN (SELECT MIN(id) FROM delivery_addresses WHERE is_default = true GROUP BY customer_id)`,
    // Step 4: Drop the wholesaler_id column (now customer-owned)
    `ALTER TABLE delivery_addresses DROP COLUMN IF EXISTS wholesaler_id`,
    // Task #153: Add stripe_transfer_id for exact payout-to-order reconciliation
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR`,
    // Task #74: Drop any check constraint on team_members.role so 'viewer' is always valid.
    // The column is varchar with no enum — this is a no-op if no constraint exists.
    `DO $$ DECLARE con record; BEGIN FOR con IN SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='team_members' AND constraint_type='CHECK' AND constraint_name LIKE '%role%' LOOP EXECUTE 'ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ' || quote_ident(con.constraint_name); END LOOP; END $$`,
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
    premium:  { unitAmount: 4999, currency: 'gbp', interval: 'month', productId: 'prod_U7iHoOyKGNk4CG' },
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

    // Sync subscription plan features/limits from code into DB
    const { SubscriptionService } = await import("./subscription-service");
    await SubscriptionService.initializePlans();

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
