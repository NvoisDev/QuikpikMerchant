import { CustomerPromotionalOffer, PersonalizedCampaignRecipient, CustomerPromotionPreference } from "./schema";

// Types for personalized campaign system
export interface PersonalizedOfferConfig {
  customerId: string;
  productId: number;
  productName: string;
  originalPrice: number;
  offerType: 'percentage_discount' | 'fixed_discount' | 'fixed_price' | 'bogo' | 'bulk_discount';
  discountPercentage?: number;
  discountAmount?: number;
  fixedPrice?: number;
  buyQuantity?: number;
  getQuantity?: number;
  maxQuantity?: number;
  validUntil?: Date;
  reason?: string; // Why this offer is personalized for this customer
}

export interface PersonalizedCampaignConfig {
  campaignId: string;
  campaignTitle: string;
  baseMessage: string;
  offers: PersonalizedOfferConfig[];
  includeContact: boolean;
  includePurchaseLink: boolean;
  customerGroupId?: number;
}

// Customer segmentation criteria for personalization
export interface CustomerSegment {
  id: string;
  name: string;
  criteria: {
    minOrderValue?: number;
    maxOrderValue?: number;
    averageOrderValue?: number;
    orderFrequency?: 'high' | 'medium' | 'low';
    lastOrderDaysAgo?: number;
    preferredDiscountType?: string;
    totalSpent?: number;
    redemptionRate?: number;
  };
  offerStrategy: {
    primaryOfferType: string;
    discountRange: { min: number; max: number };
    maxQuantityLimit?: number;
    validityDays: number;
  };
}

// Default customer segments for AI-driven personalization
export const DEFAULT_CUSTOMER_SEGMENTS: CustomerSegment[] = [
  {
    id: 'high_value',
    name: 'High Value Customers',
    criteria: {
      totalSpent: 1000,
      redemptionRate: 70,
      orderFrequency: 'high'
    },
    offerStrategy: {
      primaryOfferType: 'percentage_discount',
      discountRange: { min: 15, max: 25 },
      validityDays: 7
    }
  },
  {
    id: 'loyal_regular',
    name: 'Loyal Regular Customers',
    criteria: {
      orderFrequency: 'medium',
      redemptionRate: 50,
      lastOrderDaysAgo: 30
    },
    offerStrategy: {
      primaryOfferType: 'bogo',
      discountRange: { min: 10, max: 20 },
      validityDays: 5
    }
  },
  {
    id: 'price_sensitive',
    name: 'Price Sensitive Customers',
    criteria: {
      preferredDiscountType: 'fixed_discount',
      averageOrderValue: 50,
      redemptionRate: 80
    },
    offerStrategy: {
      primaryOfferType: 'fixed_discount',
      discountRange: { min: 5, max: 15 },
      maxQuantityLimit: 10,
      validityDays: 3
    }
  },
  {
    id: 'bulk_buyers',
    name: 'Bulk Buyers',
    criteria: {
      minOrderValue: 200,
      preferredDiscountType: 'bulk_discount'
    },
    offerStrategy: {
      primaryOfferType: 'bulk_discount',
      discountRange: { min: 5, max: 15 },
      validityDays: 10
    }
  },
  {
    id: 'win_back',
    name: 'Win-Back Customers',
    criteria: {
      lastOrderDaysAgo: 90,
      orderFrequency: 'low'
    },
    offerStrategy: {
      primaryOfferType: 'percentage_discount',
      discountRange: { min: 20, max: 30 },
      validityDays: 14
    }
  }
];

