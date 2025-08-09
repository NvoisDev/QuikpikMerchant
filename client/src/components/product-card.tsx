
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currencies";
import { cleanAIDescription } from "@shared/utils";

// Utility function to format numbers with commas
const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};
import { useQuery } from "@tanstack/react-query";
import { 
  MoreHorizontal, 
  Edit, 
  Copy, 
  Trash2, 
  AlertTriangle,
  BarChart3,
  DollarSign,
  Target,
  TrendingUp
} from "lucide-react";
import { SocialShare } from "@/components/social-share";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StockTracker from "@/components/stock-tracker";
import { PromotionAnalytics } from "@/components/PromotionAnalytics";
import { useState } from "react";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  currency?: string;
  moq: number;
  stock: number;
  imageUrl?: string;
  images?: string[];
  category?: string;
  status: "active" | "inactive" | "out_of_stock" | "locked";
  priceVisible: boolean;
  negotiationEnabled: boolean;
  editCount?: number;
  createdAt?: string;
  lowStockThreshold?: number;
  packQuantity?: number;
  unitSize?: string;
  unitOfMeasure?: string;
  // Pallet configuration fields
  sellingFormat?: "units" | "pallets" | "both";
  unitsPerPallet?: number;
  palletPrice?: number;
  palletMoq?: number;
  palletStock?: number;
  palletWeight?: number;
}

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onDuplicate?: (product: Product) => void;
  onStatusChange?: (id: number, status: "active" | "inactive" | "out_of_stock" | "locked") => void;
  showPromotionAnalytics?: boolean;
}

