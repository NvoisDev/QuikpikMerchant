import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { formatNumber } from "@/lib/utils";
import OnboardingWelcome from "@/components/OnboardingWelcome";

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

export default function WholesalerDashboard() {
  const { user } = useAuth();
  const { isActive } = useOnboarding();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/analytics/stats"],
  });

  const { data: topProducts, isLoading: productsLoading } = useQuery({
    queryKey: ["/api/analytics/top-products"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/analytics/recent-orders"],
  });

  const { data: broadcastStats, isLoading: broadcastStatsLoading } = useQuery({
    queryKey: ["/api/analytics/broadcast-stats"],
  });

  const { data: alertsData } = useQuery({
    queryKey: ['/api/stock-alerts/count'],
  });

  const formatCurrency = (amount: number) => {
    const currency = user?.preferredCurrency || 'GBP';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // High-quality warehouse/stock images that rotate randomly
  const warehouseImages = [
    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&h=400&q=80", // Modern warehouse with organized shelving
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&h=400&q=80", // Large warehouse with high shelving
    "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&h=400&q=80", // Warehouse with boxes and equipment
    "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&h=400&q=80", // Distribution center view
    "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&h=400&q=80", // Professional warehouse interior
    "https://images.unsplash.com/photo-1601598851547-4302969d0614?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&h=400&q=80"  // Clean organized warehouse
  ];

  const getRandomWarehouseImage = () => {
    const randomIndex = Math.floor(Math.random() * warehouseImages.length);
    return warehouseImages[randomIndex];
  };

  return (
    <div className="min-h-screen bg-gray-50" data-onboarding="dashboard">
      <div className="flex-1">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
          <div className="flex justify-between items-center">
            <div data-onboarding="dashboard-header">
              <h1 className="text-2xl font-bold text-gray-900">
                {user?.businessName || "Dashboard"}
              </h1>
              <p className="text-gray-600 mt-1">
                Welcome back! Here's what's happening with your business.
              </p>
              <div className="mt-3 flex items-center space-x-3">
                <Link href="/products">
                  <Button size="sm" data-onboarding="add-product-button">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </Link>
                <Link href="/campaigns">
                  <Button variant="outline" size="sm">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Create Campaign
                  </Button>
                </Link>
                <Link href="/customer-groups">
                  <Button variant="outline" size="sm">
                    <Users className="mr-2 h-4 w-4" />
                    Add Customers
                  </Button>
                </Link>
                <Link href="/preview-store">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-700"
                    data-onboarding="preview-store"
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Preview Store
                  </Button>
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Link href="/stock-alerts">
                  <Button variant="ghost" size="icon">
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

        {/* Dashboard Content */}
        <div className="p-8">
          {/* Sales Overview Header with Warehouse Image */}
          <Card className="overflow-hidden mb-8">
            <div className="relative">
              {/* Warehouse Background Image */}
              <div 
                className="h-64 bg-cover bg-center relative"
                style={{
                  backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${getRandomWarehouseImage()}')`
                }}
              >
                <div className="absolute inset-0 flex items-center justify-between p-8">
                  <div className="text-white">
                    <h1 className="text-4xl font-bold mb-2">Sales Overview</h1>
                    <p className="text-xl opacity-90">
                      {user?.businessName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Your Business'}
                    </p>
                    <div className="mt-4 flex items-center space-x-8">
                      <div className="text-center">
                        <div className="text-3xl font-bold">{statsLoading ? '...' : formatCurrency(stats?.totalRevenue || 0)}</div>
                        <div className="text-sm opacity-80">Total Revenue</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.ordersCount || 0)}</div>
                        <div className="text-sm opacity-80">Total Orders</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.activeProducts || 0)}</div>
                        <div className="text-sm opacity-80">Active Products</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold">{broadcastStatsLoading ? '...' : formatNumber(broadcastStats?.recipientsReached || 0)}</div>
                        <div className="text-sm opacity-80">Customers Reached</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Time Period Selector */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <select className="bg-transparent text-white border border-white/30 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/50">
                      <option value="30" className="text-gray-900">Last 30 days</option>
                      <option value="90" className="text-gray-900">Last 90 days</option>
                      <option value="365" className="text-gray-900">Last year</option>
                      <option value="all" className="text-gray-900">All time</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </Card>
          
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsLoading ? (
              <>
                <AnalyticsCardSkeleton />
                <AnalyticsCardSkeleton />
                <AnalyticsCardSkeleton />
                <AnalyticsCardSkeleton />
              </>
            ) : (
              <>
                <StatsCard
                  title="Total Revenue"
                  value={stats ? formatCurrency(stats.totalRevenue || 0) : formatCurrency(0)}
                  change={stats?.totalRevenue > 0 ? "From completed orders" : "No sales yet"}
                  icon={DollarSign}
                  iconColor="text-green-600"
                  iconBg="bg-green-100"
                  loading={statsLoading}
                  changeColor={stats?.totalRevenue > 0 ? "text-green-600" : "text-gray-500"}
                  tooltip="Total earnings from all completed orders and sales"
                />
                <StatsCard
                  title="Total Orders"
                  value={formatNumber(stats?.ordersCount || 0)}
                  change={stats?.ordersCount > 0 ? "All-time orders" : "No orders yet"}
                  icon={ShoppingCart}
                  iconColor="text-blue-600"
                  iconBg="bg-blue-100"
                  loading={statsLoading}
                  changeColor={stats?.ordersCount > 0 ? "text-blue-600" : "text-gray-500"}
                  tooltip="Total number of orders received from customers"
                />
                <StatsCard
                  title="Active Products"
                  value={formatNumber(stats?.activeProducts || 0)}
                  change={`${formatNumber(alertsData?.count || 0)} stock alerts`}
                  icon={Package}
                  iconColor="text-purple-600"
                  iconBg="bg-purple-100"
                  loading={statsLoading}
                  changeColor={alertsData?.count > 0 ? "text-red-600" : "text-green-600"}
                  tooltip="Products currently available for sale in your inventory"
                />
                <StatsCard
                  title="WhatsApp Reach"
                  value={formatNumber(broadcastStats?.recipientsReached || 0)}
                  change={`${broadcastStats?.totalBroadcasts || 0} campaigns sent`}
                  icon={MessageSquare}
                  iconColor="text-green-600"
                  iconBg="bg-green-100"
                  loading={broadcastStatsLoading}
                  tooltip="Total customers reached through WhatsApp broadcast campaigns"
                />
              </>
            )}
          </div>

          {/* Quick Actions Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <p className="text-sm text-gray-600">Get started with common tasks</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href="/products">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20">
                    <CardContent className="flex flex-col items-center p-6 text-center">
                      <div className="bg-blue-100 p-3 rounded-full mb-3">
                        <Package className="h-6 w-6 text-blue-600" />
                      </div>
                      <h3 className="font-medium text-gray-900">Add Products</h3>
                      <p className="text-sm text-gray-500 mt-1">List new inventory items</p>
                    </CardContent>
                  </Card>
                </Link>
                
                <Link href="/campaigns">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20">
                    <CardContent className="flex flex-col items-center p-6 text-center">
                      <div className="bg-green-100 p-3 rounded-full mb-3">
                        <MessageSquare className="h-6 w-6 text-green-600" />
                      </div>
                      <h3 className="font-medium text-gray-900">Send Campaign</h3>
                      <p className="text-sm text-gray-500 mt-1">Broadcast to customers</p>
                    </CardContent>
                  </Card>
                </Link>
                
                <Link href="/customer-groups">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20">
                    <CardContent className="flex flex-col items-center p-6 text-center">
                      <div className="bg-purple-100 p-3 rounded-full mb-3">
                        <Users className="h-6 w-6 text-purple-600" />
                      </div>
                      <h3 className="font-medium text-gray-900">Manage Customers</h3>
                      <p className="text-sm text-gray-500 mt-1">Add or organize groups</p>
                    </CardContent>
                  </Card>
                </Link>
                
                <Link href="/orders">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20">
                    <CardContent className="flex flex-col items-center p-6 text-center">
                      <div className="bg-orange-100 p-3 rounded-full mb-3">
                        <ShoppingCart className="h-6 w-6 text-orange-600" />
                      </div>
                      <h3 className="font-medium text-gray-900">View Orders</h3>
                      <p className="text-sm text-gray-500 mt-1">Process recent orders</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Charts and Tables Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Sales Chart */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Sales Overview</CardTitle>
                <select className="text-sm border border-gray-300 rounded-lg px-3 py-2">
                  <option>Last 30 days</option>
                  <option>Last 90 days</option>
                  <option>Last 12 months</option>
                </select>
              </CardHeader>
              <CardContent>
                <div className="h-40 flex items-center justify-center bg-gray-100 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=250" 
                    alt="Sales analytics visualization" 
                    className="rounded-lg w-full h-full object-cover"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Top Products */}
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Products</CardTitle>
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
                      (topProducts || []).slice(0, 3).map((product: any, index: number) => (
                        <div key={product.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="relative">
                              {product.imageUrl ? (
                                <img 
                                  src={product.imageUrl} 
                                  alt={product.name}
                                  className="w-12 h-12 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center">
                                  <Package className="h-6 w-6 text-gray-400" />
                                </div>
                              )}
                              <div className="absolute -top-2 -left-2 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                                {index + 1}
                              </div>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{product.name}</p>
                              <p className="text-sm text-gray-600">{formatNumber(product.orderCount)} orders • {formatNumber(product.totalQuantitySold)} units sold</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900">
                              {formatCurrency(product.revenue)}
                            </p>
                            <div className="flex items-center text-sm text-green-600">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              Top #{index + 1}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Orders</CardTitle>
              <Link href="/orders">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-4 py-4">
                      <div className="w-16 h-4 bg-gray-300 rounded"></div>
                      <div className="w-32 h-4 bg-gray-300 rounded"></div>
                      <div className="w-24 h-4 bg-gray-300 rounded"></div>
                      <div className="w-20 h-4 bg-gray-300 rounded"></div>
                      <div className="w-16 h-6 bg-gray-300 rounded"></div>
                      <div className="w-20 h-4 bg-gray-300 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  {(recentOrders || []).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No orders yet</p>
                      <p className="text-sm">Your recent customer orders will appear here</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Order ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Customer
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(recentOrders || []).slice(0, 5).map((order: any) => (
                            <tr key={order.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                #ORD-{order.id}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {order.retailer?.businessName || [order.retailer?.firstName, order.retailer?.lastName].filter(Boolean).join(' ') || 'Unknown Customer'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatCurrency(parseFloat(order.total))}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge 
                                  variant={
                                    order.status === 'completed' ? 'default' :
                                    order.status === 'processing' ? 'secondary' :
                                    order.status === 'shipped' ? 'outline' : 'destructive'
                                  }
                                >
                                  {order.status}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(order.createdAt!)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
