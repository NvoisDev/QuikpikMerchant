import { Request, Response } from 'express';
import Stripe from 'stripe';
import { storage } from './storage';
import { getUserSubscription } from './stripe-subscription';

// Handle proper Stripe subscription lifecycle events
export async function handleStripeWebhook(req: Request, res: Response) {
  try {
    const event = req.body as Stripe.Event;
    
    console.log(`🎯 Stripe webhook received: ${event.type}`);
    
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
        
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
        
      default:
        console.log(`⚠️ Unhandled webhook event: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

// Handle new subscription creation
async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;
  
  console.log(`✅ Subscription created: ${subscription.id} for customer: ${customerId}`);
  
  try {
    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error(`❌ User not found for Stripe customer: ${customerId}`);
      return;
    }
    
    // Update user with subscription info
    await storage.updateUser(user.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status
    });
    
    console.log(`✅ Updated user ${user.email} with new subscription: ${subscription.id}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription created:', error);
  }
}

// Handle subscription updates (plan changes, status changes)
async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;
  
  console.log(`🔄 Subscription updated: ${subscription.id} - Status: ${subscription.status}`);
  
  try {
    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error(`❌ User not found for Stripe customer: ${customerId}`);
      return;
    }
    
    // Update subscription status
    await storage.updateUser(user.id, {
      subscriptionStatus: subscription.status
    });
    
    console.log(`✅ Updated subscription status for ${user.email}: ${subscription.status}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription updated:', error);
  }
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;
  
  console.log(`🗑️ Subscription deleted: ${subscription.id}`);
  
  try {
    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error(`❌ User not found for Stripe customer: ${customerId}`);
      return;
    }
    
    // Update user to remove subscription
    await storage.updateUser(user.id, {
      stripeSubscriptionId: null,
      subscriptionStatus: 'canceled'
    });
    
    console.log(`✅ Canceled subscription for ${user.email}`);
    
  } catch (error) {
    console.error('❌ Error handling subscription deleted:', error);
  }
}

// Handle successful invoice payments (recurring payments)
async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;
  
  console.log(`💰 Invoice payment succeeded: ${invoice.id} for subscription: ${subscriptionId}`);
  
  try {
    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error(`❌ User not found for Stripe customer: ${customerId}`);
      return;
    }
    
    // Ensure subscription is active
    await storage.updateUser(user.id, {
      subscriptionStatus: 'active'
    });
    
    console.log(`✅ Confirmed active subscription for ${user.email}`);
    
  } catch (error) {
    console.error('❌ Error handling invoice payment succeeded:', error);
  }
}

// Handle failed invoice payments
async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;
  
  console.log(`❌ Invoice payment failed: ${invoice.id}`);
  
  try {
    // Find user by Stripe customer ID
    const user = await storage.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error(`❌ User not found for Stripe customer: ${customerId}`);
      return;
    }
    
    // Update subscription status to past_due
    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due'
    });
    
    console.log(`⚠️ Updated subscription to past_due for ${user.email}`);
    
  } catch (error) {
    console.error('❌ Error handling invoice payment failed:', error);
  }
}