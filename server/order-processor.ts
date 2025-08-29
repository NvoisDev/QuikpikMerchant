import { storage } from './storage';
import { generateWholesalerOrderNotificationEmail } from './email-templates';
import { sendEmail } from './sendgrid-service';
import { ShippingAutomationService } from './shipping-automation';

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress?: string;
  total: string;
  subtotal: string;
  platformFee: string;
  customerTransactionFee: string;
  wholesalerPlatformFee: string;
  shippingTotal: string;
  fulfillmentType: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  wholesaler: {
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  orderDate: string;
  paymentMethod: string;
}

export function parseCustomerName(fullName: string): { firstName: string; lastName: string } {
  const nameParts = (fullName || 'Customer').trim().split(' ');
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || '';
  return { firstName, lastName };
}

export async function processCustomerPortalOrder(paymentIntent: any) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    selectedDeliveryAddressId,
    totalAmount,
    platformFee,
    transactionFee,
    wholesalerId,
    orderType,
    items: itemsJson,
    connectAccountUsed,
    productSubtotal,
    customerTransactionFee,
    totalCustomerPays,
    wholesalerPlatformFee,
    wholesalerReceives
  } = paymentIntent.metadata;

  if (orderType !== 'customer_portal') {
    throw new Error('Invalid order type for customer portal processing');
  }

  const items = JSON.parse(itemsJson);

  // Create customer if doesn't exist or update existing one
  let customer = await storage.getUserByPhone(customerPhone);
  const { firstName, lastName } = parseCustomerName(customerName);
  
  console.log(`🔍 Customer lookup by phone ${customerPhone}:`, customer ? `Found existing: ${customer.id} (${customer.firstName} ${customer.lastName})` : 'Not found');
  
  // If phone lookup fails, try email lookup
  if (!customer && customerEmail) {
    customer = await storage.getUserByEmail(customerEmail);
    console.log(`🔍 Customer lookup by email ${customerEmail}:`, customer ? `Found existing: ${customer.id} (${customer.firstName} ${customer.lastName})` : 'Not found');
  }
  
  if (!customer) {
    console.log(`📝 Creating new customer: ${firstName} ${lastName} (${customerPhone})`);
    customer = await storage.createCustomer({
      phoneNumber: customerPhone,
      firstName,
      lastName,
      role: 'retailer',
      email: customerEmail
    });
    console.log(`✅ New customer created: ${customer.id} (${customer.firstName} ${customer.lastName})`);
  } else {
    // Check if email belongs to different customer before updating
    let emailConflict = false;
    if (customerEmail && customer.email !== customerEmail) {
      const existingEmailUser = await storage.getUserByEmail(customerEmail);
      if (existingEmailUser && existingEmailUser.id !== customer.id) {
        console.log(`⚠️ Email ${customerEmail} belongs to different customer ${existingEmailUser.id}, keeping existing email for ${customer.id}`);
        emailConflict = true;
      }
    }
    
    // Update existing customer with new information if name or phone changed
    const needsUpdate = 
      customer.firstName !== firstName || 
      customer.lastName !== lastName || 
      (customerPhone && customer.phoneNumber !== customerPhone) ||
      (customerEmail && customer.email !== customerEmail && !emailConflict);
      
    if (needsUpdate) {
      console.log(`📝 Updating existing customer: ${customer.id} with new info: ${firstName} ${lastName} (${customerPhone})`);
      
      customer = await storage.updateCustomer(customer.id, {
        firstName,
        lastName,
        email: emailConflict ? customer.email : (customerEmail || customer.email || '')
      });
      
      // Update phone number separately if needed
      if (customerPhone && customer.phoneNumber !== customerPhone) {
        console.log(`📱 Updating phone number for customer: ${customer.id} to ${customerPhone}`);
        await storage.updateCustomerPhone(customer.id, customerPhone);
        customer.phoneNumber = customerPhone; // Update local copy
      }
      
      console.log(`✅ Customer updated: ${customer.id} (${customer.firstName} ${customer.lastName}) (${customer.phoneNumber})`);
    }
  }
  
  console.log(`👤 Using customer for order: ${customer.id} (${customer.firstName} ${customer.lastName})`);

  // Calculate actual platform fee based on Connect usage
  const actualPlatformFee = connectAccountUsed === 'true' ? platformFee : '0.00';
  const wholesalerAmount = connectAccountUsed === 'true' 
    ? (parseFloat(totalAmount) - parseFloat(platformFee)).toFixed(2)
    : totalAmount;

  // Use the correct total from metadata instead of recalculating
  // CRITICAL FIX: Include shipping cost in total calculation
  const shippingCost = parseFloat(paymentIntent.metadata.shippingCost || '0');
  const correctTotal = totalCustomerPays || (parseFloat(productSubtotal || totalAmount) + parseFloat(customerTransactionFee || transactionFee || '0') + shippingCost).toFixed(2);

  // 🚚 CRITICAL FIX: Extract and process shipping data from payment metadata
  const shippingInfoJson = paymentIntent.metadata.shippingInfo;
  const shippingInfo = shippingInfoJson ? JSON.parse(shippingInfoJson) : { option: 'pickup' };
  
  // Simple delivery detection: if customer selected delivery, create delivery order
  const fulfillmentType = shippingInfo.option === 'delivery' ? 'delivery' : 'pickup';
  
  console.log(`🚚 ORDER-PROCESSOR: Customer selected ${shippingInfo.option} → creating ${fulfillmentType} order`);
  
  console.log('🚚 ORDER-PROCESSOR: Using actual order shipping choice:', {
    customerId: customer.id,
    customerName: customer.firstName + ' ' + customer.lastName,
    orderShippingOption: shippingInfo.option,
    finalFulfillmentType: fulfillmentType,
    willCreateDeliveryOrder: fulfillmentType === 'delivery'
  });

  // Get wholesaler info for logging
  const wholesaler = await storage.getUser(wholesalerId);
  
  console.log(`🏢 Creating order for ${wholesaler?.businessName || 'Unknown Business'}`);
  
  // CRITICAL FIX: Generate order number using same atomic logic as routes.ts
  const orderNumber = await storage.generateOrderNumber(wholesalerId);
  console.log(`🔢 WEBHOOK: Generated order number ${orderNumber} for ${wholesaler?.businessName}`);
  
  // Create order with customer details AND SHIPPING DATA
  const orderData = {
    orderNumber, // Use pre-generated atomic order number
    wholesalerId,
    retailerId: customer.id,
    customerName, // Store customer name
    customerEmail, // Store customer email
    customerPhone, // Store customer phone
    // CRITICAL FIX: Calculate subtotal from items if metadata is missing
    subtotal: productSubtotal && productSubtotal !== 'null' && productSubtotal !== 'undefined' 
      ? parseFloat(productSubtotal).toFixed(2) 
      : items.reduce((sum: number, item: any) => sum + (parseFloat(item.unitPrice) * item.quantity), 0).toFixed(2),
    platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2), // 3.3% platform fee
    customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2), // Customer transaction fee (5.5% + £0.50)
    total: correctTotal, // Total = subtotal + customer transaction fee
    status: 'paid',
    stripePaymentIntentId: paymentIntent.id,
    deliveryAddress: customerAddress ? (typeof customerAddress === 'string' ? customerAddress : JSON.stringify(customerAddress)) : null,
    // CRITICAL: Store selected delivery address ID for exact order-address tracking
    deliveryAddressId: await (async () => {
      if (selectedDeliveryAddressId && selectedDeliveryAddressId !== '') {
        return parseInt(selectedDeliveryAddressId);
      }
      // CRITICAL FIX: If this is a delivery order but no address ID provided, find customer's default address
      if (fulfillmentType === 'delivery') {
        const defaultAddress = await storage.getDefaultDeliveryAddress(customer.id, wholesalerId);
        if (defaultAddress) {
          console.log(`🏠 AUTO-LINK: Using customer's default delivery address ${defaultAddress.id} for delivery order`);
          return defaultAddress.id;
        }
      }
      return null;
    })(),
    // SIMPLIFIED: Use customer shipping choice directly
    fulfillmentType: fulfillmentType,
    deliveryCarrier: null, // No carrier needed for simplified delivery system
    deliveryCost: '0.00', // No delivery cost - arranged directly with customer
    shippingTotal: '0.00' // No shipping total
  };
  
  console.log('🚚 Order data with shipping fields:', {
    fulfillmentType: orderData.fulfillmentType,
    deliveryCarrier: orderData.deliveryCarrier,
    deliveryCost: orderData.deliveryCost,
    willSaveAsDelivery: orderData.fulfillmentType === 'delivery'
  });

  // Create order items with orderId for storage
  const orderItems = items.map((item: any) => ({
    orderId: 0, // Will be set after order creation
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: parseFloat(item.unitPrice).toFixed(2),
    total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
    sellingType: item.sellingType || 'units' // Default to 'units' if not specified
  }));

  // CRITICAL FIX: Check if order already exists for this payment intent to prevent duplicates
  const existingOrder = await storage.getOrderByPaymentIntentId(paymentIntent.id);
  if (existingOrder) {
    console.log(`⚠️ Order already exists for payment intent ${paymentIntent.id}: Order #${existingOrder.id} (${existingOrder.orderNumber})`);
    return existingOrder; // Return existing order instead of creating duplicate
  }

  console.log(`🚨 ORDER PROCESSOR DEBUG: About to call storage.createOrder`);
  console.log(`🚨 ORDER PROCESSOR DEBUG: Order data:`, orderData);
  console.log(`🚨 ORDER PROCESSOR DEBUG: Items:`, orderItems.map(i => `${i.productId}:${i.quantity}:${i.sellingType}`));
  
  // CRITICAL FIX: Force reliable order creation by using the same transaction-based approach
  // Import database for transaction consistency
  const { db } = await import('./db');
  const { eq } = await import('drizzle-orm');
  const { orders, orderItems: orderItemsTable } = await import('../shared/schema');
  
  console.log(`🚨 ORDER PROCESSOR DEBUG: Using transaction-based order creation for reliability`);
  
  const order = await db.transaction(async (trx) => {
    console.log(`🚨 ORDER PROCESSOR TRANSACTION: Starting transaction`);
    
    // Use the reliable createOrderWithTransaction method
    const createdOrder = await storage.createOrderWithTransaction(trx, orderData, orderItems);
    
    console.log(`🚨 ORDER PROCESSOR TRANSACTION: Order created successfully: ${createdOrder.id}`);
    return createdOrder;
  });
  
  console.log(`🚨 ORDER PROCESSOR DEBUG: Transaction-based order creation completed, order ID: ${order.id}`);
  
  // 🔒 DATA INTEGRITY: Verify all items were saved correctly
  const savedItems = await storage.getOrderItems(order.id);
  if (savedItems.length !== items.length) {
    console.error(`❌ DATA INTEGRITY ALERT: Expected ${items.length} items, but only saved ${savedItems.length} for order ${order.id}`);
    throw new Error(`Data integrity failure: Expected ${items.length} items, saved ${savedItems.length}`);
  }
  
  console.log(`✅ Order #${order.id} (Order Number: ${order.orderNumber}) created with ${savedItems.length}/${items.length} items verified for wholesaler ${wholesalerId}, customer ${customerName}, total: ${totalAmount}`);

  // Send order confirmation email to customer
  try {
    const { sendOrderConfirmationEmail } = await import('./sendgrid-service');
    
    // Get order items for the email
    const orderItemsFromDB = await storage.getOrderItems(order.id);
    const orderItemsForEmail = await Promise.all(orderItemsFromDB.map(async (orderItem: any) => {
      const product = await storage.getProduct(orderItem.productId);
      return {
        productName: product?.name || `Product #${orderItem.productId}`,
        quantity: orderItem.quantity,
        unitPrice: parseFloat(orderItem.unitPrice),
        total: parseFloat(orderItem.total)
      };
    }));

    const orderConfirmationData = {
      customerEmail: customerEmail || '',
      customerName: customerName,
      orderNumber: order.orderNumber || `ORD-${order.id}`,
      orderItems: orderItemsForEmail,
      subtotal: parseFloat(order.subtotal),
      transactionFee: parseFloat(customerTransactionFee || '0'),
      totalPaid: parseFloat(totalCustomerPays || '0'),
      wholesalerName: wholesaler?.businessName || wholesaler?.firstName || 'Your Wholesaler',
      shippingAddress: typeof customerAddress === 'string' ? customerAddress : 
        (customerAddress ? Object.values(customerAddress).join(', ') : undefined),
      estimatedDelivery: undefined // Can be enhanced with shipping data later
    };

    const emailSent = await sendOrderConfirmationEmail(orderConfirmationData);
    
    if (emailSent) {
      console.log(`✅ Order confirmation email sent to ${customerEmail} for order #${order.id}`);
    } else {
      console.log(`⚠️ Failed to send order confirmation email to ${customerEmail} for order #${order.id}`);
    }
  } catch (emailError) {
    console.error(`❌ Error sending order confirmation email for order #${order.id}:`, emailError);
  }

  // Send WhatsApp notification to wholesaler with wholesale reference
  if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
    const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : '$';
    const message = `🎉 New Order Received!\n\nOrder: ${order.orderNumber}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nQuote this reference when communicating with the customer.`;
    
    try {
      const { whatsappService } = await import('./whatsapp');
      await whatsappService.sendMessage(wholesaler.businessPhone || wholesaler.twilioPhoneNumber, message, wholesaler.id);
    } catch (error) {
      console.error('Failed to send WhatsApp notification:', error);
    }
  }

  // Send email notification to wholesaler
  if (wholesaler && wholesaler.email) {
    try {
      // CRITICAL FIX: Use actual database order items for accurate pricing
      const orderItemsFromDB = await storage.getOrderItems(order.id);
      const enrichedItemsForEmail = await Promise.all(orderItemsFromDB.map(async (orderItem: any) => {
        const product = await storage.getProduct(orderItem.productId);
        return {
          productName: product?.name || `Product #${orderItem.productId}`,
          quantity: orderItem.quantity,
          unitPrice: parseFloat(orderItem.unitPrice).toFixed(2), // Use database unit price
          total: parseFloat(orderItem.total).toFixed(2) // Use database total
        };
      }));

      const emailData: OrderEmailData = {
        orderNumber: order.orderNumber || `ORD-${order.id}`,
        customerName,
        customerEmail: customerEmail || '',
        customerPhone,
        customerAddress: typeof customerAddress === 'string' ? customerAddress : 
          (customerAddress ? JSON.stringify(customerAddress) : undefined),
        total: correctTotal,
        subtotal: order.subtotal, // CRITICAL FIX: Use actual database subtotal, not metadata
        platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
        customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2),
        wholesalerPlatformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
        shippingTotal: '0.00',
        fulfillmentType: 'pickup',
        items: enrichedItemsForEmail,
        wholesaler: {
          businessName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`,
          firstName: wholesaler.firstName || '',
          lastName: wholesaler.lastName || '',
          email: wholesaler.email
        },
        orderDate: new Date().toISOString(),
        paymentMethod: 'Card Payment'
      };

      const emailTemplate = generateWholesalerOrderNotificationEmail(emailData);
      
      await sendEmail({
        to: wholesaler.email,
        from: 'hello@quikpik.co',
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });
      
      console.log(`📧 Wholesaler notification sent to ${wholesaler.email} for order ${order.orderNumber}`);
      
    } catch (emailError) {
      console.error(`❌ Failed to send wholesaler notification for order #${order.id}:`, emailError);
    }
  }

  // AUTOMATIC DELIVERY PAYMENT PROCESSING
  // Check if this order requires automatic delivery payment
  const autoPayDelivery = paymentIntent.metadata.autoPayDelivery === 'true';
  
  if (autoPayDelivery && shippingInfo.option === 'delivery' && shippingInfo.service) {
    console.log(`🚚 Processing automatic delivery payment for order ${order.orderNumber}`);
    
    try {
      const { ShippingAutomationService } = await import('./shipping-automation');
      const shippingAutomation = new ShippingAutomationService();
      
      // Parse customer address for shipping
      const parsedAddress = typeof customerAddress === 'string' 
        ? { address: customerAddress, city: '', state: '', postalCode: '', country: 'GBR' }
        : JSON.parse(customerAddress);
      
      const shippingOrderData = {
        orderId: order.id,
        orderNumber: order.orderNumber || `ORD-${order.id}`,
        wholesalerId,
        customerData: {
          name: customerName,
          email: customerEmail || '',
          phone: customerPhone,
          address: parsedAddress.street || parsedAddress.address || '',
          city: parsedAddress.city || '',
          state: parsedAddress.state || '',
          postalCode: parsedAddress.postalCode || '',
          country: parsedAddress.country || 'GBR'
        },
        shippingInfo: {
          serviceId: shippingInfo.service.serviceId,
          serviceName: shippingInfo.service.serviceName,
          price: shippingInfo.service.price
        },
        items: items.map((item: any) => ({
          productName: item.productName || 'Product',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          weight: 1.0, // Default weight if not specified
          value: parseFloat(item.unitPrice) * item.quantity
        }))
      };
      
      const shippingResult = await shippingAutomation.processShippingOrder(shippingOrderData);
      
      if (shippingResult.success) {
        console.log(`✅ Automatic delivery payment successful for order ${order.orderNumber}:`, {
          shippingOrderId: shippingResult.orderId,
          cost: shippingResult.cost
        });
      } else {
        console.error(`❌ Automatic delivery payment failed for order ${order.orderNumber}:`, shippingResult.error);
        // Order still succeeds, but shipping payment failed - wholesaler will need to pay manually
      }
      
    } catch (shippingError: any) {
      console.error(`❌ Shipping automation error for order ${order.orderNumber}:`, shippingError);
      // Continue processing - don't fail the order due to shipping automation issues
    }
  } else {
    console.log(`ℹ️ No automatic delivery payment required for order ${order.orderNumber} (pickup or manual delivery)`);
  }

  return order;
}