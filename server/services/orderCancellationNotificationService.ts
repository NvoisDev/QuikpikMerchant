import { storage } from "../storage";
import { sendWhatsAppMessage } from "./whatsappService";
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
  } = params;

  if (!wholesaler) return;

  const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
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
    if (isFullCancellation) {
      smsMsg = `Hi ${customer.firstName || customer.businessName || 'there'}, your order ${order.orderNumber} with ${businessName} has been cancelled.`;
      if (stripeRefundTotalPounds > 0) {
        smsMsg += ` A refund of £${stripeRefundTotalPounds.toFixed(2)} for ${totalReturnedQty} item(s) has been processed. Allow 5-10 business days.`;
      } else if (amountPaid > 0) {
        smsMsg += ` A refund of £${amountPaid.toFixed(2)} for ${totalReturnedQty} item(s) is pending.`;
      } else {
        smsMsg += ` No payment was taken, so no refund is required.`;
      }
    } else {
      smsMsg = `Hi ${customer.firstName || customer.businessName || 'there'}, ${totalReturnedQty} item(s) returned for order ${order.orderNumber} with ${businessName}.`;
      if (stripeRefundTotalPounds > 0) {
        smsMsg += ` Refund of £${stripeRefundTotalPounds.toFixed(2)} processed. Allow 5-10 business days.`;
      } else if (actualRefundAmount > 0) {
        smsMsg += ` Refund of £${actualRefundAmount.toFixed(2)} pending.`;
      }
    }
    smsMsg += `\n\nContact ${businessName}: ${wholesaler.phoneNumber || wholesaler.email || ''}`;

    await sendWhatsAppMessage({ to: customer.phoneNumber, message: smsMsg });
  }

  if (customer?.email) {
    try {
      const emailSubject = isFullCancellation
        ? `Order ${order.orderNumber} Cancelled - ${businessName}`
        : `Partial Return Processed - Order ${order.orderNumber}`;

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
        subject: emailSubject,
        html: wrapCustomerEmail(
          emailBody,
          {
            businessName,
            logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl),
          },
          {
            preheader: isFullCancellation
              ? `Order ${order.orderNumber} has been cancelled`
              : `Partial return for order ${order.orderNumber}`,
          },
        ),
        from: `${businessName} via Quikpik <hello@quikpik.co>`,
      });
    } catch (emailError) {
      const msg = emailError instanceof Error ? emailError.message : String(emailError);
      console.warn(`[sendgrid] cancellation-notification email failed [orderId=${order.id}]: ${msg}`);
    }
  }
}
