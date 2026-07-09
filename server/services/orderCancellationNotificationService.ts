import { storage } from "../storage";
import { sendWhatsAppMessage } from "./whatsappService";
import { getCurrencySymbol } from "../../shared/utils/currency";
import { sendEmail } from "../sendgrid-service";
import {
  buildItemisedRefundEmail,
  wrapCustomerEmail,
  getEmailLogoUrl,
  formatPackDescriptor,
  type RefundLineItem,
} from "../email-templates";
import {
  cancellationRefundTypeToEmailStatus,
  type CancellationRefundType,
} from "../../shared/schema";

export interface ReturnedItem {
  productId: number | null | undefined;
  quantity: number;
  sellingType?: string;
}

export interface SendCancellationNotificationParams {
  order: {
    id: number;
    orderNumber: string;
    retailerId: string;
    wholesalerId: string;
    deliveryCost?: string | null;
    amountPaid?: string | null;
  };
  orderItems: Array<{
    productId: number | null | undefined;
    quantity: number;
    unitPrice: string;
    sellingType?: string | null;
  }>;
  customer: {
    firstName?: string | null;
    businessName?: string | null;
    phoneNumber?: string | null;
    email?: string | null;
  } | null | undefined;
  wholesaler: {
    id: string;
    firstName?: string | null;
    businessName?: string | null;
    phoneNumber?: string | null;
    email?: string | null;
    logoType?: string | null;
    logoUrl?: string | null;
  } | null | undefined;
  isFullCancellation: boolean;
  returnedItems?: ReturnedItem[] | null;
  refundDelivery?: boolean;
  stripeRefundTotalPounds: number;
  refundAmount: number;
  /** When provided, suppresses the pending-refund SMS line unless the value is 'card'. */
  refundType?: 'card' | 'later' | 'none' | null;
  /** Override the email subject line. */
  emailSubject?: string;
  /** Override the email From address. */
  emailFrom?: string;
  /** Override the email preheader text. */
  emailPreheader?: string;
}

