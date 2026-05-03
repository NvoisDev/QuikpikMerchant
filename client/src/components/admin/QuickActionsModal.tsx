import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GREEN, BLUE, fmt } from "./shared";
import type { WholesalerRow, WholesalerOrderRow, RefundResult } from "./types";

export function QuickActionsModal({ open, onOpenChange, wholesalers }: {
  open: boolean; onOpenChange: (v: boolean) => void; wholesalers: WholesalerRow[];
}) {
  const [mode, setMode] = useState<"refund" | "contact">("refund");
  const [refundWholesaler, setRefundWholesaler] = useState<WholesalerRow | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundResult, setRefundResult] = useState<RefundResult | null>(null);
  const [contactWholesaler, setContactWholesaler] = useState<WholesalerRow | null>(null);
  const { toast } = useToast();

  const { data: wholesalerOrdersData, isLoading: ordersLoading } = useQuery<{ orders: WholesalerOrderRow[] }>({
    queryKey: ["/api/admin/wholesalers", refundWholesaler?.id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/wholesalers/${refundWholesaler!.id}/orders`, { credentials: "include" });
      return r.json() as Promise<{ orders: WholesalerOrderRow[] }>;
    },
    enabled: !!refundWholesaler,
  });
  const wholesalerOrders = wholesalerOrdersData?.orders ?? [];
  const selectedOrder = wholesalerOrders.find(o => String(o.id) === selectedOrderId) ?? null;

  const issueRefund = useMutation({
    mutationFn: async () => {
      const body: Record<string, number> = {};
      if (refundAmount) body.amountPounds = parseFloat(refundAmount);
      const res = await apiRequest("POST", `/api/admin/orders/${selectedOrderId}/issue-refund`, body);
      return res.json() as Promise<RefundResult>;
    },
    onSuccess: (data: RefundResult) => {
      setRefundResult(data);
      if (data?.success) toast({ title: `Refund of £${data.totalRefunded?.toFixed(2)} processed` });
      else toast({ title: data?.error ?? "Refund failed", variant: "destructive" });
    },
    onError: () => toast({ title: "Refund failed", variant: "destructive" }),
  });

  const handleClose = (v: boolean) => {
    if (!v) {
      setRefundWholesaler(null); setSelectedOrderId(""); setRefundAmount("");
      setRefundResult(null); setContactWholesaler(null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm font-semibold">Quick Actions</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("refund")} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${mode === "refund" ? "border-transparent text-white" : "border-gray-200 text-gray-500 bg-white"}`} style={mode === "refund" ? { background: GREEN } : {}}>Issue Refund</button>
          <button onClick={() => setMode("contact")} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${mode === "contact" ? "border-transparent text-white" : "border-gray-200 text-gray-500 bg-white"}`} style={mode === "contact" ? { background: BLUE } : {}}>Contact Wholesaler</button>
        </div>
        {mode === "refund" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600">Step 1 — Select wholesaler</Label>
              <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white mt-1"
                value={refundWholesaler?.id ?? ""}
                onChange={e => { setRefundWholesaler(wholesalers.find(w => w.id === e.target.value) ?? null); setSelectedOrderId(""); setRefundResult(null); }}>
                <option value="">Select wholesaler…</option>
                {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
              </select>
            </div>
            {refundWholesaler && (
              <div>
                <Label className="text-xs text-gray-600">Step 2 — Pick an order</Label>
                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white mt-1"
                  value={selectedOrderId}
                  onChange={e => { setSelectedOrderId(e.target.value); setRefundResult(null); }}
                  disabled={ordersLoading}>
                  <option value="">{ordersLoading ? "Loading orders…" : "Select order…"}</option>
                  {wholesalerOrders.filter(o => o.paymentStatus === "paid" && o.status !== "refunded").map(o => (
                    <option key={o.id} value={String(o.id)}>#{o.orderNumber} — {o.customerName ?? "Customer"} — £{parseFloat(o.subtotal).toFixed(2)} ({o.status})</option>
                  ))}
                </select>
                {wholesalerOrders.length === 0 && !ordersLoading && (
                  <p className="text-xs text-gray-400 mt-1">No refundable orders found for this wholesaler.</p>
                )}
              </div>
            )}
            {selectedOrder && (
              <div>
                <Label className="text-xs text-gray-600">Step 3 — Amount (£) — blank = full refund of £{parseFloat(selectedOrder.subtotal).toFixed(2)}</Label>
                <Input className="text-xs h-8 mt-1 border-gray-200" type="number" step="0.01" min="0.01"
                  max={parseFloat(selectedOrder.subtotal)}
                  value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={`e.g. ${parseFloat(selectedOrder.subtotal).toFixed(2)}`} />
              </div>
            )}
            {refundResult?.success && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs text-green-700 font-medium">Refund processed: £{refundResult.totalRefunded?.toFixed(2)}</p>
                {(refundResult.remaining ?? 0) > 0 && <p className="text-xs text-green-600">£{refundResult.remaining?.toFixed(2)} could not be refunded (check Stripe dashboard)</p>}
              </div>
            )}
            <Button size="sm" className="w-full text-xs text-white h-8" style={{ background: GREEN }}
              disabled={!selectedOrderId || issueRefund.isPending}
              onClick={() => issueRefund.mutate()}>
              {issueRefund.isPending ? "Processing…" : "Issue Refund"}
            </Button>
          </div>
        )}
        {mode === "contact" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Select a wholesaler to open a pre-filled email.</p>
            <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white" onChange={e => setContactWholesaler(wholesalers.find(w => w.id === e.target.value) ?? null)}>
              <option value="">Select wholesaler…</option>
              {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
            </select>
            {contactWholesaler && (
              <a href={`mailto:${contactWholesaler.email}?subject=Re: Your Quikpik account&body=Hi ${contactWholesaler.firstName || ''},`}>
                <Button size="sm" className="w-full text-xs text-white h-8" style={{ background: BLUE }}>
                  <Mail className="h-3.5 w-3.5 mr-1.5" />Open email to {contactWholesaler.email}
                </Button>
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
