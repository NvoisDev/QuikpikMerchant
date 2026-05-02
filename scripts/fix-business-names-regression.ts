/**
 * One-time data migration: Fix business names on orders created during the regression window.
 *
 * Context:
 *   Commits a1f20e45 / bc4c7687 (merged May 1, 2026) introduced a regression where the
 *   `customerName` snapshot on new orders was populated from the personal name fields
 *   instead of `businessName`. The forward-fix is already in place; this script patches
 *   orders created after those commits that still carry the wrong value.
 *
 * Regression window (defaults):
 *   Start: 2026-05-01T00:00:00.000Z  (bad commits first deployed)
 *   End:   2026-05-02T23:59:59.999Z  (forward fix deployed on May 2; hard-coded so the
 *                                     window stays bounded even if the script is re-run later)
 *
 *   Override via env vars if the actual deployment timestamps are known more precisely:
 *     REGRESSION_START=2026-05-01T00:00:00.000Z
 *     REGRESSION_END=2026-05-02T12:00:00.000Z
 *
 * What it does:
 *   1. Selects every order whose `created_at` falls within the regression window.
 *   2. Joins to `users` on `retailer_id` to retrieve the correct `business_name`.
 *   3. Skips orders where the customer has no `businessName` (no change needed).
 *   4. Skips orders where `customerName` already equals `businessName` (already correct).
 *   5. Prints a detailed report of what would change (dry-run by default).
 *   6. When DRY_RUN=false, applies the updates row-by-row and reports results.
 *
 * Usage:
 *   # Dry-run (default): just show what would be fixed
 *   npx tsx scripts/fix-business-names-regression.ts
 *
 *   # Apply changes
 *   DRY_RUN=false npx tsx scripts/fix-business-names-regression.ts
 *
 *   # Custom window
 *   REGRESSION_START=2026-05-01T00:00:00Z REGRESSION_END=2026-05-02T18:00:00Z DRY_RUN=false \
 *     npx tsx scripts/fix-business-names-regression.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { eq, and, gte, lt } from 'drizzle-orm';
import * as schema from '../shared/schema.js';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set.');
  process.exit(1);
}

// Regression window
// Start: when the bad commits were first deployed (beginning of May 1 UTC)
// End:   end of May 2 UTC — hard-coded so the window is always bounded, even on future re-runs.
//        The forward fix was deployed on May 2, so no orders after this date are affected.
const WINDOW_START = new Date(process.env.REGRESSION_START ?? '2026-05-01T00:00:00.000Z');
const WINDOW_END   = new Date(process.env.REGRESSION_END   ?? '2026-05-02T23:59:59.999Z');

// Set DRY_RUN=false to actually apply changes; any other value (or omitting it) is a dry run
const DRY_RUN = process.env.DRY_RUN !== 'false';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db   = drizzle({ client: pool, schema });

async function main() {
  console.log('=== Business-name regression fix ===');
  console.log(`Window : ${WINDOW_START.toISOString()} – ${WINDOW_END.toISOString()} (exclusive end)`);
  console.log(`Mode   : ${DRY_RUN ? 'DRY RUN (no changes will be written)' : 'LIVE — changes will be applied'}\n`);

  if (WINDOW_START >= WINDOW_END) {
    console.error('❌ REGRESSION_START must be earlier than REGRESSION_END.');
    process.exit(1);
  }

  // 1. Fetch all orders in the regression window together with the retailer's businessName.
  const rows = await db
    .select({
      orderId:      schema.orders.id,
      customerName: schema.orders.customerName,
      businessName: schema.users.businessName,
    })
    .from(schema.orders)
    .innerJoin(schema.users, eq(schema.orders.retailerId, schema.users.id))
    .where(
      and(
        gte(schema.orders.createdAt, WINDOW_START),
        lt(schema.orders.createdAt, WINDOW_END),
      )
    );

  console.log(`Orders found in window : ${rows.length}`);

  if (rows.length === 0) {
    console.log('✅ Nothing to fix — no orders in the regression window.');
    await pool.end();
    return;
  }

  // 2. Identify which orders actually need updating.
  const toFix: { orderId: number; correctName: string; currentName: string | null }[] = [];

  for (const row of rows) {
    if (!row.businessName) {
      // Customer has no business name — snapshot is as correct as it can be.
      continue;
    }
    if (row.customerName === row.businessName) {
      // Already correct.
      continue;
    }
    toFix.push({
      orderId:     row.orderId,
      correctName: row.businessName,
      currentName: row.customerName,
    });
  }

  console.log(`Orders that need fixing : ${toFix.length}`);

  if (toFix.length === 0) {
    console.log('✅ All orders already have the correct business name.');
    await pool.end();
    return;
  }

  // 3. Print a preview of every change.
  console.log('\nOrders to update:');
  for (const fix of toFix) {
    console.log(`  Order #${fix.orderId}: "${fix.currentName ?? '(null)'}" → "${fix.correctName}"`);
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes written. Re-run with DRY_RUN=false to apply.');
    await pool.end();
    return;
  }

  // 4. Apply updates row-by-row so each order gets its own correct business name.
  console.log('\nApplying updates…');
  let successCount = 0;
  let errorCount   = 0;

  for (const fix of toFix) {
    try {
      await db
        .update(schema.orders)
        .set({ customerName: fix.correctName })
        .where(eq(schema.orders.id, fix.orderId));

      console.log(`  ✅ Order #${fix.orderId} updated.`);
      successCount++;
    } catch (err) {
      console.error(`  ❌ Failed to update order #${fix.orderId}:`, err);
      errorCount++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Updated : ${successCount}`);
  if (errorCount > 0) {
    console.log(`  Errors  : ${errorCount}`);
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
