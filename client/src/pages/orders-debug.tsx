import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function OrdersDebug() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo({});

    try {
      console.log('🔍 Starting direct fetch for orders...');
      
      const url = `/api/orders?t=${Date.now()}`;
      console.log('🔍 Fetching from:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      console.log('🔍 Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      });

      setDebugInfo({
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Orders data:', {
        isArray: Array.isArray(data),
        length: data.length,
        firstOrder: data[0]?.orderNumber,
        sample: data.slice(0, 2)
      });

      setOrders(data);
    } catch (err: any) {
      console.error('❌ Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const stats = {
    total: orders.length,
    paid: orders.filter(o => o.status === 'paid').length,
    revenue: orders
      .filter(o => ['paid', 'fulfilled'].includes(o.status))
      .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0)
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Orders Debug Page</h1>
        <Button onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Debug Information */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-2">Debug Information</h3>
          <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Loading orders...</p>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-red-600 mb-2">Error</h3>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-gray-600">Total Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.paid}</p>
              <p className="text-sm text-gray-600">Paid Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">£{stats.revenue.toFixed(2)}</p>
              <p className="text-sm text-gray-600">Revenue</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Orders List */}
      {!loading && !error && orders.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">Orders ({orders.length})</h2>
            <div className="space-y-2">
              {orders.slice(0, 10).map((order) => (
                <div key={order.id} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <span className="font-medium">{order.orderNumber}</span>
                    <span className="ml-2 text-gray-600">{order.customerName}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">£{parseFloat(order.total || '0').toFixed(2)}</span>
                    <span className="ml-2 text-sm text-gray-500">{order.status}</span>
                  </div>
                </div>
              ))}
              {orders.length > 10 && (
                <p className="text-center text-gray-500 pt-2">
                  ... and {orders.length - 10} more orders
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Data (for debugging) */}
      {!loading && !error && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Raw Data (First 2 Orders)</h3>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(orders.slice(0, 2), null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}