// Test script to send a promotional campaign and debug the application
import fetch from 'node-fetch';

async function testCampaignSend() {
  try {
    console.log('🧪 Testing promotional campaign sending...');
    
    // Send template campaign with promotional offers (Template 22 - "Card")
    const response = await fetch('http://localhost:5000/api/campaigns/template_22/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3At3wK7XdY8P8E7iGrblkTp5qH8JwXUC4x.VgSU7P%2FFPK9Cku%2BDGNrw%2F1LKAnoE8dz8%2FKzCsNJp4k%2F8'
      },
      body: JSON.stringify({
        customerGroupId: 11,
        customMessage: ''
      })
    });

    const result = await response.json();
    console.log('📤 Campaign send result:', result);
    
    // Wait a moment for database updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if promotional offers were applied to product 21
    const productResponse = await fetch('http://localhost:5000/api/marketplace/products', {
      headers: {
        'Cookie': 'connect.sid=s%3At3wK7XdY8P8E7iGrblkTp5qH8JwXUC4x.VgSU7P%2FFPK9Cku%2BDGNrw%2F1LKAnoE8dz8%2FKzCsNJp4k%2F8'
      }
    });

    const products = await productResponse.json();
    const product21 = products.find(p => p.id === 21);
    
    console.log('🔍 Product 21 after campaign send:', {
      id: product21?.id,
      name: product21?.name,
      price: product21?.price,
      promotionalOffers: product21?.promotionalOffers,
      promoActive: product21?.promoActive,
      promoPrice: product21?.promoPrice
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCampaignSend();