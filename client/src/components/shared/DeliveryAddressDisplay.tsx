import React from "react";
import { MapPin, Home, Building2, Users } from "lucide-react";
import { formatDeliveryAddress } from "@shared/utils/address-formatter";

interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
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
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(address);
      return parsed;
    } catch {
      // If not JSON, use the utility function to format
      const lines = formatDeliveryAddress(address);
      if (lines.length === 0) return null;
      
      // Create a basic address object from formatted lines
      return {
        addressLine1: lines[0] || '',
        addressLine2: lines[1] || undefined,
        city: lines[2] || '',
        postalCode: lines[3] || '',
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
      <h6 className="font-medium text-blue-900 mb-2 text-sm">Delivery Address:</h6>
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <Icon className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-700 min-w-0">
            <div className="font-medium">{parsedAddress.addressLine1}</div>
            {parsedAddress.addressLine2 && (
              <div>{parsedAddress.addressLine2}</div>
            )}
            <div>
              {parsedAddress.city}
              {parsedAddress.postalCode && ` ${parsedAddress.postalCode}`}
            </div>
            {parsedAddress.country && (
              <div>{parsedAddress.country}</div>
            )}
          </div>
        </div>
        
        {showLabel && parsedAddress.label && (
          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
            {parsedAddress.label}
          </div>
        )}
        
        {showInstructions && parsedAddress.instructions && (
          <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
            <span className="font-medium">Instructions:</span> {parsedAddress.instructions}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryAddressDisplay;