import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PackagePlus, ArrowUpCircle, ArrowDownCircle, Clock, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCurrency } from "@/lib/currencies";
import { formatNumber } from "@shared/utils/currency";
import type { Product } from "@shared/schema";
import type { ProductBatch, StockMovement } from "./types";

interface StockManagementDialogProps {
  open: boolean;
  onClose: () => void;
  stockProduct: Product | null;
  isViewer: boolean;
  stockAdjustmentType: "increase" | "decrease";
  onSetAdjustmentType: (type: "increase" | "decrease") => void;
  modalBatches: ProductBatch[] | undefined;
  isLoadingModalBatches: boolean;
  stockMovements: StockMovement[] | undefined;
  isLoadingMovements: boolean;
  stockQuantity: string;
  setStockQuantity: (v: string) => void;
  batchExpiry: string;
  setBatchExpiry: (v: string) => void;
  batchRef: string;
  setBatchRef: (v: string) => void;
  batchCostPrice: string;
  setBatchCostPrice: (v: string) => void;
  onAddBatch: () => void;
  isAddingBatch: boolean;
  selectedBatchId: number | null;
  setSelectedBatchId: (id: number | null) => void;
  stockReason: string;
  setStockReason: (v: string) => void;
  onRemoveBatchStock: () => void;
  isRemovingBatchStock: boolean;
  onStockAdjustment: () => void;
  isAdjustingStock: boolean;
  topUpBatchId: number | null;
  setTopUpBatchId: (id: number | null) => void;
  topUpQuantity: string;
  setTopUpQuantity: (v: string) => void;
  onBatchTopUp: () => void;
  isTopUpPending: boolean;
  editCostPriceBatchId: number | null;
  setEditCostPriceBatchId: (id: number | null) => void;
  editCostPriceValue: string;
  setEditCostPriceValue: (v: string) => void;
  onUpdateBatchCostPrice: (args: { productId: number; batchId: number; costPrice: string | null }) => void;
  isUpdatingCostPrice: boolean;
}

