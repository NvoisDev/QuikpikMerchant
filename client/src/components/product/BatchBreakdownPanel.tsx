import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Pencil, PackagePlus } from "lucide-react";
import { formatNumber } from "@/lib/currencies";
import { useCurrency } from "@/hooks/useCurrency";
import type { Product } from "@shared/schema";
import type { ProductBatch } from "./types";

interface BatchBreakdownPanelProps {
  product: Product;
  productBatches: ProductBatch[] | undefined;
  isLoadingBatches: boolean;
  editingExpiryBatchId: number | null;
  setEditingExpiryBatchId: (id: number | null) => void;
  editingExpiryValue: string;
  setEditingExpiryValue: (v: string) => void;
  expiryEditCancelledRef: React.MutableRefObject<boolean>;
  isViewer: boolean;
  onAdjustBatch: (args: { productId: number; batchId: number; delta: number; reason: string }) => void;
  onDepleteBatch: (args: { productId: number; batchId: number }) => void;
  onUpdateExpiry: (args: { productId: number; batchId: number; expiryDate: string | null }) => void;
}

export default function BatchBreakdownPanel({
  product,
  productBatches,
  isLoadingBatches,
  editingExpiryBatchId,
  setEditingExpiryBatchId,
  editingExpiryValue,
  setEditingExpiryValue,
  expiryEditCancelledRef,
  isViewer,
  onAdjustBatch,
  onDepleteBatch,
  onUpdateExpiry,
}: BatchBreakdownPanelProps) {
  const { formatMoney } = useCurrency();
  return (
    <div className="mt-2 border border-blue-100 rounded-lg bg-blue-50/40 p-3">
      <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <PackagePlus className="h-3.5 w-3.5 text-blue-600" /> Batch Breakdown
      </h5>
      {isLoadingBatches ? (
        <p className="text-xs text-gray-500 py-2 text-center">Loading batches...</p>
      ) : (productBatches ?? []).length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-blue-100">
                <th className="text-left py-1 pr-3 font-medium">Batch Ref</th>
                <th className="text-right py-1 pr-3 font-medium">Qty</th>
                <th className="text-left py-1 pr-3 font-medium">Expiry</th>
                <th className="text-right py-1 pr-3 font-medium">Cost</th>
                <th className="text-left py-1 pr-3 font-medium">Status</th>
                <th className="text-right py-1 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(productBatches as ProductBatch[]).map((batch: ProductBatch) => {
                const isExpired = batch.expiryDate && new Date(batch.expiryDate) < new Date();
                const isDepleted = batch.status === 'depleted';
                const expiryFmt = batch.expiryDate
                  ? new Date(batch.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                  : '—';
                return (
                  <tr key={batch.id} className={`border-b border-blue-50 last:border-0 ${isDepleted || isExpired ? 'opacity-50' : ''}`}>
                    <td className="py-1.5 pr-3 text-gray-700">{batch.batchNumber || 'Initial Stock'}</td>
                    <td className="py-1.5 pr-3 text-right font-medium">
                      {formatNumber(batch.quantity)}
                      <span className="text-gray-400 font-normal"> of {formatNumber(batch.originalQuantity ?? batch.quantity)}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      {editingExpiryBatchId === batch.id ? (
                        <input
                          type="date"
                          autoFocus
                          className="text-xs border rounded px-1 py-0.5 w-28"
                          value={editingExpiryValue}
                          onChange={e => setEditingExpiryValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              expiryEditCancelledRef.current = true;
                              onUpdateExpiry({ productId: product.id, batchId: batch.id, expiryDate: editingExpiryValue || null });
                            } else if (e.key === 'Escape') {
                              expiryEditCancelledRef.current = true;
                              setEditingExpiryBatchId(null);
                            }
                          }}
                          onBlur={() => {
                            if (expiryEditCancelledRef.current) {
                              expiryEditCancelledRef.current = false;
                              return;
                            }
                            onUpdateExpiry({ productId: product.id, batchId: batch.id, expiryDate: editingExpiryValue || null });
                          }}
                        />
                      ) : (
                        <span className="flex items-center gap-1">
                          {batch.expiryDate ? (
                            <span className={isExpired ? 'text-red-600 font-medium' : new Date(batch.expiryDate) <= new Date(Date.now() + 30*24*60*60*1000) ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                              {expiryFmt}
                              {isExpired && ' 🔴'}
                              {!isExpired && new Date(batch.expiryDate) <= new Date(Date.now() + 30*24*60*60*1000) && ' 🟠'}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                          <button
                            className="text-gray-400 hover:text-gray-600"
                            onClick={() => {
                              const iso = batch.expiryDate ? String(batch.expiryDate).split('T')[0] : '';
                              setEditingExpiryValue(iso);
                              setEditingExpiryBatchId(batch.id);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-600">{batch.costPrice ? formatMoney(batch.costPrice) : '—'}</td>
                    <td className="py-1.5 pr-3">
                      {isDepleted ? (
                        <Badge className="text-xs bg-gray-100 text-gray-500 border-0">Depleted</Badge>
                      ) : isExpired ? (
                        <Badge className="text-xs bg-red-100 text-red-700 border-0">Expired</Badge>
                      ) : (
                        <Badge className="text-xs bg-green-100 text-green-700 border-0">Active</Badge>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {!isDepleted && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="text-xs text-orange-600 hover:text-orange-800 px-1.5 py-0.5 rounded border border-orange-200 hover:bg-orange-50"
                            onClick={() => {
                              const delta = prompt('Enter quantity to remove (negative number reduces stock):');
                              if (delta && !isNaN(parseInt(delta))) {
                                onAdjustBatch({ productId: product.id, batchId: batch.id, delta: -Math.abs(parseInt(delta)), reason: 'Manual adjustment' });
                              }
                            }}
                          >
                            Adjust
                          </button>
                          <button
                            className="text-xs text-gray-500 hover:text-red-600 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-red-50"
                            onClick={() => {
                              if (confirm('Mark this batch as depleted?')) {
                                onDepleteBatch({ productId: product.id, batchId: batch.id });
                              }
                            }}
                          >
                            Deplete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-500 py-2 text-center">No batches found</p>
      )}
    </div>
  );
}
