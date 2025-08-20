import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, DollarSign, TrendingUp, AlertCircle } from "lucide-react";

export default function OrdersDebug() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string>('checking');

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔄 Starting orders fetch...');
        
        // Step 1: Recover authentication
        console.log('Step 1: Recovering authentication...');
        const authResponse = await fetch('/api/auth/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
        });
        
        const authResult = await authResponse.json();
        console.log('Auth recovery result:', authResult);
        setAuthStatus(authResult.success ? 'recovered' : 'failed');
        
        if (!authResult.success) {
          throw new Error('Authentication recovery failed');
        }
        
        // Step 2: Wait for session to be established
        console.log('Step 2: Waiting for session establishment...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 3: Fetch orders
        console.log('Step 3: Fetching orders...');
        const ordersResponse = await fetch('/api/orders', {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('Orders response status:', ordersResponse.status);
        console.log('Orders response headers:', Object.fromEntries(ordersResponse.headers.entries()));
        
        if (!ordersResponse.ok) {
          const errorText = await ordersResponse.text();
          console.error('Orders API error:', errorText);
          throw new Error(`Orders API failed: ${ordersResponse.status} - ${errorText}`);
        }
        
        const ordersData = await ordersResponse.json();
        console.log('Orders data received:', {
          isArray: Array.isArray(ordersData),
          length: Array.isArray(ordersData) ? ordersData.length : 'not array',
          firstOrder: Array.isArray(ordersData) && ordersData.length > 0 ? ordersData[0] : 'none'
        });
        
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setAuthStatus('success');
        
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setAuthStatus('error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800", 
      fulfilled: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800"
    };
    const colorClass = colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
    return (
      <Badge className={`${colorClass} border-0`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
      </Badge>
    );
  };

  const formatCurrency = (amount: string | number) => {
    try {
      const num = typeof amount === 'string' ? parseFloat(amount) : amount;
      return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } catch (e) {
      return '£0.00';
    }
  };

  // Calculate stats
  const stats = {
    total: orders.length,
    paid: orders.filter(o => o.status === 'paid').length,
    fulfilled: orders.filter(o => o.status === 'fulfilled').length,
    revenue: orders.reduce((sum, order) => sum + parseFloat(order.subtotal || '0'), 0)
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-600">Loading orders... (Auth: {authStatus})</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <div className="text-red-600 font-medium">Debug Error</div>
          <p className="text-gray-500 text-sm">{error}</p>
          <p className="text-xs text-gray-400">Auth Status: {authStatus}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Debug Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders Debug</h1>
        <p className="text-muted-foreground">
          Debug mode - Auth: {authStatus}, Orders: {orders.length}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">From API response</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.revenue)}</div>
            <p className="text-xs text-muted-foreground">Subtotal sum</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Orders</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paid}</div>
            <p className="text-xs text-muted-foreground">Status: paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.fulfilled}</div>
            <p className="text-xs text-muted-foreground">Status: fulfilled</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders ({orders.length})</CardTitle>
          <CardDescription>Debug view of wholesale orders</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Check console for API debugging information
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Order</th>
                    <th className="text-left p-4 font-medium">Customer</th>
                    <th className="text-left p-4 font-medium">Total</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 10).map((order, index) => (
                    <tr key={order.id || index} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium text-blue-600">
                          {order.orderNumber || `Order ${order.id}`}
                        </div>
                        <div className="text-sm text-gray-500">ID: {order.id}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{order.customerName || 'Unknown'}</div>
                        <div className="text-sm text-gray-500">{order.customerEmail || 'No email'}</div>
                      </td>
                      <td className="p-4 font-medium">
                        {formatCurrency(order.total || order.subtotal || "0")}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="p-4 text-sm">
                        {order.fulfillmentType || 'unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length > 10 && (
                <div className="text-center p-4 text-sm text-gray-500">
                  Showing first 10 of {orders.length} orders
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Debug Information</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div>Auth Status: <span className="font-mono">{authStatus}</span></div>
          <div>Orders Count: <span className="font-mono">{orders.length}</span></div>
          <div>First Order Keys: <span className="font-mono">{orders.length > 0 ? Object.keys(orders[0]).join(', ') : 'none'}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}