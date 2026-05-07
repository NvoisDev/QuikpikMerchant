import type { Express } from "express";
import crypto from "crypto";

import { getCurrentFeeConfig, getFeeConfigForWholesaler } from "../utils/fee-config";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import { calculateOrderPricing } from "../services/orderPricingService";
import { parseCustomerCookie } from "../utils/customer-auth-cookie";
import { formatDateTime } from "../../shared/utils/date";
import { calculateOfflinePaymentUpdate } from "./order-payment-calculations";
import { isImpersonating } from "../utils/isImpersonating";
import { productBatches } from "@shared/schema";
import { logQuoteActivity } from "../utils/quote-activity";
import { sendCancellationNotification } from "../services/orderCancellationNotificationService";
import {
  storage, db,
  requireAuth, requireNotViewer, requireMemberPermission,
  orders, orderItems, orderCancellationRequests, stockMovements, products, campaignOrders,
  sql, eq, and, or, inArray, lt, isNull, sum, asc,
  getStripeClient, refundAcrossPaymentIntents,
  sendWhatsAppMessage, sendEmail,
  wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge, getEmailLogoUrl,
  generateReadyForCollectionEmail,
  sendOrderStatusNotification,
  getCurrencySymbol, formatPackDescriptor,
  generateOrderNumber, insertOrderSchema,
  z,
  getWholesalerFeeRate,
  sendCustomerInvoiceEmail,
  createStripeRefundReceipt,
  sendRefundReceipt,
} from "./shared";

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

