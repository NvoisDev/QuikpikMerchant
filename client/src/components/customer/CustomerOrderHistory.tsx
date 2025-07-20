import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Clock, Check, Truck, MapPin, Calendar, ShoppingBag, Eye, User, Phone, Mail, CreditCard, FileText, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, useMemo } from "react";

interface CustomerOrderHistoryProps {
  wholesalerId: string;
  customerPhone: string;
}

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface Order {
  id: number;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
  platformFee: string;
  subtotal: string;
  items: OrderItem[];
  wholesaler: {
    businessName: string;
    firstName: string;
    lastName: string;
  };
  fulfillmentType: string;
  deliveryCarrier: string;
  shippingTotal: string;
  shippingStatus: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  orderNotes?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  createdAt: string;
  updatedAt: string;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'confirmed':
      return 'bg-blue-100 text-blue-800';
    case 'processing':
      return 'bg-purple-100 text-purple-800';
    case 'fulfilled':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return <Clock className="h-3 w-3" />;
    case 'confirmed':
      return <Check className="h-3 w-3" />;
    case 'processing':
      return <Package className="h-3 w-3" />;
    case 'fulfilled':
      return <ShoppingBag className="h-3 w-3" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
};

const formatCurrency = (amount: string | number) => {
  if (!amount || amount === "0" || isNaN(Number(amount))) {
    return "£0.00";
  }
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `£${numAmount.toFixed(2)}`;
};

