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
  apiVersion: "2023-10-16",
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
      // Handle all possible tier metadata field names for maximum compatibility
      const tier = session?.metadata?.targetTier || 
                   session?.metadata?.tier || 
                   session?.metadata?.planId;
      
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
        
        // Log upgrade success with timestamp for debugging
        console.log(`📈 SUBSCRIPTION UPGRADE COMPLETED:`, {
          userId,
          tier,
          productLimit,
          timestamp: new Date().toISOString(),
          eventType: 'checkout.session.completed'
        });
        
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
      // Handle all possible tier metadata field names for maximum compatibility
      const tier = paymentIntent?.metadata?.targetTier || 
                   paymentIntent?.metadata?.tier || 
                   paymentIntent?.metadata?.planId;
      
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
        
        // Log upgrade success with timestamp for debugging
        console.log(`📈 SUBSCRIPTION UPGRADE COMPLETED:`, {
          userId,
          tier,
          productLimit,
          timestamp: new Date().toISOString(),
          eventType: 'payment_intent.succeeded'
        });
        
        return res.json({
          received: true,
          message: `Payment processed - subscription upgraded to ${tier}`,
          userId: userId,
          tier: tier,
          productLimit: productLimit
        });
      }
      
      // Handle customer portal orders with immediate acknowledgment
      if (orderType === 'customer_portal') {
        console.log(`🛒 Customer portal order payment received: ${paymentIntent?.id}`);
        
        // CRITICAL FIX: Acknowledge webhook immediately, process order in background
        // This prevents Stripe webhook timeouts that were blocking payment completion
        
        // Schedule order processing in background (non-blocking)
        setImmediate(async () => {
          try {
            console.log(`📦 Background processing order for payment: ${paymentIntent?.id}`);
            
            // Import order processing logic
            const { processCustomerPortalOrder } = await import('./order-processor');
            
            // Process order in background
            const orderResult = await processCustomerPortalOrder(paymentIntent);
            
            console.log(`✅ Background order processing complete: ${orderResult.orderNumber || orderResult.id}`);
            
          } catch (orderError: any) {
            console.error(`❌ Background order processing error for payment ${paymentIntent?.id}:`, orderError);
            console.error(`❌ Full error details:`, orderError.stack);
            
            // TODO: Implement retry mechanism or alert system for failed background processing
            // For now, log the error for monitoring
            console.error(`🚨 CRITICAL: Order creation failed for successful payment ${paymentIntent?.id}`);
          }
        });
        
        // Return immediate success to Stripe to prevent timeout/blocking
        return res.json({
          received: true,
          message: `Payment acknowledged - order processing in background`,
          paymentIntentId: paymentIntent.id,
          status: 'processing'
        });
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
  
  // If this is a test order, process it like a real webhook
  if (req.body.payment_intent && req.body.payment_intent.metadata) {
    try {
      console.log(`🧪 Processing test order for fulfillment type verification`);
      
      // Import order processing logic directly
      const { processCustomerPortalOrder } = await import('./order-processor');
      
      // Create a fake payment_intent object with customer_portal order type
      const testPaymentIntent = {
        ...req.body.payment_intent,
        metadata: {
          ...req.body.payment_intent.metadata,
          orderType: 'customer_portal'
        }
      };
      
      console.log(`🧪 Test shipping info: ${testPaymentIntent.metadata.shippingInfo}`);
      
      // Process order directly  
      const orderResult = await processCustomerPortalOrder(testPaymentIntent);
      
      console.log(`✅ Test order created: ${orderResult.orderNumber} with fulfillment type: ${orderResult.fulfillmentType}`);
      
      return res.json({
        standaloneTesting: 'success',
        timestamp: new Date().toISOString(),
        orderCreated: {
          orderNumber: orderResult.orderNumber,
          fulfillmentType: orderResult.fulfillmentType,
          customerName: orderResult.customerName
        }
      });
      
    } catch (error: any) {
      console.error(`❌ Test order processing error:`, error);
      return res.json({
        standaloneTesting: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
  
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