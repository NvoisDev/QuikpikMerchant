// Test shipping mapping logic in isolation
const testShippingInfo = {
  "option": "pickup",
  "service": {
    "serviceName": "Test Express",
    "price": "12.14",
    "deliveryTime": "Test delivery"
  }
};

console.log('Testing shipping mapping logic:');
console.log('Original shippingInfo:', JSON.stringify(testShippingInfo, null, 2));

const hasDeliveryService = testShippingInfo.service && parseFloat(testShippingInfo.service.price || '0') > 0;
const originalOption = testShippingInfo.option;

console.log('Analysis:');
console.log('- originalOption:', originalOption);
console.log('- hasService:', !!testShippingInfo.service);
console.log('- servicePrice:', testShippingInfo.service?.price);
console.log('- parsedPrice:', parseFloat(testShippingInfo.service?.price || '0'));
console.log('- hasDeliveryService:', hasDeliveryService);

const conditionResult = originalOption === 'collection' || hasDeliveryService;
console.log('- condition (originalOption === "collection" || hasDeliveryService):', conditionResult);

if (conditionResult) {
  testShippingInfo.option = 'delivery';
  console.log('✅ SHOULD MAP TO DELIVERY');
} else {
  console.log('❌ SHOULD KEEP AS PICKUP');
}

console.log('Final option:', testShippingInfo.option);