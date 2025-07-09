import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Truck, Clock, Package, Shield, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import GooglePlacesAutocomplete from '@/components/google-places-autocomplete';

interface ShippingQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: number;
    customerName: string;
    customerEmail: string;
    deliveryAddress: string;
    total: number;
  };
  businessAddress: {
    streetAddress: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

interface QuoteData {
  serviceId: string;
  serviceName: string;
  carrierName: string;
  price: number;
  priceExVat: number;
  vat: number;
  transitTime: string;
  collectionType: string;
  deliveryType: string;
  trackingAvailable: boolean;
  insuranceIncluded: boolean;
  description: string;
}

export default function ShippingQuoteModal({ isOpen, onClose, order, businessAddress }: ShippingQuoteModalProps) {
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress);
  const [selectedQuote, setSelectedQuote] = useState<QuoteData | null>(null);
  const [isGettingQuotes, setIsGettingQuotes] = useState(false);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse collection address from business address
  const collectionAddress = {
    contactName: "Business Pickup",
    property: businessAddress.streetAddress || "",
    street: businessAddress.streetAddress || "",
    town: businessAddress.city || "",
    postcode: businessAddress.postalCode || "",
    countryIsoCode: "GBR"
  };

  const getShippingQuotes = async () => {
    if (!deliveryAddress) {
      toast({
        title: "Missing Delivery Address",
        description: "Please enter a delivery address to get shipping quotes.",
        variant: "destructive"
      });
      return;
    }

    setIsGettingQuotes(true);
    try {
      const response = await fetch('/api/shipping/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionAddress,
          deliveryAddress: {
            contactName: order.customerName,
            property: deliveryAddress,
            street: deliveryAddress,
            town: "Customer City", // You can extract from parsed address
            postcode: "CUSTOMER_POSTCODE", // You can extract from parsed address
            countryIsoCode: "GBR"
          },
          parcels: [{
            weight: 2, // Default package weight (kg)
            length: 30, // Default dimensions (cm)
            width: 20,
            height: 15,
            value: order.total // Declared value
          }]
        })
      });

      const data = await response.json();
      if (data.quotes && data.quotes.length > 0) {
        setQuotes(data.quotes);
      } else {
        // Show test quotes when Parcel2Go API is unavailable
        const testQuotes = [
          {
            serviceId: 'test-royal-mail',
            serviceName: 'Royal Mail 48',
            carrierName: 'Royal Mail',
            price: 5.95,
            priceExVat: 4.96,
            vat: 0.99,
            transitTime: '2-3 business days',
            collectionType: 'pickup',
            deliveryType: 'standard',
            trackingAvailable: true,
            insuranceIncluded: false,
            description: 'Standard delivery service with tracking'
          },
          {
            serviceId: 'test-dpd',
            serviceName: 'DPD Next Day',
            carrierName: 'DPD',
            price: 8.50,
            priceExVat: 7.08,
            vat: 1.42,
            transitTime: '1 business day',
            collectionType: 'pickup',
            deliveryType: 'express',
            trackingAvailable: true,
            insuranceIncluded: true,
            description: 'Next day delivery with SMS notifications'
          },
          {
            serviceId: 'test-hermes',
            serviceName: 'Evri Standard',
            carrierName: 'Evri',
            price: 4.25,
            priceExVat: 3.54,
            vat: 0.71,
            transitTime: '3-5 business days',
            collectionType: 'pickup',
            deliveryType: 'standard',
            trackingAvailable: true,
            insuranceIncluded: false,
            description: 'Cost-effective delivery option'
          }
        ];
        setQuotes(testQuotes);
        toast({
          title: "Demo Mode",
          description: "Showing sample shipping quotes (Parcel2Go API unavailable)",
          variant: "default"
        });
      }
    } catch (error) {
      toast({
        title: "Error Getting Quotes",
        description: "Failed to get shipping quotes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGettingQuotes(false);
    }
  };

  const createShippingOrder = useMutation({
    mutationFn: async (quote: QuoteData) => {
      const response = await fetch(`/api/orders/${order.id}/shipping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: quote.serviceId,
          deliveryAddress,
          shippingCost: quote.price
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create shipping order');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Shipping Created",
        description: "Shipping order has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create shipping order.",
        variant: "destructive"
      });
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Truck className="h-5 w-5" />
            <span>Shipping Options for Order #{order.id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div><strong>Customer:</strong> {order.customerName}</div>
              <div><strong>Email:</strong> {order.customerEmail}</div>
              <div><strong>Order Total:</strong> £{order.total}</div>
            </CardContent>
          </Card>

          {/* Addresses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>Collection Address (Your Business)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div>{businessAddress.streetAddress}</div>
                <div>{businessAddress.city}, {businessAddress.postalCode}</div>
                <div>{businessAddress.country}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center space-x-2">
                  <Truck className="h-4 w-4" />
                  <span>Delivery Address</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GooglePlacesAutocomplete
                  id="shipping-delivery-address"
                  onAddressSelect={(address) => {
                    setDeliveryAddress(address.formatted_address);
                  }}
                  placeholder="Enter customer delivery address"
                  label=""
                  value={deliveryAddress.includes('"') ? 
                    (() => {
                      try {
                        const parsed = JSON.parse(deliveryAddress);
                        return parsed.street || parsed.address || deliveryAddress;
                      } catch {
                        return deliveryAddress;
                      }
                    })() : 
                    deliveryAddress
                  }
                  className="w-full"
                />
              </CardContent>
            </Card>
          </div>

          {/* Get Quotes Button */}
          <div className="flex justify-center">
            <Button 
              onClick={getShippingQuotes}
              disabled={isGettingQuotes || !deliveryAddress}
              className="flex items-center space-x-2"
            >
              {isGettingQuotes && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Get Shipping Quotes</span>
            </Button>
          </div>

          {/* Shipping Quotes */}
          {quotes.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Available Shipping Options</h3>
              <div className="grid gap-4">
                {quotes.map((quote, index) => (
                  <Card 
                    key={index} 
                    className={`cursor-pointer transition-all ${
                      selectedQuote?.serviceId === quote.serviceId 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedQuote(quote)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{quote.serviceName}</span>
                            <Badge variant="secondary">{quote.carrierName}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            {quote.description}
                          </div>
                          <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{quote.transitTime}</span>
                            </div>
                            {quote.trackingAvailable && (
                              <div className="flex items-center space-x-1">
                                <Package className="h-3 w-3" />
                                <span>Tracking</span>
                              </div>
                            )}
                            {quote.insuranceIncluded && (
                              <div className="flex items-center space-x-1">
                                <Shield className="h-3 w-3" />
                                <span>Insured</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">£{quote.price.toFixed(2)}</div>
                          <div className="text-xs text-gray-500">
                            (£{quote.priceExVat.toFixed(2)} + £{quote.vat.toFixed(2)} VAT)
                          </div>
                        </div>
                      </div>
                      {selectedQuote?.serviceId === quote.serviceId && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center text-green-600 text-sm">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Selected shipping option
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedQuote && (
                <div className="flex justify-end space-x-3">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => createShippingOrder.mutate(selectedQuote)}
                    disabled={createShippingOrder.isPending}
                    className="flex items-center space-x-2"
                  >
                    {createShippingOrder.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>Create Shipping Order</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}