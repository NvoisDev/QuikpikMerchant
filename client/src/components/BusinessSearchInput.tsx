import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Building2, MapPin, Search } from "lucide-react";

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
  description: string;
}

interface BusinessSearchInputProps {
  onSelect: (result: BusinessPlaceResult) => void;
  placeholder?: string;
  className?: string;
  global?: boolean;
}

let sdkPromise: Promise<boolean> | null = null;

function loadGoogleMapsSdk(apiKey: string): Promise<boolean> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (typeof google !== 'undefined' && google?.maps?.places?.AutocompleteService) {
      resolve(true);
      return;
    }
    (window as any).gm_authFailure = () => { sdkPromise = null; resolve(false); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => { sdkPromise = null; resolve(false); };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function getComponent(components: any[], type: string): string {
  const c = components?.find((c: any) => c.types?.includes(type));
  return c ? (c.long_name ?? '') : '';
}

// ── AddressSearchInput ────────────────────────────────────────────────────────

export interface AddressPlaceResult {
  addressLine1: string;
  city: string;
  postalCode: string;
  country: string;
}

interface AddressSearchInputProps {
  onSelect: (result: AddressPlaceResult) => void;
  placeholder?: string;
  className?: string;
  global?: boolean;
}

export function AddressSearchInput({
  onSelect,
  placeholder = "Search for an address...",
  className,
  global = false,
}: AddressSearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const autocompleteRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const attributionRef = useRef<HTMLDivElement>(null);
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
        autocompleteRef.current = new google.maps.places.AutocompleteService();
        placesRef.current = new google.maps.places.PlacesService(attributionRef.current!);
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
    debounceRef.current = setTimeout(() => {
      autocompleteRef.current?.getPlacePredictions(
        { input: query, types: ['geocode'], ...(global ? {} : { componentRestrictions: { country: 'gb' } }) },
        (results: any[], status: string) => {
          setLoading(false);
          if (status === 'OK' && results?.length) {
            setSuggestions(results.slice(0, 5).map((r) => ({
              placeId: r.place_id,
              mainText: r.structured_formatting?.main_text ?? r.description,
              secondaryText: r.structured_formatting?.secondary_text ?? '',
              description: r.description,
            })));
            setOpen(true);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        }
      );
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

  const handleSelect = useCallback((suggestion: Suggestion) => {
    setOpen(false);
    setQuery('');
    setSuggestions([]);

    placesRef.current?.getDetails(
      { placeId: suggestion.placeId, fields: ['address_components'] },
      (place: any, status: string) => {
        if (status !== 'OK' || !place) return;
        const comps: any[] = place.address_components || [];
        const streetNumber = getComponent(comps, 'street_number');
        const route = getComponent(comps, 'route');
        const addressLine1 = [streetNumber, route].filter(Boolean).join(' ') || suggestion.mainText;
        const city =
          getComponent(comps, 'locality') ||
          getComponent(comps, 'postal_town') ||
          getComponent(comps, 'administrative_area_level_2');
        onSelect({
          addressLine1,
          city,
          postalCode: getComponent(comps, 'postal_code'),
          country: getComponent(comps, 'country'),
        });
      }
    );
  }, [onSelect]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div ref={attributionRef} style={{ display: 'none' }} />
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={ready ? placeholder : "Loading..."}
          disabled={!ready}
          className="pl-9 h-8 text-sm border-blue-200 focus-visible:ring-blue-300 bg-blue-50/40"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
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

// ── BusinessSearchInput ───────────────────────────────────────────────────────

export function BusinessSearchInput({
  onSelect,
  placeholder = "Find business on Google...",
  className,
  global = false,
}: BusinessSearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const autocompleteRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const attributionRef = useRef<HTMLDivElement>(null);
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
        autocompleteRef.current = new google.maps.places.AutocompleteService();
        placesRef.current = new google.maps.places.PlacesService(attributionRef.current!);
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
    debounceRef.current = setTimeout(() => {
      autocompleteRef.current?.getPlacePredictions(
        { input: query, types: ['establishment'], ...(global ? {} : { componentRestrictions: { country: 'gb' } }) },
        (results: any[], status: string) => {
          setLoading(false);
          if (status === 'OK' && results?.length) {
            setSuggestions(results.slice(0, 5).map((r) => ({
              placeId: r.place_id,
              mainText: r.structured_formatting?.main_text ?? r.description,
              secondaryText: r.structured_formatting?.secondary_text ?? '',
              description: r.description,
            })));
            setOpen(true);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        }
      );
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

  const handleSelect = useCallback((suggestion: Suggestion) => {
    setOpen(false);
    setQuery('');
    setSuggestions([]);

    // Fire immediately with data we already have from the prediction —
    // this guarantees business name is always filled even if getDetails fails.
    onSelect({
      businessName: suggestion.mainText,
      streetAddress: '',
      city: '',
      postalCode: '',
      country: '',
    });

    // Then try getDetails for structured address breakdown (best-effort).
    placesRef.current?.getDetails(
      { placeId: suggestion.placeId, fields: ['name', 'address_components'] },
      (place: any, status: string) => {
        if (status !== 'OK' || !place) return;
        const comps: any[] = place.address_components || [];
        const streetNumber = getComponent(comps, 'street_number');
        const route = getComponent(comps, 'route');
        const streetAddress = [streetNumber, route].filter(Boolean).join(' ');
        const city =
          getComponent(comps, 'locality') ||
          getComponent(comps, 'postal_town') ||
          getComponent(comps, 'administrative_area_level_2');
        // Update with the richer data if available
        onSelect({
          businessName: place.name || suggestion.mainText,
          streetAddress,
          city,
          postalCode: getComponent(comps, 'postal_code'),
          country: getComponent(comps, 'country'),
        });
      }
    );
  }, [onSelect]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Hidden div required by PlacesService for attribution */}
      <div ref={attributionRef} style={{ display: 'none' }} />

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

      {/* Custom dropdown — rendered inside the Dialog, no aria-hidden issues */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
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
