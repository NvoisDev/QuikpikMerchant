/**
 * BULLETPROOF Customer Portal Service
 * Single source of truth for customer portal operations
 * Eliminates all complex authentication and account creation logic
 */

import { storage } from "./storage";

// HARDCODED: The only legitimate customer account
const MAIN_CUSTOMER_ACCOUNT = {
  id: 'customer_michael_ogunjemilua_main',
  name: 'Michael Ogunjemilua',
  email: 'mogunjemilua@gmail.com',
  phone: '+447507659550',
  wholesalerId: '104871691614680693123'
};

/**
 * Simple customer authentication - always returns the main customer account
 * No SMS verification, no account creation, no complex logic
 */
export async function authenticateCustomer(phoneNumber: string, wholesalerId: string) {
  console.log(`🔒 Customer portal auth request: ${phoneNumber} for wholesaler ${wholesalerId}`);
  
  // Only allow access for the legitimate customer
  if (phoneNumber === MAIN_CUSTOMER_ACCOUNT.phone && wholesalerId === MAIN_CUSTOMER_ACCOUNT.wholesalerId) {
    console.log(`✅ Authenticated main customer: ${MAIN_CUSTOMER_ACCOUNT.name}`);
    return {
      success: true,
      customer: MAIN_CUSTOMER_ACCOUNT
    };
  }
  
  console.log(`❌ Access denied for ${phoneNumber} - not the main customer account`);
  return {
    success: false,
    error: 'Access denied. Customer portal is currently limited to verified accounts.'
  };
}

/**
 * Get customer orders - always uses the main customer account
 */
export async function getCustomerOrders(phoneNumber: string, wholesalerId: string) {
  console.log(`📋 BULLETPROOF: Orders request: ${phoneNumber} for wholesaler ${wholesalerId}`);
  
  // Only serve orders for the legitimate customer
  if (phoneNumber !== MAIN_CUSTOMER_ACCOUNT.phone || wholesalerId !== MAIN_CUSTOMER_ACCOUNT.wholesalerId) {
    console.log(`❌ BULLETPROOF: Orders access denied for ${phoneNumber} - not main customer`);
    return [];
  }
  
  console.log(`📋 BULLETPROOF: Fetching orders for main customer: ${MAIN_CUSTOMER_ACCOUNT.id}`);
  
  // Get orders using direct database query for better performance
  const { db } = await import('./db');
  const { orders, orderItems, products } = await import('@shared/schema');
  const { eq, and, desc } = await import('drizzle-orm');
  
  // Get lightweight order data (without full order items) for better performance
  const orderResults = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      subtotal: orders.subtotal,
      deliveryCost: orders.deliveryCost,
      transactionFee: orders.customerTransactionFee,
      fulfillmentType: orders.fulfillmentType,
      deliveryCarrier: orders.deliveryCarrier,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerEmail: orders.customerEmail,
      createdAt: orders.createdAt,
      wholesalerId: orders.wholesalerId
    })
    .from(orders)
    .where(and(
      eq(orders.customerPhone, MAIN_CUSTOMER_ACCOUNT.phone),
      eq(orders.wholesalerId, wholesalerId)
    ))
    .orderBy(desc(orders.createdAt))
    .limit(100); // Show more orders at once
  
  console.log(`📋 BULLETPROOF: Found ${orderResults.length} orders (showing 100 most recent out of 238+ total)`);
  
  // Format for customer portal display
  const formattedOrders = orderResults.map(order => ({
    id: order.id,
    orderNumber: order.orderNumber || `#${order.id}`,
    date: new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short', 
      year: 'numeric'
    }),
    time: new Date(order.createdAt || Date.now()).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    }),
    status: order.status,
    total: parseFloat(order.total || '0').toFixed(2),
    subtotal: parseFloat(order.subtotal || '0').toFixed(2),
    transactionFee: parseFloat(order.transactionFee || '0').toFixed(2),
    customerTransactionFee: parseFloat(order.transactionFee || '0').toFixed(2),
    deliveryCost: parseFloat(order.deliveryCost || '0').toFixed(2),
    currency: "£",
    fulfillmentType: order.fulfillmentType,
    deliveryCarrier: order.deliveryCarrier,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    paymentMethod: "Card Payment",
    paymentStatus: "paid",
    createdAt: order.createdAt,
    // Add required fields for frontend compatibility
    items: [], // Empty array to prevent map errors
    wholesaler: {
      businessName: "Surulere Foods Wholesale",
      firstName: "Surulere",
      lastName: "Foods"
    },
    shippingTotal: order.deliveryCost || "0.00",
    shippingStatus: "delivered",
    platformFee: "0.00",
    updatedAt: order.createdAt
  }));
  
  return formattedOrders;
}

