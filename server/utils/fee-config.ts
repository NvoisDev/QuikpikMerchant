/**
 * Server-side fee config helpers.
 * Always queries the DB for the latest config row; falls back to the
 * hardcoded defaults in shared/utils/fees.ts when the table is empty.
 */

import { db } from "../db";
import { platformFeeConfigs } from "../../shared/schema";
import { desc } from "drizzle-orm";
import { CUSTOMER_FEE_RATE, CUSTOMER_FEE_FIXED, type CustomerFeeConfig } from "../../shared/utils/fees";

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

/** Return last N fee config rows, newest first. */
export async function getFeeConfigHistory(limit = 10) {
  return db
    .select()
    .from(platformFeeConfigs)
    .orderBy(desc(platformFeeConfigs.id))
    .limit(limit);
}
