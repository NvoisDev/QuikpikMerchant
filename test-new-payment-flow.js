#!/usr/bin/env node

// Test the NEW payment flow with correct fee structure
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testNewPaymentFlow() {
  try {
    const Stripe = require('stripe');
    
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable not found');
    }
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    console.log('🆕 Testing NEW payment flow with correct fee structure...');
    console.log('');
    
    // Example: £100 product order
    const productSubtotal = 100.00;
    const customerTransactionFee = (productSubtotal * 0.055) + 0.50; // 5.5% + £0.50
    const totalCustomerPays = productSubtotal + customerTransactionFee;
    const wholesalerPlatformFee = productSubtotal * 0.033; // 3.3% 
    const wholesalerReceives = productSubtotal - wholesalerPlatformFee;

    console.log('💳 Creating payment intent with NEW fee structure...');
    
    const testPaymentData = {
      amount: Math.round(totalCustomerPays * 100), // Total customer pays in pence
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      receipt_email: 'test@customer.com',
      metadata: {
        customerName: 'Test Customer',
        customerEmail: 'test@customer.com', 
        customerPhone: '+447123456789',
        productSubtotal: productSubtotal.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
        wholesalerReceives: wholesalerReceives.toFixed(2),
        totalCustomerPays: totalCustomerPays.toFixed(2),
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
            unitPrice: '100.00',
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
    console.log('');
    console.log('🎯 NEW FEE STRUCTURE BREAKDOWN:');
    console.log('   📊 Product Subtotal:', `£${paymentIntent.metadata.productSubtotal}`);
    console.log('   💳 Customer Transaction Fee (5.5% + £0.50):', `£${paymentIntent.metadata.customerTransactionFee}`);
    console.log('   💰 Total Customer Pays:', `£${paymentIntent.metadata.totalCustomerPays}`);
    console.log('   🏪 Wholesaler Platform Fee (3.3%):', `£${paymentIntent.metadata.wholesalerPlatformFee}`);
    console.log('   💵 Wholesaler Receives:', `£${paymentIntent.metadata.wholesalerReceives}`);
    console.log('');
    console.log('✅ CORRECT FEE STRUCTURE:');
    console.log('✅ Customer pays: Product total + Transaction Fee (5.5% + £0.50)');
    console.log('✅ Wholesaler pays: Platform Fee (3.3% deducted from product total)');
    console.log('✅ Platform earns: Customer transaction fee + Wholesaler platform fee');
    console.log('');
    console.log('📊 EXAMPLE CALCULATIONS:');
    console.log(`   Customer: £${productSubtotal} + £${customerTransactionFee.toFixed(2)} = £${totalCustomerPays.toFixed(2)} (pays)`);
    console.log(`   Wholesaler: £${productSubtotal} - £${wholesalerPlatformFee.toFixed(2)} = £${wholesalerReceives.toFixed(2)} (receives)`);
    console.log(`   Platform: £${customerTransactionFee.toFixed(2)} + £${wholesalerPlatformFee.toFixed(2)} = £${(customerTransactionFee + wholesalerPlatformFee).toFixed(2)} (earns)`);
    
  } catch (error) {
    console.error('❌ Error testing new payment flow:', error.message);
  }
}

testNewPaymentFlow();