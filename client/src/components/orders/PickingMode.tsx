import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  Circle,
  RefreshCw,
  Package,
  ChevronLeft,
  CheckSquare,
  RotateCcw,
} from "lucide-react";

// ── API response shape (from GET /api/orders/:id/picking) ────────────────────
interface PickingStateItem {
  orderItemId: number;
  productId: number;
  quantity: number;
  sellingType?: string | null;
  freeItems?: number | null;
  productName: string;
  productImageUrl: string | null;
  productUnitSize: string | null;
  productUnitOfMeasure: string | null;
  isPicked: boolean;
  pickedAt: string | null;
  pickedBy: string | null;
}

interface PickingState {
  pickingStatus: 'not_started' | 'picking' | 'packed';
  completedAt: string | null;
  completedBy: string | null;
  resetAt: string | null;
  resetBy: string | null;
  items: PickingStateItem[];
}

interface Props {
  orderId: number;
  orderNumber?: string;
  onClose: () => void;
}

export function PickingMode({ orderId, orderNumber, onClose }: Props) {
  const { toast } = useToast();
  const [optimisticPicks, setOptimisticPicks] = useState<Record<number, boolean>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { data: pickingState, isLoading, refetch } = useQuery<PickingState>({
    queryKey: [`/api/orders/${orderId}/picking`],
    refetchOnWindowFocus: false,
  });

  const items: PickingStateItem[] = pickingState?.items ?? [];

  // Merged view: server state + optimistic overrides
  const getItemPicked = useCallback((orderItemId: number): boolean => {
    if (orderItemId in optimisticPicks) return optimisticPicks[orderItemId];
    return pickingState?.items.find(i => i.orderItemId === orderItemId)?.isPicked ?? false;
  }, [optimisticPicks, pickingState]);

  const pickedCount = items.filter(item => getItemPicked(item.orderItemId)).length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((pickedCount / totalCount) * 100) : 0;

  const displayStatus: PickingState['pickingStatus'] =
    pickedCount === 0 ? 'not_started' :
    pickedCount === totalCount ? 'packed' :
    'picking';

  const toggleItemMutation = useMutation({
    mutationFn: async ({ orderItemId, isPicked }: { orderItemId: number; isPicked: boolean }) => {
      const res = await apiRequest('PATCH', `/api/orders/${orderId}/picking/items/${orderItemId}`, { isPicked });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/picking`] });
    },
    onError: (_err, { orderItemId, isPicked }) => {
      setOptimisticPicks(prev => ({ ...prev, [orderItemId]: !isPicked }));
      toast({ title: "Error", description: "Could not save pick status. Please try again.", variant: "destructive" });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/orders/${orderId}/picking/mark-all`, {});
      return res.json();
    },
    onMutate: () => {
      const allPicked: Record<number, boolean> = {};
      items.forEach(item => { allPicked[item.orderItemId] = true; });
      setOptimisticPicks(allPicked);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/picking`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders-paginated'] });
      toast({ title: "All items picked", description: "Order is packed and ready." });
    },
    onError: () => {
      setOptimisticPicks({});
      refetch();
      toast({ title: "Error", description: "Could not mark all as picked.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/orders/${orderId}/picking/reset`, {});
      return res.json();
    },
    onMutate: () => {
      const allUnpicked: Record<number, boolean> = {};
      items.forEach(item => { allUnpicked[item.orderItemId] = false; });
      setOptimisticPicks(allUnpicked);
      setShowResetConfirm(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/picking`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders-paginated'] });
      toast({ title: "Checklist reset", description: "All items have been unchecked." });
    },
    onError: () => {
      setOptimisticPicks({});
      refetch();
      toast({ title: "Error", description: "Could not reset checklist.", variant: "destructive" });
    },
  });

  const handleToggle = (orderItemId: number) => {
    const current = getItemPicked(orderItemId);
    const next = !current;
    setOptimisticPicks(prev => ({ ...prev, [orderItemId]: next }));
    toggleItemMutation.mutate({ orderItemId, isPicked: next });
  };

  const statusBadge = () => {
    if (displayStatus === 'packed') return (
      <Badge className="bg-green-100 text-green-800 text-xs">Packed</Badge>
    );
    if (displayStatus === 'picking') return (
      <Badge className="bg-blue-100 text-blue-800 text-xs">In Progress</Badge>
    );
    return (
      <Badge className="bg-slate-100 text-slate-700 text-xs">Not Started</Badge>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shadow-sm">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Close picking mode"
        >
          <ChevronLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold truncate">
              Picking {orderNumber ? `— ${orderNumber}` : ''}
            </h2>
            {statusBadge()}
          </div>
          <p className="text-xs text-slate-500">
            {pickedCount} of {totalCount} items picked
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                displayStatus === 'packed' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-slate-700 w-10 text-right">{progressPct}%</span>
        </div>
      </div>

      {/* ── Item list ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
            <Package className="h-8 w-8" />
            <p className="text-sm">No items in this order</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const picked = getItemPicked(item.orderItemId);
              return (
                <li
                  key={item.orderItemId}
                  className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors active:bg-slate-50 select-none ${
                    picked ? 'bg-green-50' : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => handleToggle(item.orderItemId)}
                  role="checkbox"
                  aria-checked={picked}
                >
                  {/* Thumbnail */}
                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                    {item.productImageUrl ? (
                      <img
                        src={item.productImageUrl}
                        alt={item.productName}
                        className={`w-full h-full object-cover transition-opacity ${picked ? 'opacity-50' : 'opacity-100'}`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight truncate ${picked ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {item.productName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Qty: <span className="font-semibold text-slate-700">{item.quantity}</span>
                      {item.sellingType === 'pallets' && ' pallets'}
                      {(item.freeItems ?? 0) > 0 && ` + ${item.freeItems} free`}
                    </p>
                  </div>

                  {/* Checkbox — minimum 48px tap target */}
                  <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                    {picked ? (
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    ) : (
                      <Circle className="h-8 w-8 text-slate-300" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Footer actions ──────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white space-y-2">
        {showResetConfirm ? (
          <>
            <p className="text-xs text-center text-slate-500">This will uncheck all items. Are you sure?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                )}
                Yes, Reset
              </Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-slate-600"
              onClick={() => setShowResetConfirm(true)}
              disabled={pickedCount === 0 || resetMutation.isPending || markAllMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
            <Button
              size="sm"
              className={`flex-1 ${displayStatus === 'packed' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
              onClick={() => markAllMutation.mutate()}
              disabled={displayStatus === 'packed' || markAllMutation.isPending || resetMutation.isPending}
            >
              {markAllMutation.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
              )}
              {displayStatus === 'packed' ? 'All Packed' : 'Mark All Picked'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Compact picking status badge for orders list ──────────────────────────────
export function PickingStatusBadge({ status }: { status: string }) {
  if (status === 'packed') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs" variant="outline">
        <CheckCircle className="w-2.5 h-2.5 mr-1" />
        Packed
      </Badge>
    );
  }
  if (status === 'picking') {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs" variant="outline">
        <Package className="w-2.5 h-2.5 mr-1" />
        Picking
      </Badge>
    );
  }
  // not_started — shown as a subtle grey badge
  return (
    <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs" variant="outline">
      Not Picked
    </Badge>
  );
}
