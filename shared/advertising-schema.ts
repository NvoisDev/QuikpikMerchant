import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, decimal, integer, timestamp, json, pgEnum, boolean } from "drizzle-orm/pg-core";

// Database schema for advertising campaigns
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'active', 'paused', 'completed', 'cancelled']);
export const campaignTypeEnum = pgEnum('campaign_type', ['featured_product', 'category_sponsor', 'banner_ad', 'location_boost', 'social_media', 'seo_boost']);

export const advertisingCampaigns = pgTable('advertising_campaigns', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  wholesalerId: text('wholesaler_id').notNull(),
  name: text('name').notNull(),
  type: campaignTypeEnum('type').notNull(),
  status: campaignStatusEnum('status').notNull().default('draft'),
  budget: decimal('budget', { precision: 10, scale: 2 }).notNull(),
  spent: decimal('spent', { precision: 10, scale: 2 }).notNull().default('0'),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  targetAudience: json('target_audience').$type<{
    location?: string[];
    categories?: string[];
    businessTypes?: string[];
    demographics?: {
      ageRange?: [number, number];
      businessSize?: string[];
    };
  }>(),
  productIds: json('product_ids').$type<string[]>(),
  adCreative: json('ad_creative').$type<{
    headline?: string;
    description?: string;
    images?: string[];
    callToAction?: string;
  }>(),
  metrics: json('metrics').$type<{
    ctr?: number; // Click-through rate
    cpc?: number; // Cost per click  
    cpm?: number; // Cost per mille (thousand impressions)
    roi?: number; // Return on investment
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// SEO-optimized public product pages
export const seoProductPages = pgTable('seo_product_pages', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  productId: text('product_id').notNull(),
  wholesalerId: text('wholesaler_id').notNull(),
  slug: text('slug').notNull().unique(),
  metaTitle: text('meta_title').notNull(),
  metaDescription: text('meta_description').notNull(),
  metaKeywords: json('meta_keywords').$type<string[]>(),
  structuredData: json('structured_data').$type<{
    "@context": string;
    "@type": string;
    name: string;
    description: string;
    offers: {
      "@type": string;
      price: string;
      priceCurrency: string;
      availability: string;
    };
    brand?: {
      "@type": string;
      name: string;
    };
  }>(),
  content: json('content').$type<{
    sections: {
      title: string;
      content: string;
      type: 'text' | 'list' | 'table' | 'specifications';
    }[];
  }>(),
  views: integer('views').notNull().default(0),
  leads: integer('leads').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  lastCrawled: timestamp('last_crawled'),
  status: text('status').notNull().default('published'), // published, draft, archived
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Social media integration tracking
export const socialMediaPosts = pgTable('social_media_posts', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  wholesalerId: text('wholesaler_id').notNull(),
  campaignId: integer('campaign_id').references(() => advertisingCampaigns.id),
  productId: text('product_id'),
  platform: text('platform').notNull(), // facebook, instagram, linkedin, twitter
  postId: text('post_id'), // Platform-specific post ID
  content: json('content').$type<{
    text: string;
    images?: string[];
    hashtags?: string[];
    mentions?: string[];
  }>(),
  metrics: json('metrics').$type<{
    likes?: number;
    shares?: number;
    comments?: number;
    reach?: number;
    engagement?: number;
  }>(),
  publishedAt: timestamp('published_at'),
  status: text('status').notNull().default('scheduled'), // scheduled, published, failed
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Lead generation and inquiries from advertising
export const advertisingLeads = pgTable('advertising_leads', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  wholesalerId: text('wholesaler_id').notNull(),
  campaignId: integer('campaign_id').references(() => advertisingCampaigns.id),
  productId: text('product_id'),
  source: text('source').notNull(), // seo_page, social_media, marketplace_ad, direct_inquiry
  leadData: json('lead_data').$type<{
    name: string;
    email: string;
    phone?: string;
    company?: string;
    message: string;
    quantity?: number;
    budget?: number;
  }>(),
  status: text('status').notNull().default('new'), // new, contacted, qualified, converted, closed
  quality: text('quality').default('unknown'), // hot, warm, cold, unknown
  followUpDate: timestamp('follow_up_date'),
  notes: text('notes'),
  convertedAt: timestamp('converted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Zod schemas for validation
export const insertAdvertisingCampaignSchema = createInsertSchema(advertisingCampaigns);
export const insertSeoProductPageSchema = createInsertSchema(seoProductPages);
export const insertSocialMediaPostSchema = createInsertSchema(socialMediaPosts);
export const insertAdvertisingLeadSchema = createInsertSchema(advertisingLeads);

export type AdvertisingCampaign = typeof advertisingCampaigns.$inferSelect;
export type InsertAdvertisingCampaign = z.infer<typeof insertAdvertisingCampaignSchema>;
export type SeoProductPage = typeof seoProductPages.$inferSelect;
export type InsertSeoProductPage = z.infer<typeof insertSeoProductPageSchema>;
export type SocialMediaPost = typeof socialMediaPosts.$inferSelect;
export type InsertSocialMediaPost = z.infer<typeof insertSocialMediaPostSchema>;
export type AdvertisingLead = typeof advertisingLeads.$inferSelect;
export type InsertAdvertisingLead = z.infer<typeof insertAdvertisingLeadSchema>;

// API response types
export interface CampaignAnalytics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalBudget: number;
  totalSpent: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  averageCTR: number;
  averageCPC: number;
  totalROI: number;
}

export interface SEOPerformance {
  totalPages: number;
  totalViews: number;
  totalLeads: number;
  averagePageViews: number;
  topPerformingPages: {
    slug: string;
    productName: string;
    views: number;
    leads: number;
    conversionRate: number;
  }[];
}

export interface SocialMediaMetrics {
  totalPosts: number;
  totalReach: number;
  totalEngagement: number;
  platformBreakdown: {
    platform: string;
    posts: number;
    reach: number;
    engagement: number;
  }[];
}