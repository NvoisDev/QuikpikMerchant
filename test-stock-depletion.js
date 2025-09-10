// Test script to verify stock depletion system
import fetch from 'node-fetch';

async function testStockDepletion() {
  console.log('🧪 Testing Stock Depletion System...\n');
  
  const productId = 27; // Lulu Bread
  const baseUrl = 'http://localhost:5000';
  
  try {
    // Step 1: Get current stock
    console.log('📊 Step 1: Checking current stock...');
    const stockResponse = await fetch(`${baseUrl}/api/marketplace/products/${productId}`);
    const stockData = await stockResponse.json();
    
    console.log(`Current Stock:
    - Base Units: ${stockData.baseUnitStock}
    - Available Pallets: ${stockData.availablePallets}
    - Conversion Factor: ${stockData.unitsPerPallet} units per pallet\n`);
    
    const initialStock = stockData.baseUnitStock;
    const initialPallets = stockData.availablePallets;
    
    // Step 2: Create test order for 2 pallets
    console.log('🛍️ Step 2: Creating test order for 2 pallets...');
    const testOrder = {
      wholesalerId: 'user_1756056297340_surulere', // Your wholesaler ID
      items: [{
        productId: productId,
        quantity: 2,
        sellingType: 'pallets'
      }],
      customerName: 'Test Customer - Stock Depletion',
      customerPhone: '+447123456789',
      deliveryMethod: 'collection',
      paymentMethod: 'bank_transfer',
      notes: 'TEST ORDER - Stock depletion verification'
    };
    
    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testOrder)
    });
    
    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      console.log('❌ Order creation failed:', errorData);
      return;
    }
    
    const orderData = await orderResponse.json();
    console.log(`✅ Test order created: ${orderData.orderNumber}\n`);
    
    // Step 3: Check stock after order
    console.log('📊 Step 3: Checking stock after order...');
    const newStockResponse = await fetch(`${baseUrl}/api/marketplace/products/${productId}`);
    const newStockData = await newStockResponse.json();
    
    console.log(`Stock After Order:
    - Base Units: ${newStockData.baseUnitStock}
    - Available Pallets: ${newStockData.availablePallets}\n`);
    
    // Step 4: Verify calculations
    const expectedReduction = 2 * stockData.unitsPerPallet; // 2 pallets × 48 units = 96 units
    const actualReduction = initialStock - newStockData.baseUnitStock;
    const palletReduction = initialPallets - newStockData.availablePallets;
    
    console.log('🧮 Verification:');
    console.log(`Expected reduction: ${expectedReduction} base units (2 pallets × ${stockData.unitsPerPallet})`);
    console.log(`Actual reduction: ${actualReduction} base units`);
    console.log(`Pallet reduction: ${palletReduction} pallets`);
    
    if (actualReduction === expectedReduction && palletReduction === 2) {
      console.log('\n✅ SUCCESS: Stock depletion system working correctly!');
      console.log('🎯 Base Unit Inventory System is mathematically precise');
    } else {
      console.log('\n❌ FAILURE: Stock depletion not working correctly');
      console.log('🚨 Investigation needed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testStockDepletion();