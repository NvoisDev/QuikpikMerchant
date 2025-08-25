import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Package, Clock, Check, Eye, Search, RefreshCw, ChevronLeft, ChevronRight, Calendar, ShoppingBag, MapPin, Home, Building, Truck, Camera, Image as ImageIcon, Warehouse } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { formatCurrency } from "@shared/utils/currency";
import { QuikpikFooter } from "@/components/ui/quikpik-footer";

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
  transactionFee?: string;
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
  deliveryAddress?: string;
  deliveryAddressId?: number;
  orderNotes?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  createdAt: string;
  updatedAt: string;
  orderImages?: Array<{
    id: string;
    url: string;
    filename: string;
    uploadedAt: string;
    description?: string;
  }>;
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
        parsed.postcode || parsed.postalCode || parsed.zipCode || parsed.zip
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

const parseDeliveryAddress = (address: string | undefined): any => {
  if (!address) return null;
  try {
    const parsed = JSON.parse(address);
    return typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const getLabelIcon = (label?: string) => {
  switch (label?.toLowerCase()) {
    case 'home': return Home;
    case 'office': return Building;
    case 'warehouse': return Truck;
    default: return MapPin;
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

const OrderDetailsModal = ({ order }: { order: Order }) => {
  // Use stored values from order data
  const subtotal = parseFloat(order.subtotal || '0');
  const transactionFee = parseFloat(order.transactionFee || (subtotal * 0.055 + 0.50).toFixed(2)); // Use stored transaction fee or calculate
  const deliveryCost = parseFloat(order.deliveryCost || '0'); // Use stored delivery cost
  const totalPaid = parseFloat(order.total || '0');
  
  // Calculate what the total should be for verification
  const calculatedTotal = subtotal + transactionFee + deliveryCost;
  
  return (
    <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
      <DialogHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="flex-1">
            <DialogTitle className="text-base sm:text-lg">Order {order.orderNumber}</DialogTitle>
            <DialogDescription className="text-sm">Order ID: {order.id}</DialogDescription>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                Close
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogHeader>
      
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
        {/* Order Status */}
        <div>
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Status & Fulfillment</h3>
          <div className="flex flex-wrap gap-2">
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
          <h3 className="font-medium mb-1 text-sm sm:text-base">Your Information</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
            <div className="text-xs break-words"><strong>Name:</strong> {order.customerName || 'Not available'}</div>
            <div className="text-xs break-all"><strong>Email:</strong> {order.customerEmail || 'Not available'}</div>
            <div className="text-xs"><strong>Phone:</strong> {order.customerPhone || 'Not available'}</div>
            {order.customerAddress && (
              <div className="text-xs break-words"><strong>Address:</strong> {formatAddress(order.customerAddress)}</div>
            )}
          </div>
        </div>

        {/* Enhanced Address Information */}
        {order.fulfillmentType === 'delivery' ? (
          <div>
            <h3 className="font-medium mb-2 text-sm sm:text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600" />
              Delivery Address
            </h3>
            {order.deliveryAddressId ? (
              <DeliveryAddressDisplay addressId={order.deliveryAddressId} />
            ) : order.deliveryAddress ? (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                {(() => {
                  console.log('🏠 DEBUG - Raw delivery address data:', order.deliveryAddress);
                  const deliveryAddr = parseDeliveryAddress(order.deliveryAddress!);
                  console.log('🏠 DEBUG - Parsed delivery address:', deliveryAddr);
                  
                  if (deliveryAddr) {
                    const Icon = getLabelIcon(deliveryAddr.label);
                    return (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-blue-800">
                            <div className="font-medium">{deliveryAddr.addressLine1}</div>
                            {deliveryAddr.addressLine2 && (
                              <div>{deliveryAddr.addressLine2}</div>
                            )}
                            <div>
                              {deliveryAddr.city}
                              {deliveryAddr.state && `, ${deliveryAddr.state}`}
                              {deliveryAddr.postalCode && ` ${deliveryAddr.postalCode}`}
                            </div>
                          </div>
                        </div>
                        {deliveryAddr.label && (
                          <div className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded w-fit border border-blue-300">
                            {deliveryAddr.label}
                          </div>
                        )}
                        {deliveryAddr.instructions && (
                          <div className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded border border-blue-300">
                            <span className="font-medium">Instructions:</span> {deliveryAddr.instructions}
                          </div>
                        )}
                        {order.deliveryCost && parseFloat(order.deliveryCost) > 0 && (
                          <div className="text-xs text-blue-700">
                            <span className="font-medium">Delivery Cost:</span> {formatCurrency(parseFloat(order.deliveryCost))}
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    // Enhanced fallback handling
                    const addressText = formatAddress(order.deliveryAddress!);
                    console.log('🏠 DEBUG - Formatted address text:', addressText);
                    
                    // Show address if it's meaningful (not just empty quotes, UK, or other minimal data)
                    if (addressText && 
                        addressText.trim() !== "" && 
                        addressText !== "\"\"" &&
                        addressText !== "United Kingdom" && 
                        addressText !== "UK" &&
                        addressText.length > 3) {
                      return (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-blue-800">{addressText}</div>
                        </div>
                      );
                    }
                    
                    // If no meaningful address data, show a helpful message
                    return (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-800 italic">
                          Delivery address will be confirmed with supplier
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <div className="text-sm text-blue-800 italic">Delivery address will be confirmed</div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h3 className="font-medium mb-2 text-sm sm:text-base flex items-center gap-2">
              <Building className="h-4 w-4 text-green-600" />
              Collection Address
            </h3>
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Warehouse className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-green-800">
                    <div className="font-medium">{order.wholesaler?.businessName || 'Wholesaler Location'}</div>
                    <div className="text-xs text-green-700 mt-1">
                      Collection address and instructions will be provided by the supplier
                    </div>
                  </div>
                </div>
                <div className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded border border-green-300">
                  <span className="font-medium">Contact:</span> {order.wholesaler?.businessName || 'See order confirmation email for contact details'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Items */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Items ({order.items.length})</h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2 bg-gray-50 rounded-lg gap-1 sm:gap-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs break-words">{item.productName}</div>
                  <div className="text-xs text-gray-600">
                    Quantity: {item.quantity} units × {formatCurrency(item.unitPrice)}
                  </div>
                </div>
                <div className="text-left sm:text-right flex-shrink-0">
                  <div className="font-medium text-xs">{formatCurrency(parseFloat(item.unitPrice) * item.quantity)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Summary */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Payment Summary</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
            <div className="flex justify-between text-xs">
              <span className="break-words">Subtotal:</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="break-words">Transaction Fee (5.5% + £0.50):</span>
              <span className="font-medium">{formatCurrency(transactionFee)}</span>
            </div>
            {deliveryCost > 0 && (
              <div className="flex justify-between text-xs">
                <span className="break-words">Delivery Cost:</span>
                <span className="font-medium">{formatCurrency(deliveryCost)}</span>
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
          <h3 className="font-medium mb-2 text-sm sm:text-base">Order Timeline</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-2">
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium break-words">Payment processed successfully</span>
              </div>
            </div>
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium break-words">Order confirmation sent to you</span>
              </div>
            </div>
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium break-words">Wholesaler notified of your order</span>
              </div>
            </div>
            {order.status === 'fulfilled' ? (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">{format(new Date(order.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                  <span className="font-medium break-words">Order fulfilled - ready for {order.fulfillmentType}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                  <span className="text-gray-400 break-words">Awaiting wholesaler confirmation</span>
                </div>
                <div className="flex items-start space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                  <span className="text-gray-400 break-words">Order preparation pending</span>
                </div>
                <div className="flex items-start space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                  <span className="text-gray-400 break-words">Fulfillment pending</span>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Product Images Section */}
        {order.orderImages && order.orderImages.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center text-sm sm:text-base">
              <Camera className="h-4 w-4 mr-2 text-green-600" />
              Product Photos ({order.orderImages.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {order.orderImages.map((image, index) => (
                <div 
                  key={image.id || index} 
                  className="relative cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(image.url, '_blank')}
                >
                  <img
                    src={image.url}
                    alt={image.filename || `Order photo ${index + 1}`}
                    className="w-full h-20 object-cover rounded border border-gray-200 hover:scale-105 transition-transform"
                    onError={(e) => {
                      console.error('🖼️ Image failed to load:', image.url);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 rounded-b">
                    <div className="truncate">{image.description || image.filename || `Photo ${index + 1}`}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Click photos to view full size • Photos from {order.wholesaler?.businessName || 'your wholesaler'}
            </p>
          </div>
        )}
      </div>
    </DialogContent>
  );
};

// Component to fetch and display delivery address details by ID
const DeliveryAddressDisplay = ({ addressId }: { addressId: number }) => {
  const { data: address, isLoading, error } = useQuery<{
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode: string;
    country?: string;
    label?: string;
    instructions?: string;
  }>({
    queryKey: [`/api/delivery-address/${addressId}`],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-500 mt-2 flex items-center gap-2">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Loading address...
      </div>
    );
  }

  if (error || !address) {
    return (
      <div className="text-xs text-red-500 mt-2">
        Unable to load delivery address
      </div>
    );
  }

  const Icon = getLabelIcon(address?.label);
  
  return (
    <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <div className="font-medium">{address.addressLine1}</div>
            {address.addressLine2 && (
              <div>{address.addressLine2}</div>
            )}
            <div>{address.city}</div>
            <div>{address.postalCode}</div>
            {address.country && (
              <div>{address.country}</div>
            )}
          </div>
        </div>
        {address.label && (
          <div className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded w-fit border border-blue-300">
            {address.label}
          </div>
        )}
        {address.instructions && (
          <div className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded border border-blue-300">
            <span className="font-medium">Instructions:</span> {address.instructions}
          </div>
        )}
      </div>
    </div>
  );
};

export function CustomerOrderHistory({ wholesalerId, customerPhone }: CustomerOrderHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;
  const queryClient = useQueryClient();

  const { data: orders, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone], // Fixed query key
    queryFn: async () => {
      // Encode the phone number properly for URL
      const encodedPhone = encodeURIComponent(customerPhone);
      console.log('🔄 Fetching customer orders:', { wholesalerId, customerPhone, encodedPhone, timestamp: new Date().toLocaleTimeString() });
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}?t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store', // Force fresh request every time
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You must be added to this wholesaler\'s customer list to view orders');
        }
        throw new Error('Failed to fetch order history');
      }
      const data = await response.json();
      
      // Ensure we always return an array
      const ordersArray = Array.isArray(data) ? data : [];
      
      console.log('📦 Customer orders loaded:', { 
        totalOrders: ordersArray.length,
        orderIds: ordersArray.map((o: any) => o.id),
        mostRecentOrder: ordersArray[0] ? `#${ordersArray[0].id} - ${ordersArray[0].total}` : 'none',
        timestamp: new Date().toLocaleTimeString(),
        isArray: Array.isArray(ordersArray),
        dataType: typeof data
      });
      return ordersArray;
    },
    enabled: !!wholesalerId && !!customerPhone,
    refetchInterval: false, // Disable auto-refetch to prevent conflicts
    refetchIntervalInBackground: false,
    staleTime: 0, // Always consider data stale - fetch fresh every time
    gcTime: 0, // Don't cache results
    refetchOnWindowFocus: false, // Disable to prevent conflicts
    refetchOnMount: true // Enable refetch on component mount to show fresh orders
  });

  // Debug logging for orders state
  console.log('🎯 CustomerOrderHistory render - orders data:', { isLoading, error });
  console.log('🎯 CustomerOrderHistory render - orders type:', typeof orders);
  console.log('🎯 CustomerOrderHistory render - orders length:', Array.isArray(orders) ? orders.length : 'Not an array');

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    console.log('🔍 FilteredOrders - input data:', { orders, isArray: Array.isArray(orders), length: orders?.length });
    
    if (!orders || !Array.isArray(orders)) {
      console.log('❌ FilteredOrders - returning empty array due to invalid orders data');
      return [];
    }
    
    if (!searchTerm) return orders;
    
    return orders.filter((order: Order) => {
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

  console.log('🎯 CustomerOrderHistory render - orders data:', { orders, isLoading, error });
  console.log('🎯 CustomerOrderHistory render - orders type:', typeof orders);
  console.log('🎯 CustomerOrderHistory render - orders length:', Array.isArray(orders) ? orders.length : 'Not an array');
  console.log('🎯 CustomerOrderHistory render - filteredOrders length:', filteredOrders?.length || 0);
  console.log('🎯 CustomerOrderHistory render - paginatedOrders length:', paginatedOrders?.length || 0);
  console.log('🎯 CustomerOrderHistory render - currentPage:', currentPage);
  console.log('🎯 CustomerOrderHistory render - totalPages:', totalPages);
  console.log('🎯 CustomerOrderHistory render - orders first item:', Array.isArray(orders) && orders.length > 0 ? orders[0] : 'No first item');
  console.log('🎯 CustomerOrderHistory render - recent orders with delivery info:', Array.isArray(orders) && orders.length > 0 ? orders.slice(0, 3).map(o => ({ id: o.id, orderNumber: o.orderNumber, fulfillmentType: o.fulfillmentType, deliveryCarrier: o.deliveryCarrier, deliveryCost: o.deliveryCost })) : 'No orders');
  
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
      <CardHeader className="pb-3 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span className="text-lg font-semibold">Order History</span>

            {isFetching && (
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Updating...</span>
              </div>
            )}
          </div>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={isRefreshing || isFetching}
            className="h-8 px-2 w-full sm:w-auto"
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
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-10 text-base"
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
          {paginatedOrders.map((order: Order, index: number) => {
            console.log(`Rendering order ${index}:`, order);
            return (
            <Card key={order.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3 sm:p-4">
                <div className="space-y-3">
                  {/* Order header with badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{order.orderNumber}</div>
                    <Badge className={`${getStatusColor(order.status)} text-xs`}>
                      {getStatusIcon(order.status)}
                      <span className="ml-1 capitalize">{order.status}</span>
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${order.fulfillmentType === 'delivery' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}
                    >
                      {order.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📦 Collection'}
                    </Badge>
                  </div>

                  {/* Wholesaler info */}
                  <div className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
                    <span>From</span>
                    <Badge variant="outline" className="text-xs px-2 py-0.5 break-words">
                      {order.wholesaler?.businessName || 'Unknown Business'}
                    </Badge>
                  </div>
                  
                  {/* Items list - mobile optimized */}
                  <div className="space-y-1">
                    {order.items.slice(0, 2).map((item, index) => (
                      <div key={index} className="text-xs text-gray-700 break-words">
                        <span className="font-medium">{item.productName}</span>
                        <span className="text-gray-500 ml-1">
                          {item.quantity} units × {formatCurrency(item.unitPrice)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 2 && (
                      <div className="text-xs text-gray-500">
                        +{order.items.length - 2} more items
                      </div>
                    )}
                  </div>
                  
                  {/* Mobile-friendly summary layout */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>{format(new Date(order.date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="text-sm font-semibold text-green-600">
                        {formatCurrency(parseFloat(order.total))}
                      </div>
                    </div>
                    
                    {/* View Details Button */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 px-3 w-full sm:w-auto">
                          <Eye className="h-3 w-3 mr-1" />
                          <span className="text-xs">View Details</span>
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
        )}

        {/* Pagination Controls */}
        {filteredOrders.length > ordersPerPage && (
          <div className="mt-6 space-y-3 sm:space-y-4">
            {/* Order count - mobile friendly */}
            <div className="text-sm text-gray-600 text-center">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
            </div>
            
            {/* Pagination controls - mobile optimized */}
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 px-2 sm:px-3"
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              
              {/* Page numbers - simplified on mobile */}
              <div className="hidden sm:flex items-center gap-1">
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

              {/* Mobile page indicator */}
              <div className="sm:hidden flex items-center">
                <span className="text-sm text-gray-600 px-3">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="h-8 px-2 sm:px-3"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Quikpik Footer */}
        <QuikpikFooter />
      </CardContent>
    </Card>
  );
}