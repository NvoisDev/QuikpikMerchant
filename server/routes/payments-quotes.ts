import type { Express } from "express";
import Stripe from "stripe";
import { calculateCustomerFee } from "../../shared/utils/fees";
import { getCurrentFeeConfig, getFeeConfigForWholesaler, getWholesalerPlatformFeeRate } from "../utils/fee-config";
import { calculateOrderPricing } from "../services/orderPricingService";
import { formatDateTime } from "../../shared/utils/date";
import {
  InventoryCalculator, and, asc, db, emailButton, emailCard, emailHeading, eq,
  formatPackDescriptor, generateOrderNumber, getEmailLogoUrl,
  inArray, isNull, ne, or, orderItems, orders, productBatches, products,
  requireAuth, requireNotViewer, requireBooleanFeature, sendEmail, sendWhatsAppMessage, sendCustomerInvoiceEmail,
  sql, stockMovements, storage, sum, wrapCustomerEmail, desc, quoteActivityLogs,
  teamMembers, users,
} from "./shared";
import { getStripeClient } from "../stripeConfig";
import { ReliableSMSService } from "../sms-service";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import { businessProfiles } from "@shared/schema";
import { logQuoteActivity, fmtGBP } from "../utils/quote-activity";
import { isConnectAccountReady } from "../utils/stripe-connect-ready";
import { resolveInvoiceWholesaler } from "./orders-read";

// Local types for the quote-edit handler — avoids `any` casts in diff logic.
interface QuoteEditItem {
  productId: number;
  quantity: number;
  customPrice: number;
  sellingType?: string;
}
type ExistingOrderItem = Awaited<ReturnType<typeof storage.getOrderItems>>[number] & { sellingType?: string };

