import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  decimal,
  boolean,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Promotional offer types
export type PromotionalOfferType = 
  | 'percentage_discount'    // 10% off
  | 'fixed_discount'         // £5 off (alternative name)
  | 'fixed_amount_discount'  // £5 off
  | 'fixed_price'            // Set fixed promotional price
  | 'clearance'              // Clearance sale at a fixed price
  | 'bogo'                   // Buy one get one free
  | 'buy_x_get_y_free'       // Buy 2 get 1 free, Buy 3 get 2 free, etc.
  | 'multi_buy'              // Volume discount for multiple purchases
  | 'bulk_tier'              // Tiered pricing levels
  | 'bulk_discount'          // Tiered pricing: 10+ items = 5% off, 50+ items = 10% off
  | 'free_shipping'          // Free delivery on this product
  | 'bundle_deal';           // Special price when bought with other products

export interface PromotionalOffer {
  id: string;
  name: string;
  type: PromotionalOfferType;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  
  // Discount values
  discountPercentage?: number;  // For percentage_discount
  discountAmount?: number;      // For fixed_amount_discount
  fixedPrice?: number;          // For fixed_price
  
  // BOGO and bulk deal settings
  buyQuantity?: number;         // Buy X
  getQuantity?: number;         // Get Y free
  minQuantity?: number;         // Minimum quantity to qualify
  maxQuantity?: number;         // Maximum quantity this offer applies to
  
  // Bulk discount tiers
  bulkTiers?: Array<{
    minQuantity: number;
    discountPercentage: number;
    discountAmount?: number;
  }>;
  
  // Bundle deal settings
  bundleProducts?: number[];    // Product IDs that must be purchased together
  bundlePrice?: number;         // Special price for the bundle
  
  // Usage limits
  maxUses?: number;             // Total times this offer can be used
  usesCount?: number;           // Current usage count
  maxUsesPerCustomer?: number;  // Max uses per customer
  
  // Conditions
  description?: string;         // Display description for customers
  termsAndConditions?: string;  // Fine print
  
  // Notification tracking (set after cron sends start/end alerts to customers)
  startNotificationSentAt?: string;  // ISO datetime
  endNotificationSentAt?: string;    // ISO datetime

  createdAt: string;
  updatedAt: string;
}

// SMS verification codes table
export const smsVerificationCodes = pgTable(
  "sms_verification_codes",
  {
    id: serial("id").primaryKey(),
    customerId: varchar("customer_id", { length: 255 }).notNull(),
    wholesalerId: varchar("wholesaler_id", { length: 255 }).notNull(),
    code: varchar("code", { length: 6 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    ipAddress: varchar("ip_address", { length: 45 }),
    attempts: integer("attempts").default(0).notNull(),
    isUsed: boolean("is_used").default(false).notNull(),
  },
  (table) => {
    return {
      customerIdIdx: index("sms_codes_customer_id_idx").on(table.customerId),
      wholesalerIdIdx: index("sms_codes_wholesaler_id_idx").on(table.wholesalerId),
      codeIdx: index("sms_codes_code_idx").on(table.code),
      createdAtIdx: index("sms_codes_created_at_idx").on(table.createdAt),
    };
  }
);

// Session storage table (required for auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email"), // Removed .unique() to allow same email across different roles
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  role: varchar("role").notNull().default("wholesaler"), // 'wholesaler' | 'customer' | 'team_member'
  customFeePercentage: decimal("custom_fee_percentage", { precision: 5, scale: 2 }), // Per-wholesaler platform fee override (admin-set)
  wholesalerId: varchar("wholesaler_id"), // For customers/retailers: which wholesaler they belong to
  businessName: varchar("business_name"),
  businessAddress: varchar("business_address"),
  businessPhone: varchar("business_phone"),
  logoUrl: varchar("logo_url"), // Custom uploaded logo
  logoType: varchar("logo_type").default("initials"), // 'initials', 'business_name', 'uploaded'
  
  // Stripe fields
  stripeAccountId: varchar("stripe_account_id"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripeVerifiedEmailSentAt: timestamp("stripe_verified_email_sent_at"),
  
  // Subscription fields - Clean implementation driven by Stripe webhooks only
  subscriptionStatus: varchar("subscription_status").default("free"), // 'free', 'active', 'canceled', 'past_due', 'incomplete' - Updated via webhooks only
  currentPlan: varchar("current_plan").default("free"), // 'free', 'standard', 'premium' - Updated via webhooks only
  subscriptionTier: varchar("subscription_tier").default("free"), // 'free', 'standard', 'premium' - Tier for feature gating
  productLimit: integer("product_limit").default(10), // Product limit based on plan: Free=10, Standard=50, Premium=-1 (unlimited)
  subscriptionPeriodStart: timestamp("subscription_period_start"), // Current period start date
  subscriptionPeriodEnd: timestamp("subscription_period_end"), // Current period end date
  subscriptionEndsAt: timestamp("subscription_ends_at"), // When current subscription expires
  
  // WhatsApp Integration - Simple Setup
  // WhatsApp Business API credentials (user's own)
  whatsappEnabled: boolean("whatsapp_enabled").default(false),
  whatsappAccessToken: varchar("whatsapp_access_token"),
  whatsappBusinessPhoneId: varchar("whatsapp_business_phone_id"),
  whatsappBusinessName: varchar("whatsapp_business_name"),
  whatsappAppId: varchar("whatsapp_app_id"),
  whatsappProvider: varchar("whatsapp_provider").default("twilio"),
  whatsappBusinessPhone: varchar("whatsapp_business_phone"),

  // Twilio SMS/WhatsApp integration
  twilioAccountSid: varchar("twilio_account_sid"),
  twilioAuthToken: varchar("twilio_auth_token"),
  twilioPhoneNumber: varchar("twilio_phone_number"),


  // Settings
  preferredCurrency: varchar("preferred_currency").default("GBP"), // ISO currency code
  timezone: varchar("timezone").default("UTC"),
  phoneNumber: varchar("phone_number"),
  
  // Address fields for delivery/billing
  streetAddress: varchar("street_address"),
  addressLine2: varchar("address_line2"),
  city: varchar("city"),
  state: varchar("state"),
  postalCode: varchar("postal_code"),
  country: varchar("country"),
  
  // Archive functionality
  archived: boolean("archived").default(false), // For soft delete when customer has orders
  archivedAt: timestamp("archived_at"),
  
  notificationPreferences: jsonb("notification_preferences").default({
    email: true,
    sms: true,
    orderUpdates: true,
    stockAlerts: true,
    marketingEmails: false,
    stockAlertFrequency: 'daily',
    stockAlertChannel: 'email',
    stockAlertDay: 1,
    paymentReminderEnabled: true,
    paymentReminderChannel: 'email',
    promotionReminderEnabled: true,
    promotionReminderChannel: 'email',
    lastWeeklyStockAlertSentAt: null
  }),
  
  storeTagline: varchar("store_tagline").default("Premium wholesale products"), // Customizable customer portal tagline
  defaultCountryCode: varchar("default_country_code").default("+44"), // Default phone country code shown on the customer login screen
  orderNumberPrefix: varchar("order_number_prefix").default("ORD"), // Prefix for order numbers (e.g., "SF", "QP")
  orderNumberCounter: integer("order_number_counter").default(0), // Persistent counter — never resets when prefix changes
  
  // Marketplace settings
  showPricesToWholesalers: boolean("show_prices_to_wholesalers").default(false), // Whether to show prices to other wholesalers in marketplace
  
  // Onboarding fields
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingStep: integer("onboarding_step").default(0),
  onboardingSkipped: boolean("onboarding_skipped").default(false),
  isFirstLogin: boolean("is_first_login").default(true),
  
  // Gamification fields
  experiencePoints: integer("experience_points").default(0),
  currentLevel: integer("current_level").default(1),
  totalBadges: integer("total_badges").default(0),
  completedAchievements: jsonb("completed_achievements").default([]), // Array of achievement IDs
  onboardingProgress: jsonb("onboarding_progress").default({
    completedSteps: [],
    currentMilestone: 'getting_started',
    progressPercentage: 0
  }),
  
  // Stock alert settings
  defaultLowStockThreshold: integer("default_low_stock_threshold").default(50), // Global default for new products
  
  // Payment terms settings
  defaultDepositPercentage: integer("default_deposit_percentage").default(100), // 25, 50, 75, or 100 - percentage required upfront
  balanceDueDays: integer("balance_due_days").default(0), // 0=immediate, 7, 14, 30, 60 days for remaining balance
  
  // New signup fields
  businessDescription: text("business_description"),
  businessEmail: varchar("business_email"),
  businessType: varchar("business_type"),
  estimatedMonthlyVolume: varchar("estimated_monthly_volume"),
  defaultCurrency: varchar("default_currency").default("GBP"),
  
  // Shipping Automation Settings
  sendOrderDispatchedEmails: boolean("send_order_dispatched_emails").default(true),
  autoMarkFulfilled: boolean("auto_mark_fulfilled").default(false),
  enableTrackingNotifications: boolean("enable_tracking_notifications").default(true),
  sendDeliveryConfirmations: boolean("send_delivery_confirmations").default(true),
  
  // Global Fulfillment Options
  enablePickup: boolean("enable_pickup").default(true),
  enableDelivery: boolean("enable_delivery").default(true),
  deliveryFlatRate: decimal("delivery_flat_rate", { precision: 10, scale: 2 }),
  deliveryNote: text("delivery_note"),
  pickupAddress: text("pickup_address"), // Address for customer pickup
  pickupInstructions: text("pickup_instructions"), // Special pickup instructions
  
  // Password field for team members
  passwordHash: varchar("password_hash"),
  
  // Password reset fields
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  
  // Parcel2Go Integration for automatic delivery payments
  parcel2GoCredentials: jsonb("parcel2go_credentials").$type<{
    clientId: string;
    clientSecret: string;
    environment: 'sandbox' | 'live';
  }>(),

  // Customer classification
  customerType: varchar("customer_type", { length: 20 }), // 'retail' | 'wholesale' | 'individual'

  // Geocoding fields (postcode centroid for privacy)
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  geocodeStatus: varchar("geocode_status", { length: 10 }), // 'success' | 'flagged'

  isSuspicious: boolean("is_suspicious").default(false), // Admin-flagged suspicious customer
  isTestAccount: boolean("is_test_account").default(false), // Internal test accounts — hidden from wholesaler views and analytics
  isInactive: boolean("is_inactive").default(false), // Churned/dormant wholesalers — excluded from stats; store shown as offline

  lastLoginAt: timestamp("last_login_at"), // Stamped on every successful Google OAuth login
  lastSeenAt: timestamp("last_seen_at"), // Updated by presence ping every 60 s
  lastRealUserActivityAt: timestamp("last_real_user_activity_at"), // Updated only by real user actions — never by super admin impersonation

  // Multi-business profile feature (admin-enabled per wholesaler)
  enableMultiProfile: boolean("enable_multi_profile").default(false),

  // Legal business information for invoice compliance
  legalBusinessName: varchar("legal_business_name"),
  vatNumber: varchar("vat_number"),
  companyRegistrationNumber: varchar("company_registration_number"),

  // VAT / Tax settings
  vatEnabled: boolean("vat_enabled").default(false),
  vatRate: decimal("vat_rate", { precision: 5, scale: 4 }).default("0.2000"),

  // Custom store URL slug (e.g. "my-store" → quikpik.app/customer/my-store)
  storeSlug: varchar("store_slug", { length: 60 }),

  // Public storefront settings
  storeVisibility: varchar("store_visibility", { length: 20 }).default('private'), // 'private' | 'public'
  priceDisplayMode: varchar("price_display_mode", { length: 20 }).default('hidden'), // 'hidden' | 'shown' | 'moq_only'
  storeDescription: text("store_description"),
  deliveryRegions: varchar("delivery_regions", { length: 500 }),

  // Pay Later — wholesaler-controlled
  allowPayLater: boolean("allow_pay_later").default(false),

  // Per-wholesaler customer fee override (null = fall back to platform-wide config)
  // customerFeePercentage stored as decimal rate: 0.0200 = 2%
  // customerFixedFee stored as pound amount:      0.70   = £0.70
  customerFeePercentage: decimal("customer_fee_percentage", { precision: 6, scale: 4 }),
  customerFixedFee: decimal("customer_fixed_fee", { precision: 6, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  phoneIdx: index("users_phone_number_idx").on(table.phoneNumber),
}));

// Team members table for multi-user access
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").notNull().default("member"), // owner, admin, member
  permissions: jsonb("permissions").default({}), // JSON object with permission flags
  status: varchar("status").notNull().default("pending"), // pending, active, suspended
  inviteToken: varchar("invite_token"), // secure random UUID for invitation links
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  lastLoginAt: timestamp("last_login_at"),
  lastSeenAt: timestamp("last_seen_at"), // Updated by presence ping every 60 s
  notificationPreferences: jsonb("notification_preferences").default({}), // Per-member overrides: { stockAlertChannel, stockAlertFrequency }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("team_members_wholesaler_id_idx").on(table.wholesalerId),
}));

