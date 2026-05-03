/**
 * marketplace-utils.ts
 *
 * Utility / miscellaneous routes for the customer-facing marketplace.
 * Extracted from marketplace.ts — behaviour is unchanged.
 *
 * Routes registered here:
 *   GET  /api/config/customer-fee
 *   GET  /api/customer-accessible-wholesalers/:phoneNumber
 *   GET  /api/customer/registration-status
 *   POST /api/customer/request-wholesaler-access
 *   GET  /api/dashboard/multi-wholesaler-stats
 *   GET  /api/customer/wholesalers
 */
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { getCurrentFeeConfig } from "../utils/fee-config";
import {
  db, emailButton, emailCard, emailHeading, formatPhoneToInternational,
  getEmailLogoUrl, getStripeClient, multiWholesalerService,
  requireAuth, sendEmail, storage, wrapCustomerEmail,
} from "./shared";

// Same settings as customerActionLimiter in marketplace.ts
const customerActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/** Escapes characters that have special meaning in HTML to prevent XSS in email templates. */
function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function registerUtilityRoutes(app: Express): void {

  // GET /api/config/customer-fee — public, no auth required
  // Returns the live customer transaction fee config so the checkout dialog
  // can display the correct fee instead of using hardcoded defaults.
  // Optional ?wholesalerId= query param — when provided, also returns feesEnabled
  // (true only when the wholesaler's Stripe account has charges_enabled && payouts_enabled).
  app.get('/api/config/customer-fee', async (req: any, res) => {
    try {
      const config = await getCurrentFeeConfig();
      const { wholesalerId } = req.query as { wholesalerId?: string };

      let feesEnabled = false;

      if (wholesalerId) {
        try {
          const wholesaler = await storage.getUser(wholesalerId);
          if (wholesaler?.stripeAccountId) {
            const stripeClient = getStripeClient(Boolean(wholesaler.isTestAccount));
            const account = await stripeClient.accounts.retrieve(wholesaler.stripeAccountId);
            feesEnabled = account.charges_enabled && account.payouts_enabled;
          }
        } catch (stripeErr) {
          console.warn('[/api/config/customer-fee] Could not determine Stripe status — defaulting feesEnabled=false:', stripeErr);
          feesEnabled = false;
        }
      }

      res.json({ percentage: config.percentage, fixed: config.fixed, feesEnabled });
    } catch (err) {
      console.error('[/api/config/customer-fee] error:', err);
      res.status(500).json({ percentage: 0.055, fixed: 0.50, feesEnabled: false });
    }
  });

  // GET /api/customer-accessible-wholesalers/:phoneNumber
  app.get('/api/customer-accessible-wholesalers/:phoneNumber', async (req, res) => {
    try {
      const phoneNumber = req.params.phoneNumber;
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);

      // Get all wholesalers where this customer is registered
      const accessibleWholesalers = await storage.getWholesalersForCustomer(lastFourDigits);
      
      res.json(accessibleWholesalers);
    } catch (error) {
      console.error("Error fetching accessible wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch accessible wholesalers" });
    }
  });

  // GET /api/customer/registration-status?wholesalerId=X&phone=Y
  // Lightweight check so the registration form can detect a pending request up-front.
  app.get("/api/customer/registration-status", customerActionLimiter, async (req, res) => {
    try {
      const wholesalerId = req.query.wholesalerId as string;
      const phone = req.query.phone as string;
      if (!wholesalerId || !phone) {
        return res.status(400).json({ error: "wholesalerId and phone are required" });
      }
      const normalizedPhone = formatPhoneToInternational(phone);
      if (!normalizedPhone) {
        return res.json({ status: 'none' });
      }
      const existing = await storage.getCustomerRegistrationRequest(wholesalerId, normalizedPhone);
      if (!existing) {
        return res.json({ status: 'none' });
      }
      return res.json({ status: existing.status });
    } catch (error) {
      console.error("Registration status check error:", error);
      return res.status(500).json({ error: "Failed to check registration status" });
    }
  });

  // POST /api/customer/request-wholesaler-access
  app.post("/api/customer/request-wholesaler-access", customerActionLimiter, async (req, res) => {
    try {
      const { wholesalerId, customerName, customerEmail, requestMessage, productsInterested, orderFrequency, customerType, businessType } = req.body;
      // Normalise to E.164 immediately so all formats of the same number are treated identically
      const customerPhone = formatPhoneToInternational(req.body.customerPhone || '');
      
      // Validate required fields
      if (!wholesalerId || !customerPhone || !customerName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check if customer already has access
      const lastFourDigits = customerPhone.slice(-4);
      const existingAccess = await storage.getWholesalersForCustomer(lastFourDigits);
      if (existingAccess.some(w => w.id === wholesalerId)) {
        return res.status(400).json({ error: "You already have access to this wholesaler" });
      }
      
      // Check for existing pending request
      const existingRequest = await storage.getCustomerRegistrationRequest(wholesalerId, customerPhone);
      if (existingRequest && existingRequest.status === 'pending') {
        return res.status(400).json({
          code: 'DUPLICATE_REGISTRATION',
          error: 'You already have a pending request with this wholesaler. Check back soon — they\'ll review it shortly.',
        });
      }
      
      // Allow customers to request again after rejection (re-request capability)
      const latestRequest = await storage.getLatestRegistrationRequest(wholesalerId, customerPhone);
      if (latestRequest && latestRequest.status === 'rejected') {
      }
      
      // Create the registration request
      const request = await storage.createCustomerRegistrationRequest({
        wholesalerId,
        customerPhone,
        customerName,
        customerEmail,
        businessName: req.body.businessName || null,
        customerType: customerType || null,
        businessType: businessType || null,
        requestMessage,
        productsInterested: productsInterested || null,
        orderFrequency: orderFrequency || null,
      });
      
      // Send email notification to wholesaler
      const wholesaler = await storage.getUser(wholesalerId);
      if (wholesaler && wholesaler.email) {
        try {
          const emailSubject = `New Customer Registration Request - ${customerName}`;
          const businessTypeLabel = businessType === 'retailer' ? 'Retailer (Shop / Store)' :
            businessType === 'wholesaler' ? 'Wholesaler / Distributor' :
            businessType === 'business' ? 'Business (Restaurant, Salon, etc.)' :
            businessType === 'individual' ? 'Individual / Sole Trader' :
            businessType || null;
          const safeCustomerName = escapeHtml(customerName);
          const safeBusinessName = escapeHtml(req.body.businessName) || 'Not provided';
          const safeCustomerPhone = escapeHtml(customerPhone);
          const safeCustomerEmail = escapeHtml(customerEmail) || 'Not provided';
          const safeProductsInterested = escapeHtml(productsInterested);
          const safeOrderFrequency = escapeHtml(orderFrequency);
          const safeRequestMessage = escapeHtml(requestMessage);
          const safeWholesalerFirstName = escapeHtml(wholesaler.firstName) || 'Wholesaler';
          const emailBody = `${emailHeading('New Customer Enquiry', { size: '22px', color: '#10b981' })}<p style="margin:0 0 20px">Dear ${safeWholesalerFirstName}, you have received a new customer registration request.</p>${emailCard(`${emailHeading('Customer Details', { size: '16px' })}<p style="margin:0 0 6px"><strong>Name:</strong> ${safeCustomerName}</p><p style="margin:0 0 6px"><strong>Business:</strong> ${safeBusinessName}</p>${businessTypeLabel ? `<p style="margin:0 0 6px"><strong>Business Type:</strong> ${escapeHtml(businessTypeLabel)}</p>` : ''}<p style="margin:0 0 6px"><strong>Phone:</strong> ${safeCustomerPhone}</p><p style="margin:0 0 6px"><strong>Email:</strong> ${safeCustomerEmail}</p>${safeProductsInterested ? `<p style="margin:0 0 6px"><strong>Products Interested In:</strong> ${safeProductsInterested}</p>` : ''}${safeOrderFrequency ? `<p style="margin:0 0 6px"><strong>Estimated Order Quantity/Frequency:</strong> ${safeOrderFrequency}</p>` : ''}${safeRequestMessage ? `<p style="margin:0"><strong>Message:</strong> ${safeRequestMessage}</p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<p style="margin:20px 0 0">To approve or manage this request, please log into your Quikpik dashboard.</p>${emailButton('Review Request', 'https://quikpik.co/customers')}`;

          const regHtml = wrapCustomerEmail(emailBody, { businessName: wholesaler.businessName || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `New enquiry from ${safeCustomerName}` });
          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: emailSubject,
            html: regHtml
          });
        } catch (emailError) {
          console.warn('[sendgrid] registration notification email failed:', emailError instanceof Error ? emailError.message : emailError);
        }
      }
      
      res.json({ 
        success: true, 
        requestId: request.id,
        message: "Your access request has been sent to the wholesaler. You'll be notified once they approve your request."
      });
    } catch (error: any) {
      console.error("❌ Error creating registration request:", error);
      if (error?.code === 'DUPLICATE_REGISTRATION') {
        return res.status(400).json({
          code: 'DUPLICATE_REGISTRATION',
          error: 'You already have a pending request with this wholesaler. Check back soon — they\'ll review it shortly.',
        });
      }
      res.status(500).json({ error: "Failed to submit registration request" });
    }
  });

  // GET /api/dashboard/multi-wholesaler-stats
  app.get('/api/dashboard/multi-wholesaler-stats', async (req: any, res) => {
    try {
      const multiWholesalerStats = await db.execute(`
        SELECT 
          u.id as wholesaler_id,
          u.business_name,
          u.email,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_revenue,
          COUNT(DISTINCT p.id) as total_products,
          COUNT(DISTINCT cg.id) as customer_groups,
          COUNT(DISTINCT cgm.customer_id) as total_customers,
          CASE 
            WHEN COUNT(DISTINCT o.id) >= 50 THEN 'platinum'
            WHEN COUNT(DISTINCT o.id) >= 20 THEN 'gold'
            WHEN COUNT(DISTINCT o.id) >= 10 THEN 'silver'
            ELSE 'bronze'
          END as tier,
          CASE 
            WHEN COUNT(DISTINCT o.id) >= 50 THEN 4
            WHEN COUNT(DISTINCT o.id) >= 20 THEN 3
            WHEN COUNT(DISTINCT o.id) >= 10 THEN 2
            ELSE 1
          END as tier_level
        FROM users u
        LEFT JOIN orders o ON u.id = o.wholesaler_id AND o.status != 'cancelled'
        LEFT JOIN products p ON u.id = p.wholesaler_id
        LEFT JOIN customer_groups cg ON u.id = cg.wholesaler_id
        LEFT JOIN customer_group_members cgm ON cg.id = cgm.group_id
        WHERE u.role = 'wholesaler' AND u.business_name IS NOT NULL
        GROUP BY u.id, u.business_name, u.email
        HAVING COUNT(DISTINCT o.id) > 0 OR COUNT(DISTINCT p.id) > 0
        ORDER BY total_revenue DESC, total_orders DESC
        LIMIT 10
      `);

      const platformStats = await db.execute(`
        SELECT 
          COUNT(DISTINCT CASE WHEN u.role = 'wholesaler' THEN u.id END) as total_wholesalers,
          COUNT(DISTINCT CASE WHEN u.role = 'retailer' THEN u.id END) as total_customers,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_platform_revenue,
          COUNT(DISTINCT p.id) as total_products
        FROM users u
        LEFT JOIN orders o ON (u.id = o.wholesaler_id OR u.id = o.retailer_id) AND o.status != 'cancelled'
        LEFT JOIN products p ON u.id = p.wholesaler_id
      `);

      const growthStats = await db.execute(`
        SELECT 
          COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN o.id END) as orders_this_week,
          COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE - INTERVAL '14 days' AND o.created_at < CURRENT_DATE - INTERVAL '7 days' THEN o.id END) as orders_last_week,
          COUNT(DISTINCT CASE WHEN u.created_at >= CURRENT_DATE - INTERVAL '30 days' AND u.role = 'wholesaler' THEN u.id END) as new_wholesalers_this_month
        FROM orders o
        RIGHT JOIN users u ON u.id = o.wholesaler_id OR u.id = o.retailer_id
      `);

      res.json({
        leaderboard: multiWholesalerStats.rows,
        platform: platformStats.rows[0],
        growth: growthStats.rows[0]
      });
    } catch (error) {
      console.error("Multi-wholesaler stats error:", error);
      res.status(500).json({ error: "Failed to fetch multi-wholesaler stats" });
    }
  });

  // GET /api/customer/wholesalers
  app.get('/api/customer/wholesalers', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.user.id;
      const relationships = await multiWholesalerService.getCustomerWholesalers(customerId);
      res.json(relationships);
    } catch (error) {
      console.error('Error fetching customer wholesalers:', error);
      res.status(500).json({ message: 'Failed to fetch wholesaler relationships' });
    }
  });
}
