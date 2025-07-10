/**
 * Comprehensive Testing Script for Quikpik Platform
 * Tests both Wholesaler and Customer workflows
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';

// Test data
const testData = {
  wholesaler: {
    email: 'test@wholesaler.com',
    firstName: 'John',
    lastName: 'Doe',
    businessName: 'Test Wholesale Co',
    businessPhone: '+447507659550',
    businessEmail: 'business@test.com',
    businessAddress: '123 Business St, London, UK',
    preferredCurrency: 'GBP'
  },
  products: [
    {
      name: 'Premium Organic Bananas',
      description: 'Fresh organic bananas from sustainable farms',
      price: '2.50',
      stock: 100,
      moq: 5,
      category: 'Fruits',
      sellingFormat: 'units',
      unitWeight: 0.2,
      priceVisible: true,
      negotiable: true,
      minimumBidPrice: '2.00'
    },
    {
      name: 'Organic Apple Crates',
      description: 'Premium quality apples in wooden crates',
      price: '45.00',
      stock: 50,
      moq: 2,
      category: 'Fruits',
      sellingFormat: 'pallets',
      palletWeight: 20,
      priceVisible: true,
      negotiable: false
    }
  ],
  customers: [
    {
      name: 'Jane Smith',
      email: 'customer1@test.com',
      phone: '+447507659551',
      address: '456 Customer Ave, Manchester, UK'
    },
    {
      name: 'Bob Johnson',
      email: 'customer2@test.com',
      phone: '+447507659552',
      address: '789 Buyer St, Birmingham, UK'
    }
  ],
  customerGroup: {
    name: 'Premium Retailers',
    description: 'High-value retail customers'
  }
};

// Helper functions
async function makeRequest(endpoint, method = 'GET', data = null, headers = {}) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    credentials: 'include'
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      data: result,
      error: response.ok ? null : result.message || 'Request failed'
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      data: null,
      error: error.message
    };
  }
}

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'
  };
  
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

// Test functions
async function testWholesalerAuthentication() {
  log('Testing Wholesaler Authentication...', 'info');
  
  // Test current user endpoint
  const userResponse = await makeRequest('/api/auth/user');
  
  if (userResponse.success) {
    log('✓ Authentication successful', 'success');
    log(`  User: ${userResponse.data.email} (${userResponse.data.firstName} ${userResponse.data.lastName})`, 'info');
    return userResponse.data;
  } else {
    log('✗ Authentication failed', 'error');
    log(`  Error: ${userResponse.error}`, 'error');
    return null;
  }
}

async function testProductManagement() {
  log('Testing Product Management...', 'info');
  
  // Get existing products
  const productsResponse = await makeRequest('/api/products');
  if (!productsResponse.success) {
    log('✗ Failed to fetch products', 'error');
    return false;
  }
  
  log(`✓ Fetched ${productsResponse.data.length} existing products`, 'success');
  
  // Test product creation
  let createdProducts = [];
  for (const productData of testData.products) {
    const createResponse = await makeRequest('/api/products', 'POST', productData);
    
    if (createResponse.success) {
      log(`✓ Created product: ${productData.name}`, 'success');
      createdProducts.push(createResponse.data);
    } else {
      log(`✗ Failed to create product: ${productData.name}`, 'error');
      log(`  Error: ${createResponse.error}`, 'error');
    }
  }
  
  // Test product updates
  if (createdProducts.length > 0) {
    const firstProduct = createdProducts[0];
    const updateData = {
      ...firstProduct,
      stock: firstProduct.stock + 10,
      price: '2.75'
    };
    
    const updateResponse = await makeRequest(`/api/products/${firstProduct.id}`, 'PUT', updateData);
    
    if (updateResponse.success) {
      log(`✓ Updated product stock and price`, 'success');
    } else {
      log(`✗ Failed to update product`, 'error');
      log(`  Error: ${updateResponse.error}`, 'error');
    }
  }
  
  return createdProducts;
}

async function testCustomerGroupManagement() {
  log('Testing Customer Group Management...', 'info');
  
  // Create customer group
  const groupResponse = await makeRequest('/api/customer-groups', 'POST', testData.customerGroup);
  
  if (!groupResponse.success) {
    log('✗ Failed to create customer group', 'error');
    log(`  Error: ${groupResponse.error}`, 'error');
    return null;
  }
  
  log(`✓ Created customer group: ${testData.customerGroup.name}`, 'success');
  const groupId = groupResponse.data.id;
  
  // Add customers to group
  let addedCustomers = [];
  for (const customerData of testData.customers) {
    const customerResponse = await makeRequest(`/api/customer-groups/${groupId}/members`, 'POST', customerData);
    
    if (customerResponse.success) {
      log(`✓ Added customer: ${customerData.name}`, 'success');
      addedCustomers.push(customerResponse.data);
    } else {
      log(`✗ Failed to add customer: ${customerData.name}`, 'error');
      log(`  Error: ${customerResponse.error}`, 'error');
    }
  }
  
  // Get group members
  const membersResponse = await makeRequest(`/api/customer-groups/${groupId}/members`);
  
  if (membersResponse.success) {
    log(`✓ Retrieved ${membersResponse.data.length} group members`, 'success');
  } else {
    log('✗ Failed to retrieve group members', 'error');
  }
  
  return { groupId, members: addedCustomers };
}

async function testBroadcastSystem(products, customerGroup) {
  log('Testing Broadcast System...', 'info');
  
  if (!products || products.length === 0 || !customerGroup) {
    log('✗ Missing prerequisites for broadcast testing', 'error');
    return false;
  }
  
  // Create single product broadcast
  const singleProductBroadcast = {
    productId: products[0].id,
    customerGroupId: customerGroup.groupId,
    customMessage: 'Special offer on our premium organic bananas!'
  };
  
  const broadcastResponse = await makeRequest('/api/broadcasts', 'POST', singleProductBroadcast);
  
  if (broadcastResponse.success) {
    log(`✓ Created single product broadcast`, 'success');
  } else {
    log('✗ Failed to create broadcast', 'error');
    log(`  Error: ${broadcastResponse.error}`, 'error');
  }
  
  // Create multi-product campaign
  const multiProductCampaign = {
    campaignName: 'Weekly Special Offers',
    products: products.slice(0, 2).map(p => ({
      productId: p.id,
      quantity: 20
    })),
    customerGroupId: customerGroup.groupId,
    customMessage: 'Check out our weekly special offers!'
  };
  
  const campaignResponse = await makeRequest('/api/campaigns', 'POST', multiProductCampaign);
  
  if (campaignResponse.success) {
    log(`✓ Created multi-product campaign`, 'success');
  } else {
    log('✗ Failed to create campaign', 'error');
    log(`  Error: ${campaignResponse.error}`, 'error');
  }
  
  return true;
}

async function testAnalyticsDashboard() {
  log('Testing Analytics Dashboard...', 'info');
  
  // Test various analytics endpoints
  const endpoints = [
    '/api/analytics/stats',
    '/api/analytics/top-products',
    '/api/analytics/dashboard',
    '/api/broadcasts/stats',
    '/api/stock-alerts/count'
  ];
  
  let passedTests = 0;
  
  for (const endpoint of endpoints) {
    const response = await makeRequest(endpoint);
    
    if (response.success) {
      log(`✓ ${endpoint} - OK`, 'success');
      passedTests++;
    } else {
      log(`✗ ${endpoint} - Failed`, 'error');
      log(`  Error: ${response.error}`, 'error');
    }
  }
  
  log(`Analytics tests: ${passedTests}/${endpoints.length} passed`, passedTests === endpoints.length ? 'success' : 'warning');
  
  return passedTests === endpoints.length;
}

async function testCustomerPortal(products, wholesaler) {
  log('Testing Customer Portal...', 'info');
  
  if (!products || products.length === 0 || !wholesaler) {
    log('✗ Missing prerequisites for customer portal testing', 'error');
    return false;
  }
  
  // Test customer portal access
  const portalResponse = await makeRequest(`/api/marketplace/wholesaler/${wholesaler.id}`);
  
  if (portalResponse.success) {
    log(`✓ Customer portal accessible`, 'success');
  } else {
    log('✗ Customer portal not accessible', 'error');
    log(`  Error: ${portalResponse.error}`, 'error');
    return false;
  }
  
  // Test product listing in customer portal
  const productsResponse = await makeRequest('/api/marketplace/products');
  
  if (productsResponse.success) {
    log(`✓ Customer can view ${productsResponse.data.length} products`, 'success');
  } else {
    log('✗ Customer cannot view products', 'error');
    log(`  Error: ${productsResponse.error}`, 'error');
  }
  
  // Test individual product access
  if (products.length > 0) {
    const productResponse = await makeRequest(`/api/marketplace/products/${products[0].id}`);
    
    if (productResponse.success) {
      log(`✓ Customer can view individual product details`, 'success');
    } else {
      log('✗ Customer cannot view product details', 'error');
      log(`  Error: ${productResponse.error}`, 'error');
    }
  }
  
  return true;
}

async function testOrderManagement(products, wholesaler) {
  log('Testing Order Management...', 'info');
  
  if (!products || products.length === 0 || !wholesaler) {
    log('✗ Missing prerequisites for order testing', 'error');
    return false;
  }
  
  // Create test order
  const orderData = {
    wholesalerId: wholesaler.id,
    items: [
      {
        productId: products[0].id,
        quantity: 10,
        unitPrice: products[0].price
      }
    ],
    customer: {
      name: 'Test Customer',
      email: 'test@customer.com',
      phone: '+447507659999',
      address: '123 Test St, London, UK'
    },
    deliveryAddress: '123 Test St, London, UK',
    subtotal: (parseFloat(products[0].price) * 10).toFixed(2),
    platformFee: (parseFloat(products[0].price) * 10 * 0.05).toFixed(2),
    total: (parseFloat(products[0].price) * 10 * 1.05).toFixed(2)
  };
  
  const orderResponse = await makeRequest('/api/marketplace/orders', 'POST', orderData);
  
  if (orderResponse.success) {
    log(`✓ Created test order`, 'success');
    
    // Test order retrieval
    const ordersResponse = await makeRequest('/api/orders');
    
    if (ordersResponse.success) {
      log(`✓ Retrieved ${ordersResponse.data.length} orders`, 'success');
      return ordersResponse.data;
    } else {
      log('✗ Failed to retrieve orders', 'error');
    }
  } else {
    log('✗ Failed to create test order', 'error');
    log(`  Error: ${orderResponse.error}`, 'error');
  }
  
  return false;
}

async function testSubscriptionSystem() {
  log('Testing Subscription System...', 'info');
  
  // Test subscription status
  const statusResponse = await makeRequest('/api/subscription/status');
  
  if (statusResponse.success) {
    log(`✓ Subscription status: ${statusResponse.data.subscriptionTier}`, 'success');
    log(`  Active: ${statusResponse.data.subscriptionActive}`, 'info');
  } else {
    log('✗ Failed to get subscription status', 'error');
    log(`  Error: ${statusResponse.error}`, 'error');
  }
  
  return statusResponse.success;
}

async function testShippingSystem() {
  log('Testing Shipping System...', 'info');
  
  // Test shipping quotes
  const quoteData = {
    collectionAddress: {
      contactName: 'Test Wholesaler',
      property: '123',
      street: 'Business Street',
      town: 'London',
      postcode: 'SW1A 1AA',
      countryIsoCode: 'GBR'
    },
    deliveryAddress: {
      contactName: 'Test Customer',
      property: '456',
      street: 'Customer Street',
      town: 'Manchester',
      postcode: 'M1 1AA',
      countryIsoCode: 'GBR'
    },
    parcels: [
      {
        weight: 5,
        length: 30,
        width: 20,
        height: 15,
        value: 100
      }
    ]
  };
  
  const quoteResponse = await makeRequest('/api/marketplace/shipping/quotes', 'POST', quoteData);
  
  if (quoteResponse.success) {
    log(`✓ Retrieved ${quoteResponse.data.quotes.length} shipping quotes`, 'success');
    log(`  Demo mode: ${quoteResponse.data.demoMode}`, 'info');
  } else {
    log('✗ Failed to get shipping quotes', 'error');
    log(`  Error: ${quoteResponse.error}`, 'error');
  }
  
  return quoteResponse.success;
}

// Main test runner
async function runComprehensiveTests() {
  log('🚀 Starting Comprehensive Quikpik Platform Tests', 'info');
  log('================================================', 'info');
  
  const results = {
    authentication: false,
    productManagement: false,
    customerGroups: false,
    broadcasts: false,
    analytics: false,
    customerPortal: false,
    orderManagement: false,
    subscriptionSystem: false,
    shippingSystem: false
  };
  
  try {
    // Test 1: Authentication
    const wholesaler = await testWholesalerAuthentication();
    results.authentication = !!wholesaler;
    
    if (!wholesaler) {
      log('❌ Authentication failed - stopping tests', 'error');
      return results;
    }
    
    // Test 2: Product Management
    const products = await testProductManagement();
    results.productManagement = !!products && products.length > 0;
    
    // Test 3: Customer Group Management
    const customerGroup = await testCustomerGroupManagement();
    results.customerGroups = !!customerGroup;
    
    // Test 4: Broadcast System
    results.broadcasts = await testBroadcastSystem(products, customerGroup);
    
    // Test 5: Analytics Dashboard
    results.analytics = await testAnalyticsDashboard();
    
    // Test 6: Customer Portal
    results.customerPortal = await testCustomerPortal(products, wholesaler);
    
    // Test 7: Order Management
    results.orderManagement = await testOrderManagement(products, wholesaler);
    
    // Test 8: Subscription System
    results.subscriptionSystem = await testSubscriptionSystem();
    
    // Test 9: Shipping System
    results.shippingSystem = await testShippingSystem();
    
  } catch (error) {
    log(`❌ Test execution failed: ${error.message}`, 'error');
  }
  
  // Summary
  log('================================================', 'info');
  log('📊 Test Results Summary:', 'info');
  log('================================================', 'info');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? '✓' : '✗';
    const color = passed ? 'success' : 'error';
    log(`${status} ${test}`, color);
  }
  
  log('================================================', 'info');
  log(`Overall: ${passedTests}/${totalTests} tests passed (${((passedTests/totalTests)*100).toFixed(1)}%)`, 
       passedTests === totalTests ? 'success' : 'warning');
  
  if (passedTests === totalTests) {
    log('🎉 All tests passed! Platform is working correctly.', 'success');
  } else {
    log('⚠️  Some tests failed. Please review the errors above.', 'warning');
  }
  
  return results;
}

// Run tests if called directly
if (typeof window === 'undefined') {
  runComprehensiveTests().catch(console.error);
}

export { runComprehensiveTests, testData };