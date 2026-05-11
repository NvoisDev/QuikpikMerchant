import type { Express } from "express";
import { requireAuth } from "./shared";
import { db, eq } from "./shared";
import { products, stockMovements } from "@shared/schema";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";

export function registerReportRoutes(app: Express): void {
  // GET /api/reports/stock-summary
  // Returns one row per product with aggregated stock movement figures.
  app.get('/api/reports/stock-summary', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);

      const [productList, movements] = await Promise.all([
        db.select({ id: products.id, name: products.name, stock: products.stock })
          .from(products)
          .where(eq(products.wholesalerId, wholesalerId)),
        db.select({
          productId: stockMovements.productId,
          movementType: stockMovements.movementType,
          quantity: stockMovements.quantity,
          stockAfter: stockMovements.stockAfter,
          reason: stockMovements.reason,
        })
          .from(stockMovements)
          .where(eq(stockMovements.wholesalerId, wholesalerId)),
      ]);

      // Group movements by product id
      const byProduct = new Map<number, typeof movements>();
      for (const m of movements) {
        if (!byProduct.has(m.productId)) byProduct.set(m.productId, []);
        byProduct.get(m.productId)!.push(m);
      }

      const rows = productList.map((product) => {
        const mvs = byProduct.get(product.id) ?? [];
        let openingStock = 0;
        let totalIn = 0;
        let totalSold = 0;

        for (const m of mvs) {
          const isCorrection =
            typeof m.reason === 'string' &&
            m.reason.toLowerCase().includes('correction');

          if (m.movementType === 'initial') {
            openingStock = m.stockAfter;
          } else if (m.movementType === 'manual_increase') {
            totalIn += m.quantity;
          } else if (m.movementType === 'purchase' && !isCorrection) {
            totalSold += Math.abs(m.quantity);
          } else if (m.movementType === 'return' && !isCorrection) {
            totalSold -= Math.abs(m.quantity);
          }
        }

        return {
          name: product.name,
          openingStock,
          totalIn,
          totalSold: Math.max(0, totalSold),
          currentStock: product.stock ?? 0,
        };
      });

      // Sort alphabetically by product name
      rows.sort((a, b) => a.name.localeCompare(b.name));

      res.json(rows);
    } catch (error) {
      console.error('Error generating stock summary report:', error);
      res.status(500).json({ message: 'Failed to generate stock summary report' });
    }
  });
}
