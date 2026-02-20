// Email templates for Quikpik platform notifications

import { formatDeliveryAddress, formatDeliveryAddressHTML } from '../shared/utils/address-formatter';

// Helper function to format delivery address for HTML emails
function formatDeliveryAddressForEmail(address: string): string {
  if (!address) return '';
  return formatDeliveryAddressHTML(address);
}

// Helper function to format delivery address for plain text emails
function formatDeliveryAddressPlainText(address: string): string {
  if (!address) return '';
  const addressLines = formatDeliveryAddress(address);
  return addressLines.join('\n');
}

export interface EmailBranding {
  businessName: string;
  logoUrl?: string | null;
  accentColor?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function buildLogoBlock(branding: EmailBranding): string {
  if (branding.logoUrl) {
    return `<img src="${branding.logoUrl}" alt="${branding.businessName}" style="max-height:56px;max-width:180px;object-fit:contain">`;
  }
  return '';
}

function minifyHtml(html: string): string {
  return html
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/<!--(?!\[if).*?-->/g, '');
}

const F = "font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif";

export function wrapCustomerEmail(body: string, branding: EmailBranding, options?: { preheader?: string }): string {
  const preheader = options?.preheader || '';
  const raw = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${branding.businessName}</title></head><body style="margin:0;padding:0;background:#f4f5f7">${preheader ? `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</div>` : ''}<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:32px 16px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #f0f0f0">${buildLogoBlock(branding)}<p style="margin:12px 0 0;${F};font-size:20px;font-weight:700;color:#1f2937">${branding.businessName}</p></td></tr><tr><td style="padding:32px 40px;${F};font-size:15px;line-height:1.65;color:#374151">${body}</td></tr><tr><td style="padding:24px 40px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;${F}"><p style="margin:0 0 6px;font-size:13px;color:#9ca3af">Questions? Contact <strong style="color:#6b7280">${branding.businessName}</strong> directly.</p><p style="margin:16px 0 0;font-size:11px;color:#d1d5db">Powered by <a href="https://quikpik.co" style="color:#d1d5db;text-decoration:none;font-weight:600">Quikpik Merchant</a></p></td></tr></table></td></tr></table></body></html>`;
  return minifyHtml(raw);
}

export function wrapPlatformEmail(body: string, options?: { preheader?: string }): string {
  const preheader = options?.preheader || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Quikpik</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <!-- Quikpik Header -->
          <tr>
            <td style="padding: 28px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); text-align: center;">
              <p style="margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Quikpik</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 40px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; line-height: 1.65; color: #374151;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px 40px; background-color: #fafafa; border-top: 1px solid #f0f0f0; text-align: center; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #9ca3af;">Manage your business at <a href="https://quikpik.co" style="color: #10b981; text-decoration: none; font-weight: 600;">quikpik.co</a></p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #d1d5db;">This is an automated notification. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailButton(text: string, url: string, color?: string): string {
  const bg = color || '#10b981';
  return `<div style="text-align:center;margin:28px 0"><a href="${url}" style="display:inline-block;padding:14px 32px;background:${bg};color:#fff;text-decoration:none;border-radius:8px;${F};font-size:15px;font-weight:600" target="_blank">${text}</a></div>`;
}

export function emailCard(content: string, options?: { borderColor?: string; bgColor?: string }): string {
  const border = options?.borderColor || '#e5e7eb';
  const bg = options?.bgColor || '#f9fafb';
  return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:20px 24px;margin:20px 0">${content}</div>`;
}

export function emailDivider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">`;
}

export function emailHeading(text: string, options?: { color?: string; size?: string }): string {
  const color = options?.color || '#1f2937';
  const size = options?.size || '18px';
  return `<h2 style="margin:0 0 16px;font-size:${size};font-weight:700;color:${color};${F}">${text}</h2>`;
}

