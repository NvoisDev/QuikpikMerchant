import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import type { BulkUploadRow } from "./types";
import Papa from "papaparse";

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
  const { formatMoney } = useCurrency();
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
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">MOQ</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Visibility</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploadedProducts.map((product, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{formatMoney(parseFloat(product.price))}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.moq}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.stock}</td>
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

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={onCancelUpload}>
                Cancel
              </Button>
              <Button
                onClick={onConfirmUpload}
                disabled={isBulkCreating || uploadedProducts.length === 0}
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
