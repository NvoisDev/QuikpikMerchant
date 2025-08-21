import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { User, Phone, Mail, Building } from 'lucide-react';

interface CustomerProfileSettingsProps {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phoneNumber?: string;
    businessName?: string;
  };
  onProfileUpdate?: (updatedCustomer: any) => void;
}

export function CustomerProfileSettings({ customer, onProfileUpdate }: CustomerProfileSettingsProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    email: customer.email || '',
    phoneNumber: customer.phoneNumber || '',
    businessName: customer.businessName || ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Filter out empty values and unchanged fields
      const updates: any = {};
      if (formData.firstName && formData.firstName !== customer.firstName) {
        updates.firstName = formData.firstName;
      }
      if (formData.lastName && formData.lastName !== customer.lastName) {
        updates.lastName = formData.lastName;
      }
      if (formData.email && formData.email !== customer.email) {
        updates.email = formData.email;
      }
      if (formData.phoneNumber && formData.phoneNumber !== customer.phoneNumber) {
        updates.phoneNumber = formData.phoneNumber;
      }
      if (formData.businessName && formData.businessName !== customer.businessName) {
        updates.businessName = formData.businessName;
      }

      if (Object.keys(updates).length === 0) {
        toast({
          title: "No Changes",
          description: "No changes were made to your profile.",
        });
        return;
      }

      const response = await apiRequest("PATCH", `/api/customer/update-profile/${customer.id}`, updates);
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Profile Updated",
          description: result.message,
        });

        // Call the callback to update parent component
        if (onProfileUpdate) {
          onProfileUpdate(result.customer);
        }
      } else {
        throw new Error(result.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
        <CardDescription>
          Update your personal information. All your wholesalers will be automatically notified of any changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Enter your first name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Enter your last name"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Enter your email address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Number
            </Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              placeholder="Enter your phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessName" className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Business Name
            </Label>
            <Input
              id="businessName"
              value={formData.businessName}
              onChange={(e) => handleInputChange('businessName', e.target.value)}
              placeholder="Enter your business name"
            />
          </div>

          <div className="pt-4">
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Updating Profile..." : "Update Profile"}
            </Button>
          </div>

          <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
            <strong>Automatic Notifications:</strong> When you update your profile, all wholesalers you work with will be automatically notified of the changes. This keeps their records current and ensures smooth business operations.
          </div>
        </form>
      </CardContent>
    </Card>
  );
}