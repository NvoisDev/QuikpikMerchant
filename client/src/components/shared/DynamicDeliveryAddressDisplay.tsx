import React, { useState } from "react";
import { MapPin, Home, Building2, Users, Edit3 } from "lucide-react";
import { DeliveryAddressDisplay } from "./DeliveryAddressDisplay";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface DynamicDeliveryAddressDisplayProps {
  orderId: number;
  orderStatus: string;
  wholesalerId: string;
  staticAddress?: string; // For completed orders - historical snapshot
  addressId?: number; // For active orders - reference to live address
  className?: string;
  onAddressChanged?: () => void; // Callback to refresh order data
}

interface DeliveryAddress {
  id: number;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  label?: string;
  instructions?: string;
}

export const DynamicDeliveryAddressDisplay: React.FC<DynamicDeliveryAddressDisplayProps> = ({
  orderId,
  orderStatus,
  wholesalerId,
  staticAddress,
  addressId,
  className = "",
  onAddressChanged
}) => {
  const [showAddressSelector, setShowAddressSelector] = useState(false);

  // Determine if this order can have its address changed
  const isAddressChangeable = ['pending', 'confirmed', 'processing'].includes(orderStatus);
  
  // For active orders, fetch the live address from the database
  const { data: liveAddress, isLoading } = useQuery({
    queryKey: ['/api/customer/delivery-address', addressId],
    queryFn: async () => {
      if (!addressId || !isAddressChangeable) return null;
      
      try {
        const response = await apiRequest('GET', `/api/customer/delivery-addresses/${wholesalerId}`);
        const addresses = await response.json();
        return addresses.find((addr: DeliveryAddress) => addr.id === addressId) || null;
      } catch (error) {
        console.error('Failed to fetch live address:', error);
        return null;
      }
    },
    enabled: Boolean(addressId && isAddressChangeable)
  });

  // Determine which address to display
  const displayAddress = isAddressChangeable && liveAddress ? liveAddress : staticAddress;
  
  const handleChangeAddress = () => {
    setShowAddressSelector(true);
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-50 p-3 rounded border animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded mb-2"></div>
        <div className="h-3 bg-gray-200 rounded mb-1"></div>
        <div className="h-3 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Address Display */}
      <div className="relative">
        <DeliveryAddressDisplay 
          address={displayAddress}
          showLabel={true}
          showInstructions={true}
        />
        
        {/* Status Indicator */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {isAddressChangeable ? (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Current address (can be changed)
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                Address at time of order
              </span>
            )}
          </div>
          
          {/* Change Address Button */}
          {isAddressChangeable && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-xs h-7"
              onClick={handleChangeAddress}
            >
              <Edit3 className="h-3 w-3" />
              Change Address
            </Button>
          )}
        </div>
      </div>

      {/* Address Selection Modal */}
      {showAddressSelector && (
        <AddressSelectionModal
          orderId={orderId}
          wholesalerId={wholesalerId}
          currentAddressId={addressId}
          onClose={() => setShowAddressSelector(false)}
          onAddressChanged={() => {
            setShowAddressSelector(false);
            onAddressChanged?.();
          }}
        />
      )}
    </div>
  );
};

// Address Selection Modal Component
interface AddressSelectionModalProps {
  orderId: number;
  wholesalerId: string;
  currentAddressId?: number;
  onClose: () => void;
  onAddressChanged: () => void;
}

const AddressSelectionModal: React.FC<AddressSelectionModalProps> = ({
  orderId,
  wholesalerId,
  currentAddressId,
  onClose,
  onAddressChanged
}) => {
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(currentAddressId || null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch customer's delivery addresses
  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['/api/customer/delivery-addresses', wholesalerId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/customer/delivery-addresses/${wholesalerId}`);
      return response.json();
    }
  });

  const handleSaveAddress = async () => {
    if (!selectedAddressId || selectedAddressId === currentAddressId) {
      onClose();
      return;
    }

    setIsUpdating(true);
    try {
      await apiRequest('PUT', `/api/orders/${orderId}/change-delivery-address`, {
        deliveryAddressId: selectedAddressId
      });
      
      onAddressChanged();
    } catch (error) {
      console.error('Failed to update address:', error);
      alert('Failed to update delivery address. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const getLabelIcon = (label?: string) => {
    switch (label?.toLowerCase()) {
      case 'home': return Home;
      case 'work':
      case 'office': return Building2;
      case 'family':
      case 'friend': return Users;
      default: return MapPin;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-auto">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-lg">Change Delivery Address</h3>
          <p className="text-sm text-gray-600 mt-1">
            Select a different address for this order
          </p>
        </div>

        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-3 border rounded animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            addresses.map((address: DeliveryAddress) => {
              const Icon = getLabelIcon(address.label);
              const isSelected = selectedAddressId === address.id;
              const isCurrent = currentAddressId === address.id;
              
              return (
                <div
                  key={address.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    isSelected 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedAddressId(address.id)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedAddressId(address.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-sm">
                          {address.label || 'Address'}
                          {isCurrent && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700">
                        <div>{address.addressLine1}</div>
                        {address.addressLine2 && <div>{address.addressLine2}</div>}
                        <div>{address.city}, {address.postalCode}</div>
                        <div>{address.country}</div>
                      </div>
                      {address.instructions && (
                        <div className="text-xs text-gray-500 mt-1 bg-amber-50 px-2 py-1 rounded">
                          {address.instructions}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveAddress}
            disabled={isUpdating || selectedAddressId === currentAddressId}
          >
            {isUpdating ? 'Updating...' : 'Update Address'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DynamicDeliveryAddressDisplay;