import { computeDetailTotalSpent } from "../utils/customer-spend";
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
import { formatPhoneToInternational } from "../../shared/phone-utils";
import { InventoryCalculator } from "../../shared/inventory-calculator.js";

import { BroadcastStorage } from './broadcasts';

export class CustomerMgmtStorage extends BroadcastStorage {
  async getAllCustomers(wholesalerId: string): Promise<(User & { 
    groupNames: string[]; 
    totalOrders: number; 
    totalSpent: number; 
    totalUnpaid: number;
    lastOrderDate?: Date;
    groupIds: number[];
  })[]> {
    // Step 1: Get all active customers for this wholesaler in one query
    const customerRelationships = await db
      .select({
        user: users,
        displayName: wholesalerCustomerRelationships.displayName,
      })
      .from(wholesalerCustomerRelationships)
      .innerJoin(users, eq(wholesalerCustomerRelationships.customerId, users.id))
      .where(and(
        eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
        eq(wholesalerCustomerRelationships.status, 'active'),
        eq(users.archived, false),
        eq(users.isTestAccount, false)
      ));

    if (customerRelationships.length === 0) return [];

    const customerIds = customerRelationships.map(r => r.user.id);

    // Step 2: Bulk-fetch order stats for ALL customers in a single GROUP BY query
    const allOrderStats = await db
      .select({
        customerId: orders.retailerId,
        totalOrders: sql<number>`COUNT(CASE WHEN ${orders.status} NOT IN ('cancelled', 'draft') THEN 1 END)`,
        totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'paid' AND ${orders.status} NOT IN ('cancelled', 'draft') THEN (COALESCE(${orders.subtotal}::numeric, ${orders.total}::numeric) - COALESCE(${orders.platformFee}::numeric, 0) - COALESCE(${orders.amountRefunded}::numeric, 0)) ELSE 0 END), 0)`,
        totalInvoiced: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} NOT IN ('cancelled', 'draft') THEN (COALESCE(${orders.subtotal}::numeric, ${orders.total}::numeric) - COALESCE(${orders.platformFee}::numeric, 0)) ELSE 0 END), 0)`,
        totalUnpaid: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} NOT IN ('cancelled', 'draft') AND (${orders.paymentStatus} IS NULL OR ${orders.paymentStatus} IN ('unpaid', 'part_paid')) THEN (CASE WHEN ${orders.paymentStatus} = 'part_paid' THEN COALESCE(${orders.amountOutstanding}::numeric, 0) ELSE (COALESCE(${orders.subtotal}::numeric, ${orders.total}::numeric) - COALESCE(${orders.platformFee}::numeric, 0)) END) ELSE 0 END), 0)`,
        lastOrderDate: sql<Date>`MAX(${orders.createdAt})`
      })
      .from(orders)
      .where(and(
        inArray(orders.retailerId, customerIds),
        eq(orders.wholesalerId, wholesalerId)
      ))
      .groupBy(orders.retailerId);

    // Step 3: Bulk-fetch group memberships for ALL customers in a single JOIN query
    const allGroupMemberships = await db
      .select({
        customerId: customerGroupMembers.customerId,
        groupId: customerGroupMembers.groupId,
        groupName: customerGroups.name
      })
      .from(customerGroupMembers)
      .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
      .where(and(
        inArray(customerGroupMembers.customerId, customerIds),
        eq(customerGroups.wholesalerId, wholesalerId)
      ));

    // Step 4: Build lookup maps and join in JS (no more per-customer queries)
    const statsMap = new Map(allOrderStats.map(s => [s.customerId, s]));
    const groupMap = new Map<string, { groupId: number; groupName: string }[]>();
    for (const gm of allGroupMemberships) {
      if (!groupMap.has(gm.customerId)) groupMap.set(gm.customerId, []);
      groupMap.get(gm.customerId)!.push({ groupId: gm.groupId, groupName: gm.groupName });
    }

    return (customerRelationships.map(row => {
      const stats = statsMap.get(row.user.id);
      const groups = groupMap.get(row.user.id) || [];

      // Prefer the per-wholesaler displayName over the shared global name
      let firstName = row.user.firstName;
      let lastName = row.user.lastName;
      if (row.displayName) {
        const parts = row.displayName.trim().split(/\s+/);
        firstName = parts[0] || firstName;
        lastName = parts.slice(1).join(' ') || null;
      }

      return {
        ...row.user,
        firstName,
        lastName,
        groupNames: groups.map(g => g.groupName),
        totalOrders: Number(stats?.totalOrders ?? 0),
        totalSpent: Number(stats?.totalSpent ?? 0),
        totalInvoiced: Number(stats?.totalInvoiced ?? 0),
        totalUnpaid: Number(stats?.totalUnpaid ?? 0),
        lastOrderDate: (stats?.lastOrderDate as Date | null) ?? null,
        groupIds: groups.map(g => g.groupId)
      };
    })) as unknown as (User & { groupNames: string[]; totalOrders: number; totalSpent: number; totalUnpaid: number; lastOrderDate?: Date; groupIds: number[] })[];
  }

  async getCustomerDetails(customerId: string, wholesalerId: string): Promise<(User & { 
    groups: CustomerGroup[];
    orders: Order[];
    totalOrders: number;
    totalSpent: number;
    totalUnpaid: number;
    displayName?: string | null;
  }) | undefined> {
    // Verify this wholesaler has a relationship with the customer
    const [relationship] = await db
      .select()
      .from(wholesalerCustomerRelationships)
      .where(and(
        eq(wholesalerCustomerRelationships.customerId, customerId),
        eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
      ));

    if (!relationship) return undefined;

    // Get customer basic info
    const [customer] = await db
      .select()
      .from(users)
      .where(eq(users.id, customerId));

    if (!customer) return undefined;

    // Get customer groups scoped to this wholesaler only
    const scopedGroups = await db
      .select({
        group: customerGroups
      })
      .from(customerGroupMembers)
      .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
      .where(and(
        eq(customerGroupMembers.customerId, customerId),
        eq(customerGroups.wholesalerId, wholesalerId)
      ));

    // Get customer orders scoped to this wholesaler only
    const customerOrders = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.retailerId, customerId),
        eq(orders.wholesalerId, wholesalerId)
      ))
      .orderBy(desc(orders.createdAt));

    // Calculate stats (net amount: subtotal - platform fee - amountRefunded)
    // Exclude draft and cancelled orders so they don't inflate lifetime stats.
    // computeDetailTotalSpent mirrors the bulk SQL formula in getCustomers() so
    // both the single-detail and list views stay in sync.
    const totalSpent = computeDetailTotalSpent(customerOrders);

    const unpaidOrders = customerOrders.filter(order =>
      (!order.paymentStatus || order.paymentStatus === 'unpaid' || order.paymentStatus === 'part_paid') && order.status !== 'cancelled' && order.status !== 'draft'
    );
    const totalUnpaid = unpaidOrders.reduce((sum, order) => {
      if (order.paymentStatus === 'part_paid') {
        return sum + parseFloat(order.amountOutstanding || '0');
      }
      const subtotal = parseFloat(order.subtotal || order.total || '0');
      const platformFee = parseFloat(order.platformFee || '0');
      return sum + (subtotal - platformFee);
    }, 0);

    return {
      ...customer,
      displayName: relationship.displayName ?? null,
      groups: scopedGroups.map(cg => cg.group),
      orders: customerOrders,
      totalOrders: customerOrders.filter(o => o.status !== 'cancelled' && o.status !== 'draft').length,
      totalSpent,
      totalUnpaid
    };
  }

  async searchCustomers(wholesalerId: string, searchTerm: string): Promise<User[]> {
    const term = '%' + searchTerm.toLowerCase() + '%';
    const customers = await db.execute(sql`
      SELECT DISTINCT u.*
      FROM users u
      INNER JOIN wholesaler_customer_relationships wcr ON u.id = wcr.customer_id
      WHERE wcr.wholesaler_id = ${wholesalerId}
        AND wcr.status = 'active'
        AND u.archived = false
        AND u.is_test_account = false
        AND u.role = 'retailer'
        AND (
          LOWER(u.first_name) LIKE ${term} OR
          LOWER(u.last_name) LIKE ${term} OR
          LOWER(COALESCE(u.email, '')) LIKE ${term} OR
          COALESCE(u.phone_number, '') LIKE ${'%' + searchTerm + '%'}
        )
      ORDER BY u.first_name ASC
    `);

    return (customers.rows as any[]).map((customer: any) => ({
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
      role: customer.role,
      totalSpent: 0,
      totalOrders: 0,
      groupNames: [],
      groupIds: [],
      // missing properties for User type
      wholesalerId: null,
      profileImageUrl: null,
      googleId: null,
      customFeePercentage: null,
      updatedAt: null,
    })) as unknown as User[];
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
        AND u.is_test_account = false
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
        AND u.is_test_account = false
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
        AND u.is_test_account = false
        AND u.created_at >= ${thisMonth}
    `);

    // Get top customers by spending (net amount after actual platform fee deduction)
    const topCustomersResult = await db.execute(sql`
      SELECT 
        u.id as customer_id,
        COALESCE(
          NULLIF(TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')), ''), 
          u.first_name, 
          'Customer'
        ) as name,
        COALESCE(SUM(CASE WHEN o.status IN ('paid', 'fulfilled', 'completed') THEN (COALESCE(o.subtotal::numeric, o.total::numeric) - COALESCE(o.platform_fee::numeric, 0)) ELSE 0 END), 0) as total_spent
      FROM users u
      INNER JOIN customer_group_members cgm ON u.id = cgm.customer_id
      INNER JOIN customer_groups cg ON cgm.group_id = cg.id
      LEFT JOIN orders o ON u.id = o.retailer_id AND o.wholesaler_id = ${wholesalerId}
      WHERE cg.wholesaler_id = ${wholesalerId}
        AND u.role IN ('customer', 'retailer')
        AND u.is_test_account = false
      GROUP BY u.id, u.first_name, u.last_name
      HAVING SUM(CASE WHEN o.status IN ('paid', 'fulfilled', 'completed') THEN (COALESCE(o.subtotal::numeric, o.total::numeric) - COALESCE(o.platform_fee::numeric, 0)) ELSE 0 END) > 0
      ORDER BY total_spent DESC
      LIMIT 5
    `);

    return {
      totalCustomers: parseInt(((totalCustomersResult.rows[0] as Record<string,unknown>)?.total as string) || '0'),
      activeCustomers: parseInt(((activeCustomersResult.rows[0] as Record<string,unknown>)?.active as string) || '0'),
      newCustomersThisMonth: parseInt(((newCustomersResult.rows[0] as Record<string,unknown>)?.new_customers as string) || '0'),
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
    customerType?: string | null;
    businessType?: string | null;
    requestMessage?: string;
    productsInterested?: string | null;
    orderFrequency?: string | null;
  }) {
    try {
      const [newRequest] = await db
        .insert(customerRegistrationRequests)
        .values(request)
        .returning();
      return newRequest;
    } catch (err: any) {
      // PostgreSQL unique-constraint violation (code 23505) from the partial unique index
      // uniq_pending_reg_per_wholesaler_phone — a pending request for this phone + wholesaler
      // already exists.  Throw a friendly error so callers can surface a clear message.
      if (err?.code === '23505' && err?.constraint === 'uniq_pending_reg_per_wholesaler_phone') {
        throw Object.assign(
          new Error(`A pending registration request already exists for phone ${request.customerPhone} with this wholesaler.`),
          { code: 'DUPLICATE_REGISTRATION' }
        );
      }
      throw err;
    }
  }

  // Build all format variants for a phone number so we match both E.164 (+447…)
  // and UK local (07…) forms regardless of how the record was originally stored.
  private phoneVariants(phone: string): string[] {
    const e164 = formatPhoneToInternational(phone);
    const variants = new Set([phone, e164]);
    // If E.164 is +44XXXXXXXXXX derive the local 0XXXXXXXXXX form
    if (e164.startsWith('+44')) {
      variants.add('0' + e164.slice(3));
    }
    // If local 0X… form, E.164 is already added above
    return Array.from(variants);
  }

  async getCustomerRegistrationRequest(wholesalerId: string, customerPhone: string) {
    const variants = this.phoneVariants(customerPhone);
    const [request] = await db
      .select()
      .from(customerRegistrationRequests)
      .where(
        and(
          eq(customerRegistrationRequests.wholesalerId, wholesalerId),
          or(...variants.map(v => eq(customerRegistrationRequests.customerPhone, v))),
          eq(customerRegistrationRequests.status, 'pending')
        )
      )
      .limit(1);
    return request;
  }

  // Allow customers to request access again after rejection
  async getLatestRegistrationRequest(wholesalerId: string, customerPhone: string) {
    const variants = this.phoneVariants(customerPhone);
    const [request] = await db
      .select()
      .from(customerRegistrationRequests)
      .where(
        and(
          eq(customerRegistrationRequests.wholesalerId, wholesalerId),
          or(...variants.map(v => eq(customerRegistrationRequests.customerPhone, v)))
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
      .where(and(
        eq(customerRegistrationRequests.wholesalerId, wholesalerId),
        eq(customerRegistrationRequests.status, 'pending')
      ))
      .orderBy(desc(customerRegistrationRequests.requestedAt));
  }

  async getAllRegistrationRequests(wholesalerId: string) {
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
          oldValue: `${currentCustomer.firstName || ''} ${currentCustomer.lastName || ''}`.trim(),
          newValue: `${updates.firstName || ''} ${(updates.lastName || currentCustomer.lastName) || ''}`.trim(),
          changesApplied: { firstName: updates.firstName }
        });
      }
      
      if (updates.lastName && updates.lastName !== currentCustomer.lastName) {
        notifications.push({
          customerId,
          updateType: 'name', 
          oldValue: `${currentCustomer.firstName || ''} ${currentCustomer.lastName || ''}`.trim(),
          newValue: `${updates.firstName || currentCustomer.firstName || ''} ${updates.lastName || ''}`.trim(),
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
      
    return Array.from(new Set(results.map(r => r.wholesalerId)));
  }

}
