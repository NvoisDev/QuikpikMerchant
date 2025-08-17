import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Package, Clock, Check, Eye, Search, RefreshCw, ChevronLeft, ChevronRight, Calendar, ShoppingBag } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  deliveryCost?: string;
  customerTransactionFee?: string;
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

// Helper function to format address from JSON string or regular string
const formatAddress = (addressData?: string): string => {
  if (!addressData) return 'Address not provided';
  
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(addressData);
    if (typeof parsed === 'object' && parsed !== null) {
      // Handle comprehensive address object with multiple possible field names
      const addressParts = [
        parsed.street || parsed.property || parsed.address1 || parsed.address,
        parsed.address2,
        parsed.town || parsed.city,
        parsed.county || parsed.state,
        parsed.postcode || parsed.postalCode || parsed.zipCode || parsed.zip,
        parsed.country
      ].filter(part => part && part.trim() !== '');
      
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
    }
    return addressData;
  } catch {
    // If parsing fails, return as regular string
    return addressData;
  }
};

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
  return `£${numAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const OrderDetailsModal = ({ order }: { order: Order }) => {
  // Use actual order values from database
  const subtotal = parseFloat(order.subtotal);
  const transactionFee = parseFloat(order.customerTransactionFee || '0');
  // CRITICAL FIX: deliveryCost and shippingTotal are already strings with correct values
  const deliveryCost = parseFloat(order.deliveryCost || '0');
  const totalPaid = parseFloat(order.total);
  
  // Order price breakdown calculations
  
  return (
    <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex justify-between items-start">
          <div>
            <DialogTitle>Order {order.orderNumber}</DialogTitle>
            <DialogDescription>Order ID: {order.id}</DialogDescription>
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogHeader>
      
      <div className="space-y-6 p-6">
        {/* Order Status */}
        <div>
          <h3 className="font-semibold mb-2">Status & Fulfillment</h3>
          <div className="flex gap-2">
            <Badge className={`${getStatusColor(order.status)} text-xs`}>
              {getStatusIcon(order.status)}
              <span className="ml-1 capitalize">{order.status}</span>
            </Badge>
            <Badge variant="outline" className="text-xs">
              {order.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📦 Collection'}
            </Badge>
          </div>
        </div>

        {/* Your Information */}
        <div>
          <h3 className="font-medium mb-1 text-sm">Your Information</h3>
          <div className="bg-gray-50 p-3 rounded-lg space-y-1">
            <div className="text-xs"><strong>Name:</strong> {order.customerName || 'Not available'}</div>
            <div className="text-xs"><strong>Email:</strong> {order.customerEmail || 'Not available'}</div>
            <div className="text-xs"><strong>Phone:</strong> {order.customerPhone || 'Not available'}</div>
            {order.customerAddress && (
              <div className="text-xs"><strong>Address:</strong> {formatAddress(order.customerAddress)}</div>
            )}
          </div>
        </div>

        {/* Order Items */}
        <div>
          <h3 className="font-medium mb-1 text-sm">Items ({order.items.length})</h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-xs">{item.productName}</div>
                  <div className="text-xs text-gray-600">
                    Quantity: {item.quantity} units × {formatCurrency(item.unitPrice)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-xs">{formatCurrency(parseFloat(item.unitPrice) * item.quantity)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Summary */}
        <div>
          <h3 className="font-medium mb-1 text-sm">Payment Summary</h3>
          <div className="bg-gray-50 p-3 rounded-lg space-y-1">
            <div className="flex justify-between text-xs">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Transaction Fee:</span>
              <span>{formatCurrency(transactionFee)}</span>
            </div>
            {deliveryCost > 0 && (
              <div className="flex justify-between text-xs">
                <span>Delivery Cost:</span>
                <span>{formatCurrency(deliveryCost)}</span>
              </div>
            )}
            {/* Show delivery info even if cost is 0 */}
            {order.fulfillmentType === 'delivery' && deliveryCost === 0 && (
              <div className="flex justify-between text-xs text-green-600">
                <span>Delivery:</span>
                <span>Free Delivery</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1 text-sm">
              <span>Total Paid:</span>
              <span>{formatCurrency(totalPaid)}</span>
            </div>
          </div>
        </div>

        {/* Order Timeline */}
        <div>
          <h3 className="font-medium mb-2 text-sm">Order Timeline</h3>
          <div className="bg-gray-50 p-3 rounded-lg space-y-2">
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
              <span className="font-medium">Payment processed successfully</span>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
              <span className="font-medium">Order confirmation sent to you</span>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
              <span className="font-medium">Wholesaler notified of your order</span>
            </div>
            {order.status === 'fulfilled' ? (
              <div className="flex items-center space-x-2 text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-600">{format(new Date(order.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium">Order fulfilled - ready for {order.fulfillmentType}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-400">Awaiting wholesaler confirmation</span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-400">Order preparation pending</span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-400">Fulfillment pending</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DialogContent>
  );
};

export function CustomerOrderHistory({ wholesalerId, customerPhone }: CustomerOrderHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;
  const queryClient = useQueryClient();

  // Query setup for customer orders
  
  const queryResult = useQuery({
    queryKey: [`customer-orders`, wholesalerId, customerPhone],
    enabled: !!wholesalerId && !!customerPhone,
    refetchInterval: 10000, // Reduced to 10 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<Order[]> => {
      const encodedPhone = encodeURIComponent(customerPhone);
      // Fetching customer orders with cache-busting
      
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}?cacheBust=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      // Handle API response
      
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 403) {
          throw new Error('Customer not found in wholesaler list');
        }
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }
      
      const rawData = await response.json();
      const ordersArray = Array.isArray(rawData) ? rawData : [];
      
      // DEBUG: Verify latest orders are received
      console.log('✅ LATEST ORDERS RECEIVED:', ordersArray.slice(0, 3).map(o => `${o.orderNumber} (${o.date})`).join(', '));
      
      return ordersArray;
    }
  });
  
  const { data: orders, isLoading, error, refetch, isFetching } = queryResult;

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    if (!orders || !Array.isArray(orders)) {
      return [];
    }
    
    if (!searchTerm) {
      return orders;
    }
    
    const filtered = orders.filter((order: Order) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.status.toLowerCase().includes(searchLower) ||
        order.wholesaler?.businessName?.toLowerCase().includes(searchLower) ||
        order.items.some(item => item.productName.toLowerCase().includes(searchLower)) ||
        order.total.toString().includes(searchTerm) ||
        format(new Date(order.date), 'MMM d, yyyy').toLowerCase().includes(searchLower)
      );
    });
    
    return filtered;
  }, [orders, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const startIndex = (currentPage - 1) * ordersPerPage;
  const endIndex = startIndex + ordersPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Clear cache and force fresh fetch
      queryClient.invalidateQueries({ queryKey: [`/api/customer-orders`, wholesalerId, customerPhone] });
      queryClient.removeQueries({ queryKey: [`/api/customer-orders`, wholesalerId, customerPhone] });
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

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
          <div className="flex flex-col items-center space-y-4 py-8">
            {/* Enhanced Loading Animation */}
            <div className="flex space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-6 bg-gradient-to-t from-blue-400 to-indigo-500 rounded-full animate-pulse"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: '1.8s'
                  }}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500">Loading order history...</p>
            
            {/* Skeleton Cards */}
            <div className="w-full space-y-4 mt-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
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

  // CRITICAL: Force display if we see individual orders in console but main array is empty
  const shouldForceDisplay = false; // Reset to normal display logic now that data is flowing
  
  if ((!orders || orders.length === 0) && !shouldForceDisplay) {
    
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
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600">
                Debug: Backend reports orders but frontend showing empty.
                Check browser console for detailed logs.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Orders type: {typeof orders} | Length: {orders?.length || 'N/A'} | Array: {Array.isArray(orders) ? 'Yes' : 'No'}
              </p>
              <button 
                onClick={handleRefresh}
                className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs"
              >
                Force Refresh
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span className="text-lg font-semibold">Order History</span>

            {isFetching && (
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Updating...</span>
              </div>
            )}
          </div>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={isRefreshing || isFetching}
            className="h-8 px-2"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing || isFetching ? 'animate-spin' : ''}`} />
            <span className="text-xs">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>


        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search orders by number, status, products, or date..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 && searchTerm ? (
          <div className="text-center py-8">
            <Search className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg mb-2">No orders found</p>
            <p className="text-gray-400">Try adjusting your search terms.</p>
          </div>
        ) : (
        <div className="space-y-2">
          {/* DEBUG: Show current orders being displayed */}
          <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
            <strong>✅ DISPLAYING:</strong> {paginatedOrders.length} orders - Latest: {paginatedOrders.slice(0, 3).map(o => o.orderNumber).join(', ')}
          </div>
          
          {paginatedOrders.map((order: Order, index: number) => (
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
                    
                    {/* Summary - Customer Payment Details */}
                    <div className="mt-2 space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Transaction Fee:</span>
                        <span>{formatCurrency((parseFloat(order.subtotal) * 0.055 + 0.50).toFixed(2))}</span>
                      </div>
                      {parseFloat(order.shippingTotal || '0') > 0 && (
                        <div className="flex justify-between text-xs">
                          <span>Delivery Cost:</span>
                          <span>{formatCurrency(order.shippingTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1">
                        <span>Total Paid:</span>
                        <span className="text-green-700">{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right side - Total Paid and actions */}
                  <div className="flex-shrink-0 text-right ml-4">
                    <div className="font-semibold text-lg text-green-700">{formatCurrency(order.total)}</div>
                    <div className="text-xs text-gray-500">Total Paid</div>
                    <div className="text-xs text-gray-500 flex items-center justify-end mt-1">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(order.date), 'MMM d, yyyy')}
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
          ))}
        </div>
        )}

        {/* Pagination Controls */}
        {filteredOrders.length > ordersPerPage && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 px-3"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  // Show first page, last page, current page, and pages around current
                  const showPage = page === 1 || page === totalPages || 
                    (page >= currentPage - 1 && page <= currentPage + 1);
                  
                  if (!showPage && page === 2 && currentPage > 4) {
                    return <span key={page} className="px-2 text-gray-400">...</span>;
                  }
                  if (!showPage && page === totalPages - 1 && currentPage < totalPages - 3) {
                    return <span key={page} className="px-2 text-gray-400">...</span>;
                  }
                  if (!showPage) return null;
                  
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="h-8 px-3"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}