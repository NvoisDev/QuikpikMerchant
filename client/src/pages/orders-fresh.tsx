import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, 
  DollarSign, 
  Clock, 
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function OrdersFresh() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: orders = [], isLoading, error, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const response = await fetch('/api/orders', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Orders API error:', response.status, errorText);
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Orders loaded:', data.length, 'orders');
      return data;
    },
    enabled: !!user, // Only run query when user is authenticated
    retry: 1,
    staleTime: 30000
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load orders</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const stats = {
    total: orders.length,
    paid: orders.filter((order: any) => order.status === 'paid').length,
    revenue: orders.reduce((sum: number, order: any) => sum + parseFloat(order.total || '0'), 0)
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Orders</h1>
        <Button onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">Total Orders</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">Paid Orders</p>
                <p className="text-2xl font-bold">{stats.paid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">Revenue</p>
                <p className="text-2xl font-bold">£{stats.revenue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No orders found</p>
          ) : (
            <div className="space-y-4">
              {orders.slice(0, 20).map((order: any) => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="text-sm text-gray-500">{order.customerName}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                      {order.status}
                    </Badge>
                    <p className="font-medium">£{parseFloat(order.total || '0').toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}