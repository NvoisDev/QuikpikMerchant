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

import { CustomerMgmtStorage } from './customer-mgmt';

export class DeliveryStorage extends CustomerMgmtStorage {
  async isCustomerOfWholesaler(customerId: string, wholesalerId: string): Promise<boolean> {
    const [rel] = await db
      .select({ id: wholesalerCustomerRelationships.id })
      .from(wholesalerCustomerRelationships)
      .where(and(
        eq(wholesalerCustomerRelationships.customerId, customerId),
        eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
        eq(wholesalerCustomerRelationships.status, 'active')
      ));
    return !!rel;
  }

  async getDeliveryAddresses(customerId: string): Promise<DeliveryAddress[]> {
    const addresses = await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.customerId, customerId))
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

  async getDeliveryAddressById(id: number): Promise<DeliveryAddress | undefined> {
    const [address] = await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.id, id));
    
    console.log(`📍 STEP 2: Fetched address ID ${id} directly from database:`, address ? `${address.addressLine1}, ${address.city}` : 'NOT FOUND');
    return address;
  }

  async getDeliveryAddressForCustomer(id: number, customerId: string): Promise<DeliveryAddress | undefined> {
    const [address] = await db
      .select()
      .from(deliveryAddresses)
      .where(and(
        eq(deliveryAddresses.id, id),
        eq(deliveryAddresses.customerId, customerId)
      ));
    
    console.log(`🔒 SECURITY: Verified address ID ${id} belongs to customer ${customerId}:`, address ? `${address.addressLine1}, ${address.city}` : 'NOT FOUND OR ACCESS DENIED');
    return address;
  }

  async createDeliveryAddress(address: InsertDeliveryAddress): Promise<DeliveryAddress> {
    // If this is being set as default, unset all others first
    if (address.isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.customerId, address.customerId));
    }
    
    const [newAddress] = await db
      .insert(deliveryAddresses)
      .values({
        customerId: address.customerId,
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
    
    // If setting as default, unset all others for this customer
    if (updates.isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.customerId, existingAddress.customerId));
    }
    
    const [updatedAddress] = await db
      .update(deliveryAddresses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deliveryAddresses.id, id))
      .returning();
    
    return updatedAddress;
  }

  async deleteDeliveryAddress(id: number): Promise<void> {
    // Nullify orders that reference this address before deleting (avoids FK constraint violation)
    await db
      .update(orders)
      .set({ deliveryAddressId: null })
      .where(eq(orders.deliveryAddressId, id));

    const result = await db
      .delete(deliveryAddresses)
      .where(eq(deliveryAddresses.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Address with id ${id} not found`);
    }
    
    console.log(`🗑️ Deleted delivery address ${id}`);
  }

  async setDefaultDeliveryAddress(customerId: string, addressId: number): Promise<void> {
    // First, unset all defaults for this customer
    await db
      .update(deliveryAddresses)
      .set({ isDefault: false })
      .where(eq(deliveryAddresses.customerId, customerId));
    
    // Then set the specified one as default (if addressId is not -1)
    if (addressId !== -1) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(deliveryAddresses.id, addressId));
    }
    
    console.log(`🎯 Set address ${addressId} as default for customer ${customerId}`);
  }

  async getDefaultDeliveryAddress(customerId: string): Promise<DeliveryAddress | undefined> {
    const [address] = await db
      .select()
      .from(deliveryAddresses)
      .where(and(
        eq(deliveryAddresses.customerId, customerId),
        eq(deliveryAddresses.isDefault, true)
      ));
    
    return address;
  }

  // ── Collection address methods ──────────────────────────────────────────────

  async getCollectionAddresses(wholesalerId: string) {
    const { collectionAddresses } = await import('@shared/schema');
    return db
      .select()
      .from(collectionAddresses)
      .where(eq(collectionAddresses.wholesalerId, wholesalerId))
      .orderBy(desc(collectionAddresses.isDefault), desc(collectionAddresses.createdAt));
  }

  async getCollectionAddress(id: number) {
    const { collectionAddresses } = await import('@shared/schema');
    const [row] = await db.select().from(collectionAddresses).where(eq(collectionAddresses.id, id));
    return row;
  }

  async getDefaultCollectionAddress(wholesalerId: string) {
    const { collectionAddresses } = await import('@shared/schema');
    const [row] = await db
      .select()
      .from(collectionAddresses)
      .where(and(eq(collectionAddresses.wholesalerId, wholesalerId), eq(collectionAddresses.isDefault, true)));
    return row;
  }

  async createCollectionAddress(data: import('@shared/schema').InsertCollectionAddress) {
    const { collectionAddresses } = await import('@shared/schema');
    if (data.isDefault) {
      await db.update(collectionAddresses).set({ isDefault: false }).where(eq(collectionAddresses.wholesalerId, data.wholesalerId));
    }
    const [row] = await db.insert(collectionAddresses).values(data).returning();
    return row;
  }

  async updateCollectionAddress(id: number, wholesalerId: string, updates: Partial<import('@shared/schema').InsertCollectionAddress>) {
    const { collectionAddresses } = await import('@shared/schema');
    if (updates.isDefault) {
      await db.update(collectionAddresses).set({ isDefault: false }).where(eq(collectionAddresses.wholesalerId, wholesalerId));
    }
    const [row] = await db
      .update(collectionAddresses)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(collectionAddresses.id, id), eq(collectionAddresses.wholesalerId, wholesalerId)))
      .returning();
    if (!row) throw new Error('Collection address not found');
    return row;
  }

  async deleteCollectionAddress(id: number, wholesalerId: string) {
    const { collectionAddresses } = await import('@shared/schema');
    // Check if address is used in any active/pending orders
    const activeOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(
        eq(orders.collectionAddressId!, id),
        inArray(orders.status, ['pending', 'confirmed', 'processing'])
      ))
      .limit(1);
    if (activeOrders.length > 0) {
      throw new Error('COLLECTION_ADDRESS_IN_USE');
    }
    await db
      .delete(collectionAddresses)
      .where(and(eq(collectionAddresses.id, id), eq(collectionAddresses.wholesalerId, wholesalerId)));
  }

  async setDefaultCollectionAddress(wholesalerId: string, id: number) {
    const { collectionAddresses } = await import('@shared/schema');
    await db.update(collectionAddresses).set({ isDefault: false }).where(eq(collectionAddresses.wholesalerId, wholesalerId));
    const [row] = await db
      .update(collectionAddresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(collectionAddresses.id, id), eq(collectionAddresses.wholesalerId, wholesalerId)))
      .returning();
    if (!row) throw new Error('Collection address not found');
    return row;
  }

}
