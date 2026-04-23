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

      const batch = await storage.createProductBatch(parsed.data);
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
      const updated = await storage.updateProductBatch(batchId, updates, wholesalerId);
      res.json(updated);
    } catch (error) {
      console.error('Error updating batch:', error);
      res.status(500).json({ error: 'Failed to update batch' });
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
