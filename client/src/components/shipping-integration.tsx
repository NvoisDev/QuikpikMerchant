import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  Truck, 
  MapPin, 
  DollarSign, 
  Calendar,
  Eye,
  Download,
  ExternalLink,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import GooglePlacesAutocomplete from '@/components/google-places-autocomplete';

interface Order {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  status: string;
  total: number;
  shippingOrderId?: string;
  shippingStatus?: string;
  shippingTotal?: string;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
}

interface ShippingIntegrationProps {
  order: Order;
}

interface ShippingQuote {
  service: string;
  carrier: string;
  price: number;
  deliveryTime: string;
  description: string;
}

interface ParcelInfo {
  weight: number;
  length: number;
  width: number;
  height: number;
  value: number;
  contents: string;
}

export default function ShippingIntegration({ order }: ShippingIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for shipping form
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<'quotes' | 'confirm' | 'create'>('quotes');
  const [selectedQuote, setSelectedQuote] = useState<ShippingQuote | null>(null);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [collectionDate, setCollectionDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState({
    property: '',
    street: '',
    town: '',
    county: '',
    postcode: '',
    countryIsoCode: 'GBR'
  });
  
  const [collectionAddress, setCollectionAddress] = useState({
    property: '',
    street: '',
    town: '',
    county: '',
    postcode: '',
    countryIsoCode: 'GBR'
  });
  
  // Default parcel information (can be customized)
  const [parcelInfo, setParcelInfo] = useState<ParcelInfo>({
    weight: 1.0,
    length: 30,
    width: 20,
    height: 15,
    value: parseFloat(order.total.toString()),
    contents: 'Wholesale products'
  });

  // Get shipping quotes mutation
  const getQuotesMutation = useMutation({
    mutationFn: async () => {
      const params = {
        collectionPostcode: collectionAddress.postcode || 'SW1A 1AA', // Use collection address or default
        deliveryPostcode: deliveryAddress.postcode,
        weight: parcelInfo.weight.toString(),
        length: parcelInfo.length.toString(),
        width: parcelInfo.width.toString(),
        height: parcelInfo.height.toString(),
        value: parcelInfo.value.toString(),
        collectionCountry: collectionAddress.countryIsoCode || 'GBR',
        deliveryCountry: deliveryAddress.countryIsoCode
      };
      
      const queryParams = new URLSearchParams(params).toString();
      const response = await apiRequest(`/api/shipping/quotes?${queryParams}`);
      return response.quotes;
    },
    onSuccess: (data) => {
      setQuotes(data);
      setCurrentStep('confirm');
      toast({
        title: "Quotes Retrieved",
        description: "Available shipping options have been loaded."
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

  // Create shipping order mutation
  const createShippingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQuote) throw new Error('No shipping service selected');
      
      const shippingOrderData = {
        orderId: order.id,
        service: selectedQuote.service,
        customerDetails: {
          name: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone,
          firstName: order.customerName.split(' ')[0],
          lastName: order.customerName.split(' ').slice(1).join(' ')
        },
        deliveryAddress,
        parcels: [{
          weight: parcelInfo.weight,
          length: parcelInfo.length,
          width: parcelInfo.width,
          height: parcelInfo.height,
          value: parcelInfo.value,
          contents: parcelInfo.contents
        }],
        collectionDate: collectionDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      return await apiRequest('/api/shipping/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shippingOrderData)
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Shipping Order Created",
        description: "Your shipping order has been successfully created with Parcel2Go."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      setIsOpen(false);
      setCurrentStep('quotes');
    },
    onError: (error: any) => {
      toast({
        title: "Shipping Error",
        description: error.message || "Failed to create shipping order",
        variant: "destructive"
      });
    }
  });

  // Track shipment mutation
  const trackShipmentMutation = useMutation({
    mutationFn: async () => {
      if (!order.shippingOrderId) throw new Error('No shipping order ID available');
      
      return await apiRequest(`/api/shipping/track/${order.shippingOrderId}`);
    },
    onSuccess: (data) => {
      toast({
        title: "Tracking Information",
        description: "Latest tracking information has been retrieved."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Tracking Error",
        description: error.message || "Failed to get tracking information",
        variant: "destructive"
      });
    }
  });

  const handleDeliveryAddressSelect = (address: any) => {
    const components = address.address_components || [];
    
    const getComponent = (types: string[]) => {
      const component = components.find((comp: any) => 
        comp.types.some((type: string) => types.includes(type))
      );
      return component ? component.long_name : '';
    };

    setDeliveryAddress({
      property: getComponent(['street_number']) || '1',
      street: getComponent(['route']) || '',
      town: getComponent(['locality', 'postal_town']) || '',
      county: getComponent(['administrative_area_level_2']) || '',
      postcode: getComponent(['postal_code']) || '',
      countryIsoCode: getComponent(['country']) === 'United Kingdom' ? 'GBR' : 'GBR'
    });
  };

  const handleCollectionAddressSelect = (address: any) => {
    const components = address.address_components || [];
    
    const getComponent = (types: string[]) => {
      const component = components.find((comp: any) => 
        comp.types.some((type: string) => types.includes(type))
      );
      return component ? component.long_name : '';
    };

    setCollectionAddress({
      property: getComponent(['street_number']) || '1',
      street: getComponent(['route']) || '',
      town: getComponent(['locality', 'postal_town']) || '',
      county: getComponent(['administrative_area_level_2']) || '',
      postcode: getComponent(['postal_code']) || '',
      countryIsoCode: getComponent(['country']) === 'United Kingdom' ? 'GBR' : 'GBR'
    });
  };

  const handleGetQuotes = () => {
    if (!collectionAddress.postcode && !deliveryAddress.postcode) {
      toast({
        title: "Missing Addresses",
        description: "Please enter both collection and delivery addresses to get shipping quotes.",
        variant: "destructive"
      });
      return;
    }
    if (!collectionAddress.postcode) {
      toast({
        title: "Missing Collection Address",
        description: "Please enter your business/warehouse address for pickup.",
        variant: "destructive"
      });
      return;
    }
    if (!deliveryAddress.postcode) {
      toast({
        title: "Missing Delivery Address",
        description: "Please enter the customer's delivery address.",
        variant: "destructive"
      });
      return;
    }
    getQuotesMutation.mutate();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(price);
  };

  const getShippingStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'created':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Created</Badge>;
      case 'paid':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'dispatched':
        return <Badge variant="default" className="bg-blue-100 text-blue-800"><Truck className="h-3 w-3 mr-1" />Dispatched</Badge>;
      case 'delivered':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Delivered</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // If order already has shipping info, show status and actions
  if (order.shippingOrderId) {
    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center space-x-2">
              <Package className="h-4 w-4" />
              <span>Shipping Information</span>
            </span>
            {order.shippingStatus && getShippingStatusBadge(order.shippingStatus)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Order ID:</span>
              <p className="text-gray-600">{order.shippingOrderId}</p>
            </div>
            {order.shippingTotal && (
              <div>
                <span className="font-medium">Shipping Cost:</span>
                <p className="text-gray-600">{formatPrice(parseFloat(order.shippingTotal))}</p>
              </div>
            )}
          </div>
          
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => trackShipmentMutation.mutate()}
              disabled={trackShipmentMutation.isPending}
            >
              {trackShipmentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="ml-1">Track</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/shipping/labels/${order.id}`, '_blank')}
            >
              <Download className="h-4 w-4" />
              <span className="ml-1">Labels</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no shipping info, show create shipping button
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Package className="h-4 w-4 mr-2" />
          Create Shipping Label
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Truck className="h-5 w-5" />
            <span>Create Shipping Order</span>
          </DialogTitle>
          <DialogDescription>
            Generate shipping labels and arrange collection for order #{order.id}
          </DialogDescription>
        </DialogHeader>

        {currentStep === 'quotes' && (
          <div className="space-y-6">
            {/* Collection Address */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>Collection Address (Pick-up)</span>
              </h3>
              
              <GooglePlacesAutocomplete
                onAddressSelect={handleCollectionAddressSelect}
                placeholder="Enter warehouse/business address for pickup"
                label="Collection Address"
                required
              />
              
              {collectionAddress.postcode && (
                <div className="p-3 bg-blue-50 rounded-md text-sm">
                  <p><strong>Collection:</strong> {collectionAddress.property} {collectionAddress.street}</p>
                  <p><strong>Town:</strong> {collectionAddress.town} {collectionAddress.county}</p>
                  <p><strong>Postcode:</strong> {collectionAddress.postcode}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Delivery Address */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>Delivery Address</span>
              </h3>
              
              <GooglePlacesAutocomplete
                onAddressSelect={handleDeliveryAddressSelect}
                placeholder="Enter full delivery address"
                label="Delivery Address"
                required
              />
              
              {deliveryAddress.postcode && (
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  <p><strong>Address:</strong> {deliveryAddress.property} {deliveryAddress.street}</p>
                  <p><strong>Town:</strong> {deliveryAddress.town} {deliveryAddress.county}</p>
                  <p><strong>Postcode:</strong> {deliveryAddress.postcode}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Parcel Information */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center space-x-2">
                <Package className="h-4 w-4" />
                <span>Parcel Details</span>
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    value={parcelInfo.weight}
                    onChange={(e) => setParcelInfo({ ...parcelInfo, weight: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="length">Length (cm)</Label>
                  <Input
                    id="length"
                    type="number"
                    value={parcelInfo.length}
                    onChange={(e) => setParcelInfo({ ...parcelInfo, length: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="width">Width (cm)</Label>
                  <Input
                    id="width"
                    type="number"
                    value={parcelInfo.width}
                    onChange={(e) => setParcelInfo({ ...parcelInfo, width: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={parcelInfo.height}
                    onChange={(e) => setParcelInfo({ ...parcelInfo, height: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="value">Declared Value (£)</Label>
                  <Input
                    id="value"
                    type="number"
                    step="0.01"
                    value={parcelInfo.value}
                    onChange={(e) => setParcelInfo({ ...parcelInfo, value: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="contents">Contents Description</Label>
                  <Input
                    id="contents"
                    value={parcelInfo.contents}
                    onChange={(e) => setParcelInfo({ ...parcelInfo, contents: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <Button 
              onClick={handleGetQuotes}
              disabled={getQuotesMutation.isPending || !deliveryAddress.postcode || !collectionAddress.postcode}
              className="w-full"
            >
              {getQuotesMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Getting Quotes...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Get Shipping Quotes
                </>
              )}
            </Button>
          </div>
        )}

        {currentStep === 'confirm' && quotes.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Select Shipping Service</h3>
              <Button variant="outline" size="sm" onClick={() => setCurrentStep('quotes')}>
                Back to Address
              </Button>
            </div>

            <div className="space-y-3">
              {quotes.map((quote, index) => (
                <Card 
                  key={index} 
                  className={`cursor-pointer transition-all ${
                    selectedQuote === quote ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedQuote(quote)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold">{quote.service}</h4>
                        <p className="text-sm text-gray-600">{quote.carrier}</p>
                        <p className="text-sm text-gray-500 mt-1">{quote.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600">
                          {formatPrice(quote.price)}
                        </div>
                        <p className="text-sm text-gray-500">{quote.deliveryTime}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Collection Date */}
            <div>
              <Label htmlFor="collectionDate">Collection Date (Optional)</Label>
              <Input
                id="collectionDate"
                type="date"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-gray-500 mt-1">
                If not specified, collection will be scheduled for tomorrow
              </p>
            </div>

            <Button 
              onClick={() => createShippingMutation.mutate()}
              disabled={createShippingMutation.isPending || !selectedQuote}
              className="w-full"
            >
              {createShippingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Shipping Order...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Create Shipping Order ({selectedQuote ? formatPrice(selectedQuote.price) : ''})
                </>
              )}
            </Button>
          </div>
        )}

        {quotes.length === 0 && currentStep === 'confirm' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No shipping quotes available for this destination. Please check the delivery address and try again.
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}