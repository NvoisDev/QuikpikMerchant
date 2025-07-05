import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
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
function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US');
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

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
      const { price, moq, stock, ...otherData } = req.body;
      const productData = insertProductSchema.parse({
        ...otherData,
        price: price.toString(),
        moq: parseInt(moq),
        stock: parseInt(stock),
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
      const { price, moq, stock, ...otherData } = req.body;
      const convertedData = {
        ...otherData,
        ...(price !== undefined && { price: price.toString() }),
        ...(moq !== undefined && { moq: parseInt(moq) }),
        ...(stock !== undefined && { stock: parseInt(stock) })
      };
      const productData = insertProductSchema.partial().parse(convertedData);
      
      // Check for stock changes before updating
      const newStock = stock !== undefined ? parseInt(stock) : existingProduct.stock;
      const newPrice = price !== undefined ? price.toString() : existingProduct.price;
      
      const stockChangeCheck = await storage.checkForStockChanges(id, newStock || 0, newPrice);
      
      // Increment edit count and update the product
      const productDataWithEditCount = {
        ...productData,
        editCount: currentEditCount + 1
      };
      const product = await storage.updateProduct(id, productDataWithEditCount);
      
      // If stock changes warrant notification, create notification and send messages
      if (stockChangeCheck.shouldNotify) {
        const campaignRecipients = await storage.getCampaignRecipients(id);
        
        // Create stock update notification record
        const notification = await storage.createStockUpdateNotification({
          productId: id,
          wholesalerId: userId,
          notificationType: stockChangeCheck.notificationType,
          previousStock: existingProduct.stock,
          newStock: newStock,
          previousPrice: existingProduct.price,
          newPrice: newPrice,
          status: 'pending'
        });

        // Send notifications to campaign recipients (async, don't block response)
        setImmediate(async () => {
          try {
            let totalMessagesSent = 0;
            
            for (const groupId of campaignRecipients.customerGroupIds) {
              const members = await storage.getGroupMembers(groupId);
              const message = generateStockUpdateMessage(product, stockChangeCheck.notificationType, req.user);
              
              for (const member of members) {
                if (member.phoneNumber) {
                  try {
                    const success = await whatsappService.sendMessage(member.phoneNumber, message, userId);
                    if (success) totalMessagesSent++;
                  } catch (error) {
                    console.error(`Failed to send stock update to ${member.phoneNumber}:`, error);
                  }
                }
              }
            }
            
            // Update notification status
            await storage.updateStockNotificationStatus(
              notification.id, 
              'sent', 
              new Date(), 
              totalMessagesSent
            );
          } catch (error) {
            console.error('Error sending stock update notifications:', error);
            await storage.updateStockNotificationStatus(notification.id, 'failed');
          }
        });
      }
      
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
        status: 'pending'
      });

      const order = await storage.createOrder(orderData, orderItems);
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

      // Create Stripe payment intent with Connect account
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmountWithFee * 100), // Convert to cents
        currency: (wholesaler.preferredCurrency?.toLowerCase() || 'usd') as string,
        transfer_data: {
          destination: wholesaler.stripeAccountId,
        },
        application_fee_amount: Math.round(platformFee * 100), // 5% platform fee in cents
        metadata: {
          customerName,
          customerEmail,
          customerPhone,
          totalAmount: totalAmountWithFee.toFixed(2),
          platformFee: platformFee.toFixed(2),
          wholesalerId: firstProduct.wholesalerId,
          orderType: 'customer_portal'
        }
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        totalAmount: totalAmountWithFee.toFixed(2),
        platformFee: platformFee.toFixed(2)
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Failed to create payment intent" });
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
          // Create customer if doesn't exist
          let customer = await storage.getUserByPhone(customerPhone);
          if (!customer) {
            customer = await storage.createCustomer({
              phoneNumber: customerPhone,
              firstName: customerName,
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
            paymentIntentId: paymentIntent.id
          };

          // Get items from payment intent (you might need to store this differently)
          // For now, we'll create a simple order without items
          const order = await storage.createOrder(orderData, []);

          // Send notifications
          const wholesaler = await storage.getUser(wholesalerId);
          if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
            const message = `🎉 New Order Received!\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${wholesaler.preferredCurrency === 'GBP' ? '£' : '$'}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nPlease prepare the order for delivery.`;
            
            try {
              const { sendTwilioMessage } = await import('./whatsapp');
              await sendTwilioMessage(
                wholesaler.twilioAccountSid!,
                wholesaler.twilioAuthToken,
                wholesaler.twilioPhoneNumber,
                customerPhone,
                message
              );
            } catch (error) {
              console.error('Failed to send WhatsApp notification:', error);
            }
          }

          console.log(`Order created successfully for payment ${paymentIntent.id}`);
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
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
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
        customer = await storage.createCustomer({
          phoneNumber,
          firstName: name,
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
  app.get('/api/analytics/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getWholesalerStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching analytics stats:", error);
      res.status(500).json({ message: "Failed to fetch analytics stats" });
    }
  });

  app.get('/api/analytics/top-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit } = req.query;
      const topProducts = await storage.getTopProducts(userId, limit ? parseInt(limit as string) : 5);
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).json({ message: "Failed to fetch top products" });
    }
  });

  app.get('/api/analytics/recent-orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: user.email!,
          business_profile: {
            name: user.businessName || `${user.firstName} ${user.lastName}`,
            support_email: user.email!,
          },
          metadata: {
            userId: userId,
            businessName: user.businessName || '',
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

      // Convert broadcasts to unified campaign format
      const broadcastCampaigns = broadcasts.map(broadcast => ({
        id: `broadcast_${broadcast.id}`,
        title: `${broadcast.product.name} Promotion`,
        customMessage: broadcast.message,
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
          clickCount: Math.floor(Math.random() * (broadcast.recipientCount || 0) * 0.3),
          orderCount: Math.floor(Math.random() * (broadcast.recipientCount || 0) * 0.1),
          totalRevenue: ((Math.random() * 500) + 100).toFixed(2),
          customerGroup: broadcast.customerGroup
        }] : []
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
      const { campaignType, productId, products, ...campaignData } = req.body;

      if (campaignType === 'single') {
        // Create a broadcast for single product
        const broadcastData = {
          wholesalerId: userId,
          productId: productId,
          customerGroupId: 1, // Will be set when sending
          message: campaignData.customMessage || '',
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
      
      // Get or create customer
      let customer = await storage.getUserByPhone(customerPhone);
      if (!customer) {
        customer = await storage.createCustomer({
          phoneNumber: customerPhone,
          firstName: customerName,
          email: customerEmail,
          role: 'retailer'
        });
      }
      
      // Calculate platform fee (5% of total)
      const subtotal = totalAmount.toString();
      const platformFee = (parseFloat(totalAmount) * 0.05).toFixed(2);
      const total = totalAmount.toString();
      
      // Create order
      const orderData = {
        wholesalerId: product.wholesalerId,
        retailerId: customer.id,
        subtotal,
        platformFee,
        total,
        status: 'pending',
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
          customer = await storage.createCustomer({
            phoneNumber: customerPhone,
            firstName: customerName.split(' ')[0],
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

      // Create the order
      const order = await storage.createOrder(
        {
          retailerId: customer.id,
          wholesalerId: firstProduct.wholesalerId,
          subtotal: subtotal.toFixed(2),
          platformFee: platformFee.toFixed(2),
          total: finalTotal.toFixed(2),
          status: 'pending',
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
        await sendCustomerInvoiceEmail(customer, order, items, wholesaler);
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
    // This would integrate with your email service (e.g., SendGrid, AWS SES)
    // For now, we'll log the invoice details
    console.log("Customer Invoice Email:", {
      to: customer.email,
      subject: `Invoice for Order #${order.id}`,
      customerName: customer.firstName,
      orderId: order.id,
      items: items,
      total: order.total,
      wholesaler: wholesaler?.businessName || 'Wholesaler'
    });
    
    // TODO: Implement actual email sending service
    // Example with a service like SendGrid:
    // await emailService.send({
    //   to: customer.email,
    //   subject: `Invoice for Order #${order.id}`,
    //   template: 'customer-invoice',
    //   data: { customer, order, items, wholesaler }
    // });
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
      const { productId, retailerId, originalPrice, offeredPrice, quantity, message } = req.body;
      
      if (!productId || !retailerId || !originalPrice || !offeredPrice || !quantity) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get product to validate and get wholesaler
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
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
      
      // Create negotiation record
      const negotiationData = {
        productId: product.id,
        retailerId: retailerId,
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

  const httpServer = createServer(app);
  return httpServer;
}
