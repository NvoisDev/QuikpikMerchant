import { useSavedProducts } from "@/hooks/useSavedProducts";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, Package, Trash2, X } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

export default function SavedProductsPage() {
  const { formatMoney } = useCurrency();
  const { saved, removeSaved, clearAll } = useSavedProducts();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => history.back()}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors flex-1 min-w-0"
          >
            <ArrowLeft className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">Back</span>
          </button>
          <a href="/" className="flex items-center gap-1 hover:opacity-80 transition-opacity flex-shrink-0">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-4 w-4 object-contain" />
            <span className="text-xs font-semibold text-emerald-600">Quikpik</span>
          </a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500 fill-rose-500" />
            <h1 className="text-lg font-bold text-gray-900">Saved Products</h1>
            {saved.length > 0 && (
              <span className="text-xs font-semibold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                {saved.length}
              </span>
            )}
          </div>
          {saved.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>

        {/* Empty state */}
        {saved.length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="h-7 w-7 text-rose-300" />
            </div>
            <h2 className="text-base font-semibold text-gray-700 mb-1">No saved products yet</h2>
            <p className="text-sm text-gray-400 mb-6">
              Tap the heart icon on any product to save it here for later.
            </p>
            <a href="/">
              <Button variant="outline" size="sm" className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                Browse products
              </Button>
            </a>
          </div>
        )}

        {/* Product list */}
        {saved.length > 0 && (
          <div className="space-y-3">
            {saved.map((product) => {
              const storeHref = product.wholesalerSlug
                ? `/w/${product.wholesalerSlug}`
                : "/";
              const productHref = `/product/${product.slug}`;

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl border border-gray-100 flex items-center gap-3 p-3 hover:border-gray-200 transition-colors"
                >
                  {/* Thumbnail */}
                  <a href={productHref} className="flex-shrink-0">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-16 h-16 rounded-lg object-cover bg-gray-50"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="h-6 w-6 text-gray-300" />
                      </div>
                    )}
                  </a>

                  {/* Details */}
                  <a href={productHref} className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                    {product.category && (
                      <p className="text-[11px] text-emerald-600 font-medium uppercase tracking-wide mt-0.5">
                        {product.category}
                      </p>
                    )}
                    {product.priceVisible && product.price ? (
                      <p className="text-sm font-bold text-emerald-600 mt-1">
                        {formatMoney(parseFloat(product.price))}
                        <span className="text-xs font-normal text-gray-400 ml-1">/ unit</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic mt-1">Price on request</p>
                    )}
                    <a
                      href={storeHref}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-gray-400 hover:text-emerald-600 transition-colors mt-0.5 inline-block"
                    >
                      {product.wholesalerName}
                    </a>
                  </a>

                  {/* Remove button */}
                  <button
                    onClick={() => removeSaved(product.id)}
                    className="flex-shrink-0 p-1.5 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                    aria-label="Remove from saved"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-white py-5 text-center mt-8">
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
