import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Upload, AlertCircle, CheckCircle, TriangleAlert, X } from "lucide-react";
import type { BulkUploadRow } from "./types";
import Papa from "papaparse";
import { useState, useRef, useMemo, useEffect } from "react";

const CSV_TEMPLATE_ROWS = [
  {
    name: "Example Product 1", description: "Premium Basmati Rice for wholesale",
    price: "25.99", promoPrice: "22.99", promoActive: "false", currency: "GBP",
    moq: "10", stock: "500", category: "Groceries & Food", imageUrl: "",
    priceVisible: "true", hiddenFromPublic: "false", status: "active", unit: "kg", unitFormat: "25kg bags",
    sellingFormat: "units", unitsPerPallet: "40", palletPrice: "950.00", palletMoq: "1",
    palletStock: "5", palletWeight: "1000", temperatureRequirement: "ambient",
    contentCategory: "food", specialHandling_fragile: "false",
    specialHandling_perishable: "false", specialHandling_hazardous: "false",
    deliveryOptions_pickup: "true", deliveryOptions_delivery: "true",
  },
  {
    name: "Example Product 2", description: "Premium olive oil bottles",
    price: "8.50", promoPrice: "", promoActive: "false", currency: "GBP",
    moq: "12", stock: "240", category: "Groceries & Food", imageUrl: "",
    priceVisible: "true", hiddenFromPublic: "false", status: "active", unit: "ml", unitFormat: "12 x 500ml",
    sellingFormat: "units", unitsPerPallet: "120", palletPrice: "850.00", palletMoq: "1",
    palletStock: "2", palletWeight: "60", temperatureRequirement: "ambient",
    contentCategory: "food", specialHandling_fragile: "false",
    specialHandling_perishable: "false", specialHandling_hazardous: "false",
    deliveryOptions_pickup: "true", deliveryOptions_delivery: "true",
  },
  {
    name: "Example Product 3", description: "Energy drink cans",
    price: "1.25", promoPrice: "1.10", promoActive: "true", currency: "GBP",
    moq: "24", stock: "1200", category: "Beverages & Drinks", imageUrl: "",
    priceVisible: "true", hiddenFromPublic: "false", status: "active", unit: "cl", unitFormat: "24 x 33cl",
    sellingFormat: "units", unitsPerPallet: "480", palletPrice: "600.00", palletMoq: "1",
    palletStock: "3", palletWeight: "168", temperatureRequirement: "ambient",
    contentCategory: "food", specialHandling_fragile: "false",
    specialHandling_perishable: "false", specialHandling_hazardous: "false",
    deliveryOptions_pickup: "true", deliveryOptions_delivery: "true",
  },
];

export function downloadProductCsvTemplate() {
  const csv = Papa.unparse(CSV_TEMPLATE_ROWS);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'product_template_with_units.csv';
  a.click();
  window.URL.revokeObjectURL(url);
}

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploadedProducts: BulkUploadRow[];
  uploadErrors: string[];
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmUpload: () => void;
  onCancelUpload: () => void;
  onUpdateProduct: (index: number, updates: Partial<BulkUploadRow>) => void;
  isBulkCreating: boolean;
}

