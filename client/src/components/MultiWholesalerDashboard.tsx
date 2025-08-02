import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currencies";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Users, 
  ShoppingBag, 
  TrendingUp, 
  Crown, 
  Medal,
  Award,
  Sparkles,
  Zap,
  Target,
  Gift
} from "lucide-react";

interface WholesalerStats {
  wholesaler_id: string;
  business_name: string;
  email: string;
  total_orders: number;
  total_revenue: number;
  total_products: number;
  customer_groups: number;
  total_customers: number;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  tier_level: number;
}

interface PlatformStats {
  total_wholesalers: number;
  total_customers: number;
  total_orders: number;
  total_platform_revenue: number;
  total_products: number;
}

interface GrowthStats {
  orders_this_week: number;
  orders_last_week: number;
  new_wholesalers_this_month: number;
}

const tierConfig = {
  platinum: { 
    icon: Crown, 
    color: "bg-gradient-to-r from-purple-400 to-purple-600", 
    textColor: "text-purple-100",
    emoji: "👑",
    name: "Platinum Elite"
  },
  gold: { 
    icon: Trophy, 
    color: "bg-gradient-to-r from-yellow-400 to-yellow-600", 
    textColor: "text-yellow-100",
    emoji: "🏆",
    name: "Gold Champion"
  },
  silver: { 
    icon: Medal, 
    color: "bg-gradient-to-r from-gray-400 to-gray-600", 
    textColor: "text-gray-100",
    emoji: "🥈",
    name: "Silver Star"
  },
  bronze: { 
    icon: Award, 
    color: "bg-gradient-to-r from-orange-400 to-orange-600", 
    textColor: "text-orange-100",
    emoji: "🥉",
    name: "Bronze Rising"
  }
};

export default function MultiWholesalerDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/dashboard/multi-wholesaler-stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="h-48 animate-pulse">
            <CardHeader className="space-y-2">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-6 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 text-center">
        <div className="text-muted-foreground">
          Unable to load dashboard data. Please try again later.
        </div>
      </Card>
    );
  }

  const { leaderboard = [], platform = {}, growth = {} } = data || {};
  const weeklyGrowth = (growth.orders_last_week || 0) > 0 
    ? (((growth.orders_this_week || 0) - (growth.orders_last_week || 0)) / (growth.orders_last_week || 0) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Platform Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Platform Revenue</p>
                  <p className="text-3xl font-bold">
                    {formatCurrency(platform.total_platform_revenue || 0, 'GBP')}
                  </p>
                </div>
                <div className="p-3 bg-white/20 rounded-full">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-gradient-to-br from-blue-500 to-cyan-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Active Wholesalers</p>
                  <p className="text-3xl font-bold">{platform.total_wholesalers || 0}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-full">
                  <Users className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Total Orders</p>
                  <p className="text-3xl font-bold">{(platform.total_orders || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-full">
                  <ShoppingBag className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-gradient-to-br from-orange-500 to-red-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Weekly Growth</p>
                  <p className="text-3xl font-bold">
                    {weeklyGrowth > 0 ? '+' : ''}{weeklyGrowth.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3 bg-white/20 rounded-full">
                  <Zap className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Wholesaler Leaderboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <CardTitle className="flex items-center gap-2">
              Wholesaler Champions
              <Sparkles className="h-4 w-4 text-yellow-500" />
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {leaderboard.map((wholesaler: WholesalerStats, index: number) => {
              const config = tierConfig[wholesaler.tier];
              const TierIcon = config.icon;
              
              return (
                <motion.div
                  key={wholesaler.wholesaler_id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  <Card className={`${config.color} ${config.textColor} border-0 overflow-hidden`}>
                    <CardContent className="p-6">
                      {/* Rank Badge */}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <span className="text-2xl">{config.emoji}</span>
                        <Badge variant="secondary" className="bg-white/20 text-white border-0">
                          #{index + 1}
                        </Badge>
                      </div>

                      <div className="space-y-4">
                        {/* Business Name */}
                        <div>
                          <h3 className="font-bold text-lg truncate">
                            {wholesaler.business_name}
                          </h3>
                          <p className="text-sm opacity-90">{config.name}</p>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4" />
                            <span>{wholesaler.total_orders} orders</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            <span>{formatCurrency(wholesaler.total_revenue, 'GBP')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span>{wholesaler.total_customers} customers</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Gift className="h-4 w-4" />
                            <span>{wholesaler.total_products} products</span>
                          </div>
                        </div>

                        {/* Achievement Progress */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Progress to Next Tier</span>
                            <span>
                              {wholesaler.tier === 'platinum' ? 'MAX' : 
                               wholesaler.tier === 'gold' ? `${wholesaler.total_orders}/50` :
                               wholesaler.tier === 'silver' ? `${wholesaler.total_orders}/20` :
                               `${wholesaler.total_orders}/10`}
                            </span>
                          </div>
                          {wholesaler.tier !== 'platinum' && (
                            <div className="w-full bg-white/20 rounded-full h-2">
                              <div 
                                className="bg-white h-2 rounded-full transition-all duration-300"
                                style={{ 
                                  width: `${
                                    wholesaler.tier === 'gold' ? (wholesaler.total_orders / 50 * 100) :
                                    wholesaler.tier === 'silver' ? (wholesaler.total_orders / 20 * 100) :
                                    (wholesaler.total_orders / 10 * 100)
                                  }%` 
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Growth Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-500" />
            Platform Growth Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{growth.orders_this_week || 0}</div>
              <p className="text-sm text-muted-foreground">Orders This Week</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{growth.new_wholesalers_this_month || 0}</div>
              <p className="text-sm text-muted-foreground">New Wholesalers This Month</p>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${weeklyGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {weeklyGrowth > 0 ? '+' : ''}{weeklyGrowth.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground">Weekly Growth Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}