
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cleanAIDescription } from "@shared/utils";
import { useLocation } from "wouter";
import type { PromotionalOffer } from "@shared/schema";

const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};

import {
  Edit,
  Copy,
  Trash2,
  AlertTriangle,
  PackagePlus,
  Tag,
  ToggleLeft,
  ToggleRight,
  Lock,
  MoreHorizontal,
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
  sellingFormat?: "units" | "pallets" | "both";
  unitsPerPallet?: number;
  palletPrice?: number;
  palletMoq?: number;
  palletStock?: number;
  palletWeight?: number;
  expiryDate?: string | null;
  promotionalOffers?: PromotionalOffer[];
}

function getActivePromos(offers: PromotionalOffer[]): PromotionalOffer[] {
  if (!Array.isArray(offers)) return [];
  const now = new Date();
  return offers.filter((o) => {
    if (!o.isActive) return false;
    if (o.startDate && new Date(o.startDate) > now) return false;
    if (o.endDate && new Date(o.endDate) < now) return false;
    return true;
  });
}

function formatPromoLabel(promo: PromotionalOffer): string {
  switch (promo.type) {
    case "percentage_discount":
      return `${promo.discountPercentage}% off`;
    case "fixed_price":
      return `Now £${Number(promo.fixedPrice).toFixed(2)}`;
    case "clearance":
      return `Clearance £${Number(promo.fixedPrice).toFixed(2)}`;
    case "buy_x_get_y_free":
      return `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`;
    case "bundle_deal":
      return `${promo.minQuantity}+ at £${Number(promo.fixedPrice).toFixed(2)} each`;
    default:
      return promo.name || "Promotion";
  }
}

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onDuplicate?: (product: Product) => void;
  onStatusChange?: (id: number, status: "active" | "inactive" | "out_of_stock" | "locked") => void;
  onManageStock?: (product: Product) => void;
}

