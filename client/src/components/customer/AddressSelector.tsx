import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Plus, Star, ChevronDown, Home, Building, Truck } from "lucide-react";
import { DeliveryAddressManager } from "./DeliveryAddressManager";

interface DeliveryAddress {
  id: number;
  customerId: string;
  wholesalerId: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  label?: string;
  instructions?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddressSelectorProps {
  wholesalerId: string;
  selectedAddress?: DeliveryAddress;
  onAddressSelect: (address: DeliveryAddress) => void;
  compact?: boolean;
  className?: string;
}

const getLabelIcon = (label?: string) => {
  switch (label?.toLowerCase()) {
    case 'home': return Home;
    case 'office': return Building;
    case 'warehouse': return Truck;
    default: return MapPin;
  }
};

const formatAddress = (address: DeliveryAddress) => {
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.postalCode,
    address.country === "United Kingdom" ? "UK" : address.country
  ].filter(Boolean);
  return parts.join(", ");
};

export function AddressSelector({ 
  wholesalerId, 
  selectedAddress, 
  onAddressSelect, 
  compact = false,
  className = ""
}: AddressSelectorProps) {
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);

  // Fetch delivery addresses
  const { data: addresses = [], isLoading } = useQuery<DeliveryAddress[]>({
    queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Get default address if no address is selected
  const defaultAddress = addresses.find(addr => addr.isDefault);
  const displayAddress = selectedAddress || defaultAddress;

  // Auto-select default address when available and no address is currently selected
  useEffect(() => {
    console.log('🏠 ADDRESS SELECTOR DEBUG:', {
      addressesLength: addresses.length,
      hasDefaultAddress: !!defaultAddress,
      hasSelectedAddress: !!selectedAddress,
      defaultAddressData: defaultAddress ? defaultAddress.addressLine1 : 'none'
    });
    
    if (defaultAddress && !selectedAddress && addresses.length > 0) {
      console.log('🏠 AUTO-SELECTING: Default address found, auto-selecting for customer convenience:', defaultAddress.addressLine1);
      onAddressSelect(defaultAddress);
    } else if (addresses.length === 0) {
      console.log('🏠 NO ADDRESSES: Customer has no delivery addresses saved');
    } else if (!defaultAddress && addresses.length > 0) {
      console.log('🏠 NO DEFAULT: Customer has addresses but no default address set - auto-selecting first address');
      // If no default but addresses exist, auto-select the first one
      onAddressSelect(addresses[0]);
    } else if (selectedAddress) {
      console.log('🏠 ADDRESS ALREADY SELECTED: Using existing selection:', selectedAddress.addressLine1);
    }
  }, [defaultAddress, selectedAddress, onAddressSelect, addresses.length, addresses]);

  const handleAddressSelect = (address: DeliveryAddress) => {
    onAddressSelect(address);
    setIsManageDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  // If no addresses exist, show add first address prompt
  if (addresses.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <label className="text-sm font-medium text-gray-700">
          Delivery Address
        </label>
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="p-4 text-center">
            <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-3">
              Add your delivery address to continue
            </p>
            <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Address
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Manage Delivery Addresses</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto max-h-[70vh] pr-2">
                  <DeliveryAddressManager
                    wholesalerId={wholesalerId}
                    onAddressSelect={handleAddressSelect}
                    showAddButton={true}
                    selectedAddress={selectedAddress}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-gray-700">
        Delivery Address
      </label>
      
      {/* Selected/Default Address Display */}
      {displayAddress ? (
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            if (!selectedAddress && displayAddress) {
              console.log('🏠 MANUAL SELECT: User clicked address card, selecting:', displayAddress.addressLine1);
              onAddressSelect(displayAddress);
            }
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                {(() => {
                  const IconComponent = getLabelIcon(displayAddress.label);
                  return <IconComponent className="w-5 h-5 text-gray-500 mt-1 flex-shrink-0" />;
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    {displayAddress.label && (
                      <Badge variant="secondary" className="text-xs">
                        {displayAddress.label}
                      </Badge>
                    )}
                    {displayAddress.isDefault && (
                      <Badge variant="default" className="text-xs bg-green-600">
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 leading-relaxed">
                    {formatAddress(displayAddress)}
                  </p>
                  {displayAddress.instructions && (
                    <p className="text-xs text-gray-500 mt-1">
                      Instructions: {displayAddress.instructions}
                    </p>
                  )}
                </div>
              </div>
              
              <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Choose Delivery Address</DialogTitle>
                  </DialogHeader>
                  <div className="overflow-y-auto max-h-[70vh] pr-2">
                    <DeliveryAddressManager
                      wholesalerId={wholesalerId}
                      onAddressSelect={handleAddressSelect}
                      showAddButton={true}
                      selectedAddress={selectedAddress}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-3">
              No default address selected
            </p>
            <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Select Address
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Choose Delivery Address</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto max-h-[70vh] pr-2">
                  <DeliveryAddressManager
                    wholesalerId={wholesalerId}
                    onAddressSelect={handleAddressSelect}
                    showAddButton={true}
                    selectedAddress={selectedAddress}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Quick Add Address Button */}
      {addresses.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={() => setIsManageDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Address
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Manage Delivery Addresses</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[70vh] pr-2">
              <DeliveryAddressManager
                wholesalerId={wholesalerId}
                onAddressSelect={handleAddressSelect}
                showAddButton={true}
                selectedAddress={selectedAddress}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}