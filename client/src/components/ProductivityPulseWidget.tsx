import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Users, ShoppingCart, Package, DollarSign, Zap, Target, Clock, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

interface ProductivityPulseData {
  current: {
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
  };
  trend: Array<{
    date: string;
    productivityScore: number;
    ordersProcessed: number;
    customersAdded: number;
    dailyRevenue: number;
  }>;
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

const iconMap = {
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  Zap,
  Activity,
  Clock
};

export default function ProductivityPulseWidget() {
  const { user, isAuthenticated } = useAuth();

  const { data: pulseData, isLoading, error } = useQuery<ProductivityPulseData>({
    queryKey: ["/api/productivity-pulse"],
    enabled: isAuthenticated && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });

  if (!isAuthenticated || !user) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Productivity Pulse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-24 bg-muted rounded"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !pulseData) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Productivity Pulse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Unable to load productivity data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getEngagementColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down': return <TrendingDown className="h-3 w-3 text-red-500" />;
      default: return <div className="h-3 w-3 rounded-full bg-gray-400"></div>;
    }
  };

  const formatTrendData = (data: any[]) => {
    return data.map(item => ({
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: item.productivityScore || 0,
      orders: item.ordersProcessed || 0,
      revenue: item.dailyRevenue || 0
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="col-span-1 lg:col-span-2"
    >
      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Productivity Pulse
            </CardTitle>
            <Badge className={`${getEngagementColor(pulseData.engagementLevel)} border`}>
              {pulseData.engagementLevel.charAt(0).toUpperCase() + pulseData.engagementLevel.slice(1)} Activity
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Main Score Display */}
          <div className="text-center space-y-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="relative inline-block"
            >
              <div className="relative w-24 h-24 mx-auto">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-muted stroke-current opacity-20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - (pulseData.current.productivityScore / 100))}`}
                    className="text-primary stroke-current transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {pulseData.current.productivityScore}
                  </span>
                </div>
              </div>
            </motion.div>
            <p className="text-sm text-muted-foreground">Today's Productivity Score</p>
            
            {/* Weekly Comparison */}
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="text-center">
                <p className="text-muted-foreground">This Week</p>
                <p className="font-semibold">{pulseData.weeklyComparison.thisWeek}</p>
              </div>
              <div className="flex items-center gap-1">
                {pulseData.weeklyComparison.percentageChange > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className={pulseData.weeklyComparison.percentageChange > 0 ? "text-green-600" : "text-red-600"}>
                  {Math.abs(pulseData.weeklyComparison.percentageChange)}%
                </span>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Last Week</p>
                <p className="font-semibold">{pulseData.weeklyComparison.lastWeek}</p>
              </div>
            </div>
          </div>

          {/* Activity Grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            {pulseData.topActivities.map((activity, index) => {
              const IconComponent = iconMap[activity.icon as keyof typeof iconMap] || Activity;
              return (
                <motion.div
                  key={activity.activity}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="bg-muted/50 rounded-lg p-3 text-center space-y-1"
                >
                  <div className="flex items-center justify-center gap-1">
                    <IconComponent className="h-4 w-4 text-primary" />
                    {getTrendIcon(activity.trend)}
                  </div>
                  <p className="text-lg font-bold">{activity.value}</p>
                  <p className="text-xs text-muted-foreground">{activity.activity}</p>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Trend Chart */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="space-y-2"
          >
            <h4 className="text-sm font-medium">7-Day Trend</h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formatTrendData(pulseData.trend)}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Suggestions */}
          {pulseData.suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="space-y-2"
            >
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Smart Suggestions
              </h4>
              <div className="space-y-1">
                {pulseData.suggestions.slice(0, 2).map((suggestion, index) => (
                  <p key={index} className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                    {suggestion}
                  </p>
                ))}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}