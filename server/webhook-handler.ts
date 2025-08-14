import { type Express } from "express";
import Stripe from 'stripe';
import { storage } from "./storage";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-06-30.basil",
});

export function registerWebhookRoutes(app: Express) {
  // Dedicated Stripe webhook handler - isolated from main routes
  app.post('/api/webhooks/stripe', async (req, res) => {
    console.log(`🚀 STRIPE WEBHOOK EXECUTING at ${new Date().toISOString()}`);
    console.log(`📦 Event data:`, JSON.stringify(req.body, null, 2));
    
    try {
      const event = req.body;
      
      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object;
        console.log(`💳 Checkout completed: ${session?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(session?.metadata, null, 2));
        
        const userId = session?.metadata?.userId;
        const tier = session?.metadata?.tier || session?.metadata?.targetTier;
        
        if (userId && tier) {
          console.log(`🔄 Processing upgrade: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 10 : 3);
          
          await storage.updateUser(userId, {
            subscriptionTier: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
          
          console.log(`✅ Upgraded ${userId} to ${tier} successfully`);
          
          return res.json({
            received: true,
            message: `Subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        } else {
          console.log(`❌ Missing metadata: userId=${userId}, tier=${tier}`);
          return res.status(400).json({ 
            error: 'Missing user or plan metadata',
            receivedMetadata: session?.metadata 
          });
        }
      }

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data?.object;
        console.log(`💰 Payment succeeded: ${paymentIntent?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(paymentIntent?.metadata, null, 2));
        
        const userId = paymentIntent?.metadata?.userId;
        const tier = paymentIntent?.metadata?.tier || paymentIntent?.metadata?.targetTier;
        const orderType = paymentIntent?.metadata?.orderType;
        
        // Handle subscription upgrades
        if (userId && tier) {
          console.log(`🔄 Processing payment upgrade: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 10 : 3);
          
          await storage.updateUser(userId, {
            subscriptionTier: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
          
          console.log(`✅ Payment upgrade complete: ${userId} to ${tier}`);
          
          return res.json({
            received: true,
            message: `Payment processed - subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
        
        // Handle customer portal orders directly in webhook
        console.log(`🔍 Checking orderType: "${orderType}" (type: ${typeof orderType})`);
        if (orderType === 'customer_portal') {
          console.log(`🛒 Processing customer portal order for payment: ${paymentIntent?.id}`);
          
          try {
            // ENHANCED: Handle separate delivery fee transfer for Stripe Connect accounts
            const hasStripeConnect = paymentIntent?.metadata?.hasStripeConnect === 'true';
            const deliveryRouting = paymentIntent?.metadata?.deliveryRouting;
            const platformDeliveryFee = parseFloat(paymentIntent?.metadata?.platformDeliveryFee || '0');
            const platformTransactionFee = parseFloat(paymentIntent?.metadata?.platformTransactionFee || '0');
            
            console.log(`💰 Payment breakdown - Connect: ${hasStripeConnect}, Delivery Fee: £${platformDeliveryFee}, Transaction Fee: £${platformTransactionFee}`);
            
            // Step 1: Create the order first
            const { processCustomerPortalOrder, parseCustomerName } = await import('./order-processor');
            console.log(`📦 About to process order with payment intent:`, paymentIntent?.id);
            const orderResult = await processCustomerPortalOrder(paymentIntent);
            console.log(`✅ Order created successfully: ${orderResult.orderNumber || orderResult.id}`);
            
            // Step 2: Handle separate delivery fee transfer if using Stripe Connect
            if (hasStripeConnect && deliveryRouting === 'separate_to_platform' && platformDeliveryFee > 0) {
              console.log(`🚛 Processing separate delivery fee transfer: £${platformDeliveryFee} to platform`);
              
              try {
                // Get the charge ID from the payment intent
                const chargeId = paymentIntent?.charges?.data?.[0]?.id;
                if (!chargeId) {
                  console.warn(`⚠️ No charge ID found for delivery transfer on payment ${paymentIntent?.id}`);
                } else {
                  // Import Stripe instance
                  const { stripe } = await import('./index');
                  
                  if (stripe) {
                    // Create separate transfer for delivery fee + transaction fee to platform
                    const totalPlatformTransfer = platformDeliveryFee + platformTransactionFee;
                    
                    const deliveryTransfer = await stripe.transfers.create({
                      amount: Math.round(totalPlatformTransfer * 100), // Convert to cents
                      currency: 'gbp',
                      description: `Delivery fee (£${platformDeliveryFee.toFixed(2)}) + Transaction fee (£${platformTransactionFee.toFixed(2)}) for order ${orderResult.orderNumber}`,
                      metadata: {
                        orderId: orderResult.id,
                        orderNumber: orderResult.orderNumber,
                        deliveryFee: platformDeliveryFee.toFixed(2),
                        transactionFee: platformTransactionFee.toFixed(2),
                        totalTransfer: totalPlatformTransfer.toFixed(2),
                        purpose: 'parcel2go_prepaid_funding'
                      }
                    });
                    
                    console.log(`✅ Delivery fee transfer completed: ${deliveryTransfer.id} - £${totalPlatformTransfer.toFixed(2)} to platform`);
                  } else {
                    console.warn(`⚠️ Stripe not available for delivery transfer`);
                  }
                }
              } catch (transferError) {
                console.error(`❌ Delivery fee transfer failed:`, transferError);
                // Don't fail the entire order process - delivery transfer can be handled manually
              }
            }
            
            return res.json({
              received: true,
              message: `Customer order created successfully`,
              orderId: orderResult.id,
              orderNumber: orderResult.orderNumber,
              deliveryFeeTransferred: hasStripeConnect && deliveryRouting === 'separate_to_platform' && platformDeliveryFee > 0
            });
            
          } catch (orderError) {
            console.error(`❌ Webhook order processing error:`, orderError);
            console.error(`❌ Full error details:`, orderError.stack);
            return res.status(500).json({
              error: 'Order processing failed in webhook',
              paymentIntentId: paymentIntent.id,
              errorMessage: orderError.message
            });
          }
        } else {
          console.log(`⚠️ OrderType "${orderType}" does not match "customer_portal" - skipping order processing`);
        }
      }
      
      console.log(`📝 Webhook received: ${event.type}`);
      return res.json({ received: true });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Working test endpoint for verification
  app.post('/api/webhook-test', async (req, res) => {
    console.log(`🧪 WEBHOOK TEST EXECUTING at ${new Date().toISOString()}`);
    console.log(`🧪 Body received:`, JSON.stringify(req.body, null, 2));
    res.json({ webhookTest: 'success', timestamp: new Date().toISOString() });
  });
}