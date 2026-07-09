/**
 * marketplace-orders-actions.ts
 *
 * Remaining write routes: shipping preference, cancellation requests,
 * legacy single-product orders, and customer-initiated reorders.
 * Registered via registerOrderActionsRoutes(app, customerActionLimiter).
 *
 * Routes:
 *   POST /api/customer/shipping-choice
 *   POST /api/customer/orders/:id/request-cancellation
 *   POST /api/marketplace/orders
 *   POST /api/customer/orders
 *   POST /api/customer/orders/:orderId/reorder/:phoneNumber
 */
import type { Express, RequestHandler } from "express";
import { calculateCustomerFee } from "../../shared/utils/fees";
import { getCurrentFeeConfig, getWholesalerPlatformFeeRate } from "../utils/fee-config";
import { calculateOrderPricing } from "../services/orderPricingService";
import {
  and, db, eq, formatNumber, formatPackDescriptor, formatPhoneToInternational,
  generateOrderNotificationMessage, generateOrderNumber,
  getCurrencySymbol, getEmailLogoUrl, getStripeClient, inArray,
  emailButton, emailCard, emailHeading, escapeHtml, wrapCustomerEmail,
  orderCancellationRequests, orderItems, orders, products, priceListItems,
  parseCustomerName, sendCustomerInvoiceEmail, sendEmail, sendWhatsAppMessage,
  sendWelcomeMessages, storage, validatePhoneNumber,
  whatsAppBusinessService,
} from "./shared";
import {
  computeEffectivePrice,
  resolveActivePriceListIds,
} from "./marketplace-price-lists";

export function registerOrderActionsRoutes(
  app: Express,
  customerActionLimiter: RequestHandler
): void {

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
        const sym = wholesaler ? getCurrencySymbol((wholesaler as any)?.preferredCurrency || (wholesaler as any)?.defaultCurrency || 'GBP') : '£';
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

          const cancelRequestBody = `${emailHeading('Cancellation Request', { size: '22px', color: '#EF4444' })}<p style="margin:0 0 20px">A customer has requested to cancel their order.</p>${emailCard(`${emailHeading(`Order ${order.orderNumber}`, { size: '16px', color: '#DC2626' })}<p style="margin:0 0 6px"><strong>Customer:</strong> ${escapeHtml(customerName)}</p><p style="margin:0 0 6px"><strong>Order Total:</strong> ${sym}${orderTotal.toFixed(2)}</p><p style="margin:0 0 6px"><strong>Amount Paid:</strong> ${sym}${amountPaid.toFixed(2)}</p><p style="margin:0 0 6px"><strong>Reason:</strong> ${escapeHtml(reasonCategory)}</p>${reasonNotes ? `<p style="margin:0"><strong>Additional Notes:</strong> ${escapeHtml(reasonNotes)}</p>` : ''}`, { borderColor: '#FECACA', bgColor: '#FEF2F2' })}${emailCard(`${emailHeading('What happens next?', { size: '16px', color: '#EA580C' })}<p style="margin:0 0 8px">Please review this cancellation request in your dashboard and decide whether to:</p><ul style="margin:0;padding-left:20px"><li style="margin-bottom:4px"><strong>Approve</strong> - The order will be cancelled and any payments will be refunded</li><li><strong>Reject</strong> - The order will remain active and the customer will be notified</li></ul>`, { borderColor: '#FED7AA', bgColor: '#FFF7ED' })}${emailButton('Review in Dashboard', 'https://quikpik.co/orders')}`;

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

      if (currentSellingType !== 'pallets') {
        // For unit orders, validate against MOQ
        if (quantity < product.moq) {
          return res.status(400).json({
            message: `Minimum order quantity is ${product.moq} units`
          });
        }
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

            await sendWelcomeMessages({
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

      // Calculate platform fee (per-wholesaler rate, defaulting to 4.6%)
      const subtotalNum = parseFloat(totalAmount);
      const singleProductPlatformFeeRate = await getWholesalerPlatformFeeRate(product.wholesalerId);
      const platformFee = (subtotalNum * singleProductPlatformFeeRate).toFixed(2);

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
        orderSource: 'customer_portal',
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
          const customerForEmail = { ...customer, email: customerEmail };
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
        const wholesalerForNotif = await storage.getUser(product.wholesalerId);
        if (wholesalerForNotif && wholesalerForNotif.twilioAccountSid && wholesalerForNotif.twilioAuthToken && wholesalerForNotif.twilioPhoneNumber) {
          const message = `🔔 New Order Alert!

Customer: ${customerName}
Phone: ${formattedPhoneNumber}
Product: ${product.name}
Quantity: ${formatNumber(quantity)} units
Total: ${getCurrencySymbol(wholesalerForNotif.preferredCurrency || 'GBP')}${totalAmount}

Order ID: ${order.id}
Status: Pending Confirmation

Please contact the customer to confirm this order.

✨ Powered by Quikpik Merchant`;

          if (wholesalerForNotif.whatsappEnabled) {
            await whatsAppBusinessService.sendMessage(
              wholesalerForNotif.businessPhone || wholesalerForNotif.phoneNumber || '',
              message,
              {
                accessToken: wholesalerForNotif.whatsappAccessToken || '',
                phoneNumberId: wholesalerForNotif.whatsappBusinessPhoneId || ''
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

              await sendWelcomeMessages({
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

      // Calculate platform fee (per-wholesaler rate, defaulting to 4.6%)
      const subtotal = parseFloat(totalAmount);
      const portalPlatformFeeRate = await getWholesalerPlatformFeeRate(firstProduct.wholesalerId);
      const platformFee = subtotal * portalPlatformFeeRate;

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
        orderSource: 'customer_portal',
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
        const wholesalerForNotif = await storage.getUser(firstProduct.wholesalerId);
        if (wholesalerForNotif && wholesalerForNotif.businessPhone) {
          const message = generateOrderNotificationMessage(order, customer, items);
          if (wholesalerForNotif.whatsappEnabled) {
            await whatsAppBusinessService.sendMessage(wholesalerForNotif.businessPhone, message, {
              accessToken: wholesalerForNotif.whatsappAccessToken || '',
              phoneNumberId: wholesalerForNotif.whatsappBusinessPhoneId || ''
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
                if (reorderPriceOverrides[row.productId] === undefined || effective < reorderPriceOverrides[row.productId]!) {
                  reorderPriceOverrides[row.productId] = effective;
                }
              }
              if (row.customPalletPrice != null) {
                const palletEffective = parseFloat(String(row.customPalletPrice));
                if (reorderPalletPriceOverrides[row.productId] === undefined || palletEffective < reorderPalletPriceOverrides[row.productId]!) {
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
      const reorderFeeConfig = await getCurrentFeeConfig();
      const {
        customerTransactionFee,
        platformFee,
        feePercentageUsed: reorderFeePercentageUsed,
        fixedFeeUsed: reorderFixedFeeUsed,
      } = calculateOrderPricing({ subtotal, deliveryCost: 0, feeConfig: reorderFeeConfig });
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
        feePercentageUsed: reorderFeePercentageUsed,
        fixedFeeUsed: reorderFixedFeeUsed,
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
