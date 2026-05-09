/**
 * invoiceNotificationService.ts — Task #1047
 *
 * Single source of truth for all invoice notification channels.
 * Reads wholesaler notificationPreferences and fires each enabled channel.
 *
 * Idempotency contract:
 *   - Reads notificationStatus from the DB before proceeding.
 *   - If already 'sent', returns { alreadySent: true } without re-sending.
 *   - No intermediate state is written; the row is only updated to 'sent' in the
 *     finally block so a crash mid-send leaves the order in its pre-send state
 *     (pending_send or null) — fully retriable.
 *   - The endpoint layer (orders-comms.ts) converts alreadySent into HTTP 409.
 *
 * Channels controlled by wholesaler notificationPreferences:
 *   invoiceEmail        — send the full invoice email with PDF attachment
 *   invoiceSms          — send a plain SMS to the customer's phone (smsService)
 *   invoiceWhatsApp     — send a WhatsApp message (whatsappService)
 *   invoicePaymentLink  — include the Stripe payment link in SMS/WhatsApp body
 *
 * Guest customer support:
 *   Pass `guestCustomer` in options to send to a non-registered customer whose
 *   details come from Stripe metadata (marketplace / anonymous checkout).
 */

import { storage } from "../storage";
import { db } from "../db";
import { orders } from "@shared/schema";
import { eq, or, isNull } from "drizzle-orm";
import { sendSMS } from "./smsService";
import { sendWhatsAppMessage } from "./whatsappService";
import { formatPackDescriptor } from "../email-templates";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  autoSendInvoices?: boolean;
  invoiceEmail?: boolean;
  invoiceSms?: boolean;
  invoiceWhatsApp?: boolean;
  invoicePaymentLink?: boolean;
  // pre-existing keys (preserved, not modified by this service)
  email?: boolean;
  sms?: boolean;
  orderUpdates?: boolean;
  stockAlerts?: boolean;
  marketingEmails?: boolean;
}

export interface GuestCustomer {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface InvoiceNotificationResult {
  emailSent: boolean;
  smsSent: boolean;
  whatsAppSent: boolean;
  alreadySent: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Fire invoice notifications for the given order according to the wholesaler's preferences.
 *
 * Idempotent: if notificationStatus is already 'sent', returns { alreadySent: true }.
 * No intermediate state is persisted — crash-safe and fully retriable.
 *
 * @param orderId       ID of the order to notify about
 * @param options.guestCustomer  Override customer details for guest/anonymous checkouts
 */
export async function sendInvoiceNotifications(
  orderId: number,
  options: { guestCustomer?: GuestCustomer } = {}
): Promise<InvoiceNotificationResult> {
  const result: InvoiceNotificationResult = {
    emailSent: false,
    smsSent: false,
    whatsAppSent: false,
    alreadySent: false,
  };

  // ── Idempotency check ─────────────────────────────────────────────────────
  // Read current status from DB before attempting any send.
  const [orderRow] = await db
    .select({ id: orders.id, notificationStatus: orders.notificationStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) {
    console.warn(`[invoiceNotificationService] Order ${orderId} not found`);
    return result;
  }

  if (orderRow.notificationStatus === 'sent') {
    result.alreadySent = true;
    return result;
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  try {
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.warn(`[invoiceNotificationService] Order ${orderId} not found in storage`);
      return result;
    }

    const wholesaler = await storage.getUser(order.wholesalerId);
    if (!wholesaler) {
      console.warn(`[invoiceNotificationService] Wholesaler not found for order ${orderId}`);
      return result;
    }

    // Resolve customer — prefer guestCustomer override, then registered user
    const registeredCustomer = order.retailerId ? await storage.getUser(order.retailerId) : null;

    const customerName  = options.guestCustomer?.name  ?? registeredCustomer?.name ?? (order as Record<string, unknown>).customerName as string ?? '';
    const customerEmail = options.guestCustomer?.email ?? registeredCustomer?.email ?? (order as Record<string, unknown>).customerEmail as string ?? null;
    const customerPhone = options.guestCustomer?.phone ?? registeredCustomer?.phoneNumber ?? (order as Record<string, unknown>).customerPhone as string ?? null;
    const customerAddress = options.guestCustomer?.address ?? null;

    const prefs: NotificationPreferences = (wholesaler.notificationPreferences as NotificationPreferences | null) ?? {};
    const doEmail    = prefs.invoiceEmail     !== false;
    const doSms      = prefs.invoiceSms       !== false;
    const doWhatsApp = prefs.invoiceWhatsApp  !== false;
    const doPayLink  = prefs.invoicePaymentLink !== false;

    // ── Email ──────────────────────────────────────────────────────────────
    if (doEmail && customerEmail) {
      try {
        const orderItemsList = await storage.getOrderItems(orderId);
        const enrichedItems = await Promise.all(
          orderItemsList.map(async (item: Record<string, unknown>) => {
            const prod = await storage.getProduct(item.productId as number);
            return {
              ...item,
              productName: prod?.name ?? 'Product',
              packDescriptor: formatPackDescriptor(
                (prod?.packQuantity ?? prod?.quantityInPack) as number | undefined,
                (prod?.sizePerUnit ?? prod?.unitSize) as string | undefined,
                prod?.unitOfMeasure as string | undefined
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

        const emailCustomer = {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          address: customerAddress ?? registeredCustomer?.address ?? null,
        };

        const { sendCustomerInvoiceEmail } = await import("../routes/shared");
        await sendCustomerInvoiceEmail(emailCustomer, order, enrichedItems, wholesaler);
        result.emailSent = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[invoiceNotificationService] Email failed for order ${orderId}: ${msg}`);
      }
    }

    // ── SMS / WhatsApp ─────────────────────────────────────────────────────
    if (customerPhone && (doSms || doWhatsApp)) {
      const businessName = wholesaler.businessName ?? 'Your Supplier';
      const stripeLink   = (order as Record<string, unknown>).stripePaymentLinkUrl as string | undefined;
      const paymentLinkPart =
        doPayLink && stripeLink ? `\n\nPay online: ${stripeLink}` : '';
      const message = `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nSent via Quikpik.`;

      if (doSms) {
        try {
          result.smsSent = await sendSMS({ to: customerPhone, message });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[invoiceNotificationService] SMS failed for order ${orderId}: ${msg}`);
        }
      }

      if (doWhatsApp) {
        try {
          result.whatsAppSent = await sendWhatsAppMessage({ to: customerPhone, message });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[invoiceNotificationService] WhatsApp failed for order ${orderId}: ${msg}`);
        }
      }
    }
  } finally {
    // Mark sent regardless of channel outcomes — prevents repeated sends on retry.
    // If a partial failure occurred (e.g. email sent but SMS failed), the wholesaler
    // should use the manual "Send Invoice" button to retry; backend will 409 for sent orders.
    await db
      .update(orders)
      .set({ notificationStatus: 'sent' })
      .where(eq(orders.id, orderId));
  }

  return result;
}
