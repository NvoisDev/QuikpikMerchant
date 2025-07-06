import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  ShoppingCart, 
  Plus, 
  Minus, 
  BarChart3,
  History,
  Edit3,
  Activity
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface StockMovement {
  id: number;
  productId: number;
  wholesalerId: string;
  movementType: 'purchase' | 'manual_increase' | 'manual_decrease' | 'initial';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  orderId: number | null;
  customerName: string | null;
  createdAt: string;
}

interface StockSummary {
  openingStock: number;
  totalPurchases: number;
  totalIncreases: number;
  totalDecreases: number;
  currentStock: number;
}

interface Product {
  id: number;
  name: string;
  stock: number;
}

interface StockTrackerProps {
  product: Product;
}

export default function StockTracker({ product }: StockTrackerProps) {
  const { toast } = useToast();
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustmentType: 'increase',
    quantity: '',
    reason: ''
  });

  // Fetch stock movements
  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: [`/api/products/${product.id}/stock-movements`],
    enabled: !!product.id,
  });

  // Fetch stock summary
  const { data: summary, isLoading: summaryLoading } = useQuery<StockSummary>({
    queryKey: [`/api/products/${product.id}/stock-summary`],
    enabled: !!product.id,
  });

  // Stock adjustment mutation
  const adjustStockMutation = useMutation({
    mutationFn: async (data: { adjustmentType: string; quantity: string; reason: string }) => {
      const response = await apiRequest('POST', `/api/products/${product.id}/stock-adjustment`, data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Stock Adjusted",
        description: data.message,
      });
      setShowAdjustment(false);
      setAdjustmentForm({ adjustmentType: 'increase', quantity: '', reason: '' });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/stock-summary`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    },
    onError: (error: any) => {
      toast({
        title: "Adjustment Failed",
        description: error.message || "Failed to adjust stock",
        variant: "destructive",
      });
    },
  });

  const handleAdjustStock = () => {
    if (!adjustmentForm.quantity || !adjustmentForm.reason) {
      toast({
        title: "Missing Information",
        description: "Please enter quantity and reason for adjustment",
        variant: "destructive",
      });
      return;
    }

    adjustStockMutation.mutate(adjustmentForm);
  };

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return <ShoppingCart className="w-4 h-4 text-red-600" />;
      case 'manual_increase':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'manual_decrease':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'initial':
        return <Package className="w-4 h-4 text-blue-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'Customer Purchase';
      case 'manual_increase':
        return 'Manual Increase';
      case 'manual_decrease':
        return 'Manual Decrease';
      case 'initial':
        return 'Initial Stock';
      default:
        return 'Unknown';
    }
  };

  const formatQuantity = (quantity: number, type: string) => {
    if (type === 'purchase' || type === 'manual_decrease') {
      return `${Math.abs(quantity)}`;
    }
    return `+${quantity}`;
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat().format(value);
  };

  if (summaryLoading || movementsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Stock Tracker</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Stock Tracker</span>
          </CardTitle>
          <Dialog open={showAdjustment} onOpenChange={setShowAdjustment}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4" />
                <span>Adjust Stock</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adjust Stock for {product.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="adjustmentType">Adjustment Type</Label>
                  <Select 
                    value={adjustmentForm.adjustmentType} 
                    onValueChange={(value) => setAdjustmentForm({...adjustmentForm, adjustmentType: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select adjustment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="increase">Increase Stock</SelectItem>
                      <SelectItem value="decrease">Decrease Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={adjustmentForm.quantity}
                    onChange={(e) => setAdjustmentForm({...adjustmentForm, quantity: e.target.value})}
                    placeholder="Enter quantity"
                  />
                </div>
                
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    value={adjustmentForm.reason}
                    onChange={(e) => setAdjustmentForm({...adjustmentForm, reason: e.target.value})}
                    placeholder="Enter reason for adjustment (e.g., Damaged goods, Returns, New shipment)"
                    rows={3}
                  />
                </div>
                
                <div className="flex space-x-3">
                  <Button 
                    onClick={handleAdjustStock}
                    disabled={adjustStockMutation.isPending}
                    className="flex-1"
                  >
                    {adjustStockMutation.isPending ? 'Adjusting...' : 'Confirm Adjustment'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAdjustment(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stock Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{formatNumber(summary.openingStock)}</div>
              <div className="text-sm text-blue-700">Opening Stock</div>
            </div>
            
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{formatNumber(summary.totalPurchases)}</div>
              <div className="text-sm text-red-700">Total Purchases</div>
            </div>
            
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{formatNumber(summary.totalIncreases)}</div>
              <div className="text-sm text-green-700">Manual Increases</div>
            </div>
            
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{formatNumber(summary.totalDecreases)}</div>
              <div className="text-sm text-orange-700">Manual Decreases</div>
            </div>
            
            <div className="text-center p-3 bg-gray-50 rounded-lg border-2 border-gray-300">
              <div className="text-2xl font-bold text-gray-800">{formatNumber(summary.currentStock)}</div>
              <div className="text-sm text-gray-700">Current Stock</div>
            </div>
          </div>
        )}

        <Separator />

        {/* Stock Movements */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <History className="w-5 h-5" />
            <span>Recent Movements</span>
          </h3>
          
          {movements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No stock movements recorded yet</p>
              <p className="text-sm">Stock movements will appear here when customers purchase or when you make adjustments</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {movements.map((movement: StockMovement) => (
                <div key={movement.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getMovementIcon(movement.movementType)}
                    <div>
                      <div className="font-medium">{getMovementLabel(movement.movementType)}</div>
                      <div className="text-sm text-gray-600">
                        {movement.reason || 'No reason provided'}
                        {movement.customerName && ` • Customer: ${movement.customerName}`}
                        {movement.orderId && ` • Order #${movement.orderId}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(movement.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <Badge 
                      variant={movement.quantity > 0 ? 'default' : 'destructive'}
                      className="mb-1"
                    >
                      {formatQuantity(movement.quantity, movement.movementType)}
                    </Badge>
                    <div className="text-sm text-gray-600">
                      {formatNumber(movement.stockBefore)} → {formatNumber(movement.stockAfter)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}