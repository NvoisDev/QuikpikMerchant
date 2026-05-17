import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";
import Papa from "papaparse";
import ExcelJS from "exceljs";

function fmtExportDate(val: string | null | undefined): string {
  if (!val) return "";
  return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function humanStatus(s: string, stock: number | null | undefined, threshold: number | null | undefined): string {
  if (s === "inactive") return "Inactive";
  const stockVal = stock ?? 0;
  if (s === "out_of_stock" || stockVal === 0) return "Out of Stock";
  if (stockVal <= (threshold ?? 50)) return "Low Stock";
  return "In Stock";
}

function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface DownloadProductsModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[] | undefined;
  isViewer: boolean;
}

export default function DownloadProductsModal({ open, onClose, products, isViewer }: DownloadProductsModalProps) {
  const { toast } = useToast();
  const [exportType, setExportType] = useState<'summary' | 'batch'>('summary');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [includeOutOfStock, setIncludeOutOfStock] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    if (!products || products.length === 0) return;
    const today = new Date().toISOString().substring(0, 10);

    // Always fetch fresh product data at download time so remaining stock
    // reflects the true current DB value, not a potentially stale page cache.
    setIsLoading(true);
    let liveProducts: Product[] = products;
    try {
      const freshRes = await fetch("/api/products", { credentials: "include" });
      if (freshRes.ok) liveProducts = await freshRes.json();
    } catch {
      // Fall back to cached products if the fetch fails
    }

    const filtered = (includeOutOfStock ? liveProducts : liveProducts.filter((p) => p.status === "active")) as Product[];

    if (exportType === "summary") {
      setIsLoading(false);
      const rows = filtered.map((p: Product) => {
        const row: Record<string, unknown> = {
          "Name": p.name ?? "",
          "Category": p.category ?? "",
          "Description": p.description ?? "",
          "Price": p.price ?? "",
          "Currency": p.currency ?? "",
          "MOQ": p.moq ?? "",
          "Remaining Stock": p.stock ?? "",
          "Status": humanStatus(p.status ?? "", p.stock, p.lowStockThreshold),
          "Selling Format": p.sellingFormat ?? "",
          "Pack Qty": p.quantityInPack ?? "",
          "Unit of Measure": p.unitOfMeasure ?? "",
          "Unit Size": p.unitSize ?? "",
          "Units per Pallet": p.unitsPerPallet ?? "",
          "Pallet Price": p.palletPrice ?? "",
          "Pallet MOQ": p.palletMoq ?? "",
        };
        if (!isViewer) row["Cost Price"] = p.costPrice ?? "";
        row["Low Stock Threshold"] = p.lowStockThreshold ?? "";
        row["Expiry Date"] = p.expiryDate ? fmtExportDate(p.expiryDate) : "";
        row["Temperature Requirement"] = p.temperatureRequirement ?? "";
        return row;
      });
      if (format === "xlsx") {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Stock Summary");
        if (rows.length > 0) {
          ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 20 }));
          rows.forEach((row) => ws.addRow(row));
        }
        const buffer = await wb.xlsx.writeBuffer();
        triggerFileDownload(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `stock_summary_${today}.xlsx`);
      } else {
        const csv = Papa.unparse(rows);
        triggerFileDownload(new Blob([csv], { type: "text/csv" }), `stock_summary_${today}.csv`);
      }
      onClose();
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/products/batches/all");
      if (!res.ok) throw new Error("Server error");
      const allBatches: Array<{
        id: number; productId: number; productName: string; batchNumber: string | null;
        quantity: number; originalQuantity: number | null; expiryDate: string | null;
        createdAt: string | null; costPrice: string | null; status: string;
      }> = await res.json();
      const filteredIds = new Set(filtered.map((p: Product) => p.id));
      const batchRows = allBatches
        .filter((b) => filteredIds.has(b.productId))
        .map((b) => ({
          "Product Name": b.productName ?? "",
          "Batch ID": b.batchNumber || `#${b.id}`,
          "Original Qty": b.originalQuantity ?? b.quantity ?? "",
          "Quantity": b.quantity ?? "",
          "Expiry Date": b.expiryDate ? fmtExportDate(b.expiryDate) : "No expiry",
          "Received Date": fmtExportDate(b.createdAt),
          "Status": b.status ?? "",
          ...(isViewer ? {} : { "Cost Price": b.costPrice ?? "" }),
        }));
      if (format === "xlsx") {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Batch Details");
        if (batchRows.length > 0) {
          ws.columns = Object.keys(batchRows[0]).map((k) => ({ header: k, key: k, width: 20 }));
          batchRows.forEach((row) => ws.addRow(row));
        }
        const buffer = await wb.xlsx.writeBuffer();
        triggerFileDownload(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `batch_details_${today}.xlsx`);
      } else {
        const csv = Papa.unparse(batchRows);
        triggerFileDownload(new Blob([csv], { type: "text/csv" }), `batch_details_${today}.csv`);
      }
      onClose();
    } catch {
      toast({ title: "Download failed", description: "Could not fetch batch data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Download Products</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-1">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Export type</p>
            <div className="space-y-2">
              {([
                { value: 'summary', label: 'Stock Summary', sub: 'One row per product — clean, finance-friendly', recommended: true },
                { value: 'batch', label: 'Batch-Level Detail', sub: 'One row per batch — expiry tracking & audits', recommended: false },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExportType(opt.value)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${exportType === opt.value ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${exportType === opt.value ? 'border-green-500 bg-green-500' : 'border-gray-300'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {opt.label}{opt.recommended && <span className="text-xs text-green-600 font-normal ml-1">(recommended)</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Format</p>
            <div className="flex gap-2">
              {(['xlsx', 'csv'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${format === fmt ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {fmt === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-gray-700">Include out-of-stock products</p>
            <Switch checked={includeOutOfStock} onCheckedChange={setIncludeOutOfStock} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleDownload}
              disabled={isLoading || !products || products.length === 0}
            >
              {isLoading ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Preparing…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Download className="h-4 w-4" /> Download
                </span>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
