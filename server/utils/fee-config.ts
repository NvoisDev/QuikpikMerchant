/**
 * Server-side fee config helpers.
 * Always queries the DB for the latest config row; falls back to the
 * hardcoded defaults in shared/utils/fees.ts when the table is empty.
 */

import { db } from "../db";
import { platformFeeConfigs, users } from "../../shared/schema";
import { desc, eq } from "drizzle-orm";
import { CUSTOMER_FEE_RATE, CUSTOMER_FEE_FIXED, PLATFORM_FEE_RATE, type CustomerFeeConfig } from "../../shared/utils/fees";

/** Always returns a valid fee config. Never throws. */
export async function getCurrentFeeConfig(): Promise<CustomerFeeConfig & { id: number | null; createdAt: Date | null; createdBy: string | null }> {
  try {
    const [latest] = await db
      .select()
      .from(platformFeeConfigs)
      .orderBy(desc(platformFeeConfigs.id))
      .limit(1);

    if (latest) {
      return {
        id: latest.id,
        percentage: parseFloat(latest.customerPercentageFee),
        fixed: parseFloat(latest.customerFixedFee),
        createdAt: latest.createdAt,
        createdBy: latest.createdBy,
      };
    }
  } catch (err) {
    console.error("[fee-config] Failed to fetch fee config from DB, using defaults:", err);
  }

  return {
    id: null,
    percentage: CUSTOMER_FEE_RATE,
    fixed: CUSTOMER_FEE_FIXED,
    createdAt: null,
    createdBy: null,
  };
}

/** Save a new fee config row (append-only). */
export async function saveFeeConfig(opts: { percentage: number; fixed: number; notes?: string; changedBy: string }) {
  const [row] = await db
    .insert(platformFeeConfigs)
    .values({
      customerPercentageFee: opts.percentage.toFixed(4),
      customerFixedFee: opts.fixed.toFixed(2),
      notes: opts.notes || null,
      createdBy: opts.changedBy,
    })
    .returning();
  return row;
}

/**
 * Returns the effective customer fee config for a specific wholesaler.
 * Fallback chain:
 *   1. Per-wholesaler override columns on `users` (either or both fields)
 *   2. System-wide `platformFeeConfigs` table
 *   3. Hardcoded constants in shared/utils/fees.ts
 * Never throws.
 */
export async function getFeeConfigForWholesaler(
  wholesalerId: string,
): Promise<CustomerFeeConfig & { id: number | null; createdAt: Date | null; createdBy: string | null }> {
  try {
    const systemConfig = await getCurrentFeeConfig();
    const [wholesaler] = await db
      .select({ customerFeePercentage: users.customerFeePercentage, customerFixedFee: users.customerFixedFee })
      .from(users)
      .where(eq(users.id, wholesalerId))
      .limit(1);

    if (!wholesaler) return systemConfig;

    const hasPct   = wholesaler.customerFeePercentage !== null && wholesaler.customerFeePercentage !== undefined;
    const hasFixed = wholesaler.customerFixedFee     !== null && wholesaler.customerFixedFee     !== undefined;

    if (!hasPct && !hasFixed) return systemConfig;

    const effectivePct   = hasPct   ? parseFloat(wholesaler.customerFeePercentage!) : systemConfig.percentage;
    const effectiveFixed = hasFixed ? parseFloat(wholesaler.customerFixedFee!)      : systemConfig.fixed;

    // When the percentage override is explicitly 0 and no fixed override was set,
    // treat the entire fee as zero. A 0% rate means "no fee" — applying the
    // system's fixed component would still charge the customer despite the intent.
    const resolvedFixed = (hasPct && effectivePct === 0 && !hasFixed) ? 0 : effectiveFixed;

    return {
      id: null,
      percentage: effectivePct,
      fixed:      resolvedFixed,
      createdAt: null,
      createdBy: null,
    };
  } catch (err) {
    console.error("[fee-config] getFeeConfigForWholesaler error, falling back to system config:", err);
    return getCurrentFeeConfig();
  }
}

/**
 * Returns the effective platform fee rate for a specific wholesaler.
 * Uses the per-wholesaler `customFeePercentage` override when set (stored as raw %,
 * e.g. "2.00" = 2% → returned as 0.02 decimal rate).
 * Falls back to the hardcoded PLATFORM_FEE_RATE (1.5% + £0.50) when no override is set.
 * Never throws.
 */
export async function getWholesalerPlatformFeeRate(wholesalerId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ customFeePercentage: users.customFeePercentage })
      .from(users)
      .where(eq(users.id, wholesalerId))
      .limit(1);

    if (row?.customFeePercentage !== null && row?.customFeePercentage !== undefined) {
      const raw = parseFloat(row.customFeePercentage);
      if (!isNaN(raw) && raw >= 0) {
        return raw / 100; // stored as "2.00" for 2% — convert to 0.02
      }
    }
  } catch (err) {
    console.error("[fee-config] getWholesalerPlatformFeeRate error, using default:", err);
  }
  return PLATFORM_FEE_RATE;
}

/** Return last N fee config rows, newest first. */
export async function getFeeConfigHistory(limit = 10) {
  return db
    .select()
    .from(platformFeeConfigs)
    .orderBy(desc(platformFeeConfigs.id))
    .limit(limit);
}