export async function sendCancellationNotification(
  params: SendCancellationNotificationParams,
): Promise<void> {
  const {
    order,
    orderItems,
    customer,
    wholesaler,
    isFullCancellation,
    returnedItems,
    refundDelivery,
    stripeRefundTotalPounds,
    refundAmount,
    refundType,
    emailSubject: emailSubjectOverride,
    emailFrom: emailFromOverride,
    emailPreheader: emailPreheaderOverride,
  } = params;

  if (!wholesaler) return;

  const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
  const sym = getCurrencySymbol((wholesaler as any)?.preferredCurrency || (wholesaler as any)?.defaultCurrency || 'GBP');
  const amountPaid = parseFloat(order.amountPaid || '0');

  const refundLineItems: RefundLineItem[] = [];
  const retainedLineItems: RefundLineItem[] = [];
  const deliveryCostNum = parseFloat(order.deliveryCost || '0');
  const deliveryRefundedAmount = isFullCancellation
    ? deliveryCostNum
    : (refundDelivery ? deliveryCostNum : 0);

  if (returnedItems && returnedItems.length > 0) {
    for (const ri of returnedItems) {
      const oi = orderItems.find(o => o.productId === ri.productId);
      if (oi) {
        const product = await storage.getProduct(ri.productId!);
        const returnQty = Math.min(ri.quantity, oi.quantity);
        refundLineItems.push({
          productName: product?.name || `Product #${ri.productId}`,
          quantity: returnQty,
          unitPrice: parseFloat(oi.unitPrice),
          sellingType: ri.sellingType || oi.sellingType || 'units',
          packDescriptor: formatPackDescriptor(
            product?.packQuantity || product?.quantityInPack,
            product?.sizePerUnit || product?.unitSize,
            product?.unitOfMeasure,
          ),
        });
        const keptQty = oi.quantity - returnQty;
        if (keptQty > 0) {
          retainedLineItems.push({
            productName: product?.name || `Product #${ri.productId}`,
            quantity: keptQty,
            unitPrice: parseFloat(oi.unitPrice),
            sellingType: ri.sellingType || oi.sellingType || 'units',
            packDescriptor: formatPackDescriptor(
              product?.packQuantity || product?.quantityInPack,
              product?.sizePerUnit || product?.unitSize,
              product?.unitOfMeasure,
            ),
          });
        }
      }
    }
    for (const oi of orderItems) {
      const ri = returnedItems.find(r => r.productId === oi.productId);
      if (!ri) {
        const product = await storage.getProduct(oi.productId!);
        retainedLineItems.push({
          productName: product?.name || `Product #${oi.productId}`,
          quantity: oi.quantity,
          unitPrice: parseFloat(oi.unitPrice),
          sellingType: oi.sellingType || 'units',
          packDescriptor: formatPackDescriptor(
            product?.packQuantity || product?.quantityInPack,
            product?.sizePerUnit || product?.unitSize,
            product?.unitOfMeasure,
          ),
        });
      }
    }
  } else {
    for (const oi of orderItems) {
      const product = await storage.getProduct(oi.productId!);
      refundLineItems.push({
        productName: product?.name || `Product #${oi.productId}`,
        quantity: oi.quantity,
        unitPrice: parseFloat(oi.unitPrice),
        sellingType: oi.sellingType || 'units',
        packDescriptor: formatPackDescriptor(
          product?.packQuantity || product?.quantityInPack,
          product?.sizePerUnit || product?.unitSize,
          product?.unitOfMeasure,
        ),
      });
    }
  }

  const actualRefundAmount = stripeRefundTotalPounds > 0 ? stripeRefundTotalPounds : refundAmount;

  if (customer?.phoneNumber) {
    let smsMsg = '';
    const totalReturnedQty = refundLineItems.reduce((sum, i) => sum + i.quantity, 0);
    const smsPendingAmount = refundAmount > 0 ? refundAmount : amountPaid;
    const showPendingRefund = refundType == null || refundType === 'card';
    if (isFullCancellation) {
      smsMsg = `Hi ${customer.firstName || customer.businessName || 'there'}, your order ${order.orderNumber} with ${businessName} has been cancelled.`;
      if (stripeRefundTotalPounds > 0) {
        smsMsg += ` A refund of ${sym}${stripeRefundTotalPounds.toFixed(2)} for ${totalReturnedQty} item(s) has been processed. Allow 5-10 business days.`;
      } else if (showPendingRefund && smsPendingAmount > 0) {
        smsMsg += ` A refund of ${sym}${smsPendingAmount.toFixed(2)} for ${totalReturnedQty} item(s) is pending.`;
      } else if (!showPendingRefund) {
        // refundType is 'later' or 'none' — no refund detail in SMS
      } else {
        smsMsg += ` No payment was taken, so no refund is required.`;
      }
    } else {
      smsMsg = `Hi ${customer.firstName || customer.businessName || 'there'}, ${totalReturnedQty} item(s) returned for order ${order.orderNumber} with ${businessName}.`;
      if (stripeRefundTotalPounds > 0) {
        smsMsg += ` Refund of ${sym}${stripeRefundTotalPounds.toFixed(2)} processed. Allow 5-10 business days.`;
      } else if (actualRefundAmount > 0) {
        smsMsg += ` Refund of ${sym}${actualRefundAmount.toFixed(2)} pending.`;
      }
    }
    smsMsg += `\n\nContact ${businessName}: ${wholesaler.phoneNumber || wholesaler.email || ''}`;

    await sendWhatsAppMessage({ to: customer.phoneNumber, message: smsMsg });
  }

  if (customer?.email) {
    try {
      const defaultSubject = isFullCancellation
        ? `Order ${order.orderNumber} Cancelled - ${businessName}`
        : `Partial Return Processed - Order ${order.orderNumber}`;
      const defaultPreheader = isFullCancellation
        ? `Order ${order.orderNumber} has been cancelled`
        : `Partial return for order ${order.orderNumber}`;
      const defaultFrom = `${businessName} via Quikpik <hello@quikpik.co>`;

      const emailRefundType: CancellationRefundType = stripeRefundTotalPounds > 0
        ? 'card'
        : (actualRefundAmount > 0 ? 'later' : 'none');
      const emailRefundStatus = cancellationRefundTypeToEmailStatus(emailRefundType);

      const emailBody = buildItemisedRefundEmail({
        customerName: customer.firstName || customer.businessName || 'there',
        orderNumber: order.orderNumber,
        isFullCancellation,
        returnedItems: refundLineItems,
        retainedItems: retainedLineItems.length > 0 ? retainedLineItems : undefined,
        refundAmount: actualRefundAmount,
        deliveryRefunded: deliveryRefundedAmount > 0 ? deliveryRefundedAmount : undefined,
        refundStatus: emailRefundStatus,
        businessName,
        businessPhone: wholesaler.phoneNumber || undefined,
        businessEmail: wholesaler.email || undefined,
      });

      await sendEmail({
        to: customer.email,
        subject: emailSubjectOverride ?? defaultSubject,
        html: wrapCustomerEmail(
          emailBody,
          {
            businessName,
            logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl),
          },
          {
            preheader: emailPreheaderOverride ?? defaultPreheader,
          },
        ),
        from: emailFromOverride ?? defaultFrom,
      });
    } catch (emailError) {
      const msg = emailError instanceof Error ? emailError.message : String(emailError);
      console.warn(`[sendgrid] cancellation-notification email failed [orderId=${order.id}]: ${msg}`);
    }
  }
}
