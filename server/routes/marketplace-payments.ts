/**
 * marketplace-payments.ts
 *
 * Stripe / payment route handlers extracted from marketplace.ts.
 * Registered via registerPaymentRoutes(app, customerActionLimiter).
 *
 * Routes:
 *   POST /api/customer/create-payment
 *   POST /api/customer/orders/:orderId/payment-link/:phoneNumber
 */
import { createHash } from "crypto";
import type { Express, RequestHandler } from "express";
import { getFeeConfigForWholesaler, getWholesalerPlatformFeeRate } from "../utils/fee-config";
import { calculateCheckoutTotals } from "./checkout-fee-calculations";
import {
  and, db, eq, formatPhoneToInternational, getPublishableKey, getStripeClient,
  orders, storage, users, wholesalerCustomerRelationships,
} from "./shared";
import { resolveCustomerProductPrice } from "./marketplace-price-lists";

/**
 * Converts cart items to a compact pipe-delimited metadata string and splits it
 * into ≤490-char chunks so each Stripe metadata value stays within the 500-char limit.
 *
 * Format per item: "productId:quantity:unitPrice:sellingType"
 * Keys: items_v2, items_v2_1, items_v2_2, … (first chunk has no numeric suffix)
 */
function buildItemsMetadata(
  items: Array<{ productId: number; quantity: number; unitPrice: number; sellingType: string }>
): Record<string, string> {
  const compact = items
    .map(i => `${i.productId}:${i.quantity}:${i.unitPrice}:${i.sellingType || 'units'}`)
    .join('|');

  if (compact.length <= 490) {
    return { items_v2: compact };
  }

  const result: Record<string, string> = {};
  let remaining = compact;
  let chunkIdx = 0;

  while (remaining.length > 0) {
    const key = chunkIdx === 0 ? 'items_v2' : `items_v2_${chunkIdx}`;
    if (remaining.length <= 490) {
      result[key] = remaining;
      break;
    }
    const splitAt = remaining.lastIndexOf('|', 490);
    if (splitAt === -1) {
      // Single item token is wider than 490 chars — store it whole in its own
      // key rather than splitting mid-token, which would corrupt parsing.
      const nextPipe = remaining.indexOf('|');
      if (nextPipe === -1) {
        result[key] = remaining;
        break;
      }
      result[key] = remaining.slice(0, nextPipe);
      remaining = remaining.slice(nextPipe + 1);
    } else {
      result[key] = remaining.slice(0, splitAt);
      remaining = remaining.slice(splitAt + 1);
    }
    chunkIdx++;
  }

  return result;
}

