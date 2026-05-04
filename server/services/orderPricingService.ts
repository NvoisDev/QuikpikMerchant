/**
 * OrderPricingService — single place for fee math + snapshot assembly.
 *
 * All order-creation paths (quick-order, quote, reorder) call this
 * instead of duplicating the calculateCustomerFee / calculatePlatformFee
 * calls and the feePercentageUsed / fixedFeeUsed snapshot strings.
 */

import { calculateCustomerFee, calculatePlatformFee, type CustomerFeeConfig } from "../../shared/utils/fees";

export interface OrderPricingInput {
  subtotal: number;
  deliveryCost: number;
  feeConfig: CustomerFeeConfig;
  /** Optional per-wholesaler platform fee rate (falls back to default 4.6%). */
  platformFeeRate?: number;
}

export interface OrderPricingResult {
  customerTransactionFee: number;
  platformFee: number;
  /** Decimal string for DB storage, e.g. "0.0550" */
  feePercentageUsed: string;
  /** Decimal string for DB storage, e.g. "0.50" */
  fixedFeeUsed: string;
}

/**
 * Calculate customer-facing and platform fees plus the snapshot strings
 * that are persisted on the order record for audit purposes.
 */
export function calculateOrderPricing(input: OrderPricingInput): OrderPricingResult {
  const { subtotal, deliveryCost, feeConfig, platformFeeRate } = input;

  const customerTransactionFee = calculateCustomerFee(subtotal, deliveryCost, feeConfig);

  const platformFee =
    platformFeeRate !== undefined
      ? subtotal * platformFeeRate
      : calculatePlatformFee(subtotal);

  return {
    customerTransactionFee,
    platformFee,
    feePercentageUsed: feeConfig.percentage.toFixed(4),
    fixedFeeUsed: feeConfig.fixed.toFixed(2),
  };
}
