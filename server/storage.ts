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
  customerRegistrationRequests,
  customerProfileUpdateNotifications,
  userBadges,
  onboardingMilestones,
  smsVerificationCodes,
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
import { db } from "./db";
import { eq, desc, and, sql, sum, count, or, ilike, isNull } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./passwordUtils";

export interface IStorage {
  // User operations (required for auth)
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string, role?: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getAllWholesalers(): Promise<{ id: string; businessName: string; email: string }[]>;
  createUser(user: Partial<UpsertUser>): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserSettings(id: string, settings: Partial<UpsertUser>): Promise<User>;
  updateUserOnboarding(id: string, onboardingData: { onboardingStep?: number; onboardingCompleted?: boolean; onboardingSkipped?: boolean }): Promise<User>;
  
  // Password authentication methods
  createUserWithPassword(userData: Partial<UpsertUser>, password: string): Promise<User>;
  authenticateUser(email: string, password: string): Promise<User | null>;
  updateUserPassword(id: string, newPassword: string): Promise<User>;
  
  // Product operations
  getProducts(wholesalerId?: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  updateProductPromotionalOffers(id: number, promotionalOffers: any[]): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Order operations
  getOrders(wholesalerId?: string, retailerId?: string, searchTerm?: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]>;
  getOrder(id: number): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User }) | undefined>;
  getOrdersForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<Order[]>;
  getOrdersByCustomerPhone(phoneNumber: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]>;
  getLastOrderForWholesaler(wholesalerId: string): Promise<Order | undefined>;
  getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  createOrderWithTransaction(trx: any, order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  updateOrder(id: number, updates: Partial<Order>): Promise<Order>;
  updateOrderImages(orderId: number, images: Array<{
    id: string;
    url: string;
    filename: string;
    uploadedAt: string;
    description?: string;
  }>): Promise<Order | undefined>;
  updateOrderShippingInfo(id: number, shippingInfo: {
    shippingOrderId?: string;
    shippingHash?: string;
    shippingStatus?: string;
    deliveryCarrier?: string;
    deliveryServiceId?: string;
    shippingTotal?: number;
    deliveryTrackingNumber?: string;
  }): Promise<Order>;
  
  // Customer group operations
  getCustomerGroups(wholesalerId: string): Promise<CustomerGroup[]>;
  getCustomerGroupsByUser(wholesalerId: string): Promise<CustomerGroup[]>;
  createCustomerGroup(group: InsertCustomerGroup): Promise<CustomerGroup>;
  updateCustomerGroup(id: number, updates: any): Promise<CustomerGroup>;
  deleteCustomerGroup(id: number): Promise<void>;
  getGroupMembers(groupId: number): Promise<User[]>;
  searchGroupMembers(groupId: number, searchTerm: string): Promise<User[]>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  
  // Customer shipping preference operations
  setCustomerShippingChoice(customerId: string, shippingChoice: 'pickup' | 'delivery'): Promise<void>;
  getCustomerShippingChoice(customerId: string): Promise<'pickup' | 'delivery' | null>;
  createCustomer(customer: { phoneNumber: string; firstName: string; lastName?: string; role: string; email?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string; country?: string }): Promise<User>;
  addCustomerToGroup(groupId: number, customerId: string): Promise<void>;
  isCustomerInGroup(groupId: number, customerId: string): Promise<boolean>;
  removeCustomerFromGroup(groupId: number, customerId: string): Promise<void>;
  updateCustomerPhone(customerId: string, phoneNumber: string): Promise<void>;
  updateCustomerInfo(customerId: string, phoneNumber: string, name: string, email?: string): Promise<void>;
  updateCustomerInfoDetailed(customerId: string, updates: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    businessName?: string;
  }): Promise<void>;
  updateCustomer(customerId: string, updates: { firstName?: string; lastName?: string; email?: string }): Promise<User>;
  deleteCustomer(customerId: string): Promise<{ success: boolean; archived?: boolean; message: string }>;
  findCustomerByPhoneAndWholesaler(wholesalerId: string, phoneNumber: string, lastFourDigits: string): Promise<any>;
  findCustomerByLastFourDigits(wholesalerId: string, lastFourDigits: string): Promise<any>;
  getWholesalersForCustomer(lastFourDigits: string): Promise<{ id: string; businessName: string; logoUrl?: string; storeTagline?: string; location?: string; rating?: number }[]>;
  
  // Customer address book operations
  getAllCustomers(wholesalerId: string): Promise<(User & { 
    groupNames: string[]; 
    totalOrders: number; 
    totalSpent: number; 
    lastOrderDate?: Date;
    groupIds: number[];
  })[]>;
  getCustomerDetails(customerId: string): Promise<(User & { 
    groups: CustomerGroup[];
    orders: Order[];
    totalOrders: number;
    totalSpent: number;
  }) | undefined>;
  searchCustomers(wholesalerId: string, searchTerm: string): Promise<User[]>;
  bulkUpdateCustomers(customerUpdates: { customerId: string; updates: Partial<User> }[]): Promise<void>;
  getCustomerStats(wholesalerId: string): Promise<{
    totalCustomers: number;
    activeCustomers: number;
    newCustomersThisMonth: number;
    topCustomers: { customerId: string; name: string; totalSpent: number }[];
  }>;
  mergeCustomers(primaryCustomerId: string, duplicateCustomerIds: string[], mergedData?: any): Promise<{ mergedOrdersCount: number }>;
  
  // SMS verification operations
  createSMSVerificationCode(data: InsertSMSVerificationCode): Promise<SMSVerificationCode>;
  getSMSVerificationCode(wholesalerId: string, customerId: string, code: string): Promise<SMSVerificationCode | undefined>;
  getRecentSMSCodes(wholesalerId: string, customerId: string, minutes: number): Promise<SMSVerificationCode[]>;
  getRecentSMSCodesByIP(ipAddress: string, minutes: number): Promise<SMSVerificationCode[]>;
  markSMSCodeAsUsed(id: number): Promise<void>;
  incrementSMSCodeAttempts(id: number): Promise<void>;
  cleanupExpiredSMSCodes(): Promise<void>;
  
  // Session cleanup operations
  cleanupExpiredSessions(): Promise<void>;
  
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
  getWholesalerStatsForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<{
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
  getUserProductCount(userId: string): Promise<number>;
  
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
  updateBroadcast(id: number, updates: Partial<InsertBroadcast>): Promise<Broadcast>;
  deleteBroadcast(id: number, wholesalerId: string): Promise<boolean>;
  updateBroadcastStatus(id: number, status: string, sentAt?: Date, recipientCount?: number, messageId?: string, errorMessage?: string): Promise<Broadcast>;
  getBroadcastStats(wholesalerId: string): Promise<{
    totalBroadcasts: number;
    recipientsReached: number;
    avgOpenRate: number;
  }>;
  getBroadcastCountForPeriod(wholesalerId: string, startDate: Date, endDate: Date): Promise<number>;

  // Stock Alert operations
  createStockAlert(alert: InsertStockAlert): Promise<StockAlert>;
  getUnresolvedStockAlerts(wholesalerId: string): Promise<(StockAlert & { product: Product })[]>;
  getUnresolvedStockAlertsCount(wholesalerId: string): Promise<number>;
  markStockAlertAsRead(alertId: number, wholesalerId: string): Promise<void>;
  resolveStockAlert(alertId: number, wholesalerId: string): Promise<void>;
  updateProductLowStockThreshold(productId: number, wholesalerId: string, threshold: number): Promise<void>;
  updateDefaultLowStockThreshold(userId: string, threshold: number): Promise<void>;
  checkAndCreateStockAlerts(productId: number, wholesalerId: string, newStock: number): Promise<void>;
  
  // Real-time inventory monitoring operations
  getInventoryStatus(wholesalerId: string): Promise<{
    totalProducts: number;
    inStockProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    totalStockValue: number;
    averageStockLevel: number;
    lastUpdated: Date;
  }>;
  getStockAlerts(wholesalerId: string, unreadOnly?: boolean): Promise<(StockAlert & { product: Product })[]>;
  getProductStockStatus(productId: number): Promise<{
    productId: number;
    currentStock: number;
    lowStockThreshold: number;
    status: 'in_stock' | 'low_stock' | 'out_of_stock';
    daysUntilOutOfStock?: number;
    reorderSuggested: boolean;
    lastMovement?: {
      type: string;
      quantity: number;
      date: Date;
    };
  }>;
  
  // Team Management operations
  getTeamMembers(wholesalerId: string): Promise<TeamMember[]>;
  getAllTeamMembers(): Promise<TeamMember[]>;
  createTeamMember(teamMember: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, updates: Partial<InsertTeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: number): Promise<void>;
  updateTeamMemberRole(id: number, role: string): Promise<void>;
  getTeamMembersCount(wholesalerId: string): Promise<number>;
  
  // Tab permission operations
  getTabPermissions(wholesalerId: string): Promise<TabPermission[]>;
  updateTabPermission(wholesalerId: string, tabName: string, isRestricted: boolean, allowedRoles?: string[]): Promise<TabPermission>;
  createDefaultTabPermissions(wholesalerId: string): Promise<void>;
  checkTabAccess(wholesalerId: string, tabName: string, userRole: string): Promise<boolean>;

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
  deleteMessageTemplate(id: number, wholesalerId: string): Promise<boolean>;
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
  
  // Gamification operations
  getUserBadges(userId: string): Promise<UserBadge[]>;
  createUserBadge(badge: InsertUserBadge): Promise<UserBadge>;
  awardBadge(userId: string, badgeId: string, badgeName: string, badgeDescription: string, experiencePoints?: number, badgeType?: string, badgeIcon?: string, badgeColor?: string): Promise<UserBadge>;
  updateUserExperience(userId: string, experiencePoints: number): Promise<User>;
  getUserOnboardingProgress(userId: string): Promise<{ completedSteps: string[]; currentMilestone: string; progressPercentage: number; experiencePoints: number; currentLevel: number; totalBadges: number }>;
  updateOnboardingProgress(userId: string, progress: { completedSteps?: string[]; currentMilestone?: string; progressPercentage?: number }): Promise<User>;
  
  // Milestone operations
  getUserMilestones(userId: string): Promise<OnboardingMilestone[]>;
  createMilestone(milestone: InsertOnboardingMilestone): Promise<OnboardingMilestone>;
  updateMilestone(id: number, updates: Partial<InsertOnboardingMilestone>): Promise<OnboardingMilestone>;
  completeMilestone(milestoneId: string, userId: string): Promise<{ milestone: OnboardingMilestone; badge?: UserBadge; experienceGained: number }>;
  checkMilestoneProgress(userId: string, action: string): Promise<{ completedMilestones: string[]; newBadges: UserBadge[]; experienceGained: number }>;
  
  // Promotion Analytics operations
  getPromotionAnalyticsByProduct(wholesalerId: string, productId: number): Promise<any[]>;
  getProductPerformanceSummary(wholesalerId: string, productId: number): Promise<any>;
  getPromotionDashboard(wholesalerId: string): Promise<any>;
  trackPromotionActivity(wholesalerId: string, campaignId: number, productId: number, action: string, metadata?: any): Promise<void>;
  
  // Customer profile update notification operations
  createCustomerProfileUpdateNotification(notification: InsertCustomerProfileUpdateNotification): Promise<SelectCustomerProfileUpdateNotification>;
  getCustomerProfileUpdateNotifications(wholesalerId: string, limit?: number): Promise<SelectCustomerProfileUpdateNotification[]>;
  markNotificationAsRead(notificationId: number): Promise<void>;
  updateCustomerProfileWithNotifications(customerId: string, updates: Partial<User>, notifyWholesalers?: boolean): Promise<User>;
  getWholesalersForCustomerProfile(customerId: string): Promise<string[]>;
  
  // Delivery address operations
  getDeliveryAddresses(customerId: string, wholesalerId: string): Promise<DeliveryAddress[]>;
  getDeliveryAddress(id: number): Promise<DeliveryAddress | undefined>;
  createDeliveryAddress(address: InsertDeliveryAddress): Promise<DeliveryAddress>;
  updateDeliveryAddress(id: number, updates: Partial<InsertDeliveryAddress>): Promise<DeliveryAddress>;
  deleteDeliveryAddress(id: number): Promise<void>;
  setDefaultDeliveryAddress(customerId: string, wholesalerId: string, addressId: number): Promise<void>;
  getDefaultDeliveryAddress(customerId: string, wholesalerId: string): Promise<DeliveryAddress | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Temporary in-memory storage for delivery addresses (due to database size limits)
  private deliveryAddressesStorage = new Map<string, DeliveryAddress[]>();
  private nextAddressId = 1;
  
  // Temporary in-memory storage for orders (due to database size limits)
  private ordersStorage = new Map<string, any[]>();
  private nextOrderId = 1;

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getAllWholesalers(): Promise<{ id: string; businessName: string; email: string }[]> {
    const wholesalers = await db
      .select({
        id: users.id,
        businessName: users.businessName,
        email: users.email
      })
      .from(users)
      .where(eq(users.role, 'wholesaler'))
      .orderBy(users.businessName);
    
    return wholesalers.map(w => ({
      id: w.id,
      businessName: w.businessName || 'Business',
      email: w.email || ''
    }));
  }

  async getUserByEmail(email: string, role?: string): Promise<User | undefined> {
    const conditions = [eq(users.email, email)];
    
    if (role) {
      conditions.push(eq(users.role, role));
    }
    
    const [user] = await db
      .select()
      .from(users)
      .where(and(...conditions));
      
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

  // Password authentication methods
  async createUserWithPassword(userData: Partial<UpsertUser>, password: string): Promise<User> {
    // Hash the password before storing
    const passwordHash = await hashPassword(password);
    
    const userDataWithPassword = {
      ...userData,
      passwordHash
    };
    
    const [user] = await db
      .insert(users)
      .values(userDataWithPassword as any)
      .returning();
    return user;
  }

  async authenticateUser(email: string, password: string): Promise<User | null> {
    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    
    if (!user || !user.passwordHash) {
      return null;
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    
    if (!isValidPassword) {
      return null;
    }
    
    return user;
  }

  async updateUserPassword(id: string, newPassword: string): Promise<User> {
    // Hash the new password
    const passwordHash = await hashPassword(newPassword);
    
    const [user] = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, id))
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
    try {
      const [user] = await db
        .update(users)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();
      return user;
    } catch (error: any) {
      console.error('Error in updateUserSettings:', error);
      throw error;
    }
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
  // Ultra-optimized product retrieval for faster loading
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
          created_at, updated_at
        FROM products 
        WHERE wholesaler_id = ${wholesalerId} 
          AND status IN ('active', 'inactive')
        ORDER BY 
          status = 'active' DESC,
          promo_active DESC,
          stock > 0 DESC,
          created_at DESC
        LIMIT 200
      `);
      
      const queryTime = Date.now() - startTime;
      console.log(`⚡ PERFORMANCE: Wholesaler products query: ${result.rows.length} rows in ${queryTime}ms`);
      
      return result.rows.map(row => ({
        id: Number(row.id),
        name: String(row.name),
        wholesalerId: String(row.wholesaler_id),
        description: row.description ? String(row.description) : null,
        price: String(row.price),
        promoPrice: row.promo_price ? String(row.promo_price) : null,
        promoActive: Boolean(row.promo_active),
        promotionalOffers: [],
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
      }));
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
    
    return result.rows.map(row => ({
      id: Number(row.id),
      name: String(row.name),
      wholesalerId: String(row.wholesaler_id),
      description: row.description ? String(row.description) : null,
      price: String(row.price),
      promoPrice: row.promo_price ? String(row.promo_price) : null,
      promoActive: Boolean(row.promo_active),
      promotionalOffers: [],
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
    }));
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

  async updateProductPromotionalOffers(id: number, promotionalOffers: any[]): Promise<Product> {
    // Get current product to calculate promotional pricing
    const currentProduct = await this.getProduct(id);
    if (!currentProduct) {
      throw new Error('Product not found');
    }

    console.log(`📊 Calculating promotional pricing for product ${id} with ${promotionalOffers.length} offers:`, promotionalOffers);

    // Calculate promotional pricing using the imported calculator
    const { PromotionalPricingCalculator } = await import('../shared/promotional-pricing');
    const basePrice = parseFloat(currentProduct.price.toString()) || 0;
    const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
      basePrice,
      1, // quantity of 1 for base calculation
      promotionalOffers,
      currentProduct.promoPrice ? parseFloat(currentProduct.promoPrice.toString()) : undefined,
      currentProduct.promoActive ?? false
    );

    console.log(`💰 Promotional pricing calculated: original=${pricing.originalPrice}, effective=${pricing.effectivePrice}, hasPromo=${pricing.effectivePrice < pricing.originalPrice}`);

    // Apply promotional pricing if there's a difference
    const hasPromotion = pricing.effectivePrice < pricing.originalPrice;
    const promoPrice = hasPromotion ? pricing.effectivePrice : null;

    const [updatedProduct] = await db
      .update(products)
      .set({ 
        promoActive: hasPromotion,
        promoPrice: promoPrice?.toString() || null,
        updatedAt: new Date() 
      })
      .where(eq(products.id, id))
      .returning();

    console.log(`✅ Updated product ${id}: promoActive=${hasPromotion}, promoPrice=${promoPrice}`);
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

  // Order operations - Optimized with joins to reduce database calls
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
    
    if (conditions.length > 0) {
      orderQuery = orderQuery.where(and(...conditions));
    }
    
    orderQuery = orderQuery.orderBy(desc(orders.createdAt));
    const orderResults = await orderQuery;

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
    const userMap = allUsers.reduce((acc, user) => {
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
          `${retailer.firstName} ${retailer.lastName}`.toLowerCase().includes(searchValue)
        )) {
          return true;
        }
        
        // Check wholesaler fields
        if (wholesaler && (
          wholesaler.businessName?.toLowerCase().includes(searchValue) ||
          wholesaler.firstName?.toLowerCase().includes(searchValue) ||
          wholesaler.lastName?.toLowerCase().includes(searchValue) ||
          `${wholesaler.firstName} ${wholesaler.lastName}`.toLowerCase().includes(searchValue)
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
        items: itemsByOrderId[order.id] || []
      };
    });
    
    console.log(`✅ Orders query complete in ${Date.now() - startTime}ms`);
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

  async getOrdersForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<Order[]> {
    const orderList = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.createdAt} >= ${fromDate}`,
        sql`${orders.createdAt} <= ${toDate}`,
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`
      ))
      .orderBy(desc(orders.createdAt));
    
    return orderList;
  }

  // Generate unique order number for wholesaler with atomic database transaction
  async generateOrderNumber(wholesalerId: string): Promise<string> {
    // Get wholesaler's business prefix
    const wholesaler = await this.getUser(wholesalerId);
    const businessPrefix = wholesaler?.businessName 
      ? wholesaler.businessName.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase()
      : 'WS';
    
    // Use atomic transaction to find the highest order number safely
    const result = await db.transaction(async (tx) => {
      console.log(`🔍 DEBUG: Looking for orders with wholesaler_id=${wholesalerId} and prefix=${businessPrefix}`);
      
      // CRITICAL FIX: Remove FOR UPDATE from aggregate query (not allowed in Neon PostgreSQL)
      const maxOrderResult = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)), 0) as max_number
        FROM orders 
        WHERE wholesaler_id = ${wholesalerId} 
        AND order_number LIKE ${businessPrefix + '-%'}
      `);
      
      const maxNumber = maxOrderResult.rows[0]?.max_number || 0;
      const nextNumber = parseInt(maxNumber.toString()) + 1;
      
      console.log(`🔍 DEBUG: Found max_number=${maxNumber}, generating nextNumber=${nextNumber}`);
      
      // Format with leading zeros (e.g., "SF-135")
      const formattedNumber = nextNumber.toString().padStart(3, '0');
      const newOrderNumber = `${businessPrefix}-${formattedNumber}`;
      
      console.log(`🔢 ATOMIC: Generated order number ${newOrderNumber} for ${wholesaler?.businessName} (current max: ${businessPrefix}-${maxNumber.toString().padStart(3, '0')})`);
      
      return newOrderNumber;
    });
    
    return result;
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    // CRITICAL FIX: Use transaction for atomic order number generation
    return await db.transaction(async (tx) => {
      let orderNumber = order.orderNumber;
      
      // Generate order number within this transaction if not provided
      if (!orderNumber) {
        const wholesaler = await tx.select().from(users).where(eq(users.id, order.wholesalerId)).limit(1);
        const businessPrefix = wholesaler[0]?.businessName 
          ? wholesaler[0].businessName.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase()
          : 'WS';
        
        const maxOrderResult = await tx.execute(sql`
          SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)), 0) as max_number
          FROM orders 
          WHERE wholesaler_id = ${order.wholesalerId} 
          AND order_number LIKE ${businessPrefix + '-%'}
        `);
        
        const maxNumber = maxOrderResult.rows[0]?.max_number || 0;
        const nextNumber = parseInt(maxNumber.toString()) + 1;
        const formattedNumber = nextNumber.toString().padStart(3, '0');
        orderNumber = `${businessPrefix}-${formattedNumber}`;
        
        console.log(`🔢 ATOMIC: Generated order number ${orderNumber} for ${wholesaler[0]?.businessName} (current max: ${businessPrefix}-${maxNumber.toString().padStart(3, '0')})`);
      }
      
      // CRITICAL DEBUG: Add detailed logging to identify SQL syntax error
      const orderData = {
        ...order,
        orderNumber
      };
      
      console.log(`🔍 DEBUG: About to insert order with data:`, orderData);
      console.log(`🔍 DEBUG: Order data keys:`, Object.keys(orderData));
      console.log(`🔍 DEBUG: Order data values:`, Object.values(orderData));
      
      // Try to insert each field explicitly to isolate the problem
      const cleanOrderData = {
        orderNumber: orderData.orderNumber,
        wholesalerId: orderData.wholesalerId,
        retailerId: orderData.retailerId,
        subtotal: orderData.subtotal,
        platformFee: orderData.platformFee,
        total: orderData.total,
        deliveryAddress: orderData.deliveryAddress,
        notes: orderData.notes,
        status: orderData.status || 'confirmed'
      };
      
      console.log(`🔍 DEBUG: Clean order data:`, cleanOrderData);
      
      let newOrder;
      try {
        [newOrder] = await tx.insert(orders).values(cleanOrderData).returning();
        
        console.log(`✅ Order inserted successfully:`, newOrder);
      } catch (error) {
        console.error(`❌ CRITICAL: Order insertion failed:`, error);
        console.error(`❌ Clean order data that failed:`, cleanOrderData);
        console.error(`❌ Full error details:`, {
          name: (error as any).name,
          message: (error as any).message,
          stack: (error as any).stack,
          position: (error as any).position,
          code: (error as any).code
        });
        throw error;
      }
      
      // Insert order items and reduce stock within transaction
      for (const item of items) {
        // Insert order item
        await tx.insert(orderItems).values({ ...item, orderId: newOrder.id });
        
        // Get current product info before stock reduction
        const [currentProduct] = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId));
        
        // STOCK DECREMENTING: Reduce product stock based on ordered quantity and selling type
        if (currentProduct) {
          const orderedQuantity = item.quantity;
          const sellingType = item.sellingType || 'units'; // Default to units if not specified
          
          // Get customer name for stock movement tracking
          const customer = await tx.select().from(users).where(eq(users.id, order.retailerId)).limit(1);
          const customerName = customer[0] ? `${customer[0].firstName || ''} ${customer[0].lastName || ''}`.trim() || customer[0].businessName || 'Unknown Customer' : 'Unknown Customer';
          
          // CRITICAL FIX: Use Base Unit Inventory Logic
          const { InventoryCalculator } = await import('../shared/inventory-calculator');
          
          const inventoryData = {
            baseUnitStock: (currentProduct as any).baseUnitStock || 0,
            quantityInPack: (currentProduct as any).quantityInPack || 1,
            unitsPerPallet: (currentProduct as any).unitsPerPallet || 1
          };
          
          // Calculate what to subtract from base unit stock
          const orderResult = InventoryCalculator.processOrder(
            orderedQuantity,
            sellingType as 'units' | 'pallets',
            inventoryData
          );
          
          const newBaseUnitStock = orderResult.newBaseUnitStock;
          const decrementInfo = orderResult.decrementInfo;
          
          // Update base unit stock (single source of truth)
          await tx
            .update(products)
            .set({ 
              baseUnitStock: newBaseUnitStock,
              // Update legacy fields for compatibility
              stock: sellingType === 'units' ? (currentProduct.stock || 0) - orderedQuantity : currentProduct.stock,
              palletStock: sellingType === 'pallets' ? Math.max(0, (currentProduct.palletStock || 0) - orderedQuantity) : currentProduct.palletStock
            })
            .where(eq(products.id, item.productId));
          
          // Record stock movement with base unit tracking
          await tx.insert(stockMovements).values({
            productId: item.productId,
            wholesalerId: order.wholesalerId,
            movementType: 'purchase',
            quantity: -decrementInfo.baseUnitsToSubtract,
            unitType: 'base_units',
            stockBefore: inventoryData.baseUnitStock,
            stockAfter: newBaseUnitStock,
            reason: `Order sale - ${decrementInfo.conversionDetails}`,
            orderId: newOrder.id,
            customerName: customerName
          });
          
          console.log(`📦 BASE UNIT Stock reduced for product ${item.productId}: ${inventoryData.baseUnitStock} → ${newBaseUnitStock} base units`);
          console.log(`📊 Order conversion: ${decrementInfo.conversionDetails}`);
          
          // Calculate derived inventory for warnings
          const derivedInventory = InventoryCalculator.calculateDerivedInventory({
            baseUnitStock: newBaseUnitStock,
            quantityInPack: inventoryData.quantityInPack,
            unitsPerPallet: inventoryData.unitsPerPallet
          });
          
          // Log warnings based on selling type
          if (sellingType === 'pallets') {
            if (derivedInventory.availablePallets <= 5) {
              console.log(`⚠️ LOW PALLET STOCK ALERT: Product ${item.productId} (${currentProduct.name}) now has ${derivedInventory.availablePallets} pallets remaining`);
            }
            if (derivedInventory.availablePallets === 0) {
              console.log(`🚨 OUT OF PALLET STOCK: Product ${item.productId} (${currentProduct.name}) has no pallets remaining`);
            }
          } else {
            if (newBaseUnitStock <= (currentProduct.lowStockThreshold || 10)) {
              console.log(`⚠️ LOW STOCK ALERT: Product ${item.productId} (${currentProduct.name}) now has ${newBaseUnitStock} base units remaining`);
            }
            if (newBaseUnitStock === 0) {
              console.log(`🚨 OUT OF STOCK: Product ${item.productId} (${currentProduct.name}) is now out of base unit stock`);
            }
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
      .where(eq(orders.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    
    return result[0];
  }

  async createOrderWithTransaction(trx: any, orderData: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    // Create order within transaction
    const [newOrder] = await trx
      .insert(orders)
      .values({
        ...orderData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Create order items with the order ID AND reduce stock
    if (items.length > 0) {
      for (const item of items) {
        // Insert order item
        await trx.insert(orderItems).values({ ...item, orderId: newOrder.id });
        
        // Get current product info before stock reduction
        const [currentProduct] = await trx
          .select()
          .from(products)
          .where(eq(products.id, item.productId));
        
        if (currentProduct) {
          // Reduce product stock
          await trx
            .update(products)
            .set({ 
              stock: sql`${products.stock} - ${item.quantity}`,
              updatedAt: new Date()
            })
            .where(eq(products.id, item.productId));
          
          const newStockLevel = currentProduct.stock - item.quantity;
          console.log(`📦 Stock reduced for product ${item.productId}: ${currentProduct.stock} → ${newStockLevel} units`);
          
          // Track stock movement for auditing
          console.log(`📦 Stock movement tracked for product ${item.productId}: ${item.quantity} units ordered`);
          
          // Check for low stock and log warnings
          if (newStockLevel <= 10 && currentProduct.stock > 10) {
            console.log(`⚠️ LOW STOCK ALERT: Product "${currentProduct.name}" now has ${newStockLevel} units remaining!`);
          } else if (newStockLevel <= 0) {
            console.log(`🚨 OUT OF STOCK: Product "${currentProduct.name}" is now out of stock!`);
          }
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

  async setCustomerShippingChoice(customerId: string, shippingChoice: 'pickup' | 'delivery'): Promise<void> {
    this.customerShippingChoices.set(customerId, shippingChoice);
    console.log(`🚚 Stored shipping choice for customer ${customerId}: ${shippingChoice}`);
  }

  async getCustomerShippingChoice(customerId: string): Promise<'pickup' | 'delivery' | null> {
    const choice = this.customerShippingChoices.get(customerId) || null;
    console.log(`🚚 Retrieved shipping choice for customer ${customerId}: ${choice}`);
    return choice;
  }

  // Customer authentication
  async findCustomerByPhoneAndWholesaler(wholesalerId: string, phoneNumber: string, lastFourDigits: string): Promise<any> {
    try {
      console.log(`Finding customer with phone: ${phoneNumber}, last 4: ${lastFourDigits}, wholesaler: ${wholesalerId}`);
      
      // Format phone number to international format for consistent comparison
      const formattedPhone = this.formatPhoneToInternational(phoneNumber);
      
      // Verify the last 4 digits match
      const phoneLastFour = formattedPhone.slice(-4);
      if (phoneLastFour !== lastFourDigits) {
        console.log(`Last 4 digits don't match: expected ${phoneLastFour}, got ${lastFourDigits}`);
        return null;
      }
      
      // Find customer in any of the wholesaler's groups
      const customers = await db
        .select({
          id: users.id,
          name: users.firstName,
          email: users.email,
          phone: users.phoneNumber,
          groupId: customerGroupMembers.groupId,
          groupName: customerGroups.name,
        })
        .from(customerGroupMembers)
        .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
        .innerJoin(users, eq(customerGroupMembers.customerId, users.id))
        .where(
          and(
            eq(customerGroups.wholesalerId, wholesalerId),
            eq(users.phoneNumber, formattedPhone)
          )
        )
        .limit(1);
      
      if (customers.length === 0) {
        console.log(`No customer found with phone ${formattedPhone} for wholesaler ${wholesalerId}`);
        return null;
      }
      
      const customer = customers[0];
      console.log(`Customer found:`, customer);
      
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        groupId: customer.groupId,
        groupName: customer.groupName
      };
    } catch (error) {
      console.error("Error finding customer by phone and wholesaler:", error);
      return null;
    }
  }

  // Customer authentication using last 4 digits only
  async findCustomerByLastFourDigits(wholesalerId: string, lastFourDigits: string): Promise<any> {
    try {
      console.log(`Finding customer with last 4 digits: ${lastFourDigits}, wholesaler: ${wholesalerId}`);
      
      // CRITICAL FIX: Search customers using new multi-wholesaler relationship system
      const wholesalerCustomers = await db.execute(sql`
        SELECT DISTINCT
          u.id as customer_id,
          u.first_name,
          u.last_name,
          COALESCE(NULLIF(TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')), ''), u.first_name, 'Customer') as name,
          u.email,
          COALESCE(u.phone_number, u.business_phone) as phone,
          u.role,
          cg.id as group_id,
          cg.name as group_name
        FROM users u
        LEFT JOIN customer_group_members cgm ON u.id = cgm.customer_id
        LEFT JOIN customer_groups cg ON cgm.group_id = cg.id AND cg.wholesaler_id = ${wholesalerId}
        WHERE ((u.phone_number IS NOT NULL AND u.phone_number != '')
          OR (u.business_phone IS NOT NULL AND u.business_phone != ''))
          AND (
            -- Customer has direct relationship with this wholesaler (NEW)
            EXISTS (
              SELECT 1 FROM wholesaler_customer_relationships wcr
              WHERE wcr.customer_id = u.id 
                AND wcr.wholesaler_id = ${wholesalerId}
                AND wcr.status = 'active'
            )
            OR
            -- Customer directly belongs to this wholesaler (LEGACY)
            u.wholesaler_id = ${wholesalerId}
            OR
            -- Customer is in a group owned by this wholesaler (LEGACY)
            cg.wholesaler_id = ${wholesalerId}
          )
      `);
      
      // Find customers of this wholesaler whose phone number ends with the provided last 4 digits
      const matchingCustomers = wholesalerCustomers.rows.filter((customer: any) => {
        const phoneLastFour = customer.phone?.slice(-4);
        return phoneLastFour === lastFourDigits;
      });

      console.log(`Found ${matchingCustomers.length} customers with last 4 digits: ${lastFourDigits} for wholesaler: ${wholesalerId}`);
      
      if (matchingCustomers.length === 0) {
        console.log(`No customer found with last 4 digits: ${lastFourDigits} for wholesaler: ${wholesalerId}`);
        return null;
      }

      // If multiple customers have the same last 4 digits, use better matching logic
      let matchingCustomer = matchingCustomers[0];
      if (matchingCustomers.length > 1) {
        console.log(`Multiple customers found with last 4 digits: ${lastFourDigits}, using intelligent selection...`);
        
        // Get order counts and recent activity for each matching customer
        const customerOrderCounts = await Promise.all(
          matchingCustomers.map(async (customer: any) => {
            const orderCount = await db.execute(sql`
              SELECT COUNT(*) as count
              FROM orders
              WHERE retailer_id = ${customer.customer_id}
            `);
            const count = parseInt(String(orderCount.rows[0]?.count || '0'));
            console.log(`Customer ${customer.name} (${customer.customer_id}): ${count} orders`);
            return {
              customer,
              orderCount: count
            };
          })
        );
        
        // Enhanced customer selection logic for Phase 1 improvements
        
        // Priority 1: Exact phone number matches (after standardization)  
        const exactPhoneMatches = customerOrderCounts.filter(c => 
          c.customer.phone === `+44${lastFourDigits}` || 
          c.customer.phone.endsWith(lastFourDigits) && c.customer.phone.length >= 10
        );
        
        if (exactPhoneMatches.length === 1) {
          matchingCustomer = exactPhoneMatches[0].customer;
          console.log(`Selected customer with exact phone match: ${matchingCustomer.name}`);
        } else {
          // Priority 2: Customers with orders and valid business emails (not business owner accounts)
          const customersWithOrders = customerOrderCounts.filter(c => 
            c.orderCount > 0 && 
            c.customer.email && 
            c.customer.email.includes('@') && 
            !c.customer.email.includes('hello@quikpik.co') && // Exclude business owner emails
            !c.customer.email.includes('nvois.co') // Exclude internal test emails
          );
          
          if (customersWithOrders.length > 0) {
            // Among customers with orders, prefer one with more complete profile
            const bestCustomer = customersWithOrders.reduce((best, current) => {
              // Scoring system: orders + email quality + name completeness
              const bestScore = best.orderCount + 
                (best.customer.email?.includes('gmail') ? 2 : 1) +
                (best.customer.name?.split(' ').length > 1 ? 1 : 0);
              const currentScore = current.orderCount +
                (current.customer.email?.includes('gmail') ? 2 : 1) +
                (current.customer.name?.split(' ').length > 1 ? 1 : 0);
              return currentScore > bestScore ? current : best;
            });
            
            matchingCustomer = bestCustomer.customer;
            console.log(`Selected customer with best profile score: ${matchingCustomer.name} (${bestCustomer.orderCount} orders, ${matchingCustomer.email})`);
          } else {
            // Priority 3: Any customer with email, prefer non-business accounts
            const customersWithEmail = customerOrderCounts.filter(c => 
              c.customer.email && 
              !c.customer.email.includes('hello@quikpik.co')
            );
            
            matchingCustomer = customersWithEmail.length > 0 
              ? customersWithEmail[0].customer 
              : customerOrderCounts[0].customer;
            console.log(`Selected customer with email: ${matchingCustomer.name}`);
          }
        }
      }

      
      console.log(`Customer found: ${matchingCustomer.name} (${matchingCustomer.phone}) for wholesaler: ${wholesalerId}`);
      return {
        id: matchingCustomer.customer_id, // Use the actual user ID, not the member ID
        name: matchingCustomer.name,
        email: matchingCustomer.email,
        phone: matchingCustomer.phone,
        groupId: matchingCustomer.group_id,
        groupName: matchingCustomer.group_name
      };
    } catch (error) {
      console.error("Error finding customer by last 4 digits:", error);
      return null;
    }
  }

  async getWholesalersForCustomer(lastFourDigits: string): Promise<{ id: string; businessName: string; logoUrl?: string; storeTagline?: string; location?: string; rating?: number }[]> {
    try {
      console.log(`🔍 Finding accessible wholesalers for customer with last 4 digits: ${lastFourDigits}`);
      
      // Find all wholesalers where this customer has active relationships using the new multi-wholesaler system
      const accessibleWholesalers = await db.execute(sql`
        SELECT DISTINCT
          u.id,
          u.business_name,
          u.profile_image_url as logoUrl,
          u.business_description as storeTagline,
          u.business_address as location,
          5.0 as rating,
          wcr.status as relationship_status,
          wcr.created_at as relationship_created
        FROM users u
        JOIN wholesaler_customer_relationships wcr ON u.id = wcr.wholesaler_id
        JOIN users c ON wcr.customer_id = c.id
        WHERE u.role = 'wholesaler'
          AND u.business_name IS NOT NULL
          AND u.business_name != ''
          AND wcr.status = 'active'
          AND c.role = 'customer'
          AND (
            (c.phone_number IS NOT NULL AND RIGHT(c.phone_number, 4) = ${lastFourDigits})
            OR 
            (c.business_phone IS NOT NULL AND RIGHT(c.business_phone, 4) = ${lastFourDigits})
          )
        ORDER BY u.business_name
      `);

      const result = accessibleWholesalers.rows.map((row: any) => ({
        id: row.id,
        businessName: row.business_name || 'Business',
        logoUrl: row.logoUrl,
        storeTagline: row.storeTagline,
        location: row.location,
        rating: parseFloat(row.rating) || 5.0
      }));

      console.log(`✅ Found ${result.length} accessible wholesalers for customer with phone ending in ${lastFourDigits}`);
      result.forEach(w => console.log(`  - ${w.businessName} (${w.id})`));
      
      return result;
    } catch (error) {
      console.error('Error finding accessible wholesalers:', error);
      throw error;
    }
  }

  private formatPhoneToInternational(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If it starts with 0 and looks like a UK number, convert to +44
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '+44' + cleaned.slice(1);
    }
    
    // If it doesn't start with +, assume it needs +44 (UK)
    if (!cleaned.startsWith('44') && !phone.startsWith('+')) {
      return '+44' + cleaned;
    }
    
    // If it starts with 44, add the +
    if (cleaned.startsWith('44') && !phone.startsWith('+')) {
      return '+' + cleaned;
    }
    
    return phone.startsWith('+') ? phone : '+' + cleaned;
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

  async updateCustomerGroup(id: number, updates: any): Promise<CustomerGroup> {
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
          eq(users.phoneNumber, phoneNumber),
          eq(users.phoneNumber, normalizedPhone),
          eq(users.phoneNumber, internationalPhone)
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
    wholesalerId?: string;
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
        wholesalerId: customer.wholesalerId,
      })
      .returning();
    return user;
  }

  async deleteCustomer(customerId: string, wholesalerId: string): Promise<{ success: boolean; archived?: boolean; message: string }> {
    try {
      // FIXED: Check if customer has orders with THIS SPECIFIC WHOLESALER only
      const customerOrders = await db
        .select({ count: count() })
        .from(orders)
        .where(and(
          eq(orders.retailerId, customerId),
          eq(orders.wholesalerId, wholesalerId)
        ));
      
      const hasOrdersWithThisWholesaler = customerOrders[0]?.count > 0;
      
      if (hasOrdersWithThisWholesaler) {
        // Customer has orders with this wholesaler - only remove relationship, don't touch user record
        await db
          .delete(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customerId),
            eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
          ));
        
        return {
          success: true,
          archived: false,
          message: 'Customer relationship removed. Customer keeps account and orders with other wholesalers.'
        };
      } else {
        // Customer has no orders with this wholesaler - safe to remove relationship
        // Check if customer has relationships with other wholesalers
        const otherRelationships = await db
          .select({ count: count() })
          .from(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customerId),
            sql`${wholesalerCustomerRelationships.wholesalerId} != ${wholesalerId}`
          ));
          
        const hasOtherWholesalers = otherRelationships[0]?.count > 0;
        
        if (hasOtherWholesalers) {
          // Customer has other wholesaler relationships - only remove this relationship
          await db
            .delete(wholesalerCustomerRelationships)
            .where(and(
              eq(wholesalerCustomerRelationships.customerId, customerId),
              eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
            ));
            
          return {
            success: true,
            archived: false,
            message: 'Customer relationship removed. Customer maintains access through other wholesalers.'
          };
        } else {
          // Customer has no other wholesaler relationships - can safely archive user
          await db
            .delete(wholesalerCustomerRelationships)
            .where(and(
              eq(wholesalerCustomerRelationships.customerId, customerId),
              eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
            ));
            
          await db
            .update(users)
            .set({ 
              archived: true, 
              archivedAt: new Date() 
            })
            .where(eq(users.id, customerId));
          
          return {
            success: true,
            archived: true,
            message: 'Customer archived as final wholesaler relationship removed'
          };
        }
      }
    } catch (error) {
      console.error('Error in deleteCustomer:', error);
      return {
        success: false,
        message: 'Failed to delete customer'
      };
    }
  }

  async addCustomerToGroup(groupId: number, customerId: string): Promise<void> {
    await db
      .insert(customerGroupMembers)
      .values({
        groupId: groupId,
        customerId: customerId,
      });
  }

  async isCustomerInGroup(groupId: number, customerId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(customerGroupMembers)
      .where(
        and(
          eq(customerGroupMembers.groupId, groupId),
          eq(customerGroupMembers.customerId, customerId)
        )
      )
      .limit(1);
    
    return !!result;
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

  async updateCustomerInfo(customerId: string, phoneNumber: string, name: string, email?: string): Promise<void> {
    // Split the name into first and last name
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const updateData: any = { 
      phoneNumber,
      firstName,
      lastName
    };

    // Only update email if provided
    if (email !== undefined) {
      updateData.email = email || null;
    }
    
    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, customerId));
  }

  async updateCustomerInfoDetailed(customerId: string, updates: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    businessName?: string;
  }): Promise<void> {
    const updateData: any = { 
      firstName: updates.firstName,
      lastName: updates.lastName,
      phoneNumber: updates.phoneNumber
    };

    // Only update email if provided
    if (updates.email !== undefined) {
      updateData.email = updates.email || null;
    }

    // Only update business name if provided
    if (updates.businessName !== undefined) {
      updateData.businessName = updates.businessName || null;
    }
    
    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, customerId));
  }

  async updateCustomer(customerId: string, updates: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string; archived?: boolean; archivedAt?: Date | null }): Promise<User> {
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
    if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber;
    if (updates.archived !== undefined) updateData.archived = updates.archived;
    if (updates.archivedAt !== undefined) updateData.archivedAt = updates.archivedAt;
    
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, customerId))
      .returning();
    
    return updatedUser;
  }

  async mergeCustomers(primaryCustomerId: string, duplicateCustomerIds: string[], mergedData?: any): Promise<{ mergedOrdersCount: number }> {
    try {
      console.log('Starting customer merge process:', { primaryCustomerId, duplicateCustomerIds });
      
      // Step 1: Get all customer records
      const primaryCustomer = await this.getUser(primaryCustomerId);
      if (!primaryCustomer) {
        throw new Error('Primary customer not found');
      }
      
      const duplicateCustomers = await Promise.all(
        duplicateCustomerIds.map(id => this.getUser(id))
      );
      
      // Step 2: Merge customer data (keep best available information)
      const mergedCustomerData = {
        firstName: mergedData?.firstName || primaryCustomer.firstName || duplicateCustomers.find(c => c?.firstName)?.firstName,
        lastName: mergedData?.lastName || primaryCustomer.lastName || duplicateCustomers.find(c => c?.lastName)?.lastName,
        email: mergedData?.email || primaryCustomer.email || duplicateCustomers.find(c => c?.email)?.email,
        phoneNumber: primaryCustomer.phoneNumber, // Keep primary phone number
        updatedAt: new Date()
      };
      
      console.log('Merged customer data:', mergedCustomerData);
      
      // Step 3: Update primary customer with merged data
      const [updatedPrimaryCustomer] = await db
        .update(users)
        .set(mergedCustomerData)
        .where(eq(users.id, primaryCustomerId))
        .returning();
      
      // Step 4: Transfer orders from duplicate customers to primary customer
      for (const duplicateId of duplicateCustomerIds) {
        await db
          .update(orders)
          .set({ retailerId: primaryCustomerId })
          .where(eq(orders.retailerId, duplicateId));
      }
      
      // Step 5: Transfer customer group memberships to primary customer
      for (const duplicateId of duplicateCustomerIds) {
        // Get customer group memberships for duplicate
        const memberships = await db
          .select()
          .from(customerGroupMembers)
          .where(eq(customerGroupMembers.customerId, duplicateId));
        
        // Add primary customer to groups if not already member
        for (const membership of memberships) {
          const existingMembership = await db
            .select()
            .from(customerGroupMembers)
            .where(
              and(
                eq(customerGroupMembers.groupId, membership.groupId),
                eq(customerGroupMembers.customerId, primaryCustomerId)
              )
            );
          
          if (existingMembership.length === 0) {
            await db
              .insert(customerGroupMembers)
              .values({
                groupId: membership.groupId,
                customerId: primaryCustomerId,
                createdAt: new Date()
              });
          }
        }
        
        // Remove duplicate customer from groups
        await db
          .delete(customerGroupMembers)
          .where(eq(customerGroupMembers.customerId, duplicateId));
      }
      
      // Step 6: Delete duplicate customer records
      for (const duplicateId of duplicateCustomerIds) {
        await db
          .delete(users)
          .where(eq(users.id, duplicateId));
      }
      
      console.log('Customer merge completed successfully');
      return { mergedOrdersCount: duplicateCustomerIds.length };
      
    } catch (error) {
      console.error('Error in mergeCustomers:', error);
      throw error;
    }
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
    revenueChange: number;
    ordersChange: number;
  }> {
    // Get current month's data
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    
    const previousMonthStart = new Date(currentMonthStart);
    previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
    
    // Get total revenue and order count (include confirmed, paid, processing, shipped, fulfilled orders)
    // Calculate net revenue by subtracting platform fees from total
    const [revenueStats] = await db
      .select({
        totalRevenue: sql<number>`SUM(CAST(${orders.total} AS NUMERIC) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0))`,
        ordersCount: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`
      ));

    // Get current month stats
    const [currentMonthStats] = await db
      .select({
        currentRevenue: sql<number>`SUM(CAST(${orders.total} AS NUMERIC) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0))`,
        currentOrders: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`,
        sql`${orders.createdAt} >= ${currentMonthStart}`
      ));

    // Get previous month stats
    const [previousMonthStats] = await db
      .select({
        previousRevenue: sql<number>`SUM(CAST(${orders.total} AS NUMERIC) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0))`,
        previousOrders: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`,
        sql`${orders.createdAt} >= ${previousMonthStart} AND ${orders.createdAt} < ${currentMonthStart}`
      ));

    // Calculate percentage changes
    const currentRevenue = Number(currentMonthStats.currentRevenue) || 0;
    const previousRevenue = Number(previousMonthStats.previousRevenue) || 0;
    const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    
    const currentOrders = currentMonthStats.currentOrders || 0;
    const previousOrders = previousMonthStats.previousOrders || 0;
    const ordersChange = previousOrders > 0 ? ((currentOrders - previousOrders) / previousOrders) * 100 : 0;

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

    // Get low stock count using configurable thresholds
    const [lowStockStats] = await db
      .select({
        lowStockCount: count(products.id)
      })
      .from(products)
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        eq(products.status, 'active'),
        sql`${products.stock} <= COALESCE(${products.lowStockThreshold}, 50)`
      ));

    return {
      totalRevenue: Number(revenueStats.totalRevenue) || 0,
      ordersCount: revenueStats.ordersCount || 0,
      activeProducts: productStats.activeProducts || 0,
      lowStockCount: lowStockStats.lowStockCount || 0,
      revenueChange: Math.round(revenueChange * 100) / 100,
      ordersChange: Math.round(ordersChange * 100) / 100,
    };
  }

  async getWholesalerStatsForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<{
    totalRevenue: number;
    ordersCount: number;
    activeProducts: number;
    lowStockCount: number;
  }> {
    // Get revenue and order count for the specified date range
    const [revenueStats] = await db
      .select({
        totalRevenue: sum(orders.total),
        ordersCount: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`,
        sql`${orders.createdAt} >= ${fromDate} AND ${orders.createdAt} <= ${toDate}`
      ));

    // Get product stats (current active products, not date-specific)
    const [productStats] = await db
      .select({
        activeProducts: count(products.id)
      })
      .from(products)
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        eq(products.status, 'active')
      ));

    // Get low stock count using configurable thresholds
    const [lowStockStats] = await db
      .select({
        lowStockCount: count(products.id)
      })
      .from(products)
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        eq(products.status, 'active'),
        sql`${products.stock} <= COALESCE(${products.lowStockThreshold}, 50)`
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
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        or(
          isNull(orders.id), // Products with no orders
          sql`${orders.status} IN ('confirmed', 'paid', 'processing', 'shipped', 'fulfilled', 'completed')`
        )
      ))
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

  async getUserProductCount(userId: string): Promise<number> {
    const products = await db
      .select()
      .from(products)
      .where(eq(products.wholesalerId, userId));
    return products.length;
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
    wholesalerId?: string;
  }): Promise<(Product & { wholesaler: { id: string; businessName: string; profileImageUrl?: string; rating?: number } })[]> {
    try {
      console.log('🔍 getMarketplaceProducts called with filters:', filters);
      console.log('🔧 Database connection status:', !!db);
      console.log('🌍 Environment:', process.env.NODE_ENV);
      
      // Check if wholesalerId is provided
      if (!filters.wholesalerId) {
        console.log('No wholesaler ID provided');
        return [];
      }
      
      // Get products using the exact same pattern as getWholesalerProfile
      const productsResult = await db.execute(sql`
        SELECT * FROM products 
        WHERE wholesaler_id = ${filters.wholesalerId} AND status = 'active'
      `);
      const productsList = productsResult.rows as any[];
      console.log('Products found:', productsList.length);

      // Get unique wholesaler IDs
      const wholesalerIds = Array.from(new Set(productsList.map(p => p.wholesaler_id)));
      
      if (wholesalerIds.length === 0) {
        console.log('No wholesaler IDs found');
        return [];
      }
      
      // Get wholesaler data using same approach as getWholesalerProfile
      const wholesalersResult = await db.execute(sql`
        SELECT * FROM users 
        WHERE id = ${filters.wholesalerId} AND role = 'wholesaler'
        LIMIT 1
      `);

      const wholesalers = wholesalersResult.rows as any[];
      console.log('Wholesalers found:', wholesalers.length);

      // Create wholesaler lookup map
      const wholesalerMap = new Map(wholesalers.map(w => [w.id, w]));

      // Combine products with wholesaler data
      const results = productsList.map(product => {
        const wholesaler = wholesalerMap.get(product.wholesaler_id);
        
        // Handle image URL conversion - prioritize images array over image_url field
        let imageUrl = product.image_url || undefined;
        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          imageUrl = product.images[0]; // Use first image from array
        }
        
        return {
          id: product.id,
          wholesalerId: product.wholesaler_id,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
          moq: product.moq,
          stock: product.stock,
          imageUrl, // Convert snake_case to camelCase for frontend
          images: product.images,
          category: product.category,
          status: product.status,
          priceVisible: product.price_visible,
          negotiationEnabled: product.negotiation_enabled,
          minimumBidPrice: product.minimum_bid_price,
          // Product size fields conversion
          packQuantity: product.pack_quantity,
          unitOfMeasure: product.unit_of_measure,
          unitSize: product.unit_size,
          sellingFormat: product.selling_format,
          unitsPerPallet: product.units_per_pallet,
          palletPrice: product.pallet_price,
          palletMoq: product.pallet_moq,
          palletStock: product.pallet_stock,
          unitWeight: product.unit_weight,
          palletWeight: product.pallet_weight,
          unit_weight: product.unit_weight,
          pallet_weight: product.pallet_weight,
          promoPrice: product.promo_price,
          promoActive: product.promo_active,
          promotionalOffers: (() => {
            try {
              if (product.promotional_offers) {
                if (typeof product.promotional_offers === 'string') {
                  // Handle string JSON
                  return product.promotional_offers.trim() ? JSON.parse(product.promotional_offers) : [];
                } else {
                  // Handle JSONB object
                  return Array.isArray(product.promotional_offers) ? product.promotional_offers : [];
                }
              } else {
                return [];
              }
            } catch (e) {
              console.error('Error parsing promotional offers for product:', product.id, e);
              return [];
            }
          })(),
          createdAt: product.created_at,
          updatedAt: product.updated_at,
          wholesaler: {
            id: product.wholesaler_id,
            businessName: wholesaler?.business_name || `${wholesaler?.first_name || ''} ${wholesaler?.last_name || ''}`.trim() || 'Business',
            profileImageUrl: wholesaler?.profile_image_url || undefined,
            logoType: wholesaler?.logo_type || 'initials',
            logoUrl: wholesaler?.logo_url || undefined,
            firstName: wholesaler?.first_name,
            lastName: wholesaler?.last_name,
            rating: 4.5,
          }
        };
      });

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

      console.log('Results prepared:', results.length);
      return results;
    } catch (error: any) {
      console.error('Error in getMarketplaceProducts:', error);
      throw new Error(`Failed to get marketplace products: ${error.message}`);
    }
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
        // Get team members for this wholesaler
        const teamMemberIds = await db
          .select({ userId: teamMembers.id })
          .from(teamMembers)
          .where(eq(teamMembers.wholesalerId, wholesaler.id));
        
        const allRelevantIds = [wholesaler.id, ...teamMemberIds.map(tm => tm.userId)];
        
        // Include products from parent company AND team members
        const wholesalerProducts = await db
          .select()
          .from(products)
          .where(
            and(
              allRelevantIds.length === 1 
                ? eq(products.wholesalerId, wholesaler.id)
                : or(...allRelevantIds.map(id => eq(products.wholesalerId, id)))!,
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
    try {
      console.log('Getting wholesaler profile for ID:', id);
      
      // Use raw SQL to bypass Drizzle ORM issues
      const wholesalerResult = await db.execute(sql`
        SELECT * FROM users 
        WHERE id = ${id} AND role = 'wholesaler'
        LIMIT 1
      `);

      if (!wholesalerResult.rows || wholesalerResult.rows.length === 0) {
        console.log('Wholesaler not found');
        return undefined;
      }

      const wholesaler = wholesalerResult.rows[0] as any;
      console.log('Wholesaler found:', wholesaler.business_name);

      // Get products for this wholesaler using raw SQL
      const productsResult = await db.execute(sql`
        SELECT * FROM products 
        WHERE wholesaler_id = ${id} AND status = 'active'
      `);

      const wholesalerProducts = (productsResult.rows || []).map(row => {
        const product = row as any;
        
        // Handle image URL conversion - prioritize images array over image_url field
        let imageUrl = product.image_url || undefined;
        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          imageUrl = product.images[0]; // Use first image from array
        }
        
        return {
          id: product.id,
          wholesalerId: product.wholesaler_id,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
          moq: product.moq,
          stock: product.stock,
          imageUrl, // Use converted imageUrl
          images: product.images,
          category: product.category,
          status: product.status,
          priceVisible: product.price_visible,
          negotiationEnabled: product.negotiation_enabled,
          minimumBidPrice: product.minimum_bid_price,
          sellingFormat: product.selling_format,
          unitsPerPallet: product.units_per_pallet,
          palletPrice: product.pallet_price,
          palletMoq: product.pallet_moq,
          palletStock: product.pallet_stock,
          promoPrice: product.promo_price,
          promoActive: product.promo_active,
          createdAt: product.created_at,
          updatedAt: product.updated_at,
        };
      });

      console.log('Products found for wholesaler:', wholesalerProducts.length);

      // Transform wholesaler data to match User type
      const transformedWholesaler = {
        id: wholesaler.id,
        email: wholesaler.email,
        firstName: wholesaler.first_name,
        lastName: wholesaler.last_name,
        profileImageUrl: wholesaler.profile_image_url,
        role: wholesaler.role as 'wholesaler',
        businessName: wholesaler.business_name,
        stripeAccountId: wholesaler.stripe_account_id,
        stripeCustomerId: wholesaler.stripe_customer_id,
        createdAt: wholesaler.created_at,
        updatedAt: wholesaler.updated_at,
        stripeSubscriptionId: wholesaler.stripe_subscription_id,
        subscriptionTier: wholesaler.subscription_tier,
        subscriptionStatus: wholesaler.subscription_status,
        subscriptionEndsAt: wholesaler.subscription_ends_at,
        productLimit: wholesaler.product_limit,
        preferredCurrency: wholesaler.preferred_currency,
        businessAddress: wholesaler.business_address,
        businessPhone: wholesaler.business_phone,
        timezone: wholesaler.timezone,
        phoneNumber: wholesaler.phone_number,
        notificationPreferences: wholesaler.notification_preferences,
        streetAddress: wholesaler.street_address,
        city: wholesaler.city,
        state: wholesaler.state,
        postalCode: wholesaler.postal_code,
        country: wholesaler.country,
        whatsappEnabled: wholesaler.whatsapp_enabled || false,
        logoUrl: wholesaler.logo_url,
        logoType: wholesaler.logo_type,
        onboardingCompleted: wholesaler.onboarding_completed,
        onboardingStep: wholesaler.onboarding_step,
        onboardingSkipped: wholesaler.onboarding_skipped,
        googleId: wholesaler.google_id,
        isFirstLogin: wholesaler.is_first_login,
        storeTagline: wholesaler.store_tagline,
        showPricesToWholesalers: wholesaler.show_prices_to_wholesalers,
        defaultLowStockThreshold: wholesaler.default_low_stock_threshold,
        businessDescription: wholesaler.business_description,
        businessEmail: wholesaler.business_email,
        businessType: wholesaler.business_type,
        estimatedMonthlyVolume: wholesaler.estimated_monthly_volume,
        defaultCurrency: wholesaler.default_currency,
        sendOrderDispatchedEmails: wholesaler.send_order_dispatched_emails,
        autoMarkFulfilled: wholesaler.auto_mark_fulfilled,
        enableTrackingNotifications: wholesaler.enable_tracking_notifications,
        sendDeliveryConfirmations: wholesaler.send_delivery_confirmations,
        passwordHash: wholesaler.password_hash,
        experiencePoints: wholesaler.experience_points,
        currentLevel: wholesaler.current_level,
        totalBadges: wholesaler.total_badges,
        completedAchievements: wholesaler.completed_achievements,
        onboardingProgress: wholesaler.onboarding_progress,
      };

      return {
        ...transformedWholesaler,
        products: wholesalerProducts,
        rating: 4.5,
        totalOrders: 50,
      };
    } catch (error) {
      console.error('Error in getWholesalerProfile:', error);
      throw error;
    }
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

  async updateBroadcast(id: number, updates: Partial<InsertBroadcast>): Promise<Broadcast> {
    const [updatedBroadcast] = await db
      .update(broadcasts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(broadcasts.id, id))
      .returning();
    
    return updatedBroadcast;
  }

  async deleteBroadcast(id: number, wholesalerId: string): Promise<boolean> {
    const deleteResult = await db
      .delete(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.wholesalerId, wholesalerId)))
      .returning();
    
    return deleteResult.length > 0;
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

  async getBroadcastCountForPeriod(wholesalerId: string, startDate: Date, endDate: Date): Promise<number> {
    const result = await db
      .select({ count: count(broadcasts.id) })
      .from(broadcasts)
      .where(
        and(
          eq(broadcasts.wholesalerId, wholesalerId),
          sql`${broadcasts.sentAt} >= ${startDate}`,
          sql`${broadcasts.sentAt} <= ${endDate}`,
          sql`${broadcasts.sentAt} IS NOT NULL` // Only count sent broadcasts
        )
      );

    return Number(result[0]?.count) || 0;
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
    console.log('updateMessageTemplate called with:', { id, idType: typeof id, template });
    const [updatedTemplate] = await db
      .update(messageTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(messageTemplates.id, id))
      .returning();
    
    return updatedTemplate;
  }

  async deleteMessageTemplate(id: number, wholesalerId: string): Promise<boolean> {
    // First verify the template belongs to the wholesaler
    const [template] = await db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.wholesalerId, wholesalerId)));
    
    if (!template) {
      return false;
    }
    
    // Delete template products first (foreign key constraint)
    await db.delete(templateProducts).where(eq(templateProducts.templateId, id));
    
    // Delete template campaigns
    await db.delete(templateCampaigns).where(eq(templateCampaigns.templateId, id));
    
    // Delete the template
    await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
    
    return true;
  }

  async deleteTemplateProducts(templateId: number): Promise<void> {
    await db.delete(templateProducts).where(eq(templateProducts.templateId, templateId));
  }

  async createTemplateProduct(templateProduct: InsertTemplateProduct): Promise<TemplateProduct> {
    const [newTemplateProduct] = await db.insert(templateProducts).values(templateProduct).returning();
    return newTemplateProduct;
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
    console.log(`🔍 DEBUG: About to create stock movement:`, movement);
    
    try {
      const [stockMovement] = await db
        .insert(stockMovements)
        .values(movement)
        .returning();
      
      console.log(`✅ Stock movement created successfully:`, stockMovement);
      return stockMovement;
    } catch (error) {
      console.error(`❌ CRITICAL: Stock movement creation failed:`, error);
      console.error(`❌ Movement data that failed:`, movement);
      throw error;
    }
  }

  async getStockMovements(productId: number): Promise<StockMovement[]> {
    return await db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        wholesalerId: stockMovements.wholesalerId,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        unitType: stockMovements.unitType,
        stockBefore: stockMovements.stockBefore,
        stockAfter: stockMovements.stockAfter,
        reason: stockMovements.reason,
        orderId: stockMovements.orderId,
        customerName: stockMovements.customerName,
        createdAt: stockMovements.createdAt,
      })
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
        unitType: stockMovements.unitType,
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

  // Team Management operations
  async getTeamMembers(wholesalerId: string): Promise<TeamMember[]> {
    return await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.wholesalerId, wholesalerId))
      .orderBy(desc(teamMembers.createdAt));
  }

  async getAllTeamMembers(): Promise<TeamMember[]> {
    return await db
      .select()
      .from(teamMembers)
      .orderBy(desc(teamMembers.createdAt));
  }

  async createTeamMember(teamMember: InsertTeamMember): Promise<TeamMember> {
    const [newMember] = await db
      .insert(teamMembers)
      .values({
        ...teamMember,
        inviteToken: `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })
      .returning();
    return newMember;
  }

  async updateTeamMember(id: number, updates: Partial<InsertTeamMember>): Promise<TeamMember> {
    const [updated] = await db
      .update(teamMembers)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(teamMembers.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMember(id: number): Promise<void> {
    await db
      .delete(teamMembers)
      .where(eq(teamMembers.id, id));
  }

  async updateTeamMemberRole(id: number, role: string): Promise<void> {
    await db
      .update(teamMembers)
      .set({ role })
      .where(eq(teamMembers.id, id));
  }

  async getTeamMembersCount(wholesalerId: string): Promise<number> {
    const [result] = await db
      .select({ count: count(teamMembers.id) })
      .from(teamMembers)
      .where(eq(teamMembers.wholesalerId, wholesalerId));
    
    return result.count || 0;
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

  // Team Members - Additional methods
  async updateTeamMemberStatus(id: number, status: string): Promise<TeamMember> {
    const [member] = await db.update(teamMembers)
      .set({ status, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async getTeamMemberCount(wholesalerId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(teamMembers)
      .where(eq(teamMembers.wholesalerId, wholesalerId));
    return result[0].count;
  }



  // Gamification operations implementation
  async getUserBadges(userId: string): Promise<UserBadge[]> {
    return await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.unlockedAt));
  }

  async createUserBadge(badge: InsertUserBadge): Promise<UserBadge> {
    const [newBadge] = await db.insert(userBadges).values(badge).returning();
    return newBadge;
  }

  async awardBadge(
    userId: string,
    badgeId: string,
    badgeName: string,
    badgeDescription: string,
    experiencePoints: number = 0,
    badgeType: string = 'achievement',
    badgeIcon: string = '🏆',
    badgeColor: string = '#10B981'
  ): Promise<UserBadge> {
    // Check if user already has this badge
    const existingBadge = await db
      .select()
      .from(userBadges)
      .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)))
      .limit(1);

    if (existingBadge.length > 0) {
      return existingBadge[0];
    }

    // Create new badge
    const badge = await this.createUserBadge({
      userId,
      badgeId,
      badgeType,
      badgeName,
      badgeDescription,
      badgeIcon,
      badgeColor,
      experiencePoints
    });

    // Update user's total badges and experience
    await this.updateUserExperience(userId, experiencePoints);
    
    // Update total badges count
    await db
      .update(users)
      .set({ 
        totalBadges: sql`${users.totalBadges} + 1`
      })
      .where(eq(users.id, userId));

    return badge;
  }

  async updateUserExperience(userId: string, experiencePoints: number): Promise<User> {
    // Calculate new level based on experience points
    const newLevel = Math.floor(experiencePoints / 100) + 1; // 100 XP per level

    const [updatedUser] = await db
      .update(users)
      .set({
        experiencePoints: sql`${users.experiencePoints} + ${experiencePoints}`,
        currentLevel: newLevel
      })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async getUserOnboardingProgress(userId: string): Promise<{
    completedSteps: string[];
    currentMilestone: string;
    progressPercentage: number;
    experiencePoints: number;
    currentLevel: number;
    totalBadges: number;
  }> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const progress = user.onboardingProgress as any || {
      completedSteps: [],
      currentMilestone: 'getting_started',
      progressPercentage: 0
    };

    return {
      ...progress,
      experiencePoints: user.experiencePoints || 0,
      currentLevel: user.currentLevel || 1,
      totalBadges: user.totalBadges || 0
    };
  }

  async updateOnboardingProgress(
    userId: string,
    progress: {
      completedSteps?: string[];
      currentMilestone?: string;
      progressPercentage?: number;
    }
  ): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const currentProgress = user.onboardingProgress as any || {
      completedSteps: [],
      currentMilestone: 'getting_started',
      progressPercentage: 0
    };

    const updatedProgress = {
      ...currentProgress,
      ...progress
    };

    const [updatedUser] = await db
      .update(users)
      .set({ onboardingProgress: updatedProgress })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  // Milestone operations implementation
  async getUserMilestones(userId: string): Promise<OnboardingMilestone[]> {
    return await db
      .select()
      .from(onboardingMilestones)
      .where(eq(onboardingMilestones.userId, userId))
      .orderBy(onboardingMilestones.createdAt);
  }

  async createMilestone(milestone: InsertOnboardingMilestone): Promise<OnboardingMilestone> {
    const [newMilestone] = await db.insert(onboardingMilestones).values(milestone).returning();
    return newMilestone;
  }

  async updateMilestone(id: number, updates: Partial<InsertOnboardingMilestone>): Promise<OnboardingMilestone> {
    const [updatedMilestone] = await db
      .update(onboardingMilestones)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(onboardingMilestones.id, id))
      .returning();

    return updatedMilestone;
  }

  async completeMilestone(milestoneId: string, userId: string): Promise<{
    milestone: OnboardingMilestone;
    badge?: UserBadge;
    experienceGained: number;
  }> {
    // Find the milestone
    const [milestone] = await db
      .select()
      .from(onboardingMilestones)
      .where(
        and(
          eq(onboardingMilestones.milestoneId, milestoneId),
          eq(onboardingMilestones.userId, userId)
        )
      );

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.isCompleted) {
      return { milestone, experienceGained: 0 };
    }

    // Mark milestone as completed
    const [completedMilestone] = await db
      .update(onboardingMilestones)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(onboardingMilestones.id, milestone.id))
      .returning();

    let badge: UserBadge | undefined;
    let experienceGained = milestone.experienceReward || 0;

    // Award experience points
    if (experienceGained > 0) {
      await this.updateUserExperience(userId, experienceGained);
    }

    // Award badge if specified
    if (milestone.badgeReward) {
      badge = await this.awardBadge(
        userId,
        milestone.badgeReward,
        `${milestone.milestoneName} Complete`,
        `Completed: ${milestone.milestoneDescription}`,
        experienceGained,
        'milestone'
      );
    }

    return { milestone: completedMilestone, badge, experienceGained };
  }

  async checkMilestoneProgress(userId: string, action: string): Promise<{
    completedMilestones: string[];
    newBadges: UserBadge[];
    experienceGained: number;
  }> {
    const milestones = await this.getUserMilestones(userId);
    const incompleteMilestones = milestones.filter(m => !m.isCompleted);
    
    const completedMilestones: string[] = [];
    const newBadges: UserBadge[] = [];
    let totalExperienceGained = 0;

    for (const milestone of incompleteMilestones) {
      const requiredActions = milestone.requiredActions as string[] || [];
      const completedActions = milestone.completedActions as string[] || [];

      // Check if this action is required for the milestone
      if (requiredActions.includes(action) && !completedActions.includes(action)) {
        const updatedCompletedActions = [...completedActions, action];
        
        // Update completed actions
        await db
          .update(onboardingMilestones)
          .set({
            completedActions: updatedCompletedActions,
            updatedAt: new Date()
          })
          .where(eq(onboardingMilestones.id, milestone.id));

        // Check if all required actions are completed
        const allCompleted = requiredActions.every(req => updatedCompletedActions.includes(req));
        
        if (allCompleted) {
          const result = await this.completeMilestone(milestone.milestoneId, userId);
          completedMilestones.push(milestone.milestoneId);
          totalExperienceGained += result.experienceGained;
          
          if (result.badge) {
            newBadges.push(result.badge);
          }
        }
      }
    }

    return {
      completedMilestones,
      newBadges,
      experienceGained: totalExperienceGained
    };
  }

  // Promotion Analytics methods
  async getPromotionAnalyticsByProduct(wholesalerId: string, productId: number): Promise<any[]> {
    try {
      // Mock data for now - will be replaced with real data when database is ready
      return [
        {
          campaignId: 1,
          promotionType: 'percentage_discount',
          discountPercentage: 15,
          orderCount: 12,
          revenue: 2400,
          startDate: '2025-01-01',
          endDate: '2025-01-15',
          effectiveness: 'high'
        },
        {
          campaignId: 2,
          promotionType: 'fixed_amount_discount',
          discountAmount: 50,
          orderCount: 8,
          revenue: 1600,
          startDate: '2025-01-10',
          endDate: '2025-01-20',
          effectiveness: 'medium'
        }
      ];
    } catch (error) {
      console.error('Error fetching promotion analytics:', error);
      return [];
    }
  }

  async getProductPerformanceSummary(wholesalerId: string, productId: number): Promise<any> {
    try {
      // Mock data for now - will be replaced with real data when database is ready
      return {
        totalPromotions: 5,
        bestPerformingPromotion: 'percentage_discount',
        averageOrderIncrease: 45,
        totalPromotionalRevenue: 8500,
        promotionalOrderCount: 34,
        conversionRate: 12.5,
        averageOrderValue: 250
      };
    } catch (error) {
      console.error('Error fetching product performance summary:', error);
      return {};
    }
  }

  async getPromotionDashboard(wholesalerId: string): Promise<any> {
    try {
      // Mock data for now - will be replaced with real data when database is ready
      return {
        activePromotions: 3,
        totalRevenue: 15000,
        topPerformingProduct: 'Premium Basmati Rice',
        averageConversionRate: 18.7,
        totalOrders: 67,
        recentPromotions: [
          { productName: 'Premium Basmati Rice', type: 'percentage_discount', performance: 'excellent' },
          { productName: 'Organic Quinoa', type: 'bogo', performance: 'good' },
          { productName: 'Brown Rice', type: 'fixed_price', performance: 'average' }
        ]
      };
    } catch (error) {
      console.error('Error fetching promotion dashboard:', error);
      return {};
    }
  }

  async trackPromotionActivity(wholesalerId: string, campaignId: number, productId: number, action: string, metadata?: any): Promise<void> {
    try {
      // Mock implementation for now - will be replaced with real logging when database is ready
      console.log('Tracking promotion activity:', {
        wholesalerId,
        campaignId,
        productId,
        action,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error tracking promotion activity:', error);
    }
  }

  // SMS verification operations
  async createSMSVerificationCode(data: InsertSMSVerificationCode): Promise<SMSVerificationCode> {
    console.log('Creating SMS verification code for customer:', data.customerId);
    const [code] = await db.insert(smsVerificationCodes).values(data).returning();
    return code;
  }

  async getLatestSMSCode(customerId: string): Promise<string | null> {
    const [latest] = await db
      .select()
      .from(smsVerificationCodes)
      .where(eq(smsVerificationCodes.customerId, customerId))
      .orderBy(desc(smsVerificationCodes.createdAt))
      .limit(1);
    
    return latest?.code || null;
  }

  async getSMSVerificationCode(wholesalerId: string, customerId: string, code: string): Promise<SMSVerificationCode | undefined> {
    console.log('Getting SMS verification code:', { wholesalerId, customerId, code });
    const [result] = await db
      .select()
      .from(smsVerificationCodes)
      .where(
        and(
          eq(smsVerificationCodes.wholesalerId, wholesalerId),
          eq(smsVerificationCodes.customerId, customerId),
          eq(smsVerificationCodes.code, code),
          eq(smsVerificationCodes.isUsed, false)
        )
      )
      .limit(1);
    return result;
  }

  async getRecentSMSCodes(wholesalerId: string, customerId: string, minutes: number): Promise<SMSVerificationCode[]> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    const results = await db
      .select()
      .from(smsVerificationCodes)
      .where(
        and(
          eq(smsVerificationCodes.wholesalerId, wholesalerId),
          eq(smsVerificationCodes.customerId, customerId),
          sql`${smsVerificationCodes.createdAt} > ${cutoffTime}`
        )
      )
      .orderBy(desc(smsVerificationCodes.createdAt));
    return results;
  }

  async getRecentSMSCodesByIP(ipAddress: string, minutes: number): Promise<SMSVerificationCode[]> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    const results = await db
      .select()
      .from(smsVerificationCodes)
      .where(
        and(
          eq(smsVerificationCodes.ipAddress, ipAddress),
          sql`${smsVerificationCodes.createdAt} > ${cutoffTime}`
        )
      )
      .orderBy(desc(smsVerificationCodes.createdAt));
    return results;
  }

  async markSMSCodeAsUsed(id: number): Promise<void> {
    console.log('Marking SMS code as used:', id);
    await db
      .update(smsVerificationCodes)
      .set({ 
        isUsed: true, 
        usedAt: new Date() 
      })
      .where(eq(smsVerificationCodes.id, id));
  }

  async incrementSMSCodeAttempts(id: number): Promise<void> {
    await db
      .update(smsVerificationCodes)
      .set({ 
        attempts: sql`${smsVerificationCodes.attempts} + 1` 
      })
      .where(eq(smsVerificationCodes.id, id));
  }

  async cleanupExpiredSMSCodes(): Promise<void> {
    const now = new Date();
    await db
      .delete(smsVerificationCodes)
      .where(sql`${smsVerificationCodes.expiresAt} < ${now}`);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const deletedCount = await db.execute(sql`
      DELETE FROM sessions WHERE expire < NOW()
    `);
    console.log(`🧹 Cleaned up ${deletedCount.rowCount || 0} expired sessions`);
  }

  // Customer Address Book operations
  async getAllCustomers(wholesalerId: string): Promise<(User & { 
    groupNames: string[]; 
    totalOrders: number; 
    totalSpent: number; 
    lastOrderDate?: Date;
    groupIds: number[];
  })[]> {
    console.log(`🔒 DATA ISOLATION: Fetching customers for wholesaler ${wholesalerId}`);
    
    // Get customers directly through wholesaler_customer_relationships
    const customerRelationships = await db
      .select({
        user: users,
      })
      .from(wholesalerCustomerRelationships)
      .innerJoin(users, eq(wholesalerCustomerRelationships.customerId, users.id))
      .where(and(
        eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
        eq(wholesalerCustomerRelationships.status, 'active'),
        eq(users.archived, false)
      ));

    // Calculate wholesaler-specific order statistics for each customer
    const customersWithStats = await Promise.all(
      customerRelationships.map(async (row) => {
        const customerId = row.user.id;
        
        // Get order stats specific to this wholesaler (net amount after platform fees)
        const orderStats = await db
          .select({
            totalOrders: count(orders.id),
            totalSpent: sql<number>`COALESCE(SUM(${orders.total} - COALESCE(${orders.platformFee}, 0)), 0)`,
            lastOrderDate: sql<Date>`MAX(${orders.createdAt})`
          })
          .from(orders)
          .where(and(
            eq(orders.retailerId, customerId),
            eq(orders.wholesalerId, wholesalerId)
          ));
        
        // Get customer group information
        const groupMemberships = await db
          .select({
            groupId: customerGroupMembers.groupId,
            groupName: customerGroups.name
          })
          .from(customerGroupMembers)
          .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
          .where(and(
            eq(customerGroupMembers.customerId, customerId),
            eq(customerGroups.wholesalerId, wholesalerId)
          ));

        const stats = orderStats[0] || { totalOrders: 0, totalSpent: 0, lastOrderDate: null };
        
        return {
          ...row.user,
          groupNames: groupMemberships.map(g => g.groupName),
          totalOrders: Number(stats.totalOrders),
          totalSpent: Number(stats.totalSpent),
          lastOrderDate: stats.lastOrderDate,
          groupIds: groupMemberships.map(g => g.groupId)
        };
      })
    );

    return customersWithStats;
  }

  async getCustomerDetails(customerId: string): Promise<(User & { 
    groups: CustomerGroup[];
    orders: Order[];
    totalOrders: number;
    totalSpent: number;
  }) | undefined> {
    // Get customer basic info
    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, customerId));

    if (!customer) return undefined;

    // Get customer groups
    const customerGroups = await db
      .select({
        group: customerGroups
      })
      .from(customerGroupMembers)
      .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
      .where(eq(customerGroupMembers.customerId, customerId));

    // Get customer orders
    const customerOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.retailerId, customerId))
      .orderBy(desc(orders.createdAt));

    // Calculate stats
    const paidOrders = customerOrders.filter(order => 
      ['paid', 'fulfilled', 'completed'].includes(order.status)
    );
    const totalSpent = paidOrders.reduce((sum, order) => sum + parseFloat(order.total || '0'), 0);

    return {
      ...customer,
      groups: customerGroups.map(cg => cg.group),
      orders: customerOrders,
      totalOrders: customerOrders.length,
      totalSpent
    };
  }

  async searchCustomers(wholesalerId: string, searchTerm: string): Promise<User[]> {
    const customers = await db.execute(sql`
      SELECT DISTINCT u.*
      FROM users u
      INNER JOIN customer_group_members cgm ON u.id = cgm.customer_id
      INNER JOIN customer_groups cg ON cgm.group_id = cg.id
      WHERE cg.wholesaler_id = ${wholesalerId}
        AND u.role = 'retailer'
        AND (
          LOWER(u.first_name) LIKE LOWER(${'%' + searchTerm + '%'}) OR
          LOWER(u.last_name) LIKE LOWER(${'%' + searchTerm + '%'}) OR
          LOWER(u.email) LIKE LOWER(${'%' + searchTerm + '%'}) OR
          u.phone_number LIKE ${'%' + searchTerm + '%'}
        )
      ORDER BY u.first_name ASC
    `);

    return customers.rows.map((customer: any) => ({
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phoneNumber: customer.phone_number,
      streetAddress: customer.street_address,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postal_code,
      country: customer.country,
      createdAt: customer.created_at,
      role: customer.role
    }));
  }

  async bulkUpdateCustomers(customerUpdates: { customerId: string; updates: Partial<User> }[]): Promise<void> {
    for (const { customerId, updates } of customerUpdates) {
      await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(users.id, customerId));
    }
  }

  async getCustomerStats(wholesalerId: string): Promise<{
    totalCustomers: number;
    activeCustomers: number;
    newCustomersThisMonth: number;
    topCustomers: { customerId: string; name: string; totalSpent: number }[];
  }> {
    // Get total customers count
    const totalCustomersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      INNER JOIN customer_group_members cgm ON u.id = cgm.customer_id
      INNER JOIN customer_groups cg ON cgm.group_id = cg.id
      WHERE cg.wholesaler_id = ${wholesalerId}
        AND u.role IN ('customer', 'retailer')
    `);

    // Get active customers (those who have placed orders in last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const activeCustomersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT u.id) as active
      FROM users u
      INNER JOIN customer_group_members cgm ON u.id = cgm.customer_id
      INNER JOIN customer_groups cg ON cgm.group_id = cg.id
      INNER JOIN orders o ON u.id = o.retailer_id
      WHERE cg.wholesaler_id = ${wholesalerId}
        AND u.role IN ('customer', 'retailer')
        AND o.created_at >= ${threeMonthsAgo}
    `);

    // Get new customers this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const newCustomersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT u.id) as new_customers
      FROM users u
      INNER JOIN customer_group_members cgm ON u.id = cgm.customer_id
      INNER JOIN customer_groups cg ON cgm.group_id = cg.id
      WHERE cg.wholesaler_id = ${wholesalerId}
        AND u.role IN ('customer', 'retailer')
        AND u.created_at >= ${thisMonth}
    `);

    // Get top customers by spending (using wholesaler earnings: subtotal * 96.7%)
    const topCustomersResult = await db.execute(sql`
      SELECT 
        u.id as customer_id,
        COALESCE(
          NULLIF(TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')), ''), 
          u.first_name, 
          'Customer'
        ) as name,
        COALESCE(SUM(CASE WHEN o.status IN ('paid', 'fulfilled', 'completed') THEN (o.subtotal::numeric * 0.967) ELSE 0 END), 0) as total_spent
      FROM users u
      INNER JOIN customer_group_members cgm ON u.id = cgm.customer_id
      INNER JOIN customer_groups cg ON cgm.group_id = cg.id
      LEFT JOIN orders o ON u.id = o.retailer_id AND o.wholesaler_id = ${wholesalerId}
      WHERE cg.wholesaler_id = ${wholesalerId}
        AND u.role IN ('customer', 'retailer')
      GROUP BY u.id, u.first_name, u.last_name
      HAVING SUM(CASE WHEN o.status IN ('paid', 'fulfilled', 'completed') THEN (o.subtotal::numeric * 0.967) ELSE 0 END) > 0
      ORDER BY total_spent DESC
      LIMIT 5
    `);

    return {
      totalCustomers: parseInt(totalCustomersResult.rows[0]?.total || '0'),
      activeCustomers: parseInt(activeCustomersResult.rows[0]?.active || '0'),
      newCustomersThisMonth: parseInt(newCustomersResult.rows[0]?.new_customers || '0'),
      topCustomers: topCustomersResult.rows.map((customer: any) => ({
        customerId: customer.customer_id,
        name: customer.name,
        totalSpent: parseFloat(customer.total_spent) || 0
      }))
    };
  }

  // Customer Registration Request operations
  async createCustomerRegistrationRequest(request: {
    wholesalerId: string;
    customerPhone: string;
    customerName: string;
    customerEmail?: string;
    businessName?: string;
    requestMessage?: string;
  }) {
    const [newRequest] = await db
      .insert(customerRegistrationRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getCustomerRegistrationRequest(wholesalerId: string, customerPhone: string) {
    const [request] = await db
      .select()
      .from(customerRegistrationRequests)
      .where(
        and(
          eq(customerRegistrationRequests.wholesalerId, wholesalerId),
          eq(customerRegistrationRequests.customerPhone, customerPhone),
          eq(customerRegistrationRequests.status, 'pending')
        )
      )
      .limit(1);
    return request;
  }

  // Allow customers to request access again after rejection
  async getLatestRegistrationRequest(wholesalerId: string, customerPhone: string) {
    const [request] = await db
      .select()
      .from(customerRegistrationRequests)
      .where(
        and(
          eq(customerRegistrationRequests.wholesalerId, wholesalerId),
          eq(customerRegistrationRequests.customerPhone, customerPhone)
        )
      )
      .orderBy(desc(customerRegistrationRequests.requestedAt))
      .limit(1);
    return request;
  }

  async getPendingRegistrationRequests(wholesalerId: string) {
    return await db
      .select()
      .from(customerRegistrationRequests)
      .where(eq(customerRegistrationRequests.wholesalerId, wholesalerId))
      .orderBy(desc(customerRegistrationRequests.requestedAt));
  }

  async updateRegistrationRequestStatus(
    requestId: number, 
    status: 'approved' | 'rejected', 
    respondedBy: string, 
    responseMessage?: string
  ) {
    const [updated] = await db
      .update(customerRegistrationRequests)
      .set({
        status,
        respondedAt: new Date(),
        respondedBy,
        responseMessage,
      })
      .where(eq(customerRegistrationRequests.id, requestId))
      .returning();
    return updated;
  }

  // Customer Profile Update Notification operations
  async createCustomerProfileUpdateNotification(notification: InsertCustomerProfileUpdateNotification): Promise<SelectCustomerProfileUpdateNotification> {
    const [created] = await db
      .insert(customerProfileUpdateNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getCustomerProfileUpdateNotifications(wholesalerId: string, limit = 50): Promise<SelectCustomerProfileUpdateNotification[]> {
    return await db
      .select()
      .from(customerProfileUpdateNotifications)
      .where(eq(customerProfileUpdateNotifications.wholesalerId, wholesalerId))
      .orderBy(desc(customerProfileUpdateNotifications.createdAt))
      .limit(limit);
  }

  async markNotificationAsRead(notificationId: number): Promise<void> {
    await db
      .update(customerProfileUpdateNotifications)
      .set({ readAt: new Date() })
      .where(eq(customerProfileUpdateNotifications.id, notificationId));
  }

  async updateCustomerProfileWithNotifications(customerId: string, updates: Partial<User>, notifyWholesalers = true): Promise<User> {
    // Get current customer data before updating
    const currentCustomer = await this.getUser(customerId);
    if (!currentCustomer) {
      throw new Error('Customer not found');
    }

    // Update the customer profile
    const updatedCustomer = await this.updateUser(customerId, updates);

    if (notifyWholesalers) {
      // Get all wholesalers this customer works with
      const wholesalerIds = await this.getWholesalersForCustomerProfile(customerId);
      
      // Create notifications for each change
      const notifications = [];
      
      if (updates.firstName && updates.firstName !== currentCustomer.firstName) {
        notifications.push({
          customerId,
          updateType: 'name',
          oldValue: `${currentCustomer.firstName} ${currentCustomer.lastName}`,
          newValue: `${updates.firstName} ${updates.lastName || currentCustomer.lastName}`,
          changesApplied: { firstName: updates.firstName }
        });
      }
      
      if (updates.lastName && updates.lastName !== currentCustomer.lastName) {
        notifications.push({
          customerId,
          updateType: 'name', 
          oldValue: `${currentCustomer.firstName} ${currentCustomer.lastName}`,
          newValue: `${updates.firstName || currentCustomer.firstName} ${updates.lastName}`,
          changesApplied: { lastName: updates.lastName }
        });
      }
      
      if (updates.email && updates.email !== currentCustomer.email) {
        notifications.push({
          customerId,
          updateType: 'email',
          oldValue: currentCustomer.email || '',
          newValue: updates.email,
          changesApplied: { email: updates.email }
        });
      }
      
      if (updates.phoneNumber && updates.phoneNumber !== currentCustomer.phoneNumber) {
        notifications.push({
          customerId,
          updateType: 'phone',
          oldValue: currentCustomer.phoneNumber || '',
          newValue: updates.phoneNumber,
          changesApplied: { phoneNumber: updates.phoneNumber }
        });
      }
      
      if (updates.businessName && updates.businessName !== currentCustomer.businessName) {
        notifications.push({
          customerId,
          updateType: 'business_name',
          oldValue: currentCustomer.businessName || '',
          newValue: updates.businessName,
          changesApplied: { businessName: updates.businessName }
        });
      }

      // Create notification records for each wholesaler
      for (const wholesalerId of wholesalerIds) {
        for (const notificationData of notifications) {
          await this.createCustomerProfileUpdateNotification({
            ...notificationData,
            wholesalerId,
            notificationSent: false
          });
        }
      }
    }

    return updatedCustomer;
  }

  async getWholesalersForCustomerProfile(customerId: string): Promise<string[]> {
    const results = await db
      .selectDistinct({ wholesalerId: customerGroups.wholesalerId })
      .from(customerGroupMembers)
      .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
      .where(eq(customerGroupMembers.customerId, customerId));
      
    return results.map(r => r.wholesalerId);
  }

  // Tab permissions for team access control
  async getTabPermissions(wholesalerId: string): Promise<TabPermission[]> {
    try {
      const permissions = await db
        .select()
        .from(tabPermissions)
        .where(eq(tabPermissions.wholesalerId, wholesalerId));
      
      // If no permissions exist, create default ones
      if (permissions.length === 0) {
        await this.createDefaultTabPermissions(wholesalerId);
        return await this.getTabPermissions(wholesalerId);
      }
      
      return permissions;
    } catch (error) {
      console.error("Error getting tab permissions:", error);
      // Return empty array if table doesn't exist yet
      return [];
    }
  }

  async createDefaultTabPermissions(wholesalerId: string): Promise<void> {
    try {
      const defaultPermissions = [
        { tabName: 'account-settings', isRestricted: true, allowedRoles: ['admin'] },
        { tabName: 'business-settings', isRestricted: true, allowedRoles: ['admin'] },
        { tabName: 'notification-settings', isRestricted: false, allowedRoles: ['admin', 'member'] },
        { tabName: 'integration-settings', isRestricted: true, allowedRoles: ['admin'] }
      ];

      for (const permission of defaultPermissions) {
        await db.insert(tabPermissions).values({
          id: crypto.randomUUID(),
          wholesalerId,
          tabName: permission.tabName,
          isRestricted: permission.isRestricted,
          allowedRoles: permission.allowedRoles,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error("Error creating default tab permissions:", error);
    }
  }

  async updateTabPermission(wholesalerId: string, tabName: string, isRestricted: boolean, allowedRoles: string[]): Promise<TabPermission> {
    try {
      const existingPermission = await db
        .select()
        .from(tabPermissions)
        .where(
          and(
            eq(tabPermissions.wholesalerId, wholesalerId),
            eq(tabPermissions.tabName, tabName)
          )
        )
        .limit(1);

      if (existingPermission.length === 0) {
        // Create new permission
        const newPermission = {
          id: crypto.randomUUID(),
          wholesalerId,
          tabName,
          isRestricted,
          allowedRoles,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await db.insert(tabPermissions).values(newPermission);
        return newPermission;
      } else {
        // Update existing permission
        await db
          .update(tabPermissions)
          .set({
            isRestricted,
            allowedRoles,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(tabPermissions.wholesalerId, wholesalerId),
              eq(tabPermissions.tabName, tabName)
            )
          );

        return {
          ...existingPermission[0],
          isRestricted,
          allowedRoles,
          updatedAt: new Date()
        };
      }
    } catch (error) {
      console.error("Error updating tab permission:", error);
      throw error;
    }
  }

  async checkTabAccess(wholesalerId: string, tabName: string, userRole: string): Promise<boolean> {
    try {
      const permission = await db
        .select()
        .from(tabPermissions)
        .where(
          and(
            eq(tabPermissions.wholesalerId, wholesalerId),
            eq(tabPermissions.tabName, tabName)
          )
        )
        .limit(1);

      if (permission.length === 0) {
        // No permission set, default to allow
        return true;
      }

      const tabPermission = permission[0];
      
      // If not restricted, allow access
      if (!tabPermission.isRestricted) {
        return true;
      }

      // Check if user role is in allowed roles
      return tabPermission.allowedRoles.includes(userRole);
    } catch (error) {
      console.error("Error checking tab access:", error);
      // Default to allow access on error
      return true;
    }
  }

  // Real-time inventory monitoring implementations
  async getInventoryStatus(wholesalerId: string): Promise<{
    totalProducts: number;
    inStockProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    totalStockValue: number;
    averageStockLevel: number;
    lastUpdated: Date;
  }> {
    const inventoryData = await db.execute(sql`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock > 0 THEN 1 END) as in_stock_products,
        COUNT(CASE WHEN stock = 0 THEN 1 END) as out_of_stock_products,
        COUNT(CASE WHEN stock > 0 AND stock <= COALESCE(low_stock_threshold, 50) THEN 1 END) as low_stock_products,
        COALESCE(SUM(CASE WHEN stock > 0 THEN stock * price::numeric ELSE 0 END), 0) as total_stock_value,
        COALESCE(AVG(CASE WHEN status = 'active' THEN stock ELSE NULL END), 0) as average_stock_level
      FROM products 
      WHERE wholesaler_id = ${wholesalerId} 
        AND status = 'active'
    `);

    const data = inventoryData.rows[0];

    return {
      totalProducts: parseInt(data.total_products) || 0,
      inStockProducts: parseInt(data.in_stock_products) || 0,
      lowStockProducts: parseInt(data.low_stock_products) || 0,
      outOfStockProducts: parseInt(data.out_of_stock_products) || 0,
      totalStockValue: parseFloat(data.total_stock_value) || 0,
      averageStockLevel: parseFloat(data.average_stock_level) || 0,
      lastUpdated: new Date()
    };
  }

  async getStockAlerts(wholesalerId: string, unreadOnly: boolean = false): Promise<(StockAlert & { product: Product })[]> {
    let query = db
      .select()
      .from(stockAlerts)
      .innerJoin(products, eq(stockAlerts.productId, products.id))
      .where(
        and(
          eq(stockAlerts.wholesalerId, wholesalerId),
          eq(stockAlerts.isResolved, false)
        )
      );

    if (unreadOnly) {
      query = query.where(eq(stockAlerts.isRead, false));
    }

    const results = await query.orderBy(desc(stockAlerts.createdAt));

    return results.map(row => ({
      ...row.stock_alerts,
      product: row.products
    }));
  }

  async getProductStockStatus(productId: number): Promise<{
    productId: number;
    currentStock: number;
    lowStockThreshold: number;
    status: 'in_stock' | 'low_stock' | 'out_of_stock';
    daysUntilOutOfStock?: number;
    reorderSuggested: boolean;
    lastMovement?: {
      type: string;
      quantity: number;
      date: Date;
    };
  }> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId));

    if (!product) {
      throw new Error('Product not found');
    }

    // Get last stock movement
    const [lastMovement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(1);

    const currentStock = product.stock;
    const threshold = product.lowStockThreshold || 50;

    let status: 'in_stock' | 'low_stock' | 'out_of_stock';
    if (currentStock === 0) {
      status = 'out_of_stock';
    } else if (currentStock <= threshold) {
      status = 'low_stock';
    } else {
      status = 'in_stock';
    }

    // Calculate days until out of stock based on recent sales velocity
    let daysUntilOutOfStock: number | undefined;
    if (currentStock > 0) {
      // Get sales from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const salesData = await db.execute(sql`
        SELECT COALESCE(SUM(oi.quantity), 0) as total_sold
        FROM order_items oi
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE oi.product_id = ${productId}
          AND o.created_at >= ${thirtyDaysAgo}
          AND o.status IN ('paid', 'processing', 'shipped', 'fulfilled', 'completed')
      `);

      const totalSold = parseInt(salesData.rows[0]?.total_sold) || 0;
      const dailyVelocity = totalSold / 30;
      
      if (dailyVelocity > 0) {
        daysUntilOutOfStock = Math.floor(currentStock / dailyVelocity);
      }
    }

    return {
      productId,
      currentStock,
      lowStockThreshold: threshold,
      status,
      daysUntilOutOfStock,
      reorderSuggested: status === 'low_stock' || status === 'out_of_stock' || (daysUntilOutOfStock !== undefined && daysUntilOutOfStock <= 7),
      lastMovement: lastMovement ? {
        type: lastMovement.movementType,
        quantity: lastMovement.quantity,
        date: lastMovement.createdAt
      } : undefined
    };
  }

  // Delivery address operations (temporary in-memory storage due to database size limits)
  async getDeliveryAddresses(customerId: string, wholesalerId: string): Promise<DeliveryAddress[]> {
    const addresses = await db
      .select()
      .from(deliveryAddresses)
      .where(and(
        eq(deliveryAddresses.customerId, customerId),
        eq(deliveryAddresses.wholesalerId, wholesalerId)
      ))
      .orderBy(desc(deliveryAddresses.isDefault), desc(deliveryAddresses.createdAt));
    
    console.log(`📍 Retrieved ${addresses.length} delivery addresses for customer ${customerId}`);
    return addresses;
  }

  async getDeliveryAddress(id: number): Promise<DeliveryAddress | undefined> {
    const [address] = await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.id, id));
    
    return address;
  }

  async createDeliveryAddress(address: InsertDeliveryAddress): Promise<DeliveryAddress> {
    // If this is being set as default, unset all others first
    if (address.isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(and(
          eq(deliveryAddresses.customerId, address.customerId),
          eq(deliveryAddresses.wholesalerId, address.wholesalerId)
        ));
    }
    
    const [newAddress] = await db
      .insert(deliveryAddresses)
      .values({
        customerId: address.customerId,
        wholesalerId: address.wholesalerId,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || null,
        city: address.city,
        state: address.state || null,
        postalCode: address.postalCode,
        country: address.country,
        label: address.label || null,
        instructions: address.instructions || null,
        isDefault: address.isDefault || false
      })
      .returning();
    
    console.log(`📍 Created delivery address ${newAddress.id} for customer ${address.customerId}`);
    return newAddress;
  }

  async updateDeliveryAddress(id: number, updates: Partial<InsertDeliveryAddress>): Promise<DeliveryAddress> {
    // Get the address to find customer and wholesaler IDs
    const existingAddress = await this.getDeliveryAddress(id);
    if (!existingAddress) {
      throw new Error(`Address with id ${id} not found`);
    }
    
    // If setting as default, unset all others in this customer/wholesaler group
    if (updates.isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(and(
          eq(deliveryAddresses.customerId, existingAddress.customerId),
          eq(deliveryAddresses.wholesalerId, existingAddress.wholesalerId)
        ));
    }
    
    const [updatedAddress] = await db
      .update(deliveryAddresses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deliveryAddresses.id, id))
      .returning();
    
    return updatedAddress;
  }

  async deleteDeliveryAddress(id: number): Promise<void> {
    const result = await db
      .delete(deliveryAddresses)
      .where(eq(deliveryAddresses.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Address with id ${id} not found`);
    }
    
    console.log(`🗑️ Deleted delivery address ${id}`);
  }

  async setDefaultDeliveryAddress(customerId: string, wholesalerId: string, addressId: number): Promise<void> {
    // First, unset all defaults for this customer/wholesaler
    await db
      .update(deliveryAddresses)
      .set({ isDefault: false })
      .where(and(
        eq(deliveryAddresses.customerId, customerId),
        eq(deliveryAddresses.wholesalerId, wholesalerId)
      ));
    
    // Then set the specified one as default (if addressId is not -1)
    if (addressId !== -1) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(deliveryAddresses.id, addressId));
    }
    
    console.log(`🎯 Set address ${addressId} as default for customer ${customerId}`);
  }

  async getDefaultDeliveryAddress(customerId: string, wholesalerId: string): Promise<DeliveryAddress | undefined> {
    const [address] = await db
      .select()
      .from(deliveryAddresses)
      .where(and(
        eq(deliveryAddresses.customerId, customerId),
        eq(deliveryAddresses.wholesalerId, wholesalerId),
        eq(deliveryAddresses.isDefault, true)
      ));
    
    return address;
  }

}

export const storage = new DatabaseStorage();
