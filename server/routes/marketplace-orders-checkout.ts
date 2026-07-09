/**
 * marketplace-orders-checkout.ts
 *
 * Stripe payment-based order creation (card / payment-link checkout).
 * Registered via registerOrderCheckoutRoutes(app, orderCreateLimiter).
 *
 * Routes:
 *   POST /api/marketplace/create-order
 */
import type { Express, RequestHandler } from "express";
import {
  and, db, eq, formatPackDescriptor, generateOrderNumber,
  generateWholesalerOrderNotificationEmail,
  getCurrencySymbol, getStripeClient, isLiveMode, like,
  orderItems, orders,
  parseCustomerName, sendCustomerInvoiceEmail, sendEmail,
  sendWelcomeMessages, storage,
  whatsAppBusinessService,
  type OrderEmailData,
} from "./shared";

/**
 * Parses cart items from Stripe payment-intent metadata.
 * Supports the new compact items_v2 format (and its chunks) as well as the
 * legacy JSON items field for backward compatibility with in-flight intents.
 *
 * New format (items_v2): "productId:quantity:unitPrice:sellingType" joined by "|"
 * Chunks: items_v2, items_v2_1, items_v2_2, …
 */
function parseItemsFromMetadata(
  metadata: Record<string, string>
): Array<{ productId: number; quantity: number; unitPrice: number; sellingType: string }> {
  if (metadata.items_v2) {
    let compact = metadata.items_v2;
    let i = 1;
    while (metadata[`items_v2_${i}`]) {
      compact += '|' + metadata[`items_v2_${i}`];
      i++;
    }
    return compact.split('|').flatMap(chunk => {
      const [productId, quantity, unitPrice, sellingType] = chunk.split(':');
      const parsed = {
        productId: parseInt(productId!, 10),
        quantity: parseInt(quantity!, 10),
        unitPrice: parseFloat(unitPrice!),
        sellingType: sellingType || 'units',
      };
      if (isNaN(parsed.productId) || isNaN(parsed.quantity) || isNaN(parsed.unitPrice)) {
        console.warn(`[parseItemsFromMetadata] Skipping malformed item chunk: "${chunk}"`);
        return [];
      }
      return [parsed];
    });
  }
  return JSON.parse(metadata.items || '[]');
}

export function registerOrderCheckoutRoutes(
  app: Express,
  orderCreateLimiter: RequestHandler
): void {

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
        const items = parseItemsFromMetadata(paymentIntent.metadata);

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

              await sendWelcomeMessages({
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

        // ENHANCED LOGGING: Alert if shipping info is missing or defaults to pickup
        if (!shippingInfoJson) {
          console.error(`🚨 CRITICAL: No shippingInfo in payment metadata for ${paymentIntentId}! This will default to pickup.`);
          console.error(`🚨 Payment metadata keys:`, Object.keys(paymentIntent.metadata || {}));
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
              throw new Error(`DUPLICATE_ORDER:${existingOrder!.id}:${existingOrder!.orderNumber}`);
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
              shippingTotal: parseFloat(metadataShippingCost || '0').toFixed(2),
              orderSource: 'customer_portal',
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
                  shippingAddress = order.deliveryAddress;
                }
              } catch (addressError) {
                console.error('❌ Failed to get complete address:', addressError);
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

}
