import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useCanonical, useNoIndex } from "@/hooks/useCanonical";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Package,
  Share2,
  Truck,
  ShoppingBag,
  MessageSquare,
  Eye,
  Phone,
  CheckCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { cleanAIDescription } from "@shared/utils";

interface PublicProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  images: string[];
  wholesaler: {
    id: string;
    businessName: string;
    location: string;
    storeSlug?: string | null;
    phoneNumber?: string;
  };
  specifications: { [key: string]: string };
  availability: string | null;
  minOrderQuantity: number | null;
  packQuantity?: number | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  priceVisible?: boolean;
  moqVisible?: boolean;
  stockVisible?: boolean;
  packSizeVisible?: boolean;
  views: number;
  lastUpdated: string;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function PublicProductPage() {
  const [, params] = useRoute("/product/:slug");
  const [selectedImage, setSelectedImage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', business: '', message: '' });
  const [referrerHref, setReferrerHref] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const ref = document.referrer;
      if (ref) {
        const url = new URL(ref);
        if (url.hostname === window.location.hostname && url.pathname.startsWith('/store/')) {
          setReferrerHref(url.pathname + url.search);
        }
      }
    } catch {
    }
  }, []);

  useCanonical(params?.slug ? `/product/${params.slug}` : "/");

  const { data: product, isLoading, isError } = useQuery<PublicProduct>({
    queryKey: [`/api/public/products/${params?.slug}`],
    queryFn: async () => {
      const r = await fetch(`/api/public/products/${params?.slug}`);
      if (!r.ok) throw new Error("Product not found");
      return r.json();
    },
    enabled: !!params?.slug,
  });

  useNoIndex(isError || (!isLoading && !product));

  useEffect(() => {
    if (!product) return;
    document.title = `${product.name} — ${product.wholesaler.businessName} | Quikpik`;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content',
        `Buy ${product.name} wholesale from ${product.wholesaler.businessName}. ${(product.description || '').slice(0, 120)}`
      );
    }

    const productSchema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.name,
      "description": product.description || undefined,
      "category": product.category || undefined,
      "image": product.images.length > 0 ? product.images : undefined,
      "url": window.location.href,
      "seller": { "@type": "Organization", "name": product.wholesaler.businessName },
    };

    if (product.priceVisible !== false && product.price != null) {
      productSchema["offers"] = {
        "@type": "Offer",
        "priceCurrency": "GBP",
        "price": parseFloat(product.price).toFixed(2),
        "availability": product.availability === 'Out of Stock'
          ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        "seller": { "@type": "Organization", "name": product.wholesaler.businessName },
      };
    }

    const existing = document.getElementById('product-ld-json');
    const el = existing ?? document.createElement('script');
    el.id = 'product-ld-json';
    (el as HTMLScriptElement).type = 'application/ld+json';
    el.textContent = JSON.stringify(productSchema);
    if (!existing) document.head.appendChild(el);

    return () => { document.getElementById('product-ld-json')?.remove(); };
  }, [product]);

  const handleShare = async () => {
    const data = { title: product?.name || 'Product', url: window.location.href };
    if (navigator.share) { try { await navigator.share(data); } catch { navigator.clipboard.writeText(window.location.href); } }
    else navigator.clipboard.writeText(window.location.href);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wholesalerId: product.wholesaler.id,
          enquirerName: form.name,
          enquirerPhone: form.phone || null,
          enquirerBusiness: form.business || null,
          message: form.message || null,
          productId: parseInt(product.id),
          productName: product.name,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        toast({ title: "Couldn't send", description: "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Couldn't send", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const constructedStoreHref = product?.wholesaler?.storeSlug
    ? `/store/${product.wholesaler.storeSlug}`
    : product?.wholesaler?.id ? `/store/${product.wholesaler.id}` : '/';
  const storeHref = referrerHref ?? constructedStoreHref;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 h-14" />
        <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse space-y-4">
          <div className="bg-gray-200 rounded-xl aspect-square max-w-sm" />
          <div className="bg-gray-200 rounded h-8 w-1/2" />
          <div className="bg-gray-200 rounded h-5 w-1/3" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Product not found</h1>
          <p className="text-gray-500 text-sm mb-6">This product may have been removed or the link has changed.</p>
          <a href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Quikpik</Button></a>
        </div>
      </div>
    );
  }

  const images = product.images.length > 0 ? product.images : [];
  const showPrice = product.priceVisible !== false && product.price != null;
  const showStock = product.stockVisible === true && product.availability != null;
  const showMoq = product.moqVisible !== false && product.minOrderQuantity != null;
  const showPackSize = product.packSizeVisible !== false && product.packQuantity && product.unitSize && product.unitOfMeasure;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top bar — matches public-store-page */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-5 w-5 object-contain" />
            <span className="text-sm font-semibold text-emerald-600">Quikpik</span>
          </a>
          <Button size="sm" variant="outline" className="text-xs border-gray-200 text-gray-600 hover:bg-gray-50" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5 mr-1" /> Share
          </Button>
        </div>
      </div>

      {/* Back breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-3 pb-1">
        <a href={storeHref} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {product.wholesaler.businessName}
        </a>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Image gallery */}
          <div className="space-y-2">
            <div className="aspect-square bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-center justify-center">
              {images.length > 0 ? (
                <img src={images[selectedImage]} alt={product.name} className="w-full h-full object-contain p-2" />
              ) : (
                <Package className="h-20 w-20 text-gray-200" />
              )}
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(0, 4).map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`aspect-square rounded-lg border overflow-hidden transition-all ${i === selectedImage ? 'border-emerald-500 ring-1 ring-emerald-400' : 'border-gray-100'}`}
                  >
                    <img src={img} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="space-y-4">

            {/* Category + views */}
            <div className="flex items-center gap-3 flex-wrap">
              {product.category && (
                <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">{product.category}</span>
              )}
              {product.views > 1 && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Eye className="h-3 w-3" /> {product.views.toLocaleString()} views
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-xl font-bold text-gray-900 leading-snug">{product.name}</h1>

            {/* Price */}
            {showPrice ? (
              <p className="text-lg font-bold text-emerald-600">
                {formatCurrency(parseFloat(product.price), 'GBP')}
                <span className="text-sm font-normal text-gray-400 ml-2">per unit</span>
              </p>
            ) : (
              <p className="text-sm font-medium text-gray-400 italic">Price on request</p>
            )}

            {/* Description */}
            {product.description && (
              <p className="text-sm text-gray-600 leading-relaxed">{cleanAIDescription(product.description)}</p>
            )}

            {/* Availability / MOQ */}
            {(showStock || showMoq) && (
              <div className={`grid gap-3 ${showStock && showMoq ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {showStock && (
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-700">Availability</p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-800">{product.availability}</p>
                  </div>
                )}
                {showMoq && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Truck className="h-3.5 w-3.5 text-gray-500" />
                      <p className="text-xs font-semibold text-gray-600">Min. Order</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{product.minOrderQuantity} units</p>
                  </div>
                )}
              </div>
            )}

            {/* Pack size */}
            {showPackSize && (
              <div className="flex items-center justify-between py-2.5 px-3 bg-white rounded-xl border border-gray-100 text-sm">
                <span className="text-gray-500">Pack size</span>
                <span className="text-gray-800 font-medium">{product.packQuantity} × {parseFloat(String(product.unitSize))}{product.unitOfMeasure}</span>
              </div>
            )}

            {/* Supplier strip */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
              <div className="h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">{getInitials(product.wholesaler.businessName)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{product.wholesaler.businessName}</p>
                {product.wholesaler.location && (
                  <p className="text-xs text-gray-400">{product.wholesaler.location}</p>
                )}
              </div>
              <a href={storeHref} className="flex-shrink-0">
                <Button size="sm" variant="outline" className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  View store
                </Button>
              </a>
            </div>

            {/* Request an Invoice CTA */}
            {!showForm && !submitted && (
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowForm(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" /> Request an Invoice
              </Button>
            )}

            {/* WhatsApp link (if phone visible) */}
            {product.wholesaler.phoneNumber && !showForm && (
              <a
                href={`https://wa.me/${product.wholesaler.phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${product.name}`)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg py-2 text-sm font-medium transition-colors"
              >
                <Phone className="h-4 w-4" /> WhatsApp supplier
              </a>
            )}
          </div>
        </div>

        {/* Invoice request form */}
        {showForm && !submitted && (
          <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Request an Invoice</h2>
              <p className="text-xs text-gray-400 mt-0.5">Your details will be sent to {product.wholesaler.businessName} who will follow up with an invoice.</p>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Your name *</label>
                  <Input
                    required
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Full name"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone / WhatsApp *</label>
                  <Input
                    required
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+44 7700 000000"
                    className="text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Business name</label>
                  <Input
                    value={form.business}
                    onChange={e => setForm(p => ({ ...p, business: e.target.value }))}
                    placeholder="Your business (optional)"
                    className="text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                  <Textarea
                    rows={3}
                    value={form.message}
                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    placeholder="Quantity needed, delivery requirements, questions…"
                    className="text-sm resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send Request'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Success state */}
        {submitted && (
          <div className="mt-6 bg-white rounded-xl border border-emerald-100 p-6 text-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Request sent!</h3>
            <p className="text-sm text-gray-500">{product.wholesaler.businessName} will be in touch with your invoice.</p>
            <a href={storeHref} className="inline-block mt-4">
              <Button size="sm" variant="outline" className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                Browse more products
              </Button>
            </a>
          </div>
        )}

        {/* Specifications */}
        {Object.keys(product.specifications).length > 0 && (
          <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Specifications</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {Object.entries(product.specifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-500">{key}</span>
                  <span className="text-gray-900 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-white py-6 text-center">
        <a href="/" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-emerald-600 transition-colors text-sm">
          <img src="/quikpik-logo.png" alt="Quikpik" className="h-4 w-4 object-contain" />
          Powered by <span className="font-semibold text-emerald-600 ml-1">Quikpik</span>
        </a>
      </div>
    </div>
  );
}
