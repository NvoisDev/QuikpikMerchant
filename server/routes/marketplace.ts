import { createHash } from "crypto";
import type { Express } from "express";
import { calculateCustomerFee, calculatePlatformFee } from "../../shared/utils/fees";
import { getCurrentFeeConfig } from "../utils/fee-config";
import { calculateCheckoutTotals } from "./checkout-fee-calculations";
import {
  InventoryCalculator, PreciseShippingCalculator, and, buildInvoicePdf, count, db, desc,
  emailButton, emailCard, emailHeading, eq, formatNumber, formatPhoneToInternational,
  generateOrderNotificationMessage, generateOrderNumber, generateWholesalerOrderNotificationEmail,
  getCurrencySymbol, getEmailLogoUrl, getUserPlanLimits, gte, inArray, like,
  multiWholesalerService, or, orderCancellationRequests, orderItems, orders,
  formatPackDescriptor, parseCustomerName, products, quickOrderService, requireAuth, sendCustomerInvoiceEmail,
  sendEmail, sendWhatsAppMessage, sendWelcomeMessages, sql, storage, sum, users, validatePhoneNumber,
  getStripeClient, isLiveMode, getPublishableKey,
  whatsAppBusinessService, wrapCustomerEmail,
  priceLists, priceListItems, priceListAssignments, customerGroupMembers,
  wholesalerCustomerRelationships,
} from "./shared";
import {
  computeEffectivePrice,
  resolveActivePriceListIds,
  resolveCustomerProductPrice,
} from "./marketplace-price-lists";
import { parseCustomerCookie } from "../utils/customer-auth-cookie";
import { registerBrowsingRoutes } from "./marketplace-browsing";

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  marketplace.ts — ORCHESTRATOR ONLY                                         ║
// ║                                                                              ║
// ║  This file registers customer-facing marketplace routes. It should           ║
// ║  remain an orchestrator: wiring routes, calling helpers, returning           ║
// ║  responses. Business logic does NOT belong here.                             ║
// ║                                                                              ║
// ║  Where to put NEW code:                                                      ║
// ║    Payment logic   → server/routes/marketplace-payments.ts                  ║
// ║    Order logic     → server/routes/marketplace-orders.ts                    ║
// ║    Browsing routes → server/routes/marketplace-browsing.ts                  ║
// ║    Price-list helpers → server/routes/marketplace-price-lists.ts            ║
// ║    Utilities/misc  → server/routes/marketplace-utils.ts                     ║
// ║    Shared fees     → shared/utils/fees.ts                                   ║
// ║    Shared currency → shared/utils/currency.ts                               ║
// ║                                                                              ║
// ║  DO NOT add inline business logic, fee formulas, or data-shaping            ║
// ║  functions directly to this file.                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ── Shared helpers (price-list) now live in marketplace-price-lists.ts ───────

/**
 * Resolves customer auth from the session, with an HMAC-verified cookie fallback.
 * Returns the auth object when valid, or null to trigger a 401.
 *
 * Cookie fallback: calls parseCustomerCookie which verifies the HMAC-SHA256
 * signature before JSON-parsing the payload. No DB lookup is needed — the
 * signature already guarantees the payload was issued by this server and has
 * not been tampered with.
 */
async function resolveCustomerAuth(
  req: any,
  wholesalerId: string
): Promise<{ customerId: string; wholesalerId: string; phone: string } | null> {
  const sessionAuth = (req.session as any)?.customerAuth;
  if (sessionAuth && sessionAuth.wholesalerId === wholesalerId) {
    return sessionAuth;
  }
  // HMAC-verified cookie fallback — no DB lookup needed (signature proves authenticity)
  const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
  if (cookieData && cookieData.wholesalerId === wholesalerId) {
    return { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId, phone: cookieData.phone || '' };
  }
  return null;
}

/**
 * Registers customer-facing marketplace routes (store browsing, cart, payment intents, orders).
 *
 * ⚠️  New payment logic belongs in `server/routes/payments.ts`, not here.
 * Any Stripe call in this file MUST use `getStripeClient(Boolean(wholesaler.isTestAccount))`
 * — never the module-level `stripe` singleton (which has no per-request account context).
 */
