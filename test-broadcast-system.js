const fetch = require('node-fetch');

async function testBroadcastSystem() {
  try {
    console.log('🚀 Testing Broadcast System');
    
    // First, let's check if we can authenticate (using a mock user approach for testing)
    const baseUrl = 'http://localhost:5000';
    
    // Test without authentication first to see the error details
    console.log('\n1. Testing broadcast endpoint without auth...');
    const broadcastResponse = await fetch(`${baseUrl}/api/broadcasts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: 1,
        customerGroupId: 1,
        customMessage: 'Test broadcast message'
      })
    });
    
    const broadcastResult = await broadcastResponse.text();
    console.log('Broadcast response:', broadcastResult);
    console.log('Status:', broadcastResponse.status);
    
    // Let's also test if the WhatsApp service is working by checking the service directly
    console.log('\n2. Testing WhatsApp service availability...');
    
    // Check if the WhatsApp service endpoints are working
    const whatsappTestResponse = await fetch(`${baseUrl}/api/test-whatsapp`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('WhatsApp test status:', whatsappTestResponse.status);
    const whatsappResult = await whatsappTestResponse.text();
    console.log('WhatsApp test response:', whatsappResult);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testBroadcastSystem();