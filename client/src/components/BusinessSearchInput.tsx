import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

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

let sdkState: 'idle' | 'loading' | 'ready' = 'idle';
const pendingCallbacks: Array<() => void> = [];

function loadGoogleMapsSdk(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (sdkState === 'ready') { resolve(); return; }
    pendingCallbacks.push(resolve);
    if (sdkState === 'loading') return;
    sdkState = 'loading';
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      sdkState = 'ready';
      pendingCallbacks.splice(0).forEach((cb) => cb());
    };
    document.head.appendChild(script);
  });
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
  onSelectRef.current = onSelect;

  useEffect(() => {
    let autocomplete: any = null;
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch('/api/config/google-places-key', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const { apiKey } = await res.json();
        await loadGoogleMapsSdk(apiKey);
        if (cancelled || !inputRef.current) return;

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
      } catch {
        // API key not configured — silently does nothing
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
