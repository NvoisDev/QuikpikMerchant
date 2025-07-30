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