/**
 * Quikpik platform fee calculations — single source of truth.
 *
 * Customer transaction fee: 5.5% of (subtotal + delivery) + £0.50 fixed charge.
 * Wholesaler platform fee:  4.6% of product subtotal (not shown to customers).
 *
 * To adjust rates, change the constants here only.
 */

export const CUSTOMER_FEE_RATE = 0.055;
export const CUSTOMER_FEE_FIXED = 0.50;
export const PLATFORM_FEE_RATE = 0.046;

/**
 * Calculate the customer-facing transaction fee.
 * @param subtotal  Product subtotal (£)
 * @param delivery  Delivery cost (£), 0 for pickup
 */
export function calculateCustomerFee(subtotal: number, delivery: number): number {
  return (subtotal + delivery) * CUSTOMER_FEE_RATE + CUSTOMER_FEE_FIXED;
}

/**
 * Calculate the wholesaler platform fee (internal use only — never show to customers).
 * @param subtotal  Product subtotal (£)
 */
export function calculatePlatformFee(subtotal: number): number {
  return subtotal * PLATFORM_FEE_RATE;
}
