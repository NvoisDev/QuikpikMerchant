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
        
        // Handle customer portal orders
        if (orderType === 'customer_portal') {
          console.log(`🛒 Processing customer portal order for payment: ${paymentIntent?.id}`);
          
          try {
            // Create order through the same endpoint used by frontend
            const orderEndpoint = await import('./routes');
            // Simulate the API call that frontend would make
            const orderResponse = await fetch(`http://localhost:5000/api/marketplace/create-order`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                paymentIntentId: paymentIntent.id
              })
            });
            
            if (orderResponse.ok) {
              const orderData = await orderResponse.json();
              console.log(`✅ Webhook created order successfully: ${orderData.orderNumber || orderData.id}`);
              
              return res.json({
                received: true,
                message: `Customer order created successfully`,
                orderId: orderData.id,
                orderNumber: orderData.orderNumber
              });
            } else {
              console.error(`❌ Webhook order creation failed:`, orderResponse.status);
              return res.status(400).json({
                error: 'Failed to create order from webhook',
                paymentIntentId: paymentIntent.id
              });
            }
          } catch (orderError) {
            console.error(`❌ Webhook order processing error:`, orderError);
            return res.status(500).json({
              error: 'Order processing failed in webhook',
              paymentIntentId: paymentIntent.id
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

  // Working test endpoint for verification
  app.post('/api/webhook-test', async (req, res) => {
    console.log(`🧪 WEBHOOK TEST EXECUTING at ${new Date().toISOString()}`);
    console.log(`🧪 Body received:`, JSON.stringify(req.body, null, 2));
    res.json({ webhookTest: 'success', timestamp: new Date().toISOString() });
  });
}