// Test script to check Stripe account retrieval
const fetch = require('node-fetch');

async function testStripeAccount() {
  try {
    // Get user data directly
    const response = await fetch(`${process.env.DATABASE_URL}/api/users/104871691614680693123`);
    
    if (response.ok) {
      const userData = await response.json();
      console.log('User data retrieved:', JSON.stringify(userData, null, 2));
      console.log('stripeAccountId:', userData.stripeAccountId);
    } else {
      console.log('Failed to get user data:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

testStripeAccount();