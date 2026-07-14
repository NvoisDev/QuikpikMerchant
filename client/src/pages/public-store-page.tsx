import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useSearch } from "wouter";
import { useCanonical, useNoIndex } from "@/hooks/useCanonical";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search, MapPin, Truck, Package, ShoppingBag,
  MessageSquare, Store, Phone, ArrowLeft, X,
  Tag, ShoppingCart, Plus, Minus, CheckCircle, Trash2,
} from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatPhoneForWhatsApp } from "@shared/utils/currency";

interface PublicProduct {
  id: number;
  name: string;
  description?: string | null;
  price: string | null;
  palletPrice?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  unitsPerPack?: number | null;
  unitsPerPallet?: number | null;
  stock?: number | null;
  palletStock?: number | null;
  minOrderQuantity?: number | null;
  sku?: string | null;
  unitWeightKg?: string | null;
  totalPackageWeight?: string | null;
  packQuantity?: number | null;
  rrp?: string | null;
}

interface PublicWholesaler {
  id: string;
  businessName: string;
  logoUrl?: string | null;
  logoType?: string | null;
  storeTagline?: string | null;
  storeDescription?: string | null;
  storeSlug?: string | null;
  priceDisplayMode: string;
  moqVisible?: boolean;
  stockVisible?: boolean;
  packSizeVisible?: boolean;
  rrpVisible?: boolean;
  deliveryRegions?: string | null;
  city?: string | null;
  country?: string | null;
  enableDelivery?: boolean;
  enablePickup?: boolean;
  deliveryNote?: string | null;
  preferredCurrency?: string;
  enquiriesEnabled?: boolean;
  minOrderAmount?: number | null;
  whatsappContactVisible?: boolean;
  phoneNumber?: string | null;
  isVerified?: boolean;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
}

interface CartItem {
  productId: number;
  name: string;
  price: string | null;
  imageUrl: string | null;
  quantity: number;
  sellingType: string;
}

