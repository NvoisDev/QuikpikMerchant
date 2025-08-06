import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function OrdersDebugPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        console.log('🚀 Starting direct fetch to /api/public-orders');
        setLoading(true);
        
        const response = await fetch('/api/public-orders', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Response not ok:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const responseText = await response.text();
        console.log('📄 Raw response length:', responseText.length);
        console.log('📄 Response starts with:', responseText.substring(0, 100));
        
        const data = JSON.parse(responseText);
        console.log('✅ Parsed data type:', typeof data);
        console.log('✅ Is array:', Array.isArray(data));
        console.log('✅ Data length:', data?.length);
        console.log('✅ First item:', data[0]);
        
        setOrders(data);
        setDebugInfo({
          responseStatus: response.status,
          responseOk: response.ok,
          dataType: typeof data,
          isArray: Array.isArray(data),
          dataLength: data?.length,
          firstItem: data[0]
        });
        
      } catch (err: any) {
        console.error('❌ Fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'pending':
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading orders...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Orders Debug</CardTitle>
          <CardDescription>
            Direct API test - Orders: {orders.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Debug Information */}
          <div className="mb-6 p-4 bg-gray-100 rounded">
            <h3 className="font-semibold mb-2">Debug Info:</h3>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded">
              <h3 className="font-semibold text-red-800">Error:</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {orders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No orders found ({orders.length} total)</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.slice(0, 10).map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.orderNumber || `#${order.id}`}
                    </TableCell>
                    <TableCell>
                      {order.createdAt ? format(new Date(order.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {order.customerName || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status || 'pending')}>
                        {order.status || 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      £{((order as any).total || order.totalAmount || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {orders.length > 10 && (
            <div className="mt-4 text-center text-gray-500">
              Showing first 10 of {orders.length} orders
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}