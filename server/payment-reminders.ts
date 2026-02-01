import { db } from './db';
import { orders, users } from '@shared/schema';
import { and, gt, isNotNull, sql } from 'drizzle-orm';
import { sendPaymentReminderEmail } from './sendgrid-service';
import { sendSMS } from './services/smsService';

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
  console.log('🔔 Running payment reminder check...');
  
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
        gt(orders.balanceDueDays, 0)
      )
    );
    
    console.log(`📋 Found ${ordersWithBalances.length} orders with outstanding balances and payment terms`);
    
    let remindersSent = 0;
    
    for (const order of ordersWithBalances) {
      if (!order.createdAt || !order.balanceDueDays) continue;
      
      const dueDate = new Date(order.createdAt);
      dueDate.setDate(dueDate.getDate() + order.balanceDueDays);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      const shouldSendReminder = daysUntilDue === 3 || daysUntilDue === 0 || daysUntilDue === -1;
      
      if (shouldSendReminder) {
        console.log(`📧 Sending reminder for order ${order.orderNumber}: ${daysUntilDue} days until due`);
        await sendPaymentReminder(order as OrderWithPaymentTerms, daysUntilDue, dueDate);
        remindersSent++;
      }
    }
    
    console.log(`✅ Payment reminder check complete. Sent ${remindersSent} reminders.`);
    return remindersSent;
    
  } catch (error) {
    console.error('❌ Error in payment reminder check:', error);
    return 0;
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
  })
  .from(users)
  .where(sql`${users.id} = ${order.wholesalerId}`)
  .limit(1);
  
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
  
  if (order.customerEmail) {
    try {
      await sendPaymentReminderEmail({
        to: order.customerEmail,
        customerName: order.customerName || 'Valued Customer',
        orderNumber: order.orderNumber || '',
        amountOutstanding: outstandingAmount,
        dueDate: formattedDueDate,
        businessName,
        paymentLink: order.stripePaymentLinkUrl || '',
        urgency,
      });
      console.log(`✅ Email reminder sent to ${order.customerEmail} for order ${order.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send email reminder for order ${order.orderNumber}:`, error);
    }
  }
  
  if (order.customerPhone) {
    try {
      let smsMessage: string;
      
      if (urgency === 'upcoming') {
        smsMessage = `Hi ${order.customerName?.split(' ')[0] || 'there'}! Friendly reminder: £${outstandingAmount.toFixed(2)} is due on ${formattedDueDate} for your order with ${businessName}. ${order.stripePaymentLinkUrl ? `Pay here: ${order.stripePaymentLinkUrl}` : 'Please contact us to arrange payment.'}`;
      } else if (urgency === 'due_today') {
        smsMessage = `Payment Due Today! £${outstandingAmount.toFixed(2)} is due for your order with ${businessName}. ${order.stripePaymentLinkUrl ? `Pay now: ${order.stripePaymentLinkUrl}` : 'Please contact us immediately.'}`;
      } else {
        smsMessage = `Overdue Notice: £${outstandingAmount.toFixed(2)} was due on ${formattedDueDate} for your order with ${businessName}. Please pay immediately. ${order.stripePaymentLinkUrl ? `Pay here: ${order.stripePaymentLinkUrl}` : ''}`;
      }
      
      await sendSMS({ to: order.customerPhone, message: smsMessage });
      console.log(`✅ SMS reminder sent to ${order.customerPhone} for order ${order.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send SMS reminder for order ${order.orderNumber}:`, error);
    }
  }
}
