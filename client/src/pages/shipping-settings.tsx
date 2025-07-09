import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  Truck, 
  MapPin, 
  DollarSign, 
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calculator,
  Globe,
  Search,
  Mail,
  Bell,
  Clock,
  Zap
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import GooglePlacesAutocomplete from '@/components/google-places-autocomplete';

interface ShippingQuote {
  service: string;
  carrier: string;
  price: number;
  deliveryTime: string;
  description: string;
}

interface DropShop {
  id: string;
  name: string;
  address: string;
  distance: number;
  openingHours: string;
}

interface ShippingService {
  id: string;
  name: string;
  description: string;
  carrier: string;
  features: string[];
}

export default function ShippingSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for quote form
  const [quoteForm, setQuoteForm] = useState({
    collectionPostcode: '',
    deliveryPostcode: '',
    weight: '',
    length: '',
    width: '',
    height: '',
    value: '',
    collectionCountry: 'GBR',
    deliveryCountry: 'GBR'
  });

  const [dropShopPostcode, setDropShopPostcode] = useState('');
  
  // State for automation settings
  const [automationSettings, setAutomationSettings] = useState({
    sendOrderDispatchedEmails: true,
    autoMarkFulfilled: false,
    enableTrackingNotifications: true,
    sendDeliveryConfirmations: true
  });

  // Fetch current automation settings
  const { data: currentSettings } = useQuery({
    queryKey: ['/api/shipping/automation-settings'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Update local state when data is fetched
  React.useEffect(() => {
    if (currentSettings) {
      setAutomationSettings(currentSettings);
    }
  }, [currentSettings]);

  // Fetch shipping status
  const { data: shippingStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/shipping/status'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Fetch available countries
  const { data: countriesData } = useQuery({
    queryKey: ['/api/shipping/countries'],
    enabled: shippingStatus?.ready,
    staleTime: 30 * 60 * 1000 // 30 minutes
  });

  // Fetch available services
  const { data: servicesData } = useQuery({
    queryKey: ['/api/shipping/services'],
    enabled: shippingStatus?.ready,
    staleTime: 30 * 60 * 1000 // 30 minutes
  });

  // Get shipping quotes mutation
  const getQuotesMutation = useMutation({
    mutationFn: async (params: typeof quoteForm) => {
      const queryParams = new URLSearchParams(params as any).toString();
      const response = await apiRequest(`/api/shipping/quotes?${queryParams}`);
      return response.quotes;
    },
    onSuccess: () => {
      toast({
        title: "Quotes Retrieved",
        description: "Shipping quotes have been successfully fetched."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Quote Error",
        description: error.message || "Failed to get shipping quotes",
        variant: "destructive"
      });
    }
  });

  // Get drop shops mutation
  const getDropShopsMutation = useMutation({
    mutationFn: async (postcode: string) => {
      const response = await apiRequest(`/api/shipping/drop-shops?postcode=${postcode}&country=GBR`);
      return response.dropShops;
    },
    onSuccess: () => {
      toast({
        title: "Drop Shops Found",
        description: "Local drop-off points have been retrieved."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Drop Shop Error",
        description: error.message || "Failed to find drop shops",
        variant: "destructive"
      });
    }
  });

  // Save automation settings mutation
  const saveAutomationMutation = useMutation({
    mutationFn: async (settings: typeof automationSettings) => {
      return await apiRequest('/api/shipping/automation-settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Shipping automation preferences have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save automation settings.",
        variant: "destructive"
      });
    }
  });

  const handleGetQuotes = async () => {
    if (!quoteForm.collectionPostcode || !quoteForm.deliveryPostcode || !quoteForm.weight || 
        !quoteForm.length || !quoteForm.width || !quoteForm.height || !quoteForm.value) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields to get shipping quotes.",
        variant: "destructive"
      });
      return;
    }

    getQuotesMutation.mutate(quoteForm);
  };

  const handleFindDropShops = async () => {
    if (!dropShopPostcode) {
      toast({
        title: "Missing Postcode",
        description: "Please enter a postcode to find drop shops.",
        variant: "destructive"
      });
      return;
    }

    getDropShopsMutation.mutate(dropShopPostcode);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(price);
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading shipping settings...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center space-x-2">
        <Package className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Shipping Management</h1>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Parcel2Go Integration Status</span>
          </CardTitle>
          <CardDescription>
            Manage your shipping configuration and access to Parcel2Go services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            {shippingStatus?.configured ? (
              <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertCircle className="h-4 w-4 mr-1" />
                Not Configured
              </Badge>
            )}
            
            <Badge variant="secondary">
              {shippingStatus?.environment === 'sandbox' ? 'Sandbox Mode' : 'Production Mode'}
            </Badge>
          </div>

          {!shippingStatus?.configured && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Parcel2Go integration is not configured. Contact support to enable shipping services.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {shippingStatus?.ready && (
        <Tabs defaultValue="automation" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="automation" className="flex items-center space-x-2">
              <Zap className="h-4 w-4" />
              <span>Automation</span>
            </TabsTrigger>
            <TabsTrigger value="quotes" className="flex items-center space-x-2">
              <Calculator className="h-4 w-4" />
              <span>Get Quotes</span>
            </TabsTrigger>
            <TabsTrigger value="dropshops" className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span>Drop Shops</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="flex items-center space-x-2">
              <Truck className="h-4 w-4" />
              <span>Services</span>
            </TabsTrigger>
            <TabsTrigger value="countries" className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <span>Countries</span>
            </TabsTrigger>
          </TabsList>

          {/* Automation Settings Tab */}
          <TabsContent value="automation">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-orange-600" />
                  <span>Configure your Quikpik Account</span>
                </CardTitle>
                <CardDescription>
                  Choose whether to send out your customer emails when you mark your orders as dispatched in Smart Send.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {/* Order Dispatched Emails */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50/50">
                    <div className="flex items-center space-x-3">
                      <Mail className="h-5 w-5 text-blue-600" />
                      <div>
                        <label htmlFor="sendOrderDispatchedEmails" className="font-medium cursor-pointer">
                          Send Order Dispatched Emails
                        </label>
                        <p className="text-sm text-gray-600">
                          Automatically notify customers when orders are marked as shipped
                        </p>
                      </div>
                    </div>
                    <Checkbox
                      id="sendOrderDispatchedEmails"
                      checked={automationSettings.sendOrderDispatchedEmails}
                      onCheckedChange={(checked) => 
                        setAutomationSettings({...automationSettings, sendOrderDispatchedEmails: !!checked})
                      }
                    />
                  </div>

                  {/* Auto Mark Fulfilled */}
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <label htmlFor="autoMarkFulfilled" className="font-medium cursor-pointer">
                          Auto-Mark Orders as Fulfilled
                        </label>
                        <p className="text-sm text-gray-600">
                          Automatically mark orders as fulfilled when tracking shows delivery
                        </p>
                      </div>
                    </div>
                    <Checkbox
                      id="autoMarkFulfilled"
                      checked={automationSettings.autoMarkFulfilled}
                      onCheckedChange={(checked) => 
                        setAutomationSettings({...automationSettings, autoMarkFulfilled: !!checked})
                      }
                    />
                  </div>

                  {/* Tracking Notifications */}
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Bell className="h-5 w-5 text-purple-600" />
                      <div>
                        <label htmlFor="enableTrackingNotifications" className="font-medium cursor-pointer">
                          Enable Tracking Notifications
                        </label>
                        <p className="text-sm text-gray-600">
                          Send SMS/email updates about shipment tracking progress
                        </p>
                      </div>
                    </div>
                    <Checkbox
                      id="enableTrackingNotifications"
                      checked={automationSettings.enableTrackingNotifications}
                      onCheckedChange={(checked) => 
                        setAutomationSettings({...automationSettings, enableTrackingNotifications: !!checked})
                      }
                    />
                  </div>

                  {/* Delivery Confirmations */}
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Clock className="h-5 w-5 text-orange-600" />
                      <div>
                        <label htmlFor="sendDeliveryConfirmations" className="font-medium cursor-pointer">
                          Send Delivery Confirmations
                        </label>
                        <p className="text-sm text-gray-600">
                          Notify customers when packages are successfully delivered
                        </p>
                      </div>
                    </div>
                    <Checkbox
                      id="sendDeliveryConfirmations"
                      checked={automationSettings.sendDeliveryConfirmations}
                      onCheckedChange={(checked) => 
                        setAutomationSettings({...automationSettings, sendDeliveryConfirmations: !!checked})
                      }
                    />
                  </div>
                </div>

                <Button 
                  onClick={() => saveAutomationMutation.mutate(automationSettings)}
                  disabled={saveAutomationMutation.isPending}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8"
                >
                  {saveAutomationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quote Calculator Tab */}
          <TabsContent value="quotes">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Quote Calculator</CardTitle>
                <CardDescription>
                  Get shipping quotes for different carriers and services
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Collection Details */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center space-x-2">
                      <Package className="h-4 w-4" />
                      <span>Collection Details</span>
                    </h3>
                    <GooglePlacesAutocomplete
                      id="collection-address-autocomplete"
                      onAddressSelect={(address) => {
                        const components = address.address_components || [];
                        const getComponent = (types: string[]) => {
                          const component = components.find((comp: any) => 
                            comp.types.some((type: string) => types.includes(type))
                          );
                          return component ? component.long_name : '';
                        };
                        
                        const postcode = getComponent(['postal_code']);
                        if (postcode) {
                          setQuoteForm({ ...quoteForm, collectionPostcode: postcode });
                        }
                      }}
                      placeholder="Enter collection address"
                      label="Collection Address"
                      value={quoteForm.collectionPostcode}
                      className="w-full"
                    />
                  </div>

                  {/* Delivery Details */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center space-x-2">
                      <Truck className="h-4 w-4" />
                      <span>Delivery Details</span>
                    </h3>
                    <GooglePlacesAutocomplete
                      id="delivery-address-autocomplete"
                      onAddressSelect={(address) => {
                        const components = address.address_components || [];
                        const getComponent = (types: string[]) => {
                          const component = components.find((comp: any) => 
                            comp.types.some((type: string) => types.includes(type))
                          );
                          return component ? component.long_name : '';
                        };
                        
                        const postcode = getComponent(['postal_code']);
                        if (postcode) {
                          setQuoteForm({ ...quoteForm, deliveryPostcode: postcode });
                        }
                      }}
                      placeholder="Enter delivery address"
                      label="Delivery Address"
                      value={quoteForm.deliveryPostcode}
                      className="w-full"
                    />
                  </div>
                </div>

                <Separator />

                {/* Parcel Details */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center space-x-2">
                    <Package className="h-4 w-4" />
                    <span>Parcel Dimensions & Value</span>
                  </h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        value={quoteForm.weight}
                        onChange={(e) => setQuoteForm({ ...quoteForm, weight: e.target.value })}
                        placeholder="1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="length">Length (cm)</Label>
                      <Input
                        id="length"
                        type="number"
                        value={quoteForm.length}
                        onChange={(e) => setQuoteForm({ ...quoteForm, length: e.target.value })}
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <Label htmlFor="width">Width (cm)</Label>
                      <Input
                        id="width"
                        type="number"
                        value={quoteForm.width}
                        onChange={(e) => setQuoteForm({ ...quoteForm, width: e.target.value })}
                        placeholder="20"
                      />
                    </div>
                    <div>
                      <Label htmlFor="height">Height (cm)</Label>
                      <Input
                        id="height"
                        type="number"
                        value={quoteForm.height}
                        onChange={(e) => setQuoteForm({ ...quoteForm, height: e.target.value })}
                        placeholder="15"
                      />
                    </div>
                  </div>

                  <div className="w-full md:w-1/2">
                    <Label htmlFor="value">Parcel Value (£)</Label>
                    <Input
                      id="value"
                      type="number"
                      step="0.01"
                      value={quoteForm.value}
                      onChange={(e) => setQuoteForm({ ...quoteForm, value: e.target.value })}
                      placeholder="100.00"
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleGetQuotes}
                  disabled={getQuotesMutation.isPending}
                  className="w-full"
                >
                  {getQuotesMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Getting Quotes...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Get Shipping Quotes
                    </>
                  )}
                </Button>

                {/* Display Quotes */}
                {getQuotesMutation.data && (
                  <div className="space-y-4">
                    <h3 className="font-semibold">Available Quotes</h3>
                    <div className="grid gap-4">
                      {getQuotesMutation.data.map((quote: ShippingQuote, index: number) => (
                        <Card key={index} className="border-l-4 border-l-blue-500">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold">{quote.service}</h4>
                                <p className="text-sm text-gray-600">{quote.carrier}</p>
                                <p className="text-sm text-gray-500 mt-1">{quote.description}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-green-600">
                                  {formatPrice(quote.price)}
                                </div>
                                <p className="text-sm text-gray-500">{quote.deliveryTime}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drop Shops Tab */}
          <TabsContent value="dropshops">
            <Card>
              <CardHeader>
                <CardTitle>Find Drop-Off Points</CardTitle>
                <CardDescription>
                  Locate nearby drop-off points for convenient parcel collection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <Label htmlFor="dropShopPostcode">Postcode</Label>
                    <Input
                      id="dropShopPostcode"
                      value={dropShopPostcode}
                      onChange={(e) => setDropShopPostcode(e.target.value)}
                      placeholder="Enter postcode to find nearby drop shops"
                    />
                  </div>
                  <Button 
                    onClick={handleFindDropShops}
                    disabled={getDropShopsMutation.isPending}
                    className="mt-6"
                  >
                    {getDropShopsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Display Drop Shops */}
                {getDropShopsMutation.data && (
                  <div className="space-y-4">
                    <h3 className="font-semibold">Nearby Drop-Off Points</h3>
                    <div className="grid gap-4">
                      {getDropShopsMutation.data.map((shop: DropShop) => (
                        <Card key={shop.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-semibold">{shop.name}</h4>
                                <p className="text-sm text-gray-600 mt-1">{shop.address}</p>
                                <p className="text-sm text-gray-500 mt-1">{shop.openingHours}</p>
                              </div>
                              <Badge variant="secondary">
                                {shop.distance} miles
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle>Available Shipping Services</CardTitle>
                <CardDescription>
                  View all available shipping services and their features
                </CardDescription>
              </CardHeader>
              <CardContent>
                {servicesData?.services ? (
                  <div className="grid gap-4">
                    {servicesData.services.map((service: ShippingService) => (
                      <Card key={service.id} className="border-l-4 border-l-green-500">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-semibold">{service.name}</h4>
                              <p className="text-sm text-gray-600">{service.carrier}</p>
                            </div>
                            <Badge variant="outline">{service.id}</Badge>
                          </div>
                          <p className="text-sm text-gray-700 mb-3">{service.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {service.features?.map((feature: string, index: number) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {feature}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Truck className="h-12 w-12 mx-auto mb-4" />
                    <p>Loading shipping services...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Countries Tab */}
          <TabsContent value="countries">
            <Card>
              <CardHeader>
                <CardTitle>Supported Countries</CardTitle>
                <CardDescription>
                  Countries available for shipping services
                </CardDescription>
              </CardHeader>
              <CardContent>
                {countriesData?.countries ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {countriesData.countries.map((country: any) => (
                      <Card key={country.isoCode} className="p-3">
                        <div className="flex items-center space-x-3">
                          <Globe className="h-4 w-4 text-blue-600" />
                          <div>
                            <p className="font-medium">{country.name}</p>
                            <p className="text-sm text-gray-500">{country.isoCode}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Globe className="h-12 w-12 mx-auto mb-4" />
                    <p>Loading supported countries...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}