import type { Express } from "express";
import {
  PreciseShippingCalculator, and, db, eq, healthCheck, isAuthenticated, or, orders,
  performanceMiddleware, products, queryCache, queryOptimizer, requireAuth,
  storage, sum, users
} from "./shared";

export function registerSystemRoutes(app: Express): void {
  // GET /api/health
  app.get('/api/health', healthCheck);

  // GET /api/logo/:wholesalerId
  app.get('/api/logo/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const result = await db.select({ logoUrl: users.logoUrl, logoType: users.logoType }).from(users).where(eq(users.id, wholesalerId)).limit(1);
      if (!result.length || !result[0].logoUrl) return res.status(404).end();
      const { logoUrl, logoType } = result[0];
      if (logoType === 'custom' && logoUrl.startsWith('data:')) {
        const match = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return res.status(400).end();
        const [, mimeType, base64Data] = match;
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(buffer);
      }
      if (logoUrl.startsWith('http')) return res.redirect(logoUrl);
      return res.status(404).end();
    } catch (error) {
      console.error('Error serving logo:', error);
      res.status(500).end();
    }
  });

  // POST /api/logo-upload-url
  app.post('/api/logo-upload-url', async (req, res) => {
    try {
      
      // Check if object storage is configured
      if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
        console.error('❌ Object storage not configured - PUBLIC_OBJECT_SEARCH_PATHS missing');
        return res.status(500).json({ 
          error: 'Object storage not configured',
          details: 'PUBLIC_OBJECT_SEARCH_PATHS environment variable not set'
        });
      }
      
      const { ObjectStorageService } = await import('../objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      res.json({ uploadURL });
      
    } catch (error) {
      console.error('❌ Error getting upload URL:', error);
      if (error instanceof Error) {
        console.error('❌ Full error details:', { message: error.message, stack: error.stack, name: error.name });
      }
      res.status(500).json({ 
        error: 'Failed to get upload URL',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // POST /api/update-logo-url
  app.post('/api/update-logo-url', requireAuth, async (req, res) => {
    try {
      const { logoUrl } = req.body;
      
      if (!logoUrl || typeof logoUrl !== 'string') {
        return res.status(400).json({ error: 'Valid logo URL required' });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const updatedUser = await storage.updateUserSettings(req.user!.id, {
        logoUrl: logoUrl,
        logoType: 'custom'
      });
      
      res.json({ 
        success: true, 
        message: 'Logo URL updated successfully',
        logoUrl: updatedUser.logoUrl 
      });
      
    } catch (error) {
      console.error('❌ Error updating logo URL:', error);
      res.status(500).json({ error: 'Failed to update logo URL' });
    }
  });

  // POST /api/upload-logo-base64
  app.post('/api/upload-logo-base64', requireAuth, async (req, res) => {
    try {
      const { imageData, fileName, fileType } = req.body;
      
      if (!imageData || !fileType) {
        return res.status(400).json({ error: 'Image data and file type required' });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Convert base64 to data URL format
      const dataUrl = `data:${fileType};base64,${imageData}`;
      
      const updatedUser = await storage.updateUserSettings(req.user!.id, {
        logoUrl: dataUrl,
        logoType: 'custom'
      });
      
      res.json({ 
        success: true, 
        message: 'Logo uploaded successfully',
        logoUrl: dataUrl 
      });
      
    } catch (error) {
      console.error('❌ Error uploading base64 logo:', error);
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  });

  // POST /api/clear-logo
  app.post('/api/clear-logo', requireAuth, async (req, res) => {
    try {
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Clear the logo settings for the authenticated user
      const updatedUser = await storage.updateUserSettings(req.user!.id, {
        logoUrl: null,
        logoType: 'business' // Reset to business initials
      });
      
      res.json({ 
        success: true, 
        message: 'Logo cleared successfully',
        logoType: updatedUser.logoType 
      });
    } catch (error) {
      console.error('🧹 Error clearing logo:', error);
      res.status(500).json({ error: 'Failed to clear logo' });
    }
  });

  // GET /api/performance
  app.get("/api/performance", (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    res.json({
      queryStats: queryOptimizer.getQueryStats(),
      slowQueries: queryOptimizer.getSlowQueries(),
      cacheStats: queryCache.getStats(),
      responseCache: performanceMiddleware.getCacheStats()
    });
  });

  // GET /objects/:objectPath(*)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService } = await import('../objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error serving object:", error);
      if (error.name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // GET /api/config/google-places-key
  app.get('/api/config/google-places-key', (req, res) => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      res.json({ apiKey });
    } else {
      res.status(404).json({ error: 'Google Places API key not configured' });
    }
  });

  // POST /api/shipping/automation-settings
  app.post('/api/shipping/automation-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { sendOrderDispatchedEmails, autoMarkFulfilled, enableTrackingNotifications, sendDeliveryConfirmations } = req.body;

      // Update user settings with automation preferences
      await storage.updateUserSettings(userId, {
        sendOrderDispatchedEmails: sendOrderDispatchedEmails ?? true,
        autoMarkFulfilled: autoMarkFulfilled ?? false,
        enableTrackingNotifications: enableTrackingNotifications ?? true,
        sendDeliveryConfirmations: sendDeliveryConfirmations ?? true
      });

      res.json({
        success: true,
        message: "Shipping automation settings updated successfully",
        settings: {
          sendOrderDispatchedEmails,
          autoMarkFulfilled,
          enableTrackingNotifications,
          sendDeliveryConfirmations
        }
      });
    } catch (error) {
      console.error("Error saving automation settings:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to save automation settings" 
      });
    }
  });

  // GET /api/shipping/automation-settings
  app.get('/api/shipping/automation-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        sendOrderDispatchedEmails: user.sendOrderDispatchedEmails ?? true,
        autoMarkFulfilled: user.autoMarkFulfilled ?? false,
        enableTrackingNotifications: user.enableTrackingNotifications ?? true,
        sendDeliveryConfirmations: user.sendDeliveryConfirmations ?? true
      });
    } catch (error) {
      console.error("Error fetching automation settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch automation settings" 
      });
    }
  });

  // GET /api/shipping/tracked-orders
  app.get('/api/shipping/tracked-orders', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get all orders with shipping information
      const orders = await storage.getOrders(userId);
      
      // Filter orders that have shipping tracking (or demo mode: show all paid orders)
      const trackedOrders = orders
        .filter(order => order.shippingOrderId || order.deliveryTrackingNumber || order.status === 'processing' || order.status === 'shipped' || order.status === 'completed')
        .map(order => ({
          id: order.id,
          customerName: order.retailer ? (`${order.retailer.firstName || ''} ${order.retailer.lastName || ''}`.trim() || order.customerName || 'Unknown Customer') : order.customerName || 'Unknown Customer',
          customerEmail: order.retailer?.email || order.customerEmail || '',
          trackingNumber: order.deliveryTrackingNumber || `TRK${order.id}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          carrier: order.deliveryCarrier || (['Royal Mail', 'DPD', 'Evri', 'UPS', 'FedEx'][Math.floor(Math.random() * 5)]),
          shippingStatus: order.shippingStatus || (['pending', 'collected', 'in_transit', 'out_for_delivery', 'delivered'][Math.floor(Math.random() * 5)]),
          estimatedDelivery: order.estimatedDeliveryDate,
          total: order.total,
          deliveryAddress: order.deliveryAddress || '',
          createdAt: order.createdAt,
          lastUpdated: order.updatedAt,
          events: [] // Will be populated by tracking API
        }));

      res.json(trackedOrders);
    } catch (error: any) {
      console.error("Error getting tracked orders:", error);
      res.status(500).json({ message: "Failed to get tracked orders", error: error.message });
    }
  });

  // GET /api/shipping/tracking/:orderId
  app.get('/api/shipping/tracking/:orderId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      
      // Get the specific order
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view this order" });
      }

      // For demo purposes, generate realistic tracking events
      const generateTrackingEvents = (order: any) => {
        const events = [];
        const now = new Date();
        const orderDate = new Date(order.createdAt);
        
        // Always have order created event
        events.push({
          id: `event-1-${order.id}`,
          timestamp: orderDate.toISOString(),
          status: 'created',
          location: 'Order Processing Center',
          description: 'Order created and payment confirmed',
          carrier: order.deliveryCarrier || 'System'
        });

        if (order.shippingStatus && order.shippingStatus !== 'pending') {
          // Shipping label created
          const labelDate = new Date(orderDate.getTime() + 24 * 60 * 60 * 1000); // +1 day
          events.push({
            id: `event-2-${order.id}`,
            timestamp: labelDate.toISOString(),
            status: 'collected',
            location: 'Collection Center',
            description: 'Package collected from sender',
            carrier: order.deliveryCarrier || 'Carrier'
          });

          if (['in_transit', 'out_for_delivery', 'delivered'].includes(order.shippingStatus)) {
            // In transit
            const transitDate = new Date(labelDate.getTime() + 12 * 60 * 60 * 1000); // +12 hours
            events.push({
              id: `event-3-${order.id}`,
              timestamp: transitDate.toISOString(),
              status: 'in_transit',
              location: 'Regional Distribution Center',
              description: 'Package in transit to destination',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }

          if (['out_for_delivery', 'delivered'].includes(order.shippingStatus)) {
            // Out for delivery
            const outDate = new Date(orderDate.getTime() + 48 * 60 * 60 * 1000); // +2 days
            events.push({
              id: `event-4-${order.id}`,
              timestamp: outDate.toISOString(),
              status: 'out_for_delivery',
              location: 'Local Delivery Center',
              description: 'Out for delivery',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }

          if (order.shippingStatus === 'delivered') {
            // Delivered
            const deliveredDate = new Date(orderDate.getTime() + 60 * 60 * 60 * 1000); // +2.5 days
            events.push({
              id: `event-5-${order.id}`,
              timestamp: deliveredDate.toISOString(),
              status: 'delivered',
              location: 'Customer Address',
              description: 'Package delivered successfully',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }
        }

        return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      };

      let trackingData = {
        orderId: order.id,
        trackingNumber: order.deliveryTrackingNumber,
        carrier: order.deliveryCarrier || 'Unknown',
        status: order.shippingStatus || 'pending',
        estimatedDelivery: order.estimatedDeliveryDate,
        events: generateTrackingEvents(order),
        lastUpdated: new Date().toISOString()
      };

      res.json(trackingData);
    } catch (error: any) {
      console.error("Error getting tracking details:", error);
      res.status(500).json({ message: "Failed to get tracking details", error: error.message });
    }
  });

  // PATCH /api/shipping/status/:orderId
  app.patch('/api/shipping/status/:orderId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      const { status, trackingNumber, estimatedDelivery } = req.body;
      
      // Get the order to verify ownership
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify this order belongs to the current user (wholesaler)
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      // Update the order with new shipping status
      const updates: any = { shippingStatus: status };
      if (trackingNumber) updates.deliveryTrackingNumber = trackingNumber;
      if (estimatedDelivery) updates.estimatedDeliveryDate = new Date(estimatedDelivery);

      await storage.updateOrder(parseInt(orderId), updates);

      res.json({ 
        success: true, 
        message: "Shipping status updated successfully" 
      });
    } catch (error: any) {
      console.error("Error updating shipping status:", error);
      res.status(500).json({ message: "Failed to update shipping status", error: error.message });
    }
  });

}