// Personalized message generation
export class PersonalizedMessageGenerator {
  static generatePersonalizedMessage(
    baseMessage: string,
    offers: PersonalizedOfferConfig[],
    customerPreferences?: CustomerPromotionPreference,
    includeContact: boolean = true,
    includePurchaseLink: boolean = true
  ): string {
    let personalizedMessage = baseMessage;

    // Replace product placeholders with personalized offers
    offers.forEach((offer, index) => {
      const offerText = this.generateOfferText(offer);
      const productPlaceholder = `{product_${index + 1}}`;
      const pricePlaceholder = `{price_${index + 1}}`;
      
      if (personalizedMessage.includes(productPlaceholder)) {
        personalizedMessage = personalizedMessage.replace(productPlaceholder, offer.productName);
      }
      
      if (personalizedMessage.includes(pricePlaceholder)) {
        personalizedMessage = personalizedMessage.replace(pricePlaceholder, offerText);
      }
    });

    // Add personalized offers section
    if (offers.length > 0) {
      const offersSection = this.generateOffersSection(offers);
      personalizedMessage += `\n\n🎯 *Personalized Offers for You:*\n${offersSection}`;
    }

    // Add contact info if requested
    if (includeContact) {
      personalizedMessage += '\n\n📞 *Contact us for any questions or to place your order!*';
    }

    // Add purchase link if requested
    if (includePurchaseLink) {
      personalizedMessage += '\n\n🛒 *Click here to shop now and secure these exclusive prices!*';
    }

    // Add urgency based on customer preferences
    if (customerPreferences?.responseTimePattern === 'immediate') {
      personalizedMessage += '\n\n⏰ *Limited time offer - Order now!*';
    } else if (customerPreferences?.responseTimePattern === 'within_hours') {
      personalizedMessage += '\n\n⏰ *Special prices valid for next 24 hours*';
    }

    return personalizedMessage;
  }

  private static generateOfferText(offer: PersonalizedOfferConfig): string {
    const { offerType, originalPrice, discountPercentage, discountAmount, fixedPrice, buyQuantity, getQuantity } = offer;

    switch (offerType) {
      case 'percentage_discount':
        const discountedPrice = originalPrice * (1 - (discountPercentage || 0) / 100);
        return `£${discountedPrice.toFixed(2)} (${discountPercentage}% OFF from £${originalPrice.toFixed(2)})`;
      
      case 'fixed_discount':
        const finalPrice = originalPrice - (discountAmount || 0);
        return `£${finalPrice.toFixed(2)} (Save £${discountAmount?.toFixed(2)} from £${originalPrice.toFixed(2)})`;
      
      case 'fixed_price':
        const savings = originalPrice - (fixedPrice || 0);
        return `£${fixedPrice?.toFixed(2)} (Save £${savings.toFixed(2)} from £${originalPrice.toFixed(2)})`;
      
      case 'bogo':
        return `£${originalPrice.toFixed(2)} - Buy ${buyQuantity || 1} Get ${getQuantity || 1} FREE!`;
      
      case 'bulk_discount':
        return `£${originalPrice.toFixed(2)} - Special bulk pricing available`;
      
      default:
        return `£${originalPrice.toFixed(2)}`;
    }
  }

  private static generateOffersSection(offers: PersonalizedOfferConfig[]): string {
    return offers.map((offer, index) => {
      const offerText = this.generateOfferText(offer);
      const reasonText = offer.reason ? ` _(${offer.reason})_` : '';
      return `${index + 1}. *${offer.productName}*: ${offerText}${reasonText}`;
    }).join('\n');
  }
}

// Customer segmentation engine
export class CustomerSegmentationEngine {
  static determineCustomerSegment(
    preferences: CustomerPromotionPreference,
    segments: CustomerSegment[] = DEFAULT_CUSTOMER_SEGMENTS
  ): CustomerSegment {
    // Score each segment based on how well the customer matches
    const segmentScores = segments.map(segment => ({
      segment,
      score: this.calculateSegmentScore(preferences, segment)
    }));

    // Return the segment with the highest score
    const bestMatch = segmentScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    return bestMatch.segment;
  }

