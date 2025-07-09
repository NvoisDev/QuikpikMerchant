import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Package, 
  Truck, 
  MapPin, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  Search,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { SHIPPING_STATUS_LABELS, SHIPPING_STATUS_COLORS } from '@shared/tracking-schema';

interface TrackingEvent {
  id: string;
  timestamp: string;
  status: string;
  location: string;
  description: string;
  carrier?: string;
}

interface TrackedOrder {
  id: number;
  customerName: string;
  customerEmail: string;
  trackingNumber?: string;
  carrier: string;
  shippingStatus: string;
  estimatedDelivery?: string;
  total: string;
  deliveryAddress: string;
  events: TrackingEvent[];
  lastUpdated: string;
  createdAt: string;
}

export default function ShippingTracking() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<TrackedOrder | null>(null);

  const { data: trackedOrders = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/shipping/tracked-orders'],
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Auto-refresh every minute
  });

  const { data: trackingDetails, isLoading: isLoadingDetails, refetch: refetchDetails } = useQuery({
    queryKey: ['/api/shipping/tracking', selectedOrder?.id],
    enabled: !!selectedOrder,
    staleTime: 15000, // 15 seconds for real-time tracking
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const filteredOrders = trackedOrders.filter((order: TrackedOrder) =>
    order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.trackingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.id.toString().includes(searchTerm)
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="h-4 w-4" />;
      case 'exception':
      case 'returned':
        return <AlertCircle className="h-4 w-4" />;
      case 'out_for_delivery':
        return <Truck className="h-4 w-4" />;
      case 'in_transit':
        return <Package className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return 'No delivery address provided';
    try {
      const parsed = JSON.parse(address);
      if (parsed.street || parsed.town || parsed.postcode) {
        return `${parsed.street || ''}, ${parsed.town || ''}, ${parsed.postcode || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',');
      }
      return address;
    } catch {
      return address;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shipping Tracking</h1>
          <p className="text-muted-foreground">Real-time tracking for all your orders</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh All
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries({
          'In Transit': trackedOrders.filter((o: TrackedOrder) => o.shippingStatus === 'in_transit').length,
          'Out for Delivery': trackedOrders.filter((o: TrackedOrder) => o.shippingStatus === 'out_for_delivery').length,
          'Delivered': trackedOrders.filter((o: TrackedOrder) => o.shippingStatus === 'delivered').length,
          'Exceptions': trackedOrders.filter((o: TrackedOrder) => ['exception', 'returned'].includes(o.shippingStatus)).length,
        }).map(([label, count]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Tracked Orders ({filteredOrders.length})
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Loading orders...
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No tracked orders found
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredOrders.map((order: TrackedOrder) => (
                      <div
                        key={order.id}
                        className={`p-4 border-l-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedOrder?.id === order.id 
                            ? 'bg-blue-50 border-l-blue-500' 
                            : 'border-l-transparent'
                        }`}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">Order #{order.id}</div>
                          <Badge 
                            variant="secondary" 
                            className={`${SHIPPING_STATUS_COLORS[order.shippingStatus as keyof typeof SHIPPING_STATUS_COLORS] || 'text-gray-600 bg-gray-50'}`}
                          >
                            <span className="flex items-center gap-1">
                              {getStatusIcon(order.shippingStatus)}
                              {SHIPPING_STATUS_LABELS[order.shippingStatus as keyof typeof SHIPPING_STATUS_LABELS] || order.shippingStatus}
                            </span>
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div className="font-medium">{order.customerName}</div>
                          <div className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {order.carrier}
                          </div>
                          {order.trackingNumber && (
                            <div className="font-mono text-xs">
                              {order.trackingNumber}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(order.createdAt), 'MMM dd, HH:mm')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Tracking Details */}
        <div className="lg:col-span-2">
          {selectedOrder ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Order #{selectedOrder.id} Tracking
                  </CardTitle>
                  <div className="flex gap-2">
                    {selectedOrder.trackingNumber && (
                      <Button variant="outline" size="sm" className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Track on {selectedOrder.carrier}
                      </Button>
                    )}
                    <Button onClick={() => refetchDetails()} variant="outline" size="sm" className="gap-1">
                      <RefreshCw className="h-4 w-4" />
                      Update
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Order Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Customer Information</h3>
                    <div className="space-y-1 text-sm">
                      <div><strong>Name:</strong> {selectedOrder.customerName}</div>
                      <div><strong>Email:</strong> {selectedOrder.customerEmail}</div>
                      <div><strong>Order Total:</strong> £{selectedOrder.total}</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Shipping Information</h3>
                    <div className="space-y-1 text-sm">
                      <div><strong>Carrier:</strong> {selectedOrder.carrier}</div>
                      {selectedOrder.trackingNumber && (
                        <div><strong>Tracking:</strong> <span className="font-mono">{selectedOrder.trackingNumber}</span></div>
                      )}
                      {selectedOrder.estimatedDelivery && (
                        <div><strong>Estimated Delivery:</strong> {format(new Date(selectedOrder.estimatedDelivery), 'MMM dd, yyyy')}</div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Delivery Address */}
                <div>
                  <h3 className="font-semibold mb-2">Delivery Address</h3>
                  <div className="text-sm p-3 bg-gray-50 rounded-lg">
                    {formatAddress(selectedOrder.deliveryAddress)}
                  </div>
                </div>

                <Separator />

                {/* Tracking Timeline */}
                <div>
                  <h3 className="font-semibold mb-4">Tracking History</h3>
                  {isLoadingDetails ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading tracking details...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(trackingDetails?.events || selectedOrder.events || []).length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No tracking events available yet</p>
                          <p className="text-xs mt-1">Events will appear when shipping begins</p>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                          {(trackingDetails?.events || selectedOrder.events || []).map((event: TrackingEvent, index: number) => (
                            <div key={event.id || index} className="relative flex items-start space-x-4 pb-4">
                              <div className="relative z-10 flex items-center justify-center w-8 h-8 bg-white border-2 border-gray-300 rounded-full">
                                {getStatusIcon(event.status)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium">{event.description}</p>
                                  <time className="text-xs text-muted-foreground">
                                    {format(new Date(event.timestamp), 'MMM dd, HH:mm')}
                                  </time>
                                </div>
                                {event.location && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    📍 {event.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[600px]">
                <div className="text-center text-muted-foreground">
                  <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Select an Order</h3>
                  <p>Choose an order from the list to view detailed tracking information</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}