export function registerMarketplaceRoutes(app: Express): void {
  // GET /api/customer-orders/:wholesalerId/:phoneNumber
  app.get('/api/customer-orders/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      // Session guard: verify the caller is authenticated for this wholesaler
      const sessionAuth = await resolveCustomerAuth(req, wholesalerId);
      if (!sessionAuth) return res.status(401).json({ error: "Not authenticated" });

      const customerId: string = sessionAuth.customerId;
      const customerPhone: string = sessionAuth.phone || '';

      // Build phone variants to catch historical format inconsistencies
      const normalizedPhone = customerPhone.replace(/^\+44/, '0').replace(/[^0-9]/g, '');
      const phoneVariants = [
        customerPhone,
        normalizedPhone,
        normalizedPhone.length > 1 ? '+44' + normalizedPhone.substring(1) : '',
      ].filter(Boolean);

      const phoneConditions = phoneVariants.map(p => eq(orders.customerPhone, p));

      // Query orders belonging to this customer only — no wildcard retailerId match
      const orderResults = await db
        .select()
        .from(orders)
        .where(and(
          or(
            eq(orders.retailerId, customerId),
            or.apply(null, phoneConditions as any)
          ),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt));

      if (orderResults.length === 0) {
        return res.json([]);
      }

      const ordersToProcess = limitParam && limitParam > 0 ? orderResults.slice(0, limitParam) : orderResults;

      // Get order items and product details for each order
      const ordersWithDetails = await Promise.all(ordersToProcess.map(async (order) => {
        const items = await db
          .select({
            orderItemId: orderItems.id,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            total: orderItems.total,
            productId: products.id,
            productName: products.name,
            sellingType: orderItems.sellingType, // CRITICAL FIX: Include selling type in query
            appliedOfferLabel: orderItems.appliedOfferLabel,
            freeItems: orderItems.freeItems,
            packQuantity: products.packQuantity,
            unitSize: products.unitSize,
            unitOfMeasure: products.unitOfMeasure,
            palletWeight: products.palletWeight,
            unitWeight: products.unitWeight,
            quantityInPack: products.quantityInPack,
          })
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));

        // Get wholesaler details directly from database
        const wholesalerUser = await storage.getUser(order.wholesalerId);
        const wholesalerDetails = wholesalerUser ? {
          wholesalerId: order.wholesalerId,
          wholesalerName: wholesalerUser.businessName || `${wholesalerUser.firstName} ${wholesalerUser.lastName}`,
          wholesalerEmail: wholesalerUser.email || '',
          wholesalerPhone: wholesalerUser.businessPhone || '',
          deliveryNote: (wholesalerUser as any).deliveryNote || null,
          legalBusinessName: wholesalerUser.legalBusinessName || null,
          vatNumber: wholesalerUser.vatNumber || null,
          companyRegistrationNumber: wholesalerUser.companyRegistrationNumber || null,
        } : null;

        return {
          ...order,
          items: items.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice || "0",
            total: item.total || "0",
            sellingType: item.sellingType || "units", // CRITICAL FIX: Include selling type in response
            appliedOfferLabel: item.appliedOfferLabel || null,
            freeItems: item.freeItems || 0,
            packQuantity: item.packQuantity ?? undefined,
            unitSize: item.unitSize ?? undefined,
            unitOfMeasure: item.unitOfMeasure ?? undefined,
            palletWeight: item.palletWeight ?? undefined,
            unitWeight: item.unitWeight ?? undefined,
            quantityInPack: item.quantityInPack ?? undefined,
          })),
          wholesaler: wholesalerDetails ? {
            id: order.wholesalerId,
            businessName: wholesalerDetails.wholesalerName || 'Unknown Business',
            email: wholesalerDetails.wholesalerEmail || '',
            phone: wholesalerDetails.wholesalerPhone || '',
            deliveryNote: wholesalerDetails.deliveryNote || null,
            legalBusinessName: wholesalerDetails.legalBusinessName,
            vatNumber: wholesalerDetails.vatNumber,
            companyRegistrationNumber: wholesalerDetails.companyRegistrationNumber,
          } : null
        };
      }));
      
      // Format orders for customer portal display
      const formattedOrders = ordersWithDetails.map(order => {
        const total = parseFloat(order.total || "0");
        // Calculate proper fees based on current fee structure:
        // Customer pays: Product subtotal + Transaction fee (5.5% + £0.50)
        // Wholesaler pays: Platform fee (4.6% of product subtotal)
        
        // CRITICAL FIX: Always use stored subtotal from database - never calculate
        const subtotal = parseFloat(order.subtotal || "0");
        
        // Use stored customer transaction fee from database.
        // Fall back to a computed value ONLY when the stored value is missing AND it's an online payment.
        // Offline (cash/bank_transfer/pay_later) orders have customerTransactionFee stored as "0.00".
        const storedFee = order.customerTransactionFee;
        const rawMethod = order.paymentMethod;
        // isOnline covers:
        // • paymentMethod explicitly set to 'payment_link' or 'card'
        // • Legacy orders with no paymentMethod but a recorded Stripe payment intent
        // • Unpaid payment-link quotes (no stripePaymentIntentId yet) that have a
        //   stripePaymentLinkUrl — these are online orders awaiting first payment
        const isOnline = rawMethod === 'payment_link' || rawMethod === 'card' ||
                         (!rawMethod && !!order.stripePaymentIntentId) ||
                         (!rawMethod && !!order.stripePaymentLinkUrl);
        // For offline orders, always force fee to 0 regardless of what's stored in DB.
        // This corrects orders that were created before the quote creation fee bug was fixed.
        const transactionFee = isOnline
          ? ((storedFee !== null && storedFee !== undefined) ? parseFloat(storedFee) : calculateCustomerFee(subtotal, 0))
          : 0;

        // For offline orders, total = subtotal + vatAmount + delivery only (no fee).
        // Override any incorrectly-stored DB total to ensure transparency.
        const deliveryCost = parseFloat(order.deliveryCost || '0');
        const orderVatAmount = parseFloat((order as any).vatAmount || '0');
        const correctedTotal = isOnline ? total : (subtotal + orderVatAmount + deliveryCost);
        
        // Platform fee paid by wholesaler: 4.6% of product subtotal (not shown to customers but calculated for completeness)
        const platformFee = calculatePlatformFee(subtotal);
        
        return {
          id: order.id,
          orderNumber: order.orderNumber || order.order_number || `#${order.id}`, // Use actual order number (SF-120) not ID
          date: new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short', 
            year: 'numeric'
          }),
          time: new Date(order.createdAt || Date.now()).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          status: order.status,
          total: correctedTotal.toFixed(2),
          subtotal: subtotal.toFixed(2),
          customerTransactionFee: transactionFee.toFixed(2), // What customer paid in transaction fees
          platformFee: platformFee.toFixed(2), // For internal calculation only
          currency: "£",
          items: order.items,
          wholesaler: order.wholesaler,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail,
          deliveryAddress: order.deliveryAddress,
          deliveryAddressId: order.deliveryAddressId,
          paymentMethod: order.paymentMethod || null,
          stripePaymentIntentId: order.stripePaymentIntentId || null,
          paymentStatus: order.paymentStatus || "paid",
          amountPaid: order.amountPaid || '0.00',
          amountOutstanding: order.amountOutstanding || '0.00',
          amountRefunded: order.amountRefunded || '0.00',
          refundReason: order.refundReason || null,
          refundedAt: order.refundedAt || null,
          cancelledAt: order.cancelledAt || null,
          depositPercentage: order.depositPercentage || 100,
          stripePaymentLinkUrl: order.stripePaymentLinkUrl || null,
          fulfillmentType: order.fulfillmentType,
          deliveryCarrier: order.deliveryCarrier,
          deliveryCost: order.deliveryCost || '0.00',
          shippingStatus: order.shippingStatus,
          shippingTotal: order.shippingTotal,
          notes: order.notes,
          orderImages: order.orderImages, // CRITICAL FIX: Include order images for customer display
          isQuote: order.isQuote,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      });

      res.json(formattedOrders);
    } catch (error) {
      console.error("Customer orders fetch error:", error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // GET /api/customer-accessible-wholesalers/:phoneNumber
  app.get('/api/customer-accessible-wholesalers/:phoneNumber', async (req, res) => {
    try {
      const phoneNumber = req.params.phoneNumber;
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);

      console.log('🔍 Finding accessible wholesalers for customer with last 4 digits:', lastFourDigits);

      // Get all wholesalers where this customer is registered
      const accessibleWholesalers = await storage.getWholesalersForCustomer(lastFourDigits);
      
      console.log(`✅ Found ${accessibleWholesalers.length} accessible wholesalers for customer`);
      
      res.json(accessibleWholesalers);
    } catch (error) {
      console.error("Error fetching accessible wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch accessible wholesalers" });
    }
  });

  // POST /api/customer/shipping-choice
  app.post("/api/customer/shipping-choice", async (req, res) => {
    try {
      const { customerId, shippingChoice } = req.body;
      
      if (!customerId || !shippingChoice || !['pickup', 'delivery'].includes(shippingChoice)) {
        return res.status(400).json({ error: "Invalid customer ID or shipping choice" });
      }
      
      await storage.setCustomerShippingChoice(customerId, shippingChoice);
      console.log(`🚚 Updated shipping choice for customer ${customerId}: ${shippingChoice}`);
      
      res.json({ success: true, shippingChoice });
    } catch (error) {
      console.error("Error saving shipping choice:", error);
      res.status(500).json({ error: "Failed to save shipping choice" });
    }
  });

  // GET /api/customer/registration-status?wholesalerId=X&phone=Y
  // Lightweight check so the registration form can detect a pending request up-front.
  app.get("/api/customer/registration-status", async (req, res) => {
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
  app.post("/api/customer/request-wholesaler-access", async (req, res) => {
    try {
      const { wholesalerId, customerName, customerEmail, requestMessage, productsInterested, orderFrequency, customerType } = req.body;
      // Normalise to E.164 immediately so all formats of the same number are treated identically
      const customerPhone = formatPhoneToInternational(req.body.customerPhone || '');
      
      console.log("🔍 Customer registration request:", { wholesalerId, customerPhone: customerPhone?.slice(-4) + "****", customerName });
      
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
        console.log("Customer re-requesting access after previous rejection");
      }
      
      // Create the registration request
      const request = await storage.createCustomerRegistrationRequest({
        wholesalerId,
        customerPhone,
        customerName,
        customerEmail,
        businessName: req.body.businessName || null,
        customerType: customerType || null,
        requestMessage,
        productsInterested: productsInterested || null,
        orderFrequency: orderFrequency || null,
      });
      
      console.log("✅ Registration request created with ID:", request.id);
      
      // Send email notification to wholesaler
      const wholesaler = await storage.getUser(wholesalerId);
      if (wholesaler && wholesaler.email) {
        try {
          const emailSubject = `New Customer Registration Request - ${customerName}`;
          const emailBody = `${emailHeading('New Customer Enquiry', { size: '22px', color: '#10b981' })}<p style="margin:0 0 20px">Dear ${wholesaler.firstName || 'Wholesaler'}, you have received a new customer registration request.</p>${emailCard(`${emailHeading('Customer Details', { size: '16px' })}<p style="margin:0 0 6px"><strong>Name:</strong> ${customerName}</p><p style="margin:0 0 6px"><strong>Business:</strong> ${req.body.businessName || 'Not provided'}</p><p style="margin:0 0 6px"><strong>Phone:</strong> ${customerPhone}</p><p style="margin:0 0 6px"><strong>Email:</strong> ${customerEmail || 'Not provided'}</p>${productsInterested ? `<p style="margin:0 0 6px"><strong>Products Interested In:</strong> ${productsInterested}</p>` : ''}${orderFrequency ? `<p style="margin:0 0 6px"><strong>Estimated Order Quantity/Frequency:</strong> ${orderFrequency}</p>` : ''}${requestMessage ? `<p style="margin:0"><strong>Message:</strong> ${requestMessage}</p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<p style="margin:20px 0 0">To approve or manage this request, please log into your Quikpik dashboard.</p>${emailButton('Review Request', 'https://quikpik.co/customers')}`;

          const regHtml = wrapCustomerEmail(emailBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `New enquiry from ${customerName}` });
          console.log(`📏 Registration email size: ${Buffer.byteLength(regHtml, 'utf8')} bytes`);
          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: emailSubject,
            html: regHtml
          });
          console.log(`📧 Registration request notification sent to ${wholesaler.email}`);
        } catch (emailError) {
          console.error('Failed to send registration request notification:', emailError);
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

  // GET /api/quick-order-templates/:wholesalerId/:phoneNumber
  app.get('/api/quick-order-templates/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const sessionAuth = (req.session as any)?.customerAuth;
      if (!sessionAuth || sessionAuth.wholesalerId !== wholesalerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const templates = await quickOrderService.getQuickOrderTemplates(sessionAuth.customerId, wholesalerId);
      res.json({ success: true, templates });
    } catch (error) {
      console.error("❌ Error fetching quick order templates:", error);
      res.status(500).json({ error: "Failed to fetch quick order templates" });
    }
  });

  // GET /api/frequently-ordered/:wholesalerId/:phoneNumber
  app.get('/api/frequently-ordered/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const sessionAuth = (req.session as any)?.customerAuth;
      if (!sessionAuth || sessionAuth.wholesalerId !== wholesalerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const patterns = await quickOrderService.getFrequentlyOrderedProducts(sessionAuth.customerId, wholesalerId);
      res.json({ success: true, products: patterns });
    } catch (error) {
      console.error("❌ Error fetching frequently ordered products:", error);
      res.status(500).json({ error: "Failed to fetch frequently ordered products" });
    }
  });

  // GET /api/last-order-reorder/:wholesalerId/:phoneNumber
  app.get('/api/last-order-reorder/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const sessionAuth = (req.session as any)?.customerAuth;
      if (!sessionAuth || sessionAuth.wholesalerId !== wholesalerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const lastOrder = await quickOrderService.getLastOrderForReorder(sessionAuth.customerId, wholesalerId);
      res.json({ success: true, lastOrder });
    } catch (error) {
      console.error("❌ Error fetching last order for reorder:", error);
      res.status(500).json({ error: "Failed to fetch last order for reorder" });
    }
  });

  // GET /api/customer-orders/stats/:wholesalerId/:phoneNumber
  app.get('/api/customer-orders/stats/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;

      // Session guard
      const sessionAuth = await resolveCustomerAuth(req, wholesalerId);
      if (!sessionAuth) return res.status(401).json({ error: "Not authenticated" });

      const customerId: string = sessionAuth.customerId;
      const customerPhone: string = sessionAuth.phone || '';

      const normalizedPhone = customerPhone.replace(/^\+44/, '0').replace(/[^0-9]/g, '');
      const phoneVariants = [
        customerPhone,
        normalizedPhone,
        normalizedPhone.length > 1 ? '+44' + normalizedPhone.substring(1) : '',
      ].filter(Boolean);
      const phoneConditions = phoneVariants.map(p => eq(orders.customerPhone, p));

      // Get order statistics — no wildcard retailerId match
      const orderResults = await db
        .select()
        .from(orders)
        .where(and(
          or(
            eq(orders.retailerId, customerId),
            or.apply(null, phoneConditions as any)
          ),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt));

      const totalOrders = orderResults.length;
      const paidOrderResults = orderResults.filter(order => ['paid', 'fulfilled', 'completed'].includes(order.status));
      const totalSpent = paidOrderResults.reduce((sum, order) => {
        const subtotal = parseFloat(order.subtotal || order.total || '0');
        const platformFee = parseFloat(order.platformFee || '0');
        return sum + (subtotal - platformFee);
      }, 0);
      
      // Calculate days since last order
      let daysSinceLastOrder = undefined;
      if (orderResults.length > 0) {
        const lastOrderDate = new Date(orderResults[0].createdAt || new Date());
        const now = new Date();
        daysSinceLastOrder = Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Get recent orders (last 5)
      const recentOrders = orderResults.slice(0, 5).map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        status: order.status,
        total: order.total
      }));

      const stats = {
        totalOrders,
        totalSpent,
        daysSinceLastOrder,
        recentOrders
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching customer order statistics:", error);
      res.status(500).json({ message: "Failed to fetch customer order statistics" });
    }
  });

  // POST /api/customer/create-payment
  app.post('/api/customer/create-payment', async (req, res) => {
    try {
      const { customerData, items, shippingInfo } = req.body;
      const { name: customerName, email: customerEmail, phone: customerPhone, address: customerAddress, selectedDeliveryAddress } = customerData || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Calculate product subtotal
      let productSubtotal = 0;
      const validatedItems = [];

      // Cache customer DB ID for price-list resolution (looked up once on first iteration)
      let customerIdForPriceList: string | null = null;
      let priceListCustomerResolved = false;

      // Track expected wholesaler from first item — reject mixed-wholesaler carts immediately
      let expectedWholesalerId: string | null = null;

      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }

        // Fast single-wholesaler guard (first fetch wins; subsequent items must match)
        if (expectedWholesalerId === null) {
          expectedWholesalerId = product.wholesalerId;
        } else if (product.wholesalerId !== expectedWholesalerId) {
          return res.status(400).json({ message: "All items must belong to the same wholesaler" });
        }

        // Resolve customer ID for price list lookup (once, using first product's wholesalerId)
        if (!priceListCustomerResolved && customerPhone) {
          priceListCustomerResolved = true;
          try {
            const lastFour = customerPhone.replace(/[^0-9]/g, '').slice(-4);
            const cu = await storage.findCustomerByPhoneAndWholesaler(product.wholesalerId, customerPhone, lastFour);
            if (cu) {
              customerIdForPriceList = cu.id;
            } else {
              // findCustomerByPhoneAndWholesaler requires group membership — fall back to a
              // wholesaler-scoped lookup via the relationship table so customers with direct
              // price-list assignments (not in any group) still get their price-list pricing.
              const formattedPhone = formatPhoneToInternational(customerPhone);
              const fallbackRows = await db
                .select({ userId: users.id })
                .from(users)
                .innerJoin(
                  wholesalerCustomerRelationships,
                  and(
                    eq(wholesalerCustomerRelationships.customerId, users.id),
                    eq(wholesalerCustomerRelationships.wholesalerId, product.wholesalerId),
                    eq(wholesalerCustomerRelationships.status, 'active'),
                  ),
                )
                .where(eq(users.phoneNumber, formattedPhone))
                .limit(1);
              customerIdForPriceList = fallbackRows[0]?.userId ?? null;
              if (customerIdForPriceList) {
                console.log(`[create-payment] price-list fallback: resolved customer ${customerIdForPriceList} via wholesaler relationship`);
              }
            }
          } catch {
            // non-fatal — fall back to catalog pricing
          }
        }

        // Resolve price list override for this product
        let isPriceListOrder = false;
        let priceListCalculationPrice: number | null = null;
        if (customerIdForPriceList && item.sellingType !== 'pallets') {
          try {
            const override = await resolveCustomerProductPrice({
              wholesalerId: product.wholesalerId,
              customerId: customerIdForPriceList,
              productId: product.id,
              standardPrice: product.price,
            });
            if (override) {
              priceListCalculationPrice = parseFloat(override.customPrice);
              isPriceListOrder = true;
            }
          } catch {
            // non-fatal — fall back to catalog pricing
          }
        }

        const basePrice = parseFloat(product.price);
        
        // Use the sellingType field sent from frontend instead of guessing from price
        const sellingType = item.sellingType || 'units';
        const isPalletOrder = sellingType === 'pallets';
        const isUnitOrder = !isPriceListOrder && sellingType === 'units' && Math.abs(parseFloat(item.unitPrice) - basePrice) < 0.001;
        const hasActivePromos = product.promoActive && Array.isArray((product as any).promotionalOffers) && (product as any).promotionalOffers.length > 0;
        const isPromotionalOrder = !isPriceListOrder && sellingType === 'units' && !isUnitOrder && hasActivePromos;
        
        // Smart MOQ validation: Allow purchasing remaining stock even if below MOQ
        if ((isUnitOrder || isPromotionalOrder) && item.quantity < product.moq) {
          // Smart MOQ: If stock is below MOQ, allow customer to buy all remaining stock
          if (product.stock >= product.moq) {
            return res.status(400).json({ 
              message: `Minimum order quantity for ${product.name} is ${product.moq} units` 
            });
          }
        } else if (isPalletOrder && product.palletMoq && item.quantity < product.palletMoq) {
          // Smart MOQ for pallets: If pallet stock is below pallet MOQ, allow customer to buy remaining pallets
          const palletStock = Math.floor(product.stock / (product.unitsPerPallet || 48)); // Default pallet size 48
          if (palletStock >= product.palletMoq) {
            return res.status(400).json({ 
              message: `Minimum order quantity for ${product.name} is ${product.palletMoq} pallets` 
            });
          }
        } else if (!isUnitOrder && !isPalletOrder && !isPromotionalOrder && !isPriceListOrder) {
          return res.status(400).json({ 
            message: `Invalid unit price for ${product.name}. Expected: £${product.price}${product.promoActive && product.promoPrice ? ` or £${product.promoPrice} (promo)` : ''}${product.palletPrice ? ` or £${product.palletPrice} (pallet)` : ''}` 
          });
        }

        if (item.quantity > product.stock) {
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
          });
        }

        // CRITICAL FIX: Calculate pricing based on whether this is a pallet, price-list, unit, or promotional order
        let pricing;
        let calculationPrice;
        
        if (isPalletOrder) {
          calculationPrice = parseFloat(item.unitPrice);
          pricing = {
            originalPrice: calculationPrice,
            effectivePrice: calculationPrice,
            totalCost: calculationPrice * item.quantity,
            totalDiscount: 0,
            discountPercentage: 0,
            appliedOffers: [] as string[],
            freeItems: 0,
            totalQuantity: item.quantity
          };
        } else if (isPriceListOrder && priceListCalculationPrice !== null) {
          // Price list wins over promotions — matches front-end calculatePromotionalPricing behaviour
          calculationPrice = priceListCalculationPrice;
          pricing = {
            originalPrice: parseFloat(product.price),
            effectivePrice: calculationPrice,
            totalCost: calculationPrice * item.quantity,
            totalDiscount: 0,
            discountPercentage: 0,
            appliedOffers: ['Price list'] as string[],
            freeItems: 0,
            totalQuantity: item.quantity
          };
        } else {
          calculationPrice = parseFloat(product.price);
          pricing = {
            originalPrice: calculationPrice,
            effectivePrice: calculationPrice,
            totalCost: calculationPrice * item.quantity,
            totalDiscount: 0,
            discountPercentage: 0,
            appliedOffers: [] as string[],
            freeItems: 0,
            totalQuantity: item.quantity
          };

          // Apply promotional pricing if product has active promotions
          const offers = Array.isArray((product as any).promotionalOffers) ? (product as any).promotionalOffers : [];
          const now = new Date();
          for (const offer of offers) {
            if (!offer.isActive) continue;
            const start = offer.startDate ? new Date(offer.startDate) : null;
            const end = offer.endDate ? new Date(offer.endDate) : null;
            if (start && start > now) continue;
            if (end && end < now) continue;

            if (offer.type === 'percentage_discount' && offer.discountPercentage) {
              pricing.effectivePrice = Math.round(calculationPrice * (1 - offer.discountPercentage / 100) * 100) / 100;
              pricing.totalCost = pricing.effectivePrice * item.quantity;
              pricing.totalDiscount = (calculationPrice - pricing.effectivePrice) * item.quantity;
              pricing.discountPercentage = offer.discountPercentage;
              pricing.appliedOffers.push(offer.name || `${offer.discountPercentage}% off`);
              break;
            } else if (offer.type === 'fixed_price' && offer.fixedPrice) {
              pricing.effectivePrice = offer.fixedPrice;
              pricing.totalCost = offer.fixedPrice * item.quantity;
              pricing.totalDiscount = (calculationPrice - offer.fixedPrice) * item.quantity;
              pricing.appliedOffers.push(offer.name || 'Special Price');
              break;
            } else if (offer.type === 'buy_x_get_y_free' && offer.buyQuantity && offer.getQuantity) {
              const sets = Math.floor(item.quantity / offer.buyQuantity);
              pricing.freeItems = sets * offer.getQuantity;
              pricing.totalQuantity = item.quantity + pricing.freeItems;
              pricing.totalCost = calculationPrice * item.quantity;
              pricing.appliedOffers.push(offer.name || `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free`);
              break;
            } else if (offer.type === 'bundle_deal' && offer.minQuantity && offer.fixedPrice) {
              if (item.quantity >= offer.minQuantity) {
                pricing.effectivePrice = offer.fixedPrice;
                pricing.totalCost = offer.fixedPrice * item.quantity;
                pricing.totalDiscount = (calculationPrice - offer.fixedPrice) * item.quantity;
                pricing.appliedOffers.push(offer.name || `${offer.minQuantity}+ deal`);
                break;
              }
              continue;
            } else if (offer.type === 'clearance' && offer.fixedPrice) {
              pricing.effectivePrice = offer.fixedPrice;
              pricing.totalCost = offer.fixedPrice * item.quantity;
              pricing.totalDiscount = (calculationPrice - offer.fixedPrice) * item.quantity;
              pricing.appliedOffers.push(offer.name || 'Clearance');
              break;
            }
          }
        }
        
        if (isNaN(pricing.totalCost) || isNaN(item.quantity) || pricing.totalCost <= 0) {
          return res.status(400).json({ 
            message: `Invalid price or quantity for ${product.name}` 
          });
        }
        
        const itemTotal = pricing.totalCost;
        const unitPrice = pricing.effectivePrice.toFixed(2);
        
        // Additional validation for unit price calculation
        const parsedUnitPrice = parseFloat(unitPrice);
        if (isNaN(parsedUnitPrice) || parsedUnitPrice <= 0) {
          console.error(`Invalid unit price for ${product.name}: effective=${pricing.effectivePrice} total=${pricing.totalCost} qty=${item.quantity}`);
          return res.status(400).json({ 
            message: `Invalid pricing for ${product.name}. Please contact support.` 
          });
        }
        
        productSubtotal += itemTotal;

        validatedItems.push({
          ...item,
          product,
          unitPrice: unitPrice,
          total: itemTotal.toFixed(2),
          appliedOfferLabel: pricing.appliedOffers.length > 0 ? pricing.appliedOffers[0] : (item.appliedOfferLabel || null),
          freeItems: pricing.freeItems || item.freeItems || 0
        });
      }

      // Include delivery cost in fee calculation
      const deliveryCost = shippingInfo?.option === 'delivery' && shippingInfo?.flatDeliveryRate
        ? parseFloat(shippingInfo.flatDeliveryRate) || 0
        : parseFloat(shippingInfo?.service?.price || '0') || 0;

      const feeConfig = await getCurrentFeeConfig();
      const checkout = calculateCheckoutTotals({ productSubtotal, deliveryCost, feeConfig });
      const {
        amountBeforeFees,
        customerTransactionFee,
        totalCustomerPays,
        wholesalerPlatformFee,
        wholesalerReceives,
        stripeAmountPence: stripeAmount,
        stripeApplicationFeePence: stripeApplicationFee,
      } = checkout;
      const stripeWholesalerAmount = Math.round(wholesalerReceives * 100);
      
      // Enhanced validation for all Stripe amounts
      if (isNaN(productSubtotal) || isNaN(deliveryCost) || isNaN(totalCustomerPays) || 
          isNaN(wholesalerReceives) || isNaN(wholesalerPlatformFee) ||
          totalCustomerPays <= 0 || !Number.isInteger(stripeAmount) || stripeAmount <= 0 ||
          !Number.isInteger(stripeWholesalerAmount) || stripeWholesalerAmount < 0 ||
          !Number.isInteger(stripeApplicationFee) || stripeApplicationFee < 0) {
        console.error('Invalid payment calculation values:', { productSubtotal, deliveryCost, totalCustomerPays, stripeAmount, stripeWholesalerAmount });
        return res.status(400).json({ 
          message: "Invalid payment calculation. Please check your cart and try again.",
          debugInfo: {
            productSubtotal: isNaN(productSubtotal) ? 'NaN' : productSubtotal,
            deliveryCost: isNaN(deliveryCost) ? 'NaN' : deliveryCost,
            totalCustomerPays: isNaN(totalCustomerPays) ? 'NaN' : totalCustomerPays,
            wholesalerReceives: isNaN(wholesalerReceives) ? 'NaN' : wholesalerReceives,
            stripeAmount: isNaN(stripeAmount) ? 'NaN' : stripeAmount,
            stripeWholesalerAmount: isNaN(stripeWholesalerAmount) ? 'NaN' : stripeWholesalerAmount
          }
        });
      }

      // Get wholesaler for payment processing
      const firstProduct = validatedItems[0].product;
      const wholesaler = await storage.getUser(firstProduct.wholesalerId);
      
      if (!wholesaler) {
        return res.status(400).json({ message: "Wholesaler not found" });
      }

      // VAT calculation — applied on product subtotal only, never on fees
      const checkoutVatEnabled = wholesaler.vatEnabled ?? false;
      const checkoutVatRate = parseFloat(wholesaler.vatRate ?? '0');
      const checkoutVatAmount = checkoutVatEnabled ? productSubtotal * checkoutVatRate : 0;
      const checkoutVatRateApplied = checkoutVatEnabled ? checkoutVatRate : null;
      const stripeVatPence = Math.round(checkoutVatAmount * 100);
      const stripeAmountFinal = stripeAmount + stripeVatPence;
      const totalCustomerPaysFinal = totalCustomerPays + checkoutVatAmount;
      // VAT passes through to the wholesaler — platform fee is on subtotal only, not on VAT
      const wholesalerReceivesWithVat = wholesalerReceives + checkoutVatAmount;
      const stripeWholesalerAmountFinal = Math.round(wholesalerReceivesWithVat * 100);

      // Create Stripe payment intent — use account-aware client so test accounts always use test Stripe
      const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));
      
      // ENHANCED Connect account validation - check if account is fully functional
      let useConnect = false;
      let connectAccountStatus = 'no_account';
      
      if (wholesaler.stripeAccountId && wholesaler.stripeAccountId.length > 0) {
        try {
          // Validate that the Connect account is active and can receive transfers
          const account = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          
          // Check if account can receive transfers (charges_enabled and details_submitted)
          if (account.charges_enabled && account.details_submitted) {
            useConnect = true;
            connectAccountStatus = 'active';
          } else {
            connectAccountStatus = 'incomplete';
          }
        } catch (connectError: any) {
          connectAccountStatus = 'error';
          console.error(`Connect account validation failed for ${wholesaler.stripeAccountId}:`, connectError.message);
          // Don't use Connect if account verification fails
        }
      }
      
      const applicationFeeAmount = useConnect ? stripeApplicationFee : 0;
      
      // Deterministic idempotency key: SHA-256 of wholesalerId + normalised phone + final Stripe
      // amount (pence, includes delivery + VAT) + sorted items. Including stripeAmountFinal ensures
      // the key changes whenever the total changes (e.g. customer switches delivery method), which
      // prevents Stripe from rejecting the request with an idempotency conflict. True retries with
      // the same cart and same total still reuse the same key and payment intent.
      const normalizedPhone = (customerPhone || 'guest').replace(/[^0-9]/g, '');
      const sortedItemsStr = validatedItems
        .map(i => `${i.product.id}:${i.quantity}:${i.unitPrice}`)
        .sort()
        .join('|');
      const idempotencyInput = `${firstProduct.wholesalerId}-${normalizedPhone}-${stripeAmountFinal}-${sortedItemsStr}`;
      const idempotencyKey = `pay_${createHash('sha256').update(idempotencyInput).digest('hex').slice(0, 32)}`;

      // Additional validation specifically for Stripe amount (VAT-inclusive)
      if (!Number.isInteger(stripeAmountFinal) || stripeAmountFinal <= 0 || isNaN(stripeAmountFinal)) {
        return res.status(400).json({ 
          message: 'Invalid payment amount calculated. Please try again.' 
        });
      }
      
      let paymentIntent;
      try {
        const paymentConfig: any = {
          amount: stripeAmountFinal, // VAT-inclusive total the customer pays
          currency: 'gbp',
          receipt_email: customerEmail,
          automatic_payment_methods: { enabled: true },
          statement_descriptor_suffix: wholesaler.businessName?.slice(0, 10) || 'Quikpik',
          description: `Purchase from ${wholesaler.businessName || 'Quikpik Wholesaler'}`,
        };

        // Add Stripe Connect configuration if wholesaler has Connect account
        if (useConnect) {
          // Additional validation for transfer amounts
          if (stripeWholesalerAmountFinal <= 0) {
            console.error(`Invalid transfer amount for Connect account: ${stripeWholesalerAmountFinal}`);
            useConnect = false; // Fallback to direct payment
          } else {
            paymentConfig.transfer_data = {
              destination: wholesaler.stripeAccountId,
              amount: stripeWholesalerAmountFinal // Amount wholesaler receives (VAT pass-through + subtotal net)
            };
          }
        }
        
        paymentIntent = await stripe.paymentIntents.create({ ...paymentConfig, metadata: {
          customerName,
          customerEmail,
          customerPhone,
          customerAddress: JSON.stringify(customerAddress),
          // CRITICAL: Store selected delivery address ID for exact order-address tracking
          selectedDeliveryAddressId: selectedDeliveryAddress?.id ? selectedDeliveryAddress.id.toString() : '',
          // CRITICAL FIX: Store the complete selected delivery address object
          selectedDeliveryAddress: selectedDeliveryAddress ? JSON.stringify(selectedDeliveryAddress) : '',
          productSubtotal: productSubtotal.toFixed(2),
          shippingCost: deliveryCost.toString(),
          customerTransactionFee: customerTransactionFee.toFixed(2),
          feePercentageUsed: feeConfig.percentage.toFixed(4),
          fixedFeeUsed: feeConfig.fixed.toFixed(2),
          wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
          wholesalerReceives: wholesalerReceivesWithVat.toFixed(2),
          totalCustomerPays: totalCustomerPaysFinal.toFixed(2),
          vatAmount: checkoutVatAmount.toFixed(2),
          vatRateApplied: checkoutVatRateApplied !== null ? checkoutVatRateApplied.toFixed(4) : '0',
          wholesalerId: firstProduct.wholesalerId,
          wholesalerBusinessName: wholesaler.businessName || 'Quikpik Wholesaler',
          orderType: 'customer_portal',
          connectAccountUsed: useConnect ? 'true' : 'false',
          // CRITICAL FIX: Store shipping info to determine delivery vs pickup
          shippingInfo: JSON.stringify(shippingInfo || { option: 'pickup' }),
          items: JSON.stringify(validatedItems.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice),
            sellingType: item.sellingType || 'units'
          })))
        }
      }, {
        idempotencyKey: idempotencyKey
      });
      console.log(`Payment intent created: ${paymentIntent.id} (${stripeAmountFinal} pence, VAT: ${checkoutVatAmount.toFixed(2)})`);
      
      } catch (stripeError: any) {
        console.error("Stripe payment intent creation error:", stripeError.message);
        
        // Handle specific Connect account errors and retry without Connect
        if ((stripeError.type === 'StripeInvalidRequestError' || stripeError.code === 'account_invalid') && useConnect) {
          
          // Retry payment creation without Connect configuration
          try {
            const fallbackConfig = {
              amount: stripeAmountFinal,
              currency: 'gbp',
              receipt_email: customerEmail,
              automatic_payment_methods: { enabled: true },
              statement_descriptor_suffix: wholesaler.businessName?.slice(0, 10) || 'Quikpik',
              description: `Purchase from ${wholesaler.businessName || 'Quikpik Wholesaler'}`,
              metadata: {
                customerName,
                customerEmail,
                customerPhone,
                customerAddress: JSON.stringify(customerAddress),
                selectedDeliveryAddressId: selectedDeliveryAddress?.id ? selectedDeliveryAddress.id.toString() : '',
                selectedDeliveryAddress: selectedDeliveryAddress ? JSON.stringify(selectedDeliveryAddress) : '',
                productSubtotal: productSubtotal.toFixed(2),
                shippingCost: deliveryCost.toString(),
                customerTransactionFee: customerTransactionFee.toFixed(2),
                feePercentageUsed: feeConfig.percentage.toFixed(4),
                fixedFeeUsed: feeConfig.fixed.toFixed(2),
                wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
                wholesalerReceives: wholesalerReceivesWithVat.toFixed(2),
                totalCustomerPays: totalCustomerPaysFinal.toFixed(2),
                vatAmount: checkoutVatAmount.toFixed(2),
                vatRateApplied: checkoutVatRateApplied !== null ? checkoutVatRateApplied.toFixed(4) : '0',
                wholesalerId: firstProduct.wholesalerId,
                wholesalerBusinessName: wholesaler.businessName || 'Quikpik Wholesaler',
                orderType: 'customer_portal',
                connectAccountUsed: 'false', // Mark as direct payment
                shippingInfo: JSON.stringify(shippingInfo || { option: 'pickup' }),
                items: JSON.stringify(validatedItems.map(item => ({
                  productId: item.product.id,
                  quantity: item.quantity,
                  unitPrice: parseFloat(item.unitPrice),
                  sellingType: item.sellingType || 'units'
                })))
              }
            };
            
            paymentIntent = await stripe.paymentIntents.create(fallbackConfig, {
              idempotencyKey: `${idempotencyKey}_fallback`
            });
          } catch (fallbackError: any) {
            console.error("Fallback payment creation also failed:", fallbackError);
            return res.status(500).json({ 
              message: "Payment setup failed. Please contact the business owner.",
              error: 'payment_config_error'
            });
          }
        } else if (stripeError.code === 'parameter_invalid_integer') {
          return res.status(400).json({ 
            message: "Invalid payment amount calculation. Please refresh and try again.",
            error: 'calculation_error'
          });
        } else {
          // Re-throw other errors to be caught by outer catch block
          throw stripeError;
        }
      }

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        publishableKey: getPublishableKey(Boolean(wholesaler.isTestAccount)),
        productSubtotal: productSubtotal.toFixed(2),
        shippingCost: deliveryCost.toString(),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        vatAmount: checkoutVatAmount.toFixed(2),
        vatRateApplied: checkoutVatRateApplied !== null ? checkoutVatRateApplied.toFixed(4) : null,
        totalCustomerPays: totalCustomerPaysFinal.toFixed(2),
        wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
        wholesalerReceives: wholesalerReceivesWithVat.toFixed(2)
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // POST /api/marketplace/create-order
  app.post('/api/marketplace/create-order', async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ message: 'Payment intent ID required' });
      }

      // Retrieve payment intent — use environment-aware fallback so test-account PIs (created
      // with the test client) are still found when the platform runs in live mode.
      let paymentIntent: any;
      {
        const primaryClient = getStripeClient(!isLiveMode());   // test in test-mode, live in live-mode
        const secondaryClient = getStripeClient(isLiveMode());  // opposite for fallback
        try {
          paymentIntent = await primaryClient.paymentIntents.retrieve(paymentIntentId);
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.code === 'resource_missing') {
            paymentIntent = await secondaryClient.paymentIntents.retrieve(paymentIntentId);
          } else {
            throw e;
          }
        }
      }
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ message: 'Payment not successful' });
      }

      const {
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        totalAmount,
        platformFee,
        wholesalerId,
        orderType,
        items: itemsJson,
        connectAccountUsed,
        productSubtotal,
        customerTransactionFee,
        totalCustomerPays,
        wholesalerPlatformFee,
        wholesalerReceives,
        selectedDeliveryAddressId,
        selectedDeliveryAddress: selectedDeliveryAddressJson,
        shippingCost: metadataShippingCost,
        vatAmount: metadataVatAmount,
        vatRateApplied: metadataVatRateApplied,
        feePercentageUsed: metadataFeePercentageUsed,
        fixedFeeUsed: metadataFixedFeeUsed
      } = paymentIntent.metadata;

      // Parse shipping info from payment metadata
      const shippingInfoJson = paymentIntent.metadata.shippingInfo;
      const shippingInfo = shippingInfoJson ? JSON.parse(shippingInfoJson) : { option: 'pickup' };

      // Parse the selected delivery address from metadata
      let selectedDeliveryAddress = null;
      if (selectedDeliveryAddressJson) {
        try {
          selectedDeliveryAddress = JSON.parse(selectedDeliveryAddressJson);
        } catch (error) {
          console.error('❌ Failed to parse selectedDeliveryAddress:', error);
        }
      }

      if (orderType === 'customer_portal') {
        const items = JSON.parse(itemsJson);

        // Create customer if doesn't exist or update existing one
        let customer = await storage.getUserByPhone(customerPhone);
        const { firstName, lastName } = parseCustomerName(customerName);
        
        console.log(`🔍 Customer lookup by phone ${customerPhone}:`, customer ? `Found existing: ${customer.id} (${customer.firstName} ${customer.lastName})` : 'Not found');
        
        // If phone lookup fails, try email lookup
        if (!customer && customerEmail) {
          customer = await storage.getUserByEmail(customerEmail);
          console.log(`🔍 Customer lookup by email ${customerEmail}:`, customer ? `Found existing: ${customer.id} (${customer.firstName} ${customer.lastName})` : 'Not found');
        }
        
        if (!customer) {
          console.log(`📝 Creating new customer: ${firstName} ${lastName} (${customerPhone})`);
          customer = await storage.createCustomer({
            phoneNumber: customerPhone,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail,
            wholesalerId: wholesalerId
          });
          console.log(`✅ New customer created: ${customer.id} (${customer.firstName} ${customer.lastName}) linked to wholesaler: ${wholesalerId}`);
          
          // Send welcome messages to new customer (Payment Processing)
          try {
            const wholesaler = await storage.getUser(wholesalerId);
            if (wholesaler) {
              const customerName = `${firstName} ${lastName}`.trim();
              const portalUrl = `https://quikpik.app/customer/${userId}`;
              const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
              
              console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
              
              const welcomeResult = await sendWelcomeMessages({
                customerName,
                customerEmail: customerEmail || '',
                customerPhone: customerPhone,
                wholesalerName,
                wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                wholesalerPhone: wholesaler.phoneNumber || '',
                wholesalerAccountName: `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'IBK',
                portalUrl,
                wholesalerId: wholesaler.id,
                wholesalerLogoType: wholesaler.logoType,
                wholesalerLogoUrl: wholesaler.logoUrl,
              });
              
              console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
            }
          } catch (welcomeError) {
            console.error('❌ Error sending welcome messages (Payment Processing):', welcomeError);
          }
        } else {
          // Check if email belongs to different customer before updating
          let emailConflict = false;
          if (customerEmail && customer.email !== customerEmail) {
            const existingEmailUser = await storage.getUserByEmail(customerEmail);
            if (existingEmailUser && existingEmailUser.id !== customer.id) {
              console.log(`⚠️ Email ${customerEmail} belongs to different customer ${existingEmailUser.id}, keeping existing email for ${customer.id}`);
              emailConflict = true;
            }
          }
          
          // Update existing customer with new information if name or phone changed
          const needsUpdate = 
            customer.firstName !== firstName || 
            customer.lastName !== lastName || 
            (customerPhone && customer.phoneNumber !== customerPhone) ||
            (customerEmail && customer.email !== customerEmail && !emailConflict);
            
          if (needsUpdate) {
            console.log(`📝 Updating existing customer: ${customer.id} with new info: ${firstName} ${lastName} (${customerPhone})`);
            
            // Only update email if there's no conflict
            const updateData = {
              firstName,
              lastName,
              email: emailConflict ? customer.email : (customerEmail || customer.email || '')
            };
            
            customer = await storage.updateCustomer(customer.id, {
              firstName,
              lastName,
              email: emailConflict ? (customer.email || undefined) : (customerEmail || customer.email || undefined)
            });
            
            // Update phone number separately if needed
            if (customerPhone && customer.phoneNumber !== customerPhone) {
              console.log(`📱 Updating phone number for customer: ${customer.id} to ${customerPhone}`);
              await storage.updateCustomerPhone(customer.id, customerPhone);
              customer.phoneNumber = customerPhone; // Update local copy
            }
            
            console.log(`✅ Customer updated: ${customer.id} (${customer.firstName} ${customer.lastName}) (${customer.phoneNumber})`);
          }
        }
        
        console.log(`👤 Using customer for order: ${customer.id} (${customer.firstName} ${customer.lastName})`);;

        // 🚚 SHIPPING INFO: Already parsed above for debug logging - use existing shippingInfo variable
        
        
        // ENHANCED LOGGING: Alert if shipping info is missing or defaults to pickup
        if (!shippingInfoJson) {
          console.error(`🚨 CRITICAL: No shippingInfo in payment metadata for ${paymentIntentId}! This will default to pickup.`);
          console.error(`🚨 Payment metadata keys:`, Object.keys(paymentIntent.metadata || {}));
        } else if (shippingInfo.option === 'pickup') {
          console.log(`📦 Customer explicitly chose pickup for payment ${paymentIntentId}`);
        } else if (shippingInfo.option === 'delivery') {
          console.log(`🚚 Customer chose delivery for payment ${paymentIntentId} - will create DELIVERY order`);
        }
        
        // Use actual order shipping choice, not saved customer preference
        const fulfillmentType = shippingInfo.option === 'delivery' ? 'delivery' : 'pickup';
        
        console.log('🚚 MARKETPLACE ROUTE: Using actual order shipping choice:', {
          customerId: customer.id,
          customerName: `${customer.firstName} ${customer.lastName}`,
          orderShippingOption: shippingInfo.option,
          finalFulfillmentType: fulfillmentType,
          willCreateDeliveryOrder: fulfillmentType === 'delivery'
        });

        // CRITICAL FIX: Use explicit address ID from payment metadata if available, ALWAYS override metadata address
        if (fulfillmentType === 'delivery' && selectedDeliveryAddressId) {
          try {
            console.log(`🎯 MARKETPLACE EXPLICIT ADDRESS: Customer selected address ID ${selectedDeliveryAddressId}, fetching from database...`);
            
            // CRITICAL FIX: Get the specific address directly by ID since customer already selected it
            const explicitlySelectedAddress = await storage.getDeliveryAddressById(parseInt(selectedDeliveryAddressId));
            
            if (explicitlySelectedAddress) {
              selectedDeliveryAddress = {
                id: explicitlySelectedAddress.id,
                addressLine1: explicitlySelectedAddress.address_line1 || '',
                addressLine2: explicitlySelectedAddress.address_line2 || null,
                city: explicitlySelectedAddress.city || '',
                state: explicitlySelectedAddress.state || null,
                postalCode: explicitlySelectedAddress.postal_code || '',
                country: explicitlySelectedAddress.country || 'United Kingdom'
              };
              console.log(`🎯 MARKETPLACE CUSTOMER CHOICE RESPECTED: Using customer's explicit selection - Address ID ${selectedDeliveryAddress.id}: ${selectedDeliveryAddress.addressLine1}`);
            } else {
              console.warn(`⚠️ MARKETPLACE: Customer selected address ID ${selectedDeliveryAddressId} not found in database. Attempting fallback from all customer addresses...`);
              try {
                const allCustomerAddresses = await storage.getDeliveryAddresses(customer.id, wholesalerId);
                const fallbackAddr = allCustomerAddresses.find((addr: any) => !addr.is_default) || allCustomerAddresses[0];
                if (fallbackAddr) {
                  selectedDeliveryAddress = {
                    id: fallbackAddr.id,
                    addressLine1: fallbackAddr.address_line1 || '',
                    addressLine2: fallbackAddr.address_line2 || null,
                    city: fallbackAddr.city || '',
                    state: fallbackAddr.state || null,
                    postalCode: fallbackAddr.postal_code || '',
                    country: fallbackAddr.country || 'United Kingdom'
                  };
                  console.log(`🔄 MARKETPLACE FALLBACK: Using customer address ID ${selectedDeliveryAddress.id}: ${selectedDeliveryAddress.addressLine1}`);
                } else {
                  console.warn(`⚠️ MARKETPLACE: No addresses found for customer ${customer.id}. Proceeding without address snapshot.`);
                }
              } catch (addrErr) {
                console.error('❌ MARKETPLACE: Failed to fetch fallback addresses:', addrErr);
              }
            }
          } catch (error) {
            console.error('❌ MARKETPLACE: Failed to query customer addresses:', error);
          }
        }

        // Calculate actual platform fee based on Connect usage
        const actualPlatformFee = connectAccountUsed === 'true' ? platformFee : '0.00';
        const wholesalerAmount = connectAccountUsed === 'true' 
          ? (parseFloat(totalAmount) - parseFloat(platformFee)).toFixed(2)
          : totalAmount;

        // Use the correct total from metadata instead of recalculating
        const correctTotal = totalCustomerPays || (parseFloat(productSubtotal || totalAmount) + parseFloat(customerTransactionFee || '0')).toFixed(2);
        
        console.log('🚚 COMPETING SYSTEM DEBUG: Processing shipping metadata:', {
          hasShippingInfo: !!shippingInfoJson,
          shippingInfoRaw: shippingInfoJson,
          parsedShippingInfo: shippingInfo,
          customerChoice: shippingInfo.option,
          hasService: !!shippingInfo.service,
          serviceName: shippingInfo.service?.serviceName,
          servicePrice: shippingInfo.service?.price
        });

        // ATOMIC ORDER NUMBER GENERATION: Use database transaction with proper sequential numbering AND duplicate checking
        let order, wholesaleRef;
        
        try {
          console.log(`🚨 WEBHOOK TRANSACTION DEBUG: Starting transaction for payment ${paymentIntentId}`);
          const result = await db.transaction(async (trx) => {
            // CRITICAL FIX: Check for existing order WITHIN the transaction for true atomicity
            const existingOrderResult = await trx
              .select()
              .from(orders)
              .where(like(orders.stripePaymentIntentId, `%${paymentIntentId}%`))
              .limit(1);
            
            if (existingOrderResult.length > 0) {
              const existingOrder = existingOrderResult[0];
              console.log(`⚠️ ATOMIC CHECK: Order already exists for payment intent ${paymentIntentId}: #${existingOrder.id} (${existingOrder.orderNumber})`);
              throw new Error(`DUPLICATE_ORDER:${existingOrder.id}:${existingOrder.orderNumber}`);
            }

            // Use consistent order number generation
            const wholesaleRef = await generateOrderNumber(wholesalerId, trx);
            
            // CRITICAL FIX: Calculate subtotal from items when metadata missing
            const safeSubtotal = productSubtotal && productSubtotal !== 'null' && productSubtotal !== 'undefined'
              ? parseFloat(productSubtotal).toFixed(2)
              : items.reduce((sum: number, item: any) => sum + (parseFloat(item.unitPrice) * item.quantity), 0).toFixed(2);
            
            console.log(`💰 Subtotal calculation: productSubtotal=${productSubtotal}, safeSubtotal=${safeSubtotal}, totalAmount=${totalAmount}`);

            // VAT — read from Stripe payment metadata (set at checkout creation time)
            const webhookVatAmount = parseFloat(metadataVatAmount || '0');
            const webhookVatRateAppliedStr = metadataVatRateApplied && metadataVatRateApplied !== '0' ? metadataVatRateApplied : null;

            // Create order with customer details AND SHIPPING DATA
            const orderData = {
              orderNumber: wholesaleRef, // Use wholesale reference as order number for consistency
              wholesalerId,
              retailerId: customer.id,
              customerName, // Store customer name
              customerEmail, // Store customer email
              customerPhone, // Store customer phone
              subtotal: safeSubtotal, // FIXED: Raw product total before any fee deductions
              platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2), // 4.6% platform fee
              customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2),
              feePercentageUsed: metadataFeePercentageUsed ? parseFloat(metadataFeePercentageUsed).toFixed(4) : '0.0550',
              fixedFeeUsed: metadataFixedFeeUsed ? parseFloat(metadataFixedFeeUsed).toFixed(2) : '0.50',
              vatAmount: webhookVatAmount.toFixed(2),
              ...(webhookVatRateAppliedStr !== null ? { vatRateApplied: webhookVatRateAppliedStr } : {}),
              total: correctTotal, // VAT-inclusive total (Stripe charged totalCustomerPaysFinal)
              status: 'paid',
              paymentStatus: 'paid', // CRITICAL: Set payment status for archive logic
              amountPaid: correctTotal, // Full amount paid on checkout
              amountOutstanding: '0.00', // Nothing outstanding
              stripePaymentIntentId: paymentIntent.id,
              deliveryAddress: selectedDeliveryAddress ? (() => {
                // CRITICAL FIX: Filter out empty address components to prevent incomplete snapshots
                const addressParts = [
                  selectedDeliveryAddress.addressLine1,
                  selectedDeliveryAddress.addressLine2,
                  selectedDeliveryAddress.city,
                  selectedDeliveryAddress.state,
                  selectedDeliveryAddress.postalCode,
                  selectedDeliveryAddress.country || 'United Kingdom'
                ].filter(part => part && typeof part === 'string' && part.trim() && part.trim() !== 'undefined' && part.trim() !== 'null');
                
                return addressParts.length > 0 ? addressParts.join(', ') : null;
              })() : (customerAddress ? (typeof customerAddress === 'string' ? customerAddress : JSON.stringify(customerAddress)) : null),
              deliveryAddressId: selectedDeliveryAddress?.id || (selectedDeliveryAddressId ? parseInt(selectedDeliveryAddressId) : null),
              // 🚚 SIMPLIFIED: Use saved customer shipping choice
              fulfillmentType: fulfillmentType,
              deliveryCarrier: fulfillmentType === 'delivery' ? 'Supplier Arranged' : null,
              deliveryCost: parseFloat(metadataShippingCost || '0').toFixed(2),
              shippingTotal: parseFloat(metadataShippingCost || '0').toFixed(2)
            };
            
            console.log('🚚 SIMPLIFIED DELIVERY: Order data with shipping fields:', {
              fulfillmentType: orderData.fulfillmentType,
              deliveryCarrier: orderData.deliveryCarrier,
              isDeliveryOrder: orderData.fulfillmentType === 'delivery',
              supplierWillArrangeDelivery: orderData.fulfillmentType === 'delivery'
            });
            

            // Create order items with orderId for storage, including promo labels
            const orderItemsData = await Promise.all(items.map(async (item: any) => {
              return {
                orderId: 0,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: parseFloat(item.unitPrice).toFixed(2),
                total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
                sellingType: item.sellingType || 'units',
                appliedOfferLabel: item.appliedOfferLabel || null,
                freeItems: item.freeItems || 0
              };
            }));

            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: About to call createOrderWithTransaction`);
            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: Order data:`, orderData);
            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: Items:`, orderItemsData);
            
            // Use transaction-aware storage method with integrity check
            const createdOrder = await storage.createOrderWithTransaction(trx, orderData, orderItemsData);
            
            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: createOrderWithTransaction completed, order ID: ${createdOrder.id}`);
            
            // 🔒 DATA INTEGRITY: Verify all items were saved correctly
            const savedItems = await trx.select().from(orderItems).where(eq(orderItems.orderId, createdOrder.id));
            if (savedItems.length !== items.length) {
              console.error(`❌ DATA INTEGRITY ALERT: Expected ${items.length} items, but only saved ${savedItems.length} for order ${createdOrder.id}`);
              throw new Error(`Data integrity failure: Expected ${items.length} items, saved ${savedItems.length}`);
            }
            
            console.log(`✅ Order #${createdOrder.id} created with ${savedItems.length}/${items.length} items verified`);
            return { order: createdOrder, wholesaleRef };
          });
          
          order = result.order;
          wholesaleRef = result.wholesaleRef;
        } catch (error: any) {
          // Handle duplicate order errors gracefully
          if (error.message.startsWith('DUPLICATE_ORDER:')) {
            const [, orderId, orderNumber] = error.message.split(':');
            console.log(`✅ Duplicate order detected and prevented: #${orderId} (${orderNumber})`);
            return res.json({ 
              success: true, 
              orderId: parseInt(orderId), 
              orderNumber: orderNumber, // Include order number in response
              message: 'Order already processed' 
            });
          }
          throw error; // Re-throw other errors
        }
        
        console.log(`✅ Order #${order.id} (Wholesale Ref: ${wholesaleRef}) created successfully for wholesaler ${wholesalerId}, customer ${customerName}, total: ${totalAmount}`);

        // Capture Stripe Transfer ID for exact payout-to-order reconciliation.
        // This runs outside the transaction so a Stripe API failure never blocks the order.
        if (paymentIntent?.id) {
          try {
            // Re-derive the Stripe client from the wholesaler in the PI metadata
            const piWholesalerId = paymentIntent.metadata?.wholesalerId as string | undefined;
            const piWholesalerObj = piWholesalerId ? await storage.getUser(piWholesalerId) : null;
            const stripe = getStripeClient(Boolean(piWholesalerObj?.isTestAccount));
            const expandedPi = await stripe.paymentIntents.retrieve(paymentIntent.id, {
              expand: ['latest_charge'],
            });
            const latestCharge = expandedPi.latest_charge;
            // After expansion latest_charge is an object; when not expanded it is a string id.
            const charge = latestCharge && typeof latestCharge === 'object' ? latestCharge : null;
            const rawTransfer = charge?.transfer;
            const transferId = typeof rawTransfer === 'string'
              ? rawTransfer
              : (rawTransfer && typeof rawTransfer === 'object' ? rawTransfer.id : null);
            if (transferId) {
              await storage.updateOrder(order.id, { stripeTransferId: transferId });
              console.log(`✅ Stored Stripe Transfer ID ${transferId} on order ${order.id}`);
            }
          } catch (transferErr) {
            console.warn(`⚠️ Could not store Stripe Transfer ID for order ${order.id}:`, transferErr);
          }
        }

        // Get wholesaler data for emails and notifications
        const wholesaler = await storage.getWholesalerProfile(wholesalerId);

        // Send customer confirmation email and Stripe invoice
        if (wholesaler && customerEmail) {
          try {
            const savedOrderItems = await storage.getOrderItems(order.id);
            const enrichedItems = await Promise.all(savedOrderItems.map(async (item: any) => {
              const product = await storage.getProduct(item.productId);
              return {
                ...item,
                productName: product?.name || `Product #${item.productId}`,
                packDescriptor: formatPackDescriptor(product?.packQuantity || product?.quantityInPack, product?.sizePerUnit || product?.unitSize, product?.unitOfMeasure),
                product: product ? { name: product.name, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure } : null
              };
            }));
            
            await sendCustomerInvoiceEmail({
              name: customerName,
              email: customerEmail,
              phone: customerPhone,
              address: selectedDeliveryAddress ? 
                (() => {
                  // CRITICAL FIX: Filter out empty address components to prevent incomplete snapshots
                  const addressParts = [
                    selectedDeliveryAddress.addressLine1,
                    selectedDeliveryAddress.addressLine2,
                    selectedDeliveryAddress.city,
                    selectedDeliveryAddress.state,
                    selectedDeliveryAddress.postalCode,
                    selectedDeliveryAddress.country || 'United Kingdom'
                  ].filter(part => part && typeof part === 'string' && part.trim() && part.trim() !== 'undefined' && part.trim() !== 'null');
                  
                  return addressParts.length > 0 ? addressParts.join(', ') : null;
                })() : 
                customerAddress
            }, order, enrichedItems, wholesaler);
            console.log(`📧 Confirmation email sent to ${customerEmail} for order #${order.id}`);

            
          } catch (emailError) {
            console.error(`❌ Failed to send confirmation email for order #${order.id}:`, emailError);
          }
        }

        // Send WhatsApp notification to wholesaler with wholesale reference
        if (wholesaler && (wholesaler as any).twilioAuthToken && (wholesaler as any).twilioPhoneNumber) {
          const currencySymbol = getCurrencySymbol(wholesaler.preferredCurrency || 'GBP');
          const message = `🎉 New Order Received!\n\nWholesale Ref: ${wholesaleRef}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nQuote this reference when communicating with the customer.`;
          
          try {
            // WhatsApp notification (simplified)
            if ((wholesaler as any).whatsappEnabled) {
              if ((wholesaler as any).whatsappAccessToken && (wholesaler as any).whatsappBusinessPhoneId) {
                await whatsAppBusinessService.sendMessage((wholesaler as any).businessPhone, message, {
                  accessToken: (wholesaler as any).whatsappAccessToken,
                  phoneNumberId: (wholesaler as any).whatsappBusinessPhoneId
                });
              }
            }
          } catch (error) {
            console.error('Failed to send WhatsApp notification:', error);
          }
        }

        // Send email notification to wholesaler
        if (wholesaler && wholesaler.email) {
          try {
            // Prepare order data for email template  
            const enrichedItemsForEmail = await Promise.all(items.map(async (item: any) => {
              const product = await storage.getProduct(item.productId);
              return {
                productName: product?.name || `Product #${item.productId}`,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
                appliedOfferLabel: item.appliedOfferLabel || null,
                freeItems: item.freeItems || 0,
                packDescriptor: formatPackDescriptor(product?.packQuantity || product?.quantityInPack, product?.sizePerUnit || product?.unitSize, product?.unitOfMeasure),
              };
            }));

            // FIXED: Get complete address using correct camelCase field names
            let shippingAddress = undefined;
            if (fulfillmentType === 'delivery' && order.deliveryAddressId) {
              try {
                const completeAddress = await storage.getDeliveryAddressById(order.deliveryAddressId);
                if (completeAddress) {
                  shippingAddress = [
                    completeAddress.addressLine1,
                    completeAddress.addressLine2,
                    `${completeAddress.city}${completeAddress.state ? ', ' + completeAddress.state : ''}`,
                    completeAddress.postalCode,
                    completeAddress.country
                  ].filter(Boolean).join('\n');
                } else {
                  // Fallback to order deliveryAddress
                  shippingAddress = order.deliveryAddress;
                }
              } catch (addressError) {
                console.error('❌ Failed to get complete address:', addressError);
                // Fallback to order deliveryAddress
                shippingAddress = order.deliveryAddress;
              }
            }

            // Resolve collection address for pickup notification
            let emailCollectionAddressName: string | undefined;
            let emailCollectionAddress: string | undefined;
            const emailFulfillmentType = shippingInfo && shippingInfo.option === 'delivery' ? 'delivery' : 'pickup';
            if (emailFulfillmentType === 'pickup') {
              try {
                const caId = order.collectionAddressId;
                if (caId) {
                  const ca = await storage.getCollectionAddress(caId);
                  if (ca) {
                    emailCollectionAddressName = ca.name;
                    emailCollectionAddress = [ca.addressLine1, ca.addressLine2, [ca.city, ca.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                  }
                }
                if (!emailCollectionAddress) {
                  const allAddrs = await storage.getCollectionAddresses(wholesaler.id);
                  const def = allAddrs.find((a: any) => a.isDefault && a.isActive !== false);
                  if (def) {
                    emailCollectionAddressName = def.name;
                    emailCollectionAddress = [def.addressLine1, def.addressLine2, [def.city, def.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                  }
                }
                if (!emailCollectionAddress) {
                  emailCollectionAddress = wholesaler.pickupAddress || wholesaler.businessAddress || undefined;
                }
              } catch (_) {}
            }

            const emailData: OrderEmailData = {
              orderNumber: order.orderNumber || `ORD-${order.id}`,
              customerName,
              customerEmail: customerEmail || '',
              customerPhone,
              shippingAddress: shippingAddress,
              total: correctTotal,
              subtotal: productSubtotal,
              platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
              customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2),
              wholesalerPlatformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
              shippingTotal: parseFloat(metadataShippingCost || '0').toFixed(2),
              fulfillmentType: emailFulfillmentType,
              items: enrichedItemsForEmail,
              wholesaler: {
                id: wholesaler.id,
                businessName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`,
                firstName: wholesaler.firstName || '',
                lastName: wholesaler.lastName || '',
                email: wholesaler.email,
                logoUrl: wholesaler.logoUrl,
                logoType: wholesaler.logoType,
              },
              orderDate: new Date().toISOString(),
              paymentMethod: 'Card Payment',
              collectionAddressName: emailCollectionAddressName,
              collectionAddress: emailCollectionAddress,
            };

            const emailTemplate = generateWholesalerOrderNotificationEmail(emailData);
            
            await sendEmail({
              to: wholesaler.email,
              from: 'hello@quikpik.co',
              subject: emailTemplate.subject,
              html: emailTemplate.html,
              text: emailTemplate.text
            });

            console.log(`📧 Wholesaler email notification sent to ${wholesaler.email} for Order #${order.id}`);
          } catch (error) {
            console.error('Failed to send wholesaler email notification:', error);
          }
        }

        res.json({ 
          success: true, 
          orderId: order.id,
          orderNumber: order.orderNumber || wholesaleRef, // Include actual order number
          platformFeeCollected: connectAccountUsed === 'true',
          message: 'Order created successfully',
          // Include financial details for ThankYouPage
          totalAmount: parseFloat(totalCustomerPays || correctTotal || '0'),
          subtotal: parseFloat(productSubtotal || '0'),
          customerTransactionFee: parseFloat(customerTransactionFee || '0'),
          shippingCost: parseFloat(metadataShippingCost || '0')
        });
      } else {
        res.status(400).json({ message: 'Invalid order type' });
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Failed to create order: ' + error.message });
    }
  });

  // POST /api/marketplace/create-order-pay-later
  app.post('/api/marketplace/create-order-pay-later', async (req, res) => {
    try {
      const {
        cart,
        customerData,
        shippingOption,
        wholesalerId,
        notes,
        selectedDeliveryAddress,
        selectedDeliveryAddressId,
        collectionAddressId,
      } = req.body;

      if (!Array.isArray(cart) || cart.length === 0 || !customerData || !wholesalerId || !shippingOption) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      if (!['pickup', 'delivery'].includes(shippingOption)) {
        return res.status(400).json({ message: 'Invalid shipping option' });
      }

      // Delivery requires an address
      if (shippingOption === 'delivery' && !selectedDeliveryAddress) {
        return res.status(400).json({ message: 'A delivery address is required for delivery orders' });
      }

      const customerName: string = customerData.name || '';
      const customerEmail: string = customerData.email || '';
      const customerPhone: string = customerData.phone || '';

      if (!customerPhone) {
        return res.status(400).json({ message: 'Customer phone number required' });
      }

      // --- Find or create customer (mirrors create-order logic) ---
      let customer = await storage.getUserByPhone(customerPhone);
      const { firstName, lastName } = parseCustomerName(customerName);

      if (!customer && customerEmail) {
        customer = await storage.getUserByEmail(customerEmail);
      }

      if (!customer) {
        customer = await storage.createCustomer({
          phoneNumber: customerPhone,
          firstName,
          lastName,
          role: 'retailer',
          email: customerEmail,
          wholesalerId,
        });
        try {
          const ws = await storage.getUser(wholesalerId);
          if (ws) {
            const portalUrl = `https://quikpik.app/customer/${wholesalerId}`;
            const wsName = ws.businessName || `${ws.firstName} ${ws.lastName}`.trim() || 'Your Wholesale Partner';
            await sendWelcomeMessages({
              customerName: `${firstName} ${lastName}`.trim(),
              customerEmail: customerEmail || '',
              customerPhone,
              wholesalerName: wsName,
              wholesalerEmail: ws.email || 'hello@quikpik.co',
              wholesalerPhone: ws.phoneNumber || '',
              wholesalerAccountName: `${ws.firstName} ${ws.lastName || ''}`.trim() || 'IBK',
              portalUrl,
              wholesalerId: ws.id,
              wholesalerLogoType: ws.logoType,
              wholesalerLogoUrl: ws.logoUrl,
            });
          }
        } catch (welcomeError) {
          console.error('❌ Welcome message error (pay-later):', welcomeError);
        }
      } else {
        let emailConflict = false;
        if (customerEmail && customer.email !== customerEmail) {
          const existing = await storage.getUserByEmail(customerEmail);
          if (existing && existing.id !== customer.id) emailConflict = true;
        }
        const needsUpdate =
          customer.firstName !== firstName ||
          customer.lastName !== lastName ||
          (customerEmail && customer.email !== customerEmail && !emailConflict);
        if (needsUpdate) {
          customer = await storage.updateCustomer(customer.id, {
            firstName,
            lastName,
            email: emailConflict ? (customer.email || undefined) : (customerEmail || customer.email || undefined),
          });
        }
      }

      // --- Look up wholesaler for delivery rate + pay-later gate ---
      const wholesalerProfile = await storage.getWholesalerProfile(wholesalerId);
      if (!wholesalerProfile?.allowPayLater) {
        return res.status(403).json({ message: 'Pay Later is not enabled by this supplier' });
      }
      const shippingCost = shippingOption === 'delivery' && wholesalerProfile?.deliveryFlatRate
        ? parseFloat(wholesalerProfile.deliveryFlatRate)
        : 0;

      // --- Compute all pricing server-side from canonical product data ---
      // Cart items only supply productId, quantity, sellingType — no client prices are trusted.
      interface PayLaterCartItem {
        productId: number;
        quantity: number;
        sellingType: string;
      }
      interface PayLaterOrderItem {
        orderId: number;
        productId: number;
        quantity: number;
        unitPrice: string;
        total: string;
        sellingType: string;
        appliedOfferLabel: string | null;
        freeItems: number;
      }
      const orderItemsData: PayLaterOrderItem[] = [];
      let subtotal = 0;

      for (const rawItem of cart as PayLaterCartItem[]) {
        const productId = Number(rawItem.productId);
        const quantity = Number(rawItem.quantity);
        const sellingType = rawItem.sellingType === 'pallets' ? 'pallets' : 'units';

        if (!productId || !quantity || quantity <= 0) {
          return res.status(400).json({ message: 'Invalid cart item: missing productId or quantity' });
        }

        const product = await storage.getProduct(productId);
        if (!product || product.wholesalerId !== wholesalerId) {
          return res.status(400).json({ message: `Product ${productId} not found` });
        }

        let unitPrice: number;
        let lineTotal: number;
        let appliedOfferLabel: string | null = null;
        let freeItems = 0;

        if (sellingType === 'pallets') {
          unitPrice = parseFloat(product.palletPrice || '0');
          lineTotal = unitPrice * quantity;
        } else {
          const basePrice = parseFloat(product.price);
          const offers = product.promotionalOffers ?? [];
          const now = new Date();
          unitPrice = basePrice;
          lineTotal = basePrice * quantity;

          for (const offer of offers) {
            if (!offer.isActive) continue;
            const start = offer.startDate ? new Date(offer.startDate) : null;
            const end = offer.endDate ? new Date(offer.endDate) : null;
            if (start && start > now) continue;
            if (end && end < now) continue;

            if (offer.type === 'percentage_discount' && offer.discountPercentage) {
              unitPrice = Math.round(basePrice * (1 - offer.discountPercentage / 100) * 100) / 100;
              lineTotal = unitPrice * quantity;
              appliedOfferLabel = offer.name || `${offer.discountPercentage}% off`;
              break;
            } else if (offer.type === 'fixed_price' && offer.fixedPrice) {
              unitPrice = offer.fixedPrice;
              lineTotal = unitPrice * quantity;
              appliedOfferLabel = offer.name || 'Special Price';
              break;
            } else if (offer.type === 'buy_x_get_y_free' && offer.buyQuantity && offer.getQuantity) {
              const sets = Math.floor(quantity / offer.buyQuantity);
              freeItems = sets * offer.getQuantity;
              lineTotal = basePrice * quantity;
              appliedOfferLabel = offer.name || `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free`;
              break;
            } else if (offer.type === 'bundle_deal' && offer.minQuantity && offer.fixedPrice) {
              if (quantity >= offer.minQuantity) {
                unitPrice = offer.fixedPrice;
                lineTotal = unitPrice * quantity;
                appliedOfferLabel = offer.name || `${offer.minQuantity}+ deal`;
                break;
              }
            } else if (offer.type === 'clearance' && offer.fixedPrice) {
              unitPrice = offer.fixedPrice;
              lineTotal = unitPrice * quantity;
              appliedOfferLabel = offer.name || 'Clearance';
              break;
            }
          }
        }

        subtotal += lineTotal;
        orderItemsData.push({
          orderId: 0,
          productId,
          quantity,
          unitPrice: unitPrice.toFixed(2),
          total: lineTotal.toFixed(2),
          sellingType,
          appliedOfferLabel,
          freeItems,
        });
      }

      // Pay Later orders: apply customer transaction fee (matches Pay Now behaviour)
      const payLaterFeeConfig = await getCurrentFeeConfig();
      const transactionFee = calculateCustomerFee(subtotal, shippingCost, payLaterFeeConfig);
      const platformFee = calculatePlatformFee(subtotal).toFixed(2);

      // VAT calculation — look up wholesaler VAT settings
      const payLaterWholesalerForVat = await storage.getUser(wholesalerId);
      const payLaterVatEnabled = payLaterWholesalerForVat?.vatEnabled ?? false;
      const payLaterVatRate = parseFloat(payLaterWholesalerForVat?.vatRate ?? '0');
      const payLaterVatAmount = payLaterVatEnabled ? subtotal * payLaterVatRate : 0;
      const payLaterVatRateApplied = payLaterVatEnabled ? payLaterVatRate : null;
      const total = (subtotal + payLaterVatAmount + shippingCost + transactionFee).toFixed(2);

      // --- Validate collectionAddressId belongs to this wholesaler (multi-tenant safety) ---
      let validatedCollectionAddressId: number | null = null;
      if (shippingOption === 'pickup' && collectionAddressId) {
        const parsedId = parseInt(String(collectionAddressId), 10);
        if (!isNaN(parsedId)) {
          const addr = await storage.getCollectionAddress(parsedId);
          if (addr && addr.wholesalerId === wholesalerId) {
            validatedCollectionAddressId = parsedId;
          } else {
            console.warn(`collectionAddressId ${parsedId} not found or does not belong to wholesaler ${wholesalerId} — ignoring`);
          }
        }
      }

      // --- Build delivery address ---
      let deliveryAddress: string | null = null;
      let deliveryAddressId: number | null = null;
      if (shippingOption === 'delivery' && selectedDeliveryAddress) {
        const addr = selectedDeliveryAddress as Record<string, string | number | undefined>;
        const parts = [
          addr['addressLine1'], addr['addressLine2'], addr['city'],
          addr['state'], addr['postalCode'], addr['country'] || 'United Kingdom'
        ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
        deliveryAddress = parts.join(', ') || null;
        deliveryAddressId = addr['id'] ? Number(addr['id']) : (selectedDeliveryAddressId ? parseInt(String(selectedDeliveryAddressId)) : null);
      }

      const orderNumber = await generateOrderNumber(wholesalerId);

      const orderData = {
        orderNumber,
        wholesalerId,
        retailerId: customer.id,
        customerName,
        customerEmail,
        customerPhone,
        subtotal: subtotal.toFixed(2),
        platformFee,
        customerTransactionFee: transactionFee.toFixed(2),
        vatAmount: payLaterVatAmount.toFixed(2),
        ...(payLaterVatRateApplied !== null ? { vatRateApplied: payLaterVatRateApplied.toFixed(4) } : {}),
        total,
        status: 'pending',
        paymentStatus: 'unpaid',
        depositPercentage: 0,
        amountPaid: '0.00',
        amountOutstanding: total,
        notes: notes || null,
        deliveryAddress,
        deliveryAddressId,
        collectionAddressId: validatedCollectionAddressId,
        fulfillmentType: shippingOption === 'delivery' ? 'delivery' : 'pickup',
        deliveryCarrier: shippingOption === 'delivery' ? 'Supplier Arranged' : null,
        deliveryCost: shippingCost.toFixed(2),
        shippingTotal: shippingCost.toFixed(2),
        feePercentageUsed: payLaterFeeConfig.percentage.toFixed(4),
        fixedFeeUsed: payLaterFeeConfig.fixed.toFixed(2),
        paymentMethod: 'pay_later',
      };

      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItemsData);
      });

      console.log(`✅ Pay-Later order #${order.id} (${orderNumber}) created for ${customerName}, total: ${total}, status: unpaid`);

      // --- Send notifications ---

      // WhatsApp notification to wholesaler (mirrors create-order flow)
      if (wholesalerProfile?.whatsappAccessToken && wholesalerProfile.whatsappBusinessPhoneId) {
        const currencySymbol = getCurrencySymbol(wholesalerProfile.preferredCurrency || 'GBP');
        const waMessage = `🛒 New Pay Later Order!\n\nOrder: ${orderNumber}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${total}\n\nPayment: Due on invoice — no upfront payment taken.`;
        try {
          await whatsAppBusinessService.sendMessage(
            wholesalerProfile.businessPhone || wholesalerProfile.phoneNumber || '',
            waMessage,
            {
              accessToken: wholesalerProfile.whatsappAccessToken,
              phoneNumberId: wholesalerProfile.whatsappBusinessPhoneId,
            }
          );
        } catch (waError: unknown) {
          console.error('❌ WhatsApp notification error (pay-later):', waError instanceof Error ? waError.message : String(waError));
        }
      }

      if (wholesalerProfile && customerEmail) {
        try {
          const savedItems = await storage.getOrderItems(order.id);
          const enrichedItems = await Promise.all(savedItems.map(async (item) => {
            const prod = await storage.getProduct(item.productId);
            return { ...item, productName: prod?.name || `Product #${item.productId}`, packDescriptor: formatPackDescriptor(prod?.packQuantity || prod?.quantityInPack, prod?.sizePerUnit || prod?.unitSize, prod?.unitOfMeasure), product: prod ? { name: prod.name, packQuantity: prod.packQuantity, quantityInPack: prod.quantityInPack, sizePerUnit: prod.sizePerUnit, unitSize: prod.unitSize, unitOfMeasure: prod.unitOfMeasure } : null };
          }));
          await sendCustomerInvoiceEmail(
            { name: customerName, email: customerEmail, phone: customerPhone, address: deliveryAddress || undefined },
            order,
            enrichedItems,
            wholesalerProfile
          );
        } catch (emailError) {
          console.error('❌ Failed to send pay-later customer email:', emailError);
        }
      }

      if (wholesalerProfile?.email) {
        try {
          const enrichedForEmail = await Promise.all(orderItemsData.map(async (item) => {
            const prod = await storage.getProduct(item.productId);
            return {
              productName: prod?.name || `Product #${item.productId}`,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              appliedOfferLabel: item.appliedOfferLabel,
              freeItems: item.freeItems,
              packDescriptor: formatPackDescriptor(prod?.packQuantity || prod?.quantityInPack, prod?.sizePerUnit || prod?.unitSize, prod?.unitOfMeasure),
            };
          }));
          // Resolve collection address for pickup notification
          let payLaterCollAddrName: string | undefined;
          let payLaterCollAddr: string | undefined;
          if (shippingOption !== 'delivery') {
            try {
              if (validatedCollectionAddressId) {
                const ca = await storage.getCollectionAddress(validatedCollectionAddressId);
                if (ca) {
                  payLaterCollAddrName = ca.name;
                  payLaterCollAddr = [ca.addressLine1, ca.addressLine2, [ca.city, ca.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                }
              }
              if (!payLaterCollAddr) {
                const allAddrs = await storage.getCollectionAddresses(wholesalerProfile.id);
                const def = allAddrs.find((a: any) => a.isDefault && a.isActive !== false);
                if (def) {
                  payLaterCollAddrName = def.name;
                  payLaterCollAddr = [def.addressLine1, def.addressLine2, [def.city, def.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                }
              }
              if (!payLaterCollAddr) {
                payLaterCollAddr = wholesalerProfile.pickupAddress || wholesalerProfile.businessAddress || undefined;
              }
            } catch (_) {}
          }

          const emailData: OrderEmailData = {
            orderNumber,
            customerName,
            customerEmail: customerEmail || '',
            customerPhone,
            shippingAddress: deliveryAddress || undefined,
            total,
            subtotal: subtotal.toFixed(2),
            platformFee,
            customerTransactionFee: transactionFee.toFixed(2),
            wholesalerPlatformFee: platformFee,
            shippingTotal: shippingCost.toFixed(2),
            fulfillmentType: shippingOption === 'delivery' ? 'delivery' : 'pickup',
            items: enrichedForEmail,
            wholesaler: {
              id: wholesalerProfile.id,
              businessName: wholesalerProfile.businessName || `${wholesalerProfile.firstName} ${wholesalerProfile.lastName}`,
              firstName: wholesalerProfile.firstName || '',
              lastName: wholesalerProfile.lastName || '',
              email: wholesalerProfile.email,
              logoUrl: wholesalerProfile.logoUrl,
              logoType: wholesalerProfile.logoType,
            },
            orderDate: new Date().toISOString(),
            paymentMethod: 'Pay Later',
            collectionAddressName: payLaterCollAddrName,
            collectionAddress: payLaterCollAddr,
          };
          const emailTemplate = generateWholesalerOrderNotificationEmail(emailData);
          await sendEmail({
            to: wholesalerProfile.email,
            from: 'hello@quikpik.co',
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
          });
        } catch (emailError) {
          console.error('❌ Failed to send pay-later wholesaler email:', emailError);
        }
      }

      return res.json({
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber || orderNumber,
      });
    } catch (error: unknown) {
      console.error('❌ Error creating pay-later order:', error);
      res.status(500).json({ message: 'Failed to create order: ' + (error instanceof Error ? error.message : String(error)) });
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

  // POST /api/customer/orders/:id/request-cancellation
  app.post('/api/customer/orders/:id/request-cancellation', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { customerPhone, reasonCategory, reasonNotes } = req.body;
      
      if (!customerPhone) {
        return res.status(400).json({ message: "Customer phone is required" });
      }
      if (!reasonCategory) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify customer owns this order by comparing phone numbers directly
      const orderCustomerPhone = (order as any).customerPhone;
      if (!orderCustomerPhone || orderCustomerPhone !== customerPhone) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }
      
      // Check if order is within 24-hour window
      const orderDate = new Date(order.createdAt);
      const now = new Date();
      const hoursSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceOrder > 24) {
        return res.status(400).json({ 
          message: "Cancellation window expired. Orders can only be cancelled within 24 hours of placement. Please contact the seller directly."
        });
      }
      
      // Check if order is already cancelled or has a pending cancellation request
      if (order.status === 'cancelled') {
        return res.status(400).json({ message: "Order is already cancelled" });
      }
      
      const existingRequest = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.orderId, orderId),
          eq(orderCancellationRequests.status, 'pending')
        ))
        .limit(1);
        
      if (existingRequest.length > 0) {
        return res.status(400).json({ message: "A cancellation request is already pending for this order" });
      }
      
      // Create cancellation request
      const [request] = await db.insert(orderCancellationRequests)
        .values({
          orderId,
          customerId: order.retailerId,
          wholesalerId: order.wholesalerId,
          reasonCategory,
          reasonNotes: reasonNotes || null,
          status: 'pending',
        })
        .returning();
      
      console.log(`📋 Cancellation request created for order ${order.orderNumber} by customer ${customerPhone}`);
      
      // Notify wholesaler about the cancellation request via SMS and email
      try {
        const wholesaler = await storage.getUser(order.wholesalerId);
        const customerName = (order as any).customerName || customerPhone;
        
        // WhatsApp notification to wholesaler
        if (wholesaler?.phoneNumber) {
          await sendWhatsAppMessage({
            to: wholesaler.phoneNumber,
            message: `🔔 Cancellation Request: Customer ${customerName} has requested to cancel order ${order.orderNumber}. Reason: ${reasonCategory}. Please review in your dashboard.`,
          });
        }
        
        // Email notification
        if (wholesaler?.email) {
          const orderTotal = parseFloat(order.total?.toString() || '0');
          const amountPaid = parseFloat(order.amountPaid?.toString() || '0');
          
          const cancelRequestBody = `${emailHeading('Cancellation Request', { size: '22px', color: '#EF4444' })}<p style="margin:0 0 20px">A customer has requested to cancel their order.</p>${emailCard(`${emailHeading(`Order ${order.orderNumber}`, { size: '16px', color: '#DC2626' })}<p style="margin:0 0 6px"><strong>Customer:</strong> ${customerName}</p><p style="margin:0 0 6px"><strong>Order Total:</strong> £${orderTotal.toFixed(2)}</p><p style="margin:0 0 6px"><strong>Amount Paid:</strong> £${amountPaid.toFixed(2)}</p><p style="margin:0 0 6px"><strong>Reason:</strong> ${reasonCategory}</p>${reasonNotes ? `<p style="margin:0"><strong>Additional Notes:</strong> ${reasonNotes}</p>` : ''}`, { borderColor: '#FECACA', bgColor: '#FEF2F2' })}${emailCard(`${emailHeading('What happens next?', { size: '16px', color: '#EA580C' })}<p style="margin:0 0 8px">Please review this cancellation request in your dashboard and decide whether to:</p><ul style="margin:0;padding-left:20px"><li style="margin-bottom:4px"><strong>Approve</strong> - The order will be cancelled and any payments will be refunded</li><li><strong>Reject</strong> - The order will remain active and the customer will be notified</li></ul>`, { borderColor: '#FED7AA', bgColor: '#FFF7ED' })}${emailButton('Review in Dashboard', 'https://quikpik.co/orders')}`;

          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `Cancellation Request for Order ${order.orderNumber}`,
            html: wrapCustomerEmail(cancelRequestBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `${customerName} has requested to cancel order ${order.orderNumber}` }),
          });
          console.log(`📧 Cancellation request email sent to ${wholesaler.email} for order ${order.orderNumber}`);
        }
      } catch (error) {
        console.error('Failed to send cancellation request notification:', error);
      }
      
      res.json({ 
        message: "Cancellation request submitted successfully. The seller will review your request shortly.",
        request 
      });
    } catch (error) {
      console.error("Error creating cancellation request:", error);
      res.status(500).json({ message: "Failed to submit cancellation request" });
    }
  });

  // GET /api/customer/orders/:id/can-cancel
  app.get('/api/customer/orders/:id/can-cancel', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const customerPhone = req.query.customerPhone as string;
      
      if (!customerPhone) {
        return res.status(400).json({ canCancel: false, reason: "Customer phone is required" });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ canCancel: false, reason: "Order not found" });
      }
      
      // Verify customer owns this order by comparing phone numbers directly
      // Orders store the customer phone, so we can validate ownership directly
      const orderCustomerPhone = (order as any).customerPhone;
      if (!orderCustomerPhone || orderCustomerPhone !== customerPhone) {
        return res.json({ canCancel: false, reason: "Not authorized" });
      }
      
      // Check if order is already cancelled
      if (order.status === 'cancelled') {
        return res.json({ canCancel: false, reason: "Order is already cancelled" });
      }
      
      // Check if there's already a pending cancellation request
      const existingRequest = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.orderId, orderId),
          eq(orderCancellationRequests.status, 'pending')
        ))
        .limit(1);
        
      if (existingRequest.length > 0) {
        return res.json({ canCancel: false, reason: "pending_request", pendingRequest: existingRequest[0] });
      }
      
      // Check if order is within 24-hour window
      const orderDate = new Date(order.createdAt);
      const now = new Date();
      const hoursSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
      const hoursRemaining = Math.max(0, 24 - hoursSinceOrder);
      
      if (hoursSinceOrder > 24) {
        return res.json({ 
          canCancel: false, 
          reason: "24-hour cancellation window has expired. Please contact the seller directly." 
        });
      }
      
      res.json({ 
        canCancel: true, 
        hoursRemaining: Math.round(hoursRemaining * 10) / 10 
      });
    } catch (error) {
      console.error("Error checking cancellation eligibility:", error);
      res.status(500).json({ canCancel: false, reason: "Error checking eligibility" });
    }
  });

  // Browsing/discovery routes (featured, products, wholesalers, product detail)
  // extracted to marketplace-browsing.ts to reduce file size.
  registerBrowsingRoutes(app);

  // POST /api/marketplace/orders
  app.post('/api/marketplace/orders', async (req, res) => {
    try {
      const { productId, customerName, customerPhone, customerEmail, quantity, totalAmount, notes, sellingType, collectionAddressId } = req.body;
      
      if (!productId || !customerName || !customerPhone || !quantity || !totalAmount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Automatically format phone number to international format
      const formattedPhoneNumber = formatPhoneToInternational(customerPhone);
      
      // Validate the formatted phone number
      if (!validatePhoneNumber(formattedPhoneNumber)) {
        return res.status(400).json({ 
          message: `Invalid phone number format. Please provide a valid phone number (e.g., 07507659550 or +447507659550)` 
        });
      }
      
      // Get product to validate and get wholesaler
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if product is locked due to subscription limits
      if (product.status === 'locked') {
        return res.status(403).json({ 
          message: "This product is currently unavailable due to subscription restrictions.",
          errorType: "PRODUCT_LOCKED"
        });
      }
      
      // Validate quantity against MOQ and stock based on selling type
      const currentSellingType = sellingType || 'units';
      
      if (currentSellingType === 'pallets') {
        // For pallet orders, no MOQ validation needed (1 pallet is valid)
        // Stock validation will be handled by InventoryCalculator
      } else {
        // For unit orders, validate against MOQ
        if (quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity is ${product.moq} units` 
          });
        }
        
        // Stock validation for units will be handled by InventoryCalculator
      }
      
      // Get or create customer (check by formatted phone first, then by email)
      let customer = await storage.getUserByPhone(formattedPhoneNumber);
      if (!customer) {
        customer = await storage.getUserByEmail(customerEmail);
      }
      if (!customer) {
        const { firstName, lastName } = parseCustomerName(customerName);
        customer = await storage.createCustomer({
          phoneNumber: formattedPhoneNumber,
          firstName,
          lastName,
          email: customerEmail,
          role: 'retailer',
          wholesalerId: product.wholesalerId
        });
        
        // Send welcome messages to new customer (Marketplace Order)
        try {
          const wholesaler = await storage.getUser(product.wholesalerId);
          if (wholesaler) {
            const customerName = `${firstName} ${lastName}`.trim();
            const portalUrl = `https://quikpik.app/customer/${userId}`;
            const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
            
            console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
            
            const welcomeResult = await sendWelcomeMessages({
              customerName,
              customerEmail: customerEmail,
              customerPhone: formattedPhoneNumber,
              wholesalerName,
              wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
              wholesalerPhone: wholesaler.phoneNumber,
              portalUrl,
              wholesalerId: wholesaler.id,
              wholesalerLogoType: wholesaler.logoType,
              wholesalerLogoUrl: wholesaler.logoUrl,
            });
            
            console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
          }
        } catch (welcomeError) {
          console.error('❌ Error sending welcome messages (Marketplace Order):', welcomeError);
        }
      }
      
      // Calculate platform fee (4.6% of total)
      const subtotalNum = parseFloat(totalAmount);
      const platformFee = calculatePlatformFee(subtotalNum).toFixed(2);

      // VAT calculation — look up wholesaler VAT settings
      const singleProductWholesalerForVat = await storage.getUser(product.wholesalerId);
      const singleProductVatEnabled = singleProductWholesalerForVat?.vatEnabled ?? false;
      const singleProductVatRate = parseFloat(singleProductWholesalerForVat?.vatRate ?? '0');
      const singleProductVatAmount = singleProductVatEnabled ? subtotalNum * singleProductVatRate : 0;
      const singleProductVatRateApplied = singleProductVatEnabled ? singleProductVatRate : null;
      const subtotal = subtotalNum.toFixed(2);
      const total = (subtotalNum + singleProductVatAmount).toFixed(2);
      
      // Validate collectionAddressId belongs to this wholesaler (multi-tenant safety)
      let validatedCollectionAddressId: number | null = null;
      if (collectionAddressId) {
        const parsedId = parseInt(String(collectionAddressId), 10);
        if (!isNaN(parsedId)) {
          const collAddr = await storage.getCollectionAddress(parsedId);
          if (collAddr && collAddr.wholesalerId === product.wholesalerId) {
            validatedCollectionAddressId = parsedId;
          } else {
            console.warn(`marketplace order: collectionAddressId ${parsedId} invalid for wholesaler ${product.wholesalerId} — ignoring`);
          }
        }
      }

      // Create order with customer details  
      const orderData = {
        orderNumber: await generateOrderNumber(product.wholesalerId),
        wholesalerId: product.wholesalerId,
        retailerId: customer.id,
        customerName, // Store customer name
        customerEmail, // Store customer email
        customerPhone: formattedPhoneNumber, // Store formatted phone number
        subtotal,
        platformFee,
        vatAmount: singleProductVatAmount.toFixed(2),
        ...(singleProductVatRateApplied !== null ? { vatRateApplied: singleProductVatRateApplied.toFixed(4) } : {}),
        total,
        status: 'confirmed',
        notes: notes || `Order placed via marketplace for ${product.name}`,
        collectionAddressId: validatedCollectionAddressId,
      };
      
      const itemQty = parseInt(quantity);
      const itemSellingType = sellingType || 'units';
      const orderItems = [{
        productId: product.id,
        quantity: itemQty,
        unitPrice: product.price,
        total: totalAmount.toString(),
        sellingType: itemSellingType,
        orderId: 0,
        appliedOfferLabel: null,
        freeItems: 0
      }];
      
      // CRITICAL FIX: Use transaction-based order creation for reliable stock processing
      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });
      
      // Send confirmation email to customer
      const wholesaler = await storage.getUser(product.wholesalerId);
      if (wholesaler && customerEmail) {
        try {
          // Use the provided customer email instead of stored email
          const customerForEmail = {
            ...customer,
            email: customerEmail
          };
          await sendCustomerInvoiceEmail(customerForEmail, order, orderItems.map(item => ({
            ...item,
            packDescriptor: formatPackDescriptor(product.packQuantity || product.quantityInPack, product.sizePerUnit || product.unitSize, product.unitOfMeasure),
            product: { name: product.name, price: item.unitPrice, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure }
          })), wholesaler);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }
      }
      
      // Send WhatsApp notification to wholesaler if configured
      try {
        const wholesaler = await storage.getUser(product.wholesalerId);
        if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
          const message = `🔔 New Order Alert!

Customer: ${customerName}
Phone: ${formattedPhoneNumber}
Product: ${product.name}
Quantity: ${formatNumber(quantity)} units
Total: ${getCurrencySymbol(wholesaler.preferredCurrency || 'GBP')}${totalAmount}

Order ID: ${order.id}
Status: Pending Confirmation

Please contact the customer to confirm this order.

✨ Powered by Quikpik Merchant`;

          // Send WhatsApp notification if enabled
          if (wholesaler.whatsappEnabled) {
            await simpleWhatsAppService.sendMessage(
              wholesaler.businessPhone || wholesaler.phoneNumber || '',
              message
            );
          }
        }
      } catch (notificationError) {
        console.warn("Failed to send order notification:", notificationError);
        // Don't fail the order creation if notification fails
      }
      
      res.json({
        success: true,
        orderId: order.id,
        message: "Order placed successfully! The wholesaler will contact you shortly."
      });
      
    } catch (error) {
      console.error("Error creating marketplace order:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // POST /api/customer/orders
  app.post("/api/customer/orders", async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, customerAddress, items, totalAmount, notes, collectionAddressId } = req.body;

      if (!customerName || !customerEmail || !customerPhone || !customerAddress || !items || items.length === 0) {
        return res.status(400).json({ message: "Missing required customer or order information" });
      }

      // Get the first product's wholesaler for the order
      const firstProduct = await storage.getProduct(items[0].productId);
      if (!firstProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Create or get customer
      let customer;
      try {
        customer = await storage.getUserByPhone(customerPhone);
        if (!customer) {
          const { firstName, lastName } = parseCustomerName(customerName);
          customer = await storage.createCustomer({
            phoneNumber: customerPhone,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail,
            streetAddress: customerAddress,
            wholesalerId: firstProduct.wholesalerId
          });
          
          // Send welcome messages to new customer (Customer Portal Orders)
          try {
            const wholesaler = await storage.getUser(firstProduct.wholesalerId);
            if (wholesaler) {
              const customerName = `${firstName} ${lastName}`.trim();
              const portalUrl = `https://quikpik.app/customer/${userId}`;
              const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
              
              console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
              
              const welcomeResult = await sendWelcomeMessages({
                customerName,
                customerEmail: customerEmail,
                customerPhone: customerPhone,
                wholesalerName,
                wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                wholesalerPhone: wholesaler.phoneNumber,
                portalUrl,
                wholesalerId: wholesaler.id,
                wholesalerLogoType: wholesaler.logoType,
                wholesalerLogoUrl: wholesaler.logoUrl,
              });
              
              console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
            }
          } catch (welcomeError) {
            console.error('❌ Error sending welcome messages (Customer Portal Orders):', welcomeError);
          }
        }
      } catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ message: "Failed to create customer record" });
      }

      // Calculate platform fee (4.6%)
      const subtotal = parseFloat(totalAmount);
      const platformFee = calculatePlatformFee(subtotal);

      // VAT calculation — look up wholesaler VAT settings
      const portalWholesalerForVat = await storage.getUser(firstProduct.wholesalerId);
      const portalVatEnabled = portalWholesalerForVat?.vatEnabled ?? false;
      const portalVatRate = parseFloat(portalWholesalerForVat?.vatRate ?? '0');
      const portalVatAmount = portalVatEnabled ? subtotal * portalVatRate : 0;
      const portalVatRateApplied = portalVatEnabled ? portalVatRate : null;
      const finalTotal = subtotal + portalVatAmount;

      // Validate collectionAddressId belongs to this wholesaler (multi-tenant safety)
      let validatedCollAddrId: number | null = null;
      if (collectionAddressId) {
        const parsedId = parseInt(String(collectionAddressId), 10);
        if (!isNaN(parsedId)) {
          const collAddr = await storage.getCollectionAddress(parsedId);
          if (collAddr && collAddr.wholesalerId === firstProduct.wholesalerId) {
            validatedCollAddrId = parsedId;
          } else {
            console.warn(`customer order: collectionAddressId ${parsedId} invalid for wholesaler ${firstProduct.wholesalerId} — ignoring`);
          }
        }
      }

      // Create the order with customer details using transaction-based approach
      const orderData = {
        orderNumber: await generateOrderNumber(firstProduct.wholesalerId),
        retailerId: customer.id,
        wholesalerId: firstProduct.wholesalerId,
        customerName, // Store customer name
        customerEmail, // Store customer email 
        customerPhone, // Store customer phone
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        vatAmount: portalVatAmount.toFixed(2),
        ...(portalVatRateApplied !== null ? { vatRateApplied: portalVatRateApplied.toFixed(4) } : {}),
        total: finalTotal.toFixed(2),
        status: 'confirmed',
        deliveryAddress: customerAddress,
        notes: notes || '',
        collectionAddressId: validatedCollAddrId,
      };

      const orderItems = items.map((item: any) => {
        return {
          ...item,
          orderId: 0,
          appliedOfferLabel: item.appliedOfferLabel || null,
          freeItems: item.freeItems || 0
        };
      });

      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });

      const wholesaler = await storage.getUser(firstProduct.wholesalerId);

      // Send email invoice to customer
      try {
        // Enrich items with product details for email
        const enrichedItems = await Promise.all(items.map(async (item: any) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || 'Product',
            packDescriptor: formatPackDescriptor(product?.packQuantity || product?.quantityInPack, product?.sizePerUnit || product?.unitSize, product?.unitOfMeasure),
            product: product ? { name: product.name, price: item.unitPrice, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(customer, order, enrichedItems, wholesaler);
      } catch (error) {
        console.error("Failed to send customer invoice email:", error);
        // Don't fail the order creation if email fails
      }

      // Notify wholesaler via WhatsApp
      try {
        const wholesaler = await storage.getUser(firstProduct.wholesalerId);
        if (wholesaler && wholesaler.businessPhone) {
          const message = generateOrderNotificationMessage(order, customer, items);
          // Send WhatsApp notification if enabled
          if (wholesaler.whatsappEnabled) {
            await simpleWhatsAppService.sendMessage(wholesaler.businessPhone, message);
          }
        }
      } catch (error) {
        console.error("Failed to send WhatsApp notification:", error);
        // Don't fail the order creation if notification fails
      }

      res.json({
        success: true,
        orderId: order.id,
        message: "Order placed successfully! You'll receive an email invoice and the wholesaler will contact you shortly."
      });

    } catch (error) {
      console.error("Error creating customer order:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // GET /api/customer-orders/:wholesalerId/:phoneNumber/:orderId/invoice
  app.get('/api/customer-orders/:wholesalerId/:phoneNumber/:orderId/invoice', async (req, res) => {
    try {
      const { wholesalerId, orderId } = req.params;

      // Session guard
      const sessionAuth = await resolveCustomerAuth(req, wholesalerId);
      if (!sessionAuth) return res.status(401).json({ message: "Not authenticated" });

      const customerId: string = sessionAuth.customerId;
      const customerPhone: string = sessionAuth.phone || '';

      const order = await storage.getOrder(parseInt(orderId));
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ message: "Not authorized" });

      // Verify the order belongs to this customer (by customerId or phone)
      const normalizedSessionPhone = customerPhone.replace(/^\+44/, '0').replace(/[^0-9]/g, '');
      const normalizedOrderPhone = (order.customerPhone || '').replace(/^\+44/, '0').replace(/[^0-9]/g, '');
      const belongsToCustomer =
        order.retailerId === customerId ||
        (normalizedOrderPhone.length >= 10 && normalizedOrderPhone === normalizedSessionPhone);
      if (!belongsToCustomer) return res.status(403).json({ message: "Not authorized" });

      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: "Wholesaler not found" });

      const pdfBuffer = await buildInvoicePdf(order, wholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod));
      const filename = `invoice-${order.orderNumber || order.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating customer invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
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

  // POST /api/customer/orders/:orderId/payment-link/:phoneNumber
  app.post('/api/customer/orders/:orderId/payment-link/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const customerPhone = decodeURIComponent(req.params.phoneNumber);

      if (!customerPhone) {
        return res.status(400).json({ error: 'Customer phone is required' });
      }

      // Get the order
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the order belongs to this customer (by phone - matches portal auth pattern)
      if (order.customerPhone !== customerPhone) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const amountOutstanding = parseFloat(order.amountOutstanding || '0');
      if (amountOutstanding <= 0) {
        return res.status(400).json({ error: 'No outstanding balance on this order' });
      }

      // For balance payments, always generate a fresh Stripe checkout session
      // The original payment link was for the deposit and is now completed/expired
      console.log(`💳 Generating fresh balance payment link for order ${order.orderNumber}, amount: £${amountOutstanding.toFixed(2)}`);

      // Generate a new payment link — derive Stripe client from wholesaler's test mode flag
      const wholesaler = await storage.getUser(order.wholesalerId);
      const customer = await storage.getUser(order.retailerId);
      const stripe = getStripeClient(Boolean(wholesaler?.isTestAccount));

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let customerBalanceUseConnect = false;
      if (wholesaler?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            customerBalanceUseConnect = true;
            console.log(`✅ Customer balance link Connect account active: ${wholesaler.stripeAccountId}`);
          } else {
            console.log(`⚠️ Customer balance link Connect account not ready: ${wholesaler.stripeAccountId}`);
          }
        } catch (connectErr: any) {
          console.error(`❌ Customer balance link Connect account validation failed: ${connectErr.message}`);
        }
      }

      // Wholesaler's proportional cut of this payment (subtotal - 4.6% platform fee, pro-rated)
      const customerBalanceOrderTotal = parseFloat(order.total || '0');
      const customerBalanceWholesalerTotal = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
      const customerBalanceTransferAmount = customerBalanceOrderTotal > 0
        ? Math.round(amountOutstanding * (customerBalanceWholesalerTotal / customerBalanceOrderTotal) * 100)
        : 0;

      // Create Stripe checkout session for remaining balance
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Remaining Balance - Order ${order.orderNumber}`,
              description: `Payment for remaining balance. Original order total: £${order.total}`,
            },
            unit_amount: Math.round(amountOutstanding * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/customer/payment-success?order=${order.orderNumber}&wholesaler=${order.wholesalerId}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/store/${order.wholesalerId}`,
        metadata: {
          orderId: orderId.toString(),
          orderNumber: order.orderNumber || '',
          wholesalerId: order.wholesalerId,
          customerId: order.retailerId,
          isQuote: 'true',
          isBalancePayment: 'true',
          depositPercentage: '100',
          depositAmount: amountOutstanding.toFixed(2),
          totalAmount: order.total || '0',
        },
        customer_email: customer?.email || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        ...(customerBalanceUseConnect && customerBalanceTransferAmount > 0 ? {
          payment_intent_data: {
            transfer_data: {
              destination: wholesaler!.stripeAccountId!,
              amount: customerBalanceTransferAmount,
            },
          },
        } : {}),
      });

      // Update order with new payment link
      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, orderId));

      console.log(`✅ Customer-initiated balance payment link generated for order ${order.orderNumber}: ${session.url}`);

      res.json({
        success: true,
        paymentLink: session.url,
        amount: amountOutstanding.toFixed(2),
        isExisting: false,
      });

    } catch (error) {
      console.error('❌ Error generating customer payment link:', error);
      res.status(500).json({ error: 'Failed to generate payment link' });
    }
  });

  // GET /api/customer/orders/:orderId/reorder-preview/:phoneNumber
  app.get('/api/customer/orders/:orderId/reorder-preview/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const customerPhone = decodeURIComponent(req.params.phoneNumber);

      if (!customerPhone || isNaN(orderId)) {
        return res.status(400).json({ error: 'Valid order ID and customer phone are required' });
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '').slice(-10);
      if (normalizePhone(order.customerPhone || '') !== normalizePhone(customerPhone)) {
        return res.status(403).json({ error: 'You can only reorder your own orders' });
      }

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      
      const productIds = items.map(i => i.productId);
      const productResults = await db.select().from(products).where(inArray(products.id, productIds));
      const productMap = new Map(productResults.map(p => [p.id, p]));

      // Resolve price list overrides for this customer
      const priceOverrides: Record<number, number> = {};
      const palletPriceOverrides: Record<number, number> = {};
      const previewCustomerId = order.retailerId;
      if (previewCustomerId) {
        try {
          const listIds = await resolveActivePriceListIds(order.wholesalerId, previewCustomerId);
          if (listIds.length > 0) {
            const plItems = await db
              .select({
                productId: priceListItems.productId,
                customPrice: priceListItems.customPrice,
                discountPercentage: priceListItems.discountPercentage,
                customPalletPrice: priceListItems.customPalletPrice,
              })
              .from(priceListItems)
              .where(and(inArray(priceListItems.priceListId, listIds), inArray(priceListItems.productId, productIds)));
            for (const row of plItems) {
              if (row.productId === null) continue;
              const baseProduct = productMap.get(row.productId);
              if (!baseProduct) continue;
              const base = parseFloat(baseProduct.price || '0');
              const effective = computeEffectivePrice(base, row);
              // Only apply unit override when there is a real discount/custom price (lower than base)
              if (effective < base) {
                if (priceOverrides[row.productId] === undefined || effective < priceOverrides[row.productId]) {
                  priceOverrides[row.productId] = effective;
                }
              }
              if (row.customPalletPrice != null) {
                const palletEffective = parseFloat(String(row.customPalletPrice));
                if (palletPriceOverrides[row.productId] === undefined || palletEffective < palletPriceOverrides[row.productId]) {
                  palletPriceOverrides[row.productId] = palletEffective;
                }
              }
            }
          }
        } catch (plErr) {
          console.warn('⚠️ Could not fetch price list overrides for reorder preview:', plErr);
        }
      }

      const previewItems = items.map(item => {
        const product = productMap.get(item.productId);
        let currentUnitPrice: number;
        if (!product) {
          currentUnitPrice = parseFloat(item.unitPrice);
        } else if (item.sellingType === 'pallets') {
          currentUnitPrice = palletPriceOverrides[item.productId] ?? parseFloat(product.palletPrice || product.price);
        } else if (item.sellingType === 'packs') {
          const packSize = product.quantityInPack || 1;
          const unitPrice = priceOverrides[item.productId] ?? parseFloat(product.promoPrice || product.price);
          currentUnitPrice = unitPrice * packSize;
        } else {
          currentUnitPrice = priceOverrides[item.productId] ?? parseFloat(product.promoPrice || product.price);
        }
        const currentTotal = currentUnitPrice * item.quantity;
        return {
          productName: product?.name || 'Unknown Product',
          quantity: item.quantity,
          unitPrice: currentUnitPrice.toFixed(2),
          total: currentTotal.toFixed(2),
          sellingType: item.sellingType || 'units',
          inStock: product ? (product.stock || 0) >= item.quantity : false,
          totalPackageWeight: product?.totalPackageWeight || null,
          palletWeight: product?.palletWeight || null,
          packQuantity: product?.quantityInPack ?? null,
          unitSize: product?.unitSize ?? null,
          unitOfMeasure: product?.unitOfMeasure ?? null,
        };
      });

      const subtotal = previewItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const customerTransactionFee = calculateCustomerFee(subtotal, 0);
      const deliveryCost = parseFloat(order.deliveryCost || '0');
      const shippingTotal = parseFloat(order.shippingTotal || '0');
      const total = subtotal + customerTransactionFee + deliveryCost + shippingTotal;

      res.json({
        success: true,
        orderNumber: order.orderNumber,
        fulfillmentType: order.fulfillmentType,
        items: previewItems,
        subtotal: subtotal.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        deliveryCost: deliveryCost.toFixed(2),
        shippingTotal: shippingTotal.toFixed(2),
        total: total.toFixed(2),
      });
    } catch (error) {
      console.error('❌ Error fetching reorder preview:', error);
      res.status(500).json({ error: 'Failed to fetch reorder preview' });
    }
  });

  // POST /api/customer/orders/:orderId/reorder/:phoneNumber
  app.post('/api/customer/orders/:orderId/reorder/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const customerPhone = decodeURIComponent(req.params.phoneNumber);

      if (!customerPhone || isNaN(orderId)) {
        return res.status(400).json({ error: 'Valid order ID and customer phone are required' });
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '').slice(-10);
      if (normalizePhone(order.customerPhone || '') !== normalizePhone(customerPhone)) {
        return res.status(403).json({ error: 'You can only reorder your own orders' });
      }

      const originalItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      if (!originalItems.length) {
        return res.status(400).json({ error: 'No items found in the original order' });
      }

      // Derive Stripe client from the order's wholesaler test mode flag
      const reorderWholesalerObj = await storage.getUser(order.wholesalerId);
      const stripe = getStripeClient(Boolean(reorderWholesalerObj?.isTestAccount));

      // Fetch current product prices
      const reorderProductIds = originalItems.map(i => i.productId);
      const reorderProductResults = await db.select().from(products).where(inArray(products.id, reorderProductIds));
      const reorderProductMap = new Map(reorderProductResults.map(p => [p.id, p]));

      // Resolve price list overrides for this customer
      const reorderPriceOverrides: Record<number, number> = {};
      const reorderPalletPriceOverrides: Record<number, number> = {};
      const reorderCustomerId = order.retailerId;
      if (reorderCustomerId) {
        try {
          const listIds = await resolveActivePriceListIds(order.wholesalerId, reorderCustomerId);
          if (listIds.length > 0) {
            const plItems = await db
              .select({
                productId: priceListItems.productId,
                customPrice: priceListItems.customPrice,
                discountPercentage: priceListItems.discountPercentage,
                customPalletPrice: priceListItems.customPalletPrice,
              })
              .from(priceListItems)
              .where(and(inArray(priceListItems.priceListId, listIds), inArray(priceListItems.productId, reorderProductIds)));
            for (const row of plItems) {
              if (row.productId === null) continue;
              const baseProduct = reorderProductMap.get(row.productId);
              if (!baseProduct) continue;
              const base = parseFloat(baseProduct.price || '0');
              const effective = computeEffectivePrice(base, row);
              // Only apply unit override when there is a real discount/custom price (lower than base)
              if (effective < base) {
                if (reorderPriceOverrides[row.productId] === undefined || effective < reorderPriceOverrides[row.productId]) {
                  reorderPriceOverrides[row.productId] = effective;
                }
              }
              if (row.customPalletPrice != null) {
                const palletEffective = parseFloat(String(row.customPalletPrice));
                if (reorderPalletPriceOverrides[row.productId] === undefined || palletEffective < reorderPalletPriceOverrides[row.productId]) {
                  reorderPalletPriceOverrides[row.productId] = palletEffective;
                }
              }
            }
          }
        } catch (plErr) {
          console.warn('⚠️ Could not fetch price list overrides for reorder create:', plErr);
        }
      }

      const newOrderNumber = await generateOrderNumber(order.wholesalerId);

      // Recalculate each item at current prices (price list takes priority over catalog price)
      const pricedItems = originalItems.map(item => {
        const product = reorderProductMap.get(item.productId);
        let currentUnitPrice: number;
        if (!product) {
          currentUnitPrice = parseFloat(item.unitPrice);
        } else if (item.sellingType === 'pallets') {
          currentUnitPrice = reorderPalletPriceOverrides[item.productId] ?? parseFloat(product.palletPrice || product.price);
        } else if (item.sellingType === 'packs') {
          const packSize = product.quantityInPack || 1;
          const unitPrice = reorderPriceOverrides[item.productId] ?? parseFloat(product.promoPrice || product.price);
          currentUnitPrice = unitPrice * packSize;
        } else {
          currentUnitPrice = reorderPriceOverrides[item.productId] ?? parseFloat(product.promoPrice || product.price);
        }
        return { ...item, currentUnitPrice, currentTotal: currentUnitPrice * item.quantity };
      });

      const subtotal = pricedItems.reduce((sum, item) => sum + item.currentTotal, 0);
      const platformFee = calculatePlatformFee(subtotal);
      const reorderFeeConfig = await getCurrentFeeConfig();
      const customerTransactionFee = calculateCustomerFee(subtotal, 0, reorderFeeConfig);
      const deliveryCost = parseFloat(order.deliveryCost || '0');
      const shippingTotal = parseFloat(order.shippingTotal || '0');

      // VAT calculation — reorderWholesalerObj already fetched above
      const reorderVatEnabled = reorderWholesalerObj?.vatEnabled ?? false;
      const reorderVatRate = parseFloat(reorderWholesalerObj?.vatRate ?? '0');
      const reorderVatAmount = reorderVatEnabled ? subtotal * reorderVatRate : 0;
      const reorderVatRateApplied = reorderVatEnabled ? reorderVatRate : null;
      const total = subtotal + reorderVatAmount + customerTransactionFee + deliveryCost + shippingTotal;

      const newOrderData: any = {
        orderNumber: newOrderNumber,
        wholesalerId: order.wholesalerId,
        retailerId: order.retailerId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        status: 'pending',
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        feePercentageUsed: reorderFeeConfig.percentage.toFixed(4),
        fixedFeeUsed: reorderFeeConfig.fixed.toFixed(2),
        vatAmount: reorderVatAmount.toFixed(2),
        ...(reorderVatRateApplied !== null ? { vatRateApplied: reorderVatRateApplied.toFixed(4) } : {}),
        total: total.toFixed(2),
        fulfillmentType: order.fulfillmentType,
        deliveryAddress: order.deliveryAddress,
        deliveryAddressId: order.deliveryAddressId,
        deliveryCost: deliveryCost.toFixed(2),
        deliveryCarrier: order.deliveryCarrier,
        shippingTotal: shippingTotal > 0 ? shippingTotal.toFixed(2) : undefined,
        notes: `Reorder of ${order.orderNumber}`,
        isQuote: true,
        depositPercentage: 100,
        balanceDueDays: 0,
        amountPaid: '0.00',
        amountOutstanding: total.toFixed(2),
        paymentStatus: 'unpaid',
      };

      const newOrderItems = pricedItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.currentUnitPrice.toFixed(2),
        total: item.currentTotal.toFixed(2),
        sellingType: item.sellingType || 'units',
        appliedOfferLabel: null,
        freeItems: 0,
      }));

      const createdOrder = await storage.createOrderWithTransaction(
        db,
        newOrderData,
        newOrderItems
      );

      const appUrl = process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app');

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Reorder - ${newOrderNumber}`,
              description: `Reorder of ${order.orderNumber}`,
            },
            unit_amount: Math.round(total * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${appUrl}/customer/payment-success?order=${newOrderNumber}&wholesaler=${order.wholesalerId}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/store/${order.wholesalerId}`,
        metadata: {
          orderId: createdOrder.id.toString(),
          orderNumber: newOrderNumber,
          wholesalerId: order.wholesalerId,
          customerId: order.retailerId,
          isQuote: 'true',
          isReorder: 'true',
          depositPercentage: '100',
          depositAmount: total.toFixed(2),
          totalAmount: total.toFixed(2),
        },
        customer_email: order.customerEmail || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
      });

      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, createdOrder.id));

      console.log(`🔄 Reorder created: ${newOrderNumber} (from ${order.orderNumber}) for customer ${order.customerName} - payment link generated`);

      res.json({
        success: true,
        orderNumber: newOrderNumber,
        orderId: createdOrder.id,
        paymentLink: session.url,
      });

    } catch (error) {
      console.error('❌ Error creating reorder:', error);
      res.status(500).json({ error: 'Failed to create reorder' });
    }
  });

}
