import express from 'express';
import Stripe from 'stripe';
import { storage } from "./storage";

// Create standalone webhook server
const webhookApp = express();
const webhookPort = 5001;

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-07-30.basil",
});

// Middleware for JSON parsing
webhookApp.use(express.json());

// CORS middleware
webhookApp.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Working webhook endpoint on standalone server
webhookApp.post('/api/webhooks/stripe', async (req, res) => {
  console.log(`🚀 STANDALONE WEBHOOK EXECUTING at ${new Date().toISOString()}`);
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
      if (orderType === 'customer_portal') {
        console.log(`🛒 Processing customer portal order for payment: ${paymentIntent?.id}`);
        
        try {
          // Step 1: Process the order first
          const { processCustomerPortalOrder } = await import('./order-processor');
          
          console.log(`📦 About to process order with payment intent:`, paymentIntent?.id);
          const orderResult = await processCustomerPortalOrder(paymentIntent);
          console.log(`✅ Order created successfully: ${orderResult.orderNumber || orderResult.id}`);
          
          // Step 2: Handle automatic transfer for marketplace architecture
          const marketplaceArchitecture = paymentIntent?.metadata?.marketplaceArchitecture;
          if (marketplaceArchitecture === 'platform_collects_all') {
            
            const wholesalerAccountId = paymentIntent?.metadata?.wholesalerStripeAccountId;
            const wholesalerReceives = parseFloat(paymentIntent?.metadata?.wholesalerReceives || '0');
            
            if (wholesalerAccountId && wholesalerReceives > 0) {
              console.log(`💸 Creating automatic transfer: £${wholesalerReceives} to ${wholesalerAccountId}`);
              
              try {
                // Import Stripe from routes
                const Stripe = (await import('stripe')).default;
                const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
                  apiVersion: "2025-07-30.basil"
                }) : null;

                if (stripe) {
                  // Create automatic transfer to wholesaler
                  const transfer = await stripe.transfers.create({
                    amount: Math.round(wholesalerReceives * 100), // Convert to pence
                    currency: 'gbp',
                    destination: wholesalerAccountId,
                    metadata: {
                      orderId: orderResult.id || 'unknown',
                      orderNumber: orderResult.orderNumber || 'unknown',
                      paymentIntentId: paymentIntent.id,
                      purpose: 'marketplace_wholesaler_payment',
                      productSubtotal: paymentIntent?.metadata?.productSubtotal || '0',
                      platformFee: paymentIntent?.metadata?.wholesalerPlatformFee || '0'
                    }
                  });
                  
                  console.log(`✅ Transfer completed: ${transfer.id} - £${wholesalerReceives} to wholesaler`);
                  
                } else {
                  console.error('❌ Stripe not configured for transfers');
                }
              } catch (transferError: any) {
                console.error('❌ Transfer failed:', transferError);
                // Don't fail the webhook if transfer fails, order was still created
              }
            } else {
              console.log('⚠️ No transfer needed - missing account ID or zero amount');
            }
          }
          
          return res.json({
            received: true,
            message: `Customer order created successfully`,
            orderId: orderResult.id,
            orderNumber: orderResult.orderNumber
          });
          
        } catch (orderError: any) {
          console.error(`❌ Webhook order processing error:`, orderError);
          console.error(`❌ Full error details:`, orderError.stack);
          return res.status(500).json({
            error: 'Order processing failed in webhook',
            paymentIntentId: paymentIntent.id,
            errorMessage: orderError.message
          });
        }
      }
    }
    
    console.log(`📝 Webhook received: ${event.type}`);
    return res.json({ received: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Test endpoint
webhookApp.post('/api/webhook-test', async (req, res) => {
  console.log(`🧪 STANDALONE TEST EXECUTING at ${new Date().toISOString()}`);
  console.log(`🧪 Body received:`, JSON.stringify(req.body, null, 2));
  res.json({ standaloneTesting: 'success', timestamp: new Date().toISOString() });
});

// Health check
webhookApp.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'standalone-webhook', timestamp: new Date().toISOString() });
});

// Start standalone webhook server
export function startStandaloneWebhook() {
  const server = webhookApp.listen(webhookPort, () => {
    console.log(`🚀 Standalone webhook server running on port ${webhookPort}`);
    console.log(`🔗 Webhook endpoint: http://localhost:${webhookPort}/api/webhooks/stripe`);
    console.log(`🧪 Test endpoint: http://localhost:${webhookPort}/api/webhook-test`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${webhookPort} is already in use. Webhook server may already be running.`);
    } else {
      console.error('❌ Webhook server error:', err);
    }
  });

  return server;
}

// Auto-start if this file is run directly
if (process.argv[1] && process.argv[1].includes('standalone-webhook.ts')) {
  startStandaloneWebhook();
}