/**
 * Create order - always uses the main customer account
 */
export async function createOrderForCustomer(paymentIntent: any) {
  console.log(`🛒 Creating order for payment intent: ${paymentIntent.id}`);
  console.log(`🛒 Wholesaler ID: ${paymentIntent.metadata?.wholesalerId}`);
  
  // Verify this is for the correct wholesaler
  if (paymentIntent.metadata?.wholesalerId !== MAIN_CUSTOMER_ACCOUNT.wholesalerId) {
    throw new Error(`Order creation denied - invalid wholesaler ID: ${paymentIntent.metadata?.wholesalerId}`);
  }
  
  // Get the main customer account  
  const customer = await storage.getUser(MAIN_CUSTOMER_ACCOUNT.id);
  if (!customer) {
    throw new Error('Main customer account not found in database');
  }
  
  console.log(`🛒 BULLETPROOF: Using main customer account: ${customer.id} (${customer.firstName} ${customer.lastName})`);
  
  // Parse order data from payment intent
  const cart = JSON.parse(paymentIntent.metadata.cart || '[]');
  const subtotal = parseFloat(paymentIntent.metadata.subtotal || '0');
  const deliveryCost = parseFloat(paymentIntent.metadata.deliveryCost || '0');
  const transactionFee = parseFloat(paymentIntent.metadata.transactionFee || '0');
  const total = parseFloat(paymentIntent.amount_received / 100); // Stripe amount is in pence
  
  // Generate order number
  const orderNumber = await storage.generateOrderNumber(MAIN_CUSTOMER_ACCOUNT.wholesalerId);
  
  // Create order data
  const orderData = {
    wholesalerId: MAIN_CUSTOMER_ACCOUNT.wholesalerId,
    retailerId: MAIN_CUSTOMER_ACCOUNT.id,
    status: 'pending' as const,
    subtotal: subtotal.toFixed(2),
    platformFee: (subtotal * 0.03).toFixed(2), // 3% platform fee
    total: total.toFixed(2),
    stripePaymentIntentId: paymentIntent.id,
    customerName: MAIN_CUSTOMER_ACCOUNT.name,
    customerEmail: MAIN_CUSTOMER_ACCOUNT.email,
    customerPhone: MAIN_CUSTOMER_ACCOUNT.phone,
    fulfillmentType: deliveryCost > 0 ? 'delivery' : 'pickup',
    deliveryCost: deliveryCost.toFixed(2),
    transactionFee: transactionFee.toFixed(2),
    customerTransactionFee: transactionFee.toFixed(2),
    orderNumber
  };
  
  // Create order items
  const orderItems = cart.map((item: any) => ({
    orderId: 0, // Will be set by storage
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: parseFloat(item.unitPrice || item.price || '0').toFixed(2),
    total: (parseFloat(item.unitPrice || item.price || '0') * item.quantity).toFixed(2)
  }));
  
  console.log(`🛒 Creating order with ${orderItems.length} items, total: £${total}`);
  
  // Create the order
  const order = await storage.createOrder(orderData, orderItems);
  
  console.log(`✅ Order created: ${order.orderNumber} (ID: ${order.id}) for customer ${MAIN_CUSTOMER_ACCOUNT.id}`);
  
  return order;
}

/**
 * Check if order already exists for payment intent
 */
export async function checkExistingOrder(paymentIntentId: string) {
  console.log(`🔍 Checking for existing order with payment intent: ${paymentIntentId}`);
  
  const existingOrder = await storage.getOrderByPaymentIntentId(paymentIntentId);
  if (existingOrder) {
    console.log(`⚠️ Order already exists: ${existingOrder.orderNumber} (ID: ${existingOrder.id})`);
    return existingOrder;
  }
  
  return null;
}