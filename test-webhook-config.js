#!/usr/bin/env node

// Test script to check Stripe webhook configuration
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function checkWebhookConfig() {
  try {
    const Stripe = require('stripe');
    
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable not found');
    }
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    console.log('🔗 Checking Stripe webhook endpoints configuration...');
    console.log('');
    
    // List all webhook endpoints
    const webhookEndpoints = await stripe.webhookEndpoints.list();
    
    if (webhookEndpoints.data.length === 0) {
      console.log('❌ No webhook endpoints configured');
      console.log('');
      console.log('🔧 Solution:');
      console.log('   1. Go to Stripe Dashboard → Developers → Webhooks');
      console.log('   2. Add endpoint: https://quikpik.app/api/stripe/webhook');
      console.log('   3. Select events: payment_intent.succeeded');
      console.log('   4. Save webhook signing secret to environment variables');
    } else {
      console.log(`📋 Found ${webhookEndpoints.data.length} webhook endpoint(s):`);
      console.log('');
      
      webhookEndpoints.data.forEach((endpoint, index) => {
        console.log(`Webhook ${index + 1}:`);
        console.log(`   URL: ${endpoint.url}`);
        console.log(`   Status: ${endpoint.status}`);
        console.log(`   Events: ${endpoint.enabled_events.join(', ')}`);
        console.log(`   Created: ${new Date(endpoint.created * 1000).toISOString()}`);
        console.log('');
        
        // Check if our endpoint exists
        if (endpoint.url.includes('quikpik.app') && endpoint.url.includes('/api/stripe/webhook')) {
          console.log('✅ Quikpik webhook endpoint found and configured');
          
          if (endpoint.enabled_events.includes('payment_intent.succeeded')) {
            console.log('✅ payment_intent.succeeded event is enabled');
          } else {
            console.log('❌ payment_intent.succeeded event is NOT enabled');
            console.log('🔧 Add this event in Stripe Dashboard');
          }
        }
      });
      
      // Check if quikpik endpoint exists
      const quikpikEndpoint = webhookEndpoints.data.find(endpoint => 
        endpoint.url.includes('quikpik.app') && endpoint.url.includes('/api/stripe/webhook')
      );
      
      if (!quikpikEndpoint) {
        console.log('❌ Quikpik webhook endpoint not found');
        console.log('🔧 Add endpoint: https://quikpik.app/api/stripe/webhook');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking webhook configuration:', error.message);
    
    if (error.type === 'StripeAuthenticationError') {
      console.log('');
      console.log('💡 Check your Stripe API key configuration');
    }
  }
}

checkWebhookConfig();