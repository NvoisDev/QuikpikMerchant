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
  stockAlerts,
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
  teamMembers,
  type TeamMember,
  type InsertTeamMember,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, sum, count, or, ilike } from "drizzle-orm";

export interface IStorage {
  // User operations (required for auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: Partial<UpsertUser>): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserSettings(id: string, settings: Partial<UpsertUser>): Promise<User>;
  updateUserOnboarding(id: string, onboardingData: { onboardingStep?: number; onboardingCompleted?: boolean; onboardingSkipped?: boolean }): Promise<User>;
  
  // Product operations
  getProducts(wholesalerId?: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Order operations
  getOrders(wholesalerId?: string, retailerId?: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]>;
  getOrder(id: number): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User }) | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  
  // Customer group operations
  getCustomerGroups(wholesalerId: string): Promise<CustomerGroup[]>;
  getCustomerGroupsByUser(wholesalerId: string): Promise<CustomerGroup[]>;
  createCustomerGroup(group: InsertCustomerGroup): Promise<CustomerGroup>;
  updateCustomerGroup(id: number, updates: { whatsappGroupId?: string }): Promise<CustomerGroup>;
  deleteCustomerGroup(id: number): Promise<void>;
  getGroupMembers(groupId: number): Promise<User[]>;
  searchGroupMembers(groupId: number, searchTerm: string): Promise<User[]>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  createCustomer(customer: { phoneNumber: string; firstName: string; lastName?: string; role: string; email?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string; country?: string }): Promise<User>;
  addCustomerToGroup(groupId: number, customerId: string): Promise<void>;
  removeCustomerFromGroup(groupId: number, customerId: string): Promise<void>;
  updateCustomerPhone(customerId: string, phoneNumber: string): Promise<void>;
  updateCustomer(customerId: string, updates: { firstName?: string; lastName?: string; email?: string }): Promise<User>;
  
  // Order item operations
  getOrderItems(orderId: number): Promise<(OrderItem & { product: Product })[]>;
  updateProductStock(productId: number, newStock: number): Promise<void>;
  updateOrderNotes(orderId: number, notes: string): Promise<void>;
  
  // Analytics operations
  getWholesalerStats(wholesalerId: string): Promise<{
    totalRevenue: number;
    ordersCount: number;
    activeProducts: number;
    lowStockCount: number;
  }>;
  
  getTopProducts(wholesalerId: string, limit?: number): Promise<(Product & { orderCount: number; revenue: number })[]>;
  getRecentOrders(wholesalerId: string, limit?: number): Promise<(Order & { retailer: User })[]>;
  
  // Negotiation operations
  getNegotiations(productId?: number, retailerId?: string): Promise<(Negotiation & { product: Product; retailer: User })[]>;
  createNegotiation(negotiation: InsertNegotiation): Promise<Negotiation>;
  updateNegotiation(id: number, updates: Partial<InsertNegotiation>): Promise<Negotiation>;
  
  // Subscription operations
  updateUserSubscription(userId: string, subscription: {
    tier: string;
    status: string;
    stripeSubscriptionId?: string;
    subscriptionEndsAt?: Date;
    productLimit: number;
  }): Promise<User>;
  checkProductLimit(userId: string): Promise<{ canAdd: boolean; currentCount: number; limit: number; tier: string }>;
  
  // Marketplace operations
  getMarketplaceProducts(filters: {
    search?: string;
    category?: string;
    location?: string;
    sortBy?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
  }): Promise<(Product & { wholesaler: { id: string; businessName: string; profileImageUrl?: string; rating?: number } })[]>;
  getMarketplaceWholesalers(filters: {
    search?: string;
    location?: string;
    category?: string;
    minRating?: number;
  }): Promise<(User & { products: Product[]; rating?: number; totalOrders?: number })[]>;
  getWholesalerProfile(id: string): Promise<(User & { products: Product[]; rating?: number; totalOrders?: number }) | undefined>;
  
  // Broadcast operations
  getBroadcasts(wholesalerId: string): Promise<(Broadcast & { product: Product; customerGroup: CustomerGroup })[]>;
  createBroadcast(broadcast: InsertBroadcast): Promise<Broadcast>;
  updateBroadcastStatus(id: number, status: string, sentAt?: Date, recipientCount?: number, messageId?: string, errorMessage?: string): Promise<Broadcast>;
  getBroadcastStats(wholesalerId: string): Promise<{
    totalBroadcasts: number;
    recipientsReached: number;
    avgOpenRate: number;
  }>;

  // Stock Alert operations
  createStockAlert(alert: InsertStockAlert): Promise<StockAlert>;
  getUnresolvedStockAlerts(wholesalerId: string): Promise<(StockAlert & { product: Product })[]>;
  getUnresolvedStockAlertsCount(wholesalerId: string): Promise<number>;
  markStockAlertAsRead(alertId: number, wholesalerId: string): Promise<void>;
  resolveStockAlert(alertId: number, wholesalerId: string): Promise<void>;
  updateProductLowStockThreshold(productId: number, wholesalerId: string, threshold: number): Promise<void>;
  updateDefaultLowStockThreshold(userId: string, threshold: number): Promise<void>;
  checkAndCreateStockAlerts(productId: number, wholesalerId: string, newStock: number): Promise<void>;

  // Message Template operations
  getMessageTemplates(wholesalerId: string): Promise<(MessageTemplate & { 
    products: (TemplateProduct & { product: Product })[];
    campaigns: (TemplateCampaign & { customerGroup: CustomerGroup })[];
  })[]>;
  getMessageTemplate(id: number): Promise<(MessageTemplate & { 
    products: (TemplateProduct & { product: Product })[];
    campaigns: (TemplateCampaign & { customerGroup: CustomerGroup })[];
  }) | undefined>;
  createMessageTemplate(template: InsertMessageTemplate, products: InsertTemplateProduct[]): Promise<MessageTemplate>;
  updateMessageTemplate(id: number, template: Partial<InsertMessageTemplate>): Promise<MessageTemplate>;
  deleteMessageTemplate(id: number): Promise<void>;
  createTemplateCampaign(campaign: InsertTemplateCampaign): Promise<TemplateCampaign>;
  getTemplateCampaigns(wholesalerId: string): Promise<(TemplateCampaign & { 
    template: MessageTemplate;
    customerGroup: CustomerGroup;
  })[]>;
  
  // Stock Update Notification operations
  createStockUpdateNotification(notification: InsertStockUpdateNotification): Promise<StockUpdateNotification>;
  getStockUpdateNotifications(wholesalerId: string): Promise<StockUpdateNotification[]>;
  updateStockNotificationStatus(id: number, status: string, sentAt?: Date, messagesSent?: number): Promise<StockUpdateNotification>;
  checkForStockChanges(productId: number, newStock: number, newPrice?: string): Promise<{ shouldNotify: boolean; notificationType: string }>;
  getCampaignRecipients(productId: number): Promise<{ campaignIds: number[]; templateCampaignIds: number[]; customerGroupIds: number[] }>;
  
  // Stock Movement operations
  createStockMovement(movement: InsertStockMovement): Promise<StockMovement>;
  getStockMovements(productId: number): Promise<StockMovement[]>;
  getStockMovementsByWholesaler(wholesalerId: string, limit?: number): Promise<(StockMovement & { product: Product })[]>;
  getStockSummary(productId: number): Promise<{
    openingStock: number;
    totalPurchases: number;
    totalIncreases: number;
    totalDecreases: number;
    currentStock: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(userData: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData as any)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserSettings(id: string, settings: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...settings,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserOnboarding(id: string, onboardingData: { onboardingStep?: number; onboardingCompleted?: boolean; onboardingSkipped?: boolean }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...onboardingData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Product operations
  async getProducts(wholesalerId?: string): Promise<Product[]> {
    const query = db.select().from(products);
    if (wholesalerId) {
      return await query.where(eq(products.wholesalerId, wholesalerId)).orderBy(desc(products.createdAt));
    }
    return await query.orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
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

  // Order operations
  async getOrders(wholesalerId?: string, retailerId?: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]> {
    let orderList;
    
    if (wholesalerId) {
      orderList = await db.select().from(orders).where(eq(orders.wholesalerId, wholesalerId)).orderBy(desc(orders.createdAt));
    } else if (retailerId) {
      orderList = await db.select().from(orders).where(eq(orders.retailerId, retailerId)).orderBy(desc(orders.createdAt));
    } else {
      orderList = await db.select().from(orders).orderBy(desc(orders.createdAt));
    }
    
    // Get items, retailer, and wholesaler info for each order
    const ordersWithItems = await Promise.all(
      orderList.map(async (order) => {
        const items = await db
          .select()
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));
        
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
        
        return {
          ...order,
          retailer: retailer!,
          wholesaler: wholesaler!,
          items: items.map(item => ({
            ...item.order_items,
            product: item.products!
          }))
        };
      })
    );
    
    return ordersWithItems;
  }

  async getOrder(id: number): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User }) | undefined> {
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
    
    return {
      ...order,
      retailer: retailer!,
      wholesaler: wholesaler!,
      items: items.map(item => ({
        ...item.order_items,
        product: item.products!
      }))
    };
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    
    // Insert order items and reduce stock
    for (const item of items) {
      // Insert order item
      await db.insert(orderItems).values({ ...item, orderId: newOrder.id });
      
      // Get current product info before stock reduction
      const [currentProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId));
      
      if (currentProduct) {
        // Reduce product stock
        await db
          .update(products)
          .set({ 
            stock: sql`${products.stock} - ${item.quantity}`,
            updatedAt: new Date()
          })
          .where(eq(products.id, item.productId));
        
        const newStockLevel = currentProduct.stock - item.quantity;
        console.log(`📦 Stock reduced for product ${item.productId}: ${currentProduct.stock} → ${newStockLevel} units`);
        
        // Create stock movement record for the purchase
        await this.createStockMovement({
          productId: item.productId,
          wholesalerId: currentProduct.wholesalerId,
          movementType: 'purchase',
          quantity: -item.quantity, // negative for stock reduction
          stockBefore: currentProduct.stock,
          stockAfter: newStockLevel,
          reason: 'Customer purchase',
          orderId: newOrder.id,
          customerName: order.retailerId, // This will be improved when we have customer details
        });
        
        // Check for low stock and log warnings
        if (newStockLevel <= 10 && currentProduct.stock > 10) {
          console.log(`⚠️ LOW STOCK ALERT: Product "${currentProduct.name}" now has ${newStockLevel} units remaining!`);
        } else if (newStockLevel <= 0) {
          console.log(`🚨 OUT OF STOCK: Product "${currentProduct.name}" is now out of stock!`);
        }
      }
    }
    
    return newOrder;
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
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  // Customer group operations
  async getCustomerGroups(wholesalerId: string): Promise<CustomerGroup[]> {
    const groups = await db
      .select()
      .from(customerGroups)
      .where(eq(customerGroups.wholesalerId, wholesalerId))
      .orderBy(desc(customerGroups.createdAt));
    
    // Get member counts separately
    const groupsWithCounts = await Promise.all(
      groups.map(async (group) => {
        const memberCountResult = await db
          .select({ count: count() })
          .from(customerGroupMembers)
          .where(eq(customerGroupMembers.groupId, group.id));
        
        return {
          ...group,
          memberCount: Number(memberCountResult[0]?.count || 0)
        };
      })
    );
    
    return groupsWithCounts;
  }

  async getCustomerGroupsByUser(wholesalerId: string): Promise<CustomerGroup[]> {
    return await db
      .select()
      .from(customerGroups)
      .where(eq(customerGroups.wholesalerId, wholesalerId))
      .orderBy(desc(customerGroups.createdAt));
  }

  async createCustomerGroup(group: InsertCustomerGroup): Promise<CustomerGroup> {
    const [newGroup] = await db.insert(customerGroups).values(group).returning();
    return newGroup;
  }

  async updateCustomerGroup(id: number, updates: { whatsappGroupId?: string; name?: string; description?: string }): Promise<CustomerGroup> {
    const [customerGroup] = await db
      .update(customerGroups)
      .set(updates)
      .where(eq(customerGroups.id, id))
      .returning();
    return customerGroup;
  }

  async deleteCustomerGroup(id: number): Promise<void> {
    // Delete all related records first to avoid foreign key constraint violations
    
    // 1. Delete template campaigns that reference this group
    await db
      .delete(templateCampaigns)
      .where(eq(templateCampaigns.customerGroupId, id));
    
    // 2. Delete broadcast records that reference this group
    await db
      .delete(broadcasts)
      .where(eq(broadcasts.customerGroupId, id));
    
    // 3. Delete all members from the group
    await db
      .delete(customerGroupMembers)
      .where(eq(customerGroupMembers.groupId, id));
    
    // 4. Finally delete the group itself
    await db
      .delete(customerGroups)
      .where(eq(customerGroups.id, id));
  }

  async getGroupMembers(groupId: number): Promise<User[]> {
    const members = await db
      .select()
      .from(customerGroupMembers)
      .innerJoin(users, eq(customerGroupMembers.customerId, users.id))
      .where(eq(customerGroupMembers.groupId, groupId))
      .orderBy(users.firstName);
    
    return members.map(member => member.users);
  }

  async searchGroupMembers(groupId: number, searchTerm: string): Promise<User[]> {
    const members = await db
      .select()
      .from(customerGroupMembers)
      .innerJoin(users, eq(customerGroupMembers.customerId, users.id))
      .where(
        and(
          eq(customerGroupMembers.groupId, groupId),
          or(
            ilike(users.firstName, `%${searchTerm}%`),
            ilike(users.lastName, `%${searchTerm}%`),
            ilike(users.email, `%${searchTerm}%`),
            ilike(users.phoneNumber, `%${searchTerm}%`)
          )
        )
      )
      .orderBy(users.firstName);
    
    return members.map(member => member.users);
  }

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    // Normalize phone number to handle different formats
    const normalizedPhone = phoneNumber.replace(/^\+44/, '0');
    const internationalPhone = phoneNumber.startsWith('+') ? phoneNumber : `+44${phoneNumber.substring(1)}`;
    
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.businessPhone, phoneNumber),
          eq(users.businessPhone, normalizedPhone),
          eq(users.businessPhone, internationalPhone)
        )
      );
    return user;
  }

  async createCustomer(customer: { 
    phoneNumber: string; 
    firstName: string; 
    lastName?: string;
    role: string; 
    email?: string; 
    streetAddress?: string; 
    city?: string; 
    state?: string; 
    postalCode?: string; 
    country?: string;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        phoneNumber: customer.phoneNumber,
        firstName: customer.firstName,
        lastName: customer.lastName || null,
        role: customer.role,
        email: customer.email,
        streetAddress: customer.streetAddress,
        city: customer.city,
        state: customer.state,
        postalCode: customer.postalCode,
        country: customer.country || "United Kingdom",
      })
      .returning();
    return user;
  }

  async addCustomerToGroup(groupId: number, customerId: string): Promise<void> {
    await db
      .insert(customerGroupMembers)
      .values({
        groupId: groupId,
        customerId: customerId,
      });
  }

  async removeCustomerFromGroup(groupId: number, customerId: string): Promise<void> {
    await db
      .delete(customerGroupMembers)
      .where(
        and(
          eq(customerGroupMembers.groupId, groupId),
          eq(customerGroupMembers.customerId, customerId)
        )
      );
  }

  async updateCustomerPhone(customerId: string, phoneNumber: string): Promise<void> {
    await db
      .update(users)
      .set({ phoneNumber })
      .where(eq(users.id, customerId));
  }

  async updateCustomer(customerId: string, updates: { firstName?: string; lastName?: string; email?: string }): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({
        firstName: updates.firstName,
        lastName: updates.lastName,
        email: updates.email,
        updatedAt: new Date()
      })
      .where(eq(users.id, customerId))
      .returning();
    
    return updatedUser;
  }

  // Order item operations
  async getOrderItems(orderId: number): Promise<any[]> {
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    return items;
  }

  // Product stock operations  
  async updateProductStock(productId: number, newStock: number): Promise<void> {
    // Get the product to find the wholesaler and check for alerts
    const product = await this.getProduct(productId);
    if (product) {
      await db
        .update(products)
        .set({ 
          stock: newStock,
          updatedAt: new Date()
        })
        .where(eq(products.id, productId));

      // Check and create stock alerts if needed
      await this.checkAndCreateStockAlerts(productId, product.wholesalerId, newStock);
    }
  }

  // Order notes operations
  async updateOrderNotes(orderId: number, notes: string): Promise<void> {
    await db
      .update(orders)
      .set({ 
        notes,
        updatedAt: new Date()
      })
      .where(eq(orders.id, orderId));
  }

  // Analytics operations
  async getWholesalerStats(wholesalerId: string): Promise<{
    totalRevenue: number;
    ordersCount: number;
    activeProducts: number;
    lowStockCount: number;
  }> {
    // Get total revenue and order count (include confirmed, paid, processing, shipped, fulfilled orders)
    const [revenueStats] = await db
      .select({
        totalRevenue: sum(orders.total),
        ordersCount: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`
      ));

    // Get product stats
    const [productStats] = await db
      .select({
        activeProducts: count(products.id)
      })
      .from(products)
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        eq(products.status, 'active')
      ));

    // Get low stock count (stock < 10)
    const [lowStockStats] = await db
      .select({
        lowStockCount: count(products.id)
      })
      .from(products)
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        sql`${products.stock} < 10`
      ));

    return {
      totalRevenue: Number(revenueStats.totalRevenue) || 0,
      ordersCount: revenueStats.ordersCount || 0,
      activeProducts: productStats.activeProducts || 0,
      lowStockCount: lowStockStats.lowStockCount || 0,
    };
  }

  async getTopProducts(wholesalerId: string, limit = 5): Promise<(Product & { orderCount: number; revenue: number; totalQuantitySold: number })[]> {
    const result = await db
      .select({
        product: products,
        orderCount: count(orderItems.id),
        revenue: sum(orderItems.total),
        totalQuantitySold: sum(orderItems.quantity)
      })
      .from(products)
      .leftJoin(orderItems, eq(products.id, orderItems.productId))
      .leftJoin(orders, and(
        eq(orderItems.orderId, orders.id),
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`
      ))
      .where(eq(products.wholesalerId, wholesalerId))
      .groupBy(products.id)
      .orderBy(desc(count(orderItems.id)))
      .limit(limit);

    return result.map(row => ({
      ...row.product,
      orderCount: row.orderCount || 0,
      revenue: Number(row.revenue) || 0,
      totalQuantitySold: Number(row.totalQuantitySold) || 0
    }));
  }

  async getRecentOrders(wholesalerId: string, limit = 10): Promise<(Order & { retailer: User })[]> {
    const result = await db
      .select()
      .from(orders)
      .leftJoin(users, eq(orders.retailerId, users.id))
      .where(eq(orders.wholesalerId, wholesalerId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    return result.map(row => ({
      ...row.orders,
      retailer: row.users!
    }));
  }

  // Negotiation operations
  async getNegotiations(productId?: number, retailerId?: string): Promise<(Negotiation & { product: Product; retailer: User })[]> {
    let query = db
      .select()
      .from(negotiations)
      .leftJoin(products, eq(negotiations.productId, products.id))
      .leftJoin(users, eq(negotiations.retailerId, users.id));

    if (productId) {
      query = query.where(eq(negotiations.productId, productId));
    } else if (retailerId) {
      query = query.where(eq(negotiations.retailerId, retailerId));
    }

    const result = await query.orderBy(desc(negotiations.createdAt));

    return result.map(row => ({
      ...row.negotiations,
      product: row.products!,
      retailer: row.users!
    }));
  }

  async createNegotiation(negotiation: InsertNegotiation): Promise<Negotiation> {
    const [newNegotiation] = await db.insert(negotiations).values(negotiation).returning();
    return newNegotiation;
  }

  async updateNegotiation(id: number, updates: Partial<InsertNegotiation>): Promise<Negotiation> {
    const [updatedNegotiation] = await db
      .update(negotiations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(negotiations.id, id))
      .returning();
    return updatedNegotiation;
  }

  async updateUserSubscription(userId: string, subscription: {
    tier: string;
    status: string;
    stripeSubscriptionId?: string;
    subscriptionEndsAt?: Date;
    productLimit: number;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        subscriptionTier: subscription.tier,
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        subscriptionEndsAt: subscription.subscriptionEndsAt,
        productLimit: subscription.productLimit,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async checkProductLimit(userId: string): Promise<{ canAdd: boolean; currentCount: number; limit: number; tier: string }> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const currentProducts = await db
      .select()
      .from(products)
      .where(eq(products.wholesalerId, userId));

    const currentCount = currentProducts.length;
    const limit = user.productLimit || 3;
    const tier = user.subscriptionTier || 'free';

    return {
      canAdd: limit === -1 || currentCount < limit, // -1 means unlimited
      currentCount,
      limit,
      tier
    };
  }

  // Marketplace operations
  async getMarketplaceProducts(filters: {
    search?: string;
    category?: string;
    location?: string;
    sortBy?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
  }): Promise<(Product & { wholesaler: { id: string; businessName: string; profileImageUrl?: string; rating?: number } })[]> {
    // First get all active products from wholesalers
    let whereConditions = [
      eq(products.status, 'active'),
      eq(users.role, 'wholesaler')
    ];

    if (filters.category) {
      whereConditions.push(eq(products.category, filters.category));
    }

    if (filters.search) {
      whereConditions.push(
        or(
          sql`${products.name} ILIKE ${`%${filters.search}%`}`,
          sql`${products.description} ILIKE ${`%${filters.search}%`}`,
          sql`${users.businessName} ILIKE ${`%${filters.search}%`}`
        )!
      );
    }

    if (filters.minPrice !== undefined) {
      whereConditions.push(sql`CAST(${products.price} AS DECIMAL) >= ${filters.minPrice}`);
    }

    if (filters.maxPrice !== undefined) {
      whereConditions.push(sql`CAST(${products.price} AS DECIMAL) <= ${filters.maxPrice}`);
    }

    if (filters.location) {
      whereConditions.push(sql`${users.businessAddress} ILIKE ${`%${filters.location}%`}`);
    }

    const productsList = await db
      .select()
      .from(products)
      .innerJoin(users, eq(products.wholesalerId, users.id))
      .where(and(...whereConditions));

    // Transform the results
    const results = productsList.map(item => ({
      ...item.products,
      wholesaler: {
        id: item.users.id,
        businessName: item.users.businessName || `${item.users.firstName} ${item.users.lastName}`,
        profileImageUrl: item.users.profileImageUrl || undefined,
        logoType: item.users.logoType || 'initials',
        logoUrl: item.users.logoUrl || undefined,
        firstName: item.users.firstName,
        lastName: item.users.lastName,
        rating: 4.5, // Mock rating for now
      }
    }));

    // Apply sorting
    if (filters.sortBy) {
      results.sort((a, b) => {
        switch (filters.sortBy) {
          case 'price_low':
            return parseFloat(a.price) - parseFloat(b.price);
          case 'price_high':
            return parseFloat(b.price) - parseFloat(a.price);
          case 'newest':
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          case 'rating':
            return (b.wholesaler.rating || 0) - (a.wholesaler.rating || 0);
          default:
            return 0;
        }
      });
    }

    return results;
  }

  async getMarketplaceWholesalers(filters: {
    search?: string;
    location?: string;
    category?: string;
    minRating?: number;
  }): Promise<(User & { products: Product[]; rating?: number; totalOrders?: number })[]> {
    // Get wholesalers
    let whereConditions = [eq(users.role, 'wholesaler')];
    
    if (filters.search) {
      whereConditions.push(
        or(
          sql`${users.businessName} ILIKE ${`%${filters.search}%`}`,
          sql`${users.firstName} ILIKE ${`%${filters.search}%`}`,
          sql`${users.lastName} ILIKE ${`%${filters.search}%`}`
        )!
      );
    }

    if (filters.location) {
      whereConditions.push(sql`${users.businessAddress} ILIKE ${`%${filters.location}%`}`);
    }

    const wholesalers = await db
      .select()
      .from(users)
      .where(and(...whereConditions));

    // Get products for each wholesaler
    const wholesalersWithProducts = await Promise.all(
      wholesalers.map(async (wholesaler) => {
        const wholesalerProducts = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.wholesalerId, wholesaler.id),
              eq(products.status, 'active')
            )
          )
          .limit(6); // Limit to latest 6 products for display

        return {
          ...wholesaler,
          products: wholesalerProducts,
          rating: 4.5, // Mock rating
          totalOrders: Math.floor(Math.random() * 100) + 10, // Mock order count
        };
      })
    );

    return wholesalersWithProducts;
  }

  async getWholesalerProfile(id: string): Promise<(User & { products: Product[]; rating?: number; totalOrders?: number }) | undefined> {
    const [wholesaler] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.role, 'wholesaler')
        )
      );

    if (!wholesaler) {
      return undefined;
    }

    const wholesalerProducts = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.wholesalerId, wholesaler.id),
          eq(products.status, 'active')
        )
      );

    return {
      ...wholesaler,
      products: wholesalerProducts,
      rating: 4.5, // Mock rating
      totalOrders: Math.floor(Math.random() * 100) + 10, // Mock order count
    };
  }

  // Broadcast operations
  async getBroadcasts(wholesalerId: string): Promise<(Broadcast & { product: Product; customerGroup: CustomerGroup })[]> {
    const result = await db
      .select({
        broadcast: broadcasts,
        product: products,
        customerGroup: customerGroups,
      })
      .from(broadcasts)
      .leftJoin(products, eq(broadcasts.productId, products.id))
      .leftJoin(customerGroups, eq(broadcasts.customerGroupId, customerGroups.id))
      .where(eq(broadcasts.wholesalerId, wholesalerId))
      .orderBy(desc(broadcasts.createdAt));

    return result.map(row => ({
      ...row.broadcast,
      product: row.product!,
      customerGroup: row.customerGroup!,
    }));
  }

  async createBroadcast(broadcast: InsertBroadcast): Promise<Broadcast> {
    const [newBroadcast] = await db.insert(broadcasts).values(broadcast).returning();
    return newBroadcast;
  }

  async updateBroadcastStatus(
    id: number, 
    status: string, 
    sentAt?: Date, 
    recipientCount?: number, 
    messageId?: string, 
    errorMessage?: string
  ): Promise<Broadcast> {
    const updateData: any = { 
      status,
      updatedAt: new Date(),
    };
    
    if (sentAt) updateData.sentAt = sentAt;
    if (recipientCount !== undefined) updateData.recipientCount = recipientCount;
    if (messageId) updateData.messageId = messageId;
    if (errorMessage) updateData.errorMessage = errorMessage;

    const [updatedBroadcast] = await db
      .update(broadcasts)
      .set(updateData)
      .where(eq(broadcasts.id, id))
      .returning();

    return updatedBroadcast;
  }

  async getBroadcastStats(wholesalerId: string): Promise<{
    totalBroadcasts: number;
    recipientsReached: number;
    avgOpenRate: number;
  }> {
    const result = await db
      .select({
        totalBroadcasts: count(broadcasts.id),
        recipientsReached: sum(broadcasts.recipientCount),
      })
      .from(broadcasts)
      .where(eq(broadcasts.wholesalerId, wholesalerId));

    const totalBroadcasts = Number(result[0]?.totalBroadcasts) || 0;
    const recipientsReached = Number(result[0]?.recipientsReached) || 0;
    
    // For now, use a mock average open rate since we don't have click tracking yet
    // In a real implementation, this would come from WhatsApp Business API analytics
    const avgOpenRate = totalBroadcasts > 0 ? Math.floor(Math.random() * 30) + 70 : 0;

    return {
      totalBroadcasts,
      recipientsReached,
      avgOpenRate,
    };
  }

  // Message Template operations
  async getMessageTemplates(wholesalerId: string): Promise<(MessageTemplate & { 
    products: (TemplateProduct & { product: Product })[];
    campaigns: (TemplateCampaign & { customerGroup: CustomerGroup })[];
  })[]> {
    const templates = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.wholesalerId, wholesalerId))
      .orderBy(desc(messageTemplates.createdAt));

    const templatesWithDetails = await Promise.all(
      templates.map(async (template) => {
        // Get template products
        const templateProductsList = await db
          .select()
          .from(templateProducts)
          .leftJoin(products, eq(templateProducts.productId, products.id))
          .where(eq(templateProducts.templateId, template.id));

        // Get template campaigns
        const campaigns = await db
          .select()
          .from(templateCampaigns)
          .leftJoin(customerGroups, eq(templateCampaigns.customerGroupId, customerGroups.id))
          .where(eq(templateCampaigns.templateId, template.id));

        return {
          ...template,
          products: templateProductsList.map(tp => ({
            ...tp.template_products,
            product: tp.products!
          })),
          campaigns: campaigns.map(c => ({
            ...c.template_campaigns,
            customerGroup: c.customer_groups!
          }))
        };
      })
    );

    return templatesWithDetails;
  }

  async getMessageTemplate(id: number): Promise<(MessageTemplate & { 
    products: (TemplateProduct & { product: Product })[];
    campaigns: (TemplateCampaign & { customerGroup: CustomerGroup })[];
  }) | undefined> {
    const [template] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.id, id));

    if (!template) return undefined;

    // Get template products
    const templateProductsList = await db
      .select()
      .from(templateProducts)
      .leftJoin(products, eq(templateProducts.productId, products.id))
      .where(eq(templateProducts.templateId, template.id));

    // Get template campaigns
    const campaigns = await db
      .select()
      .from(templateCampaigns)
      .leftJoin(customerGroups, eq(templateCampaigns.customerGroupId, customerGroups.id))
      .where(eq(templateCampaigns.templateId, template.id));

    return {
      ...template,
      products: templateProductsList.map(tp => ({
        ...tp.template_products,
        product: tp.products!
      })),
      campaigns: campaigns.map(c => ({
        ...c.template_campaigns,
        customerGroup: c.customer_groups!
      }))
    };
  }

  async createMessageTemplate(template: InsertMessageTemplate, products: InsertTemplateProduct[]): Promise<MessageTemplate> {
    const [newTemplate] = await db
      .insert(messageTemplates)
      .values(template)
      .returning();

    // Insert template products
    if (products.length > 0) {
      const templateProductsData = products.map(p => ({
        ...p,
        templateId: newTemplate.id
      }));
      
      await db.insert(templateProducts).values(templateProductsData);
    }

    return newTemplate;
  }

  async updateMessageTemplate(id: number, template: Partial<InsertMessageTemplate>): Promise<MessageTemplate> {
    const [updatedTemplate] = await db
      .update(messageTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(messageTemplates.id, id))
      .returning();
    
    return updatedTemplate;
  }

  async deleteMessageTemplate(id: number): Promise<void> {
    // Delete template products first (foreign key constraint)
    await db.delete(templateProducts).where(eq(templateProducts.templateId, id));
    
    // Delete template campaigns
    await db.delete(templateCampaigns).where(eq(templateCampaigns.templateId, id));
    
    // Delete the template
    await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  }

  async createTemplateCampaign(campaign: InsertTemplateCampaign): Promise<TemplateCampaign> {
    const [newCampaign] = await db
      .insert(templateCampaigns)
      .values(campaign)
      .returning();

    return newCampaign;
  }

  async getTemplateCampaigns(wholesalerId: string): Promise<(TemplateCampaign & { 
    template: MessageTemplate;
    customerGroup: CustomerGroup;
  })[]> {
    const campaigns = await db
      .select()
      .from(templateCampaigns)
      .leftJoin(messageTemplates, eq(templateCampaigns.templateId, messageTemplates.id))
      .leftJoin(customerGroups, eq(templateCampaigns.customerGroupId, customerGroups.id))
      .where(eq(messageTemplates.wholesalerId, wholesalerId))
      .orderBy(desc(templateCampaigns.createdAt));

    return campaigns.map(c => ({
      ...c.template_campaigns,
      template: c.message_templates!,
      customerGroup: c.customer_groups!
    }));
  }

  // Stock Update Notification operations
  async createStockUpdateNotification(notification: InsertStockUpdateNotification): Promise<StockUpdateNotification> {
    const [newNotification] = await db
      .insert(stockUpdateNotifications)
      .values(notification)
      .returning();
    return newNotification;
  }

  async getStockUpdateNotifications(wholesalerId: string): Promise<StockUpdateNotification[]> {
    return await db
      .select()
      .from(stockUpdateNotifications)
      .where(eq(stockUpdateNotifications.wholesalerId, wholesalerId))
      .orderBy(desc(stockUpdateNotifications.createdAt));
  }

  async updateStockNotificationStatus(
    id: number, 
    status: string, 
    sentAt?: Date, 
    messagesSent?: number
  ): Promise<StockUpdateNotification> {
    const [updated] = await db
      .update(stockUpdateNotifications)
      .set({ 
        status, 
        sentAt: sentAt || new Date(),
        messagesSent: messagesSent || 0
      })
      .where(eq(stockUpdateNotifications.id, id))
      .returning();
    return updated;
  }

  async checkForStockChanges(
    productId: number, 
    newStock: number, 
    newPrice?: string
  ): Promise<{ shouldNotify: boolean; notificationType: string }> {
    const product = await this.getProduct(productId);
    if (!product) return { shouldNotify: false, notificationType: '' };

    const currentStock = product.stock || 0;
    const currentPrice = product.price;

    // Check for stock level changes
    if (currentStock > 0 && newStock === 0) {
      return { shouldNotify: true, notificationType: 'out_of_stock' };
    }
    
    if (currentStock > 10 && newStock <= 10 && newStock > 0) {
      return { shouldNotify: true, notificationType: 'low_stock' };
    }
    
    if (currentStock === 0 && newStock > 0) {
      return { shouldNotify: true, notificationType: 'restocked' };
    }

    // Check for price changes (if price is provided)
    if (newPrice && newPrice !== currentPrice) {
      return { shouldNotify: true, notificationType: 'price_change' };
    }

    return { shouldNotify: false, notificationType: '' };
  }

  async getCampaignRecipients(productId: number): Promise<{ 
    campaignIds: number[]; 
    templateCampaignIds: number[]; 
    customerGroupIds: number[] 
  }> {
    // Find broadcasts that featured this product
    const broadcastResults = await db
      .select({ id: broadcasts.id, customerGroupId: broadcasts.customerGroupId })
      .from(broadcasts)
      .where(eq(broadcasts.productId, productId));

    // Find template campaigns that featured this product
    const templateCampaignResults = await db
      .select({ 
        templateCampaignId: templateCampaigns.id,
        customerGroupId: templateCampaigns.customerGroupId 
      })
      .from(templateCampaigns)
      .leftJoin(templateProducts, eq(templateCampaigns.templateId, templateProducts.templateId))
      .where(eq(templateProducts.productId, productId));

    const campaignIds = broadcastResults.map(b => b.id);
    const templateCampaignIds = templateCampaignResults.map(tc => tc.templateCampaignId);
    
    // Collect all unique customer group IDs
    const allGroupIds = [
      ...broadcastResults.map(b => b.customerGroupId).filter(Boolean),
      ...templateCampaignResults.map(tc => tc.customerGroupId).filter(Boolean)
    ];
    const customerGroupIds = Array.from(new Set(allGroupIds));

    return { campaignIds, templateCampaignIds, customerGroupIds };
  }

  // Stock Movement operations
  async createStockMovement(movement: InsertStockMovement): Promise<StockMovement> {
    const [stockMovement] = await db
      .insert(stockMovements)
      .values(movement)
      .returning();
    return stockMovement;
  }

  async getStockMovements(productId: number): Promise<StockMovement[]> {
    return await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.createdAt));
  }

  async getStockMovementsByWholesaler(wholesalerId: string, limit = 50): Promise<(StockMovement & { product: Product })[]> {
    return await db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        wholesalerId: stockMovements.wholesalerId,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        stockBefore: stockMovements.stockBefore,
        stockAfter: stockMovements.stockAfter,
        reason: stockMovements.reason,
        orderId: stockMovements.orderId,
        customerName: stockMovements.customerName,
        createdAt: stockMovements.createdAt,
        product: products,
      })
      .from(stockMovements)
      .leftJoin(products, eq(stockMovements.productId, products.id))
      .where(eq(stockMovements.wholesalerId, wholesalerId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit);
  }

  async getStockSummary(productId: number): Promise<{
    openingStock: number;
    totalPurchases: number;
    totalIncreases: number;
    totalDecreases: number;
    currentStock: number;
  }> {
    const movements = await this.getStockMovements(productId);
    
    let openingStock = 0;
    let totalPurchases = 0;
    let totalIncreases = 0;
    let totalDecreases = 0;

    // Find the initial stock movement (if any)
    const initialMovement = movements.find(m => m.movementType === 'initial');
    if (initialMovement) {
      openingStock = initialMovement.stockAfter;
    }

    // Calculate totals from movements
    movements.forEach(movement => {
      switch (movement.movementType) {
        case 'purchase':
          totalPurchases += Math.abs(movement.quantity); // purchases are negative
          break;
        case 'manual_increase':
          totalIncreases += movement.quantity;
          break;
        case 'manual_decrease':
          totalDecreases += Math.abs(movement.quantity); // track as positive for display
          break;
      }
    });

    // Get current stock from product
    const product = await this.getProduct(productId);
    const currentStock = product?.stock || 0;

    return {
      openingStock,
      totalPurchases,
      totalIncreases,
      totalDecreases,
      currentStock,
    };
  }

  // Stock Alert operations
  async createStockAlert(alert: InsertStockAlert): Promise<StockAlert> {
    const [newAlert] = await db.insert(stockAlerts).values(alert).returning();
    return newAlert;
  }

  async getUnresolvedStockAlerts(wholesalerId: string): Promise<(StockAlert & { product: Product })[]> {
    const alerts = await db
      .select({
        alert: stockAlerts,
        product: products,
      })
      .from(stockAlerts)
      .innerJoin(products, eq(stockAlerts.productId, products.id))
      .where(
        and(
          eq(stockAlerts.wholesalerId, wholesalerId),
          eq(stockAlerts.isResolved, false)
        )
      )
      .orderBy(desc(stockAlerts.createdAt));

    return alerts.map(row => ({
      ...row.alert,
      product: row.product,
    }));
  }

  async getUnresolvedStockAlertsCount(wholesalerId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(stockAlerts)
      .where(
        and(
          eq(stockAlerts.wholesalerId, wholesalerId),
          eq(stockAlerts.isResolved, false)
        )
      );
    return result[0]?.count || 0;
  }

  async markStockAlertAsRead(alertId: number, wholesalerId: string): Promise<void> {
    await db
      .update(stockAlerts)
      .set({ isRead: true })
      .where(
        and(
          eq(stockAlerts.id, alertId),
          eq(stockAlerts.wholesalerId, wholesalerId)
        )
      );
  }

  async resolveStockAlert(alertId: number, wholesalerId: string): Promise<void> {
    await db
      .update(stockAlerts)
      .set({ 
        isResolved: true, 
        resolvedAt: new Date() 
      })
      .where(
        and(
          eq(stockAlerts.id, alertId),
          eq(stockAlerts.wholesalerId, wholesalerId)
        )
      );
  }

  async updateProductLowStockThreshold(productId: number, wholesalerId: string, threshold: number): Promise<void> {
    await db
      .update(products)
      .set({ 
        lowStockThreshold: threshold,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(products.id, productId),
          eq(products.wholesalerId, wholesalerId)
        )
      );
  }

  async updateDefaultLowStockThreshold(userId: string, threshold: number): Promise<void> {
    await db
      .update(users)
      .set({ 
        defaultLowStockThreshold: threshold,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  // Check and create stock alerts for products that fall below threshold
  async checkAndCreateStockAlerts(productId: number, wholesalerId: string, newStock: number): Promise<void> {
    const product = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.wholesalerId, wholesalerId)
        )
      )
      .limit(1);

    if (!product[0]) return;

    const threshold = product[0].lowStockThreshold;
    
    // Only create alert if stock falls below threshold and no unresolved alert exists
    if (newStock <= threshold) {
      const existingAlert = await db
        .select()
        .from(stockAlerts)
        .where(
          and(
            eq(stockAlerts.productId, productId),
            eq(stockAlerts.wholesalerId, wholesalerId),
            eq(stockAlerts.isResolved, false)
          )
        )
        .limit(1);

      if (!existingAlert[0]) {
        await this.createStockAlert({
          productId,
          wholesalerId,
          alertType: newStock === 0 ? 'out_of_stock' : 'low_stock',
          currentStock: newStock,
          threshold,
          isRead: false,
          isResolved: false,
          notificationSent: false,
        });
      }
    }
  }

  // Team Members
  async getTeamMembers(wholesalerId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.wholesalerId, wholesalerId));
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }

  async updateTeamMemberStatus(id: number, status: string): Promise<TeamMember> {
    const [member] = await db.update(teamMembers)
      .set({ status, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async deleteTeamMember(id: number): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  async getTeamMemberCount(wholesalerId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(teamMembers)
      .where(eq(teamMembers.wholesalerId, wholesalerId));
    return result[0].count;
  }
}

export const storage = new DatabaseStorage();
