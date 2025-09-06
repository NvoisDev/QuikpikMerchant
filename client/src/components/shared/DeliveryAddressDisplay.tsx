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
      // If not JSON, treat as a simple address line and create a basic object
      return {
        addressLine1: cleanAddress,
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