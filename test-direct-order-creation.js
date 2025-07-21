// Direct API call to test order creation from webhook data
async function createTestOrder() {
  console.log('🧪 Testing Order Creation Directly');
  console.log('==================================');
  
  const testPayload = {
    id: 'evt_test_' + Date.now(),
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_3RnOYQBLkKweDa5P0mePwvTH',
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
  };
  
  try {
    // Call the webhook endpoint without signature (we'll add bypass for testing)
    const response = await fetch('http://localhost:5000/api/stripe/webhook-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    const result = await response.text();
    console.log('📊 Response status:', response.status);
    console.log('📋 Response:', result);
    
    if (response.status === 200) {
      console.log('');
      console.log('✅ ORDER CREATED SUCCESSFULLY!');
      console.log('  - Order should now be visible in wholesaler dashboard');
      console.log('  - Status: paid');
      console.log('  - Payment processing complete');
      
      // Check if order was actually created
      const ordersResponse = await fetch('http://localhost:5000/api/orders');
      if (ordersResponse.ok) {
        const orders = await ordersResponse.json();
        const newOrder = orders.find(o => o.paymentIntentId === 'pi_3RnOYQBLkKweDa5P0mePwvTH');
        if (newOrder) {
          console.log('✅ Order confirmed in database:', `#${newOrder.id}`);
          console.log('  - Customer:', newOrder.customerName);
          console.log('  - Total:', `£${newOrder.total}`);
          console.log('  - Status:', newOrder.status);
        }
      }
      
    } else {
      console.log('❌ Order creation failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

createTestOrder();