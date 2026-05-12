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
import { InventoryCalculator } from "../../shared/inventory-calculator.js";

import { OrderStorage } from './orders';

export class CustomerStorage extends OrderStorage {
  private _customerShippingChoices = new Map<string, 'pickup' | 'delivery'>();

  async setCustomerShippingChoice(customerId: string, shippingChoice: 'pickup' | 'delivery'): Promise<void> {
    this._customerShippingChoices.set(customerId, shippingChoice);
  }

  async getCustomerShippingChoice(customerId: string): Promise<'pickup' | 'delivery' | null> {
    const choice = this._customerShippingChoices.get(customerId) || null;
    return choice;
  }

  // Customer authentication
  async findCustomerByPhoneAndWholesaler(wholesalerId: string, phoneNumber: string, lastFourDigits: string): Promise<any> {
    try {
      // Format phone number to international format for consistent comparison
      const formattedPhone = this.formatPhoneToInternational(phoneNumber);
      
      // Verify the last 4 digits match
      const phoneLastFour = formattedPhone.slice(-4);
      if (phoneLastFour !== lastFourDigits) {
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
        return null;
      }
      
      const customer = customers[0];
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

      if (matchingCustomers.length === 0) {
        return null;
      }

      // CRITICAL SECURITY FIX: Multiple customers cannot have the same last 4 digits for the same wholesaler
      if (matchingCustomers.length > 1) {
        // Check if all matches share the EXACT same full phone number (i.e. duplicate user records)
        const uniquePhones = new Set(matchingCustomers.map((c: any) => c.phone));
        
        if (uniquePhones.size === 1) {
          // All records are duplicates of the same person — pick the one with an active
          // wholesaler_customer_relationships entry (new system) over legacy wholesaler_id match,
          // and among those pick the most recently created (highest ID timestamp prefix).
          const duplicateIds: string[] = matchingCustomers.map((c: any) => c.customer_id as string);
          const withRelationship = await db
            .select({ customerId: wholesalerCustomerRelationships.customerId })
            .from(wholesalerCustomerRelationships)
            .where(and(
              eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
              eq(wholesalerCustomerRelationships.status, 'active'),
              inArray(wholesalerCustomerRelationships.customerId, duplicateIds)
            ))
            .orderBy(desc(wholesalerCustomerRelationships.createdAt))
            .limit(1);

          let chosen: any;
          if (withRelationship.length > 0) {
            const chosenId = withRelationship[0].customerId;
            chosen = matchingCustomers.find((c: any) => c.customer_id === chosenId);
          } else {
            // Fall back to last in array (most recently inserted tends to be last)
            chosen = matchingCustomers[matchingCustomers.length - 1];
          }

          return {
            id: chosen.customer_id,
            name: chosen.name,
            email: chosen.email,
            phone: chosen.phone,
            groupId: chosen.group_id,
            groupName: chosen.group_name
          };
        }

        // Genuinely different people sharing the same last 4 — refuse authentication
        console.error(`🚨 CRITICAL SECURITY ISSUE: Multiple DIFFERENT customers found with same last 4 digits: ${lastFourDigits} for wholesaler: ${wholesalerId}`);
        matchingCustomers.forEach((customer: any, index: number) => {
          console.error(`  Customer ${index + 1}: ${customer.name} (${customer.customer_id}) - Phone: ${customer.phone}`);
        });
        throw new Error(`Authentication failed: Multiple customers found with same phone number suffix. This is a security risk. Please contact support.`);
      }

      const matchingCustomer = matchingCustomers[0];
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
      // Re-throw security errors instead of returning null to prevent authentication bypass
      throw error;
    }
  }

