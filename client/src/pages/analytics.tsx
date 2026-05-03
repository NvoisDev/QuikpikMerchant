import { useState } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import PageHeader from "@/components/PageHeader";
import { subDays, startOfToday } from "date-fns";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Package,
  Calendar,
  Download,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  MessageSquare,
  Clock,
  XCircle
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

type TimeRange = "7d" | "30d" | "90d" | "1y";

interface AnalyticsData {
  revenue: {
    total: number;
    change: number;
    trend: Array<{ date: string; amount: number }>;
  };
  orders: {
    total: number;
    change: number;
    trend: Array<{ date: string; count: number }>;
  };
  customers: {
    total: number;
    new: number;
    returning: number;
    trend: Array<{ date: string; new: number; returning: number }>;
  };
  products: {
    active: number;
    lowStock: number;
    topPerformers: Array<{ name: string; revenue: number; orders: number }>;
  };
  geography: Array<{ region: string; orders: number; revenue: number }>;
  channels: Array<{ channel: string; orders: number; revenue: number }>;
  broadcasts: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
  };
}

export default function Analytics() {
  const { formatMoney } = useCurrency();
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(startOfToday(), 29),
    to: startOfToday(),
    label: "Last 30 days"
  });

  const { data: analyticsData, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/dashboard", timeRange],
    enabled: !!user,
  });

  const { data: revenueData = [] } = useQuery<{ date: string; amount: number }[]>({
    queryKey: ["/api/analytics/revenue", timeRange],
    enabled: !!user,
  });

  const { data: customerData = [] } = useQuery<{ date: string; count: number }[]>({
    queryKey: ["/api/analytics/customers", timeRange],
    enabled: !!user,
  });

  const { data: productPerformance = [] } = useQuery<{ name: string; revenue: number; quantity: number; orders?: number }[]>({
    queryKey: ["/api/analytics/products", timeRange],
    enabled: !!user,
  });

  const { data: cancellationData } = useQuery<{
    totalCancelled: number;
    totalRefunded: string;
    totalValue: string;
    cancellationRate: string;
    reasonBreakdown: Array<{ reason: string; count: number }>;
    initiatedBy: { customer: number; wholesaler: number };
    requests: { pending: number; approved: number; rejected: number; total: number };
  }>({
    queryKey: ["/api/analytics/cancellations", timeRange],
    enabled: !!user,
  });

  const formatChange = (change: number) => {
    const isPositive = change >= 0;
    return (
      <span className={`flex items-center text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
        {Math.abs(change).toFixed(1)}%
      </span>
    );
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
    <PageHeader title="Analytics & Reports" description="Track your business performance and insights">
      <DateRangePicker 
        value={dateRange} 
        onChange={setDateRange}
        className="min-w-48"
      />
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
    </PageHeader>
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6">

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "revenue", label: "Revenue", icon: DollarSign },
          { id: "customers", label: "Customers", icon: Users },
          { id: "products", label: "Products", icon: Package },
          { id: "marketing", label: "Marketing", icon: MessageSquare },
          { id: "cancellations", label: "Cancellations", icon: XCircle }
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"}
          >
            <tab.icon className="h-4 w-4 mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatMoney(analyticsData?.revenue.total || 0)}
                    </p>
                    {formatChange(analyticsData?.revenue.change || 0)}
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{analyticsData?.orders.total || 0}</p>
                    {formatChange(analyticsData?.orders.change || 0)}
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Customers</p>
                    <p className="text-2xl font-bold text-gray-900">{analyticsData?.customers.total || 0}</p>
                    <p className="text-sm text-green-600">+{analyticsData?.customers.new || 0} new</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Products</p>
                    <p className="text-2xl font-bold text-gray-900">{analyticsData?.products.active || 0}</p>
                    <p className="text-sm text-orange-600">{analyticsData?.products.lowStock || 0} low stock</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip formatter={(value) => [formatMoney(Number(value)), "Revenue"]} />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#3B82F6" 
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Revenue Tab */}
      {activeTab === "revenue" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData?.channels || []}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="revenue"
                      label={(entry) => entry.channel}
                    >
                      {(analyticsData?.channels || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [formatMoney(Number(value)), "Revenue"]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(analyticsData?.products.topPerformers || []).map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.orders} orders</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatMoney(product.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customers Tab */}
      {activeTab === "customers" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={customerData}>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="new" 
                      stackId="1"
                      stroke="#10B981" 
                      fill="#10B981" 
                      name="New Customers"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="returning" 
                      stackId="1"
                      stroke="#3B82F6" 
                      fill="#3B82F6" 
                      name="Returning Customers"
                    />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Geographic Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(analyticsData?.geography || []).map((region, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{region.region}</p>
                      <p className="text-sm text-gray-600">{region.orders} orders</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatMoney(region.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === "products" && (
        <Card>
          <CardHeader>
            <CardTitle>Product Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productPerformance}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#3B82F6" name="Orders" />
                  <Bar dataKey="revenue" fill="#10B981" name="Revenue (£)" />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Marketing Tab */}
      {activeTab === "marketing" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp Campaign Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <MessageSquare className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-600">{analyticsData?.broadcasts.sent || 0}</p>
                  <p className="text-sm text-gray-600">Messages Sent</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <Eye className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-600">{analyticsData?.broadcasts.opened || 0}</p>
                  <p className="text-sm text-gray-600">Opened</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Open Rate</span>
                  <span className="text-sm font-medium">
                    {analyticsData?.broadcasts.sent ? 
                      ((analyticsData.broadcasts.opened / analyticsData.broadcasts.sent) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ 
                      width: `${analyticsData?.broadcasts.sent ? 
                        ((analyticsData.broadcasts.opened / analyticsData.broadcasts.sent) * 100) : 0}%` 
                    }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign ROI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <p className="text-3xl font-bold text-green-600">234%</p>
                <p className="text-gray-600">Average Campaign ROI</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cancellations Tab */}
      {activeTab === "cancellations" && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Cancelled</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {cancellationData?.totalCancelled || 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">orders</p>
                  </div>
                  <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Cancellation Rate</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {cancellationData?.cancellationRate || '0'}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">of total orders</p>
                  </div>
                  <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Refunded</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatMoney(parseFloat(cancellationData?.totalRefunded || '0'))}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">refund value</p>
                  </div>
                  <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending Requests</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {cancellationData?.requests?.pending || 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">awaiting review</p>
                  </div>
                  <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Reason Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Cancellation Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {cancellationData?.reasonBreakdown && cancellationData.reasonBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {cancellationData.reasonBreakdown.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div 
                            className="w-3 h-3 rounded-full mr-3"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-sm text-gray-700">{item.reason}</span>
                        </div>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No cancellations in this period</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Initiated By */}
            <Card>
              <CardHeader>
                <CardTitle>Cancellation Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-blue-600">
                      {cancellationData?.initiatedBy?.customer || 0}
                    </p>
                    <p className="text-sm text-gray-600">Customer Requested</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <Package className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-purple-600">
                      {cancellationData?.initiatedBy?.wholesaler || 0}
                    </p>
                    <p className="text-sm text-gray-600">Wholesaler Initiated</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Customer Request Status</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-lg font-semibold text-gray-700">
                        {cancellationData?.requests?.total || 0}
                      </p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div className="p-2 bg-green-50 rounded">
                      <p className="text-lg font-semibold text-green-700">
                        {cancellationData?.requests?.approved || 0}
                      </p>
                      <p className="text-xs text-gray-500">Approved</p>
                    </div>
                    <div className="p-2 bg-red-50 rounded">
                      <p className="text-lg font-semibold text-red-700">
                        {cancellationData?.requests?.rejected || 0}
                      </p>
                      <p className="text-xs text-gray-500">Rejected</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Value Impact */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Order Value Lost</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatMoney(parseFloat(cancellationData?.totalValue || '0'))}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Refunds Issued</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatMoney(parseFloat(cancellationData?.totalRefunded || '0'))}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Recovery Rate</p>
                  <p className="text-2xl font-bold text-green-600">
                    {parseFloat(cancellationData?.totalValue || '0') > 0 
                      ? (100 - (parseFloat(cancellationData?.totalRefunded || '0') / parseFloat(cancellationData?.totalValue || '1') * 100)).toFixed(1)
                      : '0'}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </div>
  );
}