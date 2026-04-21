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