function formatCurrency(amount: string | number | null, currency = 'GBP') {
  if (amount == null) return '—';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function productSlug(name: string, id: number): string {
  return `${slugify(name)}-${id}`;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function WholesalerLogo({ wholesaler }: { wholesaler: PublicWholesaler }) {
  if (wholesaler.logoUrl) {
    return (
      <img
        src={wholesaler.logoUrl}
        alt={wholesaler.businessName}
        className="h-16 w-16 rounded-xl object-contain bg-white p-1 shadow-sm"
        width={64}
        height={64}
        fetchPriority="high"
        decoding="async"
      />
    );
  }
  return (
    <div className="h-16 w-16 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
      <span className="text-white font-bold text-xl">{getInitials(wholesaler.businessName)}</span>
    </div>
  );
}

function ProductCard({
  product,
  priceDisplayMode,
  showMoq,
  showStock,
  showPackSize,
  showRrp,
  currency,
  cartQty,
  index,
  onAddToCart,
  onUpdateQty,
}: {
  product: PublicProduct;
  priceDisplayMode: string;
  showMoq: boolean;
  showStock: boolean;
  showPackSize: boolean;
  showRrp: boolean;
  currency: string;
  cartQty: number;
  index: number;
  onAddToCart: (product: PublicProduct) => void;
  onUpdateQty: (productId: number, qty: number) => void;
}) {
  const showPrices = priceDisplayMode === 'shown';
  const imgSrc = product.imageUrl || (product.images && product.images[0]) || null;
  const inCart = cartQty > 0;
  const isAboveFold = index < 4;

  const href = `/product/${productSlug(product.name, product.id)}`;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${inCart ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'}`}>
      <a href={href} className="block aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative" tabIndex={-1} aria-label={product.name}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={product.name}
            className="w-full h-full object-cover"
            loading={isAboveFold ? 'eager' : 'lazy'}
            decoding={isAboveFold ? 'sync' : 'async'}
            fetchPriority={index === 0 ? 'high' : 'auto'}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full bg-gradient-to-br from-gray-50 to-gray-100">
            <Package className="h-10 w-10 text-gray-300" />
            <span className="text-[10px] text-gray-300 font-medium uppercase tracking-wide">No image</span>
          </div>
        )}
        {inCart && (
          <div className="absolute top-2 right-2 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow">
            {cartQty}
          </div>
        )}
      </a>

      <div className="p-3">
        {product.category && (
          <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">{product.category}</p>
        )}
        <a href={href} className="hover:text-emerald-700 transition-colors">
          <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-1">{product.name}</h3>
        </a>

        {product.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mb-1 leading-snug">{product.description}</p>
        )}

        {showPackSize && (product.totalPackageWeight || product.packQuantity) && (() => {
          const totalW = parseFloat(product.totalPackageWeight ?? '0') || 0;
          const qty = product.packQuantity || 0;
          const storedUnit = parseFloat(product.unitWeightKg ?? '0') || 0;
          const unitW = storedUnit > 0 ? storedUnit : (totalW > 0 && qty > 0 ? totalW / qty : 0);
          return (
            <p className="text-[11px] text-gray-400 mb-1">
              {totalW > 0 && <span>{totalW} kg/pack</span>}
              {qty > 0 && unitW > 0 && (
                <span>{totalW > 0 ? ' · ' : ''}{qty} × {+unitW.toFixed(3)}kg</span>
              )}
            </p>
          );
        })()}

        {showMoq && product.minOrderQuantity && product.minOrderQuantity > 1 && (
          <p className="text-[11px] text-amber-600 font-medium mb-1">
            Min. order: {product.minOrderQuantity} units
          </p>
        )}

        {showStock && product.stock != null && (
          (product.stock > 0 || (product.palletStock ?? 0) > 0) ? (
            <p className="text-[11px] text-emerald-600 font-medium mb-1">
              {product.stock > 0 ? `${product.stock} in stock` : `${product.palletStock} pallets available`}
            </p>
          ) : (
            <p className="text-[11px] text-red-500 font-medium mb-1">Out of stock</p>
          )
        )}

        {showPrices && product.price != null && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-base font-bold text-gray-900">
                {formatCurrency(product.price, currency)}
                <span className="text-xs font-normal text-gray-400 ml-1">/ unit</span>
              </p>
              {showRrp && product.rrp != null && (() => {
                const rrpNum = parseFloat(product.rrp);
                const priceNum = parseFloat(product.price);
                const pctOff = rrpNum > 0 && priceNum < rrpNum ? Math.round((1 - priceNum / rrpNum) * 100) : 0;
                return pctOff > 0 ? (
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                    {pctOff}% off RRP
                  </span>
                ) : null;
              })()}
            </div>
            {showRrp && product.rrp != null && (() => {
              const rrpNum = parseFloat(product.rrp);
              const priceNum = parseFloat(product.price);
              return rrpNum > priceNum ? (
                <p className="text-[11px] text-gray-400 line-through mt-0.5">
                  RRP {formatCurrency(product.rrp, currency)}
                </p>
              ) : null;
            })()}
          </div>
        )}

        {inCart ? (
          <div className="flex items-center justify-between bg-emerald-50 rounded-lg border border-emerald-200 px-2 py-1">
            <button
              onClick={() => onUpdateQty(product.id, cartQty - 1)}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-emerald-200 transition-colors text-emerald-700"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-sm font-semibold text-emerald-800 min-w-[20px] text-center">{cartQty}</span>
            <button
              onClick={() => onUpdateQty(product.id, cartQty + 1)}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-emerald-200 transition-colors text-emerald-700"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            onClick={() => onAddToCart(product)}
          >
            <ShoppingCart className="h-3 w-3 mr-1" />
            Add to Cart
          </Button>
        )}
      </div>
    </div>
  );
}