export default function ProductCard({ 
  product, 
  onEdit, 
  onDelete, 
  onDuplicate,
  onStatusChange,
  showPromotionAnalytics = false
}: ProductCardProps) {
  const [showStockTracker, setShowStockTracker] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);

  // Fetch subscription status
  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      const response = await fetch("/api/subscription/status", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch subscription");
      return response.json();
    },
  });

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "active":
        return { 
          label: "Active", 
          className: "bg-green-100 text-green-800 hover:bg-green-200", 
          dotColor: "bg-green-500" 
        };
      case "inactive":
        return { 
          label: "Inactive", 
          className: "bg-gray-100 text-gray-800 hover:bg-gray-200", 
          dotColor: "bg-gray-500" 
        };
      case "out_of_stock":
        return { 
          label: "Out of Stock", 
          className: "bg-red-100 text-red-800 hover:bg-red-200", 
          dotColor: "bg-red-500" 
        };
      case "locked":
        return { 
          label: "Locked", 
          className: "bg-orange-100 text-orange-800 hover:bg-orange-200", 
          dotColor: "bg-orange-500" 
        };
      default:
        return { 
          label: "Unknown", 
          className: "bg-gray-100 text-gray-800 hover:bg-gray-200", 
          dotColor: "bg-gray-500" 
        };
    }
  };

  const handleStatusChange = (newStatus: "active" | "inactive" | "out_of_stock" | "locked") => {
    console.log("Status change requested:", product.id, newStatus);
    if (onStatusChange) {
      onStatusChange(product.id, newStatus);
    }
  };

  // Check if product is locked
  const isLocked = product.status === 'locked';

  // Get edit limit information based on subscription tier
  const getEditLimitInfo = () => {
    const tier = subscription?.subscriptionTier || "free";
    const currentEdits = product.editCount || 0;

    switch (tier) {
      case "free":
        return {
          limit: 3,
          current: currentEdits,
          showCounter: true,
          disabled: currentEdits >= 3,
          label: `${currentEdits}/3 edits`
        };
      case "standard":
        return {
          limit: 10,
          current: currentEdits,
          showCounter: true,
          disabled: currentEdits >= 10,
          label: `${currentEdits}/10 edits`
        };
      case "premium":
        return {
          limit: -1, // unlimited
          current: currentEdits,
          showCounter: false, // Hide counter for premium
          disabled: false,
          label: "Unlimited edits"
        };
      default:
        return {
          limit: 3,
          current: currentEdits,
          showCounter: true,
          disabled: currentEdits >= 3,
          label: `${currentEdits}/3 edits`
        };
    }
  };

  const editInfo = getEditLimitInfo();

  const currentStatusConfig = getStatusConfig(product.status);

  // Format product size information
  const formatProductSize = () => {
    if (product.packQuantity && product.unitSize && product.unitOfMeasure) {
      // Convert unitSize to whole number
      const unitSize = Math.round(parseFloat(product.unitSize));
      return `${product.packQuantity} x ${unitSize}${product.unitOfMeasure}`;
    }
    return null;
  };

  const productSize = formatProductSize();

  const getStockStatus = () => {
    const threshold = product.lowStockThreshold || 50; // Default to 50 if not set
    if (product.stock === 0) {
      return { color: "text-red-600", text: "Out of stock", isAlert: true };
    } else if (product.stock <= threshold) {
      return { color: "text-orange-600", text: "Low stock", isAlert: true };
    }
    return { color: "text-green-600", text: "In stock", isAlert: false };
  };

  const stockStatus = getStockStatus();

  const handleDuplicate = () => {
    if (onDuplicate) {
      onDuplicate(product);
    }
  };

  return (
    <>
      <Card className={`hover:shadow-lg transition-shadow duration-200 overflow-hidden ${isLocked ? 'border-orange-300 bg-orange-50/30' : ''}`}>
      <div className="relative">
        <img 
          src={
            (product.images && product.images.length > 0) 
              ? product.images[0] 
              : product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
          } 
          alt={product.name}
          className="w-full h-48 object-cover"
        />
        
        {/* Low Stock Alert Badge */}
        {stockStatus.isAlert && (
          <div className="absolute top-3 left-3">
            <Badge 
              variant="destructive"
              className="text-xs bg-red-500 text-white flex items-center gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              {stockStatus.text}
            </Badge>
          </div>
        )}

        {/* Edit Count Badge - Only show for non-premium users and when no stock alert */}
        {editInfo.showCounter && !stockStatus.isAlert && (
          <div className="absolute top-3 left-3">
            <Badge 
              variant={editInfo.disabled ? "destructive" : "outline"}
              className="text-xs"
            >
              {editInfo.label}
            </Badge>
          </div>
        )}

        {/* Status Badge Dropdown */}
        <div className="absolute top-3 right-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className={`px-3 py-1 rounded-full text-xs font-medium ${currentStatusConfig.className} hover:opacity-80`}
              >
                <div className={`w-2 h-2 rounded-full ${currentStatusConfig.dotColor} mr-2`}></div>
                {currentStatusConfig.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem 
                onClick={() => handleStatusChange("active")}
                className="cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                Active
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleStatusChange("inactive")}
                className="cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full bg-gray-500 mr-2"></div>
                Inactive
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleStatusChange("out_of_stock")}
                className="cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
                Out of Stock
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>


        {/* Low Stock Warning */}
        {product.stock < 10 && product.stock > 0 && (
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-orange-100 text-orange-800 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Low Stock
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-6">
        {/* Locked Product Warning */}
        {isLocked && (
          <div className="mb-4 p-3 bg-orange-100 border border-orange-300 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">Product Locked</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-orange-600 border-orange-300 hover:bg-orange-100"
                onClick={() => window.location.href = '/settings/subscription'}
              >
                Upgrade Plan
              </Button>
            </div>
            <p className="text-xs text-orange-700 mt-1">
              This product is locked due to subscription limits. Upgrade your plan to unlock it.
            </p>
          </div>
        )}

        {/* Product Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-lg line-clamp-1">
              {product.name}
            </h3>
            {productSize && (
              <p className="text-sm text-blue-600 font-medium mt-1">{productSize}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {product.category && (
                <p className="text-sm text-gray-500">{product.category}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => {
                  console.log('🔍 EDIT BUTTON DEBUG:', {
                    isLocked,
                    editInfoDisabled: editInfo.disabled,
                    editInfo,
                    productId: product.id,
                    onEditExists: !!onEdit
                  });
                  if (!isLocked && onEdit) {
                    onEdit(product);
                  }
                }}
                disabled={editInfo.disabled || isLocked}
                className={(editInfo.disabled || isLocked) ? "opacity-50 cursor-not-allowed" : ""}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit {isLocked ? "(Product Locked)" : editInfo.disabled ? "(Limit reached)" : ""}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  console.log('🔍 DUPLICATE BUTTON DEBUG:', {
                    isLocked,
                    productId: product.id,
                    onDuplicateExists: !!onDuplicate
                  });
                  if (!isLocked && handleDuplicate) {
                    handleDuplicate();
                  }
                }}
                disabled={isLocked}
                className={isLocked ? "opacity-50 cursor-not-allowed" : ""}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate {isLocked ? "(Product Locked)" : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowStockTracker(true)}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Stock Tracker
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete(product.id)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {cleanAIDescription(product.description)}
          </p>
        )}

        {/* Product Details */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {product.sellingFormat === 'pallets' ? 'Price per pallet:' : 
               product.sellingFormat === 'both' ? 'Price per unit:' : 
               'Price per unit:'}
            </span>
            <span className="font-semibold text-gray-900">
              {product.priceVisible ? (() => {
                // Force GBP currency display
                const symbol = "£"; // Always use pound symbol
                const amount = parseFloat(product.price);
                const formatted = new Intl.NumberFormat('en-GB', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(amount);
                const result = `${symbol}${formatted}`;
                console.log('FIXED formatCurrency 2025-07-03:', { price: product.price, currency: product.currency, result });
                return result;
              })() : "Hidden"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">MOQ:</span>
            <span className="text-sm text-gray-900">
              {formatNumber(product.moq)} {product.sellingFormat === 'pallets' ? 'pallets' : 'units'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Stock:</span>
            <span className={`text-sm font-medium ${stockStatus.color}`}>
              {formatNumber(product.stock)} {product.sellingFormat === 'pallets' ? 'pallets' : 'units'}
            </span>
          </div>
          {product.sellingFormat === 'both' && (
            <>
              <div className="flex justify-between items-center border-t pt-2 mt-2">
                <span className="text-sm text-gray-600">Pallet price:</span>
                <span className="font-semibold text-gray-900">
                  {product.priceVisible ? `£${parseFloat((product.palletPrice || 0).toString()).toFixed(2)}` : "Hidden"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pallet MOQ:</span>
                <span className="text-sm text-gray-900">{formatNumber(product.palletMoq || 1)} pallets</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pallet stock:</span>
                <span className="text-sm text-gray-900">{formatNumber(product.palletStock || 0)} pallets</span>
              </div>
            </>
          )}
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Selling Format Badge */}
          <Badge 
            variant="outline" 
            className={`text-xs ${
              product.sellingFormat === 'pallets' 
                ? 'border-purple-300 text-purple-700 bg-purple-50' 
                : product.sellingFormat === 'both'
                  ? 'border-blue-300 text-blue-700 bg-blue-50'
                  : 'border-gray-300 text-gray-700 bg-gray-50'
            }`}
          >
            {product.sellingFormat === 'pallets' ? 'Pallets Only' : 
             product.sellingFormat === 'both' ? 'Units & Pallets' : 
             'Units Only'}
          </Badge>
          
          {product.negotiationEnabled && (
            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
              Negotiable
            </Badge>
          )}
          {!product.priceVisible && (
            <Badge variant="outline" className="text-xs">
              Price Hidden
            </Badge>
          )}
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-1">
            {showPromotionAnalytics && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => setShowPromotionModal(true)}
                title="View Promotion Analytics"
              >
                <BarChart3 className="h-3 w-3 text-purple-600" />
              </Button>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className={`h-7 w-7 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !isLocked && onEdit(product)}
              disabled={isLocked}
              title={isLocked ? "Product Locked - Upgrade plan to unlock" : "Edit Product"}
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={handleDuplicate}
              title="Duplicate Product"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDelete(product.id)}
              title="Delete Product"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
      </Card>
      
      {/* Stock Tracker Dialog */}
      <Dialog open={showStockTracker} onOpenChange={setShowStockTracker}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock Tracker - {product.name}</DialogTitle>
          </DialogHeader>
          <StockTracker product={product} />
        </DialogContent>
      </Dialog>

      {/* Promotion Analytics Dialog */}
      <Dialog open={showPromotionModal} onOpenChange={setShowPromotionModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Promotion Analytics - {product.name}</DialogTitle>
          </DialogHeader>
          <PromotionAnalytics productId={product.id} />
        </DialogContent>
      </Dialog>
    </>
  );
}
