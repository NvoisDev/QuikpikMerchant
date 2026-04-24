import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { Banknote, ChevronRight, CreditCard, Package, AlertCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;
  created: number;
  description: string | null;
}

interface PayoutTransaction {
  id: string;
  amount: number;
  currency: string;
  date: number;
  orderNumber: string | null;
  customerName: string | null;
  orderTotal: string | null;
  createdAt: string | null;
}

function formatDate(unixTs: number) {
  return new Date(unixTs * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateStr(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(pence: number, currencyCode: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(pence / 100);
}

function formatPounds(pounds: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(pounds));
}

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid:       { label: "Deposited",  className: "bg-green-100 text-green-800" },
    pending:    { label: "Scheduled",  className: "bg-yellow-100 text-yellow-800" },
    in_transit: { label: "In Transit", className: "bg-blue-100 text-blue-800" },
    failed:     { label: "Failed",     className: "bg-red-100 text-red-800" },
    canceled:   { label: "Cancelled",  className: "bg-gray-100 text-gray-700" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return <Badge className={`${className} font-medium text-xs px-2 py-0.5 rounded-full border-0`}>{label}</Badge>;
}

export default function Financials() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('finance')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Finance page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

  const { data, isLoading, isError } = useQuery<{ pendingBalance: number; payouts: Payout[] }>({
    queryKey: ["/api/stripe/payouts"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/payouts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payouts");
      return res.json();
    },
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<{ transactions: PayoutTransaction[] }>({
    queryKey: ["/api/stripe/payouts", selectedPayout?.id, "transactions"],
    queryFn: async () => {
      const res = await fetch(`/api/stripe/payouts/${selectedPayout!.id}/transactions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payout transactions");
      return res.json();
    },
    enabled: !!selectedPayout,
  });

  const stripeNotConnected = !isLoading && !isError && data && data.payouts.length === 0 && data.pendingBalance === 0 && !user?.stripeAccountId;

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Finance" description="Payouts from Stripe to your bank account" />

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {/* To be paid card */}
        <Card className="border border-gray-200">
          <CardContent className="p-6">
            <p className="text-sm text-gray-500 mb-1">To be paid</p>
            {isLoading ? (
              <Skeleton className="h-8 w-32 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900">
                {data ? formatAmount(data.pendingBalance, "gbp") : "£0.00"}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">Pending balance — typically paid out in 2–7 business days</p>
          </CardContent>
        </Card>

        {/* Stripe not connected prompt */}
        {stripeNotConnected && (
          <Card className="border border-orange-200 bg-orange-50">
            <CardContent className="p-6 flex items-start gap-4">
              <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-orange-900">Stripe not connected</p>
                <p className="text-sm text-orange-700 mt-1">
                  Connect your Stripe account to start receiving payouts and track them here.
                </p>
                <Link href="/settings">
                  <Button size="sm" className="mt-3 btn-theme-primary">
                    Connect Stripe in Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payout list table */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Payout transactions</h2>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-12 text-gray-500">
              <CreditCard className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">Could not load payouts</p>
              <p className="text-sm mt-1">Make sure your Stripe account is connected and verified.</p>
            </div>
          ) : !data || data.payouts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border rounded-lg">
              <Banknote className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">No payouts yet</p>
              <p className="text-sm mt-1">Payouts will appear here once Stripe transfers funds to your bank.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-gray-700">Payout date</TableHead>
                    <TableHead className="font-semibold text-gray-700">Transaction dates</TableHead>
                    <TableHead className="font-semibold text-gray-700">Status</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right">Amount</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payouts.map((payout) => (
                    <TableRow
                      key={payout.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedPayout(payout)}
                    >
                      <TableCell className="font-medium text-blue-600">
                        {formatDate(payout.arrivalDate)}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatDate(payout.created)}
                      </TableCell>
                      <TableCell>
                        <PayoutStatusBadge status={payout.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold text-gray-900">
                        {formatAmount(payout.amount, payout.currency)} {payout.currency.toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Payout detail sheet */}
      <Sheet open={!!selectedPayout} onOpenChange={(open) => { if (!open) setSelectedPayout(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedPayout && (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="text-lg">Payout detail</SheetTitle>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-semibold text-gray-900 text-base">
                      {formatAmount(selectedPayout.amount, selectedPayout.currency)} {selectedPayout.currency.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Status</span>
                    <PayoutStatusBadge status={selectedPayout.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Initiated</span>
                    <span>{formatDate(selectedPayout.created)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Arrives</span>
                    <span>{formatDate(selectedPayout.arrivalDate)}</span>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Orders included</h3>

                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded" />
                    ))}
                  </div>
                ) : !detailData || detailData.transactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No order breakdown available for this payout.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-semibold text-gray-600">Order</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">Customer</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">Date</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">Net</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.transactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="font-medium text-sm">
                              {txn.orderNumber
                                ? `#${txn.orderNumber}`
                                : (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs cursor-default">
                                          Unknown
                                          <Info className="w-3 h-3 text-gray-400" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        This transaction couldn't be linked to an order. It may have been processed before order tracking began.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                            </TableCell>
                            <TableCell className="text-sm text-gray-700">
                              {txn.customerName ?? <span className="text-gray-400 text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {txn.createdAt ? formatDateStr(txn.createdAt) : formatDate(txn.date)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-gray-900">
                              {txn.orderTotal
                                ? formatPounds(txn.orderTotal)
                                : formatAmount(txn.amount, txn.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedPayout(null)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