function CartDrawer({
  cart,
  wholesaler,
  showPrices,
  currency,
  onClose,
  onUpdateQty,
  onClearCart,
  onRequestQuote,
}: {
  cart: CartItem[];
  wholesaler: PublicWholesaler;
  showPrices: boolean;
  currency: string;
  onClose: () => void;
  onUpdateQty: (productId: number, qty: number) => void;
  onClearCart: () => void;
  onRequestQuote: () => void;
}) {
  const subtotal = cart.reduce((s, item) => {
    const p = parseFloat(item.price ?? '0') || 0;
    return s + p * item.quantity;
  }, 0);

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-full max-w-sm bg-white flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">Your Cart</h2>
            <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">{totalItems}</span>
          </div>
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button onClick={onClearCart} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                Clear all
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
              <ShoppingCart className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm">Your cart is empty</p>
              <p className="text-gray-300 text-xs mt-1">Add products to request a quote</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover rounded-lg" loading="lazy" decoding="async" />
                    ) : (
                      <Package className="h-4 w-4 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-1">{item.name}</p>
                    {showPrices && item.price && (
                      <p className="text-xs text-gray-500">{formatCurrency(item.price, currency)} / unit</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-semibold text-gray-800 min-w-[24px] text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onUpdateQty(item.productId, 0)}
                      className="ml-1 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Subtotal ({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
              <span className="font-semibold text-gray-900">
                {showPrices ? formatCurrency(subtotal, currency) : '—'}
              </span>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 text-sm font-semibold"
              onClick={onRequestQuote}
            >
              <Tag className="h-4 w-4 mr-2" />
              Get Trade Pricing
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuoteContactModal({
  wholesaler,
  cart,
  onClose,
}: {
  wholesaler: PublicWholesaler;
  cart: CartItem[];
  onClose: (cleared: boolean) => void;
}) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    business: '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/public/cart-quote', {
        wholesalerId: wholesaler.id,
        enquirerName: form.name.trim(),
        enquirerPhone: form.phone.trim() || undefined,
        enquirerEmail: form.email.trim() || undefined,
        enquirerBusiness: form.business.trim() || undefined,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          sellingType: item.sellingType,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    },
  });

  const canSubmit = form.name.trim() && (form.phone.trim() || form.email.trim());

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Quote request sent!</h2>
          <p className="text-sm text-gray-500 mb-1">
            <span className="font-medium text-gray-700">{wholesaler.businessName}</span> will review your cart and get back to you.
          </p>
          <p className="text-xs text-gray-400 mb-6">They'll contact you on {form.phone || form.email}.</p>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => onClose(true)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Your contact details</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {cart.length} item{cart.length !== 1 ? 's' : ''} · {wholesaler.businessName} will contact you with pricing
            </p>
          </div>
          <button onClick={() => onClose(false)} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Your name *</label>
            <Input
              placeholder="Full name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Phone / WhatsApp</label>
            <Input
              placeholder="+44..."
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Email {!form.phone.trim() && <span className="text-gray-400">(required if no phone)</span>}
            </label>
            <Input
              placeholder="you@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Business name</label>
            <Input
              placeholder="Your shop or company"
              value={form.business}
              onChange={e => setForm(f => ({ ...f, business: e.target.value }))}
            />
          </div>

          <div className="pt-1">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Sending…' : 'Send Quote Request'}
            </Button>
            {!form.phone.trim() && !form.email.trim() && form.name.trim() && (
              <p className="text-xs text-center text-amber-600 mt-2">Please add a phone number or email</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const BUSINESS_TYPES = [
  'Retail Store', 'Supermarket', 'Convenience Store', 'Restaurant',
  'Distributor', 'Cash & Carry', 'Online Store', 'Market Trader', 'Other',
];

const ORDER_VOLUMES = [
  'Under £100', '£100–£500', '£500–£1,000', '£1,000+', 'Regular weekly orders',
];

function EnquiryModal({
  wholesaler,
  product,
  onClose,
}: {
  wholesaler: PublicWholesaler;
  product: PublicProduct | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    enquirerName: '',
    enquirerEmail: '',
    enquirerPhone: '',
    enquirerBusiness: '',
    businessType: '',
    estimatedOrderVolume: '',
    preferredContact: '',
    message: '',
    quantity: '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/public/enquiry', {
        wholesalerId: wholesaler.id,
        enquirerName: form.enquirerName,
        enquirerEmail: form.enquirerEmail || undefined,
        enquirerPhone: form.enquirerPhone || undefined,
        enquirerBusiness: form.enquirerBusiness || undefined,
        businessType: form.businessType || undefined,
        estimatedOrderVolume: form.estimatedOrderVolume || undefined,
        preferredContact: form.preferredContact || undefined,
        message: form.message || undefined,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        quantity: form.quantity ? parseInt(form.quantity) : null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Enquiry sent!",
        description: `${wholesaler.businessName} will be in touch with you shortly.`,
      });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-900">
                {product ? `Enquire about ${product.name}` : `Contact ${wholesaler.businessName}`}
              </h2>
              {wholesaler.isVerified && <VerifiedBadge />}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">We'll pass your details to the wholesaler</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Your Details</p>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Your name *</label>
            <Input
              placeholder="Full name"
              value={form.enquirerName}
              onChange={e => setForm(f => ({ ...f, enquirerName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Business name</label>
            <Input
              placeholder="Your shop / company name"
              value={form.enquirerBusiness}
              onChange={e => setForm(f => ({ ...f, enquirerBusiness: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Phone / WhatsApp</label>
              <Input
                placeholder="+44..."
                value={form.enquirerPhone}
                onChange={e => setForm(f => ({ ...f, enquirerPhone: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Email</label>
              <Input
                placeholder="you@email.com"
                value={form.enquirerEmail}
                onChange={e => setForm(f => ({ ...f, enquirerEmail: e.target.value }))}
              />
            </div>
          </div>

          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-1">Business Info</p>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Business type</label>
            <select
              value={form.businessType}
              onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))}
              className="w-full h-9 border border-input rounded-md px-3 text-sm bg-background"
            >
              <option value="">Select type…</option>
              {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Estimated order size</label>
            <select
              value={form.estimatedOrderVolume}
              onChange={e => setForm(f => ({ ...f, estimatedOrderVolume: e.target.value }))}
              className="w-full h-9 border border-input rounded-md px-3 text-sm bg-background"
            >
              <option value="">Select range…</option>
              {ORDER_VOLUMES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-1">Your Enquiry</p>
          {product && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Quantity needed</label>
              <Input
                type="number"
                placeholder="e.g. 50"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Message</label>
            <Textarea
              placeholder="What are you looking for? Any delivery requirements?"
              value={form.message}
              rows={3}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">Preferred contact method</label>
            <div className="flex gap-2">
              {['Phone', 'WhatsApp', 'Email'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, preferredContact: f.preferredContact === c.toLowerCase() ? '' : c.toLowerCase() }))}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    form.preferredContact === c.toLowerCase()
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={!form.enquirerName.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Sending…' : 'Send Enquiry'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function useCart(slug: string) {
  const key = `cart_${slug}`;

  const [cart, setCartRaw] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      setCartRaw(stored ? JSON.parse(stored) : []);
    } catch {
      setCartRaw([]);
    }
  }, [key]);

  const setCart = useCallback((updater: (prev: CartItem[]) => CartItem[]) => {
    setCartRaw(prev => {
      const next = updater(prev);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  const addToCart = useCallback((product: PublicProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        productId: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl || (product.images?.[0] ?? null),
        quantity: 1,
        sellingType: 'units',
      }];
    });
  }, [setCart]);

  const updateQty = useCallback((productId: number, qty: number) => {
    setCart(prev => qty <= 0
      ? prev.filter(i => i.productId !== productId)
      : prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i)
    );
  }, [setCart]);

  const clearCart = useCallback(() => {
    setCart(() => []);
  }, [setCart]);

  const getQty = useCallback((productId: number) => {
    return cart.find(i => i.productId === productId)?.quantity ?? 0;
  }, [cart]);

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  return { cart, addToCart, updateQty, clearCart, getQty, totalItems };
}

export default function PublicStorePage() {
  const { slug } = useParams<{ slug: string }>();
  const searchString = useSearch();
  const initialQ = new URLSearchParams(searchString).get('q') || '';
  const [search, setSearch] = useState(initialQ);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showQuoteContact, setShowQuoteContact] = useState(false);

  const { cart, addToCart, updateQty, clearCart, getQty, totalItems } = useCart(slug ?? '');

  useCanonical(slug ? `/w/${slug}` : "/");

  const { data, isLoading, isError } = useQuery<{ wholesaler: PublicWholesaler; products: PublicProduct[] }>({
    queryKey: [`/api/public/wholesaler/${slug}`],
    enabled: !!slug,
  });

  const { data: centralCategories = [] } = useQuery<{ id: number; name: string; productCount: number }[]>({
    queryKey: ["/api/categories"],
  });

  const wholesaler = data?.wholesaler;
  const allProducts = data?.products ?? [];

  useNoIndex(isError || (!isLoading && !wholesaler));

  const presentCats = new Set(allProducts.map(p => p.category).filter(Boolean) as string[]);
  const centralNames = centralCategories.map(c => c.name);
  const categories = [
    ...centralNames.filter(name => presentCats.has(name)),
    ...Array.from(presentCats).filter(name => !centralNames.includes(name)).sort(),
  ];

  const filtered = allProducts.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !selectedCategory || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  useEffect(() => {
    if (!wholesaler) return;

    const origin = window.location.origin;
    const storeUrl = `${origin}/store/${wholesaler.storeSlug ?? wholesaler.id}`;

    const serviceTypes: string[] = [];
    if (wholesaler.enableDelivery) serviceTypes.push('DeliveryService');
    if (wholesaler.enablePickup) serviceTypes.push('PickupInStore');

    const businessEntity: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": ["Store", "LocalBusiness"],
      "name": wholesaler.businessName,
      "url": storeUrl,
    };

    if (wholesaler.storeDescription) businessEntity["description"] = wholesaler.storeDescription;
    if (wholesaler.logoUrl) businessEntity["image"] = wholesaler.logoUrl;
    if (wholesaler.city || wholesaler.country) {
      businessEntity["address"] = {
        "@type": "PostalAddress",
        ...(wholesaler.city ? { "addressLocality": wholesaler.city } : {}),
        ...(wholesaler.country ? { "addressCountry": wholesaler.country } : {}),
      };
    }
    if (wholesaler.phoneNumber && wholesaler.whatsappContactVisible !== false) {
      businessEntity["telephone"] = wholesaler.phoneNumber;
    }
    if (wholesaler.deliveryRegions) businessEntity["areaServed"] = wholesaler.deliveryRegions;
    if (serviceTypes.length > 0) businessEntity["hasOfferCatalog"] = { "@type": "OfferCatalog", "name": `${wholesaler.businessName} Wholesale Catalog` };

    const itemListElements = allProducts.map((p, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "url": `${origin}/product/${productSlug(p.name, p.id)}`,
      "name": p.name,
      ...(p.category ? { "description": p.category } : {}),
    }));

    const schemas: unknown[] = [businessEntity];
    if (itemListElements.length > 0) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": `${wholesaler.businessName} Product Catalog`,
        "url": storeUrl,
        "numberOfItems": itemListElements.length,
        "itemListElement": itemListElements,
      });
    }

    const existingEl = document.getElementById('store-ld-json');
    const el = existingEl ?? document.createElement('script');
    el.id = 'store-ld-json';
    (el as HTMLScriptElement).type = 'application/ld+json';
    el.textContent = JSON.stringify(schemas);
    if (!existingEl) document.head.appendChild(el);

    return () => {
      document.getElementById('store-ld-json')?.remove();
    };
  }, [wholesaler, allProducts]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading store…</p>
        </div>
      </div>
    );
  }

  if (isError || !wholesaler) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <Store className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Store not found</h1>
          <p className="text-gray-500 text-sm mb-6">This store may be private or the link may have changed.</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Quikpik
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const currency = wholesaler.preferredCurrency || 'GBP';
  const showPrices = wholesaler.priceDisplayMode === 'shown';
  const enquiriesEnabled = wholesaler.enquiriesEnabled !== false;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
              <img src="/quikpik-logo.png" alt="Quikpik" className="h-5 w-5 object-contain" width={20} height={20} />
              <span className="text-sm font-semibold text-emerald-600">Quikpik</span>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {wholesaler.whatsappContactVisible !== false && wholesaler.phoneNumber && (
              <a
                href={`https://wa.me/${formatPhoneForWhatsApp(wholesaler.phoneNumber)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs px-2 sm:px-3">
                  <Phone className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </Button>
              </a>
            )}
            {enquiriesEnabled && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-gray-200 text-gray-600 hover:bg-gray-50 px-2 sm:px-3"
                onClick={() => setShowEnquiry(true)}
              >
                <MessageSquare className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Get in touch</span>
              </Button>
            )}
            {/* Cart button */}
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cart</span>
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Back breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-3 pb-1">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Home
        </a>
      </div>

      {/* Store header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-start gap-4">
            <WholesalerLogo wholesaler={wholesaler} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{wholesaler.businessName}</h1>
                {wholesaler.isVerified && <VerifiedBadge />}
              </div>
              {(wholesaler.ownerFirstName || wholesaler.ownerLastName) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {[wholesaler.ownerFirstName, wholesaler.ownerLastName].filter(Boolean).join(' ')}
                </p>
              )}
              {wholesaler.storeTagline && (
                <p className="text-gray-500 text-sm mt-0.5">{wholesaler.storeTagline}</p>
              )}
              {wholesaler.storeDescription && (
                <p className="text-gray-600 text-sm mt-2 leading-relaxed">{wholesaler.storeDescription}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {wholesaler.city && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <MapPin className="h-3 w-3" /> {wholesaler.city}
                  </span>
                )}
                {wholesaler.enableDelivery && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Truck className="h-3 w-3" /> Delivery available
                  </span>
                )}
                {wholesaler.enablePickup && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <ShoppingBag className="h-3 w-3" /> Collection available
                  </span>
                )}
                {wholesaler.deliveryRegions && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <MapPin className="h-3 w-3" /> {wholesaler.deliveryRegions}
                  </span>
                )}
                {(wholesaler.minOrderAmount ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <Tag className="h-3 w-3" /> Min. order: £{((wholesaler.minOrderAmount ?? 0) / 100).toFixed(0)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`pl-9 ${search ? 'pr-9' : ''}`}
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-800 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !selectedCategory
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-emerald-300'
              }`}
            >
              All ({allProducts.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-emerald-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{search ? 'No products match your search' : 'No products listed yet'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((product, idx) => (
              <ProductCard
                key={product.id}
                product={product}
                priceDisplayMode={wholesaler.priceDisplayMode}
                showMoq={wholesaler.moqVisible !== false}
                showStock={wholesaler.stockVisible === true}
                showPackSize={wholesaler.packSizeVisible !== false}
                showRrp={wholesaler.rrpVisible === true}
                currency={currency}
                cartQty={getQty(product.id)}
                index={idx}
                onAddToCart={addToCart}
                onUpdateQty={updateQty}
              />
            ))}
          </div>
        )}

        {/* Floating cart nudge — shown when cart has items and drawer is closed */}
        {totalItems > 0 && !showCart && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
            <button
              onClick={() => setShowCart(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
              View Cart · {totalItems} item{totalItems !== 1 ? 's' : ''}
              {showPrices && (
                <span className="opacity-80">
                  · {formatCurrency(
                    cart.reduce((s, i) => s + (parseFloat(i.price ?? '0') || 0) * i.quantity, 0),
                    currency
                  )}
                </span>
              )}
            </button>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            Powered by{' '}
            <Link href="/">
              <span className="text-emerald-600 font-semibold cursor-pointer hover:underline">Quikpik</span>
            </Link>
            {' '}· Wholesale operating system
          </p>
        </div>
      </div>

      {/* Cart drawer */}
      {showCart && (
        <CartDrawer
          cart={cart}
          wholesaler={wholesaler}
          showPrices={showPrices}
          currency={currency}
          onClose={() => setShowCart(false)}
          onUpdateQty={updateQty}
          onClearCart={clearCart}
          onRequestQuote={() => {
            setShowCart(false);
            setShowQuoteContact(true);
          }}
        />
      )}

      {/* Quote contact modal */}
      {showQuoteContact && (
        <QuoteContactModal
          wholesaler={wholesaler}
          cart={cart}
          onClose={(cleared) => {
            setShowQuoteContact(false);
            if (cleared) clearCart();
          }}
        />
      )}

      {/* General enquiry modal (Get in touch) */}
      {showEnquiry && (
        <EnquiryModal
          wholesaler={wholesaler}
          product={null}
          onClose={() => setShowEnquiry(false)}
        />
      )}
    </div>
  );
}
