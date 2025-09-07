// Enhanced address helper utility for email systems
import { storage } from '../storage';

export interface AddressData {
  address_line1?: string;  // Match database schema
  address_line2?: string;  // Match database schema
  city?: string;
  state?: string;
  postal_code?: string;    // Match database schema
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
      const addresses = await storage.getDeliveryAddresses(order.customerId, order.wholesalerId);
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
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
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

/**
 * Get individual address components for email templates
 * Returns object with individual components that can be spread into email data
 */
export async function getAddressComponentsForEmail(order: Order): Promise<{
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}> {
  const defaultComponents = {
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  };

  // Try to fetch individual address components from live database
  if (order.deliveryAddressId) {
    try {
      console.log(`🏠 FETCHING ADDRESS: deliveryAddressId=${order.deliveryAddressId}, customerId=${order.customerId}, wholesalerId=${order.wholesalerId}`);
      const addresses = await storage.getDeliveryAddresses(order.customerId, order.wholesalerId);
      console.log(`🏠 FOUND ${addresses.length} addresses for customer ${order.customerId}`);
      const fullAddress = addresses.find((addr: any) => addr.id === order.deliveryAddressId);
      
      if (fullAddress) {
        console.log(`🏠 ADDRESS COMPONENTS DEBUG: Raw address object:`, fullAddress);
        console.log(`🏠 ADDRESS COMPONENTS DEBUG: Available keys:`, Object.keys(fullAddress));
        
        const components = {
          addressLine1: fullAddress.addressLine1 || '',
          addressLine2: fullAddress.addressLine2 || '',
          city: fullAddress.city || '',
          state: fullAddress.state || '',
          postalCode: fullAddress.postalCode || '',
          country: fullAddress.country || ''
        };
        
        console.log(`🏠 ADDRESS COMPONENTS EXTRACTED:`, components);
        return components;
      }
    } catch (error) {
      console.error('Error fetching address components for email:', error);
    }
  }
  
  return defaultComponents;
}