// Tab permissions table for controlling team member access
export const tabPermissions = pgTable("tab_permissions", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tabName: varchar("tab_name").notNull(), // 'products', 'orders', 'customers', 'campaigns', 'analytics', 'settings', etc.
  isRestricted: boolean("is_restricted").default(false), // Whether this tab is restricted for team members
  allowedRoles: jsonb("allowed_roles").default(['owner', 'admin', 'member']), // Which team member roles can access
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Wholesaler-Customer Relationships table for multi-wholesaler support
export const wholesalerCustomerRelationships = pgTable("wholesaler_customer_relationships", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status").notNull().default("pending"), // 'pending', 'active', 'suspended', 'rejected'
  invitedAt: timestamp("invited_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  lastAccessedAt: timestamp("last_accessed_at"),
  notes: text("notes"), // Internal notes about this customer relationship
  customPricing: boolean("custom_pricing").default(false), // Whether this customer has custom pricing
  paymentTerms: varchar("payment_terms").default("immediate"), // Payment terms for this relationship
  creditLimit: decimal("credit_limit", { precision: 10, scale: 2 }), // Credit limit if applicable
  displayName: varchar("display_name"), // Per-wholesaler name override — shown instead of users.firstName/lastName for this wholesaler
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    customerIdIdx: index("wcr_customer_id_idx").on(table.customerId),
    wholesalerIdIdx: index("wcr_wholesaler_id_idx").on(table.wholesalerId),
    statusIdx: index("wcr_status_idx").on(table.status),
    // Ensure unique relationship between customer and wholesaler
    customerWholesalerIdx: index("wcr_customer_wholesaler_unique").on(table.customerId, table.wholesalerId),
  };
});

// Customer invitation tokens for secure invitation links
export const customerInvitationTokens = pgTable("customer_invitation_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token").notNull().unique(), // Secure random token
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email").notNull(), // Email of customer being invited
  phoneNumber: varchar("phone_number"), // Phone number if provided
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  customMessage: text("custom_message"), // Personal invitation message
  status: varchar("status").notNull().default("pending"), // 'pending', 'used', 'expired'
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    tokenIdx: index("cit_token_idx").on(table.token),
    wholesalerIdIdx: index("cit_wholesaler_id_idx").on(table.wholesalerId),
    emailIdx: index("cit_email_idx").on(table.email),
    statusIdx: index("cit_status_idx").on(table.status),
  };
});

// Gamification: User badges and achievements tracking
// Subscription plans table for managing Stripe products and prices
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(), // 'Free', 'Standard', 'Premium'
  planId: varchar("plan_id").notNull().unique(), // 'free', 'standard', 'premium'
  stripeProductId: varchar("stripe_product_id"), // Stripe product ID (null for free)
  stripePriceId: varchar("stripe_price_id"), // Stripe price ID (null for free)
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(), // £0.00, £19.99, £39.99
  currency: varchar("currency").default("GBP"),
  description: text("description"),
  features: jsonb("features").$type<string[]>().default([]), // Array of feature descriptions
  limits: jsonb("limits").$type<{
    products?: number; // Product limit (-1 for unlimited)
    broadcasts?: number; // Broadcast limit per month (-1 for unlimited)
    teamMembers?: number; // Team member limit (-1 for unlimited)
    customGroups?: number; // Customer group limit (-1 for unlimited)
    priceLists?: number; // Price list limit (-1 for unlimited)
  }>().default({}),
  billingInterval: varchar("billing_interval").default("monthly"), // 'monthly' | 'yearly'
  version: integer("version").default(1), // Incremented when a new variant of the same plan is created
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0), // Display order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User subscriptions table for detailed subscription tracking
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: varchar("plan_id").notNull().references(() => subscriptionPlans.planId),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(), // Null for free plan
  status: varchar("status").notNull().default("active"), // 'active', 'canceled', 'past_due', 'incomplete'
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  canceledAt: timestamp("canceled_at"),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  internalNote: text("internal_note"),
  isCustomPricing: boolean("is_custom_pricing").default(false),
  customPriceExpiresAt: timestamp("custom_price_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    userIdIdx: index("user_subscriptions_user_id_idx").on(table.userId),
    stripeSubscriptionIdIdx: index("user_subscriptions_stripe_id_idx").on(table.stripeSubscriptionId),
    statusIdx: index("user_subscriptions_status_idx").on(table.status),
  };
});

