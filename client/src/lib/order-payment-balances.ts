export type OrderPaymentBalanceInput = {
  subtotal?: string | null;
  deliveryCost?: string | null;
  invoiceDiscount?: string | null;
  amountPaid?: string | null;
  amountOutstanding?: string | null;
  paymentMethod?: string | null;
  stripePaymentIntentId?: string | null;
  stripePaymentLinkUrl?: string | null;
  customerTransactionFee?: string | null;
};

const parseCurrency = (value?: string | null): number => {
  const parsed = parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

export const hasRecordedOnlinePayment = (order: OrderPaymentBalanceInput): boolean => {
  const hasOnlineBasis = order.paymentMethod === 'payment_link'
    || Boolean(order.stripePaymentIntentId)
    || Boolean(order.stripePaymentLinkUrl)
    || parseCurrency(order.customerTransactionFee) > 0;

  return hasOnlineBasis && parseCurrency(order.amountPaid) > 0;
};

export const getOfflinePaymentDefaultAmount = (order: OrderPaymentBalanceInput): string => {
  if (hasRecordedOnlinePayment(order)) {
    return parseCurrency(order.amountOutstanding).toFixed(2);
  }

  const offlineBase = parseCurrency(order.subtotal) + parseCurrency(order.deliveryCost) - parseCurrency(order.invoiceDiscount);
  const amountPaid = parseCurrency(order.amountPaid);
  return Math.max(0, offlineBase - amountPaid).toFixed(2);
};