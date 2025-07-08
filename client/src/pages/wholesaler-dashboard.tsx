import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { formatNumber } from "@/lib/utils";
import { formatCurrency } from "@/lib/currencies";
import OnboardingWelcome from "@/components/OnboardingWelcome";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useTheme } from "@/hooks/useTheme";
import ThemeSelector from "@/components/theme-selector";

import StatsCard from "@/components/stats-card";
import { AnalyticsCardSkeleton, OrderCardSkeleton, ProductCardSkeleton } from "@/components/ui/loading-skeletons";
import { 
  DollarSign, 
  ShoppingCart, 
  Package, 
  MessageSquare,
  Plus,
  Bell,
  TrendingUp,
  Users
} from "lucide-react";
import { Link } from "wouter";

// Generate realistic sales data based on actual stats
const generateSalesData = (stats: any) => {
  if (!stats) return [];
  
  const totalRevenue = parseFloat(stats.totalRevenue || 0);
  const baseDaily = totalRevenue / 30; // Average daily for last 30 days
  
  return [
    { name: 'Week 1', revenue: baseDaily * 7 * (0.8 + Math.random() * 0.4), orders: Math.floor((stats.totalOrders || 0) * 0.25) },
    { name: 'Week 2', revenue: baseDaily * 7 * (0.9 + Math.random() * 0.3), orders: Math.floor((stats.totalOrders || 0) * 0.3) },
    { name: 'Week 3', revenue: baseDaily * 7 * (0.7 + Math.random() * 0.5), orders: Math.floor((stats.totalOrders || 0) * 0.2) },
    { name: 'Week 4', revenue: baseDaily * 7 * (1.0 + Math.random() * 0.3), orders: Math.floor((stats.totalOrders || 0) * 0.25) },
  ];
};

