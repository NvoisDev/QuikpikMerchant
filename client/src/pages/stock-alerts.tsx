import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Package, Check, X, Settings, Eye, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface StockAlert {
  id: number;
  productId: number;
  wholesalerId: string;
  alertType: 'low_stock' | 'out_of_stock';
  currentStock: number;
  threshold: number;
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
  product: {
    id: number;
    name: string;
    sku: string;
    imageUrl?: string;
    stock: number;
    lowStockThreshold: number;
  };
}

interface User {
  defaultLowStockThreshold: number;
}

export default function StockAlerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<StockAlert | null>(null);
  const [thresholdDialogOpen, setThresholdDialogOpen] = useState(false);
  const [productThreshold, setProductThreshold] = useState<string>("");
  const [defaultThreshold, setDefaultThreshold] = useState<string>("");

  // Fetch stock alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['/api/stock-alerts'],
  });

  // Fetch user info for default threshold
  const { data: user } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  // Mark alert as read
  const markAsReadMutation = useMutation({
    mutationFn: async (alertId: number) => {
      await apiRequest('PATCH', `/api/stock-alerts/${alertId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts/count'] });
    },
  });

  // Resolve alert
  const resolveAlertMutation = useMutation({
    mutationFn: async (alertId: number) => {
      await apiRequest('PATCH', `/api/stock-alerts/${alertId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts/count'] });
      toast({
        title: "Alert Resolved",
        description: "Stock alert has been marked as resolved.",
      });
    },
  });

  // Update product threshold
  const updateProductThresholdMutation = useMutation({
    mutationFn: async ({ productId, threshold }: { productId: number; threshold: number }) => {
      await apiRequest('PATCH', `/api/products/${productId}/low-stock-threshold`, { threshold });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      setThresholdDialogOpen(false);
      toast({
        title: "Threshold Updated",
        description: "Product low stock threshold has been updated.",
      });
    },
  });

  // Update default threshold
  const updateDefaultThresholdMutation = useMutation({
    mutationFn: async (threshold: number) => {
      await apiRequest('PATCH', '/api/settings/default-low-stock-threshold', { threshold });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Default Threshold Updated",
        description: "Default low stock threshold has been updated for new products.",
      });
    },
  });

  const handleMarkAsRead = (alertId: number) => {
    markAsReadMutation.mutate(alertId);
  };

  const handleResolveAlert = (alertId: number) => {
    resolveAlertMutation.mutate(alertId);
  };

  const handleUpdateProductThreshold = (alert: StockAlert) => {
    setSelectedAlert(alert);
    setProductThreshold(alert.product.lowStockThreshold.toString());
    setThresholdDialogOpen(true);
  };

  const handleSubmitThreshold = () => {
    if (!selectedAlert || !productThreshold) return;
    
    const threshold = parseInt(productThreshold);
    if (threshold < 0) {
      toast({
        title: "Invalid Threshold",
        description: "Threshold must be 0 or greater.",
        variant: "destructive",
      });
      return;
    }

    updateProductThresholdMutation.mutate({
      productId: selectedAlert.productId,
      threshold,
    });
  };

  const handleUpdateDefaultThreshold = () => {
    const threshold = parseInt(defaultThreshold);
    if (threshold < 0) {
      toast({
        title: "Invalid Threshold",
        description: "Threshold must be 0 or greater.",
        variant: "destructive",
      });
      return;
    }

    updateDefaultThresholdMutation.mutate(threshold);
    setDefaultThreshold("");
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'out_of_stock':
        return <X className="h-4 w-4 text-red-500" />;
      case 'low_stock':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getAlertColor = (alertType: string) => {
    switch (alertType) {
      case 'out_of_stock':
        return 'bg-red-50 border-red-200';
      case 'low_stock':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white min-h-screen">
        <PageHeader title="Stock Alerts" description="Monitor and manage low stock notifications" />
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Stock Alerts" description="Monitor and manage low stock notifications">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stock Alert Settings</DialogTitle>
              <DialogDescription>
                Default threshold for new products is currently <strong>{user?.defaultLowStockThreshold || 50} units</strong>. Update it below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="defaultThreshold">Default Low Stock Threshold</Label>
                <Input
                  id="defaultThreshold"
                  type="number"
                  min="0"
                  placeholder={user?.defaultLowStockThreshold?.toString() || "50"}
                  value={defaultThreshold}
                  onChange={(e) => setDefaultThreshold(e.target.value)}
                />
                <p className="text-sm text-gray-500">
                  Applies to all new products. Individual products can override this.
                </p>
              </div>
              <Button
                onClick={handleUpdateDefaultThreshold}
                disabled={!defaultThreshold || updateDefaultThresholdMutation.isPending}
                className="w-full"
              >
                {updateDefaultThresholdMutation.isPending ? "Updating..." : "Update Default"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">

        {/* Compact info banner */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
          <p>
            Stock is checked daily at <strong>8 AM</strong>. Products at or below their threshold appear here and trigger an email alert — one per product per 24 hours. Use <strong>Adjust</strong> on any card to set a per-product threshold.
          </p>
        </div>

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-3">
                <Package className="h-10 w-10 text-gray-300 mx-auto" />
                <div>
                  <h3 className="text-base font-medium text-gray-700">No stock alerts</h3>
                  <p className="text-sm text-gray-500">All your products have healthy stock levels</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert: StockAlert) => (
              <Card
                key={alert.id}
                className={`${getAlertColor(alert.alertType)} ${!alert.isRead ? 'border-l-4' : 'border'}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {/* Info block — full width on mobile */}
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{getAlertIcon(alert.alertType)}</div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-medium text-sm">{alert.product.name}</span>
                          {!alert.isRead && (
                            <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">New</Badge>
                          )}
                          <Badge
                            variant={alert.alertType === 'out_of_stock' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {alert.alertType === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {alert.product.stock} in stock · threshold {alert.product.lowStockThreshold} · {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons — full width row on mobile */}
                    <div className="flex items-center gap-2">
                      {!alert.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(alert.id)}
                          disabled={markAsReadMutation.isPending}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                          title="Mark as read"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateProductThreshold(alert)}
                        className="h-8 text-xs px-3"
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Adjust
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleResolveAlert(alert.id)}
                        disabled={resolveAlertMutation.isPending}
                        className="h-8 text-xs px-3 bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Per-product threshold dialog */}
        <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust Alert Threshold</DialogTitle>
              <DialogDescription>
                Set a threshold for <strong>{selectedAlert?.product.name}</strong> only. This overrides your account default — you'll be alerted when stock drops to or below this number.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="productThreshold">Low Stock Threshold</Label>
                <Input
                  id="productThreshold"
                  type="number"
                  min="0"
                  value={productThreshold}
                  onChange={(e) => setProductThreshold(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSubmitThreshold}
                  disabled={!productThreshold || updateProductThresholdMutation.isPending}
                  className="flex-1"
                >
                  {updateProductThresholdMutation.isPending ? "Updating..." : "Update Threshold"}
                </Button>
                <Button variant="outline" onClick={() => setThresholdDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}