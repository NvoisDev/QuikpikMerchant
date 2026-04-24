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


export class UserStorageBase {
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

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return user;
  }

  async getAllWholesalers(): Promise<{ id: string; businessName: string; email: string; logoType: string; logoUrl: string; firstName: string; lastName: string }[]> {
    const wholesalers = await db
      .select({
        id: users.id,
        businessName: users.businessName,
        email: users.email,
        logoType: users.logoType,
        logoUrl: users.logoUrl,
        firstName: users.firstName,
        lastName: users.lastName
      })
      .from(users)
      .where(eq(users.role, 'wholesaler'))
      .orderBy(users.businessName);
    
    return wholesalers.map(w => ({
      id: w.id,
      businessName: w.businessName || 'Business',
      email: w.email || '',
      logoType: w.logoType || 'business',
      logoUrl: w.logoUrl || '',
      firstName: w.firstName || '',
      lastName: w.lastName || ''
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

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeCustomerId, stripeCustomerId));
      
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getAllUsersByEmail(email: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.email, email));
  }

  async createUser(userData: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData as any)
      .returning();
    return user;
  }

  // Password authentication methods
  async createUserWithPassword(userData: Partial<UpsertUser>, password: string, onProgress?: (step: string) => void): Promise<User> {
    // Hash the password before storing
    const passwordHash = await hashPassword(password);
    onProgress?.('password_hash_done');
    
    const userDataWithPassword = {
      ...userData,
      passwordHash
    };
    
    const [user] = await db
      .insert(users)
      .values(userDataWithPassword as any)
      .returning();
    onProgress?.('user_insert_done');
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

  // Password reset methods
  async setPasswordResetToken(email: string, token: string, expiresAt: Date): Promise<User | null> {
    const [user] = await db
      .update(users)
      .set({ 
        passwordResetToken: token,
        passwordResetExpires: expiresAt,
        updatedAt: new Date()
      })
      .where(eq(users.email, email))
      .returning();
    
    return user || null;
  }

  async validatePasswordResetToken(token: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.passwordResetToken, token),
          sql`${users.passwordResetExpires} > NOW()`
        )
      );
    
    return user || null;
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<User | null> {
    // First validate the token
    const user = await this.validatePasswordResetToken(token);
    
    if (!user) {
      return null;
    }
    
    // Hash the new password
    const passwordHash = await hashPassword(newPassword);
    
    // Update password and clear reset token
    const [updatedUser] = await db
      .update(users)
      .set({ 
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id))
      .returning();
    
    return updatedUser;
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
}
