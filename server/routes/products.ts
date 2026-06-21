import type { Express } from "express";
import {
  and, asc, count, db, eq, generateProductImage, insertProductSchema, isNull, openai, or,
  products, requireAuth, requireMemberPermission, requireNotViewer, requireProductLimits, sql, storage, users, z
} from "./shared";
import { productBatches, stockMovements } from "@shared/schema";
import { isImpersonating } from "../utils/isImpersonating";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import { sendEmail } from "../sendgrid-service";
import { fetchLogoBuffer, buildBrandedWorkbook, buildBrandedPdf } from '../utils/price-list-export';
import { getEmailLogoUrl } from '../email-templates';

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
      
      // Customer-facing view: hide locked products and cost price.
      // A request is a customer view if the requester is viewing someone else's products
      // (wholesaler admin views their own, team members use wholesalerId override above)
      const isCustomerView = req.user.role !== 'team_member' && targetUserId !== req.user.id;

      // Only wholesaler/team-member paths receive cost price — customers never should.
      let productList = await storage.getProducts(targetUserId, { includeCostPrice: !isCustomerView });

      if (isCustomerView) {
        productList = productList.filter(p => p.status !== 'locked');
      }

      res.json(productList);
      // Fire-and-forget: clear stale promo_active flags in DB
      const staleIds = productList.filter(p => !p.promoActive).map(p => p.id);
      for (const staleId of staleIds) {
        db.update(products).set({ promoActive: false, promoPrice: null }).where(eq(products.id, staleId)).catch((error: Error) => {
          console.error('Failed to deactivate stale promo', { productId: staleId, error: error.message });
        });
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // GET /api/products/expiring
  app.get('/api/products/expiring', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = resolveWholesalerId(req);
      const expiring = await storage.getExpiringProducts(targetUserId);
      res.json(expiring);
    } catch (error) {
      console.error("Error fetching expiring products:", error);
      res.status(500).json({ message: "Failed to fetch expiring products" });
    }
  });

  // GET /api/products/catalogue-export — branded standard price list (xlsx or pdf)
  app.get('/api/products/catalogue-export', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';

      const allProducts = (await storage.getProducts(wholesalerId))
        .filter((p: any) => p.status === 'active')
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

      const rows = allProducts.map((p: any) => {
        const hasPallets = p.palletPrice != null;
        const numericSize = p.unitSize != null ? String(parseFloat(String(p.unitSize))) : null;
        const unitDisplay = numericSize && p.unitOfMeasure
          ? `${numericSize}${p.unitOfMeasure}`
          : numericSize || p.unitOfMeasure || null;
        const packParts = [p.packQuantity, unitDisplay].filter(Boolean);
        const palletPrice: number | '' = hasPallets ? parseFloat(p.palletPrice) : '';
        const unitsPerPallet: number | '' = hasPallets && p.unitsPerPallet != null ? p.unitsPerPallet : '';
        return {
          name: p.name || '—',
          packSize: packParts.length > 0 ? packParts.join(' x ') : '—',
          unitPrice: parseFloat(p.price || '0'),
          palletPrice,
          unitsPerPallet,
        };
      });

      const wholesaler = await storage.getUser(wholesalerId);
      const businessName = wholesaler?.businessName || 'Standard Price List';
      const logoUrl = getEmailLogoUrl(wholesalerId, wholesaler?.logoType, wholesaler?.logoUrl, wholesaler?.updatedAt);
      let logoBuffer: Buffer | undefined;
      let logoExtension: 'png' | 'jpeg' | 'gif' | undefined;
      if (logoUrl) {
        const logoData = await fetchLogoBuffer(logoUrl);
        if (logoData) { logoBuffer = logoData.buffer; logoExtension = logoData.extension; }
      }

      const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const subtitle = `Standard Price List · ${dateStr}`;
      const safeName = businessName.replace(/[/\\?%*:|"<>]/g, '-');

      if (format === 'pdf') {
        const pdfBuffer = await buildBrandedPdf({ rows, subtitle, logoBuffer, businessName });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName} - Standard Price List.pdf"`);
        return res.send(pdfBuffer);
      }

      const { wb, filename } = await buildBrandedWorkbook({
        rows,
        subtitle,
        filename: `${safeName} - Standard Price List.xlsx`,
        logoBuffer,
        logoExtension,
        businessName,
      });
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err: any) {
      console.error('Error exporting catalogue:', err);
      res.status(500).json({ message: 'Failed to export catalogue' });
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
      // Ownership check — team members share their parent wholesaler's product catalogue
      const effectiveWholesalerId = req.user.wholesalerId || req.user.id;
      if (product.wholesalerId !== effectiveWholesalerId) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // POST /api/products
  app.post('/api/products', requireAuth, requireNotViewer, requireMemberPermission('products'), requireProductLimits(), async (req: any, res) => {
    try {
      // Use parent company ID for team members to ensure data inheritance
      const targetUserId = resolveWholesalerId(req);
      
      const wholesalerUser = await storage.getUser(targetUserId);
      const defaultThreshold = wholesalerUser?.defaultLowStockThreshold ?? 50;

      const productData = insertProductSchema.parse({
        ...req.body,
        wholesalerId: targetUserId,
        lowStockThreshold: req.body.lowStockThreshold ?? defaultThreshold,
      });
      // Derive palletStock from base units — never accept it from the form.
      // Formula: floor(floor(stock / quantityInPack) / unitsPerPallet)
      const _createStock = productData.stock ?? 0;
      const _createQip = productData.quantityInPack ?? 1;
      const _createUpp = productData.unitsPerPallet ?? 0;
      (productData as any).palletStock = (_createUpp > 0 && _createQip > 0)
        ? Math.floor(Math.floor(_createStock / _createQip) / _createUpp)
        : 0;
      // Create product + initial batch atomically so a batch-insert failure
      // never leaves a product without batch coverage.
      const product = await db.transaction(async (tx) => {
        const initialStock = productData.stock ?? 0;
        const [newProduct] = await tx.insert(products).values({
          ...productData,
          baseUnitStock: initialStock,
        } as typeof products.$inferInsert).returning();

        // Auto-create an initial batch so the product is immediately FEFO-trackable
        // (only needed when there is actual stock to track).
        let initialBatchId: number | undefined;
        if (initialStock > 0) {
          const [initialBatch] = await tx.insert(productBatches).values({
            productId: newProduct.id,
            batchNumber: 'Initial Stock',
            quantity: initialStock,
            status: 'active',
            notes: 'Initial stock batch (auto-created on product creation)',
          }).returning();
          initialBatchId = initialBatch.id;
        }

        // Always write the opening stock movement — even at 0 — so every product's
        // history starts cleanly and the summary strip identity always balances.
        await tx.insert(stockMovements).values({
          productId: newProduct.id,
          wholesalerId: targetUserId,
          movementType: 'initial',
          quantity: initialStock,
          unitType: 'units',
          stockBefore: 0,
          stockAfter: initialStock,
          reason: 'Initial stock',
          batchId: initialBatchId ?? null,
        });
        return newProduct;
      });

      // Track real-user activity (skip when super admin is impersonating)
      if (!isImpersonating(req)) {
        storage.updateUserRealActivity(targetUserId).catch(() => {});
      }

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
  app.patch('/api/products/:id', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
    const targetUserId = resolveWholesalerId(req);
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

      // ── Stock field: batch-managed products are off-limits ──────────────────
      // If this product already has batches, the stock column is owned exclusively
      // by the batch system (Manage Stock). Strip it from the patch payload so a
      // product-edit form save can never silently overwrite batch-managed inventory.
      const productHasBatches = (existingProduct.batchCount ?? 0) > 0;
      if (productHasBatches) {
        delete (productData as any).stock;
        delete (productData as any).baseUnitStock;
      }

      // ── Stock validation (only relevant when no batches exist) ───────────────
      if (!productHasBatches && req.body.stock !== undefined) {
        const requestedStock = Number(req.body.stock);
        if (!Number.isFinite(requestedStock) || requestedStock < 0) {
          return res.status(400).json({ message: "Stock must be a non-negative number" });
        }
      }

      // ── Derive palletStock from base units — never accept from the form ──────
      // Use submitted values where present, else fall back to what's on the existing product.
      {
        const _updStock = (productData as any).stock !== undefined
          ? Number((productData as any).stock)
          : (existingProduct.stock ?? 0);
        const _updQip = (productData as any).quantityInPack !== undefined
          ? Number((productData as any).quantityInPack)
          : (existingProduct.quantityInPack ?? 1);
        const _updUpp = (productData as any).unitsPerPallet !== undefined
          ? Number((productData as any).unitsPerPallet)
          : (existingProduct.unitsPerPallet ?? 0);
        (productData as any).palletStock = (_updUpp > 0 && _updQip > 0)
          ? Math.floor(Math.floor(_updStock / _updQip) / _updUpp)
          : 0;
      }

      // ── Atomic product update + batch reconciliation ────────────────────────
      // When `stock` is being patched (and no batches exist) we reconcile the
      // batch pool in the SAME transaction so product.stock and batch totals are
      // never out of sync.
      const product = await db.transaction(async (tx) => {
        // Update the product row
        const [updatedProduct] = await tx
          .update(products)
          .set({ ...productData, updatedAt: new Date() } as Partial<typeof products.$inferSelect>)
          .where(eq(products.id, id))
          .returning();

        // Sync: when cost_price is updated on the product, mirror it to the
        // "Initial Stock" batch so batch-level cost stays consistent.
        if (req.body.costPrice !== undefined) {
          const newCostStr = productData.costPrice ? String(productData.costPrice) : null;
          await tx
            .update(productBatches)
            .set({ costPrice: newCostStr })
            .where(
              and(
                eq(productBatches.productId, id),
                eq(productBatches.batchNumber, 'Initial Stock')
              )
            );
        }

        if (!productHasBatches && req.body.stock !== undefined) {
          const newStock = Number(req.body.stock) || 0;
          const today = new Date().toISOString().split('T')[0];

          // Current batch total (active non-expired batches only)
          const [batchSumRow] = await tx
            .select({ total: sql<number>`COALESCE(SUM(${productBatches.quantity}),0)` })
            .from(productBatches)
            .where(
              and(
                eq(productBatches.productId, id),
                eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
              )
            );
          const currentBatchTotal = Number(batchSumRow?.total ?? 0);
          const delta = newStock - currentBatchTotal;

          if (delta > 0) {
            // Stock increase: create an adjustment batch for the additional units
            const [adjBatch] = await tx.insert(productBatches).values({
              productId: id,
              batchNumber: `ADJ-${Date.now()}`,
              quantity: delta,
              status: 'active',
              notes: `Stock adjustment batch (manual stock edit +${delta} units)`,
            }).returning();

            // Record the manual increase in movement history
            await tx.insert(stockMovements).values({
              productId: id,
              wholesalerId: targetUserId,
              movementType: 'manual_increase',
              quantity: delta,
              unitType: 'units',
              stockBefore: currentBatchTotal,
              stockAfter: newStock,
              reason: `Manual stock edit (+${delta} units)`,
              batchId: adjBatch.id,
            });
          } else if (delta < 0) {
            // Stock decrease: deduct from batches in FEFO order
            const activeBatches = await tx
              .select()
              .from(productBatches)
              .where(
                and(
                  eq(productBatches.productId, id),
                  eq(productBatches.status, 'active'),
                  or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
                )
              )
              .orderBy(
                sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`,
                asc(productBatches.expiryDate),
                asc(productBatches.createdAt)
              );

            let toDeduct = Math.abs(delta);
            for (const batch of activeBatches) {
              if (toDeduct <= 0) break;
              const deduct = Math.min(toDeduct, batch.quantity);
              const newQty = batch.quantity - deduct;
              const newStatus = newQty === 0 ? 'depleted' : 'active';
              await tx.update(productBatches)
                .set({ quantity: newQty, status: newStatus, updatedAt: new Date() })
                .where(eq(productBatches.id, batch.id));
              toDeduct -= deduct;
            }
            // Re-sync products.stock from actual batch sum so the row always
            // reflects the true source of truth, even when the batch pool could
            // not cover the full requested decrease.
            const today2 = new Date().toISOString().split('T')[0];
            const [actualSumRow] = await tx
              .select({ total: sql<number>`COALESCE(SUM(${productBatches.quantity}),0)` })
              .from(productBatches)
              .where(and(
                eq(productBatches.productId, id),
                eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today2}`)
              ));
            const actualStock = Number(actualSumRow?.total ?? 0);
            await tx.update(products)
              .set({ stock: actualStock, updatedAt: new Date() })
              .where(eq(products.id, id));

            if (toDeduct > 0) {
              console.warn(`⚠️ Batch pool exhausted for product ${id}: ${toDeduct} units unaccounted. products.stock synced to actual batch total: ${actualStock}.`);
            }

            // Record the manual decrease in movement history
            await tx.insert(stockMovements).values({
              productId: id,
              wholesalerId: targetUserId,
              movementType: 'manual_decrease',
              quantity: -(currentBatchTotal - actualStock),
              unitType: 'units',
              stockBefore: currentBatchTotal,
              stockAfter: actualStock,
              reason: `Manual stock edit (-${currentBatchTotal - actualStock} units)`,
            });
          }
        }

        return updatedProduct;
      });
      // ──────────────────────────────────────────────────────────────────────

      // Track real-user activity (skip when super admin is impersonating)
      if (!isImpersonating(req)) {
        storage.updateUserRealActivity(targetUserId).catch(() => {});
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

  // DELETE /api/products/:id
  app.delete('/api/products/:id', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      // Use parent company ID for team members to inherit data access
      const targetUserId = resolveWholesalerId(req);
      
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
            
            for (const product of productsToUnlock) {
              await storage.updateProduct(product.id, { status: 'active' });
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
  app.get('/api/promotions', requireAuth, requireMemberPermission('promotions'), async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = resolveWholesalerId(req);
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
  app.post('/api/products/:id/promotions', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = resolveWholesalerId(req);
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
  app.patch('/api/products/:id/promotions/:promoId', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = resolveWholesalerId(req);
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
  app.delete('/api/products/:id/promotions/:promoId', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = resolveWholesalerId(req);
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
  app.post('/api/products/reset-promotions', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
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
      const targetUserId = resolveWholesalerId(req);
      const { includeAlerts = 'true' } = req.query;
      
      const inventoryStatus = await storage.getInventoryStatus(targetUserId);
      
      if (includeAlerts === 'true') {
        const stockAlerts = await storage.getStockAlerts(targetUserId);
        return res.json({ ...inventoryStatus, alerts: stockAlerts });
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
      const targetUserId = resolveWholesalerId(req);
      const { unreadOnly = 'false' } = req.query;
      
      const alerts = await storage.getStockAlerts(targetUserId, unreadOnly === 'true');
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

  // POST /api/inventory/alerts/:id/mark-read
  app.post('/api/inventory/alerts/:id/mark-read', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
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
  app.post('/api/inventory/alerts/:id/resolve', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
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
      const effectiveUserId = req.user.wholesalerId || req.user.id;
      const productId = parseInt(req.params.id);
      
      // Verify the user (or their employer) owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== effectiveUserId) {
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
      const productId = parseInt(req.params.id);
      // Support both wholesaler owners and their team members
      const effectiveUserId = req.user.wholesalerId || req.user.id;

      // Verify the user (or their employer) owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== effectiveUserId) {
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
  app.post('/api/products/:id/stock-adjustment', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
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
      const { productName, category } = req.body;
      
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({ message: "AI description generation is not available. Please add your OPENAI_API_KEY to use this feature." });
      }

      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `STRICT LIMIT: 250 characters or fewer total. Write a short, punchy wholesale product description (one or two sentences) for: ${productName}${category ? ` (${category})` : ''}. No bullet points, no formatting, no introductory phrases — just the description itself.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You write short product descriptions for wholesale platforms. CRITICAL RULE: every response must be 250 characters or fewer — count carefully. One or two sentences only. No bullet points, no formatting markers.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 120,
      }, { signal: AbortSignal.timeout(25_000) });

      let generatedDescription = (response.choices[0].message.content || "").trim();

      if (generatedDescription.length > 250) {
        const truncated = generatedDescription.slice(0, 250);
        const lastSpace = truncated.lastIndexOf(" ");
        generatedDescription = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated.slice(0, 247) + "...";
      }

      res.json({ description: generatedDescription });
    } catch (error) {
      console.error("AI description generation error:", error);
      res.status(500).json({ message: "Failed to generate description" });
    }
  });

  // GET /api/public/products/:slug
  // Slug format: "{name-slugified}-{productId}" or just "{productId}"
  app.get("/api/public/products/:slug", async (req, res) => {
    try {
      const { slug } = req.params;

      // Parse product ID — last hyphen-separated segment, or the whole slug if numeric
      const segments = slug.split('-');
      const lastSegment = segments[segments.length - 1];
      const productId = parseInt(lastSegment, 10);

      if (isNaN(productId)) {
        return res.status(404).json({ message: "Product not found" });
      }

      const product = await storage.getProduct(productId);
      if (!product || product.status !== 'active') {
        return res.status(404).json({ message: "Product not found" });
      }

      const wholesaler = await storage.getUser(product.wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Product not found" });
      }

      const images: string[] = [];
      if (product.images && Array.isArray(product.images)) {
        images.push(...(product.images as string[]));
      } else if (product.imageUrl) {
        images.push(product.imageUrl);
      }

      const availability =
        (product.stock ?? 0) <= 0
          ? "Out of Stock"
          : (product.stock ?? 0) < 20
          ? `Low Stock — ${product.stock} units left`
          : "In Stock — Available Now";

      const location = [wholesaler.city, wholesaler.country].filter(Boolean).join(', ') || 'United Kingdom';

      // Store-wide visibility controls — redact hidden fields so they never reach public clients
      const priceVisible = (wholesaler.priceDisplayMode ?? 'hidden') === 'shown';
      const moqVisible = wholesaler.moqVisible !== false;
      const stockVisible = wholesaler.stockVisible === true;
      const packSizeVisible = wholesaler.packSizeVisible !== false;

      res.json({
        id: product.id.toString(),
        name: product.name,
        description: product.description || '',
        price: priceVisible ? product.price : null,
        category: product.category || 'General',
        images,
        wholesaler: {
          id: wholesaler.id,
          businessName: wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Supplier',
          location,
          rating: 5.0,
          totalReviews: 0,
          phoneNumber: wholesaler.businessPhone || wholesaler.phoneNumber || undefined,
          email: wholesaler.businessEmail || wholesaler.email || undefined,
        },
        specifications: {},
        availability: stockVisible ? availability : null,
        minOrderQuantity: moqVisible ? (product.moq ?? 1) : null,
        packQuantity: packSizeVisible ? (product.packQuantity ?? null) : null,
        unitSize: packSizeVisible ? (product.unitSize ?? (product as any).sizePerUnit ?? null) : null,
        unitOfMeasure: packSizeVisible ? (product.unitOfMeasure ?? null) : null,
        priceVisible,
        moqVisible,
        stockVisible,
        packSizeVisible,
        views: 0,
        lastUpdated: product.updatedAt?.toISOString() ?? new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching public product:", error);
      res.status(500).json({ message: "Product not found" });
    }
  });

  // POST /api/public/products/:slug/inquiry
  app.post("/api/public/products/:slug/inquiry", async (req, res) => {
    try {
      const { slug } = req.params;
      const { name, email, phone, message, company, companyName, quantity } = req.body;
      const resolvedCompany = company || companyName || null;

      if (!name || !email || !message) {
        return res.status(400).json({ message: "Name, email, and message are required" });
      }

      // Resolve product from slug (last hyphen-separated segment is the ID)
      const segments = slug.split('-');
      const productId = parseInt(segments[segments.length - 1], 10);
      if (isNaN(productId)) {
        return res.status(404).json({ message: "Product not found" });
      }

      const product = await storage.getProduct(productId);
      if (!product || product.status !== 'active') {
        return res.status(404).json({ message: "Product not found" });
      }

      const wholesaler = await storage.getUser(product.wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Product not found" });
      }

      const wholesalerEmail = wholesaler.businessEmail || wholesaler.email;
      if (wholesalerEmail) {
        const phoneLine = phone ? `<p><strong>Phone:</strong> ${phone}</p>` : '';
        const companyLine = resolvedCompany ? `<p><strong>Company:</strong> ${resolvedCompany}</p>` : '';
        const quantityLine = quantity ? `<p><strong>Quantity required:</strong> ${quantity}</p>` : '';
        await sendEmail({
          to: wholesalerEmail,
          from: 'hello@quikpik.co',
          subject: `New inquiry about ${product.name}`,
          html: `
            <h2>New product inquiry via Quikpik</h2>
            <p><strong>Product:</strong> ${product.name}</p>
            <hr />
            <p><strong>From:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phoneLine}
            ${companyLine}
            ${quantityLine}
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-wrap">${message}</p>
            <hr />
            <p style="color:#666;font-size:12px">Sent via Quikpik public product page</p>
          `,
          text: `New inquiry about ${product.name}\n\nFrom: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ''}${resolvedCompany ? `\nCompany: ${resolvedCompany}` : ''}${quantity ? `\nQuantity required: ${quantity}` : ''}\n\nMessage:\n${message}`,
        });
      }

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

      if (!openai) {
        return res.status(503).json({ message: "AI service not available" });
      }

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
      }, { signal: AbortSignal.timeout(25_000) });

      const generatedText = response.choices[0].message.content || "";
      const taglines = generatedText
        .split('\n')
        .map((line: any) => line.trim())
        .filter((line: any) => line.length > 0 && !line.match(/^\d+\./))
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
  app.patch('/api/products/:productId/low-stock-threshold', requireAuth, requireNotViewer, requireMemberPermission('products'), async (req: any, res) => {
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
