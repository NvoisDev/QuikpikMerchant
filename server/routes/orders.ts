import type { Express } from "express";
import crypto from "crypto";

/**
 * Derive a stable, time-bucketed idempotency fingerprint for an order creation request.
 *
 * Including `timeBucket` (floor of Unix seconds / 60) means the key changes every
 * 60 seconds, so a customer who legitimately re-orders the same items later will
 * always get a fresh order.  Only requests that arrive within the same 60-second
 * bucket — e.g. network retries, double-taps — will resolve to the same key.
 */
function computeOrderFingerprint(
  userId: string,
  wholesalerId: string,
  items: Array<{ productId: number; quantity: number; sellingType?: string }>,
  deliveryAddress?: string | null,
  notes?: string | null,
  collectionAddressId?: number | null,
  timeBucket?: number
): string {
  const bucket = timeBucket ?? Math.floor(Date.now() / 60_000);
  const sortedItems = [...items]
    .sort((a, b) =>
      a.productId - b.productId ||
      a.quantity - b.quantity ||
      (a.sellingType ?? 'units').localeCompare(b.sellingType ?? 'units'))
    .map(i => `${i.productId}:${i.quantity}:${i.sellingType ?? 'units'}`)
    .join('|');
  const raw = [
    userId,
    wholesalerId,
    sortedItems,
    deliveryAddress ?? '',
    notes ?? '',
    collectionAddressId ?? '',
    bucket,
  ].join('\x00');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

import { calculateCustomerFee } from "../../shared/utils/fees";
import { getCurrentFeeConfig } from "../utils/fee-config";
import { parseCustomerCookie } from "../utils/customer-auth-cookie";
import { formatDateTime } from "../../shared/utils/date";
import { calculateOfflinePaymentUpdate } from "./order-payment-calculations";
import { isImpersonating } from "../utils/isImpersonating";
import {
  SendGridAttachment, and, buildInvoicePdf, buildItemisedRefundEmail, campaignOrders, count,
  createStripeRefundReceipt, db, desc, emailBadge, emailButton, emailCard, emailHeading, eq,
  formatPackDescriptor, generateOrderNumber, generateReadyForCollectionEmail, getCurrencySymbol, getEmailLogoUrl,
  inArray, insertOrderSchema, lt, multer, or, orderCancellationRequests, orderItems,
  orderNotificationService, orderPhotoUpload, orders, products,
  refundAcrossPaymentIntents, requireAuth, requireMemberPermission, requireNotViewer, sendCustomerInvoiceEmail, sendEmail,
  sendRefundReceipt, sendWhatsAppMessage, sgMail, sql, stockMovements, storage, sum,
  getStripeClient, isLiveMode,
  wrapCustomerEmail, z, cancellationRefundTypeToEmailStatus, getWholesalerFeeRate, MailDataRequired,
  sendOrderStatusNotification,
} from "./shared";
import { productBatches, businessProfiles } from "@shared/schema";
import type { CancellationRefundType } from "./shared";
import { logQuoteActivity } from "../utils/quote-activity";
import { isConnectAccountReady } from "../utils/stripe-connect-ready";
import { RefundLineItem } from "../email-templates";
import { sendCancellationNotification } from "../services/orderCancellationNotificationService";

/**
 * Batch-aware unit stock restock helper.
 * - If the order item recorded a batchId: adds quantity back to the original batch
 *   (re-activates it if depleted).  If the batch no longer exists, creates a new
 *   "RETURN-<orderNumber>" batch so stock is never lost.
 * - If no batchId was recorded (pre-batch orders): falls back to the flat counter.
 */
async function restockUnitsToOrigin(
  batchId: number | null,
  productId: number,
  qty: number,
  wholesalerId: string,
  orderId: number,
  orderNumber: string,
  businessProfileId?: number | null
): Promise<void> {
  if (batchId) {
    try {
      const [existingBatch] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, batchId));

      if (existingBatch && existingBatch.productId === productId) {
        // Restore to original batch — adjustBatchQuantity re-activates depleted batches
        // and syncs product.stock automatically
        await storage.adjustBatchQuantity(
          batchId,
          qty,
          `Order cancellation return — ${qty} units restored to batch ${existingBatch.batchNumber || batchId}`,
          wholesalerId,
          orderId,
          businessProfileId ?? null
        );
        return;
      }
    } catch {
      // Batch lookup failed — fall through to create a new batch
    }

    // Original batch not found / mismatched — create a return batch
    await storage.createProductBatch(
      {
        productId,
        batchNumber: `RETURN-${orderNumber}`,
        quantity: qty,
        status: 'active',
        notes: `Return restock from order ${orderNumber}`,
      },
      wholesalerId,
      {
        orderId,
        businessProfileId: businessProfileId ?? null,
        movementType: 'return',
        reason: `Order cancellation return — ${qty} units restocked (new batch, original batch not found)`,
      }
    );
    return;
  }

  // No batch tracking on this order item (legacy) — flat counter update
  const product = await storage.getProduct(productId);
  if (!product) return;
  const stockBefore = product.stock;
  const stockAfter = stockBefore + qty;
  await storage.updateProductStock(productId, stockAfter);
  await db.insert(stockMovements).values({
    productId,
    wholesalerId,
    movementType: 'return',
    quantity: qty,
    unitType: 'units',
    stockBefore,
    stockAfter,
    reason: `Order cancellation — ${qty} units returned`,
    orderId,
    businessProfileId: businessProfileId ?? null,
  });
}

async function resolveInvoiceWholesaler(order: any, wholesaler: any): Promise<any> {
  if (!order.businessProfileId) return wholesaler;
  const profile = await storage.getBusinessProfile(order.businessProfileId);
  if (!profile || profile.wholesalerId !== order.wholesalerId) return wholesaler;
  return {
    ...wholesaler,
    businessName: profile.name,
    ...(profile.address ? { businessAddress: profile.address, city: null, postalCode: null, country: null } : {}),
    ...(profile.logoUrl ? { logoUrl: profile.logoUrl, logoType: null } : {}),
  };
}

