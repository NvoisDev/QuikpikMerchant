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
    // Task #49/#305: Align product_limit for all tiers to new limits (Free=2, Premium=-1).
    // Task #848 raised Standard to 20; the update below is the authoritative value.
    `UPDATE users SET product_limit = 2 WHERE subscription_tier = 'free'`,
    `UPDATE users SET product_limit = 5 WHERE subscription_tier = 'standard' AND product_limit NOT IN (-1, 5)`,
    // Task #848/#850: Raise Standard product limit to 20 for all existing subscribers.
    `UPDATE users SET product_limit = 20 WHERE subscription_tier = 'standard' AND product_limit NOT IN (-1, 20)`,
    // Task #305: Add is_locked column to price_lists for plan enforcement
    `ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE`,
    // Task #72: Add phone number to team members for SMS stock alerts
    `ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)`,
    // Task #73: Add expiry date to products
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE`,
    // Task #431: Add unit weight per selling unit (kg) for Quick Quote weight calculation
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_weight DECIMAL(10, 2)`,
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
    // Task #319: Remove pre-existing duplicate pending registration requests caused by phone number
    // format differences (e.g. 07941619640 vs +447941619640) before the Task #316 normalisation fix.
    // Scoped to status='pending' only so approved/rejected audit rows are never touched, making this
    // statement safe to run on every startup (becomes a no-op once no pending duplicates exist).
    // Uses regexp_replace to strip non-digits before comparing last 10 digits, ensuring spaces/dashes
    // in stored numbers don't cause mismatches. id DESC breaks ties when requested_at is identical.
    `DELETE FROM customer_registration_requests WHERE status = 'pending' AND id NOT IN (SELECT DISTINCT ON (wholesaler_id, RIGHT(regexp_replace(customer_phone, '\\D', '', 'g'), 10)) id FROM customer_registration_requests WHERE status = 'pending' ORDER BY wholesaler_id, RIGHT(regexp_replace(customer_phone, '\\D', '', 'g'), 10), requested_at DESC, id DESC)`,
    // Task #320: Enforce uniqueness at the DB level so a bug or bypassed normalisation can never
    // re-introduce duplicate pending requests. This is a partial unique index (WHERE status='pending')
    // on the last-10-digits of the normalised phone + wholesaler_id pair.  The Task #319 DELETE above
    // runs first so by the time we reach this statement there are no pre-existing duplicates that
    // would cause the CREATE to fail.  IF NOT EXISTS makes it idempotent on every restart.
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_reg_per_wholesaler_phone ON customer_registration_requests (wholesaler_id, RIGHT(regexp_replace(customer_phone, '\\D', '', 'g'), 10)) WHERE status = 'pending'`,
    // Task #376: Batch-level inventory tracking
    `CREATE TABLE IF NOT EXISTS product_batches (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      batch_number VARCHAR,
      quantity INTEGER NOT NULL DEFAULT 0,
      cost_price DECIMAL(10,2),
      expiry_date DATE,
      status VARCHAR NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS pb_product_id_idx ON product_batches(product_id)`,
    `CREATE INDEX IF NOT EXISTS pb_product_expiry_idx ON product_batches(product_id, expiry_date)`,
    `CREATE INDEX IF NOT EXISTS pb_status_idx ON product_batches(status)`,
    // Partial unique index on (product_id) where batch_number = 'Initial Stock' makes the seed
    // conflict-safe under concurrent startup: ON CONFLICT DO NOTHING becomes deterministic.
    `CREATE UNIQUE INDEX IF NOT EXISTS pb_initial_seed_uniq
       ON product_batches (product_id)
       WHERE batch_number = 'Initial Stock'`,
    `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id)`,
    // Backward-compat migration: seed one "Initial Stock" batch per product that has stock > 0
    // and has NO existing batches of any kind (NOT EXISTS guards against products already
    // seeded via POST /api/products or a previous restart). ON CONFLICT DO NOTHING + the
    // partial unique index are extra insurance against concurrent duplicate inserts.
    `INSERT INTO product_batches (product_id, batch_number, quantity, status, created_at)
     SELECT id, 'Initial Stock', GREATEST(COALESCE(stock, 0), 0), 'active', NOW()
     FROM products
     WHERE COALESCE(stock, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM product_batches pb WHERE pb.product_id = products.id)
     ON CONFLICT DO NOTHING`,
    // Task #393: Order number prefix/sequence integrity
    // 1. Add persistent counter to users — incremented atomically per order, never resets on prefix change
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS order_number_counter INTEGER NOT NULL DEFAULT 0`,
    // 2. Add audit columns to orders — auto-populated by trigger below
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS sequence_number INTEGER`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS prefix_used VARCHAR(20)`,
    // 3. Back-fill sequence_number and prefix_used for existing orders.
    //    Guard: SPLIT_PART(...,2) must be all-digits so non-matching formats are skipped safely.
    `UPDATE orders SET
       sequence_number = CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER),
       prefix_used     = SPLIT_PART(order_number, '-', 1)
     WHERE sequence_number IS NULL
       AND order_number LIKE '%-%'
       AND SPLIT_PART(order_number, '-', 2) ~ '^[0-9]+$'`,
    // 4. Seed order_number_counter per wholesaler = MAX(sequence_number) of their orders
    //    Only runs when counter is still 0 so it becomes a no-op on subsequent restarts.
    `UPDATE users SET order_number_counter = sub.max_seq
     FROM (
       SELECT wholesaler_id, MAX(sequence_number) AS max_seq
       FROM orders
       WHERE sequence_number IS NOT NULL
       GROUP BY wholesaler_id
     ) sub
     WHERE users.id = sub.wholesaler_id
       AND users.order_number_counter = 0`,
    // 5. Trigger function: automatically parse sequence_number and prefix_used on every INSERT
    `CREATE OR REPLACE FUNCTION fn_parse_order_number_parts()
     RETURNS TRIGGER AS $$
     BEGIN
       IF NEW.sequence_number IS NULL AND NEW.order_number LIKE '%-%'
          AND SPLIT_PART(NEW.order_number, '-', 2) ~ '^[0-9]+$' THEN
         NEW.prefix_used     := SPLIT_PART(NEW.order_number, '-', 1);
         BEGIN
           NEW.sequence_number := CAST(SPLIT_PART(NEW.order_number, '-', 2) AS INTEGER);
         EXCEPTION WHEN OTHERS THEN
           NEW.sequence_number := NULL;
         END;
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`,
    // 6. Attach trigger (drop-create is idempotent via DROP IF EXISTS)
    `DROP TRIGGER IF EXISTS trg_parse_order_number ON orders`,
    `CREATE TRIGGER trg_parse_order_number
     BEFORE INSERT ON orders
     FOR EACH ROW EXECUTE FUNCTION fn_parse_order_number_parts()`,
    // Task #479: Drop stale negotiation schema — negotiations table and its two columns on products
    `DROP TABLE IF EXISTS negotiations`,
    `ALTER TABLE products DROP COLUMN IF EXISTS negotiation_enabled`,
    `ALTER TABLE products DROP COLUMN IF EXISTS minimum_bid_price`,
    // Task #538: Test account isolation — add flag and mark the Quikpik internal test account
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE`,
    `UPDATE users SET is_test_account = true WHERE email = 'hello@quikpik.co'`,
    // Task #595: Multi-business profiles for wholesalers
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS enable_multi_profile BOOLEAN NOT NULL DEFAULT FALSE`,
    `CREATE TABLE IF NOT EXISTS business_profiles (
      id SERIAL PRIMARY KEY,
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR NOT NULL,
      logo_url VARCHAR,
      address TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS bp_wholesaler_id_idx ON business_profiles(wholesaler_id)`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS business_profile_id INTEGER REFERENCES business_profiles(id) ON DELETE SET NULL`,
    // Task #606: Legal business info fields for invoicing compliance
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_business_name VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_registration_number VARCHAR(50)`,
    // Task #605: Track stock depletion by business profile
    `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS business_profile_id INTEGER`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='stock_movements' AND constraint_name='stock_movements_business_profile_id_fkey') THEN ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_business_profile_id_fkey FOREIGN KEY (business_profile_id) REFERENCES business_profiles(id) ON DELETE SET NULL; END IF; END $$`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_verified_email_sent_at TIMESTAMP`,
    // Task #659: Presence / online indicator — last seen timestamp
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`,
    `ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`,
    // Task #704: Track when a quote was last edited so the customer portal can show a "Quote updated" badge
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP`,
    // Task #715: Quote Activity Log — structured append-only audit trail for quote events
    `CREATE TABLE IF NOT EXISTS quote_activity_logs (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      action_type VARCHAR(50) NOT NULL,
      entity_type VARCHAR(30),
      entity_id VARCHAR(255),
      old_value JSONB,
      new_value JSONB,
      description TEXT NOT NULL,
      performed_by VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS qal_quote_id_idx ON quote_activity_logs(quote_id)`,
    `CREATE INDEX IF NOT EXISTS qal_created_at_idx ON quote_activity_logs(quote_id, created_at DESC)`,
    // Task #783: Annual subscription plans — new tracking fields on userSubscriptions
    `ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS internal_note TEXT`,
    `ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS is_custom_pricing BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS custom_price_expires_at TIMESTAMP`,
    // Ensure full-rate annual plans are hidden from public pricing UI until May 2027 migration activates them.
    // The migration job (runAnnualPlanMigrationIfDue) sets them active and archives intro plans.
    `UPDATE subscription_plans SET is_active = false
     WHERE plan_id IN ('standard_annual', 'premium_annual')
       AND is_active = true
       AND NOW() < '2027-05-01 00:00:00+00'::timestamptz`,
    // Task #852: Sync annual intro plan prices and product limits.
    // initializeAnnualPlans() now updates existing rows too, but this SQL runs first
    // so the DB is correct from the very first request even before that function fires.
    `UPDATE subscription_plans
     SET monthly_price = '499.99',
         features = '["Up to 20 products","Up to 5 price lists","Broadcast tools coming soon","Basic dashboard analytics","Priority email support","Save vs monthly billing"]',
         limits = '{"products":20,"broadcasts":25,"teamMembers":2,"customGroups":5,"priceLists":5}'
     WHERE plan_id = 'standard_annual_intro'
       AND monthly_price != '499.99'`,
    `UPDATE subscription_plans
     SET monthly_price = '899.99'
     WHERE plan_id = 'premium_annual_intro'
       AND monthly_price != '899.99'`,
    `UPDATE subscription_plans
     SET monthly_price = '599.99',
         features = '["Up to 20 products","Up to 5 price lists","Broadcast tools coming soon","Basic dashboard analytics","Priority email support"]',
         limits = '{"products":20,"broadcasts":25,"teamMembers":2,"customGroups":5,"priceLists":5}'
     WHERE plan_id = 'standard_annual'
       AND monthly_price != '599.99'`,
    `UPDATE subscription_plans
     SET monthly_price = '999.99'
     WHERE plan_id = 'premium_annual'
       AND monthly_price != '999.99'`,
    // Task #875: One-time clean-up — orders where customer_name has a trailing literal ' null'
    // (e.g. 'Angel meals null') caused by concatenating firstName + NULL lastName.
    // Re-join the users table and recompute the correct display name.
    `UPDATE orders o
     SET customer_name = TRIM(
       CASE
         WHEN u.first_name IS NOT NULL AND u.last_name IS NOT NULL
           THEN u.first_name || ' ' || u.last_name
         WHEN u.first_name IS NOT NULL
           THEN u.first_name
         WHEN u.business_name IS NOT NULL
           THEN u.business_name
         ELSE 'Unknown Customer'
       END
     )
     FROM users u
     WHERE o.retailer_id = u.id
       AND o.customer_name LIKE '% null'`,
    // Customer address field for invoice PDF display
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line2 VARCHAR`,
  ];
  for (const stmt of migrations) {
    await db.execute(sql.raw(stmt));
  }
  console.log(`✅ Startup DB migrations applied successfully (${migrations.length} statements)`);
}

// Idempotent fix: ensures the Stripe Price objects for Standard and Premium match the
// monthly_price stored in the subscription_plans table. Stripe prices are immutable —
// if the unit_amount, currency, interval, or product is wrong a new price is created
// and the old one is archived.
// Set env var STRIPE_PRICE_FIX_SKIP=true to disable after a successful production run.
async function fixStripePricesIfNeeded() {
  if (process.env.STRIPE_PRICE_FIX_SKIP === 'true') {
    console.log('ℹ️ Stripe price fix skipped (STRIPE_PRICE_FIX_SKIP=true)');
    return;
  }
  let stripeClient: any;
  try {
    const { getStripeClient } = await import("./stripeConfig");
    stripeClient = getStripeClient();
  } catch {
    console.warn('ℹ️ Stripe not configured — skipping price fix.');
    return;
  }

  const plans = await db.select({
    planId: subscriptionPlans.planId,
    stripePriceId: subscriptionPlans.stripePriceId,
    stripeProductId: subscriptionPlans.stripeProductId,
    monthlyPrice: subscriptionPlans.monthlyPrice,
    currency: subscriptionPlans.currency,
    billingInterval: subscriptionPlans.billingInterval,
  }).from(subscriptionPlans).where(inArray(subscriptionPlans.planId, ['standard', 'premium', 'standard_annual_intro', 'premium_annual_intro']));

  let checked = 0, fixed = 0;
  for (const plan of plans) {
    if (!plan.monthlyPrice) {
      console.warn(`⚠️ No monthly_price in DB for ${plan.planId} — skipping`);
      continue;
    }
    const unitAmount = Math.round(parseFloat(plan.monthlyPrice) * 100);
    const currency = (plan.currency ?? 'GBP').toLowerCase();
    const stripeInterval = (plan.billingInterval ?? 'monthly') === 'yearly' ? 'year' : 'month';
    checked++;

    try {
      // No price ID yet — create one from scratch
      if (!plan.stripePriceId) {
        if (!plan.stripeProductId) {
          console.warn(`⚠️ No Stripe product ID in DB for ${plan.planId} — skipping price creation`);
          continue;
        }
        console.log(`🆕 No Stripe price recorded for ${plan.planId} — creating one`);
        const newPrice = await stripeClient.prices.create({
          unit_amount: unitAmount,
          currency,
          recurring: { interval: stripeInterval },
          product: plan.stripeProductId,
        });
        await db.update(subscriptionPlans)
          .set({ stripePriceId: newPrice.id })
          .where(eq(subscriptionPlans.planId, plan.planId));
        console.log(`✅ Created Stripe price for ${plan.planId}: ${newPrice.id} (product: ${plan.stripeProductId})`);
        fixed++;
        continue;
      }

      const price = await stripeClient.prices.retrieve(plan.stripePriceId);
      const productId = typeof price.product === 'string' ? price.product : price.product?.id;
      const isCorrect =
        price.active &&
        price.unit_amount === unitAmount &&
        price.currency === currency &&
        price.recurring?.interval === stripeInterval &&
        (!plan.stripeProductId || productId === plan.stripeProductId);

      if (isCorrect) {
        console.log(`✅ Stripe price for ${plan.planId} is correct (${unitAmount}p ${currency.toUpperCase()}/${stripeInterval})`);
        continue;
      }

      if (!plan.stripeProductId) {
        console.warn(`⚠️ No Stripe product ID in DB for ${plan.planId} — skipping price correction`);
        continue;
      }

      console.log(`🔧 Stripe price for ${plan.planId} is incorrect — creating correct price (amount=${price.unit_amount}, currency=${price.currency}, interval=${price.recurring?.interval}, product=${productId})`);
      const newPrice = await stripeClient.prices.create({
        unit_amount: unitAmount,
        currency,
        recurring: { interval: stripeInterval },
        product: plan.stripeProductId,
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
    await SubscriptionService.initializeAnnualPlans();

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
        // Expire any batches whose expiry_date has passed before sending alerts
        const { storage: storageInstance } = await import("./storage");
        const expiredCount = await storageInstance.expireOldBatches();
        if (expiredCount > 0) {
          console.log(`🕒 Expired ${expiredCount} batch(es) whose expiry date has passed`);
        }
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

    // Daily pricing & plan maintenance at 11 AM:
    //   1. Switch monthly Standard/Premium to full rates on 1 May 2027 (no-op before that)
    //   2. Migrate intro annual subscribers to full-rate annual plans on 1 May 2027 (no-op before that)
    //   3. Re-run Stripe price fix so any DB price change made above is reflected in Stripe same day
    cron.schedule('0 11 * * *', async () => {
      try {
        const { SubscriptionService: SS } = await import("./subscription-service");
        await SS.runMonthlyPriceSwitchIfDue();
        await SS.runAnnualPlanMigrationIfDue();
        await fixStripePricesIfNeeded();
      } catch (error) {
        console.error('❌ Daily pricing/plan maintenance check failed:', error);
      }
    });
    console.log(`📅 Daily pricing & plan migration scheduler enabled (daily at 11 AM)`);

    log(`serving on port ${port}`);
  });
  
} catch (error) {
  console.error("❌ Server startup failed:", error);
  process.exit(1);
}
})();
