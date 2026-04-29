/**
 * Quikpik platform fee calculations — single source of truth.
 *
 * Customer transaction fee: configurable via Admin (default 5.5% + £0.50).
 * Wholesaler platform fee:  4.6% of product subtotal (not shown to customers).
 *
 * The customer fee defaults are used as fallback when no DB config is available.
 * All order-creation call sites should fetch the current config and pass it in.
 */

export const CUSTOMER_FEE_RATE = 0.055;
export const CUSTOMER_FEE_FIXED = 0.50;
export const PLATFORM_FEE_RATE = 0.046;

export interface CustomerFeeConfig {
  percentage: number; // e.g. 0.055 for 5.5%
  fixed: number;      // e.g. 0.50 for £0.50
}

/**
 * Calculate the customer-facing transaction fee.
 * @param subtotal   Product subtotal (£)
 * @param delivery   Delivery cost (£), 0 for pickup
 * @param config     Optional override — uses hardcoded defaults if omitted
 */
export function calculateCustomerFee(subtotal: number, delivery: number, config?: CustomerFeeConfig): number {
  const rate = config?.percentage ?? CUSTOMER_FEE_RATE;
  const fixed = config?.fixed ?? CUSTOMER_FEE_FIXED;
  return (subtotal + delivery) * rate + fixed;
}

/**
 * Calculate the wholesaler platform fee (internal use only — never show to customers).
 * @param subtotal  Product subtotal (£)
 */
export function calculatePlatformFee(subtotal: number): number {
  return subtotal * PLATFORM_FEE_RATE;
}

/**
 * Human-readable label for the customer transaction fee, e.g. "5.5% + £0.50".
 * Trailing zeros in the percentage are stripped (5.5% not 5.50%).
 */
export function customerFeeLabel(config?: CustomerFeeConfig): string {
  const rate = config?.percentage ?? CUSTOMER_FEE_RATE;
  const fixed = config?.fixed ?? CUSTOMER_FEE_FIXED;
  const pct = parseFloat((rate * 100).toFixed(4));
  return `${pct}% + £${fixed.toFixed(2)}`;
}
