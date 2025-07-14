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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Promotional offer types
export type PromotionalOfferType = 
  | 'percentage_discount'    // 10% off
  | 'fixed_amount_discount'  // £5 off
  | 'bogo'                   // Buy one get one free
  | 'buy_x_get_y_free'       // Buy 2 get 1 free, Buy 3 get 2 free, etc.
  | 'bulk_discount'          // Tiered pricing: 10+ items = 5% off, 50+ items = 10% off
  | 'fixed_price'            // Set fixed promotional price
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
  
  createdAt: string;
  updatedAt: string;
}

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
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  role: varchar("role").notNull().default("wholesaler"), // 'wholesaler' | 'retailer'
  businessName: varchar("business_name"),
  businessAddress: varchar("business_address"),
  businessPhone: varchar("business_phone"),
  logoUrl: varchar("logo_url"), // Custom uploaded logo
  logoType: varchar("logo_type").default("initials"), // 'initials', 'business_name', 'uploaded'
  
  // Stripe fields
  stripeAccountId: varchar("stripe_account_id"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  
  // Subscription fields
  subscriptionTier: varchar("subscription_tier").default("free"), // 'free', 'standard', 'premium'
  subscriptionStatus: varchar("subscription_status").default("inactive"), // 'active', 'inactive', 'canceled'
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  productLimit: integer("product_limit").default(3), // 3 for free, 10 for standard, unlimited (-1) for premium
  
  // WhatsApp Integration - Dual Provider Support
  whatsappProvider: varchar("whatsapp_provider").default("twilio"), // 'twilio' | 'direct'
  whatsappEnabled: boolean("whatsapp_enabled").default(false), // Whether WhatsApp is set up
  
  // Twilio WhatsApp fields
  twilioPhoneNumber: varchar("twilio_phone_number"), // WhatsApp-enabled phone number from Twilio
  twilioAccountSid: varchar("twilio_account_sid"), // Twilio subaccount SID for this wholesaler
  twilioAuthToken: varchar("twilio_auth_token"), // Twilio auth token for this wholesaler
  
  // Direct WhatsApp Business API fields
  whatsappBusinessPhoneId: varchar("whatsapp_business_phone_id"), // WhatsApp Business Phone Number ID
  whatsappAccessToken: text("whatsapp_access_token"), // WhatsApp Business API Access Token
  whatsappAppId: varchar("whatsapp_app_id"), // WhatsApp Business App ID
  whatsappBusinessPhone: varchar("whatsapp_business_phone"), // Display phone number
  whatsappBusinessName: varchar("whatsapp_business_name"), // Display name for WhatsApp messages
  
  // Settings
  preferredCurrency: varchar("preferred_currency").default("GBP"), // ISO currency code
  timezone: varchar("timezone").default("UTC"),
  phoneNumber: varchar("phone_number"),
  
  // Address fields for delivery/billing
  streetAddress: varchar("street_address"),
  city: varchar("city"),
  state: varchar("state"),
  postalCode: varchar("postal_code"),
  country: varchar("country").default("United Kingdom"),
  
  notificationPreferences: jsonb("notification_preferences").default({
    email: true,
    sms: true,
    orderUpdates: true,
    stockAlerts: true,
    marketingEmails: false
  }),
  
  storeTagline: varchar("store_tagline").default("Premium wholesale products"), // Customizable customer portal tagline
  
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
  pickupAddress: text("pickup_address"), // Address for customer pickup
  pickupInstructions: text("pickup_instructions"), // Special pickup instructions
  
  // Password field for team members
  passwordHash: varchar("password_hash"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Team members table for multi-user access
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").notNull().default("member"), // owner, admin, member
  permissions: jsonb("permissions").default({}), // JSON object with permission flags
  status: varchar("status").notNull().default("pending"), // pending, active, suspended
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

// Gamification: User badges and achievements tracking
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
  // promotionalOffers: jsonb("promotional_offers").$type<PromotionalOffer[]>().default([]),
  currency: varchar("currency").default("GBP"), // ISO currency code
  moq: integer("moq").notNull().default(1), // minimum order quantity
  stock: integer("stock").notNull().default(0),
  imageUrl: varchar("image_url"), // Primary image (for backward compatibility)
  images: jsonb("images").default([]), // Array of image URLs for multiple images
  category: varchar("category"),
  status: varchar("status").notNull().default("active"), // 'active' | 'inactive' | 'out_of_stock'
  priceVisible: boolean("price_visible").notNull().default(true),
  negotiationEnabled: boolean("negotiation_enabled").notNull().default(false),
  minimumBidPrice: decimal("minimum_bid_price", { precision: 10, scale: 2 }), // Lowest acceptable bid price
  editCount: integer("edit_count").notNull().default(0), // Track number of edits made
  lowStockThreshold: integer("low_stock_threshold").notNull().default(50), // Alert when stock falls below this number
  
  // Global fulfillment exclusion - if true, this product cannot be delivered (pickup only)
  deliveryExcluded: boolean("delivery_excluded").default(false),
  
  // Units and measurements
  unit: varchar("unit").default("units"), // Base unit of measure (kg, g, l, ml, cl, pieces, boxes, etc.)
  unitFormat: varchar("unit_format"), // Display format like "12 x 24g", "6 x 500ml", "24 pieces"
  
  // New flexible unit system
  packQuantity: integer("pack_quantity"), // e.g., 24 (for "24 x 250ml")
  unitOfMeasure: varchar("unit_of_measure", { length: 20 }), // e.g., "ml", "g", "pieces"
  unitSize: decimal("unit_size", { precision: 10, scale: 3 }), // e.g., 250 (for "24 x 250ml")
  
  // Weight and dimensions for shipping (based on flexible unit configuration)
  unitWeight: decimal("unit_weight", { precision: 10, scale: 3 }), // Weight per individual unit in kg
  totalPackageWeight: decimal("total_package_weight", { precision: 10, scale: 3 }), // Total weight of full package (packQuantity * unitSize * unitWeight)
  packageDimensions: jsonb("package_dimensions").default({}), // {length: cm, width: cm, height: cm} for the complete package
  
  // Temperature and special handling requirements
  temperatureRequirement: varchar("temperature_requirement").default("ambient"), // 'frozen', 'chilled', 'ambient'
  specialHandling: jsonb("special_handling").default({}), // {fragile: boolean, hazardous: boolean, perishable: boolean}
  shelfLife: integer("shelf_life"), // Days before expiry
  contentCategory: varchar("content_category").default("general"), // 'food', 'pharmaceuticals', 'electronics', 'textiles', 'general'
  

  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customerGroups = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  whatsappGroupId: varchar("whatsapp_group_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerGroupMembers = pgTable("customer_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => customerGroups.id),
  customerId: varchar("customer_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  createdAt: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  retailerId: varchar("retailer_id").notNull().references(() => users.id),
  customerName: varchar("customer_name"), // Store customer name for guest checkouts
  customerEmail: varchar("customer_email"), // Store customer email for guest checkouts
  customerPhone: varchar("customer_phone"), // Store customer phone for guest checkouts
  status: varchar("status").notNull().default("pending"), // 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled'
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  deliveryAddress: text("delivery_address"),
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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
});

export const negotiations = pgTable("negotiations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  retailerId: varchar("retailer_id").notNull().references(() => users.id),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }).notNull(),
  offeredPrice: decimal("offered_price", { precision: 10, scale: 2 }).notNull(),
  counterPrice: decimal("counter_price", { precision: 10, scale: 2 }),
  status: varchar("status").notNull().default("pending"), // 'pending' | 'accepted' | 'declined' | 'countered'
  quantity: integer("quantity").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
});

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



// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  customerGroups: many(customerGroups),
  ordersAsWholesaler: many(orders, { relationName: "wholesaler" }),
  ordersAsRetailer: many(orders, { relationName: "retailer" }),
  negotiations: many(negotiations),
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
  negotiations: many(negotiations),
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
}));

export const negotiationsRelations = relations(negotiations, ({ one }) => ({
  product: one(products, {
    fields: [negotiations.productId],
    references: [products.id],
  }),
  retailer: one(users, {
    fields: [negotiations.retailerId],
    references: [users.id],
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

// Schema types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// User Badges types
export const insertUserBadgeSchema = createInsertSchema(userBadges);
export type InsertUserBadge = typeof userBadges.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;

// Onboarding Milestones types
export const insertOnboardingMilestoneSchema = createInsertSchema(onboardingMilestones);
export type InsertOnboardingMilestone = typeof onboardingMilestones.$inferInsert;
export type OnboardingMilestone = typeof onboardingMilestones.$inferSelect;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

export type TabPermission = typeof tabPermissions.$inferSelect;
export type InsertTabPermission = typeof tabPermissions.$inferInsert;

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Transform numeric fields that should accept numbers from frontend
  unitSize: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  price: z.union([z.string(), z.number()]).transform((val) => val.toString()),
  promoPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),

  minimumBidPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  unitWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  totalPackageWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : null),
  // Fix integer fields to accept string inputs from frontend
  packQuantity: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : null),
  moq: z.union([z.string(), z.number()]).transform((val) => parseInt(val.toString())),
  stock: z.union([z.string(), z.number()]).transform((val) => parseInt(val.toString())),
  lowStockThreshold: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : 50),
  shelfLife: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? parseInt(val.toString()) : null),
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

export const insertNegotiationSchema = createInsertSchema(negotiations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNegotiation = z.infer<typeof insertNegotiationSchema>;
export type Negotiation = typeof negotiations.$inferSelect;

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

// Team Management Schema Types
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  inviteToken: true,
  invitedAt: true,
  joinedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;


