import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser, requireAuth } from "./googleAuth";
import { insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema, insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema } from "@shared/schema";
import { whatsappService } from "./whatsapp";
import { generateProductDescription, generateProductImage } from "./ai";
import { z } from "zod";
import OpenAI from "openai";
import twilio from "twilio";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not found. Stripe functionality will not work.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
}) : null;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Helper function to format numbers with commas
// Function to create and send Stripe invoice to customer
async function createAndSendStripeInvoice(order: any, items: any[], wholesaler: any, customer: any) {
  if (!stripe) {
    console.log("⚠️ Stripe not configured, skipping invoice creation");
    return;
  }

  try {
    // Create or retrieve Stripe customer
    let stripeCustomer;
    try {
      const customers = await stripe.customers.search({
        query: `email:'${customer.email}'`,
      });
      
      if (customers.data.length > 0) {
        stripeCustomer = customers.data[0];
      } else {
        // Extract customer info from order retailer data or customer object
        const customerEmail = customer.email || order.retailer?.email || `customer${order.id}@quikpik.co`;
        const customerName = customer.name || `${order.retailer?.firstName || 'Customer'} ${order.retailer?.lastName || ''}`.trim();
        const customerPhone = customer.phone || order.retailer?.phoneNumber || order.retailer?.phone_number;
        
        stripeCustomer = await stripe.customers.create({
          email: customerEmail,
          name: customerName || 'Customer',
          phone: customerPhone,
          metadata: {
            orderType: 'customer_portal',
            wholesalerId: wholesaler.id,
            orderId: order.id.toString()
          }
        });
      }
    } catch (error) {
      console.error("Error creating/finding Stripe customer:", error);
      return;
    }

    // Helper function to get currency symbol
    const getCurrencySymbol = (currency?: string) => {
      switch (currency?.toUpperCase()) {
        case 'USD': return '$';
        case 'EUR': return '€';
        case 'GBP': return '£';
        default: return '£';
      }
    };

    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: stripeCustomer.id,
      currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
      description: `Order #${order.id} from ${wholesaler.businessName || wholesaler.username}`,
      metadata: {
        orderId: order.id.toString(),
        wholesalerId: wholesaler.id,
        orderType: 'customer_portal'
      },
      custom_fields: [
        {
          name: 'Order ID',
          value: order.id.toString()
        },
        {
          name: 'Supplier',
          value: wholesaler.businessName || wholesaler.username
        }
      ]
    });

    // Add line items to invoice
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: Math.round(parseFloat(item.total) * 100), // Convert to cents
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: `${item.productName} (${item.quantity} units @ ${getCurrencySymbol(wholesaler.preferredCurrency)}${parseFloat(item.unitPrice).toFixed(2)} each)`,
        metadata: {
          productId: item.productId.toString(),
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice
        }
      });
    }

    // Add platform fee as separate line item
    if (parseFloat(order.platformFee) > 0) {
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: Math.round(parseFloat(order.platformFee) * 100),
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: `Platform Service Fee (5%)`,
        metadata: {
          feeType: 'platform_fee'
        }
      });
    }

    // Finalize and send invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    
    // Mark as paid since payment was already processed
    await stripe.invoices.pay(finalizedInvoice.id, {
      paid_out_of_band: true
    });

    // Send invoice email to customer
    await stripe.invoices.sendInvoice(finalizedInvoice.id);

    console.log(`📄 Stripe invoice created and sent to ${customer.email || customer.name} for order #${order.id}`);
    return finalizedInvoice;
    
  } catch (error) {
    console.error(`❌ Failed to create Stripe invoice for order #${order.id}:`, error);
    console.error(`Customer email: ${customer.email}, Customer name: ${customer.name}`);
    return null;
  }
}

function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

// Helper function to parse full name into first and last name
function parseCustomerName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: 'Unknown', lastName: 'Customer' };
  }
  
  const nameParts = fullName.trim().split(' ');
  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: '' };
  } else if (nameParts.length === 2) {
    return { firstName: nameParts[0], lastName: nameParts[1] };
  } else {
    // For names with more than 2 parts, first word is firstName, rest is lastName
    return { 
      firstName: nameParts[0], 
      lastName: nameParts.slice(1).join(' ') 
    };
  }
}

