import crypto from 'crypto';

async function simulateWebhook() {
  console.log('🧪 Simulating Stripe Webhook with Real Signature');
  console.log('===============================================');
  
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  console.log('🔐 Using webhook secret:', webhookSecret ? 'Present' : 'Missing');
  
  const payload = JSON.stringify({
    id: 'evt_test_webhook_' + Date.now(),
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_3RnOYQBLkKweDa5P0mePwvTH',
        object: 'payment_intent',
        status: 'succeeded',
        amount: 683,
        currency: 'gbp',
        receipt_email: 'test@customer.com',
        metadata: {
          orderType: 'customer_portal',
          wholesalerId: '104871691614680693123',
          customerName: 'Test Customer',
          customerEmail: 'test@customer.com',
          customerPhone: '+447123456789',
          customerAddress: JSON.stringify({
            street: '123 Test Street',
            city: 'London',
            state: 'Greater London',
            postalCode: 'SW1A 1AA',
            country: 'United Kingdom'
          }),
          productSubtotal: '6.00',
          customerTransactionFee: '0.83',
          wholesalerPlatformFee: '0.20',
          totalCustomerPays: '6.83',
          items: JSON.stringify([{
            productId: 24,
            quantity: 12,
            unitPrice: '0.50',
            productName: 'Indomie'
          }]),
          shippingInfo: JSON.stringify({ option: 'pickup' })
        }
      }
    }
  });
  
  // Generate proper Stripe signature
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(timestamp + '.' + payload)
    .digest('hex');
  
  const stripeSignature = `t=${timestamp},v1=${signature}`;
  
  console.log('📦 Payload length:', payload.length);
  console.log('🔏 Generated signature:', stripeSignature.substring(0, 50) + '...');
  
  try {
    const response = await fetch('http://localhost:5000/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': stripeSignature
      },
      body: payload
    });
    
    const result = await response.text();
    console.log('📊 Response status:', response.status);
    console.log('📋 Response:', result);
    
    if (response.status === 200) {
      console.log('');
      console.log('✅ WEBHOOK PROCESSED SUCCESSFULLY!');
      console.log('  - Order should now be created in database');
      console.log('  - Status: paid');
      console.log('  - Visible in wholesaler dashboard');
    } else {
      console.log('❌ Webhook processing failed');
    }
    
  } catch (error) {
    console.error('❌ Webhook simulation failed:', error.message);
  }
}

simulateWebhook();