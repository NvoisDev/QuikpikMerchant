import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    console.log('📧 Sending email via SendGrid:', { to: params.to, subject: params.subject });
    
    const content: Array<{type: string; value: string}> = [];
    if (params.text) {
      content.push({ type: 'text/plain', value: params.text });
    }
    if (params.html) {
      content.push({ type: 'text/html', value: params.html });
    }
    if (content.length === 0) {
      content.push({ type: 'text/plain', value: ' ' });
    }
    await mailService.send({
      to: params.to,
      from: params.from || 'hello@quikpik.co',
      subject: params.subject,
      content,
    } as any);
    
    console.log('✅ Email sent successfully via SendGrid');
    return true;
  } catch (error: any) {
    console.error('❌ SendGrid email error:', error);
    if (error.response?.body?.errors) {
      console.error('📋 SendGrid error details:', JSON.stringify(error.response.body.errors, null, 2));
    }
    if (error.response?.body) {
      console.error('📋 Full SendGrid response body:', JSON.stringify(error.response.body, null, 2));
    }
    return false;
  }
}

// Order confirmation email template
export async function sendOrderConfirmationEmail(orderData: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  orderItems: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  transactionFee: number;
  totalPaid: number;
  wholesalerName: string;
  shippingAddress?: string;
  estimatedDelivery?: string;
  depositPercentage?: number;
  balanceDueDays?: number;
  amountOutstanding?: number;
}): Promise<boolean> {
  const itemsHtml = orderData.orderItems.map(item => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px; text-align: left;">${item.productName}</td>
      <td style="padding: 10px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; text-align: right;">£${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 10px; text-align: right;">£${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  // Generate payment terms section if applicable
  let paymentTermsHtml = '';
  if (orderData.depositPercentage !== undefined && orderData.depositPercentage < 100 && orderData.amountOutstanding !== undefined && orderData.amountOutstanding > 0) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (orderData.balanceDueDays || 0));
    const formattedDueDate = dueDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    paymentTermsHtml = `
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
        <h3 style="color: #92400e; margin-top: 0; margin-bottom: 10px;">💳 Payment Terms</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; color: #92400e;">Deposit Paid (${orderData.depositPercentage}%):</td>
            <td style="padding: 5px 0; text-align: right; color: #92400e;"><strong>£${orderData.totalPaid.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #92400e;">Balance Outstanding:</td>
            <td style="padding: 5px 0; text-align: right; color: #92400e;"><strong>£${orderData.amountOutstanding.toFixed(2)}</strong></td>
          </tr>
          <tr style="border-top: 1px solid #f59e0b; margin-top: 10px;">
            <td style="padding: 10px 0 5px 0; color: #92400e;"><strong>Balance Due By:</strong></td>
            <td style="padding: 10px 0 5px 0; text-align: right; color: #92400e;"><strong>${formattedDueDate}</strong></td>
          </tr>
        </table>
        <p style="margin: 10px 0 0 0; font-size: 13px; color: #92400e;">
          ${orderData.balanceDueDays === 0 ? 'Payment is due immediately upon order confirmation.' : `You have ${orderData.balanceDueDays} days to pay the remaining balance.`}
        </p>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Confirmation - ${orderData.orderNumber}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #10B981; margin-bottom: 5px;">Order Confirmed!</h1>
        <p style="color: #666; font-size: 16px;">Thank you for your order, ${orderData.customerName}</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">Order Details</h2>
        <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
        <p><strong>From:</strong> ${orderData.wholesalerName}</p>
        ${orderData.shippingAddress ? `<p><strong>Shipping to:</strong> ${orderData.shippingAddress}</p>` : ''}
        ${orderData.estimatedDelivery ? `<p><strong>Estimated Delivery:</strong> ${orderData.estimatedDelivery}</p>` : ''}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Product</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Unit Price</th>
            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; text-align: left;"><strong>Subtotal:</strong></td>
            <td style="padding: 5px 0; text-align: right;"><strong>£${orderData.subtotal.toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td style="padding: 5px 0; text-align: left; color: #666;">Transaction Fee (5.5% + £0.50):</td>
            <td style="padding: 5px 0; text-align: right; color: #666;">£${orderData.transactionFee.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 1px solid #ddd;">
            <td style="padding: 10px 0; text-align: left; font-size: 18px;"><strong>Total Paid:</strong></td>
            <td style="padding: 10px 0; text-align: right; font-size: 18px; color: #10B981;"><strong>£${orderData.totalPaid.toFixed(2)}</strong></td>
          </tr>
        </table>
      </div>

      ${paymentTermsHtml}

      <div style="background: #f0f9ff; border: 1px solid #10B981; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0; color: #0f766e;"><strong>📧 Stripe Receipt:</strong> You'll receive a separate payment receipt from Stripe at this email address.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #666; margin-bottom: 5px;">Questions about your order?</p>
        <p style="color: #10B981; font-weight: bold;">Contact ${orderData.wholesalerName}</p>
        <p style="font-size: 12px; color: #999; margin-top: 20px;">
          This confirmation was sent to ${orderData.customerEmail}<br>
          Powered by Quikpik
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to: orderData.customerEmail,
    from: 'hello@quikpik.co',
    subject: `Order Confirmation - ${orderData.orderNumber}`,
    html: html
  });
}

// Order photo notification email template
export async function sendOrderPhotoNotificationEmail(orderData: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  wholesalerName: string;
  photoCount: number;
  orderPortalUrl?: string;
}): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Photos Added - ${orderData.orderNumber}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #10B981; margin-bottom: 5px;">📸 New Photos Added!</h1>
        <p style="color: #666; font-size: 16px;">Photos have been added to your order</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">Order Details</h2>
        <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
        <p><strong>From:</strong> ${orderData.wholesalerName}</p>
        <p><strong>Photos Added:</strong> ${orderData.photoCount} new photo${orderData.photoCount > 1 ? 's' : ''}</p>
      </div>

      <div style="background: #f0f9ff; border: 1px solid #10B981; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
        <h3 style="color: #0f766e; margin-top: 0;">📱 View Your Order Photos</h3>
        <p style="margin: 10px 0; color: #0f766e;">Your wholesaler has added ${orderData.photoCount} new photo${orderData.photoCount > 1 ? 's' : ''} to show your order items.</p>
        ${orderData.orderPortalUrl ? `
          <a href="${orderData.orderPortalUrl}" style="display: inline-block; background: #10B981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; margin: 10px 0;">
            View Order Photos
          </a>
        ` : `
          <p style="color: #666; font-size: 14px; margin: 10px 0;">Log into your customer portal to view the photos</p>
        `}
      </div>

      <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0; color: #ea580c;"><strong>📋 What are these photos?</strong> Your wholesaler has added photos to document your order items before ${orderData.orderNumber.includes('delivery') ? 'delivery' : 'collection'}.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #666; margin-bottom: 5px;">Questions about your order?</p>
        <p style="color: #10B981; font-weight: bold;">Contact ${orderData.wholesalerName}</p>
        <p style="font-size: 12px; color: #999; margin-top: 20px;">
          This notification was sent to ${orderData.customerEmail}<br>
          Powered by Quikpik
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to: orderData.customerEmail,
    from: 'hello@quikpik.co',
    subject: `📸 New Photos Added to Order ${orderData.orderNumber}`,
    html: html
  });
}

// Wholesaler order notification email template
export async function sendWholesalerOrderNotification(orderData: {
  wholesalerEmail: string;
  wholesalerName: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderItems: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  totalAmount: number;
  fulfillmentType: string;
  // FIXED: Use individual address components instead of incomplete snapshot
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): Promise<boolean> {
  const itemsHtml = orderData.orderItems.map(item => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px; text-align: left;">${item.productName}</td>
      <td style="padding: 10px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; text-align: right;">£${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 10px; text-align: right;">£${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Order Received - ${orderData.orderNumber}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #10B981; margin-bottom: 5px;">🛍️ New Order Received!</h1>
        <p style="color: #666; font-size: 16px;">Order #${orderData.orderNumber}</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">Customer Information</h2>
        <p><strong>Name:</strong> ${orderData.customerName}</p>
        <p><strong>Email:</strong> ${orderData.customerEmail}</p>
        <p><strong>Phone:</strong> ${orderData.customerPhone}</p>
        <p><strong>Fulfillment:</strong> ${orderData.fulfillmentType === 'delivery' ? '🚛 Delivery' : '🏪 Pickup'}</p>
        ${(orderData.addressLine1 || orderData.city) ? `
          <p><strong>Delivery Address:</strong></p>
          <div style="margin-left: 20px; line-height: 1.5;">
            ${orderData.addressLine1 ? `${orderData.addressLine1}<br>` : ''}
            ${orderData.addressLine2 ? `${orderData.addressLine2}<br>` : ''}
            ${orderData.city ? `${orderData.city}` : ''}
            ${orderData.state ? `, ${orderData.state}` : ''}<br>
            ${orderData.postalCode ? `${orderData.postalCode}<br>` : ''}
            ${orderData.country ? `${orderData.country}` : 'United Kingdom'}
          </div>
        ` : orderData.fulfillmentType === 'delivery' ? `<p><strong>Delivery Address:</strong> Address to be confirmed</p>` : ''}
      </div>

      <div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <div style="background: #10B981; color: white; padding: 15px;">
          <h3 style="margin: 0;">Order Items</h3>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="background: #f8f9fa;">
            <tr>
              <th style="padding: 10px; text-align: left;">Product</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
              <th style="padding: 10px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div style="padding: 20px; background: #f8f9fa; border-top: 1px solid #ddd;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <span>Subtotal:</span>
            <span>£${orderData.subtotal.toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; border-top: 1px solid #ddd; padding-top: 10px;">
            <span>Total Order Value:</span>
            <span style="color: #10B981;">£${orderData.totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style="background: #f0f9ff; border: 1px solid #10B981; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
        <h3 style="color: #0f766e; margin-top: 0;">📋 Next Steps</h3>
        ${orderData.fulfillmentType === 'delivery' 
          ? '<p style="margin: 10px 0; color: #0f766e;">Contact the customer within 24 hours to arrange delivery details.</p>'
          : '<p style="margin: 10px 0; color: #0f766e;">Contact the customer to arrange pickup details.</p>'
        }
      </div>

      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #999;">
          This notification was sent to ${orderData.wholesalerEmail}<br>
          Powered by Quikpik
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to: orderData.wholesalerEmail,
    from: 'hello@quikpik.co',
    subject: `New Order Received - ${orderData.orderNumber}`,
    html: html
  });
}

export async function sendPaymentReminderEmail(data: {
  to: string;
  customerName: string;
  orderNumber: string;
  amountOutstanding: number;
  dueDate: string;
  businessName: string;
  paymentLink: string;
  urgency: 'upcoming' | 'due_today' | 'overdue';
}): Promise<boolean> {
  const { to, customerName, orderNumber, amountOutstanding, dueDate, businessName, paymentLink, urgency } = data;
  
  let urgencyColor: string;
  let urgencyMessage: string;
  let subject: string;
  
  if (urgency === 'upcoming') {
    urgencyColor = '#F59E0B';
    urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> is due on <strong>${dueDate}</strong>.`;
    subject = `Payment Reminder: £${amountOutstanding.toFixed(2)} due soon - Order ${orderNumber}`;
  } else if (urgency === 'due_today') {
    urgencyColor = '#DC2626';
    urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> is <strong>due today</strong>.`;
    subject = `Payment Due Today: £${amountOutstanding.toFixed(2)} - Order ${orderNumber}`;
  } else {
    urgencyColor = '#991B1B';
    urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> was due on <strong>${dueDate}</strong> and is now <strong>overdue</strong>.`;
    subject = `Overdue Payment: £${amountOutstanding.toFixed(2)} - Order ${orderNumber}`;
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: ${urgencyColor}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .amount-box { background: white; border: 2px solid ${urgencyColor}; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0; }
        .amount { font-size: 28px; font-weight: bold; color: ${urgencyColor}; }
        .btn { display: inline-block; background: #10B981; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; margin: 15px 0; }
        .footer { padding: 15px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${urgency === 'overdue' ? '⚠️ Overdue Payment Notice' : urgency === 'due_today' ? '⏰ Payment Due Today' : '📅 Payment Reminder'}</h1>
      </div>
      <div class="content">
        <p>Hi ${customerName},</p>
        <p>${urgencyMessage}</p>
        
        <div class="amount-box">
          <p style="margin: 0; color: #666;">Amount Due</p>
          <p class="amount">£${amountOutstanding.toFixed(2)}</p>
          <p style="margin: 0; color: #666;">Order: ${orderNumber}</p>
        </div>
        
        ${paymentLink ? `
        <div style="text-align: center;">
          <a href="${paymentLink}" class="btn">Pay Now</a>
        </div>
        ` : `
        <p>Please contact ${businessName} to arrange payment.</p>
        `}
        
        <p style="margin-top: 20px;">Thank you for your business!</p>
        <p><strong>${businessName}</strong></p>
      </div>
      <div class="footer">
        <p>This is an automated payment reminder from ${businessName} via Quikpik.</p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'hello@quikpik.co',
    subject,
    html
  });
}

export default { sendEmail, sendOrderConfirmationEmail, sendOrderPhotoNotificationEmail, sendWholesalerOrderNotification, sendPaymentReminderEmail };