export function emailTable(headers: string[], rows: string[][]): string {
  const headerHtml = headers.map((h, i) => {
    const align = i === 0 ? 'left' : i === headers.length - 1 ? 'right' : 'center';
    return `<th style="padding:10px 12px;text-align:${align};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb">${h}</th>`;
  }).join('');
  const rowsHtml = rows.map(row => {
    const cells = row.map((cell, i) => {
      const align = i === 0 ? 'left' : i === row.length - 1 ? 'right' : 'center';
      const weight = i === 0 || i === row.length - 1 ? 'font-weight:600;' : '';
      return `<td style="padding:12px;text-align:${align};font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;${weight}">${cell}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

export function emailBadge(text: string, color?: string): string {
  const bg = color || '#10b981';
  return `<span style="display:inline-block;padding:4px 12px;background:${bg};color:#fff;border-radius:20px;font-size:12px;font-weight:600">${text}</span>`;
}

export interface ReadyForCollectionEmailData {
  orderNumber: string;
  customerName: string;
  wholesalerName: string;
  wholesalerLogoUrl?: string | null;
  businessPhone?: string;
  businessAddress?: string;
  orderTotal: string;
  readyTime: string;
  orderUrl: string;
}

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress?: string;
  total: string;
  subtotal: string;
  platformFee: string;
  customerTransactionFee: string;
  wholesalerPlatformFee: string;
  shippingTotal?: string;
  fulfillmentType: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: string;
    total: string;
    sellingType?: string;
  }>;
  wholesaler: {
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    logoUrl?: string | null;
  };
  orderDate: string;
  paymentMethod?: string;
}

export function generateWholesalerOrderNotificationEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const subject = `New Order ${data.orderNumber} - ${data.customerName}`;

  let pickupCollectionHtml = '';
  if (data.fulfillmentType === 'pickup') {
    pickupCollectionHtml = emailCard(`<p style="margin:0 0 4px;font-weight:600;color:#92400e">Customer Collection</p><p style="margin:0;color:#92400e;font-size:14px">Customer will collect from your business address. Please ensure the order is ready and contact the customer to arrange a suitable time.</p>`, { borderColor: '#f59e0b', bgColor: '#fffbeb' });
  }

  const body = `${emailHeading('New Order Received', { size: '22px', color: '#10b981' })}<p style="margin:0 0 4px">Order <strong>${data.orderNumber}</strong></p><p style="margin:0 0 20px;font-size:14px;color:#6b7280">${new Date(data.orderDate).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>${emailCard(`${emailHeading('Customer Information', { size: '16px' })}<p style="margin:0 0 6px"><strong>Name:</strong> ${data.customerName}</p><p style="margin:0 0 6px"><strong>Email:</strong> <a href="mailto:${data.customerEmail}" style="color:#10b981;text-decoration:none">${data.customerEmail}</a></p><p style="margin:0 0 6px"><strong>Phone:</strong> <a href="tel:${data.customerPhone}" style="color:#10b981;text-decoration:none">${data.customerPhone}</a></p><p style="margin:0 0 6px"><strong>Fulfillment:</strong> ${emailBadge(data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery Required', data.fulfillmentType === 'pickup' ? '#10b981' : '#3b82f6')}</p>${data.shippingAddress ? `<p style="margin:0 0 6px"><strong>Delivery Address:</strong> ${data.shippingAddress}</p>` : data.fulfillmentType === 'delivery' ? `<p style="margin:0 0 6px"><strong>Delivery Address:</strong> Address to be confirmed</p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}${pickupCollectionHtml}${emailTable(['Product', 'Quantity', 'Unit Price', 'Total'], data.items.map(item => [item.productName, `${item.quantity} ${item.sellingType === 'pallets' ? 'pallet(s)' : 'units'}`, `£${item.unitPrice}`, `£${item.total}`]))}${emailCard(`${emailHeading('Payment Breakdown', { size: '16px', color: '#d97706' })}<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0"><strong>Product Subtotal:</strong></td><td style="padding:6px 0;text-align:right">£${data.subtotal}</td></tr>${data.shippingTotal && parseFloat(data.shippingTotal) > 0 ? `<tr><td style="padding:6px 0">Shipping:</td><td style="padding:6px 0;text-align:right">£${data.shippingTotal}</td></tr>` : ''}</table>${emailDivider()}<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Platform Fee (3.3%):</td><td style="padding:6px 0;text-align:right;color:#6b7280;font-size:14px">-£${data.wholesalerPlatformFee || data.platformFee || '0.00'}</td></tr><tr style="border-top:2px solid #10b981"><td style="padding:10px 0 4px;font-weight:700;color:#059669">You will receive:</td><td style="padding:10px 0 4px;text-align:right;font-weight:700;color:#059669;font-size:17px">£${(parseFloat(data.subtotal) - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2)}</td></tr></table><p style="margin:4px 0 0;font-size:12px;color:#6b7280">96.7% of product value</p>`, { borderColor: '#fde68a', bgColor: '#fffbeb' })}${emailCard(`${emailHeading('Next Steps', { size: '16px', color: '#0369a1' })}<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px"><li style="margin-bottom:6px">Review the order details in your Quikpik dashboard</li><li style="margin-bottom:6px">Prepare the items for ${data.fulfillmentType === 'pickup' ? 'customer pickup' : 'delivery'}</li><li style="margin-bottom:6px"><strong>When contacting the customer, always quote reference: ${data.orderNumber}</strong></li><li>Mark the order as fulfilled when ready</li></ul>`, { borderColor: '#bae6fd', bgColor: '#f0f9ff' })}${emailButton('View Order Details', 'https://quikpik.co/orders')}`;

  const html = wrapCustomerEmail(body, {
    businessName: data.wholesaler.businessName,
    logoUrl: data.wholesaler.logoUrl,
  }, { preheader: `New order ${data.orderNumber} from ${data.customerName} - £${data.total}` });

  const text = `New Order ${data.orderNumber} - ${data.customerName}

Order Date: ${new Date(data.orderDate).toLocaleString('en-GB')}
Total Value: £${data.total}
Fulfillment: ${data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery Required'}

Customer: ${data.customerName}
Email: ${data.customerEmail}
Phone: ${data.customerPhone}
${data.shippingAddress ? `Delivery Address: ${data.shippingAddress}` : data.fulfillmentType === 'delivery' ? 'Delivery Address: Address to be confirmed' : ''}

Order Items:
${data.items.map(item => `- ${item.productName} x ${item.quantity} ${item.sellingType === 'pallets' ? 'pallet(s)' : 'units'} @ £${item.unitPrice} = £${item.total}`).join('\n')}

Subtotal: £${data.subtotal}
${data.shippingTotal && parseFloat(data.shippingTotal) > 0 ? `Shipping: £${data.shippingTotal}` : ''}
Platform Fee (3.3%): -£${data.wholesalerPlatformFee || data.platformFee || '0.00'}
You will receive: £${(parseFloat(data.subtotal) - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2)}

View orders: https://quikpik.co/orders
Powered by Quikpik`;

  return { subject, html, text };
}

export function generateReadyForCollectionEmail(data: ReadyForCollectionEmailData): { subject: string; html: string; text: string } {
  const subject = `Your Order ${data.orderNumber} is Ready for Collection`;

  const body = `<div style="text-align:center;margin-bottom:24px">${emailBadge('READY TO COLLECT', '#059669')}</div><p style="font-size:16px;margin:0 0 8px">Dear ${data.customerName},</p><p style="margin:0 0 20px">Great news! Your order is now ready for collection.</p>${emailCard(`${emailHeading('Collection Information', { size: '16px' })}<p style="margin:0 0 6px"><strong>Ready Since:</strong> ${data.readyTime}</p><p style="margin:0 0 6px"><strong>Order Total:</strong> <span style="color:#10b981;font-weight:700;font-size:17px">£${parseFloat(data.orderTotal).toFixed(2)}</span></p>`)}${emailCard(`${emailHeading('Collection Details', { size: '16px', color: '#1e40af' })}<p style="margin:0 0 6px"><strong>Collect From:</strong> ${data.wholesalerName}</p>${data.businessAddress ? `<p style="margin:0 0 6px"><strong>Address:</strong> ${data.businessAddress}</p>` : ''}${data.businessPhone ? `<p style="margin:0 0 6px"><strong>Phone:</strong> <a href="tel:${data.businessPhone}" style="color:#10b981;text-decoration:none">${data.businessPhone}</a></p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}${emailCard(`<p style="margin:0;color:#1e40af;font-size:14px"><strong>Important:</strong> Please contact ${data.wholesalerName} to arrange a suitable collection time before arriving.</p>`, { borderColor: '#93c5fd', bgColor: '#dbeafe' })}${emailCard(`${emailHeading('Order Summary', { size: '16px' })}<p style="margin:0 0 6px"><strong>Order Number:</strong> ${data.orderNumber}</p><p style="margin:0 0 6px"><strong>Order Value:</strong> £${parseFloat(data.orderTotal).toFixed(2)}</p><p style="margin:0"><strong>Collection Method:</strong> Customer Collection</p>`)}${emailButton('View Order Details', data.orderUrl)}${data.businessPhone ? emailButton('Call Business', `tel:${data.businessPhone}`, '#3b82f6') : ''}${emailCard(`${emailHeading('Next Steps', { size: '16px' })}<ol style="margin:0;padding-left:20px;color:#374151;font-size:14px"><li style="margin-bottom:6px">Contact ${data.wholesalerName} to arrange collection time</li><li style="margin-bottom:6px">Bring a copy of this email or your order number</li><li>Collect your order during business hours</li></ol>`)}`;

  const html = wrapCustomerEmail(body, {
    businessName: data.wholesalerName,
    logoUrl: data.wholesalerLogoUrl,
  }, { preheader: `Order ${data.orderNumber} is ready for collection from ${data.wholesalerName}` });

  const text = `Order ${data.orderNumber} Ready for Collection

Dear ${data.customerName},

Great news! Your order from ${data.wholesalerName} is now ready for collection.

Ready Since: ${data.readyTime}
Order Total: £${parseFloat(data.orderTotal).toFixed(2)}
Collect From: ${data.wholesalerName}
${data.businessAddress ? `Address: ${data.businessAddress}` : ''}
${data.businessPhone ? `Phone: ${data.businessPhone}` : ''}

Important: Please contact ${data.wholesalerName} to arrange a suitable collection time before arriving.

Next Steps:
1. Contact ${data.wholesalerName} to arrange collection time
2. Bring a copy of this email or your order number
3. Collect your order during business hours

View Order Details: ${data.orderUrl}

Powered by Quikpik`;

  return { subject, html, text };
}