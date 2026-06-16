import { db } from './db';
import { orders, users, orderItems, products } from '@shared/schema';
import { and, gt, isNotNull, sql, eq } from 'drizzle-orm';
import { sendPaymentReminderEmail } from './sendgrid-service';
import { sendWhatsAppMessage } from './services/whatsappService';
import { getStripeClient } from './stripeConfig';
import { isConnectAccountReady } from './utils/stripe-connect-ready';
import { createShortPaymentLink } from './shortPaymentLink';

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
        smsMessage = `Hi ${firstName}! Reminder: £${outstandingAmount.toFixed(2)} balance due on ${formattedDueDate} for order ${orderRef}${itemsPart} with ${businessName}.${payPart}`;
      } else if (urgency === 'due_today') {
        smsMessage = `Hi ${firstName}! Payment due today: £${outstandingAmount.toFixed(2)} outstanding on order ${orderRef}${itemsPart} with ${businessName}.${payPart}`;
      } else {
        smsMessage = `Hi ${firstName}, overdue notice: £${outstandingAmount.toFixed(2)} for order ${orderRef}${itemsPart} with ${businessName} was due on ${formattedDueDate}. Please pay immediately${shortPayLink ? `: ${shortPayLink}` : ' — contact us.'}`; 
      }
      
      await sendWhatsAppMessage({ to: order.customerPhone, message: smsMessage });
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp reminder for order ${orderRef}:`, error);
    }
  }
}