  async getWholesalersForCustomer(lastFourDigits: string): Promise<{ id: string; businessName: string; logoUrl?: string; logoType?: string; storeTagline?: string; location?: string; rating?: number }[]> {
    try {
      
      // Find all wholesalers where this customer has active relationships using the new multi-wholesaler system
      const accessibleWholesalers = await db.execute(sql`
        SELECT DISTINCT
          u.id,
          u.business_name,
          u.profile_image_url as logoUrl,
          u.logo_type as logoType,
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
        logoType: row.logoType || 'business',
        storeTagline: row.storeTagline,
        location: row.location,
        rating: parseFloat(row.rating) || 5.0
      }));

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
      .where(and(
        eq(customerGroupMembers.groupId, groupId),
        eq(users.isTestAccount, false)
      ))
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
          eq(users.isTestAccount, false),
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
    customerType?: string;
  }): Promise<any> {
    // Prevent duplicates: if a user with this phone number already exists, return them
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, customer.phoneNumber))
      .limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
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
        country: customer.country ?? null,
        wholesalerId: customer.wholesalerId,
        customerType: customer.customerType || null,
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

  async updateCustomer(customerId: string, updates: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string; archived?: boolean; archivedAt?: Date | null; businessName?: string | null; streetAddress?: string | null; addressLine2?: string | null; city?: string | null; postalCode?: string | null; country?: string | null }): Promise<User> {
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
    if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber;
    if (updates.archived !== undefined) updateData.archived = updates.archived;
    if (updates.archivedAt !== undefined) updateData.archivedAt = updates.archivedAt;
    if (updates.businessName !== undefined) updateData.businessName = updates.businessName || null;
    if (updates.streetAddress !== undefined) updateData.streetAddress = updates.streetAddress || null;
    if (updates.addressLine2 !== undefined) updateData.addressLine2 = updates.addressLine2 || null;
    if (updates.city !== undefined) updateData.city = updates.city || null;
    if (updates.postalCode !== undefined) updateData.postalCode = updates.postalCode || null;
    if (updates.country !== undefined) updateData.country = updates.country || null;
    
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, customerId))
      .returning();
    
    return updatedUser;
  }

  async mergeCustomers(primaryCustomerId: string, duplicateCustomerIds: string[], mergedData?: any): Promise<{ mergedOrdersCount: number }> {
    try {
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
      
      console.log(`✅ Customer merge complete: ${primaryCustomerId} absorbed ${duplicateCustomerIds.length} duplicate(s)`);
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

  async checkAndCreateStockAlerts(productId: number, wholesalerId: string, newStock: number): Promise<void> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return;

    const threshold = product.lowStockThreshold || 50;
    if (newStock <= threshold) {
      await db.insert(stockAlerts).values({
        productId,
        wholesalerId,
        alertType: newStock === 0 ? 'out_of_stock' : 'low_stock',
        currentStock: newStock,
        threshold,
        isRead: false,
        isResolved: false,
      });
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
    unpaidAmount: number;
    unpaidCount: number;
  }> {
    // Get current month's data
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    
    const previousMonthStart = new Date(currentMonthStart);
    previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
    
    // Get total revenue — only count orders where payment has actually been collected (paymentStatus = 'paid')
    const [revenueStats] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(COALESCE(CAST(${orders.subtotal} AS NUMERIC), CAST(${orders.total} AS NUMERIC)) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0)), 0)`,
        ordersCount: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`,
        sql`${orders.paymentStatus} = 'paid'`
      ));

    // Get current month stats (paid orders only)
    const [currentMonthStats] = await db
      .select({
        currentRevenue: sql<number>`COALESCE(SUM(COALESCE(CAST(${orders.subtotal} AS NUMERIC), CAST(${orders.total} AS NUMERIC)) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0)), 0)`,
        currentOrders: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`,
        sql`${orders.paymentStatus} = 'paid'`,
        sql`${orders.createdAt} >= ${currentMonthStart}`
      ));

