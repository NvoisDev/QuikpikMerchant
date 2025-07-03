import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateProductDescription(productName: string, category?: string): Promise<string> {
  try {
    const prompt = `Write a compelling product description for a wholesale product called "${productName}"${
      category ? ` in the ${category} category` : ""
    }. Focus on key features, benefits, and selling points that would appeal to retailers. Keep it professional and concise, around 2-3 sentences.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a professional product copywriter specializing in wholesale product descriptions. Write clear, compelling descriptions that highlight value propositions for retailers.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("Error generating product description:", error);
    throw new Error("Failed to generate product description");
  }
}

export async function generateProductImage(productName: string, category?: string, description?: string): Promise<string> {
  try {
    let prompt = `A high-quality, professional product photo of ${productName}`;
    
    if (category) {
      prompt += ` (${category} category)`;
    }
    
    if (description) {
      // Extract key visual elements from description
      prompt += `. ${description.substring(0, 100)}`;
    }
    
    prompt += ". Clean white background, professional lighting, commercial photography style, high resolution, suitable for e-commerce";

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    return response.data[0].url || "";
  } catch (error) {
    console.error("Error generating product image:", error);
    throw new Error("Failed to generate product image");
  }
}