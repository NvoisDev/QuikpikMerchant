import { useState, useEffect, useRef } from "react";
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
  MessageSquare,
  Eye,
  Phone,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Heart,
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { formatPhoneForWhatsApp } from "@shared/utils/currency";
import { cleanAIDescription } from "@shared/utils";
import { useSavedProducts } from "@/hooks/useSavedProducts";

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
  rrp?: string | null;
  rrpVisible?: boolean;
  priceVisible?: boolean;
  moqVisible?: boolean;
  stockVisible?: boolean;
  packSizeVisible?: boolean;
  views: number;
  lastUpdated: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function stockDotColor(availability: string): string {
  if (availability.startsWith("Low Stock") || availability === "Out of Stock")
    return availability === "Out of Stock" ? "bg-red-400" : "bg-amber-400";
  return "bg-emerald-400";
}

export default function PublicProductPage() {
  const [, params] = useRoute("/product/:slug");
  const [selectedImage, setSelectedImage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", business: "", message: "" });
  const [referrerHref, setReferrerHref] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isSaved, toggleSave, saved } = useSavedProducts();

  useEffect(() => {
    try {
      const ref = document.referrer;
      if (ref) {
        const url = new URL(ref);
        if (url.hostname === window.location.hostname && url.pathname.startsWith("/w/")) {
          setReferrerHref(url.pathname + url.search);
        }
      }
    } catch {}
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
      metaDesc.setAttribute(
        "content",
        `Buy ${product.name} wholesale from ${product.wholesaler.businessName}. ${(product.description || "").slice(0, 120)}`
      );
    }
    const productSchema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description || undefined,
      category: product.category || undefined,
      image: product.images.length > 0 ? product.images : undefined,
      url: window.location.href,
      seller: { "@type": "Organization", name: product.wholesaler.businessName },
    };
    if (product.priceVisible !== false && product.price != null) {
      productSchema["offers"] = {
        "@type": "Offer",
        priceCurrency: "GBP",
        price: parseFloat(product.price).toFixed(2),
        availability:
          product.availability === "Out of Stock"
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        seller: { "@type": "Organization", name: product.wholesaler.businessName },
      };
    }
    const existing = document.getElementById("product-ld-json");
    const el = existing ?? document.createElement("script");
    el.id = "product-ld-json";
    (el as HTMLScriptElement).type = "application/ld+json";
    el.textContent = JSON.stringify(productSchema);
    if (!existing) document.head.appendChild(el);
    return () => { document.getElementById("product-ld-json")?.remove(); };
  }, [product]);

  const handleShare = async () => {
    const data = { title: product?.name || "Product", url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(data); } catch { navigator.clipboard.writeText(window.location.href); }
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const scrollToImage = (index: number) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    setSelectedImage(index);
  };

  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== selectedImage) setSelectedImage(index);
  };

  const constructedStoreHref = product?.wholesaler?.storeSlug
    ? `/w/${product.wholesaler.storeSlug}`
    : product?.wholesaler?.id
    ? `/w/${product.wholesaler.id}`
    : "/";
  const storeHref = referrerHref ?? constructedStoreHref;

  const productSaved = product ? isSaved(product.id) : false;

  function handleToggleSave() {
    if (!product) return;
    const wasAlreadySaved = isSaved(product.id);
    toggleSave({
      id: product.id,
      slug: params?.slug ?? product.id,
      name: product.name,
      price: product.price,
      priceVisible: product.priceVisible !== false,
      category: product.category ?? "",
      image: product.images[0] ?? null,
      wholesalerName: product.wholesaler.businessName,
      wholesalerSlug: product.wholesaler.storeSlug ?? product.wholesaler.id,
      savedAt: Date.now(),
    });
    toast({
      title: wasAlreadySaved ? "Removed from saved" : "Product saved",
      description: wasAlreadySaved
        ? undefined
        : "View all your saved products any time.",
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 h-14" />
        <div className="h-72 bg-gray-200 animate-pulse" />
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 animate-pulse">
          <div className="bg-gray-200 rounded h-6 w-1/2" />
          <div className="bg-gray-200 rounded h-5 w-1/3" />
          <div className="bg-gray-200 rounded h-4 w-3/4" />
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
          <p className="text-gray-500 text-sm mb-6">
            This product may have been removed or the link has changed.
          </p>
          <a href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Quikpik
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const images = product.images.length > 0 ? product.images : [];
  const showPrice = product.priceVisible !== false && product.price != null;
  const showStock = product.stockVisible === true && product.availability != null;
  const showMoq = product.moqVisible !== false && product.minOrderQuantity != null;
  const showPackSize =
    product.packSizeVisible !== false &&
    product.packQuantity &&
    product.unitSize &&
    product.unitOfMeasure;

  const isLowStock =
    showStock &&
    product.availability != null &&
    (product.availability.startsWith("Low Stock") ||
      product.availability === "Out of Stock");
  const isInDemand = product.views > 50;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <a
            href={storeHref}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors flex-1 min-w-0"
          >
            <ArrowLeft className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">Back to {product.wholesaler.businessName}</span>
          </a>
          {/* Save / heart button */}
          <button
            onClick={handleToggleSave}
            aria-label={productSaved ? "Remove from saved" : "Save product"}
            className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
              productSaved
                ? "text-rose-500 bg-rose-50 hover:bg-rose-100"
                : "text-gray-400 hover:text-rose-500 hover:bg-rose-50"
            }`}
          >
            <Heart className={`h-5 w-5 ${productSaved ? "fill-rose-500" : ""}`} />
          </button>
          {/* Saved list badge */}
          {saved.length > 0 && (
            <a
              href="/saved"
              className="flex-shrink-0 relative"
              aria-label={`View ${saved.length} saved products`}
            >
              <Heart className="h-4 w-4 text-gray-300 hover:text-rose-400 transition-colors" />
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center leading-none">
                {saved.length > 9 ? "9+" : saved.length}
              </span>
            </a>
          )}
          <a href="/" className="flex items-center gap-1 hover:opacity-80 transition-opacity flex-shrink-0">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-4 w-4 object-contain" />
            <span className="text-xs font-semibold text-emerald-600">Quikpik</span>
          </a>
        </div>
      </div>

      {/* Image hero — full width, compact */}
      <div className="relative bg-white overflow-hidden" style={{ maxHeight: 300 }}>
        {images.length > 0 ? (
          <>
            {/* Scroll-snap carousel */}
            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none", height: 280 }}
            >
              {images.map((img, i) => (
                <div key={i} className="flex-none w-full h-full snap-start flex items-center justify-center bg-white">
                  <img
                    src={img}
                    alt={`${product.name} ${i + 1}`}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: 280 }}
                  />
                </div>
              ))}
            </div>

            {/* Subtle bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />

            {/* Overlay badges — bottom left */}
            {(isLowStock || isInDemand) && (
              <div className="absolute bottom-3 left-3 flex gap-1.5 pointer-events-none">
                {isLowStock && (
                  <span className="inline-flex items-center gap-1 bg-red-500/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {product.availability === "Out of Stock" ? "Out of Stock" : "Low Stock"}
                  </span>
                )}
                {isInDemand && (
                  <span className="inline-flex items-center gap-1 bg-amber-500/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                    <TrendingUp className="h-2.5 w-2.5" />
                    In Demand
                  </span>
                )}
              </div>
            )}

            {/* Dot indicators — bottom right */}
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 flex gap-1 pointer-events-none">
                {images.map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all ${
                      i === selectedImage
                        ? "bg-white w-4 h-1.5"
                        : "bg-white/50 w-1.5 h-1.5"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="h-64 flex items-center justify-center bg-gray-50">
            <Package className="h-20 w-20 text-gray-200" />
          </div>
        )}
      </div>

      {/* Thumbnail strip (multi-image only) */}
      {images.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => scrollToImage(i)}
                className={`flex-none w-12 h-12 rounded-lg border overflow-hidden transition-all ${
                  i === selectedImage
                    ? "border-emerald-500 ring-1 ring-emerald-400"
                    : "border-gray-100 opacity-60 hover:opacity-100"
                }`}
              >
                <img src={img} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-20 space-y-4">

        {/* Name */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{product.name}</h1>

          {/* Price */}
          {showPrice ? (
            <div className="mt-1">
              <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                <p className="text-lg font-bold text-emerald-600">
                  {formatCurrency(parseFloat(product.price), "GBP")}
                  <span className="text-sm font-normal text-gray-400 ml-2">per unit</span>
                </p>
                {(() => {
                  const rrpNum = product.rrpVisible && product.rrp ? parseFloat(product.rrp) : 0;
                  const priceNum = parseFloat(product.price);
                  const pctOff = rrpNum > 0 && priceNum < rrpNum
                    ? Math.round((1 - priceNum / rrpNum) * 100)
                    : 0;
                  if (pctOff <= 0) return null;
                  return (
                    <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                      {pctOff}% off RRP
                    </span>
                  );
                })()}
              </div>
              {product.rrpVisible && product.rrp && parseFloat(product.rrp) > parseFloat(product.price) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  RRP: <span className="line-through">{formatCurrency(parseFloat(product.rrp), "GBP")}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-gray-400 italic">Price on request</p>
          )}
        </div>

        {/* Stat chips — horizontal scroll row */}
        {(product.category || showMoq || showPackSize || product.views > 1) && (
          <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {product.category && (
              <span className="flex-none text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 uppercase tracking-wide">
                {product.category}
              </span>
            )}
            {showMoq && (
              <span className="flex-none text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-100 rounded-full px-2.5 py-1">
                MOQ · {product.minOrderQuantity} units
              </span>
            )}
            {showPackSize && (() => {
              const qty = product.packQuantity ?? 0;
              const unitW = parseFloat(String(product.unitSize ?? 0));
              const uom = product.unitOfMeasure ?? '';
              const total = uom === 'kg' && qty > 0 ? qty * unitW : 0;
              return (
                <span className="flex-none text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-100 rounded-full px-2.5 py-1">
                  {total > 0 ? `${total} kg/pack · ` : ''}{qty} × {unitW}{uom}
                </span>
              );
            })()}
            {product.views > 1 && (
              <span className="flex-none text-[11px] font-medium text-gray-400 border border-gray-100 rounded-full px-2.5 py-1 flex items-center gap-1">
                <Eye className="h-2.5 w-2.5" /> {product.views.toLocaleString()} views
              </span>
            )}
          </div>
        )}

        {/* Availability — single status line */}
        {showStock && product.availability && (
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${stockDotColor(product.availability)}`} />
            <span className="text-sm text-gray-600">{product.availability}</span>
          </div>
        )}

        {/* Description */}
        {product.description && (
          <p className="text-sm text-gray-600 leading-relaxed">
            {cleanAIDescription(product.description)}
          </p>
        )}

        {/* Supplier strip */}
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
          <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">
              {getInitials(product.wholesaler.businessName)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {product.wholesaler.businessName}
            </p>
            {product.wholesaler.location && (
              <p className="text-xs text-gray-400">{product.wholesaler.location}</p>
            )}
          </div>
          <a href={storeHref} className="flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              View store
            </Button>
          </a>
        </div>

        {/* CTA section */}
        {!showForm && !submitted && (
          <div className="space-y-2">
            {/* Primary */}
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11"
              onClick={() => setShowForm(true)}
            >
              <MessageSquare className="h-4 w-4 mr-2" /> Request an Invoice
            </Button>

            {/* Secondary — WhatsApp (only if phone visible) */}
            {product.wholesaler.phoneNumber && (
              <a
                href={`https://wa.me/${formatPhoneForWhatsApp(product.wholesaler.phoneNumber)}?text=${encodeURIComponent(`Hi, I'm interested in ${product.name}`)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg py-2.5 text-sm font-medium transition-colors"
              >
                <Phone className="h-4 w-4" /> WhatsApp supplier
              </a>
            )}

            {/* Tertiary — Share (ghost link) */}
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-1.5 w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              <Share2 className="h-3 w-3" /> Share this product
            </button>
          </div>
        )}

        {/* Invoice request form */}
        {showForm && !submitted && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Request an Invoice</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Your details go to {product.wholesaler.businessName} who will follow up.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Your name *</label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Full name"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone / WhatsApp *</label>
                  <Input
                    required
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+44 7700 000000"
                    className="text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Business name</label>
                  <Input
                    value={form.business}
                    onChange={(e) => setForm((p) => ({ ...p, business: e.target.value }))}
                    placeholder="Your business (optional)"
                    className="text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                  <Textarea
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    placeholder="Quantity needed, delivery requirements, questions…"
                    className="text-sm resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : "Send Request"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Success */}
        {submitted && (
          <div className="bg-white rounded-xl border border-emerald-100 p-6 text-center">
            <div className="w-11 h-11 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Request sent!</h3>
            <p className="text-sm text-gray-500">
              {product.wholesaler.businessName} will be in touch shortly.
            </p>
            <a href={storeHref} className="inline-block mt-4">
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                Browse more products
              </Button>
            </a>
          </div>
        )}

        {/* Specifications */}
        {Object.keys(product.specifications).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
      <div className="border-t border-gray-100 bg-white py-5 text-center">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-emerald-600 transition-colors text-sm"
        >
          <img src="/quikpik-logo.png" alt="Quikpik" className="h-4 w-4 object-contain" />
          Powered by <span className="font-semibold text-emerald-600 ml-1">Quikpik</span>
        </a>
      </div>
    </div>
  );
}
