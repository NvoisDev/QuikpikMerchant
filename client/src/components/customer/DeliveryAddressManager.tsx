import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Edit, Trash2, Star, Home, Building, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

interface DeliveryAddressManagerProps {
  wholesalerId: string;
  onAddressSelect?: (address: DeliveryAddress) => void;
  showAddButton?: boolean;
  showDefaultOnly?: boolean;
  compact?: boolean;
}

interface AddressFormData {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  label: string;
  instructions: string;
  isDefault: boolean;
}

const ADDRESS_LABELS = [
  { value: "home", label: "Home", icon: Home },
  { value: "office", label: "Office", icon: Building },
  { value: "warehouse", label: "Warehouse", icon: Truck },
  { value: "other", label: "Other", icon: MapPin },
];

const COUNTRIES = [
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Ireland", label: "Ireland" },
  { value: "France", label: "France" },
  { value: "Germany", label: "Germany" },
  { value: "Spain", label: "Spain" },
  { value: "Italy", label: "Italy" },
  { value: "Netherlands", label: "Netherlands" },
  { value: "Belgium", label: "Belgium" },
];

export function DeliveryAddressManager({ 
  wholesalerId, 
  onAddressSelect, 
  showAddButton = true, 
  showDefaultOnly = false,
  compact = false 
}: DeliveryAddressManagerProps) {
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<DeliveryAddress | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<DeliveryAddress | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState<AddressFormData>({
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United Kingdom",
    label: "",
    instructions: "",
    isDefault: false,
  });

  // Fetch delivery addresses
  const { data: addresses = [], isLoading } = useQuery<DeliveryAddress[]>({
    queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Filter addresses if showDefaultOnly is true
  const displayAddresses = showDefaultOnly 
    ? addresses.filter(addr => addr.isDefault)
    : addresses;

  // Create address mutation
  const createAddressMutation = useMutation({
    mutationFn: async (addressData: Partial<AddressFormData>) => {
      return await apiRequest('POST', '/api/customer/delivery-addresses', {
        wholesalerId,
        ...addressData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`] });
      setIsAddingAddress(false);
      resetForm();
      toast({
        title: "Address Added",
        description: "Your delivery address has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Adding Address",
        description: error.message || "Failed to add delivery address. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AddressFormData> }) => {
      return await apiRequest('PUT', `/api/customer/delivery-addresses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`] });
      setEditingAddress(null);
      resetForm();
      toast({
        title: "Address Updated",
        description: "Your delivery address has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Updating Address",
        description: error.message || "Failed to update delivery address. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete address mutation
  const deleteAddressMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/customer/delivery-addresses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`] });
      setIsDeleteDialogOpen(false);
      setAddressToDelete(null);
      toast({
        title: "Address Deleted",
        description: "Your delivery address has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Deleting Address",
        description: error.message || "Failed to delete delivery address. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Set default address mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('POST', `/api/customer/delivery-addresses/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`] });
      toast({
        title: "Default Address Updated",
        description: "Your default delivery address has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Setting Default",
        description: error.message || "Failed to set default address. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "United Kingdom",
      label: "",
      instructions: "",
      isDefault: false,
    });
  };

  const handleEdit = (address: DeliveryAddress) => {
    setEditingAddress(address);
    setFormData({
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || "",
      city: address.city,
      state: address.state || "",
      postalCode: address.postalCode,
      country: address.country,
      label: address.label || "",
      instructions: address.instructions || "",
      isDefault: address.isDefault,
    });
  };

  const handleDelete = (address: DeliveryAddress) => {
    setAddressToDelete(address);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.addressLine1 || !formData.city || !formData.postalCode) {
      toast({
        title: "Missing Information",
        description: "Please fill in the address line, city, and postal code.",
        variant: "destructive",
      });
      return;
    }

    if (editingAddress) {
      updateAddressMutation.mutate({ id: editingAddress.id, data: formData });
    } else {
      createAddressMutation.mutate(formData);
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

  const getLabelIcon = (label?: string) => {
    const labelData = ADDRESS_LABELS.find(l => l.value === label?.toLowerCase());
    return labelData ? labelData.icon : MapPin;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Address List */}
      {displayAddresses.length > 0 ? (
        <div className="space-y-3">
          {displayAddresses.map((address) => {
            const IconComponent = getLabelIcon(address.label);
            return (
              <Card 
                key={address.id} 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  address.isDefault ? 'ring-2 ring-green-500 bg-green-50' : ''
                } ${compact ? 'p-3' : ''}`}
                onClick={() => onAddressSelect?.(address)}
              >
                <CardContent className={compact ? "p-0" : "p-4"}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <IconComponent className="w-5 h-5 text-gray-500 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          {address.label && (
                            <Badge variant="secondary" className="text-xs">
                              {address.label}
                            </Badge>
                          )}
                          {address.isDefault && (
                            <Badge variant="default" className="text-xs bg-green-600">
                              <Star className="w-3 h-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {formatAddress(address)}
                        </p>
                        {address.instructions && (
                          <p className="text-xs text-gray-500 mt-1">
                            Instructions: {address.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {!compact && (
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {!address.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultMutation.mutate(address.id);
                            }}
                            disabled={setDefaultMutation.isPending}
                          >
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(address);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(address);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Delivery Addresses
            </h3>
            <p className="text-gray-500 mb-4">
              Add your first delivery address to continue with checkout.
            </p>
            {showAddButton && (
              <Button onClick={() => setIsAddingAddress(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Address
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Address Button */}
      {showAddButton && displayAddresses.length > 0 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsAddingAddress(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Address
        </Button>
      )}

      {/* Add/Edit Address Dialog */}
      <Dialog 
        open={isAddingAddress || editingAddress !== null} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingAddress(false);
            setEditingAddress(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? 'Edit Address' : 'Add New Address'}
            </DialogTitle>
            <DialogDescription>
              {editingAddress ? 'Update your delivery address details.' : 'Add a new delivery address for future orders.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Address Line 1 */}
            <div>
              <Label htmlFor="addressLine1">Address Line 1 *</Label>
              <Input
                id="addressLine1"
                value={formData.addressLine1}
                onChange={(e) => setFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
                placeholder="Street address, building name"
                required
              />
            </div>

            {/* Address Line 2 */}
            <div>
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input
                id="addressLine2"
                value={formData.addressLine2}
                onChange={(e) => setFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
                placeholder="Apartment, suite, unit, etc."
              />
            </div>

            {/* City and State */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <Label htmlFor="state">State/County</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="State or County"
                />
              </div>
            </div>

            {/* Postal Code and Country */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="postalCode">Postal Code *</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, postalCode: e.target.value }))}
                  placeholder="Postal code"
                  required
                />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Label */}
            <div>
              <Label htmlFor="label">Address Label</Label>
              <Select
                value={formData.label}
                onValueChange={(value) => setFormData(prev => ({ ...prev, label: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a label (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {ADDRESS_LABELS.map((label) => {
                    const IconComponent = label.icon;
                    return (
                      <SelectItem key={label.value} value={label.value}>
                        <div className="flex items-center space-x-2">
                          <IconComponent className="w-4 h-4" />
                          <span>{label.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Instructions */}
            <div>
              <Label htmlFor="instructions">Delivery Instructions</Label>
              <Textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder="Special delivery instructions (optional)"
                rows={3}
              />
            </div>

            {/* Set as Default */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <Label htmlFor="isDefault" className="text-sm font-normal">
                Set as default delivery address
              </Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddingAddress(false);
                  setEditingAddress(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAddressMutation.isPending || updateAddressMutation.isPending}
              >
                {createAddressMutation.isPending || updateAddressMutation.isPending
                  ? 'Saving...'
                  : editingAddress
                  ? 'Update Address'
                  : 'Add Address'
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Address</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this delivery address? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {addressToDelete && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-900">
                {formatAddress(addressToDelete)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => addressToDelete && deleteAddressMutation.mutate(addressToDelete.id)}
              disabled={deleteAddressMutation.isPending}
            >
              {deleteAddressMutation.isPending ? 'Deleting...' : 'Delete Address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}