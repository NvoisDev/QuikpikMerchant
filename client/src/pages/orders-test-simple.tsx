import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrdersTestSimple() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const testFetch = async () => {
      try {
        console.log('🚀 Direct fetch test starting...');
        setLoading(true);
        
        const response = await fetch('/api/public-orders', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        console.log('📡 Response received:', {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length')
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Try to read as text first to check for JSON parsing issues
        const textData = await response.text();
        console.log('📄 Raw response length:', textData.length);
        console.log('📄 Response preview:', textData.substring(0, 200) + '...');
        
        // Try to parse JSON
        const jsonData = JSON.parse(textData);
        console.log('✅ JSON parsed successfully:', {
          type: typeof jsonData,
          isArray: Array.isArray(jsonData),
          length: jsonData?.length
        });
        
        setData(jsonData);
        
      } catch (err: any) {
        console.error('❌ Fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    testFetch();
  }, []);

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Direct Fetch Test</CardTitle>
          <CardDescription>
            Testing basic fetch without React Query
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="text-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p>Loading...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-300 rounded p-4 mb-4">
              <h3 className="font-semibold text-red-800">Error:</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {data && (
            <div className="space-y-4">
              <div className="bg-green-100 border border-green-300 rounded p-4">
                <h3 className="font-semibold text-green-800">Success!</h3>
                <p className="text-green-700">
                  Loaded {Array.isArray(data) ? data.length : 'unknown'} orders
                </p>
              </div>

              {Array.isArray(data) && data.length > 0 && (
                <div className="bg-gray-100 rounded p-4">
                  <h3 className="font-semibold mb-2">First Order:</h3>
                  <pre className="text-xs overflow-auto bg-white p-2 rounded border">
                    {JSON.stringify(data[0], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}