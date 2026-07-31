import { db } from './db';
import { orders, users, orderItems, products, businessProfiles, orderCancellationRequests } from '@shared/schema';
import { and, gt, isNotNull, sql, eq, ne, isNull, or, lt, inArray } from 'drizzle-orm';
import { storage } from './storage';
import { sendPaymentReminderEmail, sendChaserEmail } from './sendgrid-service';
import { getCurrencySymbol } from '../shared/utils/currency';
import { sendWhatsAppMessage } from './services/whatsappService';
import { ReliableSMSService } from './sms-service';
import { getStripeClient } from './stripeConfig';
import { isConnectAccountReady } from './utils/stripe-connect-ready';
import { createShortPaymentLink } from './shortPaymentLink';
import { logQuoteActivity } from './utils/quote-activity';
import { CHASER_TONE_THRESHOLDS } from '../shared/constants';

function getChaserTone(daysOverdue: number): string {
  if (daysOverdue <= CHASER_TONE_THRESHOLDS.FRIENDLY_MAX_DAYS) return 'friendly';
  if (daysOverdue <= CHASER_TONE_THRESHOLDS.FIRM_MAX_DAYS) return 'firm';
  return 'urgent';
}

interface OrderWithPaymentTerms {
  id: number;
  orderNumber: string | null;
  retailerId: string;
  wholesalerId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  total: string | null;
  amountOutstanding: string | null;
  balanceDueDays: number | null;
  createdAt: Date | null;
  paymentStatus: string | null;
  stripePaymentLinkUrl: string | null;
}

export async function checkAndSendPaymentReminders() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const ordersWithBalances = await db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      retailerId: orders.retailerId,
      wholesalerId: orders.wholesalerId,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      customerPhone: orders.customerPhone,
      total: orders.total,
      amountOutstanding: orders.amountOutstanding,
      balanceDueDays: orders.balanceDueDays,
      createdAt: orders.createdAt,
      paymentStatus: orders.paymentStatus,
      stripePaymentLinkUrl: orders.stripePaymentLinkUrl,
    })
    .from(orders)
    .where(
      and(
        gt(orders.amountOutstanding, '0'),
        isNotNull(orders.balanceDueDays),
        gt(orders.balanceDueDays, 0),
        sql`${orders.status} != 'draft'`
      )
    );
    
    let remindersSent = 0;
    
    for (const order of ordersWithBalances) {
      if (!order.createdAt || !order.balanceDueDays) continue;
      
      const dueDate = new Date(order.createdAt);
      dueDate.setDate(dueDate.getDate() + order.balanceDueDays);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      const shouldSendReminder = daysUntilDue === 3 || daysUntilDue === 0 || daysUntilDue === -1;
      
      if (shouldSendReminder) {
        await sendPaymentReminder(order as OrderWithPaymentTerms, daysUntilDue, dueDate);
        remindersSent++;
      }
    }
    
    return remindersSent;
    
  } catch (error) {
    console.error('❌ Error in payment reminder check:', error);
    return 0;
  }
}