export const userBadges = pgTable("user_badges", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeId: varchar("badge_id").notNull(), // Achievement identifier
  badgeType: varchar("badge_type").notNull(), // 'milestone', 'achievement', 'streak', 'special'
  badgeName: varchar("badge_name").notNull(),
  badgeDescription: text("badge_description"),
  badgeIcon: varchar("badge_icon"), // Icon name or emoji
  badgeColor: varchar("badge_color").default("#10B981"), // Hex color for badge
  experiencePoints: integer("experience_points").default(0), // XP awarded for this badge
  unlockedAt: timestamp("unlocked_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Onboarding milestones and progress tracking
export const onboardingMilestones = pgTable("onboarding_milestones", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  milestoneId: varchar("milestone_id").notNull(), // 'first_product', 'first_customer', 'first_order', etc.
  milestoneName: varchar("milestone_name").notNull(),
  milestoneDescription: text("milestone_description"),
  requiredActions: jsonb("required_actions").default([]), // Array of actions needed to complete
  completedActions: jsonb("completed_actions").default([]), // Array of completed actions
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  experienceReward: integer("experience_reward").default(0),
  badgeReward: varchar("badge_reward"), // Badge ID if milestone awards a badge
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  promoPrice: decimal("promo_price", { precision: 10, scale: 2 }), // Optional promotional price
  promoActive: boolean("promo_active").default(false), // Whether the promo is currently active
  
  // Multiple promotional offers system
  promotionalOffers: jsonb("promotional_offers").$type<PromotionalOffer[]>().default([]),
  currency: varchar("currency").default("GBP"), // ISO currency code
  moq: integer("moq").notNull().default(1), // minimum order quantity
  // CRITICAL FIX: Base Unit Inventory Logic - Single source of truth
  baseUnitStock: integer("base_unit_stock").notNull().default(0), // Master inventory count in base units
  stock: integer("stock").notNull().default(0), // Legacy field for compatibility
  imageUrl: varchar("image_url"), // Primary image (for backward compatibility)
  images: jsonb("images").$type<string[]>().default([]), // Array of image URLs for multiple images
  category: varchar("category"),
  status: varchar("status").notNull().default("active"), // 'active' | 'inactive' | 'out_of_stock' | 'locked'
  priceVisible: boolean("price_visible").notNull().default(true),
  editCount: integer("edit_count").notNull().default(0), // Track number of edits made
  
  // Core Inventory Configuration - Following Base Unit Logic
  quantityInPack: integer("quantity_in_pack").notNull().default(1), // Base units per pack (source of truth)
  unitsPerPallet: integer("units_per_pallet").notNull().default(1), // Number of PACKS per pallet (not base units)
  
  // Selling format and pricing
  sellingFormat: varchar("selling_format").default("units"), // 'units' | 'pallets' | 'both'
  palletPrice: decimal("pallet_price", { precision: 10, scale: 2 }), // Price per pallet
  palletMoq: integer("pallet_moq").default(1), // Minimum order quantity for pallets
  
  // DEPRECATED: Legacy fields for backward compatibility (will be removed)
  palletStock: integer("pallet_stock").default(0), // DEPRECATED - derived from baseUnitStock
  palletWeight: decimal("pallet_weight", { precision: 10, scale: 2 }), // Weight per pallet in kg
  unitWeight: decimal("unit_weight", { precision: 10, scale: 2 }), // Weight per unit in kg
  unit_weight: decimal("unit_weight_legacy", { precision: 10, scale: 2 }), // Legacy field for compatibility
  pallet_weight: decimal("pallet_weight_legacy", { precision: 10, scale: 2 }), // Legacy field for compatibility
  deliveryExcluded: boolean("delivery_excluded").default(false), // Whether item can be delivered or pickup only
  lowStockThreshold: integer("low_stock_threshold").notNull().default(50), // Alert when stock falls below this number
  lastStockAlertSentAt: timestamp("last_stock_alert_sent_at"), // Track when last stock alert was sent for this product
  
  // Units and measurements
  unit: varchar("unit").default("units"), // Base unit of measure (kg, g, l, ml, cl, pieces, boxes, etc.)
  unitFormat: varchar("unit_format"), // Display format like "12 x 24g", "6 x 500ml", "24 pieces"
  
  // Enhanced flexible unit system for precise shipping calculations
  packQuantity: integer("pack_quantity"), // e.g., 20 (for "20 x 100g")
  unitOfMeasure: varchar("unit_of_measure", { length: 20 }), // e.g., "g", "ml", "pieces", "kg", "litres"
  sizePerUnit: decimal("size_per_unit", { precision: 12, scale: 3 }), // e.g., 100.000 (for "20 x 100g")
  
  // Calculated fields for accurate shipping
  totalPackageWeight: decimal("total_package_weight", { precision: 10, scale: 3 }), // Calculated from packQuantity * sizePerUnit (when unit is weight)
  individualUnitWeight: decimal("individual_unit_weight", { precision: 10, scale: 3 }), // Weight per single unit (for non-weight measures)
  packageDimensions: jsonb("package_dimensions").default({}), // {length: cm, width: cm, height: cm} for shipping quotes
  
  // Enhanced unit configuration for any combination
  unitConfiguration: jsonb("unit_configuration").default({}), // {packQuantity: 20, unitOfMeasure: "g", sizePerUnit: 100.000, example: "20 x 100g"}
  
  // Legacy fields maintained for compatibility
  unitSize: decimal("unit_size", { precision: 10, scale: 3 }), // e.g., 250 (for "24 x 250ml")
  unitWeightKg: decimal("unit_weight_kg", { precision: 10, scale: 3 }), // Weight per individual unit in kg
  
  // Temperature and special handling requirements
  temperatureRequirement: varchar("temperature_requirement").default("ambient"), // 'frozen', 'chilled', 'ambient'
  specialHandling: jsonb("special_handling").default({}), // {fragile: boolean, hazardous: boolean, perishable: boolean}
  shelfLife: integer("shelf_life"), // Days before expiry
  expiryDate: date("expiry_date"), // Specific expiry / best-before date for this batch
  contentCategory: varchar("content_category").default("general"), // 'food', 'pharmaceuticals', 'electronics', 'textiles', 'general'
  
  // Cost price for margin calculations (wholesaler internal — never shown to customers)
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("products_wholesaler_id_idx").on(table.wholesalerId),
  statusIdx: index("products_status_idx").on(table.status),
}));

// Batch-level inventory tracking — each delivery/restocking event creates a new batch
export const productBatches = pgTable("product_batches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  batchNumber: varchar("batch_number"),          // optional user-facing label / delivery ref
  quantity: integer("quantity").notNull().default(0),
  originalQuantity: integer("original_quantity"), // starting quantity at batch creation; never changes
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }), // optional per-batch cost
  expiryDate: date("expiry_date"),               // null = no expiry
  status: varchar("status").notNull().default("active"), // 'active' | 'depleted' | 'expired'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  productIdIdx: index("pb_product_id_idx").on(table.productId),
  productExpiryIdx: index("pb_product_expiry_idx").on(table.productId, table.expiryDate),
  statusIdx: index("pb_status_idx").on(table.status),
}));

export const insertProductBatchSchema = createInsertSchema(productBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProductBatch = z.infer<typeof insertProductBatchSchema>;
export type ProductBatch = typeof productBatches.$inferSelect;

export const customerGroups = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("customer_groups_wholesaler_id_idx").on(table.wholesalerId),
}));

export const customerGroupMembers = pgTable("customer_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => customerGroups.id),
  customerId: varchar("customer_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  customerIdIdx: index("customer_group_members_customer_id_idx").on(table.customerId),
  groupIdIdx: index("customer_group_members_group_id_idx").on(table.groupId),
}));

// Stock movements table for tracking inventory changes
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  movementType: varchar("movement_type").notNull(), // 'purchase', 'manual_increase', 'manual_decrease', 'initial'
  quantity: integer("quantity").notNull(), // positive for increases, negative for decreases
  unitType: varchar("unit_type").notNull().default("units"), // 'units', 'pallets', 'boxes', 'kg', 'tonnes'
  stockBefore: integer("stock_before").notNull(),
  stockAfter: integer("stock_after").notNull(),
  reason: varchar("reason"), // description of the movement
  orderId: integer("order_id"), // reference to order if movement is from purchase
  customerName: varchar("customer_name"), // customer name if movement is from purchase
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id, { onDelete: "set null" }), // business profile if movement is from an order
  batchId: integer("batch_id").references(() => productBatches.id, { onDelete: "set null" }), // batch this movement came from
  createdAt: timestamp("created_at").defaultNow(),
});

// Business profiles — one wholesaler can have multiple trading identities
export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  logoUrl: varchar("logo_url"),
  address: text("address"),
  isDefault: boolean("is_default").default(false).notNull(),
  // Bank / payment details — shown on invoice PDFs
  bankName: varchar("bank_name", { length: 100 }),
  accountName: varchar("account_name", { length: 100 }),
  accountNumber: varchar("account_number", { length: 100 }),
  sortCode: varchar("sort_code", { length: 20 }),
  iban: varchar("iban", { length: 100 }),
  swift: varchar("swift", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("business_profiles_wholesaler_id_idx").on(table.wholesalerId),
}));

