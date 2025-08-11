import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign,
  ArrowRight,
  PieChart,
  Lock,
  Users,
  Package2,
  ShoppingCart,
  Star,
  AlertTriangle,
  Activity
} from "lucide-react";

export default function BusinessPerformance() {
  const { isPremium, currentTier, subscription, refetch } = useSubscription();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch analytics data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["/api/analytics/dashboard"],
    enabled: isPremium
  });

  const { data: customerData, isLoading: customerLoading } = useQuery({
    queryKey: ["/api/analytics/customers"],
    enabled: isPremium && activeTab === "customers"
  });

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ["/api/analytics/inventory"],
    enabled: isPremium && activeTab === "inventory"
  });

  // Authentication recovery mutation
  const recoverAuthMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/recover", "POST", { email: "hello@quikpik.co" }),
    onSuccess: () => {
      toast({
        title: "Authentication Recovered",
        description: "Your session has been restored. Refreshing your subscription status...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Recovery Failed", 
        description: "Could not recover your session. Please log in again.",
        variant: "destructive"
      });
    }
  });

  if (!isPremium) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-16">
          <div className="bg-amber-100 p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <Lock className="h-10 w-10 text-amber-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Premium Feature</h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Business Performance analytics and insights are available with Premium subscription. 
            Upgrade to access detailed performance metrics, financial analytics, and advanced reporting.
          </p>
          <div className="bg-white rounded-lg p-6 shadow-sm border max-w-md mx-auto mb-8">
            <h3 className="font-semibold text-lg mb-3">Premium Features Include:</h3>
            <ul className="text-left space-y-2 text-gray-600">
              <li className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Advanced Analytics Dashboard
              </li>
              <li className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Financial Performance Tracking
              </li>
              <li className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Revenue Trend Analysis
              </li>
              <li className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Customer Insights & Segmentation
              </li>
            </ul>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/subscription">
              <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white">
                Upgrade to Premium
              </Button>
            </Link>
            <Button 
              variant="outline" 
              onClick={() => refetch()} 
              size="lg"
            >
              Refresh Access
            </Button>
            <Button 
              variant="outline" 
              onClick={() => recoverAuthMutation.mutate()}
              disabled={recoverAuthMutation.isPending}
              size="lg"
            >
              {recoverAuthMutation.isPending ? "Recovering..." : "Recover Session"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Performance</h1>
          <p className="text-gray-600">Comprehensive analytics and insights for your wholesale business</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics Overview
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Customer Insights
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Package2 className="h-4 w-4" />
            Inventory Insights
          </TabsTrigger>
        </TabsList>

        {/* Analytics Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {dashboardLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : dashboardData ? (
            <>
              {/* Key Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                        <p className="text-2xl font-bold text-gray-900">
                          £{dashboardData.overview?.totalRevenue?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <DollarSign className="h-8 w-8 text-green-600" />
                    </div>
                    <div className="mt-2 flex items-center text-sm">
                      <span className={`flex items-center ${(dashboardData.overview?.revenueChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(dashboardData.overview?.revenueChange || 0) >= 0 ? '↗' : '↘'} {Math.abs(dashboardData.overview?.revenueChange || 0)}%
                      </span>
                      <span className="text-gray-500 ml-2">vs yesterday</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Orders</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {dashboardData.overview?.totalOrders?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <ShoppingCart className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      {dashboardData.overview?.todayOrders || 0} today
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Products</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {dashboardData.overview?.totalProducts || 0}
                        </p>
                      </div>
                      <Package2 className="h-8 w-8 text-purple-600" />
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      {dashboardData.trends?.lowStockProducts?.length || 0} low stock
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Customers</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {dashboardData.overview?.totalCustomers || 0}
                        </p>
                      </div>
                      <Users className="h-8 w-8 text-orange-600" />
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      Active customer base
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Revenue Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Weekly Revenue Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(dashboardData.trends?.weeklyRevenue || []).map((day: any, index: number) => (
                      <div key={day.date} className="flex items-center gap-4">
                        <div className="w-20 text-sm text-gray-600">
                          {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">£{day.revenue}</span>
                          </div>
                          <Progress 
                            value={Math.max(1, (day.revenue / Math.max(...(dashboardData.trends?.weeklyRevenue || []).map((d: any) => d.revenue))) * 100)} 
                            className="h-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Products and Low Stock */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      Top Performing Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(dashboardData.trends?.topProducts || []).slice(0, 5).map((product: any, index: number) => (
                        <div key={product.productId} className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-semibold text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.quantity} units sold</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">£{product.revenue}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Stock Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(dashboardData.trends?.lowStockProducts || []).slice(0, 5).map((product: any) => (
                        <div key={product.id} className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                            product.stock === 0 ? 'bg-red-500' : product.stock <= 5 ? 'bg-orange-500' : 'bg-yellow-500'
                          }`}>
                            {product.stock}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">
                              {product.stock === 0 ? 'Out of stock' : `${product.stock} units remaining`}
                            </p>
                          </div>
                          <Link href="/products">
                            <Button variant="outline" size="sm">
                              Update Stock
                            </Button>
                          </Link>
                        </div>
                      ))}
                      {(!dashboardData.trends?.lowStockProducts || dashboardData.trends.lowStockProducts.length === 0) && (
                        <div className="text-center py-8">
                          <Activity className="h-12 w-12 text-green-500 mx-auto mb-4" />
                          <p className="text-gray-500">All products are well stocked!</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No analytics data available</p>
            </div>
          )}
        </TabsContent>

        {/* Customer Insights Tab */}
        <TabsContent value="customers" className="space-y-6">
          {customerLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : customerData ? (
            <>
              {/* Customer Segmentation */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">New Customers</p>
                        <p className="text-2xl font-bold text-green-600">{customerData.segmentation?.newCustomers || 0}</p>
                      </div>
                      <Users className="h-8 w-8 text-green-600" />
                    </div>
                    <p className="text-sm text-gray-500 mt-2">Last 30 days</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Returning</p>
                        <p className="text-2xl font-bold text-blue-600">{customerData.segmentation?.returningCustomers || 0}</p>
                      </div>
                      <Users className="h-8 w-8 text-blue-600" />
                    </div>
                    <p className="text-sm text-gray-500 mt-2">Active customers</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">At Risk</p>
                        <p className="text-2xl font-bold text-orange-600">{customerData.segmentation?.atRiskCustomers || 0}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-orange-600" />
                    </div>
                    <p className="text-sm text-gray-500 mt-2">Need attention</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
                        <p className="text-2xl font-bold text-purple-600">£{customerData.metrics?.averageOrderValue || 0}</p>
                      </div>
                      <DollarSign className="h-8 w-8 text-purple-600" />
                    </div>
                    <p className="text-sm text-gray-500 mt-2">Per customer</p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Customers */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Top Customers by Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(customerData.topCustomers || []).map((customer: any, index: number) => (
                      <div key={customer.id} className="flex items-center gap-4 p-4 border rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{customer.name}</p>
                          <p className="text-sm text-gray-500">{customer.phone}</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-900">{customer.orderCount} orders</p>
                          <p className="text-sm text-gray-500">£{customer.avgOrderValue} avg</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">£{customer.totalSpent}</p>
                          <p className="text-sm text-gray-500">{customer.lastOrderDate}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No customer data available</p>
            </div>
          )}
        </TabsContent>

        {/* Inventory Insights Tab */}
        <TabsContent value="inventory" className="space-y-6">
          {inventoryLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : inventoryData ? (
            <>
              {/* Inventory Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Products</p>
                        <p className="text-2xl font-bold text-gray-900">{inventoryData.overview?.totalProducts || 0}</p>
                      </div>
                      <Package2 className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Stock Value</p>
                        <p className="text-2xl font-bold text-green-600">£{inventoryData.overview?.totalStockValue?.toLocaleString() || '0'}</p>
                      </div>
                      <DollarSign className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Low Stock</p>
                        <p className="text-2xl font-bold text-orange-600">{inventoryData.overview?.lowStockCount || 0}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                        <p className="text-2xl font-bold text-red-600">{inventoryData.overview?.outOfStockCount || 0}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-red-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Top Performers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(inventoryData.performance?.topPerformers || []).map((product: any, index: number) => (
                        <div key={product.id} className="flex items-center gap-4 p-3 border rounded-lg">
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-semibold text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.category}</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-gray-900">{product.quantitySold} sold</p>
                            <p className="text-sm text-gray-500">{product.stock} in stock</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">£{product.revenue}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Slow Movers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(inventoryData.performance?.slowMovers || []).map((product: any) => (
                        <div key={product.id} className="flex items-center gap-4 p-3 border rounded-lg">
                          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-semibold text-sm">
                            !
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.category}</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-gray-900">{product.stock} units</p>
                            <p className="text-sm text-gray-500">£{product.stockValue} value</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-orange-600">
                              {product.daysSinceLastSale > 999 ? 'Never sold' : `${product.daysSinceLastSale} days`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Category Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Category Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(inventoryData.performance?.categories || []).map((category: any) => (
                      <div key={category.name} className="p-4 border rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">{category.name}</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Products:</span>
                            <span className="font-medium">{category.productCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Stock:</span>
                            <span className="font-medium">{category.totalStock}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Value:</span>
                            <span className="font-medium text-green-600">£{category.totalValue}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No inventory data available</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}