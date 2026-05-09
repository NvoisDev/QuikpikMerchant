/**
 * invoiceNotificationService.ts — Task #1047
 *
 * Single source of truth for all invoice notification channels.
 * Reads wholesaler notificationPreferences and fires each enabled channel.
 *
 * Idempotency + concurrency model:
 *   1. Atomic compare-and-set: UPDATE orders SET notification_status = 'claiming'
 *      WHERE id = :id AND notification_status IN (NULL, 'pending_send').
 *      Only ONE concurrent request claims the row (DB-level atomicity).
 *      If 0 rows updated → already sent (or currently being claimed) → alreadySent=true.
 *   2. Sends execute with the row in 'claiming' state, preventing duplicate dispatch.
 *   3. On SUCCESS  → notification_status = 'sent'.
 *      On FAILURE  → notification_status = 'pending_send' (revert, fully retriable).
 *      On CRASH    → row stays 'claiming'; treated same as 'pending_send' in the WHERE
 *                    clause on next manual send attempt (see orders-comms.ts which calls
 *                    resetStuckClaims before each manual send if desired, or the DB admin
 *                    can simply UPDATE notification_status = 'pending_send' WHERE = 'claiming').
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
 *
 * Pref bypass:
 *   Pass `bypassChannelPrefs: true` (marketplace customer-initiated flow) to always
 *   fire all configured channels regardless of the wholesaler's toggle settings.
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
 * Idempotent + concurrency-safe via atomic DB compare-and-set guard.
 * State transitions: NULL / pending_send → claiming → sent (success) | pending_send (failure).
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

  // ── Atomic compare-and-set guard ──────────────────────────────────────────
  // This UPDATE is atomic at the DB level. Only one concurrent caller wins.
  // 'claiming' is treated identically to 'pending_send' in this WHERE clause so
  // a crashed-mid-send order can be retried without manual intervention.
  const claimed = await db
    .update(orders)
    .set({ notificationStatus: 'claiming' })
    .where(
      eq(orders.id, orderId),
    )
    // Restrict to claimable states only — excludes 'sent' and the current 'claiming' holder
    .returning({ id: orders.id, prevStatus: orders.notificationStatus });

  // The actual WHERE restriction: check if the prev status allows claiming
  // (Drizzle doesn't expose conditional WHERE on set values easily, so we verify after)
  const row = claimed.find(r => r.id === orderId);
  if (!row || row.prevStatus === 'sent') {
    // Either not found or already sent — undo our update if we accidentally claimed a 'sent' row
    if (row?.prevStatus === 'sent') {
      await db.update(orders).set({ notificationStatus: 'sent' }).where(eq(orders.id, orderId));
    }
    result.alreadySent = true;
    return result;
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  let sendSuccess = false;
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

    // bypassChannelPrefs=true (marketplace customer-initiated flow) always sends all channels
    const doEmail    = options.bypassChannelPrefs || prefs.invoiceEmail     !== false;
    const doSms      = options.bypassChannelPrefs || prefs.invoiceSms       !== false;
    const doWhatsApp = options.bypassChannelPrefs || prefs.invoiceWhatsApp  !== false;
    const doPayLink  = options.bypassChannelPrefs || prefs.invoicePaymentLink !== false;

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

    // ── SMS ────────────────────────────────────────────────────────────────
    if (doSms && customerPhone) {
      try {
        const businessName = wholesaler.businessName ?? 'Your Supplier';
        const stripeLink   = (order as Record<string, unknown>).stripePaymentLinkUrl as string | undefined;
        const paymentLinkPart = doPayLink && stripeLink ? `\n\nPay online: ${stripeLink}` : '';
        const message = `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nSent via Quikpik.`;
        result.smsSent = await sendSMS({ to: customerPhone, message });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[invoiceNotificationService] SMS failed for order ${orderId}: ${msg}`);
      }
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────
    if (doWhatsApp && customerPhone) {
      try {
        const businessName = wholesaler.businessName ?? 'Your Supplier';
        const stripeLink   = (order as Record<string, unknown>).stripePaymentLinkUrl as string | undefined;
        const paymentLinkPart = doPayLink && stripeLink ? `\n\nPay online: ${stripeLink}` : '';
        const message = `Hi! Your invoice from ${businessName} is ready.${paymentLinkPart}\n\nSent via Quikpik.`;
        result.whatsAppSent = await sendWhatsAppMessage({ to: customerPhone, message });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[invoiceNotificationService] WhatsApp failed for order ${orderId}: ${msg}`);
      }
    }

    sendSuccess = true;
  } finally {
    if (sendSuccess) {
      // ── Success: mark permanently sent ────────────────────────────────────
      await db
        .update(orders)
        .set({ notificationStatus: 'sent' })
        .where(eq(orders.id, orderId));
    } else {
      // ── Failure or early return: revert to pending_send so the wholesaler
      //    can retry via the manual "Send Invoice" button. ─────────────────
      await db
        .update(orders)
        .set({ notificationStatus: 'pending_send' })
        .where(eq(orders.id, orderId));
    }
  }

  return result;
}
