import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart3, 
  FileText, 
  TrendingUp, 
  DollarSign,
  Receipt,
  CreditCard,
  ArrowRight,
  PieChart,
  LineChart,
  Calendar
} from "lucide-react";

export default function BusinessPerformance() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Performance</h1>
          <p className="text-gray-600">Monitor your business metrics and financial data</p>
        </div>
      </div>

      {/* Performance Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Analytics Tile */}
        <Link href="/analytics">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20 h-full">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3">
                <div className="bg-blue-100 p-3 rounded-full">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900">Analytics</h2>
                  <p className="text-sm text-gray-600 mt-1">View performance metrics and insights</p>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span>Sales trends</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <PieChart className="h-4 w-4 text-purple-600" />
                  <span>Product insights</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <LineChart className="h-4 w-4 text-orange-600" />
                  <span>Revenue charts</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <span>Time analysis</span>
                </div>
              </div>
              
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-700 font-medium">View detailed analytics</p>
                <p className="text-xs text-blue-600 mt-1">Charts, reports, and business insights</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Financials Tile */}
        <Link href="/financials">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20 h-full">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3">
                <div className="bg-green-100 p-3 rounded-full">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900">Financials</h2>
                  <p className="text-sm text-gray-600 mt-1">Invoices, payments, and financial records</p>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Receipt className="h-4 w-4 text-green-600" />
                  <span>Invoice history</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  <span>Payment records</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="h-4 w-4 text-yellow-600" />
                  <span>Revenue tracking</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <span>Financial reports</span>
                </div>
              </div>
              
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-green-700 font-medium">Manage financial data</p>
                <p className="text-xs text-green-600 mt-1">Stripe invoices, payments, and transactions</p>
              </div>
            </CardContent>
          </Card>
        </Link>

      </div>

      {/* Quick Stats Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Overview</CardTitle>
          <p className="text-sm text-gray-600">Key metrics at a glance - click to explore</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/analytics">
              <div className="text-center cursor-pointer p-4 rounded-lg hover:bg-blue-50 transition-colors border-2 hover:border-blue-200">
                <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">View</p>
                <p className="text-sm text-gray-600">Analytics</p>
              </div>
            </Link>
            
            <Link href="/financials">
              <div className="text-center cursor-pointer p-4 rounded-lg hover:bg-green-50 transition-colors border-2 hover:border-green-200">
                <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Receipt className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">Manage</p>
                <p className="text-sm text-gray-600">Invoices</p>
              </div>
            </Link>
            
            <Link href="/financials">
              <div className="text-center cursor-pointer p-4 rounded-lg hover:bg-purple-50 transition-colors border-2 hover:border-purple-200">
                <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CreditCard className="h-6 w-6 text-purple-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">Track</p>
                <p className="text-sm text-gray-600">Payments</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}