async function getFreshPaymentLink(order: OrderWithPaymentTerms, businessName: string): Promise<string> {
  try {
    const [wholesalerUser] = await db
      .select({ isTestAccount: users.isTestAccount, stripeAccountId: users.stripeAccountId })
      .from(users)
      .where(eq(users.id, order.wholesalerId));

    const connectReady = await isConnectAccountReady(wholesalerUser?.stripeAccountId, Boolean(wholesalerUser?.isTestAccount));
    if (!connectReady) {
      return order.stripePaymentLinkUrl || '';
    }

    const stripe = getStripeClient(Boolean(wholesalerUser?.isTestAccount));

    const outstandingAmount = parseFloat(order.amountOutstanding || '0');
    const amountInPence = Math.round(outstandingAmount * 100);
    const appBase = process.env.APP_URL || 'https://quikpik.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `Outstanding balance — Order ${order.orderNumber}`,
            description: `Balance payment to ${businessName}`,
          },
          unit_amount: amountInPence,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${appBase}/customer/payment-success?order=${order.orderNumber}&wholesaler=${order.wholesalerId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBase}/store/${order.wholesalerId}`,
      metadata: {
        orderId: order.id.toString(),
        orderNumber: order.orderNumber || '',
        wholesalerId: order.wholesalerId,
        isBalancePayment: 'true',
      },
      customer_email: order.customerEmail || undefined,
      expires_at: Math.floor(Date.now() / 1000) + (23 * 60 * 60), // 23 hours (Stripe max is 24 hours)
    });

    const freshUrl = session.url || '';
    if (freshUrl) {
      await db.update(orders)
        .set({ stripePaymentLinkUrl: freshUrl, stripePaymentLinkId: session.id })
        .where(eq(orders.id, order.id));
    }
    return freshUrl;
  } catch (err) {
    console.error(`❌ Failed to generate fresh payment link for order ${order.orderNumber}:`, err);
    return order.stripePaymentLinkUrl || '';
  }
}

async function getItemsSummary(orderId: number): Promise<string> {
  try {
    const items = await db
      .select({ quantity: orderItems.quantity, productName: products.name })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));

    if (!items.length) return '';

    const formatted = items.slice(0, 2).map(i => `${i.quantity}x ${i.productName}`);
    if (items.length > 2) formatted.push(`+${items.length - 2} more`);
    return formatted.join(', ');
  } catch {
    return '';
  }
}

async function sendPaymentReminder(
  order: OrderWithPaymentTerms, 
  daysUntilDue: number,
  dueDate: Date
) {
  const wholesalerResult = await db.select({
    businessName: users.businessName,
    email: users.email,
    notificationPreferences: users.notificationPreferences,
    preferredCurrency: users.preferredCurrency,
    defaultCurrency: users.defaultCurrency,
  })
  .from(users)
  .where(sql`${users.id} = ${order.wholesalerId}`)
  .limit(1);
  
  if (!wholesalerResult[0]) return;

  const notifPrefs = (wholesalerResult[0] as any).notificationPreferences || {};
  const paymentChannel: string = notifPrefs.paymentReminderChannel || 'email';
  if (notifPrefs.paymentReminderEnabled === false || paymentChannel === 'off') return;
  const sendEmailChannel = paymentChannel === 'email' || paymentChannel === 'both';
  const sendSmsChannel = paymentChannel === 'sms' || paymentChannel === 'both';

  const businessName = wholesalerResult[0]?.businessName || 'Your supplier';
  const currency = wholesalerResult[0]?.preferredCurrency || wholesalerResult[0]?.defaultCurrency || 'GBP';
  const sym = getCurrencySymbol(currency);
  const outstandingAmount = parseFloat(order.amountOutstanding || '0');
  const formattedDueDate = dueDate.toLocaleDateString('en-GB', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
  
  let urgency: 'upcoming' | 'due_today' | 'overdue';
  if (daysUntilDue > 0) {
    urgency = 'upcoming';
  } else if (daysUntilDue === 0) {
    urgency = 'due_today';
  } else {
    urgency = 'overdue';
  }

  const freshPaymentLink = await getFreshPaymentLink(order, businessName);
  const paymentLink = freshPaymentLink || order.stripePaymentLinkUrl || '';
  const itemsSummary = await getItemsSummary(order.id);
  const firstName = order.customerName?.split(' ')[0] || 'there';
  const orderRef = order.orderNumber || 'your order';
  const itemsPart = itemsSummary ? ` (${itemsSummary})` : '';
  
  if (sendEmailChannel && order.customerEmail) {
    try {
      await sendPaymentReminderEmail({
        to: order.customerEmail,
        customerName: order.customerName || 'Valued Customer',
        orderNumber: orderRef,
        amountOutstanding: outstandingAmount,
        dueDate: formattedDueDate,
        businessName,
        paymentLink,
        urgency,
        currency,
      });
    } catch (error) {
      console.error(`❌ Failed to send email reminder for order ${orderRef}:`, error);
    }
  }
  
  if (sendSmsChannel && order.customerPhone) {
    try {
      let smsMessage: string;
      const shortPayLink = paymentLink ? await createShortPaymentLink(paymentLink, order.wholesalerId, 24) : '';
      const payPart = shortPayLink ? ` Pay here: ${shortPayLink}` : ' Please contact us to arrange payment.';
      
      if (urgency === 'upcoming') {
        smsMessage = `Hi ${firstName}! Reminder: ${sym}${outstandingAmount.toFixed(2)} balance due on ${formattedDueDate} for order ${orderRef}${itemsPart} with ${businessName}.${payPart}`;
      } else if (urgency === 'due_today') {
        smsMessage = `Hi ${firstName}! Payment due today: ${sym}${outstandingAmount.toFixed(2)} outstanding on order ${orderRef}${itemsPart} with ${businessName}.${payPart}`;
      } else {
        smsMessage = `Hi ${firstName}, overdue notice: ${sym}${outstandingAmount.toFixed(2)} for order ${orderRef}${itemsPart} with ${businessName} was due on ${formattedDueDate}. Please pay immediately${shortPayLink ? `: ${shortPayLink}` : ' — contact us.'}`; 
      }
      
      await sendWhatsAppMessage({ to: order.customerPhone, message: smsMessage });
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp reminder for order ${orderRef}:`, error);
    }
  }
}

