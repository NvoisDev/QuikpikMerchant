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
  
  // Stripe fields
  stripeAccountId: varchar("stripe_account_id"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  
  // Subscription fields
  subscriptionTier: varchar("subscription_tier").default("free"), // 'free', 'standard', 'premium'
  subscriptionStatus: varchar("subscription_status").default("inactive"), // 'active', 'inactive', 'canceled'
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  productLimit: integer("product_limit").default(3), // 3 for free, 10 for standard, unlimited (-1) for premium
  
  // Settings
  preferredCurrency: varchar("preferred_currency").default("GBP"), // ISO currency code
  timezone: varchar("timezone").default("UTC"),
  phoneNumber: varchar("phone_number"),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customerGroups = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerGroupMembers = pgTable("customer_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => customerGroups.id),
  customerId: varchar("customer_id").notNull().references(() => users.id),
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
