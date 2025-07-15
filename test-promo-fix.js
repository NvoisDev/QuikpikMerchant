// Test promotional offers direct application
import { PromotionalPricingCalculator } from './shared/promotional-pricing.ts';

// Test with real promotional offers data from database
const promotionalOffers = [
  {
    "id": "offer_1752534569652_m9o8o0g8j",
    "name": "New Fixed Price",
    "type": "fixed_price",
    "isActive": true,
    "description": "Set a fixed promotional price",
    "createdAt": "2025-07-14T23:09:29.652Z",
    "updatedAt": "2025-07-14T23:09:44.921Z",
    "fixedPrice": 20,
    "startDate": "2025-07-14T23:09:00.000Z",
    "endDate": "2025-08-09T23:09:00.000Z"
  }
];

console.log('🧪 Testing promotional pricing calculation...');
console.log('Promotional offers:', promotionalOffers);

const basePrice = 25.99; // Baby Rice original price
const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
  basePrice,
  1,
  promotionalOffers,
  undefined,
  false
);

console.log('💰 Pricing result:');
console.log('- Original price:', pricing.originalPrice);
console.log('- Effective price:', pricing.effectivePrice);
console.log('- Has promotion:', pricing.effectivePrice < pricing.originalPrice);
console.log('- Should activate:', pricing.effectivePrice < pricing.originalPrice ? 'YES' : 'NO');