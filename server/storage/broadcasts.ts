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
  businessProfiles,
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
import { eq, desc, and, sql, sum, count, or, ilike, isNull, inArray, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../passwordUtils";
import { InventoryCalculator } from "../../shared/inventory-calculator.js";

import { CustomerStorage } from './customers';

export class BroadcastStorage extends CustomerStorage {
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
    const [newBroadcast] = await db.insert(broadcasts).values(broadcast as typeof broadcasts.$inferInsert).returning();
    return newBroadcast;
  }

  async updateBroadcast(id: number, updates: Partial<InsertBroadcast>): Promise<Broadcast> {
    const [updatedBroadcast] = await db
      .update(broadcasts)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof broadcasts.$inferInsert>)
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
      
      await db.insert(templateProducts).values(templateProductsData as (typeof templateProducts.$inferInsert)[]);
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
    const [newTemplateProduct] = await db.insert(templateProducts).values(templateProduct as typeof templateProducts.$inferInsert).returning();
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

  async getStockMovements(productId: number): Promise<(StockMovement & { orderNumber?: string | null; businessProfileName?: string | null })[]> {
    const result = await db
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
        businessProfileId: stockMovements.businessProfileId,
        createdAt: stockMovements.createdAt,
        orderNumber: orders.orderNumber,
        businessProfileName: businessProfiles.name,
      })
      .from(stockMovements)
      .leftJoin(orders, eq(stockMovements.orderId, orders.id))
      .leftJoin(businessProfiles, eq(stockMovements.businessProfileId, businessProfiles.id))
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.createdAt));

    return result as (StockMovement & { orderNumber?: string | null; businessProfileName?: string | null })[];
  }

  async getStockMovementsByWholesaler(wholesalerId: string, limit = 50): Promise<(StockMovement & { product: Product })[]> {
    const result = await db
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

    return result as (StockMovement & { product: Product })[];
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
        inviteToken: crypto.randomUUID(),
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
      .from(products)
      .where(
        and(
          eq(products.wholesalerId, wholesalerId),
          eq(products.status, 'active'),
          sql`${products.stock} <= COALESCE(${products.lowStockThreshold}, 50)`
        )
      );
    return result[0]?.count || 0;
  }

  async syncStockAlerts(wholesalerId: string): Promise<void> {
    const lowStockProducts = await db
      .select({ product: products })
      .from(products)
      .leftJoin(
        stockAlerts,
        and(
          eq(stockAlerts.productId, products.id),
          or(
            eq(stockAlerts.isResolved, false),
            sql`${stockAlerts.createdAt} > NOW() - INTERVAL '24 hours'`
          )
        )
      )
      .where(
        and(
          eq(products.wholesalerId, wholesalerId),
          eq(products.status, 'active'),
          sql`${products.stock} <= COALESCE(${products.lowStockThreshold}, 50)`,
          isNull(stockAlerts.id)
        )
      );

    for (const { product } of lowStockProducts) {
      await db.insert(stockAlerts).values({
        productId: product.id,
        wholesalerId,
        alertType: product.stock === 0 ? 'out_of_stock' : 'low_stock',
        currentStock: product.stock,
        threshold: product.lowStockThreshold || 50,
        isRead: false,
        isResolved: false,
        notificationSent: false,
      });
    }
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

  async autoResolveStockAlertsIfRestocked(productId: number, newStock: number): Promise<number> {
    const [product] = await db
      .select({ lowStockThreshold: products.lowStockThreshold, moq: products.moq, wholesalerId: products.wholesalerId })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) return 0;
    const threshold = Math.max(product.lowStockThreshold || 50, product.moq || 1);
    if (newStock <= threshold) return 0;
    const openAlerts = await db
      .select({ id: stockAlerts.id })
      .from(stockAlerts)
      .where(and(
        eq(stockAlerts.productId, productId),
        eq(stockAlerts.wholesalerId, product.wholesalerId),
        eq(stockAlerts.isResolved, false)
      ));
    if (openAlerts.length === 0) return 0;
    await db
      .update(stockAlerts)
      .set({ isResolved: true, resolvedAt: new Date() })
      .where(and(
        eq(stockAlerts.productId, productId),
        eq(stockAlerts.wholesalerId, product.wholesalerId),
        eq(stockAlerts.isResolved, false)
      ));
    return openAlerts.length;
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

    await db
      .update(products)
      .set({ lowStockThreshold: threshold })
      .where(eq(products.wholesalerId, userId));
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
    const updates: any = { status, updatedAt: new Date() };
    if (status === 'active') {
      const [existing] = await db.select({ joinedAt: teamMembers.joinedAt })
        .from(teamMembers)
        .where(eq(teamMembers.id, id))
        .limit(1);
      if (!existing?.joinedAt) {
        updates.joinedAt = new Date();
      }
    }
    const [member] = await db.update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async updateTeamMemberLastLogin(id: number): Promise<void> {
    await db.update(teamMembers)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(teamMembers.id, id));
  }

  async updateTeamMemberLastSeen(id: number): Promise<void> {
    await db.update(teamMembers)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(teamMembers.id, id));
  }

  async getTeamMemberByEmail(wholesalerId: string, email: string): Promise<TeamMember | undefined> {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.wholesalerId, wholesalerId), eq(teamMembers.email, email)))
      .limit(1);
    return member;
  }

  async getTeamMemberCount(wholesalerId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(teamMembers)
      .where(eq(teamMembers.wholesalerId, wholesalerId));
    return result[0].count;
  }



}