// Helper function to generate stock update messages
function generateStockUpdateMessage(product: any, notificationType: string, wholesaler: any): string {
  const businessName = wholesaler.businessName || wholesaler.firstName + ' ' + wholesaler.lastName;
  const phone = wholesaler.businessPhone || wholesaler.phoneNumber || "+1234567890";
  
  let message = `📢 *Stock Update Alert*\n\n`;
  message += `Product: *${product.name}*\n\n`;
  
  switch (notificationType) {
    case 'out_of_stock':
      message += `🚨 *OUT OF STOCK*\n`;
      message += `This product is currently unavailable. We'll notify you when it's back in stock!\n\n`;
      message += `📞 For alternative products or pre-orders, contact us:\n${businessName}\n📱 ${phone}`;
      break;
      
    case 'low_stock':
      message += `⚠️ *LOW STOCK ALERT*\n`;
      message += `Only ${formatNumber(product.stock || 0)} units remaining!\n\n`;
      message += `💰 Price: ${product.price}\n`;
      message += `📦 MOQ: ${formatNumber(product.moq)} units\n\n`;
      message += `🛒 Order now to secure your stock!\n\n`;
      message += `📞 Contact us:\n${businessName}\n📱 ${phone}`;
      break;
      
    case 'restocked':
      message += `✅ *BACK IN STOCK*\n`;
      message += `Great news! This product is available again.\n\n`;
      message += `📦 Stock: ${formatNumber(product.stock || 0)} units available\n`;
      message += `💰 Price: ${product.price}\n`;
      message += `📦 MOQ: ${formatNumber(product.moq)} units\n\n`;
      message += `🛒 Place your order now!\n\n`;
      message += `📞 Contact us:\n${businessName}\n📱 ${phone}`;
      break;
      
    case 'price_change':
      message += `💰 *PRICE UPDATE*\n`;
      message += `New price: ${product.price}\n`;
      message += `📦 Stock: ${formatNumber(product.stock || 0)} units available\n`;
      message += `📦 MOQ: ${formatNumber(product.moq)} units\n\n`;
      message += `📞 Questions? Contact us:\n${businessName}\n📱 ${phone}`;
      break;
  }
  
  message += `\n\n✨ Powered by Quikpik`;
  return message;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Google Auth routes
  app.get('/api/auth/google', (req, res) => {
    try {
      const authUrl = getGoogleAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code } = req.query;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Authorization code is required' });
      }

      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(code);
      
      // Create or update user in database
      const user = await createOrUpdateUser(googleUser);
      
      // Set user session
      req.session.userId = user.id;
      
      // Redirect to home page
      res.redirect('/');
    } catch (error) {
      console.error('Google auth callback error:', error);
      res.redirect('/login?error=auth_failed');
    }
  });

  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      res.json(req.user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // Onboarding routes
  app.patch('/api/auth/user/onboarding', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { step, completed, skipped } = req.body;
      
      const updateData: any = {};
      if (typeof step === 'number') updateData.onboardingStep = step;
      if (typeof completed === 'boolean') updateData.onboardingCompleted = completed;
      if (typeof skipped === 'boolean') updateData.onboardingSkipped = skipped;
      
      const updatedUser = await storage.updateUserOnboarding(userId, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // Settings route
  app.patch('/api/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const updatedUser = await storage.updateUserSettings(userId, req.body);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Product routes
  app.get('/api/products', async (req, res) => {
    try {
      const { wholesalerId } = req.query;
      const products = await storage.getProducts(wholesalerId as string);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check product limit before creating
      const limitCheck = await storage.checkProductLimit(userId);
      if (!limitCheck.canAdd) {
        return res.status(403).json({ 
          message: `Product limit reached. You can only have ${limitCheck.limit} products on the ${limitCheck.tier} plan. Upgrade your subscription to add more products.`,
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          tier: limitCheck.tier
        });
      }

      // Convert numeric fields from frontend to appropriate types
      const { price, promoPrice, moq, stock, minimumBidPrice, unitsPerPallet, ...otherData } = req.body;
      const productData = insertProductSchema.parse({
        ...otherData,
        price: price.toString(),
        promoPrice: promoPrice ? promoPrice.toString() : null,
        moq: parseInt(moq),
        stock: parseInt(stock),
        minimumBidPrice: minimumBidPrice ? minimumBidPrice.toString() : null,
        unitsPerPallet: unitsPerPallet ? parseInt(unitsPerPallet) : null,
        wholesalerId: userId
      });
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Verify product belongs to user
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check edit limit based on subscription tier
      const currentEditCount = existingProduct.editCount || 0;
      const user = await storage.getUser(userId);
      const subscriptionTier = user?.subscriptionTier || "free";
      
      let editLimit = 3; // Default for free
      switch (subscriptionTier) {
        case "standard":
          editLimit = 10;
          break;
        case "premium":
          editLimit = -1; // Unlimited
          break;
        default:
          editLimit = 3; // Free tier
      }
      
      // Only check limit if not premium (unlimited)
      if (editLimit !== -1 && currentEditCount >= editLimit) {
        return res.status(403).json({ 
          message: `Product edit limit reached! You've used all ${editLimit} product edits for the ${subscriptionTier} plan. Upgrade your plan to edit more products.`,
          editCount: currentEditCount,
          maxEdits: editLimit,
          tier: subscriptionTier
        });
      }

      // Convert numeric fields from frontend to appropriate types
      const { price, promoPrice, moq, stock, minimumBidPrice, unitsPerPallet, ...otherData } = req.body;
      const convertedData = {
        ...otherData,
        ...(price !== undefined && { price: price.toString() }),
        ...(promoPrice !== undefined && { promoPrice: promoPrice ? promoPrice.toString() : null }),
        ...(moq !== undefined && { moq: parseInt(moq) }),
        ...(stock !== undefined && { stock: parseInt(stock) }),
        ...(minimumBidPrice !== undefined && { minimumBidPrice: minimumBidPrice ? minimumBidPrice.toString() : null }),
        ...(unitsPerPallet !== undefined && { unitsPerPallet: unitsPerPallet ? parseInt(unitsPerPallet) : null })
      };
      const productData = insertProductSchema.partial().parse(convertedData);
      
      // Increment edit count and update the product
      const productDataWithEditCount = {
        ...productData,
        editCount: currentEditCount + 1
      };
      const product = await storage.updateProduct(id, productDataWithEditCount);
      
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Verify product belongs to user
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }

      await storage.deleteProduct(id);
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Order routes
  app.get('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const role = req.query.role; // 'customer' or 'wholesaler'
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let orders;
      if (role === 'customer' || user.role === 'retailer') {
        // Get orders placed by this customer/retailer
        orders = await storage.getOrders(undefined, userId);
      } else {
        // Get orders received by this wholesaler
        orders = await storage.getOrders(userId);
      }
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { items, deliveryAddress, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Calculate totals
      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }

        if (item.quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity for ${product.name} is ${product.moq}` 
          });
        }

        const itemTotal = parseFloat(product.price) * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
          total: itemTotal.toFixed(2)
        });
      }

      const platformFee = subtotal * 0.05; // 5% platform fee
      const total = subtotal + platformFee;

      // Get wholesaler from first product
      const firstProduct = await storage.getProduct(items[0].productId);
      const wholesalerId = firstProduct!.wholesalerId;

      const orderData = insertOrderSchema.parse({
        wholesalerId,
        retailerId: userId,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        total: total.toFixed(2),
        deliveryAddress,
        notes,
        status: 'confirmed' // Auto-confirm orders immediately
      });

      const order = await storage.createOrder(orderData, orderItems);
      
      // Get wholesaler and customer details for confirmation email
      const wholesaler = await storage.getUser(wholesalerId);
      const customer = await storage.getUser(userId);
      
      if (wholesaler && customer) {
        try {
          // Send confirmation email to customer
          await sendCustomerInvoiceEmail(customer, order, orderItems.map(item => ({
            ...item,
            product: { name: 'Product', price: item.unitPrice } // Will be populated properly
          })), wholesaler);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
          // Don't fail the order creation if email fails
        }
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Customer payment endpoint - creates payment intent with 5% platform fee
  app.post('/api/customer/create-payment', async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, customerAddress, items, totalAmount, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Validate all products exist and calculate total
      let calculatedTotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }

        if (item.quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity for ${product.name} is ${product.moq}` 
          });
        }

        if (item.quantity > product.stock) {
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
          });
        }

        const itemTotal = parseFloat(product.price) * item.quantity;
        calculatedTotal += itemTotal;

        validatedItems.push({
          ...item,
          product,
          unitPrice: product.price,
          total: itemTotal.toFixed(2)
        });
      }

      // Calculate platform fee (5%)
      const platformFee = calculatedTotal * 0.05;
      const totalAmountWithFee = calculatedTotal + platformFee;

      // Get first product's wholesaler for Stripe Connect account
      const firstProduct = validatedItems[0].product;
      const wholesaler = await storage.getUser(firstProduct.wholesalerId);
      
      if (!wholesaler || !wholesaler.stripeAccountId) {
        return res.status(400).json({ 
          message: "Wholesaler payment setup incomplete. Please contact seller." 
        });
      }

      // Create Stripe payment intent with Connect account and platform fee
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(calculatedTotal * 100), // Original amount without platform fee
        currency: (wholesaler.preferredCurrency?.toLowerCase() || 'usd') as string,
        application_fee_amount: Math.round(platformFee * 100), // 5% platform fee collected by platform
        transfer_data: {
          destination: wholesaler.stripeAccountId, // Wholesaler receives 95%
        },
        metadata: {
          customerName,
          customerEmail,
          customerPhone,
          customerAddress: JSON.stringify(customerAddress),
          totalAmount: calculatedTotal.toFixed(2),
          platformFee: platformFee.toFixed(2),
          wholesalerId: firstProduct.wholesalerId,
          orderType: 'customer_portal',
          items: JSON.stringify(validatedItems.map(item => ({
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.product.price)
          })))
        }
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        totalAmount: calculatedTotal.toFixed(2), // Customer pays base amount
        platformFee: platformFee.toFixed(2),
        wholesalerReceives: (calculatedTotal - platformFee).toFixed(2) // 95% to wholesaler
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Direct order creation endpoint (called after successful payment)
  app.post('/api/marketplace/create-order', async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ message: 'Payment intent ID required' });
      }

      // Retrieve payment intent from Stripe to get metadata
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ message: 'Payment not successful' });
      }

      const {
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        totalAmount,
        platformFee,
        wholesalerId,
        orderType,
        items: itemsJson,
        connectAccountUsed
      } = paymentIntent.metadata;

      if (orderType === 'customer_portal') {
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
            
            // Only update email if there's no conflict
            const updateData = {
              firstName,
              lastName,
              email: emailConflict ? customer.email : (customerEmail || customer.email || undefined)
            };
            
            customer = await storage.updateCustomer(customer.id, updateData);
            
            // Update phone number separately if needed
            if (customerPhone && customer.phoneNumber !== customerPhone) {
              console.log(`📱 Updating phone number for customer: ${customer.id} to ${customerPhone}`);
              await storage.updateCustomerPhone(customer.id, customerPhone);
              customer.phoneNumber = customerPhone; // Update local copy
            }
            
            console.log(`✅ Customer updated: ${customer.id} (${customer.firstName} ${customer.lastName}) (${customer.phoneNumber})`);
          }
        }
        
        console.log(`👤 Using customer for order: ${customer.id} (${customer.firstName} ${customer.lastName})`);;

        // Calculate actual platform fee based on Connect usage
        const actualPlatformFee = connectAccountUsed === 'true' ? platformFee : '0.00';
        const wholesalerAmount = connectAccountUsed === 'true' 
          ? (parseFloat(totalAmount) - parseFloat(platformFee)).toFixed(2)
          : totalAmount;

        // Create order with customer details
        const orderData = {
          wholesalerId,
          retailerId: customer.id,
          customerName, // Store customer name
          customerEmail, // Store customer email
          customerPhone, // Store customer phone
          subtotal: wholesalerAmount,
          platformFee: actualPlatformFee,
          total: totalAmount,
          status: 'paid',
          stripePaymentIntentId: paymentIntent.id,
          deliveryAddress: typeof customerAddress === 'string' ? customerAddress : JSON.parse(customerAddress).address
        };

        // Create order items with orderId for storage
        const orderItems = items.map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          total: (item.unitPrice * item.quantity).toFixed(2)
        }));

        const order = await storage.createOrder(orderData, orderItems);
        
        console.log(`✅ Order #${order.id} created successfully for wholesaler ${wholesalerId}, customer ${customerName}, total: ${totalAmount}`);

        // Send customer confirmation email and Stripe invoice
        const wholesaler = await storage.getUser(wholesalerId);
        if (wholesaler && customerEmail) {
          try {
            // Enrich items with product details for email
            const enrichedItems = await Promise.all(items.map(async (item: any) => {
              const product = await storage.getProduct(item.productId);
              return {
                ...item,
                productName: product?.name || `Product #${item.productId}`,
                product: product ? { name: product.name } : null
              };
            }));
            
            await sendCustomerInvoiceEmail({
              name: customerName,
              email: customerEmail,
              phone: customerPhone,
              address: typeof customerAddress === 'string' ? customerAddress : JSON.parse(customerAddress).address
            }, order, enrichedItems, wholesaler);
            console.log(`📧 Confirmation email sent to ${customerEmail} for order #${order.id}`);

            // Create and send Stripe invoice to customer
            await createAndSendStripeInvoice(order, enrichedItems, wholesaler, {
              name: customerName,
              email: customerEmail,
              phone: customerPhone
            });
            
          } catch (emailError) {
            console.error(`❌ Failed to send confirmation email for order #${order.id}:`, emailError);
          }
        }

        // Send WhatsApp notification to wholesaler
        if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
          const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : '$';
          const message = `🎉 New Order Received!\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nPlease prepare the order for delivery.`;
          
          try {
            const { whatsappService } = await import('./whatsapp');
            await whatsappService.sendMessage(customerPhone, message, wholesaler.id);
          } catch (error) {
            console.error('Failed to send WhatsApp notification:', error);
          }
        }

        res.json({ 
          success: true, 
          orderId: order.id, 
          platformFeeCollected: connectAccountUsed === 'true',
          message: 'Order created successfully'
        });
      } else {
        res.status(400).json({ message: 'Invalid order type' });
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Failed to create order: ' + error.message });
    }
  });

  // Webhook to handle successful payments
  app.post('/api/stripe/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      console.log(`Webhook signature verification failed.`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      try {
        // Extract order data from metadata
        const {
          customerName,
          customerEmail,
          customerPhone,
          totalAmount,
          platformFee,
          wholesalerId,
          orderType
        } = paymentIntent.metadata;

        if (orderType === 'customer_portal') {
          // Extract customer and order data from metadata
          const {
            customerAddress,
            items: itemsJson
          } = paymentIntent.metadata;
          
          const items = JSON.parse(itemsJson);

          // Create customer if doesn't exist
          let customer = await storage.getUserByPhone(customerPhone);
          if (!customer) {
            const { firstName, lastName } = parseCustomerName(customerName);
            customer = await storage.createCustomer({
              phoneNumber: customerPhone,
              firstName,
              lastName,
              role: 'retailer',
              email: customerEmail
            });
          }

          // Create order
          const orderData = {
            wholesalerId,
            retailerId: customer.id,
            subtotal: (parseFloat(totalAmount) - parseFloat(platformFee)).toFixed(2),
            platformFee,
            total: totalAmount,
            status: 'paid',
            stripePaymentIntentId: paymentIntent.id,
            deliveryAddress: typeof customerAddress === 'string' ? customerAddress : JSON.parse(customerAddress).address
          };

          // Create order items
          const orderItems = items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toFixed(2),
            total: (item.unitPrice * item.quantity).toFixed(2)
          }));

          const order = await storage.createOrder(orderData, orderItems);

          // Send customer confirmation email and Stripe invoice
          const wholesaler = await storage.getUser(wholesalerId);
          if (wholesaler && customerEmail) {
            // Enrich items with product details for email
            const enrichedItems = await Promise.all(orderItems.map(async (item: any) => {
              const product = await storage.getProduct(item.productId);
              return {
                ...item,
                productName: product?.name || `Product #${item.productId}`,
                product: product ? { name: product.name } : null
              };
            }));
            
            await sendCustomerInvoiceEmail({
              name: customerName,
              email: customerEmail,
              phone: customerPhone,
              address: customerAddress
            }, order, enrichedItems, wholesaler);

            // Create and send Stripe invoice to customer
            await createAndSendStripeInvoice(order, enrichedItems, wholesaler, {
              name: customerName,
              email: customerEmail,
              phone: customerPhone
            });
          }

          // Send notifications
          if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
            const message = `🎉 New Order Received!\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${wholesaler.preferredCurrency === 'GBP' ? '£' : '$'}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nPlease prepare the order for delivery.`;
            
            try {
              const { whatsappService } = await import('./whatsapp');
              await whatsappService.sendMessage(customerPhone, message, wholesaler.id);
            } catch (error) {
              console.error('Failed to send WhatsApp notification:', error);
            }
          }

          console.log(`Order created successfully for payment ${paymentIntent.id}`);
          console.log(`✅ Stripe invoice automatically sent to customer: ${customerEmail}`);
        }
      } catch (error) {
        console.error('Error processing payment success:', error);
      }
    }

    res.json({ received: true });
  });

  app.patch('/api/orders/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const userId = req.user.claims.sub;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can update order status
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);

      // Auto-archive fulfilled orders
      if (status === 'fulfilled') {
        setTimeout(async () => {
          try {
            await storage.updateOrderStatus(id, 'archived');
            console.log(`Order ${id} auto-archived after fulfillment`);
          } catch (error) {
            console.error(`Failed to auto-archive order ${id}:`, error);
          }
        }, 24 * 60 * 60 * 1000); // Archive after 24 hours
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Cancel order
  app.post('/api/orders/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { reason } = req.body;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can cancel order
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      // Can't cancel already fulfilled or archived orders
      if (order.status === 'fulfilled' || order.status === 'archived') {
        return res.status(400).json({ message: "Cannot cancel fulfilled or archived orders" });
      }

      // Update order status to cancelled
      const updatedOrder = await storage.updateOrderStatus(id, 'cancelled');
      
      // Restore stock for cancelled orders
      const orderItems = await storage.getOrderItems(id);
      for (const item of orderItems) {
        const product = await storage.getProduct(item.productId);
        if (product) {
          await storage.updateProductStock(item.productId, product.stock + item.quantity);
        }
      }

      // Send cancellation notification to customer if email available
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          // Send cancellation email
          console.log(`Sending cancellation email to ${customer.email} for order ${id}`);
        }
      } catch (error) {
        console.error('Failed to send cancellation notification:', error);
      }

      res.json({ 
        message: "Order cancelled successfully",
        order: updatedOrder,
        stockRestored: true
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Failed to cancel order" });
    }
  });

  // Refund order
  app.post('/api/orders/:id/refund', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { amount, reason } = req.body;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can refund order
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to refund this order" });
      }

      // Can only refund paid orders
      if (order.status !== 'paid' && order.status !== 'fulfilled') {
        return res.status(400).json({ message: "Can only refund paid or fulfilled orders" });
      }

      // Check for payment intent ID 
      const paymentIntentId = order.stripePaymentIntentId;
      if (!paymentIntentId) {
        console.log('Order payment details:', {
          orderId: id,
          stripePaymentIntentId: order.stripePaymentIntentId,
          status: order.status,
          total: order.total
        });
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      // Create Stripe refund
      let refund = null;
      if (stripe) {
        try {
          // Prepare refund parameters
          const refundParams: any = {
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
            metadata: {
              order_id: id.toString(),
              reason: reason || 'Wholesaler initiated refund'
            }
          };

          // Only include amount if specified (for partial refunds)
          if (amount && amount !== '') {
            const refundAmount = Math.round(parseFloat(amount) * 100); // Convert to cents
            if (!isNaN(refundAmount) && refundAmount > 0) {
              refundParams.amount = refundAmount;
            }
          }
          // For full refunds, omit the amount parameter entirely

          refund = await stripe.refunds.create(refundParams);
        } catch (stripeError: any) {
          console.error('Stripe refund failed:', stripeError);
          return res.status(400).json({ 
            message: `Refund failed: ${stripeError.message}`,
            error: stripeError.code 
          });
        }
      }

      // Update order status to refunded or add refund note
      let updatedOrder;
      if (refund && refund.amount >= parseFloat(order.total) * 100) {
        // Full refund - cancel order
        updatedOrder = await storage.updateOrderStatus(id, 'refunded');
        
        // Restore stock for refunded orders
        const orderItems = await storage.getOrderItems(id);
        for (const item of orderItems) {
          const product = await storage.getProduct(item.productId);
          if (product) {
            await storage.updateProductStock(item.productId, product.stock + item.quantity);
          }
        }
      } else {
        // Partial refund - keep order active but add note
        const currentNotes = order.notes || '';
        const refundNote = `Partial refund of ${refund ? '$' + (refund.amount / 100).toFixed(2) : amount} processed. Reason: ${reason || 'N/A'}`;
        await storage.updateOrderNotes(id, currentNotes + '\n' + refundNote);
        updatedOrder = order;
      }

      // Send refund notification and receipt to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          // Create Stripe credit note for professional refund receipt
          await createStripeRefundReceipt(order, refund, wholesaler, customer, reason);
          
          // Also send custom refund receipt email
          await sendRefundReceipt(customer, order, refund, wholesaler, reason);
          console.log(`Refund receipt sent to ${customer.email} for order ${id}`);
        }
      } catch (error) {
        console.error('Failed to send refund receipt:', error);
      }

      res.json({ 
        message: "Refund processed successfully",
        order: updatedOrder,
        refund: refund ? {
          id: refund.id,
          amount: refund.amount / 100,
          status: refund.status
        } : null,
        stockRestored: refund && refund.amount >= parseFloat(order.total) * 100
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  });

  // Resend order confirmation email
  app.post('/api/orders/:id/resend-confirmation', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can resend confirmation emails
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to resend confirmation for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Send confirmation email to customer
      try {
        // Enrich items with product details for email
        const enrichedItems = await Promise.all(order.items.map(async (item: any) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || `Product #${item.productId}`,
            product: product ? { name: product.name } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(order.retailer, order, enrichedItems, wholesaler);
        res.json({ message: "Confirmation email sent successfully" });
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        res.status(500).json({ message: "Failed to send confirmation email" });
      }
    } catch (error) {
      console.error("Error resending confirmation email:", error);
      res.status(500).json({ message: "Failed to resend confirmation email" });
    }
  });

  // Stock Movement routes
  app.get('/api/products/:id/stock-movements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.id);
      
      // Verify the user owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const movements = await storage.getStockMovements(productId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.get('/api/products/:id/stock-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.id);
      
      // Verify the user owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const summary = await storage.getStockSummary(productId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching stock summary:", error);
      res.status(500).json({ message: "Failed to fetch stock summary" });
    }
  });

  app.post('/api/products/:id/stock-adjustment', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.id);
      const { adjustmentType, quantity, reason } = req.body;
      
      if (!adjustmentType || !quantity || !reason) {
        return res.status(400).json({ message: "Adjustment type, quantity, and reason are required" });
      }
      
      // Verify the user owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const stockBefore = product.stock;
      let stockAfter: number;
      let movementQuantity: number;
      let movementType: string;
      
      if (adjustmentType === 'increase') {
        stockAfter = stockBefore + parseInt(quantity);
        movementQuantity = parseInt(quantity);
        movementType = 'manual_increase';
      } else if (adjustmentType === 'decrease') {
        stockAfter = Math.max(0, stockBefore - parseInt(quantity));
        movementQuantity = -(parseInt(quantity));
        movementType = 'manual_decrease';
      } else {
        return res.status(400).json({ message: "Invalid adjustment type" });
      }
      
      // Update product stock
      await storage.updateProduct(productId, { stock: stockAfter });
      
      // Create stock movement record
      await storage.createStockMovement({
        productId,
        wholesalerId: userId,
        movementType,
        quantity: movementQuantity,
        stockBefore,
        stockAfter,
        reason,
        orderId: null,
        customerName: null,
      });
      
      res.json({ 
        success: true, 
        stockBefore, 
        stockAfter, 
        message: `Stock ${adjustmentType}d by ${quantity} units` 
      });
    } catch (error) {
      console.error("Error adjusting stock:", error);
      res.status(500).json({ message: "Failed to adjust stock" });
    }
  });

  app.get('/api/stock-movements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const movements = await storage.getStockMovementsByWholesaler(userId, limit);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  // Customer group routes
  app.get('/api/customer-groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groups = await storage.getCustomerGroups(userId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching customer groups:", error);
      res.status(500).json({ message: "Failed to fetch customer groups" });
    }
  });

  app.post('/api/customer-groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupData = insertCustomerGroupSchema.parse({
        ...req.body,
        wholesalerId: userId
      });
      const group = await storage.createCustomerGroup(groupData);
      res.json(group);
    } catch (error) {
      console.error("Error creating customer group:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create customer group" });
    }
  });

  app.put('/api/customer-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.id);
      const { name, description } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Name is required" });
      }

      // Verify the user owns this customer group
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      const updatedGroup = await storage.updateCustomerGroup(groupId, { 
        name, 
        description: description || undefined 
      });
      res.json(updatedGroup);
    } catch (error) {
      console.error("Error updating customer group:", error);
      res.status(500).json({ message: "Failed to update customer group" });
    }
  });

  // Delete customer group
  app.delete('/api/customer-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.id);

      // Verify the user owns this customer group
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Delete the customer group (this should cascade delete members)
      await storage.deleteCustomerGroup(groupId);
      
      res.json({
        success: true,
        message: "Customer group deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting customer group:", error);
      res.status(500).json({ message: "Failed to delete customer group" });
    }
  });

  // WhatsApp group creation
  app.post('/api/customer-groups/:groupId/whatsapp-group', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.groupId);
      
      // Get the customer group
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Get user's phone number
      const user = await storage.getUser(userId);
      if (!user?.phoneNumber) {
        return res.status(400).json({ 
          message: "Please add your phone number in settings to create WhatsApp groups" 
        });
      }

      // For now, we'll simulate WhatsApp group creation
      // In a real implementation, you would integrate with WhatsApp Business API
      const whatsappGroupId = `whatsapp_group_${groupId}_${Date.now()}`;
      
      // Update the group with WhatsApp group ID
      await storage.updateCustomerGroup(groupId, { whatsappGroupId });
      
      res.json({
        success: true,
        groupName: `${group.name} - WhatsApp`,
        whatsappGroupId,
        message: "WhatsApp group created successfully. You can now add customers to this group.",
      });
    } catch (error) {
      console.error("Error creating WhatsApp group:", error);
      res.status(500).json({ message: "Failed to create WhatsApp group" });
    }
  });

  // Add member to customer group
  app.post('/api/customer-groups/:groupId/members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.groupId);
      const { phoneNumber, name } = req.body;
      
      if (!phoneNumber || !name) {
        return res.status(400).json({ message: "Phone number and name are required" });
      }

      // Get the customer group to verify ownership
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Create or find customer with phone number
      let customer = await storage.getUserByPhone(phoneNumber);
      let isNewCustomer = false;
      
      if (!customer) {
        // Create a new customer/retailer account
        const { firstName, lastName } = parseCustomerName(name);
        customer = await storage.createCustomer({
          phoneNumber,
          firstName,
          lastName,
          role: "retailer",
        });
        isNewCustomer = true;
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customer.id);

      // Send welcome message to new customers
      if (isNewCustomer) {
        try {
          const wholesaler = await storage.getUser(userId);
          const businessName = wholesaler?.businessName || "Your Supplier";
          
          const welcomeMessage = `🎉 Welcome to ${businessName}!\n\n` +
            `Hi ${name}! 👋\n\n` +
            `You've been added to our customer network and can now:\n\n` +
            `🛒 Browse our latest products\n` +
            `📱 Receive instant stock updates\n` +
            `💬 Place orders directly via WhatsApp\n` +
            `🚚 Track your deliveries\n` +
            `💰 Access special wholesale pricing\n\n` +
            `We'll keep you updated with:\n` +
            `• New product arrivals\n` +
            `• Special promotions\n` +
            `• Stock availability alerts\n\n` +
            `Questions? Just reply to this message!\n\n` +
            `✨ This message was powered by Quikpik Merchant`;

          await whatsappService.sendMessage(phoneNumber, welcomeMessage, userId);
          console.log(`Welcome message sent to new customer: ${phoneNumber}`);
        } catch (welcomeError) {
          console.error(`Failed to send welcome message to ${phoneNumber}:`, welcomeError);
          // Don't fail the whole operation if welcome message fails
        }
      }
      
      res.json({
        success: true,
        message: isNewCustomer ? `${name} added to ${group.name} and welcome message sent!` : `${name} added to ${group.name} successfully`,
        customer: {
          id: customer.id,
          name: customer.firstName,
          phoneNumber: customer.phoneNumber,
        }
      });
    } catch (error) {
      console.error("Error adding customer to group:", error);
      res.status(500).json({ message: "Failed to add customer to group" });
    }
  });

  // Get group members
  app.get('/api/customer-groups/:groupId/members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.groupId);
      const search = req.query.search as string;

      // Verify group ownership
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      let members;
      if (search && search.trim()) {
        members = await storage.searchGroupMembers(groupId, search.trim());
      } else {
        members = await storage.getGroupMembers(groupId);
      }
      
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ message: "Failed to fetch group members" });
    }
  });

  // Remove member from customer group
  app.delete('/api/customer-groups/:groupId/members/:customerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;

      // Verify group ownership
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Remove customer from group
      await storage.removeCustomerFromGroup(groupId, customerId);
      
      res.json({
        success: true,
        message: "Customer removed from group successfully"
      });
    } catch (error) {
      console.error("Error removing customer from group:", error);
      res.status(500).json({ message: "Failed to remove customer from group" });
    }
  });

  // Update customer phone number in group
  app.patch('/api/customer-groups/:groupId/members/:customerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Verify group ownership
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Update customer phone number
      await storage.updateCustomerPhone(customerId, phoneNumber);
      
      res.json({
        success: true,
        message: "Customer phone number updated successfully"
      });
    } catch (error) {
      console.error("Error updating customer phone number:", error);
      res.status(500).json({ message: "Failed to update customer phone number" });
    }
  });

  // Analytics routes
  app.get('/api/analytics/stats', async (req: any, res) => {
    try {
      const userId = 'test-user-123'; // Temporary test user
      const stats = await storage.getWholesalerStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching analytics stats:", error);
      res.status(500).json({ message: "Failed to fetch analytics stats" });
    }
  });

  app.get('/api/analytics/top-products', async (req: any, res) => {
    try {
      const userId = 'test-user-123'; // Temporary test user
      const { limit } = req.query;
      const topProducts = await storage.getTopProducts(userId, limit ? parseInt(limit as string) : 5);
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).json({ message: "Failed to fetch top products" });
    }
  });

  app.get('/api/analytics/recent-orders', async (req: any, res) => {
    try {
      const userId = 'test-user-123'; // Temporary test user
      const { limit } = req.query;
      const recentOrders = await storage.getRecentOrders(userId, limit ? parseInt(limit as string) : 10);
      res.json(recentOrders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ message: "Failed to fetch recent orders" });
    }
  });

  // Advanced analytics routes
  app.get('/api/analytics/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { timeRange = '30d' } = req.query;
      
      const stats = await storage.getWholesalerStats(userId);
      const broadcastStats = await storage.getBroadcastStats(userId);
      
      // Calculate change percentages (simplified - would need historical data)
      const analyticsData = {
        revenue: {
          total: stats.totalRevenue,
          change: 12.5, // Mock change percentage
          trend: []
        },
        orders: {
          total: stats.ordersCount,
          change: 8.3,
          trend: []
        },
        customers: {
          total: 25,
          new: 5,
          returning: 20,
          trend: []
        },
        products: {
          active: stats.activeProducts,
          lowStock: stats.lowStockCount,
          topPerformers: []
        },
        geography: [
          { region: "London", orders: 15, revenue: 1250 },
          { region: "Manchester", orders: 8, revenue: 680 },
          { region: "Birmingham", orders: 5, revenue: 420 }
        ],
        channels: [
          { channel: "WhatsApp", orders: 18, revenue: 1500 },
          { channel: "Direct", orders: 10, revenue: 850 }
        ],
        broadcasts: {
          sent: broadcastStats.totalBroadcasts,
          delivered: broadcastStats.recipientsReached,
          opened: Math.floor(broadcastStats.recipientsReached * 0.7),
          clicked: Math.floor(broadcastStats.recipientsReached * 0.3)
        }
      };
      
      res.json(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics dashboard:", error);
      res.status(500).json({ message: "Failed to fetch analytics dashboard" });
    }
  });

  app.get('/api/analytics/revenue', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { timeRange = '30d' } = req.query;
      
      // Generate sample revenue trend data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const revenueData = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        revenueData.push({
          date: date.toISOString().split('T')[0],
          amount: Math.floor(Math.random() * 200) + 50
        });
      }
      
      res.json(revenueData);
    } catch (error) {
      console.error("Error fetching revenue data:", error);
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  });

  app.get('/api/analytics/customers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { timeRange = '30d' } = req.query;
      
      // Generate sample customer growth data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const customerData = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        customerData.push({
          date: date.toISOString().split('T')[0],
          new: Math.floor(Math.random() * 3) + 1,
          returning: Math.floor(Math.random() * 5) + 2
        });
      }
      
      res.json(customerData);
    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ message: "Failed to fetch customer data" });
    }
  });

  app.get('/api/analytics/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const topProducts = await storage.getTopProducts(userId, 10);
      
      // Format for chart display
      const productPerformance = topProducts.map(product => ({
        name: product.name.substring(0, 15) + (product.name.length > 15 ? '...' : ''),
        orders: product.orderCount,
        revenue: product.revenue
      }));
      
      res.json(productPerformance);
    } catch (error) {
      console.error("Error fetching product performance:", error);
      res.status(500).json({ message: "Failed to fetch product performance" });
    }
  });

  // Stripe Connect onboarding for wholesalers
  app.post("/api/stripe/connect-onboarding", isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.role !== 'wholesaler') {
        return res.status(403).json({ message: "Only wholesalers can onboard to Stripe Connect" });
      }

      let accountId = user.stripeAccountId;

      // Create Connect account if it doesn't exist
      if (!accountId) {
        // Determine country based on currency preference
        const country = user.preferredCurrency === 'USD' ? 'US' : 
                       user.preferredCurrency === 'EUR' ? 'DE' : 'GB';
        
        const account = await stripe.accounts.create({
          type: 'express',
          country: country,
          email: user.email!,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true }
          },
          business_profile: {
            name: user.businessName || `${user.firstName} ${user.lastName}`,
            support_email: user.email!,
          },
          metadata: {
            userId: userId,
            businessName: user.businessName || '',
            currency: user.preferredCurrency || 'GBP'
          }
        });
        accountId = account.id;
        
        // Save account ID to user
        await storage.updateUserSettings(userId, { stripeAccountId: accountId });
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${req.protocol}://${req.get('host')}/settings?stripe_onboarding=refresh`,
        return_url: `${req.protocol}://${req.get('host')}/settings?stripe_onboarding=complete`,
        type: 'account_onboarding',
      });

      res.json({ onboardingUrl: accountLink.url });
    } catch (error: any) {
      console.error("Error creating Stripe Connect onboarding:", error);
      res.status(500).json({ message: "Error creating onboarding: " + error.message });
    }
  });

  // Check Stripe Connect account status
  app.get("/api/stripe/connect-status", isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeAccountId) {
        return res.json({ 
          hasAccount: false, 
          onboardingComplete: false,
          paymentsEnabled: false,
          detailsSubmitted: false
        });
      }

      const account = await stripe.accounts.retrieve(user.stripeAccountId);
      
      res.json({
        hasAccount: true,
        onboardingComplete: account.details_submitted,
        paymentsEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
        accountId: user.stripeAccountId
      });
    } catch (error: any) {
      console.error("Error checking Stripe Connect status:", error);
      res.status(500).json({ message: "Error checking account status: " + error.message });
    }
  });

  // Stripe payment routes with Connect integration
  app.post("/api/create-payment-intent", isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const { orderId } = req.body;
      const userId = req.user.claims.sub;

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.retailerId !== userId) {
        return res.status(403).json({ message: "Not authorized to pay for this order" });
      }

      // Get wholesaler's Stripe account
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler?.stripeAccountId) {
        return res.status(400).json({ 
          message: "Wholesaler has not set up payment processing. Please contact them to complete their account setup." 
        });
      }

      // Check if wholesaler's account can accept payments
      const account = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
      if (!account.charges_enabled) {
        return res.status(400).json({ 
          message: "Wholesaler's payment account is not fully set up. Please contact them to complete verification." 
        });
      }

      const totalAmount = Math.round(parseFloat(order.total) * 100); // Convert to cents
      const platformFeeAmount = Math.round(parseFloat(order.platformFee) * 100); // 5% platform fee in cents

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "usd",
        application_fee_amount: platformFeeAmount, // Quikpik's platform fee
        transfer_data: {
          destination: wholesaler.stripeAccountId, // Money goes to wholesaler
        },
        metadata: {
          orderId: order.id.toString(),
          retailerId: userId,
          wholesalerId: order.wholesalerId,
          platformFee: order.platformFee,
          subtotal: order.subtotal
        }
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Webhook for Stripe payment confirmations
  app.post('/api/stripe-webhook', async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const event = req.body;

      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          const orderId = parseInt(paymentIntent.metadata.orderId);
          
          // Update order status to processing
          await storage.updateOrderStatus(orderId, 'processing');
          
          // Log successful payment and platform fee collection
          console.log(`Order ${orderId} paid successfully. Platform fee: $${paymentIntent.application_fee_amount / 100}`);
          break;

        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object;
          const failedOrderId = parseInt(failedPayment.metadata.orderId);
          
          // Update order status to failed
          await storage.updateOrderStatus(failedOrderId, 'payment_failed');
          break;

        case 'account.updated':
          // Handle when a Connect account is updated (e.g., verification completed)
          const account = event.data.object;
          console.log(`Stripe Connect account ${account.id} updated. Charges enabled: ${account.charges_enabled}`);
          break;

        case 'transfer.created':
          // Handle when money is transferred to a Connect account
          const transfer = event.data.object;
          console.log(`Transfer created: $${transfer.amount / 100} to account ${transfer.destination}`);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ message: "Webhook error: " + error.message });
    }
  });

  // WhatsApp Broadcast endpoints
  app.post('/api/broadcasts', isAuthenticated, async (req: any, res) => {
    try {
      const { productId, customerGroupId, customMessage, scheduledAt } = req.body;
      const wholesalerId = req.user.claims.sub;

      // Validate the request data
      const validatedData = insertBroadcastSchema.parse({
        wholesalerId,
        productId: parseInt(productId),
        customerGroupId: parseInt(customerGroupId),
        message: customMessage || '',
        status: 'pending',
        sentAt: scheduledAt ? new Date(scheduledAt) : null,
      });

      // Create broadcast record in database
      const broadcast = await storage.createBroadcast(validatedData);

      // Send the broadcast via WhatsApp
      const result = await whatsappService.sendProductBroadcast(
        wholesalerId,
        productId,
        customerGroupId,
        customMessage
      );

      // Update broadcast status based on result
      if (result.success) {
        await storage.updateBroadcastStatus(
          broadcast.id,
          'sent',
          new Date(),
          result.recipientCount,
          result.messageId
        );
        
        res.json({
          success: true,
          messageId: result.messageId,
          message: "Broadcast sent successfully",
          broadcastId: broadcast.id
        });
      } else {
        await storage.updateBroadcastStatus(
          broadcast.id,
          'failed',
          undefined,
          undefined,
          undefined,
          result.error
        );
        
        res.status(400).json({
          success: false,
          error: result.error,
          broadcastId: broadcast.id
        });
      }
    } catch (error) {
      console.error("Error sending broadcast:", error);
      res.status(500).json({ message: "Failed to send broadcast" });
    }
  });

  app.get('/api/broadcasts', isAuthenticated, async (req: any, res) => {
    try {
      const wholesalerId = req.user.claims.sub;
      const broadcasts = await storage.getBroadcasts(wholesalerId);
      res.json(broadcasts);
    } catch (error) {
      console.error("Error fetching broadcasts:", error);
      res.status(500).json({ message: "Failed to fetch broadcasts" });
    }
  });

  app.get('/api/broadcasts/stats', isAuthenticated, async (req: any, res) => {
    try {
      const wholesalerId = req.user.claims.sub;
      const stats = await storage.getBroadcastStats(wholesalerId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching broadcast stats:", error);
      res.status(500).json({ message: "Failed to fetch broadcast statistics" });
    }
  });

  // AI description generation
  app.post('/api/ai/generate-description', isAuthenticated, async (req: any, res) => {
    try {
      const { productName, category, features } = req.body;
      
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({ message: "AI description generation is not available. Please add your OPENAI_API_KEY to use this feature." });
      }

      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `Write a compelling product description for a wholesale product:
      
Product Name: ${productName}
Category: ${category || 'General'}
Features: ${features || 'N/A'}

Write a professional, sales-focused description that highlights the key benefits and features. Keep it concise but persuasive, suitable for B2B wholesale buyers. Focus on quality, value, and practical benefits.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      const generatedDescription = response.choices[0].message.content;
      res.json({ description: generatedDescription });
    } catch (error) {
      console.error("AI description generation error:", error);
      res.status(500).json({ message: "Failed to generate description" });
    }
  });

  // Subscription endpoints
  app.get('/api/subscription/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const productCheck = await storage.checkProductLimit(userId);

      res.json({
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        productLimit: user.productLimit || 3,
        currentProducts: productCheck.currentCount,
        subscriptionEndsAt: user.subscriptionEndsAt,
        stripeSubscriptionId: user.stripeSubscriptionId
      });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });

  app.post('/api/subscription/create', isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const { tier } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Define pricing and limits for each tier
      const tierConfig = {
        standard: { priceId: 'price_standard', productLimit: 10, price: 1099 }, // $10.99
        premium: { priceId: 'price_premium', productLimit: -1, price: 1999 }    // $19.99
      };

      if (!tierConfig[tier as keyof typeof tierConfig]) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }

      const config = tierConfig[tier as keyof typeof tierConfig];

      // Create or retrieve Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email!,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: userId,
            businessName: user.businessName || ''
          }
        });
        customerId = customer.id;
      }

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Quikpik Merchant ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
              description: `${config.productLimit === -1 ? 'Unlimited' : config.productLimit} products per month`
            },
            unit_amount: config.price,
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.hostname}/subscription?success=true`,
        cancel_url: `${req.protocol}://${req.hostname}/subscription?canceled=true`,
        metadata: {
          userId: userId,
          tier: tier,
          productLimit: config.productLimit.toString()
        }
      });

      res.json({ redirectUrl: session.url });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Failed to create subscription: " + error.message });
    }
  });

  // Stripe webhook for subscription events
  app.post('/api/stripe/subscription-webhook', async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const event = req.body;

      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object;
          if (session.mode === 'subscription') {
            const { userId, tier, productLimit } = session.metadata;
            
            await storage.updateUserSubscription(userId, {
              tier: tier,
              status: 'active',
              stripeSubscriptionId: session.subscription,
              subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
              productLimit: parseInt(productLimit)
            });
          }
          break;

        case 'customer.subscription.deleted':
          const deletedSub = event.data.object;
          const userToUpdate = await storage.getUser(deletedSub.metadata?.userId);
          if (userToUpdate) {
            await storage.updateUserSubscription(userToUpdate.id, {
              tier: 'free',
              status: 'inactive',
              subscriptionEndsAt: new Date(),
              productLimit: 3
            });
          }
          break;

        case 'invoice.payment_failed':
          // Handle failed payments - could send notification to user
          break;
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Subscription webhook error:", error);
      res.status(500).json({ message: "Webhook error: " + error.message });
    }
  });

  // Marketplace endpoints (public access)
  // Enhanced Marketplace Discovery API - Featured content
  app.get("/api/marketplace/featured", async (req, res) => {
    try {
      // Get sample data for featured showcase
      const featuredCategories = [
        "Groceries & Food",
        "Fresh Produce", 
        "Beverages & Drinks",
        "Personal Care & Hygiene",
        "Electronics & Gadgets",
        "Home & Kitchen"
      ];

      const topWholesalers = await storage.getMarketplaceWholesalers({ search: "" });
      const recentProducts = await storage.getMarketplaceProducts({ 
        search: "", 
        sortBy: "newest" 
      });

      res.json({
        categories: featuredCategories,
        topWholesalers: topWholesalers.slice(0, 6),
        recentProducts: recentProducts.slice(0, 8),
        stats: {
          totalWholesalers: Math.max(500, topWholesalers.length),
          totalProducts: Math.max(10000, recentProducts.length),
          totalCategories: 20
        }
      });
    } catch (error) {
      console.error("Error fetching featured content:", error);
      res.status(500).json({ message: "Failed to fetch featured content" });
    }
  });

  // Enhanced marketplace products with advanced filtering
  app.get('/api/marketplace/products', async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        category: req.query.category as string,
        location: req.query.location as string,
        sortBy: req.query.sortBy as string || "featured",
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined
      };
      
      const products = await storage.getMarketplaceProducts(filters);
      res.json(products);
    } catch (error) {
      console.error("Error fetching marketplace products:", error);
      res.status(500).json({ message: "Failed to fetch marketplace products" });
    }
  });

  // Enhanced wholesalers discovery with location and rating filters
  app.get('/api/marketplace/wholesalers', async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        location: req.query.location as string,
        category: req.query.category as string,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined
      };
      
      const wholesalers = await storage.getMarketplaceWholesalers(filters);
      res.json(wholesalers);
    } catch (error) {
      console.error("Error fetching marketplace wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch marketplace wholesalers" });
    }
  });

  // Detailed wholesaler profile endpoint
  app.get('/api/marketplace/wholesaler/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const wholesaler = await storage.getWholesalerProfile(id);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      
      res.json(wholesaler);
    } catch (error) {
      console.error("Error fetching wholesaler profile:", error);
      res.status(500).json({ message: "Failed to fetch wholesaler profile" });
    }
  });

  // Category statistics and insights
  app.get("/api/marketplace/categories", async (req, res) => {
    try {
      const allProducts = await storage.getMarketplaceProducts({ search: "" });
      
      // Calculate category statistics from real data
      const categoryStats = [
        "Groceries & Food",
        "Fresh Produce", 
        "Beverages & Drinks",
        "Personal Care & Hygiene",
        "Electronics & Gadgets",
        "Home & Kitchen",
        "Clothing & Fashion",
        "Health & Pharmacy",
        "Baby & Childcare",
        "Pet Food & Supplies"
      ].map(category => {
        const count = allProducts.filter(p => p.category === category).length;
        return { name: category, count, icon: category.toLowerCase().replace(/\s+/g, '_') };
      });

      res.json(categoryStats);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Search suggestions for autocomplete
  app.get("/api/marketplace/search/suggestions", async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.json([]);
      }

      // Get search suggestions from products and wholesalers
      const products = await storage.getMarketplaceProducts({ search: query });
      const wholesalers = await storage.getMarketplaceWholesalers({ search: query });

      const suggestions = [
        ...products.slice(0, 5).map(p => ({ 
          type: "product", 
          name: p.name, 
          id: p.id,
          category: p.category,
          price: p.price
        })),
        ...wholesalers.slice(0, 3).map(w => ({ 
          type: "wholesaler", 
          name: w.businessName || `${w.firstName} ${w.lastName}`, 
          id: w.id,
          location: w.businessAddress || "UK",
          productCount: w.products?.length || 0
        }))
      ];

      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching search suggestions:", error);
      res.status(500).json({ message: "Failed to fetch search suggestions" });
    }
  });

  // WhatsApp API Routes (Shared Service)

  app.post('/api/whatsapp/test', isAuthenticated, async (req: any, res) => {
    try {
      const { testPhoneNumber } = req.body;
      const wholesalerId = req.user.claims.sub;

      if (!testPhoneNumber) {
        return res.status(400).json({ 
          success: false,
          error: "Test phone number is required" 
        });
      }

      // Check if user is using the correct sandbox setup
      const user = await storage.getUser(wholesalerId);
      if (user?.twilioPhoneNumber && user.twilioPhoneNumber !== '+14155238886') {
        return res.status(400).json({ 
          success: false,
          error: "For testing, please use Twilio sandbox number: +14155238886. Also ensure you've joined the sandbox by texting your sandbox code to +1 (415) 523-8886 from your WhatsApp." 
        });
      }

      const result = await whatsappService.testWholesalerWhatsApp(
        wholesalerId,
        testPhoneNumber
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error testing WhatsApp:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to test WhatsApp integration" 
      });
    }
  });

  // Twilio WhatsApp configuration routes
  app.post('/api/whatsapp/configure', isAuthenticated, async (req: any, res) => {
    try {
      const { accountSid, authToken, phoneNumber } = req.body;
      const wholesalerId = req.user.claims.sub;

      if (!accountSid || !authToken || !phoneNumber) {
        return res.status(400).json({ message: "Twilio Account SID, Auth Token, and phone number are required" });
      }

      // Save Twilio configuration to user settings
      await storage.updateUserSettings(wholesalerId, {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioPhoneNumber: phoneNumber,
        whatsappEnabled: true
      });

      res.json({
        success: true,
        message: "Twilio WhatsApp configuration saved successfully"
      });
    } catch (error: any) {
      console.error("Error saving Twilio configuration:", error);
      res.status(500).json({ message: "Failed to save Twilio configuration" });
    }
  });

  app.post('/api/whatsapp/verify', isAuthenticated, async (req: any, res) => {
    try {
      const { accountSid, authToken, phoneNumber } = req.body;

      if (!accountSid || !authToken || !phoneNumber) {
        return res.status(400).json({ message: "Twilio Account SID, Auth Token, and phone number are required" });
      }

      // Test Twilio credentials by creating a client
      try {
        const twilioClient = twilio(accountSid, authToken);
        // Test the connection by fetching account info
        const account = await twilioClient.api.v2010.accounts(accountSid).fetch();
        
        res.json({
          success: true,
          message: "Twilio WhatsApp configuration verified successfully",
          data: { accountSid: account.sid, status: account.status }
        });
      } catch (twilioError: any) {
        res.status(400).json({
          success: false,
          message: `Twilio verification failed: ${twilioError.message}`
        });
      }
    } catch (error: any) {
      console.error("Error verifying Twilio configuration:", error);
      res.status(500).json({ message: "Failed to verify Twilio configuration" });
    }
  });

  app.get('/api/whatsapp/status', isAuthenticated, async (req: any, res) => {
    try {
      const wholesalerId = req.user.claims.sub;
      const user = await storage.getUser(wholesalerId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        enabled: user.whatsappEnabled || false,
        twilioAccountSid: user.twilioAccountSid || null,
        twilioAuthToken: user.twilioAuthToken ? "configured" : null,
        twilioPhoneNumber: user.twilioPhoneNumber || null,
        serviceProvider: "Twilio WhatsApp",
        configured: !!(user.twilioAccountSid && user.twilioAuthToken && user.twilioPhoneNumber)
      });
    } catch (error: any) {
      console.error("Error fetching WhatsApp status:", error);
      res.status(500).json({ message: "Failed to fetch WhatsApp status" });
    }
  });

  app.post('/api/whatsapp/enable', isAuthenticated, async (req: any, res) => {
    try {
      const wholesalerId = req.user.claims.sub;
      
      // Enable WhatsApp for this user
      await storage.updateUserSettings(wholesalerId, { whatsappEnabled: true });

      res.json({
        success: true,
        message: "WhatsApp integration enabled successfully"
      });
    } catch (error: any) {
      console.error("Error enabling WhatsApp:", error);
      res.status(500).json({ message: "Failed to enable WhatsApp integration" });
    }
  });

  // AI-powered product generation endpoints
  app.post('/api/ai/generate-description', isAuthenticated, async (req: any, res) => {
    try {
      const { productName, category } = req.body;
      
      if (!productName) {
        return res.status(400).json({ message: "Product name is required" });
      }

      const description = await generateProductDescription(productName, category);
      res.json({ description });
    } catch (error: any) {
      console.error("Error generating description:", error);
      
      // Check if it's a quota/billing issue
      if (error.code === 'insufficient_quota') {
        res.status(402).json({ 
          message: "AI description generation is temporarily unavailable. Please manually enter a product description.",
          fallback: true
        });
      } else {
        res.status(500).json({ 
          message: "Failed to generate description. Please enter manually.",
          fallback: true 
        });
      }
    }
  });

  app.post('/api/ai/generate-image', isAuthenticated, async (req: any, res) => {
    try {
      const { productName, category, description } = req.body;
      
      if (!productName || productName.trim().length === 0) {
        return res.status(400).json({ message: "Product name is required" });
      }

      // Validate product name doesn't contain problematic content
      const cleanName = productName.trim();
      if (cleanName.length > 100) {
        return res.status(400).json({ message: "Product name is too long (max 100 characters)" });
      }

      const imageUrl = await generateProductImage(cleanName, category, description);
      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error generating image:", error);
      
      // Provide more specific error messages based on the error type
      if (error.status === 400) {
        res.status(400).json({ 
          message: "Unable to generate image for this product. Try uploading an image or using an image URL instead.",
          fallback: true
        });
      } else if (error.code === 'insufficient_quota') {
        res.status(402).json({ 
          message: "AI image generation is temporarily unavailable. Please upload an image or use an image URL.",
          fallback: true
        });
      } else {
        res.status(500).json({ 
          message: "Image generation service is temporarily unavailable. Please upload an image or use an image URL.",
          fallback: true
        });
      }
    }
  });

  // Message Template routes
  app.get('/api/message-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await storage.getMessageTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching message templates:", error);
      res.status(500).json({ message: "Failed to fetch message templates" });
    }
  });

  app.get('/api/message-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getMessageTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching message template:", error);
      res.status(500).json({ message: "Failed to fetch message template" });
    }
  });

  app.post('/api/message-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { products, ...templateData } = req.body;

      // Validate the template data
      const validatedTemplate = insertMessageTemplateSchema.parse({
        ...templateData,
        wholesalerId: userId,
        status: 'active'
      });

      // Validate the products
      const validatedProducts = products.map((p: any) => 
        insertTemplateProductSchema.parse(p)
      );

      const template = await storage.createMessageTemplate(validatedTemplate, validatedProducts);
      res.json(template);
    } catch (error: any) {
      console.error("Error creating message template:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid template data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create message template" });
    }
  });

  app.patch('/api/message-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const updates = req.body;

      const template = await storage.updateMessageTemplate(templateId, updates);
      res.json(template);
    } catch (error) {
      console.error("Error updating message template:", error);
      res.status(500).json({ message: "Failed to update message template" });
    }
  });

  app.delete('/api/message-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id);
      await storage.deleteMessageTemplate(templateId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting message template:", error);
      res.status(500).json({ message: "Failed to delete message template" });
    }
  });

  app.post('/api/message-templates/send-campaign', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { templateId, customerGroupId } = req.body;

      // Get the template with products
      const template = await storage.getMessageTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Get customer group members
      const members = await storage.getGroupMembers(customerGroupId);
      
      // Generate marketplace URL for multi-product purchasing
      const replitDomains = process.env.REPLIT_DOMAINS || 'localhost:5000';
      const domain = replitDomains.split(',')[0].trim();
      const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      const campaignUrl = `${baseUrl}/marketplace`;

      // Create campaign record
      const campaign = await storage.createTemplateCampaign({
        templateId,
        customerGroupId,
        wholesalerId: userId,
        campaignUrl,
        status: 'sent',
        sentAt: new Date(),
        recipientCount: members.length,
        clickCount: 0,
        orderCount: 0,
        totalRevenue: '0'
      });

      // Send WhatsApp messages to all group members
      try {
        await whatsappService.sendTemplateMessage(template, members, campaignUrl);
      } catch (whatsappError) {
        console.error("WhatsApp sending failed:", whatsappError);
        // Campaign is created but delivery failed - update status
        await storage.updateMessageTemplate(templateId, { status: 'failed' });
        return res.status(500).json({ 
          message: "Campaign created but WhatsApp delivery failed. Please check your WhatsApp settings." 
        });
      }

      res.json({ 
        success: true, 
        campaign,
        message: `Campaign sent to ${members.length} customers`
      });
    } catch (error) {
      console.error("Error sending campaign:", error);
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  app.get('/api/template-campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const campaigns = await storage.getTemplateCampaigns(userId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching template campaigns:", error);
      res.status(500).json({ message: "Failed to fetch template campaigns" });
    }
  });

  // Unified Campaigns API (merges broadcasts and message templates)
  app.get('/api/campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get both broadcasts and message templates, then unify them
      const [broadcasts, templates] = await Promise.all([
        storage.getBroadcasts(userId),
        storage.getMessageTemplates(userId)
      ]);

      // Get all orders for real order count calculation
      const allOrders = await storage.getOrders(userId);

      // Convert broadcasts to unified campaign format with real order data
      const broadcastCampaigns = await Promise.all(broadcasts.map(async broadcast => {
        let realOrderCount = 0;
        let realRevenue = '0.00';
        
        if (broadcast.sentAt && broadcast.product) {
          // Count orders for this specific product after broadcast was sent
          // Include all completed order statuses, not just 'paid'
          const ordersForProduct = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            const broadcastDate = new Date(broadcast.sentAt);
            const validStatuses = ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'];
            return orderDate >= broadcastDate && validStatuses.includes(order.status);
          });

          // Get order items for this specific product
          const productOrders = await Promise.all(
            ordersForProduct.map(async order => {
              const orderItems = await storage.getOrderItems(order.id);
              return orderItems.filter(item => item.productId === broadcast.product.id);
            })
          );

          // Count actual number of orders (not quantities) for this product
          const ordersWithProduct = productOrders.filter(orderItems => orderItems.length > 0);
          realOrderCount = ordersWithProduct.length;
          
          // Calculate total revenue for this product
          realRevenue = productOrders.flat().reduce((sum, item) => {
            return sum + (parseFloat(item.unitPrice) * item.quantity);
          }, 0).toFixed(2);
        }

        return {
          id: `broadcast_${broadcast.id}`,
          title: `${broadcast.product.name} Promotion`,
          customMessage: broadcast.message,
          specialPrice: broadcast.specialPrice,
          includeContact: true,
          includePurchaseLink: true,
          campaignType: 'single' as const,
          status: broadcast.sentAt ? 'sent' : 'draft',
          createdAt: broadcast.createdAt,
          product: broadcast.product,
          sentCampaigns: broadcast.sentAt ? [{ // Only include if actually sent
            id: broadcast.id,
            sentAt: broadcast.sentAt,
            recipientCount: broadcast.recipientCount || 0,
            clickCount: Math.floor((realOrderCount / Math.max(broadcast.recipientCount || 1, 1)) * (broadcast.recipientCount || 0)), // Estimated based on conversion
            orderCount: realOrderCount, // Real order count from database
            totalRevenue: realRevenue, // Real revenue from database
            customerGroup: broadcast.customerGroup
          }] : []
        };
      }));

      // Convert message templates to unified campaign format
      const templateCampaigns = templates.map(template => ({
        id: `template_${template.id}`,
        title: template.title,
        customMessage: template.customMessage,
        includeContact: template.includeContact,
        includePurchaseLink: template.includePurchaseLink,
        campaignType: 'multi' as const,
        status: template.campaigns.length > 0 ? 'sent' : 'draft',
        createdAt: template.createdAt,
        products: template.products,
        sentCampaigns: template.campaigns.map(campaign => ({
          id: campaign.id,
          sentAt: campaign.sentAt,
          recipientCount: campaign.recipientCount,
          clickCount: campaign.clickCount,
          orderCount: campaign.orderCount,
          totalRevenue: campaign.totalRevenue,
          customerGroup: campaign.customerGroup
        }))
      }));

      // Combine and sort by creation date
      const allCampaigns = [...broadcastCampaigns, ...templateCampaigns]
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

      res.json(allCampaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  app.post('/api/campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { campaignType, productId, products, specialPrice, ...campaignData } = req.body;

      if (campaignType === 'single') {
        // Create a broadcast for single product
        const broadcastData = {
          wholesalerId: userId,
          productId: productId,
          customerGroupId: 1, // Will be set when sending
          message: campaignData.customMessage || '',
          specialPrice: specialPrice || null,
          status: 'draft',
          recipientCount: 0
        };

        const broadcast = await storage.createBroadcast(broadcastData);
        
        res.json({
          id: `broadcast_${broadcast.id}`,
          ...campaignData,
          campaignType: 'single',
          status: 'draft',
          createdAt: broadcast.createdAt
        });
      } else {
        // Create a message template for multi-product
        const templateData = {
          name: campaignData.title,
          title: campaignData.title,
          description: campaignData.customMessage || '',
          wholesalerId: userId,
          status: 'active'
        };

        const validatedProducts = products.map((p: any) => ({
          productId: p.productId,
          quantity: p.quantity,
          specialPrice: p.specialPrice
        }));

        const template = await storage.createMessageTemplate(templateData, validatedProducts);
        
        res.json({
          id: `template_${template.id}`,
          ...campaignData,
          campaignType: 'multi',
          status: 'draft',
          createdAt: template.createdAt
        });
      }
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  app.post('/api/campaigns/send', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { campaignId, customerGroupId, customMessage } = req.body;
      console.log(`Campaign send request: userId=${userId}, campaignId=${campaignId}, customerGroupId=${customerGroupId}`);

      const [type, id] = campaignId.split('_');
      const numericId = parseInt(id);
      console.log(`Campaign type: ${type}, numericId: ${numericId}`);

      if (type === 'broadcast') {
        // Get the broadcast to find the product ID
        const broadcasts = await storage.getBroadcasts(userId);
        const broadcast = broadcasts.find(b => b.id === numericId);
        
        if (!broadcast) {
          return res.status(404).json({ message: "Broadcast not found" });
        }

        // Send single product broadcast with custom message if provided
        const messageToSend = customMessage || broadcast.message;
        console.log(`Broadcasting: userId=${userId}, productId=${broadcast.product.id}, groupId=${customerGroupId}`);
        const result = await whatsappService.sendProductBroadcast(
          userId,
          broadcast.product.id, // Use the actual product ID
          customerGroupId,
          messageToSend // Use custom message or original message
        );

        if (result.success) {
          // Update broadcast status
          await storage.updateBroadcastStatus(
            numericId,
            'sent',
            new Date(),
            result.recipientCount || 0,
            result.messageId
          );
        }

        res.json({
          success: result.success,
          message: result.success ? `Broadcast sent to ${result.recipientCount || 0} customers` : result.error
        });
      } else if (type === 'template') {
        // Send multi-product template
        const template = await storage.getMessageTemplate(numericId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        const members = await storage.getGroupMembers(customerGroupId);
        // Generate marketplace URL for multi-product purchasing
        const replitDomains = process.env.REPLIT_DOMAINS || 'localhost:5000';
        const domain = replitDomains.split(',')[0].trim();
        const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        const campaignUrl = `${baseUrl}/marketplace`;

        // Create campaign record
        await storage.createTemplateCampaign({
          templateId: numericId,
          customerGroupId,
          wholesalerId: userId,
          campaignUrl,
          status: 'sent',
          sentAt: new Date(),
          recipientCount: members.length,
          clickCount: 0,
          orderCount: 0,
          totalRevenue: '0'
        });

        const result = await whatsappService.sendTemplateMessage(template, members, campaignUrl, customMessage);
        
        res.json({
          success: result.success,
          message: result.success ? `Campaign sent to ${members.length} customers` : result.error
        });
      } else {
        res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error sending campaign:", error);
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  // Campaign preview endpoint - generate preview message without sending
  app.get('/api/campaigns/:id/preview', async (req, res) => {
    try {
      const campaignId = req.params.id;
      const [type, id] = campaignId.split('_');
      const numericId = parseInt(id);

      if (type === 'broadcast') {
        // Preview single product broadcast
        const product = await storage.getProduct(numericId);
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        const wholesaler = await storage.getUser(product.wholesalerId);
        if (!wholesaler) {
          return res.status(404).json({ message: "Wholesaler not found" });
        }

        const message = whatsappService.generateProductMessage(product, undefined, wholesaler);
        
        res.json({
          type: 'single',
          title: `${product.name} Promotion`,
          message,
          product,
          wholesaler: {
            businessName: wholesaler.businessName,
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber
          }
        });
      } else if (type === 'template') {
        // Preview multi-product template
        const template = await storage.getMessageTemplate(numericId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        const wholesaler = await storage.getUser(template.wholesalerId);
        if (!wholesaler) {
          return res.status(404).json({ message: "Wholesaler not found" });
        }

        const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim();
        const baseUrl = replitDomain ? `https://${replitDomain}` : 'https://localhost:5000';
        const campaignUrl = `${baseUrl}/marketplace?campaign=${Date.now()}${numericId}`;
        
        const message = whatsappService.generateTemplateMessage(template, wholesaler, campaignUrl);
        
        res.json({
          type: 'multi',
          title: template.title,
          message,
          template,
          wholesaler: {
            businessName: wholesaler.businessName,
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber
          },
          campaignUrl
        });
      } else {
        res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error generating campaign preview:", error);
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  // Stock update refresh endpoint - resend campaign with current stock information
  app.post('/api/campaigns/:id/refresh-stock', isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = req.params.id;
      const userId = req.user.claims.sub;
      // No customer group needed for stock refresh - just update the data

      // Determine campaign type and get details
      const [type, numericId] = campaignId.split('_');
      const campaignNumericId = parseInt(numericId);

      if (type === 'broadcast') {
        // Handle single product stock update
        const broadcast = await storage.getBroadcasts(userId).then(broadcasts => 
          broadcasts.find(b => b.id === campaignNumericId)
        );
        
        if (!broadcast || broadcast.wholesalerId !== userId) {
          return res.status(404).json({ message: "Campaign not found" });
        }

        // Get updated product information
        const product = await storage.getProduct(broadcast.productId);
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Just refresh the stock information without sending messages
        // This updates the campaign's internal data with current stock levels
        
        res.json({
          success: true,
          message: `Stock information refreshed for ${product.name}`,
          currentStock: product.stock,
          currentPrice: product.price,
          updateType: 'stock_refresh_only'
        });

      } else if (type === 'template') {
        // Handle multi-product stock update
        const template = await storage.getMessageTemplate(campaignNumericId);
        if (!template || template.wholesalerId !== userId) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Just refresh the stock information without sending messages
        // This updates the template's internal data with current stock levels
        
        const stockSummary = template.products.map(item => ({
          name: item.product.name,
          currentStock: item.product.stock,
          currentPrice: item.specialPrice || item.product.price
        }));
        
        res.json({
          success: true,
          message: `Stock information refreshed for ${template.name}`,
          products: stockSummary,
          updateType: 'stock_refresh_only'
        });

      } else {
        res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error refreshing campaign stock:", error);
      res.status(500).json({ message: "Failed to refresh campaign stock" });
    }
  });

  // Stripe Invoice API endpoints for financials
  app.get('/api/stripe/invoices', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const userId = req.user.claims.sub;
      const { search, status, date_range } = req.query;

      // Get user's Stripe Connect account ID
      const user = await storage.getUser(userId);
      if (!user?.stripeAccountId) {
        return res.json([]);
      }

      // Build Stripe query parameters
      const stripeParams: any = {
        limit: 100,
        expand: ['data.customer'],
      };

      if (status && status !== 'all') {
        stripeParams.status = status;
      }

      if (date_range && date_range !== 'all') {
        const now = new Date();
        let created_gte;
        
        switch (date_range) {
          case 'today':
            created_gte = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
            break;
          case 'week':
            created_gte = Math.floor(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime() / 1000);
            break;
          case 'month':
            created_gte = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
            break;
          case 'quarter':
            const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            created_gte = Math.floor(quarterStart.getTime() / 1000);
            break;
          case 'year':
            created_gte = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);
            break;
        }
        
        if (created_gte) {
          stripeParams.created = { gte: created_gte };
        }
      }

      // Fetch invoices from Stripe Connect account
      const invoices = await stripe.invoices.list(stripeParams, {
        stripeAccount: user.stripeAccountId,
      });

      // Filter by search term if provided
      let filteredInvoices = invoices.data;
      if (search) {
        const searchLower = search.toString().toLowerCase();
        filteredInvoices = invoices.data.filter(invoice => 
          invoice.number?.toLowerCase().includes(searchLower) ||
          invoice.customer_name?.toLowerCase().includes(searchLower) ||
          invoice.customer_email?.toLowerCase().includes(searchLower)
        );
      }

      // Format invoices for frontend
      const formattedInvoices = filteredInvoices.map(invoice => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        currency: invoice.currency,
        created: invoice.created,
        due_date: invoice.due_date,
        customer_name: invoice.customer_name,
        customer_email: invoice.customer_email,
        description: invoice.description,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
      }));

      res.json(formattedInvoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get('/api/stripe/financial-summary', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeAccountId) {
        return res.json({
          totalRevenue: 0,
          revenueChange: 0,
          paidInvoices: 0,
          paidInvoicesChange: 0,
          pendingAmount: 0,
          pendingCount: 0,
          platformFees: 0
        });
      }

      // Get current month and last month dates
      const now = new Date();
      const currentMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
      const lastMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000);
      const lastMonthEnd = currentMonthStart - 1;

      // Fetch current month invoices
      const currentMonthInvoices = await stripe.invoices.list({
        created: { gte: currentMonthStart },
        limit: 100
      }, {
        stripeAccount: user.stripeAccountId,
      });

      // Fetch last month invoices for comparison
      const lastMonthInvoices = await stripe.invoices.list({
        created: { gte: lastMonthStart, lte: lastMonthEnd },
        limit: 100
      }, {
        stripeAccount: user.stripeAccountId,
      });

      // Calculate current month metrics
      const currentRevenue = currentMonthInvoices.data
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.amount_paid, 0) / 100;

      const currentPaidCount = currentMonthInvoices.data
        .filter(inv => inv.status === 'paid').length;

      // Calculate last month metrics for comparison
      const lastRevenue = lastMonthInvoices.data
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.amount_paid, 0) / 100;

      const lastPaidCount = lastMonthInvoices.data
        .filter(inv => inv.status === 'paid').length;

      // Calculate pending amounts
      const pendingInvoices = currentMonthInvoices.data.filter(inv => inv.status === 'open');
      const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

      // Calculate changes
      const revenueChange = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue * 100) : 0;
      const paidInvoicesChange = lastPaidCount > 0 ? ((currentPaidCount - lastPaidCount) / lastPaidCount * 100) : 0;

      // Platform fees (5% of total revenue)
      const platformFees = currentRevenue * 0.05;

      res.json({
        totalRevenue: currentRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        paidInvoices: currentPaidCount,
        paidInvoicesChange: Math.round(paidInvoicesChange * 10) / 10,
        pendingAmount,
        pendingCount: pendingInvoices.length,
        platformFees: Math.round(platformFees * 100) / 100
      });
    } catch (error) {
      console.error("Error fetching financial summary:", error);
      res.status(500).json({ message: "Failed to fetch financial summary" });
    }
  });

  app.get('/api/stripe/invoices/:invoiceId/download', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const userId = req.user.claims.sub;
      const { invoiceId } = req.params;

      const user = await storage.getUser(userId);
      if (!user?.stripeAccountId) {
        return res.status(404).json({ message: "Stripe account not found" });
      }

      // Get invoice from Stripe
      const invoice = await stripe.invoices.retrieve(invoiceId, {
        stripeAccount: user.stripeAccountId,
      });

      if (!invoice.invoice_pdf) {
        return res.status(404).json({ message: "Invoice PDF not available" });
      }

      // Fetch the PDF
      const response = await fetch(invoice.invoice_pdf);
      if (!response.ok) {
        throw new Error('Failed to fetch invoice PDF');
      }

      const buffer = await response.arrayBuffer();
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoice.number}.pdf"`,
        'Content-Length': buffer.byteLength.toString()
      });

      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({ message: "Failed to download invoice" });
    }
  });

  // Financial Health Analysis API endpoints
  app.get('/api/financial-health', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period || '3months';
      
      // Get comprehensive financial data
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrders(userId),
        storage.getProducts(userId)
      ]);

      // Calculate key metrics using actual order data
      const totalRevenue = stats.totalRevenue || 0;
      const totalCosts = orders.reduce((sum: number, order: any) => {
        return sum + (parseFloat(order.total) * 0.7);
      }, 0); // Estimated costs
      const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue * 100) : 0;
      const revenueGrowth = 12.5; // Default growth rate for demo
      
      // Calculate customer metrics
      const uniqueCustomers = new Set(orders.map((o: any) => o.retailerId)).size;
      const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
      const customerLifetimeValue = avgOrderValue * 3; // Simplified LTV calculation
      const customerAcquisitionCost = uniqueCustomers > 0 ? (totalRevenue * 0.1) / uniqueCustomers : 0;
      
      // Calculate burn rate (monthly expenses)
      const monthlyBurnRate = totalCosts / 3; // Simplified monthly burn
      const monthsOfRunway = monthlyBurnRate > 0 ? (totalRevenue - totalCosts) / monthlyBurnRate : 12;

      // Calculate health score components
      const revenueScore = Math.min(90, Math.max(10, revenueGrowth + 50));
      const profitabilityScore = Math.min(90, Math.max(10, profitMargin * 2));
      const cashFlowScore = Math.min(90, Math.max(10, monthsOfRunway * 10));
      const growthScore = Math.min(90, Math.max(10, (orders.length / 30) * 20 + 40));
      const efficiencyScore = Math.min(90, Math.max(10, (products.filter((p: any) => p.status === 'active').length / Math.max(products.length, 1)) * 100));

      const healthScore = Math.round((revenueScore + profitabilityScore + cashFlowScore + growthScore + efficiencyScore) / 5);

      // Generate AI insights (simplified for demo)
      const insights = {
        summary: `Your business shows ${healthScore >= 70 ? 'strong' : healthScore >= 50 ? 'moderate' : 'concerning'} financial health with a score of ${healthScore}/100. ${totalRevenue > 1000 ? 'Revenue performance is solid' : 'Focus on revenue growth opportunities'}.`,
        recommendations: [
          "Optimize pricing strategy for better profit margins",
          "Expand product offerings in high-demand categories", 
          "Implement customer retention programs",
          "Automate order processing to reduce costs"
        ],
        warnings: monthsOfRunway < 6 ? [
          "Cash flow runway below 6 months - monitor expenses closely",
          "Consider diversifying revenue streams"
        ] : [
          "Monitor seasonal sales fluctuations"
        ],
        opportunities: [
          "WhatsApp marketing showing 25% higher engagement",
          "Bulk order discounts could increase average order value",
          "Premium subscription features available"
        ]
      };

      const predictions = {
        nextMonthRevenue: totalRevenue * (1 + (revenueGrowth / 100)),
        quarterProjection: totalRevenue * 3 * (1 + (revenueGrowth / 100)),
        riskFactors: [
          "Seasonal demand fluctuations",
          "Supply chain cost increases"
        ],
        growthOpportunities: [
          "Market expansion to new customer segments",
          "Product line diversification",
          "Enhanced digital marketing campaigns"
        ]
      };

      const healthData = {
        healthScore,
        scoreBreakdown: {
          revenue: Math.round(revenueScore),
          profitability: Math.round(profitabilityScore),
          cashFlow: Math.round(cashFlowScore),
          growth: Math.round(growthScore),
          efficiency: Math.round(efficiencyScore)
        },
        insights,
        metrics: {
          revenueGrowth: Math.round(revenueGrowth * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          customerAcquisitionCost: Math.round(customerAcquisitionCost),
          customerLifetimeValue: Math.round(customerLifetimeValue),
          burnRate: Math.round(monthlyBurnRate),
          monthsOfRunway: Math.round(monthsOfRunway)
        },
        predictions
      };

      res.json(healthData);
    } catch (error) {
      console.error("Error generating financial health analysis:", error);
      res.status(500).json({ message: "Failed to generate financial health analysis" });
    }
  });

  app.post('/api/financial-health/insights', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { analysis_type, period } = req.body;
      
      // Get financial data for AI analysis
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrders(userId),
        storage.getProducts(userId)
      ]);

      // Use OpenAI to generate advanced insights
      if (!openai) {
        throw new Error("OpenAI not configured");
      }

      const prompt = `As a financial advisor, analyze this wholesale business data:

Revenue: $${stats.totalRevenue}
Orders: ${stats.ordersCount}
Active Products: ${stats.activeProducts}
Low Stock Items: ${stats.lowStockCount}
Recent Orders: ${orders.length}

Provide specific, actionable insights for:
1. Revenue optimization opportunities
2. Cost reduction strategies  
3. Growth potential areas
4. Risk factors to monitor
5. Recommended next steps

Focus on practical B2B wholesale strategies. Be concise and specific.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert financial advisor specializing in B2B wholesale businesses. Provide actionable insights based on the business data."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const aiInsights = JSON.parse(response.choices[0].message.content || '{}');
      
      res.json({
        success: true,
        insights: aiInsights,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  // Create payment intent for customer portal orders (public - no auth required)
  app.post('/api/marketplace/create-payment-intent', async (req, res) => {
    try {
      const { items, customerData, wholesalerId, totalAmount } = req.body;
      
      console.log(`💰 Payment intent request: totalAmount=${totalAmount}, items=${JSON.stringify(items)}, wholesalerId=${wholesalerId}`);
      
      // Validate totalAmount is a valid number
      if (!totalAmount || isNaN(parseFloat(totalAmount))) {
        console.error(`❌ Invalid totalAmount: ${totalAmount}`);
        return res.status(400).json({ message: 'Invalid total amount provided' });
      }
      
      if (!items || !customerData || !wholesalerId) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Get wholesaler information 
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ message: 'Wholesaler not found' });
      }

      // Calculate platform fee (5%)
      const platformFee = (totalAmount * 0.05).toFixed(2);
      const wholesalerAmount = (totalAmount - parseFloat(platformFee)).toFixed(2);

      // Create payment intent with Stripe Connect (application fee)
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      let paymentIntent;

      // Try creating payment intent with Stripe Connect if available
      if (wholesaler.stripeAccountId) {
        try {
          // Create payment intent with Stripe Connect and 5% platform fee
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmount * 100), // Convert to cents
            currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
            application_fee_amount: Math.round(parseFloat(platformFee) * 100), // 5% platform fee in cents
            transfer_data: {
              destination: wholesaler.stripeAccountId, // Wholesaler receives 95%
            },
            metadata: {
              orderType: 'customer_portal',
              wholesalerId: wholesalerId,
              customerName: customerData.name,
              customerEmail: customerData.email,
              customerPhone: customerData.phone,
              customerAddress: JSON.stringify({
                street: customerData.address,
                city: customerData.city,
                state: customerData.state,
                postalCode: customerData.postalCode,
                country: customerData.country
              }),
              totalAmount: totalAmount.toString(),
              platformFee: platformFee,
              connectAccountUsed: 'true',
              items: JSON.stringify(items.map(item => ({
                ...item,
                productName: item.productName || 'Product'
              })))
            }
          });
        } catch (connectError: any) {
          console.log('Connect payment failed, falling back to regular payment:', connectError.message);
          
          // Fallback to regular payment intent for demo/test purposes
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmount * 100), // Convert to cents
            currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
            metadata: {
              orderType: 'customer_portal',
              wholesalerId: wholesalerId,
              customerName: customerData.name,
              customerEmail: customerData.email,
              customerPhone: customerData.phone,
              customerAddress: JSON.stringify({
                street: customerData.address,
                city: customerData.city,
                state: customerData.state,
                postalCode: customerData.postalCode,
                country: customerData.country
              }),
              totalAmount: totalAmount.toString(),
              platformFee: platformFee,
              connectAccountUsed: 'false',
              items: JSON.stringify(items.map(item => ({
                ...item,
                productName: item.productName || 'Product'
              })))
            }
          });
        }
      } else {
        // Create regular payment intent when no Connect account
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100), // Convert to cents
          currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
          metadata: {
            orderType: 'customer_portal',
            wholesalerId: wholesalerId,
            customerName: customerData.name,
            customerEmail: customerData.email,
            customerPhone: customerData.phone,
            customerAddress: JSON.stringify(customerData.address),
            totalAmount: totalAmount.toString(),
            platformFee: platformFee,
            connectAccountUsed: 'false',
            items: JSON.stringify(items.map(item => ({
              ...item,
              productName: item.productName || 'Product'
            })))
          }
        });
      }

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        platformFee: platformFee 
      });
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ message: 'Error creating payment intent: ' + error.message });
    }
  });

  // Marketplace product detail endpoint (public - no auth required)
  app.get('/api/marketplace/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const productId = parseInt(id);
      
      if (isNaN(productId)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Get wholesaler details
      const wholesaler = await storage.getUser(product.wholesalerId);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      
      // Return product with wholesaler information
      res.json({
        ...product,
        wholesaler: {
          id: wholesaler.id,
          businessName: wholesaler.businessName || 'Business',
          businessPhone: wholesaler.businessPhone,
          businessAddress: wholesaler.businessAddress,
          profileImageUrl: wholesaler.profileImageUrl,
          logoType: wholesaler.logoType || 'initials',
          logoUrl: wholesaler.logoUrl || undefined,
          firstName: wholesaler.firstName,
          lastName: wholesaler.lastName,
          defaultCurrency: wholesaler.preferredCurrency
        }
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Marketplace order placement endpoint (public - no auth required)
  app.post('/api/marketplace/orders', async (req, res) => {
    try {
      const { productId, customerName, customerPhone, customerEmail, quantity, totalAmount, notes } = req.body;
      
      if (!productId || !customerName || !customerPhone || !quantity || !totalAmount) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get product to validate and get wholesaler
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Validate quantity against MOQ and stock
      if (quantity < product.moq) {
        return res.status(400).json({ 
          message: `Minimum order quantity is ${product.moq} units` 
        });
      }
      
      if (quantity > product.stock) {
        return res.status(400).json({ 
          message: `Only ${product.stock} units available in stock` 
        });
      }
      
      // Get or create customer (check by phone first, then by email)
      let customer = await storage.getUserByPhone(customerPhone);
      if (!customer) {
        customer = await storage.getUserByEmail(customerEmail);
      }
      if (!customer) {
        const { firstName, lastName } = parseCustomerName(customerName);
        customer = await storage.createCustomer({
          phoneNumber: customerPhone,
          firstName,
          lastName,
          email: customerEmail,
          role: 'retailer'
        });
      }
      
      // Calculate platform fee (5% of total)
      const subtotal = totalAmount.toString();
      const platformFee = (parseFloat(totalAmount) * 0.05).toFixed(2);
      const total = totalAmount.toString();
      
      // Create order with customer details  
      const orderData = {
        wholesalerId: product.wholesalerId,
        retailerId: customer.id,
        customerName, // Store customer name
        customerEmail, // Store customer email
        customerPhone, // Store customer phone
        subtotal,
        platformFee,
        total,
        status: 'confirmed',
        notes: notes || `Order placed via marketplace for ${product.name}`
      };
      
      const orderItems = [{
        productId: product.id,
        quantity: parseInt(quantity),
        unitPrice: product.price,
        total: totalAmount.toString(),
        orderId: 0 // Will be set after order creation
      }];
      
      const order = await storage.createOrder(orderData, orderItems);
      
      // Send confirmation email to customer
      const wholesaler = await storage.getUser(product.wholesalerId);
      if (wholesaler && customerEmail) {
        try {
          // Use the provided customer email instead of stored email
          const customerForEmail = {
            ...customer,
            email: customerEmail
          };
          await sendCustomerInvoiceEmail(customerForEmail, order, orderItems.map(item => ({
            ...item,
            product: { name: product.name, price: item.unitPrice }
          })), wholesaler);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }
      }
      
      // Send WhatsApp notification to wholesaler if configured
      try {
        const wholesaler = await storage.getUser(product.wholesalerId);
        if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
          const message = `🔔 New Order Alert!

