/**
 * ADMIN SECURITY AUDIT — payments-connect.ts
 * Audited: 2026-06-23
 *
 * This file contains one admin-email-gated route alongside many non-admin Stripe/payment routes.
 * Guard for the admin route: requireAuth + ADMIN_EMAILS.includes(req._adminEmail || req.user?.email)
 *
 * Route → Guard                                              Notes
 * ─────────────────────────────────────────────────────────────────────────
 * GET  /api/webhooks/stripe/health                           ✅ admin-only; monitoring/health-check endpoint
 *
 * All other routes (webhooks, connect onboarding, payment intents, payouts) are
 * either public Stripe webhook receivers (signature-verified) or requireAuth-scoped
 * to the authenticated wholesaler — no admin privilege required or granted.
 */
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import {
  ADMIN_EMAILS, getAdminEmail, db, enforceNewPlanLimits, eq, or, sql, ne, inArray,
  orders, requireAuth, requireBooleanFeature, requireOwner, sendEmail, sendStripeVerifiedEmail,
  sendCustomerInvoiceEmail, storage, subscriptionAuditLogs, subscriptionPlans,
  unlockForUpgrade, userSubscriptions, users, generateDowngradeEffectiveEmail,
  generateListingLapseReEngagementEmail, formatPackDescriptor, systemErrorLogs,
} from "./shared";
import { getStripeClient, getPublishableKey, getWebhookSecretsWithLabels, isLiveMode, STRIPE_ENVIRONMENT } from "../stripeConfig";
import { businessProfiles, stripeProcessedEvents } from "@shared/schema";
import { logQuoteActivity } from "../utils/quote-activity";
import { getBaseTier, getProductLimit } from "../utils/plan-tier";

export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many payment requests, please try again later." },
});