export const insertBusinessProfileSchema = createInsertSchema(businessProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfiles.$inferSelect;

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number"), // Unique order number per wholesaler (e.g., "QP-001", "QP-002") — null for drafts
  sequenceNumber: integer("sequence_number"), // Numeric part of the order number (e.g., 1 for "QP-001") — auto-populated by DB trigger
  prefixUsed: varchar("prefix_used"), // Prefix active when the order was created (e.g., "QP") — auto-populated by DB trigger
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  retailerId: varchar("retailer_id").notNull().references(() => users.id),
  customerName: varchar("customer_name"), // Store customer name for guest checkouts
  customerEmail: varchar("customer_email"), // Store customer email for guest checkouts
  customerPhone: varchar("customer_phone"), // Store customer phone for guest checkouts
  status: varchar("status").notNull().default("pending"), // 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled'
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  customerTransactionFee: decimal("customer_transaction_fee", { precision: 10, scale: 2 }).default("0.00"), // Customer transaction fee (1.5% + £0.50)
  feePercentageUsed: decimal("fee_percentage_used", { precision: 5, scale: 4 }), // Rate snapshot at order creation (e.g. 0.0550)
  fixedFeeUsed: decimal("fixed_fee_used", { precision: 6, scale: 2 }), // Fixed fee snapshot at order creation (e.g. 0.50)
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).default("0.00"), // VAT charged on the order (subtotal × vatRate when wholesaler has VAT enabled)
  vatRateApplied: decimal("vat_rate_applied", { precision: 5, scale: 4 }), // The exact VAT rate used at order creation time (e.g. 0.2000 for 20%)
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  stripeTransferId: varchar("stripe_transfer_id"), // Stripe Transfer ID for exact payout reconciliation
  deliveryAddress: text("delivery_address"),
  // CRITICAL: Store exact delivery address ID used for this order
  deliveryAddressId: integer("delivery_address_id").references(() => deliveryAddresses.id),
  // Order images uploaded by wholesaler for customer confidence
  orderImages: jsonb("order_images").default([]).$type<Array<{
    id: string;
    url: string;
    filename: string;
    uploadedAt: string;
    description?: string;
  }>>(),
  notes: text("notes"),
  
  // New delivery and fulfillment options
  fulfillmentType: varchar("fulfillment_type").notNull().default("delivery"), // 'pickup' | 'delivery'
  deliveryCost: decimal("delivery_cost", { precision: 10, scale: 2 }).default("0.00"), // Cost of delivery service
  deliveryCarrier: varchar("delivery_carrier"), // Selected delivery company (from Parcel2Go)
  deliveryServiceId: varchar("delivery_service_id"), // Parcel2Go service ID
  deliveryQuoteId: varchar("delivery_quote_id"), // Parcel2Go quote reference
  deliveryTrackingNumber: varchar("delivery_tracking_number"), // Tracking number from carrier
  estimatedDeliveryDate: timestamp("estimated_delivery_date"), // Expected delivery date
  
  // Parcel2Go integration fields
  shippingOrderId: varchar("shipping_order_id"), // Parcel2Go order ID
  shippingHash: varchar("shipping_hash"), // Parcel2Go order hash for authentication
  shippingTotal: decimal("shipping_total", { precision: 10, scale: 2 }), // Total shipping cost from Parcel2Go
  shippingStatus: varchar("shipping_status"), // Status from Parcel2Go (created, paid, dispatched, delivered)
  
  // Ready for Collection feature
  readyToCollectAt: timestamp("ready_to_collect_at"), // When order was marked ready for collection
  
  // Quick Quote feature - for on-the-spot sales with negotiated prices
  isQuote: boolean("is_quote").default(false), // Whether this is a quote/invoice awaiting payment
  stripePaymentLinkId: varchar("stripe_payment_link_id"), // Stripe Payment Link ID for quote
  stripePaymentLinkUrl: varchar("stripe_payment_link_url"), // Public URL for customer to pay
  quoteExpiresAt: timestamp("quote_expires_at"), // When the quote payment link expires
  quoteSentAt: timestamp("quote_sent_at"), // When the quote was sent to customer
  quoteSentVia: varchar("quote_sent_via"), // 'sms' | 'email' | 'whatsapp'
  lastEditedAt: timestamp("last_edited_at"), // When a wholesaler last edited this quote (null = never edited)
  
  // Deposit payment feature
  depositPercentage: integer("deposit_percentage").default(100), // 25, 50, 75, or 100 for full payment
  balanceDueDays: integer("balance_due_days").default(0), // Days until remaining balance is due (0, 7, 14, 30, 60)
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0.00"), // Amount customer has paid
  amountOutstanding: decimal("amount_outstanding", { precision: 10, scale: 2 }).default("0.00"), // Remaining balance
  paymentStatus: varchar("payment_status").default("unpaid"), // 'unpaid' | 'part_paid' | 'paid'
  paymentMethod: varchar("payment_method"), // 'cash' | 'bank_transfer' | 'payment_link' | 'pay_later' | 'card' | 'cheque' | 'other'
  stripeActualFee: decimal("stripe_actual_fee", { precision: 10, scale: 2 }), // Actual Stripe processing fee captured from balance_transaction at payment time

  // Refund tracking
  amountRefunded: decimal("amount_refunded", { precision: 10, scale: 2 }).default("0.00"), // Total amount refunded
  refundReason: text("refund_reason"), // Reason for refund/cancellation
  refundedAt: timestamp("refunded_at"), // When refund was processed
  cancelledAt: timestamp("cancelled_at"), // When order was cancelled
  stockRestored: boolean("stock_restored").default(false), // Whether stock was returned to inventory
  stockRestoredCount: integer("stock_restored_count").default(0), // Number of units returned to inventory
  restockStatus: varchar("restock_status"), // Idempotency guard: null | 'completed'
  placedByName: varchar("placed_by_name"), // Name of team member who placed the order (null = wholesaler owner)
  orderSource: varchar("order_source"), // 'wholesaler' | 'customer_portal' — who initiated the order

  // Multi-business profile: which profile was used for this order
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id, { onDelete: "set null" }),

  // Collection address override — which pickup location was used for this order
  collectionAddressId: integer("collection_address_id").references(() => collectionAddresses.id, { onDelete: "set null" }),

  // Task #908: Short-lived idempotency key — prevents duplicate orders from retries / double-taps.
  // Derived from a SHA-256 hash of (retailerId, wholesalerId, items, deliveryAddress, notes, collectionAddressId, 60s bucket).
  // A full unique index is used (NULL values never conflict in Postgres, making it equivalent
  // to a partial index but compatible with Drizzle's onConflictDoNothing target syntax).
  idempotencyKey: varchar("idempotency_key", { length: 64 }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("orders_wholesaler_created_idx").on(table.wholesalerId, table.createdAt),
  index("orders_retailer_idx").on(table.retailerId),
  index("orders_payment_status_idx").on(table.paymentStatus),
  index("orders_status_idx").on(table.status),
  index("orders_created_at_idx").on(table.createdAt),
  index("orders_customer_phone_idx").on(table.customerPhone),
]);

// ── Quote Activity Log ───────────────────────────────────────────────────────
// Append-only, structured audit trail for every meaningful event on a quote.
// Additive only — no existing logic was modified to add this table.
export const quoteActivityLogs = pgTable("quote_activity_logs", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // 'quote_created' | 'product_added' | 'product_removed' | 'quantity_changed'
  // | 'price_changed' | 'total_updated' | 'delivery_cost_changed'
  // | 'payment_initiated' | 'payment_successful' | 'payment_failed'
  // | 'quote_cancelled' | 'stock_restored' | 'offline_payment_recorded'
  actionType: varchar("action_type", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 30 }),  // 'product' | 'payment' | 'quote' | 'system'
  entityId: varchar("entity_id", { length: 255 }),     // productId, orderId, etc. (nullable)
  oldValue: jsonb("old_value"),                         // structured before-state
  newValue: jsonb("new_value"),                         // structured after-state
  description: text("description").notNull(),           // human-readable fallback for UI display
  performedBy: varchar("performed_by", { length: 255 }), // userId or 'system'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQuoteActivityLogSchema = createInsertSchema(quoteActivityLogs).omit({ id: true, createdAt: true });
export type InsertQuoteActivityLog = z.infer<typeof insertQuoteActivityLogSchema>;
export type QuoteActivityLog = typeof quoteActivityLogs.$inferSelect;

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  productId: integer("product_id").references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  sellingType: varchar("selling_type", { length: 10 }).default('units'),
  appliedOfferLabel: varchar("applied_offer_label", { length: 255 }),
  freeItems: integer("free_items").default(0),
  batchId: integer("batch_id").references(() => productBatches.id), // primary batch used (FEFO), null = no batch tracking
}, (table) => ({
  orderIdIdx: index("order_items_order_id_idx").on(table.orderId),
  productIdIdx: index("order_items_product_id_idx").on(table.productId),
}));

export const broadcasts = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customerGroupId: integer("customer_group_id").notNull().references(() => customerGroups.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  customMessage: text("custom_message"),
  specialPrice: decimal("special_price", { precision: 10, scale: 2 }),
  quantity: integer("quantity").notNull().default(1), // Campaign-specific quantity
  
  // New promotional offers system
  promotionalOffers: jsonb("promotional_offers").$type<PromotionalOffer[]>().default([]),
  
  status: varchar("status").notNull().default("pending"), // pending, sent, failed
  recipientCount: integer("recipient_count").notNull().default(0),
  sentAt: timestamp("sent_at"),
  scheduledAt: timestamp("scheduled_at"),
  openRate: integer("open_rate"), // percentage
  clickRate: integer("click_rate"), // percentage
  messageId: varchar("message_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("broadcasts_wholesaler_id_idx").on(table.wholesalerId),
}));

// Customer registration requests (for wholesaler approval)
export const customerRegistrationRequests = pgTable("customer_registration_requests", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  businessName: varchar("business_name", { length: 255 }),
  customerType: varchar("customer_type", { length: 20 }), // 'retail' | 'wholesale' | 'individual'
  businessType: varchar("business_type", { length: 20 }), // 'retailer' | 'wholesaler' | 'business' | 'individual'
  requestMessage: text("request_message"),
  productsInterested: text("products_interested"),
  orderFrequency: varchar("order_frequency", { length: 255 }),
  status: varchar("status").$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
  respondedBy: varchar("responded_by").references(() => users.id), // wholesaler user ID who approved/rejected
  responseMessage: text("response_message"),
}, (table) => ({
  wholesalerIdIdx: index("registration_requests_wholesaler_id_idx").on(table.wholesalerId),
  customerPhoneIdx: index("registration_requests_customer_phone_idx").on(table.customerPhone),
  statusIdx: index("registration_requests_status_idx").on(table.status),
  requestedAtIdx: index("registration_requests_requested_at_idx").on(table.requestedAt),
  // Task #320: DB-level uniqueness guard — enforced via startup migration (functional partial unique
  // index not expressible in Drizzle's schema API):
  //   CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_reg_per_wholesaler_phone
  //   ON customer_registration_requests
  //     (wholesaler_id, RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 10))
  //   WHERE status = 'pending'
}));

// Cancellation refund types — stored in the DB and used to derive email status
export type CancellationRefundType = 'card' | 'later' | 'none';

// Email refund status — what the customer sees in the cancellation/refund email
export type EmailRefundStatus = 'processed' | 'pending' | 'none';

