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
import { eq, desc, and, sql, sum, count, or, ilike, isNull, inArray, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { InventoryCalculator } from "../shared/inventory-calculator.js";
import { DeliveryStorage } from './storage/delivery';

export interface IStorage {
  // User operations (required for auth)
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined>;
  getUserByEmail(email: string, role?: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getAllUsersByEmail(email: string): Promise<User[]>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  getAllWholesalers(): Promise<{ id: string; businessName: string; email: string; logoType: string; logoUrl: string; firstName: string; lastName: string }[]>;
  createUser(user: Partial<UpsertUser>): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserSettings(id: string, settings: Partial<UpsertUser>): Promise<User>;
  updateUserOnboarding(id: string, onboardingData: { onboardingStep?: number; onboardingCompleted?: boolean; onboardingSkipped?: boolean }): Promise<User>;
  
  // Password authentication methods
  createUserWithPassword(userData: Partial<UpsertUser>, password: string, onProgress?: (step: string) => void): Promise<User>;
  authenticateUser(email: string, password: string): Promise<User | null>;
  updateUserPassword(id: string, newPassword: string): Promise<User>;
  
  // Password reset methods
  setPasswordResetToken(email: string, token: string, expiresAt: Date): Promise<User | null>;
  validatePasswordResetToken(token: string): Promise<User | null>;
  resetPasswordWithToken(token: string, newPassword: string): Promise<User | null>;
  
  // Product operations
  getProducts(wholesalerId?: string): Promise<Product[]>;
  getExpiringProducts(wholesalerId: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;

  // Batch inventory operations
  getProductBatches(productId: number, activeOnly?: boolean /* default: true */): Promise<ProductBatch[]>;
  createProductBatch(batch: InsertProductBatch): Promise<ProductBatch>;
  updateProductBatch(batchId: number, updates: Partial<InsertProductBatch>, wholesalerId?: string): Promise<ProductBatch>;
  adjustBatchQuantity(batchId: number, delta: number, reason: string, wholesalerId: string, orderId?: number): Promise<void>;
  getProductTotalStock(productId: number): Promise<number>;
  expireOldBatches(): Promise<number>;
  
  // Order operations
  getOrders(wholesalerId?: string, retailerId?: string, searchTerm?: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]>;
  getOrder(id: number): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User }) | undefined>;
  getOrdersForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<Order[]>;
  getOrdersByCustomerPhone(phoneNumber: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; retailer: User; wholesaler: User })[]>;
  getLastOrderForWholesaler(wholesalerId: string): Promise<Order | undefined>;
  getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined>;
  getStripeOrdersForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<Order[]>;
  getOrderByTransferId(transferId: string): Promise<Order | undefined>;
  getOrderByNetAmountForWholesaler(wholesalerId: string, netAmountPounds: number, aroundTimestampSeconds: number): Promise<Order | undefined>;
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
    shippingTotal?: string;
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
  createCustomer(customer: { phoneNumber: string; firstName: string; lastName?: string; role: string; email?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string; country?: string; wholesalerId?: string; customerType?: string }): Promise<User>;
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
  deleteCustomer(customerId: string, wholesalerId?: string): Promise<{ success: boolean; archived?: boolean; message: string }>;
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
  getCustomerDetails(customerId: string, wholesalerId: string): Promise<(User & { 
    groups: CustomerGroup[];
    orders: Order[];
    totalOrders: number;
    totalSpent: number;
    totalUnpaid: number;
    displayName?: string | null;
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
  
  // Phone OTP operations (new login flow — no wholesaler required upfront)
  createPhoneVerification(phoneNumber: string, code: string, expiresAt: Date, ipAddress?: string): Promise<void>;
  getLatestPendingPhoneVerification(phoneNumber: string): Promise<{ id: number; code: string; expiresAt: Date; isUsed: boolean; attempts: number } | undefined>;
  markPhoneVerificationUsed(id: number): Promise<void>;
  incrementPhoneVerificationAttempts(id: number): Promise<void>;
  getRecentPhoneVerification(phoneNumber: string, minutes: number): Promise<{ id: number } | undefined>;
  findRecentlyUsedPhoneVerification(phoneNumber: string, withinMinutes: number): Promise<{ id: number; usedAt: Date | null } | undefined>;
  findCustomersByPhone(phoneNumber: string): Promise<Array<{ customerId: string | null; wholesalerId: string; businessName: string; logoUrl: string | null; logoType: string | null; status: 'active' | 'pending' | 'rejected' }>>;

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
  syncStockAlerts(wholesalerId: string): Promise<void>;
  markStockAlertAsRead(alertId: number, wholesalerId: string): Promise<void>;
  resolveStockAlert(alertId: number, wholesalerId: string): Promise<void>;
  autoResolveStockAlertsIfRestocked(productId: number, newStock: number): Promise<number>;
  updateProductLowStockThreshold(productId: number, wholesalerId: string, threshold: number): Promise<void>;
  updateDefaultLowStockThreshold(userId: string, threshold: number): Promise<void>;
  getAllRegistrationRequests(wholesalerId: string): Promise<any[]>;
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
  updateTeamMemberStatus(id: number, status: string): Promise<TeamMember>;
  updateTeamMemberLastLogin(id: number): Promise<void>;
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
  
  
  // Customer profile update notification operations
  createCustomerProfileUpdateNotification(notification: InsertCustomerProfileUpdateNotification): Promise<SelectCustomerProfileUpdateNotification>;
  getCustomerProfileUpdateNotifications(wholesalerId: string, limit?: number): Promise<SelectCustomerProfileUpdateNotification[]>;
  markNotificationAsRead(notificationId: number): Promise<void>;
  updateCustomerProfileWithNotifications(customerId: string, updates: Partial<User>, notifyWholesalers?: boolean): Promise<User>;
  getWholesalersForCustomerProfile(customerId: string): Promise<string[]>;
  
  // Delivery address operations
  isCustomerOfWholesaler(customerId: string, wholesalerId: string): Promise<boolean>;
  getDeliveryAddresses(customerId: string): Promise<DeliveryAddress[]>;
  getDeliveryAddress(id: number): Promise<DeliveryAddress | undefined>;
  getDeliveryAddressById(id: number): Promise<DeliveryAddress | undefined>;
  getDeliveryAddressForCustomer(id: number, customerId: string): Promise<DeliveryAddress | undefined>;
  createDeliveryAddress(address: InsertDeliveryAddress): Promise<DeliveryAddress>;
  updateDeliveryAddress(id: number, updates: Partial<InsertDeliveryAddress>): Promise<DeliveryAddress>;
  deleteDeliveryAddress(id: number): Promise<void>;
  setDefaultDeliveryAddress(customerId: string, addressId: number): Promise<void>;
  getDefaultDeliveryAddress(customerId: string): Promise<DeliveryAddress | undefined>;
}

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

export class DatabaseStorage extends DeliveryStorage implements IStorage {
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


  // SMS verification operations
  // ─── Phone OTP methods (new login flow) ────────────────────────────────────

  async createPhoneVerification(phoneNumber: string, code: string, expiresAt: Date, ipAddress?: string): Promise<void> {
    await db.insert(customerPhoneVerifications).values({ phoneNumber, code, expiresAt, ipAddress });
  }

  async getLatestPendingPhoneVerification(phoneNumber: string): Promise<{ id: number; code: string; expiresAt: Date; isUsed: boolean; attempts: number } | undefined> {
    const [row] = await db
      .select({
        id: customerPhoneVerifications.id,
        code: customerPhoneVerifications.code,
        expiresAt: customerPhoneVerifications.expiresAt,
        isUsed: customerPhoneVerifications.isUsed,
        attempts: customerPhoneVerifications.attempts,
      })
      .from(customerPhoneVerifications)
      .where(eq(customerPhoneVerifications.phoneNumber, phoneNumber))
      .orderBy(desc(customerPhoneVerifications.createdAt))
      .limit(1);
    return row;
  }

  async markPhoneVerificationUsed(id: number): Promise<void> {
    await db.update(customerPhoneVerifications).set({ isUsed: true, usedAt: new Date() }).where(eq(customerPhoneVerifications.id, id));
  }

  async incrementPhoneVerificationAttempts(id: number): Promise<void> {
    await db.update(customerPhoneVerifications).set({ attempts: sql`${customerPhoneVerifications.attempts} + 1` }).where(eq(customerPhoneVerifications.id, id));
  }

  async findRecentlyUsedPhoneVerification(phoneNumber: string, withinMinutes: number): Promise<{ id: number; usedAt: Date | null } | undefined> {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
    const [row] = await db
      .select({ id: customerPhoneVerifications.id, usedAt: customerPhoneVerifications.usedAt })
      .from(customerPhoneVerifications)
      .where(and(
        eq(customerPhoneVerifications.phoneNumber, phoneNumber),
        eq(customerPhoneVerifications.isUsed, true),
        gt(customerPhoneVerifications.usedAt, cutoff)
      ))
      .orderBy(desc(customerPhoneVerifications.usedAt))
      .limit(1);
    return row;
  }

  async getRecentPhoneVerification(phoneNumber: string, minutes: number): Promise<{ id: number } | undefined> {
    // Throttle by createdAt regardless of isUsed — prevents rapid re-request
    // after a successful OTP as well as unused ones.
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const [row] = await db
      .select({ id: customerPhoneVerifications.id })
      .from(customerPhoneVerifications)
      .where(and(
        eq(customerPhoneVerifications.phoneNumber, phoneNumber),
        gt(customerPhoneVerifications.createdAt, cutoff)
      ))
      .orderBy(desc(customerPhoneVerifications.createdAt))
      .limit(1);
    return row;
  }

  async findCustomersByPhone(phoneNumber: string): Promise<Array<{ customerId: string | null; wholesalerId: string; businessName: string; logoUrl: string | null; logoType: string | null; status: 'active' | 'pending' | 'rejected' }>> {
    // Normalise: strip spaces, ensure +44 prefix for UK numbers
    const normalised = phoneNumber.startsWith('+') ? phoneNumber.replace(/\s/g, '') : phoneNumber.replace(/\s/g, '');
    const ukLocal   = normalised.replace(/^\+44/, '0');
    const ukE164    = normalised.startsWith('0') ? '+44' + normalised.slice(1) : normalised;

    // Active relationships
    const activeRows = await db.execute(sql`
      SELECT DISTINCT
        wcr.customer_id   AS customer_id,
        wcr.wholesaler_id AS wholesaler_id,
        COALESCE(w.business_name, w.first_name || ' ' || COALESCE(w.last_name, '')) AS business_name,
        w.logo_url   AS logo_url,
        w.logo_type  AS logo_type
      FROM wholesaler_customer_relationships wcr
      INNER JOIN users u  ON u.id  = wcr.customer_id
      INNER JOIN users w  ON w.id  = wcr.wholesaler_id
      WHERE wcr.status = 'active'
        AND (
          REGEXP_REPLACE(COALESCE(u.phone_number, ''), '[^0-9+]', '', 'g') = ${normalised}
          OR REGEXP_REPLACE(COALESCE(u.phone_number, ''), '[^0-9+]', '', 'g') = ${ukLocal}
          OR REGEXP_REPLACE(COALESCE(u.phone_number, ''), '[^0-9+]', '', 'g') = ${ukE164}
        )
      ORDER BY business_name
    `);

    // Pending registration requests (no relationship yet — customer may not have a user record)
    const pendingRows = await db.execute(sql`
      SELECT DISTINCT
        crr.wholesaler_id AS wholesaler_id,
        COALESCE(w.business_name, w.first_name || ' ' || COALESCE(w.last_name, '')) AS business_name,
        w.logo_url   AS logo_url,
        w.logo_type  AS logo_type
      FROM customer_registration_requests crr
      INNER JOIN users w ON w.id = crr.wholesaler_id
      WHERE crr.status = 'pending'
        AND (
          REGEXP_REPLACE(crr.customer_phone, '[^0-9+]', '', 'g') = ${normalised}
          OR REGEXP_REPLACE(crr.customer_phone, '[^0-9+]', '', 'g') = ${ukLocal}
          OR REGEXP_REPLACE(crr.customer_phone, '[^0-9+]', '', 'g') = ${ukE164}
        )
      ORDER BY business_name
    `);

    // Rejected registration requests
    const rejectedRows = await db.execute(sql`
      SELECT DISTINCT
        crr.wholesaler_id AS wholesaler_id,
        COALESCE(w.business_name, w.first_name || ' ' || COALESCE(w.last_name, '')) AS business_name,
        w.logo_url   AS logo_url,
        w.logo_type  AS logo_type
      FROM customer_registration_requests crr
      INNER JOIN users w ON w.id = crr.wholesaler_id
      WHERE crr.status = 'rejected'
        AND (
          REGEXP_REPLACE(crr.customer_phone, '[^0-9+]', '', 'g') = ${normalised}
          OR REGEXP_REPLACE(crr.customer_phone, '[^0-9+]', '', 'g') = ${ukLocal}
          OR REGEXP_REPLACE(crr.customer_phone, '[^0-9+]', '', 'g') = ${ukE164}
        )
      ORDER BY business_name
    `);

    const activeWholesalerIds = new Set((activeRows.rows as any[]).map(r => r.wholesaler_id));

    const active = (activeRows.rows as any[]).map(r => ({
      customerId: r.customer_id as string,
      wholesalerId: r.wholesaler_id as string,
      businessName: (r.business_name || 'Wholesaler') as string,
      logoUrl: r.logo_url as string | null,
      logoType: r.logo_type as string | null,
      status: 'active' as const,
    }));

    // Only include pending requests for wholesalers the customer doesn't already have active access to
    const pending = (pendingRows.rows as any[])
      .filter(r => !activeWholesalerIds.has(r.wholesaler_id))
      .map(r => ({
        customerId: null,
        wholesalerId: r.wholesaler_id as string,
        businessName: (r.business_name || 'Wholesaler') as string,
        logoUrl: r.logo_url as string | null,
        logoType: r.logo_type as string | null,
        status: 'pending' as const,
      }));

    // Pending takes precedence over rejected — exclude rejected for any wholesaler already represented
    const pendingWholesalerIds = new Set(pending.map(r => r.wholesalerId));
    const rejected = (rejectedRows.rows as any[])
      .filter(r => !activeWholesalerIds.has(r.wholesaler_id) && !pendingWholesalerIds.has(r.wholesaler_id))
      .map(r => ({
        customerId: null,
        wholesalerId: r.wholesaler_id as string,
        businessName: (r.business_name || 'Wholesaler') as string,
        logoUrl: r.logo_url as string | null,
        logoType: r.logo_type as string | null,
        status: 'rejected' as const,
      }));

    return [...active, ...pending, ...rejected];
  }

  // ─── End Phone OTP methods ──────────────────────────────────────────────────

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
        // Create new permission — omit id so the serial column auto-generates it
        await db.insert(tabPermissions).values({
          wholesalerId,
          tabName,
          isRestricted,
          allowedRoles,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Fetch the newly created row to return the full typed object
        const inserted = await db
          .select()
          .from(tabPermissions)
          .where(
            and(
              eq(tabPermissions.wholesalerId, wholesalerId),
              eq(tabPermissions.tabName, tabName)
            )
          )
          .limit(1);
        return inserted[0];
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
        // No permission set, default to deny (restricted)
        return false;
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

}

export const storage = new DatabaseStorage();
