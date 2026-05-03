/**
 * marketplace-orders.ts
 *
 * All customer-facing order route handlers extracted from marketplace.ts.
 * Registered via registerOrderRoutes(app, orderCreateLimiter, customerActionLimiter).
 *
 * Routes:
 *   GET  /api/customer-orders/:wholesalerId/:phoneNumber
 *   POST /api/customer/shipping-choice
 *   GET  /api/quick-order-templates/:wholesalerId/:phoneNumber
 *   GET  /api/frequently-ordered/:wholesalerId/:phoneNumber
 *   GET  /api/last-order-reorder/:wholesalerId/:phoneNumber
 *   GET  /api/customer-orders/stats/:wholesalerId/:phoneNumber
 *   POST /api/marketplace/create-order
 *   POST /api/marketplace/create-order-pay-later
 *   POST /api/customer/orders/:id/request-cancellation
 *   GET  /api/customer/orders/:id/can-cancel
 *   POST /api/marketplace/orders
 *   POST /api/customer/orders
 *   GET  /api/customer-orders/:wholesalerId/:phoneNumber/:orderId/invoice
 *   GET  /api/customer/orders/:orderId/reorder-preview/:phoneNumber
 *   POST /api/customer/orders/:orderId/reorder/:phoneNumber
 */
import type { Express, RequestHandler } from "express";
import { calculateCustomerFee, calculatePlatformFee } from "../../shared/utils/fees";
import { getCurrentFeeConfig } from "../utils/fee-config";
import {
  and, buildInvoicePdf, db, desc, emailButton, emailCard, emailHeading, eq,
  formatNumber, formatPhoneToInternational,
  generateOrderNotificationMessage, generateOrderNumber,
  generateWholesalerOrderNotificationEmail,
  getCurrencySymbol, getEmailLogoUrl, getStripeClient, inArray, isLiveMode, like,
  or, orderCancellationRequests, orderItems, orders,
  formatPackDescriptor, parseCustomerName, products, quickOrderService,
  sendCustomerInvoiceEmail, sendEmail, sendWhatsAppMessage, sendWelcomeMessages,
  storage, validatePhoneNumber,
  whatsAppBusinessService, wrapCustomerEmail,
  priceListItems,
  type OrderEmailData,
} from "./shared";
import {
  computeEffectivePrice,
  resolveActivePriceListIds,
} from "./marketplace-price-lists";
import { parseCustomerCookie } from "../utils/customer-auth-cookie";

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Resolves customer auth from the session, with an HMAC-verified cookie fallback.
 * Returns the auth object when valid, or null to trigger a 401.
 *
 * Cookie fallback: calls parseCustomerCookie which verifies the HMAC-SHA256
 * signature before JSON-parsing the payload. No DB lookup is needed — the
 * signature already guarantees the payload was issued by this server and has
 * not been tampered with.
 */