/**
 * Maps the stored DB `refundType` to the email-facing `refundStatus`.
 * This is the single source of truth for that translation so the two
 * representations can never silently diverge.
 */
export function cancellationRefundTypeToEmailStatus(
  refundType: CancellationRefundType | null | undefined,
): EmailRefundStatus {
  if (refundType === 'card') return 'processed';
  if (refundType === 'later') return 'pending';
  return 'none';
}

// Order cancellation requests (customer-initiated, within 24hr window)
export const orderCancellationRequests = pgTable("order_cancellation_requests", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  customerId: varchar("customer_id").notNull().references(() => users.id),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  reasonCategory: varchar("reason_category", { length: 50 }).notNull(),
  reasonNotes: text("reason_notes"),
  status: varchar("status").$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
  respondedBy: varchar("responded_by").references(() => users.id),
  responseMessage: text("response_message"),
  refundType: varchar("refund_type").$type<CancellationRefundType>(),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),
}, (table) => ({
  orderIdIdx: index("cancellation_requests_order_id_idx").on(table.orderId),
  customerIdIdx: index("cancellation_requests_customer_id_idx").on(table.customerId),
  wholesalerIdIdx: index("cancellation_requests_wholesaler_id_idx").on(table.wholesalerId),
  statusIdx: index("cancellation_requests_status_idx").on(table.status),
  requestedAtIdx: index("cancellation_requests_requested_at_idx").on(table.requestedAt),
}));

// Customer profile update notifications for wholesalers
export const customerProfileUpdateNotifications = pgTable("customer_profile_update_notifications", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => users.id),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  updateType: varchar("update_type").notNull(), // 'name', 'email', 'phone', 'business_name', 'address'
  oldValue: text("old_value"), // Previous value (JSON string for complex data)
  newValue: text("new_value"), // New value (JSON string for complex data)
  changesApplied: jsonb("changes_applied").notNull(), // Detailed changes applied
  notificationSent: boolean("notification_sent").default(false),
  notificationMethod: varchar("notification_method"), // 'email', 'sms', 'whatsapp'
  notificationSentAt: timestamp("notification_sent_at"),
  readAt: timestamp("read_at"), // When wholesaler read the notification
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index("profile_updates_customer_id_idx").on(table.customerId),
  wholesalerIdIdx: index("profile_updates_wholesaler_id_idx").on(table.wholesalerId),
  updateTypeIdx: index("profile_updates_type_idx").on(table.updateType),
  notificationSentIdx: index("profile_updates_sent_idx").on(table.notificationSent),
  createdAtIdx: index("profile_updates_created_at_idx").on(table.createdAt),
}));

// Message Templates for multi-product campaigns
export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  name: varchar("name").notNull(), // Template name
  title: varchar("title").notNull(), // Campaign title
  description: text("description"), // Template description
  customMessage: text("custom_message"), // Custom intro message
  includeContact: boolean("include_contact").default(true), // Include contact info
  includePurchaseLink: boolean("include_purchase_link").default(true), // Include purchase link
  status: varchar("status").default("active"), // 'active', 'archived'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template Products (products included in template)
export const templateProducts = pgTable("template_products", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => messageTemplates.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1), // Suggested quantity
  specialPrice: varchar("special_price"), // Optional special price for campaign
  
  // New promotional offers system for multi-product campaigns
  promotionalOffers: jsonb("promotional_offers").$type<PromotionalOffer[]>().default([]),
  
  displayOrder: integer("display_order").default(0), // Order in template
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Template Campaigns (when templates are sent to groups)
export const templateCampaigns = pgTable("template_campaigns", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => messageTemplates.id),
  customerGroupId: integer("customer_group_id").notNull().references(() => customerGroups.id),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  campaignUrl: varchar("campaign_url"), // Unique URL for this campaign
  sentAt: timestamp("sent_at"),
  status: varchar("status").default("pending"), // 'pending', 'sent', 'failed'
  recipientCount: integer("recipient_count").default(0),
  clickCount: integer("click_count").default(0),
  orderCount: integer("order_count").default(0),
  totalRevenue: varchar("total_revenue").default("0.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Enhanced orders to track campaign source
export const campaignOrders = pgTable("campaign_orders", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  campaignId: integer("campaign_id").references(() => templateCampaigns.id),
  templateId: integer("template_id").references(() => messageTemplates.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Promotion Analytics - Track pricing impact and performance
export const promotionAnalytics = pgTable("promotion_analytics", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => products.id),
  campaignId: varchar("campaign_id").notNull(), // References either broadcast.id or template.id
  campaignType: varchar("campaign_type").notNull(), // 'single' | 'multi'
  campaignTitle: varchar("campaign_title").notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }).notNull(),
  promotionalPrice: decimal("promotional_price", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }).notNull(),
  customerGroupId: integer("customer_group_id").references(() => customerGroups.id),
  recipientCount: integer("recipient_count").default(0),
  viewCount: integer("view_count").default(0), // How many customers viewed the promotion
  clickCount: integer("click_count").default(0), // How many clicked the purchase link
  orderCount: integer("order_count").default(0), // How many placed orders
  unitsOrdered: integer("units_ordered").default(0), // Total units ordered through this promotion
  revenueGenerated: decimal("revenue_generated", { precision: 12, scale: 2 }).default("0.00"),
  potentialRevenue: decimal("potential_revenue", { precision: 12, scale: 2 }).default("0.00"), // Revenue if sold at original price
  revenueLoss: decimal("revenue_loss", { precision: 12, scale: 2 }).default("0.00"), // Lost revenue due to discount
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0.00"), // orderCount / recipientCount
  campaignSentAt: timestamp("campaign_sent_at"),
  firstOrderAt: timestamp("first_order_at"),
  lastOrderAt: timestamp("last_order_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Performance Summary - Aggregated analytics per product
export const productPerformanceSummary = pgTable("product_performance_summary", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => products.id),
  totalCampaigns: integer("total_campaigns").default(0),
  activeCampaigns: integer("active_campaigns").default(0),
  totalPromotionViews: integer("total_promotion_views").default(0),
  totalPromotionOrders: integer("total_promotion_orders").default(0),
  totalPromotionRevenue: decimal("total_promotion_revenue", { precision: 12, scale: 2 }).default("0.00"),
  totalRevenueLoss: decimal("total_revenue_loss", { precision: 12, scale: 2 }).default("0.00"),
  averageDiscountPercentage: decimal("average_discount_percentage", { precision: 5, scale: 2 }).default("0.00"),
  bestPerformingCampaignId: varchar("best_performing_campaign_id"),
  bestConversionRate: decimal("best_conversion_rate", { precision: 5, scale: 2 }).default("0.00"),
  regularPriceOrders: integer("regular_price_orders").default(0), // Orders at regular price (non-promotional)
  regularPriceRevenue: decimal("regular_price_revenue", { precision: 12, scale: 2 }).default("0.00"),
  promotionEffectiveness: varchar("promotion_effectiveness").default("unknown"), // 'excellent' | 'good' | 'average' | 'poor' | 'unknown'
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stock update notifications for campaign recipients
export const stockUpdateNotifications = pgTable("stock_update_notifications", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  campaignId: integer("campaign_id").references(() => broadcasts.id),
  templateCampaignId: integer("template_campaign_id").references(() => templateCampaigns.id),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  notificationType: varchar("notification_type").notNull(), // 'low_stock', 'out_of_stock', 'restocked', 'price_change'
  previousStock: integer("previous_stock"),
  newStock: integer("new_stock"),
  previousPrice: varchar("previous_price"),
  newPrice: varchar("new_price"),
  messagesSent: integer("messages_sent").default(0),
  status: varchar("status").default("pending"), // 'pending', 'sent', 'failed'
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stock alerts table for tracking low stock notifications
export const stockAlerts = pgTable("stock_alerts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertType: varchar("alert_type").notNull().default("low_stock"), // 'low_stock', 'out_of_stock'
  currentStock: integer("current_stock").notNull(),
  threshold: integer("threshold").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isResolved: boolean("is_resolved").notNull().default(false), // Mark as resolved when stock is replenished
  notificationSent: boolean("notification_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Admin audit logs for tracking impersonation and admin actions
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  adminEmail: varchar("admin_email").notNull(),
  action: varchar("action").notNull(), // 'impersonate_start', 'impersonate_exit'
  targetWholesalerId: varchar("target_wholesaler_id").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminEmailIdx: index("admin_audit_admin_email_idx").on(table.adminEmail),
  createdAtIdx: index("admin_audit_created_at_idx").on(table.createdAt),
}));

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

// System error logs for tracking platform errors
export const systemErrorLogs = pgTable("system_error_logs", {
  id: serial("id").primaryKey(),
  errorType: varchar("error_type").notNull(), // 'payment_failure', 'webhook_error', 'server_error', etc.
  message: text("message").notNull(),
  context: jsonb("context").$type<Record<string, unknown>>().default({}),
  wholesalerId: varchar("wholesaler_id").references(() => users.id, { onDelete: "set null" }),
  severity: varchar("severity").notNull().default("error"), // 'error', 'warning', 'critical'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  errorTypeIdx: index("system_errors_type_idx").on(table.errorType),
  createdAtIdx: index("system_errors_created_at_idx").on(table.createdAt),
  wholesalerIdIdx: index("system_errors_wholesaler_id_idx").on(table.wholesalerId),
}));

export const insertSystemErrorLogSchema = createInsertSchema(systemErrorLogs).omit({ id: true, createdAt: true });
export type InsertSystemErrorLog = z.infer<typeof insertSystemErrorLogSchema>;
export type SystemErrorLog = typeof systemErrorLogs.$inferSelect;

// Subscription audit logs for tracking all subscription events
export const subscriptionAuditLogs = pgTable("subscription_audit_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: varchar("event_type").notNull(), // 'upgrade', 'downgrade', 'cancel', 'reactivate', 'payment_success', 'payment_failed', 'webhook_received', 'manual_override', 'product_unlock', 'limit_reached'
  fromTier: varchar("from_tier"), // Previous subscription tier
  toTier: varchar("to_tier"), // New subscription tier
  amount: decimal("amount", { precision: 10, scale: 2 }), // Payment amount
  currency: varchar("currency", { length: 3 }).default("GBP"), // Currency code
  stripeSubscriptionId: varchar("stripe_subscription_id"), // Stripe subscription ID
  stripeInvoiceId: varchar("stripe_invoice_id"), // Stripe invoice ID — used as idempotency key
  stripeCustomerId: varchar("stripe_customer_id"), // Stripe customer ID
  reason: text("reason"), // Reason for the change
  metadata: text("metadata"), // Additional data as JSON string
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }), // User's IP address
  userAgent: text("user_agent"), // User's browser/app info
}, (table) => {
  return {
    userIdIdx: index("subscription_audit_user_id_idx").on(table.userId),
    eventTypeIdx: index("subscription_audit_event_type_idx").on(table.eventType),
    timestampIdx: index("subscription_audit_timestamp_idx").on(table.timestamp),
    stripeSubscriptionIdx: index("subscription_audit_stripe_sub_idx").on(table.stripeSubscriptionId),
  };
});



// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  customerGroups: many(customerGroups),
  ordersAsWholesaler: many(orders, { relationName: "wholesaler" }),
  ordersAsRetailer: many(orders, { relationName: "retailer" }),
  groupMemberships: many(customerGroupMembers),
  teamMembers: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  wholesaler: one(users, {
    fields: [teamMembers.wholesalerId],
    references: [users.id]
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  wholesaler: one(users, {
    fields: [products.wholesalerId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
  stockMovements: many(stockMovements),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  wholesaler: one(users, {
    fields: [orders.wholesalerId],
    references: [users.id],
    relationName: "wholesaler",
  }),
  retailer: one(users, {
    fields: [orders.retailerId],
    references: [users.id],
    relationName: "retailer",
  }),
  items: many(orderItems),
  activityLogs: many(quoteActivityLogs),
}));

export const quoteActivityLogsRelations = relations(quoteActivityLogs, ({ one }) => ({
  quote: one(orders, {
    fields: [quoteActivityLogs.quoteId],
    references: [orders.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const customerGroupsRelations = relations(customerGroups, ({ one, many }) => ({
  wholesaler: one(users, {
    fields: [customerGroups.wholesalerId],
    references: [users.id],
  }),
  members: many(customerGroupMembers),
}));

export const customerGroupMembersRelations = relations(customerGroupMembers, ({ one }) => ({
  group: one(customerGroups, {
    fields: [customerGroupMembers.groupId],
    references: [customerGroups.id],
  }),
  customer: one(users, {
    fields: [customerGroupMembers.customerId],
    references: [users.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  wholesaler: one(users, {
    fields: [stockMovements.wholesalerId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [stockMovements.orderId],
    references: [orders.id],
  }),
  businessProfile: one(businessProfiles, {
    fields: [stockMovements.businessProfileId],
    references: [businessProfiles.id],
  }),
  batch: one(productBatches, {
    fields: [stockMovements.batchId],
    references: [productBatches.id],
  }),
}));

export const broadcastsRelations = relations(broadcasts, ({ one }) => ({
  wholesaler: one(users, {
    fields: [broadcasts.wholesalerId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [broadcasts.productId],
    references: [products.id],
  }),
  customerGroup: one(customerGroups, {
    fields: [broadcasts.customerGroupId],
    references: [customerGroups.id],
  }),
}));

export const messageTemplatesRelations = relations(messageTemplates, ({ one, many }) => ({
  wholesaler: one(users, {
    fields: [messageTemplates.wholesalerId],
    references: [users.id],
  }),
  products: many(templateProducts),
  campaigns: many(templateCampaigns),
}));

export const templateProductsRelations = relations(templateProducts, ({ one }) => ({
  template: one(messageTemplates, {
    fields: [templateProducts.templateId],
    references: [messageTemplates.id],
  }),
  product: one(products, {
    fields: [templateProducts.productId],
    references: [products.id],
  }),
}));

export const templateCampaignsRelations = relations(templateCampaigns, ({ one, many }) => ({
  template: one(messageTemplates, {
    fields: [templateCampaigns.templateId],
    references: [messageTemplates.id],
  }),
  customerGroup: one(customerGroups, {
    fields: [templateCampaigns.customerGroupId],
    references: [customerGroups.id],
  }),
  wholesaler: one(users, {
    fields: [templateCampaigns.wholesalerId],
    references: [users.id],
  }),
  orders: many(campaignOrders),
}));

export const campaignOrdersRelations = relations(campaignOrders, ({ one }) => ({
  order: one(orders, {
    fields: [campaignOrders.orderId],
    references: [orders.id],
  }),
  campaign: one(templateCampaigns, {
    fields: [campaignOrders.campaignId],
    references: [templateCampaigns.id],
  }),
  template: one(messageTemplates, {
    fields: [campaignOrders.templateId],
    references: [messageTemplates.id],
  }),
}));

// User Badges types
export const insertUserBadgeSchema = createInsertSchema(userBadges);
export type InsertUserBadge = typeof userBadges.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;

// Onboarding Milestones types
export const insertOnboardingMilestoneSchema = createInsertSchema(onboardingMilestones);
export type InsertOnboardingMilestone = typeof onboardingMilestones.$inferInsert;
export type OnboardingMilestone = typeof onboardingMilestones.$inferSelect;

// Wholesaler-Customer Relationships types
export const insertWholesalerCustomerRelationshipSchema = createInsertSchema(wholesalerCustomerRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWholesalerCustomerRelationship = z.infer<typeof insertWholesalerCustomerRelationshipSchema>;
export type WholesalerCustomerRelationship = typeof wholesalerCustomerRelationships.$inferSelect;

// Customer Invitation Tokens types
export const insertCustomerInvitationTokenSchema = createInsertSchema(customerInvitationTokens).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerInvitationToken = z.infer<typeof insertCustomerInvitationTokenSchema>;
export type CustomerInvitationToken = typeof customerInvitationTokens.$inferSelect;



export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Transform numeric fields that should accept numbers from frontend
  unitSize: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  price: z.union([z.string(), z.number()]).transform((val) => val.toString()),
  promoPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),

  unitWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  totalPackageWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  
  // Pallet-related fields
  sellingFormat: z.enum(["units", "pallets", "both"]).optional(),
  palletPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  palletWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  palletMoq: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : null),
  palletStock: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : null),
  unitsPerPallet: z.union([z.string(), z.number(), z.null()])
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val === null || val === '') return undefined;
      const parsed = parseInt(val.toString());
      if (isNaN(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Units per pallet must be a valid number" });
        return z.NEVER;
      }
      return parsed;
    })
    .refine((val) => val === undefined || val >= 1, {
      message: "Units per pallet must be at least 1",
    }),
  
  // Fix integer fields to accept string inputs from frontend
  packQuantity: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : null),
  moq: z.union([z.string(), z.number()]).transform((val) => parseInt(val.toString())),
  stock: z.union([z.string(), z.number()]).transform((val) => parseInt(val.toString())),
  lowStockThreshold: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : 50),
  shelfLife: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : null),
  promotionalOffers: z.array(z.any()).optional().default([]),
  expiryDate: z.union([z.string(), z.null()]).optional().transform((val) => (val === "" || val === undefined) ? null : val),
  costPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val !== null && val !== undefined && val !== "" ? val.toString() : null),
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export const insertCustomerGroupSchema = createInsertSchema(customerGroups).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerGroup = z.infer<typeof insertCustomerGroupSchema>;
export type CustomerGroup = typeof customerGroups.$inferSelect;

export const insertBroadcastSchema = createInsertSchema(broadcasts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcasts.$inferSelect;

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type MessageTemplate = typeof messageTemplates.$inferSelect;

export const insertTemplateProductSchema = createInsertSchema(templateProducts).omit({
  id: true,
  createdAt: true,
});
export type InsertTemplateProduct = z.infer<typeof insertTemplateProductSchema>;
export type TemplateProduct = typeof templateProducts.$inferSelect;

export const insertTemplateCampaignSchema = createInsertSchema(templateCampaigns).omit({
  id: true,
  createdAt: true,
});
export type InsertTemplateCampaign = z.infer<typeof insertTemplateCampaignSchema>;
export type TemplateCampaign = typeof templateCampaigns.$inferSelect;

export const insertStockAlertSchema = createInsertSchema(stockAlerts).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});
export type InsertStockAlert = z.infer<typeof insertStockAlertSchema>;
export type StockAlert = typeof stockAlerts.$inferSelect;

export const insertCampaignOrderSchema = createInsertSchema(campaignOrders).omit({
  id: true,
  createdAt: true,
});
export type InsertCampaignOrder = z.infer<typeof insertCampaignOrderSchema>;
export type CampaignOrder = typeof campaignOrders.$inferSelect;

// Customer Registration Request schemas  
export const insertCustomerRegistrationRequestSchema = createInsertSchema(customerRegistrationRequests).omit({
  id: true,
  requestedAt: true,
  respondedAt: true,
});
export type InsertCustomerRegistrationRequest = z.infer<typeof insertCustomerRegistrationRequestSchema>;
export type CustomerRegistrationRequest = typeof customerRegistrationRequests.$inferSelect;

// Order Cancellation Request schemas
export const insertOrderCancellationRequestSchema = createInsertSchema(orderCancellationRequests).omit({
  id: true,
  requestedAt: true,
  respondedAt: true,
});
export type InsertOrderCancellationRequest = z.infer<typeof insertOrderCancellationRequestSchema>;
export type OrderCancellationRequest = typeof orderCancellationRequests.$inferSelect;

// Customer Profile Update Notification schemas
export const insertCustomerProfileUpdateNotificationSchema = createInsertSchema(customerProfileUpdateNotifications).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerProfileUpdateNotification = z.infer<typeof insertCustomerProfileUpdateNotificationSchema>;
export type SelectCustomerProfileUpdateNotification = typeof customerProfileUpdateNotifications.$inferSelect;

export const insertStockUpdateNotificationSchema = createInsertSchema(stockUpdateNotifications).omit({
  id: true,
  createdAt: true,
});
export type InsertStockUpdateNotification = z.infer<typeof insertStockUpdateNotificationSchema>;
export type StockUpdateNotification = typeof stockUpdateNotifications.$inferSelect;

// Promotion Analytics types
export const insertPromotionAnalyticsSchema = createInsertSchema(promotionAnalytics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPromotionAnalytics = z.infer<typeof insertPromotionAnalyticsSchema>;
export type PromotionAnalytics = typeof promotionAnalytics.$inferSelect;

export const insertProductPerformanceSummarySchema = createInsertSchema(productPerformanceSummary).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});
export type InsertProductPerformanceSummary = z.infer<typeof insertProductPerformanceSummarySchema>;
export type ProductPerformanceSummary = typeof productPerformanceSummary.$inferSelect;

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

// SMS Verification Codes schema
// Phone-only OTP verifications — used before wholesaler is known in the new login flow
export const customerPhoneVerifications = pgTable(
  "customer_phone_verifications",
  {
    id: serial("id").primaryKey(),
    phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
    code: varchar("code", { length: 6 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    isUsed: boolean("is_used").default(false).notNull(),
    usedAt: timestamp("used_at"),
    attempts: integer("attempts").default(0).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
  },
  (table) => ({
    phoneIdx: index("cpv_phone_idx").on(table.phoneNumber),
    codeIdx: index("cpv_code_idx").on(table.code),
    createdAtIdx: index("cpv_created_at_idx").on(table.createdAt),
  })
);

export const insertCustomerPhoneVerificationSchema = createInsertSchema(customerPhoneVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerPhoneVerification = z.infer<typeof insertCustomerPhoneVerificationSchema>;
export type CustomerPhoneVerification = typeof customerPhoneVerifications.$inferSelect;

export const insertSMSVerificationCodeSchema = createInsertSchema(smsVerificationCodes).omit({
  id: true,
  createdAt: true,
});
export type InsertSMSVerificationCode = z.infer<typeof insertSMSVerificationCodeSchema>;
export type SMSVerificationCode = typeof smsVerificationCodes.$inferSelect;

// Team Management Schema Types
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  invitedAt: true,
  joinedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// ============================================================================
// ENHANCED ANALYTICS TABLES (Non-breaking improvements)
// ============================================================================

// Customer insights and analytics table
export const customerInsights = pgTable("customer_insights", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull(), // Customer ID or email
  customerName: varchar("customer_name"),
  customerEmail: varchar("customer_email"),
  
  // Purchase behavior analytics
  totalOrders: integer("total_orders").default(0),
  totalSpent: decimal("total_spent", { precision: 12, scale: 2 }).default("0.00"),
  averageOrderValue: decimal("average_order_value", { precision: 10, scale: 2 }).default("0.00"),
  lastOrderDate: timestamp("last_order_date"),
  firstOrderDate: timestamp("first_order_date"),
  daysSinceLastOrder: integer("days_since_last_order").default(0),
  
  // Engagement metrics
  campaignsReceived: integer("campaigns_received").default(0),
  campaignsOpened: integer("campaigns_opened").default(0),
  purchasesFromCampaigns: integer("purchases_from_campaigns").default(0),
  
  // Product preferences
  favoriteCategory: varchar("favorite_category"),
  mostOrderedProductId: integer("most_ordered_product_id").references(() => products.id),
  totalUniqueProducts: integer("total_unique_products").default(0),
  
  // Customer scoring
  loyaltyScore: integer("loyalty_score").default(0), // 0-100 score
  riskLevel: varchar("risk_level").default("low"), // low, medium, high
  customerTier: varchar("customer_tier").default("standard"), // bronze, silver, gold, platinum
  
  // Predictive analytics
  predictedNextOrderDate: timestamp("predicted_next_order_date"),
  churnRisk: decimal("churn_risk", { precision: 5, scale: 2 }).default("0.00"), // 0-100%
  recommendedProducts: jsonb("recommended_products").default([]), // Array of product IDs
  
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Business intelligence aggregations table
export const businessIntelligence = pgTable("business_intelligence", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportDate: timestamp("report_date").notNull(), // Date this report covers
  reportType: varchar("report_type").notNull(), // daily, weekly, monthly, quarterly
  
  // Revenue metrics
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0.00"),
  totalOrders: integer("total_orders").default(0),
  averageOrderValue: decimal("average_order_value", { precision: 10, scale: 2 }).default("0.00"),
  
  // Product metrics
  topSellingProductId: integer("top_selling_product_id").references(() => products.id),
  topSellingProductRevenue: decimal("top_selling_product_revenue", { precision: 12, scale: 2 }).default("0.00"),
  totalProductsSold: integer("total_products_sold").default(0),
  
  // Customer metrics
  newCustomers: integer("new_customers").default(0),
  returningCustomers: integer("returning_customers").default(0),
  customerRetentionRate: decimal("customer_retention_rate", { precision: 5, scale: 2 }).default("0.00"),
  
  // Campaign performance
  campaignsSent: integer("campaigns_sent").default(0),
  campaignRevenue: decimal("campaign_revenue", { precision: 12, scale: 2 }).default("0.00"),
  campaignConversionRate: decimal("campaign_conversion_rate", { precision: 5, scale: 2 }).default("0.00"),
  
  // Growth metrics
  revenueGrowthRate: decimal("revenue_growth_rate", { precision: 5, scale: 2 }).default("0.00"),
  orderGrowthRate: decimal("order_growth_rate", { precision: 5, scale: 2 }).default("0.00"),
  customerGrowthRate: decimal("customer_growth_rate", { precision: 5, scale: 2 }).default("0.00"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory optimization insights table
export const inventoryInsights = pgTable("inventory_insights", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  
  // Sales velocity metrics
  dailyAverageSales: decimal("daily_average_sales", { precision: 8, scale: 2 }).default("0.00"),
  weeklyAverageSales: decimal("weekly_average_sales", { precision: 8, scale: 2 }).default("0.00"),
  monthlyAverageSales: decimal("monthly_average_sales", { precision: 8, scale: 2 }).default("0.00"),
  
  // Stock projections
  daysOfStockRemaining: integer("days_of_stock_remaining").default(0),
  suggestedReorderQuantity: integer("suggested_reorder_quantity").default(0),
  suggestedReorderDate: timestamp("suggested_reorder_date"),
  
  // Performance metrics
  turnoverRate: decimal("turnover_rate", { precision: 5, scale: 2 }).default("0.00"), // inventory turns per year
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }).default("0.00"), // percentage
  seasonalityIndex: decimal("seasonality_index", { precision: 5, scale: 2 }).default("1.00"), // 1.0 = normal
  
  // Optimization flags
  isSlowMoving: boolean("is_slow_moving").default(false),
  isFastMoving: boolean("is_fast_moving").default(false),
  isOverstocked: boolean("is_overstocked").default(false),
  isUnderstocked: boolean("is_understocked").default(false),
  
  // Cost analysis
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }), // COGS
  sellingPrice: decimal("selling_price", { precision: 10, scale: 2 }),
  grossProfitPerUnit: decimal("gross_profit_per_unit", { precision: 10, scale: 2 }),
  
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Financial performance tracking table
export const financialPerformance = pgTable("financial_performance", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  periodType: varchar("period_type").notNull(), // daily, weekly, monthly, quarterly, yearly
  
  // Revenue breakdown
  grossRevenue: decimal("gross_revenue", { precision: 12, scale: 2 }).default("0.00"),
  discountedRevenue: decimal("discounted_revenue", { precision: 12, scale: 2 }).default("0.00"),
  netRevenue: decimal("net_revenue", { precision: 12, scale: 2 }).default("0.00"),
  
  // Cost breakdown (when available)
  costOfGoodsSold: decimal("cost_of_goods_sold", { precision: 12, scale: 2 }).default("0.00"),
  grossProfit: decimal("gross_profit", { precision: 12, scale: 2 }).default("0.00"),
  grossProfitMargin: decimal("gross_profit_margin", { precision: 5, scale: 2 }).default("0.00"),
  
  // Transaction metrics
  totalTransactions: integer("total_transactions").default(0),
  averageTransactionValue: decimal("average_transaction_value", { precision: 10, scale: 2 }).default("0.00"),
  
  // Payment and fees
  stripeFees: decimal("stripe_fees", { precision: 10, scale: 2 }).default("0.00"),
  platformFees: decimal("platform_fees", { precision: 10, scale: 2 }).default("0.00"),
  netAfterFees: decimal("net_after_fees", { precision: 12, scale: 2 }).default("0.00"),
  
  // Comparative metrics
  previousPeriodRevenue: decimal("previous_period_revenue", { precision: 12, scale: 2 }),
  revenueGrowth: decimal("revenue_growth", { precision: 5, scale: 2 }).default("0.00"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Schema types for new analytics tables
export const insertCustomerInsightsSchema = createInsertSchema(customerInsights).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});
export type InsertCustomerInsights = z.infer<typeof insertCustomerInsightsSchema>;
export type CustomerInsights = typeof customerInsights.$inferSelect;

export const insertBusinessIntelligenceSchema = createInsertSchema(businessIntelligence).omit({
  id: true,
  createdAt: true,
});
export type InsertBusinessIntelligence = z.infer<typeof insertBusinessIntelligenceSchema>;
export type BusinessIntelligence = typeof businessIntelligence.$inferSelect;

export const insertInventoryInsightsSchema = createInsertSchema(inventoryInsights).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});
export type InsertInventoryInsights = z.infer<typeof insertInventoryInsightsSchema>;
export type InventoryInsights = typeof inventoryInsights.$inferSelect;

export const insertFinancialPerformanceSchema = createInsertSchema(financialPerformance).omit({
  id: true,
  createdAt: true,
});
export type InsertFinancialPerformance = z.infer<typeof insertFinancialPerformanceSchema>;
export type FinancialPerformance = typeof financialPerformance.$inferSelect;

// Delivery addresses table for customer address management
export const deliveryAddresses = pgTable("delivery_addresses", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Address details
  addressLine1: varchar("address_line1").notNull(),
  addressLine2: varchar("address_line2"),
  city: varchar("city").notNull(),
  state: varchar("state"),
  postalCode: varchar("postal_code").notNull(),
  country: varchar("country").notNull().default("United Kingdom"),
  
  // Metadata
  label: varchar("label"), // e.g., "Home", "Office", "Warehouse"
  instructions: text("instructions"), // Special delivery instructions
  isDefault: boolean("is_default").default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  customerIdIdx: index("delivery_addresses_customer_id_idx").on(table.customerId),
}));

// Customer-Wholesaler Relationships Table - Support shared customers across multiple wholesalers
export const customerWholesalerRelationships = pgTable("customer_wholesaler_relationships", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Relationship metadata
  relationshipType: varchar("relationship_type").default("standard"), // standard, preferred, exclusive
  addedBy: varchar("added_by").references(() => users.id), // Who added this relationship
  notes: text("notes"), // Optional notes about the relationship
  
  // Status
  isActive: boolean("is_active").default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Price Lists feature
export const priceLists = pgTable("price_lists", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").default(true).notNull(),
  isLocked: boolean("is_locked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("price_lists_wholesaler_id_idx").on(table.wholesalerId),
}));

export const priceListItems = pgTable("price_list_items", {
  id: serial("id").primaryKey(),
  priceListId: integer("price_list_id").notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customPrice: decimal("custom_price", { precision: 10, scale: 2 }),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),
  customPalletPrice: decimal("custom_pallet_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  priceListIdIdx: index("price_list_items_list_id_idx").on(table.priceListId),
  productIdIdx: index("price_list_items_product_id_idx").on(table.productId),
}));

export const priceListAssignments = pgTable("price_list_assignments", {
  id: serial("id").primaryKey(),
  priceListId: integer("price_list_id").notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => users.id, { onDelete: "cascade" }),
  customerGroupId: integer("customer_group_id").references(() => customerGroups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  priceListIdIdx: index("price_list_assignments_list_id_idx").on(table.priceListId),
}));

