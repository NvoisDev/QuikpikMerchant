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
    
    await mailService.send({
      to: params.to,
      from: params.from || 'hello@quikpik.co', // Use consistent verified domain
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    
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
    from: 'hello@quikpik.co', // Use consistent verified domain
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
    from: 'hello@quikpik.co', // Use consistent verified domain
    subject: `📸 New Photos Added to Order ${orderData.orderNumber}`,
    html: html
  });
}

export default { sendEmail, sendOrderConfirmationEmail, sendOrderPhotoNotificationEmail };