export async function resolveCustomerAuth(
  req: any,
  wholesalerId: string
): Promise<{ customerId: string; wholesalerId: string; phone: string } | null> {
  const sessionAuth = req.session?.customerAuth;
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

// ── Route registration ────────────────────────────────────────────────────────

export function registerOrderRoutes(
  app: Express,
  orderCreateLimiter: RequestHandler,
  customerActionLimiter: RequestHandler
): void {

  // GET /api/customer-orders/:wholesalerId/:phoneNumber
  app.get('/api/customer-orders/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const limitParam = req.query.limit ? Math.min(parseInt(req.query.limit as string) || 50, 200) : undefined;

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
            or(...phoneConditions)
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
          wholesalerName: wholesalerUser.businessName || `${wholesalerUser.firstName || ''} ${wholesalerUser.lastName || ''}`.trim(),
          wholesalerEmail: wholesalerUser.email || '',
          wholesalerPhone: wholesalerUser.businessPhone || '',
          deliveryNote: wholesalerUser.deliveryNote || null,
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
        const orderVatAmount = parseFloat(order.vatAmount || '0');
        const correctedTotal = isOnline ? total : (subtotal + orderVatAmount + deliveryCost);

        // Platform fee paid by wholesaler: 4.6% of product subtotal (not shown to customers but calculated for completeness)
        const platformFee = calculatePlatformFee(subtotal);

        return {
          id: order.id,
          orderNumber: order.orderNumber || `#${order.id}`,
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

  // POST /api/customer/shipping-choice
  app.post("/api/customer/shipping-choice", customerActionLimiter, async (req, res) => {
    try {
      const { customerId, shippingChoice } = req.body;

      if (!customerId || !shippingChoice || !['pickup', 'delivery'].includes(shippingChoice)) {
        return res.status(400).json({ error: "Invalid customer ID or shipping choice" });
      }

      await storage.setCustomerShippingChoice(customerId, shippingChoice);

      res.json({ success: true, shippingChoice });
    } catch (error) {
      console.error("Error saving shipping choice:", error);
      res.status(500).json({ error: "Failed to save shipping choice" });
    }
  });

  // GET /api/quick-order-templates/:wholesalerId/:phoneNumber
  app.get('/api/quick-order-templates/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const sessionAuth = req.session?.customerAuth;
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
      const sessionAuth = req.session?.customerAuth;
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
      const sessionAuth = req.session?.customerAuth;
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
            or(...phoneConditions)
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

  // POST /api/marketplace/create-order
  app.post('/api/marketplace/create-order', orderCreateLimiter, async (req, res) => {
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
      let selectedDeliveryAddress: any = null;
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

        // If phone lookup fails, try email lookup
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
            wholesalerId: wholesalerId
          });

          // Send welcome messages to new customer (Payment Processing)
          try {
            const wholesaler = await storage.getUser(wholesalerId);
            if (wholesaler) {
              const customerName = `${firstName || ''} ${lastName || ''}`.trim();
              const portalUrl = `https://quikpik.app/customer/${customer!.id}`;
              const wholesalerName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';

              const welcomeResult = await sendWelcomeMessages({
                customerName,
                customerEmail: customerEmail || '',
                customerPhone: customerPhone,
                wholesalerName,
                wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                wholesalerPhone: wholesaler.phoneNumber || '',
                wholesalerAccountName: `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'IBK',
                portalUrl,
                wholesalerId: wholesaler.id,
                wholesalerLogoType: wholesaler.logoType,
                wholesalerLogoUrl: wholesaler.logoUrl,
              });

            }
          } catch (welcomeError) {
            const msg = welcomeError instanceof Error ? welcomeError.message : String(welcomeError);
            console.error(`❌ Welcome messages failed [service=sendWelcomeMessages wholesalerId=${wholesalerId}]: ${msg}`);
          }
        } else {
          // Check if email belongs to different customer before updating
          let emailConflict = false;
          if (customerEmail && customer.email !== customerEmail) {
            const existingEmailUser = await storage.getUserByEmail(customerEmail);
            if (existingEmailUser && existingEmailUser.id !== customer.id) {
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
              await storage.updateCustomerPhone(customer.id, customerPhone);
              customer.phoneNumber = customerPhone; // Update local copy
            }

          }
        }

        // 🚚 SHIPPING INFO: Already parsed above for debug logging - use existing shippingInfo variable

        // ENHANCED LOGGING: Alert if shipping info is missing or defaults to pickup
        if (!shippingInfoJson) {
          console.error(`🚨 CRITICAL: No shippingInfo in payment metadata for ${paymentIntentId}! This will default to pickup.`);
          console.error(`🚨 Payment metadata keys:`, Object.keys(paymentIntent.metadata || {}));
        } else if (shippingInfo.option === 'pickup') {
        } else if (shippingInfo.option === 'delivery') {
        }

        // Use actual order shipping choice, not saved customer preference
        const fulfillmentType = shippingInfo.option === 'delivery' ? 'delivery' : 'pickup';

        // CRITICAL FIX: Use explicit address ID from payment metadata if available, ALWAYS override metadata address
        if (fulfillmentType === 'delivery' && selectedDeliveryAddressId) {
          try {

            // CRITICAL FIX: Get the specific address directly by ID since customer already selected it
            const explicitlySelectedAddress = await storage.getDeliveryAddressById(parseInt(selectedDeliveryAddressId));

            if (explicitlySelectedAddress) {
              selectedDeliveryAddress = {
                id: explicitlySelectedAddress.id,
                addressLine1: explicitlySelectedAddress.addressLine1 || '',
                addressLine2: explicitlySelectedAddress.addressLine2 || null,
                city: explicitlySelectedAddress.city || '',
                state: explicitlySelectedAddress.state || null,
                postalCode: explicitlySelectedAddress.postalCode || '',
                country: explicitlySelectedAddress.country || 'United Kingdom'
              };
            } else {
              console.warn(`⚠️ MARKETPLACE: Customer selected address ID ${selectedDeliveryAddressId} not found in database. Attempting fallback from all customer addresses...`);
              try {
                const allCustomerAddresses = await storage.getDeliveryAddresses(customer!.id);
                const fallbackAddr = allCustomerAddresses.find((addr: any) => !addr.isDefault) || allCustomerAddresses[0];
                if (fallbackAddr) {
                  selectedDeliveryAddress = {
                    id: fallbackAddr.id,
                    addressLine1: fallbackAddr.addressLine1 || '',
                    addressLine2: fallbackAddr.addressLine2 || null,
                    city: fallbackAddr.city || '',
                    state: fallbackAddr.state || null,
                    postalCode: fallbackAddr.postalCode || '',
                    country: fallbackAddr.country || 'United Kingdom'
                  };
                } else {
                  console.warn(`⚠️ MARKETPLACE: No addresses found for customer ${customer!.id}. Proceeding without address snapshot.`);
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

        // ATOMIC ORDER NUMBER GENERATION: Use database transaction with proper sequential numbering AND duplicate checking
        let order, wholesaleRef;

        try {
          const result = await db.transaction(async (trx) => {
            // CRITICAL FIX: Check for existing order WITHIN the transaction for true atomicity
            const existingOrderResult = await trx
              .select()
              .from(orders)
              .where(like(orders.stripePaymentIntentId, `%${paymentIntentId}%`))
              .limit(1);

            if (existingOrderResult.length > 0) {
              const existingOrder = existingOrderResult[0];
              throw new Error(`DUPLICATE_ORDER:${existingOrder.id}:${existingOrder.orderNumber}`);
            }

            // Use consistent order number generation
            const wholesaleRef = await generateOrderNumber(wholesalerId, trx);

            // CRITICAL FIX: Calculate subtotal from items when metadata missing
            const safeSubtotal = productSubtotal && productSubtotal !== 'null' && productSubtotal !== 'undefined'
              ? parseFloat(productSubtotal).toFixed(2)
              : items.reduce((sum: number, item: any) => sum + (parseFloat(item.unitPrice) * item.quantity), 0).toFixed(2);

            // VAT — read from Stripe payment metadata (set at checkout creation time)
            const webhookVatAmount = parseFloat(metadataVatAmount || '0');
            const webhookVatRateAppliedStr = metadataVatRateApplied && metadataVatRateApplied !== '0' ? metadataVatRateApplied : null;

            // Create order with customer details AND SHIPPING DATA
            const orderData = {
              orderNumber: wholesaleRef, // Use wholesale reference as order number for consistency
              wholesalerId,
              retailerId: customer!.id,
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

            // Use transaction-aware storage method with integrity check
            const createdOrder = await storage.createOrderWithTransaction(trx, orderData, orderItemsData);

            // 🔒 DATA INTEGRITY: Verify all items were saved correctly
            const savedItems = await trx.select().from(orderItems).where(eq(orderItems.orderId, createdOrder.id));
            if (savedItems.length !== items.length) {
              console.error(`❌ DATA INTEGRITY ALERT: Expected ${items.length} items, but only saved ${savedItems.length} for order ${createdOrder.id}`);
              throw new Error(`Data integrity failure: Expected ${items.length} items, saved ${savedItems.length}`);
            }

            return { order: createdOrder, wholesaleRef };
          });

          order = result.order;
          wholesaleRef = result.wholesaleRef;
        } catch (error: any) {
          // Handle duplicate order errors gracefully
          if (error.message.startsWith('DUPLICATE_ORDER:')) {
            const [, orderId, orderNumber] = error.message.split(':');
            return res.json({
              success: true,
              orderId: parseInt(orderId),
              orderNumber: orderNumber, // Include order number in response
              message: 'Order already processed'
            });
          }
          throw error; // Re-throw other errors
        }

        // Capture Stripe Transfer ID for exact payout-to-order reconciliation.
        // This runs outside the transaction so a Stripe API failure never blocks the order.
        if (paymentIntent?.id) {
          try {
            // Re-derive the Stripe client from the wholesaler in the PI metadata
            const piWholesalerId = paymentIntent.metadata?.wholesalerId as string | undefined;
            const piWholesalerObj = piWholesalerId ? await storage.getUser(piWholesalerId) : null;
            if (!piWholesalerObj) throw new Error('Wholesaler not found for PI metadata — skipping transfer capture');
            const stripe = getStripeClient(Boolean(piWholesalerObj.isTestAccount));
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

          } catch (emailError) {
            const msg = emailError instanceof Error ? emailError.message : String(emailError);
            console.warn(`[sendgrid] stripe-checkout confirmation email failed [orderId=${order.id}]: ${msg}`);
          }
        }

        // Send WhatsApp notification to wholesaler with wholesale reference
        if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
          const currencySymbol = getCurrencySymbol(wholesaler.preferredCurrency || 'GBP');
          const message = `🎉 New Order Received!\n\nWholesale Ref: ${wholesaleRef}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nQuote this reference when communicating with the customer.`;

          try {
            // WhatsApp notification (simplified)
            if (wholesaler.whatsappEnabled) {
              if (wholesaler.whatsappAccessToken && wholesaler.whatsappBusinessPhoneId) {
                await whatsAppBusinessService.sendMessage(wholesaler.businessPhone || '', message, {
                  accessToken: wholesaler.whatsappAccessToken,
                  phoneNumberId: wholesaler.whatsappBusinessPhoneId
                });
              }
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[whatsapp-business] wholesaler order notification failed: ${msg}`);
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
              } catch (e) {
                console.warn('[marketplace] collection address lookup failed:', e instanceof Error ? e.message : e);
              }
            }

            const emailData: OrderEmailData = {
              orderNumber: order.orderNumber || `ORD-${order.id}`,
              customerName,
              customerEmail: customerEmail || '',
              customerPhone,
              shippingAddress: shippingAddress ?? undefined,
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
                businessName: wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim(),
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

          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[sendgrid] wholesaler order notification email failed: ${msg}`);
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
      res.status(500).json({ message: 'Failed to create order. Please try again.' });
    }
  });

  // POST /api/marketplace/create-order-pay-later
  app.post('/api/marketplace/create-order-pay-later', orderCreateLimiter, async (req, res) => {
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
            const wsName = ws.businessName || `${ws.firstName || ''} ${ws.lastName || ''}`.trim() || 'Your Wholesale Partner';
            await sendWelcomeMessages({
              customerName: `${firstName || ''} ${lastName || ''}`.trim(),
              customerEmail: customerEmail || '',
              customerPhone,
              wholesalerName: wsName,
              wholesalerEmail: ws.email || 'hello@quikpik.co',
              wholesalerPhone: ws.phoneNumber || '',
              wholesalerAccountName: `${ws.firstName || ''} ${ws.lastName || ''}`.trim() || 'IBK',
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
        retailerId: customer!.id,
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
          const msg = waError instanceof Error ? waError.message : String(waError);
          console.error(`❌ WhatsApp notification failed [service=WhatsAppBusiness endpoint=pay-later orderId=${order.id}]: ${msg}`);
        }
      }

      if (wholesalerProfile && customerEmail) {
        try {
          const savedItems = await storage.getOrderItems(order.id);
          const enrichedItems = await Promise.all(savedItems.map(async (item) => {
            const prod = await storage.getProduct(item.productId ?? 0);
            return { ...item, productName: prod?.name || `Product #${item.productId}`, packDescriptor: formatPackDescriptor(prod?.packQuantity || prod?.quantityInPack, prod?.sizePerUnit || prod?.unitSize, prod?.unitOfMeasure), product: prod ? { name: prod.name, packQuantity: prod.packQuantity, quantityInPack: prod.quantityInPack, sizePerUnit: prod.sizePerUnit, unitSize: prod.unitSize, unitOfMeasure: prod.unitOfMeasure } : null };
          }));
          await sendCustomerInvoiceEmail(
            { name: customerName, email: customerEmail, phone: customerPhone, address: deliveryAddress || undefined },
            order,
            enrichedItems,
            wholesalerProfile
          );
        } catch (emailError) {
          const msg = emailError instanceof Error ? emailError.message : String(emailError);
          console.warn(`[sendgrid] pay-later customer invoice failed [orderId=${order.id} to=${customerEmail}]: ${msg}`);
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
            } catch (e) {
              console.warn('[marketplace] collection address lookup failed (pay-later):', e instanceof Error ? e.message : e);
            }
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
              businessName: wholesalerProfile.businessName || `${wholesalerProfile.firstName || ''} ${wholesalerProfile.lastName || ''}`.trim(),
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
          const msg = emailError instanceof Error ? emailError.message : String(emailError);
          console.warn(`[sendgrid] pay-later wholesaler notification failed [orderId=${order.id} to=${wholesalerProfile?.email}]: ${msg}`);
        }
      }

      return res.json({
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber || orderNumber,
      });
    } catch (error: unknown) {
      console.error('❌ Error creating pay-later order:', error);
      res.status(500).json({ message: 'Failed to create order. Please try again.' });
    }
  });

  // POST /api/customer/orders/:id/request-cancellation
  app.post('/api/customer/orders/:id/request-cancellation', customerActionLimiter, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
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
      const orderCustomerPhone = order.customerPhone;
      if (!orderCustomerPhone || orderCustomerPhone !== customerPhone) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      // Check if order is within 24-hour window
      const orderDate = new Date(order.createdAt ?? new Date());
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

      // Notify wholesaler about the cancellation request via SMS and email
      try {
        const wholesaler = await storage.getUser(order.wholesalerId);
        const customerName = order.customerName || customerPhone;

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
            html: wrapCustomerEmail(cancelRequestBody, { businessName: wholesaler.businessName || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `${customerName} has requested to cancel order ${order.orderNumber}` }),
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[sendgrid] cancellation request notification failed: ${msg}`);
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
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
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
      const orderCustomerPhone = order.customerPhone;
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
      const orderDate = new Date(order.createdAt ?? new Date());
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

  // POST /api/marketplace/orders
  app.post('/api/marketplace/orders', customerActionLimiter, async (req, res) => {
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
            const customerName = `${firstName || ''} ${lastName || ''}`.trim();
            const portalUrl = `https://quikpik.app/customer/${customer!.id}`;
            const wholesalerName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';

            const welcomeResult = await sendWelcomeMessages({
              customerName,
              customerEmail: customerEmail,
              customerPhone: formattedPhoneNumber,
              wholesalerName,
              wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
              wholesalerPhone: wholesaler.phoneNumber ?? undefined,
              portalUrl,
              wholesalerId: wholesaler.id,
              wholesalerLogoType: wholesaler.logoType,
              wholesalerLogoUrl: wholesaler.logoUrl,
            });

          }
        } catch (welcomeError) {
          const msg = welcomeError instanceof Error ? welcomeError.message : String(welcomeError);
          console.error(`❌ Welcome messages failed [service=sendWelcomeMessages wholesalerId=${product.wholesalerId} customerId=${customer?.id}]: ${msg}`);
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
        retailerId: customer!.id,
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
      const orderItems2 = [{
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
        return await storage.createOrderWithTransaction(trx, orderData, orderItems2);
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
          await sendCustomerInvoiceEmail(customerForEmail, order, orderItems2.map(item => ({
            ...item,
            packDescriptor: formatPackDescriptor(product.packQuantity || product.quantityInPack, product.sizePerUnit || product.unitSize, product.unitOfMeasure),
            product: { name: product.name, price: item.unitPrice, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure }
          })), wholesaler);
        } catch (emailError) {
          const msg = emailError instanceof Error ? emailError.message : String(emailError);
          console.warn(`[sendgrid] marketplace-customer-invoice email failed [orderId=${order.id}]: ${msg}`);
        }
      }

        // Send WhatsApp notification to wholesaler if configured
        try {
          const wholesaler = await storage.getUser(product.wholesalerId);
          if (wholesaler && wholesaler.twilioAccountSid && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
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
              await whatsAppBusinessService.sendMessage(
                wholesaler.businessPhone || wholesaler.phoneNumber || '',
                message,
                {
                  accessToken: wholesaler.whatsappAccessToken || '',
                  phoneNumberId: wholesaler.whatsappBusinessPhoneId || ''
                }
              );
            }
          }
        } catch (notificationError) {
          const msg = notificationError instanceof Error ? notificationError.message : String(notificationError);
          console.error(`❌ WhatsApp notification failed [service=WhatsAppBusiness endpoint=marketplace-wholesaler-notify orderId=${order.id}]: ${msg}`);
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
              const customerName = `${firstName || ''} ${lastName || ''}`.trim();
              const portalUrl = `https://quikpik.app/customer/${customer.id}`;
              const wholesalerName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';

              const welcomeResult = await sendWelcomeMessages({
                customerName,
                customerEmail: customerEmail,
                customerPhone: customerPhone,
                wholesalerName,
                wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                wholesalerPhone: wholesaler.phoneNumber ?? undefined,
                portalUrl,
                wholesalerId: wholesaler.id,
                wholesalerLogoType: wholesaler.logoType,
                wholesalerLogoUrl: wholesaler.logoUrl,
              });

            }
          } catch (welcomeError) {
            const msg = welcomeError instanceof Error ? welcomeError.message : String(welcomeError);
            console.error(`❌ Welcome messages failed [service=sendWelcomeMessages wholesalerId=${firstProduct.wholesalerId} customerId=${customer?.id}]: ${msg}`);
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

      const orderItemsArr = items.map((item: any) => {
        return {
          ...item,
          orderId: 0,
          appliedOfferLabel: item.appliedOfferLabel || null,
          freeItems: item.freeItems || 0
        };
      });

      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItemsArr);
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
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[sendgrid] customer-portal-invoice email failed [orderId=${order.id}]: ${msg}`);
      }

      // Notify wholesaler via WhatsApp
      try {
        const wholesaler = await storage.getUser(firstProduct.wholesalerId);
        if (wholesaler && wholesaler.businessPhone) {
          const message = generateOrderNotificationMessage(order, customer, items);
          // Send WhatsApp notification if enabled
          if (wholesaler.whatsappEnabled) {
            await whatsAppBusinessService.sendMessage(wholesaler.businessPhone, message, {
              accessToken: wholesaler.whatsappAccessToken || '',
              phoneNumberId: wholesaler.whatsappBusinessPhoneId || ''
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ WhatsApp notification failed [service=WhatsAppBusiness endpoint=customer-portal-wholesaler-notify orderId=${order.id}]: ${msg}`);
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

      const productIds = items.map(i => i.productId).filter((id): id is number => id !== null);
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
        if (item.productId === null) return null;
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
        const currentTotal = currentUnitPrice * (item.quantity ?? 0);
        return {
          productName: product?.name || 'Unknown Product',
          quantity: item.quantity,
          unitPrice: currentUnitPrice.toFixed(2),
          total: currentTotal.toFixed(2),
          sellingType: item.sellingType || 'units',
          inStock: product ? (product.stock || 0) >= (item.quantity ?? 0) : false,
          totalPackageWeight: product?.totalPackageWeight || null,
          palletWeight: product?.palletWeight || null,
          packQuantity: product?.quantityInPack ?? null,
          unitSize: product?.unitSize ?? null,
          unitOfMeasure: product?.unitOfMeasure ?? null,
        };
      }).filter((i): i is NonNullable<typeof i> => i !== null);

      const subtotal = previewItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const previewFeeConfig = await getCurrentFeeConfig();
      const customerTransactionFee = calculateCustomerFee(subtotal, 0, previewFeeConfig);
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
  app.post('/api/customer/orders/:orderId/reorder/:phoneNumber', customerActionLimiter, async (req: any, res) => {
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
      if (!reorderWholesalerObj) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const stripe = getStripeClient(Boolean(reorderWholesalerObj.isTestAccount));

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let reorderUseConnect = false;
      if (reorderWholesalerObj?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(reorderWholesalerObj.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            reorderUseConnect = true;
          }
        } catch (connectErr: any) {
          console.error(`❌ Reorder Connect account validation failed: ${connectErr.message}`);
        }
      }

      // Fetch current product prices
      const reorderProductIds = originalItems.map(i => i.productId).filter((id): id is number => id !== null);
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
              .where(and(inArray(priceListItems.priceListId, listIds), inArray(priceListItems.productId, reorderProductIds.filter((id): id is number => id !== null))));
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
        if (item.productId === null) return null;
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
        return { ...item, currentUnitPrice, currentTotal: currentUnitPrice * (item.quantity ?? 0) };
      }).filter((i): i is NonNullable<typeof i> => i !== null);

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

      // Wholesaler's share: subtotal minus platform fee, plus VAT pass-through (in pence)
      const reorderTransferAmount = Math.round((subtotal - platformFee + reorderVatAmount) * 100);

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
        isQuote: false,
        depositPercentage: 100,
        balanceDueDays: 0,
        amountPaid: '0.00',
        amountOutstanding: total.toFixed(2),
        paymentStatus: 'unpaid',
      };

      const newOrderItems = pricedItems.map(item => ({
        orderId: 0, // placeholder — overwritten by createOrderWithTransaction
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.currentUnitPrice.toFixed(2),
        total: item.currentTotal.toFixed(2),
        sellingType: item.sellingType || 'units',
        appliedOfferLabel: null as string | null,
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
          isReorder: 'true',
          depositPercentage: '100',
          depositAmount: total.toFixed(2),
          totalAmount: total.toFixed(2),
        },
        customer_email: order.customerEmail || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        ...(reorderUseConnect && reorderTransferAmount > 0 ? {
          payment_intent_data: {
            transfer_data: {
              destination: reorderWholesalerObj.stripeAccountId!,
              amount: reorderTransferAmount,
            },
          },
        } : {}),
      });

      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, createdOrder.id));

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
