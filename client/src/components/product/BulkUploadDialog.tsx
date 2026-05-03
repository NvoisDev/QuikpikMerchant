import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import type { BulkUploadRow } from "./types";

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploadedProducts: BulkUploadRow[];
  uploadErrors: string[];
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmUpload: () => void;
  onCancelUpload: () => void;
  isBulkCreating: boolean;
  onDownloadTemplate: () => void;
}

export default function BulkUploadDialog({
  open,
  onOpenChange,
  uploadedProducts,
  uploadErrors,
  onFileUpload,
  onConfirmUpload,
  onCancelUpload,
  isBulkCreating,
  onDownloadTemplate,
}: BulkUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Products</DialogTitle>
        </DialogHeader>

        {uploadedProducts.length === 0 ? (
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
                  accept=".csv,.xlsx,.xls"
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
                <p><strong>Optional columns:</strong> description, promoPrice, promoActive, currency, category, imageUrl, priceVisible, status, unit, unitFormat, sellingFormat, unitsPerPallet, palletPrice, palletMoq, palletStock, palletWeight, temperatureRequirement, contentCategory, supportsPickup, supportsDelivery</p>
                <p><strong>Supported formats:</strong> CSV, Excel (.xlsx, .xls)</p>
              </div>
              <Button variant="link" onClick={onDownloadTemplate} className="p-0">
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploadedProducts.map((product, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{formatCurrency(parseFloat(product.price), product.currency)}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.moq}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.stock}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{product.unit || 'units'} {product.unitFormat && `(${product.unitFormat})`}</td>
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
