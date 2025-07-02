import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

import StatsCard from "@/components/stats-card";
import { 
  DollarSign, 
  ShoppingCart, 
  Package, 
  MessageSquare,
  Plus,
  Bell,
  TrendingUp
} from "lucide-react";
import { Link } from "wouter";

export default function WholesalerDashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/analytics/stats"],
  });

  const { data: topProducts, isLoading: productsLoading } = useQuery({
    queryKey: ["/api/analytics/top-products"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/analytics/recent-orders"],
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex-1">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Welcome back! Here's what's happening with your business.
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/products">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Product
                </Button>
              </Link>
              <div className="relative">
                <Button variant="ghost" size="icon">
                  <Bell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    3
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Revenue"
              value={stats ? formatCurrency(stats.totalRevenue) : "$0"}
              change="+12.5% from last month"
              icon={DollarSign}
              iconColor="text-green-600"
              iconBg="bg-green-100"
              loading={statsLoading}
            />
            <StatsCard
              title="Orders This Month"
              value={stats?.ordersCount?.toString() || "0"}
              change="+8.2% from last month"
              icon={ShoppingCart}
              iconColor="text-blue-600"
              iconBg="bg-blue-100"
              loading={statsLoading}
            />
            <StatsCard
              title="Active Products"
              value={stats?.activeProducts?.toString() || "0"}
              change={`${stats?.lowStockCount || 0} low stock alerts`}
              icon={Package}
              iconColor="text-purple-600"
              iconBg="bg-purple-100"
              loading={statsLoading}
              changeColor="text-orange-600"
            />
            <StatsCard
              title="WhatsApp Reach"
              value="1,245"
              change="85% open rate"
              icon={MessageSquare}
              iconColor="text-green-600"
              iconBg="bg-green-100"
            />
          </div>

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
                    {topProducts?.slice(0, 3).map((product) => (
                      <div key={product.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <img 
                            src="https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=50&h=50" 
                            alt={product.name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-600">{product.orderCount} orders</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">
                            {formatCurrency(product.revenue)}
                          </p>
                          <p className="text-sm text-green-600 flex items-center">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +15.2%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Orders</CardTitle>
              <Button variant="ghost" size="sm">
                View All
              </Button>
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
                      {recentOrders?.slice(0, 5).map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #ORD-{order.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {order.retailer?.businessName || order.retailer?.firstName + " " + order.retailer?.lastName}
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
