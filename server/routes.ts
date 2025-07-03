import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProductSchema, insertOrderSchema, insertCustomerGroupSchema } from "@shared/schema";
import { whatsappService } from "./whatsapp";
import { z } from "zod";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not found. Stripe functionality will not work.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
}) : null;

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

      // Convert numeric fields from frontend to appropriate types
      const { price, moq, stock, ...otherData } = req.body;
      const convertedData = {
        ...otherData,
        ...(price !== undefined && { price: price.toString() }),
        ...(moq !== undefined && { moq: parseInt(moq) }),
        ...(stock !== undefined && { stock: parseInt(stock) })
      };
      const productData = insertProductSchema.partial().parse(convertedData);
      const product = await storage.updateProduct(id, productData);
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
      if (!customer) {
        // Create a new customer/retailer account
        customer = await storage.createCustomer({
          phoneNumber,
          firstName: name,
          role: "retailer",
        });
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customer.id);
      
      res.json({
        success: true,
        message: `${name} added to ${group.name} successfully`,
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

      // Verify group ownership
      const groups = await storage.getCustomerGroups(userId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      const members = await storage.getGroupMembers(groupId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ message: "Failed to fetch group members" });
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

  // Stripe payment routes
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

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(parseFloat(order.total) * 100), // Convert to cents
        currency: "usd",
        metadata: {
          orderId: order.id.toString(),
          retailerId: userId,
          wholesalerId: order.wholesalerId
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

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const orderId = parseInt(paymentIntent.metadata.orderId);
        
        // Update order status to processing
        await storage.updateOrderStatus(orderId, 'processing');
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

      // Send the broadcast via WhatsApp
      const result = await whatsappService.sendProductBroadcast(
        wholesalerId,
        productId,
        customerGroupId,
        customMessage
      );

      if (result.success) {
        res.json({
          success: true,
          messageId: result.messageId,
          message: "Broadcast sent successfully"
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
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
      
      // For now, return mock data - in real implementation this would be stored in database
      const broadcasts = [
        {
          id: 1,
          productId: 1,
          customerGroupId: 1,
          message: "Fresh apples available! 50 units in stock at $2.50/kg.",
          sentAt: new Date().toISOString(),
          status: 'sent',
          recipientCount: 25,
          openRate: 85,
          clickRate: 12,
          product: { name: "Fresh Red Apples", imageUrl: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=100&h=100&fit=crop" },
          customerGroup: { name: "Premium Retailers" }
        },
        {
          id: 2,
          productId: 2,
          customerGroupId: 2,
          message: "New stock of organic rice - limited quantity available.",
          sentAt: new Date(Date.now() - 86400000).toISOString(),
          status: 'sent',
          recipientCount: 18,
          openRate: 92,
          clickRate: 8,
          product: { name: "Organic Basmati Rice", imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=100&h=100&fit=crop" },
          customerGroup: { name: "Organic Stores" }
        }
      ];
      
      res.json(broadcasts);
    } catch (error) {
      console.error("Error fetching broadcasts:", error);
      res.status(500).json({ message: "Failed to fetch broadcasts" });
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

  const httpServer = createServer(app);
  return httpServer;
}