// ── Payment Chasers ───────────────────────────────────────────────────────────
// Wholesaler-configured automated chasers for overdue invoices. Unlike the
// system payment reminders (fixed 3-day / 0-day / -1-day schedule), chasers
// fire on a repeating user-defined interval (default 7 days) starting from
// day 1 overdue, using an escalating tone (friendly → firm → urgent).

export async function sendPaymentChasers(): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Find all wholesalers with chaserEnabled = true
    const wholesalers = await db
      .select({
        id: users.id,
        businessName: users.businessName,
        email: users.email,
        logoUrl: users.logoUrl,
        notificationPreferences: users.notificationPreferences,
        preferredCurrency: users.preferredCurrency,
        defaultCurrency: users.defaultCurrency,
        stripeAccountId: users.stripeAccountId,
        isTestAccount: users.isTestAccount,
      })
      .from(users)
      .where(
        and(
          sql`${users.notificationPreferences}->>'chaserEnabled' = 'true'`,
          sql`${users.role} = 'wholesaler'`,
          sql`(${users.isInactive} IS NULL OR ${users.isInactive} = false)`
        )
      );

    let totalSent = 0;

    for (const wholesaler of wholesalers) {
      const prefs = (wholesaler.notificationPreferences as Record<string, any>) || {};
      const chaserIntervalDays: number = typeof prefs.chaserIntervalDays === 'number' ? prefs.chaserIntervalDays : 7;
      const chaserChannel: string = prefs.chaserChannel || 'email';
      const chaserMaxDays: number | null = typeof prefs.chaserMaxDays === 'number' ? prefs.chaserMaxDays : null;
      // Grace window: if a partial payment was recorded within this many days, suppress chasers
      const chaserGraceDays: number = typeof prefs.chaserGraceDays === 'number' ? prefs.chaserGraceDays : 7;

      const currency = wholesaler.preferredCurrency || wholesaler.defaultCurrency || 'GBP';
      const sym = getCurrencySymbol(currency);

      // 2. Fetch the wholesaler's default business profile for bank details
      const [defaultProfile] = await db
        .select({
          bankName: businessProfiles.bankName,
          accountName: businessProfiles.accountName,
          accountNumber: businessProfiles.accountNumber,
          sortCode: businessProfiles.sortCode,
          iban: businessProfiles.iban,
          swift: businessProfiles.swift,
        })
        .from(businessProfiles)
        .where(
          and(
            eq(businessProfiles.wholesalerId, wholesaler.id),
            eq(businessProfiles.isDefault, true)
          )
        )
        .limit(1);

      const bankDetails = defaultProfile || undefined;

      // 3. Find all overdue, unpaid, non-paused invoices for this wholesaler
      const overdueOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          customerPhone: orders.customerPhone,
          amountOutstanding: orders.amountOutstanding,
          amountPaid: orders.amountPaid,
          balanceDueDays: orders.balanceDueDays,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          stripePaymentLinkUrl: orders.stripePaymentLinkUrl,
          chaserPaused: orders.chaserPaused,
        })
        .from(orders)
        .where(
          and(
            eq(orders.wholesalerId, wholesaler.id),
            gt(orders.amountOutstanding, '0'),
            ne(orders.paymentStatus, 'paid'),
            sql`${orders.status} NOT IN ('draft', 'cancelled')`,
            eq(orders.chaserPaused, false),
            gt(orders.balanceDueDays, 0),
            // Skip orders with a pending cancellation request
            sql`NOT EXISTS (
              SELECT 1 FROM ${orderCancellationRequests}
              WHERE ${orderCancellationRequests.orderId} = ${orders.id}
              AND ${orderCancellationRequests.status} = 'pending'
            )`,
            // Skip orders with a partial refund in progress
            // (amountRefunded > 0 but not yet fully refunded)
            or(
              isNull(orders.amountRefunded),
              sql`${orders.amountRefunded} <= 0`,
              eq(orders.paymentStatus, 'refunded'),
            ),
          )
        );

      for (const order of overdueOrders) {
        if (!order.createdAt || !order.balanceDueDays) continue;

        const dueDate = new Date(order.createdAt);
        dueDate.setDate(dueDate.getDate() + order.balanceDueDays);
        dueDate.setHours(0, 0, 0, 0);

        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue < 1) continue; // Not overdue yet

        // Grace window: if any payment has been made AND the order was updated within the
        // grace period, assume a payment plan or manual arrangement is in place and skip.
        // This prevents chasers from firing mid-instalment while the customer is actively paying.
        const paidSoFar = parseFloat(order.amountPaid || '0');
        if (paidSoFar > 0 && order.updatedAt) {
          const daysSinceUpdate = Math.floor(
            (today.getTime() - new Date(order.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceUpdate <= chaserGraceDays) {
            console.log(
              `⏸ Chaser suppressed for order ${order.orderNumber}: partial payment (${paidSoFar}) recorded ${daysSinceUpdate}d ago — within ${chaserGraceDays}d grace window`
            );
            continue;
          }
        }

        // Apply max days cutoff
        if (chaserMaxDays !== null && daysOverdue > chaserMaxDays) continue;

        // Fire on day 1, then every N days: (daysOverdue - 1) % interval === 0
        if ((daysOverdue - 1) % chaserIntervalDays !== 0) continue;

        const outstandingAmount = parseFloat(order.amountOutstanding || '0');
        if (outstandingAmount <= 0) continue;

        const sendEmail = chaserChannel === 'email' || chaserChannel === 'both';
        const sendSms = chaserChannel === 'sms' || chaserChannel === 'both';

        // Refresh payment link
        let paymentLink = order.stripePaymentLinkUrl || '';
        try {
          if (wholesaler.stripeAccountId) {
            paymentLink = await getFreshPaymentLink(order as any, wholesaler.businessName || 'Your supplier');
          }
        } catch { /* use existing link */ }

        const tone = getChaserTone(daysOverdue);
        const orderRef = order.orderNumber || `#${order.id}`;

        if (sendEmail && order.customerEmail) {
          try {
            await sendChaserEmail({
              to: order.customerEmail,
              customerName: order.customerName || 'Valued Customer',
              orderNumber: orderRef,
              amountOutstanding: outstandingAmount,
              businessName: wholesaler.businessName || 'Your supplier',
              businessLogoUrl: wholesaler.logoUrl,
              paymentLink: paymentLink || undefined,
              bankDetails,
              daysOverdue,
              currency,
            });
            totalSent++;
            console.log(`📧 Chaser email sent: order ${order.orderNumber}, ${daysOverdue} days overdue`);
            await logQuoteActivity({
              quoteId: order.id,
              actionType: 'chaser_sent',
              entityType: 'chaser',
              entityId: 'email',
              description: `Payment chaser sent via email · ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue (${tone} tone)`,
              newValue: { daysOverdue, channel: 'email', tone },
              performedBy: 'system',
            });
          } catch (err) {
            console.error(`❌ Chaser email failed for order ${order.orderNumber}:`, err);
          }
        }

        if (sendSms && order.customerPhone) {
          try {
            const shortLink = paymentLink ? await createShortPaymentLink(paymentLink, wholesaler.id, 24) : '';
            const firstName = order.customerName?.split(' ')[0] || 'there';
            const payPart = shortLink ? ` Pay here: ${shortLink}` : ' Please contact us to arrange payment.';
            let msg: string;
            if (daysOverdue <= 7) {
              msg = `Hi ${firstName}, friendly reminder: ${sym}${outstandingAmount.toFixed(2)} is outstanding on order ${orderRef} with ${wholesaler.businessName || 'us'}.${payPart}`;
            } else if (daysOverdue <= 21) {
              msg = `Hi ${firstName}, your payment of ${sym}${outstandingAmount.toFixed(2)} on order ${orderRef} with ${wholesaler.businessName || 'us'} is now ${daysOverdue} days overdue. Please pay as soon as possible.${payPart}`;
            } else {
              msg = `Urgent: ${sym}${outstandingAmount.toFixed(2)} on order ${orderRef} with ${wholesaler.businessName || 'us'} is ${daysOverdue} days overdue. Please contact us immediately.${payPart}`;
            }
            const smsResult = await ReliableSMSService.sendMarketingSMS(order.customerPhone, msg);
            if (smsResult.success) {
              totalSent++;
              await logQuoteActivity({
                quoteId: order.id,
                actionType: 'chaser_sent',
                entityType: 'chaser',
                entityId: 'sms',
                description: `Payment chaser sent via SMS · ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue (${tone} tone)`,
                newValue: { daysOverdue, channel: 'sms', tone },
                performedBy: 'system',
              });
            }
          } catch (err) {
            console.error(`❌ Chaser SMS failed for order ${order.orderNumber}:`, err);
          }
        }
      }
    }

    return totalSent;
  } catch (error) {
    console.error('❌ Error in sendPaymentChasers:', error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Auto-fulfil job
// Marks paid/processing orders as fulfilled then immediately archives them
// for wholesalers who have opted in and configured a day threshold.
// ---------------------------------------------------------------------------
export async function runAutoFulfilJob(): Promise<{ fulfilled: number; skipped: number }> {
  try {
    // 1. Find wholesalers with autoFulfilEnabled = true
    const wholesalers = await db
      .select({ id: users.id, notificationPreferences: users.notificationPreferences })
      .from(users)
      .where(sql`${users.notificationPreferences}->>'autoFulfilEnabled' = 'true'`);

    if (wholesalers.length === 0) return { fulfilled: 0, skipped: 0 };

    let totalFulfilled = 0;
    let totalSkipped = 0;

    for (const wholesaler of wholesalers) {
      const prefs = (wholesaler.notificationPreferences as Record<string, unknown>) || {};
      const thresholdDays: number = typeof prefs.autoFulfilDays === 'number' ? prefs.autoFulfilDays : 30;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - thresholdDays);

      // 2. Find qualifying orders for this wholesaler
      //    Exclude orders with an open cancellation request or a partial refund in progress.
      const qualifying = await db
        .select({ id: orders.id, orderNumber: orders.orderNumber })
        .from(orders)
        .where(
          and(
            eq(orders.wholesalerId, wholesaler.id),
            inArray(orders.status, ['pending', 'processing']),
            eq(orders.paymentStatus, 'paid'),
            lt(orders.createdAt, cutoff),
            // Skip orders that have a pending cancellation / dispute
            sql`NOT EXISTS (
              SELECT 1 FROM ${orderCancellationRequests}
              WHERE ${orderCancellationRequests.orderId} = ${orders.id}
              AND ${orderCancellationRequests.status} = 'pending'
            )`,
            // Skip orders with a partial refund in progress
            // (amountRefunded > 0 but not yet fully refunded)
            or(
              isNull(orders.amountRefunded),
              sql`${orders.amountRefunded} <= 0`,
              eq(orders.paymentStatus, 'refunded'),
            ),
          )
        );

      for (const order of qualifying) {
        try {
          // 3. Set fulfilled then immediately archive (bypass the 24 h setTimeout used in the route)
          await storage.updateOrderStatus(order.id, 'fulfilled');
          await storage.updateOrderStatus(order.id, 'archived');

          // 4. Log the action
          await logQuoteActivity({
            quoteId: order.id,
            actionType: 'auto_fulfilled',
            entityType: 'order',
            entityId: String(order.id),
            description: `Order automatically fulfilled and archived after ${thresholdDays} days`,
            newValue: { thresholdDays },
            performedBy: 'system',
          });

          totalFulfilled++;
          console.log(`✅ Auto-fulfilled order ${order.orderNumber || order.id} (wholesaler ${wholesaler.id})`);
        } catch (err) {
          totalSkipped++;
          console.error(`❌ Auto-fulfil failed for order ${order.id} (wholesaler ${wholesaler.id}):`, err);
        }
      }
    }

    console.log(`ℹ️ Auto-fulfil job complete — fulfilled: ${totalFulfilled}, skipped due to errors: ${totalSkipped}`);
    return { fulfilled: totalFulfilled, skipped: totalSkipped };
  } catch (error) {
    console.error('❌ Error in runAutoFulfilJob:', error);
    return { fulfilled: 0, skipped: 0 };
  }
}
