import type { PromotionalOfferType } from "./schema";

export interface OfferTypeConfig {
  emoji: string;
  label: string;
  color: string;
  description: string;
}

export const offerTypeEmojiMap: Record<PromotionalOfferType, OfferTypeConfig> = {
  percentage_discount: {
    emoji: "💯",
    label: "Percentage Off",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    description: "Percentage discount off original price"
  },
  fixed_amount_discount: {
    emoji: "💰",
    label: "Fixed Discount",
    color: "bg-green-100 text-green-800 border-green-200",
    description: "Fixed amount off each unit"
  },
  fixed_price: {
    emoji: "🔥",
    label: "Special Price",
    color: "bg-red-100 text-red-800 border-red-200",
    description: "Fixed promotional price"
  },
  bogo: {
    emoji: "🎁",
    label: "BOGO",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Buy one, get one free"
  },
  buy_x_get_y_free: {
    emoji: "🎯",
    label: "Multi-Buy",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    description: "Buy X items, get Y free"
  },
  multi_buy: {
    emoji: "📊",
    label: "Multi Buy",
    color: "bg-teal-100 text-teal-800 border-teal-200",
    description: "Volume discount for multiple purchases"
  },
  bulk_discount: {
    emoji: "📦",
    label: "Bulk Deal",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    description: "Tiered bulk pricing"
  },
  free_shipping: {
    emoji: "🚚",
    label: "Free Delivery",
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    description: "Free shipping included"
  },
  bundle_deal: {
    emoji: "🎀",
    label: "Bundle",
    color: "bg-pink-100 text-pink-800 border-pink-200",
    description: "Bundle discount deal"
  }
};

/**
 * Get emoji and styling config for a promotional offer type
 */
export function getOfferTypeConfig(type: PromotionalOfferType): OfferTypeConfig {
  return offerTypeEmojiMap[type] || {
    emoji: "✨",
    label: "Special Offer",
    color: "bg-gray-100 text-gray-800 border-gray-200",
    description: "Special promotional offer"
  };
}

/**
 * Get just the emoji for an offer type (for inline usage)
 */
export function getOfferTypeEmoji(type: PromotionalOfferType): string {
  return getOfferTypeConfig(type).emoji;
}

/**
 * Format promotional offers with emojis for display
 */
export function formatPromotionalOffersWithEmojis(offers: any[], includeDescription = false): string {
  if (!offers || offers.length === 0) return '';
  
  return offers
    .filter(offer => offer.isActive !== false)
    .map(offer => {
      const config = getOfferTypeConfig(offer.type as PromotionalOfferType);
      const emoji = config.emoji;
      const label = config.label;
      
      if (includeDescription) {
        return `${emoji} ${label}: ${offer.name || config.description}`;
      } else {
        return `${emoji} ${label}`;
      }
    })
    .join(', ');
}

/**
 * Get contextual emoji indicators for campaign cards
 */
export function getCampaignOfferIndicators(offers: any[]): string {
  if (!offers || offers.length === 0) return '';
  
  const activeOffers = offers.filter(offer => offer.isActive !== false);
  if (activeOffers.length === 0) return '';
  
  // Get unique emojis for active offers
  const uniqueEmojis = [...new Set(activeOffers.map(offer => 
    getOfferTypeEmoji(offer.type as PromotionalOfferType)
  ))];
  
  return uniqueEmojis.join('');
}