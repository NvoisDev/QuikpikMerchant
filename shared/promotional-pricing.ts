/**
 * Promotional Pricing Calculator
 * Handles complex promotional offers like BOGOFF, percentage discounts, bulk pricing, etc.
 */

export interface PromotionalOffer {
  type: 'percentage_discount' | 'fixed_discount' | 'fixed_amount_discount' | 'fixed_price' | 'bogo' | 'buy_x_get_y_free' | 'multi_buy' | 'bulk_tier' | 'bulk_discount' | 'free_shipping' | 'bundle_deal';
  id?: string;
  name?: string;
  description?: string;
  // Core fields
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  // Percentage discount fields
  value?: number;
  discountPercentage?: number;
  // Fixed discount fields
  discountAmount?: number;
  // Fixed price fields
  fixedPrice?: number;
  // BOGO/Buy X Get Y fields
  buyQuantity?: number;
  getQuantity?: number;
  // Multi-buy fields
  quantity?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  // Bulk tier fields
  pricePerUnit?: number;
  bulkTiers?: Array<{
    minQuantity: number;
    discountPercentage?: number;
    discountAmount?: number;
    pricePerUnit?: number;
  }>;
  // Free shipping fields
  minimumOrderValue?: number;
  // Bundle deal fields
  bundleProducts?: number[];
  bundlePrice?: number;
  // Usage limits
  maxUses?: number;
  usesCount?: number;
  maxUsesPerCustomer?: number;
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  termsAndConditions?: string;
}

export interface PricingResult {
  originalPrice: number;
  effectivePrice: number;
  totalDiscount: number;
  discountPercentage: number;
  appliedOffers: string[];
  freeItems: number;
  totalQuantity: number;
  totalCost: number;
  bogoffDetails?: {
    buyQuantity: number;
    getQuantity: number;
    freeItemsAdded: number;
    offerName: string;
  };
}