  private static calculateSegmentScore(
    preferences: CustomerPromotionPreference,
    segment: CustomerSegment
  ): number {
    let score = 0;
    const criteria = segment.criteria;

    // Check total spent
    if (criteria.totalSpent && preferences.totalSpent) {
      const totalSpent = parseFloat(preferences.totalSpent.toString());
      if (totalSpent >= criteria.totalSpent) score += 20;
    }

    // Check redemption rate
    if (criteria.redemptionRate && preferences.redemptionRate) {
      const redemptionRate = parseFloat(preferences.redemptionRate.toString());
      if (redemptionRate >= criteria.redemptionRate) score += 15;
    }

    // Check preferred discount type
    if (criteria.preferredDiscountType && preferences.preferredDiscountType === criteria.preferredDiscountType) {
      score += 25;
    }

    // Check order frequency patterns
    if (criteria.orderFrequency && preferences.responseTimePattern) {
      const frequencyMatch = this.matchOrderFrequency(preferences.responseTimePattern, criteria.orderFrequency);
      if (frequencyMatch) score += 10;
    }

    // Check last purchase timing
    if (criteria.lastOrderDaysAgo && preferences.lastPurchaseAt) {
      const daysSinceLastOrder = Math.floor(
        (new Date().getTime() - new Date(preferences.lastPurchaseAt).getTime()) / (1000 * 3600 * 24)
      );
      
      if (daysSinceLastOrder <= criteria.lastOrderDaysAgo) score += 15;
    }

    // Check average order value
    if (criteria.minOrderValue && preferences.averageOrderValue) {
      const avgOrderValue = parseFloat(preferences.averageOrderValue.toString());
      if (avgOrderValue >= criteria.minOrderValue) score += 10;
    }

    if (criteria.maxOrderValue && preferences.averageOrderValue) {
      const avgOrderValue = parseFloat(preferences.averageOrderValue.toString());
      if (avgOrderValue <= criteria.maxOrderValue) score += 10;
    }

    return score;
  }

  private static matchOrderFrequency(responsePattern: string, targetFrequency: string): boolean {
    const frequencyMap = {
      'immediate': 'high',
      'within_hours': 'high',
      'within_days': 'medium',
      'slow': 'low'
    };

    return frequencyMap[responsePattern as keyof typeof frequencyMap] === targetFrequency;
  }
}

// Offer optimization engine
export class OfferOptimizationEngine {
  static generateOptimalOffers(
    products: Array<{ id: number; name: string; price: number }>,
    customerPreferences: CustomerPromotionPreference,
    segment: CustomerSegment,
    maxOffers: number = 3
  ): PersonalizedOfferConfig[] {
    const offers: PersonalizedOfferConfig[] = [];

    // Sort products by relevance (could integrate with purchase history in the future)
    const sortedProducts = [...products].sort((a, b) => b.price - a.price);

    for (let i = 0; i < Math.min(sortedProducts.length, maxOffers); i++) {
      const product = sortedProducts[i];
      const offer = this.createPersonalizedOffer(
        product,
        customerPreferences,
        segment,
        `user_${customerPreferences.customerId}`
      );
      
      if (offer) {
        offers.push(offer);
      }
    }

    return offers;
  }

  private static createPersonalizedOffer(
    product: { id: number; name: string; price: number },
    customerPreferences: CustomerPromotionPreference,
    segment: CustomerSegment,
    customerId: string
  ): PersonalizedOfferConfig | null {
    const offerStrategy = segment.offerStrategy;
    const originalPrice = product.price;

    // Determine discount based on strategy and customer preferences
    const discountRange = offerStrategy.discountRange;
    const discount = Math.floor(Math.random() * (discountRange.max - discountRange.min + 1)) + discountRange.min;

    let offer: PersonalizedOfferConfig = {
      customerId,
      productId: product.id,
      productName: product.name,
      originalPrice,
      offerType: offerStrategy.primaryOfferType,
      validUntil: offerStrategy.validityDays 
        ? new Date(Date.now() + offerStrategy.validityDays * 24 * 60 * 60 * 1000)
        : undefined,
      reason: `Personalized for ${segment.name} segment`
    };

    // Set discount values based on offer type
    switch (offerStrategy.primaryOfferType) {
      case 'percentage_discount':
        offer.discountPercentage = discount;
        break;
      case 'fixed_discount':
        offer.discountAmount = discount;
        break;
      case 'fixed_price':
        offer.fixedPrice = Math.max(originalPrice * 0.5, originalPrice - discount);
        break;
      case 'bogo':
        offer.buyQuantity = 1;
        offer.getQuantity = 1;
        break;
      case 'bulk_discount':
        offer.buyQuantity = offerStrategy.minQuantity || 5;
        offer.discountPercentage = discount;
        break;
    }

    // Set quantity limits if specified
    if (offerStrategy.maxQuantityLimit) {
      offer.maxQuantity = offerStrategy.maxQuantityLimit;
    }

    return offer;
  }
}

