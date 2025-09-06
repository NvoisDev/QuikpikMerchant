// Enhanced address helper utility for email systems
import { storage } from '../storage';

export interface AddressData {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Order {
  deliveryAddressId?: number;
  deliveryAddress?: string;
  wholesalerId: string;
  fulfillmentType?: string;
}

/**
 * Robust address formatter that ensures complete addresses are always retrieved
 * Priority: Live database data > Stored snapshot > Fallback message
 */
export async function getCompleteDeliveryAddress(order: Order): Promise<string> {
  // STEP 1: Always prioritize live address data from database
  if (order.deliveryAddressId) {
    try {
      console.log(`📍 Fetching live address for ID: ${order.deliveryAddressId}`);
      const addresses = await storage.getDeliveryAddresses(order.wholesalerId);
      const fullAddress = addresses.find((addr: any) => addr.id === order.deliveryAddressId);
      
      if (fullAddress) {
        const completeAddress = formatAddressComponents(fullAddress);
        if (completeAddress && completeAddress !== 'Address not available') {
          console.log(`✅ Live address found: ${completeAddress}`);
          return completeAddress;
        }
      }
      console.log(`⚠️ Live address lookup failed for ID: ${order.deliveryAddressId}`);
    } catch (error) {
      console.error('❌ Error fetching live address:', error);
    }
  }
  
  // STEP 2: Fallback to stored address snapshot if available
  if (order.deliveryAddress && order.deliveryAddress.trim()) {
    const cleanedAddress = cleanStoredAddress(order.deliveryAddress);
    if (cleanedAddress && cleanedAddress !== 'Address not available') {
      console.log(`📍 Using stored address: ${cleanedAddress}`);
      return cleanedAddress;
    }
  }
  
  // STEP 3: Return appropriate fallback based on fulfillment type
  const fallback = order.fulfillmentType === 'pickup' 
    ? 'Collection from store' 
    : 'Address to be confirmed';
  
  console.log(`📍 Using fallback: ${fallback}`);
  return fallback;
}

/**
 * Format address components into a clean, complete address string
 */
export function formatAddressComponents(address: AddressData): string {
  if (!address) return 'Address not available';
  
  const components = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ];
  
  // Filter out empty, null, undefined, and invalid values
  const validComponents = components.filter(component => 
    component && 
    typeof component === 'string' && 
    component.trim() !== '' && 
    component.trim().toLowerCase() !== 'null' &&
    component.trim().toLowerCase() !== 'undefined'
  );
  
  if (validComponents.length === 0) {
    return 'Address not available';
  }
  
  const formattedAddress = validComponents.join(', ');
  
  // Additional validation - check for common incomplete patterns
  if (isIncompleteAddress(formattedAddress)) {
    return 'Address not available';
  }
  
  return formattedAddress;
}

/**
 * Clean and validate stored address snapshots
 */
function cleanStoredAddress(storedAddress: string): string {
  if (!storedAddress || typeof storedAddress !== 'string') {
    return 'Address not available';
  }
  
  const cleaned = storedAddress.trim();
  
  // Check for obviously incomplete addresses
  if (isIncompleteAddress(cleaned)) {
    return 'Address not available';
  }
  
  return cleaned;
}

/**
 * Detect incomplete or invalid addresses
 */
function isIncompleteAddress(address: string): boolean {
  if (!address || address.length < 10) return true;
  
  // Check for patterns that indicate incomplete data
  const incompletePatterns = [
    /^[,\s]+/,                    // Starts with commas/spaces
    /[,\s]+$/,                    // Ends with commas/spaces  
    /,\s*,/,                      // Double commas
    /^,.*,.*,\s*[A-Z][a-z]+$/,    // Pattern like ", Barking, , United Kingdom"
    /^[,\s]*[A-Z][a-z]+[,\s]*$/,  // Just a city name
  ];
  
  return incompletePatterns.some(pattern => pattern.test(address));
}

/**
 * Get delivery address with enhanced error handling for email systems
 */
export async function getEmailDeliveryAddress(order: Order): Promise<{
  address: string;
  isComplete: boolean;
  source: 'live' | 'stored' | 'fallback';
}> {
  // Try live data first
  if (order.deliveryAddressId) {
    try {
      const addresses = await storage.getDeliveryAddresses(order.wholesalerId);
      const fullAddress = addresses.find((addr: any) => addr.id === order.deliveryAddressId);
      
      if (fullAddress) {
        const formattedAddress = formatAddressComponents(fullAddress);
        if (formattedAddress && formattedAddress !== 'Address not available') {
          return {
            address: formattedAddress,
            isComplete: true,
            source: 'live'
          };
        }
      }
    } catch (error) {
      console.error('Error fetching live address for email:', error);
    }
  }
  
  // Try stored data
  if (order.deliveryAddress) {
    const cleanedAddress = cleanStoredAddress(order.deliveryAddress);
    if (cleanedAddress && cleanedAddress !== 'Address not available') {
      return {
        address: cleanedAddress,
        isComplete: !isIncompleteAddress(cleanedAddress),
        source: 'stored'
      };
    }
  }
  
  // Fallback
  const fallback = order.fulfillmentType === 'pickup' 
    ? 'Collection from store' 
    : 'Address to be confirmed - customer will be contacted';
    
  return {
    address: fallback,
    isComplete: false,
    source: 'fallback'
  };
}