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

import { calculateCustomerFee, calculatePlatformFee } from '../../shared/utils/fees';

export type CheckoutInput = {
  productSubtotal: number;
  deliveryCost: number;
  /** Net coupon/discount already deducted from productSubtotal before calling this function. */
  couponDiscount?: number;
};

export type CheckoutCalculation = {
  productSubtotal: number;
  deliveryCost: number;
  couponDiscount: number;
  /** productSubtotal + deliveryCost − couponDiscount — the base on which all fees are applied. */
  amountBeforeFees: number;
  /** Customer-facing transaction fee: 5.5% of amountBeforeFees + £0.50. */
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
};

/**
 * Compute every monetary value produced during a checkout, from raw
 * product subtotal through to the two integers required by Stripe.
 */
export function calculateCheckoutTotals(input: CheckoutInput): CheckoutCalculation {
  const { productSubtotal, deliveryCost, couponDiscount = 0 } = input;

  const amountBeforeFees = Math.max(0, productSubtotal + deliveryCost - couponDiscount);

  const customerTransactionFee = calculateCustomerFee(amountBeforeFees, 0);
  const totalCustomerPays = amountBeforeFees + customerTransactionFee;

  const wholesalerPlatformFee = calculatePlatformFee(amountBeforeFees);
  const wholesalerReceives = amountBeforeFees - wholesalerPlatformFee;

  const stripeAmountPence = Math.round(totalCustomerPays * 100);
  const stripeApplicationFeePence = Math.round(wholesalerPlatformFee * 100);

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
  };
}
