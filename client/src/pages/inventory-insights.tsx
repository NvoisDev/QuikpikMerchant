import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  BarChart3,
  Search,
  Filter,
  RefreshCw,
  ShoppingCart,
  Calendar,
  Target,
  Clock,
  Zap
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { format, differenceInDays, startOfMonth, subDays } from "date-fns";

// Enhanced inventory insights that analyze product performance and stock optimization
export default function InventoryInsights() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("stockValue");
  const [filterBy, setFilterBy] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  // Fetch existing products
  const { data: products = [], isLoading: productsLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: !!user?.id,
  });

  // Fetch orders to calculate sales velocity
  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    enabled: !!user?.id,
  });

  // Calculate comprehensive inventory insights
  const inventoryInsights = useMemo(() => {
    if (!products.length) return [];

    // Calculate sales data for each product from orders
    const productSalesMap = new Map();
    
    // Initialize sales data for all products
    products.forEach((product: any) => {
      productSalesMap.set(product.id, {
        totalSold: 0,
        revenue: 0,
        orderCount: 0,
        lastSaleDate: null,
        salesVelocity: 0 // units per day
      });
    });

    // This would normally come from order_items table, 
    // but we'll simulate based on order data
    orders.forEach((order: any) => {
      // In a real implementation, you'd join with order_items
      // For now, we'll estimate based on order patterns
      if (order.total && parseFloat(order.total) > 0) {
        // Simple estimation - would be replaced with actual order items data
        const estimatedProductsPerOrder = Math.ceil(parseFloat(order.total) / 50); // Assuming avg product price of £50
        
        // Distribute across random products for demonstration
        products.slice(0, Math.min(estimatedProductsPerOrder, products.length)).forEach((product: any, index: number) => {
          const salesData = productSalesMap.get(product.id);
          if (salesData) {
            salesData.totalSold += 1;
            salesData.revenue += parseFloat(product.price || "0");
            salesData.orderCount += 1;
            salesData.lastSaleDate = new Date(order.createdAt);
          }
        });
      }
    });

    // Calculate sales velocity (30-day average)
    productSalesMap.forEach((salesData, productId) => {
      if (salesData.lastSaleDate) {
        const daysSinceFirstSale = Math.max(differenceInDays(new Date(), salesData.lastSaleDate), 1);
        salesData.salesVelocity = salesData.totalSold / Math.min(daysSinceFirstSale, 30);
      }
    });

    // Enhance products with insights
    const enhancedProducts = products.map((product: any) => {
      const salesData = productSalesMap.get(product.id) || {
        totalSold: 0,
        revenue: 0,
        orderCount: 0,
        lastSaleDate: null,
        salesVelocity: 0
      };

      const currentStock = product.stock || 0;
      const lowStockThreshold = product.lowStockThreshold || 50;
      const price = parseFloat(product.price || "0");
      const stockValue = currentStock * price;

      // Calculate days of stock remaining
      const daysOfStockRemaining = salesData.salesVelocity > 0 ? 
        Math.floor(currentStock / salesData.salesVelocity) : 999;

      // Calculate turnover rate (annualized)
      const annualTurnover = salesData.salesVelocity * 365;
      const turnoverRate = currentStock > 0 ? annualTurnover / currentStock : 0;

      // Determine stock status
      let stockStatus = 'healthy';
      let stockStatusColor = 'green';
      
      if (currentStock === 0) {
        stockStatus = 'out_of_stock';
        stockStatusColor = 'red';
      } else if (currentStock <= lowStockThreshold) {
        stockStatus = 'low_stock';
        stockStatusColor = 'yellow';
      } else if (daysOfStockRemaining < 7) {
        stockStatus = 'critical';
        stockStatusColor = 'red';
      } else if (daysOfStockRemaining > 90 && salesData.salesVelocity > 0) {
        stockStatus = 'overstocked';
        stockStatusColor = 'blue';
      }

      // Performance classification
      let performanceClass = 'average';
      if (salesData.salesVelocity > 2) performanceClass = 'fast_moving';
      else if (salesData.salesVelocity < 0.1 && salesData.totalSold > 0) performanceClass = 'slow_moving';
      else if (salesData.totalSold === 0) performanceClass = 'no_sales';

      return {
        ...product,
        ...salesData,
        stockValue,
        daysOfStockRemaining,
        turnoverRate,
        stockStatus,
        stockStatusColor,
        performanceClass,
        profitMargin: price > 0 ? ((price - (price * 0.7)) / price) * 100 : 0, // Estimated 30% COGS
        suggestedReorderQuantity: Math.max(salesData.salesVelocity * 30, lowStockThreshold), // 30-day supply
        daysSinceLastSale: salesData.lastSaleDate ? differenceInDays(new Date(), salesData.lastSaleDate) : null
      };
    });

    return enhancedProducts;
  }, [products, orders]);

  // Get unique categories for filtering
  const categories = useMemo(() => {
    const cats = new Set(products.map((p: any) => p.category).filter(Boolean));
    return Array.from(cats);
  }, [products]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = inventoryInsights;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Category filter
    if (category !== 'all') {
      filtered = filtered.filter(product => product.category === category);
    }

    // Status filter
    switch (filterBy) {
      case 'low_stock':
        filtered = filtered.filter(product => product.stockStatus === 'low_stock' || product.stockStatus === 'critical');
        break;
      case 'out_of_stock':
        filtered = filtered.filter(product => product.stockStatus === 'out_of_stock');
        break;
      case 'overstocked':
        filtered = filtered.filter(product => product.stockStatus === 'overstocked');
        break;
      case 'fast_moving':
        filtered = filtered.filter(product => product.performanceClass === 'fast_moving');
        break;
      case 'slow_moving':
        filtered = filtered.filter(product => product.performanceClass === 'slow_moving');
        break;
      case 'no_sales':
        filtered = filtered.filter(product => product.performanceClass === 'no_sales');
        break;
    }

    // Sort products
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'stockValue':
          return b.stockValue - a.stockValue;
        case 'salesVelocity':
          return b.salesVelocity - a.salesVelocity;
        case 'daysOfStock':
          return a.daysOfStockRemaining - b.daysOfStockRemaining;
        case 'turnoverRate':
          return b.turnoverRate - a.turnoverRate;
        case 'revenue':
          return b.revenue - a.revenue;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.stockValue - a.stockValue;
      }
    });

    return filtered;
  }, [inventoryInsights, searchTerm, filterBy, category, sortBy]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalProducts = inventoryInsights.length;
    const totalStockValue = inventoryInsights.reduce((sum, p) => sum + p.stockValue, 0);
    const lowStockCount = inventoryInsights.filter(p => p.stockStatus === 'low_stock' || p.stockStatus === 'critical').length;
    const outOfStockCount = inventoryInsights.filter(p => p.stockStatus === 'out_of_stock').length;
    const overstockedCount = inventoryInsights.filter(p => p.stockStatus === 'overstocked').length;
    const fastMovingCount = inventoryInsights.filter(p => p.performanceClass === 'fast_moving').length;
    const slowMovingCount = inventoryInsights.filter(p => p.performanceClass === 'slow_moving').length;
    const noSalesCount = inventoryInsights.filter(p => p.performanceClass === 'no_sales').length;
    
    const totalRevenue = inventoryInsights.reduce((sum, p) => sum + p.revenue, 0);
    const avgTurnoverRate = inventoryInsights.reduce((sum, p) => sum + p.turnoverRate, 0) / totalProducts || 0;

    return {
      totalProducts,
      totalStockValue,
      lowStockCount,
      outOfStockCount,
      overstockedCount,
      fastMovingCount,
      slowMovingCount,
      noSalesCount,
      totalRevenue,
      avgTurnoverRate,
      healthyStockPercentage: totalProducts > 0 ? ((totalProducts - lowStockCount - outOfStockCount - overstockedCount) / totalProducts) * 100 : 0
    };
  }, [inventoryInsights]);

  const getStatusBadge = (status: string, color: string) => {
    const colors = {
      green: "bg-green-100 text-green-800 border-green-300",
      yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
      red: "bg-red-100 text-red-800 border-red-300",
      blue: "bg-blue-100 text-blue-800 border-blue-300"
    };
    return (
      <Badge className={colors[color as keyof typeof colors] || colors.green}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPerformanceBadge = (performanceClass: string) => {
    const badges = {
      fast_moving: { label: "Fast Moving", color: "bg-green-100 text-green-800", icon: Zap },
      slow_moving: { label: "Slow Moving", color: "bg-yellow-100 text-yellow-800", icon: Clock },
      no_sales: { label: "No Sales", color: "bg-red-100 text-red-800", icon: AlertTriangle },
      average: { label: "Average", color: "bg-gray-100 text-gray-800", icon: BarChart3 }
    };
    
    const badge = badges[performanceClass as keyof typeof badges] || badges.average;
    const Icon = badge.icon;
    
    return (
      <Badge className={badge.color}>
        <Icon className="w-3 h-3 mr-1" />
        {badge.label}
      </Badge>
    );
  };

  if (productsLoading || ordersLoading) {
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
          <h1 className="text-3xl font-bold text-gray-900">Inventory Insights</h1>
          <p className="text-gray-600">Optimize your stock levels and identify opportunities</p>
        </div>
        <Button onClick={() => refetch()} className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh Data
        </Button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summaryStats.totalStockValue, user?.preferredCurrency || "GBP")}
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.totalProducts} products • {summaryStats.healthyStockPercentage.toFixed(1)}% healthy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summaryStats.lowStockCount + summaryStats.outOfStockCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.lowStockCount} low • {summaryStats.outOfStockCount} out of stock
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Turnover Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.avgTurnoverRate.toFixed(1)}x</div>
            <p className="text-xs text-muted-foreground">Annual inventory turns</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fast Movers</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summaryStats.fastMovingCount}</div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.slowMovingCount} slow • {summaryStats.noSalesCount} no sales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryStats.lowStockCount > 0 && (
          <Card className="border-l-4 border-l-red-500 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-red-800">Urgent Reorders Needed</h3>
                  <p className="text-sm text-red-600">{summaryStats.lowStockCount} products running low</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        )}

        {summaryStats.overstockedCount > 0 && (
          <Card className="border-l-4 border-l-blue-500 bg-blue-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-blue-800">Overstock Opportunities</h3>
                  <p className="text-sm text-blue-600">{summaryStats.overstockedCount} products overstocked</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        )}

        {summaryStats.fastMovingCount > 0 && (
          <Card className="border-l-4 border-l-green-500 bg-green-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-green-800">Top Performers</h3>
                  <p className="text-sm text-green-600">{summaryStats.fastMovingCount} fast-moving products</p>
                </div>
                <Zap className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterBy} onValueChange={setFilterBy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            <SelectItem value="low_stock">Low Stock</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            <SelectItem value="overstocked">Overstocked</SelectItem>
            <SelectItem value="fast_moving">Fast Moving</SelectItem>
            <SelectItem value="slow_moving">Slow Moving</SelectItem>
            <SelectItem value="no_sales">No Sales</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stockValue">Stock Value</SelectItem>
            <SelectItem value="salesVelocity">Sales Velocity</SelectItem>
            <SelectItem value="daysOfStock">Days of Stock</SelectItem>
            <SelectItem value="turnoverRate">Turnover Rate</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Product Inventory Analysis</CardTitle>
          <CardDescription>
            Showing {filteredProducts.length} of {inventoryInsights.length} products
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Stock Value</TableHead>
                  <TableHead>Sales Velocity</TableHead>
                  <TableHead>Days of Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Turnover Rate</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-gray-500">{product.category}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{product.stock} units</div>
                        <div className="text-sm text-gray-500">
                          Threshold: {product.lowStockThreshold}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatCurrency(product.stockValue, user?.preferredCurrency || "GBP")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{product.salesVelocity.toFixed(2)}/day</div>
                        <div className="text-sm text-gray-500">
                          {product.totalSold} total sold
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {product.daysOfStockRemaining === 999 ? '∞' : product.daysOfStockRemaining} days
                        </div>
                        {product.daysSinceLastSale !== null && (
                          <div className="text-sm text-gray-500">
                            Last sale: {product.daysSinceLastSale} days ago
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(product.stockStatus, product.stockStatusColor)}
                    </TableCell>
                    <TableCell>
                      {getPerformanceBadge(product.performanceClass)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{product.turnoverRate.toFixed(1)}x</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(product.stockStatus === 'low_stock' || product.stockStatus === 'critical') && (
                          <Button size="sm" variant="outline" className="text-xs h-6">
                            Reorder {product.suggestedReorderQuantity}
                          </Button>
                        )}
                        {product.stockStatus === 'overstocked' && (
                          <Button size="sm" variant="outline" className="text-xs h-6">
                            Promote
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}