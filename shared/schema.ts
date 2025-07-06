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
  
  // WhatsApp/Twilio fields
  twilioPhoneNumber: varchar("twilio_phone_number"), // WhatsApp-enabled phone number from Twilio
  twilioAccountSid: varchar("twilio_account_sid"), // Twilio subaccount SID for this wholesaler
  twilioAuthToken: varchar("twilio_auth_token"), // Twilio auth token for this wholesaler
  whatsappEnabled: boolean("whatsapp_enabled").default(false), // Whether WhatsApp is set up
  
  // WhatsApp Business API fields (direct integration)
  whatsappBusinessPhone: varchar("whatsapp_business_phone"), // WhatsApp Business phone number
  whatsappApiToken: varchar("whatsapp_api_token"), // WhatsApp Business API token
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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("GBP"), // ISO currency code
  moq: integer("moq").notNull().default(1), // minimum order quantity
  stock: integer("stock").notNull().default(0),
  imageUrl: varchar("image_url"),
  category: varchar("category"),
  status: varchar("status").notNull().default("active"), // 'active' | 'inactive' | 'out_of_stock'
  priceVisible: boolean("price_visible").notNull().default(true),
  negotiationEnabled: boolean("negotiation_enabled").notNull().default(false),
  minimumBidPrice: decimal("minimum_bid_price", { precision: 10, scale: 2 }), // Lowest acceptable bid price
  editCount: integer("edit_count").notNull().default(0), // Track number of edits made
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
  status: varchar("status").notNull().default("pending"), // 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled'
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  customerGroups: many(customerGroups),
  ordersAsWholesaler: many(orders, { relationName: "wholesaler" }),
  ordersAsRetailer: many(orders, { relationName: "retailer" }),
  negotiations: many(negotiations),
  groupMemberships: many(customerGroupMembers),
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

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;
