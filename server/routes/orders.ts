import type { Express } from "express";
import { calculateOfflinePaymentUpdate } from "./order-payment-calculations";
import {
  SendGridAttachment, and, buildInvoicePdf, buildItemisedRefundEmail, campaignOrders, count,
  createStripeRefundReceipt, db, desc, emailBadge, emailButton, emailCard, emailHeading, eq,
  generateOrderNumber, generateReadyForCollectionEmail, getCurrencySymbol, getEmailLogoUrl,
  inArray, insertOrderSchema, lt, multer, or, orderCancellationRequests, orderItems,
  orderNotificationService, orderPhotoUpload, orders, products,
  refundAcrossPaymentIntents, requireAuth, requireNotViewer, sendCustomerInvoiceEmail, sendEmail,
  sendRefundReceipt, sendSMS, sgMail, sql, stockMovements, storage, stripe, sum,
  wrapCustomerEmail, z, cancellationRefundTypeToEmailStatus
} from "./shared";
import { productBatches } from "@shared/schema";
import type { CancellationRefundType } from "./shared";

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
  orderNumber: string
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
          orderId
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
      wholesalerId
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
  });
}

export function registerOrderRoutes(app: Express): void {
  // PUT /api/orders/:orderId/change-delivery-address
  app.put('/api/orders/:orderId/change-delivery-address', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deliveryAddressId } = req.body;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify order exists and belongs to customer
      const order = await storage.getOrderById(parseInt(orderId));
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
      if (!newAddress || newAddress.customerId !== customerAuth.customerId || newAddress.wholesalerId !== order.wholesalerId) {
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
      
      console.log(`📍 Updated order ${orderId} delivery address to address ID ${deliveryAddressId} for customer ${customerAuth.customerId}`);
      
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
  app.put('/api/orders/:id/ready-for-collection', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      console.log(`📦 Ready for collection request for order ID: ${orderId}`);
      
      if (isNaN(orderId)) {
        console.log(`❌ Invalid order ID: ${req.params.id}`);
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      // Get order directly by ID for efficiency
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log(`🔍 Looking up order ${orderId} for wholesaler ${wholesalerId}`);
      
      // Fetch order directly from database
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        console.log(`❌ Order ${orderId} not found in database`);
        return res.status(404).json({ error: 'Order not found' });
      }

      console.log(`📋 Order found: ${order.orderNumber}, status: ${order.status}, wholesaler: ${order.wholesalerId}`);

      // Verify the order belongs to this wholesaler
      if (order.wholesalerId !== wholesalerId) {
        console.log(`❌ Order ${orderId} belongs to ${order.wholesalerId}, not ${wholesalerId}`);
        return res.status(403).json({ error: 'You do not have permission to modify this order' });
      }

      // Allow transition from 'paid' or 'items_prepared' status directly to ready_for_collection
      // Also allow if paymentStatus is 'paid' (for orders where balance was paid but status wasn't updated)
      // Also always allow collection/pickup orders — customer pays on arrival
      const isPaymentComplete = order.paymentStatus === 'paid' || parseFloat(order.amountOutstanding || '0') <= 0.01;
      const isValidStatus = order.status === 'paid' || order.status === 'items_prepared' || order.status === 'confirmed';
      const isPickup = order.fulfillmentType === 'pickup';
      
      if (!isValidStatus && !isPaymentComplete && !isPickup) {
        console.log(`❌ Order status is ${order.status}, paymentStatus is ${order.paymentStatus}, cannot mark as ready`);
        return res.status(400).json({ error: `Order must be paid to mark as ready. Current status: ${order.status}, payment: ${order.paymentStatus}` });
      }
      
      // If payment is complete but status wasn't updated, log it for debugging
      if (isPaymentComplete && order.status !== 'paid') {
        console.log(`⚠️ Order ${orderId} has complete payment (${order.paymentStatus}) but status is ${order.status} - allowing ready for collection`);
      }

      // Check if already marked as ready
      if (order.readyToCollectAt) {
        console.log(`❌ Order ${orderId} already marked as ready at ${order.readyToCollectAt}`);
        return res.status(400).json({ error: 'Order is already marked as ready for collection' });
      }

      const actionType = order.fulfillmentType === 'pickup' ? 'collection' : 'delivery';
      console.log(`📦 Marking order ${orderId} as ready for ${actionType}`);

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
          const emailData = generateReadyForCollectionEmail({
            orderNumber: updated.orderNumber,
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber,
            businessAddress: wholesaler.businessAddress,
            deliveryAddress: updated.deliveryAddress || null,
            fulfillmentType: updated.fulfillmentType || 'pickup',
            orderTotal: updated.total,
            readyTime: updated.readyToCollectAt ? updated.readyToCollectAt.toLocaleString() : new Date().toLocaleString(),
            orderUrl: `https://quikpik.app/store/${wholesaler.id}?tab=orders`
          });

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text
          });
          
          console.log(`📧 Ready for collection email sent to ${customer.email}`);
        }
      } catch (emailError) {
        console.error('❌ Failed to send ready for collection email:', emailError);
        // Don't fail the API call if email fails
      }

      // Send SMS notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler && customer.phoneNumber) {
          const actionType = updated.fulfillmentType === 'pickup' ? 'collection' : 'delivery';
          const collectionAddress = wholesaler.pickupAddress || wholesaler.businessAddress || 
            (wholesaler.streetAddress && wholesaler.city 
              ? `${wholesaler.streetAddress}, ${wholesaler.city}${wholesaler.postalCode ? `, ${wholesaler.postalCode}` : ''}`
              : '');
          
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
              itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × £${unitPrice.toFixed(2)} = £${total.toFixed(2)}${promoNote}${freeNote}`);
            }
            itemsList = itemsListParts.length > 0 ? `\n\n📦 Items:\n${itemsListParts.join('\n')}` : '';
          } catch (itemsError) {
            console.error('⚠️ Could not fetch order items for SMS:', itemsError);
          }
          
          const smsMessage = actionType === 'collection'
            ? `🎉 Great news! Your order #${updated.orderNumber} from ${wholesaler.businessName || 'your supplier'} is ready for collection!${itemsList}\n\n📍 Collection Address:\n${collectionAddress || 'Please contact the store for address'}\n\n💰 Order Total: £${parseFloat(updated.total || '0').toFixed(2)}\n\n📞 Questions? Contact: ${wholesaler.businessPhone || wholesaler.phoneNumber || 'N/A'}\n\n- Quikpik`
            : `🎉 Great news! Your order #${updated.orderNumber} from ${wholesaler.businessName || 'your supplier'} is ready for delivery!${itemsList}\n\n💰 Order Total: £${parseFloat(updated.total || '0').toFixed(2)}\n\nThe supplier will contact you to arrange delivery.\n\n📞 Contact: ${wholesaler.businessPhone || wholesaler.phoneNumber || 'N/A'}\n\n- Quikpik`;
          
          const smsSent = await sendSMS({
            to: customer.phoneNumber,
            message: smsMessage
          });
          
          if (smsSent) {
            console.log(`📱 Ready for ${actionType} SMS sent to ${customer.phoneNumber}`);
          } else {
            console.log(`⚠️ SMS not sent (Twilio not configured or failed)`);
          }
        } else {
          console.log(`⚠️ No phone number available for customer ${updated.retailerId}`);
        }
      } catch (smsError) {
        console.error('❌ Failed to send ready for collection SMS:', smsError);
        // Don't fail the API call if SMS fails
      }

      console.log(`✅ Order ${orderId} marked as ready for collection`);
      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("❌ Error marking order as ready for collection:", error);
      res.status(500).json({ error: "Failed to mark order as ready for collection" });
    }
  });

  // POST /api/orders/:id/resend-ready-notification
  app.post("/api/orders/:id/resend-ready-notification", requireAuth, requireNotViewer, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const userId = req.user!.id;

      console.log(`🔄 Resending ready for collection notification for order ${orderId}`);

      // Get order details
      const order = await storage.getOrderById(orderId);
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

      console.log(`📦 Resending ready for collection notification for order ${orderId}`);

      // Send email notification to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer && wholesaler && customer.email) {
          const emailData = generateReadyForCollectionEmail({
            orderNumber: order.orderNumber,
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber,
            businessAddress: wholesaler.businessAddress,
            deliveryAddress: order.deliveryAddress || null,
            fulfillmentType: order.fulfillmentType || 'pickup',
            orderTotal: order.total,
            readyTime: order.readyToCollectAt.toLocaleString(),
            orderUrl: `https://quikpik.app/store/${wholesaler.id}?tab=orders`
          });

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text
          });
          
          console.log(`📧 Ready for collection notification resent to ${customer.email}`);
        }
      } catch (emailError) {
        console.error('❌ Failed to resend ready for collection email:', emailError);
        return res.status(500).json({ error: 'Failed to send notification email' });
      }

      console.log(`✅ Ready for collection notification resent for order ${orderId}`);
      res.json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
      console.error("❌ Error resending ready for collection notification:", error);
      res.status(500).json({ error: "Failed to resend notification" });
    }
  });

  // POST /api/orders/:id/mark-as-paid
  app.post('/api/orders/:id/mark-as-paid', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
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

      if (paymentUpdate.newPaymentStatus === 'paid' && order.status === 'confirmed') {
        updateData.status = 'paid';
      }

      // Task 3: Expire Stripe checkout session when offline payment fully pays the order
      // Always clear link fields on full offline payment regardless of Stripe SDK availability
      if (paymentUpdate.newPaymentStatus === 'paid' && method !== 'payment_link' && order.stripePaymentLinkId) {
        updateData.stripePaymentLinkUrl = null;
        updateData.stripePaymentLinkId = null;
        if (stripe) {
          try {
            await stripe.checkout.sessions.expire(order.stripePaymentLinkId);
            console.log(`🔒 Stripe checkout session expired for order ${order.orderNumber} (offline full payment)`);
          } catch (stripeErr) {
            // Best-effort — session may already be used or expired
            console.warn(`⚠️ Could not expire Stripe session for order ${order.orderNumber}:`, stripeErr);
          }
        }
      }

      await db.update(orders).set(updateData).where(eq(orders.id, orderId));

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

      console.log(`✅ Order ${order.orderNumber} marked as ${paymentUpdate.newPaymentStatus} offline — £${parsedAmount.toFixed(2)} via ${method || 'unspecified'}${note ? ` (${note})` : ''}`);

      // Task 4: Send payment notifications to customer and wholesaler (best-effort)
      try {
        const [customer, wholesaler] = await Promise.all([
          storage.getUser(order.retailerId),
          storage.getUser(order.wholesalerId),
        ]);

        if (customer && wholesaler) {
          const currencySymbol = getCurrencySymbol(wholesaler.preferredCurrency || 'GBP');
          const businessName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Supplier';
          const customerName = customer.firstName || 'there';
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
              console.log(`📧 Payment notification email sent to customer ${customer.email}`);
            } catch (emailErr) {
              console.error('⚠️ Failed to send customer payment email:', emailErr);
            }
          }

          // Customer SMS
          if (customer.phoneNumber) {
            try {
              const smsMsg = isPaidInFull
                ? `Hi ${customerName}! ${businessName} has received your payment of ${currencySymbol}${parsedAmount.toFixed(2)} for order ${order.orderNumber}. Your order is now fully paid. Thank you!\n\nDo not reply to this message.`
                : `Hi ${customerName}! ${businessName} has received a payment of ${currencySymbol}${parsedAmount.toFixed(2)} for order ${order.orderNumber}. Outstanding balance: ${currencySymbol}${outstanding.toFixed(2)}.\n\nDo not reply to this message.`;
              await sendSMS({ to: customer.phoneNumber, message: smsMsg });
              console.log(`📱 Payment notification SMS sent to customer ${customer.phoneNumber}`);
            } catch (smsErr) {
              console.error('⚠️ Failed to send customer payment SMS:', smsErr);
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
              console.log(`📧 Payment notification email sent to wholesaler ${wholesaler.email}`);
            } catch (emailErr) {
              console.error('⚠️ Failed to send wholesaler payment email:', emailErr);
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
  app.put("/api/orders/:id/items-prepared", requireAuth, requireNotViewer, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const userId = req.user!.id;

      console.log(`📦 Marking order ${orderId} items as prepared`);

      // Get order details
      const order = await storage.getOrderById(orderId);
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

      console.log(`📦 Updating order ${orderId} status to items_prepared`);

      // Update order status using storage method
      const updated = await storage.updateOrderStatus(orderId, 'items_prepared');
      if (!updated) {
        return res.status(500).json({ error: 'Failed to update order status' });
      }

      // Send notification to customer about items being prepared
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler) {
          await orderNotificationService.sendOrderStatusUpdate({
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            status: 'items_prepared',
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            customerPhone: customer.phoneNumber || '',
            customerEmail: customer.email || undefined,
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
            trackingNumber: updated.deliveryTrackingNumber || undefined,
            estimatedDelivery: undefined
          });
          console.log(`📱 Items prepared notifications sent for order ${orderId}`);
        }
      } catch (notificationError) {
        console.error('❌ Failed to send items prepared notifications:', notificationError);
        // Don't fail the status update if notifications fail
      }

      console.log(`✅ Order ${orderId} items marked as prepared`);
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
      
      console.log(`📦 Fetching orders for authenticated wholesaler: ${wholesalerId}, search: ${search || 'none'}`);
      const orders = await storage.getOrders(wholesalerId, undefined, search);
      console.log(`📦 Found ${orders.length} orders for wholesaler ${wholesalerId}`);
      
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

      // Validate Stripe session ID
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
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

      console.log(`📦 Retrieved order ${orderId} with ${order.items?.length || 0} items`);
      res.json({
        ...order,
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
      
      console.log(`📦 Fetching paginated orders for authenticated user - page: ${page}, limit: ${limit}, search: ${search || 'none'}, customerId: ${customerId || 'none'}, tab: ${archiveTab}`);
      
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
          paidOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.status} IN ('paid', 'completed', 'processing', 'shipped') THEN 1 END)::int`,
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

      console.log(`📦 Found ${ordersResult.length} orders (page ${page}/${totalPages}, total: ${totalOrders})`);

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

      // Attach cancellation request to each order
      const ordersWithRequests = ordersResult.map(order => ({
        ...order,
        cancellationRequest: cancellationRequestsMap[order.id] || null
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
      
      console.log(`📊 Fetching order statistics for authenticated wholesaler: ${wholesalerId}, tab: ${archiveTab}`);

      // Get all orders to calculate overall statistics
      const allOrders = await storage.getOrders(wholesalerId, undefined, undefined);
      
      // Filter by active/archived based on tab
      const filteredOrders = archiveTab === 'all'
        ? allOrders
        : archiveTab === 'archived'
          ? allOrders.filter(order => isArchivedOrder(order))
          : allOrders.filter(order => !isArchivedOrder(order));
      
      console.log(`📊 Found ${filteredOrders.length} ${archiveTab} orders for statistics`);

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

      console.log(`📊 Calculated stats:`, stats);
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
  app.post('/api/orders', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { items, deliveryAddress, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Calculate totals
      let subtotal = 0;
      const orderItems = [];

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

      const platformFee = subtotal * 0.046; // 4.6% platform fee (wholesaler cost)
      const customerTransactionFee = (subtotal * 0.055) + 0.50; // 5.5% + £0.50 (customer pays)
      const total = subtotal + customerTransactionFee; // total = what the customer pays

      // Get wholesaler from first product
      const firstProduct = await storage.getProduct(items[0].productId);
      const wholesalerId = firstProduct!.wholesalerId;

      const orderData = insertOrderSchema.parse({
        orderNumber: await generateOrderNumber(wholesalerId),
        wholesalerId,
        retailerId: userId,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        total: total.toFixed(2),
        deliveryAddress,
        notes,
        status: 'confirmed' // Auto-confirm orders immediately
      });

      // CRITICAL FIX: Use transaction-based order creation for reliable stock processing
      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });
      
      // Get wholesaler and customer details for confirmation email
      const wholesaler = await storage.getUser(wholesalerId);
      const customer = await storage.getUser(userId);
      
      if (wholesaler && customer) {
        try {
          // Send confirmation email to customer
          await sendCustomerInvoiceEmail(customer, order, orderItems.map(item => ({
            ...item,
            product: { name: 'Product', price: item.unitPrice } // Will be populated properly
          })), wholesaler);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
          // Don't fail the order creation if email fails
        }
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
  app.patch('/api/orders/:id/status', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
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
      try {
        if (updatedOrder) {
          const customer = await storage.getUser(updatedOrder.retailerId);
          const wholesaler = await storage.getUser(updatedOrder.wholesalerId);
          if (customer && wholesaler) {
            await orderNotificationService.sendOrderStatusUpdate({
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.orderNumber,
              status: updatedOrder.status,
              customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
              customerPhone: customer.phoneNumber || '',
              customerEmail: customer.email || undefined,
              wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
              trackingNumber: updatedOrder.deliveryTrackingNumber || undefined,
              estimatedDelivery: undefined
            });
          }
        }
      } catch (notificationError) {
        console.error('Failed to send order status notifications:', notificationError);
        // Don't fail the status update if notifications fail
      }

      // Auto-archive fulfilled orders after 24 hours
      if (status === 'fulfilled') {
        setTimeout(async () => {
          try {
            await storage.updateOrderStatus(id, 'archived');
            console.log(`Order ${id} auto-archived after fulfillment`);
          } catch (error) {
            console.error(`Failed to auto-archive order ${id}:`, error);
          }
        }, 24 * 60 * 60 * 1000);
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // POST /api/orders/:id/cancel
  app.post('/api/orders/:id/cancel', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { reason, reasonCategory, returnedItems, processRefund, refundType, refundDelivery } = req.body;
      // returnedItems: Array<{ productId: number, quantity: number, sellingType: 'units' | 'pallets' }>
      // refundType: 'card' | 'later' - determines if refund goes to original payment or processed separately

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
      
      // Calculate refund amount and restore stock for returned items
      if (returnedItems && returnedItems.length > 0) {
        // Partial cancellation - only restore specified items
        for (const returnItem of returnedItems) {
          const orderItem = orderItems.find(oi => oi.productId === returnItem.productId);
          if (orderItem) {
            const product = await storage.getProduct(returnItem.productId);
            if (product) {
              const returnQty = Math.min(returnItem.quantity, orderItem.quantity);
              
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
                });
              } else {
                await restockUnitsToOrigin(orderItem.batchId ?? null, product.id, returnQty, order.wholesalerId, id, order.orderNumber);
              }
              
              // Calculate refund for this item
              refundAmount += parseFloat(orderItem.unitPrice) * returnQty;
              stockRestoredCount += returnQty;
              
              console.log(`📦 Restored ${returnQty} ${returnItem.sellingType} of product ${product.name} to stock`);
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
            console.log(`🚚 Including delivery charge refund: £${deliveryCost.toFixed(2)}`);
          }
        }
      } else {
        // Full cancellation - restore all items
        for (const item of orderItems) {
          const product = await storage.getProduct(item.productId);
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
                reason: `Order cancelled - ${item.quantity} pallets returned`,
                orderId: id,
              });
            } else if (item.productId) {
                await restockUnitsToOrigin(item.batchId ?? null, item.productId, item.quantity, order.wholesalerId, id, order.orderNumber);
            }
            stockRestoredCount += item.quantity;
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
          console.log('🚫 All items returned at full quantity - treating as full cancellation');
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

      if (processRefund && amountPaid > 0 && order.stripePaymentIntentId && stripe) {
        const refundAmountToProcess = isFullCancellation && orderTotal > 0
          ? orderTotal   // full cancel → return everything the customer paid
          : refundAmount; // partial → return item value only
        const refundCeiling = isFullCancellation ? (orderTotal > 0 ? orderTotal : amountPaid) : amountPaid;
        if (refundAmountToProcess > 0 && refundAmountToProcess <= refundCeiling) {
          const result = await refundAcrossPaymentIntents(
            stripe,
            order.stripePaymentIntentId,
            refundAmountToProcess,
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
      const currentRefunded = parseFloat(order.amountRefunded || '0');
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
          notes: order.notes 
            ? `${order.notes}\n[${new Date().toISOString()}] ${isFullCancellation ? 'Order cancelled' : 'Partial return processed'} (${reasonCategory || 'unspecified'}): ${reason || 'N/A'}. Stock restored: ${stockRestoredCount} items. ${refundNote}` 
            : `[${new Date().toISOString()}] ${isFullCancellation ? 'Order cancelled' : 'Partial return processed'} (${reasonCategory || 'unspecified'}): ${reason || 'N/A'}. Stock restored: ${stockRestoredCount} items. ${refundNote}`
        })
        .where(eq(orders.id, id));

      // Send cancellation notification to customer (SMS and Email)
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (wholesaler) {
          const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
          const amountPaid = parseFloat(order.amountPaid || '0');
          
          // Build itemised lists for the email
          const refundLineItems: RefundLineItem[] = [];
          const retainedLineItems: RefundLineItem[] = [];
          const deliveryCostNum = parseFloat(order.deliveryCost || '0');
          const deliveryRefundedAmount = isFullCancellation
            ? deliveryCostNum
            : (refundDelivery ? deliveryCostNum : 0);

          if (returnedItems && returnedItems.length > 0) {
            for (const ri of returnedItems) {
              const oi = orderItems.find(o => o.productId === ri.productId);
              if (oi) {
                const product = await storage.getProduct(ri.productId);
                const returnQty = Math.min(ri.quantity, oi.quantity);
                refundLineItems.push({
                  productName: product?.name || `Product #${ri.productId}`,
                  quantity: returnQty,
                  unitPrice: parseFloat(oi.unitPrice),
                  sellingType: ri.sellingType || oi.sellingType || 'units',
                });
                const keptQty = oi.quantity - returnQty;
                if (keptQty > 0) {
                  retainedLineItems.push({
                    productName: product?.name || `Product #${ri.productId}`,
                    quantity: keptQty,
                    unitPrice: parseFloat(oi.unitPrice),
                    sellingType: ri.sellingType || oi.sellingType || 'units',
                  });
                }
              }
            }
            for (const oi of orderItems) {
              const ri = returnedItems.find((r: any) => r.productId === oi.productId);
              if (!ri) {
                const product = await storage.getProduct(oi.productId);
                retainedLineItems.push({
                  productName: product?.name || `Product #${oi.productId}`,
                  quantity: oi.quantity,
                  unitPrice: parseFloat(oi.unitPrice),
                  sellingType: oi.sellingType || 'units',
                });
              }
            }
          } else {
            for (const oi of orderItems) {
              const product = await storage.getProduct(oi.productId);
              refundLineItems.push({
                productName: product?.name || `Product #${oi.productId}`,
                quantity: oi.quantity,
                unitPrice: parseFloat(oi.unitPrice),
                sellingType: oi.sellingType || 'units',
              });
            }
          }

          const actualRefundAmount = stripeRefundTotalPounds > 0 ? stripeRefundTotalPounds : refundAmount;

          // SMS notification
          if (customer?.phoneNumber) {
            let smsMsg = '';
            const totalReturnedQty = refundLineItems.reduce((sum, i) => sum + i.quantity, 0);
            if (isFullCancellation) {
              smsMsg = `Hi ${customer.firstName || 'there'}, your order ${order.orderNumber} with ${businessName} has been cancelled.`;
              if (stripeRefundTotalPounds > 0) {
                smsMsg += ` A refund of £${stripeRefundTotalPounds.toFixed(2)} for ${totalReturnedQty} item(s) has been processed. Allow 5-10 business days.`;
              } else if (amountPaid > 0) {
                smsMsg += ` A refund of £${amountPaid.toFixed(2)} for ${totalReturnedQty} item(s) is pending.`;
              } else {
                smsMsg += ` No payment was taken, so no refund is required.`;
              }
            } else {
              smsMsg = `Hi ${customer.firstName || 'there'}, ${totalReturnedQty} item(s) returned for order ${order.orderNumber} with ${businessName}.`;
              if (stripeRefundTotalPounds > 0) {
                smsMsg += ` Refund of £${stripeRefundTotalPounds.toFixed(2)} processed. Allow 5-10 business days.`;
              } else if (actualRefundAmount > 0) {
                smsMsg += ` Refund of £${actualRefundAmount.toFixed(2)} pending.`;
              }
            }
            smsMsg += `\n\nContact ${businessName}: ${wholesaler.phoneNumber || wholesaler.email || ''}\n\nDo not reply to this message.`;
            
            await sendSMS({ to: customer.phoneNumber, message: smsMsg });
            console.log(`📱 Cancellation SMS sent to ${customer.phoneNumber}`);
          }
          
          // Email notification with itemised receipt
          if (customer?.email) {
            try {
              const emailSubject = isFullCancellation 
                ? `Order ${order.orderNumber} Cancelled - ${businessName}`
                : `Partial Return Processed - Order ${order.orderNumber}`;

              const emailRefundType: CancellationRefundType = stripeRefundTotalPounds > 0
                ? 'card'
                : (actualRefundAmount > 0 ? 'later' : 'none');
              const emailRefundStatus = cancellationRefundTypeToEmailStatus(emailRefundType);

              const emailBody = buildItemisedRefundEmail({
                customerName: customer.firstName || 'there',
                orderNumber: order.orderNumber,
                isFullCancellation,
                returnedItems: refundLineItems,
                retainedItems: retainedLineItems.length > 0 ? retainedLineItems : undefined,
                refundAmount: actualRefundAmount,
                deliveryRefunded: deliveryRefundedAmount > 0 ? deliveryRefundedAmount : undefined,
                refundStatus: emailRefundStatus,
                businessName,
                businessPhone: wholesaler.phoneNumber || undefined,
                businessEmail: wholesaler.email || undefined,
              });
              
              await sendEmail({
                to: customer.email,
                subject: emailSubject,
                html: wrapCustomerEmail(emailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: isFullCancellation ? `Order ${order.orderNumber} has been cancelled` : `Partial return for order ${order.orderNumber}` }),
                from: `${businessName} via Quikpik <hello@quikpik.co>`
              });
              console.log(`📧 Itemised cancellation email sent to ${customer.email}`);
            } catch (emailError) {
              console.error('Failed to send cancellation email:', emailError);
            }
          }
        }
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
  app.post('/api/orders/:id/retry-refund', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ message: "Not authorized" });
      if (!order.stripePaymentIntentId) return res.status(400).json({ message: "No Stripe payment recorded for this order" });
      if (!stripe) return res.status(400).json({ message: "Stripe not configured" });
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
      console.log(`💳 Stripe retry refund processed: £${refundedAmount.toFixed(2)} for order ${order.orderNumber}${partialNote}`);

      await db.update(orders)
        .set({
          amountRefunded: result.remaining > 0.01 ? result.remaining.toFixed(2) : order.amountRefunded,
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
  app.post('/api/cancellation-requests/:id/respond', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { approved, responseMessage, refundType } = req.body;
      
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
          
          for (const item of orderItems) {
            const product = await storage.getProduct(item.productId);
            if (product) {
              if (item.sellingType === 'pallets') {
                const currentPalletStock = product.palletStock || 0;
                await db.update(products)
                  .set({ palletStock: currentPalletStock + item.quantity })
                  .where(eq(products.id, product.id));
              } else {
                await storage.updateProductStock(item.productId, product.stock + item.quantity);
              }
            }
          }
          
          // Use order.total (the full customer-facing charge) so the customer gets back
          // their transaction fee (5.5% + £0.50) as well as the product/delivery value.
          custCancelAmountPaid = parseFloat(order.total || order.amountPaid || '0');
          
          if (refundType === 'card' && custCancelAmountPaid > 0 && order.stripePaymentIntentId && stripe) {
            const result = await refundAcrossPaymentIntents(
              stripe,
              order.stripePaymentIntentId,
              custCancelAmountPaid,
              { order_id: order.id.toString(), reason: `Customer request: ${request.reasonCategory}` },
              true // customer-initiated full cancel — platform absorbs its fee
            );
            custCancelStripeRefunded = result.totalRefunded;
            if (result.totalRefunded > 0) {
              console.log(`💳 Stripe refund processed for customer cancellation: £${result.totalRefunded.toFixed(2)}`);
            }
          }
          
          await db.update(orders)
            .set({
              status: 'cancelled',
              amountRefunded: custCancelStripeRefunded > 0 ? custCancelStripeRefunded.toFixed(2) : refundType === 'later' ? custCancelAmountPaid.toFixed(2) : '0.00',
              refundReason: `Customer request: ${request.reasonCategory}${request.reasonNotes ? ` - ${request.reasonNotes}` : ''}`,
              cancelledAt: new Date(),
              notes: order.notes 
                ? `${order.notes}\n[${new Date().toISOString()}] Order cancelled via customer request (${request.reasonCategory}). Refund: ${refundType}`
                : `[${new Date().toISOString()}] Order cancelled via customer request (${request.reasonCategory}). Refund: ${refundType}`,
            })
            .where(eq(orders.id, order.id));
          
          console.log(`🚫 Order ${order.orderNumber} cancelled via customer cancellation request`);
        }
      }
      
      // Notify customer about the decision via SMS and email
      try {
        const order = await storage.getOrder(request.orderId);
        const wholesaler = await storage.getUser(request.wholesalerId);
        const businessName = wholesaler?.businessName || 'the seller';
        const customerPhone = (order as any)?.customerPhone;
        const customerEmail = (order as any)?.customerEmail;
        const customerName = (order as any)?.customerName || 'Customer';
        
        // Build itemised data for the approved cancellation email
        let cancelledLineItems: RefundLineItem[] = [];
        if (approved && order) {
          const cancOrderItems = await storage.getOrderItems(order.id);
          for (const oi of cancOrderItems) {
            const product = await storage.getProduct(oi.productId);
            cancelledLineItems.push({
              productName: product?.name || `Product #${oi.productId}`,
              quantity: oi.quantity,
              unitPrice: parseFloat(oi.unitPrice),
              sellingType: oi.sellingType || 'units',
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
          
          await sendSMS({ to: customerPhone, message });
          console.log(`📱 Cancellation response SMS sent to ${customerPhone}`);
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
          console.log(`📧 Cancellation response email sent to ${customerEmail}`);
        }
      } catch (error) {
        console.error('Failed to send cancellation response notification:', error);
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
  app.post('/api/orders/:id/refund', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { amount, reason } = req.body;

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
        console.log('Order payment details:', {
          orderId: id,
          stripePaymentIntentId: order.stripePaymentIntentId,
          status: order.status,
          total: order.total
        });
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      // Create Stripe refund — distribute across all payment intents if needed
      let refundResult: { totalRefunded: number; remaining: number; lastError: string | null } | null = null;
      if (stripe) {
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
          const product = await storage.getProduct(item.productId);
          if (product) {
            await storage.updateProductStock(item.productId, product.stock + item.quantity);
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
          console.log(`Refund receipt sent to ${customer.email} for order ${id}`);
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
  app.post('/api/orders/:orderId/upload-image', requireAuth, requireNotViewer, async (req: any, res) => {
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
  app.post('/api/orders/:orderId/save-image', requireAuth, requireNotViewer, async (req: any, res) => {
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
      
      console.log(`🔧 Image URL normalization: ${imageUrl} → ${normalizedPath}`);
      
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
      
      console.log(`📸 Added image to order ${orderId}: ${filename}`);
      
      // Send email notification to customer about new photos
      try {
        // Get customer and wholesaler info for email
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          const { sendOrderPhotoNotificationEmail } = await import('../sendgrid-service.js');
          
          const customerName = customer.firstName && customer.lastName 
            ? `${customer.firstName} ${customer.lastName}` 
            : customer.firstName || customer.businessName || 'Customer';
            
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
          
          console.log(`📧 Photo notification email sent to ${customer.email}`);
        }
      } catch (emailError) {
        console.error('📧 Failed to send photo notification email:', emailError);
        // Don't fail the whole request if email fails
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

      console.log(`📸 Server-side upload complete: ${req.file.originalname} → ${normalizedPath}`);

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

      console.log(`✅ Photo saved to order ${orderId}: ${req.file.originalname}`);

      // Send email notification to customer (best-effort)
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        if (customer?.email && wholesaler) {
          const { sendOrderPhotoNotificationEmail } = await import('../sendgrid-service.js');
          const customerName = customer.firstName && customer.lastName
            ? `${customer.firstName} ${customer.lastName}`
            : customer.firstName || customer.businessName || 'Customer';
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
        console.error('📧 Photo notification email failed (non-fatal):', emailError);
      }

      res.json({ success: true, image: imageEntry });
    } catch (error: any) {
      console.error("❌ Error uploading order photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  // DELETE /api/orders/:orderId/delete-image/:imageId
  app.delete('/api/orders/:orderId/delete-image/:imageId', requireAuth, requireNotViewer, async (req: any, res) => {
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
      
      console.log(`🗑️ Deleted image ${imageId} from order ${orderId}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error deleting image from order:", error);
      res.status(500).json({ error: "Failed to delete image" });
    }
  });

  // POST /api/orders/:id/resend-confirmation
  app.post('/api/orders/:id/resend-confirmation', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
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
            product: product ? { name: product.name } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(order.retailer, order, enrichedItems, wholesaler);
        res.json({ message: "Confirmation email sent successfully" });
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        res.status(500).json({ message: "Failed to send confirmation email" });
      }
    } catch (error) {
      console.error("Error resending confirmation email:", error);
      res.status(500).json({ message: "Failed to resend confirmation email" });
    }
  });

  // DELETE /api/orders/bulk-delete
  app.delete("/api/orders/bulk-delete", requireAuth, requireNotViewer, async (req: any, res) => {
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
        console.log('No campaign orders to delete or table not found:', error.message);
      }

      // 2. Delete order items
      await db
        .delete(orderItems)
        .where(inArray(orderItems.orderId, orderIdsToDelete));

      // 3. Finally delete the orders themselves
      await db
        .delete(orders)
        .where(and(...whereConditions));

      console.log(`🗑️ Bulk deleted ${orderIdsToDelete.length} orders and related data for wholesaler ${userId}`);

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
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: "Not authorized" });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: "Wholesaler not found" });

      const pdfBuffer = await buildInvoicePdf(order, wholesaler, (order as any).paymentMethod === 'payment_link' || (!!(order as any).stripePaymentIntentId && !(order as any).paymentMethod));
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
  app.get('/api/orders/:id/invoice/customer', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });

      const pdfBuffer = await buildInvoicePdf(order, wholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod));
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
  app.post('/api/orders/:id/share-invoice', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });

      const customerEmail = order.customerEmail || order.retailer?.email;
      if (!customerEmail) {
        return res.status(400).json({ message: 'No customer email on record for this order' });
      }

      const customerName = order.customerName || order.retailer?.businessName || 'Customer';
      const businessName = wholesaler.businessName || 'Your Supplier';
      const orderRef = order.orderNumber || `#${order.id}`;
      const invoiceFilename = `invoice-${order.orderNumber || order.id}.pdf`;

      // Show transaction fee only for Stripe-processed payments, not manual (cash/bank transfer) payments
      const pdfBuffer = await buildInvoicePdf(order, wholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod));
      const pdfAttachment: SendGridAttachment = {
        content: pdfBuffer.toString('base64'),
        filename: invoiceFilename,
        type: 'application/pdf',
        disposition: 'attachment',
      };

      const logoUrl = getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl);
      const branding = { businessName, logoUrl };

      const body = emailCard(
        `<p style="margin:0 0 12px;color:#374151;font-size:15px">Hi ${customerName},</p>` +
        `<p style="margin:0 0 16px;color:#374151;font-size:15px">${businessName} is sharing your invoice <strong>${orderRef}</strong> with you. Please find it attached to this email.</p>` +
        `<p style="margin:0;color:#6b7280;font-size:13px">If you have any questions about this invoice, please get in touch with us directly.</p>`
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

      console.log(`📧 Customer invoice shared: order ${orderRef} → ${customerEmail}`);
      res.json({ message: `Invoice sent to ${customerEmail}` });
    } catch (error) {
      console.error('Error sharing invoice:', error);
      res.status(500).json({ message: 'Failed to send invoice' });
    }
  });

  // POST /api/orders/:id/send-receipt
  app.post('/api/orders/:id/send-receipt', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
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
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe!.paymentIntents.retrieve(order.stripePaymentIntentId);
        
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

      console.log(`📧 Sending receipt to: ${customerInfo.email} for customer: ${customerInfo.name}`);

      // Get order items with product details
      const orderItems = await storage.getOrderItems(order.id);
      const enrichedItems = await Promise.all(orderItems.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          productName: product?.name || `Product #${item.productId}`,
          product: product ? { name: product.name } : null
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
      res.status(500).json({ message: "Failed to send receipt: " + error.message });
    }
  });

  // GET /api/orders/:id/stripe-customer-data
  app.get('/api/orders/:id/stripe-customer-data', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
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
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe!.paymentIntents.retrieve(order.stripePaymentIntentId);
        
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
  app.post('/api/orders/:orderId/shipping', requireAuth, requireNotViewer, async (req: any, res) => {
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
        contactName: user.businessName || `${user.firstName} ${user.lastName}`,
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
              contactName: order.retailer?.firstName && order.retailer?.lastName 
                ? `${order.retailer.firstName} ${order.retailer.lastName}`
                : 'Customer',
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
  app.post('/api/orders/:orderId/generate-balance-link', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
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

      if (!stripe) {
        return res.status(500).json({ error: 'Payment service not available' });
      }

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

      console.log(`💳 Payment link calculation: status=${order.paymentStatus}, depositPct=${depositPercentage}%, total=${orderTotal}, paid=${amountPaid}, outstanding=${amountOutstanding}, charging=${paymentAmount}`);

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let balanceLinkUseConnect = false;
      if (wholesaler?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            balanceLinkUseConnect = true;
            console.log(`✅ Balance link Connect account active: ${wholesaler.stripeAccountId}`);
          } else {
            console.log(`⚠️ Balance link Connect account not ready: ${wholesaler.stripeAccountId}`);
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

      console.log(`✅ Balance payment link generated for order ${order.orderNumber}: ${session.url}`);

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
          
          const smsResult = await sendSMS({
            to: customerPhone,
            message: smsMessage
          });
          
          smsSent = smsResult.success;
          console.log(`📱 SMS ${smsSent ? 'sent' : 'failed'} to ${customerPhone} for ${paymentTypeLabel.toLowerCase()}`);
        } catch (smsError) {
          console.error('❌ Failed to send payment SMS:', smsError);
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