export default function ProductCard({
  product,
  onEdit,
  onDelete,
  onDuplicate,
  onStatusChange,
  onManageStock,
}: ProductCardProps) {
  const [, navigate] = useLocation();

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "active":
        return { label: "Active", className: "bg-green-100 text-green-800 hover:bg-green-200", dotColor: "bg-green-500" };
      case "inactive":
        return { label: "Inactive", className: "bg-gray-100 text-gray-800 hover:bg-gray-200", dotColor: "bg-gray-500" };
      case "out_of_stock":
        return { label: "Out of Stock", className: "bg-red-100 text-red-800 hover:bg-red-200", dotColor: "bg-red-500" };
      case "locked":
        return { label: "Locked", className: "bg-orange-100 text-orange-800 hover:bg-orange-200", dotColor: "bg-orange-500" };
      default:
        return { label: "Unknown", className: "bg-gray-100 text-gray-800 hover:bg-gray-200", dotColor: "bg-gray-500" };
    }
  };

  const handleStatusChange = (newStatus: "active" | "inactive" | "out_of_stock" | "locked") => {
    if (onStatusChange) onStatusChange(product.id, newStatus);
  };

  const handleDuplicate = () => {
    if (onDuplicate) onDuplicate(product);
  };

  const isLocked = product.status === 'locked';
  const currentStatusConfig = getStatusConfig(product.status);

  const getExpiryInfo = (expiryDate?: string | null) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = expiry.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    if (diffDays < 0) return { label: `Expired · ${formatted}`, className: "bg-red-100 text-red-700 border-red-200" };
    if (diffDays <= 30) return { label: `Expiring soon · ${formatted}`, className: "bg-amber-100 text-amber-700 border-amber-200" };
    return { label: `Exp: ${formatted}`, className: "bg-gray-100 text-gray-600 border-gray-200" };
  };

  const expiryInfo = getExpiryInfo(product.expiryDate);

  const formatProductSize = () => {
    if (product.packQuantity && product.unitSize && product.unitOfMeasure) {
      const unitSize = Math.round(parseFloat(product.unitSize));
      return `${product.packQuantity} x ${unitSize}${product.unitOfMeasure}`;
    }
    return null;
  };

  const productSize = formatProductSize();

  const getStockStatus = () => {
    const threshold = product.lowStockThreshold || 50;
    if (product.stock === 0) return { color: "text-red-600", text: "Out of stock", isAlert: true };
    if (product.stock <= threshold) return { color: "text-orange-600", text: "Low stock", isAlert: true };
    return { color: "text-green-600", text: "In stock", isAlert: false };
  };

  const stockStatus = getStockStatus();
  const activePromos = getActivePromos(product.promotionalOffers || []);

  return (
    <>
      <Card
        className={`transition-all duration-200 overflow-hidden ${
          isLocked
            ? 'opacity-60 grayscale border-gray-200 cursor-not-allowed'
            : 'hover:shadow-md hover:border-slate-300'
        }`}
        title={isLocked ? "Upgrade your plan to unlock this product" : undefined}
      >
        {/* Image area */}
        <div className="relative">
          <img
            src={
              (product.images && product.images.length > 0)
                ? product.images[0]
                : product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
            }
            alt={product.name}
            className="w-full h-36 object-cover"
          />

          {/* ⋯ Actions menu — top-left floating pill */}
          <div className="absolute top-2 left-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-white/85 backdrop-blur-sm hover:bg-white shadow-sm rounded-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5 text-slate-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem
                  onClick={() => !isLocked && onEdit(product)}
                  disabled={isLocked}
                  className={isLocked ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  <Edit className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => !isLocked && onManageStock?.(product)}
                  disabled={isLocked}
                  className={isLocked ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  <PackagePlus className="h-4 w-4 mr-2" /> Manage Stock
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => !isLocked && handleStatusChange(product.status === 'active' ? 'inactive' : 'active')}
                  disabled={isLocked}
                  className={isLocked ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  {product.status === 'active'
                    ? <><ToggleLeft className="h-4 w-4 mr-2" /> Set Inactive</>
                    : <><ToggleRight className="h-4 w-4 mr-2 text-green-600" /> Set Active</>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => !isLocked && navigate(`/promotions?productId=${product.id}`)}
                  disabled={isLocked}
                  className={isLocked ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  <Tag className="h-4 w-4 mr-2" /> Promotions
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => !isLocked && handleDuplicate()}
                  disabled={isLocked}
                  className={isLocked ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  <Copy className="h-4 w-4 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(product.id)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Status badge dropdown — top-right */}
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${currentStatusConfig.className} hover:opacity-90`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${currentStatusConfig.dotColor} mr-1.5`} />
                  {currentStatusConfig.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleStatusChange("active")} className="cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-2" /> Active
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("inactive")} className="cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-gray-500 mr-2" /> Inactive
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("out_of_stock")} className="cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-red-500 mr-2" /> Out of Stock
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CardContent className="p-4">
          {/* Locked notice — compact inline */}
          {isLocked && (
            <div className="mb-2 text-xs text-gray-500 flex items-center gap-1.5">
              <Lock className="h-3 w-3 shrink-0" />
              <span>Locked — <a href="/subscription-pricing" className="underline hover:text-gray-700">upgrade to unlock</a></span>
            </div>
          )}

          {/* Content — pointer-events blocked for locked products */}
          <div className={isLocked ? 'pointer-events-none' : ''}>

            {/* Product name + size */}
            <div className="mb-2">
              <h3 className="font-semibold text-gray-900 text-base line-clamp-1">{product.name}</h3>
              {productSize && (
                <p className="text-xs text-blue-600 font-medium mt-0.5">{productSize}</p>
              )}
              {product.category && (
                <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
              )}
            </div>

            {/* Stock alert badge — in body now, not image overlay */}
            {stockStatus.isAlert && (
              <Badge className="text-xs bg-red-500/90 text-white inline-flex items-center gap-1 mb-2">
                <AlertTriangle className="h-3 w-3" /> {stockStatus.text}
              </Badge>
            )}

            {/* Description */}
            {product.description && (
              <p className="text-gray-500 text-xs mb-2 line-clamp-2">
                {cleanAIDescription(product.description)}
              </p>
            )}

            {/* Key stats */}
            <div className="space-y-1.5 mb-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">
                  {product.sellingFormat === 'pallets' ? 'Per pallet' : 'Per unit'}
                </span>
                <span className="font-semibold text-gray-900">
                  {product.priceVisible ? (() => {
                    const amount = parseFloat(product.price);
                    return `£${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
                  })() : "Hidden"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">MOQ</span>
                <span className="text-gray-700">
                  {formatNumber(product.moq)} {product.sellingFormat === 'pallets' ? 'pallets' : 'units'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Stock</span>
                <span className={`font-medium ${stockStatus.color}`}>
                  {formatNumber(product.stock)} {product.sellingFormat === 'pallets' ? 'pallets' : 'units'}
                </span>
              </div>
              {expiryInfo && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Expiry</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${expiryInfo.className}`}>
                    {expiryInfo.label}
                  </span>
                </div>
              )}
              {product.sellingFormat === 'both' && (
                <>
                  <div className="flex justify-between items-center border-t pt-1.5 mt-1.5">
                    <span className="text-gray-500">Pallet price</span>
                    <span className="font-semibold text-gray-900">
                      {product.priceVisible ? `£${parseFloat((product.palletPrice || 0).toString()).toFixed(2)}` : "Hidden"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Pallet MOQ</span>
                    <span className="text-gray-700">{formatNumber(product.palletMoq || 1)} pallets</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Pallet stock</span>
                    <span className="text-gray-700">{formatNumber(product.palletStock || 0)} pallets</span>
                  </div>
                </>
              )}
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="outline"
                className={`text-xs ${
                  product.sellingFormat === 'pallets'
                    ? 'border-purple-300 text-purple-700 bg-purple-50'
                    : product.sellingFormat === 'both'
                      ? 'border-blue-300 text-blue-700 bg-blue-50'
                      : 'border-gray-300 text-gray-600 bg-gray-50'
                }`}
              >
                {product.sellingFormat === 'pallets' ? 'Pallets Only' :
                 product.sellingFormat === 'both' ? 'Units & Pallets' : 'Units Only'}
              </Badge>
              {product.negotiationEnabled && (
                <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
                  Negotiable
                </Badge>
              )}
              {!product.priceVisible && (
                <Badge variant="outline" className="text-xs">Price Hidden</Badge>
              )}
              {activePromos.map((promo, i) => (
                <Badge key={i} className="text-xs bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">
                  🏷 {formatPromoLabel(promo)}
                </Badge>
              ))}
            </div>

          </div>{/* end pointer-events wrapper */}
        </CardContent>
      </Card>
    </>
  );
}
