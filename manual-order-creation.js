/**
 * Manual Order Creation Script
 * Creates order #321935 manually since the automated process failed
 */

import { writeFileSync } from 'fs';

// Order data from the payment success screenshot
const orderData = {
  id: 321935,
  orderNumber: 'LF-321935', // Using your business prefix
  wholesalerId: 'user_1753872669912_ju8li63m1', // Lanre Foods
  customerName: 'Test Customer',
  customerEmail: 'mogunjemilua@gmail.com',
  customerPhone: '+447507659550',
  subtotal: '3.00',
  transactionFee: '0.67',
  deliveryCost: '15.30',
  total: '18.96',
  fulfillmentType: 'delivery',
  deliveryCarrier: 'Royal Mail 48',
  status: 'paid',
  createdAt: new Date().toISOString(),
  items: [
    {
      productName: 'Pounded Yam',
      quantity: 3,
      unitPrice: '1.00',
      total: '3.00'
    }
  ]
};

console.log('📝 Order Data to be Created:');
console.log('Order Number:', orderData.orderNumber);
console.log('Total Amount:', orderData.total);
console.log('Customer:', orderData.customerName);
console.log('Fulfillment:', orderData.fulfillmentType);
console.log('Items:', orderData.items.length);

// Save order data for manual insertion
writeFileSync('order-321935-data.json', JSON.stringify(orderData, null, 2));
console.log('✅ Order data saved to order-321935-data.json');

export default orderData;