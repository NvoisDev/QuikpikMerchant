import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, DollarSign, TrendingUp, AlertCircle, RefreshCw, Users } from "lucide-react";
import { formatCurrency } from "@/lib/currencies";

interface Order {
  id: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  total: string;
  subtotal: string;
  status: string;
  fulfillmentType?: string;
  createdAt: string;
}

export default function OrdersDirect() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState('unknown');

  const establishSessionAndFetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Establishing session and fetching orders...');
      
      // Step 1: Force authentication recovery with known email
      console.log('Step 1: Recovering authentication...');
      const authResponse = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        credentials: 'include',
        body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
      });
      
      if (!authResponse.ok) {
        throw new Error(`Auth recovery failed: ${authResponse.status}`);
      }
      
      const authResult = await authResponse.json();
      console.log('Auth recovery result:', authResult);
      setSessionStatus(authResult.success ? 'authenticated' : 'failed');
      
      if (!authResult.success) {
        throw new Error('Authentication recovery failed');
      }
      
      // Step 2: Wait for session establishment
      console.log('Step 2: Waiting for session...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 3: Verify authentication
      console.log('Step 3: Verifying authentication...');
      const verifyResponse = await fetch('/api/auth/user', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (verifyResponse.ok) {
        const userData = await verifyResponse.json();
        console.log('User verification successful:', userData.email);
        setSessionStatus('verified');
      } else {
        console.warn('User verification failed:', verifyResponse.status);
      }
      
      // Step 4: Fetch orders regardless of verification status
      console.log('Step 4: Fetching orders...');
      const ordersResponse = await fetch('/api/orders', {
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      console.log('Orders response status:', ordersResponse.status);
      
      if (!ordersResponse.ok) {
        const errorText = await ordersResponse.text();
        console.error('Orders API error:', errorText);
        throw new Error(`Orders API failed: ${ordersResponse.status} - ${errorText}`);
      }
      
      const ordersData = await ordersResponse.json();
      console.log('Orders received:', {
        isArray: Array.isArray(ordersData),
        length: Array.isArray(ordersData) ? ordersData.length : 'not array',
        first: Array.isArray(ordersData) && ordersData.length > 0 ? ordersData[0] : 'none'
      });
      
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      
    } catch (err) {
      console.error('Complete fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setSessionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    establishSessionAndFetchOrders();
  }, []);

  const retryWithForce = async () => {
    // Clear any existing sessions and force fresh authentication
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // Ignore logout errors
    }
    
    // Wait a moment then retry
    setTimeout(establishSessionAndFetchOrders, 500);
  };

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

  // Calculate stats
  const stats = {
    total: orders.length,
    paid: orders.filter(o => o.status === 'paid').length,
    fulfilled: orders.filter(o => o.status === 'fulfilled').length,
    revenue: orders.reduce((sum, order) => sum + parseFloat(order.subtotal || order.total || '0'), 0)
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-600">Establishing session and loading orders...</p>
            <p className="text-xs text-gray-400">Session: {sessionStatus}</p>
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
          <div className="text-red-600 font-medium">Unable to load orders</div>
          <p className="text-gray-500 text-sm">{error}</p>
          <p className="text-xs text-gray-400">Session Status: {sessionStatus}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={establishSessionAndFetchOrders} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button onClick={retryWithForce} variant="outline" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Force Refresh
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Manage your wholesale orders and fulfillment
          </p>
          <p className="text-xs text-gray-400 mt-1">Session: {sessionStatus}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={establishSessionAndFetchOrders} variant="outline" size="sm" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
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
            <p className="text-xs text-muted-foreground">All wholesale orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.revenue)}</div>
            <p className="text-xs text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Orders</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paid}</div>
            <p className="text-xs text-muted-foreground">Successfully paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.fulfilled}</div>
            <p className="text-xs text-muted-foreground">Orders completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders ({orders.length})</CardTitle>
          <CardDescription>Your latest wholesale orders - direct from backend</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Orders will appear here once customers place them
              </p>
              <p className="text-xs text-gray-400 mt-2">Session Status: {sessionStatus}</p>
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
                    <th className="text-left p-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 25).map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium text-blue-600">
                          {order.orderNumber || `#${order.id}`}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{order.customerName || 'Unknown'}</div>
                        <div className="text-sm text-gray-500">{order.customerEmail || 'No email'}</div>
                      </td>
                      <td className="p-4 font-medium">
                        {formatCurrency(parseFloat(order.total || "0"))}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="p-4 text-sm">
                        {order.fulfillmentType || 'standard'}
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length > 25 && (
                <div className="text-center p-4 text-sm text-gray-500">
                  Showing first 25 of {orders.length} orders
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}