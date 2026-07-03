export type OrderPaymentBasis = {
  subtotal?: string | null;
  deliveryCost?: string | null;
  amountPaid?: string | null;
  amountOutstanding?: string | null;
  paymentMethod?: string | null;
  stripePaymentIntentId?: string | null;
  stripePaymentLinkId?: string | null;
  customerTransactionFee?: string | null;
};

export type StripePaymentSettlementInput = {
  total: string | null | undefined;
  amountPaid: string | null | undefined;
};

export type StripePaymentSettlement = {
  cumulativePaid: number;
  newAmountOutstanding: number;
  paymentStatus: 'unpaid' | 'part_paid' | 'paid';
};

/**
 * Pure recomputation of order balance after a Stripe checkout.session.completed or
 * payment_intent.succeeded event.  The stored `total` is the single source of truth —
 * any invoiceDiscount was already subtracted from it when the discount was applied,
 * so no additional discount handling is required here.
 */
/**
 * Returns true when an order is already fully settled and a second webhook call
 * to calculateStripePaymentSettlement should be skipped entirely.  Extracted as
 * a pure function so it can be unit-tested independently of the Express handler.
 */
export const isOrderAlreadySettled = (paymentStatus: string | null | undefined): boolean =>
  paymentStatus === 'paid';

export const calculateStripePaymentSettlement = (
  order: StripePaymentSettlementInput,
  stripeAmountPaidPence: number,
): StripePaymentSettlement => {
  const orderTotal = parseCurrency(order.total);
  const previouslyPaid = parseCurrency(order.amountPaid);
  const thisPayment = stripeAmountPaidPence / 100;
  const cumulativePaid = previouslyPaid + thisPayment;
  const newAmountOutstanding = Math.max(0, orderTotal - cumulativePaid);
  let paymentStatus: 'unpaid' | 'part_paid' | 'paid';
  if (newAmountOutstanding <= 0.01) {
    paymentStatus = 'paid';
  } else if (cumulativePaid > 0) {
    paymentStatus = 'part_paid';
  } else {
    paymentStatus = 'unpaid';
  }
  return { cumulativePaid, newAmountOutstanding, paymentStatus };
};

export type OfflinePaymentCalculation = {
  currentAmountPaid: number;
  currentOutstanding: number;
  newAmountPaid: number;
  newAmountOutstanding: number;
  newPaymentStatus: 'part_paid' | 'paid';
  shouldUpdatePaymentMethod: boolean;
};

const parseCurrency = (value?: string | null): number => {
  const parsed = parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

export const hasOnlinePaymentBasis = (order: OrderPaymentBasis): boolean => {
  return order.paymentMethod === 'payment_link'
    || Boolean(order.stripePaymentIntentId)
    || Boolean(order.stripePaymentLinkId)
    || parseCurrency(order.customerTransactionFee) > 0;
};

export const calculateOfflinePaymentUpdate = (
  order: OrderPaymentBasis,
  receivedAmount: number,
  recordedMethod?: string,
): OfflinePaymentCalculation => {
  const subtotalBase = parseCurrency(order.subtotal) + parseCurrency(order.deliveryCost);
  const currentAmountPaid = parseCurrency(order.amountPaid);
  const storedOutstanding = parseCurrency(order.amountOutstanding);
  const existingOnlineBasis = hasOnlinePaymentBasis(order);
  const hasRecordedOnlinePayment = existingOnlineBasis && currentAmountPaid > 0;
  const shouldUseStoredOutstanding = recordedMethod === 'payment_link' || hasRecordedOnlinePayment;
  const currentOutstanding = shouldUseStoredOutstanding
    ? storedOutstanding
    : Math.max(0, subtotalBase - currentAmountPaid);
  const newAmountPaid = currentAmountPaid + receivedAmount;
  const newAmountOutstanding = shouldUseStoredOutstanding
    ? Math.max(0, storedOutstanding - receivedAmount)
    : Math.max(0, subtotalBase - newAmountPaid);
  const newPaymentStatus = newAmountOutstanding <= 0.01 ? 'paid' : 'part_paid';

  return {
    currentAmountPaid,
    currentOutstanding,
    newAmountPaid,
    newAmountOutstanding,
    newPaymentStatus,
    shouldUpdatePaymentMethod: Boolean(recordedMethod) && (!hasRecordedOnlinePayment || recordedMethod === 'payment_link'),
  };
};