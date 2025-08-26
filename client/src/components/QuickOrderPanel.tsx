import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, ShoppingCart, Repeat, TrendingUp } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { MouseEvent } from 'react';

interface QuickOrderTemplate {
  id: string;
  name: string;
  items: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: string;
    sellingType: 'units' | 'pallets';
  }>;
  totalItems: number;
  estimatedTotal: string;
  lastOrderDate: string;
  orderFrequency: number;
}

interface FrequentProduct {
  productId: number;
  productName: string;
  averageQuantity: number;
  orderCount: number;
  lastOrderDate: string;
  sellingType: 'units' | 'pallets';
}

interface LastOrder {
  orderId: number;
  orderNumber: string;
  orderDate: string;
  items: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: string;
    sellingType: 'units' | 'pallets';
  }>;
  totalItems: number;
  originalTotal: string;
}

interface QuickOrderPanelProps {
  wholesalerId: string;
  customerPhone: string;
  onAddToCart: (productId: number, quantity: number, sellingType: 'units' | 'pallets') => void;
  onQuickReorder: (items: any[]) => void;
}

export function QuickOrderPanel({ 
  wholesalerId, 
  customerPhone, 
  onAddToCart, 
  onQuickReorder 
}: QuickOrderPanelProps) {
  const [templates, setTemplates] = useState<QuickOrderTemplate[]>([]);
  const [frequentProducts, setFrequentProducts] = useState<FrequentProduct[]>([]);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'templates' | 'frequent' | 'last'>('templates');

  useEffect(() => {
    const fetchQuickOrderData = async () => {
      try {
        setLoading(true);
        const encodedPhone = encodeURIComponent(customerPhone);

        // Fetch all quick order data concurrently
        const [templatesResponse, frequentResponse, lastOrderResponse] = await Promise.allSettled([
          apiRequest('GET', `/api/quick-order-templates/${wholesalerId}/${encodedPhone}`).then(res => res.json()),
          apiRequest('GET', `/api/frequently-ordered/${wholesalerId}/${encodedPhone}`).then(res => res.json()),
          apiRequest('GET', `/api/last-order-reorder/${wholesalerId}/${encodedPhone}`).then(res => res.json())
        ]);

        if (templatesResponse.status === 'fulfilled' && templatesResponse.value.success) {
          setTemplates(templatesResponse.value.templates);
        }

        if (frequentResponse.status === 'fulfilled' && frequentResponse.value.success) {
          setFrequentProducts(frequentResponse.value.products);
        }

        if (lastOrderResponse.status === 'fulfilled' && lastOrderResponse.value.success) {
          setLastOrder(lastOrderResponse.value.lastOrder);
        }

        // Auto-select best tab based on available data
        if (templatesResponse.status === 'fulfilled' && templatesResponse.value.templates?.length > 0) {
          setActiveTab('templates');
        } else if (frequentResponse.status === 'fulfilled' && frequentResponse.value.products?.length > 0) {
          setActiveTab('frequent');
        } else if (lastOrderResponse.status === 'fulfilled' && lastOrderResponse.value.lastOrder) {
          setActiveTab('last');
        }

      } catch (error) {
        console.error('Error fetching quick order data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (wholesalerId && customerPhone) {
      fetchQuickOrderData();
    }
  }, [wholesalerId, customerPhone]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleQuickAddTemplate = (template: QuickOrderTemplate) => {
    template.items.forEach(item => {
      onAddToCart(item.productId, item.quantity, item.sellingType);
    });
  };

  const handleQuickAddProduct = (product: FrequentProduct) => {
    onAddToCart(product.productId, product.averageQuantity, product.sellingType);
  };

  const handleReorderLast = () => {
    if (lastOrder) {
      onQuickReorder(lastOrder.items);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const hasData = templates.length > 0 || frequentProducts.length > 0 || lastOrder;

  if (!hasData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <ShoppingCart className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Order History Yet</h3>
            <p className="text-sm">Place your first order to unlock quick reorder features.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        {templates.length > 0 && (
          <button
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              setActiveTab('templates');
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'templates'
                ? 'bg-white text-green-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Repeat className="w-4 h-4 inline mr-2" />
            Templates
          </button>
        )}
        {frequentProducts.length > 0 && (
          <button
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              setActiveTab('frequent');
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'frequent'
                ? 'bg-white text-green-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Frequent
          </button>
        )}
        {lastOrder && (
          <button
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              setActiveTab('last');
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'last'
                ? 'bg-white text-green-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            Last Order
          </button>
        )}
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && templates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.slice(0, 4).map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-medium">{template.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {template.orderFrequency}x ordered
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {template.totalItems} items • Last: {formatDate(template.lastOrderDate)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 mb-3">
                  {template.items.slice(0, 2).map((item, index) => (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="truncate flex-1">{item.productName}</span>
                      <span className="text-gray-500 ml-2">{item.quantity}x</span>
                    </div>
                  ))}
                  {template.items.length > 2 && (
                    <div className="text-xs text-gray-400">
                      +{template.items.length - 2} more items
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">£{template.estimatedTotal}</span>
                  <Button
                    size="sm"
                    onClick={() => handleQuickAddTemplate(template)}
                    className="h-8"
                  >
                    Add All
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Frequent Products Tab */}
      {activeTab === 'frequent' && frequentProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {frequentProducts.slice(0, 6).map((product) => (
            <Card key={product.productId} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium line-clamp-2">
                  {product.productName}
                </CardTitle>
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="text-xs">
                    {product.orderCount} orders
                  </Badge>
                  <span className="text-xs text-gray-500">
                    Avg: {product.averageQuantity}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    Last: {formatDate(product.lastOrderDate)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickAddProduct(product)}
                    className="h-7 text-xs"
                  >
                    Quick Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Last Order Tab */}
      {activeTab === 'last' && lastOrder && (
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-base">Order #{lastOrder.orderNumber}</CardTitle>
                <CardDescription>
                  {formatDate(lastOrder.orderDate)} • {lastOrder.totalItems} items
                </CardDescription>
              </div>
              <Button onClick={handleReorderLast} className="shrink-0">
                <Repeat className="w-4 h-4 mr-2" />
                Reorder All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              {lastOrder.items.slice(0, 3).map((item, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="truncate flex-1">{item.productName}</span>
                  <div className="flex items-center space-x-2 ml-4">
                    <span className="text-gray-500">{item.quantity}x</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onAddToCart(item.productId, item.quantity, item.sellingType)}
                      className="h-7 px-2 text-xs"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))}
              {lastOrder.items.length > 3 && (
                <div className="text-sm text-gray-400">
                  +{lastOrder.items.length - 3} more items
                </div>
              )}
            </div>
            <div className="border-t pt-2">
              <div className="flex justify-between items-center text-sm font-medium">
                <span>Original Total:</span>
                <span>£{lastOrder.originalTotal}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}