export function registerOrderRoutes(app: Express): void {
  // PUT /api/orders/:orderId/change-delivery-address
  app.put('/api/orders/:orderId/change-delivery-address', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deliveryAddressId } = req.body;
      
      // Get customer from session or fallback auth
      let customerAuth = req.session?.customerAuth;
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId } as unknown as typeof customerAuth;
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify order exists and belongs to customer
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Check if customer owns this order (multiple ways to check due to historical data)
      const customerOwnsOrder = order.retailerId === customerAuth.customerId || 
                               order.customerPhone === (await storage.getUser(customerAuth.customerId))?.phoneNumber;
      
      if (!customerOwnsOrder) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Check if order can be modified (only pending/confirmed orders)
      const changeableStatuses = ['pending', 'confirmed', 'processing'];
      if (!changeableStatuses.includes(order.status)) {
        return res.status(400).json({ 
          error: "Address cannot be changed", 
          message: `Orders with status '${order.status}' cannot be modified` 
        });
      }
      
      // Verify the new address belongs to the customer
      const newAddress = await storage.getDeliveryAddress(parseInt(deliveryAddressId));
      if (!newAddress || newAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      // Format the new address as a string for the delivery_address field
      const formattedAddress = [
        newAddress.addressLine1,
        newAddress.addressLine2,
        newAddress.city,
        newAddress.state,
        newAddress.postalCode,
        newAddress.country
      ].filter(Boolean).join(', ');
      
      // Update the order with new address
      await storage.updateOrderDeliveryAddress(parseInt(orderId), parseInt(deliveryAddressId), formattedAddress);
      
      res.json({ 
        success: true, 
        message: "Delivery address updated successfully",
        newAddress: newAddress
      });
    } catch (error) {
      console.error("❌ Error changing order delivery address:", error);
      res.status(500).json({ error: "Failed to change delivery address" });
    }
  });

  // PUT /api/orders/:id/ready-for-collection
  app.put('/api/orders/:id/ready-for-collection', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      // Get order directly by ID for efficiency
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Fetch order directly from database
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the order belongs to this wholesaler
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: 'You do not have permission to modify this order' });
      }

      // Allow transition from 'paid' or 'items_prepared' status directly to ready_for_collection
      // Also allow if paymentStatus is 'paid' (for orders where balance was paid but status wasn't updated)
      // Also always allow collection/pickup orders — customer pays on arrival
      const isPaymentComplete = order.paymentStatus === 'paid' || parseFloat(order.amountOutstanding || '0') <= 0.01;
      const isValidStatus = order.status === 'paid' || order.status === 'items_prepared' || order.status === 'confirmed';
      const isPickup = order.fulfillmentType === 'pickup';
      
      if (!isValidStatus && !isPaymentComplete && !isPickup) {
        return res.status(400).json({ error: `Order must be paid to mark as ready. Current status: ${order.status}, payment: ${order.paymentStatus}` });
      }
      
      // If payment is complete but status wasn't updated, log it for debugging
      if (isPaymentComplete && order.status !== 'paid') {
      }

      // Check if already marked as ready
      if (order.readyToCollectAt) {
        return res.status(400).json({ error: 'Order is already marked as ready for collection' });
      }

      const actionType = order.fulfillmentType === 'pickup' ? 'collection' : 'delivery';

      // Update order with ready for collection timestamp
      const updated = await storage.markOrderReadyForCollection(orderId);
      if (!updated) {
        return res.status(500).json({ error: 'Failed to mark order as ready for collection' });
      }

      // Send email notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler && customer.email) {
          // Resolve collection address (linked → default → legacy fallback)
          let emailCollAddr: string | undefined = wholesaler.businessAddress || undefined;
          let emailCollAddrName: string | undefined;
          if (updated.fulfillmentType !== 'delivery') {
            try {
              if (updated.collectionAddressId) {
                const ca = await storage.getCollectionAddress(updated.collectionAddressId);
                if (ca) {
                  emailCollAddrName = ca.name;
                  emailCollAddr = [ca.addressLine1, ca.addressLine2, [ca.city, ca.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                }
              }
              if (!emailCollAddrName) {
                const addrs = await storage.getCollectionAddresses(updated.wholesalerId);
                const def = addrs.find((a: any) => a.isDefault && a.isActive !== false);
                if (def) {
                  emailCollAddrName = def.name;
                  emailCollAddr = [def.addressLine1, def.addressLine2, [def.city, def.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                }
              }
              if (!emailCollAddr) {
                emailCollAddr = wholesaler.pickupAddress || wholesaler.businessAddress || undefined;
              }
            } catch (e) {
              console.warn('[orders] collection address lookup failed:', e instanceof Error ? e.message : e);
            }
          }
          const emailData = generateReadyForCollectionEmail({
            orderNumber: updated.orderNumber,
            customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.businessName || 'Customer',
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim(),
            businessPhone: (wholesaler.businessPhone || wholesaler.phoneNumber) ?? undefined,
            businessAddress: emailCollAddr,
            collectionAddressName: emailCollAddrName,
            deliveryAddress: updated.deliveryAddress || null,
            fulfillmentType: updated.fulfillmentType || 'pickup',
            orderTotal: updated.total,
            readyTime: updated.readyToCollectAt ? formatDateTime(updated.readyToCollectAt) : formatDateTime(new Date()),
            orderUrl: `https://quikpik.app/store/${wholesaler.id}?tab=orders`
          });

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text
          });
          
        }
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : String(emailError);
        console.warn(`[sendgrid] ready-for-collection email failed: ${msg}`);
      }

      // Send SMS notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler && customer.phoneNumber) {
          const actionType = updated.fulfillmentType === 'pickup' ? 'collection' : 'delivery';
          // Resolve collection address: prefer linked address → wholesaler default → pickupAddress → businessAddress
          let collectionAddress = '';
          if (updated.collectionAddressId) {
            try {
              const caRow = await storage.getCollectionAddress(updated.collectionAddressId);
              if (caRow) {
                const parts = [caRow.name, caRow.addressLine1, caRow.addressLine2, caRow.city, caRow.postcode].filter(Boolean);
                collectionAddress = parts.join(', ');
              }
            } catch (caErr) {
              console.warn('⚠️ Could not fetch linked collection address for SMS:', caErr);
            }
          }
          if (!collectionAddress) {
            // No explicit selection — try wholesaler's default collection address
            try {
              const wholesalerAddrs = await storage.getCollectionAddresses(updated.wholesalerId);
              const defaultAddr = wholesalerAddrs.find((a: { isDefault: boolean; isActive?: boolean }) => a.isDefault && a.isActive !== false)
                ?? wholesalerAddrs.find((a: { isActive?: boolean }) => a.isActive !== false);
              if (defaultAddr) {
                const parts = [defaultAddr.name, defaultAddr.addressLine1, defaultAddr.addressLine2, defaultAddr.city, defaultAddr.postcode].filter(Boolean);
                collectionAddress = parts.join(', ');
              }
            } catch (caErr) {
              console.warn('⚠️ Could not fetch default collection address for SMS:', caErr);
            }
          }
          if (!collectionAddress) {
            collectionAddress = wholesaler.pickupAddress || wholesaler.businessAddress ||
              (wholesaler.streetAddress && wholesaler.city
                ? `${wholesaler.streetAddress}, ${wholesaler.city}${wholesaler.postalCode ? `, ${wholesaler.postalCode}` : ''}`
                : '');
          }
          
          // Build order items list for SMS (getOrderItems already includes product data)
          let itemsList = '';
          try {
            const orderItemsList = await storage.getOrderItems(updated.id);
            const itemsListParts: string[] = [];
            for (const item of orderItemsList) {
              const productName = item.product?.name || `Product #${item.productId}`;
              const total = parseFloat(item.total || '0');
              const unitPrice = parseFloat(item.unitPrice || '0');
              const sellingType = item.sellingType || 'units';
              const promoNote = item.appliedOfferLabel ? ` (${item.appliedOfferLabel})` : '';
              const freeNote = (item.freeItems || 0) > 0 ? ` +${item.freeItems} free` : '';
              const pq = item.product?.quantityInPack; const pu = item.product?.unitSize; const pm = item.product?.unitOfMeasure;
              const packNote = (pq && pq > 1 && pu && pm) ? ` [${pq}×${parseFloat(String(pu))}${pm}]` : '';
              itemsListParts.push(`• ${productName}${packNote} - ${item.quantity} ${sellingType} × £${unitPrice.toFixed(2)} = £${total.toFixed(2)}${promoNote}${freeNote}`);
            }
            itemsList = itemsListParts.length > 0 ? `\n\n📦 Items:\n${itemsListParts.join('\n')}` : '';
          } catch (itemsError) {
            console.error('⚠️ Could not fetch order items for SMS:', itemsError);
          }
          
          const smsMessage = actionType === 'collection'
            ? `🎉 Great news! Your order #${updated.orderNumber} from ${wholesaler.businessName || 'your supplier'} is ready for collection!${itemsList}\n\n📍 Collection Address:\n${collectionAddress || 'Please contact the store for address'}\n\n💰 Order Total: £${parseFloat(updated.total || '0').toFixed(2)}\n\n📞 Questions? Contact: ${wholesaler.businessPhone || wholesaler.phoneNumber || 'N/A'}\n\n- Quikpik`
            : `🎉 Great news! Your order #${updated.orderNumber} from ${wholesaler.businessName || 'your supplier'} is ready for delivery!${itemsList}\n\n💰 Order Total: £${parseFloat(updated.total || '0').toFixed(2)}\n\nThe supplier will contact you to arrange delivery.\n\n📞 Contact: ${wholesaler.businessPhone || wholesaler.phoneNumber || 'N/A'}\n\n- Quikpik`;
          
          await sendWhatsAppMessage({
            to: customer.phoneNumber,
            message: smsMessage
          });
        }
      } catch (smsError) {
        const msg = smsError instanceof Error ? smsError.message : String(smsError);
        console.warn(`[twilio] ready-for-collection WhatsApp failed [orderId=${orderId}]: ${msg}`);
      }

      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("❌ Error marking order as ready for collection:", error);
      res.status(500).json({ error: "Failed to mark order as ready for collection" });
    }
  });

  // POST /api/orders/:id/resend-ready-notification
  app.post("/api/orders/:id/resend-ready-notification", requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user!.id;

      // Get order details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Check if order is actually ready for collection
      if (order.status !== 'ready_for_collection' || !order.readyToCollectAt) {
        return res.status(400).json({ error: 'Order is not ready for collection' });
      }

      // Send email notification to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer && wholesaler && customer.email) {
          // Resolve collection address (linked → default → legacy fallback)
          let resendCollAddr: string | undefined = wholesaler.businessAddress || undefined;
          let resendCollAddrName: string | undefined;
          if (order.fulfillmentType !== 'delivery') {
            try {
              if (order.collectionAddressId) {
                const ca = await storage.getCollectionAddress(order.collectionAddressId);
                if (ca) {
                  resendCollAddrName = ca.name;
                  resendCollAddr = [ca.addressLine1, ca.addressLine2, [ca.city, ca.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                }
              }
              if (!resendCollAddrName) {
                const addrs = await storage.getCollectionAddresses(order.wholesalerId);
                const def = addrs.find((a: any) => a.isDefault && a.isActive !== false);
                if (def) {
                  resendCollAddrName = def.name;
                  resendCollAddr = [def.addressLine1, def.addressLine2, [def.city, def.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                }
              }
              if (!resendCollAddr) {
                resendCollAddr = wholesaler.pickupAddress || wholesaler.businessAddress || undefined;
              }
            } catch (e) {
              console.warn('[orders] collection address lookup failed (resend):', e instanceof Error ? e.message : e);
            }
          }
          const emailData = generateReadyForCollectionEmail({
            orderNumber: order.orderNumber,
            customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.businessName || 'Customer',
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim(),
            businessPhone: (wholesaler.businessPhone || wholesaler.phoneNumber) ?? undefined,
            businessAddress: resendCollAddr,
            collectionAddressName: resendCollAddrName,
            deliveryAddress: order.deliveryAddress || null,
            fulfillmentType: order.fulfillmentType || 'pickup',
            orderTotal: order.total,
            readyTime: formatDateTime(order.readyToCollectAt),
            orderUrl: `https://quikpik.app/store/${wholesaler.id}?tab=orders`
          });

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text
          });
          
        }
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : String(emailError);
        console.warn(`[sendgrid] resend ready-for-collection email failed: ${msg}`);
        return res.status(500).json({ error: 'Failed to send notification email' });
      }

      res.json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
      console.error("❌ Error resending ready for collection notification:", error);
      res.status(500).json({ error: "Failed to resend notification" });
    }
  });

  // POST /api/orders/:id/mark-as-paid
  app.post('/api/orders/:id/mark-as-paid', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

      const { amount, method, note } = req.body;
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Not authorised' });
      if (order.paymentStatus === 'paid') return res.status(400).json({ error: 'Order is already fully paid' });

      const paymentUpdate = calculateOfflinePaymentUpdate(order, parsedAmount, method);

      if (parsedAmount > paymentUpdate.currentOutstanding + 0.01) {
        return res.status(400).json({ error: `Amount (£${parsedAmount.toFixed(2)}) exceeds outstanding balance (£${paymentUpdate.currentOutstanding.toFixed(2)})` });
      }

      const updateData: Record<string, any> = {
        amountPaid: paymentUpdate.newAmountPaid.toFixed(2),
        amountOutstanding: paymentUpdate.newAmountOutstanding.toFixed(2),
        paymentStatus: paymentUpdate.newPaymentStatus,
      };

      if (paymentUpdate.shouldUpdatePaymentMethod) updateData.paymentMethod = method;

      // Clear platform fees for offline payments — they were never collected via Stripe
      const OFFLINE_METHODS = ['cash', 'bank_transfer', 'cheque', 'pay_later', 'other'];
      if (OFFLINE_METHODS.includes(method)) {
        updateData.platformFee = '0.00';
        updateData.customerTransactionFee = '0.00';
        const subtotal = parseFloat(order.subtotal || '0');
        const delivery = parseFloat(order.deliveryCost || '0');
        const vatAmount = parseFloat(order.vatAmount || '0');
        updateData.total = (subtotal + vatAmount + delivery).toFixed(2);
      }

      if (paymentUpdate.newPaymentStatus === 'paid' && order.status === 'confirmed') {
        updateData.status = 'paid';
      }

      // Task 3: Expire Stripe checkout session when offline payment fully pays the order
      // Always clear link fields on full offline payment regardless of Stripe SDK availability
      if (paymentUpdate.newPaymentStatus === 'paid' && method !== 'payment_link' && order.stripePaymentLinkId) {
        updateData.stripePaymentLinkUrl = null;
        updateData.stripePaymentLinkId = null;
          try {
            await stripe.checkout.sessions.expire(order.stripePaymentLinkId);
          } catch (stripeErr) {
            // Best-effort — session may already be used or expired
            console.warn(`⚠️ Could not expire Stripe session for order ${order.orderNumber}:`, stripeErr);
          }
      }

      await db.update(orders).set(updateData).where(eq(orders.id, orderId));

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

      // Task 4: Send payment notifications to customer and wholesaler (best-effort)
      try {
        const [customer, wholesaler] = await Promise.all([
          storage.getUser(order.retailerId),
          storage.getUser(order.wholesalerId),
        ]);

        if (customer && wholesaler) {
          const currencySymbol = getCurrencySymbol(wholesaler.preferredCurrency || 'GBP');
          const businessName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Supplier';
          const customerName = customer.firstName || customer.businessName || 'there';
          const subtotalBase = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
          const netAmount = subtotalBase; // Offline = full subtotal, no platform fee
          const paidSoFar = paymentUpdate.newAmountPaid;
          const outstanding = paymentUpdate.newAmountOutstanding;
          const methodLabel: Record<string, string> = {
            cash: 'Cash', bank_transfer: 'Bank Transfer', card: 'Card', cheque: 'Cheque',
            pay_later: 'Pay Later', other: 'Other',
          };
          const methodText = methodLabel[method || ''] || 'offline payment';
          const isPaidInFull = paymentUpdate.newPaymentStatus === 'paid';

          // Customer email
          if (customer.email) {
            try {
              const custEmailBody =
                emailHeading('Payment Received', { size: '22px', color: '#10b981' }) +
                `<p style="margin:0 0 16px">Hi ${customerName}, ${businessName} has recorded a payment for order <strong>${order.orderNumber}</strong>.</p>` +
                emailCard(
                  `<p style="margin:0 0 4px"><b>Amount received:</b> ${currencySymbol}${parsedAmount.toFixed(2)}</p>` +
                  `<p style="margin:0 0 4px"><b>Method:</b> ${methodText}</p>` +
                  `<p style="margin:0 0 4px"><b>Total paid:</b> ${currencySymbol}${paidSoFar.toFixed(2)}</p>` +
                  (outstanding > 0.01
                    ? `<p style="margin:0"><b>Outstanding balance:</b> <span style="color:#dc2626">${currencySymbol}${outstanding.toFixed(2)}</span></p>`
                    : `<p style="margin:0">${emailBadge('Fully Paid', '#10b981')}</p>`),
                  { borderColor: '#a7f3d0', bgColor: '#f0fdf4' }
                ) +
                (note ? emailCard(`<p style="margin:0;color:#6b7280"><b>Note:</b> ${note}</p>`) : '') +
                (outstanding > 0.01
                  ? `<p style="margin:16px 0;font-size:14px;color:#6b7280">Please arrange your remaining balance of ${currencySymbol}${outstanding.toFixed(2)} with ${businessName}.</p>`
                  : `<p style="margin:16px 0;font-size:14px;color:#6b7280">Thank you — your order is now fully paid!</p>`);

              await sendEmail({
                to: customer.email,
                subject: `Payment Received — Order ${order.orderNumber}`,
                html: wrapCustomerEmail(custEmailBody, {
                  businessName,
                  logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl),
                }, { preheader: `${currencySymbol}${parsedAmount.toFixed(2)} payment recorded for order ${order.orderNumber}` }),
                from: `${businessName} via Quikpik <hello@quikpik.co>`,
              });
            } catch (emailErr) {
              const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
              console.warn(`[sendgrid] customer-payment-received email failed [orderId=${order.id}]: ${msg}`);
            }
          }

          // Customer SMS
          if (customer.phoneNumber) {
            try {
              const smsMsg = isPaidInFull
                ? `Hi ${customerName}! ${businessName} has received your payment of ${currencySymbol}${parsedAmount.toFixed(2)} for order ${order.orderNumber}. Your order is now fully paid. Thank you!`
                : `Hi ${customerName}! ${businessName} has received a payment of ${currencySymbol}${parsedAmount.toFixed(2)} for order ${order.orderNumber}. Outstanding balance: ${currencySymbol}${outstanding.toFixed(2)}.`;
              await sendWhatsAppMessage({ to: customer.phoneNumber, message: smsMsg });
            } catch (smsErr) {
              const msg = smsErr instanceof Error ? smsErr.message : String(smsErr);
              console.warn(`[twilio] customer-payment-received WhatsApp failed [orderId=${order.id}]: ${msg}`);
            }
          }

          // Wholesaler email
          if (wholesaler.email) {
            try {
              const wholesalerBody =
                emailHeading('Payment Recorded', { size: '22px', color: '#10b981' }) +
                `<p style="margin:0 0 16px">A payment has been recorded for order <strong>${order.orderNumber}</strong> (${order.customerName || customerName}).</p>` +
                emailCard(
                  `<p style="margin:0 0 4px"><b>Amount received:</b> ${currencySymbol}${parsedAmount.toFixed(2)}</p>` +
                  `<p style="margin:0 0 4px"><b>Method:</b> ${methodText}</p>` +
                  `<p style="margin:0 0 4px"><b>Total paid:</b> ${currencySymbol}${paidSoFar.toFixed(2)}</p>` +
                  `<p style="margin:0 0 4px"><b>Your net amount:</b> <span style="color:#10b981;font-weight:bold">${currencySymbol}${netAmount.toFixed(2)}</span></p>` +
                  (outstanding > 0.01
                    ? `<p style="margin:0"><b>Outstanding balance:</b> <span style="color:#dc2626">${currencySymbol}${outstanding.toFixed(2)}</span></p>`
                    : `<p style="margin:0">${emailBadge('Fully Paid', '#10b981')}</p>`),
                  { borderColor: '#a7f3d0', bgColor: '#f0fdf4' }
                ) +
                (note ? emailCard(`<p style="margin:0;color:#6b7280"><b>Note:</b> ${note}</p>`) : '') +
                emailButton('View Order', `${process.env.APP_URL || 'https://quikpik.app'}/orders/${order.id}`);

              await sendEmail({
                to: wholesaler.email,
                subject: `Payment Recorded — Order ${order.orderNumber}`,
                html: wrapCustomerEmail(wholesalerBody, {
                  businessName,
                  logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl),
                }, { preheader: `${currencySymbol}${parsedAmount.toFixed(2)} recorded for order ${order.orderNumber}` }),
                from: `Quikpik <hello@quikpik.co>`,
              });
            } catch (emailErr) {
              const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
              console.warn(`[sendgrid] wholesaler-payment-received email failed [orderId=${order.id}]: ${msg}`);
            }
          }
        }
      } catch (notifyErr) {
        console.error('⚠️ Payment notification error (non-fatal):', notifyErr);
      }

      return res.json({ success: true, order: updatedOrder });
    } catch (error) {
      console.error('❌ mark-as-paid error:', error);
      return res.status(500).json({ error: 'Failed to record payment' });
    }
  });

  // PUT /api/orders/:id/items-prepared
  app.put("/api/orders/:id/items-prepared", requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user!.id;

      // Get order details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Check if order is in the right status
      if (order.status !== 'paid') {
        return res.status(400).json({ error: 'Order must be in paid status to mark items as prepared' });
      }

      // Update order status using storage method
      const updated = await storage.updateOrderStatus(orderId, 'items_prepared');
      if (!updated) {
        return res.status(500).json({ error: 'Failed to update order status' });
      }

      // Send notification to customer about items being prepared
      sendOrderStatusNotification({ orderId: updated.id, status: 'items_prepared' }).catch((err) => {
        console.error('❌ Failed to send items prepared notifications:', err);
      });

      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("❌ Error marking order items as prepared:", error);
      res.status(500).json({ error: "Failed to mark order items as prepared" });
    }
  });

  // GET /api/orders/pending-count — lightweight badge endpoint for the sidebar
  app.get('/api/orders/pending-count', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const result = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.wholesalerId, wholesalerId),
          sql`NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`
        ));

      res.json({ count: Number(result[0]?.count || 0) });
    } catch (error) {
      console.error("Error fetching pending order count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // GET /api/orders
  app.get('/api/orders', requireAuth, async (req: any, res) => {
    try {
      const search = req.query.search; // search term
      
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const orders = await storage.getOrders(wholesalerId, undefined, search);
      
      res.json(orders);
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace available');
      res.status(500).json({ 
        message: "Failed to fetch orders",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/orders/by-number/:orderNumber
  app.get('/api/orders/by-number/:orderNumber', async (req: any, res) => {
    try {
      const { orderNumber } = req.params;
      const { session_id } = req.query;

      // Session ID is required for security
      if (!session_id) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      // Validate Stripe session ID — use environment-aware fallback (test-account sessions
      // are created with the test client and are invisible to the live client)
      try {
        const primaryClient = getStripeClient(!isLiveMode());
        const secondaryClient = getStripeClient(isLiveMode());
        let session: any;
        try {
          session = await primaryClient.checkout.sessions.retrieve(session_id as string);
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.code === 'resource_missing') {
            session = await secondaryClient.checkout.sessions.retrieve(session_id as string);
          } else {
            throw e;
          }
        }
        // Verify the session's order number matches
        if (session.metadata?.orderNumber !== orderNumber) {
          return res.status(403).json({ error: 'Session does not match order' });
        }
        // Verify session is completed/paid
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          return res.status(403).json({ error: 'Payment not completed' });
        }
      } catch (stripeError) {
        console.error('Stripe session validation failed:', stripeError);
        return res.status(403).json({ error: 'Invalid session' });
      }
      
      const [order] = await db.select({
        orderNumber: orders.orderNumber,
        total: orders.total,
        amountPaid: orders.amountPaid,
        amountOutstanding: orders.amountOutstanding,
        paymentStatus: orders.paymentStatus,
      })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Error fetching order by number:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  // GET /api/orders/:id
  app.get('/api/orders/:id', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the user has access to this order (data isolation)
      const userId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      if (order.wholesalerId !== userId && order.retailerId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Fetch cancellation request for this order if exists
      const [cancellationRequest] = await db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.orderId, orderId))
        .orderBy(desc(orderCancellationRequests.requestedAt))
        .limit(1);

      res.json({
        ...order,
        vatEnabled: order.wholesaler?.vatEnabled ?? false,
        vatRate: order.wholesaler?.vatRate ?? '0.2000',
        cancellationRequest: cancellationRequest ? {
          id: cancellationRequest.id,
          status: cancellationRequest.status,
          reasonCategory: cancellationRequest.reasonCategory,
          reasonNotes: cancellationRequest.reasonNotes,
          requestedAt: cancellationRequest.requestedAt,
          respondedAt: cancellationRequest.respondedAt,
          responseMessage: cancellationRequest.responseMessage,
          refundType: cancellationRequest.refundType
        } : null
      });
    } catch (error) {
      console.error(`❌ Error fetching order ${req.params.id}:`, error);
      res.status(500).json({ 
        message: "Failed to fetch order details",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/orders-paginated
  app.get('/api/orders-paginated', requireAuth, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page || '1');
      const limit = parseInt(req.query.limit || '20');
      const search = req.query.search;
      const customerId = req.query.customerId;
      const archiveTab = req.query.archiveTab || 'active';
      const paymentStatusParam = req.query.paymentStatus as string | undefined;
      const fulfillmentTypeParam = req.query.fulfillmentType as string | undefined;
      const statusParam = req.query.status as string | undefined;
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Build search conditions - customerId takes priority over text search
      const searchConditions: any[] = [eq(orders.wholesalerId, wholesalerId)];
      if (customerId) {
        searchConditions.push(eq(orders.retailerId, customerId));
      } else if (search && search.trim()) {
        const searchValue = '%' + search.trim() + '%';
        searchConditions.push(or(
          sql`${orders.orderNumber} ILIKE ${searchValue}`,
          sql`${orders.customerName} ILIKE ${searchValue}`,
          sql`${orders.customerEmail} ILIKE ${searchValue}`,
          sql`${orders.customerPhone} ILIKE ${searchValue}`
        ));
      }
      // Payment status filter
      if (paymentStatusParam === 'paid') {
        // Paid = paymentStatus is paid AND not cancelled (refunded orders are cancelled)
        searchConditions.push(eq(orders.paymentStatus, 'paid'));
        searchConditions.push(sql`${orders.status} != 'cancelled'`);
      } else if (paymentStatusParam === 'part_paid') {
        searchConditions.push(eq(orders.paymentStatus, 'part_paid'));
      } else if (paymentStatusParam === 'unpaid') {
        // Unpaid = no payment at all (excludes part_paid)
        searchConditions.push(sql`(${orders.paymentStatus} IS NULL OR ${orders.paymentStatus} = 'unpaid')`);
      }

      // Delivery type filter (pickup = collection, delivery = delivery)
      if (fulfillmentTypeParam) {
        searchConditions.push(eq(orders.fulfillmentType, fulfillmentTypeParam));
      }

      // Status filter (unfulfilled = multiple statuses, otherwise exact match)
      if (statusParam) {
        const UNFULFILLED_STATUSES = ['pending', 'paid', 'confirmed', 'processing'];
        if (statusParam === 'unfulfilled') {
          searchConditions.push(inArray(orders.status, UNFULFILLED_STATUSES));
        } else {
          searchConditions.push(eq(orders.status, statusParam));
        }
      }

      // Archived = cancelled OR (fulfilled AND paid)
      // Active = everything else
      const archivedCondition = or(
        eq(orders.status, 'cancelled'),
        and(eq(orders.status, 'fulfilled'), eq(orders.paymentStatus, 'paid'))
      );

      const tabFilter = archiveTab === 'all'
        ? and(...searchConditions)
        : archiveTab === 'archived'
          ? and(...searchConditions, archivedCondition!)
          : and(...searchConditions, sql`NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`);

      // Also get counts for both tabs (using search filter but not tab filter)
      const baseFilter = and(...searchConditions);

      // Run count, paginated results, and stats all in parallel — no full-table fetch
      const [totalCountResult, ordersResult, tabStatsResult, baseStatsResult] = await Promise.all([
        db.select({ count: count() }).from(orders).where(tabFilter),
        db.select().from(orders).where(tabFilter).orderBy(desc(orders.createdAt)).limit(limit).offset((page - 1) * limit),
        db.select({
          paidOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.paymentStatus} = 'paid' AND ${orders.status} != 'cancelled' THEN 1 END)::int`,
          pendingOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'pending' THEN 1 END)::int`,
          totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} != 'cancelled' THEN (${orders.subtotal}::numeric - ${orders.platformFee}::numeric) ELSE 0 END), 0)::float`,
        }).from(orders).where(tabFilter),
        db.select({
          activeCount: sql<number>`COUNT(CASE WHEN NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid')) THEN 1 END)::int`,
          archivedCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid') THEN 1 END)::int`,
        }).from(orders).where(baseFilter),
      ]);

      const totalOrders = totalCountResult[0].count;
      const totalPages = Math.ceil(totalOrders / limit);
      const { paidOrdersCount, pendingOrdersCount, totalRevenue } = tabStatsResult[0];
      const { activeCount, archivedCount } = baseStatsResult[0];

      // Fetch cancellation requests for this page's orders only
      const orderIds = ordersResult.map(o => o.id);
      let cancellationRequestsMap: Record<number, any> = {};

      if (orderIds.length > 0) {
        const requests = await db.select()
          .from(orderCancellationRequests)
          .where(inArray(orderCancellationRequests.orderId, orderIds));

        requests.forEach(req => {
          cancellationRequestsMap[req.orderId] = {
            id: req.id,
            status: req.status,
            reasonCategory: req.reasonCategory,
            reasonNotes: req.reasonNotes,
            requestedAt: req.requestedAt,
            respondedAt: req.respondedAt,
            responseMessage: req.responseMessage,
            refundType: req.refundType
          };
        });
      }

      // Batch-fetch business profile names for orders that have a businessProfileId
      const profileIds = Array.from(new Set(ordersResult.map(o => o.businessProfileId).filter((id): id is number => id != null)));
      let profileNameMap: Record<number, string> = {};
      if (profileIds.length > 0) {
        const profiles = await db
          .select({ id: businessProfiles.id, name: businessProfiles.name })
          .from(businessProfiles)
          .where(inArray(businessProfiles.id, profileIds));
        profileNameMap = profiles.reduce((acc, p) => { acc[p.id] = p.name; return acc; }, {} as Record<number, string>);
      }

      // Attach cancellation request and business profile name to each order
      const ordersWithRequests = ordersResult.map(order => ({
        ...order,
        cancellationRequest: cancellationRequestsMap[order.id] || null,
        businessProfileName: order.businessProfileId ? (profileNameMap[order.businessProfileId] ?? null) : null,
      }));
      
      res.json({
        orders: ordersWithRequests,
        currentPage: page,
        totalPages,
        total: totalOrders,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        stats: {
          activeCount,
          archivedCount,
          paidOrdersCount,
          pendingOrdersCount,
          totalRevenue,
          ordersCount: activeCount
        }
      });
    } catch (error) {
      console.error("❌ Error fetching paginated orders:", error);
      res.status(500).json({ 
        message: "Failed to fetch orders",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // GET /api/orders/stats
  app.get('/api/orders/stats', requireAuth, async (req: any, res) => {
    try {
      // Use authenticated user's ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Check if filtering by archive tab
      const archiveTab = req.query.archiveTab as string || 'active';
      
      // Archived = cancelled OR (fulfilled AND fully paid)
      // Active = everything else (including part paid fulfilled orders with outstanding balance)
      const isArchivedOrder = (order: any) => {
        const status = (order.status || '').toLowerCase();
        const paymentStatus = (order.paymentStatus || '').toLowerCase();
        if (status === 'cancelled') return true;
        if (status === 'fulfilled' && paymentStatus === 'paid') return true;
        return false;
      };
      
      // Get all orders to calculate overall statistics (full history required for archive counts)
      const allOrders = await storage.getOrders(wholesalerId, undefined, undefined, { unpaginated: true });
      
      // Filter by active/archived based on tab
      const filteredOrders = archiveTab === 'all'
        ? allOrders
        : archiveTab === 'archived'
          ? allOrders.filter(order => isArchivedOrder(order))
          : allOrders.filter(order => !isArchivedOrder(order));
      
      // Calculate overall statistics for the filtered set
      const paidOrders = filteredOrders.filter(order => 
        order.status === 'paid' || 
        order.status === 'completed' ||
        order.status === 'processing' ||
        order.status === 'shipped'
      );

      const pendingOrders = filteredOrders.filter(order => 
        order.status === 'pending'
      );

      // Calculate net revenue using subtotal for non-cancelled/refunded orders
      const revenueOrders = filteredOrders.filter(order => !['cancelled', 'refunded'].includes(order.status));
      const totalRevenue = revenueOrders.reduce((sum, order) => {
        const netAmount = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
        return sum + (isNaN(netAmount) ? 0 : netAmount);
      }, 0);

      // Count by tab for badges using the same isArchivedOrder logic
      const activeCount = allOrders.filter(order => !isArchivedOrder(order)).length;
      const archivedCount = allOrders.filter(order => isArchivedOrder(order)).length;

      const stats = {
        ordersCount: filteredOrders.length,
        totalRevenue: totalRevenue,
        paidOrdersCount: paidOrders.length,
        pendingOrdersCount: pendingOrders.length,
        avgOrderValue: paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0,
        activeCount: activeCount,
        archivedCount: archivedCount
      };

      res.json(stats);
    } catch (error) {
      console.error("❌ Error fetching order statistics:", error);
      res.status(500).json({ 
        message: "Failed to fetch order statistics",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // POST /api/orders
  app.post('/api/orders', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { items, deliveryAddress, notes, collectionAddressId } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Calculate totals
      let subtotal = 0;
      let orderItems: any[] = [];

      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }

        if (item.quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity for ${product.name} is ${product.moq}` 
          });
        }

        const basePrice = parseFloat(product.price);
        const effectivePrice = basePrice;
        const itemTotal = effectivePrice * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          orderId: 0,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: effectivePrice.toFixed(2),
          total: itemTotal.toFixed(2),
          sellingType: item.sellingType || 'units',
          appliedOfferLabel: null,
          freeItems: 0
        });
      }

      const feeConfig = await getCurrentFeeConfig();
      const customerTransactionFee = calculateCustomerFee(subtotal, 0, feeConfig); // configurable % + fixed (customer pays)

      // Get wholesaler from first product (needed for per-wholesaler fee rate and VAT)
      const firstProduct = await storage.getProduct(items[0].productId);
      const wholesalerId = firstProduct!.wholesalerId;

      // Compute a stable idempotency key covering all order-shaping fields so that
      // concurrent/retry requests for the exact same order collapse to a single DB row.
      const orderFingerprint = computeOrderFingerprint(
        userId, wholesalerId, items, deliveryAddress, notes, collectionAddressId
      );

      // Pre-flight DB check: if this fingerprint already exists return early, skipping
      // side effects (email, stock movements) which were already fired for the original request.
      const existingOrder = await storage.getOrderByIdempotencyKey(orderFingerprint);
      if (existingOrder) {
        console.warn(`⚠️  Duplicate order request (key ${orderFingerprint.slice(0, 12)}…) — returning existing order ${existingOrder.id} without side effects`);
        return res.json(existingOrder);
      }

      const feeRate = await getWholesalerFeeRate(wholesalerId);
      const platformFee = subtotal * feeRate; // per-wholesaler platform fee (wholesaler cost)

      // VAT calculation — applied to subtotal only, never to fees
      const wholesalerForVat = await storage.getUser(wholesalerId);
      const vatEnabled = wholesalerForVat?.vatEnabled ?? false;
      const vatRate = parseFloat(wholesalerForVat?.vatRate ?? '0');
      const vatAmount = vatEnabled ? subtotal * vatRate : 0;
      const vatRateApplied = vatEnabled ? vatRate : null;

      const deliveryCost = 0; // quick-order route does not support delivery at creation time
      const total = subtotal + vatAmount + deliveryCost + customerTransactionFee; // total = what the customer pays

      // Validate collectionAddressId belongs to this wholesaler (multi-tenant safety)
      let validatedCollectionAddressId: number | null = null;
      if (collectionAddressId) {
        const parsedId = parseInt(String(collectionAddressId), 10);
        if (!isNaN(parsedId)) {
          const collAddr = await storage.getCollectionAddress(parsedId);
          if (collAddr && collAddr.wholesalerId === wholesalerId) {
            validatedCollectionAddressId = parsedId;
          } else {
            console.warn(`POST /api/orders: collectionAddressId ${parsedId} invalid for wholesaler ${wholesalerId} — ignoring`);
          }
        }
      }

      const orderData = insertOrderSchema.parse({
        orderNumber: await generateOrderNumber(wholesalerId),
        wholesalerId,
        retailerId: userId,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        feePercentageUsed: feeConfig.percentage.toFixed(4),
        fixedFeeUsed: feeConfig.fixed.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        ...(vatRateApplied !== null ? { vatRateApplied: vatRateApplied.toFixed(4) } : {}),
        total: total.toFixed(2),
        deliveryAddress,
        notes,
        status: 'confirmed', // Auto-confirm orders immediately
        ...(validatedCollectionAddressId ? { collectionAddressId: validatedCollectionAddressId } : {}),
        idempotencyKey: orderFingerprint,
      });

      // CRITICAL FIX: Use transaction-based order creation for reliable stock processing
      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });

      // Get wholesaler and customer details for confirmation email
      // Skip email if this order was deduped in the storage layer (concurrent race path)
      const isDeduped = order._wasDuplicate === true;
      const wholesaler = await storage.getUser(wholesalerId);
      const customer = await storage.getUser(userId);
      
      if (!isDeduped && wholesaler && customer) {
        try {
          // Send confirmation email to customer
          await sendCustomerInvoiceEmail(customer, order, await Promise.all(orderItems.map(async item => {
            const prod = await storage.getProduct(item.productId);
            return { ...item, productName: prod?.name || 'Product', packDescriptor: formatPackDescriptor(prod?.packQuantity || prod?.quantityInPack, prod?.sizePerUnit || prod?.unitSize, prod?.unitOfMeasure), product: prod ? { name: prod.name, packQuantity: prod.packQuantity, quantityInPack: prod.quantityInPack, sizePerUnit: prod.sizePerUnit, unitSize: prod.unitSize, unitOfMeasure: prod.unitOfMeasure } : null };
          })), wholesaler);
        } catch (emailError) {
          const msg = emailError instanceof Error ? emailError.message : String(emailError);
          console.warn(`[sendgrid] order confirmation email failed: ${msg}`);
        }
      }
      
      // Track real-user activity (skip when super admin is impersonating)
      if (!isImpersonating(req)) {
        storage.updateUserRealActivity(userId).catch(() => {});
      }

      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // PATCH /api/orders/:id/status
  app.patch('/api/orders/:id/status', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const { status } = req.body;
      const allowedStatuses = ['pending', 'processing', 'fulfilled', 'cancelled', 'refunded'];
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
      }

      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only the owning wholesaler (or their team members) can update order status
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);

      // Send real-time notifications to the customer
      if (updatedOrder) {
        sendOrderStatusNotification({ orderId: updatedOrder.id, status: updatedOrder.status }).catch((err) => {
          console.error('Failed to send order status notifications:', err);
        });
      }

      // Auto-archive fulfilled orders after 24 hours
      if (status === 'fulfilled') {
        setTimeout(async () => {
          try {
            await storage.updateOrderStatus(id, 'archived');
          } catch (error) {
            console.error(`Failed to auto-archive order ${id}:`, error);
          }
        }, 24 * 60 * 60 * 1000);
      }

      // Track real-user activity (skip when super admin is impersonating)
      if (!isImpersonating(req)) {
        storage.updateUserRealActivity(wholesalerId).catch(() => {});
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // POST /api/orders/:id/cancel
  app.post('/api/orders/:id/cancel', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { reason, reasonCategory, returnedItems, processRefund, refundType, refundDelivery } = req.body;
      // returnedItems: Array<{ productId: number, quantity: number, sellingType: 'units' | 'pallets' }>
      // refundType: 'card' | 'later' - determines if refund goes to original payment or processed separately
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can cancel order
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      // Can't cancel already cancelled orders
      if (order.status === 'cancelled') {
        return res.status(400).json({ message: "Order is already cancelled" });
      }

      const orderItems = await storage.getOrderItems(id);
      let stockRestoredCount = 0;
      let refundAmount = 0;
      const skipRestock = order.restockStatus === 'completed';
      
      // Calculate refund amount and restore stock for returned items
      if (returnedItems && returnedItems.length > 0) {
        // Partial cancellation - only restore specified items
        for (const returnItem of returnedItems) {
          const orderItem = orderItems.find(oi => oi.productId === returnItem.productId);
          if (orderItem) {
            const product = await storage.getProduct(returnItem.productId);
            if (product) {
              const returnQty = Math.min(returnItem.quantity, orderItem.quantity);
              
              if (!skipRestock) {
                // Restore stock based on selling type
                if (returnItem.sellingType === 'pallets') {
                  const stockBefore = product.palletStock || 0;
                  const stockAfter = stockBefore + returnQty;
                  await db.update(products)
                    .set({ palletStock: stockAfter })
                    .where(eq(products.id, product.id));
                  await db.insert(stockMovements).values({
                    productId: product.id,
                    wholesalerId: order.wholesalerId,
                    movementType: 'return',
                    quantity: returnQty,
                    unitType: 'pallets',
                    stockBefore,
                    stockAfter,
                    reason: `Order cancellation - ${returnQty} pallets returned`,
                    orderId: id,
                    businessProfileId: order.businessProfileId ?? null,
                  });
                } else {
                  await restockUnitsToOrigin(orderItem.batchId ?? null, product.id, returnQty, order.wholesalerId, id, order.orderNumber, order.businessProfileId ?? null);
                }
                stockRestoredCount += returnQty;
              }
              
              // Calculate refund for this item (always, regardless of restock guard)
              refundAmount += parseFloat(orderItem.unitPrice) * returnQty;
            }
          }
        }
        if (refundDelivery) {
          const allFullyReturned = orderItems.every(oi => {
            const ri = returnedItems.find((r: any) => r.productId === oi.productId);
            return ri && ri.quantity >= oi.quantity;
          });
          if (!allFullyReturned) {
            const deliveryCost = parseFloat(order.deliveryCost || '0');
            refundAmount += deliveryCost;
          }
        }
      } else {
        // Full cancellation - restore all items
        for (const item of orderItems) {
          const product = await storage.getProduct(item.productId!);
          if (product) {
            if (!skipRestock) {
              if (item.sellingType === 'pallets') {
                const stockBefore = product.palletStock || 0;
                const stockAfter = stockBefore + item.quantity;
                await db.update(products)
                  .set({ palletStock: stockAfter })
                  .where(eq(products.id, product.id));
                await db.insert(stockMovements).values({
                  productId: product.id,
                  wholesalerId: order.wholesalerId,
                  movementType: 'return',
                  quantity: item.quantity,
                  unitType: 'pallets',
                  stockBefore,
                  stockAfter,
                  reason: `Order cancelled - ${item.quantity} pallets returned`,
                  orderId: id,
                  businessProfileId: order.businessProfileId ?? null,
                });
              } else if (item.productId) {
                await restockUnitsToOrigin(item.batchId ?? null, item.productId!, item.quantity, order.wholesalerId, id, order.orderNumber, order.businessProfileId ?? null);
              }
              stockRestoredCount += item.quantity;
            }
          }
        }
        // Full refund for full cancellation
        refundAmount = parseFloat(order.amountPaid || '0');
      }

      // Determine new status - full cancellation if no items specified OR all items returned at full quantity
      // NOTE: must be evaluated BEFORE the Stripe refund block so we know whether to use order.total
      let isFullCancellation = !returnedItems || returnedItems.length === 0;

      // Check if all items are being returned at full quantity (also a full cancellation)
      if (!isFullCancellation && returnedItems && returnedItems.length > 0) {
        const allItemsFullyReturned = orderItems.every(orderItem => {
          const returnItem = returnedItems.find((ri: any) => ri.productId === orderItem.productId);
          return returnItem && returnItem.quantity >= orderItem.quantity;
        });
        if (allItemsFullyReturned && returnedItems.length >= orderItems.length) {
          isFullCancellation = true;
        }
      }

      // Process Stripe refund if order was paid and refund requested
      let stripeRefundTotalPounds = 0;
      let stripeRefundError: string | null = null;
      const amountPaid = parseFloat(order.amountPaid || '0');
      // For a full cancellation refund the complete customer-facing charge (order.total),
      // which includes the 5.5% + £0.50 customer transaction fee.
      // For partial returns refund only the item value (fee is not proportionally refunded).
      const orderTotal = parseFloat(order.total || '0');

      // Read current refunded amount before issuing any new refund (used for idempotency and totalling below)
      const currentRefunded = parseFloat(order.amountRefunded || '0');

      if (processRefund && amountPaid > 0 && order.stripePaymentIntentId && stripe) {
        const refundAmountToProcess = isFullCancellation && orderTotal > 0
          ? orderTotal   // full cancel → return everything the customer paid
          : refundAmount; // partial → return item value only
        const refundCeiling = isFullCancellation ? (orderTotal > 0 ? orderTotal : amountPaid) : amountPaid;
        // Idempotency guard: cap at remaining refundable amount to prevent double-charging
        // on retries while still allowing subsequent legitimate partial returns.
        const remainingRefundable = Math.max(0, refundCeiling - currentRefunded);
        const effectiveRefundAmount = Math.min(refundAmountToProcess, remainingRefundable);
        if (remainingRefundable <= 0.01) {
        } else if (effectiveRefundAmount > 0 && effectiveRefundAmount <= refundCeiling) {
          const result = await refundAcrossPaymentIntents(
            stripe,
            order.stripePaymentIntentId,
            effectiveRefundAmount,
            { order_id: id.toString(), reason: reason || 'Order cancelled' }
          );
          stripeRefundTotalPounds = result.totalRefunded;
          if (result.totalRefunded === 0) {
            stripeRefundError = result.lastError;
          } else if (result.remaining > 0.01) {
            // Partial Stripe success — some amount couldn't be refunded
            stripeRefundError = `£${result.remaining.toFixed(2)} could not be refunded automatically`;
          }
        }
      }
      
      const newStatus = isFullCancellation ? 'cancelled' : order.status;

      // Update order with cancellation details
      const amountPaidNum = parseFloat(order.amountPaid || '0');
      
      // Calculate total refunded: Stripe refund amount (card only)
      let totalRefunded = currentRefunded + stripeRefundTotalPounds;
      
      // For full cancellation, always record the refund amount even if "later" refund type
      if (isFullCancellation && totalRefunded === 0 && amountPaidNum > 0) {
        // If we're cancelling but haven't processed refund yet (e.g., 'later' option),
        // still record how much was paid to show what should be refunded
        totalRefunded = amountPaidNum;
      }
      
      // For partial returns with "later" refund, record the calculated refund amount for display
      if (!isFullCancellation && totalRefunded === 0 && refundAmount > 0) {
        totalRefunded = refundAmount;
      }
      
      const pendingRefundAmount = returnedItems?.length > 0 ? refundAmount : amountPaidNum;
      const refundNote = stripeRefundTotalPounds > 0
        ? `Stripe refund: £${stripeRefundTotalPounds.toFixed(2)}${stripeRefundError ? ` (partial — ${stripeRefundError})` : ''}`
        : stripeRefundError
          ? `Refund failed: £${pendingRefundAmount.toFixed(2)} (${stripeRefundError})`
          : amountPaidNum > 0 
            ? `Refund pending: £${pendingRefundAmount.toFixed(2)}`
            : 'No payment taken';
      
      // Determine if refund was processed now
      const refundProcessedNow = stripeRefundTotalPounds > 0;
      
      await db.update(orders)
        .set({
          status: newStatus,
          amountRefunded: totalRefunded.toFixed(2),
          amountOutstanding: isFullCancellation ? '0.00' : undefined,
          refundReason: reason || 'Customer requested cancellation',
          cancelledAt: isFullCancellation ? new Date() : undefined,
          stockRestored: (order.stockRestoredCount || 0) + stockRestoredCount > 0,
          stockRestoredCount: (order.stockRestoredCount || 0) + stockRestoredCount,
          restockStatus: 'completed',
          notes: order.notes 
            ? `${order.notes}\n[${new Date().toISOString()}] ${isFullCancellation ? 'Order cancelled' : 'Partial return processed'} (${reasonCategory || 'unspecified'}): ${reason || 'N/A'}. Stock restored: ${stockRestoredCount} items. ${refundNote}` 
            : `[${new Date().toISOString()}] ${isFullCancellation ? 'Order cancelled' : 'Partial return processed'} (${reasonCategory || 'unspecified'}): ${reason || 'N/A'}. Stock restored: ${stockRestoredCount} items. ${refundNote}`
        })
        .where(eq(orders.id, id));

      // Log cancellation for quotes (non-blocking)
      if (order.isQuote && isFullCancellation) {
        logQuoteActivity({
          quoteId: id,
          actionType: 'quote_cancelled',
          entityType: 'quote',
          newValue: { reason: reason || 'unspecified', reasonCategory: reasonCategory || 'unspecified', stockRestored: stockRestoredCount },
          description: `Invoice cancelled — ${reason || 'no reason given'}. Stock restored: ${stockRestoredCount} item${stockRestoredCount !== 1 ? 's' : ''}.`,
          performedBy: req.user?.id ?? 'system',
        });
      }

      // Send cancellation notification to customer (SMS and Email)
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        await sendCancellationNotification({
          order, orderItems, customer, wholesaler,
          isFullCancellation, returnedItems, refundDelivery,
          stripeRefundTotalPounds, refundAmount,
        });
      } catch (error) {
        console.error('Failed to send cancellation notification:', error);
      }

      const updatedOrder = await storage.getOrder(id);

      res.json({ 
        message: isFullCancellation ? "Order cancelled successfully" : "Partial return processed successfully",
        order: updatedOrder,
        stockRestored: stockRestoredCount,
        reasonCategory: reasonCategory || null,
        refundFailed: !!stripeRefundError,
        refundError: stripeRefundError,
        refund: stripeRefundTotalPounds > 0 ? {
          amount: stripeRefundTotalPounds,
          type: 'card'
        } : null
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Failed to cancel order" });
    }
  });

  // POST /api/orders/:id/retry-refund
  app.post('/api/orders/:id/retry-refund', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ message: "Not authorized" });
      if (!order.stripePaymentIntentId) return res.status(400).json({ message: "No Stripe payment recorded for this order" });
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));
      if (order.refundedAt) return res.status(400).json({ message: "Refund already processed on " + new Date(order.refundedAt).toLocaleDateString() });

      const amountToRefund = parseFloat(order.amountRefunded || '0');
      if (amountToRefund <= 0) return res.status(400).json({ message: "No pending refund amount recorded" });

      const result = await refundAcrossPaymentIntents(
        stripe,
        order.stripePaymentIntentId,
        amountToRefund,
        { order_id: id.toString(), retry: 'true' }
      );

      if (result.totalRefunded === 0) {
        return res.status(400).json({
          message: "Stripe refund failed",
          error: result.lastError || 'Could not refund from any payment intent'
        });
      }

      const refundedAmount = result.totalRefunded;
      const partialNote = result.remaining > 0.01 ? ` (£${result.remaining.toFixed(2)} could not be recovered automatically)` : '';

      const currentRefunded = parseFloat(order.amountRefunded || '0');
      const newRefunded = Math.min(currentRefunded + result.totalRefunded, parseFloat(order.amountPaid || '0'));
      const isFullyRefunded = result.remaining <= 0.01;

      await db.update(orders)
        .set({
          amountRefunded: newRefunded.toFixed(2),
          ...(isFullyRefunded ? { refundedAt: new Date() } : {}),
          notes: order.notes
            ? `${order.notes}\n[${new Date().toISOString()}] Stripe retry refund submitted: £${refundedAmount.toFixed(2)}${partialNote}`
            : `[${new Date().toISOString()}] Stripe retry refund submitted: £${refundedAmount.toFixed(2)}${partialNote}`
        })
        .where(eq(orders.id, id));

      const updatedOrder = await storage.getOrder(id);
      res.json({
        message: `Refund of £${refundedAmount.toFixed(2)} successfully sent to Stripe${partialNote}`,
        order: updatedOrder,
        refund: { amount: refundedAmount, remaining: result.remaining }
      });
    } catch (error) {
      console.error("Error retrying refund:", error);
      res.status(500).json({ message: "Failed to retry refund" });
    }
  });

  // POST /api/orders/:id/mark-refunded
  app.post('/api/orders/:id/mark-refunded', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ message: "Not authorized" });
      if (order.status !== 'cancelled') return res.status(400).json({ message: "Order is not cancelled" });

      const amountRefunded = parseFloat(order.amountRefunded || '0');
      if (amountRefunded <= 0) return res.status(400).json({ message: "No refund amount recorded on this order" });
      if (order.refundedAt) return res.status(400).json({ message: "Refund already marked as processed on " + new Date(order.refundedAt).toLocaleDateString() });
      if (!order.stripePaymentIntentId) return res.status(400).json({ message: "No Stripe payment recorded for this order" });

      await db.update(orders)
        .set({
          refundedAt: new Date(),
          notes: order.notes
            ? `${order.notes}\n[${new Date().toISOString()}] Manually marked as refunded`
            : `[${new Date().toISOString()}] Manually marked as refunded`
        })
        .where(eq(orders.id, id));

      const updatedOrder = await storage.getOrder(id);
      res.json({
        message: "Order marked as refunded",
        order: updatedOrder
      });
    } catch (error) {
      console.error("Error marking order as refunded:", error);
      res.status(500).json({ message: "Failed to mark order as refunded" });
    }
  });

  // GET /api/cancellation-requests
  app.get('/api/cancellation-requests', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const status = req.query.status as string || undefined;
      
      let query = db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.wholesalerId, wholesalerId));
      
      if (status) {
        query = db.select()
          .from(orderCancellationRequests)
          .where(and(
            eq(orderCancellationRequests.wholesalerId, wholesalerId),
            eq(orderCancellationRequests.status, status as 'pending' | 'approved' | 'rejected')
          ));
      }
      
      const requests = await query.orderBy(desc(orderCancellationRequests.requestedAt));
      
      // Enrich with order and customer details
      const enrichedRequests = await Promise.all(requests.map(async (request) => {
        const order = await storage.getOrder(request.orderId);
        const customer = await storage.getUser(request.customerId);
        return {
          ...request,
          order: order ? {
            id: order.id,
            orderNumber: order.orderNumber,
            total: order.total,
            status: order.status,
            createdAt: order.createdAt,
          } : null,
          customer: customer ? {
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phoneNumber: customer.phoneNumber,
            businessName: customer.businessName,
          } : null,
        };
      }));
      
      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching cancellation requests:", error);
      res.status(500).json({ message: "Failed to fetch cancellation requests" });
    }
  });

  // GET /api/cancellation-requests/pending-count
  app.get('/api/cancellation-requests/pending-count', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.wholesalerId, wholesalerId),
          eq(orderCancellationRequests.status, 'pending')
        ));
      
      res.json({ count: Number(result[0]?.count || 0) });
    } catch (error) {
      console.error("Error fetching pending cancellation count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // POST /api/cancellation-requests/:id/respond
  app.post('/api/cancellation-requests/:id/respond', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      if (isNaN(requestId)) return res.status(400).json({ error: 'Invalid request ID' });
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { approved, responseMessage, refundType } = req.body;
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));
      
      const [request] = await db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.id, requestId))
        .limit(1);
      
      if (!request) {
        return res.status(404).json({ message: "Cancellation request not found" });
      }
      
      if (request.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to respond to this request" });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: "This request has already been processed" });
      }
      
      const newStatus = approved ? 'approved' : 'rejected';
      
      // Update the request
      await db.update(orderCancellationRequests)
        .set({
          status: newStatus,
          respondedAt: new Date(),
          respondedBy: req.user.id,
          responseMessage: responseMessage || null,
          refundType: approved ? (refundType || 'card') : null,
        })
        .where(eq(orderCancellationRequests.id, requestId));
      
      // If approved, cancel the order
      let custCancelStripeRefunded = 0;
      let custCancelAmountPaid = 0;
      if (approved) {
        const order = await storage.getOrder(request.orderId);
        if (order) {
          const orderItems = await storage.getOrderItems(order.id);
          const skipCustRestock = order.restockStatus === 'completed';
          
          if (!skipCustRestock) {
            for (const item of orderItems) {
              const product = await storage.getProduct(item.productId!);
              if (product) {
                if (item.sellingType === 'pallets') {
                  const stockBefore = product.palletStock || 0;
                  const stockAfter = stockBefore + item.quantity;
                  await db.update(products)
                    .set({ palletStock: stockAfter })
                    .where(eq(products.id, product.id));
                  await db.insert(stockMovements).values({
                    productId: product.id,
                    wholesalerId: order.wholesalerId,
                    movementType: 'return',
                    quantity: item.quantity,
                    unitType: 'pallets',
                    stockBefore,
                    stockAfter,
                    reason: `Order cancellation (customer request) — ${item.quantity} pallets returned`,
                    orderId: order.id,
                    businessProfileId: order.businessProfileId ?? null,
                  });
                } else {
                  await restockUnitsToOrigin(item.batchId ?? null, item.productId!, item.quantity, order.wholesalerId, order.id, order.orderNumber, order.businessProfileId ?? null);
                }
              }
            }
          }
          
          custCancelAmountPaid = parseFloat(order.total || order.amountPaid || '0');

          // Idempotency guard: skip Stripe refund if one has already been recorded on this order
          const custAlreadyRefunded = parseFloat(order.amountRefunded || '0') > 0;
          if (custAlreadyRefunded) {
          }
          
          if (refundType === 'card' && custCancelAmountPaid > 0 && order.stripePaymentIntentId && !custAlreadyRefunded) {
            // Idempotency key tied to the specific cancellation request so a retry
            // of the same approval returns the existing Stripe refund, not a new one.
            const custRefundIdempotencyKey = `cancellation-request-${requestId}-refund`;
            const result = await refundAcrossPaymentIntents(
              stripe,
              order.stripePaymentIntentId,
              custCancelAmountPaid,
              { order_id: order.id.toString(), reason: `Customer request: ${request.reasonCategory}` },
              custRefundIdempotencyKey
            );
            custCancelStripeRefunded = result.totalRefunded;
            if (result.totalRefunded > 0) {
            }
          }

          // Determine the amountRefunded value to persist:
          // - New Stripe refund processed → use that amount
          // - Guard fired (custAlreadyRefunded) → preserve existing recorded amount
          // - Refund type is 'later' → record what should be refunded for display
          // - Otherwise → '0.00'
          const custCancelAmountRefunded = custCancelStripeRefunded > 0
            ? custCancelStripeRefunded.toFixed(2)
            : custAlreadyRefunded
              ? (order.amountRefunded || '0.00')
              : refundType === 'later'
                ? custCancelAmountPaid.toFixed(2)
                : '0.00';
          
          await db.update(orders)
            .set({
              status: 'cancelled',
              amountRefunded: custCancelAmountRefunded,
              refundReason: `Customer request: ${request.reasonCategory}${request.reasonNotes ? ` - ${request.reasonNotes}` : ''}`,
              cancelledAt: new Date(),
              restockStatus: 'completed',
              notes: order.notes 
                ? `${order.notes}\n[${new Date().toISOString()}] Order cancelled via customer request (${request.reasonCategory}). Refund: ${refundType}`
                : `[${new Date().toISOString()}] Order cancelled via customer request (${request.reasonCategory}). Refund: ${refundType}`,
            })
            .where(eq(orders.id, order.id));
          
        }
      }
      
      // Notify customer about the decision via SMS and email
      try {
        const order = await storage.getOrder(request.orderId);
        const wholesaler = await storage.getUser(request.wholesalerId);
        const businessName = wholesaler?.businessName || 'the seller';
        const customerPhone = order?.customerPhone;
        const customerEmail = order?.customerEmail;
        const customerName = order?.customerName || 'Customer';
        
        // Build itemised data for the approved cancellation email
        let cancelledLineItems: RefundLineItem[] = [];
        if (approved && order) {
          const cancOrderItems = await storage.getOrderItems(order.id);
          for (const oi of cancOrderItems) {
            const product = await storage.getProduct(oi.productId!);
            cancelledLineItems.push({
              productName: product?.name || `Product #${oi.productId}`,
              quantity: oi.quantity,
              unitPrice: parseFloat(oi.unitPrice),
              sellingType: oi.sellingType || 'units',
              packDescriptor: formatPackDescriptor(product?.packQuantity || product?.quantityInPack, product?.sizePerUnit || product?.unitSize, product?.unitOfMeasure),
            });
          }
        }

        // SMS notification
        if (customerPhone && order) {
          let message = '';
          
          if (approved) {
            const totalCancelledQty = cancelledLineItems.reduce((sum, i) => sum + i.quantity, 0);
            if (refundType === 'card' && custCancelStripeRefunded > 0) {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}. Refund of £${custCancelStripeRefunded.toFixed(2)} processed — allow 5-10 business days.`;
            } else if (refundType === 'card' && custCancelAmountPaid > 0) {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}. Refund of £${custCancelAmountPaid.toFixed(2)} pending.`;
            } else {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}.`;
            }
          } else {
            message = `❌ Your cancellation request for order ${order.orderNumber} has been declined by ${businessName}.${responseMessage ? ` Reason: ${responseMessage}` : ''} Please contact the seller for more information.`;
          }
          
          await sendWhatsAppMessage({ to: customerPhone, message });
        }
        
        // Email notification
        if (customerEmail && order) {
          if (approved) {
            const custCancelDeliveryCost = parseFloat(order.deliveryCost || '0');
            const actualRefundAmt = custCancelStripeRefunded > 0
              ? custCancelStripeRefunded
              : custCancelAmountPaid;
            const custRefundType: CancellationRefundType = custCancelStripeRefunded > 0
              ? 'card'
              : custCancelAmountPaid > 0 ? 'later'
              : 'none';
            const custRefundStatus = cancellationRefundTypeToEmailStatus(custRefundType);
            
            const approvedEmailBody = buildItemisedRefundEmail({
              customerName,
              orderNumber: order.orderNumber,
              isFullCancellation: true,
              returnedItems: cancelledLineItems,
              refundAmount: actualRefundAmt,
              deliveryRefunded: custCancelDeliveryCost > 0 ? custCancelDeliveryCost : undefined,
              refundStatus: custRefundStatus,
              businessName,
              businessPhone: wholesaler?.phoneNumber || undefined,
              businessEmail: wholesaler?.email || undefined,
            });

            await sendEmail({
              to: customerEmail,
              from: 'hello@quikpik.co',
              subject: `Cancellation Approved - Order ${order.orderNumber}`,
              html: wrapCustomerEmail(approvedEmailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Your order ${order.orderNumber} cancellation has been approved` }),
            });
          } else {
            const rejectedCancelBody = `${emailHeading('Cancellation Request Update', { size: '22px' })}<p style="margin:0 0 8px">Hi ${customerName},</p><p style="margin:0 0 20px">We regret to inform you that your cancellation request for <strong>Order ${order.orderNumber}</strong> has been declined.</p>${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Reason:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`, { borderColor: '#FECACA', bgColor: '#FEF2F2' }) : ''}${emailCard(`${emailHeading("What's Next?", { size: '16px', color: '#EA580C' })}<p style="margin:0 0 8px">Your order remains active. If you have any questions or concerns, please contact us directly:</p><p style="margin:0 0 4px"><strong>${businessName}</strong></p>${wholesaler?.phoneNumber ? `<p style="margin:0 0 4px">Phone: ${wholesaler.phoneNumber}</p>` : ''}${wholesaler?.email ? `<p style="margin:0">Email: ${wholesaler.email}</p>` : ''}`, { borderColor: '#FED7AA', bgColor: '#FFF7ED' })}`;

            await sendEmail({
              to: customerEmail,
              from: 'hello@quikpik.co',
              subject: `Order ${order.orderNumber} - Cancellation Request Update`,
              html: wrapCustomerEmail(rejectedCancelBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Update on your cancellation request for order ${order.orderNumber}` }),
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Cancellation notification failed [orderId=${req.params.id}]: ${msg}`);
      }
      
      res.json({ 
        message: approved ? "Cancellation request approved and order cancelled" : "Cancellation request rejected",
        status: newStatus
      });
    } catch (error) {
      console.error("Error responding to cancellation request:", error);
      res.status(500).json({ message: "Failed to process cancellation request" });
    }
  });

  // POST /api/orders/:id/refund
  app.post('/api/orders/:id/refund', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user.id;
      const { amount, reason } = req.body;
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can refund order
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to refund this order" });
      }

      // Can only refund paid orders
      if (order.status !== 'paid' && order.status !== 'fulfilled') {
        return res.status(400).json({ message: "Can only refund paid or fulfilled orders" });
      }

      // Check for payment intent ID 
      const paymentIntentId = order.stripePaymentIntentId;
      if (!paymentIntentId) {
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      // Create Stripe refund — distribute across all payment intents if needed
      let refundResult: { totalRefunded: number; remaining: number; lastError: string | null } | null = null;
      {
        const amountPaid = parseFloat(order.amountPaid || '0');
        let amountToRefundPounds = amountPaid; // default: full refund

        if (amount && amount !== '') {
          const parsed = parseFloat(amount);
          if (!isNaN(parsed) && parsed > 0) amountToRefundPounds = parsed;
        }

        refundResult = await refundAcrossPaymentIntents(
          stripe,
          paymentIntentId,
          amountToRefundPounds,
          { order_id: id.toString(), reason: reason || 'Wholesaler initiated refund' }
        );

        if (refundResult.totalRefunded === 0) {
          return res.status(400).json({
            message: `Refund failed: ${refundResult.lastError || 'Could not refund from any payment intent'}`,
            error: refundResult.lastError
          });
        }
      }
      const refundedAmount = refundResult?.totalRefunded ?? 0;

      // Update order status to refunded or add refund note
      const orderTotal = parseFloat(order.total || '0');
      const isFullRefund = refundedAmount >= orderTotal - 0.01;
      let updatedOrder;
      if (isFullRefund) {
        // Full refund - cancel order
        updatedOrder = await storage.updateOrderStatus(id, 'refunded');
        
        // Restore stock for refunded orders
        const orderItems = await storage.getOrderItems(id);
        for (const item of orderItems) {
          const product = await storage.getProduct(item.productId!);
          if (product) {
            await storage.updateProductStock(item.productId!, (product.stock ?? 0) + (item.quantity ?? 0));
          }
        }
      } else {
        // Partial refund - keep order active but add note
        const currentNotes = order.notes || '';
        const refundNote = `Partial refund of £${refundedAmount.toFixed(2)} processed. Reason: ${reason || 'N/A'}`;
        await storage.updateOrderNotes(id, currentNotes + '\n' + refundNote);
        updatedOrder = order;
      }

      // Send refund notification and receipt to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          await createStripeRefundReceipt(order, null, wholesaler, customer, reason);
          await sendRefundReceipt(customer, order, null, wholesaler, reason);
        }
      } catch (error) {
        console.error('Failed to send refund receipt:', error);
      }

      res.json({ 
        message: "Refund processed successfully",
        order: updatedOrder,
        refund: { amount: refundedAmount, remaining: refundResult?.remaining ?? 0 },
        stockRestored: isFullRefund
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  });

  // POST /api/orders/:orderId/upload-image
  app.post('/api/orders/:orderId/upload-image', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const { orderId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify order belongs to this wholesaler
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Generate presigned URL for image upload
      const { ObjectStorageService } = await import('../objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      res.json({ uploadURL });
    } catch (error) {
      console.error("❌ Error generating upload URL for order image:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // POST /api/orders/:orderId/save-image
  app.post('/api/orders/:orderId/save-image', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { imageUrl, filename, description } = req.body;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify order belongs to this wholesaler
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Add image to order - normalize the URL for serving
      const { ObjectStorageService } = await import('../objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(imageUrl);
      
      const imageEntry = {
        id: crypto.randomUUID(),
        url: normalizedPath, // Use normalized path for serving
        filename: filename || 'order-image.jpg',
        uploadedAt: new Date().toISOString(),
        description: description || ''
      };
      
      const currentImages = order.orderImages || [];
      const updatedImages = [...currentImages, imageEntry];
      
      await storage.updateOrderImages(parseInt(orderId), updatedImages);
      
      // Send email notification to customer about new photos
      try {
        // Get customer and wholesaler info for email
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          const { sendOrderPhotoNotificationEmail } = await import('../sendgrid-service.js');
          
          const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.businessName || 'Customer';
            
          const wholesalerName = wholesaler.businessName || wholesaler.firstName || 'Your Wholesaler';
          const orderNumber = order.orderNumber || `#${order.id}`;
          
          // Send photo notification email
          await sendOrderPhotoNotificationEmail({
            customerEmail: customer.email,
            customerName: customerName,
            orderNumber: orderNumber,
            wholesalerName: wholesalerName,
            photoCount: 1, // Single photo added
            orderPortalUrl: `https://quikpik.app/customer/${order.wholesalerId}`
          });
          
        }
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : String(emailError);
        console.warn(`[sendgrid] photo notification email failed: ${msg}`);
      }
      
      res.json({ success: true, image: imageEntry });
    } catch (error) {
      console.error("❌ Error saving image to order:", error);
      res.status(500).json({ error: "Failed to save image" });
    }
  });

  // POST /api/orders/:orderId/upload-photo
  app.post('/api/orders/:orderId/upload-photo', requireAuth, requireNotViewer, (req: any, res: any, next: any) => {
    // Run multer middleware so its errors (LIMIT_FILE_SIZE, bad mimetype) can be
    // converted to JSON responses before reaching the async handler below.
    orderPhotoUpload.single('photo')(req, res, (multerErr: any) => {
      if (multerErr) {
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: "File too large (max 10MB)" });
        }
        return res.status(400).json({ error: multerErr.message || "Invalid file" });
      }
      next();
    });
  }, async (req: any, res: any) => {
    try {
      const { orderId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: "No photo file provided" });
      }

      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Upload binary buffer directly from server — no browser CORS needed
      const { ObjectStorageService } = await import('../objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = await objectStorageService.uploadFileBuffer(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );

      const imageEntry = {
        id: crypto.randomUUID(),
        url: normalizedPath,
        filename: req.file.originalname || 'order-image.jpg',
        uploadedAt: new Date().toISOString(),
        description: 'Order photo'
      };

      const currentImages = order.orderImages || [];
      const updatedImages = [...currentImages, imageEntry];
      await storage.updateOrderImages(parseInt(orderId), updatedImages);

      // Send email notification to customer (best-effort)
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        if (customer?.email && wholesaler) {
          const { sendOrderPhotoNotificationEmail } = await import('../sendgrid-service.js');
          const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.businessName || 'Customer';
          const wholesalerName = wholesaler.businessName || wholesaler.firstName || 'Your Wholesaler';
          await sendOrderPhotoNotificationEmail({
            customerEmail: customer.email,
            customerName,
            orderNumber: order.orderNumber || `#${order.id}`,
            wholesalerName,
            photoCount: 1,
            orderPortalUrl: `https://quikpik.app/customer/${order.wholesalerId}`
          });
        }
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : String(emailError);
        console.warn(`[sendgrid] photo notification email (non-fatal) failed: ${msg}`);
      }

      res.json({ success: true, image: imageEntry });
    } catch (error: any) {
      console.error("❌ Error uploading order photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  // DELETE /api/orders/:orderId/delete-image/:imageId
  app.delete('/api/orders/:orderId/delete-image/:imageId', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const { orderId, imageId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify order belongs to this wholesaler
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Remove image from order
      const currentImages = order.orderImages || [];
      const updatedImages = currentImages.filter(img => img.id !== imageId);
      
      await storage.updateOrderImages(parseInt(orderId), updatedImages);
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error deleting image from order:", error);
      res.status(500).json({ error: "Failed to delete image" });
    }
  });

  // POST /api/orders/:id/resend-confirmation
  app.post('/api/orders/:id/resend-confirmation', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can resend confirmation emails
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to resend confirmation for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Send confirmation email to customer
      try {
        // Enrich items with product details for email
        const enrichedItems = await Promise.all(order.items.map(async (item: any) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || `Product #${item.productId}`,
            packDescriptor: formatPackDescriptor(product?.packQuantity || product?.quantityInPack, product?.sizePerUnit || product?.unitSize, product?.unitOfMeasure),
            product: product ? { name: product.name, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(order.retailer, order, enrichedItems, wholesaler);
        res.json({ message: "Confirmation email sent successfully" });
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : String(emailError);
        console.warn(`[sendgrid] resend confirmation email failed: ${msg}`);
        res.status(500).json({ message: "Failed to send confirmation email" });
      }
    } catch (error) {
      console.error("Error resending confirmation email:", error);
      res.status(500).json({ message: "Failed to resend confirmation email" });
    }
  });

  // DELETE /api/orders/bulk-delete
  app.delete("/api/orders/bulk-delete", requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { 
        deleteAll = false, 
        orderIds = [], 
        beforeDate = null, 
        status = null 
      } = req.body;

      // Build the WHERE conditions for orders to delete
      let whereConditions = [eq(orders.wholesalerId, userId)];
      
      if (!deleteAll && orderIds.length > 0) {
        // Delete specific orders
        whereConditions.push(inArray(orders.id, orderIds));
      } else if (beforeDate) {
        // Delete orders before a specific date
        whereConditions.push(lt(orders.createdAt, new Date(beforeDate)));
      }
      
      if (status) {
        // Filter by status
        whereConditions.push(eq(orders.status, status));
      }

      // First, get the orders that will be deleted to count them
      const ordersToDelete = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(...whereConditions));

      if (ordersToDelete.length === 0) {
        return res.json({ 
          message: "No orders found matching the criteria",
          deletedCount: 0 
        });
      }

      const orderIdsToDelete = ordersToDelete.map(order => order.id);

      // Delete in the correct order to maintain referential integrity
      // 1. Delete campaign orders first (if any exist)
      try {
        await db
          .delete(campaignOrders)
          .where(inArray(campaignOrders.orderId, orderIdsToDelete));
      } catch (error) {
      }

      // 2. Delete order items
      await db
        .delete(orderItems)
        .where(inArray(orderItems.orderId, orderIdsToDelete));

      // 3. Finally delete the orders themselves
      await db
        .delete(orders)
        .where(and(...whereConditions));

      res.json({ 
        message: `Successfully deleted ${orderIdsToDelete.length} orders and related data`,
        deletedCount: orderIdsToDelete.length
      });
    } catch (error) {
      console.error("Error bulk deleting orders:", error);
      res.status(500).json({ message: "Failed to delete orders" });
    }
  });

  // POST /api/orders/diagnose-email
  app.post("/api/orders/diagnose-email", async (req, res) => {
    try {
      const { testEmail } = req.body;
      
      if (!testEmail) {
        return res.status(400).json({ message: "Test email is required" });
      }

      const sgMail = (await import('@sendgrid/mail')).default;
      
      if (!process.env.SENDGRID_API_KEY) {
        return res.status(500).json({ message: "SendGrid API key not configured" });
      }

      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      // Send a simple test email with detailed tracking
      const msg = {
        to: testEmail,
        from: 'hello@quikpik.co',
        subject: 'Email Delivery Test - Quikpik Merchant',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Email Delivery Test</h2>
            <p>This is a test email to verify email delivery is working correctly.</p>
            <p><strong>Test Time:</strong> ${new Date().toISOString()}</p>
            <p><strong>From:</strong> Quikpik Merchant Platform</p>
            <p><strong>To:</strong> ${testEmail}</p>
            <div style="background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>Troubleshooting Tips:</h4>
              <ul>
                <li>Check your spam/junk folder</li>
                <li>Add hello@quikpik.co to your contacts</li>
                <li>Check email filters that might be blocking emails</li>
              </ul>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              If you received this email, delivery is working correctly.
            </p>
          </div>
        `,
        tracking_settings: {
          click_tracking: {
            enable: true,
            enable_text: false
          },
          open_tracking: {
            enable: true
          },
          subscription_tracking: {
            enable: false
          }
        }
      };

      const response = await sgMail.send(msg);
      
      res.json({
        message: "Diagnostic email sent successfully",
        sentTo: testEmail,
        statusCode: response[0].statusCode,
        messageId: response[0].headers['x-message-id'],
        deliveryStatus: response[0].statusCode === 202 ? 'accepted' : 'unknown',
        troubleshooting: {
          checkSpamFolder: true,
          addToContacts: 'hello@quikpik.co',
          checkFilters: true
        }
      });
    } catch (error: any) {
      console.error("Email diagnostic error:", error);
      res.status(500).json({ 
        message: "Error sending diagnostic email",
        error: error.message,
        details: error.response?.body
      });
    }
  });

  // GET /api/orders/:id/invoice
  app.get('/api/orders/:id/invoice', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: "Not authorized" });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: "Wholesaler not found" });

      const effectiveWholesaler = await resolveInvoiceWholesaler(order, wholesaler);

      const pdfAmountPaid = order.amountPaid ? parseFloat(order.amountPaid) : undefined;
      const pdfAmountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : undefined;
      const pdfBuffer = await buildInvoicePdf(order, effectiveWholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod), pdfAmountPaid, pdfAmountOutstanding);
      const filename = `invoice-${order.orderNumber || order.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // GET /api/orders/:id/invoice/customer
  app.get('/api/orders/:id/invoice/customer', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });

      const effectiveWholesaler = await resolveInvoiceWholesaler(order, wholesaler);

      const pdfAmountPaid = order.amountPaid ? parseFloat(order.amountPaid) : undefined;
      const pdfAmountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : undefined;
      const pdfBuffer = await buildInvoicePdf(order, effectiveWholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod), pdfAmountPaid, pdfAmountOutstanding);
      const filename = `invoice-${order.orderNumber || order.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating customer invoice:', error);
      res.status(500).json({ message: 'Failed to generate invoice' });
    }
  });

  // POST /api/orders/:id/share-invoice
  app.post('/api/orders/:id/share-invoice', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });

      const effectiveWholesaler = await resolveInvoiceWholesaler(order, wholesaler);

      const customerEmail = order.customerEmail || order.retailer?.email;
      if (!customerEmail) {
        return res.status(400).json({ message: 'No customer email on record for this order' });
      }

      const customerName = order.retailer
        ? ((`${order.retailer.firstName || ''} ${order.retailer.lastName || ''}`.trim()) || order.retailer.businessName || order.customerName || 'Customer')
        : (order.customerName || 'Customer');
      const businessName = effectiveWholesaler.businessName || 'Your Supplier';
      const orderRef = order.orderNumber || `#${order.id}`;
      const invoiceFilename = `invoice-${order.orderNumber || order.id}.pdf`;

      // Show transaction fee only for Stripe-processed payments, not manual (cash/bank transfer) payments
      const pdfAmountPaid = order.amountPaid ? parseFloat(order.amountPaid) : undefined;
      const pdfAmountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : undefined;
      const pdfBuffer = await buildInvoicePdf(order, effectiveWholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod), pdfAmountPaid, pdfAmountOutstanding);
      const pdfAttachment: SendGridAttachment = {
        content: pdfBuffer.toString('base64'),
        filename: invoiceFilename,
        type: 'application/pdf',
        disposition: 'attachment',
      };

      const logoUrl = getEmailLogoUrl(effectiveWholesaler.id, effectiveWholesaler.logoType, effectiveWholesaler.logoUrl);
      const branding = { businessName, logoUrl };

      // Build optional payment section — only show payment link when Connect account is active
      const amountOutstanding = parseFloat(order.amountOutstanding || '0');
      let paymentSection = '';
      if (amountOutstanding > 0.009) {
        const connectReady = await isConnectAccountReady(wholesaler.stripeAccountId, Boolean(wholesaler.isTestAccount));
        if (connectReady && order.stripePaymentLinkUrl) {
          paymentSection =
            `<p style="margin:16px 0 8px;color:#374151;font-size:15px">💳 <strong>Amount due: £${amountOutstanding.toFixed(2)}</strong></p>` +
            emailButton('Pay Now', order.stripePaymentLinkUrl);
        } else {
          paymentSection =
            `<p style="margin:16px 0 0;color:#374151;font-size:14px">💳 <strong>Amount due: £${amountOutstanding.toFixed(2)}</strong> — Please contact us to arrange payment.</p>`;
        }
      }

      const body = emailCard(
        `<p style="margin:0 0 12px;color:#374151;font-size:15px">Hi ${customerName},</p>` +
        `<p style="margin:0 0 16px;color:#374151;font-size:15px">${businessName} is sharing your invoice <strong>${orderRef}</strong> with you. Please find it attached to this email.</p>` +
        paymentSection +
        `<p style="margin:${paymentSection ? '16px' : '0'} 0 0;color:#6b7280;font-size:13px">If you have any questions about this invoice, please get in touch with us directly.</p>`
      );

      const html = wrapCustomerEmail(body, branding, { preheader: `Invoice ${orderRef} from ${businessName}` });

      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
      await sgMail.send({
        to: customerEmail,
        from: 'hello@quikpik.co',
        subject: `Your Invoice from ${businessName} – ${orderRef}`,
        html,
        attachments: [pdfAttachment],
      } as MailDataRequired);

      res.json({ message: `Invoice sent to ${customerEmail}` });
    } catch (error) {
      console.error('Error sharing invoice:', error);
      res.status(500).json({ message: 'Failed to send invoice' });
    }
  });

  // POST /api/orders/:id/share-invoice-whatsapp
  app.post('/api/orders/:id/share-invoice-whatsapp', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });

      const effectiveWholesaler = await resolveInvoiceWholesaler(order, wholesaler);

      const customerPhone = order.customerPhone || order.retailer?.phoneNumber;
      if (!customerPhone) {
        return res.status(400).json({ message: 'No customer phone number on record for this order' });
      }

      const customerName = order.retailer
        ? ((`${order.retailer.firstName || ''} ${order.retailer.lastName || ''}`.trim()) || order.retailer.businessName || order.customerName || 'there')
        : (order.customerName || 'there');
      const businessName = effectiveWholesaler.businessName || wholesaler.businessName || 'Your Supplier';
      const portalLink = `https://quikpik.app/store/${order.wholesalerId}?tab=orders`;

      const message =
        `Hi ${customerName},\n\n` +
        `Your invoice from ${businessName} is ready.\n\n` +
        `View & pay securely here:\n${portalLink}\n\n` +
        `Sent via Quikpik — secure wholesale ordering platform.`;

      const sent = await sendWhatsAppMessage({ to: customerPhone, message });

      if (!sent) {
        return res.status(500).json({ message: 'Failed to send SMS. Please check Twilio configuration.' });
      }

      res.json({ message: 'Invoice sent via SMS' });
    } catch (error) {
      console.error('Error sending invoice via SMS:', error);
      res.status(500).json({ message: 'Failed to send invoice via SMS' });
    }
  });

  // POST /api/orders/:id/send-receipt
  app.post('/api/orders/:id/send-receipt', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can send receipts for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to send receipt for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Get customer data from Stripe payment intent
      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      let customerInfo;
      try {
        const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        if (paymentIntent.metadata) {
          customerInfo = {
            email: paymentIntent.metadata.customerEmail,
            name: paymentIntent.metadata.customerName,
            phone: paymentIntent.metadata.customerPhone
          };
        } else {
          // Fallback to stored data if no metadata
          customerInfo = {
            email: order.customerEmail || order.retailer?.email,
            name: order.customerName || `Customer ${order.id}`,
            phone: order.customerPhone || order.retailer?.phoneNumber
          };
        }
      } catch (stripeError) {
        console.error("Error retrieving Stripe data:", stripeError);
        // Fallback to stored data
        customerInfo = {
          email: order.customerEmail || order.retailer?.email,
          name: order.customerName || `Customer ${order.id}`,
          phone: order.customerPhone || order.retailer?.phoneNumber
        };
      }

      if (!customerInfo.email) {
        return res.status(400).json({ message: "No customer email found for this order" });
      }

      // Get order items with product details
      const orderItems = await storage.getOrderItems(order.id);
      const enrichedItems = await Promise.all(orderItems.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          productName: product?.name || `Product #${item.productId}`,
          packDescriptor: formatPackDescriptor(product?.packQuantity || product?.quantityInPack, product?.sizePerUnit || product?.unitSize, product?.unitOfMeasure),
          product: product ? { name: product.name, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure } : null
        };
      }));

      // Send receipt email using Stripe customer data
      await sendCustomerInvoiceEmail(customerInfo, order, enrichedItems, wholesaler);

      res.json({ 
        success: true, 
        message: `Receipt sent successfully to ${customerInfo.email}`
      });

    } catch (error) {
      console.error("Error sending receipt:", error);
      res.status(500).json({ message: "Failed to send receipt: " + (error instanceof Error ? error.message : String(error)) });
    }
  });

  // GET /api/orders/:id/stripe-customer-data
  app.get('/api/orders/:id/stripe-customer-data', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can view customer data for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view customer data for this order" });
      }

      if (!order.stripePaymentIntentId) {
        return res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

      try {
        const wholesaler = await storage.getUser(order.wholesalerId);
        const stripe = getStripeClient(Boolean(wholesaler?.isTestAccount));
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        const customerData = {
          customerName: paymentIntent.metadata?.customerName || order.customerName || null,
          customerEmail: paymentIntent.metadata?.customerEmail || order.customerEmail || null,
          customerPhone: paymentIntent.metadata?.customerPhone || order.customerPhone || null
        };

        res.json(customerData);
      } catch (stripeError) {
        console.error("Error retrieving Stripe customer data:", stripeError);
        // Return stored data as fallback
        res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ message: "Failed to fetch customer data" });
    }
  });

  // POST /api/orders/:orderId/shipping
  app.post('/api/orders/:orderId/shipping', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      const { serviceId, deliveryAddress, shippingCost } = req.body;

      // Get the order to verify ownership and status
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify this order belongs to the current user (wholesaler)
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to manage this order" });
      }

      // Verify order is confirmed or paid
      if (!order.status || (order.status !== 'paid' && order.status !== 'confirmed')) {
        return res.status(400).json({ message: "Order must be confirmed or paid before creating shipping" });
      }

      // Get user's business address for collection
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Parse delivery address
      let parsedDeliveryAddress;
      try {
        parsedDeliveryAddress = typeof deliveryAddress === 'string' ? JSON.parse(deliveryAddress) : deliveryAddress;
      } catch (error) {
        // If not JSON, treat as a simple string address
        parsedDeliveryAddress = {
          street: deliveryAddress,
          town: "Unknown City",
          postcode: "UNKNOWN",
          country: "GBR"
        };
      }

      // Build collection address from user's business information
      const collectionAddress = {
        contactName: user.businessName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        organisation: user.businessName || '',
        property: user.streetAddress || '1',
        street: user.streetAddress || 'Business Street',
        town: user.city || 'City',
        postcode: user.postalCode || 'SW1A 1AA',
        countryIsoCode: 'GBR'
      };

      // Default parcel dimensions based on order total
      const parcels = [{
        weight: Math.max(2, Math.floor(parseFloat(order.total) / 50)), // Estimate weight based on order value
        length: 30,
        width: 20,
        height: 15,
        value: parseFloat(order.total)
      }];

      const orderRequest = {
        Items: [{
          Id: `quikpik-order-${orderId}`,
          CollectionDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
          Service: { Id: serviceId },
          Parcels: parcels.map((parcel, index) => ({
            Id: `parcel-${index}`,
            Height: parcel.height,
            Length: parcel.length,
            Width: parcel.width,
            Weight: parcel.weight,
            EstimatedValue: parcel.value,
            DeliveryAddress: {
              contactName: `${order.retailer?.firstName || ''} ${order.retailer?.lastName || ''}`.trim() || 'Customer',
              email: order.retailer?.email || '',
              phone: order.retailer?.phoneNumber || '',
              property: parsedDeliveryAddress.street || deliveryAddress,
              street: parsedDeliveryAddress.street || deliveryAddress,
              town: parsedDeliveryAddress.town || 'Unknown City',
              county: parsedDeliveryAddress.county || '',
              postcode: parsedDeliveryAddress.postcode || 'UNKNOWN',
              countryIsoCode: parsedDeliveryAddress.country || 'GBR'
            },
            ContentsSummary: `Order #${orderId} - Wholesale products`
          })),
          CollectionAddress: collectionAddress
        }]
      };

      // Check for demo mode shipping (no real courier integration active)
      if (serviceId.startsWith('demo-') || serviceId.startsWith('test-')) {
        const demoShippingOrder = {
          OrderId: `DEMO-${Date.now()}`,
          Hash: `demo-hash-${orderId}`,
          TotalPrice: shippingCost,
          Status: 'created',
          TrackingNumber: `DEMO${Math.random().toString().substr(2, 8)}`
        };

        // Update the order with demo shipping information
        await storage.updateOrder(parseInt(orderId), {
          shippingOrderId: demoShippingOrder.OrderId,
          shippingHash: demoShippingOrder.Hash,
          shippingTotal: shippingCost.toString(),
          shippingStatus: 'created',
          deliveryCarrier: serviceId,
          deliveryServiceId: serviceId
        });

        res.json({ 
          success: true, 
          shippingOrder: demoShippingOrder,
          message: "Demo shipping order created successfully",
          demoMode: true
        });
      } else {
        // No external courier integration active — generate a local shipping reference.
        const shippingOrder = {
          OrderId: `SHIP-${Date.now()}`,
          Hash: `hash-${orderId}-${Date.now()}`,
          TotalPrice: shippingCost,
          Status: 'created',
          TrackingNumber: `TRK${Math.random().toString().substr(2, 8).toUpperCase()}`
        };

        await storage.updateOrder(parseInt(orderId), {
          shippingOrderId: shippingOrder.OrderId,
          shippingHash: shippingOrder.Hash,
          shippingTotal: shippingCost.toString(),
          shippingStatus: 'created',
          deliveryCarrier: serviceId,
          deliveryServiceId: serviceId
        });

        res.json({ 
          success: true, 
          shippingOrder,
          message: "Shipping order created successfully"
        });
      }
    } catch (error: any) {
      console.error("Error creating order shipping:", error);
      res.status(500).json({ message: "Failed to create shipping order", error: error.message });
    }
  });

  // POST /api/orders/:orderId/generate-balance-link
  app.post('/api/orders/:orderId/generate-balance-link', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;

      // Get the order
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the order belongs to this wholesaler
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const amountOutstanding = parseFloat(order.amountOutstanding || '0');
      if (amountOutstanding <= 0) {
        return res.status(400).json({ error: 'No outstanding balance on this order' });
      }

      // Get customer details
      const customer = await storage.getUser(order.retailerId);
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));

      // Calculate the correct payment amount
      // For unpaid quotes with a deposit percentage, charge only the deposit amount
      // For part_paid quotes, charge the remaining balance
      const orderTotal = parseFloat(order.total || '0');
      const amountPaid = parseFloat(order.amountPaid || '0');
      const depositPercentage = order.depositPercentage || 100;
      
      let paymentAmount: number;
      let paymentLabel: string;
      let paymentDescription: string;
      
      if (order.paymentStatus === 'unpaid' && depositPercentage < 100) {
        // Unpaid quote with deposit - charge the deposit amount
        paymentAmount = orderTotal * (depositPercentage / 100);
        paymentLabel = `Deposit (${depositPercentage}%) - Order ${order.orderNumber}`;
        paymentDescription = `Deposit payment of ${depositPercentage}%. Order total: £${orderTotal.toFixed(2)}`;
      } else {
        // Part paid or full payment - charge outstanding balance
        paymentAmount = amountOutstanding;
        paymentLabel = `Remaining Balance - Order ${order.orderNumber}`;
        paymentDescription = `Payment for remaining balance. Original order total: £${orderTotal.toFixed(2)}`;
      }

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let balanceLinkUseConnect = false;
      if (wholesaler?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            balanceLinkUseConnect = true;
          } else {
          }
        } catch (connectErr: any) {
          console.error(`❌ Balance link Connect account validation failed: ${connectErr.message}`);
        }
      }

      // Wholesaler's proportional cut of this payment (subtotal - 4.6% platform fee, pro-rated)
      const balanceLinkWholesalerTotal = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
      const balanceLinkTransferAmount = orderTotal > 0
        ? Math.round(paymentAmount * (balanceLinkWholesalerTotal / orderTotal) * 100)
        : 0;

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: paymentLabel,
              description: paymentDescription,
            },
            unit_amount: Math.round(paymentAmount * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/customer/payment-success?order=${order.orderNumber}&wholesaler=${wholesalerId}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/store/${wholesalerId}`,
        metadata: {
          orderId: orderId.toString(),
          orderNumber: order.orderNumber || '',
          wholesalerId,
          customerId: order.retailerId,
          isQuote: 'true',
          isBalancePayment: order.paymentStatus === 'part_paid' ? 'true' : 'false',
          depositPercentage: depositPercentage.toString(),
          depositAmount: paymentAmount.toFixed(2),
          totalAmount: orderTotal.toFixed(2),
        },
        customer_email: customer?.email || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        ...(balanceLinkUseConnect && balanceLinkTransferAmount > 0 ? {
          payment_intent_data: {
            transfer_data: {
              destination: wholesaler!.stripeAccountId!,
              amount: balanceLinkTransferAmount,
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

      // Send SMS notification to customer with payment link
      let smsSent = false;
      const customerPhone = order.customerPhone;
      if (customerPhone && session.url) {
        try {
          // Build order items list for SMS (getOrderItems already includes product data)
          let itemsList = '';
          try {
            const orderItemsList = await storage.getOrderItems(orderId);
            const itemsListParts: string[] = [];
            for (const item of orderItemsList) {
              const productName = item.product?.name || `Product #${item.productId}`;
              const total = parseFloat(item.total || '0');
              const unitPrice = parseFloat(item.unitPrice || '0');
              const sellingType = item.sellingType || 'units';
              const promoNote = item.appliedOfferLabel ? ` (${item.appliedOfferLabel})` : '';
              const freeNote = (item.freeItems || 0) > 0 ? ` +${item.freeItems} free` : '';
              itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × £${unitPrice.toFixed(2)} = £${total.toFixed(2)}${promoNote}${freeNote}`);
            }
            itemsList = itemsListParts.length > 0 ? `\n\n📦 Items:\n${itemsListParts.join('\n')}` : '';
          } catch (itemsError) {
            console.error('⚠️ Could not fetch order items for SMS:', itemsError);
          }
          
          // Use the correct payment amount and label in SMS
          const paymentTypeLabel = order.paymentStatus === 'unpaid' && depositPercentage < 100
            ? `Deposit (${depositPercentage}%)`
            : 'Outstanding Balance';
          const smsMessage = `Hi${order.customerName ? ` ${order.customerName.split(' ')[0]}` : ''}! ${wholesaler?.businessName || 'Your supplier'} is requesting payment for Order ${order.orderNumber}.${itemsList}\n\n${paymentTypeLabel}: £${paymentAmount.toFixed(2)}\n\nPay here: ${session.url}\n\nThis link expires in 24 hours.`;
          
          smsSent = await sendWhatsAppMessage({
            to: customerPhone,
            message: smsMessage
          });
          
        } catch (smsError) {
          const msg = smsError instanceof Error ? smsError.message : String(smsError);
          console.warn(`[twilio] send-payment-link WhatsApp failed [orderId=${orderId}]: ${msg}`);
        }
      }

      // Get the updated order to return
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

      res.json({
        success: true,
        paymentLink: session.url,
        amount: paymentAmount.toFixed(2),
        order: updatedOrder,
        smsSent,
        customerPhone: customerPhone || null,
      });

    } catch (error) {
      console.error('❌ Error generating balance payment link:', error);
      res.status(500).json({ error: 'Failed to generate payment link' });
    }
  });

}
