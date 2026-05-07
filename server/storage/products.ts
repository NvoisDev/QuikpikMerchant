import {
  users,
  products,
  orders,
  orderItems,
  customerGroups,
  customerGroupMembers,
  broadcasts,
  messageTemplates,
  templateProducts,
  templateCampaigns,
  campaignOrders,
  stockUpdateNotifications,
  stockMovements,
  productPerformanceSummary,
  stockAlerts,
  customerRegistrationRequests,
  customerProfileUpdateNotifications,
  userBadges,
  onboardingMilestones,
  smsVerificationCodes,
  customerPhoneVerifications,
  teamMembers,
  tabPermissions,
  deliveryAddresses,
  wholesalerCustomerRelationships,
  productBatches,
  type ProductBatch,
  type InsertProductBatch,
  type User,
  type UpsertUser,
  type Product,
  type InsertProduct,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type CustomerGroup,
  type InsertCustomerGroup,
  type Broadcast,
  type InsertBroadcast,
  type MessageTemplate,
  type InsertMessageTemplate,
  type TemplateProduct,
  type InsertTemplateProduct,
  type TemplateCampaign,
  type InsertTemplateCampaign,
  type CampaignOrder,
  type InsertCampaignOrder,
  type StockUpdateNotification,
  type InsertStockUpdateNotification,
  type StockMovement,
  type InsertStockMovement,
  type StockAlert,
  type InsertStockAlert,
  type TeamMember,
  type InsertTeamMember,
  type TabPermission,
  type InsertTabPermission,
  type UserBadge,
  type InsertUserBadge,
  type OnboardingMilestone,
  type InsertOnboardingMilestone,
  type SMSVerificationCode,
  type InsertSMSVerificationCode,
  type InsertCustomerProfileUpdateNotification,
  type SelectCustomerProfileUpdateNotification,
  type DeliveryAddress,
  type InsertDeliveryAddress,
  type WholesalerCustomerRelationship,
  type InsertWholesalerCustomerRelationship,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, asc, and, sql, sum, count, or, ilike, isNull, inArray, gt, lte } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../passwordUtils";
import { InventoryCalculator } from "../../shared/inventory-calculator.js";

import { UserStorageBase } from './users';

function resolveLivePromo(offers: any[], basePrice: string): { promoActive: boolean; promoPrice: string | null } {
  if (!Array.isArray(offers) || offers.length === 0) return { promoActive: false, promoPrice: null };
  const now = new Date();
  const activeOffer = offers.find(o => {
    if (!o.isActive) return false;
    if (o.startDate && new Date(o.startDate) > now) return false;
    if (o.endDate && new Date(o.endDate) < now) return false;
    return true;
  });
  if (!activeOffer) return { promoActive: false, promoPrice: null };
  const base = parseFloat(basePrice || '0');
  let promoPrice: string | null = null;
  if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice != null) {
    promoPrice = String(activeOffer.fixedPrice);
  } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage != null) {
    promoPrice = String(Math.round(base * (1 - activeOffer.discountPercentage / 100) * 100) / 100);
  } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice != null) {
    promoPrice = String(activeOffer.fixedPrice);
  }
  return { promoActive: true, promoPrice };
}

