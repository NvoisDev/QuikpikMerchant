/**
 * invoiceNotificationService.ts — Task #1047
 *
 * Single source of truth for all invoice notification channels.
 * Reads wholesaler notificationPreferences and fires each enabled channel.
 *
 * Concurrency / idempotency model:
 *   1. Atomic compare-and-set claim:
 *        UPDATE orders SET notification_status = 'claiming'
 *        WHERE id = :id AND (notification_status IS NULL OR notification_status = 'pending_send')
 *        RETURNING id
 *      If 0 rows updated → row is 'sent' or already 'claiming' (concurrent) → alreadySent.
 *      If 1 row updated  → this caller owns the send; others are blocked by the WHERE guard.
 *   2. Sends execute with the row in 'claiming', preventing duplicate dispatch.
 *   3. On SUCCESS (at least one enabled channel delivered) → notification_status = 'sent'.
 *      On NO-DELIVERY (all enabled channels failed)       → revert to 'pending_send' (retriable).
 *      On NO-CHANNELS (all prefs off or no contact info)  → notification_status = 'sent'
 *                                                           (no retry possible; intent fulfilled).
 *   4. On process crash the row stays in 'claiming'. Recovery: the manual send endpoint
 *      (orders-comms.ts) resets 'claiming' → 'pending_send' before calling this service,
 *      so wholesalers can always retry via the "Send Invoice" button.
 *
 * Channels controlled by wholesaler notificationPreferences:
 *   invoiceEmail        — send the full invoice email with PDF attachment
 *   invoiceSms          — send a plain SMS to the customer's phone
 *   invoiceWhatsApp     — send a WhatsApp message (requires Twilio)
 *   invoicePaymentLink  — include the Stripe payment link in SMS/WhatsApp body
 *
 * bypassChannelPrefs:
 *   Pass true for marketplace (customer-initiated) checkouts to always fire all channels
 *   regardless of the wholesaler's toggle settings.
 */

import { storage } from "../storage";
import { db } from "../db";
import { orders } from "@shared/schema";
import { and, eq, or, isNull } from "drizzle-orm";
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
 * Atomically claims the order row before any sends, preventing duplicate dispatch.
 * State flow: NULL / pending_send → claiming → sent | pending_send (on failure).
 *
 * @param orderId                  ID of the order to notify about
 * @param options.guestCustomer    Override customer details for guest/anonymous checkouts
 * @param options.bypassChannelPrefs  When true (marketplace flow), always send all channels
 */
export async function sendInvoiceNotifications(
  orderId: number,
  options: { guestCustomer?: GuestCustomer; bypassChannelPrefs?: boolean } = {}
): Promise<InvoiceNotificationResult> {
  const result: InvoiceNotificationResult = {
    emailSent: false,
    smsSent: false,
    whatsAppSent: false,
    alreadySent: false,
  };

  // ── Atomic compare-and-set claim ──────────────────────────────────────────
  // The DB enforces that only ONE concurrent caller matches this WHERE clause.
  // Any other concurrent caller gets 0 rows → alreadySent (or already 'sent').
  // The 'claiming' state acts as a mutex for the duration of the network sends.
  const claimedRows = await db
    .update(orders)
    .set({ notificationStatus: 'claiming', notificationClaimedAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        or(isNull(orders.notificationStatus), eq(orders.notificationStatus, 'pending_send'))
      )
    )
    .returning({ id: orders.id });

  // Zero rows → order is 'sent', 'claiming' (concurrent), or not found.
  if (claimedRows.length === 0) {
    result.alreadySent = true;
    return result;
  }

  // ── Sends ─────────────────────────────────────────────────────────────────
  // Track whether at least one enabled channel delivered successfully.
  // noChannels = all prefs are off OR no contact info → mark 'sent' anyway (no retry).
  let atLeastOneDelivered = false;
  let noChannels = true; // flipped to false as soon as an enabled channel is attempted

  try {
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.warn(`[invoiceNotificationService] Order ${orderId} not found in storage`);
      // revert in finally
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

    // bypassChannelPrefs=true (marketplace customer-initiated flow) always sends all channels
    const doEmail    = options.bypassChannelPrefs || prefs.invoiceEmail     !== false;
    const doSms      = options.bypassChannelPrefs || prefs.invoiceSms       !== false;
    const doWhatsApp = options.bypassChannelPrefs || prefs.invoiceWhatsApp  !== false;
    const doPayLink  = options.bypassChannelPrefs || prefs.invoicePaymentLink !== false;

    // ── Email ──────────────────────────────────────────────────────────────
    if (doEmail && customerEmail) {
      noChannels = false;
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
        atLeastOneDelivered = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[invoiceNotificationService] Email failed for order ${orderId}: ${msg}`);
      }
    }

    // ── SMS ────────────────────────────────────────────────────────────────
    if (doSms && customerPhone) {
      noChannels = false;
      try {
        const businessName = wholesaler.businessName ?? 'Your Supplier';
        const stripeLink   = (order as Record<string, unknown>).stripePaymentLinkUrl as string | undefined;
        const paymentLinkPart = doPayLink && stripeLink ? `\n\nPay online: ${stripeLink}` : '';
        const message = `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nSent via Quikpik.`;
        result.smsSent = await sendSMS({ to: customerPhone, message });
        if (result.smsSent) atLeastOneDelivered = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[invoiceNotificationService] SMS failed for order ${orderId}: ${msg}`);
      }
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────
    if (doWhatsApp && customerPhone) {
      noChannels = false;
      try {
        const businessName = wholesaler.businessName ?? 'Your Supplier';
        const stripeLink   = (order as Record<string, unknown>).stripePaymentLinkUrl as string | undefined;
        const paymentLinkPart = doPayLink && stripeLink ? `\n\nPay online: ${stripeLink}` : '';
        const message = `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nSent via Quikpik.`;
        result.whatsAppSent = await sendWhatsAppMessage({ to: customerPhone, message });
        if (result.whatsAppSent) atLeastOneDelivered = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[invoiceNotificationService] WhatsApp failed for order ${orderId}: ${msg}`);
      }
    }
  } finally {
    if (atLeastOneDelivered || noChannels) {
      // ── Success or no-channels-available: mark permanently sent ───────────
      await db
        .update(orders)
        .set({ notificationStatus: 'sent', notificationSentAt: new Date(), notificationClaimedAt: null })
        .where(eq(orders.id, orderId));
    } else {
      // ── All enabled channels failed: revert so wholesaler can retry ───────
      await db
        .update(orders)
        .set({ notificationStatus: 'pending_send', notificationClaimedAt: null })
        .where(eq(orders.id, orderId));
    }
  }

  return result;
}