function InlineNumberCell({
  value,
  min,
  isInteger,
  onChange,
}: {
  value: string;
  min: number;
  isInteger?: boolean;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const isInvalid = (() => {
    const n = parseFloat(draft);
    if (isNaN(n) || n < min) return true;
    if (isInteger && !Number.isInteger(n)) return true;
    return false;
  })();

  const commit = () => {
    if (!isInvalid) {
      onChange(draft);
    } else {
      setDraft(value);
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="group flex items-center gap-1 rounded px-1 py-0.5 text-sm text-gray-900 hover:bg-green-50 hover:ring-1 hover:ring-green-300 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
        title="Click to edit"
        onClick={() => {
          setDraft(value);
          setEditing(true);
          setTimeout(() => inputRef.current?.select(), 0);
        }}
      >
        {value}
        <span className="opacity-0 group-hover:opacity-60 text-xs text-green-600">✎</span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      type="number"
      step={isInteger ? "1" : "0.01"}
      min={min}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className={`w-20 rounded border px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 ${
        isInvalid
          ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-400"
          : "border-green-400 bg-green-50 text-gray-900 focus:ring-green-500"
      }`}
    />
  );
}

export default function BulkUploadDialog({
  open,
  onOpenChange,
  uploadedProducts,
  uploadErrors,
  onFileUpload,
  onConfirmUpload,
  onCancelUpload,
  onUpdateProduct,
  isBulkCreating,
}: BulkUploadDialogProps) {
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    setWarningDismissed(false);
  }, [uploadedProducts.length]);

  const suspiciousRows = useMemo(() => {
    return uploadedProducts.filter(p => {
      const price = parseFloat(p.price);
      const moq = parseFloat(p.moq);
      return price === 0 || isNaN(price) || moq === 0 || isNaN(moq);
    });
  }, [uploadedProducts]);

  const hasIssues = suspiciousRows.length > 0;
  const confirmBlocked = hasIssues && !warningDismissed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Products</DialogTitle>
        </DialogHeader>

        {uploadedProducts.length === 0 && uploadErrors.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">Upload Product File</h3>
              <p className="mt-1 text-sm text-gray-500">
                Upload a CSV or Excel file with your product data
              </p>
              <div className="mt-6">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={onFileUpload}
                  className="hidden"
                  id="bulk-upload-file"
                />
                <label htmlFor="bulk-upload-file">
                  <Button variant="outline" className="cursor-pointer" asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Choose File
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">File Format Requirements:</h4>
              <div className="text-sm text-gray-600 space-y-2">
                <p><strong>Required columns:</strong> name, price, moq, stock</p>
                <p><strong>Optional columns:</strong> description, promoPrice, promoActive, currency, category, imageUrl, priceVisible, hiddenFromPublic, status, unit, unitFormat, sellingFormat, unitsPerPallet, palletPrice, palletMoq, palletStock, palletWeight, temperatureRequirement, contentCategory, supportsPickup, supportsDelivery</p>
                <p><strong>Supported formats:</strong> CSV, Excel (.xlsx)</p>
              </div>
              <Button variant="link" onClick={downloadProductCsvTemplate} className="p-0">
                Download template file to get started
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {uploadErrors.length > 0 && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Upload Errors</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <ul className="list-disc list-inside space-y-1">
                        {uploadErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="border border-green-200 bg-green-50 rounded-lg p-4">
              <div className="flex">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    {uploadedProducts.length} Products Ready to Upload
                  </h3>
                </div>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Price
                      <span className="ml-1 normal-case font-normal text-gray-400">(click to edit)</span>
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      MOQ
                      <span className="ml-1 normal-case font-normal text-gray-400">(click to edit)</span>
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Stock
                      <span className="ml-1 normal-case font-normal text-gray-400">(click to edit)</span>
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Visibility</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploadedProducts.map((product, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.name}</td>
                      <td className="px-4 py-2 text-sm">
                        <InlineNumberCell
                          value={product.price}
                          min={0}
                          onChange={v => onUpdateProduct(index, { price: v })}
                        />
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <InlineNumberCell
                          value={product.moq}
                          min={1}
                          isInteger
                          onChange={v => onUpdateProduct(index, { moq: v })}
                        />
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <InlineNumberCell
                          value={product.stock}
                          min={0}
                          isInteger
                          onChange={v => onUpdateProduct(index, { stock: v })}
                        />
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.unit || 'units'} {product.unitFormat && `(${product.unitFormat})`}</td>
                      <td className="px-4 py-2 text-sm">
                        <button
                          type="button"
                          onClick={() => onUpdateProduct(index, { hiddenFromPublic: !product.hiddenFromPublic })}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500"
                          style={product.hiddenFromPublic
                            ? { background: '#f3f4f6', color: '#4b5563' }
                            : { background: '#dcfce7', color: '#15803d' }
                          }
                          title="Click to toggle visibility"
                        >
                          {product.hiddenFromPublic ? 'Hidden' : 'Public'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasIssues && !warningDismissed && (
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-800">
                      {suspiciousRows.length} product{suspiciousRows.length > 1 ? "s have" : " has"} a zero or missing price / MOQ
                    </h3>
                    <p className="mt-1 text-sm text-amber-700">
                      These products will be created at £0.00 or with MOQ 0 unless you fix them first. Click each value in the table above to edit it inline.
                    </p>
                    <ul className="mt-2 text-sm text-amber-800 list-disc list-inside space-y-0.5">
                      {suspiciousRows.map((p, i) => {
                        const price = parseFloat(p.price);
                        const moq = parseFloat(p.moq);
                        const issues: string[] = [];
                        if (price === 0 || isNaN(price)) issues.push("price is 0");
                        if (moq === 0 || isNaN(moq)) issues.push("MOQ is 0");
                        return (
                          <li key={i}>
                            <span className="font-medium">{p.name}</span> — {issues.join(", ")}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setWarningDismissed(true)}
                      className="mt-3 text-xs text-amber-700 underline hover:text-amber-900 focus:outline-none"
                    >
                      I understand, confirm anyway
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWarningDismissed(true)}
                    className="shrink-0 text-amber-500 hover:text-amber-700 focus:outline-none"
                    aria-label="Dismiss warning"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {hasIssues && warningDismissed && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Uploading with zero/missing prices — fix values in the table above to remove this warning.</span>
                <button
                  type="button"
                  onClick={() => setWarningDismissed(false)}
                  className="ml-auto underline hover:text-amber-900 focus:outline-none"
                >
                  Show details
                </button>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={onCancelUpload}>
                Cancel
              </Button>
              <Button
                onClick={onConfirmUpload}
                disabled={isBulkCreating || uploadedProducts.length === 0 || confirmBlocked}
                variant={confirmBlocked ? "outline" : "default"}
                className={confirmBlocked ? "border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 cursor-not-allowed" : ""}
                title={confirmBlocked ? "Fix zero prices/MOQs above or dismiss the warning before confirming" : undefined}
              >
                {isBulkCreating ? "Creating..." : `Create ${uploadedProducts.length} Products`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
