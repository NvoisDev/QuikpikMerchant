// Test authentication directly
const axios = require('axios');

async function testAuth() {
  try {
    console.log('Testing login endpoint...');
    const loginResponse = await axios.get('http://localhost:5000/api/auth/login');
    console.log('Login response status:', loginResponse.status);
    
    console.log('Testing user endpoint...');
    const userResponse = await axios.get('http://localhost:5000/api/auth/user');
    console.log('User response:', userResponse.data);
  } catch (error) {
    console.log('Auth error:', error.response?.data || error.message);
  }
}

testAuth();