// Advanced WhatsApp Message Generator for Personalized Campaigns
export class PersonalizedWhatsAppMessageGenerator {
  static generatePersonalizedBroadcast(
    config: PersonalizedCampaignConfig,
    customer: any,
    wholesaler: any
  ): string {
    const { campaignTitle, baseMessage, offers, includeContact, includePurchaseLink } = config;
    
    let message = '';
    
    // Dynamic greeting based on customer data and time
    const greeting = this.generatePersonalizedGreeting(customer);
    message += `${greeting}\n\n`;
    
    // Campaign introduction
    if (baseMessage) {
      message += `${baseMessage}\n\n`;
    } else {
      message += `🎯 We've handpicked some special offers just for you!\n\n`;
    }
    
    // Add personalized offers section
    if (offers && offers.length > 0) {
      message += `💎 *Your Exclusive Offers:*\n\n`;
      
      offers.forEach((offer, index) => {
        const offerLine = this.generateOfferLine(offer, index + 1);
        message += `${offerLine}\n`;
      });
      
      message += '\n';
    }
    
    // Add urgency and personalization
    message += this.generateUrgencyMessage(offers);
    
    // Add purchase link
    if (includePurchaseLink) {
      message += `\n🛒 *Order Now:* https://quikpik.app/shop/${wholesaler.id}`;
      message += `\n📱 Or reply to this message to place your order!\n\n`;
    }
    
    // Add contact information
    if (includeContact && wholesaler) {
      message += this.generateContactSection(wholesaler);
    }
    
    // Final call to action
    message += `\n💬 Questions? Just reply to this message!`;
    message += `\n🏆 Thank you for being a valued customer!`;
    
    return message;
  }
  
  private static generatePersonalizedGreeting(customer: any): string {
    const hour = new Date().getHours();
    let timeGreeting = 'Hello';
    
    if (hour < 12) {
      timeGreeting = 'Good morning';
    } else if (hour < 18) {
      timeGreeting = 'Good afternoon';
    } else {
      timeGreeting = 'Good evening';
    }
    
    if (customer.firstName) {
      return `${timeGreeting} ${customer.firstName}! 👋`;
    }
    
    return `${timeGreeting}! 👋`;
  }
  
  private static generateOfferLine(offer: PersonalizedOfferConfig, index: number): string {
    const { productName, originalPrice, offerType, discountPercentage, discountAmount, fixedPrice, buyQuantity, getQuantity } = offer;
    
    let line = `${index}. *${productName}*\n`;
    line += `   💰 Regular: £${originalPrice.toFixed(2)}`;
    
    switch (offerType) {
      case 'percentage_discount':
        const discountedPrice = originalPrice * (1 - (discountPercentage || 0) / 100);
        line += ` → 🔥 *£${discountedPrice.toFixed(2)}* (${discountPercentage}% OFF!)`;
        break;
      
      case 'fixed_discount':
        const finalPrice = originalPrice - (discountAmount || 0);
        line += ` → 🔥 *£${finalPrice.toFixed(2)}* (Save £${discountAmount?.toFixed(2)})`;
        break;
      
      case 'fixed_price':
        const savings = originalPrice - (fixedPrice || 0);
        line += ` → ⚡ *£${fixedPrice?.toFixed(2)}* (Save £${savings.toFixed(2)})`;
        break;
      
      case 'bogo':
        line += ` → 🎁 *Buy ${buyQuantity || 1} Get ${getQuantity || 1} FREE!*`;
        break;
      
      case 'bulk_discount':
        line += ` → 📦 *Bulk Deal Available* (Buy ${buyQuantity}+ for extra savings)`;
        break;
    }
    
    if (offer.reason) {
      line += `\n   💡 ${offer.reason}`;
    }
    
    if (offer.validUntil) {
      const validDate = new Date(offer.validUntil);
      line += `\n   ⏰ Valid until ${validDate.toLocaleDateString()}`;
    }
    
    return line;
  }
  
