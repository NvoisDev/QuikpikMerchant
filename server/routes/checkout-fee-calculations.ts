/**
 * Pure calculation logic for the checkout fee composition layer.
 *
 * Extracted from the marketplace checkout route so the full chain —
 * product subtotal → customer fee → Stripe pence amount — can be
 * exercised in tests without needing a live database or Stripe account.
 *
 * For rate changes, update shared/utils/fees.ts only. This module
 * delegates entirely to those canonical helpers.
 */

import { calculateCustomerFee, calculatePlatformFee, type CustomerFeeConfig } from '../../shared/utils/fees';

export type CheckoutInput = {
  productSubtotal: number;
  deliveryCost: number;
  /** Net coupon/discount already deducted from productSubtotal before calling this function. */
  couponDiscount?: number;
  /** Live fee config fetched from DB — uses hardcoded defaults when omitted. */
  feeConfig?: CustomerFeeConfig;
  /** Per-wholesaler platform fee rate override (e.g. 0.02 for 2%). Falls back to PLATFORM_FEE_RATE (1.5% + £0.50) when omitted. */
  platformFeeRate?: number;
};

export type CheckoutCalculation = {
  productSubtotal: number;
  deliveryCost: number;
  couponDiscount: number;
  /** productSubtotal + deliveryCost − couponDiscount — the base on which all fees are applied. */
  amountBeforeFees: number;
  /** Customer-facing transaction fee: configurable % of amountBeforeFees + fixed amount. */
  customerTransactionFee: number;
  /** Total the customer is charged (amountBeforeFees + customerTransactionFee). */
  totalCustomerPays: number;
  /** Internal platform fee deducted from what the wholesaler receives: 4.6% of amountBeforeFees. */
  wholesalerPlatformFee: number;
  /** Net amount transferred to the wholesaler (amountBeforeFees − wholesalerPlatformFee). */
  wholesalerReceives: number;
  /** Integer pence value passed as `amount` to stripe.paymentIntents.create / checkout.sessions.create. */
  stripeAmountPence: number;
  /** Integer pence value passed as `application_fee_amount` to Stripe. */
  stripeApplicationFeePence: number;
  /** The fee config that was used — for snapshotting on the order record. */
  feeConfig: CustomerFeeConfig;
};

/**
 * Compute every monetary value produced during a checkout, from raw
 * product subtotal through to the two integers required by Stripe.
 */
export function calculateCheckoutTotals(input: CheckoutInput): CheckoutCalculation {
  const { productSubtotal, deliveryCost, couponDiscount = 0, feeConfig, platformFeeRate } = input;

  const amountBeforeFees = Math.max(0, productSubtotal + deliveryCost - couponDiscount);

  const customerTransactionFee = calculateCustomerFee(amountBeforeFees, 0, feeConfig);
  const totalCustomerPays = amountBeforeFees + customerTransactionFee;

  const wholesalerPlatformFee = platformFeeRate !== undefined
    ? amountBeforeFees * platformFeeRate
    : calculatePlatformFee(amountBeforeFees);
  const wholesalerReceives = amountBeforeFees - wholesalerPlatformFee;

  const stripeAmountPence = Math.round(totalCustomerPays * 100);
  const stripeApplicationFeePence = Math.round(wholesalerPlatformFee * 100);

  // Resolve the effective config (for snapshotting)
  const effectiveConfig: CustomerFeeConfig = feeConfig ?? { percentage: 0.055, fixed: 0.50 };

  return {
    productSubtotal,
    deliveryCost,
    couponDiscount,
    amountBeforeFees,
    customerTransactionFee,
    totalCustomerPays,
    wholesalerPlatformFee,
    wholesalerReceives,
    stripeAmountPence,
    stripeApplicationFeePence,
    feeConfig: effectiveConfig,
  };
}