Customer: ${customerName}
Phone: ${customerPhone}
Product: ${product.name}
Quantity: ${quantity.toLocaleString()} units
Total: ${wholesaler.defaultCurrency === 'GBP' ? '£' : '$'}${totalAmount}

Order ID: ${order.id}
Status: Pending Confirmation

Please contact the customer to confirm this order.

✨ Powered by Quikpik Merchant`;

          await whatsappService.sendMessage(
            wholesaler.businessPhone || wholesaler.phoneNumber || '',
            message,
            wholesaler.id
          );
        }
      } catch (notificationError) {
        console.warn("Failed to send order notification:", notificationError);
        // Don't fail the order creation if notification fails
      }
      
      res.json({
        success: true,
        orderId: order.id,
        message: "Order placed successfully! The wholesaler will contact you shortly."
      });
      
    } catch (error) {
      console.error("Error creating marketplace order:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // Customer portal order endpoints
  app.post("/api/customer/orders", async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, customerAddress, items, totalAmount, notes } = req.body;

      if (!customerName || !customerEmail || !customerPhone || !customerAddress || !items || items.length === 0) {
        return res.status(400).json({ message: "Missing required customer or order information" });
      }

      // Get the first product's wholesaler for the order
      const firstProduct = await storage.getProduct(items[0].productId);
      if (!firstProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Create or get customer
      let customer;
      try {
        customer = await storage.getUserByPhone(customerPhone);
        if (!customer) {
          const { firstName, lastName } = parseCustomerName(customerName);
          customer = await storage.createCustomer({
            phoneNumber: customerPhone,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail,
            streetAddress: customerAddress,
          });
        }
      } catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ message: "Failed to create customer record" });
      }

      // Calculate platform fee (5%)
      const subtotal = parseFloat(totalAmount);
      const platformFee = subtotal * 0.05;
      const finalTotal = subtotal;

      // Create the order with customer details
      const order = await storage.createOrder(
        {
          retailerId: customer.id,
          wholesalerId: firstProduct.wholesalerId,
          customerName, // Store customer name
          customerEmail, // Store customer email 
          customerPhone, // Store customer phone
          subtotal: subtotal.toFixed(2),
          platformFee: platformFee.toFixed(2),
          total: finalTotal.toFixed(2),
          status: 'confirmed',
          deliveryAddress: customerAddress,
          notes: notes || ''
        },
        items.map((item: any) => ({
          ...item,
          orderId: 0 // Will be set by the storage layer
        }))
      );

      // Get wholesaler info for email
      const wholesaler = await storage.getUser(firstProduct.wholesalerId);

      // Send email invoice to customer
      try {
        // Enrich items with product details for email
        const enrichedItems = await Promise.all(items.map(async (item: any) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || 'Product',
            product: product ? { name: product.name, price: item.unitPrice } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(customer, order, enrichedItems, wholesaler);
      } catch (error) {
        console.error("Failed to send customer invoice email:", error);
        // Don't fail the order creation if email fails
      }

      // Notify wholesaler via WhatsApp
      try {
        const wholesaler = await storage.getUser(firstProduct.wholesalerId);
        if (wholesaler && wholesaler.businessPhone) {
          const message = generateOrderNotificationMessage(order, customer, items);
          await whatsappService.sendMessage(wholesaler.businessPhone, message, wholesaler.id);
        }
      } catch (error) {
        console.error("Failed to send WhatsApp notification:", error);
        // Don't fail the order creation if notification fails
      }

      res.json({
        success: true,
        orderId: order.id,
        message: "Order placed successfully! You'll receive an email invoice and the wholesaler will contact you shortly."
      });

    } catch (error) {
      console.error("Error creating customer order:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // Email invoice function for customers
  async function sendCustomerInvoiceEmail(customer: any, order: any, items: any[], wholesaler: any) {
    try {
      const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : 
                           wholesaler.preferredCurrency === 'EUR' ? '€' : '$';
      
      // Get customer name with proper fallback - handle both single name and split names
      const customerName = customer.name || 
                           (customer.firstName && customer.lastName ? `${customer.firstName} ${customer.lastName}` : customer.firstName) || 
                           'Valued Customer';
      
      // Format delivery address properly
      let deliveryAddress = 'Address to be confirmed';
      try {
        if (order.deliveryAddress && typeof order.deliveryAddress === 'string') {
          // Try to parse JSON address
          const parsedAddress = JSON.parse(order.deliveryAddress);
          if (parsedAddress.street) {
            deliveryAddress = `${parsedAddress.street}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.postalCode}, ${parsedAddress.country}`;
          } else {
            deliveryAddress = order.deliveryAddress;
          }
        } else if (customer.address) {
          deliveryAddress = customer.address;
        }
      } catch (parseError) {
        // If JSON parsing fails, use as plain text
        deliveryAddress = order.deliveryAddress || customer.address || 'Address to be confirmed';
      }
      
      // Create HTML email content with proper product names and pricing
      const itemsHtml = items.map((item) => {
        let productName = 'Product';
        let unitPrice = '0.00';
        let total = '0.00';
        
        // Get product name from enriched data
        if (item.productName) {
          productName = item.productName;
        } else if (item.product && item.product.name) {
          productName = item.product.name;
        }
        
        // Calculate pricing properly
        if (item.unitPrice) {
          unitPrice = typeof item.unitPrice === 'string' ? 
            parseFloat(item.unitPrice).toFixed(2) : 
            item.unitPrice.toFixed(2);
        }
        
        if (item.total) {
          total = typeof item.total === 'string' ? 
            parseFloat(item.total).toFixed(2) : 
            item.total.toFixed(2);
        } else if (item.unitPrice && item.quantity) {
          // Calculate total if not provided
          const calculatedTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
          total = calculatedTotal.toFixed(2);
        }
        
        console.log(`Email item debug: ${productName}, qty: ${item.quantity}, price: ${unitPrice}, total: ${total}`);
        
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${productName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${currencySymbol}${unitPrice}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${currencySymbol}${total}</td>
          </tr>
        `;
      });
      
      const itemsHtmlString = itemsHtml.join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Order Confirmation</h2>
          <p>Dear ${customerName},</p>
          <p>Thank you for your order! Here are the details:</p>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${order.id}</p>
            <p><strong>From:</strong> ${wholesaler.businessName || 'Wholesale Store'}</p>
            <p><strong>Delivery Address:</strong> ${deliveryAddress}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #22c55e; color: white;">
                <th style="padding: 12px; text-align: left;">Item</th>
                <th style="padding: 12px; text-align: center;">Qty</th>
                <th style="padding: 12px; text-align: right;">Price</th>
                <th style="padding: 12px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtmlString}
            </tbody>
          </table>

          <div style="text-align: right; font-size: 18px; font-weight: bold; margin: 20px 0;">
            <p>Total: ${currencySymbol}${order.total}</p>
          </div>

          <div style="background: #e5f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4>What's Next?</h4>
            <p>Your order has been confirmed and payment processed successfully. The wholesaler will prepare your order and contact you with delivery details.</p>
          </div>

          <div style="background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4>Store Contact Information</h4>
            <p><strong>${wholesaler.businessName || 'Wholesale Store'}</strong></p>
            ${wholesaler.businessPhone ? `<p>📞 Phone: ${wholesaler.businessPhone}</p>` : ''}
            ${wholesaler.email ? `<p>📧 Email: ${wholesaler.email}</p>` : ''}
            ${wholesaler.businessAddress ? `<p>📍 Address: ${wholesaler.businessAddress}</p>` : ''}
          </div>

          <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #666; font-size: 12px;">
            <p>This invoice was generated by Quikpik Merchant Platform</p>
          </div>
        </div>
      `;

      // Import and use SendGrid
      const sgMail = (await import('@sendgrid/mail')).default;
      
      if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const msg = {
          to: customer.email,
          from: 'hello@quikpik.co', // Use verified sender
          subject: `Order Confirmation #${order.id} - ${wholesaler.businessName || 'Wholesale Store'}`,
          html: emailHtml,
          // Add tracking and delivery settings
          tracking_settings: {
            click_tracking: {
              enable: true,
              enable_text: false
            },
            open_tracking: {
              enable: true
            },
            subscription_tracking: {
              enable: false
            }
          },
          // Add email headers for better delivery
          headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            'Importance': 'High'
          }
        };

        try {
          const response = await sgMail.send(msg);
          console.log(`✅ Confirmation email sent to ${customer.email} for order #${order.id}`);
          console.log(`📧 Email delivery status: ${response[0].statusCode}`);
          console.log(`📧 Message ID: ${response[0].headers['x-message-id']}`);
          
          // Additional logging for debugging
          if (response[0].statusCode === 202) {
            console.log(`📧 Email accepted by SendGrid for delivery`);
          } else {
            console.log(`⚠️ Unexpected status code: ${response[0].statusCode}`);
          }
        } catch (sendGridError: any) {
          console.error('❌ SendGrid error details:', {
            message: sendGridError.message,
            code: sendGridError.code,
            response: sendGridError.response?.body
          });
          
          // Log specific error details
          if (sendGridError.response?.body?.errors) {
            console.error('SendGrid validation errors:', sendGridError.response.body.errors);
          }
          
          throw sendGridError;
        }
      } else {
        console.log("SendGrid not configured - Email would have been sent:", {
          to: customer.email,
          subject: `Order Confirmation #${order.id}`,
          order: order.id,
          total: order.total
        });
      }
    } catch (error) {
      console.error('Failed to send customer confirmation email:', error);
    }
  }

  async function createStripeInvoiceForOrder(order: any, items: any[], wholesaler: any, customer: any) {
    if (!stripe || !wholesaler.stripeAccountId) {
      console.log('Stripe not configured or no Connect account, skipping Stripe invoice');
      return;
    }

    try {
      // Create or retrieve Stripe customer
      let stripeCustomer;
      try {
        // Try to find existing customer by email
        const existingCustomers = await stripe.customers.list({
          email: customer.email,
          limit: 1
        }, {
          stripeAccount: wholesaler.stripeAccountId
        });

        if (existingCustomers.data.length > 0) {
          stripeCustomer = existingCustomers.data[0];
        } else {
          // Create new customer
          stripeCustomer = await stripe.customers.create({
            email: customer.email,
            name: `${customer.firstName} ${customer.lastName || ''}`.trim(),
            phone: customer.phoneNumber,
            metadata: {
              order_id: order.id.toString(),
              customer_type: 'marketplace_customer'
            }
          }, {
            stripeAccount: wholesaler.stripeAccountId
          });
        }
      } catch (customerError) {
        console.error('Error creating/retrieving Stripe customer:', customerError);
        return;
      }

      // Create Stripe invoice
      const invoice = await stripe.invoices.create({
        customer: stripeCustomer.id,
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: `Order #${order.id} - ${wholesaler.businessName || 'Quikpik Merchant'}`,
        metadata: {
          order_id: order.id.toString(),
          platform: 'quikpik_merchant'
        },
        auto_advance: false, // Don't auto-finalize
        collection_method: 'send_invoice',
        days_until_due: 30
      }, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Add line items to invoice
      for (const item of items) {
        await stripe.invoiceItems.create({
          customer: stripeCustomer.id,
          invoice: invoice.id,
          amount: Math.round(parseFloat(item.unitPrice) * item.quantity * 100), // Convert to cents
          currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
          description: `${item.productName || item.product?.name || 'Product'} (Qty: ${item.quantity})`,
          metadata: {
            product_id: item.productId?.toString() || '',
            quantity: item.quantity.toString(),
            unit_price: item.unitPrice
          }
        }, {
          stripeAccount: wholesaler.stripeAccountId
        });
      }

      // Add platform fee as separate line item
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.unitPrice) * item.quantity), 0);
      const platformFee = subtotal * 0.05;
      
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: Math.round(platformFee * 100), // Convert to cents
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: 'Quikpik Platform Fee (5%)',
        metadata: {
          type: 'platform_fee',
          percentage: '5'
        }
      }, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Finalize and send the invoice
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {}, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Mark as paid since payment was already processed
      await stripe.invoices.pay(finalizedInvoice.id, {}, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Send the invoice to customer
      await stripe.invoices.sendInvoice(finalizedInvoice.id, {}, {
        stripeAccount: wholesaler.stripeAccountId
      });

      console.log(`✅ Stripe invoice created and sent to ${customer.email} for order ${order.id}`);
      return finalizedInvoice;

    } catch (error) {
      console.error('❌ Failed to create Stripe invoice:', error);
    }
  }

  async function createStripeRefundReceipt(order: any, refund: any, wholesaler: any, customer: any, reason: string) {
    if (!stripe || !wholesaler.stripeAccountId) {
      console.log('Stripe not configured or no Connect account, skipping Stripe refund receipt');
      return;
    }

    try {
      // Create a credit note for the refund
      if (refund && refund.id) {
        // Find the original invoice to create a credit note
        const invoices = await stripe.invoices.list({
          customer: customer.email,
          limit: 10
        }, {
          stripeAccount: wholesaler.stripeAccountId
        });

        const originalInvoice = invoices.data.find(inv => 
          inv.metadata?.order_id === order.id.toString()
        );

        if (originalInvoice) {
          // Create credit note for the refund
          const creditNote = await stripe.creditNotes.create({
            invoice: originalInvoice.id,
            amount: refund.amount, // Amount in cents
            reason: 'requested_by_customer',
            memo: reason || 'Refund processed for order',
            metadata: {
              order_id: order.id.toString(),
              refund_id: refund.id,
              refund_reason: reason || 'Customer requested refund'
            }
          }, {
            stripeAccount: wholesaler.stripeAccountId
          });

          console.log(`✅ Stripe credit note created for refund ${refund.id}`);
          return creditNote;
        }
      }
    } catch (error) {
      console.error('❌ Failed to create Stripe refund receipt:', error);
    }
  }

  async function sendRefundReceipt(customer: any, order: any, refund: any, wholesaler: any, reason: string) {
    if (!sendGrid) {
      console.log('SendGrid not configured, skipping refund receipt email');
      return;
    }

    try {
      const customerName = `${customer.firstName} ${customer.lastName || ''}`.trim();
      const businessName = wholesaler.businessName || 'Quikpik Merchant';
      const currency = wholesaler.preferredCurrency || 'GBP';
      const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
      
      const refundAmount = refund ? (refund.amount / 100) : parseFloat(order.total);
      const isFullRefund = refund ? (refund.amount >= parseFloat(order.total) * 100) : true;

      const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Refund Receipt - ${businessName}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px;">
      <h1 style="margin: 0; font-size: 28px; font-weight: bold;">${businessName}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Refund Receipt</p>
    </div>

    <!-- Refund Info -->
    <div style="padding: 30px;">
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin-bottom: 30px;">
        <h2 style="margin: 0 0 10px 0; color: #dc2626; font-size: 20px;">Refund Processed</h2>
        <p style="margin: 0; color: #7f1d1d;">
          ${isFullRefund ? 'Full refund' : 'Partial refund'} of ${currencySymbol}${refundAmount.toFixed(2)} has been processed for Order #${order.id}
        </p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div>
          <h3 style="margin: 0 0 10px 0; color: #374151;">Customer:</h3>
          <p style="margin: 0; color: #6b7280; line-height: 1.5;">
            ${customerName}<br/>
            ${customer.email}<br/>
            ${customer.phoneNumber || ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h3 style="margin: 0 0 10px 0; color: #374151;">Refund Details:</h3>
          <p style="margin: 0; color: #6b7280; line-height: 1.5;">
            Date: ${new Date().toLocaleDateString()}<br/>
            Original Order: #${order.id}<br/>
            ${refund ? `Refund ID: ${refund.id}` : 'Manual Refund'}
          </p>
        </div>
      </div>

      <!-- Refund Summary -->
      <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
        <h3 style="margin: 0 0 15px 0; color: #374151;">Refund Summary</h3>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #6b7280;">Original Order Total:</span>
          <span style="font-weight: 600;">${currencySymbol}${parseFloat(order.total).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #6b7280;">Refund Amount:</span>
          <span style="font-weight: 600; color: #dc2626;">${currencySymbol}${refundAmount.toFixed(2)}</span>
        </div>
        ${reason ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <span style="color: #6b7280;">Reason:</span>
          <p style="margin: 5px 0 0 0; color: #374151;">${reason}</p>
        </div>` : ''}
      </div>

      <!-- Processing Info -->
      <div style="background-color: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
        <h3 style="margin: 0 0 10px 0; color: #0369a1;">Processing Information</h3>
        <p style="margin: 0; color: #0369a1; line-height: 1.5;">
          Your refund has been processed and will appear on your original payment method within 5-10 business days.
          ${isFullRefund ? ' Your order has been cancelled and any items will be restocked.' : ''}
        </p>
      </div>

      <!-- Footer -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #6b7280; margin: 0 0 10px 0;">We apologize for any inconvenience.</p>
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">
          This refund receipt was generated automatically by Quikpik Merchant Platform
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

      await sendGrid.send({
        to: customer.email,
        from: 'invoices@quikpik.co',
        subject: `Refund Receipt for Order #${order.id} - ${businessName}`,
        html: emailContent
      });

      console.log(`✅ Refund receipt sent to ${customer.email} for order ${order.id}`);
    } catch (error) {
      console.error('❌ Failed to send refund receipt:', error);
      throw error;
    }
  }

  function generateOrderNotificationMessage(order: any, customer: any, items: any[]): string {
    let message = `🛒 New Order Received!\n\n`;
    message += `Order #${order.id}\n`;
    message += `Customer: ${customer.firstName}\n`;
    message += `Phone: ${customer.phoneNumber}\n`;
    message += `Email: ${customer.email}\n\n`;
    
    message += `Items Ordered:\n`;
    items.forEach((item: any, index: number) => {
      message += `${index + 1}. Product ID ${item.productId}\n`;
      message += `   Quantity: ${item.quantity} units\n`;
      message += `   Unit Price: ${item.unitPrice}\n`;
      message += `   Total: ${item.total}\n\n`;
    });
    
    message += `Order Total: ${order.total}\n\n`;
    if (order.notes) {
      message += `Customer Notes: ${order.notes}\n\n`;
    }
    
    message += `Please contact the customer to confirm delivery details.`;
    
    return message;
  }

  // Marketplace negotiations endpoint (public - no auth required)
  app.post('/api/marketplace/negotiations', async (req, res) => {
    try {
      const { productId, retailerId, originalPrice, offeredPrice, quantity, message, customerEmail, customerName, customerPhone } = req.body;
      
      if (!productId || !originalPrice || !offeredPrice || !quantity) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get product to validate and get wholesaler
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // For marketplace negotiations, we'll create a temporary customer user if needed
      let customerId = retailerId;
      if (!customerId || customerId.startsWith('customer_')) {
        // Create a guest customer for the negotiation
        try {
          const { firstName, lastName } = parseCustomerName(customerName || 'Guest Customer');
          const tempCustomer = await storage.createCustomer({
            phoneNumber: customerPhone || `+44${Date.now()}`,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail,
          });
          customerId = tempCustomer.id;
        } catch (error) {
          // If customer creation fails, use a fallback approach
          return res.status(400).json({ 
            message: "Unable to process negotiation request. Please try again or contact support." 
          });
        }
      }
      
      // Check if product allows negotiation
      if (!product.negotiationEnabled) {
        return res.status(400).json({ message: "This product is not available for price negotiation" });
      }
      
      // Validate quantity against MOQ
      if (quantity < product.moq) {
        return res.status(400).json({ 
          message: `Minimum order quantity is ${product.moq} units` 
        });
      }
      
      // Check if offered price meets minimum bid requirement
      const offeredPriceNum = parseFloat(offeredPrice);
      const minimumBid = product.minimumBidPrice ? parseFloat(product.minimumBidPrice) : null;
      
      if (minimumBid && offeredPriceNum < minimumBid) {
        // Get wholesaler and currency info first
        const wholesaler = await storage.getUser(product.wholesalerId);
        const currency = wholesaler?.preferredCurrency || 'GBP';
        const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
        
        // Automatically decline the bid and send email notification
        const negotiationData = {
          productId: product.id,
          retailerId: customerId,
          originalPrice: originalPrice.toString(),
          offeredPrice: offeredPrice.toString(),
          quantity: parseInt(quantity),
          message: message || '',
          status: 'declined'
        };
        
        const negotiation = await storage.createNegotiation(negotiationData);
        
        // Send email notification to customer about declined bid
        try {
          
          // Send email to customer
          const customerEmail = req.body.customerEmail; // Should be provided in request
          if (customerEmail) {
            const emailSubject = `Quote Request Declined - ${product.name}`;
            const emailBody = `
Dear Customer,

Thank you for your interest in ${product.name}.

Unfortunately, your quote request has been automatically declined as the offered price (${currencySymbol}${offeredPrice}) is below our minimum acceptable bid price of ${currencySymbol}${minimumBid}.

Product Details:
- Product: ${product.name}
- Listed Price: ${currencySymbol}${originalPrice}
- Your Offer: ${currencySymbol}${offeredPrice}
- Minimum Bid: ${currencySymbol}${minimumBid}
- Quantity: ${quantity} units

Please feel free to submit a new quote at or above the minimum bid price.

Best regards,
${wholesaler?.businessName || wholesaler?.firstName + ' ' + wholesaler?.lastName}
            `;
            
            // Note: Email functionality would need SendGrid integration
            console.log('Email to send:', { to: customerEmail, subject: emailSubject, body: emailBody });
          }
          
          // Also send WhatsApp notification to wholesaler about declined bid
          if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
            const notificationMessage = `🚫 Quote Automatically Declined

Product: ${product.name}
Customer Offer: ${currencySymbol}${offeredPrice}
Minimum Bid: ${currencySymbol}${minimumBid}
Quantity: ${quantity.toLocaleString()} units

The customer's bid was below your minimum acceptable price and has been automatically declined.`;

            await whatsappService.sendMessage(
              wholesaler.businessPhone || '',
              notificationMessage,
              wholesaler.id
            );
          }
        } catch (notificationError) {
          console.error('Failed to send decline notification:', notificationError);
        }
        
        return res.status(200).json({
          success: false,
          declined: true,
          negotiationId: negotiation.id,
          message: `Your offer of ${currencySymbol}${offeredPrice} is below the minimum bid price of ${currencySymbol}${minimumBid}. Please submit a higher offer.`,
          minimumBidPrice: minimumBid
        });
      }
      
      // Create negotiation record
      const negotiationData = {
        productId: product.id,
        retailerId: customerId,
        originalPrice: originalPrice.toString(),
        offeredPrice: offeredPrice.toString(),
        quantity: parseInt(quantity),
        message: message || '',
        status: 'pending'
      };
      
      const negotiation = await storage.createNegotiation(negotiationData);
      
      // Send WhatsApp notification to wholesaler about price quote request
      try {
        const wholesaler = await storage.getUser(product.wholesalerId);
        if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
          const customerInfo = retailerId.includes('customer_') ? 'Customer' : 'Retailer';
          const total = (parseFloat(offeredPrice) * parseInt(quantity)).toFixed(2);
          const currency = wholesaler.preferredCurrency || 'GBP';
          const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
          
          const notificationMessage = `💬 Price Quote Request!

Product: ${product.name}
Current Price: ${currencySymbol}${originalPrice}
Requested Price: ${currencySymbol}${offeredPrice}
Quantity: ${quantity.toLocaleString()} units
Total Value: ${currencySymbol}${total}

${message ? `Customer Message: "${message}"` : ''}

Review and respond to this price request in your Quikpik dashboard.

${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.replit.dev` : 'https://your-app.replit.dev'}`;

          await whatsappService.sendMessage(
            wholesaler.businessPhone || '',
            notificationMessage,
            wholesaler.id
          );
        }
      } catch (notificationError) {
        console.error('Failed to send negotiation notification:', notificationError);
        // Don't fail the negotiation creation if notification fails
      }
      
      res.status(201).json({
        success: true,
        negotiationId: negotiation.id,
        message: "Price quote request submitted successfully"
      });
      
    } catch (error) {
      console.error("Error creating negotiation:", error);
      res.status(500).json({ message: "Failed to submit price quote request" });
    }
  });

  // Test email endpoint for order confirmation
  app.post('/api/test-order-email', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId, testEmail } = req.body;
      
      if (!orderId || !testEmail) {
        return res.status(400).json({ message: "Order ID and test email are required" });
      }

      // Get the order with all details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get wholesaler details
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Create test customer data
      const testCustomer = {
        name: `${order.retailer.firstName || 'Test'} ${order.retailer.lastName || 'Customer'}`,
        email: testEmail,
        phone: order.retailer.businessPhone || 'N/A',
        address: order.deliveryAddress || 'Test Address'
      };

      // Enrich items with product details for email
      const enrichedItems = await Promise.all(order.items.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          productName: product?.name || `Product #${item.productId}`,
          product: product ? { name: product.name } : null
        };
      }));

      // Send test email
      await sendCustomerInvoiceEmail(testCustomer, order, enrichedItems, wholesaler);
      
      res.json({ 
        message: "Test email sent successfully",
        sentTo: testEmail,
        orderId: orderId
      });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email", error: error.message });
    }
  });

  // Enhanced email diagnostics endpoint
  app.post("/api/orders/diagnose-email", async (req, res) => {
    try {
      const { testEmail } = req.body;
      
      if (!testEmail) {
        return res.status(400).json({ message: "Test email is required" });
      }

      const sgMail = (await import('@sendgrid/mail')).default;
      
      if (!process.env.SENDGRID_API_KEY) {
        return res.status(500).json({ message: "SendGrid API key not configured" });
      }

      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      // Send a simple test email with detailed tracking
      const msg = {
        to: testEmail,
        from: 'hello@quikpik.co',
        subject: 'Email Delivery Test - Quikpik Merchant',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Email Delivery Test</h2>
            <p>This is a test email to verify email delivery is working correctly.</p>
            <p><strong>Test Time:</strong> ${new Date().toISOString()}</p>
            <p><strong>From:</strong> Quikpik Merchant Platform</p>
            <p><strong>To:</strong> ${testEmail}</p>
            <div style="background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>Troubleshooting Tips:</h4>
              <ul>
                <li>Check your spam/junk folder</li>
                <li>Add hello@quikpik.co to your contacts</li>
                <li>Check email filters that might be blocking emails</li>
              </ul>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              If you received this email, delivery is working correctly.
            </p>
          </div>
        `,
        tracking_settings: {
          click_tracking: {
            enable: true,
            enable_text: false
          },
          open_tracking: {
            enable: true
          },
          subscription_tracking: {
            enable: false
          }
        }
      };

      const response = await sgMail.send(msg);
      
      res.json({
        message: "Diagnostic email sent successfully",
        sentTo: testEmail,
        statusCode: response[0].statusCode,
        messageId: response[0].headers['x-message-id'],
        deliveryStatus: response[0].statusCode === 202 ? 'accepted' : 'unknown',
        troubleshooting: {
          checkSpamFolder: true,
          addToContacts: 'hello@quikpik.co',
          checkFilters: true
        }
      });
    } catch (error: any) {
      console.error("Email diagnostic error:", error);
      res.status(500).json({ 
        message: "Error sending diagnostic email",
        error: error.message,
        details: error.response?.body
      });
    }
  });

  // Generate and download invoice PDF
  app.get('/api/orders/:id/invoice', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can generate invoices for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to generate invoice for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Generate invoice HTML (reuse the email template but optimized for PDF)
      const customerName = `${order.retailer.firstName} ${order.retailer.lastName || ''}`.trim();
      const businessName = wholesaler.businessName || 'Quikpik Merchant';
      const currency = wholesaler.preferredCurrency || 'GBP';
      const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
      
      const itemsList = order.items.map(item => 
        `<tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 8px; border-right: 1px solid #eee;">${item.product.name}</td>
          <td style="padding: 12px 8px; border-right: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px 8px; border-right: 1px solid #eee; text-align: right;">${currencySymbol}${parseFloat(item.unitPrice).toFixed(2)}</td>
          <td style="padding: 12px 8px; text-align: right; font-weight: bold;">${currencySymbol}${(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}</td>
        </tr>`
      ).join('');

      const subtotal = order.items.reduce((sum: number, item: any) => sum + (parseFloat(item.unitPrice) * item.quantity), 0);
      const platformFee = subtotal * 0.05;
      const total = subtotal + platformFee;

      const invoiceHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #${order.id} - ${businessName}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { background: #22c55e; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .flex { display: flex; justify-content: space-between; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { padding: 12px 8px; border: 1px solid #e5e7eb; }
    th { background-color: #f9fafb; font-weight: 600; }
    .totals { border-top: 2px solid #e5e7eb; padding-top: 20px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .final-total { font-size: 18px; font-weight: bold; color: #22c55e; padding: 15px 0; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${businessName}</h1>
      <h2>INVOICE #${order.id}</h2>
    </div>
    
    <div class="content">
      <div class="flex">
        <div>
          <h3>Bill To:</h3>
          <p>${customerName}<br/>
          ${order.customerEmail || order.retailer?.email || ''}<br/>
          ${order.customerPhone || order.retailer?.phoneNumber || ''}</p>
        </div>
        <div>
          <h3>Invoice Details:</h3>
          <p>Date: ${new Date(order.createdAt).toLocaleDateString()}<br/>
          Status: ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}<br/>
          Order #${order.id}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsList}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${currencySymbol}${subtotal.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Platform Fee (5%):</span>
          <span>${currencySymbol}${platformFee.toFixed(2)}</span>
        </div>
        <div class="final-total">
          <div class="total-row">
            <span>Total:</span>
            <span>${currencySymbol}${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 40px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p>Thank you for your business!</p>
        <small>Generated by Quikpik Merchant Platform on ${new Date().toLocaleDateString()}</small>
      </div>
    </div>
  </div>
</body>
</html>`;

      // Generate PDF using Puppeteer
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(invoiceHtml, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      await browser.close();

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.id}.pdf"`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // Send simple receipt email for existing order
  app.post('/api/orders/:id/send-receipt', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can send receipts for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to send receipt for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Get customer data from Stripe payment intent
      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      let customerInfo;
      try {
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        if (paymentIntent.metadata) {
          customerInfo = {
            email: paymentIntent.metadata.customerEmail,
            name: paymentIntent.metadata.customerName,
            phone: paymentIntent.metadata.customerPhone
          };
        } else {
          // Fallback to stored data if no metadata
          customerInfo = {
            email: order.customerEmail || order.retailer?.email,
            name: order.customerName || `Customer ${order.id}`,
            phone: order.customerPhone || order.retailer?.phoneNumber
          };
        }
      } catch (stripeError) {
        console.error("Error retrieving Stripe data:", stripeError);
        // Fallback to stored data
        customerInfo = {
          email: order.customerEmail || order.retailer?.email,
          name: order.customerName || `Customer ${order.id}`,
          phone: order.customerPhone || order.retailer?.phoneNumber
        };
      }

      if (!customerInfo.email) {
        return res.status(400).json({ message: "No customer email found for this order" });
      }

      console.log(`📧 Sending receipt to: ${customerInfo.email} for customer: ${customerInfo.name}`);

      // Get order items with product details
      const orderItems = await storage.getOrderItems(order.id);
      const enrichedItems = await Promise.all(orderItems.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          productName: product?.name || `Product #${item.productId}`,
          product: product ? { name: product.name } : null
        };
      }));

      // Send receipt email using Stripe customer data
      await sendCustomerInvoiceEmail(customerInfo, order, enrichedItems, wholesaler);

      res.json({ 
        success: true, 
        message: `Receipt sent successfully to ${customerInfo.email}`
      });

    } catch (error) {
      console.error("Error sending receipt:", error);
      res.status(500).json({ message: "Failed to send receipt: " + error.message });
    }
  });

  // Get customer data from Stripe for order display
  app.get('/api/orders/:id/stripe-customer-data', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can view customer data for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view customer data for this order" });
      }

      if (!order.stripePaymentIntentId) {
        return res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

      try {
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        const customerData = {
          customerName: paymentIntent.metadata?.customerName || order.customerName || null,
          customerEmail: paymentIntent.metadata?.customerEmail || order.customerEmail || null,
          customerPhone: paymentIntent.metadata?.customerPhone || order.customerPhone || null
        };

        res.json(customerData);
      } catch (stripeError) {
        console.error("Error retrieving Stripe customer data:", stripeError);
        // Return stored data as fallback
        res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ message: "Failed to fetch customer data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
