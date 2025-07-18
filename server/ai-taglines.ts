import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PersonalizationContext {
  customerName?: string;
  customerGroup?: string;
  businessName: string;
  businessType?: string;
  productName?: string;
  productCategory?: string;
  promotionalOffer?: string;
  previousOrders?: number;
  isLoyalCustomer?: boolean;
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  dayOfWeek?: string;
}

interface PersonalizedMessage {
  greeting: string;
  mainMessage: string;
  callToAction: string;
  fullMessage: string;
}

export async function generatePersonalizedTagline(context: PersonalizationContext): Promise<PersonalizedMessage> {
  try {
    const prompt = `Generate a personalized WhatsApp marketing message for a B2B wholesale business with the following context:

Business: ${context.businessName}
${context.businessType ? `Business Type: ${context.businessType}` : ''}
${context.customerName ? `Customer: ${context.customerName}` : ''}
${context.customerGroup ? `Customer Group: ${context.customerGroup}` : ''}
${context.productName ? `Featured Product: ${context.productName}` : ''}
${context.productCategory ? `Product Category: ${context.productCategory}` : ''}
${context.promotionalOffer ? `Special Offer: ${context.promotionalOffer}` : ''}
${context.previousOrders ? `Previous Orders: ${context.previousOrders}` : ''}
${context.isLoyalCustomer ? 'Customer Type: Loyal customer' : ''}
${context.timeOfDay ? `Time: ${context.timeOfDay}` : ''}
${context.dayOfWeek ? `Day: ${context.dayOfWeek}` : ''}

Requirements:
1. Keep the message professional but friendly for B2B wholesale
2. Maximum 160 characters total
3. Include relevant business context
4. Make it personal and engaging
5. Include a clear call to action
6. Use appropriate tone for wholesale/business relationships

Respond with JSON in this exact format:
{
  "greeting": "personalized greeting (20-30 chars)",
  "mainMessage": "core message with context (80-100 chars)",  
  "callToAction": "clear action request (20-30 chars)",
  "fullMessage": "complete combined message (max 160 chars)"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert B2B marketing copywriter specializing in WhatsApp messaging for wholesale businesses. Generate concise, professional, and personalized messages that drive engagement and sales."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      greeting: result.greeting || "Hi there!",
      mainMessage: result.mainMessage || "Check out our latest products",
      callToAction: result.callToAction || "Order now!",
      fullMessage: result.fullMessage || "Hi there! Check out our latest products. Order now!"
    };

  } catch (error) {
    console.error('OpenAI API Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Always return fallback message instead of throwing error
    const fallbackGreeting = context.customerName ? `Hi ${context.customerName}!` : "Hello!";
    const fallbackMain = context.productName 
      ? `New stock: ${context.productName} available` 
      : `Fresh stock from ${context.businessName}`;
    const fallbackCTA = context.promotionalOffer ? "Special offer!" : "Order today!";
    const fallbackFull = `${fallbackGreeting} ${fallbackMain}. ${fallbackCTA}`;
    
    return {
      greeting: fallbackGreeting,
      mainMessage: fallbackMain,
      callToAction: fallbackCTA,
      fullMessage: fallbackFull
    };
  }
}

export async function generateCampaignSuggestions(context: {
  businessName: string;
  businessType?: string;
  products: Array<{name: string; category?: string; price?: number}>;
  customerGroups: Array<{name: string; memberCount: number}>;
  recentPerformance?: {
    openRate?: number;
    clickRate?: number;
    conversionRate?: number;
  };
}): Promise<Array<{
  title: string;
  description: string;
  targetAudience: string;
  suggestedTiming: string;
  messageStyle: string;
}>> {
  try {
    const prompt = `Generate 3 WhatsApp campaign suggestions for a B2B wholesale business:

Business: ${context.businessName}
${context.businessType ? `Type: ${context.businessType}` : ''}

Products: ${context.products.map(p => `${p.name} (${p.category || 'General'})`).join(', ')}

Customer Groups: ${context.customerGroups.map(g => `${g.name} (${g.memberCount} members)`).join(', ')}

${context.recentPerformance ? `Recent Performance: ${context.recentPerformance.openRate}% open, ${context.recentPerformance.clickRate}% click, ${context.recentPerformance.conversionRate}% conversion` : ''}

Create diverse campaign types (promotional, informational, relationship-building) with specific targeting and timing recommendations.

Respond with JSON array of exactly 3 campaigns in this format:
[
  {
    "title": "campaign name",
    "description": "brief description of campaign goal",
    "targetAudience": "which customer group to target",
    "suggestedTiming": "best time/day to send",
    "messageStyle": "tone and approach description"
  }
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a B2B marketing strategist who creates effective WhatsApp campaign strategies for wholesale businesses."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.8,
    });

    const result = JSON.parse(response.choices[0].message.content || '[]');
    return Array.isArray(result) ? result : [];

  } catch (error) {
    console.error('Campaign suggestions error:', error);
    return [
      {
        title: "Weekly Stock Update",
        description: "Inform customers about new arrivals and availability",
        targetAudience: "All customer groups",
        suggestedTiming: "Monday morning",
        messageStyle: "Professional and informative"
      },
      {
        title: "Special Promotions",
        description: "Highlight discounted items and bulk deals",
        targetAudience: "High-volume customers",
        suggestedTiming: "Tuesday-Thursday",
        messageStyle: "Urgent but professional"
      },
      {
        title: "Customer Appreciation",
        description: "Build relationships with loyal customers",
        targetAudience: "Long-term customers",
        suggestedTiming: "Friday afternoon",
        messageStyle: "Personal and appreciative"
      }
    ];
  }
}

export async function optimizeMessageTiming(context: {
  customerGroup: string;
  businessType: string;
  previousCampaignData?: Array<{
    sentTime: string;
    openRate: number;
    responseRate: number;
  }>;
}): Promise<{
  recommendedTime: string;
  recommendedDay: string;
  reasoning: string;
  confidence: number;
}> {
  try {
    const prompt = `Analyze the best timing for WhatsApp marketing messages:

Customer Group: ${context.customerGroup}
Business Type: ${context.businessType}
${context.previousCampaignData ? `Previous Campaign Performance: ${JSON.stringify(context.previousCampaignData)}` : ''}

Recommend the optimal day and time for sending WhatsApp messages to maximize engagement for this B2B wholesale business.

Consider:
- Business hours for B2B customers
- Industry-specific patterns
- Historical performance data (if available)
- Customer behavior patterns

Respond with JSON in this format:
{
  "recommendedTime": "HH:MM format",
  "recommendedDay": "day of week",
  "reasoning": "explanation for recommendation",
  "confidence": 0.85
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a data analyst specializing in B2B communication timing optimization for wholesale businesses."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      recommendedTime: result.recommendedTime || "10:00",
      recommendedDay: result.recommendedDay || "Tuesday",
      reasoning: result.reasoning || "Optimal time for B2B engagement",
      confidence: result.confidence || 0.7
    };

  } catch (error) {
    console.error('Message timing optimization error:', error);
    return {
      recommendedTime: "10:00",
      recommendedDay: "Tuesday",
      reasoning: "Standard B2B business hours for optimal engagement",
      confidence: 0.6
    };
  }
}