const OrderDetailsModal = ({ order }: { order: Order }) => {
  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center space-x-2">
          <Package className="h-5 w-5" />
          <span>Order Details - {order.orderNumber}</span>
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        {/* Order Summary */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-lg">Order Summary</h3>
              <p className="text-sm text-gray-600">From {order.wholesaler.businessName}</p>
            </div>
            <Badge className={getStatusColor(order.status)}>
              {getStatusIcon(order.status)}
              <span className="ml-1 capitalize">{order.status}</span>
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Order Date:</span>
              <p className="font-medium">{format(new Date(order.date), 'MMM d, yyyy \'at\' h:mm a')}</p>
            </div>
            <div>
              <span className="text-gray-600">Payment Status:</span>
              <p className="font-medium capitalize">{order.paymentStatus || 'Paid'}</p>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center">
            <ShoppingBag className="h-4 w-4 mr-2" />
            Items Ordered
          </h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium">{item.productName}</h4>
                  <p className="text-sm text-gray-600">
                    {item.quantity} units × {formatCurrency(item.unitPrice)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(item.total)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Information */}
        {(order.customerName || order.customerEmail || order.customerPhone) && (
          <div>
            <h3 className="font-semibold mb-3 flex items-center">
              <User className="h-4 w-4 mr-2" />
              Customer Information
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              {order.customerName && (
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{order.customerName}</span>
                </div>
              )}
              {order.customerEmail && (
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{order.customerEmail}</span>
                </div>
              )}
              {order.customerPhone && (
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{order.customerPhone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delivery Information */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center">
            <Truck className="h-4 w-4 mr-2" />
            Delivery Information
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Fulfillment Type:</span>
              <span className="font-medium capitalize">{order.fulfillmentType}</span>
            </div>
            {order.deliveryCarrier && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Delivery Carrier:</span>
                <span className="font-medium">{order.deliveryCarrier}</span>
              </div>
            )}
            {order.customerAddress && (
              <div>
                <span className="text-gray-600 text-sm">Delivery Address:</span>
                <p className="font-medium text-sm mt-1">{order.customerAddress}</p>
              </div>
            )}
            {order.shippingTotal && parseFloat(order.shippingTotal) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping Status:</span>
                <span className="font-medium capitalize">{order.shippingStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Information */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center">
            <CreditCard className="h-4 w-4 mr-2" />
            Payment Breakdown
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.shippingTotal && parseFloat(order.shippingTotal) > 0 && (
              <div className="flex justify-between text-sm">
                <span>Shipping:</span>
                <span>{formatCurrency(order.shippingTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Platform Fee:</span>
              <span>{formatCurrency(order.platformFee)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base border-t pt-2">
              <span>Total Paid:</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Order Notes */}
        {order.orderNotes && (
          <div>
            <h3 className="font-semibold mb-3 flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              Order Notes
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm">{order.orderNotes}</p>
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );
};

export function CustomerOrderHistory({ wholesalerId, customerPhone }: CustomerOrderHistoryProps) {
  const { data: orders, isLoading, error } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone],
    queryFn: async () => {
      // Encode the phone number properly for URL
      const encodedPhone = encodeURIComponent(customerPhone);
      console.log('Fetching customer orders:', { wholesalerId, customerPhone, encodedPhone });
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}`);
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You must be added to this wholesaler\'s customer list to view orders');
        }
        throw new Error('Failed to fetch order history');
      }
      const data = await response.json();
      console.log('Customer orders response:', data);
      console.log('Customer orders response type:', typeof data);
      console.log('Customer orders response length:', Array.isArray(data) ? data.length : 'Not an array');
      return data;
    },
    enabled: !!wholesalerId && !!customerPhone,
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const isAccessDenied = error.message.includes('customer list');
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            {isAccessDenied ? (
              <div className="space-y-3">
                <div className="text-amber-600 bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <p className="font-medium mb-2">Access Required</p>
                  <p className="text-sm">
                    You need to be added to this wholesaler's customer list to view your order history. 
                    Please contact them to register your account.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">
                Unable to load order history. Please try again later.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  console.log('CustomerOrderHistory render - orders data:', { orders, isLoading, error });
  console.log('CustomerOrderHistory render - orders type:', typeof orders);
  console.log('CustomerOrderHistory render - orders length:', Array.isArray(orders) ? orders.length : 'Not an array');
  console.log('CustomerOrderHistory render - orders first item:', Array.isArray(orders) && orders.length > 0 ? orders[0] : 'No first item');
  
  if (!orders || orders.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <ShoppingBag className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg mb-2">No orders yet</p>
            <p className="text-gray-400">Your order history will appear here once you place your first order.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Package className="h-5 w-5" />
          <span>Order History</span>
          <Badge variant="secondary" className="ml-2">
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {orders.map((order: Order, index: number) => {
            console.log(`Rendering order ${index}:`, order);
            return (
            <Card key={order.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  {/* Left side - Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="text-sm font-semibold">{order.orderNumber}</div>
                      <Badge className={`${getStatusColor(order.status)} text-xs`}>
                        {getStatusIcon(order.status)}
                        <span className="ml-1 capitalize">{order.status}</span>
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600 mb-2 flex items-center space-x-2">
                      <span>From</span>
                      <Badge variant="outline" className="text-xs px-2 py-0.5">
                        {order.wholesaler?.businessName || 'Unknown Business'}
                      </Badge>
                    </div>
                    
                    {/* Compact Items List */}
                    <div className="space-y-1">
                      {order.items.map((item, index) => (
                        <div key={index} className="text-xs text-gray-700">
                          <span className="font-medium">{item.productName}</span>
                          <span className="text-gray-500 ml-1">
                            {item.quantity} units × {formatCurrency(item.unitPrice)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Summary in compact format */}
                    <div className="mt-2 space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Platform Fee:</span>
                        <span>{formatCurrency(order.platformFee)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1">
                        <span>Total:</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right side - Price and actions */}
                  <div className="flex-shrink-0 text-right ml-4">
                    <div className="font-semibold text-lg">{formatCurrency(order.total)}</div>
                    <div className="text-xs text-gray-500 flex items-center justify-end">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(order.date), 'MMM d, yyyy')}
                    </div>
                    
                    {/* Delivery info */}
                    <div className="flex items-center justify-end space-x-1 mt-1">
                      {order.fulfillmentType === 'delivery' ? (
                        <Truck className="h-3 w-3 text-gray-500" />
                      ) : (
                        <MapPin className="h-3 w-3 text-gray-500" />
                      )}
                      <span className="text-xs text-gray-600 capitalize">{order.fulfillmentType}</span>
                    </div>
                    
                    {/* View Details Button */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs mt-2">
                          <Eye className="h-3 w-3 mr-1" />
                          View Details
                        </Button>
                      </DialogTrigger>
                      <OrderDetailsModal order={order} />
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}