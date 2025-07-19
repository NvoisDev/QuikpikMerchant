import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, DollarSign, ShoppingCart, BarChart3, Calendar, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PromotionAnalyticsProps {
  productId: number;
  className?: string;
}

export function PromotionAnalytics({ productId, className }: PromotionAnalyticsProps) {
  // Fetch promotion analytics for this product
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['/api/promotion-analytics/product', productId],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch product performance summary
  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ['/api/promotion-analytics/performance', productId],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading || performanceLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Promotion Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics || analytics.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Promotion Analytics
          </CardTitle>
          <CardDescription className="text-xs">
            No promotional data yet
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getEffectivenessBadgeColor = (effectiveness: string) => {
    switch (effectiveness) {
      case 'high':
      case 'excellent':
        return 'bg-green-100 text-green-800';
      case 'medium':
      case 'good':
        return 'bg-blue-100 text-blue-800';
      case 'low':
      case 'average':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPromotionTypeLabel = (type: string) => {
    switch (type) {
      case 'percentage_discount':
        return 'Percentage Off';
      case 'fixed_amount_discount':
        return 'Fixed Discount';
      case 'bogo':
        return 'BOGO';
      case 'buy_x_get_y_free':
        return 'Buy X Get Y';
      case 'bulk_discount':
        return 'Bulk Discount';
      case 'fixed_price':
        return 'Fixed Price';
      case 'free_shipping':
        return 'Free Shipping';
      case 'bundle_deal':
        return 'Bundle Deal';
      default:
        return type;
    }
  };

  const totalRevenue = analytics.reduce((sum: number, promo: any) => sum + (promo.revenue || 0), 0);
  const totalOrders = analytics.reduce((sum: number, promo: any) => sum + (promo.orderCount || 0), 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Promotion Analytics
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-xs">Track the performance of your promotional campaigns. These metrics help you understand which promotions are most effective at driving sales and customer engagement.</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription className="text-xs">
            {analytics.length} active promotion{analytics.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-green-600" />
              <span className="font-medium">£{totalRevenue.toLocaleString()}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-2 w-2 text-gray-400 hover:text-gray-600 cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs"><strong>Total Revenue:</strong> Total money earned from orders where promotional offers were applied to this product.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1">
              <ShoppingCart className="h-3 w-3 text-blue-600" />
              <span className="font-medium">{totalOrders} orders</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-2 w-2 text-gray-400 hover:text-gray-600 cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs"><strong>Orders:</strong> Number of customer orders that included this product with promotional pricing applied.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-purple-600" />
              <span className="font-medium">£{avgOrderValue.toFixed(0)} AOV</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-2 w-2 text-gray-400 hover:text-gray-600 cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs"><strong>Average Order Value:</strong> Average amount customers spend per order when buying this product with promotions (Revenue ÷ Orders).</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3 text-orange-600" />
              <span className="font-medium">{performance?.conversionRate || 0}% conv.</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-2 w-2 text-gray-400 hover:text-gray-600 cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs"><strong>Conversion Rate:</strong> Percentage of customers who viewed this product and then purchased it with promotional pricing. Higher is better.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

        {/* Recent Promotions */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-700">Recent Promotions</h4>
          {analytics.slice(0, 2).map((promo: any, index: number) => (
            <div key={index} className="p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">
                  {getPromotionTypeLabel(promo.promotionType)}
                </span>
                <Badge 
                  className={`text-xs px-1 py-0 ${getEffectivenessBadgeColor(promo.effectiveness)}`}
                  variant="secondary"
                >
                  {promo.effectiveness}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>
                  {promo.promotionType === 'percentage_discount' && `${promo.discountPercentage}% off`}
                  {promo.promotionType === 'fixed_amount_discount' && `£${promo.discountAmount} off`}
                  {promo.promotionType === 'fixed_price' && `£${promo.fixedPrice}`}
                </span>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(promo.startDate).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-green-600 font-medium">£{promo.revenue.toLocaleString()}</span>
                <span className="text-blue-600">{promo.orderCount} orders</span>
              </div>
            </div>
          ))}
        </div>

        {/* Performance Summary */}
        {performance && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-600">
              <span className="font-medium">Best performer:</span> {performance.bestPerformingPromotion && getPromotionTypeLabel(performance.bestPerformingPromotion)}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              <span className="font-medium">Avg. uplift:</span> +{performance.averageOrderIncrease}% orders
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}