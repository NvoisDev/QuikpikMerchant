import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Home, Building, Truck, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface FirstTimeAddressSetupProps {
  wholesalerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
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

export function FirstTimeAddressSetup({ wholesalerId, isOpen, onClose, onSuccess }: FirstTimeAddressSetupProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'intro' | 'form' | 'success'>('intro');
  
  const [formData, setFormData] = useState<AddressFormData>({
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United Kingdom",
    label: "home",
    instructions: "",
    isDefault: true, // First address is always default
  });

  // Check if user already has addresses
  const { data: existingAddresses = [] } = useQuery({
    queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`],
    enabled: isOpen,
  });

  // Don't show dialog if user already has addresses
  useEffect(() => {
    if (existingAddresses.length > 0) {
      onClose();
    }
  }, [existingAddresses, onClose]);

  // Create address mutation
  const createAddressMutation = useMutation({
    mutationFn: async (addressData: AddressFormData) => {
      return await apiRequest('/api/customer/delivery-addresses', {
        method: 'POST',
        body: JSON.stringify({
          wholesalerId,
          ...addressData,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer/delivery-addresses/${wholesalerId}`] });
      setStep('success');
      toast({
        title: "Address Added Successfully",
        description: "Your default delivery address has been set up.",
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

    createAddressMutation.mutate(formData);
  };

  const handleComplete = () => {
    onSuccess?.();
    onClose();
    setStep('intro'); // Reset for next time
  };

  const handleSkip = () => {
    onClose();
  };

  // Don't render if user already has addresses
  if (existingAddresses.length > 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}> {/* Prevent closing by clicking overlay */}
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" closeDisabled>
        {step === 'intro' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <MapPin className="w-6 h-6 text-green-600" />
                <span>Set Up Your Delivery Address</span>
              </DialogTitle>
              <DialogDescription className="text-base leading-relaxed">
                To ensure smooth delivery of your orders, let's set up your default delivery address first. You can add more addresses later if needed.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">Why set up a delivery address?</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Faster checkout process</li>
                  <li>• Accurate delivery quotes</li>
                  <li>• Save multiple addresses for different locations</li>
                  <li>• Track your order deliveries easily</li>
                </ul>
              </div>
            </div>
            
            <DialogFooter className="space-x-2">
              <Button variant="outline" onClick={handleSkip}>
                Skip for Now
              </Button>
              <Button onClick={() => setStep('form')} className="bg-green-600 hover:bg-green-700">
                Add My Address
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle>Add Your Default Address</DialogTitle>
              <DialogDescription>
                This will be your default delivery address for future orders.
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
                <Label htmlFor="label">Address Type</Label>
                <Select
                  value={formData.label}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, label: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
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
                <Label htmlFor="instructions">Delivery Instructions (Optional)</Label>
                <Textarea
                  id="instructions"
                  value={formData.instructions}
                  onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Any special delivery instructions..."
                  rows={2}
                />
              </div>

              <DialogFooter className="space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('intro')}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={createAddressMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createAddressMutation.isPending ? 'Saving...' : 'Save Address'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <span>Address Set Up Successfully!</span>
              </DialogTitle>
              <DialogDescription className="text-base">
                Your default delivery address has been saved. You can now enjoy seamless checkout and delivery.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">What's next?</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Start shopping with faster checkout</li>
                  <li>• Add more addresses in your account settings</li>
                  <li>• Set different addresses as default for specific suppliers</li>
                </ul>
              </div>
            </div>
            
            <DialogFooter>
              <Button onClick={handleComplete} className="w-full bg-green-600 hover:bg-green-700">
                Continue Shopping
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}