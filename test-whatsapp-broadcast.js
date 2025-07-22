const fetch = require('node-fetch');

async function testWhatsAppBroadcast() {
  console.log('🔍 Testing WhatsApp Broadcast System...');
  
  try {
    // Test the WhatsApp service credentials check
    const testResponse = await fetch('http://localhost:5000/api/test-whatsapp-credentials', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('WhatsApp credentials test response:', await testResponse.text());
    console.log('Status:', testResponse.status);
    
    // Check if there are any recent broadcasts in the database
    const broadcastHistoryResponse = await fetch('http://localhost:5000/api/broadcasts', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Broadcast history status:', broadcastHistoryResponse.status);
    const broadcastHistory = await broadcastHistoryResponse.text();
    console.log('Recent broadcasts:', broadcastHistory);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testWhatsAppBroadcast();