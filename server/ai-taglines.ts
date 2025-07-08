import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateTaglines(businessInfo: {
  businessName?: string;
  businessDescription?: string;
  category?: string;
  targetAudience?: string;
  style?: string;
}): Promise<string[]> {
  try {
    const prompt = `Generate 8 unique, professional taglines for a wholesale business with the following details:
    
Business Name: ${businessInfo.businessName || 'Wholesale Business'}
Business Description: ${businessInfo.businessDescription || 'General wholesale business'}
Category/Industry: ${businessInfo.category || 'General wholesale'}
Target Audience: ${businessInfo.targetAudience || 'Retailers and businesses'}
Style Preference: ${businessInfo.style || 'Professional and trustworthy'}

Requirements:
- Keep each tagline under 50 characters
- Make them catchy and memorable
- Focus on value propositions like quality, reliability, wholesale pricing
- Avoid generic phrases
- Make them suitable for a customer portal header
- Ensure they sound professional and trustworthy
- Include variety: some focused on quality, some on service, some on value

Return the response as a JSON object with an array of taglines:
{
  "taglines": [
    "tagline1",
    "tagline2",
    ...
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    console.log("OpenAI Response:", response.choices[0].message.content);
    
    const result = JSON.parse(response.choices[0].message.content || '{"taglines": []}');
    console.log("Parsed result:", result);
    
    const taglines = result.taglines || [];
    console.log("Returning taglines:", taglines);
    
    return taglines;
  } catch (error) {
    console.error("Error generating taglines:", error);
    throw new Error("Failed to generate taglines");
  }
}