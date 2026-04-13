import type { Express } from "express";
import {
  db, storage, eq, and, or, desc, asc, inArray, gt, lt, gte, lte, ne, isNull, like, sql, count, sum,
  users, orders, orderItems, products, customerGroups, customerGroupMembers,
  smsVerificationCodes, customerRegistrationRequests, campaignOrders, subscriptionPlans,
  userSubscriptions, stockMovements, orderCancellationRequests,
  wholesalerCustomerRelationships, teamMembers,
  insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema,
  insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema,
  insertSMSVerificationCodeSchema, insertCustomerRegistrationRequestSchema,
  requireAuth, isAuthenticated, z,
  stripe, openai, sgMail, twilio,
  requireNotViewer, enforceNewPlanLimits, getProjectedDowngradeImpact,
  orderPhotoUpload, sendCustomerInvoiceEmail, buildInvoicePdf, sendRefundReceipt,
  createStripeRefundReceipt, generateOrderNotificationMessage, isInvitationExpired,
  sendWelcomeEmail, passwordResetAttempts, ADMIN_EMAILS, geocodePostcode,
  PLAN_ENFORCEMENT_LIMITS, getProductLimit, getCustomerGroupLimit, getBroadcastLimit,
  getCustomersPerGroupLimit, getTeamMemberLimit,
  generateOrderNumber, formatNumber, parseCustomerName, generateStockUpdateMessage,
  sendTeamInvitationEmail, refundAcrossPaymentIntents, parseAddressForEmail, extractSessionId,
  getCurrencySymbol, formatPhoneToInternational, validatePhoneNumber,
  InventoryCalculator, PreciseShippingCalculator, healthCheck, parcel2goService,
  whatsAppBusinessService, SubscriptionService, requireFeatureAccess,
  requireProductLimits, requireBroadcastLimits, requireTeamMemberLimits, getUserPlanLimits,
  ReliableSMSService, sendSMS, sendEmail,
  generateResetToken, createResetExpiration, sendPasswordResetEmail, hashResetToken,
  createEmailVerification, verifyEmailCode, validatePassword, hashPassword, verifyPassword,
  getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser,
  generateProductDescription, generateProductImage, generatePersonalizedTagline,
  generateCampaignSuggestions, optimizeMessageTiming,
  generateWholesalerOrderNotificationEmail, generateReadyForCollectionEmail,
  wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge, emailDivider,
  getEmailLogoUrl, buildItemisedRefundEmail, generateDowngradeScheduledEmail,
  generateDowngradeEffectiveEmail, sendWelcomeMessages,
  orderNotificationService, quickOrderService, multiWholesalerService,
  getEmailDeliveryAddress, queryOptimizer, queryCache, performanceMiddleware,
  multer, sharp, compression, cookieParser,
} from "./shared";

export function registerAdvertisingRoutes(app: Express): void {
  // GET /api/advertising/campaigns
  app.get("/api/advertising/campaigns", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // Mock data for now - will be replaced with database queries
      const campaigns = [
        {
          id: "camp_001",
          name: "Holiday Special Products",
          type: "featured_product",
          status: "active",
          budget: 150,
          spent: 89.50,
          impressions: 12500,
          clicks: 425,
          conversions: 23,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000).toISOString(),
          targetAudience: {
            location: ["London", "Manchester"],
            categories: ["Groceries & Food"],
            businessTypes: ["Restaurant", "Retail Store"]
          }
        },
        {
          id: "camp_002",
          name: "Fresh Produce Spotlight",
          type: "category_sponsor",
          status: "active",
          budget: 200,
          spent: 134.25,
          impressions: 8900,
          clicks: 312,
          conversions: 18,
          startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString(),
          targetAudience: {
            location: ["Birmingham", "Leeds"],
            categories: ["Fresh Produce"],
            businessTypes: ["Restaurant"]
          }
        }
      ];

      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching advertising campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // POST /api/advertising/campaigns
  app.post("/api/advertising/campaigns", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { name, type, budget, duration, targetAudience } = req.body;

      // For now, return mock response - will implement database storage
      const newCampaign = {
        id: `camp_${Date.now()}`,
        name,
        type,
        status: "draft",
        budget: parseFloat(budget),
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + (parseInt(duration) || 30) * 24 * 60 * 60 * 1000).toISOString(),
        targetAudience: targetAudience || {}
      };

      res.json(newCampaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // GET /api/advertising/seo-pages
  app.get("/api/advertising/seo-pages", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // Get actual products for this wholesaler
      const products = await storage.getProducts(targetUserId);
      
      // Generate SEO page data based on actual products
      const seoPages = products.slice(0, 3).map(product => ({
        id: `seo_${product.id}`,
        productId: product.id,
        productName: product.name,
        slug: product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        metaTitle: `${product.name} - Wholesale Supplier | Quikpik`,
        metaDescription: `Premium ${product.name} available for wholesale. ${product.description?.slice(0, 120) || 'Quality products from trusted suppliers.'}...`,
        views: Math.floor(Math.random() * 500) + 50,
        leads: Math.floor(Math.random() * 20) + 2,
        status: "published" as const
      }));

      res.json(seoPages);
    } catch (error) {
      console.error("Error fetching SEO pages:", error);
      res.status(500).json({ message: "Failed to fetch SEO pages" });
    }
  });

  // POST /api/advertising/seo-pages
  app.post("/api/advertising/seo-pages", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { productId } = req.body;

      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      const seoPage = {
        id: `seo_${productId}`,
        productId: product.id,
        productName: product.name,
        slug: product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        metaTitle: `${product.name} - Wholesale Supplier | Quikpik`,
        metaDescription: `Premium ${product.name} available for wholesale. ${product.description?.slice(0, 120) || 'Quality products from trusted suppliers.'}...`,
        views: 0,
        leads: 0,
        status: "published"
      };

      res.json(seoPage);
    } catch (error) {
      console.error("Error creating SEO page:", error);
      res.status(500).json({ message: "Failed to create SEO page" });
    }
  });

}