export class ProductStorage extends UserStorageBase {
  async getProducts(wholesalerId?: string, options?: { unpaginated?: boolean; includeCostPrice?: boolean }): Promise<Product[]> {
    const startTime = Date.now();
    
    if (wholesalerId) {
      // Default: 200 rows per wholesaler. Pass { unpaginated: true } only for
      // internal analytics / bulk-export paths that genuinely need the full list.
      const rowLimit = options?.unpaginated ? undefined : 200;

      // Optimized query for specific wholesaler with strategic field selection
      const result = await db.execute(
        rowLimit !== undefined
          ? sql`
            SELECT 
              id, name, description, price, stock, moq, 
              wholesaler_id, image_url, images, status, category,
              promo_active, promo_price, low_stock_threshold,
              price_visible,
              pack_quantity, unit_of_measure, size_per_unit, currency,
              selling_format, units_per_pallet, pallet_price, pallet_moq, pallet_stock,
              base_unit_stock, quantity_in_pack, edit_count, delivery_excluded,
              unit, unit_format, pallet_weight, unit_weight, total_package_weight,
              promotional_offers, expiry_date, cost_price,
              created_at, updated_at
            FROM products 
            WHERE wholesaler_id = ${wholesalerId} 
              AND status IN ('active', 'inactive', 'locked')
            ORDER BY 
              status = 'active' DESC,
              promo_active DESC,
              stock > 0 DESC,
              created_at DESC
            LIMIT ${rowLimit}
          `
          : sql`
            SELECT 
              id, name, description, price, stock, moq, 
              wholesaler_id, image_url, images, status, category,
              promo_active, promo_price, low_stock_threshold,
              price_visible,
              pack_quantity, unit_of_measure, size_per_unit, currency,
              selling_format, units_per_pallet, pallet_price, pallet_moq, pallet_stock,
              base_unit_stock, quantity_in_pack, edit_count, delivery_excluded,
              unit, unit_format, pallet_weight, unit_weight, total_package_weight,
              promotional_offers, expiry_date, cost_price,
              created_at, updated_at
            FROM products 
            WHERE wholesaler_id = ${wholesalerId} 
              AND status IN ('active', 'inactive', 'locked')
            ORDER BY 
              status = 'active' DESC,
              promo_active DESC,
              stock > 0 DESC,
              created_at DESC
          `
      );
      
      const queryTime = Date.now() - startTime;
      console.log(`⚡ PERFORMANCE: Wholesaler products query: ${result.rows.length} rows in ${queryTime}ms`);
      
      const mapped = result.rows.map(row => {
        let parsedOffers: any[] = [];
        try {
          if (!row.promotional_offers) parsedOffers = [];
          else if (Array.isArray(row.promotional_offers)) parsedOffers = row.promotional_offers;
          else if (typeof row.promotional_offers === 'string') {
            const trimmed = row.promotional_offers.trim();
            if (trimmed && trimmed !== '[]' && trimmed !== 'null') parsedOffers = JSON.parse(trimmed);
          }
        } catch { parsedOffers = []; }
        const livePromo = resolveLivePromo(parsedOffers, String(row.price));
        return ({
        id: Number(row.id),
        name: String(row.name),
        wholesalerId: String(row.wholesaler_id),
        description: row.description ? String(row.description) : null,
        price: String(row.price),
        promoPrice: livePromo.promoPrice,
        promoActive: livePromo.promoActive,
        promotionalOffers: parsedOffers,
        currency: String(row.currency || 'GBP'),
        moq: Number(row.moq || 1),
        stock: Number(row.stock || 0),
        imageUrl: row.image_url ? String(row.image_url) : null,
        images: Array.isArray(row.images) ? row.images : [],
        category: row.category ? String(row.category) : null,
        status: String(row.status),
        priceVisible: Boolean(row.price_visible !== false),
        editCount: Number(row.edit_count || 0),
        sellingFormat: String(row.selling_format || 'units'),
        palletPrice: row.pallet_price ? String(row.pallet_price) : null,
        palletMoq: row.pallet_moq ? Number(row.pallet_moq) : null,
        palletStock: row.pallet_stock ? Number(row.pallet_stock) : null,
        unitsPerPallet: row.units_per_pallet ? Number(row.units_per_pallet) : null,
        palletWeight: row.pallet_weight ? String(row.pallet_weight) : null,
        unitWeight: row.unit_weight ? String(row.unit_weight) : null,
        unit_weight: null,
        pallet_weight: null,
        deliveryExcluded: Boolean(row.delivery_excluded),
        lowStockThreshold: Number(row.low_stock_threshold || 50),
        unit: String(row.unit || 'units'),
        unitFormat: row.unit_format ? String(row.unit_format) : null,
        packQuantity: row.pack_quantity ? Number(row.pack_quantity) : null,
        unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : null,
        sizePerUnit: row.size_per_unit ? String(row.size_per_unit) : null,
        baseUnitStock: Number(row.base_unit_stock || 0),
        quantityInPack: Number(row.quantity_in_pack || 1),
        totalPackageWeight: row.total_package_weight != null ? String(row.total_package_weight) : null,
        individualUnitWeight: null,
        packageDimensions: {},
        unitConfiguration: {},
        unitSize: row.size_per_unit ? String(row.size_per_unit) : null,
        unitWeightKg: null,
        temperatureRequirement: 'ambient',
        specialHandling: {},
        shelfLife: null,
        contentCategory: null,
        expiryDate: row.expiry_date ? String(row.expiry_date) : null,
        costPrice: options?.includeCostPrice ? (row.cost_price ? String(row.cost_price) : null) : null,
        createdAt: row.created_at ? new Date(String(row.created_at)) : null,
        updatedAt: row.updated_at ? new Date(String(row.updated_at)) : null
      });
      });

      // ── Enrich with derived batch stats (active non-expired batches only) ──
      const batchSummaries = await this._getBatchSummaries(mapped.map(p => p.id));
      return mapped.map(p => {
        const bs = batchSummaries.get(p.id);
        return {
          ...p,
          totalBatchStock: bs?.totalBatchStock ?? null,
          nearestExpiry: bs?.nearestExpiry ?? null,
          batchCount: bs?.batchCount ?? 0,
        };
      }) as unknown as Product[];
    }
    
    // General fallback path (no wholesalerId). Hard-capped at 100 rows — no caller
    // currently hits this path without an ID, but the cap guards against accidental
    // unbounded queries if a future route omits the wholesalerId argument.
    const result = await db.execute(sql`
      SELECT 
        id, name, description, price, stock, moq, 
        wholesaler_id, image_url, images, status, category,
        promo_active, promo_price, low_stock_threshold,
        price_visible,
        pack_quantity, unit_of_measure, size_per_unit, currency,
        selling_format, units_per_pallet, pallet_price, pallet_moq, pallet_stock,
        promotional_offers,
        created_at, updated_at
      FROM products 
      WHERE status = 'active'
      ORDER BY 
        promo_active DESC,
        stock > 0 DESC,
        created_at DESC
      LIMIT 100
    `);
    
    const queryTime = Date.now() - startTime;
    console.log(`⚡ PERFORMANCE: All products query: ${result.rows.length} rows in ${queryTime}ms`);
    
    const mapped = result.rows.map(row => {
      let parsedOffers: any[] = [];
      try {
        if (!row.promotional_offers) parsedOffers = [];
        else if (Array.isArray(row.promotional_offers)) parsedOffers = row.promotional_offers;
        else if (typeof row.promotional_offers === 'string') {
          const trimmed = row.promotional_offers.trim();
          if (trimmed && trimmed !== '[]' && trimmed !== 'null') parsedOffers = JSON.parse(trimmed);
        }
      } catch { parsedOffers = []; }
      const livePromo = resolveLivePromo(parsedOffers, String(row.price));
      return ({
      id: Number(row.id),
      name: String(row.name),
      wholesalerId: String(row.wholesaler_id),
      description: row.description ? String(row.description) : null,
      price: String(row.price),
      promoPrice: livePromo.promoPrice,
      promoActive: livePromo.promoActive,
      promotionalOffers: parsedOffers,
      currency: String(row.currency || 'GBP'),
      moq: Number(row.moq || 1),
      stock: Number(row.stock || 0),
      imageUrl: row.image_url ? String(row.image_url) : null,
      images: Array.isArray(row.images) ? row.images : [],
      category: row.category ? String(row.category) : null,
      status: String(row.status),
      priceVisible: Boolean(row.price_visible !== false),
      editCount: 0,
      sellingFormat: String(row.selling_format || 'units'),
      palletPrice: row.pallet_price ? String(row.pallet_price) : null,
      palletMoq: row.pallet_moq ? Number(row.pallet_moq) : null,
      palletStock: row.pallet_stock ? Number(row.pallet_stock) : null,
      unitsPerPallet: row.units_per_pallet ? Number(row.units_per_pallet) : null,
      palletWeight: null,
      unitWeight: null,
      unit_weight: null,
      pallet_weight: null,
      deliveryExcluded: false,
      lowStockThreshold: Number(row.low_stock_threshold || 50),
      unit: 'units',
      unitFormat: null,
      packQuantity: row.pack_quantity ? Number(row.pack_quantity) : null,
      unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : null,
      sizePerUnit: row.size_per_unit ? String(row.size_per_unit) : null,
      totalPackageWeight: null,
      individualUnitWeight: null,
      packageDimensions: {},
      unitConfiguration: {},
      unitSize: row.size_per_unit ? String(row.size_per_unit) : null,
      unitWeightKg: null,
      temperatureRequirement: 'ambient',
      specialHandling: {},
      shelfLife: null,
      contentCategory: null,
      createdAt: row.created_at ? new Date(String(row.created_at)) : null,
      updatedAt: row.updated_at ? new Date(String(row.updated_at)) : null
    });
    });

    // ── Enrich with derived batch stats ──────────────────────────────────────
    const batchSummaries = await this._getBatchSummaries(mapped.map(p => p.id));
    return mapped.map(p => {
      const bs = batchSummaries.get(p.id);
      return {
        ...p,
        totalBatchStock: bs?.totalBatchStock ?? null,
        nearestExpiry: bs?.nearestExpiry ?? null,
        batchCount: bs?.batchCount ?? 0,
      } as unknown as Product;
    });
  }

