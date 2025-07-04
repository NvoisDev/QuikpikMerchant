
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currencies";
import { useQuery } from "@tanstack/react-query";
import { 
  MoreHorizontal, 
  Edit, 
  Copy, 
  Trash2, 
  Eye, 
  ShoppingCart,
  AlertTriangle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  currency?: string;
  moq: number;
  stock: number;
  imageUrl?: string;
  category?: string;
  status: "active" | "inactive" | "out_of_stock";
  priceVisible: boolean;
  negotiationEnabled: boolean;
  editCount?: number;
  createdAt?: string;
}

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onDuplicate?: (product: Product) => void;
  onStatusChange?: (id: number, status: "active" | "inactive" | "out_of_stock") => void;
}

export default function ProductCard({ 
  product, 
  onEdit, 
  onDelete, 
  onDuplicate,
  onStatusChange
}: ProductCardProps) {

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
      default:
        return { 
          label: "Unknown", 
          className: "bg-gray-100 text-gray-800 hover:bg-gray-200", 
          dotColor: "bg-gray-500" 
        };
    }
  };

  const handleStatusChange = (newStatus: "active" | "inactive" | "out_of_stock") => {
    console.log("Status change requested:", product.id, newStatus);
    if (onStatusChange) {
      onStatusChange(product.id, newStatus);
    }
  };

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

  const getStockStatus = () => {
    if (product.stock === 0) {
      return { color: "text-red-600", text: "Out of stock" };
    } else if (product.stock < 10) {
      return { color: "text-orange-600", text: "Low stock" };
    }
    return { color: "text-green-600", text: "In stock" };
  };

  const stockStatus = getStockStatus();

  const handleDuplicate = () => {
    if (onDuplicate) {
      onDuplicate(product);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200 overflow-hidden">
      <div className="relative">
        <img 
          src={product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"} 
          alt={product.name}
          className="w-full h-48 object-cover"
        />
        
        {/* Edit Count Badge - Only show for non-premium users */}
        {editInfo.showCounter && (
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
        {/* Product Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-lg line-clamp-1">
              {product.name}
            </h3>
            {product.category && (
              <p className="text-sm text-gray-500 mt-1">{product.category}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onEdit(product)}
                disabled={editInfo.disabled}
                className={editInfo.disabled ? "opacity-50 cursor-not-allowed" : ""}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit {editInfo.disabled && "(Limit reached)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
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
            {product.description}
          </p>
        )}

        {/* Product Details */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Price per unit:</span>
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
            <span className="text-sm text-gray-900">{product.moq} units</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Stock:</span>
            <span className={`text-sm font-medium ${stockStatus.color}`}>
              {product.stock} units
            </span>
          </div>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-2 mb-4">
          {product.negotiationEnabled && (
            <Badge variant="outline" className="text-xs">
              Negotiable
            </Badge>
          )}
          {!product.priceVisible && (
            <Badge variant="outline" className="text-xs">
              Price Hidden
            </Badge>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-xs text-gray-500" title="Product views - how many times customers have viewed this product">
              <Eye className="h-3 w-3 mr-1" />
              <span>142</span>
            </div>
            <div className="flex items-center text-xs text-gray-500" title="Times added to cart - how many customers have added this to their cart">
              <ShoppingCart className="h-3 w-3 mr-1" />
              <span>28</span>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => onEdit(product)}
              title="Edit Product"
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
  );
}
