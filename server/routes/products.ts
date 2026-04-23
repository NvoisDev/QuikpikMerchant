import type { Express } from "express";
import {
  and, count, db, eq, generateProductImage, insertProductSchema, openai, or, products,
  requireAuth, requireNotViewer, requireProductLimits, storage, users, z
} from "./shared";
import { productBatches } from "@shared/schema";

export function registerProductRoutes(app: Express): void {
  // GET /api/products
  app.get('/api/products', requireAuth, async (req: any, res) => {
    try {
      // SECURITY: Always derive the target user from the authenticated session.
      // Team members see their employer's products; all other authenticated users
      // see only their own. The wholesalerId query param is intentionally ignored
      // for authenticated users — customers use /api/customer-products/:wholesalerId.
      let targetUserId: string;
      if (req.user.role === 'team_member' && req.user.wholesalerId) {
        targetUserId = req.user.wholesalerId;
      } else {
        targetUserId = req.user.id;
      }
      
      console.log('Products request - Target user ID:', targetUserId);
      let productList = await storage.getProducts(targetUserId);
      console.log('Products found:', productList.length);

      // Customer-facing view: hide locked products
      // A request is a customer view if the requester is viewing someone else's products
      // (wholesaler admin views their own, team members use wholesalerId override above)
      const isCustomerView = req.user.role !== 'team_member' && targetUserId !== req.user.id;
      if (isCustomerView) {
        productList = productList.filter(p => p.status !== 'locked');
      }

      res.json(productList);
      // Fire-and-forget: clear stale promo_active flags in DB
      const staleIds = productList.filter(p => !p.promoActive).map(p => p.id);
      for (const staleId of staleIds) {
        db.update(products).set({ promoActive: false, promoPrice: null }).where(eq(products.id, staleId)).catch(() => {});
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // GET /api/products/expiring
  app.get('/api/products/expiring', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const expiring = await storage.getExpiringProducts(targetUserId);
      res.json(expiring);
    } catch (error) {
      console.error("Error fetching expiring products:", error);
      res.status(500).json({ message: "Failed to fetch expiring products" });
    }
  });

  // GET /api/products/:id
  app.get('/api/products/:id', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
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

  // POST /api/products
  app.post('/api/products', requireAuth, requireNotViewer, requireProductLimits(), async (req: any, res) => {
    try {
      // Use parent company ID for team members to ensure data inheritance
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const wholesalerUser = await storage.getUser(targetUserId);
      const defaultThreshold = wholesalerUser?.defaultLowStockThreshold ?? 50;

      const productData = insertProductSchema.parse({
        ...req.body,
        wholesalerId: targetUserId,
        lowStockThreshold: req.body.lowStockThreshold ?? defaultThreshold,
      });
      // Create product + initial batch atomically so a batch-insert failure
      // never leaves a product without batch coverage.
      const product = await db.transaction(async (tx) => {
        const [newProduct] = await tx.insert(products).values(productData).returning();

        // Auto-create an initial batch so the product is immediately FEFO-trackable
        if ((newProduct.stock ?? 0) > 0) {
          await tx.insert(productBatches).values({
            productId: newProduct.id,
            batchNumber: 'INIT',
            quantity: newProduct.stock ?? 0,
            status: 'active',
            notes: 'Initial stock batch (auto-created on product creation)',
          });
        }
        return newProduct;
      });

      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // PATCH /api/products/:id
  app.patch('/api/products/:id', requireAuth, requireNotViewer, async (req: any, res) => {
    const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
      ? req.user.wholesalerId 
      : req.user.id;
    try {
      const id = parseInt(req.params.id);
      
      // Verify product belongs to user or their parent company
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if product is locked due to subscription limits
      if (existingProduct.status === 'locked') {
        // Subscription logging removed
        
        return res.status(403).json({ 
          message: "This product is locked due to subscription limits. Upgrade your plan or delete other products to unlock it.",
          errorType: "PRODUCT_LOCKED",
          upgradeRequired: true
        });
      }

      // Let the schema handle all transformations
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

  // DELETE /api/products/:id
  app.delete('/api/products/:id', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify product belongs to user or their parent company
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      await storage.deleteProduct(id);

      // Check if deleting this product creates space to unlock other products
      try {
        const user = await storage.getUser(targetUserId);
        const productLimit = user?.productLimit || 2;
        
        if (productLimit !== -1) { // Only if not unlimited
          const remainingProducts = await storage.getProducts(targetUserId);
          const activeProducts = remainingProducts.filter(p => p.status === 'active');
          const lockedProducts = remainingProducts.filter(p => p.status === 'locked');
          
          const availableSlots = productLimit - activeProducts.length;
          
          if (availableSlots > 0 && lockedProducts.length > 0) {
            const productsToUnlock = lockedProducts.slice(0, availableSlots);
            
            console.log(`🔓 Product deletion created ${availableSlots} available slots, unlocking ${productsToUnlock.length} products`);
            
            for (const product of productsToUnlock) {
              await storage.updateProduct(product.id, { status: 'active' });
              console.log(`🔓 Auto-unlocked product: ${product.name} (ID: ${product.id})`);
            }
          }
        }
      } catch (error) {
        console.error('Error auto-unlocking products after deletion:', error);
      }

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // GET /api/promotions
  app.get('/api/promotions', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const userProducts = await storage.getProducts(targetUserId);
      
      const promotions: any[] = [];
      for (const product of userProducts) {
        const offers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
        for (const offer of offers) {
          promotions.push({
            ...offer,
            productId: product.id,
            productName: product.name,
            productPrice: product.price,
            productImage: product.images?.[0] || null,
            productStock: product.stock,
          });
        }
      }
      
      res.json(promotions);
    } catch (error) {
      console.error("Error fetching promotions:", error);
      res.status(500).json({ message: "Failed to fetch promotions" });
    }
  });

  // POST /api/products/:id/promotions
  app.post('/api/products/:id/promotions', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const promotion = req.body;
      const newOffer = {
        id: `promo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...promotion,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const currentOffers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
      const updatedOffers = [...currentOffers, newOffer];
      
      const now = new Date();
      const startDate = promotion.startDate ? new Date(promotion.startDate) : null;
      const endDate = promotion.endDate ? new Date(promotion.endDate) : null;
      const isCurrentlyActive = (!startDate || startDate <= now) && (!endDate || endDate >= now);
      
      let promoPrice = product.promoPrice;
      if (isCurrentlyActive) {
        if (promotion.type === 'fixed_price' && promotion.fixedPrice) {
          promoPrice = String(promotion.fixedPrice);
        } else if (promotion.type === 'percentage_discount' && promotion.discountPercentage) {
          const originalPrice = parseFloat(product.price || '0');
          promoPrice = String(Math.round((originalPrice * (1 - promotion.discountPercentage / 100)) * 100) / 100);
        } else if (promotion.type === 'clearance' && promotion.fixedPrice) {
          promoPrice = String(promotion.fixedPrice);
        }
      }
      
      await db.update(products).set({
        promotionalOffers: updatedOffers,
        promoActive: isCurrentlyActive,
        promoPrice: promoPrice ? promoPrice : null,
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      
      res.json({ success: true, promotion: newOffer });
    } catch (error) {
      console.error("Error adding promotion:", error);
      res.status(500).json({ message: "Failed to add promotion" });
    }
  });

  // PATCH /api/products/:id/promotions/:promoId
  app.patch('/api/products/:id/promotions/:promoId', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const productId = parseInt(req.params.id);
      const promoId = req.params.promoId;
      const product = await storage.getProduct(productId);
      
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const updates = req.body;
      const currentOffers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
      const updatedOffers = currentOffers.map((offer: any) => {
        if (offer.id === promoId) {
          return { ...offer, ...updates, updatedAt: new Date().toISOString() };
        }
        return offer;
      });
      
      const activeOffer = updatedOffers.find((o: any) => {
        if (!o.isActive) return false;
        const now = new Date();
        const start = o.startDate ? new Date(o.startDate) : null;
        const end = o.endDate ? new Date(o.endDate) : null;
        return (!start || start <= now) && (!end || end >= now);
      });
      
      let promoPrice = null;
      if (activeOffer) {
        if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage) {
          const originalPrice = parseFloat(product.price || '0');
          promoPrice = String(Math.round((originalPrice * (1 - activeOffer.discountPercentage / 100)) * 100) / 100);
        } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        }
      }
      
      await db.update(products).set({
        promotionalOffers: updatedOffers,
        promoActive: !!activeOffer,
        promoPrice: promoPrice,
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating promotion:", error);
      res.status(500).json({ message: "Failed to update promotion" });
    }
  });

  // DELETE /api/products/:id/promotions/:promoId
  app.delete('/api/products/:id/promotions/:promoId', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const productId = parseInt(req.params.id);
      const promoId = req.params.promoId;
      const product = await storage.getProduct(productId);
      
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const currentOffers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
      const updatedOffers = currentOffers.filter((offer: any) => offer.id !== promoId);
      
      const activeOffer = updatedOffers.find((o: any) => {
        if (!o.isActive) return false;
        const now = new Date();
        const start = o.startDate ? new Date(o.startDate) : null;
        const end = o.endDate ? new Date(o.endDate) : null;
        return (!start || start <= now) && (!end || end >= now);
      });
      
      let promoPrice = null;
      if (activeOffer) {
        if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage) {
          const originalPrice = parseFloat(product.price || '0');
          promoPrice = String(Math.round((originalPrice * (1 - activeOffer.discountPercentage / 100)) * 100) / 100);
        } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        }
      }
      
      await db.update(products).set({
        promotionalOffers: updatedOffers,
        promoActive: !!activeOffer,
        promoPrice: promoPrice,
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting promotion:", error);
      res.status(500).json({ message: "Failed to delete promotion" });
    }
  });

  // POST /api/products/reset-promotions
  app.post('/api/products/reset-promotions', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      
      // Get all products for this wholesaler
      const userProducts = await storage.getProducts(wholesalerId);
      
      // Reset promotional pricing for all products
      const resetPromises = userProducts.map(async (product) => {
        await db
          .update(products)
          .set({ 
            promoActive: false,
            promoPrice: null,
            promotionalOffers: [],
            updatedAt: new Date() 
          })
          .where(eq(products.id, product.id));
      });
      
      await Promise.all(resetPromises);
      
      console.log(`✅ Reset promotional pricing for ${userProducts.length} products for wholesaler ${wholesalerId}`);
      
      res.json({ 
        success: true, 
        message: `Reset promotional pricing for ${userProducts.length} products`,
        productsUpdated: userProducts.length
      });
    } catch (error) {
      console.error("Error resetting promotions:", error);
      res.status(500).json({ message: "Failed to reset promotions" });
    }
  });

  // GET /api/inventory/status
  app.get('/api/inventory/status', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { includeAlerts = 'true' } = req.query;
      
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : userId;
      
      const inventoryStatus = await storage.getInventoryStatus(targetUserId);
      
      if (includeAlerts === 'true') {
        const stockAlerts = await storage.getStockAlerts(targetUserId);
        (inventoryStatus as any).alerts = stockAlerts;
      }
      
      res.json(inventoryStatus);
    } catch (error) {
      console.error("Error fetching inventory status:", error);
      res.status(500).json({ message: "Failed to fetch inventory status" });
    }
  });

  // GET /api/inventory/alerts
  app.get('/api/inventory/alerts', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { unreadOnly = 'false' } = req.query;
      
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : userId;
      
      const alerts = await storage.getStockAlerts(targetUserId, unreadOnly === 'true');
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

  // POST /api/inventory/alerts/:id/mark-read
  app.post('/api/inventory/alerts/:id/mark-read', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alertId = parseInt(req.params.id);
      
      await storage.markStockAlertAsRead(alertId, userId);
      res.json({ message: "Alert marked as read" });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  // POST /api/inventory/alerts/:id/resolve
  app.post('/api/inventory/alerts/:id/resolve', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alertId = parseInt(req.params.id);
      
      await storage.resolveStockAlert(alertId, userId);
      res.json({ message: "Alert resolved" });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  // GET /api/products/:id/stock-status
  app.get('/api/products/:id/stock-status', async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const stockStatus = await storage.getProductStockStatus(productId);
      res.json(stockStatus);
    } catch (error) {
      console.error("Error fetching product stock status:", error);
      res.status(500).json({ message: "Failed to fetch stock status" });
    }
  });

  // GET /api/products/:id/stock-movements
  app.get('/api/products/:id/stock-movements', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

  // GET /api/products/:id/stock-summary
  app.get('/api/products/:id/stock-summary', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

  // POST /api/products/:id/stock-adjustment
  app.post('/api/products/:id/stock-adjustment', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
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
      
      await storage.createStockMovement({
        productId,
        wholesalerId: userId,
        movementType,
        quantity: movementQuantity,
        unitType: 'units',
        stockBefore,
        stockAfter,
        reason,
      });

      const alertsAutoResolved = await storage.autoResolveStockAlertsIfRestocked(productId, stockAfter);
      if (alertsAutoResolved > 0) {
        console.log(`✅ Auto-resolved ${alertsAutoResolved} stock alert(s) for product ${productId} (stock now ${stockAfter})`);
      }
      
      res.json({ 
        success: true, 
        stockBefore, 
        stockAfter, 
        alertsAutoResolved,
        message: `Stock ${adjustmentType}d by ${quantity} units` 
      });
    } catch (error) {
      console.error("Error adjusting stock:", error);
      res.status(500).json({ message: "Failed to adjust stock" });
    }
  });

  // GET /api/stock-movements
  app.get('/api/stock-movements', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const movements = await storage.getStockMovementsByWholesaler(userId, limit);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  // POST /api/ai/generate-description
  app.post('/api/ai/generate-description', requireAuth, async (req: any, res) => {
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

  // GET /api/public/products/:slug
  app.get("/api/public/products/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      
      // Mock SEO-optimized product data
      const product = {
        id: "prod_001",
        name: "Premium Organic Apples",
        description: "Fresh, organic apples sourced directly from local farms. Perfect for retail stores, restaurants, and cafes looking for high-quality produce.",
        price: "2.50",
        category: "Fresh Produce",
        images: [
          "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=800",
          "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400"
        ],
        wholesaler: {
          id: "whole_001",
          businessName: "Fresh Valley Farms",
          location: "Kent, UK",
          rating: 4.8,
          totalReviews: 127,
          profileImage: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=200",
          phoneNumber: "+44 1234 567890",
          email: "contact@freshvalley.com"
        },
        specifications: {
          "Origin": "Kent, United Kingdom",
          "Variety": "Gala, Braeburn, Cox's Orange Pippin",
          "Organic Certified": "Yes - Soil Association",
          "Shelf Life": "7-14 days when stored properly",
          "Storage": "Cool, dry place or refrigerated",
          "Packaging": "10kg boxes, 20kg crates available"
        },
        availability: "In Stock - Available Now",
        minOrderQuantity: 50,
        views: 1247,
        lastUpdated: new Date().toISOString()
      };

      // Increment view count (in real implementation, would update database)
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching public product:", error);
      res.status(500).json({ message: "Product not found" });
    }
  });

  // POST /api/public/products/:slug/inquiry
  app.post("/api/public/products/:slug/inquiry", async (req, res) => {
    try {
      const { slug } = req.params;
      const inquiryData = req.body;
      
      // Mock lead creation - in real implementation would:
      // 1. Validate the product exists
      // 2. Create lead in database
      // 3. Send notification to wholesaler
      // 4. Send confirmation email to inquirer
      
      console.log(`New inquiry for product ${slug}:`, inquiryData);
      
      // Mock successful response
      res.json({
        success: true,
        message: "Your inquiry has been sent to the supplier. They will contact you within 24 hours.",
        inquiryId: `inq_${Date.now()}`
      });
    } catch (error) {
      console.error("Error handling product inquiry:", error);
      res.status(500).json({ message: "Failed to submit inquiry" });
    }
  });

  // POST /api/ai/generate-image
  app.post('/api/ai/generate-image', requireAuth, async (req: any, res) => {
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

  // POST /api/ai/generate-taglines
  app.post('/api/ai/generate-taglines', requireAuth, async (req: any, res) => {
    try {
      const { businessName, businessDescription, category, targetAudience, style } = req.body;
      
      if (!businessName || businessName.trim().length === 0) {
        return res.status(400).json({ message: "Business name is required" });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `Generate 5 compelling taglines for a B2B wholesale business with these details:

Business Name: ${businessName}
${businessDescription ? `Description: ${businessDescription}` : ''}
${category ? `Industry/Category: ${category}` : ''}
Target Audience: ${targetAudience}
Style Preference: ${style}

Requirements:
1. Perfect for B2B wholesale businesses
2. Professional and memorable
3. Short (3-8 words ideal)
4. Emphasize quality, trust, and value
5. Appeal to retailers and business buyers
6. Each tagline should be unique and distinct

Return only the taglines, one per line, without numbers or formatting.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert brand copywriter specializing in B2B wholesale taglines. Create memorable, professional taglines that build trust and emphasize value for business customers."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.8,
      });

      const generatedText = response.choices[0].message.content || "";
      const taglines = generatedText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.match(/^\d+\./))
        .slice(0, 5);

      if (taglines.length === 0) {
        // Fallback taglines if AI response is empty
        const fallbackTaglines = [
          `Quality ${businessName} Products`,
          `Your Trusted Business Partner`,
          `Professional Solutions Delivered`,
          `Excellence in Every Order`,
          `Reliable Wholesale Supply`
        ];
        return res.json({ taglines: fallbackTaglines });
      }
      
      res.json({ taglines });
    } catch (error: any) {
      console.error("Error generating taglines:", error);
      
      // Provide fallback taglines on error
      const fallbackTaglines = [
        `Quality ${req.body.businessName || 'Business'} Products`,
        `Your Trusted Business Partner`,
        `Professional Solutions Delivered`,
        `Excellence in Every Order`,
        `Reliable Wholesale Supply`
      ];
      
      if (error.code === 'insufficient_quota') {
        res.status(200).json({ 
          taglines: fallbackTaglines,
          message: "AI tagline generation temporarily unavailable. Here are some suggested taglines.",
          fallback: true
        });
      } else {
        res.json({ 
          taglines: fallbackTaglines,
          message: "Generated fallback taglines. Try again for AI-powered suggestions.",
          fallback: true
        });
      }
    }
  });

  // PATCH /api/products/:productId/low-stock-threshold
  app.patch('/api/products/:productId/low-stock-threshold', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { productId } = req.params;
      const { threshold } = req.body;
      
      if (!threshold || threshold < 0) {
        return res.status(400).json({ message: "Valid threshold required" });
      }

      await storage.updateProductLowStockThreshold(parseInt(productId), userId, parseInt(threshold));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating low stock threshold:", error);
      res.status(500).json({ message: "Failed to update threshold" });
    }
  });

}
