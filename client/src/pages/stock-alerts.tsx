import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Package, Check, X, Settings, Eye, EyeOff, Info } from "lucide-react";
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
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center space-y-6">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-6 bg-gradient-to-t from-orange-400 to-red-500 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '1.5s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Loading stock alerts...</p>
          
          {/* Skeleton Content */}
          <div className="w-full space-y-4 mt-8">
            <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
            <div className="space-y-3">
              <div className="h-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Stock Alerts" description="Monitor and manage low stock notifications">
        
        <div className="flex items-center gap-3 md:gap-4">
          <div className="text-left md:text-right">
            <p className="text-xs md:text-sm text-gray-600">Default Threshold for New Products</p>
            <p className="text-base md:text-lg font-semibold">{user?.defaultLowStockThreshold || 50} units</p>
          </div>
          
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
                  Configure default low stock threshold for new products
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
                  <p className="text-sm text-gray-600">
                    This threshold will be used for all new products you create
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
        </div>
      </PageHeader>
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">

        {/* How stock alerts work */}
        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-500" />
          <div className="space-y-1">
            <p className="font-semibold">How stock alerts work</p>
            <ul className="space-y-1 text-blue-700">
              <li>• Stock levels are checked automatically every day at <strong>8 AM</strong></li>
              <li>• If a product is at or below its threshold, you'll receive an <strong>email alert</strong> and it will appear here</li>
              <li>• Each product can only trigger <strong>one alert per 24 hours</strong> — you won't be flooded with repeats</li>
              <li>• Use the <strong>settings icon</strong> on each alert below to adjust the threshold for that product, or use <strong>Settings</strong> above to set a global default for new products</li>
            </ul>
          </div>
        </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Package className="h-12 w-12 text-gray-400 mx-auto" />
              <div>
                <h3 className="text-lg font-medium">No Stock Alerts</h3>
                <p className="text-gray-600">All your products have healthy stock levels</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert: StockAlert) => (
            <Card key={alert.id} className={`${getAlertColor(alert.alertType)} ${!alert.isRead ? 'border-l-4' : ''}`}>
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start space-x-3 md:space-x-4">
                    {getAlertIcon(alert.alertType)}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-sm md:text-base">{alert.product.name}</h3>
                        {!alert.isRead && (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium">Current Stock:</span> {alert.currentStock} units
                        </p>
                        <p>
                          <span className="font-medium">Alert Threshold:</span> {alert.product.lowStockThreshold} units
                        </p>
                        <p>
                          <span className="font-medium">Alert Type:</span>{" "}
                          <Badge variant={alert.alertType === 'out_of_stock' ? 'destructive' : 'secondary'} className="text-xs">
                            {alert.alertType === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                          </Badge>
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-7 md:ml-0 flex-wrap">
                    {!alert.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkAsRead(alert.id)}
                        disabled={markAsReadMutation.isPending}
                        className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateProductThreshold(alert)}
                      className="h-8 text-xs md:text-sm"
                    >
                      <Settings className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                      Adjust
                    </Button>
                    
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleResolveAlert(alert.id)}
                      disabled={resolveAlertMutation.isPending}
                      className="h-8 text-xs md:text-sm"
                    >
                      <Check className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                      Resolve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Product Threshold Dialog */}
      <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock Alert Threshold</DialogTitle>
            <DialogDescription>
              Set a threshold for this product only — this overrides your account default. You'll be alerted when stock drops to or below this number.
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
              <p className="text-sm text-gray-600">
                This applies to this product only and overrides your account default.
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleSubmitThreshold}
                disabled={!productThreshold || updateProductThresholdMutation.isPending}
                className="flex-1"
              >
                {updateProductThresholdMutation.isPending ? "Updating..." : "Update Threshold"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setThresholdDialogOpen(false)}
                className="flex-1"
              >
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