export default function StockManagementDialog({
  open,
  onClose,
  stockProduct,
  isViewer,
  stockAdjustmentType,
  onSetAdjustmentType,
  modalBatches,
  isLoadingModalBatches,
  stockMovements,
  isLoadingMovements,
  stockQuantity,
  setStockQuantity,
  batchExpiry,
  setBatchExpiry,
  batchRef,
  setBatchRef,
  batchCostPrice,
  setBatchCostPrice,
  onAddBatch,
  isAddingBatch,
  selectedBatchId,
  setSelectedBatchId,
  stockReason,
  setStockReason,
  onRemoveBatchStock,
  isRemovingBatchStock,
  onStockAdjustment,
  isAdjustingStock,
  topUpBatchId,
  setTopUpBatchId,
  topUpQuantity,
  setTopUpQuantity,
  onBatchTopUp,
  isTopUpPending,
  editCostPriceBatchId,
  setEditCostPriceBatchId,
  editCostPriceValue,
  setEditCostPriceValue,
  onUpdateBatchCostPrice,
  isUpdatingCostPrice,
}: StockManagementDialogProps) {
  const handleExportExcel = () => {
    if (!stockMovements || (stockMovements as StockMovement[]).length === 0) return;
    const rows = (stockMovements as StockMovement[]).map((m) => {
      const d = new Date(m.createdAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const type = m.movementType === 'purchase' ? 'Order'
        : m.movementType === 'return' ? 'Return'
        : m.movementType === 'manual_increase' ? 'Restocked'
        : m.movementType === 'manual_decrease' ? 'Removed'
        : m.movementType === 'initial' ? 'Initial Stock'
        : 'Updated';
      return {
        Date: date,
        Type: type,
        Qty: m.quantity > 0 ? `+${m.quantity}` : `${m.quantity}`,
        Reason: m.reason || '',
        Customer: m.customerName || '',
        'Order #': m.orderNumber || '',
        'Stock Before': m.stockBefore,
        'Stock After': m.stockAfter,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 14 }, { wch: 8 },
      { wch: 36 }, { wch: 20 }, { wch: 10 },
      { wch: 13 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Movements');
    const slug = (stockProduct?.name || 'product').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    XLSX.writeFile(wb, `${slug}-stock-movements.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-green-600" />
            Manage Stock - {stockProduct?.name}
          </DialogTitle>
        </DialogHeader>

        {stockProduct && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Current Stock</span>
              <span className={`text-lg font-bold ${stockProduct.stock > 10 ? 'text-green-600' : stockProduct.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                {formatNumber(stockProduct.stock)} units
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant={stockAdjustmentType === "increase" ? "default" : "outline"}
                size="sm"
                className={stockAdjustmentType === "increase" ? "flex-1 bg-green-600 hover:bg-green-700" : "flex-1"}
                onClick={() => onSetAdjustmentType("increase")}
              >
                <ArrowUpCircle className="h-4 w-4 mr-1" />
                Add New Batch
              </Button>
              <Button
                variant={stockAdjustmentType === "decrease" ? "default" : "outline"}
                size="sm"
                className={stockAdjustmentType === "decrease" ? "flex-1 bg-orange-600 hover:bg-orange-700" : "flex-1"}
                onClick={() => onSetAdjustmentType("decrease")}
              >
                <ArrowDownCircle className="h-4 w-4 mr-1" />
                Remove Stock
              </Button>
            </div>

            {/* Shared FEFO-sorted batch list */}
            {(() => {
              const hasBatches = ((stockProduct as (typeof stockProduct & { batchCount?: number })).batchCount ?? 0) > 0;
              if (!hasBatches) return null;
              const sortedBatches = [...((modalBatches as ProductBatch[]) || [])].sort((a: ProductBatch, b: ProductBatch) => {
                if (!a.expiryDate && !b.expiryDate) return 0;
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
              });
              const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
              const activeBatches = sortedBatches.filter((b: ProductBatch) => b.status !== 'depleted' && b.quantity > 0);

              const fmtExpiry = (d: string | null | undefined) =>
                d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'No expiry';

              const isRemove = stockAdjustmentType === "decrease";

              return (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {isRemove ? 'Select batch to remove from' : 'Existing batches (FEFO order)'}
                  </p>
                  {isLoadingModalBatches ? (
                    <p className="text-xs text-gray-400 py-2 text-center">Loading batches…</p>
                  ) : activeBatches.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 text-center italic">All batches depleted — add a new batch to restock</p>
                  ) : (
                    <div className="space-y-1">
                      {activeBatches.map((batch: ProductBatch, idx: number) => {
                        const label = batch.batchNumber || `Batch ${idx + 1}`;
                        const expiry = fmtExpiry(batch.expiryDate);
                        const isSelected = selectedBatchId === batch.id;
                        if (isRemove) {
                          return (
                            <button
                              key={batch.id}
                              type="button"
                              onClick={() => setSelectedBatchId(isSelected ? null : batch.id)}
                              className={`w-full flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors text-left min-h-[44px] ${
                                isSelected
                                  ? 'bg-orange-50 border-orange-400 ring-1 ring-orange-400'
                                  : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-orange-500' : 'bg-gray-300'}`} />
                                <span className="font-medium text-gray-800">{label}</span>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-500 text-xs">Exp: {expiry}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 sm:mt-0 pl-4 sm:pl-0">
                                <span className="text-gray-500 text-xs">
                                  Cost: {batch.costPrice != null && batch.costPrice !== "" ? formatCurrency(batch.costPrice, stockProduct?.currency ?? undefined) : "—"}
                                </span>
                                <span className="text-gray-400">·</span>
                                <span className="font-semibold text-gray-700">{formatNumber(batch.quantity)} units</span>
                              </div>
                            </button>
                          );
                        } else {
                          const isExpired = batch.status !== 'active' || (batch.expiryDate && new Date(batch.expiryDate) < todayDate);
                          const isTopUp = topUpBatchId === batch.id;
                          const isEditingCost = editCostPriceBatchId === batch.id;
                          return (
                            <div key={batch.id} className="rounded-lg border border-gray-200 overflow-hidden">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 py-2.5 bg-gray-50 text-sm min-h-[44px] gap-1.5 sm:gap-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isExpired ? 'bg-red-400' : 'bg-green-400'}`} />
                                  <span className={`font-medium ${isExpired ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
                                  <span className="text-gray-300">·</span>
                                  <span className={`text-xs ${isExpired ? 'text-red-400' : 'text-gray-400'}`}>Exp: {expiry}</span>
                                  {isExpired && <span className="text-xs text-red-500 font-medium">(expired)</span>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 pl-4 sm:pl-0">
                                  {isViewer ? (
                                    <span className="text-xs text-gray-400">
                                      Cost: {batch.costPrice != null && batch.costPrice !== "" ? formatCurrency(batch.costPrice, stockProduct?.currency ?? undefined) : "—"}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = batch.costPrice != null && batch.costPrice !== "" ? String(batch.costPrice) : "";
                                        setEditCostPriceValue(current);
                                        setEditCostPriceBatchId(isEditingCost ? null : batch.id);
                                        if (isTopUp) { setTopUpBatchId(null); setTopUpQuantity(""); }
                                      }}
                                      className="text-xs text-gray-400 hover:text-green-600 transition-colors py-2.5 min-h-[44px] inline-flex items-center"
                                      title="Edit cost price"
                                    >
                                      Cost: {batch.costPrice != null && batch.costPrice !== "" ? formatCurrency(batch.costPrice, stockProduct?.currency ?? undefined) : "—"} ✎
                                    </button>
                                  )}
                                  <span className="text-gray-300">·</span>
                                  <span className={`font-semibold ${isExpired ? 'text-gray-400' : 'text-gray-500'}`}>{formatNumber(batch.quantity)} units</span>
                                  {!isExpired && (
                                    <button
                                      type="button"
                                      onClick={() => { setTopUpBatchId(isTopUp ? null : batch.id); setTopUpQuantity(""); setEditCostPriceBatchId(null); }}
                                      className={`px-3 py-2.5 rounded text-xs font-medium border transition-colors min-h-[44px] ${
                                        isTopUp
                                          ? 'bg-green-600 text-white border-green-600'
                                          : 'bg-white text-green-700 border-green-400 hover:bg-green-50'
                                      }`}
                                    >
                                      {isTopUp ? 'Cancel' : 'Add to batch'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isEditingCost && (
                                <div className="px-3 py-2.5 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Cost price"
                                    value={editCostPriceValue}
                                    onChange={(e) => setEditCostPriceValue(e.target.value)}
                                    className="h-8 text-sm flex-1"
                                    autoFocus
                                  />
                                  {batch.costPrice != null && batch.costPrice !== "" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onUpdateBatchCostPrice({ productId: stockProduct!.id, batchId: batch.id, costPrice: null })}
                                      disabled={isUpdatingCostPrice}
                                      className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 flex-shrink-0"
                                    >
                                      Clear
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditCostPriceBatchId(null)}
                                    className="h-8 text-xs flex-shrink-0"
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      const val = editCostPriceValue.trim();
                                      if (!val) return;
                                      onUpdateBatchCostPrice({ productId: stockProduct!.id, batchId: batch.id, costPrice: val });
                                    }}
                                    disabled={!editCostPriceValue.trim() || isUpdatingCostPrice}
                                    className="h-8 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                                  >
                                    {isUpdatingCostPrice ? "Saving…" : "Save"}
                                  </Button>
                                </div>
                              )}
                              {isTopUp && (
                                <div className="px-3 py-2.5 bg-green-50 border-t border-green-100 flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="1"
                                    placeholder="Units to add"
                                    value={topUpQuantity}
                                    onChange={(e) => setTopUpQuantity(e.target.value)}
                                    className="h-8 text-sm flex-1"
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    onClick={onBatchTopUp}
                                    disabled={!topUpQuantity || isTopUpPending}
                                    className="h-8 bg-green-600 hover:bg-green-700 flex-shrink-0"
                                  >
                                    {isTopUpPending ? "Adding…" : `Add ${topUpQuantity || 0}`}
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        }
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Add New Batch form */}
            {stockAdjustmentType === "increase" ? (
              <div className="space-y-3 p-3 bg-green-50 rounded-lg border border-green-100">
                <p className="text-xs text-green-700 font-medium">Stock is tracked per batch for FEFO (first-expired, first-out) picking.</p>
                <div>
                  <label className="text-sm font-medium text-gray-700">Quantity <span className="text-red-500">*</span></label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Units in this delivery"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="sm:grid sm:grid-cols-2 sm:gap-3 space-y-3 sm:space-y-0">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Best Before / Expiry <span className="text-gray-400 text-xs">(optional)</span></label>
                    <Input
                      type="date"
                      value={batchExpiry}
                      onChange={(e) => setBatchExpiry(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Batch Reference <span className="text-gray-400 text-xs">(optional)</span></label>
                    <Input
                      type="text"
                      placeholder="e.g. INV-2024-001"
                      value={batchRef}
                      onChange={(e) => setBatchRef(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Cost Price per Unit <span className="text-gray-400 text-xs">(optional)</span></label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={stockProduct?.costPrice ? `Default: £${parseFloat(stockProduct.costPrice).toFixed(2)}` : "e.g. 1.50"}
                    value={batchCostPrice}
                    onChange={(e) => setBatchCostPrice(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={onAddBatch}
                  disabled={!stockQuantity || isAddingBatch}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isAddingBatch ? "Adding..." : `Add ${stockQuantity || 0} units as new batch`}
                </Button>
              </div>
            ) : (
              /* Remove Stock — batch-aware when batches exist, global otherwise */
              ((stockProduct as (typeof stockProduct & { batchCount?: number })).batchCount ?? 0) > 0 ? (() => {
                const activeBatchList = (modalBatches as ProductBatch[]) ?? [];
                const selectedBatch = activeBatchList.find((b: ProductBatch) => b.id === selectedBatchId) ?? null;
                return (
                  <div className="space-y-3">
                    {!selectedBatch && (
                      <p className="text-xs text-orange-600 font-medium text-center py-1">↑ Tap a batch above to select it</p>
                    )}
                    {selectedBatch && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Quantity to remove</label>
                          <Input
                            type="number"
                            min="1"
                            placeholder="Enter quantity"
                            value={stockQuantity}
                            onChange={(e) => setStockQuantity(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-2 block">Reason</label>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {["Damaged goods", "Expired stock", "Stock correction", "Customer return"].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setStockReason(preset)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                  stockReason === preset
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                        <Button
                          onClick={onRemoveBatchStock}
                          disabled={!stockQuantity || !stockReason || isRemovingBatchStock}
                          className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                          {isRemovingBatchStock ? "Removing…" : (() => {
                            const ref = selectedBatch.batchNumber || 'batch';
                            const exp = selectedBatch.expiryDate ? ` · Exp ${new Date(selectedBatch.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : '';
                            return `Remove ${stockQuantity || 0} units from ${ref}${exp}`;
                          })()}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })() : (
                /* Non-batch product — original global remove flow */
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Quantity to remove</label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Enter quantity"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Reason</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {["Damaged goods", "Expired stock", "Stock correction", "Customer return"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setStockReason(preset)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            stockReason === preset
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  {stockQuantity && (
                    <div className="p-3 bg-blue-50 rounded-lg text-sm">
                      <span className="text-gray-600">New stock will be: </span>
                      <span className="font-bold text-blue-700">
                        {formatNumber(Math.max(0, stockProduct.stock - parseInt(stockQuantity || "0")))} units
                      </span>
                    </div>
                  )}
                  <Button
                    onClick={onStockAdjustment}
                    disabled={!stockQuantity || !stockReason || isAdjustingStock}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    {isAdjustingStock ? "Updating..." : `Remove ${stockQuantity || 0} units`}
                  </Button>
                </>
              )
            )}

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  Stock Movement History
                </h4>
                {stockMovements && (stockMovements as StockMovement[]).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportExcel}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                )}
              </div>
              {isLoadingMovements ? (
                <p className="text-sm text-gray-500 text-center py-4">Loading history...</p>
              ) : stockMovements && (stockMovements as StockMovement[]).length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(stockMovements as StockMovement[]).slice(0, 20).map((movement: StockMovement) => {
                    const isIncrease = movement.quantity > 0;
                    const typeLabel = movement.movementType === 'purchase' ? 'Order'
                      : movement.movementType === 'return' ? 'Return'
                      : movement.movementType === 'manual_increase' ? 'Restocked'
                      : movement.movementType === 'manual_decrease' ? 'Removed'
                      : movement.movementType === 'initial' ? 'Initial Stock'
                      : 'Updated';
                    return (
                      <div key={movement.id} className={`p-2.5 rounded-lg text-xs border-l-3 ${isIncrease ? 'bg-green-50 border-l-green-500' : 'bg-red-50 border-l-red-500'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-0">
                          <div className="flex items-center gap-1.5">
                            {isIncrease ? (
                              <ArrowUpCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            ) : (
                              <ArrowDownCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                            )}
                            <span className={`font-bold ${isIncrease ? 'text-green-700' : 'text-red-700'}`}>
                              {isIncrease ? '+' : ''}{movement.quantity} units
                            </span>
                            <span className="text-gray-500 font-medium">· {typeLabel}</span>
                            {movement.orderNumber && movement.orderId && (
                              <Link
                                href={`/orders/${movement.orderId}`}
                                className="text-blue-500 hover:text-blue-700 font-normal hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                #{movement.orderNumber}
                              </Link>
                            )}
                          </div>
                          <span className="text-gray-400 sm:flex-shrink-0">
                            {new Date(movement.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between text-gray-500 gap-0.5 sm:gap-0">
                          <span>
                            {movement.reason || ''}
                            {movement.customerName && (
                              <span className="text-gray-400 font-normal">{movement.reason ? ' · ' : ''}{movement.customerName}</span>
                            )}
                            {movement.businessProfileName && (
                              <span className="ml-1 text-blue-600 font-medium">· {movement.businessProfileName}</span>
                            )}
                          </span>
                          <span className="sm:flex-shrink-0 sm:ml-2 font-medium">
                            {movement.stockBefore} → {movement.stockAfter}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No stock movements recorded yet</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
