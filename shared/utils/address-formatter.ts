// Utility functions for formatting delivery addresses consistently across the platform

export interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
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
        address.postalCode,
        address.country
      ].filter(Boolean);
    }
    
    // If it's a JSON string, parse it first
    if (typeof address === 'string' && address.includes('{')) {
      const parsed = JSON.parse(address);
      return [
        parsed.addressLine1,
        parsed.addressLine2,
        parsed.city,
        parsed.postalCode,
        parsed.country
      ].filter(Boolean);
    }
    
    // If it's already a comma-separated string, split it
    if (typeof address === 'string' && address.includes(',')) {
      return address.split(',').map(part => part.trim()).filter(Boolean);
    }
    
    // Return as single line if it's just a string
    return typeof address === 'string' ? [address] : [];
  } catch (error) {
    // Fallback: split by comma if it's a string
    if (typeof address === 'string') {
      return address.split(',').map(part => part.trim()).filter(Boolean);
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