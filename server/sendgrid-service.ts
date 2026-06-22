import { MailService } from '@sendgrid/mail';
import { logServiceError } from './utils/logServiceError';
import { escapeHtml } from './email-templates';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailAttachment {
  content: string;
  type: string;
  filename: string;
  disposition: 'attachment';
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
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
      ...(params.attachments && params.attachments.length > 0
        ? { attachments: params.attachments }
        : {}),
    } as Parameters<typeof mailService.send>[0]);
    
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
    await logServiceError('sendgrid', 'send', error?.message || String(error), {
      to: params.to,
      subject: params.subject,
      statusCode: error?.response?.status,
    });
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
    appliedOfferLabel?: string | null;
    freeItems?: number;
  }>;
  subtotal: number;
  transactionFee: number;
  totalPaid: number;
  wholesalerName: string;
  wholesalerLogoUrl?: string | null;
  shippingAddress?: string;
  estimatedDelivery?: string;
  depositPercentage?: number;
  balanceDueDays?: number;
  amountOutstanding?: number;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailTable, emailDivider, emailHeading, emailBadge } = await import('./email-templates');

  const itemRows = orderData.orderItems.map(item => {
    const promoNote = item.appliedOfferLabel ? '<br/><span style="color:#10b981;font-size:12px">🎁 ' + escapeHtml(item.appliedOfferLabel) + '</span>' : '';
    const freeNote = item.freeItems && item.freeItems > 0 ? ' <span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:8px;font-size:11px">+' + item.freeItems + ' free</span>' : '';
    return [
      escapeHtml(item.productName) + promoNote + freeNote,
      `${item.quantity}`,
      `£${item.unitPrice.toFixed(2)}`,
      `£${item.total.toFixed(2)}`
    ];
  });

  let paymentTermsHtml = '';
  if (orderData.depositPercentage !== undefined && orderData.depositPercentage < 100 && orderData.amountOutstanding !== undefined && orderData.amountOutstanding > 0) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (orderData.balanceDueDays || 0));
    const formattedDueDate = dueDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    paymentTermsHtml = emailCard(`${emailHeading('Payment Terms', { color: '#92400e' })}<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0;color:#92400e">Deposit Paid (${orderData.depositPercentage}%):</td><td style="padding:6px 0;text-align:right;color:#92400e;font-weight:600">£${orderData.totalPaid.toFixed(2)}</td></tr><tr><td style="padding:6px 0;color:#92400e">Balance Outstanding:</td><td style="padding:6px 0;text-align:right;color:#92400e;font-weight:600">£${orderData.amountOutstanding.toFixed(2)}</td></tr><tr style="border-top:1px solid #f59e0b"><td style="padding:10px 0 4px;color:#92400e;font-weight:700">Balance Due By:</td><td style="padding:10px 0 4px;text-align:right;color:#92400e;font-weight:700">${formattedDueDate}</td></tr></table><p style="margin:10px 0 0;font-size:13px;color:#92400e">${orderData.balanceDueDays === 0 ? 'Payment is due immediately upon order confirmation.' : `You have ${orderData.balanceDueDays} days to pay the remaining balance.`}</p>`, { borderColor: '#f59e0b', bgColor: '#fffbeb' });
  }

  const body = `<p style="font-size:16px;margin:0 0 8px">Dear ${escapeHtml(orderData.customerName)},</p><p style="margin:0 0 20px">Thank you for your order. We're pleased to confirm your order has been received and is being processed.</p>${emailCard(`${emailHeading('Order Details')}<p style="margin:0 0 6px"><strong>Order Number:</strong> ${orderData.orderNumber}</p>${orderData.shippingAddress ? `<p style="margin:0 0 6px"><strong>Shipping to:</strong> ${escapeHtml(orderData.shippingAddress)}</p>` : ''}${orderData.estimatedDelivery ? `<p style="margin:0 0 6px"><strong>Estimated Delivery:</strong> ${escapeHtml(orderData.estimatedDelivery)}</p>` : ''}`)}${emailTable(['Product', 'Qty', 'Unit Price', 'Total'], itemRows)}${emailCard(`<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0"><strong>Subtotal:</strong></td><td style="padding:6px 0;text-align:right;font-weight:600">£${orderData.subtotal.toFixed(2)}</td></tr><tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Service Fee:</td><td style="padding:6px 0;text-align:right;color:#6b7280;font-size:14px">£${orderData.transactionFee.toFixed(2)}</td></tr><tr style="border-top:2px solid #e5e7eb"><td style="padding:12px 0 4px;font-size:17px;font-weight:700">Total Paid:</td><td style="padding:12px 0 4px;text-align:right;font-size:17px;font-weight:700;color:#10b981">£${orderData.totalPaid.toFixed(2)}</td></tr></table>`)}${paymentTermsHtml}${emailCard(`<p style="margin:0;color:#0f766e;font-size:14px"><strong>Stripe Receipt:</strong> You'll receive a separate payment receipt from Stripe at this email address.</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}`;

  const html = wrapCustomerEmail(body, {
    businessName: orderData.wholesalerName,
    logoUrl: orderData.wholesalerLogoUrl,
  }, { preheader: `Order ${orderData.orderNumber} confirmed` });

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
  wholesalerLogoUrl?: string | null;
  photoCount: number;
  orderPortalUrl?: string;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailButton, emailHeading } = await import('./email-templates');

  const body = `<p style="font-size:16px;margin:0 0 8px">Dear ${escapeHtml(orderData.customerName)},</p><p style="margin:0 0 20px">New photos have been added to your order. Here are the details:</p>${emailCard(`${emailHeading('Order Details')}<p style="margin:0 0 6px"><strong>Order Number:</strong> ${orderData.orderNumber}</p><p style="margin:0 0 6px"><strong>Photos Added:</strong> ${orderData.photoCount} new photo${orderData.photoCount > 1 ? 's' : ''}</p>`)}${emailCard(`<p style="margin:0 0 8px;font-weight:600;color:#0f766e">Your order items have been photographed to document them before ${orderData.orderNumber.includes('delivery') ? 'delivery' : 'collection'}.</p><p style="margin:0;color:#0f766e;font-size:14px">${orderData.photoCount} new photo${orderData.photoCount > 1 ? 's are' : ' is'} now available for you to view.</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${orderData.orderPortalUrl ? emailButton('View Order Photos', orderData.orderPortalUrl) : '<p style="text-align:center;color:#6b7280;font-size:14px">Log into your customer portal to view the photos.</p>'}`;

  const html = wrapCustomerEmail(body, {
    businessName: orderData.wholesalerName,
    logoUrl: orderData.wholesalerLogoUrl,
  }, { preheader: `${orderData.photoCount} new photos added to order ${orderData.orderNumber}` });

  return await sendEmail({
    to: orderData.customerEmail,
    from: 'hello@quikpik.co',
    subject: `New Photos Added to Order ${orderData.orderNumber}`,
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
    appliedOfferLabel?: string | null;
    freeItems?: number;
  }>;
  subtotal: number;
  totalAmount: number;
  fulfillmentType: string;
  wholesalerLogoUrl?: string | null;
  placedByName?: string | null;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailTable, emailHeading, emailButton, emailBadge } = await import('./email-templates');

  const itemRows = orderData.orderItems.map(item => {
    const promoNote = item.appliedOfferLabel ? '<br/><span style="color:#10b981;font-size:12px">🎁 ' + escapeHtml(item.appliedOfferLabel) + '</span>' : '';
    const freeNote = item.freeItems && item.freeItems > 0 ? ' <span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:8px;font-size:11px">+' + item.freeItems + ' free</span>' : '';
    return [
      escapeHtml(item.productName) + promoNote + freeNote,
      `${item.quantity}`,
      `£${item.unitPrice.toFixed(2)}`,
      `£${item.total.toFixed(2)}`
    ];
  });

  let addressHtml = '';
  if (orderData.addressLine1 || orderData.city) {
    addressHtml = `<p style="margin:0 0 6px"><strong>Delivery Address:</strong></p><p style="margin:0 0 6px;padding-left:16px;color:#4b5563;line-height:1.5">${orderData.addressLine1 ? `${escapeHtml(orderData.addressLine1)}<br>` : ''}${orderData.addressLine2 ? `${escapeHtml(orderData.addressLine2)}<br>` : ''}${escapeHtml(orderData.city) || ''}${orderData.state ? `, ${escapeHtml(orderData.state)}` : ''}<br>${orderData.postalCode ? `${escapeHtml(orderData.postalCode)}<br>` : ''}${escapeHtml(orderData.country) || 'United Kingdom'}</p>`;
  } else if (orderData.fulfillmentType === 'delivery') {
    addressHtml = `<p style="margin:0 0 6px"><strong>Delivery Address:</strong> Address to be confirmed</p>`;
  }

  const placedByHtml = orderData.placedByName ? `<p style="margin:0 0 6px"><strong>Placed by:</strong> ${escapeHtml(orderData.placedByName)} <span style="background:#f3f4f6;color:#6b7280;padding:1px 8px;border-radius:10px;font-size:12px">Team Member</span></p>` : '';

  const body = `${emailHeading('New Order Received', { size: '22px', color: '#10b981' })}<p style="margin:0 0 20px">You have a new order from <strong>${escapeHtml(orderData.customerName)}</strong>.</p>${emailCard(`${emailHeading('Customer Information', { size: '16px' })}<p style="margin:0 0 6px"><strong>Name:</strong> ${escapeHtml(orderData.customerName)}</p><p style="margin:0 0 6px"><strong>Email:</strong> <a href="mailto:${escapeHtml(orderData.customerEmail)}" style="color:#10b981;text-decoration:none">${escapeHtml(orderData.customerEmail)}</a></p><p style="margin:0 0 6px"><strong>Phone:</strong> <a href="tel:${escapeHtml(orderData.customerPhone)}" style="color:#10b981;text-decoration:none">${escapeHtml(orderData.customerPhone)}</a></p><p style="margin:0 0 6px"><strong>Fulfillment:</strong> ${emailBadge(orderData.fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup', orderData.fulfillmentType === 'delivery' ? '#3b82f6' : '#10b981')}</p>${placedByHtml}${addressHtml}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}${emailTable(['Product', 'Qty', 'Price', 'Total'], itemRows)}${emailCard(`<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0"><strong>Subtotal:</strong></td><td style="padding:6px 0;text-align:right">£${orderData.subtotal.toFixed(2)}</td></tr><tr style="border-top:2px solid #e5e7eb"><td style="padding:12px 0 4px;font-size:17px;font-weight:700">Total Order Value:</td><td style="padding:12px 0 4px;text-align:right;font-size:17px;font-weight:700;color:#10b981">£${orderData.totalAmount.toFixed(2)}</td></tr></table>`)}${emailCard(`${emailHeading('Next Steps', { size: '16px', color: '#0f766e' })}<p style="margin:0;color:#0f766e">${orderData.fulfillmentType === 'delivery' ? 'Contact the customer within 24 hours to arrange delivery details.' : 'Contact the customer to arrange pickup details.'}</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailButton('View Order Details', 'https://quikpik.co/orders')}`;

  const html = wrapCustomerEmail(body, { businessName: orderData.wholesalerName, logoUrl: orderData.wholesalerLogoUrl }, { preheader: `New order ${orderData.orderNumber} from ${orderData.customerName}` });

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
  businessLogoUrl?: string | null;
  paymentLink: string;
  urgency: 'upcoming' | 'due_today' | 'overdue';
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailButton, emailHeading } = await import('./email-templates');
  const { to, customerName, orderNumber, amountOutstanding, dueDate, businessName, paymentLink, urgency } = data;
  
  let urgencyColor: string;
  let urgencyMessage: string;
  let subject: string;
  let headingText: string;
  
  if (urgency === 'upcoming') {
    urgencyColor = '#F59E0B';
    urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> is due on <strong>${dueDate}</strong>.`;
    subject = `Payment Reminder: £${amountOutstanding.toFixed(2)} due soon - Order ${orderNumber}`;
    headingText = 'Payment Reminder';
  } else if (urgency === 'due_today') {
    urgencyColor = '#DC2626';
    urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> is <strong>due today</strong>.`;
    subject = `Payment Due Today: £${amountOutstanding.toFixed(2)} - Order ${orderNumber}`;
    headingText = 'Payment Due Today';
  } else {
    urgencyColor = '#991B1B';
    urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> was due on <strong>${dueDate}</strong> and is now <strong>overdue</strong>.`;
    subject = `Overdue Payment: £${amountOutstanding.toFixed(2)} - Order ${orderNumber}`;
    headingText = 'Overdue Payment Notice';
  }
  
  const body = `${emailHeading(headingText, { color: urgencyColor, size: '22px' })}<p style="font-size:16px;margin:0 0 8px">Dear ${escapeHtml(customerName)},</p><p style="margin:0 0 20px">${urgencyMessage}</p>${emailCard(`<div style="text-align:center"><p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Amount Due</p><p style="margin:0 0 8px;font-size:32px;font-weight:800;color:${urgencyColor};letter-spacing:-0.5px">£${amountOutstanding.toFixed(2)}</p><p style="margin:0;font-size:14px;color:#6b7280">Order: ${orderNumber}</p></div>`, { borderColor: urgencyColor })}${paymentLink ? emailButton('Pay Now', paymentLink, '#10b981') : `<p style="text-align:center;color:#6b7280">Please contact ${escapeHtml(businessName)} to arrange payment.</p>`}<p style="margin:20px 0 0">Thank you for your continued business.</p><p style="margin:4px 0 0;font-weight:600">${escapeHtml(businessName)}</p>`;

  const html = wrapCustomerEmail(body, {
    businessName,
    logoUrl: data.businessLogoUrl,
  }, { preheader: `Payment of £${amountOutstanding.toFixed(2)} ${urgency === 'overdue' ? 'overdue' : 'due'} for order ${orderNumber}` });

  return await sendEmail({
    to,
    from: 'hello@quikpik.co',
    subject,
    html
  });
}

export async function sendStripeVerifiedEmail(data: {
  wholesalerEmail: string;
  wholesalerName: string;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailButton, emailHeading } = await import('./email-templates');

  const body = `${emailHeading('Your payment account is verified!', { color: '#10b981', size: '22px' })}<p style="font-size:16px;margin:0 0 8px">Hi ${escapeHtml(data.wholesalerName)},</p><p style="margin:0 0 20px">Great news — Stripe has fully verified your payment account. You can now accept payments from your customers directly through Quikpik.</p>${emailCard(`${emailHeading('What this means for you', { size: '16px', color: '#0f766e' })}<p style="margin:0 0 8px;color:#0f766e">Your Stripe Connect account has been approved and is now active:</p><ul style="margin:0;padding-left:20px;color:#0f766e"><li style="margin-bottom:6px">Customers can pay for orders online</li><li style="margin-bottom:6px">Payments will be transferred directly to your bank account</li><li style="margin-bottom:6px">You can view your payouts from your Quikpik dashboard</li></ul>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailButton('Go to your Dashboard', 'https://quikpik.co/dashboard')}<p style="margin:20px 0 0;color:#6b7280;font-size:14px">If you have any questions, please don't hesitate to get in touch.</p><p style="margin:4px 0 0;font-weight:600">The Quikpik Team</p>`;

  const html = wrapCustomerEmail(body, { businessName: 'Quikpik' }, { preheader: 'Your Stripe payment account is now fully verified and ready to accept payments.' });

  return await sendEmail({
    to: data.wholesalerEmail,
    from: 'hello@quikpik.co',
    subject: 'Your payment account is verified — you can now accept payments',
    html,
  });
}

export async function sendWeeklyOrderDigestEmail(data: {
  wholesalerEmail: string;
  businessName: string;
  orders: Array<{
    orderNumber: string;
    customerName: string;
    createdAt: Date;
    status: string;
    total: number;
  }>;
  newLeadsCount?: number;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailButton, emailHeading, emailTable } = await import('./email-templates');

  const today = new Date();
  const orderRows = data.orders.map((o) => {
    const ageMs = today.getTime() - new Date(o.createdAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const statusLabel = o.status.charAt(0).toUpperCase() + o.status.slice(1);
    return [
      o.orderNumber,
      escapeHtml(o.customerName),
      `${ageDays} day${ageDays !== 1 ? 's' : ''}`,
      statusLabel,
      `£${o.total.toFixed(2)}`,
    ];
  });

  const appBase = process.env.APP_URL || 'https://quikpik.app';
  const ordersLink = `${appBase}/orders?status=unfulfilled`;
  const leadsLink = `${appBase}/leads`;

  const countWord = data.orders.length === 1 ? '1 order' : `${data.orders.length} orders`;
  const newLeadsCount = data.newLeadsCount ?? 0;

  const leadsSection = newLeadsCount > 0
    ? `${emailCard(
        `<p style="margin:0 0 6px;font-weight:600;color:#1d4ed8;font-size:15px">📬 New leads this week: ${newLeadsCount}</p><p style="margin:0;font-size:14px;color:#1e40af">You received ${newLeadsCount === 1 ? 'a new enquiry' : `${newLeadsCount} new enquiries`} from your public store this week. <a href="${leadsLink}" style="color:#1d4ed8;text-decoration:underline">View your leads →</a></p>`,
        { borderColor: '#93c5fd', bgColor: '#eff6ff' }
      )}`
    : '';

  const ordersSection = data.orders.length > 0
    ? `<p style="margin:0 0 20px">You have <strong>${countWord}</strong> that ${data.orders.length === 1 ? 'has' : 'have'} been unfulfilled for more than 15 days. Here's a summary:</p>
${emailTable(['Order #', 'Customer', 'Age', 'Status', 'Value'], orderRows)}
${emailCard(`<p style="margin:0;color:#92400e;font-size:14px">These orders may need your attention. Fulfilling or following up on them promptly helps keep your customers happy.</p>`, { borderColor: '#f59e0b', bgColor: '#fffbeb' })}
${emailButton('View Unfulfilled Orders', ordersLink, '#10b981')}`
    : '';

  const body = `${emailHeading('Weekly Order Digest', { color: '#10b981', size: '22px' })}
<p style="font-size:16px;margin:0 0 16px">Hi ${escapeHtml(data.businessName)},</p>
${leadsSection}
${ordersSection}
<p style="margin:20px 0 4px;font-size:13px;color:#6b7280">You're receiving this weekly digest to keep you on top of your business activity. You can turn it off in your <a href="${appBase}/settings?tab=notifications" style="color:#10b981;text-decoration:none">notification settings</a>.</p>`;

  const preheaderParts: string[] = [];
  if (newLeadsCount > 0) preheaderParts.push(`${newLeadsCount} new lead${newLeadsCount !== 1 ? 's' : ''}`);
  if (data.orders.length > 0) preheaderParts.push(`${countWord} awaiting fulfilment`);
  const preheader = preheaderParts.join(' · ') || 'Your weekly business digest';

  const subjectParts: string[] = [];
  if (newLeadsCount > 0) subjectParts.push(`${newLeadsCount} new lead${newLeadsCount !== 1 ? 's' : ''}`);
  if (data.orders.length > 0) subjectParts.push(`${countWord} awaiting fulfilment`);
  const subject = `Weekly Digest: ${subjectParts.join(' · ') || 'Your business summary'}`;

  const html = wrapCustomerEmail(
    body,
    { businessName: data.businessName },
    { preheader }
  );

  return await sendEmail({
    to: data.wholesalerEmail,
    from: 'hello@quikpik.co',
    subject,
    html,
  });
}

export async function sendTrialReminderEmail(data: {
  wholesalerEmail: string;
  wholesalerName: string;
  daysRemaining: number;
  trialEndDate: Date;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge } = await import('./email-templates');

  const formattedDate = data.trialEndDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const urgencyColor = data.daysRemaining <= 3 ? '#dc2626' : '#d97706';
  const urgencyBg = data.daysRemaining <= 3 ? '#fef2f2' : '#fffbeb';
  const urgencyBorder = data.daysRemaining <= 3 ? '#fca5a5' : '#fcd34d';

  const featuresLost = [
    'Full product catalogue (limited to 2 products on free)',
    'Customer portal & online ordering',
    'Invoice & payment processing',
    'WhatsApp marketing & broadcasts',
    'Stock management & low-stock alerts',
    'Order history & business reports',
  ];

  const featureRows = featuresLost.map(f =>
    `<li style="padding:4px 0;color:#374151;font-size:14px">✓ ${f}</li>`
  ).join('');

  const body = `
    <p style="font-size:16px;margin:0 0 8px">Hi ${escapeHtml(data.wholesalerName)},</p>
    <p style="margin:0 0 20px">Your free 90-day trial is coming to an end. We wanted to give you a heads-up so you're not caught off guard.</p>
    ${emailCard(
      `${emailHeading(`Your trial ends in ${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'}`, { color: urgencyColor })}
      <p style="margin:0;font-size:15px;color:${urgencyColor}"><strong>Expiry date:</strong> ${formattedDate}</p>`,
      { borderColor: urgencyBorder, bgColor: urgencyBg }
    )}
    <p style="margin:16px 0 8px;font-weight:600;color:#1f2937">What you'll lose access to after your trial ends:</p>
    <ul style="margin:0 0 20px;padding-left:20px">${featureRows}</ul>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">To keep your store running smoothly, choose a plan before your trial expires. Plans start from just <strong>£29.99/month</strong>.</p>
    ${emailButton('View Subscription Plans', 'https://app.quikpik.co/settings/subscription', '#10b981')}
    ${emailCard(
      `<p style="margin:0;font-size:13px;color:#6b7280">After your trial ends your account reverts to the free tier — your data is safe and you can upgrade at any time, but order-taking and customer access will be restricted until you subscribe.</p>`,
      { borderColor: '#e5e7eb', bgColor: '#f9fafb' }
    )}
    <p style="margin:20px 0 0;font-size:14px;color:#6b7280">Questions? Reply to this email or visit <a href="https://quikpik.co" style="color:#10b981">quikpik.co</a> — we're happy to help.</p>
  `;

  const html = wrapCustomerEmail(body, {
    businessName: 'Quikpik Merchant',
  }, { preheader: `Your free trial ends in ${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} — don't lose access` });

  const subject = data.daysRemaining <= 3
    ? `⏰ ${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} left on your Quikpik trial`
    : `Your Quikpik free trial ends in ${data.daysRemaining} days`;

  return await sendEmail({
    to: data.wholesalerEmail,
    from: 'hello@quikpik.co',
    subject,
    html,
  });
}

export async function sendWholesalerSuspendedEmail(data: {
  wholesalerEmail: string;
  wholesalerName: string;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailHeading } = await import('./email-templates');

  const body = `
    <p style="font-size:16px;margin:0 0 8px">Hi ${escapeHtml(data.wholesalerName)},</p>
    <p style="margin:0 0 20px">We are writing to let you know that your Quikpik account has been <strong>suspended</strong> by the platform administrator.</p>
    ${emailCard(
      `${emailHeading('What this means', { color: '#dc2626', size: '16px' })}
      <p style="margin:0 0 8px;color:#92400e">While your account is suspended:</p>
      <ul style="margin:0;padding-left:20px;color:#92400e">
        <li style="margin-bottom:6px">You will not be able to log in to your Quikpik dashboard</li>
        <li style="margin-bottom:6px">Your customer-facing store will be inaccessible</li>
        <li style="margin-bottom:6px">Your data is safe and will be retained</li>
      </ul>`,
      { borderColor: '#fca5a5', bgColor: '#fef2f2' }
    )}
    <p style="margin:20px 0 8px">If you believe this is a mistake or would like to discuss your account, please get in touch with us at <a href="mailto:hello@quikpik.co" style="color:#10b981;text-decoration:none">hello@quikpik.co</a>.</p>
    <p style="margin:0 0 0;font-weight:600">The Quikpik Team</p>
  `;

  const html = wrapCustomerEmail(body, { businessName: 'Quikpik' }, { preheader: 'Your Quikpik account has been suspended — contact hello@quikpik.co for help' });

  return await sendEmail({
    to: data.wholesalerEmail,
    from: 'hello@quikpik.co',
    subject: 'Your Quikpik account has been suspended',
    html,
  });
}

export async function sendWholesalerReinstatedEmail(data: {
  wholesalerEmail: string;
  wholesalerName: string;
}): Promise<boolean> {
  const { wrapCustomerEmail, emailCard, emailButton, emailHeading } = await import('./email-templates');

  const body = `
    <p style="font-size:16px;margin:0 0 8px">Hi ${escapeHtml(data.wholesalerName)},</p>
    <p style="margin:0 0 20px">Great news — your Quikpik account has been <strong>reinstated</strong>. You now have full access to your dashboard and store again.</p>
    ${emailCard(
      `${emailHeading('Welcome back!', { color: '#10b981', size: '16px' })}
      <p style="margin:0;color:#0f766e">Everything is back to normal — your customers can place orders and your store is live again. Log in whenever you're ready to pick up where you left off.</p>`,
      { borderColor: '#a7f3d0', bgColor: '#ecfdf5' }
    )}
    ${emailButton('Go to your Dashboard', 'https://quikpik.co/dashboard', '#10b981')}
    <p style="margin:20px 0 8px">If you have any questions, feel free to reach out at <a href="mailto:hello@quikpik.co" style="color:#10b981;text-decoration:none">hello@quikpik.co</a>.</p>
    <p style="margin:0 0 0;font-weight:600">The Quikpik Team</p>
  `;

  const html = wrapCustomerEmail(body, { businessName: 'Quikpik' }, { preheader: 'Your Quikpik account is active again — welcome back!' });

  return await sendEmail({
    to: data.wholesalerEmail,
    from: 'hello@quikpik.co',
    subject: 'Your Quikpik account has been reinstated',
    html,
  });
}

export default { sendEmail, sendOrderConfirmationEmail, sendOrderPhotoNotificationEmail, sendWholesalerOrderNotification, sendPaymentReminderEmail, sendStripeVerifiedEmail, sendWeeklyOrderDigestEmail, sendWholesalerSuspendedEmail, sendWholesalerReinstatedEmail };