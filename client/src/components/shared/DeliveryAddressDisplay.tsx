import React from "react";
import { MapPin, Home, Building2, Users } from "lucide-react";
import { formatDeliveryAddress } from "@shared/utils/address-formatter";

interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country?: string;
  label?: string;
  instructions?: string;
}

interface DeliveryAddressDisplayProps {
  address: DeliveryAddress | string | null | undefined;
  className?: string;
  showLabel?: boolean;
  showInstructions?: boolean;
}

// Helper function to parse address from string or object
const parseDeliveryAddress = (address: string | DeliveryAddress | null | undefined): DeliveryAddress | null => {
  if (!address) return null;
  
  if (typeof address === 'string') {
    // Clean up the string - remove extra quotes and whitespace
    let cleanAddress = address.trim();
    
    // Remove surrounding quotes (both single and double, including multiple quotes)
    cleanAddress = cleanAddress.replace(/^["']+|["']+$/g, '');
    
    if (!cleanAddress) return null;

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(cleanAddress);
      
      // Handle different JSON formats - map various field names
      if (parsed && typeof parsed === 'object') {
        return {
          addressLine1: parsed.street || parsed.addressLine1 || parsed.address1 || '',
          addressLine2: parsed.addressLine2 || parsed.address2 || undefined,
          city: parsed.city || '',
          state: parsed.state || parsed.region || parsed.county || undefined,
          postalCode: parsed.postalCode || parsed.postcode || parsed.zipCode || parsed.zip || '',
          country: parsed.country || undefined,
          label: parsed.label || undefined,
          instructions: parsed.instructions || undefined,
        };
      }
      return parsed;
    } catch {
      // If not JSON, try to parse as comma-separated address
      const addressParts = cleanAddress.split(',').map(part => part.trim());
      
      // Filter out undefined/null/empty values
      const validParts = addressParts.filter(part => 
        part && 
        part !== 'undefined' && 
        part !== 'null' && 
        part.toLowerCase() !== 'undefined' && 
        part.toLowerCase() !== 'null'
      );
      
      if (validParts.length >= 2) {
        // Enhanced parsing for UK/international address formats
        // Typical format: Address1, Address2, City, State/County, PostalCode, Country
        const result: any = {
          addressLine1: '',
          addressLine2: undefined,
          city: '',
          state: undefined,
          postalCode: '',
          country: ''
        };
        
        if (validParts.length === 2) {
          // Simple format: City, Country
          result.city = validParts[0];
          result.country = validParts[1];
        } else if (validParts.length === 3) {
          // Format: Address, City, Country
          result.addressLine1 = validParts[0];
          result.city = validParts[1];
          result.country = validParts[2];
        } else if (validParts.length === 4) {
          // Format: Address, City, PostalCode, Country
          result.addressLine1 = validParts[0];
          result.city = validParts[1];
          result.postalCode = validParts[2];
          result.country = validParts[3];
        } else if (validParts.length === 5) {
          // Format: Address1, Address2, City, PostalCode, Country
          result.addressLine1 = validParts[0];
          result.addressLine2 = validParts[1];
          result.city = validParts[2];
          result.postalCode = validParts[3];
          result.country = validParts[4];
        } else if (validParts.length >= 6) {
          // Full format: Address1, Address2, City, State, PostalCode, Country
          result.addressLine1 = validParts[0];
          result.addressLine2 = validParts[1];
          result.city = validParts[2];
          result.state = validParts[3];
          result.postalCode = validParts[4];
          result.country = validParts[5];
        }
        
        return result;
      }
      
      // Fallback for single line addresses
      return {
        addressLine1: validParts[0] || cleanAddress,
        city: '',
        postalCode: '',
      };
    }
  }
  
  return address as DeliveryAddress;
};

// Helper function to get icon based on label
const getLabelIcon = (label?: string) => {
  switch (label?.toLowerCase()) {
    case 'home':
      return Home;
    case 'work':
    case 'office':
      return Building2;
    case 'family':
    case 'friend':
      return Users;
    default:
      return MapPin;
  }
};

export const DeliveryAddressDisplay: React.FC<DeliveryAddressDisplayProps> = ({ 
  address, 
  className = "",
  showLabel = true,
  showInstructions = true
}) => {
  const parsedAddress = parseDeliveryAddress(address);
  
  if (!parsedAddress) {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        Address not available
      </div>
    );
  }

  const Icon = getLabelIcon(parsedAddress.label);

  return (
    <div className={`bg-white p-3 rounded border border-blue-200 ${className}`}>
      <h6 className="font-medium text-blue-900 mb-2 text-sm flex items-center gap-2">
        <Icon className="h-4 w-4 text-green-600" />
        Delivery Address:
      </h6>
      <div className="text-sm text-gray-700 space-y-1">
        {parsedAddress.addressLine1 && (
          <div>{parsedAddress.addressLine1}</div>
        )}
        {parsedAddress.addressLine2 && (
          <div>{parsedAddress.addressLine2}</div>
        )}
        {parsedAddress.city && (
          <div>{parsedAddress.city}</div>
        )}
        {parsedAddress.state && parsedAddress.state !== parsedAddress.city && (
          <div>{parsedAddress.state}</div>
        )}
        {parsedAddress.postalCode && (
          <div>{parsedAddress.postalCode}</div>
        )}
        {parsedAddress.country && (
          <div>{parsedAddress.country}</div>
        )}
      </div>
      
      {showLabel && parsedAddress.label && (
        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit mt-2">
          {parsedAddress.label}
        </div>
      )}
      
      {showInstructions && parsedAddress.instructions && (
        <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-2">
          <span className="font-medium">Instructions:</span> {parsedAddress.instructions}
        </div>
      )}
    </div>
  );
};

export default DeliveryAddressDisplay;