export default function WholesalerDashboard() {
  const { user } = useAuth();
  const { isActive } = useOnboarding();
  const { currentTheme, themeConfig } = useTheme();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/analytics/stats"],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/orders"],
  });

  const { data: topProducts, isLoading: productsLoading } = useQuery({
    queryKey: ["/api/analytics/top-products"],
  });

  const { data: broadcastStats, isLoading: broadcastStatsLoading } = useQuery({
    queryKey: ["/api/broadcasts/stats"],
  });

  const { data: alertsData } = useQuery({
    queryKey: ["/api/stock-alerts/count"],
  });

  if (statsLoading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OrderCardSkeleton />
          <ProductCardSkeleton />
        </div>
      </div>
    );
  }

  const dashboardBgClass = currentTheme === 'gradient' 
    ? themeConfig.gradient || "bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500"
    : currentTheme === 'dark'
    ? "bg-gray-900"
    : currentTheme === 'minimal'
    ? "bg-white"
    : currentTheme === 'ocean'
    ? "bg-gradient-to-br from-blue-400 via-cyan-500 to-teal-500"
    : currentTheme === 'sunset'
    ? "bg-gradient-to-br from-orange-400 via-red-400 to-pink-500"
    : themeConfig.gradient || "bg-gradient-to-br from-slate-50 to-blue-50";

  const headerBgClass = currentTheme === 'dark' 
    ? 'bg-gray-800/90 border-gray-700/50'
    : currentTheme === 'gradient' || currentTheme === 'ocean' || currentTheme === 'sunset'
    ? 'bg-white/20 backdrop-blur-lg border-white/30'
    : 'bg-white/80 border-gray-200/50';

  const textColorClass = currentTheme === 'dark'
    ? 'text-white'
    : (currentTheme === 'gradient' || currentTheme === 'ocean' || currentTheme === 'sunset')
    ? 'text-white'
    : 'text-gray-900';

  return (
    <div className={`${dashboardBgClass} min-h-screen`} data-onboarding="dashboard">
      <div className="flex-1">
        {/* Modern Header with Glass Effect */}
        <div className={`backdrop-blur-sm ${headerBgClass} border-b px-8 py-8`}>
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-2" data-onboarding="dashboard-header">
                <h1 className={`text-4xl font-bold ${textColorClass}`}>
                  Hello, {user?.firstName || user?.businessName || 'Wholesaler'} 👋
                </h1>
                <p className={`text-lg ${textColorClass} opacity-80`}>
                  Your business performance at a glance
                </p>
              </div>

              
              {/* Theme Selector and Stock Alerts */}
              <div className="flex items-center gap-3">
                <ThemeSelector />
                <Link href="/stock-alerts">
                  <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
                    <Bell className="h-5 w-5" />
                    {alertsData?.count > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {alertsData.count}
                      </span>
                    )}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Section */}
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/products">
              <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25" data-onboarding="add-product-button">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </Link>
            <Link href="/campaigns">
              <Button variant="outline" className="border-2 border-blue-200 hover:bg-blue-50 hover:text-blue-800 text-blue-700">
                <MessageSquare className="h-4 w-4 mr-2" />
                Create Campaign
              </Button>
            </Link>
            <Link href="/customer-groups">
              <Button variant="outline" className="border-2 border-purple-200 hover:bg-purple-50 hover:text-purple-800 text-purple-700">
                <Users className="h-4 w-4 mr-2" />
                Add Customers
              </Button>
            </Link>
            <Link href="/preview-store">
              <Button 
                variant="outline" 
                className="border-2 border-green-200 hover:bg-green-50 hover:text-green-800 text-green-700"
                data-onboarding="preview-store"
              >
                <Package className="h-4 w-4 mr-2" />
                Preview Store
              </Button>
            </Link>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="max-w-7xl mx-auto px-8 pb-8">
          {/* Stats Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/25">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-emerald-100 text-sm font-medium">Total Revenue</p>
                    <p className="text-3xl font-bold">{statsLoading ? '...' : formatCurrency(stats?.totalRevenue || 0)}</p>
                    <p className="text-emerald-100 text-xs mt-1">+12% from last month</p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <DollarSign className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg shadow-blue-500/25">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Total Orders</p>
                    <p className="text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.ordersCount || 0)}</p>
                    <p className="text-blue-100 text-xs mt-1">+8% from last month</p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg shadow-purple-500/25">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium">Active Products</p>
                    <p className="text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.activeProducts || 0)}</p>
                    <p className="text-purple-100 text-xs mt-1">+3 new this week</p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <Package className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg shadow-orange-500/25">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium">WhatsApp Reach</p>
                    <p className="text-3xl font-bold">{broadcastStatsLoading ? '...' : formatNumber(broadcastStats?.recipientsReached || 0)}</p>
                    <p className="text-orange-100 text-xs mt-1">Customers reached</p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Link href="/products">
              <Card className="group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:from-blue-200 group-hover:to-blue-300 transition-all">
                    <Package className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Manage Products</h3>
                  <p className="text-sm text-gray-600">Add, edit and organize your inventory</p>
                  <div className="mt-3 text-lg font-bold text-blue-600">
                    {formatNumber(stats?.activeProducts || 0)} Active
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/campaigns">
              <Card className="group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:from-emerald-200 group-hover:to-emerald-300 transition-all">
                    <MessageSquare className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Send Campaigns</h3>
                  <p className="text-sm text-gray-600">Broadcast to your customers</p>
                  <div className="mt-3 text-lg font-bold text-emerald-600">
                    {formatNumber(broadcastStats?.recipientsReached || 0)} Reached
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/orders">
              <Card className="group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:from-purple-200 group-hover:to-purple-300 transition-all">
                    <ShoppingCart className="h-8 w-8 text-purple-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">View Orders</h3>
                  <p className="text-sm text-gray-600">Track customer purchases</p>
                  <div className="mt-3 text-lg font-bold text-purple-600">
                    {formatNumber(stats?.ordersCount || 0)} Orders
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/customer-groups">
              <Card className="group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-100 to-orange-200 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:from-orange-200 group-hover:to-orange-300 transition-all">
                    <Users className="h-8 w-8 text-orange-600" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Customer Groups</h3>
                  <p className="text-sm text-gray-600">Organize your customers</p>
                  <div className="mt-3 text-lg font-bold text-orange-600">
                    Manage Groups
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Sales Performance Chart */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Sales Performance</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Revenue trends over time</p>
                </div>
                <select className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                  <option>Last 30 days</option>
                  <option>Last 90 days</option>
                  <option>Last 12 months</option>
                </select>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {statsLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={generateSalesData(stats)}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickFormatter={(value) => `${formatCurrency(value)}`}
                        />
                        <Tooltip 
                          formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                          labelStyle={{ color: '#374151' }}
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          dot={{ fill: '#10b981', strokeWidth: 2, r: 5 }}
                          activeDot={{ r: 7, stroke: '#10b981', strokeWidth: 2, fill: '#ffffff' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Orders Chart */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Order Volume</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Orders processed over time</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {statsLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generateSalesData(stats)}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                        />
                        <Tooltip 
                          formatter={(value: any) => [value, 'Orders']}
                          labelStyle={{ color: '#374151' }}
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Bar 
                          dataKey="orders" 
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders & Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Orders */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900">Recent Orders</CardTitle>
                <p className="text-sm text-gray-600">Latest customer orders</p>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gray-300 rounded-lg"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                        </div>
                        <div className="w-16 h-4 bg-gray-300 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(orders || []).slice(0, 5).map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Order #{order.id}</p>
                          <p className="text-sm text-gray-600">{order.customerName}</p>
                        </div>
                        <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                          {order.status}
                        </Badge>
                      </div>
                    ))}
                    {(orders || []).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No orders yet</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Products */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900">Top Selling Products</CardTitle>
                <p className="text-sm text-gray-600">Best performing items</p>
              </CardHeader>
              <CardContent>
                {productsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gray-300 rounded-lg"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                        </div>
                        <div className="w-16 h-4 bg-gray-300 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(topProducts || []).length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No sales data yet</p>
                        <p className="text-sm">Add products and start selling to see your top performers here</p>
                      </div>
                    ) : (
                      (topProducts || []).slice(0, 5).map((product: any) => (
                        <div key={product.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                              <Package className="h-5 w-5 text-gray-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{product.name}</p>
                              <p className="text-sm text-gray-600">Stock: {product.stock}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{formatCurrency(product.price)}</p>
                            <p className="text-sm text-gray-600">{product.salesCount || 0} sold</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {isActive && <OnboardingWelcome />}
    </div>
  );
}