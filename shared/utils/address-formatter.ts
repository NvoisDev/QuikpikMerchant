// Utility functions for formatting delivery addresses consistently across the platform

export interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country?: string;
}

// Format delivery address for display with proper line breaks
export function formatDeliveryAddress(address: string | DeliveryAddress | null): string[] {
  if (!address) return [];
  
  try {
    // If it's already an object
    if (typeof address === 'object') {
      return [
        address.addressLine1,
        address.addressLine2,
        address.city,
        address.state,
        address.postalCode,
        address.country
      ].filter(part => part && part.trim() && part !== 'undefined' && part !== 'null' && part !== null && part !== undefined);
    }
    
    // If it's a JSON string, parse it first
    if (typeof address === 'string' && address.includes('{')) {
      const parsed = JSON.parse(address);
      return [
        parsed.addressLine1,
        parsed.addressLine2,
        parsed.city,
        parsed.state,
        parsed.postalCode,
        parsed.country
      ].filter(part => part && part.trim() && part !== 'undefined' && part !== 'null' && part !== null && part !== undefined);
    }
    
    // If it's already a comma-separated string, split it and filter properly
    if (typeof address === 'string' && address.includes(',')) {
      return address.split(',')
        .map(part => part.trim())
        .filter(part => 
          part && 
          part !== 'undefined' && 
          part !== 'null' && 
          part.toLowerCase() !== 'undefined' && 
          part.toLowerCase() !== 'null'
        );
    }
    
    // Return as single line if it's just a string
    return typeof address === 'string' ? [address] : [];
  } catch (error) {
    // Fallback: split by comma if it's a string
    if (typeof address === 'string') {
      return address.split(',').map(part => part.trim()).filter(part => part && part !== 'undefined' && part !== 'null');
    }
    return [];
  }
}

// Format address as a single line with commas
export function formatDeliveryAddressOneLine(address: string | DeliveryAddress | null): string {
  const addressLines = formatDeliveryAddress(address);
  return addressLines.join(', ');
}

// Format address for HTML display with line breaks
export function formatDeliveryAddressHTML(address: string | DeliveryAddress | null): string {
  const addressLines = formatDeliveryAddress(address);
  return addressLines.join('<br>');
}