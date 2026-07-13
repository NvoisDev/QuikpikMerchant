import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
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
import { checkAndSendWeeklyOrderDigests } from "./services/weeklyOrderDigestService";
import { checkAndSendTrialReminders } from "./services/trialReminderService";
import { pruneExpiredShortLinks } from "./shortPaymentLink";
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
    // Storefront display controls: store-wide visibility toggles for the public store grid + product page
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS moq_visible BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS stock_visible BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS pack_size_visible BOOLEAN NOT NULL DEFAULT TRUE`,
    // Collapse legacy 'moq_only' price mode into 'hidden' (MOQ now governed by moq_visible)
    `UPDATE users SET price_display_mode = 'hidden' WHERE price_display_mode = 'moq_only'`,
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
    // Task #1407: Per-customer "personal" price lists created from the invoice editor.
    // Hidden from price-list manager surfaces; carries a single-customer price override.
    `ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE`,
    // Task #1410: Prevent duplicate per-customer personal price lists from concurrent edits.
    // Denormalise the single customer onto the personal list so a partial unique index can
    // enforce at most one personal list per (wholesaler, customer). wholesaler_id/is_personal
    // already live here; the customer used to live only on price_list_assignments.
    `ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS customer_id VARCHAR`,
    // Backfill the new column for existing personal lists from their single assignment.
    `UPDATE price_lists pl
       SET customer_id = pa.customer_id
       FROM price_list_assignments pa
       WHERE pa.price_list_id = pl.id
         AND pl.is_personal = TRUE
         AND pl.customer_id IS NULL
         AND pa.customer_id IS NOT NULL`,
    // Dedupe any pre-existing duplicates (the exact race this guard prevents) before the
    // unique index is created, otherwise index creation would fail. Keep the lowest id per
    // (wholesaler, customer); re-point item overrides from the losers onto the survivor.
    `WITH dups AS (
       SELECT id, MIN(id) OVER (PARTITION BY wholesaler_id, customer_id) AS keep_id
       FROM price_lists
       WHERE is_personal = TRUE AND customer_id IS NOT NULL
     )
     UPDATE price_list_items pli
       SET price_list_id = d.keep_id
       FROM dups d
       WHERE pli.price_list_id = d.id AND d.id <> d.keep_id`,
    // Collapse duplicate (list, product) item rows that re-pointing may have produced on the
    // survivor, keeping the lowest id. Scoped to personal lists only.
    `DELETE FROM price_list_items a
       USING price_list_items b, price_lists pl
       WHERE a.price_list_id = b.price_list_id
         AND a.product_id = b.product_id
         AND a.id > b.id
         AND pl.id = a.price_list_id
         AND pl.is_personal = TRUE`,
    // Remove the now-empty duplicate personal lists (their assignments cascade away).
    `WITH dups AS (
       SELECT id, MIN(id) OVER (PARTITION BY wholesaler_id, customer_id) AS keep_id
       FROM price_lists
       WHERE is_personal = TRUE AND customer_id IS NOT NULL
     )
     DELETE FROM price_lists pl
       USING dups d
       WHERE pl.id = d.id AND d.id <> d.keep_id`,
    // The guarantee: at most one personal list per (wholesaler, customer).
    `CREATE UNIQUE INDEX IF NOT EXISTS price_lists_personal_customer_uniq
       ON price_lists (wholesaler_id, customer_id)
       WHERE is_personal = TRUE AND customer_id IS NOT NULL`,
    // Task #72: Add phone number to team members for SMS stock alerts
    `ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)`,
    // Task #73: Add expiry date to products
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE`,
    // Task #431: Add unit weight per selling unit (kg) for Quick Quote weight calculation
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_weight DECIMAL(10, 2)`,
    // Task #88: Add payment method to orders for display in order detail
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar`,
    // Task #154: Update Premium plan display price (corrected to £99.99)
    `UPDATE subscription_plans SET monthly_price = '99.99' WHERE plan_id = 'premium' AND monthly_price != '99.99'`,
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
    // 6. Attach trigger — wrapped in a DO block so DROP + CREATE are atomic and idempotent
    `DO $$ BEGIN
       DROP TRIGGER IF EXISTS trg_parse_order_number ON orders;
       CREATE TRIGGER trg_parse_order_number
         BEFORE INSERT OR UPDATE OF order_number ON orders
         FOR EACH ROW EXECUTE FUNCTION fn_parse_order_number_parts();
     END $$`,
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
    `UPDATE subscription_plans
     SET monthly_price = '899.99'
     WHERE plan_id = 'premium_annual_intro'
       AND monthly_price != '899.99'`,
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
    // Task #908: Idempotency key for order creation — prevents duplicate orders from retries/double-taps.
    // Full unique index (not partial) so ON CONFLICT can infer the constraint. NULL values never
    // conflict in Postgres, so this is functionally equivalent to a partial index but compatible
    // with Drizzle's onConflictDoNothing({ target }) syntax.
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64)`,
    // One-time migration: drop the old partial index if it exists (idempotent — no-op once converted)
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orders_idempotency_key_idx' AND indexdef LIKE '%WHERE%') THEN DROP INDEX orders_idempotency_key_idx; END IF; END $$`,
    `CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx ON orders (idempotency_key)`,
    // Task #947: Performance indexes — orders status/createdAt/customerPhone and products status
    `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`,
    `CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at)`,
    `CREATE INDEX IF NOT EXISTS orders_customer_phone_idx ON orders (customer_phone)`,
    `CREATE INDEX IF NOT EXISTS products_status_idx ON products (status)`,
    // Task #1032: Link stock movements to the batch they came from for better audit trails
    `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id INTEGER`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='stock_movements' AND constraint_name='stock_movements_batch_id_fkey') THEN ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL; END IF; END $$`,
    // Task #1046: Comprehensive backfill of missing 'initial' stock movements.
    // Covers ALL products with no initial movement — whether they had an Initial Stock
    // batch or not, and whether that batch had quantity 0 or >0.
    // Opening stock is derived from stock_before of the product's earliest movement
    // (i.e. what the stock was just before any activity started). For products with
    // no movements at all, opening stock defaults to 0.
    // The movement is timestamped 1 second before the earliest movement so it sorts first.
    // Fully idempotent — WHERE NOT EXISTS makes it a no-op once rows exist.
    `INSERT INTO stock_movements (product_id, wholesaler_id, movement_type, quantity, unit_type, stock_before, stock_after, reason, batch_id, created_at)
     SELECT
       p.id,
       p.wholesaler_id,
       'initial',
       COALESCE(first_mv.stock_before, 0),
       'units',
       0,
       COALESCE(first_mv.stock_before, 0),
       'Initial stock',
       (SELECT pb.id FROM product_batches pb WHERE pb.product_id = p.id AND pb.batch_number = 'Initial Stock' ORDER BY pb.id ASC LIMIT 1),
       COALESCE(first_mv.created_at, p.created_at) - INTERVAL '1 second'
     FROM products p
     LEFT JOIN LATERAL (
       SELECT sm.stock_before, sm.created_at
       FROM stock_movements sm
       WHERE sm.product_id = p.id
       ORDER BY sm.created_at ASC, sm.id ASC
       LIMIT 1
     ) first_mv ON true
     WHERE NOT EXISTS (
       SELECT 1 FROM stock_movements sm
       WHERE sm.product_id = p.id
         AND sm.movement_type = 'initial'
     )`,
    // Platform fee percentage column — allows admin to set platform fee rate via UI
    `ALTER TABLE platform_fee_configs ADD COLUMN IF NOT EXISTS platform_fee_percentage DECIMAL(5,4)`,
    // Subscription audit log table — tracks upgrade/downgrade/payment events per wholesaler
    `CREATE TABLE IF NOT EXISTS subscription_audit_logs (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR NOT NULL,
      from_tier VARCHAR,
      to_tier VARCHAR,
      amount DECIMAL(10,2),
      currency VARCHAR(3) DEFAULT 'GBP',
      stripe_subscription_id VARCHAR,
      stripe_customer_id VARCHAR,
      reason TEXT,
      metadata TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      ip_address VARCHAR(45),
      user_agent TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS subscription_audit_user_id_idx ON subscription_audit_logs(user_id)`,
    `CREATE INDEX IF NOT EXISTS subscription_audit_event_type_idx ON subscription_audit_logs(event_type)`,
    `CREATE INDEX IF NOT EXISTS subscription_audit_timestamp_idx ON subscription_audit_logs(timestamp)`,
    // Task #1072: Picking / checklist mode — two additive tables, no existing tables touched
    `CREATE TABLE IF NOT EXISTS order_picking (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      picking_status VARCHAR(20) NOT NULL DEFAULT 'not_started',
      completed_at TIMESTAMP,
      completed_by VARCHAR(255),
      reset_at TIMESTAMP,
      reset_by VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS order_picking_order_id_idx ON order_picking(order_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS order_picking_order_id_uniq ON order_picking(order_id)`,
    `CREATE TABLE IF NOT EXISTS order_item_picks (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      is_picked BOOLEAN NOT NULL DEFAULT FALSE,
      picked_at TIMESTAMP,
      picked_by VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS order_item_picks_order_id_idx ON order_item_picks(order_id)`,
    `CREATE INDEX IF NOT EXISTS order_item_picks_item_id_idx ON order_item_picks(order_item_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS order_item_picks_order_item_id_uniq ON order_item_picks(order_item_id)`,
    // Task #1091: Per-team-member notification preferences for stock alerts
    `ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'`,
    // Task #1098: Draft Invoices — allow order_number to be NULL for draft orders
    `ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL`,
    // Task #1103: Clean up legacy platform fee data on offline orders.
    // Orders created before the fee fix (Task #1099) may have a non-zero platform_fee
    // even though they used offline payment methods (bank_transfer, cash, cheque, pay_later, other).
    // Zero the fee and subtract it from total / amount_outstanding so financial reports
    // are accurate without any frontend workaround.
    // All SET expressions are evaluated from the old row values in PostgreSQL, so the
    // amount_outstanding calculation correctly uses the original total and amount_paid.
    // Fully idempotent — the WHERE clause filters only rows where platform_fee > 0.
    `UPDATE orders
     SET
       total              = total - COALESCE(platform_fee, 0),
       amount_outstanding = GREATEST(
                              total
                                - COALESCE(platform_fee, 0)
                                - COALESCE(amount_paid, 0),
                              0
                            ),
       platform_fee       = 0
     WHERE payment_method IN ('cash', 'bank_transfer', 'cheque', 'pay_later', 'other')
       AND COALESCE(platform_fee, 0) > 0`,
    // Task #1171: Mark citexsoft@gmail.com as a test account so it is excluded from
    // revenue analytics and clearly labelled in the admin panel. Idempotent — the WHERE
    // clause is a no-op once is_test_account is already true.
    `UPDATE users SET is_test_account = true WHERE email = 'citexsoft@gmail.com' AND role = 'wholesaler' AND is_test_account = false`,
    // Orders badge fix: distinguish wholesaler-placed vs customer-placed orders
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR`,
    // Backfill: wholesalers use offline payment methods that customers never select
    `UPDATE orders SET order_source = 'wholesaler' WHERE order_source IS NULL AND payment_method IN ('cash', 'bank_transfer', 'cheque', 'other', 'pay_later') AND is_quote = false`,
    // Backfill: Stripe payment intent = customer paid online
    `UPDATE orders SET order_source = 'customer_portal' WHERE order_source IS NULL AND stripe_payment_intent_id IS NOT NULL AND is_quote = false`,
    // Backfill: any remaining orders with no Stripe PI and no payment method are wholesaler-created
    `UPDATE orders SET order_source = 'wholesaler' WHERE order_source IS NULL AND stripe_payment_intent_id IS NULL AND is_quote = false`,
    // Backfill: derive size_per_unit = total_package_weight / pack_quantity for products where
    // size_per_unit is NULL but both source columns are present and pack_quantity > 0.
    // Fully idempotent — WHERE clause is a no-op once the column is populated.
    `UPDATE products
     SET size_per_unit = ROUND((total_package_weight / pack_quantity)::numeric, 6)
     WHERE size_per_unit IS NULL
       AND total_package_weight IS NOT NULL
       AND pack_quantity IS NOT NULL
       AND pack_quantity > 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_inactive BOOLEAN NOT NULL DEFAULT FALSE`,
    // Phase 2 public store enquiries — lead qualification fields
    `ALTER TABLE store_enquiries ADD COLUMN IF NOT EXISTS business_type VARCHAR(100)`,
    `ALTER TABLE store_enquiries ADD COLUMN IF NOT EXISTS estimated_order_volume VARCHAR(50)`,
    `ALTER TABLE store_enquiries ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(20)`,
    // Task #1221: Custom invoice message sign-off stored on the wholesaler's default business profile
    `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS invoice_sign_off TEXT`,
    // Task #1296: Prospect Stores — super-admin CRM for tracking prospective Quikpik customers
    `CREATE TABLE IF NOT EXISTS prospect_stores (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      latitude DECIMAL(10,7),
      longitude DECIMAL(10,7),
      opening_time VARCHAR(20),
      closing_time VARCHAR(20),
      type VARCHAR(20) NOT NULL DEFAULT 'retail',
      visited BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      assigned_wholesaler_ids TEXT[],
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS prospect_stores_visited_idx ON prospect_stores(visited)`,
    `CREATE INDEX IF NOT EXISTS prospect_stores_type_idx ON prospect_stores(type)`,
    `ALTER TABLE prospect_stores ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)`,
    `ALTER TABLE prospect_stores ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)`,
    `ALTER TABLE prospect_stores ADD COLUMN IF NOT EXISTS place_id VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_annual_price DECIMAL(10,2)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_monthly_price DECIMAL(10,2)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_price_plan_id VARCHAR`,
    // Task #1322: Split custom price plan binding into separate annual and monthly fields
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_price_plan_id_annual VARCHAR`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_price_plan_id_monthly VARCHAR`,
    // Backfill: migrate existing single customPricePlanId into the correct split column
    `UPDATE users SET custom_price_plan_id_annual = custom_price_plan_id FROM subscription_plans WHERE subscription_plans.plan_id = users.custom_price_plan_id AND subscription_plans.billing_interval = 'yearly' AND users.custom_price_plan_id IS NOT NULL AND users.custom_price_plan_id_annual IS NULL`,
    `UPDATE users SET custom_price_plan_id_monthly = custom_price_plan_id FROM subscription_plans WHERE subscription_plans.plan_id = users.custom_price_plan_id AND subscription_plans.billing_interval != 'yearly' AND users.custom_price_plan_id IS NOT NULL AND users.custom_price_plan_id_monthly IS NULL`,
    // Backfill 90-day trial for wholesalers who signed up before the auto-grant change.
    // Targets accounts that: are wholesalers, never had a Stripe subscription, have no
    // period end set, are still on the default free/inactive status, and signed up within
    // the last year (recency guard — avoids over-granting to long-dormant accounts).
    // Trial end is derived from created_at so accounts get the trial window they were
    // entitled to at signup, not a fresh 90 days from migration run time.
    // Idempotent — the subscription_period_end IS NULL guard makes this a no-op once applied.
    `UPDATE users
     SET
       current_plan            = 'listing',
       subscription_status     = 'trialing',
       subscription_period_end = created_at + INTERVAL '90 days'
     WHERE role = 'wholesaler'
       AND stripe_subscription_id IS NULL
       AND subscription_period_end IS NULL
       AND (subscription_status IS NULL OR subscription_status IN ('free', 'inactive'))
       AND created_at > NOW() - INTERVAL '1 year'`,
    // Task #1327: Trial expiry reminder tracking columns
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_14day_reminder_sent_at TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_3day_reminder_sent_at TIMESTAMP`,
    // Task #1370: Payment short links — short redirect URLs for WhatsApp messages
    `CREATE TABLE IF NOT EXISTS payment_short_links (
      id SERIAL PRIMARY KEY,
      code VARCHAR(16) NOT NULL UNIQUE,
      url TEXT NOT NULL,
      wholesaler_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS psl_code_idx ON payment_short_links(code)`,
    `CREATE INDEX IF NOT EXISTS psl_expires_at_idx ON payment_short_links(expires_at)`,
    // Task #1391: Central, platform-managed product categories (single shared global list).
    // products.category stays free text; this table is the source of truth for the
    // selectable category list. Created here (not only via db:push) so production gets it on boot.
    `CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // Case-insensitive uniqueness so "Beverages" and "beverages" can't both exist.
    // Created before the seeds so ON CONFLICT DO NOTHING is deterministic.
    `CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_uniq ON categories (LOWER(name))`,
    // Seed the original hardcoded defaults (idempotent — no-op once present).
    `INSERT INTO categories (name) VALUES
      ('Groceries & Food'),
      ('Fresh Produce'),
      ('Beverages & Drinks'),
      ('Snacks & Confectionery'),
      ('Personal Care & Hygiene'),
      ('Household Cleaning'),
      ('Health & Pharmacy'),
      ('Baby & Childcare'),
      ('Pet Food & Supplies')
     ON CONFLICT DO NOTHING`,
    // Carry over every distinct category already saved on products so nothing is lost.
    // DISTINCT ON (lower(trim(...))) collapses case/whitespace variants within this
    // statement so they can't conflict with each other on the unique index.
    `INSERT INTO categories (name)
     SELECT DISTINCT ON (LOWER(TRIM(category))) TRIM(category)
     FROM products
     WHERE category IS NOT NULL AND TRIM(category) <> ''
     ORDER BY LOWER(TRIM(category))
     ON CONFLICT DO NOTHING`,
    // Task #1393: Canonicalise existing product category text to match the central
    // category list. Older products may have been saved with different casing or
    // surrounding whitespace ("beverages & drinks" vs the seeded "Beverages & Drinks").
    // Rewrite each product's free-text category to the canonical categories.name when
    // they match case/whitespace-insensitively but the stored text differs, so counts,
    // renames and deletes all line up. Idempotent (no-op once everything is canonical).
    `UPDATE products p
     SET category = c.name
     FROM categories c
     WHERE p.category IS NOT NULL
       AND LOWER(TRIM(p.category)) = LOWER(TRIM(c.name))
       AND p.category <> c.name`,
    // Task #1438: Product price history — immutable log of catalog price changes via scope='all'
    `CREATE TABLE IF NOT EXISTS product_price_history (
      id SERIAL PRIMARY KEY,
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255) NOT NULL,
      selling_type VARCHAR(10) NOT NULL DEFAULT 'units',
      old_price DECIMAL(10,2) NOT NULL,
      new_price DECIMAL(10,2) NOT NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS pph_wholesaler_id_idx ON product_price_history(wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS pph_product_id_idx ON product_price_history(product_id)`,
    `CREATE INDEX IF NOT EXISTS pph_changed_at_idx ON product_price_history(wholesaler_id, changed_at)`,
    // Task #1443: Customer Portal settings — new columns with safe defaults for all existing wholesalers
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS enquiries_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS min_order_amount INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_quote_requests BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS require_approval_for_pricing BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_guest_browsing BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_contact_visible BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS show_owner_name BOOLEAN NOT NULL DEFAULT TRUE`,
    // Task #1449: Cart quote request — link store enquiries to a draft order + store cart snapshot
    `ALTER TABLE store_enquiries ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL`,
    `ALTER TABLE store_enquiries ADD COLUMN IF NOT EXISTS cart_items JSONB`,
    `ALTER TABLE store_enquiries ADD COLUMN IF NOT EXISTS wholesaler_note TEXT`,
    // Task #1509: Compound index audit — apply indexes that were declared in schema.ts but were
    // never added to startup migrations (so only existed on schema-pushed envs, not production).
    // Also add two new compound indexes identified by query analysis.
    //
    // orders (wholesaler_id, created_at) — covers paginated list ORDER BY created_at DESC
    // and stale-order detection (WHERE wholesalerId AND created_at < 15 days ago)
    `CREATE INDEX IF NOT EXISTS orders_wholesaler_created_idx ON orders (wholesaler_id, created_at)`,
    // orders (wholesaler_id, status) — covers pending-count, stale-count, and status-filtered
    // paginated list (WHERE wholesaler_id = ? AND status IN (...))
    `CREATE INDEX IF NOT EXISTS orders_wholesaler_status_idx ON orders (wholesaler_id, status)`,
    // orders (retailer_id) — covers customer-order history queries (WHERE retailer_id = ?)
    `CREATE INDEX IF NOT EXISTS orders_retailer_idx ON orders (retailer_id)`,
    // orders (payment_status) — supports payment-status filter and aggregation
    `CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status)`,
    // products (wholesaler_id, status) — covers product list (WHERE wholesaler_id = ? AND status = 'active')
    `CREATE INDEX IF NOT EXISTS products_wholesaler_status_idx ON products (wholesaler_id, status)`,
    // Manual invoice discount — wholesaler can knock a flat amount off an invoice
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_discount DECIMAL(10,2) NOT NULL DEFAULT 0.00`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_discount_note TEXT`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS hidden_from_public BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0`,
    // product_performance_summary — campaign analytics rollup per product; was missing from
    // production because it was added to schema.ts without a startup migration.
    // deleteProduct() references this table, causing a "relation does not exist" crash.
    `CREATE TABLE IF NOT EXISTS product_performance_summary (
      id SERIAL PRIMARY KEY,
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      total_campaigns INTEGER DEFAULT 0,
      active_campaigns INTEGER DEFAULT 0,
      total_promotion_views INTEGER DEFAULT 0,
      total_promotion_orders INTEGER DEFAULT 0,
      total_promotion_revenue DECIMAL(12,2) DEFAULT '0.00',
      total_revenue_loss DECIMAL(12,2) DEFAULT '0.00',
      average_discount_percentage DECIMAL(5,2) DEFAULT '0.00',
      best_performing_campaign_id VARCHAR,
      best_conversion_rate DECIMAL(5,2) DEFAULT '0.00',
      regular_price_orders INTEGER DEFAULT 0,
      regular_price_revenue DECIMAL(12,2) DEFAULT '0.00',
      promotion_effectiveness VARCHAR DEFAULT 'unknown',
      last_updated TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // stock_update_notifications — campaign stock alert notifications per product; also
    // missing from production. deleteProduct() deletes from this table unconditionally.
    `CREATE TABLE IF NOT EXISTS stock_update_notifications (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      campaign_id INTEGER REFERENCES broadcasts(id),
      template_campaign_id INTEGER REFERENCES template_campaigns(id),
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id),
      notification_type VARCHAR NOT NULL,
      previous_stock INTEGER,
      new_stock INTEGER,
      previous_price VARCHAR,
      new_price VARCHAR,
      messages_sent INTEGER DEFAULT 0,
      status VARCHAR DEFAULT 'pending',
      sent_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    // stock_alerts — low/out-of-stock notifications per product; written unconditionally
    // by checkAndCreateStockAlerts (customers.ts) and createStockAlert (broadcasts.ts).
    // Was missing from startup migrations, causing "relation does not exist" on first
    // stock-check after a fresh production deployment.
    `CREATE TABLE IF NOT EXISTS stock_alerts (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alert_type VARCHAR NOT NULL DEFAULT 'low_stock',
      current_stock INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS stock_alerts_product_id_idx ON stock_alerts (product_id)`,
    `CREATE INDEX IF NOT EXISTS stock_alerts_wholesaler_id_idx ON stock_alerts (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS stock_alerts_is_resolved_idx ON stock_alerts (wholesaler_id, is_resolved)`,
    // admin_audit_logs — tracks impersonation start/exit; written unconditionally from
    // admin-ops.ts. Missing from startup migrations caused "relation does not exist" on
    // the first impersonation action after a fresh production deployment.
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      admin_email VARCHAR NOT NULL,
      action VARCHAR NOT NULL,
      target_wholesaler_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS admin_audit_admin_email_idx ON admin_audit_logs (admin_email)`,
    `CREATE INDEX IF NOT EXISTS admin_audit_created_at_idx ON admin_audit_logs (created_at)`,
    // system_error_logs — platform error log; inserts in errorLogger.ts and
    // payments-connect.ts are all wrapped in .catch(() => {}) so the table being absent
    // is already safe, but creating it here ensures logs are actually persisted on new
    // production deployments rather than silently dropped.
    `CREATE TABLE IF NOT EXISTS system_error_logs (
      id SERIAL PRIMARY KEY,
      error_type VARCHAR NOT NULL,
      message TEXT NOT NULL,
      context JSONB DEFAULT '{}',
      wholesaler_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      severity VARCHAR NOT NULL DEFAULT 'error',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS system_errors_type_idx ON system_error_logs (error_type)`,
    `CREATE INDEX IF NOT EXISTS system_errors_created_at_idx ON system_error_logs (created_at)`,
    `CREATE INDEX IF NOT EXISTS system_errors_wholesaler_id_idx ON system_error_logs (wholesaler_id)`,
    // campaign_orders — links orders back to the campaign that generated them.
    // Must be created here so that fresh deployments have the table before any
    // order-deletion path runs; without it an FK violation would surface only
    // after a later db:push created the table.  ON DELETE CASCADE means the row
    // is removed automatically when the parent order is deleted.
    `CREATE TABLE IF NOT EXISTS campaign_orders (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES template_campaigns(id),
      template_id INTEGER REFERENCES message_templates(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    // Idempotent FK repair: existing deployments that already have the table
    // will have a plain (no-action) FK named by Drizzle as
    // campaign_orders_order_id_orders_id_fk (or the legacy manual name
    // campaign_orders_order_id_fkey).  Upgrade whichever variant exists to
    // CASCADE so single-order and bulk-delete paths can safely delete the
    // orders row without first manually cleaning up campaign_orders.
    `DO $$ DECLARE
      v_conname TEXT;
    BEGIN
      SELECT conname INTO v_conname
      FROM pg_constraint
      WHERE conname IN (
        'campaign_orders_order_id_orders_id_fk',
        'campaign_orders_order_id_fkey'
      )
        AND confdeltype != 'c'
      LIMIT 1;
      IF v_conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE campaign_orders DROP CONSTRAINT ' || quote_ident(v_conname);
        ALTER TABLE campaign_orders ADD CONSTRAINT campaign_orders_order_id_orders_id_fk
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
      END IF;
    END $$`,
    // customer_insights — nullable FK to products(id) via most_ordered_product_id.
    // Without this CREATE TABLE the try/catch in deleteProduct() silently swallows
    // "relation does not exist" instead of nulling the column, leaving a latent FK
    // violation risk once the table is eventually created by a future migration run.
    `CREATE TABLE IF NOT EXISTS customer_insights (
      id SERIAL PRIMARY KEY,
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id VARCHAR NOT NULL,
      customer_name VARCHAR,
      customer_email VARCHAR,
      total_orders INTEGER DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT '0.00',
      average_order_value DECIMAL(10,2) DEFAULT '0.00',
      last_order_date TIMESTAMP,
      first_order_date TIMESTAMP,
      days_since_last_order INTEGER DEFAULT 0,
      campaigns_received INTEGER DEFAULT 0,
      campaigns_opened INTEGER DEFAULT 0,
      purchases_from_campaigns INTEGER DEFAULT 0,
      favorite_category VARCHAR,
      most_ordered_product_id INTEGER REFERENCES products(id),
      total_unique_products INTEGER DEFAULT 0,
      loyalty_score INTEGER DEFAULT 0,
      risk_level VARCHAR DEFAULT 'low',
      customer_tier VARCHAR DEFAULT 'standard',
      predicted_next_order_date TIMESTAMP,
      churn_risk DECIMAL(5,2) DEFAULT '0.00',
      recommended_products JSONB DEFAULT '[]',
      last_updated TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS customer_insights_wholesaler_id_idx ON customer_insights (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS customer_insights_customer_id_idx ON customer_insights (customer_id)`,
    // business_intelligence — nullable FK to products(id) via top_selling_product_id.
    // Same rationale as customer_insights above.
    `CREATE TABLE IF NOT EXISTS business_intelligence (
      id SERIAL PRIMARY KEY,
      wholesaler_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_date TIMESTAMP NOT NULL,
      report_type VARCHAR NOT NULL,
      total_revenue DECIMAL(12,2) DEFAULT '0.00',
      total_orders INTEGER DEFAULT 0,
      average_order_value DECIMAL(10,2) DEFAULT '0.00',
      top_selling_product_id INTEGER REFERENCES products(id),
      top_selling_product_revenue DECIMAL(12,2) DEFAULT '0.00',
      total_products_sold INTEGER DEFAULT 0,
      new_customers INTEGER DEFAULT 0,
      returning_customers INTEGER DEFAULT 0,
      customer_retention_rate DECIMAL(5,2) DEFAULT '0.00',
      campaigns_sent INTEGER DEFAULT 0,
      campaign_revenue DECIMAL(12,2) DEFAULT '0.00',
      campaign_conversion_rate DECIMAL(5,2) DEFAULT '0.00',
      revenue_growth_rate DECIMAL(5,2) DEFAULT '0.00',
      order_growth_rate DECIMAL(5,2) DEFAULT '0.00',
      customer_growth_rate DECIMAL(5,2) DEFAULT '0.00',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS business_intelligence_wholesaler_id_idx ON business_intelligence (wholesaler_id)`,
    `CREATE INDEX IF NOT EXISTS business_intelligence_report_date_idx ON business_intelligence (report_date)`,
    // FK repair: order_cancellation_requests.order_id had no ON DELETE action, so
    // deleting an order that had a customer cancellation request would fail with a
    // FK violation. Upgrade to CASCADE so the request row is removed automatically
    // when its parent order is deleted.
    `DO $$ BEGIN
      ALTER TABLE order_cancellation_requests
        DROP CONSTRAINT IF EXISTS order_cancellation_requests_order_id_fkey;
      ALTER TABLE order_cancellation_requests
        ADD CONSTRAINT order_cancellation_requests_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,
    // Wholesaler verified badge — admin-awarded trust signal (isVerified + metadata columns)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by VARCHAR`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes TEXT`,
    // Task #1540: Miscellaneous charge line items — non-product lines on invoices.
    // custom_label holds the wholesaler-typed charge name; item_notes holds an optional
    // free-text note. Both are nullable so existing product rows are unaffected.
    `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_label VARCHAR(255)`,
    `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_notes TEXT`,
    // One-time cleanup: cancel any seed orders stuck in 'processing' (idempotent no-op once done)
    `UPDATE orders SET status = 'cancelled' WHERE status = 'processing' AND order_number LIKE 'SEED-%'`,
    // RRP per product with store-level toggle
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS rrp DECIMAL(10, 2)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS rrp_visible BOOLEAN NOT NULL DEFAULT FALSE`,
  ];
  let warned = 0;
  for (const stmt of migrations) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err: any) {
      // All migrations use IF NOT EXISTS / IF EXISTS guards and are idempotent.
      // A failure here is almost always a transient lock timeout in production
      // (the object already exists from a prior deployment). Log a warning and
      // continue — never let a DDL hiccup prevent the server from starting.
      warned++;
      console.warn(`⚠️  Migration warning #${warned} (non-fatal, continuing):\n  ${stmt.substring(0, 120)}…\n  ${err?.message ?? err}`);
    }
  }
  console.log(`✅ Startup DB migrations applied (${migrations.length} statements${warned ? `, ${warned} non-fatal warning(s)` : ''})`);
}

// Idempotent fix: ensures the Stripe Price objects for all paid monthly plans match the
// monthly_price stored in the subscription_plans table. Stripe prices are immutable —
// if the unit_amount, currency, interval, or product is wrong a new price is created
// and the old one is archived.
// For listing/starter plans that have no Stripe product yet, the product+price are
// created automatically on first run and the IDs are persisted to the DB.
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
    name: subscriptionPlans.name,
    stripePriceId: subscriptionPlans.stripePriceId,
    stripeProductId: subscriptionPlans.stripeProductId,
    monthlyPrice: subscriptionPlans.monthlyPrice,
    currency: subscriptionPlans.currency,
    billingInterval: subscriptionPlans.billingInterval,
  }).from(subscriptionPlans).where(inArray(subscriptionPlans.planId, ['listing', 'starter', 'standard', 'premium', 'standard_annual_intro', 'premium_annual_intro']));

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
      // No price ID yet — create product+price from scratch
      if (!plan.stripePriceId) {
        if (!plan.stripeProductId) {
          // No Stripe product at all — create it now (happens for listing/starter on first run)
          console.log(`🆕 No Stripe product/price recorded for ${plan.planId} — creating product and price`);
          const product = await stripeClient.products.create({
            name: plan.name ?? plan.planId,
            metadata: { planId: plan.planId, platform: 'quikpik' },
          });
          const newPrice = await stripeClient.prices.create({
            unit_amount: unitAmount,
            currency,
            recurring: { interval: stripeInterval },
            product: product.id,
            metadata: { planId: plan.planId, platform: 'quikpik' },
          });
          await db.update(subscriptionPlans)
            .set({ stripeProductId: product.id, stripePriceId: newPrice.id })
            .where(eq(subscriptionPlans.planId, plan.planId));
          console.log(`✅ Created Stripe product+price for ${plan.planId}: product=${product.id}, price=${newPrice.id}`);
          fixed++;
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

import rateLimit from "express-rate-limit";

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api') || req.path.startsWith('/api/webhooks'),
  message: { error: 'Too many requests from this IP. Please try again later.' },
});

const app = express();
app.use(generalApiLimiter);
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

// Readiness flag — set to true once DB and routes are fully initialised.
// API routes return 503 until ready; /api/health always responds.
let isReady = false;

// Gate middleware — must be registered before routes so it runs first.
// /api/health bypasses this so the platform can always probe it.
// Non-API routes (frontend) get a branded loading page during the startup window
// instead of Express's bare "Cannot GET /" error.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isReady) return next();
  if (req.path === '/api/health') return next();
  if (req.path.startsWith('/api')) {
    return res.status(503).json({ error: 'Server is starting up, please try again in a moment.' });
  }
  // Frontend routes — serve a minimal auto-refreshing loading page
  res.status(503).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="3" />
  <title>Quikpik — Starting up</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9fafb;font-family:system-ui,sans-serif}
    .card{text-align:center;padding:2.5rem 3rem;background:#fff;border-radius:1rem;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#16a34a;margin:0 4px;animation:bounce 1.2s infinite ease-in-out}
    .dot:nth-child(2){animation-delay:.2s}
    .dot:nth-child(3){animation-delay:.4s}
    @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}
    h1{font-size:1.5rem;color:#15803d;margin-bottom:.5rem;font-weight:700}
    p{color:#6b7280;font-size:.95rem;margin-bottom:1.5rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>Quikpik</h1>
    <p>Starting up, please wait…</p>
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
</body>
</html>`);
});

// Minimal health endpoint registered immediately so the deployment platform
// receives a valid response as soon as the port is open.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: isReady ? 'healthy' : 'starting',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

const SERVER_START_TIME = Date.now();
app.get('/api/version', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({ version: SERVER_START_TIME });
});

const port = 5000;

// Create the HTTP server and start listening IMMEDIATELY so the deployment
// platform sees port 5000 open within seconds, before any DB work begins.
const httpServer = createServer(app);
httpServer.listen({ port, host: '0.0.0.0', reusePort: true }, () => {
  console.log(`✅ Port ${port} open — server accepting connections (DB init in progress)`);
  log(`serving on port ${port}`);
});

(async () => {
  try {
    console.log("🚀 Starting Quikpik server...");

    // Warn about optional service keys that will silently degrade if missing
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn("⚠️  TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — SMS and WhatsApp notifications will be unavailable");
    }
    if (!process.env.SENDGRID_API_KEY) {
      console.warn("⚠️  SENDGRID_API_KEY not set — email notifications will be unavailable");
    }
    if (!process.env.OPENAI_API_KEY) {
      console.warn("⚠️  OPENAI_API_KEY not set — AI features will be unavailable");
    }

    // Validate database connection — retries up to 8× with backoff (capped at 30s).
    // Because the port is already open, this can take as long as needed
    // without triggering a "port never opened" failure.
    let dbConnected = await validateDatabaseConnection();

    // Helper: run all DB-dependent startup tasks (migrations, plans, Stripe prices).
    // Called immediately if DB is up, or deferred to background retry if not.
    async function runDbStartupTasks() {
      await runStartupMigrations();
      const { SubscriptionService } = await import("./subscription-service");
      await SubscriptionService.initializePlans();
      await SubscriptionService.initializeAnnualPlans();
      await fixStripePricesIfNeeded();
    }

    if (dbConnected) {
      await runDbStartupTasks();
    } else {
      console.warn("⚠️  Initial DB connection attempts failed — frontend will be served while DB retries in background");
      // Non-blocking background retry: attempt every 30s until DB is reachable
      (async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          await new Promise(r => setTimeout(r, 30_000));
          try {
            await db.execute(sql`SELECT 1`);
            console.log("✅ Database reconnected — running deferred startup tasks");
            await runDbStartupTasks();
            console.log("✅ Deferred startup tasks complete");
            break;
          } catch {
            console.warn("⚠️  Background DB retry failed — will try again in 30s");
          }
        }
      })();
    }

    // Register all API routes onto the shared express app — always runs regardless of DB state
    const { registerRoutes } = await import("./routes");
    const { setupVite, serveStatic } = await import("./vite");

    await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });

    // Vite dev server or static assets — must come after API routes, always registered
    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    // Mark server as ready — gate middleware now passes all requests through
    isReady = true;
    console.log(`✅ Server fully initialised and ready on port ${port}`);
    console.log(`🌐 Health check available at: http://localhost:${port}/api/health`);

    // Start background services
    startDatabaseMaintenance();
    console.log(`🧹 Database maintenance scheduler enabled`);

    const { stockAlertService } = await import("./services/stockAlertService");
    cron.schedule('0 8 * * *', async () => {
      console.log('📦 Running daily stock level check...');
      try {
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

    cron.schedule('0 9 * * *', async () => {
      console.log('📧 Running payment reminder check...');
      try {
        await checkAndSendPaymentReminders();
      } catch (error) {
        console.error('❌ Payment reminder check failed:', error);
      }
    });
    console.log(`📧 Payment reminder system enabled (daily at 9 AM)`);

    cron.schedule('0 9 * * *', async () => {
      console.log('⏳ Running trial expiry reminder check...');
      try {
        const sent = await checkAndSendTrialReminders();
        if (sent > 0) console.log(`⏳ Trial reminders: ${sent} email(s) sent`);
      } catch (error) {
        console.error('❌ Trial reminder check failed:', error);
      }
    });
    console.log(`⏳ Trial expiry reminder system enabled (daily at 9 AM)`);

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

    cron.schedule('0 11 * * *', async () => {
      try {
        const { SubscriptionService: SS } = await import("./subscription-service");
        await SS.runMonthlyPriceSwitchIfDue();
        await SS.runAnnualPlanMigrationIfDue();
        await SS.runExpiredSubscriptionDowngrades();
        await fixStripePricesIfNeeded();
      } catch (error) {
        console.error('❌ Daily pricing/plan maintenance check failed:', error);
      }
    });
    console.log(`📅 Daily pricing & plan migration scheduler enabled (daily at 11 AM)`);

    cron.schedule('0 7 * * *', async () => {
      console.log('📬 Running weekly order digest check...');
      try {
        const sent = await checkAndSendWeeklyOrderDigests();
        if (sent > 0) console.log(`📬 Weekly order digest: ${sent} email(s) sent`);
      } catch (error) {
        console.error('❌ Weekly order digest check failed:', error);
      }
    });
    console.log(`📬 Weekly order digest enabled (daily check, sends once per week per wholesaler)`);

    cron.schedule('0 2 * * *', async () => {
      try {
        await pruneExpiredShortLinks();
      } catch (error) {
        console.error('❌ Expired short link pruning failed:', error);
      }
    });
    console.log(`🔗 Payment short-link pruning enabled (daily at 2 AM)`);

    // Run once immediately at startup to catch any missed downgrades from webhook failures
    try {
      const { SubscriptionService: SS } = await import("./subscription-service");
      await SS.runExpiredSubscriptionDowngrades();
    } catch (err) {
      console.error('❌ Startup expired subscription check failed:', err);
    }

    // One-time backfill: populate missing/stale subscription period dates for all
    // active paid subscribers by fetching their live Stripe subscription.
    // Guarded — only runs if there are affected rows; becomes a no-op once complete.
    try {
      const { SubscriptionService: SS2 } = await import("./subscription-service");
      await SS2.backfillMissingBillingPeriods();
    } catch (err) {
      console.error('❌ Startup billing period backfill failed:', err);
    }

    // Startup tier sync: cross-check each paid subscriber's DB subscription_tier
    // against their live Stripe product and correct any drift.
    try {
      const { SubscriptionService: SS3 } = await import("./subscription-service");
      await SS3.backfillSubscriptionTiers();
    } catch (err) {
      console.error('❌ Startup subscription tier sync failed:', err);
    }

  } catch (error) {
    console.error("❌ Server initialisation error:", error);
    // Keep process alive — port is already open, 503 gate protects routes
  }
})();
