import type { Express } from "express";
import { storage } from "../storage";
import { generateOrderNumber } from "../utils/orderUtils";

export function registerCustomerOrderRoutes(app: Express) {
  // Get customer orders by customer ID
  app.get("/api/customer-orders/:customerId", async (req, res) => {
    try {
      const { customerId } = req.params;
      console.log(`📋 Fetching orders for customer: ${customerId}`);
      
      // Get all orders for this customer
      const orders = await storage.getOrdersByCustomerId(customerId);
      
      // Transform orders to include order items
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          try {
            const items = await storage.getOrderItems(order.id);
            return {
              ...order,
              items: items.map(item => ({
                id: item.id,
                productId: item.productId,
                productName: item.productName || 'Unknown Product',
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                sellingType: item.sellingType || 'units'
              }))
            };
          } catch (error) {
            console.error(`Error getting items for order ${order.id}:`, error);
            return {
              ...order,
              items: []
            };
          }
        })
      );
      
      console.log(`✅ Found ${ordersWithItems.length} orders for customer`);
      res.json(ordersWithItems);
    } catch (error) {
      console.error("❌ Error fetching customer orders:", error);
      res.status(500).json({ 
        error: "Failed to fetch orders",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create new customer order
  app.post("/api/customer-orders", async (req, res) => {
    try {
      const {
        wholesalerId,
        customerId,
        items,
        deliveryMethod,
        customerName,
        customerEmail,
        shippingAddress,
        specialInstructions,
        totalAmount
      } = req.body;

      console.log(`📝 Creating order for customer: ${customerId}`);
      console.log(`📋 Order items: ${items?.length || 0} items`);
      
      if (!wholesalerId || !customerId || !items || items.length === 0) {
        return res.status(400).json({ 
          error: "Missing required fields: wholesalerId, customerId, or items" 
        });
      }

      // Generate order number
      const orderNumber = await generateOrderNumber(wholesalerId);
      
      // Create the order
      const orderData = {
        orderNumber,
        wholesalerId,
        customerId,
        status: 'pending',
        totalAmount: totalAmount || '0.00',
        deliveryMethod: deliveryMethod || 'collection',
        customerName: customerName || '',
        customerEmail: customerEmail || '',
        shippingAddress: deliveryMethod === 'delivery' ? shippingAddress : null,
        specialInstructions: specialInstructions || '',
        paymentStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const order = await storage.createOrder(orderData);
      
      // Create order items
      const orderItems = await Promise.all(
        items.map(async (item: any) => {
          try {
            // Get product details
            const product = await storage.getProduct(item.productId);
            const productName = product?.name || 'Unknown Product';
            
            const itemData = {
              orderId: order.id,
              productId: item.productId,
              productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
              sellingType: item.sellingType || 'units',
              createdAt: new Date()
            };
            
            return await storage.createOrderItem(itemData);
          } catch (itemError) {
            console.error(`Error creating order item:`, itemError);
            throw itemError;
          }
        })
      );

      console.log(`✅ Order created successfully: ${order.orderNumber}`);
      console.log(`📦 Created ${orderItems.length} order items`);
      
      // Return the complete order with items
      const completeOrder = {
        ...order,
        items: orderItems
      };
      
      res.status(201).json(completeOrder);
    } catch (error) {
      console.error("❌ Error creating customer order:", error);
      res.status(500).json({ 
        error: "Failed to create order",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get specific order details
  app.get("/api/customer-orders/:customerId/:orderId", async (req, res) => {
    try {
      const { customerId, orderId } = req.params;
      console.log(`📋 Fetching order ${orderId} for customer: ${customerId}`);
      
      const order = await storage.getOrder(parseInt(orderId));
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Verify the order belongs to this customer
      if (order.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get order items
      const items = await storage.getOrderItems(order.id);
      
      const completeOrder = {
        ...order,
        items: items.map(item => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName || 'Unknown Product',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          sellingType: item.sellingType || 'units'
        }))
      };
      
      console.log(`✅ Found order: ${order.orderNumber}`);
      res.json(completeOrder);
    } catch (error) {
      console.error("❌ Error fetching order details:", error);
      res.status(500).json({ 
        error: "Failed to fetch order details",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}