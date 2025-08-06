import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrdersReactQueryTest() {
  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      console.log('🔄 ReactQuery: Starting fetch to /api/public-orders');
      const response = await fetch('/api/public-orders');
      console.log('📡 ReactQuery: Response status:', response.status);
      console.log('📡 ReactQuery: Response ok:', response.ok);
      
      if (!response.ok) {
        console.error('❌ ReactQuery: Response not ok');
        throw new Error('Failed to load orders');
      }
      
      const data = await response.json();
      console.log('✅ ReactQuery: Data received:', {
        type: typeof data,
        isArray: Array.isArray(data),
        length: data?.length,
        firstItem: data?.[0]
      });
      
      return data;
    },
    retry: 1,
    staleTime: 30000
  });

  console.log('🎯 ReactQuery State:', {
    isLoading: ordersQuery.isLoading,
    isError: ordersQuery.isError,
    error: ordersQuery.error?.message,
    dataType: typeof ordersQuery.data,
    dataLength: ordersQuery.data?.length,
    hasData: !!ordersQuery.data
  });

  if (ordersQuery.isLoading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading orders with React Query...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (ordersQuery.isError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-red-600">
              <h3 className="font-semibold">Error loading orders</h3>
              <p>{ordersQuery.error?.message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const orders = ordersQuery.data || [];

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>React Query Test</CardTitle>
          <CardDescription>
            Testing React Query integration - Orders: {orders.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-gray-100 rounded">
              <h3 className="font-semibold mb-2">React Query State:</h3>
              <pre className="text-xs overflow-auto">
                {JSON.stringify({
                  isLoading: ordersQuery.isLoading,
                  isError: ordersQuery.isError,
                  error: ordersQuery.error?.message,
                  dataType: typeof ordersQuery.data,
                  dataLength: ordersQuery.data?.length,
                  hasData: !!ordersQuery.data
                }, null, 2)}
              </pre>
            </div>

            {orders.length > 0 && (
              <div className="p-4 bg-green-50 rounded">
                <h3 className="font-semibold mb-2">First Order Sample:</h3>
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(orders[0], null, 2)}
                </pre>
              </div>
            )}

            {orders.length === 0 && (
              <div className="p-4 bg-yellow-50 rounded">
                <h3 className="font-semibold text-yellow-800">No Orders Found</h3>
                <p className="text-yellow-700">React Query returned empty array</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}