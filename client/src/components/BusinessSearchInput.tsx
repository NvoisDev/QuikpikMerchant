import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Building2, Search } from "lucide-react";

declare const google: any;

export interface BusinessPlaceResult {
  businessName: string;
  streetAddress: string;
  city: string;
  postalCode: string;
  country: string;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  placePrediction: any;
}

interface BusinessSearchInputProps {
  onSelect: (result: BusinessPlaceResult) => void;
  placeholder?: string;
  className?: string;
}

let sdkPromise: Promise<boolean> | null = null;

function loadGoogleMapsSdk(apiKey: string): Promise<boolean> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (typeof google !== 'undefined' && google?.maps?.places) { resolve(true); return; }
    (window as any).gm_authFailure = () => { sdkPromise = null; resolve(false); };
    const script = document.createElement('script');
    // v=beta unlocks the new Places API (AutocompleteSuggestion, Place)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=beta`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => { sdkPromise = null; resolve(false); };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function getAddressComponent(components: any[], type: string): string {
  const c = components?.find((c: any) => Array.isArray(c.types) && c.types.includes(type));
  return c ? (c.longText ?? c.long_name ?? '') : '';
}

export function BusinessSearchInput({
  onSelect,
  placeholder = "Find business on Google...",
  className,
}: BusinessSearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await fetch('/api/config/google-places-key', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const { apiKey } = await res.json();
        const ok = await loadGoogleMapsSdk(apiKey);
        if (!ok || cancelled) return;
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
        if (!cancelled) setReady(true);
      } catch { /* key not configured */ }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!ready || query.length < 2) { setSuggestions([]); setOpen(false); return; }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { suggestions: results } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            includedPrimaryTypes: ['establishment'],
            includedRegionCodes: ['gb'],
            sessionToken: sessionTokenRef.current,
          });

        setLoading(false);
        const mapped: Suggestion[] = (results || []).slice(0, 5).map((s: any) => ({
          placeId: s.placePrediction?.placeId ?? '',
          mainText: s.placePrediction?.mainText?.text ?? '',
          secondaryText: s.placePrediction?.secondaryText?.text ?? '',
          placePrediction: s.placePrediction,
        }));
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
      } catch (e) {
        console.error('[BusinessSearch] Autocomplete error:', e);
        setLoading(false);
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, ready]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback(async (suggestion: Suggestion) => {
    setOpen(false);
    setQuery('');
    setSuggestions([]);

    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'addressComponents'] });

      // Refresh session token after a completed selection
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();

      const comps: any[] = place.addressComponents || [];
      const streetNumber = getAddressComponent(comps, 'street_number');
      const route = getAddressComponent(comps, 'route');
      const streetAddress = [streetNumber, route].filter(Boolean).join(' ');
      const city =
        getAddressComponent(comps, 'locality') ||
        getAddressComponent(comps, 'postal_town') ||
        getAddressComponent(comps, 'administrative_area_level_2');

      onSelect({
        businessName: place.displayName || suggestion.mainText,
        streetAddress,
        city,
        postalCode: getAddressComponent(comps, 'postal_code'),
        country: getAddressComponent(comps, 'country'),
      });
    } catch (e) {
      console.error('[BusinessSearch] Place details error:', e);
    }
  }, [onSelect]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={ready ? placeholder : "Loading..."}
          disabled={!ready}
          className="pl-9 border-blue-200 focus-visible:ring-blue-300 bg-blue-50/40"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
        )}
      </div>

      {/* Custom dropdown — inside the Dialog tree, no aria-hidden conflict */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focused until after click
                handleSelect(s);
              }}
            >
              <Building2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{s.mainText}</p>
                <p className="text-xs text-slate-500 truncate">{s.secondaryText}</p>
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 text-right">Powered by Google</p>
          </div>
        </div>
      )}

      {!open && (
        <p className="text-[11px] text-muted-foreground/70 text-right pr-1 mt-0.5">Powered by Google</p>
      )}
    </div>
  );
}
