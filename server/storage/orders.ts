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
  businessProfiles,
  collectionAddresses,
  type BusinessProfile,
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
import { eq, desc, asc, and, sql, sum, count, or, ilike, isNull, inArray, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../passwordUtils";
import { InventoryCalculator } from "../../shared/inventory-calculator.js";

import { ProductStorage } from './products';

export class OrderStorage extends ProductStorage {
  async getOrders(wholesalerId?: string, retailerId?: string, searchTerm?: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]> {
    console.log(`📊 Orders query - wholesalerId: ${wholesalerId}, retailerId: ${retailerId}, searchTerm: ${searchTerm}`);
    const startTime = Date.now();
    
    // Get orders first with basic filtering
    let orderQuery = db
      .select()
      .from(orders);

    // Apply basic filters - CRITICAL FIX: Include orders where user is EITHER wholesaler OR retailer
    const conditions = [];
    if (wholesalerId) {
      // Show orders where this user is either the wholesaler OR the retailer (covers both order systems)
      conditions.push(
        or(
          eq(orders.wholesalerId, wholesalerId),
          eq(orders.retailerId, wholesalerId)
        )
      );
    }
    if (retailerId) {
      conditions.push(eq(orders.retailerId, retailerId));
    }
    
    // Apply search filter on order fields
    if (searchTerm && searchTerm.trim()) {
      const searchValue = `%${searchTerm.trim()}%`;
      conditions.push(
        or(
          ilike(orders.orderNumber, searchValue),
          ilike(orders.customerName, searchValue),
          ilike(orders.customerEmail, searchValue),
          ilike(orders.customerPhone, searchValue),
          ilike(orders.status, searchValue)
        )
      );
    }
    
    const orderResults = await (conditions.length > 0
      ? db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt))
      : db.select().from(orders).orderBy(desc(orders.createdAt)));

    console.log(`📊 Orders base query took ${Date.now() - startTime}ms, found ${orderResults.length} orders`);
    
    if (orderResults.length === 0) {
      return [];
    }

    // Get unique user IDs for batch fetching
    const retailerIds = Array.from(new Set(orderResults.map(o => o.retailerId)));
    const wholesalerIds = Array.from(new Set(orderResults.map(o => o.wholesalerId)));
    
    // Batch fetch users
    const allUserIds = Array.from(new Set([...retailerIds, ...wholesalerIds]));
    const allUsers = await db
      .select()
      .from(users)
      .where(sql`${users.id} IN (${sql.join(allUserIds.map(id => sql`${id}`), sql`, `)})`);
    
    // Create user lookup map
    const userMap = allUsers.reduce((acc: any, user: any) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, any>);
    
    // If searching by wholesaler/retailer names, filter results after fetching user data
    let filteredOrderResults = orderResults;
    if (searchTerm && searchTerm.trim()) {
      const searchValue = searchTerm.trim().toLowerCase();
      filteredOrderResults = orderResults.filter(order => {
        const retailer = userMap[order.retailerId];
        const wholesaler = userMap[order.wholesalerId];
        
        // Check order fields (already filtered by database)
        if (
          order.orderNumber?.toLowerCase().includes(searchValue) ||
          order.customerName?.toLowerCase().includes(searchValue) ||
          order.customerEmail?.toLowerCase().includes(searchValue) ||
          order.customerPhone?.toLowerCase().includes(searchValue) ||
          order.status?.toLowerCase().includes(searchValue)
        ) {
          return true;
        }
        
        // Check retailer fields
        if (retailer && (
          retailer.businessName?.toLowerCase().includes(searchValue) ||
          retailer.firstName?.toLowerCase().includes(searchValue) ||
          retailer.lastName?.toLowerCase().includes(searchValue) ||
          `${retailer.firstName || ''} ${retailer.lastName || ''}`.trim().toLowerCase().includes(searchValue)
        )) {
          return true;
        }
        
        // Check wholesaler fields
        if (wholesaler && (
          wholesaler.businessName?.toLowerCase().includes(searchValue) ||
          wholesaler.firstName?.toLowerCase().includes(searchValue) ||
          wholesaler.lastName?.toLowerCase().includes(searchValue) ||
          `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim().toLowerCase().includes(searchValue)
        )) {
          return true;
        }
        
        return false;
      });
    }
    
    // Get all order items in a single query using filtered results
    const orderIds = filteredOrderResults.map(o => o.id);
    const itemsResults = await db
      .select({
        orderItemId: orderItems.id,
        orderItemOrderId: orderItems.orderId,
        orderItemProductId: orderItems.productId,
        orderItemQuantity: orderItems.quantity,
        orderItemUnitPrice: orderItems.unitPrice,
        orderItemTotal: orderItems.total,
        orderItemAppliedOfferLabel: orderItems.appliedOfferLabel,
        orderItemFreeItems: orderItems.freeItems,
        productId: products.id,
        productName: products.name,
        productImageUrl: products.imageUrl,
        productImages: products.images,
        productMoq: products.moq,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(sql`${orderItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);
    
    console.log(`📊 Order items query took ${Date.now() - startTime}ms total, found ${itemsResults.length} items`);
    
    // Group items by order ID
    const itemsByOrderId = itemsResults.reduce((acc, item) => {
      const orderId = item.orderItemOrderId;
      if (!acc[orderId]) acc[orderId] = [];
      acc[orderId].push({
        id: item.orderItemId,
        orderId: item.orderItemOrderId,
        productId: item.orderItemProductId,
        quantity: item.orderItemQuantity,
        unitPrice: item.orderItemUnitPrice,
        total: item.orderItemTotal,
        appliedOfferLabel: item.orderItemAppliedOfferLabel || null,
        freeItems: item.orderItemFreeItems || 0,
        product: {
          id: item.productId,
          name: item.productName,
          imageUrl: item.productImageUrl,
          images: item.productImages,
          moq: item.productMoq,
        }
      });
      return acc;
    }, {} as Record<number, any[]>);
    
    // Batch fetch business profiles for orders that have a businessProfileId
    const profileIds = Array.from(new Set(filteredOrderResults.map(o => o.businessProfileId).filter((id): id is number => id != null)));
    let profileMap: Record<number, string> = {};
    if (profileIds.length > 0) {
      const profiles = await db
        .select({ id: businessProfiles.id, name: businessProfiles.name })
        .from(businessProfiles)
        .where(sql`${businessProfiles.id} IN (${sql.join(profileIds.map(id => sql`${id}`), sql`, `)})`);
      profileMap = profiles.reduce((acc, p) => { acc[p.id] = p.name; return acc; }, {} as Record<number, string>);
    }

    // Transform results using filtered results
    const ordersWithItems = filteredOrderResults.map(order => {
      const retailer = userMap[order.retailerId];
      const wholesaler = userMap[order.wholesalerId];
      
      return {
        ...order,
        retailer: retailer ? {
          id: retailer.id,
          email: retailer.email,
          firstName: retailer.firstName,
          lastName: retailer.lastName,
          phoneNumber: retailer.phoneNumber,
          businessName: retailer.businessName,
        } : null,
        wholesaler: wholesaler ? {
          id: wholesaler.id,
          email: wholesaler.email,
          firstName: wholesaler.firstName,
          lastName: wholesaler.lastName,
          businessName: wholesaler.businessName,
          preferredCurrency: wholesaler.preferredCurrency,
        } : null,
        businessProfileName: order.businessProfileId ? (profileMap[order.businessProfileId] ?? null) : null,
        items: itemsByOrderId[order.id] || []
      };
    });
    
    console.log(`✅ Orders query complete in ${Date.now() - startTime}ms`);
    return ordersWithItems as unknown as (Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[];
  }

  async getOrder(id: number): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User; businessProfileName?: string | null }) | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    const items = await db
      .select()
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id));
    
    // Get retailer info
    const [retailer] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.retailerId));
    
    // Get wholesaler info
    const [wholesaler] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.wholesalerId));

    // Get business profile name if set
    let businessProfileName: string | null = null;
    if (order.businessProfileId) {
      const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.id, order.businessProfileId));
      businessProfileName = profile?.name ?? null;
    }

    // Enrich with resolved collection address object
    let collectionAddress: (typeof collectionAddresses.$inferSelect) | null = null;
    if (order.collectionAddressId) {
      const [ca] = await db.select().from(collectionAddresses).where(eq(collectionAddresses.id, order.collectionAddressId));
      collectionAddress = ca ?? null;
    }
    
    return {
      ...order,
      retailer: retailer!,
      wholesaler: wholesaler!,
      businessProfileName,
      collectionAddress,
      items: items.map(item => ({
        ...item.order_items,
        product: item.products!
      }))
    } as Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User; businessProfileName?: string | null; collectionAddress: typeof collectionAddress };
  }

  async getOrdersForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<Order[]> {
    const orderList = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.createdAt} >= ${fromDate}`,
        sql`${orders.createdAt} <= ${toDate}`,
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`
      ))
      .orderBy(desc(orders.createdAt));
    
    return orderList;
  }

  // Generate unique order number for wholesaler using an atomic counter on the users row.
  // The counter never resets when orderNumberPrefix changes — sequence integrity is always preserved.
  async generateOrderNumber(wholesalerId: string): Promise<string> {
    const result = await db.execute(sql`
      UPDATE users
      SET order_number_counter = order_number_counter + 1
      WHERE id = ${wholesalerId}
      RETURNING order_number_counter, order_number_prefix, business_name
    `);
    const row = result.rows[0];
    if (!row) throw new Error(`Wholesaler ${wholesalerId} not found when generating order number`);
    const counter = parseInt(row.order_number_counter as string);
    // Always use the stored prefix; fall back to 'ORD' — never derive from business name.
    const storedPrefix = (row.order_number_prefix as string) || '';
    const prefix = storedPrefix.trim() ? storedPrefix.trim().toUpperCase() : 'ORD';
    const orderNumber = `${prefix}-${counter.toString().padStart(3, '0')}`;
    console.log(`🔢 Generated order number: ${orderNumber} (counter=${counter})`);
    return orderNumber;
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    // CRITICAL FIX: Use transaction for atomic order number generation
    return await db.transaction(async (tx) => {
      let orderNumber = order.orderNumber;
      
      // Generate order number within this transaction if not provided
      if (!orderNumber) {
        const genResult = await tx.execute(sql`
          UPDATE users
          SET order_number_counter = order_number_counter + 1
          WHERE id = ${order.wholesalerId}
          RETURNING order_number_counter, order_number_prefix, business_name
        `);
        const genRow = genResult.rows[0];
        if (!genRow) throw new Error(`Wholesaler ${order.wholesalerId} not found when generating order number`);
        const counter = parseInt(genRow.order_number_counter as string);
        // Always use the stored prefix; fall back to 'ORD' — never derive from business name.
        const storedPrefix = (genRow.order_number_prefix as string) || '';
        const prefix = storedPrefix.trim() ? storedPrefix.trim().toUpperCase() : 'ORD';
        orderNumber = `${prefix}-${counter.toString().padStart(3, '0')}`;
        console.log(`🔢 Generated order number: ${orderNumber} (counter=${counter}) inside createOrder transaction`);
      }
      
      const cleanOrderData = {
        orderNumber,
        wholesalerId: order.wholesalerId,
        retailerId: order.retailerId,
        subtotal: order.subtotal,
        platformFee: order.platformFee,
        customerTransactionFee: order.customerTransactionFee,
        vatAmount: order.vatAmount,
        vatRateApplied: order.vatRateApplied,
        total: order.total,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        status: order.status || 'confirmed'
      };
      
      let newOrder;
      try {
        [newOrder] = await tx.insert(orders).values(cleanOrderData).returning();
      } catch (error) {
        console.error(`❌ Order insertion failed:`, error);
        throw error;
      }
      
      // Pre-fetch customer name once for all items
      const customer = await tx.select().from(users).where(eq(users.id, order.retailerId)).limit(1);
      const customerName = customer[0]
        ? (customer[0].businessName || `${customer[0].firstName || ''} ${customer[0].lastName || ''}`.trim() || 'Unknown Customer')
        : 'Unknown Customer';

      const today = new Date().toISOString().split('T')[0];

      // Insert order items and reduce stock within transaction
      for (const item of items) {
        // ── Fetch current product (needed for both FEFO and legacy paths) ─────
        const [currentProduct] = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId!));

        const orderedQuantity = item.quantity;
        const sellingType = item.sellingType || 'units';

        // ── FEFO batch allocation ─────────────────────────────────────────────
        let primaryBatchId: number | null = null;

        if (item.productId && currentProduct) {
          // Fetch active non-expired batches in FEFO order (earliest expiry first, no-expiry last)
          const activeBatches = await tx
            .select()
            .from(productBatches)
            .where(
              and(
                eq(productBatches.productId, item.productId!),
                eq(productBatches.status, 'active'),
                or(
                  isNull(productBatches.expiryDate),
                  sql`${productBatches.expiryDate} >= ${today}`
                )
              )
            )
            .orderBy(
              sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`,
              asc(productBatches.expiryDate),
              asc(productBatches.createdAt)
            );

          // ── Batch-only stock allocation: no legacy fallback ──────────────
          // All products MUST have at least one active non-expired batch.
          // If none exist (all depleted/expired or product never batch-seeded),
          // the transaction is aborted. The startup migration seeds an "Initial
          // Stock" batch for every existing product; new products created via
          // POST /api/products auto-receive an initial batch when stock > 0.
          if (activeBatches.length === 0) {
            throw new Error(
              `Product ${item.productId} (${currentProduct.name}) has no active batch stock. ` +
              `Please add a new batch before ordering.`
            );
          }

          const unitsPerPallet: number = currentProduct.unitsPerPallet ?? 1;
          // quantityInPack = base units per pack; unitsPerPallet = packs per pallet
          const quantityInPack: number = currentProduct.quantityInPack ?? 1;
          // Convert ordered quantity to base units
          const baseUnitsNeeded = sellingType === 'pallets'
            ? orderedQuantity * unitsPerPallet * quantityInPack
            : orderedQuantity;

          // Pre-check: abort if total batch stock is insufficient
          const totalAvailable = activeBatches.reduce((acc: number, b: any) => acc + b.quantity, 0);
          if (totalAvailable < baseUnitsNeeded) {
            throw new Error(
              `Insufficient batch stock for product ${item.productId} (${currentProduct.name}): ` +
              `need ${baseUnitsNeeded} units but only ${totalAvailable} available`
            );
          }

          // FEFO deduction: walk batches earliest-expiry first
          let remaining = baseUnitsNeeded;
          for (const batch of activeBatches) {
            if (remaining <= 0) break;
            const deduct = Math.min(remaining, batch.quantity);
            const newQty = batch.quantity - deduct;
            const newStatus = newQty === 0 ? 'depleted' : 'active';

            await tx
              .update(productBatches)
              .set({ quantity: newQty, status: newStatus, updatedAt: new Date() })
              .where(eq(productBatches.id, batch.id));

            // Record a stock_movement for each individual batch touched
            await tx.insert(stockMovements).values({
              productId: item.productId,
              wholesalerId: order.wholesalerId,
              movementType: 'purchase',
              quantity: -deduct,          // actual units removed from this batch
              unitType: 'units',
              stockBefore: batch.quantity,
              stockAfter: newQty,
              reason: `Order sale (batch #${batch.batchNumber || batch.id}) - ${deduct} units`,
              orderId: newOrder.id,
              customerName,
              businessProfileId: order.businessProfileId ?? null,
            });

            if (primaryBatchId === null) primaryBatchId = batch.id;
            remaining -= deduct;
          }

          // Sync product.stock + palletStock from batch sum (source of truth)
          const batchSum = await tx
            .select({ total: sum(productBatches.quantity) })
            .from(productBatches)
            .where(
              and(
                eq(productBatches.productId, item.productId!),
                eq(productBatches.status, 'active'),
                or(
                  isNull(productBatches.expiryDate),
                  sql`${productBatches.expiryDate} >= ${today}`
                )
              )
            );
          const newStock = Number(batchSum[0]?.total ?? 0);
          // Pallet stock = floor(floor(baseUnits / quantityInPack) / unitsPerPallet)
          const newPalletStock = (quantityInPack > 0 && unitsPerPallet > 0)
            ? Math.floor(Math.floor(newStock / quantityInPack) / unitsPerPallet)
            : 0;
          await tx.update(products)
            .set({ stock: newStock, palletStock: newPalletStock })
            .where(eq(products.id, item.productId));

          console.log(`🗂 FEFO allocation: product ${item.productId} used batch ${primaryBatchId}, stock → ${newStock}`);
        }
        // ── End FEFO block ────────────────────────────────────────────────────

        // Insert order item — primaryBatchId is always set when we reach here
        // (we throw above if no active batches exist)
        await tx.insert(orderItems).values({ ...item, orderId: newOrder.id, batchId: primaryBatchId });

        // Read refreshed stock for low-stock console warnings
        if (currentProduct) {
          const [refreshed] = await tx.select({ stock: products.stock, palletStock: products.palletStock })
            .from(products).where(sql`${products.id} = ${item.productId}`);
          const newUnitStock = refreshed?.stock ?? 0;
          const newPalletStock = refreshed?.palletStock ?? 0;

          console.log(`📦 Stock reduced for product ${item.productId}:`);
          if (sellingType === 'pallets') {
            console.log(`📦 Pallet stock: ${currentProduct.palletStock || 0} → ${newPalletStock} pallets`);
          } else {
            console.log(`📦 Unit stock: ${currentProduct.stock || 0} → ${newUnitStock} units`);
          }

          // Low-stock warnings
          if (sellingType === 'pallets') {
            if (newPalletStock <= 5) console.log(`⚠️ LOW PALLET STOCK: Product ${item.productId} (${currentProduct.name}) → ${newPalletStock} pallets`);
            if (newPalletStock === 0) console.log(`🚨 OUT OF PALLET STOCK: Product ${item.productId} (${currentProduct.name})`);
          } else {
            if (newUnitStock <= (currentProduct.lowStockThreshold || 10)) console.log(`⚠️ LOW UNIT STOCK: Product ${item.productId} (${currentProduct.name}) → ${newUnitStock} units`);
            if (newUnitStock === 0) console.log(`🚨 OUT OF UNIT STOCK: Product ${item.productId} (${currentProduct.name})`);
          }
        } else {
          console.log(`⚠️ Product ${item.productId} not found - cannot reduce stock`);
        }
      }
      
      return newOrder;
    });
  }

  async createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const [newOrderItem] = await db.insert(orderItems).values(orderItem).returning();
    return newOrderItem;
  }

  async getOrderItems(orderId: number): Promise<(OrderItem & { product: Product })[]> {
    const items = await db
      .select()
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));
    
    return items.map(item => ({
      ...item.order_items,
      product: item.products!
    }));
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async markOrderReadyForCollection(id: number): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ 
        readyToCollectAt: new Date(),
        status: 'ready_for_collection'
      })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async updateOrder(id: number, updates: Partial<Order>): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set(updates)
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async updateOrderImages(orderId: number, images: Array<{
    id: string;
    url: string;
    filename: string;
    uploadedAt: string;
    description?: string;
  }>): Promise<Order | undefined> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ orderImages: images, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updatedOrder;
  }

  async updateOrderShippingInfo(id: number, shippingInfo: {
    shippingOrderId?: string;
    shippingHash?: string;
    shippingStatus?: string;
    deliveryCarrier?: string;
    deliveryServiceId?: string;
    shippingTotal?: string;
    deliveryTrackingNumber?: string;
  }): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set(shippingInfo)
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async updateOrderDeliveryAddress(orderId: number, deliveryAddressId: number, formattedAddress: string): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ 
        deliveryAddressId: deliveryAddressId,
        deliveryAddress: formattedAddress,
        updatedAt: new Date()
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updatedOrder;
  }

  async getLastOrderForWholesaler(wholesalerId: string): Promise<Order | undefined> {
    // RACE CONDITION FIX: Use direct SQL to get the highest order number atomically
    // This prevents concurrent transactions from getting the same order number
    const result = await db
      .select()
      .from(orders)
      .where(eq(orders.wholesalerId, wholesalerId))
      .orderBy(desc(orders.id)) // Use order ID for consistency
      .limit(1);
    
    if (result.length === 0) {
      console.log(`📊 No orders found for wholesaler ${wholesalerId}`);
      return undefined;
    }
    
    const lastOrder = result[0];
    console.log(`📊 Last order for wholesaler ${wholesalerId}: #${lastOrder.id} (${lastOrder.orderNumber})`);
    return lastOrder;
  }

  async getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined> {
    const result = await db
      .select()
      .from(orders)
      .where(ilike(orders.stripePaymentIntentId, `%${paymentIntentId}%`))
      .limit(1);
    
    return result[0];
  }

  async getStripeOrdersForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.createdAt} >= ${fromDate}`,
        sql`${orders.createdAt} <= ${toDate}`,
        sql`${orders.stripePaymentIntentId} IS NOT NULL`,
        sql`${orders.stripePaymentIntentId} != ''`,
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`
      ))
      .orderBy(desc(orders.createdAt));
  }

  async getOrderByTransferId(transferId: string): Promise<Order | undefined> {
    const result = await db
      .select()
      .from(orders)
      .where(eq(orders.stripeTransferId, transferId))
      .limit(1);
    return result[0];
  }

  async getOrderByNetAmountForWholesaler(wholesalerId: string, netAmountPounds: number, aroundTimestampSeconds: number): Promise<Order | undefined> {
    // Match by exact net amount (subtotal - platformFee) for a given wholesaler.
    // The timestamp window is ±8 days around the Stripe balance transaction created time,
    // which is wide enough to cover payout delays while still being precise.
    const windowStart = new Date((aroundTimestampSeconds - 8 * 86400) * 1000);
    const windowEnd   = new Date((aroundTimestampSeconds + 1 * 86400) * 1000);
    const result = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`(ROUND((${orders.subtotal}::numeric - ${orders.platformFee}::numeric), 2) = ${netAmountPounds.toFixed(2)}::numeric OR ROUND((${orders.total}::numeric - ${orders.platformFee}::numeric), 2) = ${netAmountPounds.toFixed(2)}::numeric)`,
        sql`${orders.paymentStatus} = 'paid'`,
        sql`${orders.createdAt} >= ${windowStart}`,
        sql`${orders.createdAt} <= ${windowEnd}`,
      ))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    return result[0];
  }

  async getOrderByIdempotencyKey(key: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, key))
      .limit(1);
    return order;
  }

  async createOrderWithTransaction(trx: any, orderData: InsertOrder, items: InsertOrderItem[]): Promise<Order & { _wasDuplicate?: boolean }> {
    console.log(`🔄 TRANSACTION ORDER: Creating order with ${items.length} items`);
    console.log(`📦 ITEMS: ${items.map(i => `${i.productId}:${i.quantity}:${i.sellingType}`).join(', ')}`);
    
    // Create order within transaction — ON CONFLICT on idempotency_key handles duplicate
    // requests atomically; scoping to the specific column avoids masking other unique violations.
    const inserted = await trx
      .insert(orders)
      .values({
        ...orderData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoNothing({ target: orders.idempotencyKey })
      .returning();

    if (inserted.length === 0 && orderData.idempotencyKey) {
      // Duplicate detected at the DB level — return the pre-existing order
      const [existing] = await trx
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, orderData.idempotencyKey));
      if (existing) {
        console.warn(`⚠️  Duplicate order request suppressed (idempotency_key ${orderData.idempotencyKey.slice(0, 12)}…) — returning existing order ${existing.id}`);
        // Mark as duplicate so callers can skip side effects (e.g. confirmation email)
        const deduped: Order & { _wasDuplicate: boolean } = { ...existing, _wasDuplicate: true };
        return deduped;
      }
    }

    const newOrder = inserted[0];
    if (!newOrder) {
      throw new Error('Order insert returned no rows and no existing order found for idempotency key');
    }
      
    console.log(`✅ ORDER CREATED: ID ${newOrder.id}`);

    // Create order items with the order ID AND reduce stock
    if (items.length > 0) {
      console.log(`🔄 PROCESSING: ${items.length} items for stock reduction`);
      for (const item of items) {
        console.log(`📦 ITEM: ${item.productId}, qty: ${item.quantity}, type: ${item.sellingType}`);
        
        // NOTE: batchId is populated after FEFO allocation below (order item is inserted there)
        
        // Get current product info before stock reduction
        const [currentProduct] = await trx
          .select()
          .from(products)
          .where(eq(products.id, item.productId!));
        
        if (currentProduct) {
          console.log(`📦 PRODUCT: ${currentProduct.name} (ID: ${item.productId})`);
          console.log(`📊 CURRENT STOCK: units: ${currentProduct.stock}, pallets: ${currentProduct.palletStock}`);

          const sellingType = (item.sellingType || 'units') as 'units' | 'pallets';
          const orderedQuantity = item.quantity;
          const freeItemsQty = item.freeItems ?? 0;
          const totalStockToReduce = orderedQuantity + freeItemsQty;

          if (freeItemsQty > 0) {
            console.log(`🎁 BOGOF: ${orderedQuantity} ordered + ${freeItemsQty} free = ${totalStockToReduce} total stock reduction`);
          }
          console.log(`🛒 ORDER: ${totalStockToReduce} ${sellingType} (includes ${freeItemsQty} free items)`);

          // ── FEFO batch allocation ────────────────────────────────────────────
          const today = new Date().toISOString().split('T')[0];
          const activeBatches = await trx
            .select()
            .from(productBatches)
            .where(
              and(
                eq(productBatches.productId, item.productId!),
                eq(productBatches.status, 'active'),
                or(
                  isNull(productBatches.expiryDate),
                  sql`${productBatches.expiryDate} >= ${today}`
                )
              )
            )
            .orderBy(
              sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`,
              asc(productBatches.expiryDate),
              asc(productBatches.createdAt)
            );

          const unitsPerPallet: number = currentProduct.unitsPerPallet ?? 1;
          // quantityInPack = base units per pack; unitsPerPallet = packs per pallet
          const quantityInPack: number = currentProduct.quantityInPack ?? 1;
          const baseUnitsNeeded = sellingType === 'pallets'
            ? totalStockToReduce * unitsPerPallet * quantityInPack
            : totalStockToReduce;
          const totalAvailable = activeBatches.reduce((acc: number, b: any) => acc + b.quantity, 0);

          // Abort if no active batches exist
          if (activeBatches.length === 0) {
            throw new Error(
              `Product ${item.productId} (${currentProduct.name}) has no active batch stock. ` +
              `Please add a new batch before ordering.`
            );
          }

          // Abort if total batch stock is insufficient
          if (totalAvailable < baseUnitsNeeded) {
            throw new Error(
              `Insufficient batch stock for product ${item.productId} (${currentProduct.name}): ` +
              `need ${baseUnitsNeeded} units but only ${totalAvailable} available`
            );
          }

          // ── Batch-based FEFO deduction ──────────────────────────────────────
          let remaining = baseUnitsNeeded;
          let primaryBatchId: number | null = null;
          for (const batch of activeBatches) {
            if (remaining <= 0) break;
            const deduct = Math.min(remaining, batch.quantity);
            const newQty = batch.quantity - deduct;
            const newStatus = newQty === 0 ? 'depleted' : 'active';

            await trx
              .update(productBatches)
              .set({ quantity: newQty, status: newStatus, updatedAt: new Date() })
              .where(eq(productBatches.id, batch.id));

            await trx.insert(stockMovements).values({
              productId: item.productId,
              wholesalerId: orderData.wholesalerId,
              movementType: 'purchase',
              quantity: -deduct,
              unitType: 'units',
              stockBefore: batch.quantity,
              stockAfter: newQty,
              reason: freeItemsQty > 0
                ? `Order sale (batch #${batch.batchNumber || batch.id}) - ${deduct} units incl. ${freeItemsQty} free (promo)`
                : `Order sale (batch #${batch.batchNumber || batch.id}) - ${deduct} units`,
              orderId: newOrder.id,
              customerName: orderData.customerName ?? null,
              businessProfileId: orderData.businessProfileId ?? null,
            });

            if (primaryBatchId === null) primaryBatchId = batch.id;
            remaining -= deduct;
          }

          // Insert order item with primary batch ID populated
          await trx.insert(orderItems).values({ ...item, orderId: newOrder.id, batchId: primaryBatchId });

          // Sync products.stock + palletStock from batch totals (source of truth)
          const [batchSumRow] = await trx
            .select({ total: sum(productBatches.quantity) })
            .from(productBatches)
            .where(
              and(
                eq(productBatches.productId, item.productId!),
                eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
              )
            );
          const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
          // Pallet stock = floor(floor(baseUnits / quantityInPack) / unitsPerPallet)
          const newPalletStock = (quantityInPack > 0 && unitsPerPallet > 0)
            ? Math.floor(Math.floor(newUnitStock / quantityInPack) / unitsPerPallet)
            : 0;

          await trx
            .update(products)
            .set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() })
            .where(sql`${products.id} = ${item.productId}`);

          console.log(`✅ FEFO STOCK: product ${item.productId} → ${newUnitStock} units / ${newPalletStock} pallets (batch #${primaryBatchId})`);
          // ────────────────────────────────────────────────────────────────────
        } else {
          console.log(`⚠️ Product ${item.productId} not found for stock reduction`);
        }
      }
    }

    return newOrder;
  }

  async getOrdersByCustomerPhone(phoneNumber: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]> {
    // Get orders by phone number
    const orderResults = await db
      .select()
      .from(orders)
      .where(eq(orders.customerPhone, phoneNumber))
      .orderBy(desc(orders.createdAt));

    // Get detailed order information with items, retailer and wholesaler
    const ordersWithDetails = await Promise.all(orderResults.map(async (order) => {
      // Get order items with product details
      const items = await db
        .select()
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, order.id));

      const orderItemsWithProducts = items.map(item => ({
        ...item.order_items,
        product: item.products!
      }));

      // Get retailer and wholesaler information
      const [retailer, wholesaler] = await Promise.all([
        this.getUser(order.retailerId),
        this.getUser(order.wholesalerId)
      ]);

      return {
        ...order,
        items: orderItemsWithProducts,
        retailer: retailer!,
        wholesaler: wholesaler!
      };
    }));

    return ordersWithDetails;
  }

  // Simple customer shipping preference storage (in-memory for now)
  private customerShippingChoices = new Map<string, 'pickup' | 'delivery'>();

}
