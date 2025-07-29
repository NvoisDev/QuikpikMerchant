import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Download, 
  Search, 
  Calendar,
  DollarSign,
  CreditCard,
  Receipt,
  Filter,
  Eye,
  ExternalLink,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { formatNumber } from "@/lib/utils";

export default function Financials() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  // Fetch invoices from Stripe
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/stripe/invoices", searchTerm, statusFilter, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (dateFilter !== 'all') params.append('date_range', dateFilter);
      
      const response = await fetch(`/api/stripe/invoices?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch invoices");
      return response.json();
    },
  });

  // Fetch financial summary
  const { data: financialSummary = {}, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/stripe/financial-summary"],
    queryFn: async () => {
      const response = await fetch("/api/stripe/financial-summary", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch financial summary");
      return response.json();
    },
  });

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/stripe/invoices/${invoiceId}/download`, {
        credentials: "include",
      });
      
      if (!response.ok) throw new Error("Failed to download invoice");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Invoice downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'void': return 'bg-gray-100 text-gray-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'uncollectible': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-7 bg-gradient-to-t from-emerald-400 to-teal-500 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '1.4s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financials</h1>
          <p className="text-gray-600">Manage invoices, payments, and financial records</p>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summaryLoading ? "..." : `$${formatNumber(financialSummary.totalRevenue || 0)}`}
                </p>
                <p className="text-xs text-green-600 flex items-center mt-1">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {financialSummary.revenueChange || 0}% from last month
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Paid Invoices</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summaryLoading ? "..." : formatNumber(financialSummary.paidInvoices || 0)}
                </p>
                <p className="text-xs text-green-600 flex items-center mt-1">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {financialSummary.paidInvoicesChange || 0}% this month
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Receipt className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Payments</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summaryLoading ? "..." : `$${formatNumber(financialSummary.pendingAmount || 0)}`}
                </p>
                <p className="text-xs text-orange-600 flex items-center mt-1">
                  <Calendar className="h-3 w-3 mr-1" />
                  {financialSummary.pendingCount || 0} invoices
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <CreditCard className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Platform Fees</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summaryLoading ? "..." : `$${formatNumber(financialSummary.platformFees || 0)}`}
                </p>
                <p className="text-xs text-gray-600 flex items-center mt-1">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  5% of total sales
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoice Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search invoices by customer or invoice number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="void">Void</SelectItem>
                <SelectItem value="uncollectible">Uncollectible</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Invoices Table */}
          <div className="space-y-4">
            {invoicesLoading ? (
              // Loading skeletons
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border rounded-lg p-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                      <div className="h-3 bg-gray-200 rounded w-24"></div>
                    </div>
                    <div className="h-8 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              ))
            ) : invoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
                <p className="text-gray-600">
                  {searchTerm || statusFilter !== 'all' || dateFilter !== 'all' 
                    ? "Try adjusting your filters or search terms."
                    : "Invoices will appear here once you start making sales."
                  }
                </p>
              </div>
            ) : (
              invoices.map((invoice: any) => (
                <div key={invoice.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-gray-900">#{invoice.number}</h3>
                        <Badge className={getStatusBadgeColor(invoice.status)}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">Customer</p>
                          <p>{invoice.customer_name || invoice.customer_email}</p>
                        </div>
                        <div>
                          <p className="font-medium">Amount</p>
                          <p className="text-lg font-semibold text-gray-900">
                            ${formatNumber(invoice.amount_due / 100)}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Date</p>
                          <p>{new Date(invoice.created * 1000).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {invoice.hosted_invoice_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(invoice.hosted_invoice_url, '_blank')}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      )}
                      
                      {invoice.invoice_pdf && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadInvoice(invoice.id)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      )}
                      
                      {invoice.status === 'open' && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => window.open(invoice.hosted_invoice_url, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Pay Now
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}