export function registerPaymentConnectRoutes(app: Express): void {
  // POST /api/stripe/connect
  app.post('/api/stripe/connect', async (req: any, res) => {
    let authenticatedUser = null;

    // Method 1: Check Passport authentication (Google OAuth/Replit auth)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const passportUser = req.user;
      const userId = passportUser?.claims?.sub as string | undefined;
      
      if (userId) {
        authenticatedUser = await storage.getUser(userId);
      }
    }

    // Method 2: Check email-based session authentication
    if (!authenticatedUser) {
      const sessionUser = req.session?.user;
      if (sessionUser?.id) {
        authenticatedUser = await storage.getUser(sessionUser.id);
      }
    }

    // Method 3: Check legacy session userId
    if (!authenticatedUser) {
      const sessionUserId = req.session?.userId;
      if (sessionUserId) {
        authenticatedUser = await storage.getUser(sessionUserId);
      }
    }

    // Final authentication check
    if (!authenticatedUser) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource.",
        redirectUrl: "/login"
      });
    }

    req.user = authenticatedUser;
    try {
      const stripe = getStripeClient(Boolean(authenticatedUser.isTestAccount));

      const user = req.user;

      // Check if user already has a Connect account
      if (user.stripeAccountId) {
        
        try {
          // Get proper base URL — use production domain when deployed, dev domain otherwise
          const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://quikpik.app'
            : (process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : 'http://localhost:5000');
            
          const refreshUrl = `${baseUrl}/settings?tab=integrations`;
          const returnUrl = `${baseUrl}/stripe-success`;
          
          // Get account link for existing account
          const accountLink = await stripe.accountLinks.create({
            account: user.stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
          });
          
          return res.json({ url: accountLink.url, accountId: user.stripeAccountId });
        } catch (linkError: any) {
          console.error('❌ Error creating account link:', linkError.message);
          throw new Error(`Failed to create account link: ${linkError.message}`);
        }
      }

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

      // Update user with Connect account ID
      await storage.updateUser(user.id, {
        stripeAccountId: account.id
      });
      
      // Get proper base URL — use production domain when deployed, dev domain otherwise
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://quikpik.app'
        : (process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000');
        
      const refreshUrl = `${baseUrl}/settings?tab=integrations`;
      const returnUrl = `${baseUrl}/stripe-success`;
      
      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url, accountId: account.id });
    } catch (error: any) {
      console.error('❌ Error creating Stripe Connect account:', error instanceof Error ? error.message : String(error));
      
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
      
      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error('❌ Error creating Stripe dashboard link:', error);
      res.status(500).json({ message: "Failed to create dashboard link. Please try again." });
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

  // GET /api/webhooks/stripe/health — admin-only endpoint so monitoring can confirm the webhook is live
  app.get('/api/webhooks/stripe/health', requireAuth, (req: any, res) => {
    if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const testSecretPresent = !!process.env.STRIPE_WEBHOOK_SECRET;
    const liveSecretPresent = !!process.env.STRIPE_LIVE_WEBHOOK_SECRET;
    const configuredSecrets: string[] = [];
    if (testSecretPresent) configuredSecrets.push('test');
    if (liveSecretPresent) configuredSecrets.push('live');

    return res.json({
      status: 'ok',
      stripeEnvironment: STRIPE_ENVIRONMENT,
      expectingLiveEvents: isLiveMode(),
      configuredWebhookSecrets: configuredSecrets.length > 0 ? configuredSecrets : ['none'],
      testWebhookSecretPresent: testSecretPresent,
      liveWebhookSecretPresent: liveSecretPresent,
    });
  });

  // POST /api/webhooks/stripe
  app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;

    const secretPairs = getWebhookSecretsWithLabels();

    if (secretPairs.length === 0) {
      console.error('❌ No STRIPE_WEBHOOK_SECRET configured');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event | undefined;
    let matchedLabel = 'unknown';
    for (const { secret, label } of secretPairs) {
      try {
        event = getStripeClient().webhooks.constructEvent(req.body, sig, secret);
        matchedLabel = label;
        break; // verified — stop trying
      } catch {
        // try the next secret
      }
    }
    if (!event) {
      console.error('❌ Stripe webhook signature verification failed (tried all secrets)');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // ── Idempotency guard ────────────────────────────────────────────────────
    // Attempt to record this event. If the event_id already exists (unique
    // constraint violation) another delivery already processed it — return 200
    // immediately so Stripe stops retrying without re-running side effects.
    // Any other DB error returns 500 so Stripe retries later.
    try {
      await db.insert(stripeProcessedEvents).values({ eventId: event.id });
    } catch (dedupErr: unknown) {
      const err = dedupErr as { code?: string; message?: string };
      if (err?.code === '23505') {
        return res.status(200).json({ received: true, duplicate: true });
      }
      // Unknown DB error — let Stripe retry by returning 500
      console.error('❌ Stripe idempotency insert failed:', err?.message);
      return res.status(500).json({ error: 'Idempotency check failed' });
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        
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
          
          // Get the current order from database to get accurate totals and existing payments
          const [existingOrder] = await db.select()
            .from(orders)
            .where(eq(orders.id, parseInt(orderId)))
            .limit(1);
          
          if (!existingOrder) {
            console.warn(`⚠️ Order ${orderId} not found in database — skipping webhook, returning 200 to prevent Stripe retry loop`);
            return res.status(200).json({ received: true, skipped: true, reason: `Order ${orderId} not found` });
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
              status: paymentStatus === 'paid'
                ? (existingOrder.status === 'fulfilled' ? 'fulfilled' : 'confirmed')
                : existingOrder.status,
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
          
          // Log payment event for quotes (non-blocking)
          if (existingOrder.isQuote) {
            logQuoteActivity({
              quoteId: parseInt(orderId),
              actionType: paymentStatus === 'paid' ? 'payment_successful' : 'payment_initiated',
              entityType: 'payment',
              newValue: { amountPaid: thisPayment, cumulativePaid, stripeSessionId: session.id },
              description: paymentStatus === 'paid'
                ? `Payment completed — £${thisPayment.toFixed(2)} via Stripe`
                : `Deposit received — £${thisPayment.toFixed(2)} via Stripe (£${newOutstanding.toFixed(2)} outstanding)`,
              performedBy: 'system',
            });
          }

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
          
          const productLimit = getProductLimit(tier);
          
          // Get subscription details from Stripe if available
          let subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          let periodStart: Date = new Date();
          if (session.subscription) {
            try {
              // Use event.livemode (ground truth from Stripe) to pick the correct client.
              // This is more reliable than a DB lookup since the event already knows which
              // environment it came from.
              const stripe = getStripeClient(!event.livemode);
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

          if (getBaseTier(tier) !== 'free') {
            await unlockForUpgrade(userId);
          }
          
          return res.json({
            received: true,
            message: `Subscription ${subscriptionType === 'new' ? 'created' : 'updated'} - ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
        
        return res.json({ received: true, type: event.type });
      }

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data?.object as Stripe.PaymentIntent;
        
        const userId = paymentIntent?.metadata?.userId;
        // Handle all possible tier metadata field names for maximum compatibility
        const tier = paymentIntent?.metadata?.targetTier || 
                     paymentIntent?.metadata?.tier || 
                     paymentIntent?.metadata?.planId;
        
        if (userId && tier) {
          
          const productLimit = getProductLimit(tier);
          
          await storage.updateUser(userId, {
            currentPlan: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });

          if (getBaseTier(tier) !== 'free') {
            await unlockForUpgrade(userId);
          }
          
          return res.json({
            received: true,
            message: `Subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }

        // ── Fallback: order/quote payment via payment_intent.succeeded ──────────
        // When checkout.session.completed is delayed or missed, the payment intent
        // metadata (populated at session creation) lets us mark the order as paid.
        const piOrderId = paymentIntent?.metadata?.orderId;
        const piOrderNumber = paymentIntent?.metadata?.orderNumber;

        if (piOrderId && piOrderNumber) {
          try {
            const [existingOrder] = await db.select()
              .from(orders)
              .where(eq(orders.id, parseInt(piOrderId)))
              .limit(1);

            if (!existingOrder) {
              console.warn(`⚠️ payment_intent.succeeded fallback: order ${piOrderId} not found`);
              return res.json({ received: true, type: event.type });
            }

            // Only act if this PI hasn't already been recorded (avoid double-counting)
            const piId = paymentIntent.id;
            const alreadyRecorded = (existingOrder.stripePaymentIntentId || '')
              .split(',').map((s: string) => s.trim()).includes(piId);

            if (alreadyRecorded) {
              return res.json({ received: true, type: event.type });
            }

            // If the order is already fully paid, nothing to do
            if (existingOrder.paymentStatus === 'paid') {
              return res.json({ received: true, type: event.type });
            }

            const thisPayment = (paymentIntent.amount_received || 0) / 100;
            const previouslyPaid = parseFloat(existingOrder.amountPaid || '0');
            const orderTotal = parseFloat(existingOrder.total || '0');
            const cumulativePaid = previouslyPaid + thisPayment;
            const newOutstanding = Math.max(0, orderTotal - cumulativePaid);

            let paymentStatus = 'unpaid';
            if (newOutstanding <= 0.01) {
              paymentStatus = 'paid';
            } else if (cumulativePaid > 0) {
              paymentStatus = 'part_paid';
            }

            const newPiList = existingOrder.stripePaymentIntentId
              ? `${existingOrder.stripePaymentIntentId},${piId}`
              : piId;

            await db.update(orders)
              .set({
                amountPaid: cumulativePaid.toFixed(2),
                amountOutstanding: newOutstanding.toFixed(2),
                paymentStatus,
                status: paymentStatus === 'paid'
                  ? (existingOrder.status === 'fulfilled' ? 'fulfilled' : 'confirmed')
                  : existingOrder.status,
                stripePaymentIntentId: newPiList,
                stripePaymentLinkUrl: null,
                stripePaymentLinkId: null,
                ...(!existingOrder.paymentMethod ? { paymentMethod: 'payment_link' } : {}),
              })
              .where(eq(orders.id, parseInt(piOrderId)));

          } catch (fallbackErr) {
            console.error(`❌ payment_intent.succeeded fallback failed for order ${piOrderNumber}:`, fallbackErr);
          }
        }

        return res.json({ received: true, type: event.type });
      }

      if (event.type === 'charge.refund.updated') {
        const refund = event.data.object as Stripe.Refund;

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
            }
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

        // Enforce Free plan limits — lock excess products, suspend excess team members, archive excess groups
        let enforcementResult = { productsLocked: 0, teamMembersSuspended: 0, groupsArchived: 0 };
        if (!wasAlreadyFree) {
          enforcementResult = await enforceNewPlanLimits(affectedUser.id, 'free');
        }

        if (!wasAlreadyFree && affectedUser.email) {
          try {
            const wasListingPlan = affectedUser.currentPlan === 'listing';
            if (wasListingPlan) {
              // Check deduplication: only send re-engagement email once per subscription
              const [existingReEngagement] = await db.select().from(subscriptionAuditLogs)
                .where(
                  sql`${subscriptionAuditLogs.userId} = ${affectedUser.id}
                    AND ${subscriptionAuditLogs.eventType} = 'listing_lapse_email'
                    AND ${subscriptionAuditLogs.stripeSubscriptionId} = ${stripeSubscriptionId}`
                );
              if (!existingReEngagement) {
                const { subject, html, text } = generateListingLapseReEngagementEmail({
                  firstName: affectedUser.firstName || '',
                  email: affectedUser.email,
                  businessName: affectedUser.businessName || 'Quikpik',
                  isPastDue: false,
                });
                await sendEmail({ to: affectedUser.email, from: 'hello@quikpik.co', subject, html, text });
                await db.insert(subscriptionAuditLogs).values({
                  userId: affectedUser.id,
                  eventType: 'listing_lapse_email',
                  fromTier: 'listing',
                  toTier: 'free',
                  stripeSubscriptionId,
                  stripeCustomerId: typeof stripeCustomerId === 'string' ? stripeCustomerId : null,
                  reason: 'Re-engagement email sent after Listing plan subscription canceled',
                });
              }
            } else {
              const { subject, html, text } = generateDowngradeEffectiveEmail({
                firstName: affectedUser.firstName || '',
                email: affectedUser.email,
                businessName: affectedUser.businessName || 'Quikpik',
                productsLocked: enforcementResult.productsLocked || undefined,
                teamMembersSuspended: enforcementResult.teamMembersSuspended || undefined,
                groupsArchived: enforcementResult.groupsArchived || undefined,
              });
              await sendEmail({ to: affectedUser.email, from: 'hello@quikpik.co', subject, html, text });
            }
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade/lapse email:', emailErr);
          }
        }

        return res.json({ received: true, type: event.type });
      }

      // ── Subscription activated / updated (fallback for checkout.session.completed) ──
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const subscription = event.data.object as Stripe.Subscription;

        // ── Past-due re-engagement for Listing plan ──
        if (event.type === 'customer.subscription.updated' && subscription.status === 'past_due') {
          const pastDueCustId = typeof subscription.customer === 'string'
            ? subscription.customer : subscription.customer.id;
          const pastDuePriceId = subscription.items?.data?.[0]?.price?.id;
          if (pastDueCustId && pastDuePriceId) {
            const [pastDueUser] = await db.select().from(users).where(eq(users.stripeCustomerId, pastDueCustId));
            if (pastDueUser?.email && pastDueUser.currentPlan === 'listing') {
              try {
                const [existingPastDueEmail] = await db.select().from(subscriptionAuditLogs)
                  .where(
                    sql`${subscriptionAuditLogs.userId} = ${pastDueUser.id}
                      AND ${subscriptionAuditLogs.eventType} = 'listing_lapse_email'
                      AND ${subscriptionAuditLogs.stripeSubscriptionId} = ${subscription.id}`
                  );
                if (!existingPastDueEmail) {
                  const { subject, html, text } = generateListingLapseReEngagementEmail({
                    firstName: pastDueUser.firstName || '',
                    email: pastDueUser.email,
                    businessName: pastDueUser.businessName || 'Quikpik',
                    isPastDue: true,
                  });
                  await sendEmail({ to: pastDueUser.email, from: 'hello@quikpik.co', subject, html, text });
                  await db.insert(subscriptionAuditLogs).values({
                    userId: pastDueUser.id,
                    eventType: 'listing_lapse_email',
                    fromTier: 'listing',
                    toTier: 'listing',
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: pastDueCustId,
                    reason: 'Re-engagement email sent after Listing plan payment failed (past_due)',
                  });
                }
              } catch (pastDueEmailErr) {
                console.error('❌ Failed to send listing past_due re-engagement email:', pastDueEmailErr);
              }
            }
          }
          return res.json({ received: true, type: event.type });
        }

        if (subscription.status !== 'active' && subscription.status !== 'trialing') {
          return res.json({ received: true, type: event.type });
        }
        const subCustId = typeof subscription.customer === 'string'
          ? subscription.customer : subscription.customer.id;
        const subPriceId = subscription.items?.data?.[0]?.price?.id;
        if (!subCustId || !subPriceId) return res.json({ received: true, type: event.type });

        const [subUser] = await db.select().from(users).where(eq(users.stripeCustomerId, subCustId));
        if (!subUser) {
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
          return res.json({ received: true, type: event.type });
        }

        // Only skip if BOTH the plan and the status are already in sync AND the subscription ID
        // is already persisted — a trialing → active transition must not be suppressed.
        // Do NOT short-circuit when stripeSubscriptionId is missing: checkout.session.completed
        // may have set currentPlan/subscriptionStatus but missed writing the ID.
        // Also do NOT short-circuit when the period end has advanced — this catches renewals where
        // the plan/status are unchanged but the billing window has moved forward.
        const incomingStatus = subscription.status === 'trialing' ? 'trialing' : 'active';
        const subPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const subPeriodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : new Date();

        const storedPeriodEnd = subUser.subscriptionPeriodEnd ?? subUser.subscriptionEndsAt;
        const periodEndUnchanged = storedPeriodEnd
          ? Math.abs(storedPeriodEnd.getTime() - subPeriodEnd.getTime()) < 60_000
          : false;

        if (
          subUser.currentPlan === subPlanId &&
          subUser.subscriptionStatus === incomingStatus &&
          subUser.stripeSubscriptionId === subscription.id &&
          periodEndUnchanged
        ) {
          return res.json({ received: true, type: event.type });
        }

        const subProductLimit = subPlanId === 'premium' ? -1 : (subPlanId === 'standard' ? 5 : 2);

        // Map Stripe's trial timestamps (Unix) to Date objects for DB persistence
        const subTrialStart = subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null;
        const subTrialEnd = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null;

        await storage.updateUser(subUser.id, {
          currentPlan: subPlanId,
          subscriptionTier: subPlanId,
          subscriptionStatus: subscription.status === 'trialing' ? 'trialing' : 'active',
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
            status: subscription.status === 'trialing' ? 'trialing' : 'active',
            currentPeriodStart: subPeriodStart,
            currentPeriodEnd: subPeriodEnd,
            cancelAtPeriodEnd: subCancelAtPeriodEnd,
            trialStart: subTrialStart,
            trialEnd: subTrialEnd,
            updatedAt: new Date(),
          }).where(eq(userSubscriptions.userId, subUser.id));
        } else {
          await db.insert(userSubscriptions).values({
            userId: subUser.id,
            planId: subPlanId,
            stripeSubscriptionId: subscription.id,
            status: subscription.status === 'trialing' ? 'trialing' : 'active',
            currentPeriodStart: subPeriodStart,
            currentPeriodEnd: subPeriodEnd,
            cancelAtPeriodEnd: subCancelAtPeriodEnd,
            trialStart: subTrialStart,
            trialEnd: subTrialEnd,
          });
        }

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
        const invSubId = typeof invoice.subscription === 'string' ? invoice.subscription : typeof invoice.subscription === 'object' && invoice.subscription !== null ? invoice.subscription.id
            : null;
        if (!invCustId || !invSubId) return res.json({ received: true, type: event.type });

        const [invUser] = await db.select().from(users).where(eq(users.stripeCustomerId, invCustId));
        if (!invUser) {
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
          return res.json({ received: true, type: event.type });
        }

        const invAmountPaid = (invoice.amount_paid ?? 0) / 100;
        const invCurrency = (invoice.currency ?? 'gbp').toUpperCase();
        if (invAmountPaid > 0) {
          db.insert(subscriptionAuditLogs).values({
            userId: invUser.id,
            eventType: 'payment_success',
            toTier: invPlanId,
            amount: invAmountPaid.toFixed(2),
            currency: invCurrency,
            stripeSubscriptionId: invSubId,
            stripeInvoiceId: invoice.id,
            reason: `Stripe invoice ${invoice.id} — ${billingReason}`,
          }).catch(err => console.error('Failed to log payment_success:', err));
        }

        // Calculate period dates FIRST so the early-exit guard can check them.
        // Moving this above the guard is the critical fix: the old code would skip
        // updating period dates on renewals where the plan and status are unchanged
        // (which is exactly what happens every month on auto-renew).
        const invPeriodEnd = new Date(invSub.current_period_end * 1000);
        const invPeriodStart = new Date(invSub.current_period_start * 1000);
        const storedInvPeriodEnd = invUser.subscriptionPeriodEnd ?? invUser.subscriptionEndsAt;
        const invPeriodEndUnchanged = storedInvPeriodEnd
          ? Math.abs(storedInvPeriodEnd.getTime() - invPeriodEnd.getTime()) < 60_000
          : false;

        // Only skip when plan, status, AND billing period are all already in sync.
        // Do NOT skip when the period end has advanced — that is the renewal scenario.
        if (invUser.currentPlan === invPlanId && invUser.subscriptionStatus === 'active' && invPeriodEndUnchanged) {
          return res.json({ received: true, type: event.type });
        }

        const invProductLimit = invPlanId === 'premium' ? -1 : (invPlanId === 'standard' ? 5 : 2);

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
            if (wholesaler && wholesaler.email && wholesaler.role === 'wholesaler') {
              // Atomically claim the send slot — sets stripe_verified_email_sent_at
              // only if it is currently NULL, preventing duplicate sends under
              // concurrent webhook deliveries or rapid retries.
              const claimed = await storage.claimStripeVerifiedEmailSend(wholesaler.id);
              if (claimed) {
                const businessName =
                  wholesaler.businessName ||
                  `${wholesaler.firstName ?? ''} ${wholesaler.lastName ?? ''}`.trim() ||
                  'there';
                const sent = await sendStripeVerifiedEmail({
                  wholesalerEmail: wholesaler.email,
                  wholesalerName: businessName,
                });
                if (!sent) {
                  // Roll back the claim so a future account.updated event (or internal retry) can try again.
                  await storage.updateUserSettings(wholesaler.id, { stripeVerifiedEmailSentAt: null });
                  console.error(`❌ account.updated: sendStripeVerifiedEmail failed for wholesaler ${wholesaler.id} — returning 200 so Stripe does not retry`);
                  // Return 200: email failure is not Stripe's concern; retrying via Stripe causes the
                  // 35-event retry loop. The claim is already rolled back so an internal retry or the
                  // next Stripe account.updated delivery will re-attempt.
                  return res.json({ received: true, type: event.type, warning: 'Email delivery failed — will retry internally' });
                }
              }
            }
          } catch (err) {
            console.error('❌ Error processing account.updated webhook:', err);
            // Return 200 so Stripe does not keep retrying an event it cannot influence.
            return res.json({ received: true, type: event.type, warning: 'Webhook processing error — logged' });
          }
        }
        return res.json({ received: true, type: event.type });
      }

      // Acknowledge all other events
      res.json({ received: true, type: event.type });
      
    } catch (error) {
      // Classify the error: only return 5xx (triggering Stripe retries) for genuinely
      // transient infrastructure failures. All business/data/logic errors that escape
      // inline handling return 200 so Stripe does not keep retrying the event.
      const isTransient = isTransientError(error);
      if (isTransient) {
        console.error('❌ Transient infrastructure error in webhook handler — returning 500 so Stripe retries:', error);
        return res.status(500).json({ error: 'Webhook processing failed — transient error, please retry' });
      }
      console.error('❌ Non-transient error in webhook handler — returning 200 to stop Stripe retry loop (event logged for investigation):', error);
      return res.status(200).json({ received: true, skipped: true, reason: 'Non-transient processing error — see server logs' });
    }
  });

  /**
   * Returns true for transient infrastructure errors that warrant a Stripe retry (5xx).
   * Returns false for business-logic, data, or programming errors that should not
   * be retried (non-transient — return 200 so Stripe stops delivering the event).
   */
  function isTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as Record<string, unknown>;

    // Node.js network/system error codes that indicate a recoverable outage
    const transientCodes = new Set([
      'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT',
      'EPIPE', 'EHOSTUNREACH', 'ENETDOWN', 'ENETUNREACH',
    ]);
    if (typeof e.code === 'string' && transientCodes.has(e.code)) return true;

    // PostgreSQL error class 08 = Connection Exception
    // PostgreSQL error class 57 = Operator Intervention (e.g. admin shutdown)
    if (typeof e.code === 'string' && (e.code.startsWith('08') || e.code.startsWith('57'))) return true;

    // Generic message patterns that indicate a connectivity/timeout issue
    const msg = (typeof e.message === 'string' ? e.message : '').toLowerCase();
    const transientPatterns = [
      'connection refused', 'connection terminated', 'connection reset',
      'timed out', 'etimedout', 'econnrefused', 'econnreset',
      'could not connect', 'server closed the connection',
      'too many connections', 'connection pool',
    ];
    if (transientPatterns.some(p => msg.includes(p))) return true;

    return false;
  }

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
            name: user.businessName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
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
  app.post("/api/create-payment-intent", paymentLimiter, requireAuth, requireBooleanFeature('payments'), async (req: any, res) => {
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

      // Derive a stable idempotency key from the order so retries return the same intent
      const idempotencyKey = `pi_${order.wholesalerId}_${userId}_${order.id}_${totalAmount}`;

      const paymentIntent = await stripeClient.paymentIntents.create(
        paymentIntentData,
        { idempotencyKey }
      );

      if (retailer?.email) {
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

      // Per-transaction order match using four complementary strategies:
      //   1. source = "tr_xxx" → DB lookup by stripeTransferId (fast path for new orders)
      //   2. source = "tr_xxx" fallback → expand Transfer on platform to get source_transaction.payment_intent
      //   3. source = "ch_xxx" → retrieve charge from connected account, get source_transfer, repeat above
      //   4. source = "pi_xxx" → DB lookup by stripePaymentIntentId
      //   5. Universal fallback → match by exact net amount + wholesaler + date window
      const transactions = await Promise.all(
        chargeTxns.map(async (t) => {
          const sourceId = typeof t.source === 'string' ? t.source : (t.source as { id?: string } | null)?.id ?? null;
          let order: Awaited<ReturnType<typeof storage.getOrderByTransferId>> | undefined;

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
              const rawPi = sourceTxn && typeof sourceTxn === 'object'
                ? (sourceTxn as Stripe.Charge).payment_intent
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
              console.warn(`⚠️ Could not expand Transfer ${trId}:`, e instanceof Error ? e.message : String(e));
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
                : (rawTr && typeof rawTr === 'object' ? (rawTr as Stripe.Transfer).id : null);
              if (trId) {
                order = await findByTransferId(trId);
              }
            } catch (e) {
              console.warn(`⚠️ Could not retrieve charge ${sourceId}:`, e instanceof Error ? e.message : String(e));
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
              // Backfill Transfer ID if source was a Transfer and we now have the order
              if (sourceId?.startsWith('tr_') && !order.stripeTransferId) {
                storage.updateOrder(order.id, { stripeTransferId: sourceId })
                  .catch((e) => console.warn(`⚠️ stripeTransferId backfill failed for order ${order!.id}:`, e));
              }
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
}
