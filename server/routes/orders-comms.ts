import type { Express } from "express";
import crypto from "crypto";

import { formatDateTime } from "../../shared/utils/date";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";
import {
  SendGridAttachment, buildInvoicePdf, db, emailButton, emailCard, escapeHtml, eq,
  formatPackDescriptor, generateReadyForCollectionEmail, getCurrencySymbol, getEmailLogoUrl,
  multer, orderPhotoUpload, orders,
  requireAuth, requireMemberPermission, requireNotViewer, requireBooleanFeature,
  sendCustomerInvoiceEmail, sendEmail, sendWhatsAppMessage, sgMail, storage,
  getStripeClient, wrapCustomerEmail, MailDataRequired,
} from "./shared";
import { isConnectAccountReady } from "../utils/stripe-connect-ready";
import { resolveInvoiceWholesaler } from "./orders-read";
import { createShortPaymentLink } from "../shortPaymentLink";

/**
 * Ensures the Stripe checkout session stored on an order is still live.
 * If `quoteExpiresAt` is in the past (or not set), creates a fresh 24-hour
 * session, persists it to the DB, and returns the new URL.
 * Returns the existing URL when the session is still valid, or null when the
 * order has no Stripe payment link at all.
 */
async function refreshStripePaymentLinkIfExpired(
  order: any,
  wholesaler: any,
): Promise<string | null> {
  if (!order.stripePaymentLinkUrl) return null;

  // Still valid if quoteExpiresAt is more than 5 minutes away
  const bufferMs = 5 * 60 * 1000;
  if (order.quoteExpiresAt && new Date(order.quoteExpiresAt).getTime() > Date.now() + bufferMs) {
    return order.stripePaymentLinkUrl;
  }

  const amountOutstanding = parseFloat(order.amountOutstanding || '0');
  if (amountOutstanding <= 0) return order.stripePaymentLinkUrl;

  const stripe = getStripeClient(Boolean(wholesaler.isTestAccount));
  const orderTotal = parseFloat(order.total || '0');
  const depositPercentage = order.depositPercentage || 100;

  let paymentAmount: number;
  let paymentLabel: string;
  let paymentDescription: string;

  if (order.paymentStatus === 'unpaid' && depositPercentage < 100) {
    paymentAmount = orderTotal * (depositPercentage / 100);
    paymentLabel = `Deposit (${depositPercentage}%) - Order ${order.orderNumber}`;
    paymentDescription = `Deposit payment of ${depositPercentage}%. Order total: £${orderTotal.toFixed(2)}`;
  } else {
    paymentAmount = amountOutstanding;
    paymentLabel = `Remaining Balance - Order ${order.orderNumber}`;
    paymentDescription = `Payment for remaining balance. Original order total: £${orderTotal.toFixed(2)}`;
  }

  // Validate wholesaler's Connect account for automatic fund routing
  let useConnect = false;
  if (wholesaler?.stripeAccountId) {
    try {
      const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
      if (connectAccount.charges_enabled && connectAccount.details_submitted) useConnect = true;
    } catch (err: any) {
      console.error(`❌ refreshStripePaymentLink: Connect validation failed: ${err.message}`);
    }
  }

  const wholesalerNet = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
  const transferAmount = orderTotal > 0
    ? Math.round(paymentAmount * (wholesalerNet / orderTotal) * 100)
    : 0;

  const appUrl = process.env.APP_URL
    || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app');

  const customer = order.retailerId ? await storage.getUser(order.retailerId) : null;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'gbp',
        product_data: { name: paymentLabel, description: paymentDescription },
        unit_amount: Math.round(paymentAmount * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${appUrl}/customer/payment-success?order=${order.orderNumber}&wholesaler=${wholesaler.id}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/store/${wholesaler.id}`,
    metadata: {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber || '',
      wholesalerId: wholesaler.id,
      customerId: order.retailerId,
      isQuote: 'true',
      isBalancePayment: order.paymentStatus === 'part_paid' ? 'true' : 'false',
      depositPercentage: depositPercentage.toString(),
      depositAmount: paymentAmount.toFixed(2),
      totalAmount: orderTotal.toFixed(2),
    },
    customer_email: customer?.email || undefined,
    expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
    ...(useConnect && transferAmount > 0 ? {
      payment_intent_data: {
        transfer_data: { destination: wholesaler.stripeAccountId, amount: transferAmount },
      },
    } : {}),
  });

  await db.update(orders)
    .set({
      stripePaymentLinkId: session.id,
      stripePaymentLinkUrl: session.url || '',
      quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .where(eq(orders.id, order.id));

  console.log(`🔄 Refreshed Stripe payment link for order ${order.orderNumber} (previous session expired)`);
  return session.url || '';
}

export function registerOrderCommsRoutes(app: Express): void {

  // POST /api/shorten — generate a short quikpik.app/pay/... link for a given Stripe URL
  app.post("/api/shorten", requireAuth, async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
      const wholesalerId = await resolveWholesalerId(req);
      const shortUrl = await createShortPaymentLink(url, wholesalerId, 24);
      return res.json({ shortUrl });
    } catch {
      return res.json({ shortUrl: req.body?.url ?? '' });
    }
  });

  // POST /api/orders/:id/resend-ready-notification
  app.post("/api/orders/:id/resend-ready-notification", requireAuth, requireBooleanFeature('order_management'), requireNotViewer, requireMemberPermission('orders'), async (req, res) => {
    try {
      const orderId = parseInt(req.params.id!);
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
            orderNumber: order.orderNumber ?? '',
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

  // POST /api/orders/:orderId/upload-image
  app.post('/api/orders/:orderId/upload-image', requireAuth, requireBooleanFeature('order_management'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const { orderId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = resolveWholesalerId(req);
      
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
  app.post('/api/orders/:orderId/save-image', requireAuth, requireBooleanFeature('order_management'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { imageUrl, filename, description } = req.body;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = resolveWholesalerId(req);
      
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
  app.post('/api/orders/:orderId/upload-photo', requireAuth, requireBooleanFeature('order_management'), requireNotViewer, (req: any, res: any, next: any) => {
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

      const wholesalerId = resolveWholesalerId(req);

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
  app.delete('/api/orders/:orderId/delete-image/:imageId', requireAuth, requireBooleanFeature('order_management'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const { orderId, imageId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = resolveWholesalerId(req);
      
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
  app.post('/api/orders/:id/resend-confirmation', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id!);
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
            <p><strong>To:</strong> ${escapeHtml(testEmail)}</p>
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

  // POST /api/orders/:id/share-invoice
  app.post('/api/orders/:id/share-invoice', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id!);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });
      const user = req.user;
      const effectiveWholesalerId = user.role === 'team_member' ? user.wholesalerId : user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.wholesalerId !== effectiveWholesalerId) return res.status(403).json({ message: 'Not authorized' });

      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: 'Wholesaler not found' });
      const sym = getCurrencySymbol((wholesaler as any)?.preferredCurrency || (wholesaler as any)?.defaultCurrency || 'GBP');

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
      const bankProfile = await storage.getDefaultBusinessProfile(order.wholesalerId);
      const pdfAmountPaid = order.amountPaid ? parseFloat(order.amountPaid) : undefined;
      const pdfAmountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : undefined;
      const pdfBuffer = await buildInvoicePdf(order, effectiveWholesaler, order.paymentMethod === 'payment_link' || (!!order.stripePaymentIntentId && !order.paymentMethod), pdfAmountPaid, pdfAmountOutstanding, bankProfile ?? undefined);
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
        // Refresh the Stripe checkout session if it has expired (sessions last 24 h).
        // Best-effort: on any Stripe/network error fall back to the stored URL so the
        // email is still delivered (customer sees the old link rather than no email at all).
        let paymentUrl: string | null = order.stripePaymentLinkUrl || null;
        if (connectReady && order.stripePaymentLinkUrl) {
          try {
            paymentUrl = await refreshStripePaymentLinkIfExpired(order, wholesaler) ?? order.stripePaymentLinkUrl;
          } catch (refreshErr: any) {
            console.error(`⚠️ share-invoice: Stripe session refresh failed for order ${order.id}, using stored URL: ${refreshErr.message}`);
            // paymentUrl already set to stored URL above — email will still send
          }
        }
        if (connectReady && paymentUrl) {
          paymentSection =
            `<p style="margin:16px 0 8px;color:#374151;font-size:15px">💳 <strong>Amount due: ${sym}${amountOutstanding.toFixed(2)}</strong></p>` +
            emailButton('Pay Now', paymentUrl);
        } else {
          paymentSection =
            `<p style="margin:16px 0 0;color:#374151;font-size:14px">💳 <strong>Amount due: ${sym}${amountOutstanding.toFixed(2)}</strong> — Please contact us to arrange payment.</p>`;
        }
      }

      const body = emailCard(
        `<p style="margin:0 0 12px;color:#374151;font-size:15px">Hi ${escapeHtml(customerName)},</p>` +
        `<p style="margin:0 0 16px;color:#374151;font-size:15px">${escapeHtml(businessName)} is sharing your invoice <strong>${escapeHtml(orderRef)}</strong> with you. Please find it attached to this email.</p>` +
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
  app.post('/api/orders/:id/share-invoice-whatsapp', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id!);
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
  app.post('/api/orders/:id/send-receipt', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id!);
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
      const orderItemsList = await storage.getOrderItems(order.id);
      const enrichedItems = await Promise.all(orderItemsList.map(async (item: any) => {
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

  // POST /api/orders/:orderId/shipping
  app.post('/api/orders/:orderId/shipping', requireAuth, requireBooleanFeature('order_management'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
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
  app.post('/api/orders/:orderId/generate-balance-link', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const wholesalerId = resolveWholesalerId(req);

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
      const sym = getCurrencySymbol((wholesaler as any)?.preferredCurrency || (wholesaler as any)?.defaultCurrency || 'GBP');
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

      // Build the message text for the frontend to preview (not sent automatically)
      const customerPhone = order.customerPhone;
      let smsMessage = '';
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
          itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × ${sym}${unitPrice.toFixed(2)} = ${sym}${total.toFixed(2)}${promoNote}${freeNote}`);
        }
        const itemsList = itemsListParts.length > 0 ? `\n\n📦 Items:\n${itemsListParts.join('\n')}` : '';
        const paymentTypeLabel = order.paymentStatus === 'unpaid' && depositPercentage < 100
          ? `Deposit (${depositPercentage}%)`
          : 'Outstanding Balance';
        const rawCommsUrl = session.url || '';
        const shortCommsUrl = rawCommsUrl ? await createShortPaymentLink(rawCommsUrl, wholesalerId, 24) : rawCommsUrl;
        smsMessage = `Hi${order.customerName ? ` ${order.customerName.split(' ')[0]}` : ''}! ${wholesaler?.businessName || 'Your supplier'} is requesting payment for Order ${order.orderNumber}.${itemsList}\n\n${paymentTypeLabel}: ${sym}${paymentAmount.toFixed(2)}\n\nPay here: ${shortCommsUrl}\n\nThis link expires in 24 hours.`;
      } catch (msgError) {
        console.warn('⚠️ Could not build SMS message preview:', msgError);
      }

      // Get the updated order to return
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

      res.json({
        success: true,
        paymentLink: session.url,
        amount: paymentAmount.toFixed(2),
        order: updatedOrder,
        smsMessage,
        customerPhone: customerPhone || null,
      });

    } catch (error) {
      console.error('❌ Error generating balance payment link:', error);
      res.status(500).json({ error: 'Failed to generate payment link' });
    }
  });

  // POST /api/orders/:orderId/send-payment-sms
  app.post('/api/orders/:orderId/send-payment-sms', requireAuth, requireBooleanFeature('invoices'), requireNotViewer, requireMemberPermission('orders'), async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
      const wholesalerId = resolveWholesalerId(req);
      const { channel = 'whatsapp', message } = req.body as { channel?: 'whatsapp' | 'sms'; message?: string };

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ error: 'Unauthorized' });

      const customerPhone = order.customerPhone;
      if (!customerPhone) return res.status(400).json({ error: 'No phone number on record for this customer' });

      let fallbackText: string | null = null;
      if (!message && order.stripePaymentLinkUrl) {
        const wholesaler = await storage.getUser(wholesalerId);
        const freshPaymentUrl = wholesaler
          ? (await refreshStripePaymentLinkIfExpired(order, wholesaler)) ?? order.stripePaymentLinkUrl
          : order.stripePaymentLinkUrl;
        const shortFallbackUrl = await createShortPaymentLink(freshPaymentUrl, wholesalerId, 24);
        fallbackText = `Hi! You have a payment link for order ${order.orderNumber}: ${shortFallbackUrl}`;
      }
      const textToSend = message || fallbackText;
      if (!textToSend) return res.status(400).json({ error: 'No message or stored payment link available' });

      const sent = await sendWhatsAppMessage({ to: customerPhone, message: textToSend, channel });

      res.json({ success: true, sent, channel });
    } catch (error) {
      console.error('❌ Error sending payment SMS:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

}
