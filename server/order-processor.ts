import { storage } from './storage';
import { generateWholesalerOrderNotificationEmail } from './email-templates';
import { sendEmail } from './sendgrid-service';

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
  const correctTotal = totalCustomerPays || (parseFloat(productSubtotal || totalAmount) + parseFloat(customerTransactionFee || transactionFee || '0')).toFixed(2);

  // Extract and process shipping data from payment metadata
  const shippingInfoJson = paymentIntent.metadata.shippingInfo;
  const shippingInfo = shippingInfoJson ? JSON.parse(shippingInfoJson) : { option: 'pickup' };
  
  console.log('🚚 Processing shipping metadata:', {
    hasShippingInfo: !!shippingInfoJson,
    shippingInfoRaw: shippingInfoJson,
    parsedShippingInfo: shippingInfo,
    customerChoice: shippingInfo.option,
    hasService: !!shippingInfo.service,
    serviceName: shippingInfo.service?.serviceName,
    servicePrice: shippingInfo.service?.price
  });

  // Get wholesaler info for reference generation
  const wholesaler = await storage.getUser(wholesalerId);
  
  // Generate chronological wholesale reference number based on business
  const businessPrefix = wholesaler?.businessName 
    ? wholesaler.businessName.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase()
    : 'WS';
  
  // Get current highest order number for this wholesaler
  const lastOrder = await storage.getLastOrderForWholesaler(wholesalerId);
  const lastOrderNumber = lastOrder?.orderNumber || `${businessPrefix}-000`;
  
  // Extract number from last order (e.g., "SF-115" -> 115) 
  const lastNumber = parseInt(lastOrderNumber.split('-')[1] || '0');
  const nextNumber = lastNumber + 1;
  const wholesaleRef = `${businessPrefix}-${nextNumber.toString().padStart(3, '0')}`;
  
  console.log(`🏢 Generated wholesale reference: ${wholesaleRef} (previous: ${lastOrderNumber}) for ${wholesaler?.businessName || 'Unknown Business'}`);
  
  // Create order with customer details AND SHIPPING DATA
  const orderData = {
    orderNumber: wholesaleRef, // Use wholesale reference as order number for consistency
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
    deliveryAddress: typeof customerAddress === 'string' ? customerAddress : JSON.parse(customerAddress).address,
    // Shipping information processing
    fulfillmentType: shippingInfo.option || 'pickup',
    deliveryCarrier: shippingInfo.option === 'delivery' && shippingInfo.service ? shippingInfo.service.serviceName : null,
    deliveryCost: shippingInfo.option === 'delivery' && shippingInfo.service ? shippingInfo.service.price.toString() : '0.00',
    shippingTotal: shippingInfo.option === 'delivery' && shippingInfo.service ? shippingInfo.service.price.toString() : '0.00'
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
    total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2)
  }));

  const order = await storage.createOrder(orderData, orderItems);
  
  console.log(`✅ Order #${order.id} (Wholesale Ref: ${wholesaleRef}) created successfully for wholesaler ${wholesalerId}, customer ${customerName}, total: ${totalAmount}`);

  // TODO: Re-implement customer confirmation email
  console.log(`📧 Customer email confirmation temporarily disabled for order #${order.id}`);

  // Send WhatsApp notification to wholesaler with wholesale reference
  if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
    const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : '$';
    const message = `🎉 New Order Received!\n\nWholesale Ref: ${wholesaleRef}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nQuote this reference when communicating with the customer.`;
    
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
        subtotal: productSubtotal,
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
      
      console.log(`📧 Wholesaler notification sent to ${wholesaler.email} for order ${wholesaleRef}`);
      
    } catch (emailError) {
      console.error(`❌ Failed to send wholesaler notification for order #${order.id}:`, emailError);
    }
  }

  return order;
}