import { formatDeliveryAddress, formatDeliveryAddressHTML } from '../shared/utils/address-formatter';

function formatDeliveryAddressForEmail(address: string): string {
  if (!address) return '';
  return formatDeliveryAddressHTML(address);
}

function formatDeliveryAddressPlainText(address: string): string {
  if (!address) return '';
  const addressLines = formatDeliveryAddress(address);
  return addressLines.join('\n');
}

/**
 * Converts a stored wholesaler logo (which may be a base64 data URL) into a
 * publicly-servable URL suitable for use in emails.
 */
export function getEmailLogoUrl(
  wholesalerId: string | undefined | null,
  logoType: string | null | undefined,
  logoUrl: string | null | undefined
): string | undefined {
  if (!logoUrl) return undefined;
  if (logoType === 'custom' && wholesalerId) {
    return `https://quikpik.app/api/logo/${wholesalerId}`;
  }
  if (logoUrl.startsWith('http')) return logoUrl;
  return undefined;
}

export interface EmailBranding {
  businessName: string;
  logoUrl?: string | null;
  accentColor?: string;
}

function buildHeader(branding: EmailBranding): string {
  const hasHostedLogo = branding.logoUrl && branding.logoUrl.startsWith('http');
  const initials = branding.businessName
    .split(' ')
    .map((w: string) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  if (hasHostedLogo) {
    return '<div style="text-align:center;padding:24px 20px 16px">' +
      '<img src="' + branding.logoUrl + '" alt="' + branding.businessName + '" style="max-height:60px;max-width:180px;display:block;margin:0 auto">' +
      '<div style="margin-top:10px;font-size:18px;font-weight:bold;color:#1f2937">' + branding.businessName + '</div>' +
      '</div>';
  }
  return '<div style="text-align:center;padding:24px 20px 16px">' +
    '<div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:#10b981;line-height:56px;font-size:22px;font-weight:bold;color:#fff;text-align:center">' + initials + '</div>' +
    '<div style="margin-top:10px;font-size:18px;font-weight:bold;color:#1f2937">' + branding.businessName + '</div>' +
    '</div>';
}

export function wrapCustomerEmail(body: string, branding: EmailBranding, options?: { preheader?: string }): string {
  const ph = options?.preheader ? '<div style="display:none;max-height:0;overflow:hidden">' + options.preheader + '</div>' : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">' + ph +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:20px 10px">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px">' +
    '<tr><td style="border-bottom:1px solid #eee">' + buildHeader(branding) + '</td></tr>' +
    '<tr><td style="padding:20px 30px;font-size:15px;line-height:1.6;color:#374151">' + body + '</td></tr>' +
    '<tr><td style="padding:16px 30px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#aaa">' +
    'Questions? Contact <b>' + branding.businessName + '</b> directly.<br>' +
    '<span style="font-size:11px">Powered by <a href="https://quikpik.co" style="color:#aaa;text-decoration:none">Quikpik Merchant</a></span>' +
    '</td></tr></table></td></tr></table></body></html>';
}


export function emailButton(text: string, url: string, color?: string): string {
  const bg = color || '#10b981';
  return '<div style="text-align:center;margin:20px 0"><a href="' + url + '" style="display:inline-block;padding:12px 28px;background:' + bg + ';color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold">' + text + '</a></div>';
}

export function emailCard(content: string, options?: { borderColor?: string; bgColor?: string }): string {
  const border = options?.borderColor || '#e5e7eb';
  const bg = options?.bgColor || '#f9fafb';
  return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:8px;padding:16px 20px;margin:16px 0">' + content + '</div>';
}

export function emailDivider(): string {
  return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">';
}

export function emailHeading(text: string, options?: { color?: string; size?: string }): string {
  const color = options?.color || '#1f2937';
  const size = options?.size || '18px';
  return '<h2 style="margin:0 0 12px;font-size:' + size + ';font-weight:bold;color:' + color + '">' + text + '</h2>';
}

export function emailTable(headers: string[], rows: string[][]): string {
  const ths = headers.map((h, i) => {
    const align = i === 0 ? 'left' : i === headers.length - 1 ? 'right' : 'center';
    return '<th style="padding:8px;text-align:' + align + ';font-size:12px;color:#6b7280;border-bottom:2px solid #e5e7eb">' + h + '</th>';
  }).join('');
  const trs = rows.map(row => {
    const tds = row.map((cell, i) => {
      const align = i === 0 ? 'left' : i === row.length - 1 ? 'right' : 'center';
      return '<td style="padding:10px 8px;text-align:' + align + ';font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">' + cell + '</td>';
    }).join('');
    return '<tr>' + tds + '</tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
}

export function emailBadge(text: string, color?: string): string {
  const bg = color || '#10b981';
  return '<span style="display:inline-block;padding:3px 10px;background:' + bg + ';color:#fff;border-radius:12px;font-size:12px;font-weight:bold">' + text + '</span>';
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
    id?: string | null;
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    logoUrl?: string | null;
    logoType?: string | null;
  };
  orderDate: string;
  paymentMethod?: string;
}

export function generateWholesalerOrderNotificationEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const subject = 'New Order ' + data.orderNumber + ' - ' + data.customerName;

  let pickupHtml = '';
  if (data.fulfillmentType === 'pickup') {
    pickupHtml = emailCard('<p style="margin:0;color:#92400e"><b>Customer Collection</b> - Customer will collect from your business address.</p>', { borderColor: '#f59e0b', bgColor: '#fffbeb' });
  }

  const itemRows = data.items.map(item => {
    const promoNote = (item as any).appliedOfferLabel ? ' 🎁 ' + (item as any).appliedOfferLabel : '';
    const freeNote = (item as any).freeItems > 0 ? ' (+' + (item as any).freeItems + ' free)' : '';
    return [
      item.productName + promoNote + freeNote,
      item.quantity + ' ' + (item.sellingType === 'pallets' ? 'pallet(s)' : 'units'),
      '\u00A3' + item.unitPrice,
      '\u00A3' + item.total
    ];
  });

  const shippingRow = data.shippingTotal && parseFloat(data.shippingTotal) > 0
    ? '<tr><td style="padding:4px 0">Shipping:</td><td style="padding:4px 0;text-align:right">\u00A3' + data.shippingTotal + '</td></tr>' : '';

  const body = emailHeading('New Order Received', { size: '20px', color: '#10b981' }) +
    '<p style="margin:0 0 4px">Order <b>' + data.orderNumber + '</b></p>' +
    '<p style="margin:0 0 16px;font-size:14px;color:#6b7280">' + new Date(data.orderDate).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</p>' +
    emailCard(
      '<p style="margin:0 0 4px"><b>Customer:</b> ' + data.customerName + '</p>' +
      '<p style="margin:0 0 4px"><b>Email:</b> ' + data.customerEmail + '</p>' +
      '<p style="margin:0 0 4px"><b>Phone:</b> ' + data.customerPhone + '</p>' +
      '<p style="margin:0 0 4px"><b>Fulfillment:</b> ' + (data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery') + '</p>' +
      (data.shippingAddress ? '<p style="margin:0"><b>Address:</b> ' + data.shippingAddress + '</p>' : ''),
      { borderColor: '#dbeafe', bgColor: '#eff6ff' }
    ) +
    pickupHtml +
    emailTable(['Product', 'Qty', 'Price', 'Total'], itemRows) +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0">' +
    '<tr><td style="padding:4px 0"><b>Subtotal:</b></td><td style="padding:4px 0;text-align:right">\u00A3' + data.subtotal + '</td></tr>' +
    shippingRow +
    '<tr><td style="padding:4px 0">Platform Fee (3.3%):</td><td style="padding:4px 0;text-align:right">-\u00A3' + (data.wholesalerPlatformFee || data.platformFee || '0.00') + '</td></tr>' +
    '<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">You receive:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">\u00A3' + (parseFloat(data.subtotal) + parseFloat(data.shippingTotal || '0') - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2) + '</td></tr>' +
    '</table>' +
    emailButton('View Orders', 'https://quikpik.co/orders');

  const html = wrapCustomerEmail(body, {
    businessName: data.wholesaler.businessName,
    logoUrl: getEmailLogoUrl(data.wholesaler.id, data.wholesaler.logoType, data.wholesaler.logoUrl),
  }, { preheader: 'New order ' + data.orderNumber + ' from ' + data.customerName + ' - \u00A3' + data.total });

  const text = 'New Order ' + data.orderNumber + ' - ' + data.customerName + '\n\n' +
    'Order Date: ' + new Date(data.orderDate).toLocaleString('en-GB') + '\n' +
    'Total: \u00A3' + data.total + '\n' +
    'Fulfillment: ' + (data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery') + '\n\n' +
    'Customer: ' + data.customerName + '\nEmail: ' + data.customerEmail + '\nPhone: ' + data.customerPhone + '\n' +
    (data.shippingAddress ? 'Address: ' + data.shippingAddress + '\n' : '') + '\n' +
    'Items:\n' + data.items.map(item => '- ' + item.productName + ' x ' + item.quantity + ' @ \u00A3' + item.unitPrice + ' = \u00A3' + item.total).join('\n') + '\n\n' +
    'Subtotal: \u00A3' + data.subtotal + '\n' +
    (data.shippingTotal && parseFloat(data.shippingTotal) > 0 ? 'Shipping: \u00A3' + data.shippingTotal + '\n' : '') +
    'Platform Fee (3.3%): -\u00A3' + (data.wholesalerPlatformFee || data.platformFee || '0.00') + '\n' +
    'You receive: \u00A3' + (parseFloat(data.subtotal) + parseFloat(data.shippingTotal || '0') - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2) + '\n\n' +
    'View orders: https://quikpik.co/orders\nPowered by Quikpik';

  return { subject, html, text };
}

export function generateReadyForCollectionEmail(data: ReadyForCollectionEmailData): { subject: string; html: string; text: string } {
  const subject = 'Your Order ' + data.orderNumber + ' is Ready for Collection';

  const body = '<div style="text-align:center;margin-bottom:16px">' + emailBadge('READY TO COLLECT', '#059669') + '</div>' +
    '<p style="margin:0 0 16px">Dear ' + data.customerName + ', your order is ready for collection.</p>' +
    emailCard(
      '<p style="margin:0 0 4px"><b>Order:</b> ' + data.orderNumber + '</p>' +
      '<p style="margin:0 0 4px"><b>Total:</b> <span style="color:#10b981;font-weight:bold">\u00A3' + parseFloat(data.orderTotal).toFixed(2) + '</span></p>' +
      '<p style="margin:0"><b>Ready Since:</b> ' + data.readyTime + '</p>'
    ) +
    emailCard(
      '<p style="margin:0 0 4px"><b>Collect From:</b> ' + data.wholesalerName + '</p>' +
      (data.businessAddress ? '<p style="margin:0 0 4px"><b>Address:</b> ' + data.businessAddress + '</p>' : '') +
      (data.businessPhone ? '<p style="margin:0"><b>Phone:</b> <a href="tel:' + data.businessPhone + '" style="color:#10b981">' + data.businessPhone + '</a></p>' : ''),
      { borderColor: '#dbeafe', bgColor: '#eff6ff' }
    ) +
    '<p style="margin:12px 0;font-size:14px;color:#6b7280">Please contact ' + data.wholesalerName + ' to arrange a collection time.</p>' +
    emailButton('View Order', data.orderUrl);

  const html = wrapCustomerEmail(body, {
    businessName: data.wholesalerName,
    logoUrl: data.wholesalerLogoUrl,
  }, { preheader: 'Order ' + data.orderNumber + ' is ready for collection' });

  const text = 'Order ' + data.orderNumber + ' Ready for Collection\n\n' +
    'Dear ' + data.customerName + ',\n\nYour order is ready for collection.\n\n' +
    'Ready Since: ' + data.readyTime + '\nOrder Total: \u00A3' + parseFloat(data.orderTotal).toFixed(2) + '\n' +
    'Collect From: ' + data.wholesalerName + '\n' +
    (data.businessAddress ? 'Address: ' + data.businessAddress + '\n' : '') +
    (data.businessPhone ? 'Phone: ' + data.businessPhone + '\n' : '') +
    '\nPlease contact ' + data.wholesalerName + ' to arrange a collection time.\n\n' +
    'View Order: ' + data.orderUrl + '\nPowered by Quikpik';

  return { subject, html, text };
}