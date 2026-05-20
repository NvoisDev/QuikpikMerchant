import type { Express } from "express";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import {
  db, requireAuth,
  orders, orderItems,
  eq, inArray,
} from "./shared";
import { orderPicking, orderItemPicks } from "@shared/schema";

export function registerPickingRoutes(app: Express): void {

  // GET /api/orders/:id/picking
  // Returns the current picking state for an order: overall status + per-item flags
  app.get('/api/orders/:id/picking', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

      const wholesalerId = resolveWholesalerId(req);

      // Verify access
      const [order] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Access denied' });

      // Fetch or initialise picking row
      const [pickingRow] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));

      // Fetch all items for this order
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      // Fetch existing item pick rows
      const itemIds = items.map(i => i.id);
      const existingPicks = itemIds.length > 0
        ? await db.select().from(orderItemPicks).where(inArray(orderItemPicks.orderItemId, itemIds))
        : [];
      const picksMap: Record<number, typeof existingPicks[0]> = {};
      existingPicks.forEach(p => { picksMap[p.orderItemId] = p; });

      res.json({
        pickingStatus: pickingRow?.pickingStatus ?? 'not_started',
        completedAt: pickingRow?.completedAt ?? null,
        completedBy: pickingRow?.completedBy ?? null,
        resetAt: pickingRow?.resetAt ?? null,
        resetBy: pickingRow?.resetBy ?? null,
        items: items.map(item => ({
          orderItemId: item.id,
          productId: item.productId,
          isPicked: picksMap[item.id]?.isPicked ?? false,
          pickedAt: picksMap[item.id]?.pickedAt ?? null,
          pickedBy: picksMap[item.id]?.pickedBy ?? null,
        })),
      });
    } catch (err) {
      console.error('[picking] GET error:', err);
      res.status(500).json({ error: 'Failed to fetch picking state' });
    }
  });

  // PATCH /api/orders/:id/picking/items/:itemId
  // Toggle isPicked for a single order item
  app.patch('/api/orders/:id/picking/items/:itemId', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const orderItemId = parseInt(req.params.itemId);
      if (isNaN(orderId) || isNaN(orderItemId)) return res.status(400).json({ error: 'Invalid IDs' });

      const wholesalerId = resolveWholesalerId(req);
      const userId: string = req.user?.claims?.sub ?? req.user?.id ?? 'unknown';

      // Verify access
      const [order] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Access denied' });

      const { isPicked } = req.body;
      const now = new Date();

      // Upsert item pick row
      const [existing] = await db.select().from(orderItemPicks)
        .where(eq(orderItemPicks.orderItemId, orderItemId)).limit(1);

      if (existing) {
        await db.update(orderItemPicks)
          .set({
            isPicked: !!isPicked,
            pickedAt: isPicked ? now : null,
            pickedBy: isPicked ? userId : null,
            updatedAt: now,
          })
          .where(eq(orderItemPicks.id, existing.id));
      } else {
        await db.insert(orderItemPicks).values({
          orderId,
          orderItemId,
          isPicked: !!isPicked,
          pickedAt: isPicked ? now : null,
          pickedBy: isPicked ? userId : null,
        });
      }

      // Recalculate overall picking status
      await _recalcPickingStatus(orderId, userId);

      res.json({ success: true });
    } catch (err) {
      console.error('[picking] PATCH item error:', err);
      res.status(500).json({ error: 'Failed to update pick' });
    }
  });

  // POST /api/orders/:id/picking/mark-all
  // Mark all items as picked and set status to 'packed'
  app.post('/api/orders/:id/picking/mark-all', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

      const wholesalerId = resolveWholesalerId(req);
      const userId: string = req.user?.claims?.sub ?? req.user?.id ?? 'unknown';

      const [order] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Access denied' });

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const now = new Date();

      // Upsert every item to isPicked = true
      for (const item of items) {
        const [existing] = await db.select().from(orderItemPicks)
          .where(eq(orderItemPicks.orderItemId, item.id)).limit(1);
        if (existing) {
          await db.update(orderItemPicks)
            .set({ isPicked: true, pickedAt: now, pickedBy: userId, updatedAt: now })
            .where(eq(orderItemPicks.id, existing.id));
        } else {
          await db.insert(orderItemPicks).values({
            orderId,
            orderItemId: item.id,
            isPicked: true,
            pickedAt: now,
            pickedBy: userId,
          });
        }
      }

      // Set picking status to packed
      const [existingPicking] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));
      if (existingPicking) {
        await db.update(orderPicking)
          .set({ pickingStatus: 'packed', completedAt: now, completedBy: userId, updatedAt: now })
          .where(eq(orderPicking.id, existingPicking.id));
      } else {
        await db.insert(orderPicking).values({
          orderId,
          pickingStatus: 'packed',
          completedAt: now,
          completedBy: userId,
        });
      }

      res.json({ success: true, pickingStatus: 'packed' });
    } catch (err) {
      console.error('[picking] mark-all error:', err);
      res.status(500).json({ error: 'Failed to mark all as picked' });
    }
  });

  // POST /api/orders/:id/picking/reset
  // Reset all pick flags and set status back to 'not_started'
  app.post('/api/orders/:id/picking/reset', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

      const wholesalerId = resolveWholesalerId(req);
      const userId: string = req.user?.claims?.sub ?? req.user?.id ?? 'unknown';

      const [order] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Access denied' });

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const now = new Date();
      const itemIds = items.map(i => i.id);

      // Reset all item picks
      if (itemIds.length > 0) {
        await db.update(orderItemPicks)
          .set({ isPicked: false, pickedAt: null, pickedBy: null, updatedAt: now })
          .where(inArray(orderItemPicks.orderItemId, itemIds));
      }

      // Reset overall picking row
      const [existingPicking] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));
      if (existingPicking) {
        await db.update(orderPicking)
          .set({ pickingStatus: 'not_started', completedAt: null, completedBy: null, resetAt: now, resetBy: userId, updatedAt: now })
          .where(eq(orderPicking.id, existingPicking.id));
      } else {
        await db.insert(orderPicking).values({
          orderId,
          pickingStatus: 'not_started',
          resetAt: now,
          resetBy: userId,
        });
      }

      res.json({ success: true, pickingStatus: 'not_started' });
    } catch (err) {
      console.error('[picking] reset error:', err);
      res.status(500).json({ error: 'Failed to reset checklist' });
    }
  });
}

// ── Helper: recalculate overall picking status based on item pick states ────
async function _recalcPickingStatus(orderId: number, userId: string) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return;

  const picks = await db.select().from(orderItemPicks)
    .where(inArray(orderItemPicks.orderItemId, items.map(i => i.id)));

  const pickedCount = picks.filter(p => p.isPicked).length;
  const totalCount = items.length;
  const now = new Date();

  let newStatus: string;
  let completedAt: Date | null = null;
  let completedBy: string | null = null;

  if (pickedCount === 0) {
    newStatus = 'not_started';
  } else if (pickedCount === totalCount) {
    newStatus = 'packed';
    completedAt = now;
    completedBy = userId;
  } else {
    newStatus = 'picking';
  }

  const [existing] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));
  if (existing) {
    await db.update(orderPicking)
      .set({ pickingStatus: newStatus, completedAt, completedBy, updatedAt: now })
      .where(eq(orderPicking.id, existing.id));
  } else {
    await db.insert(orderPicking).values({
      orderId,
      pickingStatus: newStatus,
      completedAt,
      completedBy,
    });
  }
}
