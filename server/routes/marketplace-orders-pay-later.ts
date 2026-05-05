/**
 * marketplace-orders-pay-later.ts
 *
 * Pay-later (offline / invoice) order creation.
 * Registered via registerOrderPayLaterRoutes(app, orderCreateLimiter).
 *
 * Routes:
 *   POST /api/marketplace/create-order-pay-later
 */
import type { Express, RequestHandler } from "express";
import { calculateCustomerFee } from "../../shared/utils/fees";
import { getFeeConfigForWholesaler, getWholesalerPlatformFeeRate } from "../utils/fee-config";
import {
  db, formatPackDescriptor, generateOrderNumber,
  generateWholesalerOrderNotificationEmail,
  getCurrencySymbol,
  parseCustomerName, sendCustomerInvoiceEmail, sendEmail,
  sendWelcomeMessages, storage,
  whatsAppBusinessService,
  type OrderEmailData,
} from "./shared";

export function registerOrderPayLaterRoutes(
  app: Express,
  orderCreateLimiter: RequestHandler
): void {

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
      const [payLaterFeeConfig, payLaterPlatformFeeRate] = await Promise.all([
        getFeeConfigForWholesaler(wholesalerId),
        getWholesalerPlatformFeeRate(wholesalerId),
      ]);
      const transactionFee = calculateCustomerFee(subtotal, shippingCost, payLaterFeeConfig);
      const platformFee = (subtotal * payLaterPlatformFeeRate).toFixed(2);

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

}