/**
 * Batch-aware unit stock restock helper.
 * - If the order item recorded a batchId: adds quantity back to the original batch
 *   (re-activates it if depleted).  If the batch no longer exists, creates a new
 *   "RETURN-<orderNumber>" batch so stock is never lost.
 * - If no batchId was recorded (legacy) — flat counter update.
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

export function registerOrderLifecycleRoutes(app: Express): void {
  // PUT /api/orders/:orderId/change-delivery-address
  app.put('/api/orders/:orderId/change-delivery-address', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deliveryAddressId } = req.body;

      let customerAuth = req.session?.customerAuth;

      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId } as unknown as typeof customerAuth;
      }

      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const customerOwnsOrder = order.retailerId === customerAuth.customerId ||
                               order.customerPhone === (await storage.getUser(customerAuth.customerId))?.phoneNumber;

      if (!customerOwnsOrder) {
        return res.status(403).json({ error: "Access denied" });
      }

      const changeableStatuses = ['pending', 'confirmed', 'processing'];
      if (!changeableStatuses.includes(order.status)) {
        return res.status(400).json({
          error: "Address cannot be changed",
          message: `Orders with status '${order.status}' cannot be modified`
        });
      }

      const newAddress = await storage.getDeliveryAddress(parseInt(deliveryAddressId));
      if (!newAddress || newAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }

      const formattedAddress = [
        newAddress.addressLine1,
        newAddress.addressLine2,
        newAddress.city,
        newAddress.state,
        newAddress.postalCode,
        newAddress.country
      ].filter(Boolean).join(', ');

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

      const wholesalerId = resolveWholesalerId(req);

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: 'You do not have permission to modify this order' });
      }

      const isPaymentComplete = order.paymentStatus === 'paid' || parseFloat(order.amountOutstanding || '0') <= 0.01;
      const isValidStatus = order.status === 'paid' || order.status === 'items_prepared' || order.status === 'confirmed';
      const isPickup = order.fulfillmentType === 'pickup';

      if (!isValidStatus && !isPaymentComplete && !isPickup) {
        return res.status(400).json({ error: `Order must be paid to mark as ready. Current status: ${order.status}, payment: ${order.paymentStatus}` });
      }

      if (order.readyToCollectAt) {
        return res.status(400).json({ error: 'Order is already marked as ready for collection' });
      }

      const updated = await storage.markOrderReadyForCollection(orderId);
      if (!updated) {
        return res.status(500).json({ error: 'Failed to mark order as ready for collection' });
      }

      // Send email notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);

        if (customer && wholesaler && customer.email) {
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

      // Send SMS/WhatsApp notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);

        if (customer && wholesaler && customer.phoneNumber) {
          const actionType = updated.fulfillmentType === 'pickup' ? 'collection' : 'delivery';
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

      const wholesalerId = resolveWholesalerId(req);

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

      if (paymentUpdate.newPaymentStatus === 'paid' && method !== 'payment_link' && order.stripePaymentLinkId) {
        updateData.stripePaymentLinkUrl = null;
        updateData.stripePaymentLinkId = null;
        try {
          await stripe.checkout.sessions.expire(order.stripePaymentLinkId);
        } catch (stripeErr) {
          console.warn(`⚠️ Could not expire Stripe session for order ${order.orderNumber}:`, stripeErr);
        }
      }

      await db.update(orders).set(updateData).where(eq(orders.id, orderId));

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

      // Send payment notifications (best-effort)
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
          const netAmount = subtotalBase;
          const paidSoFar = paymentUpdate.newAmountPaid;
          const outstanding = paymentUpdate.newAmountOutstanding;
          const methodLabel: Record<string, string> = {
            cash: 'Cash', bank_transfer: 'Bank Transfer', card: 'Card', cheque: 'Cheque',
            pay_later: 'Pay Later', other: 'Other',
          };
          const methodText = methodLabel[method || ''] || 'offline payment';
          const isPaidInFull = paymentUpdate.newPaymentStatus === 'paid';

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
                }, { preheader: `${currencySymbol}${parsedAmount.toFixed(2)} received for order ${order.orderNumber}` }),
                from: `${businessName} via Quikpik <hello@quikpik.co>`,
              });
            } catch (emailErr) {
              const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
              console.warn(`[sendgrid] customer-payment-received email failed [orderId=${order.id}]: ${msg}`);
            }
          }

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

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.wholesalerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      if (order.status !== 'paid') {
        return res.status(400).json({ error: 'Order must be in paid status to mark items as prepared' });
      }

      const updated = await storage.updateOrderStatus(orderId, 'items_prepared');
      if (!updated) {
        return res.status(500).json({ error: 'Failed to update order status' });
      }

      sendOrderStatusNotification({ orderId: updated.id, status: 'items_prepared' }).catch((err) => {
        console.error('❌ Failed to send items prepared notifications:', err);
      });

      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("❌ Error marking order items as prepared:", error);
      res.status(500).json({ error: "Failed to mark order items as prepared" });
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

      let subtotal = 0;
      let orderItemsList: any[] = [];

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

        orderItemsList.push({
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

      const firstProduct = await storage.getProduct(items[0].productId);
      const wholesalerId = firstProduct!.wholesalerId;

      const orderFingerprint = computeOrderFingerprint(
        userId, wholesalerId, items, deliveryAddress, notes, collectionAddressId
      );

      const existingOrder = await storage.getOrderByIdempotencyKey(orderFingerprint);
      if (existingOrder) {
        console.warn(`⚠️  Duplicate order request (key ${orderFingerprint.slice(0, 12)}…) — returning existing order ${existingOrder.id} without side effects`);
        return res.json(existingOrder);
      }

      const feeConfig = await getCurrentFeeConfig();
      const feeRate = await getWholesalerFeeRate(wholesalerId);
      const {
        customerTransactionFee,
        platformFee,
        feePercentageUsed,
        fixedFeeUsed,
      } = calculateOrderPricing({ subtotal, deliveryCost: 0, feeConfig, platformFeeRate: feeRate });

      const wholesalerForVat = await storage.getUser(wholesalerId);
      const vatEnabled = wholesalerForVat?.vatEnabled ?? false;
      const vatRate = parseFloat(wholesalerForVat?.vatRate ?? '0');
      const vatAmount = vatEnabled ? subtotal * vatRate : 0;
      const vatRateApplied = vatEnabled ? vatRate : null;

      const deliveryCost = 0;
      const total = subtotal + vatAmount + deliveryCost + customerTransactionFee;

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
        feePercentageUsed,
        fixedFeeUsed,
        vatAmount: vatAmount.toFixed(2),
        ...(vatRateApplied !== null ? { vatRateApplied: vatRateApplied.toFixed(4) } : {}),
        total: total.toFixed(2),
        deliveryAddress,
        notes,
        status: 'confirmed',
        ...(validatedCollectionAddressId ? { collectionAddressId: validatedCollectionAddressId } : {}),
        idempotencyKey: orderFingerprint,
      });

      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItemsList);
      });

      const isDeduped = order._wasDuplicate === true;
      const wholesaler = await storage.getUser(wholesalerId);
      const customer = await storage.getUser(userId);

      if (!isDeduped && wholesaler && customer) {
        try {
          await sendCustomerInvoiceEmail(customer, order, await Promise.all(orderItemsList.map(async item => {
            const prod = await storage.getProduct(item.productId);
            return {
              ...item,
              productName: prod?.name || 'Product',
              packDescriptor: formatPackDescriptor(prod?.packQuantity || prod?.quantityInPack, prod?.sizePerUnit || prod?.unitSize, prod?.unitOfMeasure),
              product: prod ? { name: prod.name, packQuantity: prod.packQuantity, quantityInPack: prod.quantityInPack, sizePerUnit: prod.sizePerUnit, unitSize: prod.unitSize, unitOfMeasure: prod.unitOfMeasure } : null
            };
          })), wholesaler);
        } catch (emailError) {
          const msg = emailError instanceof Error ? emailError.message : String(emailError);
          console.warn(`[sendgrid] order confirmation email failed: ${msg}`);
        }
      }

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

      const wholesalerId = resolveWholesalerId(req);

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);

      if (updatedOrder) {
        sendOrderStatusNotification({ orderId: updatedOrder.id, status: updatedOrder.status }).catch((err) => {
          console.error('Failed to send order status notifications:', err);
        });
      }

      if (status === 'fulfilled') {
        setTimeout(async () => {
          try {
            await storage.updateOrderStatus(id, 'archived');
          } catch (error) {
            console.error(`Failed to auto-archive order ${id}:`, error);
          }
        }, 24 * 60 * 60 * 1000);
      }

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
      const wholesalerId = resolveWholesalerId(req);
      const { reason, reasonCategory, returnedItems, processRefund, refundType, refundDelivery } = req.body;
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      if (order.status === 'cancelled') {
        return res.status(400).json({ message: "Order is already cancelled" });
      }

      const orderItemsList = await storage.getOrderItems(id);
      const skipRestock = order.restockStatus === 'completed';

      // Compute cancellation scope up-front so newStatus is available inside the stock-restore transaction
      let isFullCancellation = !returnedItems || returnedItems.length === 0;
      if (!isFullCancellation && returnedItems && returnedItems.length > 0) {
        const allItemsFullyReturned = orderItemsList.every(orderItem => {
          const returnItem = returnedItems.find((ri: any) => ri.productId === orderItem.productId);
          return returnItem && returnItem.quantity >= orderItem.quantity;
        });
        if (allItemsFullyReturned && returnedItems.length >= orderItemsList.length) isFullCancellation = true;
      }
      const newStatus = isFullCancellation ? 'cancelled' : order.status;

      // Pre-compute refundAmount (pure arithmetic — no extra DB calls needed)
      let refundAmount = 0;
      if (returnedItems && returnedItems.length > 0) {
        for (const returnItem of returnedItems) {
          const orderItem = orderItemsList.find(oi => oi.productId === returnItem.productId);
          if (orderItem) refundAmount += parseFloat(orderItem.unitPrice) * Math.min(returnItem.quantity, orderItem.quantity);
        }
        if (refundDelivery) {
          const allFullyReturned = orderItemsList.every(oi => {
            const ri = returnedItems.find((r: any) => r.productId === oi.productId);
            return ri && ri.quantity >= oi.quantity;
          });
          if (!allFullyReturned) refundAmount += parseFloat(order.deliveryCost || '0');
        }
      } else {
        refundAmount = parseFloat(order.amountPaid || '0');
      }

      // Restore stock atomically; group by product → exactly one movement per product per operation
      let stockRestoredCount = 0;
      if (!skipRestock) {
        type ItemToRestore = { productId: number; qty: number; sellingType: string; batchId: number | null };
        stockRestoredCount = await db.transaction(async (trx) => {
          const today = new Date().toISOString().split('T')[0];

          // Build the list of items to restore
          const itemsToRestore: ItemToRestore[] = [];
          if (returnedItems && returnedItems.length > 0) {
            for (const returnItem of returnedItems) {
              const orderItem = orderItemsList.find(oi => oi.productId === returnItem.productId);
              if (orderItem) {
                itemsToRestore.push({ productId: returnItem.productId, qty: Math.min(returnItem.quantity, orderItem.quantity), sellingType: (returnItem.sellingType || orderItem.sellingType) ?? 'units', batchId: orderItem.batchId ?? null });
              }
            }
          } else {
            for (const item of orderItemsList) {
              if (!item.productId) continue;
              // idempotency guard: only restore if a purchase movement was recorded (prevents over-restore on retry)
              const [purchaseMovement] = await trx.select({ id: stockMovements.id }).from(stockMovements)
                .where(and(eq(stockMovements.orderId, id), eq(stockMovements.productId, item.productId), eq(stockMovements.movementType, 'purchase'))).limit(1);
              if (!purchaseMovement) continue;
              itemsToRestore.push({ productId: item.productId, qty: item.quantity ?? 0, sellingType: item.sellingType ?? 'units', batchId: item.batchId ?? null });
            }
          }

          // Aggregate by (product, sellingType) for exactly one movement per (product, sellingType) per operation
          type ProductGroup = { productId: number; qty: number; sellingType: string; batches: { batchId: number | null; qty: number }[] };
          const productGroups = new Map<string, ProductGroup>();
          for (const r of itemsToRestore) {
            const key = `${r.productId}_${r.sellingType}`;
            const existing = productGroups.get(key);
            if (existing) { existing.qty += r.qty; existing.batches.push({ batchId: r.batchId, qty: r.qty }); }
            else productGroups.set(key, { productId: r.productId, qty: r.qty, sellingType: r.sellingType, batches: [{ batchId: r.batchId, qty: r.qty }] });
          }

          let restored = 0;
          for (const [, group] of productGroups) {
            const { productId } = group;
            const [product] = await trx.select().from(products).where(eq(products.id, productId)).limit(1);
            if (!product) continue;

            // Idempotency is handled at the outer level via skipRestock (restockStatus === 'completed').
            // Each productId appears exactly once per call (Map), so one movement per product is guaranteed.
            if (group.sellingType === 'pallets') {
              const palletStockBefore = product.palletStock || 0;
              const newPalletStock = palletStockBefore + group.qty;
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newUnitStock = (product.stock ?? 0) + group.qty * qip * upp;
              await trx.update(products).set({ palletStock: newPalletStock, stock: newUnitStock }).where(eq(products.id, productId));
              // Cancel is a one-time-per-lifecycle op; guard prevents duplicates on concurrent retry within the race window before restockStatus commits
              const [exCancelPalMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'pallets'), sql`${stockMovements.reason} LIKE 'Order cancellation —%'`)).limit(1);
              if (!exCancelPalMov) await trx.insert(stockMovements).values({ productId, wholesalerId: order.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'pallets', stockBefore: palletStockBefore, stockAfter: newPalletStock, reason: `Order cancellation — ${group.qty} pallets returned`, orderId: id, businessProfileId: order.businessProfileId ?? null });
            } else {
              const unitStockBefore = product.stock || 0;
              // Restore each batch individually; fall back to a return batch if original not found
              for (const batchInfo of group.batches) {
                if (batchInfo.batchId) {
                  const [origBatch] = await trx.select().from(productBatches).where(eq(productBatches.id, batchInfo.batchId)).limit(1);
                  if (origBatch && origBatch.productId === productId) {
                    await trx.update(productBatches).set({ quantity: origBatch.quantity + batchInfo.qty, status: 'active', updatedAt: new Date() }).where(eq(productBatches.id, batchInfo.batchId));
                  } else {
                    await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${order.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Return restock from cancellation of order ${order.orderNumber}` });
                  }
                } else {
                  await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${order.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Legacy return restock from cancellation of order ${order.orderNumber}` });
                }
              }
              // Recalc stock from batch sum (single source of truth)
              const [batchSumRow] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
                .where(and(eq(productBatches.productId, productId), eq(productBatches.status, 'active'), or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)));
              const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
              await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock }).where(eq(products.id, productId));
              const [exCancelUnitMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'units'), sql`${stockMovements.reason} LIKE 'Order cancellation —%'`)).limit(1);
              if (!exCancelUnitMov) await trx.insert(stockMovements).values({ productId, wholesalerId: order.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'units', stockBefore: unitStockBefore, stockAfter: newUnitStock, reason: `Order cancellation — ${group.qty} units returned`, orderId: id, businessProfileId: order.businessProfileId ?? null });
            }
            restored += group.qty;
          }
          // Set order status atomically with stock restoration
          await trx.update(orders).set({ status: newStatus, restockStatus: 'completed', cancelledAt: isFullCancellation ? new Date() : undefined, refundReason: reason || 'Customer requested cancellation' }).where(eq(orders.id, id));
          return restored;
        });
      }

      let stripeRefundTotalPounds = 0;
      let stripeRefundError: string | null = null;
      const amountPaid = parseFloat(order.amountPaid || '0');
      const orderTotal = parseFloat(order.total || '0');
      const currentRefunded = parseFloat(order.amountRefunded || '0');

      if (processRefund && amountPaid > 0 && order.stripePaymentIntentId && stripe) {
        const refundAmountToProcess = isFullCancellation && orderTotal > 0
          ? orderTotal
          : refundAmount;
        const refundCeiling = isFullCancellation ? (orderTotal > 0 ? orderTotal : amountPaid) : amountPaid;
        const remainingRefundable = Math.max(0, refundCeiling - currentRefunded);
        const effectiveRefundAmount = Math.min(refundAmountToProcess, remainingRefundable);
        if (remainingRefundable <= 0.01) {
          // already fully refunded
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
            stripeRefundError = `£${result.remaining.toFixed(2)} could not be refunded automatically`;
          }
        }
      }

      const amountPaidNum = parseFloat(order.amountPaid || '0');
      let totalRefunded = currentRefunded + stripeRefundTotalPounds;

      if (isFullCancellation && totalRefunded === 0 && amountPaidNum > 0) {
        totalRefunded = amountPaidNum;
      }

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

      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        await sendCancellationNotification({
          order, orderItems: orderItemsList, customer, wholesaler,
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
      const wholesalerId = resolveWholesalerId(req);

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
      const wholesalerId = resolveWholesalerId(req);

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

  // POST /api/cancellation-requests/:id/respond
  app.post('/api/cancellation-requests/:id/respond', requireAuth, requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      if (isNaN(requestId)) return res.status(400).json({ error: 'Invalid request ID' });
      const wholesalerId = resolveWholesalerId(req);
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

      await db.update(orderCancellationRequests)
        .set({
          status: newStatus,
          respondedAt: new Date(),
          respondedBy: req.user.id,
          responseMessage: responseMessage || null,
          refundType: approved ? (refundType || 'card') : null,
        })
        .where(eq(orderCancellationRequests.id, requestId));

      let custCancelStripeRefunded = 0;
      let custCancelAmountPaid = 0;
      if (approved) {
        const order = await storage.getOrder(request.orderId);
        if (order) {
          const orderItemsList = await storage.getOrderItems(order.id);
          const skipCustRestock = order.restockStatus === 'completed';

          if (!skipCustRestock) {
            await db.transaction(async (trx) => {
              const today = new Date().toISOString().split('T')[0];
              // Aggregate by (product, sellingType) for exactly one movement per (product, sellingType) per operation
              type CustGroup = { productId: number; qty: number; sellingType: string; batches: { batchId: number | null; qty: number }[] };
              const custGroups = new Map<string, CustGroup>();
              for (const item of orderItemsList) {
                if (!item.productId) continue;
                const sellingTypeC = item.sellingType ?? 'units';
                const key = `${item.productId}_${sellingTypeC}`;
                const existing = custGroups.get(key);
                if (existing) { existing.qty += item.quantity ?? 0; existing.batches.push({ batchId: item.batchId ?? null, qty: item.quantity ?? 0 }); }
                else custGroups.set(key, { productId: item.productId, qty: item.quantity ?? 0, sellingType: sellingTypeC, batches: [{ batchId: item.batchId ?? null, qty: item.quantity ?? 0 }] });
              }
              for (const [, group] of custGroups) {
                const { productId } = group;
                const [product] = await trx.select().from(products).where(eq(products.id, productId)).limit(1);
                if (!product) continue;
                // Idempotency via outer skipCustRestock gate + reason-scoped per-movement guard below.
                // Each (product, sellingType) appears once per call (Map), so one movement per combination is guaranteed.
                if (group.sellingType === 'pallets') {
                  const palletStockBefore = product.palletStock || 0;
                  const newPalletStock = palletStockBefore + group.qty;
                  const qip = product.quantityInPack ?? 1;
                  const upp = product.unitsPerPallet ?? 1;
                  const newUnitStock = (product.stock ?? 0) + group.qty * qip * upp;
                  await trx.update(products).set({ palletStock: newPalletStock, stock: newUnitStock }).where(eq(products.id, productId));
                  // Customer-cancel approval is one-time-per-lifecycle; guard prevents concurrent-retry duplicates
                  const [exCustPalMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, order.id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'pallets'), sql`${stockMovements.reason} LIKE 'Order cancellation (customer request)%'`)).limit(1);
                  if (!exCustPalMov) await trx.insert(stockMovements).values({ productId, wholesalerId: order.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'pallets', stockBefore: palletStockBefore, stockAfter: newPalletStock, reason: `Order cancellation (customer request) — ${group.qty} pallets returned`, orderId: order.id, businessProfileId: order.businessProfileId ?? null });
                } else {
                  const unitStockBefore = product.stock || 0;
                  for (const batchInfo of group.batches) {
                    if (batchInfo.batchId) {
                      const [origBatch] = await trx.select().from(productBatches).where(eq(productBatches.id, batchInfo.batchId)).limit(1);
                      if (origBatch && origBatch.productId === productId) {
                        await trx.update(productBatches).set({ quantity: origBatch.quantity + batchInfo.qty, status: 'active', updatedAt: new Date() }).where(eq(productBatches.id, batchInfo.batchId));
                      } else {
                        await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${order.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Return restock from customer cancellation of order ${order.orderNumber}` });
                      }
                    } else {
                      await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${order.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Legacy return restock from customer cancellation of order ${order.orderNumber}` });
                    }
                  }
                  const [batchSumRow] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
                    .where(and(eq(productBatches.productId, productId), eq(productBatches.status, 'active'), or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)));
                  const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
                  const qip = product.quantityInPack ?? 1;
                  const upp = product.unitsPerPallet ?? 1;
                  const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
                  await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock }).where(eq(products.id, productId));
                  const [exCustUnitMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, order.id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'units'), sql`${stockMovements.reason} LIKE 'Order cancellation (customer request)%'`)).limit(1);
                  if (!exCustUnitMov) await trx.insert(stockMovements).values({ productId, wholesalerId: order.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'units', stockBefore: unitStockBefore, stockAfter: newUnitStock, reason: `Order cancellation (customer request) — ${group.qty} units returned`, orderId: order.id, businessProfileId: order.businessProfileId ?? null });
                }
              }
            });
          }

          custCancelAmountPaid = parseFloat(order.total || order.amountPaid || '0');

          const custAlreadyRefunded = parseFloat(order.amountRefunded || '0') > 0;

          if (refundType === 'card' && custCancelAmountPaid > 0 && order.stripePaymentIntentId && !custAlreadyRefunded) {
            const custRefundIdempotencyKey = `cancellation-request-${requestId}-refund`;
            const result = await refundAcrossPaymentIntents(
              stripe,
              order.stripePaymentIntentId,
              custCancelAmountPaid,
              { order_id: order.id.toString(), reason: `Customer request: ${request.reasonCategory}` },
              custRefundIdempotencyKey
            );
            custCancelStripeRefunded = result.totalRefunded;
          }

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

      // Notify customer about the decision
      try {
        const order = await storage.getOrder(request.orderId);
        const wholesaler = await storage.getUser(request.wholesalerId);

        if (order) {
          if (approved && wholesaler) {
            const orderItemsList = await storage.getOrderItems(order.id);
            const customer = {
              firstName: order.customerName,
              phoneNumber: order.customerPhone,
              email: order.customerEmail,
            };
            await sendCancellationNotification({
              order,
              orderItems: orderItemsList,
              customer,
              wholesaler,
              isFullCancellation: true,
              stripeRefundTotalPounds: custCancelStripeRefunded,
              refundAmount: custCancelAmountPaid,
              refundType: (refundType as 'card' | 'later' | 'none') ?? 'none',
              emailSubject: `Cancellation Approved - Order ${order.orderNumber}`,
              emailFrom: 'hello@quikpik.co',
              emailPreheader: `Your order ${order.orderNumber} cancellation has been approved`,
            });
          } else if (!approved) {
            const businessName = wholesaler?.businessName || 'the seller';
            const customerName = order.customerName || 'Customer';

            if (order.customerPhone) {
              const message = `❌ Your cancellation request for order ${order.orderNumber} has been declined by ${businessName}.${responseMessage ? ` Reason: ${responseMessage}` : ''} Please contact the seller for more information.`;
              await sendWhatsAppMessage({ to: order.customerPhone, message });
            }

            if (order.customerEmail) {
              const rejectedCancelBody = `${emailHeading('Cancellation Request Update', { size: '22px' })}<p style="margin:0 0 8px">Hi ${customerName},</p><p style="margin:0 0 20px">We regret to inform you that your cancellation request for <strong>Order ${order.orderNumber}</strong> has been declined.</p>${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Reason:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`, { borderColor: '#FECACA', bgColor: '#FEF2F2' }) : ''}${emailCard(`${emailHeading("What's Next?", { size: '16px', color: '#EA580C' })}<p style="margin:0 0 8px">Your order remains active. If you have any questions or concerns, please contact us directly:</p><p style="margin:0 0 4px"><strong>${businessName}</strong></p>${wholesaler?.phoneNumber ? `<p style="margin:0 0 4px">Phone: ${wholesaler.phoneNumber}</p>` : ''}${wholesaler?.email ? `<p style="margin:0">Email: ${wholesaler.email}</p>` : ''}`, { borderColor: '#FED7AA', bgColor: '#FFF7ED' })}`;
              await sendEmail({
                to: order.customerEmail,
                from: 'hello@quikpik.co',
                subject: `Order ${order.orderNumber} - Cancellation Request Update`,
                html: wrapCustomerEmail(rejectedCancelBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Update on your cancellation request for order ${order.orderNumber}` }),
              });
            }
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

      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to refund this order" });
      }

      if (order.status !== 'paid' && order.status !== 'fulfilled') {
        return res.status(400).json({ message: "Can only refund paid or fulfilled orders" });
      }

      const paymentIntentId = order.stripePaymentIntentId;
      if (!paymentIntentId) {
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      let refundResult: { totalRefunded: number; remaining: number; lastError: string | null } | null = null;
      {
        const amountPaid = parseFloat(order.amountPaid || '0');
        let amountToRefundPounds = amountPaid;

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

      const orderTotal = parseFloat(order.total || '0');
      const isFullRefund = refundedAmount >= orderTotal - 0.01;
      let updatedOrder;
      if (isFullRefund) {
        // Restore stock and mark as refunded atomically so partial failures roll back
        await db.transaction(async (trx) => {
          await trx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, id));

          const refundItemsList = await trx.select().from(orderItems).where(eq(orderItems.orderId, id));
          const today = new Date().toISOString().split('T')[0];

          // Aggregate by (product, sellingType) for exactly one movement per (product, sellingType) per operation
          type RefundGroup = { productId: number; qty: number; sellingType: string; batches: { batchId: number | null; qty: number }[] };
          const refundGroups = new Map<string, RefundGroup>();
          for (const item of refundItemsList) {
            if (!item.productId) continue;
            const sellingTypeR = item.sellingType ?? 'units';
            const key = `${item.productId}_${sellingTypeR}`;
            const existing = refundGroups.get(key);
            if (existing) { existing.qty += item.quantity ?? 0; existing.batches.push({ batchId: item.batchId ?? null, qty: item.quantity ?? 0 }); }
            else refundGroups.set(key, { productId: item.productId, qty: item.quantity ?? 0, sellingType: sellingTypeR, batches: [{ batchId: item.batchId ?? null, qty: item.quantity ?? 0 }] });
          }

          for (const [, group] of refundGroups) {
            const { productId } = group;
            const [product] = await trx.select().from(products).where(eq(products.id, productId)).limit(1);
            if (!product) continue;

            // Idempotency via outer status gate + reason-scoped per-movement guard below.
            // Each (product, sellingType) appears once per call (Map), so one movement per combination is guaranteed.
            if (group.sellingType === 'pallets') {
              const palletStockBefore = product.palletStock || 0;
              const newPalletStock = palletStockBefore + group.qty;
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newUnitStock = (product.stock ?? 0) + group.qty * qip * upp;
              await trx.update(products).set({ palletStock: newPalletStock, stock: newUnitStock }).where(eq(products.id, productId));
              // Refund is a one-time-per-lifecycle op; guard prevents concurrent-retry duplicates
              const [exRefundPalMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'pallets'), sql`${stockMovements.reason} LIKE 'Full refund%'`)).limit(1);
              if (!exRefundPalMov) await trx.insert(stockMovements).values({ productId, wholesalerId: order.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'pallets', stockBefore: palletStockBefore, stockAfter: newPalletStock, reason: `Full refund — ${group.qty} pallets returned`, orderId: id, businessProfileId: order.businessProfileId ?? null });
            } else {
              const unitStockBefore = product.stock || 0;
              // Restore each batch individually; create a return batch if the original is missing
              for (const batchInfo of group.batches) {
                if (batchInfo.batchId) {
                  const [origBatch] = await trx.select().from(productBatches).where(eq(productBatches.id, batchInfo.batchId)).limit(1);
                  if (origBatch && origBatch.productId === productId) {
                    await trx.update(productBatches).set({ quantity: origBatch.quantity + batchInfo.qty, status: 'active', updatedAt: new Date() }).where(eq(productBatches.id, batchInfo.batchId));
                  } else {
                    // Batch not found or mismatched — create return batch so no units are lost
                    await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${order.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Return restock from full refund of order ${order.orderNumber}` });
                  }
                } else {
                  await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${order.orderNumber}`, quantity: batchInfo.qty, status: 'active', notes: `Legacy return restock from full refund of order ${order.orderNumber}` });
                }
              }
              // Recalc stock from batch sum (single source of truth)
              const [batchSumRow] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
                .where(and(eq(productBatches.productId, productId), eq(productBatches.status, 'active'), or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)));
              const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
              await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock }).where(eq(products.id, productId));
              const [exRefundUnitMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'units'), sql`${stockMovements.reason} LIKE 'Full refund%'`)).limit(1);
              if (!exRefundUnitMov) await trx.insert(stockMovements).values({ productId, wholesalerId: order.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'units', stockBefore: unitStockBefore, stockAfter: newUnitStock, reason: `Full refund — ${group.qty} units returned`, orderId: id, businessProfileId: order.businessProfileId ?? null });
            }
          }
        });
        updatedOrder = await storage.getOrder(id);
      } else {
        const currentNotes = order.notes || '';
        const refundNote = `Partial refund of £${refundedAmount.toFixed(2)} processed. Reason: ${reason || 'N/A'}`;
        await storage.updateOrderNotes(id, currentNotes + '\n' + refundNote);
        updatedOrder = order;
      }

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

      let whereConditions = [eq(orders.wholesalerId, userId)];

      if (!deleteAll && orderIds.length > 0) {
        whereConditions.push(inArray(orders.id, orderIds));
      } else if (beforeDate) {
        whereConditions.push(lt(orders.createdAt, new Date(beforeDate)));
      }

      if (status) {
        whereConditions.push(eq(orders.status, status));
      }

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

      // Delete campaign orders first (optional link — failures are intentionally tolerated)
      try {
        await db.delete(campaignOrders).where(inArray(campaignOrders.orderId, orderIdsToDelete));
      } catch (_) { /* campaignOrders rows may not exist for every order */ }

      // Restore stock + delete order data in one atomic transaction to prevent partial state
      const ordersFullData = await db.select().from(orders).where(inArray(orders.id, orderIdsToDelete));
      await db.transaction(async (trx) => {
        const today = new Date().toISOString().split('T')[0];
        for (const ord of ordersFullData) {
          const items = await trx.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
          // Group by (product, sellingType) for one movement per (product, sellingType)
          type DelGroup = { productId: number; qty: number; sellingType: string; batches: { batchId: number | null; qty: number }[] };
          const delGroups = new Map<string, DelGroup>();
          for (const item of items) {
            if (!item.productId) continue;
            const [purchMov] = await trx.select({ id: stockMovements.id }).from(stockMovements)
              .where(and(eq(stockMovements.orderId, ord.id), eq(stockMovements.productId, item.productId), eq(stockMovements.movementType, 'purchase'))).limit(1);
            // Use restockStatus (business state) rather than retMov existence to detect already-restocked orders.
            // retMov would also match invoice-edit 'return' movements, causing false skips.
            if (!purchMov || ord.restockStatus === 'completed') continue; // no purchase, or already restocked via cancel/refund
            const sellingTypeD = item.sellingType ?? 'units';
            const keyD = `${item.productId}_${sellingTypeD}`;
            const existing = delGroups.get(keyD);
            if (existing) { existing.qty += item.quantity ?? 0; existing.batches.push({ batchId: item.batchId ?? null, qty: item.quantity ?? 0 }); }
            else delGroups.set(keyD, { productId: item.productId, qty: item.quantity ?? 0, sellingType: sellingTypeD, batches: [{ batchId: item.batchId ?? null, qty: item.quantity ?? 0 }] });
          }
          for (const [, group] of delGroups) {
            const { productId } = group;
            const [product] = await trx.select().from(products).where(eq(products.id, productId)).limit(1);
            if (!product) continue;
            // Idempotency for bulk delete is handled by the restockStatus guard above.
            // Each productId appears exactly once per order per call (Map), so one movement per product is guaranteed.
            if (group.sellingType === 'pallets') {
              const palletStockBefore = product.palletStock || 0;
              const newPalletStock = palletStockBefore + group.qty;
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newUnitStock = (product.stock ?? 0) + group.qty * qip * upp;
              await trx.update(products).set({ palletStock: newPalletStock, stock: newUnitStock }).where(eq(products.id, productId));
              // Bulk-delete is one-time-per-lifecycle (outer restockStatus guard + reason-scoped inner guard prevent duplicate movements)
              const [exDelPalMov] = await trx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderId, ord.id), eq(stockMovements.productId, productId), eq(stockMovements.movementType, 'return'), eq(stockMovements.unitType, 'pallets'), sql`${stockMovements.reason} LIKE 'Bulk delete%'`)).limit(1);
              if (!exDelPalMov) await trx.insert(stockMovements).values({ productId, wholesalerId: ord.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'pallets', stockBefore: palletStockBefore, stockAfter: newPalletStock, reason: `Bulk delete — ${group.qty} pallets returned from order ${ord.orderNumber}`, orderId: ord.id, businessProfileId: ord.businessProfileId ?? null });
            } else {
              const unitStockBefore = product.stock || 0;
              for (const b of group.batches) {
                if (b.batchId) {
                  const [origBatch] = await trx.select().from(productBatches).where(eq(productBatches.id, b.batchId)).limit(1);
                  if (origBatch && origBatch.productId === productId) {
                    await trx.update(productBatches).set({ quantity: origBatch.quantity + b.qty, status: 'active', updatedAt: new Date() }).where(eq(productBatches.id, b.batchId));
                  } else {
                    await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${ord.orderNumber}`, quantity: b.qty, status: 'active', notes: `Return restock from deletion of order ${ord.orderNumber}` });
                  }
                } else {
                  await trx.insert(productBatches).values({ productId, batchNumber: `RETURN-${ord.orderNumber}`, quantity: b.qty, status: 'active', notes: `Legacy return restock from deletion of order ${ord.orderNumber}` });
                }
              }
              const [batchSumRow] = await trx.select({ total: sum(productBatches.quantity) }).from(productBatches)
                .where(and(eq(productBatches.productId, productId), eq(productBatches.status, 'active'), or(isNull(productBatches.expiryDate), sql`${productBatches.expiryDate} >= ${today}`)));
              const newUnitStock = parseInt(String(batchSumRow?.total ?? 0), 10);
              const qip = product.quantityInPack ?? 1;
              const upp = product.unitsPerPallet ?? 1;
              const newPalletStock = (qip > 0 && upp > 0) ? Math.floor(Math.floor(newUnitStock / qip) / upp) : 0;
              await trx.update(products).set({ stock: newUnitStock, palletStock: newPalletStock }).where(eq(products.id, productId));
              await trx.insert(stockMovements).values({ productId, wholesalerId: ord.wholesalerId, movementType: 'return', quantity: group.qty, unitType: 'units', stockBefore: unitStockBefore, stockAfter: newUnitStock, reason: `Bulk delete — ${group.qty} units returned from order ${ord.orderNumber}`, orderId: ord.id, businessProfileId: ord.businessProfileId ?? null });
            }
          }
        }
        await trx.delete(orderItems).where(inArray(orderItems.orderId, orderIdsToDelete));
        await trx.delete(orders).where(and(...whereConditions));
      });

      res.json({
        message: `Successfully deleted ${orderIdsToDelete.length} orders and related data`,
        deletedCount: orderIdsToDelete.length
      });
    } catch (error) {
      console.error("Error bulk deleting orders:", error);
      res.status(500).json({ message: "Failed to delete orders" });
    }
  });
}
