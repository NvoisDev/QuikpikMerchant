import type { Express } from "express";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import {
  db, requireAuth,
  orders, orderItems, products,
  eq, and, inArray,
} from "./shared";
import { orderPicking, orderItemPicks } from "@shared/schema";

export function registerPickingRoutes(app: Express): void {

  // POST /api/orders/bulk-picking
  // Bulk-update picking status for multiple orders at once.
  // action: 'picking' | 'packed' | 'reset'
  app.post('/api/orders/bulk-picking', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      const userId: string = req.user?.claims?.sub ?? req.user?.id ?? 'unknown';
      const { orderIds, action } = req.body as { orderIds: number[]; action: string };

      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: 'orderIds must be a non-empty array' });
      }
      if (!['picking', 'packed', 'reset'].includes(action)) {
        return res.status(400).json({ error: 'action must be picking, packed, or reset' });
      }

      // Verify all orders belong to this wholesaler
      const ownedOrders = await db.select({ id: orders.id })
        .from(orders)
        .where(and(inArray(orders.id, orderIds), eq(orders.wholesalerId, wholesalerId)));
      const ownedIds = ownedOrders.map(o => o.id);
      if (ownedIds.length === 0) return res.status(403).json({ error: 'No accessible orders found' });

      const now = new Date();

      for (const orderId of ownedIds) {
        if (action === 'picking') {
          // Directly set status to 'picking' without touching item picks
          const [existing] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));
          if (existing) {
            await db.update(orderPicking)
              .set({ pickingStatus: 'picking', updatedAt: now })
              .where(eq(orderPicking.id, existing.id));
          } else {
            await db.insert(orderPicking).values({ orderId, pickingStatus: 'picking' });
          }
        } else if (action === 'packed') {
          // Mark all items as picked and set status to packed
          const items = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
          for (const item of items) {
            const [existing] = await db.select().from(orderItemPicks)
              .where(and(eq(orderItemPicks.orderItemId, item.id), eq(orderItemPicks.orderId, orderId)))
              .limit(1);
            if (existing) {
              await db.update(orderItemPicks)
                .set({ isPicked: true, pickedAt: now, pickedBy: userId, updatedAt: now })
                .where(and(eq(orderItemPicks.id, existing.id), eq(orderItemPicks.orderId, orderId)));
            } else {
              await db.insert(orderItemPicks).values({ orderId, orderItemId: item.id, isPicked: true, pickedAt: now, pickedBy: userId });
            }
          }
          const [existingPicking] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));
          if (existingPicking) {
            await db.update(orderPicking)
              .set({ pickingStatus: 'packed', completedAt: now, completedBy: userId, updatedAt: now })
              .where(eq(orderPicking.id, existingPicking.id));
          } else {
            await db.insert(orderPicking).values({ orderId, pickingStatus: 'packed', completedAt: now, completedBy: userId });
          }
        } else if (action === 'reset') {
          // Reset all item picks and set status to not_started
          const items = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
          const itemIds = items.map(i => i.id);
          if (itemIds.length > 0) {
            await db.update(orderItemPicks)
              .set({ isPicked: false, pickedAt: null, pickedBy: null, updatedAt: now })
              .where(and(inArray(orderItemPicks.orderItemId, itemIds), eq(orderItemPicks.orderId, orderId)));
          }
          const [existingPicking] = await db.select().from(orderPicking).where(eq(orderPicking.orderId, orderId));
          if (existingPicking) {
            await db.update(orderPicking)
              .set({ pickingStatus: 'not_started', completedAt: null, completedBy: null, resetAt: now, resetBy: userId, updatedAt: now })
              .where(eq(orderPicking.id, existingPicking.id));
          } else {
            await db.insert(orderPicking).values({ orderId, pickingStatus: 'not_started', resetAt: now, resetBy: userId });
          }
        }
      }

      res.json({ success: true, updatedCount: ownedIds.length });
    } catch (err) {
      console.error('[picking] bulk update error:', err);
      res.status(500).json({ error: 'Failed to bulk-update picking status' });
    }
  });

  // GET /api/orders/:id/picking
  // Returns current picking state + full item details (product name, qty, image)
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

      // Fetch all items for this order, joined with product details
      const itemRows = await db.select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        sellingType: orderItems.sellingType,
        freeItems: orderItems.freeItems,
        productName: products.name,
        productImageUrl: products.imageUrl,
        productUnitSize: products.unitSize,
        productUnitOfMeasure: products.unitOfMeasure,
      }).from(orderItems)
        .leftJoin(products, eq(products.id, orderItems.productId))
        .where(eq(orderItems.orderId, orderId));

      // Fetch existing item pick rows — scoped to this order's items only
      const itemIds = itemRows.map(i => i.id);
      const existingPicks = itemIds.length > 0
        ? await db.select().from(orderItemPicks)
            .where(and(
              inArray(orderItemPicks.orderItemId, itemIds),
              eq(orderItemPicks.orderId, orderId),
            ))
        : [];
      const picksMap: Record<number, typeof existingPicks[0]> = {};
      existingPicks.forEach(p => { picksMap[p.orderItemId] = p; });

      res.json({
        pickingStatus: pickingRow?.pickingStatus ?? 'not_started',
        completedAt: pickingRow?.completedAt ?? null,
        completedBy: pickingRow?.completedBy ?? null,
        resetAt: pickingRow?.resetAt ?? null,
        resetBy: pickingRow?.resetBy ?? null,
        items: itemRows.map(item => ({
          orderItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          sellingType: item.sellingType,
          freeItems: item.freeItems,
          productName: item.productName ?? `Product #${item.productId}`,
          productImageUrl: item.productImageUrl ?? null,
          productUnitSize: item.productUnitSize ?? null,
          productUnitOfMeasure: item.productUnitOfMeasure ?? null,
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
  // Toggle isPicked for a single order item (item must belong to this order)
  app.patch('/api/orders/:id/picking/items/:itemId', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const orderItemId = parseInt(req.params.itemId);
      if (isNaN(orderId) || isNaN(orderItemId)) return res.status(400).json({ error: 'Invalid IDs' });

      const wholesalerId = resolveWholesalerId(req);
      const userId: string = req.user?.claims?.sub ?? req.user?.id ?? 'unknown';

      // Verify order access
      const [order] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Access denied' });

      // Verify the item belongs to this exact order (prevents cross-order contamination)
      const [orderItem] = await db.select({ id: orderItems.id })
        .from(orderItems)
        .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
        .limit(1);
      if (!orderItem) return res.status(404).json({ error: 'Order item not found in this order' });

      const { isPicked } = req.body;
      const now = new Date();

      // Upsert item pick row — always scoped to both orderId and orderItemId
      const [existing] = await db.select().from(orderItemPicks)
        .where(and(
          eq(orderItemPicks.orderItemId, orderItemId),
          eq(orderItemPicks.orderId, orderId),
        ))
        .limit(1);

      if (existing) {
        await db.update(orderItemPicks)
          .set({
            isPicked: !!isPicked,
            pickedAt: isPicked ? now : null,
            pickedBy: isPicked ? userId : null,
            updatedAt: now,
          })
          .where(and(
            eq(orderItemPicks.id, existing.id),
            eq(orderItemPicks.orderId, orderId),
          ));
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

      // Fetch only items that belong to this order
      const items = await db.select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const now = new Date();

      // Upsert every item to isPicked = true
      for (const item of items) {
        const [existing] = await db.select().from(orderItemPicks)
          .where(and(
            eq(orderItemPicks.orderItemId, item.id),
            eq(orderItemPicks.orderId, orderId),
          ))
          .limit(1);
        if (existing) {
          await db.update(orderItemPicks)
            .set({ isPicked: true, pickedAt: now, pickedBy: userId, updatedAt: now })
            .where(and(
              eq(orderItemPicks.id, existing.id),
              eq(orderItemPicks.orderId, orderId),
            ));
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

      // Fetch only items belonging to this order
      const items = await db.select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const now = new Date();
      const itemIds = items.map(i => i.id);

      // Reset item picks — constrained to this order (both columns)
      if (itemIds.length > 0) {
        await db.update(orderItemPicks)
          .set({ isPicked: false, pickedAt: null, pickedBy: null, updatedAt: now })
          .where(and(
            inArray(orderItemPicks.orderItemId, itemIds),
            eq(orderItemPicks.orderId, orderId),
          ));
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
// Only touches the order_picking and order_item_picks tables — no stock,
// no notifications, no analytics, no order status changes.
async function _recalcPickingStatus(orderId: number, userId: string) {
  const items = await db.select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return;

  const itemIds = items.map(i => i.id);
  const picks = await db.select().from(orderItemPicks)
    .where(and(
      inArray(orderItemPicks.orderItemId, itemIds),
      eq(orderItemPicks.orderId, orderId),
    ));

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
