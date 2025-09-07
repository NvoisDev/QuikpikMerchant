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

export interface ReadyForCollectionEmailData {
  orderNumber: string;
  customerName: string;
  wholesalerName: string;
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
  // Individual address components for reliable display
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
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
  };
  orderDate: string;
  paymentMethod?: string;
}

export function generateWholesalerOrderNotificationEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const subject = `New Order ${data.orderNumber} - ${data.customerName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Order Notification</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; margin-top: 20px; margin-bottom: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px; }
        .order-summary { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        .customer-info { background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table th, .items-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .items-table th { background-color: #f9fafb; font-weight: bold; }
        .total-section { background-color: #fef3e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        .action-buttons { text-align: center; margin: 30px 0; }
        .btn { display: inline-block; padding: 12px 24px; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 10px; }
        .btn-primary { background-color: #10b981; }
        .btn-secondary { background-color: #3b82f6; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
        .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .badge { display: inline-block; padding: 4px 8px; background-color: rgba(16, 185, 129, 0.1); color: #059669; border-radius: 4px; font-size: 12px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Quikpik</div>
            <h1 style="margin: 0; font-size: 24px;">🎉 New Order Received!</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Order #${data.orderNumber}</p>
        </div>

        <div class="order-summary">
            <h2 style="margin-top: 0; color: #059669;">📦 Order Summary</h2>
            <p><strong>Wholesale Reference:</strong> <span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${data.orderNumber}</span></p>
            <p><strong>Order Date:</strong> ${new Date(data.orderDate).toLocaleString('en-GB', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit' 
            })}</p>
            <p><strong>Total Value:</strong> <span style="color: #059669; font-weight: bold; font-size: 18px;">£${data.total}</span></p>
            <p><strong>Fulfillment:</strong> <span class="badge">${data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery Required'}</span></p>
        </div>

        <div class="customer-info">
            <h2 style="margin-top: 0; color: #1d4ed8;">👤 Customer Information</h2>
            <p><strong>Name:</strong> ${data.customerName}</p>
            <p><strong>Email:</strong> <a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>
            <p><strong>Phone:</strong> <a href="tel:${data.customerPhone}">${data.customerPhone}</a></p>
            ${(data.addressLine1 || data.city) ? `
              <p><strong>Delivery Address:</strong></p>
              <div style="margin-left: 20px; line-height: 1.5;">
                ${data.addressLine1 ? `${data.addressLine1}<br>` : ''}
                ${data.addressLine2 ? `${data.addressLine2}<br>` : ''}
                ${data.city ? `${data.city}` : ''}
                ${data.state ? `, ${data.state}` : ''}<br>
                ${data.postalCode ? `${data.postalCode}<br>` : ''}
                ${data.country ? `${data.country}` : ''}
              </div>
            ` : data.fulfillmentType === 'delivery' ? `<p><strong>Delivery Address:</strong> Address to be confirmed</p>` : ''}
        </div>

        <h2 style="color: #374151;">🛍️ Order Items</h2>
        <table class="items-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${data.items.map(item => `
                <tr>
                    <td><strong>${item.productName}</strong></td>
                    <td>${item.quantity} ${item.sellingType === 'pallets' ? 'pallet(s)' : 'units'}</td>
                    <td>£${item.unitPrice}</td>
                    <td><strong>£${item.total}</strong></td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="total-section">
            <h2 style="margin-top: 0; color: #d97706;">💰 Payment Breakdown</h2>
            <p><strong>Product Subtotal:</strong> £${data.subtotal}</p>
            ${data.shippingTotal && parseFloat(data.shippingTotal) > 0 ? `<p><strong>Shipping:</strong> £${data.shippingTotal}</p>` : ''}

            <hr style="margin: 15px 0; border: none; border-top: 2px solid #f59e0b;">
            <p style="font-size: 18px;"><strong>Total Paid by Customer:</strong> <span style="color: #d97706; font-weight: bold;">£${data.total}</span></p>
            <div style="margin-top: 15px; padding: 15px; background-color: rgba(16, 185, 129, 0.1); border-radius: 6px; border-left: 4px solid #10b981;">
                <h3 style="margin: 0 0 8px 0; color: #059669;">💰 Your Earnings</h3>
                <p><strong>Platform Fee (3.3%):</strong> -£${data.wholesalerPlatformFee || data.platformFee || '0.00'}</p>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #059669;">
                <p style="color: #059669; font-weight: bold;">You will receive: £${(parseFloat(data.subtotal) - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2)} (96.7% of product value)</p>
            </div>
        </div>

        <div class="action-buttons">
            <a href="https://quikpik.app/orders" class="btn btn-primary">View Order Details</a>
            <a href="https://quikpik.app/customers" class="btn btn-secondary">Manage Customers</a>
        </div>

        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
            <h3 style="margin-top: 0; color: #0369a1;">📱 Next Steps</h3>
            <ul style="margin: 0; padding-left: 20px;">
                <li>Review the order details in your Quikpik dashboard</li>
                <li>Prepare the items for ${data.fulfillmentType === 'pickup' ? 'customer pickup' : 'delivery'}</li>
                <li><strong>When contacting the customer, always quote reference: ${data.orderNumber}</strong></li>
                <li>Mark the order as fulfilled when ready</li>
            </ul>
        </div>

        <div class="footer">
            <p><strong>Quikpik</strong> - Your B2B Wholesale Platform</p>
            <p>Manage your business at <a href="https://quikpik.app">quikpik.app</a></p>
            <p style="font-size: 12px; margin-top: 10px;">This is an automated notification. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
  `;

  const text = `
