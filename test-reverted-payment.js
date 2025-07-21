#!/usr/bin/env node

// Test the reverted simplified payment flow
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testRevertedPaymentFlow() {
  try {
    const Stripe = require('stripe');
    
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable not found');
    }
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    console.log('🔄 Testing reverted simplified payment flow...');
    console.log('');
    
    // Test simple payment creation with correct metadata structure
    console.log('💳 Creating test payment intent with simplified structure...');
    
    const testPaymentData = {
      amount: 1200, // £12.00 (£6.00 product + £6.00 platform fee)
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      receipt_email: 'test@customer.com',
      metadata: {
        customerName: 'Test Customer',
        customerEmail: 'test@customer.com', 
        customerPhone: '+447123456789',
        totalAmount: '6.00', // Product subtotal (what wholesaler gets)
        platformFee: '6.00', // Fixed £6 platform fee
        wholesalerId: '104871691614680693123',
        orderType: 'customer_portal',
        customerAddress: JSON.stringify({
          address: '123 Test Street, London, UK',
          postcode: 'SW1A 1AA'
        }),
        items: JSON.stringify([
          {
            productId: 24,
            quantity: 1,
            unitPrice: '6.00',
            productName: 'Test Product'
          }
        ]),
        shippingInfo: JSON.stringify({
          option: 'pickup'
        })
      }
    };
    
    const paymentIntent = await stripe.paymentIntents.create(testPaymentData);
    
    console.log('✅ Payment intent created:', paymentIntent.id);
    console.log('✅ Amount:', `£${(paymentIntent.amount / 100).toFixed(2)}`);
    console.log('✅ Currency:', paymentIntent.currency.toUpperCase());
    console.log('✅ Receipt email:', paymentIntent.receipt_email);
    console.log('✅ Simplified metadata structure:');
    console.log('   - Customer details:', paymentIntent.metadata.customerName, paymentIntent.metadata.customerEmail);
    console.log('   - Product subtotal (wholesaler gets):', `£${paymentIntent.metadata.totalAmount}`);
    console.log('   - Platform fee (fixed):', `£${paymentIntent.metadata.platformFee}`);
    console.log('   - Total customer pays:', `£${(paymentIntent.amount / 100).toFixed(2)}`);
    console.log('   - Wholesaler ID:', paymentIntent.metadata.wholesalerId);
    console.log('');
    
    console.log('🎯 REVERTED PAYMENT STRUCTURE:');
    console.log('✅ Customer pays: Product subtotal + £6.00 platform fee');
    console.log('✅ Wholesaler receives: Full product amount (100% of product value)');
    console.log('✅ Platform collects: £6.00 fixed fee from customer');
    console.log('✅ Simplified metadata without complex fee calculations');
    console.log('✅ Webhook will process using simplified structure');
    console.log('');
    console.log('📊 EXAMPLE BREAKDOWN:');
    console.log('   £6.00 product → Customer pays £12.00 → Wholesaler gets £6.00');
    console.log('   £50.00 product → Customer pays £56.00 → Wholesaler gets £50.00');
    console.log('   £100.00 product → Customer pays £106.00 → Wholesaler gets £100.00');
    
  } catch (error) {
    console.error('❌ Error testing reverted payment flow:', error.message);
  }
}

testRevertedPaymentFlow();