export class PromotionalPricingCalculator {
  /**
   * Calculate effective pricing for a product with promotional offers
   */
  static calculatePromotionalPricing(
    basePrice: number,
    quantity: number,
    promotionalOffers: PromotionalOffer[] = [],
    promoPrice?: number,
    promoActive?: boolean
  ): PricingResult {
    const originalPrice = basePrice;
    let effectivePrice = basePrice;
    let totalDiscount = 0;
    let appliedOffers: string[] = [];
    let freeItems = 0;
    let totalQuantity = quantity;

    // Check if we have active promotional offers first
    const hasActivePromotionalOffers = promotionalOffers.some(offer => {
      if (offer.isActive === false) return false;
      
      // Check date validity if provided
      if (offer.startDate && offer.endDate) {
        const now = new Date();
        const start = new Date(offer.startDate);
        const end = new Date(offer.endDate);
        // Add a day to the end date to handle same-day offers
        end.setDate(end.getDate() + 1);
        if (now < start || now > end) return false;
      }
      
      return true;
    });

    // ONLY apply promo price if there are active promotional offers
    // Special prices should only be applied when there are actual promotional offers configured
    if (hasActivePromotionalOffers && promoActive && promoPrice) {
      effectivePrice = promoPrice;
      totalDiscount += (originalPrice - promoPrice) * quantity;
      appliedOffers.push(`Sale Price: £${promoPrice.toFixed(2)}`);
    }

    // Apply promotional offers
    for (const offer of promotionalOffers) {
      // Skip inactive offers or offers outside date range
      if (offer.isActive === false) continue;
      
      // Check date validity if provided
      if (offer.startDate && offer.endDate) {
        const now = new Date();
        const start = new Date(offer.startDate);
        const end = new Date(offer.endDate);
        // Add a day to the end date to handle same-day offers
        end.setDate(end.getDate() + 1);
        if (now < start || now > end) continue;
      }
      
      switch (offer.type) {
        case 'percentage_discount':
          // Support both 'value' and 'discountPercentage' field names
          const percentageDiscount = offer.value || offer.discountPercentage;
          if (percentageDiscount) {
            const discountAmount = effectivePrice * (percentageDiscount / 100);
            effectivePrice -= discountAmount;
            totalDiscount += discountAmount * quantity;
            appliedOffers.push(`${percentageDiscount}% OFF`);
          }
          break;

        case 'fixed_discount':
        case 'fixed_amount_discount':
          // Support both 'value' and 'discountAmount' field names
          const fixedDiscount = offer.value || offer.discountAmount;
          if (fixedDiscount) {
            effectivePrice = Math.max(0, effectivePrice - fixedDiscount);
            totalDiscount += fixedDiscount * quantity;
            appliedOffers.push(`£${fixedDiscount} OFF per unit`);
          }
          break;

        case 'fixed_price':
          // Set a fixed promotional price
          const fixedPrice = offer.fixedPrice;
          if (fixedPrice && fixedPrice < effectivePrice) {
            totalDiscount += (effectivePrice - fixedPrice) * quantity;
            effectivePrice = fixedPrice;
            appliedOffers.push(`Fixed Price: £${fixedPrice}`);
          }
          break;

        case 'bogo':
          if (offer.buyQuantity && offer.getQuantity) {
            const sets = Math.floor(quantity / offer.buyQuantity);
            const freeUnits = sets * offer.getQuantity;
            freeItems += freeUnits;
            totalDiscount += freeUnits * effectivePrice;
            appliedOffers.push(`Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE`);
          }
          break;

        case 'buy_x_get_y_free':
          if (offer.buyQuantity && offer.getQuantity) {
            const sets = Math.floor(quantity / offer.buyQuantity);
            const freeUnits = sets * offer.getQuantity;
            freeItems += freeUnits;
            totalDiscount += freeUnits * effectivePrice;
            appliedOffers.push(`Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE`);
          }
          break;

        case 'multi_buy':
          if (offer.quantity && quantity >= offer.quantity) {
            if (offer.discountType === 'percentage' && offer.discountValue) {
              const discountAmount = effectivePrice * (offer.discountValue / 100);
              effectivePrice -= discountAmount;
              totalDiscount += discountAmount * quantity;
              appliedOffers.push(`${offer.discountValue}% OFF (Buy ${offer.quantity}+)`);
            } else if (offer.discountType === 'fixed' && offer.discountValue) {
              effectivePrice = Math.max(0, effectivePrice - offer.discountValue);
              totalDiscount += offer.discountValue * quantity;
              appliedOffers.push(`£${offer.discountValue} OFF each (Buy ${offer.quantity}+)`);
            }
          }
          break;

        case 'bulk_tier':
          if (offer.quantity && offer.pricePerUnit && quantity >= offer.quantity) {
            const newPrice = offer.pricePerUnit;
            if (newPrice < effectivePrice) {
              totalDiscount += (effectivePrice - newPrice) * quantity;
              effectivePrice = newPrice;
              appliedOffers.push(`Bulk Price: £${newPrice.toFixed(2)} each (${offer.quantity}+ units)`);
            }
          }
          break;

        case 'bulk_discount':
          // Handle tiered bulk discounts
          if (offer.bulkTiers && offer.bulkTiers.length > 0) {
            // Find the applicable tier (highest quantity that doesn't exceed current quantity)
            const applicableTier = offer.bulkTiers
              .filter(tier => quantity >= tier.minQuantity)
              .sort((a, b) => b.minQuantity - a.minQuantity)[0];
            
            if (applicableTier) {
              if (applicableTier.pricePerUnit && applicableTier.pricePerUnit < effectivePrice) {
                totalDiscount += (effectivePrice - applicableTier.pricePerUnit) * quantity;
                effectivePrice = applicableTier.pricePerUnit;
                appliedOffers.push(`Bulk Tier: £${applicableTier.pricePerUnit.toFixed(2)} each (${applicableTier.minQuantity}+ units)`);
              } else if (applicableTier.discountPercentage) {
                const discountAmount = effectivePrice * (applicableTier.discountPercentage / 100);
                effectivePrice -= discountAmount;
                totalDiscount += discountAmount * quantity;
                appliedOffers.push(`Bulk Discount: ${applicableTier.discountPercentage}% OFF (${applicableTier.minQuantity}+ units)`);
              } else if (applicableTier.discountAmount) {
                effectivePrice = Math.max(0, effectivePrice - applicableTier.discountAmount);
                totalDiscount += applicableTier.discountAmount * quantity;
                appliedOffers.push(`Bulk Discount: £${applicableTier.discountAmount} OFF each (${applicableTier.minQuantity}+ units)`);
              }
            }
          }
          break;

        case 'free_shipping':
          // Free shipping doesn't affect unit price, handled separately
          if (offer.minimumOrderValue && (effectivePrice * quantity) >= offer.minimumOrderValue) {
            appliedOffers.push(`Free Shipping (Order ${offer.minimumOrderValue}+)`);
          }
          break;

        case 'bundle_deal':
          // Bundle deals can set a fixed bundle price or apply percentage/fixed discounts
          if (offer.bundlePrice && offer.bundlePrice < effectivePrice) {
            totalDiscount += (effectivePrice - offer.bundlePrice) * quantity;
            effectivePrice = offer.bundlePrice;
            appliedOffers.push(`Bundle Deal: £${offer.bundlePrice.toFixed(2)} each`);
          } else if (offer.discountType === 'percentage' && offer.discountValue) {
            const discountAmount = effectivePrice * (offer.discountValue / 100);
            effectivePrice -= discountAmount;
            totalDiscount += discountAmount * quantity;
            appliedOffers.push(`Bundle Deal: ${offer.discountValue}% OFF`);
          } else if (offer.discountType === 'fixed' && offer.discountValue) {
            effectivePrice = Math.max(0, effectivePrice - offer.discountValue);
            totalDiscount += offer.discountValue * quantity;
            appliedOffers.push(`Bundle Deal: £${offer.discountValue} OFF each`);
          }
          break;
      }
    }

    const totalCost = effectivePrice * quantity;
    const discountPercentage = originalPrice > 0 ? (totalDiscount / (originalPrice * quantity)) * 100 : 0;

    // Check for BOGOFF details
    let bogoffDetails = undefined;
    for (const offer of promotionalOffers) {
      if ((offer.type === 'bogo' || offer.type === 'buy_x_get_y_free') && offer.buyQuantity && offer.getQuantity) {
        const sets = Math.floor(quantity / offer.buyQuantity);
        if (sets > 0) {
          bogoffDetails = {
            buyQuantity: offer.buyQuantity,
            getQuantity: offer.getQuantity,
            freeItemsAdded: sets * offer.getQuantity,
            offerName: offer.name || `Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE`
          };
          break; // Use the first applicable BOGOFF offer
        }
      }
    }

    return {
      originalPrice,
      effectivePrice: Math.max(0, effectivePrice),
      totalDiscount,
      discountPercentage,
      appliedOffers,
      freeItems,
      totalQuantity: quantity + freeItems,
      totalCost,
      bogoffDetails
    };
  }

