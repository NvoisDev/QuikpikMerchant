import { useState, useEffect } from "react";
import { useParams, Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, MapPin, Truck, Package, ShoppingBag,
  MessageSquare, Store, Phone, Mail, ChevronRight,
  Tag, Users, ArrowLeft, X,
} from "lucide-react";

interface PublicProduct {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  palletPrice?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  unitsPerPack?: number | null;
  unitsPerPallet?: number | null;
  baseUnitStock?: number | null;
  minOrderQuantity?: number | null;
  sku?: string | null;
  unitWeightKg?: string | null;
  totalPackageWeight?: string | null;
  packQuantity?: number | null;
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
  deliveryRegions?: string | null;
  city?: string | null;
  country?: string | null;
  enableDelivery?: boolean;
  enablePickup?: boolean;
  deliveryNote?: string | null;
  preferredCurrency?: string;
}

function formatCurrency(amount: string | number, currency = 'GBP') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
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
  currency,
  onEnquire,
}: {
  product: PublicProduct;
  priceDisplayMode: string;
  currency: string;
  onEnquire: (product: PublicProduct) => void;
}) {
  const showPrices = priceDisplayMode === 'shown' || priceDisplayMode === 'moq_only';
  const imgSrc = product.imageUrl || (product.images && product.images[0]) || null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="h-10 w-10 text-gray-300" />
        )}
      </div>

      <div className="p-3">
        {product.category && (
          <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">{product.category}</p>
        )}
        <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-1">{product.name}</h3>

        {/* Description snippet */}
        {product.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mb-1 leading-snug">{product.description}</p>
        )}

        {/* Weight info */}
        {(product.totalPackageWeight || product.packQuantity) && (() => {
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

        {/* MOQ */}
        {product.minOrderQuantity && product.minOrderQuantity > 1 && (
          <p className="text-[11px] text-amber-600 font-medium mb-1">
            Min. order: {product.minOrderQuantity} units
          </p>
        )}
        {product.unitsPerPack && (
          <p className="text-[11px] text-gray-400 mb-1">{product.unitsPerPack} units/pack</p>
        )}

        {/* Price */}
        {showPrices ? (
          <p className="text-base font-bold text-gray-900 mb-3">
            {formatCurrency(product.price, currency)}
            <span className="text-xs font-normal text-gray-400 ml-1">/ unit</span>
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic mb-3">Price on request</p>
        )}

        <Button
          size="sm"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
          onClick={() => onEnquire(product)}
        >
          <MessageSquare className="h-3 w-3 mr-1" />
          {priceDisplayMode === 'hidden' ? 'Request Quote' : 'Enquire'}
        </Button>
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
            <h2 className="font-semibold text-gray-900">
              {product ? `Enquire about ${product.name}` : `Contact ${wholesaler.businessName}`}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">We'll pass your details to the wholesaler</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Business details */}
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

          {/* Business info */}
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

          {/* Enquiry */}
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

          {/* Preferred contact */}
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

export default function PublicStorePage() {
  const { slug } = useParams<{ slug: string }>();
  const searchString = useSearch();
  const initialQ = new URLSearchParams(searchString).get('q') || '';
  const [search, setSearch] = useState(initialQ);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [enquiryProduct, setEnquiryProduct] = useState<PublicProduct | null | 'general'>('none' as any);
  const [showEnquiry, setShowEnquiry] = useState(false);

  const { data, isLoading, isError } = useQuery<{ wholesaler: PublicWholesaler; products: PublicProduct[] }>({
    queryKey: [`/api/public/wholesaler/${slug}`],
    enabled: !!slug,
  });

  const { data: centralCategories = [] } = useQuery<{ id: number; name: string; productCount: number }[]>({
    queryKey: ["/api/categories"],
  });

  const wholesaler = data?.wholesaler;
  const allProducts = data?.products ?? [];

  // Show only categories that have products, ordered by the central platform list,
  // with any extras (legacy/uncatalogued names) appended alphabetically.
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

  const handleEnquire = (product: PublicProduct) => {
    setEnquiryProduct(product);
    setShowEnquiry(true);
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
              <img src="/quikpik-logo.png" alt="Quikpik" className="h-5 w-5 object-contain" />
              <span className="text-sm font-semibold text-emerald-600">Quikpik</span>
            </div>
          </Link>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-xs"
            onClick={() => { setEnquiryProduct(null); setShowEnquiry(true); }}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Get in touch
          </Button>
        </div>
      </div>

      {/* Back breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-3 pb-1">
        <button
          onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = '/')}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to suppliers
        </button>
      </div>

      {/* Store header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-start gap-4">
            <WholesalerLogo wholesaler={wholesaler} />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{wholesaler.businessName}</h1>
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`pl-9 ${search ? 'pr-9' : ''}`}
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

        {/* Category chips */}
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

        {/* Product grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{search ? 'No products match your search' : 'No products listed yet'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                priceDisplayMode={wholesaler.priceDisplayMode}
                currency={currency}
                onEnquire={handleEnquire}
              />
            ))}
          </div>
        )}

        {/* Powered by Quikpik footer */}
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

      {/* Enquiry modal */}
      {showEnquiry && (
        <EnquiryModal
          wholesaler={wholesaler}
          product={enquiryProduct instanceof Object && enquiryProduct !== null ? enquiryProduct as PublicProduct : null}
          onClose={() => setShowEnquiry(false)}
        />
      )}
    </div>
  );
}
