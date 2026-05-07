import type { Express } from "express";
import { storage, requireAuth, requireNotViewer, z, db, eq, and, sql } from "./shared";
import { products, productBatches, insertProductBatchSchema } from "@shared/schema";
import type { ProductBatch } from "@shared/schema";

export function registerBatchRoutes(app: Express): void {

  // Resolve wholesalerId from the authenticated user (team members inherit employer's id)
  function getWholesalerId(req: any): string {
    return req.user.role === 'team_member' && req.user.wholesalerId
      ? req.user.wholesalerId
      : req.user.id;
  }

  // Guard: verify the product belongs to this wholesaler
  async function verifyProductOwnership(productId: number, wholesalerId: string): Promise<boolean> {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.wholesalerId, wholesalerId)));
    return !!product;
  }

  /**
   * Fetch batch and verify it belongs to the given productId.
   * Returns the batch if valid, null if the batch doesn't exist or doesn't belong
   * to this product (prevents IDOR where a user could mutate another wholesaler's batch).
   */
  async function verifyBatchBelongsToProduct(batchId: number, productId: number): Promise<ProductBatch | null> {
    const [batch] = await db
      .select()
      .from(productBatches)
      .where(and(eq(productBatches.id, batchId), eq(productBatches.productId, productId)));
    return batch ?? null;
  }

  // GET /api/products/batches/all
  // Returns all batches for all products owned by the authenticated wholesaler (for export).
  // costPrice is omitted from the response for viewer-role team members.
  app.get('/api/products/batches/all', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const isViewer = req.user.teamMemberRole === 'viewer';

      const rows = await db
        .select({
          id: productBatches.id,
          productId: productBatches.productId,
          productName: products.name,
          batchNumber: productBatches.batchNumber,
          quantity: productBatches.quantity,
          originalQuantity: productBatches.originalQuantity,
          expiryDate: productBatches.expiryDate,
          createdAt: productBatches.createdAt,
          costPrice: productBatches.costPrice,
          status: productBatches.status,
        })
        .from(productBatches)
        .innerJoin(products, eq(productBatches.productId, products.id))
        .where(eq(products.wholesalerId, wholesalerId))
        .orderBy(products.name, productBatches.expiryDate);

      const response = isViewer
        ? rows.map(({ costPrice: _cp, ...rest }) => rest)
        : rows;

      res.json(response);
    } catch (error) {
      console.error('Error fetching all batches:', error);
      res.status(500).json({ error: 'Failed to fetch batches' });
    }
  });

  // GET /api/products/:id/batches
  // Returns all batches (active, depleted, expired) sorted FEFO — active first
  app.get('/api/products/:id/batches', requireAuth, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) return res.status(400).json({ error: 'Invalid product id' });

      const wholesalerId = getWholesalerId(req);
      if (!(await verifyProductOwnership(productId, wholesalerId))) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const batches = await storage.getProductBatches(productId, false); // false = history view (all statuses)
      res.json(batches);
    } catch (error) {
      console.error('Error fetching batches:', error);
      res.status(500).json({ error: 'Failed to fetch batches' });
    }
  });

  // POST /api/products/:id/batches  — create a new batch (stock-in event)
  app.post('/api/products/:id/batches', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) return res.status(400).json({ error: 'Invalid product id' });

      const wholesalerId = getWholesalerId(req);
      if (!(await verifyProductOwnership(productId, wholesalerId))) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const parsed = insertProductBatchSchema.safeParse({ ...req.body, productId });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid batch data', details: parsed.error.flatten() });
      }

      if ((parsed.data.quantity ?? 0) <= 0) {
        return res.status(400).json({ error: 'Batch quantity must be greater than 0' });
      }

      const batch = await storage.createProductBatch(parsed.data, wholesalerId);

      // Sync: when a new batch is created with a cost, promote it to the product-level field
      // so the invoice margin calculator always reflects the latest batch cost.
      if (parsed.data.costPrice != null && parsed.data.costPrice !== '') {
        await db
          .update(products)
          .set({ costPrice: String(parsed.data.costPrice), updatedAt: new Date() })
          .where(eq(products.id, productId));
      }

      res.status(201).json(batch);
    } catch (error) {
      console.error('Error creating batch:', error);
      res.status(500).json({ error: 'Failed to create batch' });
    }
  });

  // PATCH /api/products/:id/batches/:batchId  — update batch fields or adjust quantity
  app.patch('/api/products/:id/batches/:batchId', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const batchId = parseInt(req.params.batchId);
      if (isNaN(productId) || isNaN(batchId)) return res.status(400).json({ error: 'Invalid id' });

      const wholesalerId = getWholesalerId(req);
      if (!(await verifyProductOwnership(productId, wholesalerId))) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Verify batchId belongs to this product (prevents IDOR)
      const existingBatch = await verifyBatchBelongsToProduct(batchId, productId);
      if (!existingBatch) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      // If the caller sent a `delta` field, use adjustBatchQuantity; otherwise, use updateProductBatch
      if (req.body.delta !== undefined) {
        const delta = Number(req.body.delta);
        const reason = String(req.body.reason || 'Manual adjustment');
        if (isNaN(delta) || delta === 0) return res.status(400).json({ error: 'delta must be a non-zero number' });
        await storage.adjustBatchQuantity(batchId, delta, reason, wholesalerId);
        const updated = await storage.getProductBatches(productId, false); // false = include depleted batch in response
        const batch = updated.find(b => b.id === batchId);
        return res.json(batch ?? { id: batchId });
      }

      const allowed = ['batchNumber', 'quantity', 'costPrice', 'expiryDate', 'status', 'notes'];
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      if ('costPrice' in updates) {
        if (updates.costPrice === null || updates.costPrice === '') {
          updates.costPrice = null;
        } else {
          const costNum = Number(updates.costPrice);
          if (!isFinite(costNum) || costNum < 0) {
            return res.status(400).json({ error: 'costPrice must be a non-negative number or null' });
          }
          updates.costPrice = String(costNum);
        }
      }

      const updated = await storage.updateProductBatch(batchId, updates, wholesalerId);

      // Sync: when a batch's cost is changed, mirror it to the product-level cost_price
      // so the invoice margin calculator stays current.
      if ('costPrice' in updates) {
        await db
          .update(products)
          .set({ costPrice: updates.costPrice ?? null, updatedAt: new Date() })
          .where(eq(products.id, productId));
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating batch:', error);
      res.status(500).json({ error: 'Failed to update batch' });
    }
  });

  // GET /api/batches/expiring-soon
  // Returns products that have at least one active batch expiring within 30 days (or already expired)
  app.get('/api/batches/expiring-soon', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const today = new Date().toISOString().split('T')[0];
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const rows = await db.execute(sql`
        SELECT
          pb.id AS batch_id,
          pb.product_id,
          pb.batch_number,
          pb.quantity,
          pb.expiry_date,
          pb.cost_price,
          pb.status,
          p.name AS product_name,
          p.image_url,
          p.stock AS product_stock
        FROM product_batches pb
        JOIN products p ON p.id = pb.product_id
        WHERE p.wholesaler_id = ${wholesalerId}
          AND pb.status = 'active'
          AND pb.expiry_date IS NOT NULL
          AND pb.expiry_date <= ${in30Days}
        ORDER BY pb.expiry_date ASC
        LIMIT 100
      `);

      res.json(rows.rows.map(r => ({
        batchId: Number(r.batch_id),
        productId: Number(r.product_id),
        productName: String(r.product_name),
        productStock: Number(r.product_stock || 0),
        imageUrl: r.image_url ? String(r.image_url) : null,
        batchNumber: String(r.batch_number || ''),
        quantity: Number(r.quantity || 0),
        expiryDate: String(r.expiry_date),
        costPrice: r.cost_price ? String(r.cost_price) : null,
        status: String(r.status),
        isExpired: String(r.expiry_date) < today,
      })));
    } catch (error) {
      console.error('Error fetching expiring batches:', error);
      res.status(500).json({ error: 'Failed to fetch expiring batches' });
    }
  });

  // DELETE /api/products/:id/batches/:batchId  — soft-delete (mark as depleted)
  app.delete('/api/products/:id/batches/:batchId', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const batchId = parseInt(req.params.batchId);
      if (isNaN(productId) || isNaN(batchId)) return res.status(400).json({ error: 'Invalid id' });

      const wholesalerId = getWholesalerId(req);
      if (!(await verifyProductOwnership(productId, wholesalerId))) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Verify batchId belongs to this product (prevents IDOR)
      const existingBatch = await verifyBatchBelongsToProduct(batchId, productId);
      if (!existingBatch) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      await storage.updateProductBatch(batchId, { status: 'depleted', quantity: 0 }, wholesalerId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting batch:', error);
      res.status(500).json({ error: 'Failed to delete batch' });
    }
  });
}
