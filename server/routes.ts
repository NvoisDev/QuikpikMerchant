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
  apiVersion: "2023-10-16",
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
      const productData = insertProductSchema.parse({
        ...req.body,
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

      const productData = insertProductSchema.partial().parse(req.body);
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
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let orders;
      if (user.role === 'wholesaler') {
        orders = await storage.getOrders(userId);
      } else {
        orders = await storage.getOrders(undefined, userId);
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

  const httpServer = createServer(app);
  return httpServer;
}
