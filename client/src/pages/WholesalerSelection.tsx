import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Store, Calendar, ExternalLink, Building2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";

interface WholesalerRelationship {
  wholesaler: {
    id: string;
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    logoUrl?: string;
    logoType: string;
    storeTagline: string;
  };
  relationship: {
    id: number;
    status: string;
    invitedAt: string;
    acceptedAt?: string;
    lastAccessedAt?: string;
    customPricing: boolean;
    paymentTerms: string;
  };
}

export default function WholesalerSelection() {
  const [, setLocation] = useLocation();
  const [selectedWholesaler, setSelectedWholesaler] = useState<string | null>(null);

  const { data: wholesalers = [], isLoading } = useQuery<WholesalerRelationship[]>({
    queryKey: ['/api/customer/wholesalers'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleWholesalerSelection = async (wholesalerId: string) => {
    setSelectedWholesaler(wholesalerId);
    
    try {
      // Update last accessed time
      await fetch(`/api/customer/update-last-accessed/${wholesalerId}`, {
        method: 'POST'
      });
      
      // Redirect to customer portal for this wholesaler
      setLocation(`/customer-portal/${wholesalerId}`);
    } catch (error) {
      console.error('Error updating last accessed:', error);
      // Still redirect even if update fails
      setLocation(`/customer-portal/${wholesalerId}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getWholesalerLogo = (wholesaler: any) => {
    console.log('🔧 WholesalerSelection - Logo data for', wholesaler.businessName, ':', {
      logoUrl: !!wholesaler.logoUrl,
      logoType: wholesaler.logoType,
      logoUrlLength: wholesaler.logoUrl?.length || 0
    });
    
    // Priority 1: Custom uploaded logo
    if (wholesaler.logoType === 'custom' && wholesaler.logoUrl) {
      return (
        <img 
          src={wholesaler.logoUrl} 
          alt={`${wholesaler.businessName} logo`}
          className="w-16 h-16 object-cover rounded-lg border"
        />
      );
    }
    
    // Priority 2: Business name initials for logoType === 'business'
    if (wholesaler.logoType === 'business' && wholesaler.businessName) {
      const initials = wholesaler.businessName
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
      
      return (
        <div className="w-16 h-16 bg-emerald-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">{initials}</span>
        </div>
      );
    }
    
    // Priority 3: Any logoUrl (fallback)
    if (wholesaler.logoUrl) {
      return (
        <img 
          src={wholesaler.logoUrl} 
          alt={`${wholesaler.businessName} logo`}
          className="w-16 h-16 object-cover rounded-lg border"
        />
      );
    }
    
    // Priority 4: Default to business name initials
    if (wholesaler.businessName) {
      const initials = wholesaler.businessName
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
      
      return (
        <div className="w-16 h-16 bg-emerald-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">{initials}</span>
        </div>
      );
    }
    
    // Priority 5: Name initials fallback
    const nameInitials = `${wholesaler.firstName?.charAt(0) || ''}${wholesaler.lastName?.charAt(0) || ''}`;
    return (
      <div className="w-16 h-16 bg-emerald-600 rounded-lg flex items-center justify-center">
        <span className="text-white font-bold text-lg">{nameInitials}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-gray-600">Loading your wholesale connections...</p>
        </div>
      </div>
    );
  }

  if (wholesalers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <Store className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No Wholesale Connections</h1>
          <p className="text-gray-600 mb-6">
            You don't have access to any wholesale platforms yet. Contact your wholesaler to get invited.
          </p>
          <Button onClick={() => setLocation('/login')}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  if (wholesalers.length === 1) {
    // If only one wholesaler, redirect directly
    const wholesaler = wholesalers[0];
    handleWholesalerSelection(wholesaler.wholesaler.id);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-gray-600">Redirecting to {wholesaler.wholesaler.businessName}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Your Wholesaler</h1>
            <p className="text-gray-600">
              You have access to {wholesalers.length} wholesale platforms. Choose one to continue.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wholesalers.map((relationship) => (
              <Card 
                key={relationship.wholesaler.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-emerald-200"
                onClick={() => handleWholesalerSelection(relationship.wholesaler.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {getWholesalerLogo(relationship.wholesaler)}
                      <div>
                        <CardTitle className="text-lg">
                          {relationship.wholesaler.businessName}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {relationship.wholesaler.firstName} {relationship.wholesaler.lastName}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={relationship.relationship.status === 'active' ? 'default' : 'secondary'}>
                      {relationship.relationship.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {relationship.wholesaler.storeTagline && (
                    <p className="text-sm text-gray-600 mb-3 italic">
                      "{relationship.wholesaler.storeTagline}"
                    </p>
                  )}
                  
                  <div className="space-y-2 text-sm text-gray-500">
                    {relationship.relationship.customPricing && (
                      <div className="flex items-center">
                        <Badge variant="outline" className="text-xs">
                          Custom Pricing
                        </Badge>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-3 h-3" />
                      <span>Payment Terms: {relationship.relationship.paymentTerms}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Connected: {formatDate(relationship.relationship.acceptedAt || relationship.relationship.invitedAt)}
                      </span>
                    </div>
                    
                    {relationship.relationship.lastAccessedAt && (
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-3 h-3" />
                        <span>
                          Last visited: {formatDate(relationship.relationship.lastAccessedAt)}
                        </span>
                      </div>
                    )}
                  </div>

                  <Button 
                    className="w-full mt-4" 
                    disabled={selectedWholesaler === relationship.wholesaler.id}
                  >
                    {selectedWholesaler === relationship.wholesaler.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <Store className="w-4 h-4 mr-2" />
                        Access Store
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-gray-500 mb-4">
              Need access to another wholesaler? Contact them to send you an invitation.
            </p>
            <Button variant="outline" onClick={() => setLocation('/logout')}>
              Switch Account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}