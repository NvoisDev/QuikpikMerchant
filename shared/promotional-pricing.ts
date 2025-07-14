/**
 * Promotional Pricing Calculator
 * Handles complex promotional offers like BOGOFF, percentage discounts, bulk pricing, etc.
 */

export interface PromotionalOffer {
  type: 'percentage_discount' | 'fixed_discount' | 'fixed_amount_discount' | 'bogo' | 'multi_buy' | 'bulk_tier' | 'free_shipping' | 'bundle_deal' | 'buy_x_get_y_free';
  value?: number;
  discountPercentage?: number; // Support database field name
  discountAmount?: number; // Support database field name
  buyQuantity?: number;
  getQuantity?: number;
  quantity?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  pricePerUnit?: number;
  minimumOrderValue?: number;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
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

    // If we have promotional offers, prioritize them over simple promo price
    // Otherwise, apply simple promo price if active
    if (!hasActivePromotionalOffers && promoActive && promoPrice) {
      effectivePrice = promoPrice;
      totalDiscount += (originalPrice - promoPrice) * quantity;
      appliedOffers.push(`Sale Price: ${promoPrice.toFixed(2)}`);
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
              appliedOffers.push(`${offer.discountValue} OFF each (Buy ${offer.quantity}+)`);
            }
          }
          break;

        case 'bulk_tier':
          if (offer.quantity && offer.pricePerUnit && quantity >= offer.quantity) {
            const newPrice = offer.pricePerUnit;
            if (newPrice < effectivePrice) {
              totalDiscount += (effectivePrice - newPrice) * quantity;
              effectivePrice = newPrice;
              appliedOffers.push(`Bulk Price: ${newPrice.toFixed(2)} each (${offer.quantity}+ units)`);
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
          // Bundle deals would typically be handled at cart level
          if (offer.discountType === 'percentage' && offer.discountValue) {
            const discountAmount = effectivePrice * (offer.discountValue / 100);
            effectivePrice -= discountAmount;
            totalDiscount += discountAmount * quantity;
            appliedOffers.push(`Bundle Deal: ${offer.discountValue}% OFF`);
          } else if (offer.discountType === 'fixed' && offer.discountValue) {
            effectivePrice = Math.max(0, effectivePrice - offer.discountValue);
            totalDiscount += offer.discountValue * quantity;
            appliedOffers.push(`Bundle Deal: ${offer.discountValue} OFF each`);
          }
          break;
      }
    }

    const totalCost = effectivePrice * quantity;
    const discountPercentage = originalPrice > 0 ? (totalDiscount / (originalPrice * quantity)) * 100 : 0;

    return {
      originalPrice,
      effectivePrice: Math.max(0, effectivePrice),
      totalDiscount,
      discountPercentage,
      appliedOffers,
      freeItems,
      totalQuantity: quantity + freeItems,
      totalCost
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
          return `${offer.value}% OFF`;
        case 'fixed_discount':
          return `£${offer.value} OFF`;
        case 'bogo':
          return `Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE`;
        case 'multi_buy':
          return `Buy ${offer.quantity}+ get ${offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `£${offer.discountValue} OFF`}`;
        case 'bulk_tier':
          return `${offer.quantity}+ units = £${offer.pricePerUnit} each`;
        case 'free_shipping':
          return `Free Shipping on orders £${offer.minimumOrderValue}+`;
        case 'bundle_deal':
          return `Bundle Deal: ${offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `£${offer.discountValue} OFF`}`;
        default:
          return 'Special Offer';
      }
    });
  }
}