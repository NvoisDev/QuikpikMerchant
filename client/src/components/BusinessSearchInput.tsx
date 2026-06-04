import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle } from "lucide-react";

declare const google: any;

export interface BusinessPlaceResult {
  businessName: string;
  streetAddress: string;
  city: string;
  postalCode: string;
  country: string;
}

interface BusinessSearchInputProps {
  onSelect: (result: BusinessPlaceResult) => void;
  placeholder?: string;
  className?: string;
}

// Module-level SDK loader — loads once, reused across all instances
let sdkPromise: Promise<boolean> | null = null;

function loadGoogleMapsSdk(apiKey: string): Promise<boolean> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve) => {
    // Already loaded from a previous session
    if (typeof google !== 'undefined' && google?.maps?.places) {
      resolve(true);
      return;
    }

    // Catch Google auth failures (invalid key, billing disabled, etc.)
    (window as any).gm_authFailure = () => {
      console.error('[BusinessSearch] Google Maps auth failure — check API key, billing, and Places API is enabled.');
      sdkPromise = null;
      resolve(false);
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = (e) => {
      console.error('[BusinessSearch] Failed to load Google Maps SDK:', e);
      sdkPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

function getComponent(components: any[], type: string, short = false): string {
  const c = components.find((c: any) => c.types.includes(type));
  return c ? (short ? c.short_name : c.long_name) : '';
}

export function BusinessSearchInput({
  onSelect,
  placeholder = "Find business on Google...",
  className,
}: BusinessSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState<string | null>(null);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let autocomplete: any = null;
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch('/api/config/google-places-key', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const { apiKey } = await res.json();

        const loaded = await loadGoogleMapsSdk(apiKey);
        if (!loaded || cancelled || !inputRef.current) {
          if (!loaded) setError('Google Places unavailable');
          return;
        }

        autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['establishment'],
          componentRestrictions: { country: 'gb' },
          fields: ['name', 'address_components'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (!place?.address_components) return;

          const comps = place.address_components;
          const streetNumber = getComponent(comps, 'street_number');
          const route = getComponent(comps, 'route');
          const streetAddress = [streetNumber, route].filter(Boolean).join(' ');
          const city =
            getComponent(comps, 'locality') ||
            getComponent(comps, 'postal_town') ||
            getComponent(comps, 'administrative_area_level_2');

          onSelectRef.current({
            businessName: place.name || '',
            streetAddress,
            city,
            postalCode: getComponent(comps, 'postal_code'),
            country: getComponent(comps, 'country'),
          });

          if (inputRef.current) inputRef.current.value = '';
        });
      } catch (e) {
        console.error('[BusinessSearch] Init error:', e);
        setError('Search unavailable');
      }
    }

    init();
    return () => {
      cancelled = true;
      if (autocomplete && typeof google !== 'undefined') {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, []);

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 ${className ?? ''}`}>
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>Google business search unavailable — fill in manually below</span>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          className="pl-9 border-blue-200 focus-visible:ring-blue-300 bg-blue-50/40"
          autoComplete="off"
        />
      </div>
      <p className="text-[11px] text-muted-foreground/70 text-right pr-1">Powered by Google</p>
    </div>
  );
}
