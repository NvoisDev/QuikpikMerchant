// Test promotional pricing calculation
const { PromotionalPricingCalculator } = require('./shared/promotional-pricing.ts');

// Test case: 10% off £0.55 should be £0.495 (approximately £0.50)
const basePrice = 0.55;
const quantity = 1;
const promotionalOffers = [
  {
    type: 'percentage_discount',
    value: 10,
    isActive: true
  }
];

const result = PromotionalPricingCalculator.calculatePromotionalPricing(
  basePrice,
  quantity,
  promotionalOffers
);

console.log('Test: 10% off £0.55');
console.log('Original Price:', result.originalPrice);
console.log('Effective Price:', result.effectivePrice);
console.log('Discount Amount:', result.totalDiscount);
console.log('Applied Offers:', result.appliedOffers);
console.log('Expected: £0.495, Actual: £' + result.effectivePrice);