  private static generateUrgencyMessage(offers: PersonalizedOfferConfig[]): string {
    const hasLimitedTime = offers.some(offer => offer.validUntil);
    const hasLimitedQuantity = offers.some(offer => offer.maxQuantity);
    
    if (hasLimitedTime && hasLimitedQuantity) {
      return `⚡ *Limited time and quantity!* Don't miss out on these exclusive prices!\n`;
    } else if (hasLimitedTime) {
      return `⏰ *Limited time offer!* These special prices won't last long!\n`;
    } else if (hasLimitedQuantity) {
      return `📦 *Limited stock available!* Order now to secure your items!\n`;
    }
    
    return `🎯 These personalized offers are exclusively for you!\n`;
  }
  
  private static generateContactSection(wholesaler: any): string {
    let contact = `📞 *Get in touch:*\n`;
    
    if (wholesaler.businessName) {
      contact += `🏢 ${wholesaler.businessName}\n`;
    }
    
    if (wholesaler.phoneNumber) {
      contact += `📱 ${wholesaler.phoneNumber}\n`;
    }
    
    if (wholesaler.email) {
      contact += `📧 ${wholesaler.email}\n`;
    }
    
    return contact;
  }
  
  // Generate campaign preview for testing
  static generateCampaignPreview(config: PersonalizedCampaignConfig, sampleCustomer?: any): string {
    const testCustomer = sampleCustomer || {
      id: 'sample_customer',
      firstName: 'John',
      email: 'john@example.com'
    };
    
    const testWholesaler = {
      id: 'sample_wholesaler',
      businessName: 'Sample Business',
      phoneNumber: '+44 123 456 7890',
      email: 'contact@samplebusiness.com'
    };
    
    return this.generatePersonalizedBroadcast(config, testCustomer, testWholesaler);
  }
}



// Campaign performance predictor
export class CampaignPerformancePredictor {
  static predictCampaignPerformance(
    offers: PersonalizedOfferConfig[],
    customerPreferences: CustomerPromotionPreference[]
  ): {
    expectedRedemptionRate: number;
    expectedRevenue: number;
    expectedOrders: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {
    if (offers.length === 0 || customerPreferences.length === 0) {
      return {
        expectedRedemptionRate: 0,
        expectedRevenue: 0,
        expectedOrders: 0,
        riskLevel: 'high'
      };
    }

    // Calculate weighted average redemption rate
    const avgRedemptionRate = customerPreferences.reduce((sum, pref) => 
      sum + parseFloat(pref.redemptionRate?.toString() || '0'), 0
    ) / customerPreferences.length;

    // Calculate expected orders
    const expectedOrders = Math.round(offers.length * (avgRedemptionRate / 100));

    // Calculate expected revenue
    const avgOrderValue = customerPreferences.reduce((sum, pref) => 
      sum + parseFloat(pref.averageOrderValue?.toString() || '0'), 0
    ) / customerPreferences.length;

    const expectedRevenue = expectedOrders * avgOrderValue;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    if (avgRedemptionRate >= 60) {
      riskLevel = 'low';
    } else if (avgRedemptionRate < 30) {
      riskLevel = 'high';
    }

    return {
      expectedRedemptionRate: Math.round(avgRedemptionRate * 100) / 100,
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      expectedOrders,
      riskLevel
    };
  }
}