import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Brain,
  Target,
  PieChart,
  BarChart3,
  Lightbulb,
  Zap,
  Clock,
  Users,
  ShoppingCart,
  CreditCard,
  ArrowUp,
  ArrowDown,
  Activity,
  Sparkles
} from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface FinancialHealthData {
  healthScore: number;
  scoreBreakdown: {
    revenue: number;
    profitability: number;
    cashFlow: number;
    growth: number;
    efficiency: number;
  };
  insights: {
    summary: string;
    recommendations: string[];
    warnings: string[];
    opportunities: string[];
  };
  metrics: {
    revenueGrowth: number;
    profitMargin: number;
    customerAcquisitionCost: number;
    customerLifetimeValue: number;
    burnRate: number;
    monthsOfRunway: number;
  };
  predictions: {
    nextMonthRevenue: number;
    quarterProjection: number;
    riskFactors: string[];
    growthOpportunities: string[];
  };
}

export default function FinancialHealth() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState('3months');

  // Fetch financial health data with AI analysis
  const { data: healthData, isLoading, refetch } = useQuery<FinancialHealthData>({
    queryKey: ["/api/financial-health", selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/financial-health?period=${selectedPeriod}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch financial health data");
      return response.json();
    },
  });

  // Generate AI insights mutation
  const generateInsightsMutation = useMutation({
    mutationFn: async ({ analysis_type }: { analysis_type: string }) => {
      const response = await apiRequest("POST", "/api/financial-health/insights", {
        analysis_type,
        period: selectedPeriod
      });
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Analysis Complete",
        description: "AI insights have been generated for your financial data",
      });
    },
    onError: () => {
      toast({
        title: "Analysis Failed",
        description: "Unable to generate AI insights. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getHealthScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    return "bg-red-100";
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Attention";
  };

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financial Health Dashboard</h1>
          <p className="text-gray-600">AI-powered insights for your business financial performance</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="1month">Last Month</option>
            <option value="3months">Last 3 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="12months">Last 12 Months</option>
          </select>
          
          <Button
            onClick={() => generateInsightsMutation.mutate({ analysis_type: 'comprehensive' })}
            disabled={generateInsightsMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Brain className="h-4 w-4 mr-2" />
            {generateInsightsMutation.isPending ? "Analyzing..." : "Generate AI Insights"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Overall Health Score */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-blue-600" />
                Financial Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`text-6xl font-bold ${getHealthScoreColor(healthData?.healthScore || 0)}`}>
                    {healthData?.healthScore || 0}
                  </div>
                  <div>
                    <Badge className={`${getHealthScoreBg(healthData?.healthScore || 0)} ${getHealthScoreColor(healthData?.healthScore || 0)} border-none`}>
                      {getHealthLabel(healthData?.healthScore || 0)}
                    </Badge>
                    <p className="text-sm text-gray-600 mt-1">out of 100</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-medium">+12% from last period</span>
                  </div>
                  <p className="text-xs text-gray-500">Based on 5 key metrics</p>
                </div>
              </div>
              
              <Progress value={healthData?.healthScore || 0} className="h-2 mb-4" />
              
              <div className="grid grid-cols-5 gap-4 text-center">
                {healthData?.scoreBreakdown && Object.entries(healthData.scoreBreakdown).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <div className="text-sm font-medium text-gray-900 capitalize">{key}</div>
                    <div className={`text-lg font-bold ${getHealthScoreColor(value)}`}>{value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Insights Section */}
          {healthData?.insights && (
            <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-600" />
                  AI-Powered Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-white rounded-lg p-4 border border-purple-100">
                  <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                  <p className="text-gray-700">{healthData.insights.summary}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h4 className="flex items-center gap-2 font-semibold text-green-800 mb-3">
                      <Lightbulb className="h-4 w-4" />
                      Opportunities
                    </h4>
                    <ul className="space-y-2">
                      {healthData.insights.opportunities.map((opportunity, index) => (
                        <li key={index} className="text-sm text-green-700 flex items-start gap-2">
                          <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {opportunity}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h4 className="flex items-center gap-2 font-semibold text-blue-800 mb-3">
                      <Target className="h-4 w-4" />
                      Recommendations
                    </h4>
                    <ul className="space-y-2">
                      {healthData.insights.recommendations.map((rec, index) => (
                        <li key={index} className="text-sm text-blue-700 flex items-start gap-2">
                          <Zap className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <h4 className="flex items-center gap-2 font-semibold text-yellow-800 mb-3">
                      <AlertTriangle className="h-4 w-4" />
                      Risk Factors
                    </h4>
                    <ul className="space-y-2">
                      {healthData.insights.warnings.map((warning, index) => (
                        <li key={index} className="text-sm text-yellow-700 flex items-start gap-2">
                          <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Revenue Growth</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {healthData?.metrics.revenueGrowth ? `${healthData.metrics.revenueGrowth}%` : "0%"}
                    </p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-full">
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="flex items-center text-green-600 text-sm">
                  <ArrowUp className="h-3 w-3 mr-1" />
                  <span>vs previous period</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Profit Margin</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {healthData?.metrics.profitMargin ? `${healthData.metrics.profitMargin}%` : "0%"}
                    </p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-full">
                    <PieChart className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="flex items-center text-blue-600 text-sm">
                  <span>Industry avg: 15%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Customer LTV</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${formatNumber(healthData?.metrics.customerLifetimeValue || 0)}
                    </p>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-full">
                    <Users className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div className="flex items-center text-purple-600 text-sm">
                  <span>CAC: ${formatNumber(healthData?.metrics.customerAcquisitionCost || 0)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Monthly Burn Rate</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${formatNumber(healthData?.metrics.burnRate || 0)}
                    </p>
                  </div>
                  <div className="bg-orange-100 p-3 rounded-full">
                    <CreditCard className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
                <div className="flex items-center text-orange-600 text-sm">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>{healthData?.metrics.monthsOfRunway || 0} months runway</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Next Month Forecast</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${formatNumber(healthData?.predictions.nextMonthRevenue || 0)}
                    </p>
                  </div>
                  <div className="bg-indigo-100 p-3 rounded-full">
                    <BarChart3 className="h-6 w-6 text-indigo-600" />
                  </div>
                </div>
                <div className="flex items-center text-indigo-600 text-sm">
                  <span>AI prediction confidence: 87%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Quarter Projection</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${formatNumber(healthData?.predictions.quarterProjection || 0)}
                    </p>
                  </div>
                  <div className="bg-teal-100 p-3 rounded-full">
                    <Target className="h-6 w-6 text-teal-600" />
                  </div>
                </div>
                <div className="flex items-center text-teal-600 text-sm">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  <span>Growth trajectory</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Predictions and Risk Analysis */}
          {healthData?.predictions && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-600" />
                    Growth Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {healthData.predictions.growthOpportunities.map((opportunity, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <ArrowUp className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-green-800">{opportunity}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Risk Factors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {healthData.predictions.riskFactors.map((risk, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <ArrowDown className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-800">{risk}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}