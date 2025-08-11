import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Package, 
  DollarSign, 
  ShoppingCart,
  BarChart3,
  PieChart,
  Calendar,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  Star
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

// Enhanced analytics dashboard combining existing order/product data with new insights
export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<string>("30days");
  const [activeTab, setActiveTab] = useState("overview");

  // Calculate date ranges for filtering
  const dateRanges = useMemo(() => {
    const now = new Date();
    const ranges = {
      "7days": {
        start: subDays(now, 7),
        end: now,
        label: "Last 7 days"
      },
      "30days": {
        start: subDays(now, 30),
        end: now,
        label: "Last 30 days"
      },
      "thismonth": {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: "This month"
      },
      "thisweek": {
        start: startOfWeek(now),
        end: endOfWeek(now),
        label: "This week"
      }
    };
    return ranges;
  }, []);

  // Fetch existing orders data with enhanced analytics
  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/orders", timeRange],
    enabled: !!user?.id,
  });

  // Fetch existing products data
  const { data: products = [], isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: !!user?.id,
  });

  // Calculate enhanced analytics from existing data
  const analytics = useMemo(() => {
    if (!orders.length || !products.length) {
      return {
        revenue: { total: 0, growth: 0, trend: "neutral" },
        orders: { total: 0, growth: 0, avgValue: 0 },
        customers: { total: 0, new: 0, returning: 0 },
        products: { total: 0, lowStock: 0, topSelling: [] },
        conversion: { rate: 0, campaigns: 0 },
        inventory: { value: 0, turnover: 0, alerts: [] }
      };
    }

    // Revenue analytics
    const totalRevenue = orders.reduce((sum: number, order: any) => sum + parseFloat(order.total || "0"), 0);
    const previousPeriodOrders = orders.filter((order: any) => {
      const orderDate = new Date(order.createdAt);
      const cutoff = subDays(new Date(), 60);
      return orderDate < cutoff;
    });
    const previousRevenue = previousPeriodOrders.reduce((sum: number, order: any) => sum + parseFloat(order.total || "0"), 0);
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Order analytics
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Customer analytics
    const uniqueCustomers = new Set(orders.map((order: any) => order.customerEmail || order.retailerId)).size;
    const customerOrderCounts = orders.reduce((acc: any, order: any) => {
      const customerId = order.customerEmail || order.retailerId;
      acc[customerId] = (acc[customerId] || 0) + 1;
      return acc;
    }, {});
    const newCustomers = Object.values(customerOrderCounts).filter((count: any) => count === 1).length;
    const returningCustomers = uniqueCustomers - newCustomers;

    // Product analytics
    const lowStockProducts = products.filter((product: any) => 
      product.stock <= (product.lowStockThreshold || 50)
    );
    
    // Calculate inventory value
    const inventoryValue = products.reduce((sum: number, product: any) => 
      sum + (parseFloat(product.price || "0") * (product.stock || 0)), 0
    );

    // Top selling products (based on orders)
    const productSales = orders.reduce((acc: any, order: any) => {
      // This would be enhanced with order items data
      return acc;
    }, {});

    return {
      revenue: { 
        total: totalRevenue, 
        growth: revenueGrowth, 
        trend: revenueGrowth > 0 ? "up" : revenueGrowth < 0 ? "down" : "neutral" 
      },
      orders: { 
        total: totalOrders, 
        growth: 0, // Would calculate from historical data
        avgValue: avgOrderValue 
      },
      customers: { 
        total: uniqueCustomers, 
        new: newCustomers, 
        returning: returningCustomers 
      },
      products: { 
        total: products.length, 
        lowStock: lowStockProducts.length, 
        topSelling: [] // Would populate with actual sales data
      },
      conversion: { 
        rate: 0, // Would calculate from campaign data
        campaigns: 0 
      },
      inventory: { 
        value: inventoryValue, 
        turnover: 0, // Would calculate based on sales velocity
        alerts: lowStockProducts 
      }
    };
  }, [orders, products, timeRange]);

  // Performance insights based on existing data
  const insights = useMemo(() => {
    const insights = [];
    
    if (analytics.revenue.growth > 10) {
      insights.push({
        type: "success",
        title: "Strong Revenue Growth",
        description: `Revenue is up ${analytics.revenue.growth.toFixed(1)}% compared to the previous period`,
        icon: TrendingUp
      });
    } else if (analytics.revenue.growth < -5) {
      insights.push({
        type: "warning",
        title: "Revenue Decline",
        description: `Revenue is down ${Math.abs(analytics.revenue.growth).toFixed(1)}% compared to the previous period`,
        icon: TrendingDown
      });
    }

    if (analytics.products.lowStock > 0) {
      insights.push({
        type: "alert",
        title: "Low Stock Alert",
        description: `${analytics.products.lowStock} products are running low on stock`,
        icon: AlertTriangle
      });
    }

    if (analytics.customers.returning > analytics.customers.new) {
      insights.push({
        type: "success",
        title: "Strong Customer Loyalty",
        description: `${analytics.customers.returning} returning customers vs ${analytics.customers.new} new customers`,
        icon: Star
      });
    }

    return insights;
  }, [analytics]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const getGrowthBadge = (growth: number) => {
    if (growth > 0) {
      return <Badge className="bg-green-100 text-green-800 border-green-300"><TrendingUp className="w-3 h-3 mr-1" />{growth.toFixed(1)}%</Badge>;
    } else if (growth < 0) {
      return <Badge className="bg-red-100 text-red-800 border-red-300"><TrendingDown className="w-3 h-3 mr-1" />{Math.abs(growth).toFixed(1)}%</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">No change</Badge>;
  };

  if (ordersLoading || productsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600">Comprehensive insights into your wholesale business performance</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(dateRanges).map(([key, range]) => (
                <SelectItem key={key} value={key}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((insight, index) => (
            <Card key={index} className={`border-l-4 ${
              insight.type === "success" ? "border-l-green-500 bg-green-50" :
              insight.type === "warning" ? "border-l-yellow-500 bg-yellow-50" :
              "border-l-red-500 bg-red-50"
            }`}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <insight.icon className={`w-5 h-5 mt-0.5 ${
                    insight.type === "success" ? "text-green-600" :
                    insight.type === "warning" ? "text-yellow-600" :
                    "text-red-600"
                  }`} />
                  <div>
                    <h3 className="font-semibold text-sm">{insight.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.revenue.total, user?.preferredCurrency || "GBP")}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {getGrowthBadge(analytics.revenue.growth)}
              <span>vs previous period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(analytics.orders.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: {formatCurrency(analytics.orders.avgValue, user?.preferredCurrency || "GBP")} per order
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.customers.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.customers.new} new, {analytics.customers.returning} returning
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.inventory.value, user?.preferredCurrency || "GBP")}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {analytics.products.lowStock > 0 && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  {analytics.products.lowStock} low stock
                </Badge>
              )}
              <span>{analytics.products.total} products</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Revenue Trends
                </CardTitle>
                <CardDescription>
                  Revenue performance over {dateRanges[timeRange as keyof typeof dateRanges]?.label.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Current Period</span>
                    <span className="font-semibold">{formatCurrency(analytics.revenue.total, user?.preferredCurrency || "GBP")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Growth Rate</span>
                    {getGrowthBadge(analytics.revenue.growth)}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Avg Order Value</span>
                    <span className="font-semibold">{formatCurrency(analytics.orders.avgValue, user?.preferredCurrency || "GBP")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5" />
                  Order Status
                </CardTitle>
                <CardDescription>Current order status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {["pending", "processing", "completed", "cancelled"].map((status) => {
                    const count = orders.filter((order: any) => order.status === status).length;
                    const percentage = analytics.orders.total > 0 ? (count / analytics.orders.total) * 100 : 0;
                    return (
                      <div key={status} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{status}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Acquisition</CardTitle>
                <CardDescription>New vs returning customers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">New Customers</span>
                    <span className="font-semibold">{analytics.customers.new}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Returning Customers</span>
                    <span className="font-semibold">{analytics.customers.returning}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Unique</span>
                    <span className="font-semibold">{analytics.customers.total}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Insights</CardTitle>
                <CardDescription>Understanding your customer base</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Retention Rate:</strong> {analytics.customers.total > 0 ? 
                        ((analytics.customers.returning / analytics.customers.total) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>Growth Opportunity:</strong> Focus on converting new customers to repeat buyers
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Product Performance</CardTitle>
                <CardDescription>Overview of your product catalog</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Products</span>
                    <span className="font-semibold">{analytics.products.total}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Low Stock Items</span>
                    <Badge variant={analytics.products.lowStock > 0 ? "destructive" : "secondary"}>
                      {analytics.products.lowStock}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Inventory Value</span>
                    <span className="font-semibold">{formatCurrency(analytics.inventory.value, user?.preferredCurrency || "GBP")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {analytics.inventory.alerts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Stock Alerts
                  </CardTitle>
                  <CardDescription>Products requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {analytics.inventory.alerts.slice(0, 5).map((product: any) => (
                      <div key={product.id} className="flex justify-between items-center p-2 bg-red-50 rounded">
                        <span className="text-sm font-medium">{product.name}</span>
                        <Badge variant="destructive" className="text-xs">
                          {product.stock} left
                        </Badge>
                      </div>
                    ))}
                    {analytics.inventory.alerts.length > 5 && (
                      <p className="text-xs text-gray-500 mt-2">
                        +{analytics.inventory.alerts.length - 5} more items
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Health</CardTitle>
                <CardDescription>Overall inventory status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Value</span>
                    <span className="font-semibold">{formatCurrency(analytics.inventory.value, user?.preferredCurrency || "GBP")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Items in Stock</span>
                    <span className="font-semibold">{products.filter((p: any) => p.stock > 0).length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Out of Stock</span>
                    <Badge variant={products.filter((p: any) => p.stock === 0).length > 0 ? "destructive" : "secondary"}>
                      {products.filter((p: any) => p.stock === 0).length}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reorder Recommendations</CardTitle>
                <CardDescription>Items to consider restocking</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.inventory.alerts.length === 0 ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">All products well stocked</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {analytics.inventory.alerts.slice(0, 3).map((product: any) => (
                        <div key={product.id} className="flex justify-between items-center text-sm">
                          <span>{product.name}</span>
                          <span className="text-gray-500">Reorder soon</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}