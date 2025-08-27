import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Users, 
  ShoppingCart, 
  Package, 
  DollarSign,
  Zap,
  BarChart3,
  Target,
  Clock,
  RefreshCw
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface DailyProductivityData {
  date: string;
  ordersProcessed: number;
  customersAdded: number;
  productsUpdated: number;
  campaignsSent: number;
  loginCount: number;
  sessionDuration: number;
  pagesViewed: number;
  dailyRevenue: number;
  newCustomerRevenue: number;
  productivityScore: number;
}

interface ProductivityPulseData {
  current: DailyProductivityData;
  trend: DailyProductivityData[];
  weeklyComparison: {
    thisWeek: number;
    lastWeek: number;
    percentageChange: number;
  };
  topActivities: Array<{
    activity: string;
    value: number;
    icon: string;
    trend: 'up' | 'down' | 'stable';
  }>;
  engagementLevel: 'low' | 'medium' | 'high';
  suggestions: string[];
}

interface ProductivityPulseWidgetProps {
  compact?: boolean;
  className?: string;
}

export function ProductivityPulseWidget({ compact = false, className = "" }: ProductivityPulseWidgetProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: pulseData, isLoading, refetch } = useQuery<ProductivityPulseData>({
    queryKey: ['/api/productivity-pulse'],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getEngagementColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getIconComponent = (iconName: string) => {
    const iconMap: { [key: string]: any } = {
      'ShoppingCart': ShoppingCart,
      'Users': Users,
      'Package': Package,
      'DollarSign': DollarSign,
    };
    return iconMap[iconName] || Activity;
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down': return <TrendingDown className="h-3 w-3 text-red-500" />;
      case 'stable': return <Minus className="h-3 w-3 text-gray-400" />;
    }
  };

  const formatValue = (value: number, activity: string) => {
    if (activity.includes('Revenue')) {
      return `£${value.toFixed(2)}`;
    }
    return value.toString();
  };

  if (isLoading) {
    return (
      <Card className={`${className} animate-pulse`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="h-6 bg-gray-200 rounded w-32"></div>
            <div className="h-8 bg-gray-200 rounded w-16"></div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pulseData) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Productivity Pulse</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load productivity data</p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={`${className} w-full`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-sm">Productivity</span>
            </div>
            <Badge className={getEngagementColor(pulseData.engagementLevel)}>
              {pulseData.engagementLevel}
            </Badge>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-2xl font-bold ${getScoreColor(pulseData.current.productivityScore)}`}>
                  {pulseData.current.productivityScore}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <Progress 
                value={pulseData.current.productivityScore} 
                className="h-2"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center space-x-1">
                <ShoppingCart className="h-3 w-3 text-blue-500" />
                <span>{pulseData.current.ordersProcessed} orders</span>
              </div>
              <div className="flex items-center space-x-1">
                <Users className="h-3 w-3 text-green-500" />
                <span>{pulseData.current.customersAdded} customers</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <div>
              <CardTitle className="text-lg">Productivity Pulse</CardTitle>
              <CardDescription>Real-time engagement insights</CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getEngagementColor(pulseData.engagementLevel)}>
              {pulseData.engagementLevel} engagement
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Main Score */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <span className={`text-4xl font-bold ${getScoreColor(pulseData.current.productivityScore)}`}>
              {pulseData.current.productivityScore}
            </span>
            <span className="text-xl text-muted-foreground">/ 100</span>
          </div>
          <Progress 
            value={pulseData.current.productivityScore} 
            className="h-3 w-full max-w-xs mx-auto"
          />
          <p className="text-sm text-muted-foreground">Today's productivity score</p>
        </div>

        {/* Weekly Comparison */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium">Weekly Trend</span>
            </div>
            <div className="flex items-center space-x-1">
              {pulseData.weeklyComparison.percentageChange > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : pulseData.weeklyComparison.percentageChange < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <Minus className="h-4 w-4 text-gray-400" />
              )}
              <span className={`text-sm font-medium ${
                pulseData.weeklyComparison.percentageChange > 0 ? 'text-green-600' :
                pulseData.weeklyComparison.percentageChange < 0 ? 'text-red-600' : 'text-gray-600'
              }`}>
                {Math.abs(pulseData.weeklyComparison.percentageChange).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>This week: {pulseData.weeklyComparison.thisWeek}</div>
            <div>Last week: {pulseData.weeklyComparison.lastWeek}</div>
          </div>
        </div>

        {/* Top Activities */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Target className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Today's Activities</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pulseData.topActivities.slice(0, 4).map((activity, index) => {
              const IconComponent = getIconComponent(activity.icon);
              return (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <IconComponent className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium truncate">{activity.activity}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-sm font-semibold">{formatValue(activity.value, activity.activity)}</span>
                    {getTrendIcon(activity.trend)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Suggestions */}
        {pulseData.suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Suggestions</span>
            </div>
            <div className="space-y-1">
              {pulseData.suggestions.slice(0, 2).map((suggestion, index) => (
                <p key={index} className="text-xs text-muted-foreground bg-orange-50 p-2 rounded">
                  {suggestion}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}