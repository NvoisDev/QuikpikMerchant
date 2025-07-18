import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  ShoppingCart, 
  DollarSign, 
  Eye,
  MousePointer,
  Package,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  Filter,
  Download
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { formatNumber } from "@/lib/utils";

interface CampaignPerformanceProps {
  campaigns: any[];
  onRefresh: () => void;
}

interface PerformanceMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalRecipients: number;
  totalViews: number;
  totalClicks: number;
  totalOrders: number;
  totalRevenue: number;
  averageConversionRate: number;
  averageClickRate: number;
  bestPerformingCampaign: any;
  recentPerformance: any[];
}

export function CampaignPerformanceDashboard({ campaigns, onRefresh }: CampaignPerformanceProps) {
  const [timeFilter, setTimeFilter] = useState("7d");
  const [campaignFilter, setCampaignFilter] = useState("all");

  // Fetch campaign performance analytics
  const { data: performanceData, isLoading, refetch } = useQuery({
    queryKey: ['/api/campaigns/analytics', timeFilter, campaignFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeFilter,
        campaignFilter
      });
      const response = await fetch(`/api/campaigns/analytics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch performance data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const metrics: PerformanceMetrics = performanceData || {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.status === 'sent').length,
    totalRecipients: 0,
    totalViews: 0,
    totalClicks: 0,
    totalOrders: 0,
    totalRevenue: 0,
    averageConversionRate: 0,
    averageClickRate: 0,
    bestPerformingCampaign: null,
    recentPerformance: []
  };

  const handleRefresh = () => {
    refetch();
    onRefresh();
  };

  const getChangeIcon = (value: number) => {
    if (value > 0) return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    if (value < 0) return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getChangeColor = (value: number) => {
    if (value > 0) return "text-green-600";
    if (value < 0) return "text-red-600";
    return "text-gray-500";
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaign Performance</h2>
          <p className="text-gray-600">Track your marketing campaign effectiveness and ROI</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 3 months</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              <SelectItem value="single">Single product</SelectItem>
              <SelectItem value="multi">Multi product</SelectItem>
              <SelectItem value="promotional">With offers</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Campaigns</p>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.totalCampaigns)}</p>
                <div className="flex items-center mt-1">
                  {getChangeIcon(5)}
                  <span className={`text-xs ml-1 ${getChangeColor(5)}`}>
                    +5% from last period
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Recipients</p>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.totalRecipients)}</p>
                <div className="flex items-center mt-1">
                  {getChangeIcon(12)}
                  <span className={`text-xs ml-1 ${getChangeColor(12)}`}>
                    +12% from last period
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.averageConversionRate.toFixed(1)}%</p>
                <div className="flex items-center mt-1">
                  {getChangeIcon(8)}
                  <span className={`text-xs ml-1 ${getChangeColor(8)}`}>
                    +8% from last period
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.totalRevenue)}</p>
                <div className="flex items-center mt-1">
                  {getChangeIcon(15)}
                  <span className={`text-xs ml-1 ${getChangeColor(15)}`}>
                    +15% from last period
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="campaigns">Top Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Campaign Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  Campaign Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium">Single Product</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{campaigns.filter(c => c.campaignType === 'single').length}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({((campaigns.filter(c => c.campaignType === 'single').length / Math.max(campaigns.length, 1)) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">Multi Product</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{campaigns.filter(c => c.campaignType === 'multi').length}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({((campaigns.filter(c => c.campaignType === 'multi').length / Math.max(campaigns.length, 1)) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                      <span className="text-sm font-medium">With Promotions</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">
                        {campaigns.filter(c => 
                          (c.promotionalOffers && c.promotionalOffers.length > 0) ||
                          (c.products && c.products.some((p: any) => p.promotionalOffers && p.promotionalOffers.length > 0))
                        ).length}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({((campaigns.filter(c => 
                          (c.promotionalOffers && c.promotionalOffers.length > 0) ||
                          (c.products && c.products.some((p: any) => p.promotionalOffers && p.promotionalOffers.length > 0))
                        ).length / Math.max(campaigns.length, 1)) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Campaign Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-green-600" />
                  Campaign Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-100 text-green-800 border-green-300">
                        Sent
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{campaigns.filter(c => c.status === 'sent').length}</span>
                      <span className="text-xs text-gray-500 ml-2">campaigns</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-gray-300">
                        Draft
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{campaigns.filter(c => c.status === 'draft').length}</span>
                      <span className="text-xs text-gray-500 ml-2">campaigns</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-blue-300 text-blue-800">
                        Scheduled
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{campaigns.filter(c => c.status === 'scheduled').length}</span>
                      <span className="text-xs text-gray-500 ml-2">campaigns</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagement" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Views</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.totalViews)}</p>
                  </div>
                  <Eye className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Clicks</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.totalClicks)}</p>
                  </div>
                  <MousePointer className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Click Rate</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.averageClickRate.toFixed(1)}%</p>
                  </div>
                  <Target className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.totalOrders)}</p>
                  </div>
                  <ShoppingCart className="h-8 w-8 text-amber-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-green-800">Total Campaign Revenue</p>
                      <p className="text-2xl font-bold text-green-900">{formatCurrency(metrics.totalRevenue)}</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-600" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Average Order Value</span>
                      <span className="font-medium">{formatCurrency(metrics.totalOrders > 0 ? metrics.totalRevenue / metrics.totalOrders : 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Revenue per Campaign</span>
                      <span className="font-medium">{formatCurrency(metrics.totalCampaigns > 0 ? metrics.totalRevenue / metrics.totalCampaigns : 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Revenue per Recipient</span>
                      <span className="font-medium">{formatCurrency(metrics.totalRecipients > 0 ? metrics.totalRevenue / metrics.totalRecipients : 0)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center text-gray-500">
                    <BarChart3 className="h-16 w-16 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Revenue trend chart will be available with more campaign data</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaigns.filter(c => c.status === 'sent').slice(0, 5).map((campaign, index) => (
                  <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                        <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{campaign.title}</p>
                        <p className="text-sm text-gray-600">
                          {campaign.campaignType === 'single' ? 'Single Product' : 'Multi Product'} • 
                          {campaign.lastSentAt ? new Date(campaign.lastSentAt).toLocaleDateString() : 'Not sent'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-sm font-medium">0</p>
                          <p className="text-xs text-gray-500">Orders</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">{formatCurrency(0)}</p>
                          <p className="text-xs text-gray-500">Revenue</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">0%</p>
                          <p className="text-xs text-gray-500">Conv. Rate</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {campaigns.filter(c => c.status === 'sent').length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No sent campaigns yet</p>
                    <p className="text-sm">Campaign performance data will appear here after sending campaigns</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}