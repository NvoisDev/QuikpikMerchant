/**
 * invoiceNotificationService.ts — Task #1047
 *
 * Single source of truth for all invoice notification channels.
 * Reads wholesaler notificationPreferences and fires each enabled channel.
 *
 * Idempotency:
 *   - Checks notificationStatus IN DB before sending (atomic UPDATE with WHERE guard).
 *   - If already 'sent', returns { alreadySent: true } without re-sending.
 *   - The endpoint layer (orders-comms.ts) is responsible for returning HTTP 409 on alreadySent.
 *
 * Channels controlled by notificationPreferences:
 *   invoiceEmail        — send the full invoice email with PDF attachment
 *   invoiceSms          — send a plain SMS to the customer's phone (via smsService)
 *   invoiceWhatsApp     — send a WhatsApp message (via whatsappService)
 *   invoicePaymentLink  — include the Stripe payment link (if present) in messages
 */

import { storage } from "../storage";
import { db } from "../db";
import { orders } from "@shared/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { sendSMS } from "./smsService";
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
 * Idempotent: if notificationStatus is already 'sent', returns alreadySent=true immediately.
 * The caller (HTTP endpoint) should respond with 409 when alreadySent is true.
 */
export async function sendInvoiceNotifications(
  orderId: number
): Promise<InvoiceNotificationResult> {
  const result: InvoiceNotificationResult = {
    emailSent: false,
    smsSent: false,
    whatsAppSent: false,
    alreadySent: false,
  };

  // ── Atomic idempotency guard ──────────────────────────────────────────────
  // Only claim the order for sending if it is NOT already 'sent'.
  // This UPDATE returns 0 rows if another process already marked it sent.
  const claimed = await db
    .update(orders)
    .set({ notificationStatus: 'sending' } as any)
    .where(
      and(
        eq(orders.id, orderId),
        or(isNull((orders as any).notificationStatus), eq((orders as any).notificationStatus, 'pending_send'))
      )
    )
    .returning({ id: orders.id });

  if (claimed.length === 0) {
    // Either order doesn't exist, or it is already 'sent'/'sending' — skip
    result.alreadySent = true;
    return result;
  }

  try {
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.warn(`[invoiceNotificationService] Order ${orderId} not found`);
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

    // ── Build message body (used by both SMS and WhatsApp) ─────────────────
    const customerPhone = (order as any).customerPhone || customer?.phoneNumber;
    if (customerPhone && (doSms || doWhatsApp)) {
      const businessName = wholesaler.businessName || 'Your Supplier';
      const paymentLinkPart =
        doPayLink && (order as any).stripePaymentLinkUrl
          ? `\n\nPay online: ${(order as any).stripePaymentLinkUrl}`
          : '';
      const message =
        `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nSent via Quikpik.`;

      // ── SMS ───────────────────────────────────────────────────────────────
      if (doSms) {
        try {
          const sent = await sendSMS({ to: customerPhone, message });
          result.smsSent = sent;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[invoiceNotificationService] SMS failed for order ${orderId}: ${msg}`);
        }
      }

      // ── WhatsApp ──────────────────────────────────────────────────────────
      if (doWhatsApp) {
        try {
          const sent = await sendWhatsAppMessage({ to: customerPhone, message });
          result.whatsAppSent = sent;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[invoiceNotificationService] WhatsApp failed for order ${orderId}: ${msg}`);
        }
      }
    }
  } finally {
    // ── Mark as sent (always — even on partial failure, prevents repeated spam) ──
    await db
      .update(orders)
      .set({ notificationStatus: 'sent' } as any)
      .where(eq(orders.id, orderId));
  }

  return result;
}
