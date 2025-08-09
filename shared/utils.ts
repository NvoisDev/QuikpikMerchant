// Utility function to clean AI-generated descriptions for customer display
export function cleanAIDescription(description: string): string {
  if (!description) return description;
  
  // Remove common AI formatting markers that shouldn't appear to customers
  return description
    .replace(/\*\*Product Name:\*\*[^\n]*/gi, '') // Remove **Product Name:** lines
    .replace(/\*\*Category:\*\*[^\n]*/gi, '') // Remove **Category:** lines
    .replace(/\*\*Description:\*\*[^\n]*/gi, '') // Remove **Description:** lines
    .replace(/\*\*Price:\*\*[^\n]*/gi, '') // Remove **Price:** lines
    .replace(/\*\*Features:\*\*[^\n]*/gi, '') // Remove **Features:** lines
    .replace(/\*\*Benefits:\*\*[^\n]*/gi, '') // Remove **Benefits:** lines
    .replace(/^\s*\*\*[^:]+:\*\*\s*/gm, '') // Remove any other **Label:** patterns at start of lines
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Convert **bold text** to regular text
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
    .trim();
}