export function registerPaymentRoutes(app: Express, customerActionLimiter: RequestHandler): void {

  // POST /api/customer/create-payment
  app.post('/api/customer/create-payment', customerActionLimiter, async (req, res) => {
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
        const hasActivePromos = product.promoActive && Array.isArray(product.promotionalOffers) && product.promotionalOffers.length > 0;
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
          const offers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
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

      const [feeConfig, platformFeeRate] = await Promise.all([
        getFeeConfigForWholesaler(expectedWholesalerId!),
        getWholesalerPlatformFeeRate(expectedWholesalerId!),
      ]);
      const checkout = calculateCheckoutTotals({ productSubtotal, deliveryCost, feeConfig, platformFeeRate });
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
      
      // Deterministic idempotency key: SHA-256 of wholesalerId + normalised phone + normalised email
      // + final Stripe amount (pence, includes delivery + VAT) + sorted items. Including email
      // prevents idempotency conflicts when a customer edits their email between checkout attempts
      // (Stripe validates receipt_email against the original key, so the key must include it).
      // Including stripeAmountFinal ensures the key changes whenever the total changes (e.g. customer
      // switches delivery method). True retries with the same cart, total, and email still reuse the
      // same key and payment intent.
      const normalizedPhone = (customerPhone || 'guest').replace(/[^0-9]/g, '');
      const normalizedEmail = (customerEmail || '').toLowerCase().trim();
      const sortedItemsStr = validatedItems
        .map(i => `${i.product.id}:${i.quantity}:${i.unitPrice}`)
        .sort()
        .join('|');
      // Include stripeWholesalerAmountFinal so that a change in the platform fee rate
      // (which alters transfer_data.amount but not the customer-pays total) always produces
      // a fresh key rather than conflicting with a prior Stripe payment intent.
      const idempotencyInput = `${firstProduct.wholesalerId}-${normalizedPhone}-${normalizedEmail}-${stripeAmountFinal}-${stripeWholesalerAmountFinal}-${sortedItemsStr}`;
      const idempotencyKey = `pay_${createHash('sha256').update(idempotencyInput).digest('hex').slice(0, 32)}`;

      // Additional validation specifically for Stripe amount (VAT-inclusive)
      if (!Number.isInteger(stripeAmountFinal) || stripeAmountFinal <= 0 || isNaN(stripeAmountFinal)) {
        return res.status(400).json({ 
          message: 'Invalid payment amount calculated. Please try again.' 
        });
      }
      
      let paymentIntent;
      try {
        const paymentConfig: Parameters<typeof stripe.paymentIntents.create>[0] = {
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
              destination: wholesaler.stripeAccountId!,
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
          // Compact format — stays within Stripe's 500-char-per-value limit for any cart size
          ...buildItemsMetadata(validatedItems.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice),
            sellingType: item.sellingType || 'units',
          })))
        }
      }, {
        idempotencyKey: idempotencyKey
      });
      
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
                // Compact format — stays within Stripe's 500-char-per-value limit for any cart size
                ...buildItemsMetadata(validatedItems.map(item => ({
                  productId: item.product.id,
                  quantity: item.quantity,
                  unitPrice: parseFloat(item.unitPrice),
                  sellingType: item.sellingType || 'units',
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
        } else if (stripeError.type === 'StripeIdempotencyError' || stripeError.code === 'idempotency_key_in_use') {
          // A prior payment intent was created with the same key but different parameters
          // (e.g. platform fee rate changed). Return a clear user-facing message so the
          // customer can refresh and retry with a new payment intent.
          return res.status(409).json({
            message: "Your previous payment session expired. Please refresh the page and try again.",
            error: 'idempotency_conflict'
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

  // POST /api/customer/orders/:orderId/payment-link/:phoneNumber
  app.post('/api/customer/orders/:orderId/payment-link/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
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

      // Generate a new payment link — derive Stripe client from wholesaler's test mode flag
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const customer = await storage.getUser(order.retailerId);
      const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let customerBalanceUseConnect = false;
      if (wholesaler?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            customerBalanceUseConnect = true;
          } else {
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
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://quikpik.app'
        : (process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000');

      const balanceOrderMetadata = {
        orderId: orderId.toString(),
        orderNumber: order.orderNumber || '',
        wholesalerId: order.wholesalerId,
        customerId: order.retailerId || '',
        isQuote: 'true',
        isBalancePayment: 'true',
        depositPercentage: '100',
        depositAmount: amountOutstanding.toFixed(2),
        totalAmount: order.total || '0',
      };

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
        success_url: `${baseUrl}/customer/payment-success?order=${order.orderNumber}&wholesaler=${order.wholesalerId}&returning=true${(order.status === 'fulfilled' || order.status === 'ready_to_collect') ? '&fulfilled=true' : ''}`,
        cancel_url: `${baseUrl}/store/${order.wholesalerId}`,
        metadata: balanceOrderMetadata,
        customer_email: customer?.email || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        ...(customerBalanceUseConnect && customerBalanceTransferAmount > 0 ? {
          payment_intent_data: {
            metadata: balanceOrderMetadata,
            transfer_data: {
              destination: wholesaler!.stripeAccountId!,
              amount: customerBalanceTransferAmount,
            },
          },
        } : {
          payment_intent_data: {
            metadata: balanceOrderMetadata,
          },
        }),
      });

      // Update order with new payment link
      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, orderId));

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

}
