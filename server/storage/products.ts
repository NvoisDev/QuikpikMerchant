import {
  users,
  products,
  orders,
  orderItems,
  customerGroups,
  customerGroupMembers,
  negotiations,
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
  type Negotiation,
  type InsertNegotiation,
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
import { eq, desc, and, sql, sum, count, or, ilike, isNull, inArray, gt } from "drizzle-orm";
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
  async getProducts(wholesalerId?: string): Promise<Product[]> {
    console.log('⚡ PERFORMANCE: Ultra-optimized getProducts called for:', wholesalerId || 'all');
    const startTime = Date.now();
    
    if (wholesalerId) {
      // Optimized query for specific wholesaler with strategic field selection
      const result = await db.execute(sql`
        SELECT 
          id, name, description, price, stock, moq, 
          wholesaler_id, image_url, images, status, category,
          promo_active, promo_price, low_stock_threshold,
          price_visible, negotiation_enabled, minimum_bid_price,
          pack_quantity, unit_of_measure, size_per_unit, currency,
          selling_format, units_per_pallet, pallet_price, pallet_moq, pallet_stock,
          base_unit_stock, quantity_in_pack, edit_count, delivery_excluded,
          unit, unit_format, pallet_weight, unit_weight,
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
        LIMIT 200
      `);
      
      const queryTime = Date.now() - startTime;
      console.log(`⚡ PERFORMANCE: Wholesaler products query: ${result.rows.length} rows in ${queryTime}ms`);
      
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
        negotiationEnabled: Boolean(row.negotiation_enabled),
        minimumBidPrice: row.minimum_bid_price ? String(row.minimum_bid_price) : null,
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
        expiryDate: row.expiry_date ? String(row.expiry_date) : null,
        costPrice: row.cost_price ? String(row.cost_price) : null,
        createdAt: row.created_at ? new Date(String(row.created_at)) : null,
        updatedAt: row.updated_at ? new Date(String(row.updated_at)) : null
      });
      });
    }
    
    // General query optimization for all products
    const result = await db.execute(sql`
      SELECT 
        id, name, description, price, stock, moq, 
        wholesaler_id, image_url, images, status, category,
        promo_active, promo_price, low_stock_threshold,
        price_visible, negotiation_enabled, minimum_bid_price,
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
      negotiationEnabled: Boolean(row.negotiation_enabled),
      minimumBidPrice: row.minimum_bid_price ? String(row.minimum_bid_price) : null,
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
  }

  async getExpiringProducts(wholesalerId: string): Promise<Product[]> {
    const result = await db.execute(sql`
      SELECT
        id, name, description, price, stock, moq,
        wholesaler_id, image_url, images, status, category,
        promo_active, promo_price, low_stock_threshold,
        price_visible, negotiation_enabled, minimum_bid_price,
        pack_quantity, unit_of_measure, size_per_unit, currency,
        selling_format, units_per_pallet, pallet_price, pallet_moq, pallet_stock,
        base_unit_stock, quantity_in_pack, edit_count, delivery_excluded,
        unit, unit_format, pallet_weight, unit_weight,
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
        negotiationEnabled: Boolean(row.negotiation_enabled),
        minimumBidPrice: row.minimum_bid_price ? String(row.minimum_bid_price) : null,
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
        expiryDate: row.expiry_date ? String(row.expiry_date) : null,
        createdAt: row.created_at ? new Date(String(row.created_at)) : null,
        updatedAt: row.updated_at ? new Date(String(row.updated_at)) : null,
      });
    });
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values([product]).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }


  async deleteProduct(id: number): Promise<void> {
    // Clear order_items references (nulled so historical orders are preserved)
    await db.update(orderItems).set({ productId: null }).where(eq(orderItems.productId, id));
    // Delete rows that exist purely for this product
    await db.delete(stockMovements).where(eq(stockMovements.productId, id));
    await db.delete(negotiations).where(eq(negotiations.productId, id));
    await db.delete(templateProducts).where(eq(templateProducts.productId, id));
    await db.delete(productPerformanceSummary).where(eq(productPerformanceSummary.productId, id));
    await db.delete(stockUpdateNotifications).where(eq(stockUpdateNotifications.productId, id));
    // Clear nullable FK references in analytics tables
    await db.update(users).set({ mostOrderedProductId: null })
      .where(eq(users.mostOrderedProductId, id));
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

  // Order operations - Optimized with joins to reduce database calls
}
