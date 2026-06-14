import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Search, Users, Eye, Flag } from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { fmt } from "./shared";
import { typeDot, typeColor, typeLabel } from "./CustomerMapSection";
import type { CustomerRow, WholesalerOrderRow } from "./types";

export function CustomersSection({ isAdmin, highlightedId }: { isAdmin: boolean; highlightedId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<{ customers: CustomerRow[] }>({
    queryKey: ["/api/admin/customers", debouncedQ],
    queryFn: async () => {
      const url = `/api/admin/customers${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<{ customers: CustomerRow[] }>;
    },
    enabled: isAdmin,
  });

  const { data: customerOrders, isLoading: ordersLoading } = useQuery<{ orders: WholesalerOrderRow[] }>({
    queryKey: ["/api/admin/customers", selectedCustomer?.id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/customers/${selectedCustomer!.id}/orders`, { credentials: "include" });
      return r.json() as Promise<{ orders: WholesalerOrderRow[] }>;
    },
    enabled: !!selectedCustomer && drawerOpen,
  });

  // Open customer detail when navigated from global search
  useEffect(() => {
    if (!highlightedId || !data?.customers?.length) return;
    const match = data.customers.find(c => c.id === highlightedId);
    if (match) {
      setSelectedCustomer(match);
      setDrawerOpen(true);
      setTimeout(() => {
        const el = document.getElementById(`record-customer-${highlightedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [highlightedId, data?.customers]);

  const flagMutation = useMutation({
    mutationFn: ({ id, isSuspicious }: { id: string; isSuspicious: boolean }) =>
      apiRequest("PATCH", `/api/admin/customers/${id}/flag`, { isSuspicious }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      toast({ title: "Customer flag updated" });
    },
    onError: () => toast({ title: "Failed to update flag", variant: "destructive" }),
  });

  const customers = data?.customers || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Customers</h2>
        <p className="text-xs text-gray-400">Search across all customers by name or phone number</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, phone, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm border-gray-200"
        />
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">
            {isLoading ? "Loading…" : `${customers.length} customer${customers.length !== 1 ? "s" : ""}${debouncedQ ? ` matching "${debouncedQ}"` : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Searching...</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              <Users className="h-8 w-8 mx-auto mb-3 text-gray-200" />
              <p>{debouncedQ ? "No customers found." : "Search to find customers."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-indigo-50">
                    {["Customer","Phone","Wholesaler","Orders","Last Login","Type","Flags",""].map((h, i) => (
                      <TableHead key={i} className={`text-xs font-semibold text-indigo-700${[1,2,4,5,6,7].includes(i) ? " hidden sm:table-cell" : ""}`}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map(c => (
                    <TableRow id={`record-customer-${c.id}`} key={c.id} className={`hover:bg-indigo-50/20 cursor-pointer ${c.isSuspicious ? "bg-red-50/30" : ""} ${highlightedId === c.id ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50/40" : ""}`} onClick={() => { setSelectedCustomer(c); setDrawerOpen(true); }}>
                      <TableCell>
                        <p className="text-xs font-medium text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.email || "—"}</p>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-gray-600">{c.phoneNumber || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-600">{c.wholesalerName}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{c.orderCount}</TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {c.lastLoginAt ? (
                          new Date(c.lastLoginAt) > subDays(new Date(), 30)
                            ? formatDistanceToNow(new Date(c.lastLoginAt), { addSuffix: true })
                            : format(new Date(c.lastLoginAt), "d MMM yyyy")
                        ) : <span className="text-gray-300">Never</span>}
                      </TableCell>
                      <TableCell>
                        {c.customerType ? (
                          <span className="text-xs px-2 py-0.5 rounded border" style={{ background: typeDot(c.customerType) + "22", color: typeColor(c.customerType), borderColor: typeDot(c.customerType) + "55" }}>
                            {typeLabel(c.customerType)}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {c.isTestAccount && <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-medium w-fit">Test</span>}
                          {c.isSuspicious && <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1 w-fit"><Flag className="h-3 w-3" />Suspicious</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400" onClick={e => { e.stopPropagation(); setSelectedCustomer(c); setDrawerOpen(true); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer detail drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              {selectedCustomer?.name}
              {selectedCustomer?.isTestAccount && (
                <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-medium">Test</span>
              )}
            </SheetTitle>
          </SheetHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Wholesaler</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{selectedCustomer.wholesalerName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Orders</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{selectedCustomer.orderCount}</p>
                </div>
                {selectedCustomer.phoneNumber && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Phone</p>
                    <p className="text-sm font-mono text-gray-800 mt-1">{selectedCustomer.phoneNumber}</p>
                  </div>
                )}
                {selectedCustomer.postalCode && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Postcode</p>
                    <p className="text-sm font-mono text-gray-800 mt-1">{selectedCustomer.postalCode}</p>
                  </div>
                )}
              </div>

              {/* Flag control */}
              <div className="border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">Flag as suspicious</p>
                  <p className="text-xs text-gray-400 mt-0.5">Marks this customer for review</p>
                </div>
                <Button size="sm" variant={selectedCustomer.isSuspicious ? "destructive" : "outline"} className="text-xs h-7 gap-1.5" disabled={flagMutation.isPending}
                  onClick={() => flagMutation.mutate({ id: selectedCustomer.id, isSuspicious: !selectedCustomer.isSuspicious })}>
                  <Flag className="h-3.5 w-3.5" />
                  {selectedCustomer.isSuspicious ? "Remove flag" : "Flag"}
                </Button>
              </div>

              {/* Order history */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-3">Order History</p>
                {ordersLoading ? <p className="text-xs text-gray-400">Loading...</p>
                  : customerOrders?.orders?.length === 0 ? <p className="text-xs text-gray-400">No orders yet.</p>
                  : (
                    <div className="space-y-2">
                      {(customerOrders?.orders ?? []).map(o => (
                        <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                          <div>
                            <span className="font-mono text-gray-500">{o.orderNumber}</span>
                            <span className="text-gray-400 ml-2 text-xs">{o.wholesalerName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{fmt(parseFloat(o.subtotal || "0"))}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs border ${
                              o.paymentStatus === "paid" && (o.refundedAt || (parseFloat(o.refundAmount || '0') > 0))
                                ? "bg-purple-50 border-purple-200 text-purple-700"
                                : o.paymentStatus === "paid"
                                  ? "bg-green-50 border-green-200 text-green-700"
                                  : "bg-gray-100 border-gray-200 text-gray-500"
                            }`}>
                              {o.paymentStatus === "paid" && (o.refundedAt || (parseFloat(o.refundAmount || '0') > 0))
                                ? "refunded"
                                : o.paymentStatus || "pending"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
