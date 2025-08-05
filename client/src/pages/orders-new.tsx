import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, 
  DollarSign, 
  Clock, 
  TrendingUp,
  RefreshCw,
  Download,
  Package,
  Truck,
  MapPin,
  User,
  Phone,
  Mail,
  Calendar
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Format currency utility
const formatCurrency = (amount: number, currency: string = 'GBP') => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Hardcoded Surulere Foods Wholesale ID
const SURULERE_WHOLESALER_ID = "104871691614680693123";

export default function OrdersNew() {
  // Direct API call to fetch orders for Surulere Foods
  const { data: orders = [], isLoading, error, refetch } = useQuery({
    queryKey: ['wholesaler-orders', SURULERE_WHOLESALER_ID],
    queryFn: async () => {
      console.log('🔍 Fetching orders for Surulere Foods Wholesale...');
      const response = await fetch(`/api/orders?wholesaler=${SURULERE_WHOLESALER_ID}&t=${Date.now()}`);
      
      if (!response.ok) {
        console.error('❌ API Error:', response.status, response.statusText);
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Orders loaded:', data.length, 'orders found');
      return data;
    },
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Calculate statistics
  const stats = {
    total: orders.length,
    paid: orders.filter((o: any) => o.status === 'paid').length,
    fulfilled: orders.filter((o: any) => o.status === 'fulfilled').length,
    pending: orders.filter((o: any) => ['pending', 'confirmed', 'processing'].includes(o.status)).length,
    revenue: orders
      .filter((o: any) => ['paid', 'fulfilled'].includes(o.status))
      .reduce((sum: number, o: any) => sum + parseFloat(o.total || '0'), 0),
    avgOrderValue: 0
  };

  stats.avgOrderValue = stats.paid > 0 ? stats.revenue / stats.paid : 0;

  console.log('📊 Order Statistics:', stats);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Surulere Foods orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">Failed to load orders</p>
          <p className="text-gray-500 text-sm mb-4">{error.message}</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Surulere Foods - Order Management</h1>
          <p className="text-gray-600">Manage your wholesale orders and customer deliveries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-gray-600">Total Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-gray-600">Pending Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.revenue, 'GBP')}</p>
                <p className="text-sm text-gray-600">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.avgOrderValue, 'GBP')}</p>
                <p className="text-sm text-gray-600">Avg Order Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Orders</h2>
            <Badge variant="secondary">{orders.length} orders</Badge>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No orders found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.slice(0, 10).map((order: any) => (
                <div key={order.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="text-sm text-gray-600">
                          {order.customerName || order.retailer?.firstName + ' ' + order.retailer?.lastName}
                        </p>
                      </div>
                      <Badge 
                        variant={order.status === 'paid' ? 'default' : 
                                order.status === 'fulfilled' ? 'secondary' : 'outline'}
                      >
                        {order.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(parseFloat(order.total || '0'), 'GBP')}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  {order.items && order.items.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-sm text-gray-600">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''} • 
                        {order.items.map((item: any) => item.product?.name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              
              {orders.length > 10 && (
                <div className="text-center pt-4">
                  <Button variant="outline">
                    View All {orders.length} Orders
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}