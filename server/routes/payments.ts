import type { Express } from "express";
import { calculateCustomerFee, customerFeeLabel } from "../../shared/utils/fees";
import { formatDateTime } from "../../shared/utils/date";
import {
  InventoryCalculator, SendGridAttachment, SubscriptionService, and, buildInvoicePdf, db,
  emailBadge, emailButton, emailCard, emailHeading, enforceNewPlanLimits, eq,
  formatPackDescriptor, sendCustomerInvoiceEmail,
  generateDowngradeEffectiveEmail, generateDowngradeScheduledEmail, generateOrderNumber,
  getEmailLogoUrl, getProjectedDowngradeImpact, getUserPlanLimits, gte, isAuthenticated, lte, ne,
  or, orderItems, orders, products, requireAuth, requireNotViewer, requireOwner, sendEmail, sendStripeVerifiedEmail, sendSMS, sgMail,
  sql, stockMovements, storage, subscriptionPlans, sum, unlockForUpgrade, userSubscriptions,
  users, wrapCustomerEmail, z, systemErrorLogs, getWholesalerFeeRate,
} from "./shared";
import { getStripeClient, getPublishableKey, getWebhookSecrets, isLiveMode } from "../stripeConfig";
import { businessProfiles } from "@shared/schema";

export function registerPaymentRoutes(app: Express): void {
  // POST /api/stripe/connect
  app.post('/api/stripe/connect', async (req: any, res) => {
    console.log('🔗 POST /api/stripe/connect - Starting authentication check...');
    console.log('📋 Session debug:', {
      sessionExists: !!req.session,
      sessionId: req.sessionID?.substring(0, 10) + '...',
      sessionUser: (req.session as any)?.user ? 'exists' : 'missing',
      sessionUserId: (req.session as any)?.userId ? 'exists' : 'missing', 
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'no function',
      reqUser: req.user ? 'exists' : 'missing',
      cookies: req.headers.cookie ? 'present' : 'missing'
    });

    let authenticatedUser = null;

    // Method 1: Check Passport authentication (Google OAuth/Replit auth)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const passportUser = req.user as any;
      const userId = passportUser.claims?.sub;
      
      if (userId) {
        console.log('✅ Method 1: Passport authentication found, userId:', userId);
        authenticatedUser = await storage.getUser(userId);
        if (authenticatedUser) {
          console.log('✅ Method 1: User loaded from database:', authenticatedUser.email);
        }
      }
    }

    // Method 2: Check email-based session authentication
    if (!authenticatedUser) {
      const sessionUser = (req.session as any)?.user;
      if (sessionUser?.id) {
        console.log('✅ Method 2: Session user found, userId:', sessionUser.id);
        authenticatedUser = await storage.getUser(sessionUser.id);
        if (authenticatedUser) {
          console.log('✅ Method 2: User loaded from database:', authenticatedUser.email);
        }
      }
    }

    // Method 3: Check legacy session userId
    if (!authenticatedUser) {
      const sessionUserId = (req.session as any)?.userId;
      if (sessionUserId) {
        console.log('✅ Method 3: Legacy session userId found:', sessionUserId);
        authenticatedUser = await storage.getUser(sessionUserId);
        if (authenticatedUser) {
          console.log('✅ Method 3: User loaded from database:', authenticatedUser.email);
        }
      }
    }

    // Final authentication check
    if (!authenticatedUser) {
      console.log('❌ All authentication methods failed - no valid user found');
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource.",
        redirectUrl: "/login"
      });
    }

    req.user = authenticatedUser;
    console.log('🔗 Stripe Connect proceeding with authenticated user:', authenticatedUser.email);
    try {
      const stripe = getStripeClient(Boolean(authenticatedUser.isTestAccount));
      console.log('🔗 Stripe Connect request received for user:', req.user?.email);
      console.log('👤 User role:', req.user?.role);

      const user = req.user;
      console.log('👤 Creating Stripe Connect account for user:', user.id);
      console.log('📧 User email:', user.email);
      console.log('🏢 User business name:', user.businessName || user.username);

      // Check if user already has a Connect account
      if (user.stripeAccountId) {
        console.log('🔄 User already has Stripe account:', user.stripeAccountId);
        
        try {
          // Get proper base URL — use production domain when deployed, dev domain otherwise
          const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://quikpik.app'
            : (process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : 'http://localhost:5000');
            
          const refreshUrl = `${baseUrl}/settings?tab=integrations`;
          const returnUrl = `${baseUrl}/stripe-success`;
          
          console.log('🔗 Using Stripe redirect base URL:', baseUrl);
          console.log('🔗 Stripe refresh URL:', refreshUrl);
          console.log('🔗 Stripe return URL:', returnUrl);
            
          // Get account link for existing account
          const accountLink = await stripe.accountLinks.create({
            account: user.stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
          });
          
          console.log('✅ Account link created for existing account');
          return res.json({ url: accountLink.url, accountId: user.stripeAccountId });
        } catch (linkError: any) {
          console.error('❌ Error creating account link:', linkError.message);
          throw new Error(`Failed to create account link: ${linkError.message}`);
        }
      }

      console.log('🆕 Creating new Stripe Express account');
      
      // Create new Connect Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB', // UK for GBP
        email: user.email,
        business_profile: {
          name: user.businessName || user.username,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      console.log('✅ Stripe account created:', account.id);

      // Update user with Connect account ID
      await storage.updateUser(user.id, {
        stripeAccountId: account.id
      });
      
      console.log('✅ User updated with Stripe account ID');

      // Get proper base URL — use production domain when deployed, dev domain otherwise
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://quikpik.app'
        : (process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000');
        
      const refreshUrl = `${baseUrl}/settings?tab=integrations`;
      const returnUrl = `${baseUrl}/stripe-success`;
      
      console.log('🔗 Using Stripe redirect base URL:', baseUrl);
      console.log('🔗 Stripe refresh URL:', refreshUrl);
      console.log('🔗 Stripe return URL:', returnUrl);
        
      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      console.log('✅ Onboarding link created');
      
      res.json({ url: accountLink.url, accountId: account.id });
    } catch (error: any) {
      console.error('❌ Error creating Stripe Connect account:', error);
      console.error('❌ Error details:', {
        message: error.message,
        type: error.type,
        code: error.code,
        statusCode: error.statusCode
      });
      
      let errorMessage = "Failed to create Stripe Connect account";
      if (error.message && error.message.includes('No such application')) {
        errorMessage = "Stripe application not found - check your Stripe keys";
      } else if (error.message && error.message.includes('Invalid API key')) {
        errorMessage = "Invalid Stripe API key";
      } else if (error.type === 'StripePermissionError') {
        errorMessage = "Stripe permissions error - check your account settings";
      } else if (error.message) {
        errorMessage = `Stripe error: ${error.message}`;
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  // POST /api/stripe/dashboard
  app.post('/api/stripe/dashboard', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const stripe = getStripeClient(Boolean(user.isTestAccount));

      if (!user.stripeAccountId) {
        return res.status(400).json({ message: "No Stripe Connect account found. Please set up payments first." });
      }

      // Create a login link for the Express dashboard
      const loginLink = await stripe.accounts.createLoginLink(user.stripeAccountId);
      
      console.log('🔗 Generated Stripe dashboard link for user:', user.id);
      
      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error('❌ Error creating Stripe dashboard link:', error);
      res.status(500).json({ message: "Failed to create dashboard link: " + error.message });
    }
  });

  // GET /api/config/stripe-key — returns the publishable key for the frontend
  // Accepts an optional `wholesalerId` query param so that the customer portal
  // (which may be unauthenticated) can retrieve the key matching the wholesaler's
  // Stripe environment. Falls back to the authenticated user's flag otherwise.
  app.get('/api/config/stripe-key', async (req: any, res) => {
    let forceTest = Boolean(req.user?.isTestAccount);
    const { wholesalerId } = req.query as { wholesalerId?: string };
    if (wholesalerId) {
      try {
        const wholesaler = await storage.getUser(wholesalerId);
        if (wholesaler) {
          forceTest = Boolean(wholesaler.isTestAccount);
        }
      } catch {
        // non-fatal — fall back to authenticated-user flag
      }
    }
    const publishableKey = getPublishableKey(forceTest);
    const environment = (forceTest || !isLiveMode()) ? 'test' : 'live';
    res.json({ publishableKey, environment });
  });

  // POST /api/webhooks/stripe
  app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const secrets = getWebhookSecrets();

    if (secrets.length === 0) {
      console.error('❌ No STRIPE_WEBHOOK_SECRET configured');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event | undefined;
    for (const secret of secrets) {
      try {
        event = getStripeClient().webhooks.constructEvent(req.body, sig, secret);
        break; // verified — stop trying
      } catch {
        // try the next secret
      }
    }
    if (!event) {
      console.error('❌ Stripe webhook signature verification failed (tried all secrets)');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    console.log(`✅ Stripe webhook verified: ${event.type} at ${new Date().toISOString()}`);

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`💳 Checkout completed: ${session?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(session?.metadata, null, 2));
        
        const userId = session?.metadata?.userId;
        const tier = session?.metadata?.targetTier || 
                     session?.metadata?.tier || 
                     session?.metadata?.planId;
        const subscriptionType = session?.metadata?.subscriptionType;
        
        // Handle quote/order payments (has orderId and orderNumber in metadata)
        const orderId = session?.metadata?.orderId;
        const orderNumber = session?.metadata?.orderNumber;
        const isQuote = session?.metadata?.isQuote === 'true';
        
        if (orderId && orderNumber) {
          console.log(`🧾 Processing quote/order payment: Order ${orderNumber}, ID ${orderId}`);
          
          // Get the current order from database to get accurate totals and existing payments
          const [existingOrder] = await db.select()
            .from(orders)
            .where(eq(orders.id, parseInt(orderId)))
            .limit(1);
          
          if (!existingOrder) {
            console.log(`❌ Order ${orderId} not found in database`);
            return res.status(404).json({ error: 'Order not found' });
          }
          
          // Get actual payment amount from Stripe session
          const thisPayment = (session.amount_total || 0) / 100; // Convert from pence to pounds
          
          // Get existing amounts from order (cumulative)
          const previouslyPaid = parseFloat(existingOrder.amountPaid || '0');
          const orderTotal = parseFloat(existingOrder.total || '0');
          
          // Calculate cumulative paid and new outstanding
          const cumulativePaid = previouslyPaid + thisPayment;
          const newOutstanding = Math.max(0, orderTotal - cumulativePaid);
          
          // Determine payment status
          let paymentStatus = 'unpaid';
          if (newOutstanding <= 0.01) { // Allow for rounding
            paymentStatus = 'paid';
          } else if (cumulativePaid > 0) {
            paymentStatus = 'part_paid';
          }
          
          console.log(`📊 Payment update: This payment £${thisPayment.toFixed(2)}, Previously paid £${previouslyPaid.toFixed(2)}, Total paid £${cumulativePaid.toFixed(2)}, Outstanding £${newOutstanding.toFixed(2)}, Status: ${paymentStatus}`);
          
          // Capture actual Stripe processing fee from balance_transaction (non-blocking)
          const piId = session.payment_intent as string | null;
          // Idempotency: skip fee capture if this PI was already processed (webhook retry safety)
          const alreadyProcessed = piId && (existingOrder.stripePaymentIntentId || '')
            .split(',').map((s: string) => s.trim()).includes(piId);
          let actualStripeFee: number | null = null;
          if (piId && !alreadyProcessed) {
            try {
              const stripeForFee = getStripeClient(!event.livemode);
              const pi = await stripeForFee.paymentIntents.retrieve(piId, {
                expand: ['latest_charge.balance_transaction'],
              });
              const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge as Stripe.Charge : null;
              const btRaw = charge?.balance_transaction;
              const bt = typeof btRaw === 'object' ? btRaw as Stripe.BalanceTransaction : null;
              if (bt && typeof bt.fee === 'number') {
                // fee is in pence — convert to pounds and accumulate for deposit orders
                const thisFee = bt.fee / 100;
                const existingFee = parseFloat(existingOrder.stripeActualFee || '0');
                actualStripeFee = parseFloat((existingFee + thisFee).toFixed(2));
                console.log(`💳 Stripe actual fee for order ${orderNumber}: £${thisFee.toFixed(2)} (cumulative: £${actualStripeFee.toFixed(2)})`);
              }
            } catch (feeErr) {
              console.warn(`⚠️ Could not retrieve Stripe fee for order ${orderNumber}:`, feeErr);
            }
          }

          // Update order with payment details
          // Clear old payment link - user will generate a fresh balance link if needed
          await db.update(orders)
            .set({
              amountPaid: cumulativePaid.toFixed(2),
              amountOutstanding: newOutstanding.toFixed(2),
              paymentStatus: paymentStatus,
              status: paymentStatus === 'paid' ? 'confirmed' : existingOrder.status,
              stripePaymentIntentId: (() => {
                // Append the new PI to existing ones (comma-separated) so multi-PI refunds work
                const newPi = session.payment_intent as string | null;
                if (!newPi) return existingOrder.stripePaymentIntentId;
                const existing = existingOrder.stripePaymentIntentId || '';
                if (existing.split(',').map((s: string) => s.trim()).includes(newPi)) return existing;
                return existing ? `${existing},${newPi}` : newPi;
              })(),
              stripePaymentLinkUrl: null, // Clear old deposit link so user generates fresh balance link
              stripePaymentLinkId: null,
              // Set payment method to 'payment_link' only if not already recorded manually
              ...(!existingOrder.paymentMethod ? { paymentMethod: 'payment_link' } : {}),
              // Store actual Stripe fee if we managed to retrieve it
              ...(actualStripeFee !== null ? { stripeActualFee: actualStripeFee.toFixed(2) } : {}),
            })
            .where(eq(orders.id, parseInt(orderId)));
          
          console.log(`✅ Order ${orderNumber} payment updated: ${paymentStatus}, old payment link cleared`);

          // Send order confirmation email on the first payment for this order (checkout confirmation).
          // previouslyPaid === 0 guards against duplicate emails on deposit follow-ups and
          // webhook retries. Covers both full-payment and deposit (part_paid) checkouts.
          if (previouslyPaid === 0) {
            (async () => {
              try {
                const wholesaler = await storage.getUser(existingOrder.wholesalerId);
                const retailerId = existingOrder.retailerId;
                const customer = retailerId ? await storage.getUser(retailerId) : null;
                const customerForEmail = customer || {
                  name: existingOrder.customerName || 'Customer',
                  email: session.customer_details?.email || null,
                  firstName: existingOrder.customerName || 'Customer',
                  lastName: '',
                };
                if (wholesaler && customerForEmail.email) {
                  const savedItems = await storage.getOrderItems(existingOrder.id);
                  const enrichedItems = await Promise.all(savedItems.map(async (item: any) => {
                    const product = await storage.getProduct(item.productId);
                    return {
                      ...item,
                      productName: product?.name || `Product #${item.productId}`,
                      packDescriptor: formatPackDescriptor(
                        product?.packQuantity || product?.quantityInPack,
                        product?.sizePerUnit || product?.unitSize,
                        product?.unitOfMeasure,
                      ),
                      product: product
                        ? { name: product.name, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure }
                        : null,
                    };
                  }));
                  // Pass the updated payment values so the email reflects the current transaction
                  const orderForEmail = {
                    ...existingOrder,
                    amountPaid: cumulativePaid.toFixed(2),
                    amountOutstanding: newOutstanding.toFixed(2),
                    paymentStatus,
                  };
                  await sendCustomerInvoiceEmail(customerForEmail, orderForEmail, enrichedItems, wholesaler);
                  console.log(`📧 Confirmation email sent to ${customerForEmail.email} for order ${orderNumber}`);
                }
              } catch (emailErr) {
                console.error(`⚠️ Failed to send confirmation email for order ${orderNumber}:`, emailErr);
              }
            })();
          } else if (previouslyPaid > 0 && paymentStatus === 'paid') {
            // Balance payment — the customer previously paid a deposit and has now settled the remainder.
            // Send a "Balance Paid — Order Confirmed" email to both the customer and the wholesaler.
            (async () => {
              try {
                const wholesaler = await storage.getUser(existingOrder.wholesalerId);
                const retailerId = existingOrder.retailerId;
                const customer = retailerId ? await storage.getUser(retailerId) : null;
                const customerForEmail = customer || {
                  name: existingOrder.customerName || 'Customer',
                  email: session.customer_details?.email || null,
                  firstName: existingOrder.customerName || 'Customer',
                  lastName: '',
                };
                if (wholesaler && customerForEmail.email) {
                  const savedItems = await storage.getOrderItems(existingOrder.id);
                  const enrichedItems = await Promise.all(savedItems.map(async (item: any) => {
                    const product = await storage.getProduct(item.productId);
                    return {
                      ...item,
                      productName: product?.name || `Product #${item.productId}`,
                      packDescriptor: formatPackDescriptor(
                        product?.packQuantity || product?.quantityInPack,
                        product?.sizePerUnit || product?.unitSize,
                        product?.unitOfMeasure,
                      ),
                      product: product
                        ? { name: product.name, packQuantity: product.packQuantity, quantityInPack: product.quantityInPack, sizePerUnit: product.sizePerUnit, unitSize: product.unitSize, unitOfMeasure: product.unitOfMeasure }
                        : null,
                    };
                  }));
                  const orderForEmail = {
                    ...existingOrder,
                    amountPaid: cumulativePaid.toFixed(2),
                    amountOutstanding: newOutstanding.toFixed(2),
                    paymentStatus,
                    // Pass the individual transaction amount so the email shows the balance
                    // payment received (not the cumulative total paid to date).
                    latestPaymentAmount: thisPayment.toFixed(2),
                  };
                  await sendCustomerInvoiceEmail(customerForEmail, orderForEmail, enrichedItems, wholesaler, true);
                  console.log(`📧 Balance payment confirmation email sent to ${customerForEmail.email} for order ${orderNumber}`);
                }
              } catch (emailErr) {
                console.error(`⚠️ Failed to send balance payment confirmation email for order ${orderNumber}:`, emailErr);
              }
            })();
          }

          return res.json({
            received: true,
            message: `Order ${orderNumber} payment processed`,
            orderId,
            orderNumber,
            amountPaid: cumulativePaid.toFixed(2),
            paymentStatus
          });
        }
        
        // Handle subscription payments (has userId and tier in metadata)
        if (userId && tier) {
          console.log(`🔄 Processing ${subscriptionType || 'new'} subscription: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 5 : 2);
          
          // Get subscription details from Stripe if available
          let subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          let periodStart: Date = new Date();
          if (session.subscription) {
            try {
              // Load user to determine which Stripe environment their subscription lives in
              const [subUser] = await db.select({ isTestAccount: users.isTestAccount })
                .from(users).where(eq(users.id, userId));
              const stripe = getStripeClient(Boolean(subUser?.isTestAccount));
              const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
              if (subscription.current_period_end) {
                subscriptionEndsAt = new Date(subscription.current_period_end * 1000);
              }
              if (subscription.current_period_start) {
                periodStart = new Date(subscription.current_period_start * 1000);
              }
              
              // Update user's Stripe subscription ID
              await storage.updateUser(userId, {
                stripeSubscriptionId: subscription.id
              });
            } catch (error) {
              console.error('❌ Failed to retrieve subscription details:', error);
            }
          }
          
          await storage.updateUser(userId, {
            currentPlan: tier,
            subscriptionTier: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: subscriptionEndsAt,
            subscriptionPeriodEnd: subscriptionEndsAt,
            subscriptionPeriodStart: periodStart,
          });

          if (tier === 'standard' || tier === 'premium') {
            await unlockForUpgrade(userId);
          }
          
          console.log(`✅ ${subscriptionType || 'New'} subscription processed: ${userId} to ${tier}`);
          
          return res.json({
            received: true,
            message: `Subscription ${subscriptionType === 'new' ? 'created' : 'updated'} - ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
        
        console.log(`⚠️ Checkout completed but no matching handler - metadata:`, session?.metadata);
        return res.json({ received: true, type: event.type });
      }

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data?.object;
        console.log(`💰 Payment succeeded: ${paymentIntent?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(paymentIntent?.metadata, null, 2));
        
        const userId = paymentIntent?.metadata?.userId;
        // Handle all possible tier metadata field names for maximum compatibility
        const tier = paymentIntent?.metadata?.targetTier || 
                     paymentIntent?.metadata?.tier || 
                     paymentIntent?.metadata?.planId;
        
        const orderType = paymentIntent?.metadata?.orderType;
        
        if (userId && tier) {
          console.log(`🔄 Processing payment upgrade: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 5 : 2);
          
          await storage.updateUser(userId, {
            currentPlan: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });

          if (tier === 'standard' || tier === 'premium') {
            await unlockForUpgrade(userId);
          }
          
          console.log(`✅ Payment upgrade complete: ${userId} to ${tier}`);
          
          return res.json({
            received: true,
            message: `Subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
      }

      if (event.type === 'charge.refund.updated') {
        const refund = event.data.object as Stripe.Refund;
        console.log(`🔄 Refund updated: ${refund.id}, status: ${refund.status}, amount: ${refund.amount}`);

        if (refund.status === 'succeeded' && refund.payment_intent) {
          const paymentIntentId = typeof refund.payment_intent === 'string'
            ? refund.payment_intent
            : refund.payment_intent.id;

          const matchingOrders = await db.select()
            .from(orders)
            .where(or(
              eq(orders.stripePaymentIntentId, paymentIntentId),
              sql`${orders.stripePaymentIntentId} LIKE ${paymentIntentId + ',%'}`,
              sql`${orders.stripePaymentIntentId} LIKE ${'%,' + paymentIntentId}`,
              sql`${orders.stripePaymentIntentId} LIKE ${'%,' + paymentIntentId + ',%'}`
            ))
            .limit(1);

          if (matchingOrders.length > 0) {
            const order = matchingOrders[0];
            if (!order.refundedAt) {
              await db.update(orders)
                .set({
                  refundedAt: new Date(),
                  notes: order.notes
                    ? `${order.notes}\n[${new Date().toISOString()}] Stripe refund confirmed: ${refund.id}`
                    : `[${new Date().toISOString()}] Stripe refund confirmed: ${refund.id}`
                })
                .where(eq(orders.id, order.id));
              console.log(`✅ Refund confirmed for order ${order.orderNumber} (refund ${refund.id})`);
            } else {
              console.log(`ℹ️ Order ${order.orderNumber} already has refundedAt set, skipping`);
            }
          } else {
            console.log(`⚠️ No order found for payment intent ${paymentIntentId}`);
          }
        }

        return res.json({ received: true, type: event.type });
      }

      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubscriptionId = subscription.id;
        const stripeCustomerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;
        console.log(`🔴 Subscription deleted: ${stripeSubscriptionId}, customer: ${stripeCustomerId}`);

        // Prefer lookup by Stripe customer ID (most reliable); fall back to subscription ID
        let affectedUser: typeof users.$inferSelect | undefined;
        if (stripeCustomerId) {
          const [byCustomer] = await db.select().from(users)
            .where(eq(users.stripeCustomerId, stripeCustomerId));
          affectedUser = byCustomer;
        }
        if (!affectedUser) {
          const [bySubscription] = await db.select().from(users)
            .where(eq(users.stripeSubscriptionId, stripeSubscriptionId));
          affectedUser = bySubscription;
        }

        if (!affectedUser) {
          console.log(`⚠️ No user found for deleted subscription ${stripeSubscriptionId} — may already be cleaned up`);
          return res.json({ received: true, type: event.type });
        }

        const wasAlreadyFree = affectedUser.currentPlan === 'free' || affectedUser.subscriptionTier === 'free';

        await db.update(users).set({
          subscriptionTier: 'free',
          subscriptionStatus: 'free',
          currentPlan: 'free',
          productLimit: 2,
          stripeSubscriptionId: null,
          subscriptionPeriodStart: null,
          subscriptionPeriodEnd: null,
          updatedAt: new Date()
        }).where(eq(users.id, affectedUser.id));

        const [existingUserSub] = await db.select().from(userSubscriptions)
          .where(eq(userSubscriptions.userId, affectedUser.id));

        if (existingUserSub) {
          await db.update(userSubscriptions).set({
            planId: 'free',
            stripeSubscriptionId: null,
            status: 'free',
            cancelAtPeriodEnd: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            updatedAt: new Date()
          }).where(eq(userSubscriptions.userId, affectedUser.id));
        } else {
          await db.insert(userSubscriptions).values({
            userId: affectedUser.id,
            planId: 'free',
            stripeSubscriptionId: null,
            status: 'free',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: null
          });
        }

        console.log(`✅ DB updated to Free for user ${affectedUser.id} (was already free: ${wasAlreadyFree})`);

        // Enforce Free plan limits — lock excess products, suspend excess team members, archive excess groups
        let enforcementResult = { productsLocked: 0, teamMembersSuspended: 0, groupsArchived: 0 };
        if (!wasAlreadyFree) {
          enforcementResult = await enforceNewPlanLimits(affectedUser.id, 'free');
        }

        if (!wasAlreadyFree && affectedUser.email) {
          try {
            const { subject, html, text } = generateDowngradeEffectiveEmail({
              firstName: affectedUser.firstName || '',
              email: affectedUser.email,
              businessName: affectedUser.businessName || affectedUser.name || 'Quikpik',
              productsLocked: enforcementResult.productsLocked || undefined,
              teamMembersSuspended: enforcementResult.teamMembersSuspended || undefined,
              groupsArchived: enforcementResult.groupsArchived || undefined,
            });
            await sendEmail({ to: affectedUser.email, from: 'hello@quikpik.co', subject, html, text });
            console.log(`📧 Downgrade effective email sent to ${affectedUser.email}`);
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade effective email:', emailErr);
          }
        }

        return res.json({ received: true, type: event.type });
      }

      // ── Subscription activated / updated (fallback for checkout.session.completed) ──
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.status !== 'active') {
          return res.json({ received: true, type: event.type });
        }
        const subCustId = typeof subscription.customer === 'string'
          ? subscription.customer : subscription.customer.id;
        const subPriceId = subscription.items?.data?.[0]?.price?.id;
        console.log(`🔔 ${event.type}: customer=${subCustId}, price=${subPriceId}`);
        if (!subCustId || !subPriceId) return res.json({ received: true, type: event.type });

        const [subUser] = await db.select().from(users).where(eq(users.stripeCustomerId, subCustId));
        if (!subUser) {
          console.log(`⚠️ No user found for Stripe customer ${subCustId} (${event.type})`);
          return res.json({ received: true, type: event.type });
        }

        const [subPlanRow] = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, subPriceId));
        let subPlanId: string | undefined = subPlanRow?.planId;

        // Fallback: derive plan from monthly unit amount when price isn't in our DB
        if (!subPlanId || subPlanId === 'free') {
          const unitAmount = subscription.items?.data?.[0]?.price?.unit_amount ?? 0;
          if (unitAmount >= 4999) subPlanId = 'premium';
          else if (unitAmount >= 1999) subPlanId = 'standard';
          if (subPlanId && subPlanId !== 'free') {
            console.warn(`⚠️ Price ${subPriceId} not in subscription_plans — derived plan "${subPlanId}" from amount ${unitAmount}p`);
            await db.insert(systemErrorLogs).values({
              errorType: 'webhook_price_fallback',
              message: `${event.type}: price ${subPriceId} not found in subscription_plans; derived plan "${subPlanId}" from unit_amount ${unitAmount}`,
              context: { priceId: subPriceId, unitAmount, customerId: subCustId, userId: subUser.id },
              severity: 'warning',
            }).catch(() => {});
          }
        }

        if (!subPlanId || subPlanId === 'free') {
          console.log(`⚠️ Could not resolve paid plan for price ${subPriceId} — skipping`);
          return res.json({ received: true, type: event.type });
        }

        if (subUser.currentPlan === subPlanId && subUser.subscriptionStatus === 'active') {
          console.log(`ℹ️ User ${subUser.id} already on ${subPlanId} — skipping`);
          return res.json({ received: true, type: event.type });
        }

        const subProductLimit = subPlanId === 'premium' ? -1 : (subPlanId === 'standard' ? 5 : 2);
        const subPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const subPeriodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : new Date();

        await storage.updateUser(subUser.id, {
          currentPlan: subPlanId,
          subscriptionTier: subPlanId,
          subscriptionStatus: 'active',
          productLimit: subProductLimit,
          stripeSubscriptionId: subscription.id,
          subscriptionEndsAt: subPeriodEnd,
          subscriptionPeriodEnd: subPeriodEnd,
          subscriptionPeriodStart: subPeriodStart,
        });

        if (subPlanId === 'standard' || subPlanId === 'premium') {
          await unlockForUpgrade(subUser.id);
        }

        // Propagate Stripe's cancel_at_period_end so update events don't desync cancellation state
        const subCancelAtPeriodEnd = subscription.cancel_at_period_end ?? false;

        const [existingSubRow] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, subUser.id));
        if (existingSubRow) {
          await db.update(userSubscriptions).set({
            planId: subPlanId,
            stripeSubscriptionId: subscription.id,
            status: 'active',
            currentPeriodStart: subPeriodStart,
            currentPeriodEnd: subPeriodEnd,
            cancelAtPeriodEnd: subCancelAtPeriodEnd,
            updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, subUser.id));
        } else {
          await db.insert(userSubscriptions).values({
            userId: subUser.id,
            planId: subPlanId,
            stripeSubscriptionId: subscription.id,
            status: 'active',
            currentPeriodStart: subPeriodStart,
            currentPeriodEnd: subPeriodEnd,
            cancelAtPeriodEnd: subCancelAtPeriodEnd,
          });
        }

        console.log(`✅ ${event.type}: Activated ${subPlanId} for user ${subUser.id} (${subUser.email})`);
        return res.json({ received: true, type: event.type, userId: subUser.id, planId: subPlanId });
      }

      // ── Invoice paid (second fallback — covers subscription_create and renewals) ──
      if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
        const billingReason = invoice.billing_reason;
        if (billingReason !== 'subscription_create' && billingReason !== 'subscription_cycle') {
          return res.json({ received: true, type: event.type });
        }

        const invCustId = typeof invoice.customer === 'string'
          ? invoice.customer
          : typeof invoice.customer === 'object' && invoice.customer !== null
            ? invoice.customer.id
            : null;
        const invSubId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : typeof invoice.subscription === 'object' && invoice.subscription !== null
            ? invoice.subscription.id
            : null;
        if (!invCustId || !invSubId) return res.json({ received: true, type: event.type });

        console.log(`💸 invoice.payment_succeeded: customer=${invCustId}, sub=${invSubId}, reason=${billingReason}`);

        const [invUser] = await db.select().from(users).where(eq(users.stripeCustomerId, invCustId));
        if (!invUser) {
          console.log(`⚠️ No user for Stripe customer ${invCustId}`);
          return res.json({ received: true, type: event.type });
        }
        const stripe = getStripeClient(Boolean(invUser.isTestAccount));

        let invSub: Stripe.Subscription;
        try {
          invSub = await stripe.subscriptions.retrieve(invSubId);
        } catch (e) {
          console.error(`❌ Failed to retrieve subscription ${invSubId}:`, e);
          return res.json({ received: true, type: event.type });
        }

        const invPriceId = invSub.items?.data?.[0]?.price?.id;
        if (!invPriceId) return res.json({ received: true, type: event.type });

        const [invPlanRow] = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, invPriceId));
        let invPlanId: string | undefined = invPlanRow?.planId;

        // Fallback: derive plan from monthly unit amount when price isn't in our DB
        if (!invPlanId || invPlanId === 'free') {
          const invUnitAmount = invSub.items?.data?.[0]?.price?.unit_amount ?? 0;
          if (invUnitAmount >= 4999) invPlanId = 'premium';
          else if (invUnitAmount >= 1999) invPlanId = 'standard';
          if (invPlanId && invPlanId !== 'free') {
            console.warn(`⚠️ invoice price ${invPriceId} not in subscription_plans — derived "${invPlanId}" from ${invUnitAmount}p`);
            await db.insert(systemErrorLogs).values({
              errorType: 'webhook_price_fallback',
              message: `invoice.payment_succeeded: price ${invPriceId} not in subscription_plans; derived "${invPlanId}" from unit_amount ${invUnitAmount}`,
              context: { priceId: invPriceId, unitAmount: invUnitAmount, customerId: invCustId, userId: invUser.id },
              severity: 'warning',
            }).catch(() => {});
          }
        }

        if (!invPlanId || invPlanId === 'free') {
          console.log(`⚠️ Could not resolve paid plan for invoice price ${invPriceId} — skipping`);
          return res.json({ received: true, type: event.type });
        }

        if (invUser.currentPlan === invPlanId && invUser.subscriptionStatus === 'active') {
          console.log(`ℹ️ User ${invUser.id} already on ${invPlanId} — skipping`);
          return res.json({ received: true, type: event.type });
        }

        const invProductLimit = invPlanId === 'premium' ? -1 : (invPlanId === 'standard' ? 5 : 2);
        const invPeriodEnd = new Date(invSub.current_period_end * 1000);
        const invPeriodStart = new Date(invSub.current_period_start * 1000);

        await storage.updateUser(invUser.id, {
          currentPlan: invPlanId,
          subscriptionTier: invPlanId,
          subscriptionStatus: 'active',
          productLimit: invProductLimit,
          stripeSubscriptionId: invSub.id,
          subscriptionEndsAt: invPeriodEnd,
          subscriptionPeriodEnd: invPeriodEnd,
          subscriptionPeriodStart: invPeriodStart,
        });

        if (invPlanId === 'standard' || invPlanId === 'premium') {
          await unlockForUpgrade(invUser.id);
        }

        const [existingInvSubRow] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, invUser.id));
        if (existingInvSubRow) {
          await db.update(userSubscriptions).set({
            planId: invPlanId,
            stripeSubscriptionId: invSub.id,
            status: 'active',
            currentPeriodStart: invPeriodStart,
            currentPeriodEnd: invPeriodEnd,
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, invUser.id));
        } else {
          await db.insert(userSubscriptions).values({
            userId: invUser.id,
            planId: invPlanId,
            stripeSubscriptionId: invSub.id,
            status: 'active',
            currentPeriodStart: invPeriodStart,
            currentPeriodEnd: invPeriodEnd,
            cancelAtPeriodEnd: false,
          });
        }

        console.log(`✅ invoice.payment_succeeded: Activated ${invPlanId} for user ${invUser.id} (${invUser.email})`);
        return res.json({ received: true, type: event.type, userId: invUser.id, planId: invPlanId });
      }

      // ── Payment failure — write to system_error_logs ──────────────────────────
      if (event.type === 'invoice.payment_failed') {
        try {
          const failedInvoice = event.data.object as Stripe.Invoice;
          const failCustId = typeof failedInvoice.customer === 'string' ? failedInvoice.customer
            : typeof failedInvoice.customer === 'object' && failedInvoice.customer !== null ? failedInvoice.customer.id : null;

          let failUserId: string | null = null;
          if (failCustId) {
            const [failUser] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, failCustId));
            failUserId = failUser?.id || null;
          }

          await db.insert(systemErrorLogs).values({
            errorType: 'payment_failed',
            message: `Stripe payment failed for invoice ${failedInvoice.id || 'unknown'}${failedInvoice.amount_due ? ` — £${(failedInvoice.amount_due / 100).toFixed(2)}` : ''}`,
            context: {
              invoiceId: failedInvoice.id,
              customerId: failCustId,
              amountDue: failedInvoice.amount_due,
              attemptCount: failedInvoice.attempt_count,
            },
            wholesalerId: failUserId,
            severity: 'error',
          });

          console.log(`💳 invoice.payment_failed logged to system_error_logs for customer ${failCustId}`);
        } catch (logErr) {
          console.error('Failed to log payment failure to system_error_logs:', logErr);
        }
        return res.json({ received: true, type: event.type });
      }

      // ── Stripe Connect account verified ────────────────────────────────────────
      if (event.type === 'account.updated') {
        const account = event.data.object as Stripe.Account;
        const accountId = account.id;
        const chargesEnabled = account.charges_enabled ?? false;
        const payoutsEnabled = account.payouts_enabled ?? false;

        // Only act when the account is currently fully active (charges + payouts enabled).
        // We detect the transition via previous_attributes (ONLY changed fields are present),
        // but also fall through when previous_attributes has no delta — the idempotency guard
        // (`stripeVerifiedEmailSentAt`) ensures the email is never sent twice.
        const prev = event.data.previous_attributes as Partial<Stripe.Account> | undefined;
        const transitionDetected =
          prev?.charges_enabled === false || prev?.payouts_enabled === false;
        const shouldAttemptSend = chargesEnabled && payoutsEnabled && (transitionDetected || !prev);

        if (shouldAttemptSend) {
          try {
            const wholesaler = await storage.getUserByStripeAccountId(accountId);
            if (!wholesaler || !wholesaler.email) {
              console.log(`ℹ️ account.updated: no wholesaler found for stripeAccountId ${accountId}`);
            } else if (wholesaler.role !== 'wholesaler') {
              console.log(`ℹ️ account.updated: user ${wholesaler.id} is not a wholesaler, skipping`);
            } else {
              // Atomically claim the send slot — sets stripe_verified_email_sent_at
              // only if it is currently NULL, preventing duplicate sends under
              // concurrent webhook deliveries or rapid retries.
              const claimed = await storage.claimStripeVerifiedEmailSend(wholesaler.id);
              if (!claimed) {
                console.log(`ℹ️ account.updated: verification email already sent for wholesaler ${wholesaler.id}, skipping`);
              } else {
                const businessName =
                  wholesaler.businessName ||
                  `${wholesaler.firstName ?? ''} ${wholesaler.lastName ?? ''}`.trim() ||
                  'there';
                const sent = await sendStripeVerifiedEmail({
                  wholesalerEmail: wholesaler.email,
                  wholesalerName: businessName,
                });
                if (sent) {
                  console.log(`✅ Stripe verification email sent to wholesaler ${wholesaler.id} (${wholesaler.email})`);
                } else {
                  // Roll back the claim so the next retry attempt can try again.
                  await storage.updateUserSettings(wholesaler.id, { stripeVerifiedEmailSentAt: null });
                  console.error(`❌ account.updated: sendStripeVerifiedEmail failed for wholesaler ${wholesaler.id} — returning 500 so Stripe retries`);
                  return res.status(500).json({ error: 'Email delivery failed, please retry' });
                }
              }
            }
          } catch (err) {
            console.error('❌ Error processing account.updated webhook:', err);
            return res.status(500).json({ error: 'Webhook processing error, please retry' });
          }
        }
        return res.json({ received: true, type: event.type });
      }

      // Acknowledge all other events
      res.json({ received: true, type: event.type });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // POST /api/stripe/connect-onboarding
  app.post("/api/stripe/connect-onboarding", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.role !== 'wholesaler') {
        return res.status(403).json({ message: "Only wholesalers can onboard to Stripe Connect" });
      }

      const stripe = getStripeClient(Boolean(user.isTestAccount));
      let accountId = user.stripeAccountId;

      // Create Connect account if it doesn't exist
      if (!accountId) {
        // Determine country based on currency preference
        const country = user.preferredCurrency === 'USD' ? 'US' : 
                       user.preferredCurrency === 'EUR' ? 'DE' : 'GB';
        
        const account = await stripe.accounts.create({
          type: 'express',
          country: country,
          email: user.email!,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true }
          },
          business_profile: {
            name: user.businessName || `${user.firstName} ${user.lastName}`,
            support_email: user.email!,
          },
          metadata: {
            userId: userId,
            businessName: user.businessName || '',
            currency: user.preferredCurrency || 'GBP'
          }
        });
        accountId = account.id;
        
        // Save account ID to user
        await storage.updateUserSettings(userId, { stripeAccountId: accountId });
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${req.protocol}://${req.get('host')}/settings?tab=integrations&stripe_onboarding=refresh`,
        return_url: `${req.protocol}://${req.get('host')}/settings?tab=integrations&stripe_onboarding=complete`,
        type: 'account_onboarding',
      });

      res.json({ onboardingUrl: accountLink.url });
    } catch (error: any) {
      console.error("Error creating Stripe Connect onboarding:", error);
      res.status(500).json({ message: "Error creating onboarding: " + error.message });
    }
  });

  // POST /api/create-payment-intent
  app.post("/api/create-payment-intent", requireAuth, async (req: any, res) => {
    try {
      const { orderId } = req.body;
      const userId = req.user.id;
      const forceTest = Boolean(req.user.isTestAccount);
      let stripeClient: any;
      try { stripeClient = getStripeClient(forceTest); }
      catch { return res.status(500).json({ message: "Stripe not configured" }); }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.retailerId !== userId) {
        return res.status(403).json({ message: "Not authorized to pay for this order" });
      }

      // Get wholesaler's Stripe account
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler?.stripeAccountId) {
        return res.status(400).json({ 
          message: "Wholesaler has not set up payment processing. Please contact them to complete their account setup." 
        });
      }

      // Check if wholesaler's account can accept payments
      const account = await stripeClient.accounts.retrieve(wholesaler.stripeAccountId);
      if (!account.charges_enabled) {
        return res.status(400).json({ 
          message: "Wholesaler's payment account is not fully set up. Please contact them to complete verification." 
        });
      }

      // Get retailer information for receipt email
      const retailer = await storage.getUser(userId);
      
      const totalAmount = Math.round(parseFloat(order.total) * 100); // Convert to cents
      const platformFeeAmount = Math.round(parseFloat(order.platformFee) * 100); // 4.6% platform fee in cents

      const paymentIntentData: any = {
        amount: totalAmount,
        currency: "gbp", // Always use GBP for platform
        application_fee_amount: platformFeeAmount, // Quikpik's platform fee
        transfer_data: {
          destination: wholesaler.stripeAccountId, // Money goes to wholesaler
        },
        metadata: {
          orderId: order.id.toString(),
          retailerId: userId,
          wholesalerId: order.wholesalerId,
          platformFee: order.platformFee,
          subtotal: order.subtotal
        }
      };

      // Add receipt email if available
      if (retailer?.email) {
        paymentIntentData.receipt_email = retailer.email;
      }

      const paymentIntent = await stripeClient.paymentIntents.create(paymentIntentData);

      console.log(`💳 Payment intent created for Order #${orderId}`);
      if (retailer?.email) {
        console.log(`✅ Stripe receipt will be automatically sent to: ${retailer.email}`);
      }

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // GET /api/stripe/connect/status
  app.get("/api/stripe/connect/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let isConnected = false;
      let hasPayoutsEnabled = false;
      let requiresInfo = false;
      let accountStatus = 'not_connected';

      // Check if Stripe Connect is properly configured
      const hasStripeKeys = !!(process.env.STRIPE_SECRET_KEY);
      
      if (user.stripeAccountId && hasStripeKeys) {
        try {
          // Get the actual account status from Stripe — use per-user client so test accounts use test mode
          const stripeClient = getStripeClient(Boolean(user.isTestAccount));
          const account = await stripeClient.accounts.retrieve(user.stripeAccountId);
          
          // Check if account can receive payouts
          hasPayoutsEnabled = account.payouts_enabled;
          isConnected = account.charges_enabled && account.payouts_enabled;
          requiresInfo = !account.details_submitted;
          
          if (!account.details_submitted) {
            accountStatus = 'incomplete_setup';
          } else if (!isConnected) {
            accountStatus = 'pending_verification';
          } else {
            accountStatus = 'active';
          }
          
          console.log(`🔍 Stripe Connect status for user ${userId}:`, {
            accountId: user.stripeAccountId,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            isConnected,
            accountStatus
          });
          
        } catch (error: any) {
          console.error(`❌ Error checking Stripe account ${user.stripeAccountId}:`, error);
          // Account might be deleted or invalid
          accountStatus = 'error';
        }
      }
      
      res.json({
        isConnected,
        hasStripeKeys,
        hasStripeConnect: !!(user.stripeAccountId),
        accountId: user.stripeAccountId,
        hasPayoutsEnabled,
        requiresInfo,
        accountStatus,
        paymentProcessingType: user.stripeAccountId ? 'connect' : 'direct'
      });
    } catch (error) {
      console.error("Error fetching Stripe Connect status:", error);
      res.status(500).json({ error: "Failed to fetch Stripe Connect status" });
    }
  });


  // GET /api/stripe/payouts
  app.get('/api/stripe/payouts', requireAuth, async (req: any, res) => {
    try {
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));
      const user = await storage.getUser(req.user.id);
      if (!user?.stripeAccountId) {
        return res.json({ pendingBalance: 0, payouts: [] });
      }

      const [payoutList, balance] = await Promise.all([
        stripe.payouts.list({ limit: 25 }, { stripeAccount: user.stripeAccountId }),
        stripe.balance.retrieve({}, { stripeAccount: user.stripeAccountId }),
      ]);

      const pendingBalance = (balance.pending || []).reduce((sum: number, b: any) => sum + b.amount, 0);

      const payouts = payoutList.data.map((p: any) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrivalDate: p.arrival_date,
        created: p.created,
        description: p.description,
      }));

      res.json({ pendingBalance, payouts });
    } catch (error: any) {
      console.error('Error fetching payouts:', error);
      res.status(500).json({ message: 'Failed to fetch payouts' });
    }
  });

  // GET /api/stripe/payouts/:payoutId/transactions
  app.get('/api/stripe/payouts/:payoutId/transactions', requireAuth, async (req: any, res) => {
    try {
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));
      const user = await storage.getUser(req.user.id);
      if (!user?.stripeAccountId) return res.status(404).json({ message: 'No Stripe account' });

      const { payoutId } = req.params;

      const txns = await stripe.balanceTransactions.list(
        { payout: payoutId, limit: 100 },
        { stripeAccount: user.stripeAccountId }
      );

      // Include payment, charge, and transfer types — some Connect account setups
      // use type "transfer" for incoming destination-charge funds.
      const chargeTxns = txns.data.filter(
        (t) => t.type === 'payment' || t.type === 'charge' || t.type === 'transfer'
      );

      console.log(`📊 Payout ${payoutId}: ${txns.data.length} total txns, ${chargeTxns.length} payment/charge/transfer`);

      // Per-transaction order match using four complementary strategies:
      //   1. source = "tr_xxx" → DB lookup by stripeTransferId (fast path for new orders)
      //   2. source = "tr_xxx" fallback → expand Transfer on platform to get source_transaction.payment_intent
      //   3. source = "ch_xxx" → retrieve charge from connected account, get source_transfer, repeat above
      //   4. source = "pi_xxx" → DB lookup by stripePaymentIntentId
      //   5. Universal fallback → match by exact net amount + wholesaler + date window
      const transactions = await Promise.all(
        chargeTxns.map(async (t) => {
          const sourceId = typeof t.source === 'string' ? t.source : (t.source as any)?.id ?? null;
          let order: Awaited<ReturnType<typeof storage.getOrderByTransferId>> | undefined;

          console.log(`  txn ${t.id}: type=${t.type} source=${sourceId} amount=${t.amount}`);

          // Helper: try to find order via a Transfer ID (DB lookup then PI fallback)
          const findByTransferId = async (trId: string): Promise<typeof order> => {
            let found = await storage.getOrderByTransferId(trId);
            if (found) return found;
            // Transfer ID not in DB — expand Transfer on platform to get originating PI
            try {
              const transfer = await stripe.transfers.retrieve(trId, {
                expand: ['source_transaction'],
              });
              const sourceTxn = transfer.source_transaction;
              console.log(`    Transfer ${trId} source_transaction: ${typeof sourceTxn === 'object' && sourceTxn ? (sourceTxn as any).id : sourceTxn}`);
              const rawPi = sourceTxn && typeof sourceTxn === 'object'
                ? (sourceTxn as any).payment_intent
                : null;
              const piId: string | null = typeof rawPi === 'string'
                ? rawPi
                : (rawPi && typeof rawPi === 'object' ? rawPi.id : null);
              if (piId) {
                found = await storage.getOrderByPaymentIntentId(piId);
                if (found) {
                  storage.updateOrder(found.id, { stripeTransferId: trId })
                    .catch((e) => console.warn(`⚠️ stripeTransferId backfill failed for order ${found!.id}:`, e));
                }
              }
            } catch (e) {
              console.warn(`⚠️ Could not expand Transfer ${trId}:`, (e as any)?.message ?? e);
            }
            return found;
          };

          if (sourceId?.startsWith('tr_')) {
            order = await findByTransferId(sourceId);
          } else if (sourceId?.startsWith('ch_')) {
            // Destination charge on the connected account — retrieve it to get source_transfer
            try {
              const charge = await stripe.charges.retrieve(
                sourceId,
                { expand: ['source_transfer'] },
                { stripeAccount: user.stripeAccountId ?? undefined }
              );
              const rawTr = charge.source_transfer;
              const trId: string | null = typeof rawTr === 'string'
                ? rawTr
                : (rawTr && typeof rawTr === 'object' ? (rawTr as any).id : null);
              console.log(`    ch_ ${sourceId} source_transfer: ${trId}`);
              if (trId) {
                order = await findByTransferId(trId);
              }
            } catch (e) {
              console.warn(`⚠️ Could not retrieve charge ${sourceId}:`, (e as any)?.message ?? e);
            }
          } else if (sourceId?.startsWith('pi_')) {
            order = await storage.getOrderByPaymentIntentId(sourceId);
          }

          // Universal fallback: match by exact net amount (subtotal − platformFee) + date window.
          // Catches cases where source_transaction is null (partial-amount destination charges)
          // or where the Transfer ID was never stored in the DB.
          if (!order) {
            const netPounds = t.amount / 100;
            order = await storage.getOrderByNetAmountForWholesaler(user.id, netPounds, t.created);
            if (order) {
              console.log(`  ✅ Matched txn ${t.id} → order ${order.orderNumber} via amount fallback (£${netPounds})`);
              // Backfill Transfer ID if source was a Transfer and we now have the order
              if (sourceId?.startsWith('tr_') && !order.stripeTransferId) {
                storage.updateOrder(order.id, { stripeTransferId: sourceId })
                  .catch((e) => console.warn(`⚠️ stripeTransferId backfill failed for order ${order!.id}:`, e));
              }
            } else {
              console.log(`  ⚠️ No order matched for txn ${t.id} (source=${sourceId}, amount=£${netPounds})`);
            }
          }

          const net = order
            ? Number(order.subtotal ?? 0) + Number(order.deliveryCost ?? 0) - Number(order.platformFee ?? 0)
            : null;
          return {
            id: t.id,
            amount: t.amount,
            currency: t.currency,
            date: t.created,
            orderNumber: order?.orderNumber ?? null,
            customerName: order?.customerName ?? null,
            orderTotal: net !== null ? net.toFixed(2) : null,
            createdAt: order?.createdAt ?? null,
          };
        })
      );

      res.json({ transactions });
    } catch (error: any) {
      console.error('Error fetching payout transactions:', error);
      res.status(500).json({ message: 'Failed to fetch payout transactions' });
    }
  });


  // GET /api/subscriptions/plans
  app.get('/api/subscriptions/plans', async (req, res) => {
    try {
      const plans = await SubscriptionService.getPlans();
      res.json(plans);
    } catch (error) {
      console.error('❌ Failed to get subscription plans:', error);
      res.status(500).json({ 
        message: 'Failed to get subscription plans',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/subscriptions/current
  app.get('/api/subscriptions/current', requireAuth, async (req: any, res) => {
    try {
      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;
      const subscription = await SubscriptionService.getUserSubscription(userId);
      res.json(subscription);
    } catch (error) {
      console.error('❌ Failed to get user subscription:', error);
      res.status(500).json({ 
        message: 'Failed to get user subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/subscriptions/create-checkout-session
  app.post('/api/subscriptions/create-checkout-session', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const stripe = getStripeClient(Boolean(req.user.isTestAccount));
      const userId = req.user.id;
      const { priceId, idempotencyKey } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: 'Price ID is required' });
      }

      // Validate priceId exists in our subscription plans
      const validPlans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, priceId));
      
      if (validPlans.length === 0) {
        return res.status(400).json({ message: 'Invalid price ID' });
      }

      const targetPlan = validPlans[0];
      
      const isTestAccount = Boolean(req.user.isTestAccount);

      // Get or create Stripe customer
      const stripeCustomerId = await SubscriptionService.getOrCreateStripeCustomer(userId, isTestAccount);
      
      // Check for existing active subscription
      const existingSubscription = await SubscriptionService.getCurrentSubscription(userId, isTestAccount);
      
      if (existingSubscription && existingSubscription.stripeSubscriptionId) {
        // UPGRADE FLOW: User has existing subscription - modify it with proration
        console.log('🔄 Processing subscription upgrade with proration');
        
        try {
          const updatedSubscription = await SubscriptionService.upgradeSubscriptionWithProration(
            existingSubscription.stripeSubscriptionId,
            priceId,
            targetPlan.planId,
            isTestAccount,
          );
          
          // Update user's plan immediately for upgrades (instant access).
          await storage.updateUser(userId, {
            currentPlan: targetPlan.planId,
            subscriptionStatus: 'active',
            productLimit: targetPlan.planId === 'premium' ? -1 : (targetPlan.planId === 'standard' ? 5 : 2),
            subscriptionEndsAt: new Date(updatedSubscription.current_period_end * 1000)
          });

          // Clear the scheduled cancellation flag on userSubscriptions so that the
          // "Cancellation Scheduled" badge disappears immediately after upgrade.
          await db.update(userSubscriptions).set({
            cancelAtPeriodEnd: false,
            status: 'active',
            updatedAt: new Date()
          }).where(eq(userSubscriptions.userId, userId));

          await unlockForUpgrade(userId);
          
          return res.json({ 
            success: true, 
            type: 'upgrade',
            newPlan: targetPlan.planId,
            subscription: {
              id: updatedSubscription.id,
              status: updatedSubscription.status,
              current_period_end: updatedSubscription.current_period_end
            },
            message: 'Subscription upgraded successfully with proration applied'
          });
        } catch (upgradeError: any) {
          // Structured error log — every field here is useful for diagnosing which
          // Stripe error caused the direct update to fail (e.g. resource_missing,
          // subscription_update_forbidden, payment_method_unexpected_state, etc.)
          console.error('❌ Direct subscription upgrade failed — attempting Billing Portal fallback:', {
            stripeType: upgradeError?.type,
            stripeCode: upgradeError?.code,
            stripeDeclineCode: upgradeError?.decline_code ?? null,
            message: upgradeError?.message,
            subscriptionId: existingSubscription.stripeSubscriptionId,
            customerId: stripeCustomerId,
            targetPlanId: targetPlan.planId,
            targetPriceId: priceId,
          });

          // Fallback: redirect the user to the Stripe Billing Portal so they can
          // complete the upgrade there. The portal is the correct Stripe primitive
          // for modifying an *existing* subscription — unlike a new Checkout Session
          // (mode:'subscription') it never conflicts with an existing active sub.
          const returnBase = process.env.FRONTEND_URL || 'https://quikpik.app';
          try {
            const portalSession = await stripe.billingPortal.sessions.create({
              customer: stripeCustomerId,
              return_url: `${returnBase}/subscription-pricing?success=true`,
            });
            console.log('✅ Billing Portal session created as upgrade fallback:', portalSession.id);
            return res.json({
              success: true,
              type: 'portal',
              url: portalSession.url,
            });
          } catch (portalError: any) {
            console.error('❌ Billing Portal fallback also failed:', {
              stripeType: portalError?.type,
              stripeCode: portalError?.code,
              message: portalError?.message,
            });
            return res.status(500).json({
              message: 'We could not process your upgrade automatically. Please contact support or try again later.',
              stripeCode: portalError?.code ?? upgradeError?.code ?? 'unknown',
            });
          }
        }
      } else {
        // NEW SUBSCRIPTION FLOW: User has no existing subscription - use checkout session
        console.log('🆕 Creating new subscription via checkout session');
        
        const sessionOptions: any = {
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [{
            price: priceId,
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing?cancelled=true`,
          metadata: {
            userId: userId,
            planId: targetPlan.planId,
            subscriptionType: 'new'
          }
        };

        // Create Stripe checkout session with correct API syntax
        const session = idempotencyKey 
          ? await stripe.checkout.sessions.create(sessionOptions, { idempotencyKey })
          : await stripe.checkout.sessions.create(sessionOptions);

        return res.json({ 
          success: true, 
          type: 'checkout',
          sessionId: session.id,
          url: session.url 
        });
      }
    } catch (error) {
      console.error('❌ Failed to create checkout session:', error);
      res.status(500).json({ 
        message: 'Failed to create checkout session',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/subscriptions/downgrade
  app.post('/api/subscriptions/downgrade', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { targetPlan } = req.body;

      // Zod validation for targetPlan
      const targetPlanSchema = z.object({
        targetPlan: z.enum(['free', 'standard', 'premium'], {
          errorMap: () => ({ message: 'targetPlan must be one of: free, standard, premium' })
        })
      });

      const validation = targetPlanSchema.safeParse({ targetPlan });
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Invalid target plan',
          errors: validation.error.errors
        });
      }

      const isTestAccount = Boolean(req.user.isTestAccount);

      // Get current subscription
      const currentSubscription = await SubscriptionService.getCurrentSubscription(userId, isTestAccount);
      
      if (!currentSubscription?.stripeSubscriptionId) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      // Get target plan details to get the price ID
      const plans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.planId, targetPlan));
      
      if (plans.length === 0) {
        return res.status(400).json({ message: 'Target plan not found' });
      }

      const targetPlanData = plans[0];

      // Handle downgrade to free plan with proper proration
      if (targetPlan === 'free') {
        // Compute projected impact BEFORE proratedFreeDowngrade mutates the DB
        const projectedImpact = await getProjectedDowngradeImpact(userId, 'free');

        const result = await SubscriptionService.proratedFreeDowngrade(
          currentSubscription.stripeSubscriptionId,
          userId,
          isTestAccount,
        );

        // Enforce limits immediately (immediate downgrade path)
        const enforcedNow = await enforceNewPlanLimits(userId, 'free');

        // Send downgrade scheduled/immediate confirmation email
        // The webhook will also send the "effective" email when customer.subscription.deleted fires
        const [downgradedUser] = await db.select().from(users).where(eq(users.id, userId));
        if (downgradedUser?.email) {
          try {
            const { subject, html, text } = generateDowngradeScheduledEmail({
              firstName: downgradedUser.firstName || '',
              email: downgradedUser.email,
              businessName: downgradedUser.businessName || downgradedUser.name || 'Quikpik',
              currentPlan: currentSubscription.currentPlan || 'standard', // captured before proratedFreeDowngrade mutated the DB
              effectiveDate: new Date(), // immediate cancellation — effective today
              productsToLock: enforcedNow.productsLocked || undefined,
              totalProducts: projectedImpact.totalProducts || undefined,
              teamMembersToSuspend: enforcedNow.teamMembersSuspended || undefined,
              groupsToArchive: enforcedNow.groupsArchived || undefined,
            });
            await sendEmail({ to: downgradedUser.email, from: 'hello@quikpik.co', subject, html, text });
            console.log(`📧 Downgrade scheduled email sent to ${downgradedUser.email}`);
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade scheduled email:', emailErr);
          }
        }
        
        res.json({
          success: true,
          type: 'downgrade_immediate',
          targetPlan: targetPlan,
          proratedCredit: result.proratedCredit,
          message: result.message
        });
        return;
      }

      // Handle downgrade to paid plan with immediate proration
      if (!targetPlanData.stripePriceId) {
        return res.status(400).json({ message: 'Target plan price ID not configured' });
      }

      const result = await SubscriptionService.immediateDowngradeWithProration(
        currentSubscription.stripeSubscriptionId,
        targetPlanData.stripePriceId,
        targetPlan,
        isTestAccount,
      );

      // Enforce paid→paid downgrade limits (e.g. Premium→Standard: lock products >50)
      await enforceNewPlanLimits(userId, targetPlan);

      res.json({
        success: true,
        type: 'downgrade_immediate',
        targetPlan: targetPlan,
        subscriptionId: result.id,
        message: 'Subscription downgraded immediately with pro-rated credit'
      });
    } catch (error) {
      console.error('❌ Failed to downgrade subscription:', error);
      res.status(500).json({ 
        message: 'Failed to downgrade subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/subscriptions/cancel
  app.post('/api/subscriptions/cancel', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { user } = await SubscriptionService.getUserSubscription(userId);
      
      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      try {
        // Cancel subscription at period end using service method
        const subscription = await SubscriptionService.cancelSubscription(
          user.stripeSubscriptionId,
          Boolean(req.user.isTestAccount),
          { cancelAtPeriodEnd: true }
        );

        // CRITICAL: Sync cancel_at_period_end back to the DB immediately so the next
        // GET /api/subscriptions/current returns fresh data (not a 304 with stale ETag).
        const cancelPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        await db.update(userSubscriptions).set({
          cancelAtPeriodEnd: true,
          status: 'active', // stays active until period end
          currentPeriodEnd: cancelPeriodEnd,
          updatedAt: new Date(),
        }).where(eq(userSubscriptions.userId, userId));

        // Keep users table in sync so any code reading users.subscriptionStatus sees the correct state
        await db.update(users).set({
          subscriptionStatus: 'cancel_at_period_end',
          updatedAt: new Date(),
        }).where(eq(users.id, userId));

        console.log(`✅ DB synced: cancelAtPeriodEnd=true, subscriptionStatus=cancel_at_period_end for user ${userId}`);

        // Compute projected impact for the scheduled email (cancel = at period end, nothing locked yet)
        const cancelProjectedImpact = await getProjectedDowngradeImpact(userId, 'free');

        // Send downgrade scheduled confirmation email
        if (user.email) {
          try {
            const effectiveDate = new Date(subscription.current_period_end * 1000);
            const { subject, html, text } = generateDowngradeScheduledEmail({
              firstName: user.firstName || '',
              email: user.email,
              businessName: user.businessName || user.name || 'Quikpik',
              currentPlan: user.currentPlan || 'standard',
              effectiveDate,
              productsToLock: cancelProjectedImpact.productsToLock || undefined,
              totalProducts: cancelProjectedImpact.totalProducts || undefined,
              teamMembersToSuspend: cancelProjectedImpact.teamMembersToSuspend || undefined,
              groupsToArchive: cancelProjectedImpact.groupsToArchive || undefined,
            });
            await sendEmail({ to: user.email, from: 'hello@quikpik.co', subject, html, text });
            console.log(`📧 Downgrade scheduled email sent to ${user.email}`);
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade scheduled email:', emailErr);
          }
        }

        return res.json({ 
          success: true, 
          message: 'Subscription will be canceled at the end of the current period',
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: subscription.current_period_end
        });
      } catch (stripeError: any) {
        // If Stripe says the subscription doesn't exist, it's already gone — clean up the DB
        const isStaleSubscription = 
          stripeError?.message?.includes('No such subscription') ||
          stripeError?.code === 'resource_missing';

        if (isStaleSubscription) {
          console.warn('⚠️ Stripe subscription not found — cleaning up stale ID for user:', userId, user.stripeSubscriptionId);

          await db.update(users).set({
            subscriptionStatus: 'free',
            currentPlan: 'free',
            subscriptionTier: 'free',
            productLimit: 2,
            stripeSubscriptionId: null,
            subscriptionPeriodStart: null,
            subscriptionPeriodEnd: null,
            updatedAt: new Date()
          }).where(eq(users.id, userId));

          const existingSub = await db.select().from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId));

          if (existingSub.length > 0) {
            await db.update(userSubscriptions).set({
              planId: 'free',
              stripeSubscriptionId: null,
              status: 'canceled',
              cancelAtPeriodEnd: null,
              updatedAt: new Date()
            }).where(eq(userSubscriptions.userId, userId));
          } else {
            await db.insert(userSubscriptions).values({
              userId,
              planId: 'free',
              stripeSubscriptionId: null,
              status: 'free',
              currentPeriodStart: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: null
            });
          }

          console.log('✅ Stale subscription cleared — user reverted to free plan:', userId);
          return res.json({
            success: true,
            message: 'Subscription cancelled and plan reverted to Free'
          });
        }

        throw stripeError;
      }
    } catch (error) {
      console.error('❌ Failed to cancel subscription:', error);
      res.status(500).json({ 
        message: 'Failed to cancel subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/subscriptions/plan-limits
  app.get('/api/subscriptions/plan-limits', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const planLimits = await getUserPlanLimits(userId);
      res.json(planLimits);
    } catch (error) {
      console.error('❌ Failed to get plan limits:', error);
      res.status(500).json({ 
        message: 'Failed to get plan limits',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/quotes
  app.post('/api/quotes', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { customerId, items, sendVia, depositPercentage = 100, balanceDueDays = 0, fulfillmentType = 'pickup', deliveryCharge = 0, deliveryAddressId = null, deliveryAddress = null, customAddressFields = null, paymentMethod: requestedPaymentMethod, businessProfileId = null, collectionAddressId = null } = req.body;
      
      console.log('📝 Creating quote:', { wholesalerId, customerId, itemCount: items?.length, sendVia, depositPercentage, fulfillmentType, deliveryAddressId, hasDeliveryAddress: !!deliveryAddress, hasCustomAddressFields: !!customAddressFields });
      
      if (!customerId || !items || items.length === 0) {
        return res.status(400).json({ error: 'Customer and items are required' });
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
      const stripe = getStripeClient(Boolean(wholesaler?.isTestAccount));
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }

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
          const available = productForCheck.stock || 0;
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
      const customerTransactionFee = isOffline ? 0 : calculateCustomerFee(subtotal, 0); // 5.5% + £0.50 — always fixed
      const feeRate = isOffline ? 0 : await getWholesalerFeeRate(wholesalerId);
      const platformFee = subtotal * feeRate; // per-wholesaler platform fee
      const total = subtotal + customerTransactionFee;
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
            wholesalerId,
            addressLine1: customAddressFields.addressLine1,
            addressLine2: null,
            city: customAddressFields.city,
            state: customAddressFields.state || null,
            postalCode: customAddressFields.postalCode,
            country: 'United Kingdom',
            label: customAddressFields.label || null,
            instructions: null,
            isDefault: false,
          });
          resolvedDeliveryAddressId = savedAddress.id;
          resolvedDeliveryAddress = deliveryAddress || `${customAddressFields.addressLine1}, ${customAddressFields.city}, ${customAddressFields.postalCode}`;
          console.log(`📍 Auto-saved delivery address ${savedAddress.id} for customer ${customerId}`);
        } catch (addrErr) {
          console.error('⚠️ Failed to auto-save delivery address, continuing with text:', addrErr);
        }
      }

      // Create the quote order in pending status
      const [quoteOrder] = await db.insert(orders).values({
        orderNumber,
        wholesalerId,
        retailerId: customerId,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        customerEmail: customer.email,
        customerPhone: customer.phoneNumber,
        status: 'pending',
        subtotal: productSubtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        deliveryCost: quoteDeliveryCharge.toFixed(2),
        total: total.toFixed(2),
        fulfillmentType: fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
        ...(fulfillmentType === 'delivery' && resolvedDeliveryAddressId ? { deliveryAddressId: resolvedDeliveryAddressId } : {}),
        ...(fulfillmentType === 'delivery' && resolvedDeliveryAddress ? { deliveryAddress: resolvedDeliveryAddress } : {}),
        ...(fulfillmentType === 'pickup' && validatedQuoteCollectionAddressId ? { collectionAddressId: validatedQuoteCollectionAddressId } : {}),
        isQuote: true,
        quoteSentVia: sendVia,
        notes: 'Quick Quote - Custom pricing negotiated on-site',
        depositPercentage: validDepositPercentage,
        balanceDueDays: validDepositPercentage === 100 ? 0 : ([0, 7, 14, 30, 60].includes(balanceDueDays) ? balanceDueDays : 0), // Enforce 0 for full payment, otherwise use request value
        amountPaid: '0.00',
        amountOutstanding: (validDepositPercentage === 0 ? productSubtotal + quoteDeliveryCharge : total).toFixed(2),
        paymentStatus: 'unpaid',
        // Always store paymentMethod when explicitly provided (including 'payment_link')
        // so the customer portal can correctly classify online vs offline orders.
        ...(isPayLater
          ? { paymentMethod: 'pay_later' }
          : (requestedPaymentMethod ? { paymentMethod: requestedPaymentMethod } : {})),
        ...(req.user.role === 'team_member' ? { placedByName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Team Member' } : {}),
        ...(resolvedBusinessProfileId ? { businessProfileId: resolvedBusinessProfileId } : {}),
      }).returning();

      // Collect pack descriptors for Stripe line item descriptions
      const packDescLines: string[] = [];

      // Create order items with custom prices (supporting both units and pallets)
      // AND decrement stock immediately (field sales - products given in person)
      for (const item of items) {
        const sellingType = item.sellingType || 'units';
        await db.insert(orderItems).values({
          orderId: quoteOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.customPrice.toFixed(2),
          total: (item.customPrice * item.quantity).toFixed(2),
          sellingType: sellingType,
        });
        
        // CRITICAL: Decrement stock at quote creation (products handed over in person)
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        if (product) {
          const packDescriptor = formatPackDescriptor(product.quantityInPack, product.unitSize, product.unitOfMeasure);
          packDescLines.push(packDescriptor ? `${product.name} (${packDescriptor})` : product.name);

          const quantity = item.quantity;
          console.log(`📦 QUOTE STOCK: Decrementing ${quantity} ${sellingType} of ${product.name} at quote creation`);
          
          // Use InventoryCalculator for proper stock tracking
          const orderResult = InventoryCalculator.processOrder(quantity, sellingType as 'units' | 'pallets', {
            stock: product.stock,
            palletStock: product.palletStock,
            quantityInPack: product.quantityInPack,
            unitsPerPallet: product.unitsPerPallet
          });
          
          const { newUnitStock, newPalletStock } = orderResult;
          
          // Update stock fields
          await db.update(products)
            .set({ 
              stock: newUnitStock,
              palletStock: newPalletStock,
              updatedAt: new Date()
            })
            .where(eq(products.id, item.productId));
          
          // Record stock movement
          await db.insert(stockMovements).values({
            productId: item.productId,
            wholesalerId: wholesalerId,
            movementType: 'purchase',
            quantity: -quantity,
            unitType: sellingType === 'pallets' ? 'pallets' : 'units',
            stockBefore: sellingType === 'pallets' ? (product.palletStock || 0) : (product.stock || 0),
            stockAfter: sellingType === 'pallets' ? newPalletStock : newUnitStock,
            reason: `Quote order sale - ${quantity} ${sellingType}`,
            orderId: quoteOrder.id,
            businessProfileId: quoteOrder.businessProfileId ?? null,
          });
          
          console.log(`✅ QUOTE STOCK: ${product.name} ${sellingType}: ${sellingType === 'pallets' ? product.palletStock : product.stock} → ${sellingType === 'pallets' ? newPalletStock : newUnitStock}`);
        }
      }

      // Create Stripe Payment Link (skip for pay-later and offline payment methods)
      let paymentLinkUrl = '';
      let paymentLinkId = '';
      
      if (validDepositPercentage > 0 && !isOffline) {
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
                    description: `Deposit payment for quote. Full order: £${total.toFixed(2)}. Remaining: £${outstandingAmount.toFixed(2)}${packSummary ? ` | ${packSummary}` : ''}`,
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
                console.log(`✅ Quote Connect account active: ${wholesaler.stripeAccountId}`);
              } else {
                console.log(`⚠️ Quote Connect account not ready: ${wholesaler.stripeAccountId}`);
              }
            } catch (connectErr: any) {
              console.error(`❌ Quote Connect account validation failed: ${connectErr.message}`);
            }
          }

          // Wholesaler receives subtotal minus 4.6% platform fee; proportional to deposit
          const wholesalerTotal = subtotal - platformFee;
          const wholesalerDepositAmount = Math.round(depositAmount * (wholesalerTotal / total) * 100);

          // Base session params (no Connect routing) — used as fallback if transfer_data fails
          const baseSessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/customer/payment-success?order=${quoteOrder.orderNumber}&wholesaler=${wholesalerId}${isReturning ? '&returning=true' : ''}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/store/${wholesalerId}`,
            metadata: {
              orderId: quoteOrder.id.toString(),
              orderNumber: quoteOrder.orderNumber,
              wholesalerId,
              customerId,
              isQuote: 'true',
              depositPercentage: validDepositPercentage.toString(),
              depositAmount: depositAmount.toFixed(2),
              totalAmount: total.toFixed(2),
            },
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
                  transfer_data: {
                    destination: wholesaler.stripeAccountId!,
                    amount: wholesalerDepositAmount,
                  },
                },
              });
              console.log(`✅ Quote session created with Connect routing: ${session.id}`);
            } catch (connectSessionErr: any) {
              console.error(`❌ Quote session with Connect routing failed — type: ${connectSessionErr.type}, code: ${connectSessionErr.code}, message: ${connectSessionErr.message}`);
              console.log(`⚠️ Retrying quote session without Connect routing...`);
            }
          }

          // Fallback: plain session without Connect routing (payment goes to platform account)
          if (!session) {
            session = await stripe.checkout.sessions.create(baseSessionParams);
            console.log(`✅ Quote session created (no Connect routing): ${session.id}`);
          }

          paymentLinkUrl = session.url || '';
          paymentLinkId = session.id;

          const expiryDays = validDepositPercentage < 100 ? Math.min((quoteOrder.balanceDueDays || 0) + 3, 30) : 1;
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

      // Send SMS notification
      if (sendVia === 'sms' && customer.phoneNumber) {
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
        const message = isPayLater
          ? `Hi ${customer.firstName || 'there'}! ${businessName} has sent you a quote.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}\nPayment: Pay Later${deliveryNoteText}\n\nPlease arrange payment with ${businessName} directly.\n\n${wholesalerContact ? `Contact ${businessName}: ${wholesalerContact}\n\n` : ''}Do not reply to this message.`
          : isDeposit 
          ? `Hi ${customer.firstName || 'there'}! ${businessName} has sent you a quote.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nOrder Total: £${total.toFixed(2)}\nDeposit (${validDepositPercentage}%): £${depositAmount.toFixed(2)}\nRemaining: £${outstandingAmount.toFixed(2)}${balanceDueText}${deliveryNoteText}\n\nPay deposit: ${paymentLinkUrl}\n\nLink expires in 24 hours.\n\n${wholesalerContact ? `Contact ${businessName}: ${wholesalerContact}\n\n` : ''}Do not reply to this message.`
          : `Hi ${customer.firstName || 'there'}! ${businessName} has sent you a quote.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}${deliveryNoteText}\n\nPay here: ${paymentLinkUrl}\n\nLink expires in 24 hours.\n\n${wholesalerContact ? `Contact ${businessName}: ${wholesalerContact}\n\n` : ''}Do not reply to this message.`;
        
        try {
          await sendSMS({
            to: customer.phoneNumber,
            message,
          });
          console.log(`📱 Quote SMS sent to ${customer.phoneNumber}`);
          
          // Update quote sent timestamp
          await db.update(orders)
            .set({ quoteSentAt: new Date() })
            .where(eq(orders.id, quoteOrder.id));
        } catch (smsError) {
          console.error('❌ Failed to send quote SMS:', smsError);
        }
      }

      console.log(`✅ Quote ${orderNumber} created successfully`);

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
            const unitWeightKg = sellingType === 'pallets'
              ? parseFloat(product?.palletWeight || product?.pallet_weight || '0')
              : parseFloat(product?.unitWeight || product?.unit_weight || '0');
            if (unitWeightKg > 0) wholesalerTotalWeightKg += unitWeightKg * item.quantity;
            itemsForEmail.push(`<li style="margin: 6px 0;"><strong>${displayName}</strong> - ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = <strong>£${itemTotal.toFixed(2)}</strong></li>`);
          }
          const wholesalerWeightRowHtml = wholesalerTotalWeightKg > 0 ? `<tr><td style="padding:4px 0">Total Weight:</td><td style="padding:4px 0;text-align:right">${wholesalerTotalWeightKg.toFixed(2)} kg</td></tr>` : '';

          const paymentStatusText = isPayLater ? emailBadge('Pay Later', '#3b82f6') : emailBadge('Awaiting Payment', '#f59e0b');
          let fullDeliveryAddressText = resolvedDeliveryAddress || '';
          if (fulfillmentType === 'delivery' && !fullDeliveryAddressText && resolvedDeliveryAddressId) {
            try {
              const addr = await storage.getDeliveryAddress(resolvedDeliveryAddressId);
              if (addr) {
                fullDeliveryAddressText = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ');
              }
            } catch (e) { /* ignore */ }
          }
          const deliveryLineHtml = fulfillmentType === 'delivery'
            ? `<p style="margin:4px 0 0"><b>Fulfillment:</b> Delivery${quoteDeliveryCharge > 0 ? ` (£${quoteDeliveryCharge.toFixed(2)})` : ''}</p>${fullDeliveryAddressText ? `<p style="margin:4px 0 0"><b>Address:</b> ${fullDeliveryAddressText}</p>` : ''}${wholesaler.deliveryNote ? `<p style="margin:4px 0 0;font-style:italic;color:#92400e">📦 ${wholesaler.deliveryNote}</p>` : ''}`
            : `<p style="margin:4px 0 0"><b>Fulfillment:</b> Collection</p>`;
          const deliveryRowHtml = quoteDeliveryCharge > 0 ? `<tr><td style="padding:4px 0">Delivery:</td><td style="padding:4px 0;text-align:right">£${quoteDeliveryCharge.toFixed(2)}</td></tr>` : '';
          // Wholesaler sees subtotal (products + delivery) — never the customer transaction fee
          const wholesalerDeposit = isDeposit ? subtotal * (validDepositPercentage / 100) : 0;
          const wholesalerOutstanding = isDeposit ? subtotal - wholesalerDeposit : 0;
          const quoteEmailBody = `${emailHeading('Quote Created', { size: '22px', color: '#10b981' })}<p style="margin:0 0 4px">Order <b>${orderNumber}</b></p><p style="margin:0 0 16px;font-size:14px;color:#6b7280">${formatDateTime(new Date())}</p>${emailCard(`<p style="margin:0 0 4px"><b>Customer:</b> ${customer.firstName} ${customer.lastName}</p>${customer.businessName ? `<p style="margin:0 0 4px"><b>Business:</b> ${customer.businessName}</p>` : ''}${customer.phoneNumber ? `<p style="margin:0 0 4px"><b>Phone:</b> ${customer.phoneNumber}</p>` : ''}${customer.email ? `<p style="margin:0 0 4px"><b>Email:</b> ${customer.email}</p>` : ''}${deliveryLineHtml}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<ul style="margin:8px 0 16px;padding-left:20px">${itemsForEmail.join('')}</ul><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:4px 0">Products:</td><td style="padding:4px 0;text-align:right">£${productSubtotal.toFixed(2)}</td></tr>${deliveryRowHtml}${wholesalerWeightRowHtml}${isDeposit ? `<tr><td style="padding:4px 0">Deposit (${validDepositPercentage}%):</td><td style="padding:4px 0;text-align:right">£${wholesalerDeposit.toFixed(2)}</td></tr><tr><td style="padding:4px 0">Outstanding:</td><td style="padding:4px 0;text-align:right">£${wholesalerOutstanding.toFixed(2)}</td></tr>` : ''}<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">Total:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">£${subtotal.toFixed(2)}</td></tr></table><p style="margin:16px 0 4px"><b>Sent via:</b> ${sendVia === 'sms' ? 'SMS' : 'WhatsApp'}</p><p style="margin:0 0 4px"><b>Payment:</b> ${paymentStatusText}</p>${paymentLinkUrl ? emailButton('View Payment Link', paymentLinkUrl, '#059669') : ''}${emailButton('View in Dashboard', `${process.env.APP_URL || 'https://quikpik.app'}/orders`)}`;
          const quoteHtml = wrapCustomerEmail(quoteEmailBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl, wholesaler.updatedAt) }, { preheader: `Quote ${orderNumber} sent to ${customer.firstName} - £${subtotal.toFixed(2)}` });
          console.log(`📏 Quote email HTML size: ${Buffer.byteLength(quoteHtml, 'utf8')} bytes (Gmail clips at ~102400)`);
          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `Quote ${orderNumber} Sent to ${customer.firstName} ${customer.lastName}`,
            html: quoteHtml
          });
          console.log(`📧 Quote confirmation email sent to ${wholesaler.email}`);
        }
      } catch (quoteEmailError) {
        console.error('Failed to send quote confirmation email:', quoteEmailError);
      }

      // Send quote email to customer
      try {
        if (customer.email) {
          const isDeposit = validDepositPercentage > 0 && validDepositPercentage < 100;
          const isPayLater = validDepositPercentage === 0;
          const businessName = wholesaler.businessName || wholesaler.name || 'Your supplier';
          const customerItemsHtml: string[] = [];
          const pdfItems: any[] = [];
          let totalWeightKg = 0;
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const packDesc = formatPackDescriptor(product?.quantityInPack, product?.unitSize, product?.unitOfMeasure);
            const displayName = packDesc ? `${productName} (${packDesc})` : productName;
            const sellingType = item.sellingType || 'units';
            const itemTotal = item.customPrice * item.quantity;
            const unitWeightKg = sellingType === 'pallets'
              ? parseFloat(product?.palletWeight || product?.pallet_weight || '0')
              : parseFloat(product?.unitWeight || product?.unit_weight || '0');
            if (unitWeightKg > 0) totalWeightKg += unitWeightKg * item.quantity;
            customerItemsHtml.push(`<li style="margin: 6px 0;"><strong>${displayName}</strong> - ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = <strong>£${itemTotal.toFixed(2)}</strong></li>`);
            pdfItems.push({ productName, quantity: item.quantity, unitPrice: item.customPrice.toFixed(2), lineTotal: itemTotal, appliedOfferLabel: null, product: { name: productName, quantityInPack: product?.quantityInPack, unitSize: product?.unitSize, unitOfMeasure: product?.unitOfMeasure } });
          }
          const custDeliveryRowHtml = quoteDeliveryCharge > 0 ? `<tr><td style="padding:4px 0">Delivery:</td><td style="padding:4px 0;text-align:right">£${quoteDeliveryCharge.toFixed(2)}</td></tr>` : '';
          // Resolve delivery address text for customer email
          let custDeliveryAddressText = resolvedDeliveryAddress || '';
          if (fulfillmentType === 'delivery' && !custDeliveryAddressText && resolvedDeliveryAddressId) {
            try {
              const addr = await storage.getDeliveryAddress(resolvedDeliveryAddressId);
              if (addr) custDeliveryAddressText = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ');
            } catch (e) { /* ignore */ }
          }
          const custDeliveryNoteHtml = wholesaler.deliveryNote && fulfillmentType === 'delivery' ? `${emailCard(`<p style="margin:0;font-size:13px">📦 ${wholesaler.deliveryNote}</p>`, { borderColor: '#fde68a', bgColor: '#fffbeb' })}` : '';
          const custPaymentBadge = isPayLater ? emailBadge('Pay Later — No payment required now', '#3b82f6') : (isDeposit ? emailBadge(`Deposit required: £${depositAmount.toFixed(2)}`, '#f59e0b') : emailBadge(`Payment required: £${total.toFixed(2)}`, '#10b981'));
          const quoteTxFee = !isPayLater ? Math.max(0, total - productSubtotal - quoteDeliveryCharge) : 0;
          const custEmailBody = `${emailHeading(`Quote from ${businessName}`, { size: '22px', color: '#10b981' })}<p style="margin:0 0 4px">Order <b>${orderNumber}</b></p><p style="margin:0 0 16px;font-size:14px;color:#6b7280">${formatDateTime(new Date())}</p>${fulfillmentType === 'delivery' ? emailCard(`<p style="margin:0 0 4px"><b>Fulfillment:</b> Delivery</p>${quoteDeliveryCharge > 0 ? `<p style="margin:0 0 4px"><b>Delivery charge:</b> £${quoteDeliveryCharge.toFixed(2)}</p>` : ''}${custDeliveryAddressText ? `<p style="margin:4px 0 0"><b>Delivery address:</b> ${custDeliveryAddressText}</p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' }) : emailCard(`<p style="margin:0"><b>Fulfillment:</b> Collection</p>`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<ul style="margin:8px 0 16px;padding-left:20px">${customerItemsHtml.join('')}</ul><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:4px 0">Products:</td><td style="padding:4px 0;text-align:right">£${productSubtotal.toFixed(2)}</td></tr>${custDeliveryRowHtml}${!isPayLater && quoteTxFee > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Service Fee (${customerFeeLabel()}):</td><td style="padding:4px 0;text-align:right;color:#6b7280;font-size:14px">£${quoteTxFee.toFixed(2)}</td></tr>` : ''}${isDeposit ? `<tr><td style="padding:4px 0">Deposit (${validDepositPercentage}%):</td><td style="padding:4px 0;text-align:right">£${depositAmount.toFixed(2)}</td></tr><tr><td style="padding:4px 0">Remaining balance:</td><td style="padding:4px 0;text-align:right">£${outstandingAmount.toFixed(2)}</td></tr>` : ''}<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">Total:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">£${total.toFixed(2)}</td></tr>${totalWeightKg > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Total Weight:</td><td style="padding:4px 0;text-align:right;color:#6b7280;font-size:14px">${totalWeightKg.toFixed(2)} kg</td></tr>` : ''}</table>${custDeliveryNoteHtml}<p style="margin:16px 0 8px">${custPaymentBadge}</p>${!isPayLater && paymentLinkUrl ? emailButton('Pay Now', paymentLinkUrl, '#059669') : ''}${isPayLater ? `<p style="margin:16px 0 4px;font-size:14px;color:#6b7280">Please arrange payment directly with ${businessName}.</p>` : ''}`;
          const custHtml = wrapCustomerEmail(custEmailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl, wholesaler.updatedAt) }, { preheader: `Your quote ${orderNumber} from ${businessName} — £${total.toFixed(2)}` });

          // Generate PDF invoice attachment (non-blocking — email still sends without it if PDF fails)
          let quoteAttachment: SendGridAttachment | null = null;
          try {
            const orderForPdf = { ...quoteOrder, items: pdfItems, retailer: customer, totalWeight: totalWeightKg > 0 ? totalWeightKg : undefined };
            const pdfBuffer = await buildInvoicePdf(orderForPdf, wholesaler, !isPayLater);
            quoteAttachment = {
              content: pdfBuffer.toString('base64'),
              filename: `invoice-${orderNumber}.pdf`,
              type: 'application/pdf',
              disposition: 'attachment',
            };
            console.log(`📎 Invoice PDF generated for quote email: invoice-${orderNumber}.pdf`);
          } catch (pdfErr) {
            console.error('⚠️ Could not generate PDF for quote email (email still sends):', pdfErr);
          }

          if (process.env.SENDGRID_API_KEY) {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
            const custMsg: MailDataRequired = {
              to: customer.email,
              from: { email: 'hello@quikpik.co', name: businessName },
              subject: `Your quote ${orderNumber} from ${businessName}`,
              html: custHtml,
              ...(quoteAttachment ? { attachments: [quoteAttachment] } : {}),
            };
            await sgMail.send(custMsg);
          } else {
            await sendEmail({ to: customer.email, from: 'hello@quikpik.co', subject: `Your quote ${orderNumber} from ${businessName}`, html: custHtml });
          }
          console.log(`📧 Quote email sent to customer: ${customer.email}`);
        }
      } catch (custEmailError) {
        console.error('Failed to send customer quote email:', custEmailError);
      }

      res.json({
        success: true,
        orderId: quoteOrder.id,
        orderNumber: quoteOrder.orderNumber,
        paymentLink: paymentLinkUrl,
        total: total.toFixed(2),
      });

    } catch (error) {
      console.error('❌ Error creating quote:', error);
      res.status(500).json({ error: 'Failed to create quote' });
    }
  });

}
