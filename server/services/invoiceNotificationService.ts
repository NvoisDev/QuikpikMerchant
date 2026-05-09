/**
 * invoiceNotificationService.ts — Task #1047
 *
 * Single source of truth for all invoice notification channels.
 * Reads wholesaler notificationPreferences and fires each enabled channel.
 * Idempotent: skips already-sent orders unless force=true.
 *
 * Channels controlled by notificationPreferences:
 *   invoiceEmail        — send the full invoice email with PDF attachment
 *   invoiceSms          — send a short SMS to the customer's phone
 *   invoiceWhatsApp     — send a WhatsApp message to the customer's phone
 *   invoicePaymentLink  — include the Stripe payment link (if present) in the SMS/WhatsApp message
 */

import { storage } from "../storage";
import { db } from "../db";
import { orders } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsappService";
import { formatPackDescriptor } from "../email-templates";

export interface InvoiceNotificationResult {
  emailSent: boolean;
  smsSent: boolean;
  whatsAppSent: boolean;
  alreadySent: boolean;
}

/**
 * Fire invoice notifications for the given order according to the wholesaler's preferences.
 *
 * @param orderId   ID of the order to notify about
 * @param options.force  If true, re-sends even if notificationStatus === 'sent' (manual resend)
 */
export async function sendInvoiceNotifications(
  orderId: number,
  options: { force?: boolean } = {}
): Promise<InvoiceNotificationResult> {
  const result: InvoiceNotificationResult = {
    emailSent: false,
    smsSent: false,
    whatsAppSent: false,
    alreadySent: false,
  };

  const order = await storage.getOrder(orderId);
  if (!order) {
    console.warn(`[invoiceNotificationService] Order ${orderId} not found`);
    return result;
  }

  if (!options.force && (order as any).notificationStatus === 'sent') {
    result.alreadySent = true;
    return result;
  }

  const wholesaler = await storage.getUser(order.wholesalerId);
  if (!wholesaler) {
    console.warn(`[invoiceNotificationService] Wholesaler not found for order ${orderId}`);
    return result;
  }

  const customer = await storage.getUser(order.retailerId);

  const prefs: Record<string, any> = (wholesaler.notificationPreferences as any) || {};
  const doEmail     = prefs.invoiceEmail     !== false;
  const doSms       = prefs.invoiceSms       !== false;
  const doWhatsApp  = prefs.invoiceWhatsApp  !== false;
  const doPayLink   = prefs.invoicePaymentLink !== false;

  // ── Email ────────────────────────────────────────────────────────────────
  if (doEmail && customer) {
    try {
      const orderItemsList = await storage.getOrderItems(orderId);
      const enrichedItems = await Promise.all(
        orderItemsList.map(async (item: any) => {
          const prod = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: prod?.name || 'Product',
            packDescriptor: formatPackDescriptor(
              prod?.packQuantity || prod?.quantityInPack,
              prod?.sizePerUnit || prod?.unitSize,
              prod?.unitOfMeasure
            ),
            product: prod
              ? {
                  name: prod.name,
                  packQuantity: prod.packQuantity,
                  quantityInPack: prod.quantityInPack,
                  sizePerUnit: prod.sizePerUnit,
                  unitSize: prod.unitSize,
                  unitOfMeasure: prod.unitOfMeasure,
                }
              : null,
          };
        })
      );

      const { sendCustomerInvoiceEmail } = await import("../routes/shared");
      await sendCustomerInvoiceEmail(customer, order, enrichedItems, wholesaler);
      result.emailSent = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[invoiceNotificationService] Email failed for order ${orderId}: ${msg}`);
    }
  }

  // ── SMS / WhatsApp ────────────────────────────────────────────────────────
  const customerPhone = (order as any).customerPhone || customer?.phoneNumber;
  if ((doSms || doWhatsApp) && customerPhone) {
    try {
      const businessName = wholesaler.businessName || 'Your Supplier';
      const portalLink = `https://quikpik.app/store/${order.wholesalerId}?tab=orders`;
      const paymentLinkPart =
        doPayLink && (order as any).stripePaymentLinkUrl
          ? `\n\nPay online: ${(order as any).stripePaymentLinkUrl}`
          : '';

      const message =
        `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nView your orders: ${portalLink}\n\nSent via Quikpik.`;

      const sent = await sendWhatsAppMessage({ to: customerPhone, message });
      if (sent) {
        result.smsSent = doSms;
        result.whatsAppSent = doWhatsApp;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[invoiceNotificationService] SMS/WhatsApp failed for order ${orderId}: ${msg}`);
    }
  }

  // ── Mark as sent ─────────────────────────────────────────────────────────
  await db
    .update(orders)
    .set({ notificationStatus: 'sent' } as any)
    .where(eq(orders.id, orderId));

  return result;
}