export const insertPriceListSchema = createInsertSchema(priceLists).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPriceList = z.infer<typeof insertPriceListSchema>;
export type PriceList = typeof priceLists.$inferSelect;

export const insertPriceListItemSchema = createInsertSchema(priceListItems).omit({ id: true, createdAt: true });
export type InsertPriceListItem = z.infer<typeof insertPriceListItemSchema>;
export type PriceListItem = typeof priceListItems.$inferSelect;

export const insertPriceListAssignmentSchema = createInsertSchema(priceListAssignments).omit({ id: true, createdAt: true });
export type InsertPriceListAssignment = z.infer<typeof insertPriceListAssignmentSchema>;
export type PriceListAssignment = typeof priceListAssignments.$inferSelect;

// Tab permissions types
export const insertTabPermissionSchema = createInsertSchema(tabPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTabPermission = z.infer<typeof insertTabPermissionSchema>;
export type TabPermission = typeof tabPermissions.$inferSelect;

// Delivery addresses types
export const insertDeliveryAddressSchema = createInsertSchema(deliveryAddresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeliveryAddress = z.infer<typeof insertDeliveryAddressSchema>;
export type DeliveryAddress = typeof deliveryAddresses.$inferSelect;

// Collection Addresses — wholesaler-owned pickup locations
export const collectionAddresses = pgTable("collection_addresses", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  addressLine1: varchar("address_line1").notNull(),
  addressLine2: varchar("address_line2"),
  city: varchar("city").notNull(),
  postcode: varchar("postcode").notNull(),
  country: varchar("country").notNull().default("United Kingdom"),
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  wholesalerIdIdx: index("collection_addresses_wholesaler_id_idx").on(table.wholesalerId),
}));

export const insertCollectionAddressSchema = createInsertSchema(collectionAddresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCollectionAddress = z.infer<typeof insertCollectionAddressSchema>;
export type CollectionAddress = typeof collectionAddresses.$inferSelect;

// Platform Fee Configuration — append-only audit log of customer fee changes
// Stripe webhook idempotency — prevents duplicate event processing on retries
export const stripeProcessedEvents = pgTable("stripe_processed_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const platformFeeConfigs = pgTable("platform_fee_configs", {
  id: serial("id").primaryKey(),
  customerPercentageFee: decimal("customer_percentage_fee", { precision: 5, scale: 4 }).notNull(), // e.g. 0.0150 for 1.5%
  customerFixedFee: decimal("customer_fixed_fee", { precision: 6, scale: 2 }).notNull(), // e.g. 0.50 for £0.50
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 4 }), // e.g. 0.0150 for 1.5%; null = use hardcoded default
  notes: varchar("notes"), // optional admin note explaining the change
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  createdBy: varchar("created_by").notNull(), // admin identifier
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlatformFeeConfigSchema = createInsertSchema(platformFeeConfigs).omit({
  id: true,
  effectiveFrom: true,
  createdAt: true,
});
export type InsertPlatformFeeConfig = z.infer<typeof insertPlatformFeeConfigSchema>;
export type PlatformFeeConfig = typeof platformFeeConfigs.$inferSelect;

// Customer-Wholesaler Relationships types
export const insertCustomerWholesalerRelationshipSchema = createInsertSchema(customerWholesalerRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomerWholesalerRelationship = z.infer<typeof insertCustomerWholesalerRelationshipSchema>;
export type CustomerWholesalerRelationship = typeof customerWholesalerRelationships.$inferSelect;

// Subscription types
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;

// ─── Picking / Checklist ─────────────────────────────────────────────────────
// Two additive tables — no existing tables touched.
// order_picking  : one row per order; tracks overall picking status + audit trail
// order_item_picks: one row per order_item; tracks per-item pick state

export const orderPicking = pgTable("order_picking", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  pickingStatus: varchar("picking_status", { length: 20 }).notNull().default("not_started"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 255 }),
  resetAt: timestamp("reset_at"),
  resetBy: varchar("reset_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("order_picking_order_id_idx").on(table.orderId),
}));

export const orderItemPicks = pgTable("order_item_picks", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  isPicked: boolean("is_picked").notNull().default(false),
  pickedAt: timestamp("picked_at"),
  pickedBy: varchar("picked_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("order_item_picks_order_id_idx").on(table.orderId),
  orderItemIdIdx: index("order_item_picks_item_id_idx").on(table.orderItemId),
}));

export const insertOrderPickingSchema = createInsertSchema(orderPicking).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrderPicking = z.infer<typeof insertOrderPickingSchema>;
export type OrderPicking = typeof orderPicking.$inferSelect;

export const insertOrderItemPickSchema = createInsertSchema(orderItemPicks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrderItemPick = z.infer<typeof insertOrderItemPickSchema>;
export type OrderItemPick = typeof orderItemPicks.$inferSelect;

// Public store enquiries (leads from the public storefront)
export const storeEnquiries = pgTable("store_enquiries", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull(),
  enquirerName: varchar("enquirer_name", { length: 255 }),
  enquirerEmail: varchar("enquirer_email", { length: 255 }),
  enquirerPhone: varchar("enquirer_phone", { length: 50 }),
  enquirerBusiness: varchar("enquirer_business", { length: 255 }),
  businessType: varchar("business_type", { length: 100 }),
  estimatedOrderVolume: varchar("estimated_order_volume", { length: 50 }),
  preferredContact: varchar("preferred_contact", { length: 20 }),
  message: text("message"),
  productId: integer("product_id"),
  productName: varchar("product_name", { length: 255 }),
  quantity: integer("quantity"),
  status: varchar("status", { length: 20 }).default('new'), // 'new' | 'viewed' | 'responded'
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStoreEnquirySchema = createInsertSchema(storeEnquiries).omit({ id: true, createdAt: true });
export type InsertStoreEnquiry = z.infer<typeof insertStoreEnquirySchema>;
export type StoreEnquiry = typeof storeEnquiries.$inferSelect;

// User types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UpsertUser = Omit<InsertUser, 'createdAt' | 'updatedAt'> & {
  id: string; // Make id required for upserts
};