New Order Notification - Quikpik

🎉 NEW ORDER RECEIVED!
Order #${data.orderNumber}

📦 ORDER SUMMARY
Order Number: ${data.orderNumber}
Order Date: ${new Date(data.orderDate).toLocaleString('en-GB')}
Total Value: £${data.total}
Fulfillment: ${data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery Required'}

👤 CUSTOMER INFORMATION
Name: ${data.customerName}
Email: ${data.customerEmail}
Phone: ${data.customerPhone}
${(data.addressLine1 || data.city) ? `Delivery Address:\n${[data.addressLine1, data.addressLine2, data.city + (data.state ? `, ${data.state}` : ''), data.postalCode, data.country].filter(Boolean).join('\n')}` : data.fulfillmentType === 'delivery' ? `Delivery Address: Address to be confirmed` : ''}

🛍️ ORDER ITEMS
${data.items.map(item => `• ${item.productName} - Qty: ${item.quantity} ${item.sellingType === 'pallets' ? 'pallet(s)' : 'units'} - £${item.unitPrice} each - Total: £${item.total}`).join('\n')}

💰 PAYMENT BREAKDOWN
Product Subtotal: £${data.subtotal}
${data.shippingTotal && parseFloat(data.shippingTotal) > 0 ? `Shipping: £${data.shippingTotal}` : ''}
Total Paid by Customer: £${data.total}

💰 YOUR EARNINGS
Platform Fee (3.3%): £${data.wholesalerPlatformFee || data.platformFee || '0.00'} (deducted)
You will receive: £${(parseFloat(data.subtotal) - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2)} (96.7% of product value)

📱 NEXT STEPS
1. Review the order details in your Quikpik dashboard
2. Prepare the items for ${data.fulfillmentType === 'pickup' ? 'customer pickup' : 'delivery'}
3. Contact the customer if you have any questions
4. Mark the order as fulfilled when ready

View your orders: https://quikpik.app/orders
Manage customers: https://quikpik.app/customers

---
Quikpik - Your B2B Wholesale Platform
Manage your business at quikpik.app

This is an automated notification. Please do not reply to this email.
  `;

  return { subject, html, text };
}

export function generateReadyForCollectionEmail(data: ReadyForCollectionEmailData): { subject: string; html: string; text: string } {
  const subject = `📦 Your Order ${data.orderNumber} is Ready for Collection!`;

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Ready for Collection</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; margin-top: 20px; margin-bottom: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px; }
        .collection-info { background-color: #fef3e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        .order-details { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        .contact-info { background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
        .action-buttons { text-align: center; margin: 30px 0; }
        .btn { display: inline-block; padding: 12px 24px; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 10px; }
        .btn-primary { background-color: #f59e0b; }
        .btn-secondary { background-color: #3b82f6; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
        .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .ready-badge { display: inline-block; padding: 8px 16px; background-color: #059669; color: white; border-radius: 20px; font-size: 14px; font-weight: bold; margin: 10px 0; }
        .highlight { color: #f59e0b; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Quikpik</div>
            <h1 style="margin: 0; font-size: 24px;">📦 Order Ready for Collection!</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Order #${data.orderNumber}</p>
            <div class="ready-badge">✅ READY TO COLLECT</div>
        </div>

        <div class="collection-info">
            <h2 style="margin-top: 0; color: #d97706;">🚛 Collection Information</h2>
            <p><strong>Hello ${data.customerName},</strong></p>
            <p>Great news! Your order from <strong>${data.wholesalerName}</strong> is now ready for collection.</p>
            <p><strong>Ready Since:</strong> <span class="highlight">${data.readyTime}</span></p>
            <p><strong>Order Total:</strong> <span class="highlight">£${parseFloat(data.orderTotal).toFixed(2)}</span></p>
        </div>

        <div class="contact-info">
            <h3 style="margin-top: 0; color: #1e40af;">📍 Collection Details</h3>
            <p><strong>Collect From:</strong> ${data.wholesalerName}</p>
            ${data.businessAddress ? `<p><strong>Address:</strong> ${data.businessAddress}</p>` : ''}
            ${data.businessPhone ? `<p><strong>Phone:</strong> <a href="tel:${data.businessPhone}" style="color: #3b82f6; text-decoration: none;">${data.businessPhone}</a></p>` : ''}
            <p style="margin-top: 15px; padding: 15px; background-color: #dbeafe; border-radius: 8px; color: #1e40af;">
                <strong>⚠️ Important:</strong> Please contact ${data.wholesalerName} to arrange a suitable collection time before arriving.
            </p>
        </div>

        <div class="order-details">
            <h3 style="margin-top: 0; color: #059669;">📋 Order Summary</h3>
            <p><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p><strong>Order Value:</strong> £${parseFloat(data.orderTotal).toFixed(2)}</p>
            <p><strong>Collection Method:</strong> Customer Collection</p>
        </div>

        <div class="action-buttons">
            <a href="${data.orderUrl}" class="btn btn-primary">View Order Details</a>
            ${data.businessPhone ? `<a href="tel:${data.businessPhone}" class="btn btn-secondary">Call Business</a>` : ''}
        </div>

        <div class="footer">
            <p><strong>Next Steps:</strong></p>
            <p>1. Contact ${data.wholesalerName} to arrange collection time<br/>
            2. Bring a copy of this email or your order number<br/>
            3. Collect your order during business hours</p>
            
            <p style="margin-top: 20px;">
                <strong>Quikpik - Your B2B Wholesale Platform</strong><br/>
                <a href="https://quikpik.app" style="color: #3b82f6;">quikpik.app</a>
            </p>
            <p style="font-size: 12px; color: #9ca3af;">
                This is an automated notification. Please do not reply to this email.
            </p>
        </div>
    </div>
</body>
</html>
  `;

  const text = `
📦 Order Ready for Collection!
Order #${data.orderNumber}

Hello ${data.customerName},

Great news! Your order from ${data.wholesalerName} is now ready for collection.

COLLECTION DETAILS:
- Ready Since: ${data.readyTime}
- Order Total: £${parseFloat(data.orderTotal).toFixed(2)}
- Collect From: ${data.wholesalerName}
${data.businessAddress ? `- Address: ${data.businessAddress}` : ''}
${data.businessPhone ? `- Phone: ${data.businessPhone}` : ''}

IMPORTANT: Please contact ${data.wholesalerName} to arrange a suitable collection time before arriving.

Next Steps:
1. Contact ${data.wholesalerName} to arrange collection time
2. Bring a copy of this email or your order number
3. Collect your order during business hours

View Order Details: ${data.orderUrl}
${data.businessPhone ? `Call Business: ${data.businessPhone}` : ''}

---
Quikpik - Your B2B Wholesale Platform
Manage your orders at quikpik.app

This is an automated notification. Please do not reply to this email.
  `;

  return { subject, html, text };
}