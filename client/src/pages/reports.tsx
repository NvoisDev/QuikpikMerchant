import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { Download, Package, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ExcelJS from "exceljs";
import { format } from "date-fns";

interface StockSummaryRow {
  name: string;
  openingStock: number;
  totalIn: number;
  totalSold: number;
  currentStock: number;
}

export default function Reports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stockSummaryLoading, setStockSummaryLoading] = useState(false);

  async function downloadStockSummary() {
    setStockSummaryLoading(true);
    try {
      const res = await fetch('/api/reports/stock-summary', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch report data');
      const rows: StockSummaryRow[] = await res.json();

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Stock Summary');

      ws.columns = [
        { header: 'Product', key: 'name', width: 32 },
        { header: 'Opening Stock', key: 'openingStock', width: 16 },
        { header: 'Total In', key: 'totalIn', width: 14 },
        { header: 'Total Sold', key: 'totalSold', width: 14 },
        { header: 'Current Stock', key: 'currentStock', width: 16 },
      ];

      // Style the header row
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5E9' },
      };
      headerRow.alignment = { vertical: 'middle' };

      rows.forEach((row) => ws.addRow(row));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock-summary-${format(new Date(), 'dd-MM-yyyy')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Downloaded', description: `${rows.length} products exported.` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Download failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setStockSummaryLoading(false);
    }
  }

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Reports" description="Download pre-built reports for your business" />

      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Stock Summary card */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Package className="h-5 w-5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base">Stock Summary</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Every product with opening stock, total in, total sold, and current stock.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button
                onClick={downloadStockSummary}
                disabled={stockSummaryLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                {stockSummaryLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download .xlsx
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
