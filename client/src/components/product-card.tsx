import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MoreHorizontal, 
  Edit, 
  Copy, 
  Trash2, 
  Eye, 
  ShoppingCart,
  Heart,
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
  moq: number;
  stock: number;
  imageUrl?: string;
  category?: string;
  status: "active" | "inactive" | "out_of_stock";
  priceVisible: boolean;
  negotiationEnabled: boolean;
  createdAt?: string;
}

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onDuplicate?: (product: Product) => void;
}

export default function ProductCard({ 
  product, 
  onEdit, 
  onDelete, 
  onDuplicate 
}: ProductCardProps) {
  const [isLiked, setIsLiked] = useState(false);

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  const getStatusBadge = () => {
    switch (product.status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "out_of_stock":
        return <Badge className="bg-red-100 text-red-800">Out of Stock</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

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
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          {getStatusBadge()}
        </div>
        
        {/* Favorite Button */}
        <div className="absolute top-3 left-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="bg-white/90 hover:bg-white rounded-full shadow-sm"
            onClick={() => setIsLiked(!isLiked)}
          >
            <Heart className={`h-4 w-4 ${isLiked ? 'text-red-500 fill-current' : 'text-gray-400'}`} />
          </Button>
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
              <DropdownMenuItem onClick={() => onEdit(product)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
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
              {product.priceVisible ? formatCurrency(product.price) : "Hidden"}
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
            <div className="flex items-center text-xs text-gray-500">
              <Eye className="h-3 w-3 mr-1" />
              <span>142</span>
            </div>
            <div className="flex items-center text-xs text-gray-500">
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