  async getExpiringProducts(wholesalerId: string): Promise<Product[]> {
    const result = await db.execute(sql`
      SELECT
        id, name, description, price, stock, moq,
        wholesaler_id, image_url, images, status, category,
        promo_active, promo_price, low_stock_threshold,
        price_visible,
        pack_quantity, unit_of_measure, size_per_unit, currency,
        selling_format, units_per_pallet, pallet_price, pallet_moq, pallet_stock,
        base_unit_stock, quantity_in_pack, edit_count, delivery_excluded,
        unit, unit_format, pallet_weight, unit_weight, total_package_weight,
        promotional_offers, expiry_date,
        created_at, updated_at
      FROM products
      WHERE wholesaler_id = ${wholesalerId}
        AND expiry_date IS NOT NULL
        AND status IN ('active', 'inactive', 'locked')
      ORDER BY expiry_date ASC
    `);
    return result.rows.map(row => {
      let parsedOffers: any[] = [];
      try {
        if (!row.promotional_offers) parsedOffers = [];
        else if (Array.isArray(row.promotional_offers)) parsedOffers = row.promotional_offers;
        else if (typeof row.promotional_offers === 'string') {
          const trimmed = row.promotional_offers.trim();
          if (trimmed && trimmed !== '[]' && trimmed !== 'null') parsedOffers = JSON.parse(trimmed);
        }
      } catch { parsedOffers = []; }
      const livePromo = resolveLivePromo(parsedOffers, String(row.price));
      return ({
        id: Number(row.id),
        name: String(row.name),
        wholesalerId: String(row.wholesaler_id),
        description: row.description ? String(row.description) : null,
        price: String(row.price),
        promoPrice: livePromo.promoPrice,
        promoActive: livePromo.promoActive,
        promotionalOffers: parsedOffers,
        currency: String(row.currency || 'GBP'),
        moq: Number(row.moq || 1),
        stock: Number(row.stock || 0),
        imageUrl: row.image_url ? String(row.image_url) : null,
        images: Array.isArray(row.images) ? row.images : [],
        category: row.category ? String(row.category) : null,
        status: String(row.status),
        priceVisible: Boolean(row.price_visible !== false),
        editCount: Number(row.edit_count || 0),
        sellingFormat: String(row.selling_format || 'units'),
        palletPrice: row.pallet_price ? String(row.pallet_price) : null,
        palletMoq: row.pallet_moq ? Number(row.pallet_moq) : null,
        palletStock: row.pallet_stock ? Number(row.pallet_stock) : null,
        unitsPerPallet: row.units_per_pallet ? Number(row.units_per_pallet) : null,
        palletWeight: row.pallet_weight ? String(row.pallet_weight) : null,
        unitWeight: row.unit_weight ? String(row.unit_weight) : null,
        unit_weight: null,
        pallet_weight: null,
        deliveryExcluded: Boolean(row.delivery_excluded),
        lowStockThreshold: Number(row.low_stock_threshold || 50),
        lastStockAlertSentAt: null,
        unit: String(row.unit || 'units'),
        unitFormat: row.unit_format ? String(row.unit_format) : null,
        packQuantity: row.pack_quantity ? Number(row.pack_quantity) : null,
        unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : null,
        sizePerUnit: row.size_per_unit ? String(row.size_per_unit) : null,
        baseUnitStock: Number(row.base_unit_stock || 0),
        quantityInPack: Number(row.quantity_in_pack || 1),
        totalPackageWeight: row.total_package_weight != null ? String(row.total_package_weight) : null,
        individualUnitWeight: null,
        packageDimensions: {},
        unitConfiguration: {},
        unitSize: row.size_per_unit ? String(row.size_per_unit) : null,
        unitWeightKg: null,
        temperatureRequirement: 'ambient',
        specialHandling: {},
        shelfLife: null,
        contentCategory: null,
        expiryDate: row.expiry_date ? String(row.expiry_date) : null,
        createdAt: row.created_at ? new Date(String(row.created_at)) : null,
        updatedAt: row.updated_at ? new Date(String(row.updated_at)) : null,
      }) as Product;
    });
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) return undefined;
    // Enrich with derived batch stats (active non-expired batches only)
    const batchSummaries = await this._getBatchSummaries([id]);
    const bs = batchSummaries.get(id);
    return {
      ...product,
      totalBatchStock: bs?.totalBatchStock ?? null,
      nearestExpiry: bs?.nearestExpiry ?? null,
      batchCount: bs?.batchCount ?? 0,
    } as Product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values([product as typeof products.$inferInsert]).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() } as Partial<typeof products.$inferInsert>)
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }


  async deleteProduct(id: number): Promise<void> {
    // Clear order_items references (nulled so historical orders are preserved)
    await db.update(orderItems).set({ productId: null }).where(eq(orderItems.productId, id));
    // Delete rows that exist purely for this product
    await db.delete(stockMovements).where(eq(stockMovements.productId, id));
    await db.delete(templateProducts).where(eq(templateProducts.productId, id));
    await db.delete(productPerformanceSummary).where(eq(productPerformanceSummary.productId, id));
    await db.delete(stockUpdateNotifications).where(eq(stockUpdateNotifications.productId, id));
    // Clear nullable FK references in analytics tables
    await db.execute(sql`UPDATE users SET most_ordered_product_id = NULL WHERE most_ordered_product_id = ${id}`);
    // Finally delete the product
    await db.delete(products).where(eq(products.id, id));
  }

  async getLowStockProducts(wholesalerId: string, threshold: number = 10): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.wholesalerId, wholesalerId),
          sql`${products.stock} <= ${threshold}`,
          eq(products.status, 'active')
        )
      )
      .orderBy(products.stock);
  }

  // ── Batch-level inventory methods ────────────────────────────────────────

  /**
   * Return batches for a product.
   *
   * @param activeOnly  When true (FEFO path): return only active, non-expired batches
   *                    sorted by earliest expiry first (nulls last).
   *                    When false (history/admin view): return ALL batches
   *                    ordered active → depleted → expired, then by expiry ASC.
   */
  async getProductBatches(productId: number, activeOnly = true): Promise<ProductBatch[]> {
    const today = new Date().toISOString().split('T')[0];

    if (activeOnly) {
      return await db
        .select()
        .from(productBatches)
        .where(
          and(
            eq(productBatches.productId, productId),
            eq(productBatches.status, 'active'),
            or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
          )
        )
        .orderBy(
          sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`,
          asc(productBatches.expiryDate),
          asc(productBatches.createdAt)
        );
    }

    return await db
      .select()
      .from(productBatches)
      .where(eq(productBatches.productId, productId))
      .orderBy(
        // Active first, then depleted, then expired
        sql`CASE status WHEN 'active' THEN 0 WHEN 'depleted' THEN 1 ELSE 2 END`,
        // Within status group: earliest expiry first (FEFO), no-expiry last
        sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`,
        asc(productBatches.expiryDate),
        asc(productBatches.createdAt)
      );
  }

  /**
   * Fetch batch summary (totalBatchStock, nearestExpiry, batchCount) for a set
   * of product IDs in a single query.  Only counts active, non-expired batches.
   */
  private async _getBatchSummaries(
    productIds: number[]
  ): Promise<Map<number, { totalBatchStock: number; nearestExpiry: string | null; batchCount: number }>> {
    if (productIds.length === 0) return new Map();
    const today = new Date().toISOString().split('T')[0];
    const rows = await db
      .select({
        productId: productBatches.productId,
        totalBatchStock: sum(productBatches.quantity),
        nearestExpiry: sql<string | null>`MIN(${productBatches.expiryDate})`,
        batchCount: count(productBatches.id),
      })
      .from(productBatches)
      .where(
        and(
          inArray(productBatches.productId, productIds),
          eq(productBatches.status, 'active'),
          or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
        )
      )
      .groupBy(productBatches.productId);

    const map = new Map<number, { totalBatchStock: number; nearestExpiry: string | null; batchCount: number }>();
    for (const row of rows) {
      map.set(row.productId, {
        totalBatchStock: Number(row.totalBatchStock ?? 0),
        nearestExpiry: row.nearestExpiry ? String(row.nearestExpiry) : null,
        batchCount: Number(row.batchCount ?? 0),
      });
    }
    return map;
  }

  /** Create a new batch (stock-in event). Updates product.stock to reflect new total. */
  async createProductBatch(
    batch: InsertProductBatch,
    wholesalerId?: string,
    opts?: { orderId?: number | null; businessProfileId?: number | null; movementType?: string; reason?: string }
  ): Promise<ProductBatch> {
    // Capture stock before so we can compute the before→after delta for the movement log
    const [productBefore] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, batch.productId));
    const stockBefore = Number(productBefore?.stock ?? 0);

    const batchWithOriginal = {
      ...batch,
      originalQuantity: batch.originalQuantity ?? batch.quantity,
    };
    const [newBatch] = await db.insert(productBatches).values(batchWithOriginal).returning();

    // Keep product.stock in sync — movement recorded separately below, so skip auto-movement here
    await this._syncProductStockFromBatches(batch.productId, { skipMovement: true });

    // Log a stock movement so the history panel shows the restock event
    if (wholesalerId) {
      const [productAfter] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, batch.productId));
      const stockAfter = Number(productAfter?.stock ?? 0);
      const defaultReason = newBatch.batchNumber
        ? `New batch stock-in (ref: ${newBatch.batchNumber})`
        : 'New batch stock-in';
      await db.insert(stockMovements).values({
        productId: batch.productId,
        wholesalerId,
        movementType: opts?.movementType ?? 'manual_increase',
        quantity: Number(batch.quantity),
        unitType: 'units',
        stockBefore,
        stockAfter,
        reason: opts?.reason ?? defaultReason,
        orderId: opts?.orderId ?? null,
        businessProfileId: opts?.businessProfileId ?? null,
        batchId: newBatch.id,
      });
    }

    return newBatch;
  }

  /**
   * Update batch fields (notes, expiryDate, status, etc.).
   * For quantity changes, prefer `adjustBatchQuantity` which also logs a stock movement.
   * Guards applied here: quantity must be >= 0; when quantity = 0 the status is forced
   * to 'depleted'; when a depleted batch is given quantity > 0 status reverts to 'active'.
   */
  async updateProductBatch(
    batchId: number,
    updates: Partial<InsertProductBatch>,
    wholesalerId?: string,
  ): Promise<ProductBatch> {
    // Capture old quantity for movement logging
    const [before] = await db.select().from(productBatches).where(eq(productBatches.id, batchId));
    if (!before) throw new Error(`Batch ${batchId} not found`);

    const safeUpdates = { ...updates };

    // Quantity invariants
    if (safeUpdates.quantity !== undefined) {
      safeUpdates.quantity = Math.max(0, Number(safeUpdates.quantity));
      // Auto-normalise status from quantity
      if (safeUpdates.quantity === 0 && safeUpdates.status !== 'expired') {
        safeUpdates.status = 'depleted';
      } else if (safeUpdates.quantity > 0 && safeUpdates.status === 'depleted') {
        safeUpdates.status = 'active';
      }
    }

    const [updated] = await db
      .update(productBatches)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(eq(productBatches.id, batchId))
      .returning();

    if (!updated) throw new Error(`Batch ${batchId} not found`);

    // Log a stock movement when quantity was directly changed (not via adjustBatchQuantity)
    if (safeUpdates.quantity !== undefined && wholesalerId) {
      const actualDelta = updated.quantity - before.quantity;
      if (actualDelta !== 0) {
        // Read product-level totals before and after sync so movement history
        // shows a coherent running balance across all batches.
        const [prodBefore] = await db
          .select({ stock: products.stock })
          .from(products)
          .where(eq(products.id, before.productId));
        const productStockBefore = Number(prodBefore?.stock ?? 0);

        // Caller (this block) records the movement — sync must not double-record
        await this._syncProductStockFromBatches(updated.productId, { skipMovement: true });

        const [prodAfter] = await db
          .select({ stock: products.stock })
          .from(products)
          .where(eq(products.id, before.productId));
        const productStockAfter = Number(prodAfter?.stock ?? 0);

        await db.insert(stockMovements).values({
          productId: before.productId,
          wholesalerId,
          movementType: actualDelta > 0 ? 'manual_increase' : 'manual_decrease',
          quantity: actualDelta,
          unitType: 'units',
          stockBefore: productStockBefore,
          stockAfter: productStockAfter,
          reason: `Batch quantity updated (batch #${before.batchNumber || batchId})`,
          batchId,
        });
        return updated;
      }
    }

    // No quantity change (e.g. status/expiry/notes edit) — sync and record a movement
    // if products.stock actually shifts (e.g. batch marked expired silently drops stock).
    await this._syncProductStockFromBatches(updated.productId, {
      wholesalerId,
      reason: `Batch updated (batch #${before.batchNumber || batchId})`,
      batchId,
    });
    return updated;
  }

  /**
   * Apply a quantity delta to a batch (positive = increase, negative = decrease).
   * Marks batch as 'depleted' when quantity reaches 0.
   * Logs a stock_movement record. Syncs product.stock.
   */
  async adjustBatchQuantity(
    batchId: number,
    delta: number,
    reason: string,
    wholesalerId: string,
    orderId?: number,
    businessProfileId?: number | null
  ): Promise<void> {
    const [batch] = await db.select().from(productBatches).where(eq(productBatches.id, batchId));
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    const before = batch.quantity;
    const after = Math.max(0, before + delta);
    // actualDelta is the real change applied (may be smaller than requested when clamped)
    const actualDelta = after - before;
    const newStatus = after === 0 ? 'depleted' : batch.status === 'depleted' ? 'active' : batch.status;

    await db
      .update(productBatches)
      .set({ quantity: after, status: newStatus, updatedAt: new Date() })
      .where(eq(productBatches.id, batchId));

    // Log stock movement only when the quantity actually changed (skip no-ops)
    if (actualDelta !== 0) {
      // Use product-level totals (not batch-level) so movement history shows a
      // coherent running balance across all batches.
      const [prodBefore] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, batch.productId));
      const productStockBefore = Number(prodBefore?.stock ?? 0);

      // Caller records the movement — sync must not double-record
      await this._syncProductStockFromBatches(batch.productId, { skipMovement: true });

      const [prodAfter] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, batch.productId));
      const productStockAfter = Number(prodAfter?.stock ?? 0);

      await db.insert(stockMovements).values({
        productId: batch.productId,
        wholesalerId,
        movementType: actualDelta > 0 ? 'manual_increase' : 'manual_decrease',
        quantity: actualDelta,
        unitType: 'units',
        stockBefore: productStockBefore,
        stockAfter: productStockAfter,
        reason,
        orderId: orderId ?? null,
        businessProfileId: businessProfileId ?? null,
        batchId,
      });
      return;
    }

    // Delta was zero — no movement needed, just keep stock in sync
    await this._syncProductStockFromBatches(batch.productId, { skipMovement: true });
  }

  /** Sum of active non-expired batch quantities for a product. */
  async getProductTotalStock(productId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const result = await db
      .select({ total: sum(productBatches.quantity) })
      .from(productBatches)
      .where(and(
        eq(productBatches.productId, productId),
        eq(productBatches.status, 'active'),
        or(
          isNull(productBatches.expiryDate),
          sql`${productBatches.expiryDate} >= ${today}`
        )
      ));
    return Number(result[0]?.total ?? 0);
  }

  /**
   * Mark all batches whose expiry_date has passed as 'expired'.
   * Returns the count of newly-expired batches.
   */
  async expireOldBatches(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const expired = await db
      .update(productBatches)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(
        eq(productBatches.status, 'active'),
        sql`${productBatches.expiryDate} < ${today}`
      ))
      .returning({ productId: productBatches.productId });

    // Sync product.stock for every affected product, recording a movement for each
    const affectedProductIds = Array.from(new Set(expired.map(r => r.productId)));
    for (const productId of affectedProductIds) {
      // Look up wholesaler so the movement appears in their history
      const [prod] = await db
        .select({ wholesalerId: products.wholesalerId, name: products.name })
        .from(products)
        .where(eq(products.id, productId));
      await this._syncProductStockFromBatches(productId, {
        wholesalerId: prod?.wholesalerId ?? undefined,
        reason: 'Batch expired — removed from available stock',
      });
    }
    return expired.length;
  }

  /**
   * Public utility: recompute products.stock from the SUM of active non-expired
   * batch quantities and persist it.  Use this wherever a batch is mutated
   * outside the normal storage methods (e.g. admin scripts, one-off fixes).
   * No stock movement is recorded — this is a silent sync.
   */
  async recalcProductStock(productId: number): Promise<void> {
    await this._syncProductStockFromBatches(productId, { skipMovement: true });
  }

  /**
   * Internal helper: set products.stock AND products.palletStock from the SUM
   * of active non-expired batch quantities.
   *
   * ctx options:
   *   skipMovement — caller already records its own movement; suppress auto-recording.
   *   wholesalerId — when provided and stock actually changes, a movement is recorded.
   *   reason       — movement reason text (defaults to generic message).
   *   batchId      — optional batch reference for the movement.
   */
  private async _syncProductStockFromBatches(
    productId: number,
    ctx?: { skipMovement?: boolean; wholesalerId?: string; reason?: string; batchId?: number }
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const [{ total }] = await db
      .select({ total: sum(productBatches.quantity) })
      .from(productBatches)
      .where(and(
        eq(productBatches.productId, productId),
        eq(productBatches.status, 'active'),
        or(
          isNull(productBatches.expiryDate),
          sql`${productBatches.expiryDate} >= ${today}`
        )
      ));

    const newStock = Number(total ?? 0);

    // Read current stock before update so we can detect a silent change
    const [prod] = await db
      .select({ stock: products.stock, unitsPerPallet: products.unitsPerPallet, quantityInPack: products.quantityInPack })
      .from(products)
      .where(eq(products.id, productId));
    const currentStock = Number(prod?.stock ?? 0);

    const unitsPerPallet = prod?.unitsPerPallet ?? 1;
    const quantityInPack = prod?.quantityInPack ?? 1;
    const newPalletStock = (quantityInPack > 0 && unitsPerPallet > 0)
      ? Math.floor(Math.floor(newStock / quantityInPack) / unitsPerPallet)
      : 0;

    await db.update(products)
      .set({ stock: newStock, palletStock: newPalletStock })
      .where(eq(products.id, productId));

    // Record a movement whenever stock visibly changed AND the caller hasn't already
    // recorded its own movement AND we have a wholesalerId to attribute it to.
    if (!ctx?.skipMovement && ctx?.wholesalerId && newStock !== currentStock) {
      await db.insert(stockMovements).values({
        productId,
        wholesalerId: ctx.wholesalerId,
        movementType: newStock > currentStock ? 'manual_increase' : 'manual_decrease',
        quantity: newStock - currentStock,
        unitType: 'units',
        stockBefore: currentStock,
        stockAfter: newStock,
        reason: ctx.reason ?? 'Stock recalculated from batch quantities',
        batchId: ctx.batchId ?? null,
      });
    }
  }

  // Order operations - Optimized with joins to reduce database calls
}