    // Get previous month stats (paid orders only)
    const [previousMonthStats] = await db
      .select({
        previousRevenue: sql<number>`COALESCE(SUM(COALESCE(CAST(${orders.subtotal} AS NUMERIC), CAST(${orders.total} AS NUMERIC)) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0)), 0)`,
        previousOrders: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`,
        sql`${orders.paymentStatus} = 'paid'`,
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

    // Get unpaid amount and count — use subtotal - platformFee to match the Customers page calculation
    const [unpaidStats] = await db
      .select({
        unpaidAmount: sql<number>`COALESCE(SUM(COALESCE(CAST(${orders.subtotal} AS NUMERIC), CAST(${orders.total} AS NUMERIC)) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0)), 0)`,
        unpaidCount: count(orders.id),
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`,
        sql`(${orders.paymentStatus} IS NULL OR ${orders.paymentStatus} = 'unpaid')`
      ));

    return {
      totalRevenue: Number(revenueStats.totalRevenue) || 0,
      ordersCount: revenueStats.ordersCount || 0,
      activeProducts: productStats.activeProducts || 0,
      lowStockCount: lowStockStats.lowStockCount || 0,
      revenueChange: Math.round(revenueChange * 100) / 100,
      ordersChange: Math.round(ordersChange * 100) / 100,
      unpaidAmount: Number(unpaidStats.unpaidAmount) || 0,
      unpaidCount: unpaidStats.unpaidCount || 0,
    };
  }

  async getWholesalerStatsForDateRange(wholesalerId: string, fromDate: Date, toDate: Date): Promise<{
    totalRevenue: number;
    ordersCount: number;
    activeProducts: number;
    lowStockCount: number;
    unpaidAmount: number;
    unpaidCount: number;
  }> {
    // Get revenue — only paid orders for the specified date range
    const [revenueStats] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(COALESCE(CAST(${orders.subtotal} AS NUMERIC), CAST(${orders.total} AS NUMERIC)) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0)), 0)`,
        ordersCount: count(orders.id)
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`,
        sql`${orders.paymentStatus} = 'paid'`,
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

    // Get unpaid amount and count (all-time, not date-range-filtered — always current)
    // Use subtotal - platformFee to match the Customers page calculation
    const [unpaidStats] = await db
      .select({
        unpaidAmount: sql<number>`COALESCE(SUM(COALESCE(CAST(${orders.subtotal} AS NUMERIC), CAST(${orders.total} AS NUMERIC)) - COALESCE(CAST(${orders.platformFee} AS NUMERIC), 0)), 0)`,
        unpaidCount: count(orders.id),
      })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        sql`${orders.status} NOT IN ('cancelled', 'refunded')`,
        sql`(${orders.paymentStatus} IS NULL OR ${orders.paymentStatus} = 'unpaid')`
      ));

    return {
      totalRevenue: Number(revenueStats.totalRevenue) || 0,
      ordersCount: revenueStats.ordersCount || 0,
      activeProducts: productStats.activeProducts || 0,
      lowStockCount: lowStockStats.lowStockCount || 0,
      unpaidAmount: Number(unpaidStats.unpaidAmount) || 0,
      unpaidCount: unpaidStats.unpaidCount || 0,
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
          sql`${orders.status} NOT IN ('cancelled', 'refunded')`
        )
      ))
      .groupBy(products.id)
      .orderBy(sql`COALESCE(SUM(${orderItems.quantity}), 0) DESC`)
      .limit(limit);

    return result.map(row => ({
      ...row.product,
      orderCount: row.orderCount || 0,
      revenue: Number(row.revenue) || 0,
      totalQuantitySold: Number(row.totalQuantitySold) || 0
    }));
  }

  async getRecentOrders(wholesalerId: string, limit = 10): Promise<any[]> {
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
    const userProducts = await db
      .select()
      .from(products)
      .where(eq(products.wholesalerId, userId));
    return userProducts.length;
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
    const limit = user.productLimit || 2;
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
      // Check if wholesalerId is provided
      if (!filters.wholesalerId) {
        return [];
      }
      
      // Get products using an explicit column list — cost_price is intentionally
      // excluded here because getMarketplaceProducts is a customer-facing API.
      const productsResult = await db.execute(sql`
        SELECT id, name, description, price, currency, moq, stock,
               image_url, images, category, status, wholesaler_id,
               promo_price, promo_active, promotional_offers,
               price_visible, pack_quantity, unit_of_measure, unit_size,
               selling_format, delivery_excluded,
               units_per_pallet, pallet_price, pallet_moq, pallet_stock,
               pallet_weight, unit_weight, created_at, updated_at
        FROM products 
        WHERE wholesaler_id = ${filters.wholesalerId} AND status = 'active'
        LIMIT 100
      `);
      type MarketplaceProductRow = Record<string, unknown> & { price: string; created_at: unknown; wholesaler: { rating?: number } };
      const productsList = productsResult.rows as MarketplaceProductRow[];
      // Get unique wholesaler IDs
      const wholesalerIds = Array.from(new Set(productsList.map(p => p.wholesaler_id)));
      
      if (wholesalerIds.length === 0) {
        return [];
      }
      
      // Get wholesaler display data — explicit column list so no sensitive fields
      // (password hash, Stripe IDs, subscription tier, fees) leak to customers.
      const wholesalersResult = await db.execute(sql`
        SELECT id, email, first_name, last_name, profile_image_url, role,
               business_name, logo_url, logo_type, store_tagline, store_slug,
               business_address, business_phone, business_email, business_description,
               business_type, default_currency, preferred_currency, default_country_code,
               enable_pickup, enable_delivery, delivery_flat_rate, delivery_note,
               pickup_address, pickup_instructions, allow_pay_later,
               whatsapp_enabled, show_prices_to_wholesalers,
               timezone, phone_number, city, state, country, postal_code, street_address,
               created_at, updated_at
        FROM users 
        WHERE id = ${filters.wholesalerId} AND role = 'wholesaler'
        LIMIT 1
      `);

      const wholesalers = wholesalersResult.rows as (Record<string, unknown>)[];

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
              return new Date(String(b.createdAt ?? '')).getTime() - new Date(String(a.createdAt ?? '')).getTime();
            case 'rating':
              return (b.wholesaler.rating || 0) - (a.wholesaler.rating || 0);
            default:
              return 0;
          }
        });
      }

      return results as unknown as (Product & { wholesaler: { id: string; businessName: string; profileImageUrl?: string; rating?: number } })[];
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

    // Explicit column selection — never SELECT * so no sensitive fields
    // (password hash, Stripe IDs, subscription details, fees) reach the customer.
    // `email` is retained as a customer-facing contact fallback; `firstName` and
    // `lastName` are used for name display and avatar initials when businessName
    // is absent.  Truly sensitive fields are not selected.
    const wholesalers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        businessName: users.businessName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        logoUrl: users.logoUrl,
        logoType: users.logoType,
        storeTagline: users.storeTagline,
        storeSlug: users.storeSlug,
        businessAddress: users.businessAddress,
        businessPhone: users.businessPhone,
        businessEmail: users.businessEmail,
        businessDescription: users.businessDescription,
        businessType: users.businessType,
        defaultCurrency: users.defaultCurrency,
        preferredCurrency: users.preferredCurrency,
        defaultCountryCode: users.defaultCountryCode,
        enablePickup: users.enablePickup,
        enableDelivery: users.enableDelivery,
        deliveryFlatRate: users.deliveryFlatRate,
        deliveryNote: users.deliveryNote,
        pickupAddress: users.pickupAddress,
        pickupInstructions: users.pickupInstructions,
        allowPayLater: users.allowPayLater,
        whatsappEnabled: users.whatsappEnabled,
        showPricesToWholesalers: users.showPricesToWholesalers,
        timezone: users.timezone,
        phoneNumber: users.phoneNumber,
        city: users.city,
        state: users.state,
        country: users.country,
        postalCode: users.postalCode,
        streetAddress: users.streetAddress,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
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
        
        // Include products from parent company AND team members.
        // cost_price is intentionally excluded — this is a customer-facing listing.
        const wholesalerProducts = await db.execute(sql`
          SELECT id, name, description, price, currency, moq, stock,
                 image_url, images, category, status, wholesaler_id,
                 promo_price, promo_active, promotional_offers,
                 price_visible, selling_format,
                 units_per_pallet, pallet_price, pallet_moq, pallet_stock,
                 created_at, updated_at
          FROM products 
          WHERE wholesaler_id IN (${sql.join(allRelevantIds.map(id => sql`${id}`), sql`, `)}) 
          AND status = 'active' 
          LIMIT 6
        `).then(res => res.rows);

        return {
          ...wholesaler,
          products: wholesalerProducts,
          rating: 4.5,
          totalOrders: 0,
        };
      })
    );

    return wholesalersWithProducts as unknown as (User & { products: Product[]; rating?: number; totalOrders?: number })[];
  }

  async getWholesalerProfile(id: string): Promise<(User & { products: Product[]; rating?: number; totalOrders?: number }) | undefined> {
    try {
      // Explicit column list — never SELECT * so no sensitive fields
      // (password hash, Stripe IDs, subscription details, fees) reach the customer.
      // `email` is retained as a customer-facing contact fallback (used in the
      // customer portal HelpTab and ThankYouPage when businessEmail is absent).
      // `first_name`/`last_name` are retained for business name fallback and
      // avatar initials. Truly sensitive fields are intentionally excluded above.
      // Try by primary ID first, then fall back to store_slug.
      const wholesalerResult = await db.execute(sql`
        SELECT id, email, first_name, last_name, profile_image_url, role,
               business_name, logo_url, logo_type, store_tagline, store_slug,
               business_address, business_phone, business_email, business_description,
               business_type, default_currency, preferred_currency, default_country_code,
               enable_pickup, enable_delivery, delivery_flat_rate, delivery_note,
               pickup_address, pickup_instructions, allow_pay_later,
               whatsapp_enabled, show_prices_to_wholesalers,
               timezone, phone_number, city, state, country, postal_code, street_address,
               created_at, updated_at
        FROM users 
        WHERE (id = ${id} OR store_slug = ${id}) AND role = 'wholesaler'
        LIMIT 1
      `);

      if (!wholesalerResult.rows || wholesalerResult.rows.length === 0) {
        return undefined;
      }

      type WholesalerRow = Record<string, unknown>;
      const wholesaler = wholesalerResult.rows[0] as WholesalerRow;

      // Use the resolved internal ID for related queries (not the slug param)
      const resolvedId = wholesaler.id as string;

      // Get products for this wholesaler using raw SQL (capped at 200 rows)
      const productsResult = await db.execute(sql`
        SELECT * FROM products 
        WHERE wholesaler_id = ${resolvedId} AND status = 'active'
        LIMIT 200
      `);

      type WholesalerProductRow = Record<string, unknown>;
      const wholesalerProducts = (productsResult.rows || []).map(row => {
        const product = row as WholesalerProductRow;
        
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

      // Safe allow-list: only public-facing display fields.
      // Sensitive fields (passwordHash, Stripe IDs, subscription tier/status,
      // customFeePercentage, VAT/company registration, internalNote, googleId,
      // isTestAccount, onboarding state, gamification) are intentionally omitted.
      const transformedWholesaler = {
        id: wholesaler.id,
        email: wholesaler.email,
        firstName: wholesaler.first_name,
        lastName: wholesaler.last_name,
        profileImageUrl: wholesaler.profile_image_url,
        role: wholesaler.role as 'wholesaler',
        businessName: wholesaler.business_name,
        createdAt: wholesaler.created_at,
        updatedAt: wholesaler.updated_at,
        preferredCurrency: wholesaler.preferred_currency,
        defaultCurrency: wholesaler.default_currency,
        businessAddress: wholesaler.business_address,
        businessPhone: wholesaler.business_phone,
        businessEmail: wholesaler.business_email,
        businessDescription: wholesaler.business_description,
        businessType: wholesaler.business_type,
        timezone: wholesaler.timezone,
        phoneNumber: wholesaler.phone_number,
        streetAddress: wholesaler.street_address,
        city: wholesaler.city,
        state: wholesaler.state,
        postalCode: wholesaler.postal_code,
        country: wholesaler.country,
        whatsappEnabled: wholesaler.whatsapp_enabled || false,
        logoUrl: wholesaler.logo_url,
        logoType: wholesaler.logo_type,
        storeTagline: wholesaler.store_tagline,
        defaultCountryCode: wholesaler.default_country_code || '+44',
        showPricesToWholesalers: wholesaler.show_prices_to_wholesalers,
        enablePickup: wholesaler.enable_pickup,
        enableDelivery: wholesaler.enable_delivery,
        deliveryFlatRate: wholesaler.delivery_flat_rate,
        deliveryNote: wholesaler.delivery_note,
        pickupAddress: wholesaler.pickup_address,
        pickupInstructions: wholesaler.pickup_instructions,
        allowPayLater: wholesaler.allow_pay_later || false,
        storeSlug: wholesaler.store_slug || null,
      };

      return {
        ...transformedWholesaler,
        products: wholesalerProducts,
        rating: 4.5,
        totalOrders: 50,
      } as unknown as ReturnType<typeof Object.assign>;
    } catch (error) {
      console.error('Error in getWholesalerProfile:', error);
      throw error;
    }
  }

}