  /**
   * Check if promotional offers qualify for free shipping
   */
  static qualifiesForFreeShipping(
    promotionalOffers: PromotionalOffer[] = [],
    orderTotal: number
  ): boolean {
    return promotionalOffers.some(offer => 
      offer.type === 'free_shipping' && 
      offer.minimumOrderValue && 
      orderTotal >= offer.minimumOrderValue
    );
  }

  /**
   * Format promotional offers for display
   */
  static formatPromotionalOffers(offers: PromotionalOffer[]): string[] {
    return offers.map(offer => {
      switch (offer.type) {
        case 'percentage_discount':
          const percentage = offer.value || offer.discountPercentage;
          return `${percentage}% OFF`;
        case 'fixed_discount':
        case 'fixed_amount_discount':
          const amount = offer.value || offer.discountAmount;
          return `£${amount} OFF`;
        case 'fixed_price':
          return `Fixed Price: £${offer.fixedPrice}`;
        case 'bogo':
          return `Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE`;
        case 'buy_x_get_y_free':
          return `Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE`;
        case 'multi_buy':
          return `Buy ${offer.quantity}+ get ${offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `£${offer.discountValue} OFF`}`;
        case 'bulk_tier':
          return `${offer.quantity}+ units = £${offer.pricePerUnit} each`;
        case 'bulk_discount':
          if (offer.bulkTiers && offer.bulkTiers.length > 0) {
            const firstTier = offer.bulkTiers[0];
            if (firstTier.pricePerUnit) {
              return `Bulk Pricing from £${firstTier.pricePerUnit} each`;
            } else if (firstTier.discountPercentage) {
              return `Bulk Discount up to ${firstTier.discountPercentage}% OFF`;
            } else if (firstTier.discountAmount) {
              return `Bulk Discount up to £${firstTier.discountAmount} OFF each`;
            }
          }
          return 'Bulk Discount';
        case 'free_shipping':
          return `Free Shipping on orders £${offer.minimumOrderValue}+`;
        case 'bundle_deal':
          if (offer.bundlePrice) {
            return `Bundle Deal: £${offer.bundlePrice} each`;
          } else if (offer.discountType === 'percentage' && offer.discountValue) {
            return `Bundle Deal: ${offer.discountValue}% OFF`;
          } else if (offer.discountType === 'fixed' && offer.discountValue) {
            return `Bundle Deal: £${offer.discountValue} OFF`;
          }
          return 'Bundle Deal';
        default:
          return offer.name || 'Special Offer';
      }
    });
  }
}