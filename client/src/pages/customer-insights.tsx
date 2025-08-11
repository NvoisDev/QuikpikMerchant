import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { 
  Users, 
  UserCheck, 
  UserX, 
  Star, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Calendar,
  Search,
  Filter,
  Mail,
  Phone,
  MapPin
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { format, differenceInDays } from "date-fns";

// Enhanced customer insights page that analyzes existing order data
export default function CustomerInsights() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("totalSpent");
  const [filterBy, setFilterBy] = useState<string>("all");

  // Fetch existing orders to analyze customer behavior
  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    enabled: !!user?.id,
  });

  // Calculate comprehensive customer insights from order data
  const customerInsights = useMemo(() => {
    if (!orders.length) return [];

    // Group orders by customer
    const customerMap = new Map();
    
    orders.forEach((order: any) => {
      const customerId = order.customerEmail || order.retailerId || `guest-${order.id}`;
      const customerName = order.customerName || 
                          (order.retailer ? `${order.retailer.firstName || ''} ${order.retailer.lastName || ''}`.trim() : '') ||
                          'Guest Customer';
      const customerEmail = order.customerEmail || order.retailer?.email || '';
      
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          id: customerId,
          name: customerName,
          email: customerEmail,
          phone: order.customerPhone || order.retailer?.phoneNumber || '',
          orders: [],
          totalSpent: 0,
          totalOrders: 0,
          firstOrderDate: null,
          lastOrderDate: null,
          averageOrderValue: 0,
          daysSinceLastOrder: 0,
          orderFrequency: 0,
          loyaltyScore: 0,
          riskLevel: 'low',
          customerTier: 'bronze',
          isReturning: false
        });
      }

      const customer = customerMap.get(customerId);
      customer.orders.push(order);
      customer.totalSpent += parseFloat(order.total || "0");
      customer.totalOrders += 1;
      
      const orderDate = new Date(order.createdAt);
      if (!customer.firstOrderDate || orderDate < customer.firstOrderDate) {
        customer.firstOrderDate = orderDate;
      }
      if (!customer.lastOrderDate || orderDate > customer.lastOrderDate) {
        customer.lastOrderDate = orderDate;
      }
    });

    // Calculate derived metrics for each customer
    const customerInsights = Array.from(customerMap.values()).map((customer: any) => {
      customer.averageOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;
      customer.daysSinceLastOrder = customer.lastOrderDate ? differenceInDays(new Date(), customer.lastOrderDate) : 0;
      customer.isReturning = customer.totalOrders > 1;
      
      // Calculate order frequency (orders per month)
      if (customer.firstOrderDate && customer.lastOrderDate) {
        const daysBetween = differenceInDays(customer.lastOrderDate, customer.firstOrderDate) || 1;
        customer.orderFrequency = customer.totalOrders / (daysBetween / 30);
      }

      // Calculate loyalty score (0-100)
      let loyaltyScore = 0;
      loyaltyScore += Math.min(customer.totalOrders * 10, 40); // Orders (max 40 points)
      loyaltyScore += Math.min(customer.totalSpent / 100, 30); // Spending (max 30 points)
      loyaltyScore += customer.orderFrequency > 1 ? 20 : customer.orderFrequency > 0.5 ? 10 : 0; // Frequency (max 20 points)
      loyaltyScore += customer.daysSinceLastOrder < 30 ? 10 : customer.daysSinceLastOrder < 60 ? 5 : 0; // Recency (max 10 points)
      customer.loyaltyScore = Math.min(loyaltyScore, 100);

      // Determine customer tier
      if (customer.loyaltyScore >= 80) customer.customerTier = 'platinum';
      else if (customer.loyaltyScore >= 60) customer.customerTier = 'gold';
      else if (customer.loyaltyScore >= 40) customer.customerTier = 'silver';
      else customer.customerTier = 'bronze';

      // Determine risk level
      if (customer.daysSinceLastOrder > 90) customer.riskLevel = 'high';
      else if (customer.daysSinceLastOrder > 60) customer.riskLevel = 'medium';
      else customer.riskLevel = 'low';

      return customer;
    });

    return customerInsights;
  }, [orders]);

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    let filtered = customerInsights;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(customer => 
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Category filter
    switch (filterBy) {
      case 'returning':
        filtered = filtered.filter(customer => customer.isReturning);
        break;
      case 'new':
        filtered = filtered.filter(customer => !customer.isReturning);
        break;
      case 'high-value':
        filtered = filtered.filter(customer => customer.totalSpent > 1000);
        break;
      case 'at-risk':
        filtered = filtered.filter(customer => customer.riskLevel === 'high');
        break;
      case 'vip':
        filtered = filtered.filter(customer => customer.customerTier === 'platinum' || customer.customerTier === 'gold');
        break;
    }

    // Sort customers
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'totalSpent':
          return b.totalSpent - a.totalSpent;
        case 'totalOrders':
          return b.totalOrders - a.totalOrders;
        case 'loyaltyScore':
          return b.loyaltyScore - a.loyaltyScore;
        case 'lastOrderDate':
          return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.totalSpent - a.totalSpent;
      }
    });

    return filtered;
  }, [customerInsights, searchTerm, filterBy, sortBy]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalCustomers = customerInsights.length;
    const returningCustomers = customerInsights.filter(c => c.isReturning).length;
    const newCustomers = totalCustomers - returningCustomers;
    const averageOrderValue = customerInsights.reduce((sum, c) => sum + c.averageOrderValue, 0) / totalCustomers || 0;
    const totalRevenue = customerInsights.reduce((sum, c) => sum + c.totalSpent, 0);
    const vipCustomers = customerInsights.filter(c => c.customerTier === 'platinum' || c.customerTier === 'gold').length;
    const atRiskCustomers = customerInsights.filter(c => c.riskLevel === 'high').length;

    return {
      totalCustomers,
      returningCustomers,
      newCustomers,
      averageOrderValue,
      totalRevenue,
      vipCustomers,
      atRiskCustomers,
      retentionRate: totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0
    };
  }, [customerInsights]);

  const getTierBadge = (tier: string) => {
    const colors = {
      platinum: "bg-purple-100 text-purple-800 border-purple-300",
      gold: "bg-yellow-100 text-yellow-800 border-yellow-300",
      silver: "bg-gray-100 text-gray-800 border-gray-300",
      bronze: "bg-orange-100 text-orange-800 border-orange-300"
    };
    return <Badge className={colors[tier as keyof typeof colors] || colors.bronze}>{tier}</Badge>;
  };

  const getRiskBadge = (risk: string) => {
    const colors = {
      high: "bg-red-100 text-red-800 border-red-300",
      medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
      low: "bg-green-100 text-green-800 border-green-300"
    };
    return <Badge className={colors[risk as keyof typeof colors] || colors.low}>{risk} risk</Badge>;
  };

  if (ordersLoading) {
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
          <h1 className="text-3xl font-bold text-gray-900">Customer Insights</h1>
          <p className="text-gray-600">Understand your customers and grow your relationships</p>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.returningCustomers} returning • {summaryStats.newCustomers} new
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer Retention</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.retentionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.returningCustomers} of {summaryStats.totalCustomers} customers returned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summaryStats.averageOrderValue, user?.preferredCurrency || "GBP")}
            </div>
            <p className="text-xs text-muted-foreground">Per customer average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VIP Customers</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.vipCustomers}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {summaryStats.atRiskCustomers > 0 && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  {summaryStats.atRiskCustomers} at risk
                </Badge>
              )}
              <span>Gold & Platinum</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search customers by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterBy} onValueChange={setFilterBy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="returning">Returning</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="high-value">High Value</SelectItem>
            <SelectItem value="vip">VIP (Gold/Platinum)</SelectItem>
            <SelectItem value="at-risk">At Risk</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="totalSpent">Total Spent</SelectItem>
            <SelectItem value="totalOrders">Order Count</SelectItem>
            <SelectItem value="loyaltyScore">Loyalty Score</SelectItem>
            <SelectItem value="lastOrderDate">Last Order</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
          <CardDescription>
            Showing {filteredCustomers.length} of {customerInsights.length} customers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Avg Order</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Loyalty Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-sm text-gray-500">
                          {customer.isReturning ? (
                            <Badge variant="secondary" className="text-xs">Returning</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">New</Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {customer.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="w-3 h-3" />
                            <span>{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="w-3 h-3" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{customer.totalOrders}</div>
                      <div className="text-sm text-gray-500">
                        {customer.orderFrequency.toFixed(1)}/month
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatCurrency(customer.totalSpent, user?.preferredCurrency || "GBP")}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatCurrency(customer.averageOrderValue, user?.preferredCurrency || "GBP")}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">
                          {customer.lastOrderDate ? format(customer.lastOrderDate, "MMM dd, yyyy") : "Never"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {customer.daysSinceLastOrder} days ago
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getTierBadge(customer.customerTier)}</TableCell>
                    <TableCell>{getRiskBadge(customer.riskLevel)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${customer.loyaltyScore}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{customer.loyaltyScore}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {filteredCustomers.length === 0 && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}