export function registerQuoteRoutes(app: Express): void {
  // POST /api/quotes
  app.post('/api/quotes', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);
      
      const { customerId, items, sendVia, depositPercentage = 100, balanceDueDays = 0, fulfillmentType = 'pickup', deliveryCharge = 0, deliveryAddressId = null, deliveryAddress = null, customAddressFields = null, paymentMethod: requestedPaymentMethod, businessProfileId = null, collectionAddressId = null, sendSmsNotification = false } = req.body;
      
      if (!customerId || !items || items.length === 0) {
        return res.status(400).json({ error: 'Customer and items are required' });
      }

      for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          return res.status(400).json({ error: 'Item quantity must be a positive integer', errorType: 'VALIDATION_ERROR' });
        }
        if (typeof item.customPrice !== 'number' || !isFinite(item.customPrice) || item.customPrice <= 0) {
          return res.status(400).json({ error: 'Item price must be greater than zero', errorType: 'VALIDATION_ERROR' });
        }
      }

      if (fulfillmentType === 'delivery' && !deliveryAddressId && !deliveryAddress && !customAddressFields?.addressLine1) {
        return res.status(400).json({ error: 'Delivery address is required for delivery orders' });
      }

      if (fulfillmentType === 'delivery' && !deliveryAddressId && customAddressFields) {
        if (!customAddressFields.addressLine1 || !customAddressFields.city || !customAddressFields.postalCode) {
          return res.status(400).json({ error: 'Address line, city, and postal code are required for custom addresses' });
        }
      }

      // Get customer details
      const customer = await storage.getUser(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Get wholesaler details
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));

      // Validate businessProfileId ownership (prevent cross-tenant assignment)
      const resolvedBusinessProfileId: number | null = businessProfileId ? (typeof businessProfileId === 'number' ? businessProfileId : parseInt(businessProfileId)) : null;
      if (resolvedBusinessProfileId) {
        const [profileCheck] = await db
          .select({ id: businessProfiles.id })
          .from(businessProfiles)
          .where(and(eq(businessProfiles.id, resolvedBusinessProfileId), eq(businessProfiles.wholesalerId, wholesalerId)));
        if (!profileCheck) {
          return res.status(400).json({ error: 'Invalid business profile' });
        }
      }

      // Validate collectionAddressId belongs to this wholesaler (multi-tenant safety)
      let validatedQuoteCollectionAddressId: number | null = null;
      if (collectionAddressId) {
        const parsedId = parseInt(String(collectionAddressId), 10);
        if (!isNaN(parsedId)) {
          const collAddr = await storage.getCollectionAddress(parsedId);
          if (collAddr && collAddr.wholesalerId === wholesalerId) {
            validatedQuoteCollectionAddressId = parsedId;
          } else {
            console.warn(`POST /api/quotes: collectionAddressId ${parsedId} invalid for wholesaler ${wholesalerId} — ignoring`);
          }
        }
      }

      // PRE-VALIDATE STOCK for all items before creating any DB records
      // This prevents orphaned order rows when stock is insufficient
      for (const item of items) {
        const sellingType = item.sellingType || 'units';
        const [productForCheck] = await db.select().from(products)
          .where(and(eq(products.id, item.productId), eq(products.wholesalerId, wholesalerId)));
        if (!productForCheck) {
          return res.status(400).json({ error: 'One or more products not found', errorType: 'PRODUCT_NOT_FOUND' });
        }
        if (sellingType === 'units') {
          // For batch-tracked products stock=0 while actual availability lives in productBatches.
          // Prefer totalBatchStock (sum of active, non-expired batches) when it exists.
          const today = new Date().toISOString().split('T')[0];
          const [batchRow] = await db
            .select({ totalBatchStock: sum(productBatches.quantity) })
            .from(productBatches)
            .where(
              and(
                eq(productBatches.productId, item.productId),
                eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
              )
            );
          const batchStock = batchRow?.totalBatchStock != null ? Number(batchRow.totalBatchStock) : null;
          const available = batchStock ?? productForCheck.stock ?? 0;
          if (available < item.quantity) {
            return res.status(400).json({
              error: `"${productForCheck.name}" is out of stock. ${available} units available, ${item.quantity} requested.`,
              errorType: 'OUT_OF_STOCK',
              productName: productForCheck.name,
              available,
              requested: item.quantity,
            });
          }
        } else if (sellingType === 'pallets') {
          const available = productForCheck.palletStock || 0;
          if (available < item.quantity) {
            return res.status(400).json({
              error: `"${productForCheck.name}" has insufficient pallet stock. ${available} pallets available, ${item.quantity} requested.`,
              errorType: 'OUT_OF_STOCK',
              productName: productForCheck.name,
              available,
              requested: item.quantity,
            });
          }
        }
      }

      // Calculate totals
      // Customer pays: productSubtotal + deliveryCharge + transaction fee (5.5% + £0.50)
      // Wholesaler pays: platform fee (4.6% of productSubtotal only) - internal
      const productSubtotal = items.reduce((sum: number, item: any) => 
        sum + (item.customPrice * item.quantity), 0
      );
      const quoteDeliveryCharge = fulfillmentType === 'delivery' ? (parseFloat(deliveryCharge) || 0) : 0;
      const subtotal = productSubtotal + quoteDeliveryCharge;
      // Pay Later (depositPercentage === 0) has no Stripe processing — no fees apply.
      // Offline payment methods (cash, bank_transfer, cheque, other) also have no fees.
      const validDepositPercentage = [0, 25, 50, 75, 100].includes(depositPercentage) ? depositPercentage : 100;
      const isPayLater = validDepositPercentage === 0;
      const OFFLINE_METHODS = ['cash', 'bank_transfer', 'cheque', 'other', 'pay_later'];
      const isOfflineMethod = requestedPaymentMethod ? OFFLINE_METHODS.includes(requestedPaymentMethod) : false;
      const isOffline = isPayLater || isOfflineMethod;
      const feeConfig = await getFeeConfigForWholesaler(wholesalerId);
      const feeRate = isOffline ? 0 : await getWholesalerPlatformFeeRate(wholesalerId);
      const {
        customerTransactionFee,
        platformFee,
        feePercentageUsed: quoteFeePercentageUsed,
        fixedFeeUsed: quoteFixedFeeUsed,
      } = isOffline
        ? { customerTransactionFee: 0, platformFee: 0, feePercentageUsed: '0.0000', fixedFeeUsed: '0.00' }
        : calculateOrderPricing({ subtotal, deliveryCost: 0, feeConfig, platformFeeRate: feeRate });

      // VAT calculation — wholesaler already fetched above
      const quoteVatEnabled = wholesaler?.vatEnabled ?? false;
      const quoteVatRate = parseFloat(wholesaler?.vatRate ?? '0');
      const quoteVatAmount = quoteVatEnabled ? productSubtotal * quoteVatRate : 0;
      const quoteVatRateApplied = quoteVatEnabled ? quoteVatRate : null;
      const total = productSubtotal + quoteVatAmount + quoteDeliveryCharge + customerTransactionFee;
      const depositAmount = total * (validDepositPercentage / 100);
      const outstandingAmount = total - depositAmount;

      // Generate unified order number (same sequence as regular orders)
      const orderNumber = await generateOrderNumber(wholesalerId);

      // Auto-save custom delivery address to customer profile
      let resolvedDeliveryAddressId = deliveryAddressId ? (typeof deliveryAddressId === 'number' ? deliveryAddressId : parseInt(deliveryAddressId)) : null;
      let resolvedDeliveryAddress = deliveryAddress;
      
      if (fulfillmentType === 'delivery' && !deliveryAddressId && customAddressFields && customAddressFields.addressLine1 && customAddressFields.city && customAddressFields.postalCode) {
        try {
          const savedAddress = await storage.createDeliveryAddress({
            customerId,
            addressLine1: customAddressFields.addressLine1,
            addressLine2: customAddressFields.addressLine2 ?? undefined,
            city: customAddressFields.city,
            state: customAddressFields.state || undefined,
            postalCode: customAddressFields.postalCode,
            country: 'United Kingdom',
            label: customAddressFields.label || undefined,
            instructions: undefined,
            isDefault: false,
          });
          resolvedDeliveryAddressId = savedAddress.id;
          resolvedDeliveryAddress = deliveryAddress || `${customAddressFields.addressLine1}, ${customAddressFields.city}, ${customAddressFields.postalCode}`;
        } catch (addrErr) {
          console.error('⚠️ Failed to auto-save delivery address, continuing with text:', addrErr);
        }
      }

      // Create the quote order AND all stock operations atomically.
      // A single transaction prevents orphaned orders if any stock step fails mid-way.
      const packDescLines: string[] = [];
      const quoteOrder = await db.transaction(async (trx) => {
        const [quoteOrderRow] = await trx.insert(orders).values({
          orderNumber,
          wholesalerId,
          retailerId: customerId,
          customerName: customer.businessName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown Customer',
          customerEmail: customer.email,
          customerPhone: customer.phoneNumber,
          status: 'pending',
          subtotal: productSubtotal.toFixed(2),
          platformFee: platformFee.toFixed(2),
          customerTransactionFee: customerTransactionFee.toFixed(2),
          feePercentageUsed: quoteFeePercentageUsed,
          fixedFeeUsed: quoteFixedFeeUsed,
          deliveryCost: quoteDeliveryCharge.toFixed(2),
          vatAmount: quoteVatAmount.toFixed(2),
          ...(quoteVatRateApplied !== null ? { vatRateApplied: quoteVatRateApplied.toFixed(4) } : {}),
          total: total.toFixed(2),
          fulfillmentType: fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
          ...(fulfillmentType === 'delivery' && resolvedDeliveryAddressId ? { deliveryAddressId: resolvedDeliveryAddressId } : {}),
          ...(fulfillmentType === 'delivery' && resolvedDeliveryAddress ? { deliveryAddress: resolvedDeliveryAddress } : {}),
          ...(fulfillmentType === 'pickup' && validatedQuoteCollectionAddressId ? { collectionAddressId: validatedQuoteCollectionAddressId } : {}),
          isQuote: true,
          quoteSentVia: sendVia,
          notes: 'Quick Quote - Custom pricing negotiated on-site',
          depositPercentage: validDepositPercentage,
          balanceDueDays: [0, 7, 14, 30, 60].includes(balanceDueDays) ? balanceDueDays : 0,
          amountPaid: '0.00',
          amountOutstanding: (validDepositPercentage === 0 ? productSubtotal + quoteVatAmount + quoteDeliveryCharge : total).toFixed(2),
          paymentStatus: 'unpaid',
          ...(isPayLater
            ? { paymentMethod: 'pay_later' }
            : (requestedPaymentMethod ? { paymentMethod: requestedPaymentMethod } : {})),
          ...(req.user.role === 'team_member' ? { placedByName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Team Member' } : {}),
          ...(resolvedBusinessProfileId ? { businessProfileId: resolvedBusinessProfileId } : {}),
        }).returning();
        // Capture stock levels before any allocation (for accurate movement stockBefore)
        const stockBeforeCreate = new Map<number, { units: number; pallets: number }>();
        for (const preItem of items) {
          if (!stockBeforeCreate.has(preItem.productId)) {
            const [preP] = await trx.select({ stock: products.stock, palletStock: products.palletStock }).from(products).where(eq(products.id, preItem.productId)).limit(1);
            if (preP) stockBeforeCreate.set(preItem.productId, { units: preP.stock ?? 0, pallets: preP.palletStock ?? 0 });
          }
        }
        // Accumulate purchase totals per (product, sellingType); one movement written after the loop
        const createPurchaseSummary = new Map<string, { productId: number; sellingType: string; qty: number; primaryBatchId: number | null }>();
        // Create order items with custom prices, decrement stock via FEFO batch allocation
        for (const item of items) {
          const sellingType = item.sellingType || 'units';

          const [product] = await trx.select().from(products).where(eq(products.id, item.productId));
          if (!product) continue;

          const packDescriptor = formatPackDescriptor(product.quantityInPack, product.unitSize, product.unitOfMeasure);
          packDescLines.push(packDescriptor ? `${product.name} (${packDescriptor})` : product.name);

          const quantity = item.quantity;
          const today = new Date().toISOString().split('T')[0];

          if (sellingType === 'units') {
            const activeBatches = await trx
              .select()
              .from(productBatches)
              .where(
                and(
                  eq(productBatches.productId, item.productId),
                  eq(productBatches.status, 'active'),
                  or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
                )
              )
              .orderBy(
                sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`,
                asc(productBatches.expiryDate),
                asc(productBatches.createdAt)
              );

            if (activeBatches.length > 0) {
              const totalAvailable = activeBatches.reduce((acc, b) => acc + b.quantity, 0);
              if (quantity > totalAvailable) {
                const e = new Error(
                  `Insufficient batch stock for "${product.name}": ${totalAvailable} available, ${quantity} requested.`
                ) as Error & { productName?: string; available?: number; requested?: number };
                e.productName = product.name;
                e.available = totalAvailable;
                e.requested = quantity;
                throw e;
              }

              // Plan FEFO deductions across batches
              let remaining = quantity;
              let primaryBatchId: number | null = null;
              const deductions: { id: number; qty: number; deduct: number; newQty: number; newStatus: 'active' | 'depleted'; batchNumber: string | null }[] = [];
              for (const batch of activeBatches) {
                if (remaining <= 0) break;
                const deduct = Math.min(remaining, batch.quantity);
                const newQty = batch.quantity - deduct;
                deductions.push({ id: batch.id, qty: batch.quantity, deduct, newQty, newStatus: newQty === 0 ? 'depleted' : 'active', batchNumber: batch.batchNumber });
                if (primaryBatchId === null) primaryBatchId = batch.id;
                remaining -= deduct;
              }

              // Insert order item with primary batch ID
              await trx.insert(orderItems).values({
                orderId: quoteOrderRow.id,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.customPrice.toFixed(2),
                total: (item.customPrice * item.quantity).toFixed(2),
                sellingType,
                batchId: primaryBatchId,
              });

              // Apply batch deductions
              for (const d of deductions) {
                await trx.update(productBatches)
                  .set({ quantity: d.newQty, status: d.newStatus, updatedAt: new Date() })
                  .where(eq(productBatches.id, d.id));
              }

              // Sync product.stock from batch sum (single source of truth)
              const [batchSumRow] = await trx
                .select({ total: sum(productBatches.quantity) })
                .from(productBatches)
                .where(
                  and(
                    eq(productBatches.productId, item.productId),
                    eq(productBatches.status, 'active'),
                    or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)
                  )
                );
              const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newPalletStock = (qip > 0 && upp > 0)
                ? Math.floor(Math.floor(newUnitStock / qip) / upp)
                : 0;
              await trx.update(products)
                .set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() })
                .where(eq(products.id, item.productId));

              // Accumulate for post-loop consolidated movement (one per product per operation)
              const cskey1 = `${item.productId}_units`;
              const csum1 = createPurchaseSummary.get(cskey1);
              if (csum1) { csum1.qty += quantity; if (csum1.primaryBatchId === null) csum1.primaryBatchId = primaryBatchId; }
              else createPurchaseSummary.set(cskey1, { productId: item.productId, sellingType: 'units', qty: quantity, primaryBatchId });

            } else {
              // No batches: fall back to product.stock direct counter
              let orderResult: ReturnType<typeof InventoryCalculator.processOrder>;
              try {
                orderResult = InventoryCalculator.processOrder(quantity, 'units', {
                  stock: product.stock ?? 0,
                  palletStock: product.palletStock ?? 0,
                  quantityInPack: product.quantityInPack ?? 1,
                  unitsPerPallet: product.unitsPerPallet ?? 1,
                });
              } catch (stockErr: unknown) {
                const e = stockErr as Error & { productName?: string; available?: number; requested?: number };
                e.productName = product.name;
                e.available = product.stock ?? 0;
                e.requested = quantity;
                throw e;
              }

              const { newUnitStock, newPalletStock } = orderResult;

              await trx.insert(orderItems).values({
                orderId: quoteOrderRow.id,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.customPrice.toFixed(2),
                total: (item.customPrice * item.quantity).toFixed(2),
                sellingType,
              });

              await trx.update(products)
                .set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() })
                .where(eq(products.id, item.productId));

              const cskey2 = `${item.productId}_units`;
              const csum2 = createPurchaseSummary.get(cskey2);
              if (csum2) { csum2.qty += quantity; }
              else createPurchaseSummary.set(cskey2, { productId: item.productId, sellingType: 'units', qty: quantity, primaryBatchId: null });
            }

          } else if (sellingType === 'pallets') {
            const qipP = product.quantityInPack ?? 1;
            const uppP = product.unitsPerPallet ?? 1;
            const baseUnitsNeededP = quantity * uppP * qipP;
            const activeBatchesP = await trx.select().from(productBatches)
              .where(and(eq(productBatches.productId, item.productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)))
              .orderBy(sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`, asc(productBatches.expiryDate), asc(productBatches.createdAt));
            let primaryBatchIdP: number | null = null;
            if (activeBatchesP.length > 0) {
              const totalAvailP = activeBatchesP.reduce((acc, b) => acc + b.quantity, 0);
              if (totalAvailP < baseUnitsNeededP) {
                const avail = (qipP > 0 && uppP > 0) ? Math.floor(Math.floor(totalAvailP / qipP) / uppP) : 0;
                const e = new Error(`Insufficient stock for "${product.name}". ${avail} pallets available, ${quantity} requested.`) as Error & { code?: string; productName?: string; available?: number; requested?: number };
                e.code = 'OUT_OF_STOCK'; e.productName = product.name; e.available = avail; e.requested = quantity;
                throw e;
              }
              let remainingP = baseUnitsNeededP;
              for (const batch of activeBatchesP) {
                if (remainingP <= 0) break;
                const deduct = Math.min(remainingP, batch.quantity);
                const newQty = batch.quantity - deduct;
                await trx.update(productBatches).set({ quantity: newQty, status: newQty === 0 ? 'depleted' : 'active', updatedAt: new Date() }).where(eq(productBatches.id, batch.id));
                if (primaryBatchIdP === null) primaryBatchIdP = batch.id;
                remainingP -= deduct;
              }
            } else {
              if ((product.stock ?? 0) < baseUnitsNeededP) {
                const avail = (qipP > 0 && uppP > 0) ? Math.floor(Math.floor((product.stock ?? 0) / qipP) / uppP) : 0;
                const e = new Error(`Insufficient stock for "${product.name}". ${avail} pallets available, ${quantity} requested.`) as Error & { code?: string; productName?: string; available?: number; requested?: number };
                e.code = 'OUT_OF_STOCK'; e.productName = product.name; e.available = avail; e.requested = quantity;
                throw e;
              }
            }
            const [batchSumRowP] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
              .where(and(eq(productBatches.productId, item.productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)));
            const newUnitStockP = parseInt(String(batchSumRowP?.total ?? 0), 10);
            const newPalletStockP = (qipP > 0 && uppP > 0) ? Math.floor(Math.floor(newUnitStockP / qipP) / uppP) : 0;
            await trx.insert(orderItems).values({ orderId: quoteOrderRow.id, productId: item.productId, quantity: item.quantity, unitPrice: item.customPrice.toFixed(2), total: (item.customPrice * item.quantity).toFixed(2), sellingType, batchId: primaryBatchIdP });
            await trx.update(products).set({ stock: newUnitStockP, palletStock: newPalletStockP, updatedAt: new Date() }).where(eq(products.id, item.productId));
            const cskey3 = `${item.productId}_units`;
            const csum3 = createPurchaseSummary.get(cskey3);
            if (csum3) { csum3.qty += baseUnitsNeededP; if (csum3.primaryBatchId === null) csum3.primaryBatchId = primaryBatchIdP; }
            else createPurchaseSummary.set(cskey3, { productId: item.productId, sellingType: 'units', qty: baseUnitsNeededP, primaryBatchId: primaryBatchIdP });
          }
        }
        // Write exactly one consolidated purchase movement per product — always in base units
        for (const psum of Array.from(createPurchaseSummary.values())) {
          const { productId: psProductId, qty: psQty, primaryBatchId: psBid } = psum;
          const stockBefore = stockBeforeCreate.get(psProductId)?.units ?? 0;
          const [productNow] = await trx.select({ stock: products.stock }).from(products).where(eq(products.id, psProductId)).limit(1);
          const stockAfter = productNow?.stock ?? 0;
          await trx.insert(stockMovements).values({ productId: psProductId, wholesalerId, movementType: 'purchase', quantity: -psQty, unitType: 'units', stockBefore, stockAfter, reason: `Invoice order sale — ${psQty} units`, orderId: quoteOrderRow.id, customerName: quoteOrderRow.customerName ?? null, businessProfileId: quoteOrderRow.businessProfileId ?? null, batchId: psBid });
        }
        return quoteOrderRow;
      });

      // Create Stripe Payment Link (skip for pay-later, offline payment methods, or inactive Connect accounts)
      let paymentLinkUrl = '';
      let paymentLinkId = '';

      const wholesalerConnectReady = await isConnectAccountReady(wholesaler.stripeAccountId, Boolean(wholesaler.isTestAccount));
      if (!wholesalerConnectReady && validDepositPercentage > 0 && !isOffline) {
      }

      if (validDepositPercentage > 0 && !isOffline && wholesalerConnectReady) {
        try {
          // Create line items for Stripe
          // Deposits: single line item for the deposit amount (% of total including transaction fee)
          // Full payment: single line item for the full total (subtotal + transaction fee)
          // Never map raw item prices — they exclude the customer transaction fee
          const isDeposit = validDepositPercentage < 100;
          const packSummary = packDescLines.length > 0 ? packDescLines.join(', ') : '';
          const lineItems = isDeposit
            ? [{
                price_data: {
                  currency: 'gbp',
                  product_data: {
                    name: `Deposit (${validDepositPercentage}%) - Order ${orderNumber}`,
                    description: `Deposit payment for invoice. Full order: £${total.toFixed(2)}. Remaining: £${outstandingAmount.toFixed(2)}${packSummary ? ` | ${packSummary}` : ''}`,
                  },
                  unit_amount: Math.round(depositAmount * 100),
                },
                quantity: 1,
              }]
            : [{
                price_data: {
                  currency: 'gbp',
                  product_data: {
                    name: `Order ${orderNumber}`,
                    description: `Full payment including service fee${packSummary ? ` | ${packSummary}` : ''}`,
                  },
                  unit_amount: Math.round(total * 100), // total = subtotal + customer transaction fee
                },
                quantity: 1,
              }];

          // Check if customer has previous orders with this wholesaler
          const previousOrders = await db.select({ id: orders.id }).from(orders)
            .where(and(eq(orders.retailerId, customerId), eq(orders.wholesalerId, wholesalerId), ne(orders.id, quoteOrder.id)))
            .limit(1);
          const isReturning = previousOrders.length > 0;

          // Validate wholesaler's Stripe Connect account for automatic transfer
          let quoteUseConnect = false;
          if (wholesaler.stripeAccountId) {
            try {
              const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
              if (connectAccount.charges_enabled && connectAccount.details_submitted) {
                quoteUseConnect = true;
              }
            } catch (connectErr: any) {
              console.error(`❌ Quote Connect account validation failed: ${connectErr.message}`);
            }
          }

          // Wholesaler receives subtotal minus 4.6% platform fee; proportional to deposit
          const wholesalerTotal = subtotal - platformFee;
          const wholesalerDepositAmount = Math.round(depositAmount * (wholesalerTotal / total) * 100);

          const quoteBaseUrl = process.env.NODE_ENV === 'production'
            ? 'https://quikpik.app'
            : (process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : 'http://localhost:5000');

          const quoteOrderMetadata = {
            orderId: quoteOrder.id.toString(),
            orderNumber: quoteOrder.orderNumber,
            wholesalerId,
            customerId,
            isQuote: 'true',
            depositPercentage: validDepositPercentage.toString(),
            depositAmount: depositAmount.toFixed(2),
            totalAmount: total.toFixed(2),
          };

          // Base session params (no Connect routing) — used as fallback if transfer_data fails
          const baseSessionParams: any = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${quoteBaseUrl}/customer/payment-success?order=${quoteOrder.orderNumber}&wholesaler=${wholesalerId}${isReturning ? '&returning=true' : ''}`,
            cancel_url: `${quoteBaseUrl}/store/${wholesalerId}`,
            metadata: quoteOrderMetadata,
            payment_intent_data: {
              metadata: quoteOrderMetadata,
            } as Stripe.Checkout.SessionCreateParams['payment_intent_data'],
            customer_email: customer.email || undefined,
            expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // Stripe max is 24 hours
          };

          // First attempt: with Connect routing (transfer_data)
          let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>> | null = null;
          if (quoteUseConnect && wholesalerDepositAmount > 0) {
            try {
              session = await stripe.checkout.sessions.create({
                ...baseSessionParams,
                payment_intent_data: {
                  metadata: quoteOrderMetadata,
                  transfer_data: {
                    destination: wholesaler.stripeAccountId!,
                    amount: wholesalerDepositAmount,
                  },
                } as Stripe.Checkout.SessionCreateParams['payment_intent_data'],
              });
            } catch (connectSessionErr: any) {
              console.error(`❌ Quote session with Connect routing failed — type: ${connectSessionErr.type}, code: ${connectSessionErr.code}, message: ${connectSessionErr.message}`);
            }
          }

          // Fallback: plain session without Connect routing (payment goes to platform account)
          if (!session) {
            session = await stripe.checkout.sessions.create(baseSessionParams);
          }

          paymentLinkUrl = session.url || '';
          paymentLinkId = session.id;

          const expiryDays = (validDepositPercentage < 100 || (quoteOrder.balanceDueDays || 0) > 0) ? Math.min((quoteOrder.balanceDueDays || 0) + 3, 30) : 1;
          // Update order with payment link
          await db.update(orders)
            .set({
              stripePaymentLinkId: paymentLinkId,
              stripePaymentLinkUrl: paymentLinkUrl,
              quoteExpiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
            })
            .where(eq(orders.id, quoteOrder.id));

        } catch (stripeError: any) {
          console.error(`❌ Stripe error creating quote payment link — type: ${stripeError.type}, code: ${stripeError.code}, message: ${stripeError.message}`);
          // Continue without payment link - manual payment can be arranged
        }
      }

      // Send SMS notification — only when the checkbox is explicitly ticked
      if (sendSmsNotification && customer.phoneNumber) {
        const isDeposit = validDepositPercentage > 0 && validDepositPercentage < 100;
        const isPayLater = validDepositPercentage === 0;
        const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
        const storeLink = `https://quikpik.app/store/${wholesalerId}`;
        const wholesalerContact = wholesaler.phoneNumber || wholesaler.email || '';
        
        // Build order items list for SMS
        let itemsList = '';
        try {
          const itemsListParts: string[] = [];
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const sellingType = item.sellingType || 'units';
            const total = item.customPrice * item.quantity;
            itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = £${total.toFixed(2)}`);
          }
          itemsList = itemsListParts.join('\n');
        } catch (itemsError) {
          console.error('⚠️ Could not fetch product names for SMS:', itemsError);
          itemsList = `${items.length} item(s)`;
        }
        
        // Calculate balance due date for deposit orders - use persisted order value for consistency
        const orderBalanceDueDays = quoteOrder.balanceDueDays || 0;
        let balanceDueText = '';
        if (isDeposit && orderBalanceDueDays > 0) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + orderBalanceDueDays);
          const formattedDate = dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          balanceDueText = `\nBalance due by: ${formattedDate}`;
        } else if (isDeposit && orderBalanceDueDays === 0) {
          balanceDueText = '\nBalance due: Immediately';
        }
        
        const deliveryChargeText = quoteDeliveryCharge > 0 ? `\nDelivery: £${quoteDeliveryCharge.toFixed(2)}` : '';
        const deliveryNoteText = wholesaler.deliveryNote ? `\n📦 ${wholesaler.deliveryNote}` : '';
        const offlineMethodDisplayName: Record<string, string> = {
          bank_transfer: 'bank transfer',
          cash: 'cash',
          cheque: 'cheque',
          other: '',
        };
        const isOfflineNonPayLater = isOfflineMethod && requestedPaymentMethod !== 'pay_later';
        const offlineMethodName = isOfflineNonPayLater && requestedPaymentMethod ? offlineMethodDisplayName[requestedPaymentMethod] ?? '' : '';
        const offlineArrangement = offlineMethodName
          ? `Please arrange payment via ${offlineMethodName} directly with ${businessName}.`
          : `Please arrange payment directly with ${businessName}.`;
        const customerGreeting = customer.firstName || customer.businessName || 'there';
        const message = isPayLater
          ? `Hi ${customerGreeting}! ${businessName} has sent you an invoice.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}\nPayment: Pay Later${deliveryNoteText}\n\nPlease arrange payment with ${businessName} directly.${wholesalerContact ? `\n\nContact ${businessName}: ${wholesalerContact}` : ''}`
          : isOfflineNonPayLater
          ? `Hi ${customerGreeting}! ${businessName} has sent you an invoice.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}${deliveryNoteText}\n\n${offlineArrangement}${wholesalerContact ? `\n\nContact ${businessName}: ${wholesalerContact}` : ''}`
          : isDeposit 
          ? `Hi ${customerGreeting}! ${businessName} has sent you an invoice.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nOrder Total: £${total.toFixed(2)}\nDeposit (${validDepositPercentage}%): £${depositAmount.toFixed(2)}\nRemaining: £${outstandingAmount.toFixed(2)}${balanceDueText}${deliveryNoteText}\n\nPay deposit: ${paymentLinkUrl}\n\nLink expires in 24 hours.${wholesalerContact ? `\n\nContact ${businessName}: ${wholesalerContact}` : ''}`
          : (() => {
            if (orderBalanceDueDays > 0) {
              const fullDueDate = new Date();
              fullDueDate.setDate(fullDueDate.getDate() + orderBalanceDueDays);
              const formattedFullDueDate = fullDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
              return `Hi ${customerGreeting}! ${businessName} has sent you an invoice.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)} due by ${formattedFullDueDate}${deliveryNoteText}\n\nPay here: ${paymentLinkUrl}${wholesalerContact ? `\n\nContact ${businessName}: ${wholesalerContact}` : ''}`;
            }
            return `Hi ${customerGreeting}! ${businessName} has sent you an invoice.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}${deliveryNoteText}\n\nPay here: ${paymentLinkUrl}\n\nLink expires in 24 hours.${wholesalerContact ? `\n\nContact ${businessName}: ${wholesalerContact}` : ''}`;
          })();
        
        try {
          await sendWhatsAppMessage({
            to: customer.phoneNumber,
            message,
          });
          
          // Update quote sent timestamp
          await db.update(orders)
            .set({ quoteSentAt: new Date() })
            .where(eq(orders.id, quoteOrder.id));
        } catch (smsError) {
          console.error('❌ Failed to send quote WhatsApp:', smsError);
        }
      }

      // Send customer email for offline payment methods when sendVia === 'email'
      // (For Stripe-based orders the Stripe webhook fires sendCustomerInvoiceEmail after payment;
      //  offline methods never trigger a webhook, so we send the email directly here.)
      if (sendVia === 'email' && isOffline && customer.email) {
        try {
          const isPayLaterCustomer = validDepositPercentage === 0;
          const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
          const wholesalerContact = wholesaler.phoneNumber || wholesaler.email || '';

          // Build items HTML list for the customer email
          const customerItemsHtml: string[] = [];
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const packDesc = formatPackDescriptor(product?.quantityInPack, product?.unitSize, product?.unitOfMeasure);
            const displayName = packDesc ? `${productName} (${packDesc})` : productName;
            const sellingType = item.sellingType || 'units';
            const itemTotal = item.customPrice * item.quantity;
            customerItemsHtml.push(
              `<li style="margin:6px 0"><strong>${displayName}</strong> — ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = <strong>£${itemTotal.toFixed(2)}</strong></li>`
            );
          }

          // Build payment arrangement copy (mirrors the SMS logic from task #777)
          const offlineMethodDisplayName: Record<string, string> = {
            bank_transfer: 'bank transfer',
            cash: 'cash',
            cheque: 'cheque',
            other: '',
          };
          const isOfflineNonPayLaterMethod = isOfflineMethod && requestedPaymentMethod !== 'pay_later';
          const offlineMethodName =
            isOfflineNonPayLaterMethod && requestedPaymentMethod
              ? (offlineMethodDisplayName[requestedPaymentMethod] ?? '')
              : '';
          const arrangementHtml = isPayLaterCustomer
            ? `Please arrange payment with <strong>${businessName}</strong> directly.`
            : offlineMethodName
              ? `Please arrange payment via ${offlineMethodName} directly with <strong>${businessName}</strong>.`
              : `Please arrange payment directly with <strong>${businessName}</strong>.`;

          const deliveryRowHtml =
            quoteDeliveryCharge > 0
              ? `<tr><td style="padding:4px 0">Delivery:</td><td style="padding:4px 0;text-align:right">£${quoteDeliveryCharge.toFixed(2)}</td></tr>`
              : '';

          const emailSubjectPrefix = isPayLaterCustomer ? 'Invoice (Pay Later)' : 'Invoice';
          const emailIntroText = isPayLaterCustomer
            ? `${businessName} has sent you an invoice. Payment can be arranged later directly with the store.`
            : offlineMethodName
              ? `${businessName} has sent you an invoice. Please arrange payment via ${offlineMethodName}.`
              : `${businessName} has sent you an invoice. Please arrange payment directly with the store.`;

          const customerEmailBody = [
            emailHeading('Your Invoice', { size: '22px', color: '#10b981' }),
            `<p style="margin:0 0 4px">Order <b>${orderNumber}</b></p>`,
            `<p style="margin:0 0 16px;font-size:14px;color:#6b7280">${formatDateTime(new Date())}</p>`,
            emailCard(
              `<p style="margin:0;font-size:15px">${emailIntroText}</p>`,
              { borderColor: '#d1fae5', bgColor: '#f0fdf4' }
            ),
            `<ul style="margin:8px 0 16px;padding-left:20px">${customerItemsHtml.join('')}</ul>`,
            `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${deliveryRowHtml}<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">Total:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">£${total.toFixed(2)}</td></tr></table>`,
            emailCard(
              `<p style="margin:0 0 6px;font-size:15px">${arrangementHtml}</p>${wholesalerContact ? `<p style="margin:0;font-size:13px;color:#6b7280">Contact ${businessName}: ${wholesalerContact}</p>` : ''}`,
              { borderColor: '#dbeafe', bgColor: '#eff6ff' }
            ),
          ].join('');

          const customerEmailHtml = wrapCustomerEmail(
            customerEmailBody,
            {
              businessName,
              logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl, wholesaler.updatedAt),
            },
            { preheader: `Invoice ${orderNumber} from ${businessName} — £${total.toFixed(2)}` }
          );

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: `${emailSubjectPrefix} ${orderNumber} from ${businessName}`,
            html: customerEmailHtml,
          });

          await db.update(orders)
            .set({ quoteSentAt: new Date() })
            .where(eq(orders.id, quoteOrder.id));
        } catch (customerEmailError: any) {
          console.error('⚠️ Failed to send customer invoice email (offline payment):', customerEmailError?.message);
        }
      }

      // Send optional SMS notification to customer
      if (sendSmsNotification && customer.phoneNumber) {
        try {
          const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
          const customerGreeting = customer.firstName || customer.businessName || 'there';
          const smsBody = `Hi ${customerGreeting}! ${businessName} has raised an invoice for you. Total: £${total.toFixed(2)}. Order ref: ${quoteOrder.orderNumber}. Please check your email for full details.`;
          const result = await ReliableSMSService.sendMarketingSMS(customer.phoneNumber, smsBody);
          if (!result.success) {
            console.warn(`⚠️ Invoice SMS notification failed [orderId=${quoteOrder.id}]: ${result.error}`);
          }
        } catch (smsError: any) {
          console.warn(`⚠️ Invoice SMS notification error [orderId=${quoteOrder.id}]:`, smsError?.message);
        }
      }

      // Send confirmation email to wholesaler

      try {
        if (wholesaler.email) {
          const isDeposit = validDepositPercentage > 0 && validDepositPercentage < 100;
          const isPayLater = validDepositPercentage === 0;
          const itemsForEmail: string[] = [];
          let wholesalerTotalWeightKg = 0;
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const packDesc = formatPackDescriptor(product?.quantityInPack, product?.unitSize, product?.unitOfMeasure);
            const displayName = packDesc ? `${productName} (${packDesc})` : productName;
            const sellingType = item.sellingType || 'units';
            const itemTotal = item.customPrice * item.quantity;
            let unitWeightKg = 0;
            if (sellingType === 'pallets') {
              unitWeightKg = parseFloat(product?.palletWeight || product?.pallet_weight || '0');
            } else {
              // Prefer stored total package weight (accurate for a whole pack).
              // Fall back to per-unit weight × quantityInPack when only unit weight is stored.
              const packQty = product?.quantityInPack ?? 1;
              const unitWeight = parseFloat(product?.weightKg || product?.weight_kg || '0');
              const packWeight = parseFloat(product?.packWeightKg || product?.pack_weight_kg || '0');
              unitWeightKg = packWeight > 0 ? packWeight : unitWeight * packQty;
            }
            wholesalerTotalWeightKg += unitWeightKg * item.quantity;
            itemsForEmail.push(`<li style="margin:6px 0"><strong>${displayName}</strong> — ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = <strong>£${itemTotal.toFixed(2)}</strong></li>`);
          }

          const deliveryRowHtmlWholesaler = quoteDeliveryCharge > 0
            ? `<tr><td style="padding:4px 0">Delivery:</td><td style="padding:4px 0;text-align:right">£${quoteDeliveryCharge.toFixed(2)}</td></tr>`
            : '';
          const vatRowHtmlWholesaler = quoteVatAmount > 0
            ? `<tr><td style="padding:4px 0">VAT (${(quoteVatRate * 100).toFixed(0)}%):</td><td style="padding:4px 0;text-align:right">£${quoteVatAmount.toFixed(2)}</td></tr>`
            : '';
          const weightRowHtml = wholesalerTotalWeightKg > 0
            ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Est. Weight:</td><td style="padding:4px 0;text-align:right;color:#6b7280;font-size:13px">${wholesalerTotalWeightKg.toFixed(1)} kg</td></tr>`
            : '';

          const wholesalerCustomerName = customer.businessName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';
          const customerLink = customer.id ? `https://quikpik.app/customers/${customer.id}` : null;

          const wholesalerEmailIntro = isPayLater
            ? `A new <strong>Pay Later</strong> invoice has been created for <strong>${wholesalerCustomerName}</strong>. Payment will be arranged directly with the customer.`
            : isDeposit
              ? `A new invoice requiring a <strong>${validDepositPercentage}% deposit</strong> (£${depositAmount.toFixed(2)}) has been sent to <strong>${wholesalerCustomerName}</strong>.`
              : `A new invoice for <strong>£${total.toFixed(2)}</strong> has been sent to <strong>${wholesalerCustomerName}</strong>.`;

          const paymentLinkSection = !isPayLater && !isOfflineMethod && paymentLinkUrl
            ? emailCard(`<p style="margin:0 0 8px"><strong>Payment Link:</strong></p><p style="margin:0;font-size:13px;word-break:break-all"><a href="${paymentLinkUrl}" style="color:#059669">${paymentLinkUrl}</a></p>`, { borderColor: '#d1fae5', bgColor: '#f0fdf4' })
            : '';

          const wholesalerEmailBody = [
            `<p style="margin:0 0 16px">${wholesalerEmailIntro}</p>`,
            `<p style="margin:0 0 4px"><strong>Order:</strong> ${orderNumber}</p>`,
            customerLink
              ? `<p style="margin:0 0 16px"><strong>Customer:</strong> <a href="${customerLink}" style="color:#059669">${wholesalerCustomerName}</a></p>`
              : `<p style="margin:0 0 16px"><strong>Customer:</strong> ${wholesalerCustomerName}</p>`,
            `<ul style="margin:8px 0 16px;padding-left:20px">${itemsForEmail.join('')}</ul>`,
            `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${deliveryRowHtmlWholesaler}${vatRowHtmlWholesaler}${weightRowHtml}<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">Total:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">£${total.toFixed(2)}</td></tr></table>`,
            paymentLinkSection,
          ].join('');

          const wholesalerEmailHtml = wrapCustomerEmail(
            wholesalerEmailBody,
            {
              businessName: wholesaler.businessName || 'Quikpik',
              logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl, wholesaler.updatedAt),
            },
            { preheader: `New invoice ${orderNumber} created for ${wholesalerCustomerName} — £${total.toFixed(2)}` }
          );

          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `Invoice ${orderNumber} created for ${wholesalerCustomerName}`,
            html: wholesalerEmailHtml,
          });
        }
      } catch (wholesalerEmailError: any) {
        console.error('⚠️ Failed to send wholesaler confirmation email:', wholesalerEmailError?.message);
      }

      // Log quote_created activity (non-blocking)
      logQuoteActivity({
        quoteId: quoteOrder.id,
        actionType: 'quote_created',
        entityType: 'quote',
        newValue: {
          orderNumber,
          customerId,
          total: total.toFixed(2),
          depositPercentage: validDepositPercentage,
          paymentMethod: quoteOrder.paymentMethod,
          sendVia,
        },
        description: `Invoice ${orderNumber} created for ${quoteOrder.customerName} — £${fmtGBP(total)}${validDepositPercentage < 100 ? ` (${validDepositPercentage}% deposit)` : ''}`,
        performedBy: req.user.id,
      });

      res.json({
        success: true,
        orderId: quoteOrder.id,
        orderNumber,
        paymentLink: paymentLinkUrl,
        total: total.toFixed(2),
        // Signals to the frontend that no payment link was generated because
        // the wholesaler's Stripe Connect account is not yet fully active.
        connectNotReady: !wholesalerConnectReady && validDepositPercentage > 0 && !isOffline,
      });

    } catch (error) {
      console.error('❌ Error creating quote:', error);
      const msg = (error as Error).message || '';
      if (msg.startsWith('Insufficient stock')) {
        const stockErr = error as Error & { productName?: string; available?: number; requested?: number };
        const reqMatch = msg.match(/Requested:\s*(\d+)/);
        const availMatch = msg.match(/Available:\s*(\d+)/);
        return res.status(400).json({
          error: msg,
          errorType: 'OUT_OF_STOCK',
          productName: stockErr.productName,
          requested: stockErr.requested ?? (reqMatch ? parseInt(reqMatch[1]) : undefined),
          available: stockErr.available ?? (availMatch ? parseInt(availMatch[1]) : undefined),
        });
      }
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  });

  // PATCH /api/quotes/:id — edit an existing quote before payment is completed
  app.patch('/api/quotes/:id', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);

      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) {
        return res.status(400).json({ error: 'Invalid quote ID' });
      }

      const items = req.body.items as QuoteEditItem[];
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
      }

      const ALLOWED_PAYMENT_METHODS = ['cash', 'bank_transfer', 'payment_link', 'pay_later', 'card', 'cheque', 'other'];
      const newPaymentMethod: string | undefined = req.body.paymentMethod;
      if (newPaymentMethod !== undefined && !ALLOWED_PAYMENT_METHODS.includes(newPaymentMethod)) {
        return res.status(400).json({ error: 'Invalid paymentMethod value', errorType: 'VALIDATION_ERROR' });
      }

      // Server-side input validation for each item
      for (const item of items) {
        if (!Number.isInteger(item.productId) || item.productId <= 0) {
          return res.status(400).json({ error: 'Each item must have a valid productId', errorType: 'VALIDATION_ERROR' });
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          return res.status(400).json({ error: 'Item quantity must be a positive integer', errorType: 'VALIDATION_ERROR' });
        }
        if (typeof item.customPrice !== 'number' || !isFinite(item.customPrice) || item.customPrice <= 0) {
          return res.status(400).json({ error: 'Item price must be greater than zero', errorType: 'VALIDATION_ERROR' });
        }
        const normalizedType = item.sellingType || 'units';
        if (!['units', 'pallets'].includes(normalizedType)) {
          return res.status(400).json({ error: 'Invalid sellingType — must be "units" or "pallets"', errorType: 'VALIDATION_ERROR' });
        }
      }

      // ── Step 1: Validate editability (read-only) ──────────────────────────
      const [existingOrder] = await db.select().from(orders).where(eq(orders.id, quoteId)).limit(1);
      if (!existingOrder) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (existingOrder.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (!existingOrder.isQuote) {
        return res.status(400).json({ error: 'Only invoices can be edited' });
      }
      if (existingOrder.status !== 'pending') {
        return res.status(400).json({ error: `Invoice cannot be edited — current status is "${existingOrder.status}". Only pending invoices can be edited.` });
      }
      if (existingOrder.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'Invoice cannot be edited after payment is completed' });
      }

      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) return res.status(404).json({ error: 'Wholesaler not found' });
      const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));

      // ── Step 2: Snapshot existing items (read-only, for audit trail) ──────
      const existingItems = (await storage.getOrderItems(quoteId)) as ExistingOrderItem[];

      // ── Step 3: Recalculate totals (read-only) ────────────────────────────
      const productSubtotal = items.reduce((sum: number, item: any) => sum + (item.customPrice * item.quantity), 0);
      const quoteDeliveryCharge = parseFloat(existingOrder.deliveryCost || '0');
      const subtotal = productSubtotal + quoteDeliveryCharge;
      const OFFLINE_METHODS = ['cash', 'bank_transfer', 'cheque', 'other', 'pay_later'];
      // Use the incoming payment method (if changed) to determine offline status — not the old one
      const effectivePaymentMethod = newPaymentMethod ?? existingOrder.paymentMethod;
      const isOfflinePayment = effectivePaymentMethod ? OFFLINE_METHODS.includes(effectivePaymentMethod) : false;
      const depositPercentage = existingOrder.depositPercentage || 100;
      const isPayLaterEdit = depositPercentage === 0;
      const isOfflineEdit = isPayLaterEdit || isOfflinePayment;
      const feeConfigEdit = await getFeeConfigForWholesaler(wholesalerId);
      const customerTransactionFee = isOfflineEdit ? 0 : calculateCustomerFee(subtotal, 0, feeConfigEdit);
      const feeRate = isOfflineEdit ? 0 : await getWholesalerPlatformFeeRate(wholesalerId);
      const platformFee = isOfflineEdit ? 0 : subtotal * feeRate;

      // VAT calculation — wholesaler already fetched above
      const editVatEnabled = wholesaler?.vatEnabled ?? false;
      const editVatRate = parseFloat(wholesaler?.vatRate ?? '0');
      const editVatAmount = editVatEnabled ? productSubtotal * editVatRate : 0;
      const editVatRateApplied = editVatEnabled ? editVatRate : null;
      const total = productSubtotal + editVatAmount + quoteDeliveryCharge + customerTransactionFee;
      const depositAmount = total * (depositPercentage / 100);
      // Correctly account for any prior partial payments when computing outstanding
      const alreadyPaid = parseFloat(existingOrder.amountPaid || '0');
      const baseOutstanding = isPayLaterEdit ? productSubtotal + editVatAmount + quoteDeliveryCharge : total;
      const newAmountOutstanding = Math.max(baseOutstanding - alreadyPaid, 0);

      // ── Step 4: Pre-validate new items stock BEFORE any mutations ─────────
      // We compute the restored stock in memory to validate against the correct post-restore levels
      // (avoids needing to actually restore stock before validation).
      const restoredStockMap: Record<number, { units: number; pallets: number }> = {};
      for (const item of existingItems) {
        if (item.productId === null) continue;
        const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product) continue; // product removed — skip; stock restore will also skip it
        const sellingType = item.sellingType || 'units';
        if (!restoredStockMap[item.productId]) {
          restoredStockMap[item.productId] = { units: product.stock || 0, pallets: product.palletStock || 0 };
        }
        if (sellingType === 'pallets') {
          restoredStockMap[item.productId].pallets += item.quantity;
        } else {
          restoredStockMap[item.productId].units += item.quantity;
        }
      }

      // Count quantities by productId+sellingType for new items (consolidate duplicates)
      const newItemMap: Record<string, { productId: number; quantity: number; sellingType: string; customPrice: number }> = {};
      for (const item of items) {
        const key = `${item.productId}:${item.sellingType || 'units'}`;
        if (newItemMap[key]) {
          newItemMap[key].quantity += item.quantity;
        } else {
          newItemMap[key] = { productId: item.productId, quantity: item.quantity, sellingType: item.sellingType || 'units', customPrice: item.customPrice };
        }
      }

      for (const key of Object.keys(newItemMap)) {
        const newItem = newItemMap[key];
        const [productForCheck] = await db.select().from(products)
          .where(and(eq(products.id, newItem.productId), eq(products.wholesalerId, wholesalerId)));
        if (!productForCheck) {
          return res.status(400).json({ error: 'One or more products not found', errorType: 'PRODUCT_NOT_FOUND' });
        }
        // Use post-restore stock level for validation
        const postRestoreStock = restoredStockMap[newItem.productId] || { units: productForCheck.stock || 0, pallets: productForCheck.palletStock || 0 };
        if (newItem.sellingType === 'units') {
          const available = postRestoreStock.units;
          if (available < newItem.quantity) {
            return res.status(400).json({
              error: `"${productForCheck.name}" has insufficient stock. ${available} units available, ${newItem.quantity} requested.`,
              errorType: 'OUT_OF_STOCK', productName: productForCheck.name, available, requested: newItem.quantity,
            });
          }
        } else if (newItem.sellingType === 'pallets') {
          const available = postRestoreStock.pallets;
          if (available < newItem.quantity) {
            return res.status(400).json({
              error: `"${productForCheck.name}" has insufficient pallet stock. ${available} pallets available, ${newItem.quantity} requested.`,
              errorType: 'OUT_OF_STOCK', productName: productForCheck.name, available, requested: newItem.quantity,
            });
          }
        }
      }

      // ── Step 5: Create new Stripe session BEFORE mutating DB ──────────────
      // If Stripe creation fails for online-payable quotes, we abort before changing anything.
      // Start with empty link values — they will be set only if a new session is created.
      // This ensures that if no new session is needed (e.g., outstanding = 0), the old stale
      // link is cleared rather than preserved.
      let newPaymentLinkUrl = '';
      let newPaymentLinkId = '';
      // Need a new session whenever the quote is online, not offline, and hasn't been fully paid,
      // and the wholesaler's Connect account is fully active.
      const editConnectReady = await isConnectAccountReady(wholesaler.stripeAccountId, Boolean(wholesaler.isTestAccount));
      if (!editConnectReady && !isOfflineEdit && existingOrder.paymentStatus !== 'paid' && newAmountOutstanding > 0) {
      }
      const needsNewStripeSession = !isOfflineEdit && existingOrder.paymentStatus !== 'paid' && newAmountOutstanding > 0 && editConnectReady;
      const packDescLinesForStripe: string[] = [];

      let customerForEmail: Awaited<ReturnType<typeof storage.getUser>> | null = null;
      if (needsNewStripeSession) {
        for (const item of items) {
          const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
          if (product) {
            const packDescriptor = formatPackDescriptor(product.quantityInPack, product.unitSize, product.unitOfMeasure);
            packDescLinesForStripe.push(packDescriptor ? `${product.name} (${packDescriptor})` : product.name);
          }
        }
        try {
          const customer = await storage.getUser(existingOrder.retailerId);
          customerForEmail = customer;
          const packSummary = packDescLinesForStripe.join(', ');
          // For part_paid quotes: session is for the remaining outstanding amount.
          // For unpaid quotes: session is for the deposit (or full total if no deposit).
          const isPartPaid = existingOrder.paymentStatus === 'part_paid';
          const sessionAmountPence = Math.round((isPartPaid ? newAmountOutstanding : depositAmount) * 100);
          const sessionLabel = isPartPaid
            ? `Remaining Balance - Order ${existingOrder.orderNumber}`
            : depositPercentage < 100
              ? `Deposit (${depositPercentage}%) - Order ${existingOrder.orderNumber}`
              : `Order ${existingOrder.orderNumber}`;
          const sessionDescription = isPartPaid
            ? `Remaining balance after partial payment. Total: £${total.toFixed(2)}. Already paid: £${alreadyPaid.toFixed(2)}.${packSummary ? ` | ${packSummary}` : ''}`
            : depositPercentage < 100
              ? `Deposit for invoice. Full order: £${total.toFixed(2)}. Remaining: £${newAmountOutstanding.toFixed(2)}${packSummary ? ` | ${packSummary}` : ''}`
              : `Full payment incl. service fee${packSummary ? ` | ${packSummary}` : ''}`;
          const lineItems = [{ price_data: { currency: 'gbp', product_data: { name: sessionLabel, description: sessionDescription }, unit_amount: sessionAmountPence }, quantity: 1 }];

          let quoteUseConnect = false;
          if (wholesaler.stripeAccountId) {
            try {
              const acct = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
              if (acct.charges_enabled && acct.details_submitted) quoteUseConnect = true;
            } catch (e) { console.warn('[payments] Stripe Connect account check failed (non-fatal):', e instanceof Error ? e.message : e); }
          }
          const wholesalerTotal = subtotal - platformFee;
          // Session charge amount (in pence): for part_paid it's the remaining outstanding, otherwise the deposit
          const sessionChargeForConnect = isPartPaid ? newAmountOutstanding : depositAmount;
          const wholesalerSessionAmount = Math.round(sessionChargeForConnect * (wholesalerTotal / (total || 1)) * 100);
          const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://quikpik.app'
            : (process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : 'http://localhost:5000');
          const editQuoteMetadata = { orderId: quoteId.toString(), orderNumber: existingOrder.orderNumber, wholesalerId, customerId: existingOrder.retailerId || '', isQuote: 'true', depositPercentage: depositPercentage.toString(), depositAmount: depositAmount.toFixed(2), totalAmount: total.toFixed(2), alreadyPaid: alreadyPaid.toFixed(2) };
          const baseSessionParams: any = {
            payment_method_types: ['card'], line_items: lineItems, mode: 'payment',
            success_url: `${baseUrl}/customer/payment-success?order=${existingOrder.orderNumber}&wholesaler=${wholesalerId}`,
            cancel_url: `${baseUrl}/store/${wholesalerId}`,
            metadata: editQuoteMetadata,
            payment_intent_data: { metadata: editQuoteMetadata } as Stripe.Checkout.SessionCreateParams['payment_intent_data'],
            customer_email: customer?.email || undefined,
            expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
          };
          let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>> | null = null;
          if (quoteUseConnect && wholesalerSessionAmount > 0) {
            try {
              session = await stripe.checkout.sessions.create({ ...baseSessionParams, payment_intent_data: { metadata: editQuoteMetadata, transfer_data: { destination: wholesaler.stripeAccountId!, amount: wholesalerSessionAmount } } });
            } catch (e) { console.warn('[payments] Stripe Connect session failed (falling back to direct):', e instanceof Error ? e.message : e); }
          }
          if (!session) session = await stripe.checkout.sessions.create(baseSessionParams);
          newPaymentLinkUrl = session.url || '';
          newPaymentLinkId = session.id;
        } catch (stripeError: any) {
          console.error(`❌ Stripe session creation failed on quote edit:`, stripeError.message);
          return res.status(500).json({ error: 'Failed to create payment link — invoice not changed. Please try again.' });
        }
      }

      // ── Step 6: Build audit trail (read-only, uses existingItems snapshot) ─
      const editorName = req.user.role === 'team_member'
        ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Team Member'
        : `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Wholesaler';
      const timestamp = new Date().toISOString();

      // Resolve product names so audit entries and the customer email are human-readable
      const auditAllProductIds = Array.from(new Set([
        ...existingItems.map(i => i.productId).filter((id): id is number => id !== null),
        ...items.map(i => i.productId),
      ]));
      const auditProductRows = auditAllProductIds.length > 0
        ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, auditAllProductIds))
        : [];
      const auditProductNameMap = new Map<number, string>(auditProductRows.map(p => [p.id, p.name]));
      const auditPName = (id: number) => auditProductNameMap.get(id) ?? `Product #${id}`;

      const changeList: string[] = [];
      const restoredProductWarnings: string[] = [];
      for (const oldItem of existingItems) {
        if (oldItem.productId === null) continue;
        const sellingTypeOld = oldItem.sellingType || 'units';
        const inNew = items.find((ni) => ni.productId === oldItem.productId && (ni.sellingType || 'units') === sellingTypeOld);
        if (!inNew) changeList.push(`Removed ${auditPName(oldItem.productId)} (${sellingTypeOld})`);
      }
      for (const newItem of items) {
        const sellingTypeNew = newItem.sellingType || 'units';
        const inOld = existingItems.find((oi) => oi.productId === newItem.productId && (oi.sellingType || 'units') === sellingTypeNew);
        if (!inOld) {
          changeList.push(`Added ${auditPName(newItem.productId)}: ${newItem.quantity} ${sellingTypeNew} @ £${fmtGBP(newItem.customPrice)}`);
        } else {
          const parts: string[] = [];
          if (inOld.quantity !== newItem.quantity) parts.push(`qty ${inOld.quantity}→${newItem.quantity}`);
          if (Math.abs(parseFloat(inOld.unitPrice || '0') - newItem.customPrice) > 0.001) parts.push(`price £${fmtGBP(parseFloat(inOld.unitPrice || '0'))}→£${fmtGBP(newItem.customPrice)}`);
          if (parts.length > 0) changeList.push(`${auditPName(newItem.productId)}: ${parts.join(', ')}`);
        }
      }
      const auditEntry = `[Invoice edited ${timestamp} by ${editorName}] ${changeList.length > 0 ? changeList.join('; ') : 'No line item changes'}. New total: £${fmtGBP(total)}.`;
      const updatedNotes = existingOrder.notes ? `${existingOrder.notes}\n${auditEntry}` : auditEntry;

      // ── Step 7: Atomic DB transaction — stock restore → item swap → allocate ─
      const oldStripeSessionId = existingOrder.stripePaymentLinkId;
      await db.transaction(async (trx) => {
        // Capture stock for all affected products before any changes (for net movement records)
        const allAffectedProductIds = Array.from(new Set([
          ...existingItems.filter(i => i.productId !== null).map(i => i.productId as number),
          ...items.map(i => i.productId),
        ]));
        const stockBeforeEdit7a = new Map<number, { units: number; pallets: number; qip: number; upp: number }>();
        for (const pid of allAffectedProductIds) {
          const [pre] = await trx.select({ stock: products.stock, palletStock: products.palletStock, quantityInPack: products.quantityInPack, unitsPerPallet: products.unitsPerPallet }).from(products).where(eq(products.id, pid)).limit(1);
          if (pre) stockBeforeEdit7a.set(pid, { units: pre.stock ?? 0, pallets: pre.palletStock ?? 0, qip: pre.quantityInPack ?? 1, upp: pre.unitsPerPallet ?? 1 });
        }

        // 7a. Restore stock from old items — aggregate by product for exactly one movement per product
        const editRestoreToday = new Date().toISOString().split('T')[0];
        type RestoreGroup = { productId: number; qty: number; sellingType: string; batches: { batchId: number | null; qty: number }[] };
        const restoreGroups = new Map<string, RestoreGroup>();
        for (const item of existingItems) {
          if (item.productId === null) continue;
          const sellingType = item.sellingType || 'units';
          const key = `${item.productId}_${sellingType}`;
          const existingGroup = restoreGroups.get(key);
          if (existingGroup) { existingGroup.qty += item.quantity; existingGroup.batches.push({ batchId: item.batchId ?? null, qty: item.quantity }); }
          else restoreGroups.set(key, { productId: item.productId, qty: item.quantity, sellingType, batches: [{ batchId: item.batchId ?? null, qty: item.quantity }] });
        }
        for (const group of Array.from(restoreGroups.values())) {
          const { productId } = group;
          const [product] = await trx.select().from(products).where(eq(products.id, productId)).limit(1);
          if (!product) {
            restoredProductWarnings.push(`Product #${productId} no longer exists — its stock could not be restored.`);
            continue;
          }
          if (group.sellingType === 'pallets') {
            const qip = product.quantityInPack ?? 1;
            const upp = product.unitsPerPallet ?? 1;
            const baseUnitsToRestore = group.qty * qip * upp;
            await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${existingOrder.orderNumber}`, quantity: baseUnitsToRestore, status: 'active', notes: `Return restock from invoice edit of order ${existingOrder.orderNumber}` });
            const [batchSumRowR] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
              .where(and(eq(productBatches.productId, productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${editRestoreToday}`)));
            const newUnitStock = parseInt(String(batchSumRowR?.total ?? 0), 10);
            const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
            await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() }).where(eq(products.id, productId));
          } else {
            const unitStockBefore = product.stock || 0;
            // Restore each batch individually; fall back to a return batch if original is missing
            for (const batchInfo of group.batches) {
              if (batchInfo.batchId) {
                const [origBatch] = await trx.select().from(productBatches).where(eq(productBatches.id, batchInfo.batchId)).limit(1);
                if (origBatch && origBatch.productId === productId) {
                  await trx.update(productBatches).set({ quantity: origBatch.quantity + batchInfo.qty, status: 'active', updatedAt: new Date() }).where(eq(productBatches.id, batchInfo.batchId));
                } else {
                  // Batch not found or mismatched — create return batch so units are not lost
                  await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${existingOrder.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Return restock from invoice edit of order ${existingOrder.orderNumber}` });
                }
              } else {
                await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${existingOrder.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Legacy return restock from invoice edit of order ${existingOrder.orderNumber}` });
              }
            }
            // Recalc stock from batch sum (single source of truth)
            const [batchSumRow] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
              .where(and(eq(productBatches.productId, productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${editRestoreToday}`)));
            const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
            const qip = product.quantityInPack ?? 1;
            const upp = product.unitsPerPallet ?? 1;
            const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
            await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() }).where(eq(products.id, productId));
          }
        }

        // 7b. Delete old order items (items are re-inserted with batchId in step 7c)
        await trx.delete(orderItems).where(eq(orderItems.orderId, quoteId));

        // 7c. Allocate stock for new items and insert them with their allocated batchId
        // Accumulate purchase totals per (product, sellingType) to track primary batchId for the net movement
        const editPurchaseSummary = new Map<string, { productId: number; sellingType: string; qty: number; primaryBatchId: number | null }>();
        for (const item of items) {
          const sellingType = item.sellingType || 'units';
          const [product] = await trx.select().from(products).where(eq(products.id, item.productId)).limit(1);
          if (!product) continue;

          if (sellingType === 'pallets') {
            const qipE = product.quantityInPack ?? 1;
            const uppE = product.unitsPerPallet ?? 1;
            const baseUnitsNeededE = item.quantity * uppE * qipE;
            const editAllocToday = new Date().toISOString().split('T')[0];
            const activeBatchesE = await trx.select().from(productBatches)
              .where(and(eq(productBatches.productId, item.productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${editAllocToday}`)))
              .orderBy(sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`, asc(productBatches.expiryDate), asc(productBatches.createdAt));
            let primaryBatchIdE: number | null = null;
            if (activeBatchesE.length > 0) {
              const totalAvailE = activeBatchesE.reduce((acc, b) => acc + b.quantity, 0);
              if (totalAvailE < baseUnitsNeededE) {
                const availPallets = (qipE > 0 && uppE > 0) ? Math.floor(Math.floor(totalAvailE / qipE) / uppE) : 0;
                const e = new Error(`Insufficient stock for "${product.name}" after concurrent update. ${availPallets} pallets available, ${item.quantity} requested.`) as Error & { code?: string; productName?: string; available?: number; requested?: number };
                e.code = 'OUT_OF_STOCK'; e.productName = product.name; e.available = availPallets; e.requested = item.quantity;
                throw e;
              }
              let remainingE = baseUnitsNeededE;
              for (const batch of activeBatchesE) {
                if (remainingE <= 0) break;
                const deduct = Math.min(remainingE, batch.quantity);
                const newQty = batch.quantity - deduct;
                await trx.update(productBatches).set({ quantity: newQty, status: newQty === 0 ? 'depleted' : 'active', updatedAt: new Date() }).where(eq(productBatches.id, batch.id));
                if (primaryBatchIdE === null) primaryBatchIdE = batch.id;
                remainingE -= deduct;
              }
            } else {
              if ((product.stock ?? 0) < baseUnitsNeededE) {
                const availPallets = (qipE > 0 && uppE > 0) ? Math.floor(Math.floor((product.stock ?? 0) / qipE) / uppE) : 0;
                const e = new Error(`Insufficient stock for "${product.name}" after concurrent update. ${availPallets} pallets available, ${item.quantity} requested.`) as Error & { code?: string; productName?: string; available?: number; requested?: number };
                e.code = 'OUT_OF_STOCK'; e.productName = product.name; e.available = availPallets; e.requested = item.quantity;
                throw e;
              }
            }
            const [batchSumRowE] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
              .where(and(eq(productBatches.productId, item.productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${editAllocToday}`)));
            const newUnitStockE = parseInt(String(batchSumRowE?.total ?? 0), 10);
            const newPalletStockE = (qipE > 0 && uppE > 0) ? Math.floor(Math.floor(newUnitStockE / qipE) / uppE) : 0;
            await trx.insert(orderItems).values({ orderId: quoteId, productId: item.productId, quantity: item.quantity, unitPrice: item.customPrice.toFixed(2), total: (item.customPrice * item.quantity).toFixed(2), sellingType, batchId: primaryBatchIdE });
            await trx.update(products).set({ stock: newUnitStockE, palletStock: newPalletStockE, updatedAt: new Date() }).where(eq(products.id, item.productId));
            const epkey1 = `${item.productId}_units`;
            const epsum1 = editPurchaseSummary.get(epkey1);
            if (epsum1) { epsum1.qty += baseUnitsNeededE; if (epsum1.primaryBatchId === null) epsum1.primaryBatchId = primaryBatchIdE; }
            else editPurchaseSummary.set(epkey1, { productId: item.productId, sellingType: 'units', qty: baseUnitsNeededE, primaryBatchId: primaryBatchIdE });
          } else {
            // Units: prefer FEFO batch deduction
            const today = new Date().toISOString().split('T')[0];
            const activeBatches = await trx.select().from(productBatches)
              .where(and(eq(productBatches.productId, item.productId), eq(productBatches.status, 'active'),
                or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)))
              .orderBy(sql`CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END`, asc(productBatches.expiryDate), asc(productBatches.createdAt));

            if (activeBatches.length > 0) {
              const totalAvailable = activeBatches.reduce((acc, b) => acc + b.quantity, 0);
              if (totalAvailable < item.quantity) {
                const e = new Error(`Insufficient stock for "${product.name}" after concurrent update. ${totalAvailable} available, ${item.quantity} requested.`) as Error & { code?: string; productName?: string; available?: number; requested?: number };
                e.code = 'OUT_OF_STOCK'; e.productName = product.name; e.available = totalAvailable; e.requested = item.quantity;
                throw e;
              }
              let remaining = item.quantity;
              let primaryBatchId: number | null = null;
              for (const batch of activeBatches) {
                if (remaining <= 0) break;
                const deduct = Math.min(remaining, batch.quantity);
                const newQty = batch.quantity - deduct;
                await trx.update(productBatches)
                  .set({ quantity: newQty, status: newQty === 0 ? 'depleted' : 'active', updatedAt: new Date() })
                  .where(eq(productBatches.id, batch.id));
                if (primaryBatchId === null) primaryBatchId = batch.id;
                remaining -= deduct;
              }
              const [batchSumRow] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
                .where(and(eq(productBatches.productId, item.productId), eq(productBatches.status, 'active'),
                  or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)));
              const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
              // Insert order item with allocated batchId so future edits/cancellations can reverse correctly
              await trx.insert(orderItems).values({ orderId: quoteId, productId: item.productId, quantity: item.quantity, unitPrice: item.customPrice.toFixed(2), total: (item.customPrice * item.quantity).toFixed(2), sellingType, batchId: primaryBatchId });
              await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() }).where(eq(products.id, item.productId));
              const epkey2 = `${item.productId}_units`;
              const epsum2 = editPurchaseSummary.get(epkey2);
              if (epsum2) { epsum2.qty += item.quantity; if (epsum2.primaryBatchId === null) epsum2.primaryBatchId = primaryBatchId; }
              else editPurchaseSummary.set(epkey2, { productId: item.productId, sellingType: 'units', qty: item.quantity, primaryBatchId });
            } else {
              // Legacy: no batches — direct stock deduction
              if ((product.stock || 0) < item.quantity) {
                const e = new Error(`Insufficient stock for "${product.name}" after concurrent update. ${product.stock || 0} available, ${item.quantity} requested.`) as Error & { code?: string; productName?: string; available?: number; requested?: number };
                e.code = 'OUT_OF_STOCK'; e.productName = product.name; e.available = product.stock || 0; e.requested = item.quantity;
                throw e;
              }
              const orderResult = InventoryCalculator.processOrder(item.quantity, 'units', { stock: product.stock ?? 0, palletStock: product.palletStock ?? 0, quantityInPack: product.quantityInPack, unitsPerPallet: product.unitsPerPallet });
              const { newUnitStock, newPalletStock } = orderResult;
              await trx.insert(orderItems).values({ orderId: quoteId, productId: item.productId, quantity: item.quantity, unitPrice: item.customPrice.toFixed(2), total: (item.customPrice * item.quantity).toFixed(2), sellingType });
              await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock, updatedAt: new Date() }).where(eq(products.id, item.productId));
              const epkey3 = `${item.productId}_units`;
              const epsum3 = editPurchaseSummary.get(epkey3);
              if (epsum3) { epsum3.qty += item.quantity; }
              else editPurchaseSummary.set(epkey3, { productId: item.productId, sellingType: 'units', qty: item.quantity, primaryBatchId: null });
            }
          }
        }
        // Write NET movements only — one per product in base units if quantity actually changed.
        // No movement if the quantity is identical (e.g. price-only edit), avoiding restore+reallocate noise.
        // All quantities are tracked in base units regardless of selling type.
        const netMoveMap = new Map<string, { productId: number; oldQty: number; newQty: number; primaryBatchId: number | null }>();
        for (const oldItem of existingItems) {
          if (oldItem.productId === null) continue;
          const st = oldItem.sellingType || 'units';
          const key = `${oldItem.productId}_units`;
          const pre = stockBeforeEdit7a.get(oldItem.productId);
          const qipOld = pre?.qip ?? 1;
          const uppOld = pre?.upp ?? 1;
          const baseOldQty = st === 'pallets' ? oldItem.quantity * qipOld * uppOld : oldItem.quantity;
          const entry = netMoveMap.get(key) ?? { productId: oldItem.productId, oldQty: 0, newQty: 0, primaryBatchId: null };
          entry.oldQty += baseOldQty;
          netMoveMap.set(key, entry);
        }
        for (const [key, epsum] of Array.from(editPurchaseSummary.entries())) {
          const entry = netMoveMap.get(key) ?? { productId: epsum.productId, oldQty: 0, newQty: 0, primaryBatchId: null };
          entry.newQty += epsum.qty;
          if (entry.primaryBatchId === null) entry.primaryBatchId = epsum.primaryBatchId;
          netMoveMap.set(key, entry);
        }
        for (const { productId: nmPid, oldQty, newQty, primaryBatchId: nmBid } of Array.from(netMoveMap.values())) {
          const net = newQty - oldQty; // positive = more allocated; negative = units returned
          if (net === 0) continue;
          const stockBefore7a = stockBeforeEdit7a.get(nmPid)?.units ?? 0;
          const [productNowNet] = await trx.select({ stock: products.stock }).from(products).where(eq(products.id, nmPid)).limit(1);
          const stockAfterNet = productNowNet?.stock ?? 0;
          if (net > 0) {
            await trx.insert(stockMovements).values({ productId: nmPid, wholesalerId, movementType: 'purchase', quantity: -net, unitType: 'units', stockBefore: stockBefore7a, stockAfter: stockAfterNet, reason: `Invoice edit — ${net} extra units allocated`, orderId: quoteId, customerName: existingOrder.customerName ?? null, businessProfileId: existingOrder.businessProfileId ?? null, batchId: nmBid });
          } else {
            const absNet = Math.abs(net);
            await trx.insert(stockMovements).values({ productId: nmPid, wholesalerId, movementType: 'return', quantity: absNet, unitType: 'units', stockBefore: stockBefore7a, stockAfter: stockAfterNet, reason: `Invoice edit — ${absNet} units returned`, orderId: quoteId, customerName: existingOrder.customerName ?? null, businessProfileId: existingOrder.businessProfileId ?? null });
          }
        }

        // 7d. Update order totals and payment link
        await trx.update(orders).set({
          subtotal: productSubtotal.toFixed(2),
          platformFee: platformFee.toFixed(2),
          customerTransactionFee: customerTransactionFee.toFixed(2),
          feePercentageUsed: isOfflineEdit ? '0.0000' : feeConfigEdit.percentage.toFixed(4),
          fixedFeeUsed: isOfflineEdit ? '0.00' : feeConfigEdit.fixed.toFixed(2),
          vatAmount: editVatAmount.toFixed(2),
          ...(editVatRateApplied !== null ? { vatRateApplied: editVatRateApplied.toFixed(4) } : { vatRateApplied: null }),
          total: total.toFixed(2),
          amountOutstanding: newAmountOutstanding.toFixed(2),
          stripePaymentLinkId: newPaymentLinkId || null,
          stripePaymentLinkUrl: newPaymentLinkUrl || null,
          notes: updatedNotes,
          lastEditedAt: new Date(),
          updatedAt: new Date(),
          ...(newPaymentMethod !== undefined ? { paymentMethod: newPaymentMethod } : {}),
        }).where(eq(orders.id, quoteId));
      });

      // ── Log quote edit activity (non-blocking, after successful transaction) ─
      (async () => {
        try {
          // Resolve product names for human-readable log entries
          const allProductIds = Array.from(new Set([
            ...existingItems.map(i => i.productId).filter((id): id is number => id !== null),
            ...items.map(i => i.productId),
          ]));
          const productRows = allProductIds.length > 0
            ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, allProductIds))
            : [];
          const productNameMap = new Map<number, string>(productRows.map(p => [p.id, p.name]));
          const pName = (id: number) => productNameMap.get(id) ?? `Product #${id}`;

          // No-op check: only write total/stock entries when values actually changed
          const oldTotal = parseFloat(existingOrder.total || '0');
          const oldSubtotal = parseFloat(existingOrder.subtotal || '0');
          const totalChanged = Math.abs(oldTotal - total) > 0.001 || Math.abs(oldSubtotal - productSubtotal) > 0.001;

          if (totalChanged) {
            logQuoteActivity({
              quoteId: quoteId,
              actionType: 'total_updated',
              entityType: 'quote',
              oldValue: { total: existingOrder.total, subtotal: existingOrder.subtotal },
              newValue: { total: total.toFixed(2), subtotal: productSubtotal.toFixed(2) },
              description: `Invoice edited — total updated from £${fmtGBP(oldTotal)} to £${fmtGBP(total)}`,
              performedBy: req.user.id,
            });
            logQuoteActivity({
              quoteId: quoteId,
              actionType: 'stock_restored',
              entityType: 'system',
              description: `Stock restored for ${existingItems.length} item${existingItems.length !== 1 ? 's' : ''} during invoice edit`,
              performedBy: 'system',
            });
          }

          // Per-item diff logs
          for (const oldItem of existingItems) {
            if (oldItem.productId === null) continue;
            const sellingTypeOld = oldItem.sellingType || 'units';
            const inNew = items.find((ni) => ni.productId === oldItem.productId && (ni.sellingType || 'units') === sellingTypeOld);
            if (!inNew) {
              logQuoteActivity({
                quoteId: quoteId,
                actionType: 'product_removed',
                entityType: 'product',
                entityId: String(oldItem.productId),
                oldValue: { quantity: oldItem.quantity, unitPrice: oldItem.unitPrice, sellingType: sellingTypeOld },
                description: `${pName(oldItem.productId)} removed (${oldItem.quantity} ${sellingTypeOld})`,
                performedBy: req.user.id,
              });
            }
          }
          for (const newItem of items) {
            const sellingTypeNew = newItem.sellingType || 'units';
            const inOld = existingItems.find((oi) => oi.productId === newItem.productId && (oi.sellingType || 'units') === sellingTypeNew);
            if (!inOld) {
              logQuoteActivity({
                quoteId: quoteId,
                actionType: 'product_added',
                entityType: 'product',
                entityId: String(newItem.productId),
                newValue: { quantity: newItem.quantity, unitPrice: newItem.customPrice, sellingType: sellingTypeNew },
                description: `${pName(newItem.productId)} added — ${newItem.quantity} ${sellingTypeNew} @ £${fmtGBP(newItem.customPrice)}`,
                performedBy: req.user.id,
              });
            } else {
              if (inOld.quantity !== newItem.quantity) {
                logQuoteActivity({
                  quoteId: quoteId,
                  actionType: 'quantity_changed',
                  entityType: 'product',
                  entityId: String(newItem.productId),
                  oldValue: { quantity: inOld.quantity },
                  newValue: { quantity: newItem.quantity },
                  description: `${pName(newItem.productId)} quantity changed: ${inOld.quantity} → ${newItem.quantity} ${sellingTypeNew}`,
                  performedBy: req.user.id,
                });
              }
              if (Math.abs(parseFloat(inOld.unitPrice || '0') - newItem.customPrice) > 0.001) {
                logQuoteActivity({
                  quoteId: quoteId,
                  actionType: 'price_changed',
                  entityType: 'product',
                  entityId: String(newItem.productId),
                  oldValue: { unitPrice: inOld.unitPrice },
                  newValue: { unitPrice: newItem.customPrice },
                  description: `${pName(newItem.productId)} price changed: £${fmtGBP(parseFloat(inOld.unitPrice || '0'))} → £${fmtGBP(newItem.customPrice)}`,
                  performedBy: req.user.id,
                });
              }
            }
          }
        } catch (activityErr: any) {
          console.warn('[quote-activity] Error building activity log entries (non-fatal):', activityErr?.message);
        }
      })();

      // ── Step 8: Expire old Stripe session AFTER successful DB commit ───────
      // Non-critical: failure here doesn't affect data integrity.
      // Always expire old session if it differs from new one (or if no new one created — meaning no payment needed).
      if (oldStripeSessionId && oldStripeSessionId !== newPaymentLinkId) {
        try {
          await stripe.checkout.sessions.expire(oldStripeSessionId);
        } catch (expireErr: any) {
          console.warn(`⚠️ Could not expire old Stripe session ${oldStripeSessionId}: ${expireErr.message}`);
        }
      }

      // ── Step 9: Notify customer by email if a new Stripe session was created ─
      if (needsNewStripeSession && customerForEmail?.email && newPaymentLinkUrl) {
        try {
          const changeSummary = changeList.length > 0
            ? changeList.map(c => `<li style="margin:4px 0">${c}</li>`).join('')
            : '<li style="margin:4px 0">Invoice items reviewed — no line-item changes</li>';
          const branding = { businessName: wholesaler.businessName || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl, wholesaler.updatedAt) };
          const emailBody = [
            emailHeading('Your Invoice Has Been Updated', { size: '22px', color: '#10b981' }),
            `<p style="margin:0 0 4px">Order <b>${existingOrder.orderNumber}</b></p>`,
            `<p style="margin:0 0 16px;font-size:14px;color:#6b7280">${formatDateTime(new Date())}</p>`,
            emailCard(
              `<p style="margin:0 0 8px"><b>${wholesaler.businessName || 'Your wholesaler'}</b> has updated your invoice.</p>` +
              `<p style="margin:0 0 4px"><b>Changes:</b></p><ul style="margin:4px 0 8px;padding-left:20px">${changeSummary}</ul>` +
              `<p style="margin:8px 0 0"><b>New total: £${total.toFixed(2)}</b></p>`,
              { borderColor: '#dbeafe', bgColor: '#eff6ff' }
            ),
            `<p style="margin:16px 0 8px">A new payment link has been created for you. Please use the link below to complete your payment — your previous link is no longer valid.</p>`,
            emailButton('Pay Now', newPaymentLinkUrl, '#059669'),
          ].join('');
          const html = wrapCustomerEmail(emailBody, branding, { preheader: `Your invoice ${existingOrder.orderNumber} has been updated — new total: £${total.toFixed(2)}` });
          await sendEmail({
            to: customerForEmail.email,
            from: 'hello@quikpik.co',
            subject: `Your invoice ${existingOrder.orderNumber} has been updated`,
            html,
          });
        } catch (emailErr: any) {
          console.warn(`⚠️ Failed to send quote update email to customer: ${emailErr.message}`);
        }
      }

      const updatedOrder = await storage.getOrder(quoteId);
      res.json({
        success: true,
        orderId: quoteId,
        orderNumber: existingOrder.orderNumber,
        total: total.toFixed(2),
        paymentLink: newPaymentLinkUrl,
        order: updatedOrder,
        // Signals to the frontend that no payment link was generated because
        // the wholesaler's Stripe Connect account is not yet fully active.
        connectNotReady: !editConnectReady && !isOfflineEdit && existingOrder.paymentStatus !== 'paid' && newAmountOutstanding > 0,
        ...(restoredProductWarnings.length > 0 ? { warnings: restoredProductWarnings } : {}),
      });
    } catch (error: any) {
      if (error?.code === 'OUT_OF_STOCK') {
        console.warn(`⚠️ Quote edit stock race: ${error.message}`);
        return res.status(400).json({ error: error.message, errorType: 'OUT_OF_STOCK', productName: error.productName, available: error.available, requested: error.requested });
      }
      console.error('❌ Error updating quote:', error);
      res.status(500).json({ error: 'Failed to update invoice' });
    }
  });

  // GET /api/quotes/:id — fetch a single quote by ID (wholesaler only)
  app.get('/api/quotes/:id', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);

      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) return res.status(400).json({ error: 'Invalid invoice ID' });

      const order = await storage.getOrder(quoteId);
      if (!order) return res.status(404).json({ error: 'Invoice not found' });
      if (!order.isQuote) return res.status(404).json({ error: 'Invoice not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Access denied' });

      const wholesaler = await storage.getUser(wholesalerId);
      const effectiveWholesaler = wholesaler
        ? await resolveInvoiceWholesaler(order, wholesaler)
        : null;

      res.json({
        ...order,
        vatEnabled: effectiveWholesaler?.vatEnabled ?? false,
        vatRate: effectiveWholesaler?.vatRate ?? '0.2000',
      });
    } catch (error) {
      console.error(`❌ Error fetching quote ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to fetch invoice details' });
    }
  });

  // GET /api/quotes/:id/activity — paginated activity log for a quote (wholesaler only)
  app.get('/api/quotes/:id/activity', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = resolveWholesalerId(req);

      const quoteId = parseInt(req.params.id);
      if (isNaN(quoteId)) return res.status(400).json({ error: 'Invalid invoice ID' });

      const [quote] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders)
        .where(eq(orders.id, quoteId))
        .limit(1);

      if (!quote) return res.status(404).json({ error: 'Invoice not found' });
      if (quote.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Not authorised' });

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = 20;

      const logs = await db
        .select()
        .from(quoteActivityLogs)
        .where(eq(quoteActivityLogs.quoteId, quoteId))
        .orderBy(desc(quoteActivityLogs.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      // Resolve performedBy user IDs to display names
      const actorIds = [...new Set(
        logs.map(l => l.performedBy).filter((p): p is string => !!p && p !== 'system' && p !== 'checkout')
      )];
      const nameMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const [memberRows, userRows] = await Promise.all([
          db.select({ id: teamMembers.id, firstName: teamMembers.firstName, lastName: teamMembers.lastName })
            .from(teamMembers)
            .where(inArray(teamMembers.id, actorIds.map(Number).filter(n => !isNaN(n)))),
          db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, actorIds)),
        ]);
        for (const m of memberRows) {
          const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
          if (name) nameMap.set(String(m.id), name);
        }
        for (const u of userRows) {
          if (!nameMap.has(u.id)) {
            const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
            if (name) nameMap.set(u.id, name);
          }
        }
      }

      const enrichedLogs = logs.map(l => ({
        ...l,
        actorName: (l.performedBy && l.performedBy !== 'system' && l.performedBy !== 'checkout')
          ? (nameMap.get(l.performedBy) ?? null)
          : null,
      }));

      res.json({ logs: enrichedLogs, page, hasMore: logs.length === limit });
    } catch (error) {
      console.error('❌ Error fetching quote activity:', error);
      res.status(500).json({ error: 'Failed to fetch invoice activity' });
    }
  });
}
