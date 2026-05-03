/**
 * marketplace-orders-read.ts
 *
 * Read-only customer order routes extracted from marketplace-orders.ts.
 * Registered via registerOrderReadRoutes(app).
 *
 * Routes:
 *   GET  /api/customer-orders/:wholesalerId/:phoneNumber
 *   GET  /api/quick-order-templates/:wholesalerId/:phoneNumber
 *   GET  /api/frequently-ordered/:wholesalerId/:phoneNumber
 *   GET  /api/last-order-reorder/:wholesalerId/:phoneNumber
 *   GET  /api/customer-orders/stats/:wholesalerId/:phoneNumber
 *   GET  /api/customer/orders/:id/can-cancel
 *   GET  /api/customer-orders/:wholesalerId/:phoneNumber/:orderId/invoice
 *   GET  /api/customer/orders/:orderId/reorder-preview/:phoneNumber
 */
import type { Express } from "express";
import { calculateCustomerFee, calculatePlatformFee } from "../../shared/utils/fees";
import { getCurrentFeeConfig } from "../utils/fee-config";
import {
  and, buildInvoicePdf, db, desc, eq, inArray, or,
  orderCancellationRequests, orderItems, orders, products, priceListItems,
  quickOrderService, storage,
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

export function registerOrderReadRoutes(app: Express): void {

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

}
