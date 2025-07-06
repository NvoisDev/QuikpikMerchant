import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

interface GooglePlacesAutocompleteProps {
  onAddressSelect: (address: PlaceResult) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  value?: string;
  className?: string;
}

interface PlaceResult {
  formatted_address: string;
  address_components: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
  geometry: {
    location: {
      lat: () => number;
      lng: () => number;
    };
  };
}

export default function GooglePlacesAutocomplete({
  onAddressSelect,
  placeholder = "Enter delivery address",
  label = "Delivery Address",
  required = false,
  value = "",
  className = ""
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isApiKeyAvailable, setIsApiKeyAvailable] = useState(false);

  // Check if Google Maps API key is available
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    setIsApiKeyAvailable(!!apiKey);
  }, []);

  const initializeAutocomplete = useCallback(async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.warn('Google Maps API key not found. Address autocomplete disabled.');
      return;
    }

    try {
      const loader = new Loader({
        apiKey: apiKey,
        version: 'weekly',
        libraries: ['places']
      });

      await loader.load();

      if (inputRef.current && !autocompleteRef.current) {
        // Create autocomplete with basic settings
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          fields: ['formatted_address', 'address_components', 'geometry']
        });

        // Handle place selection - this is the only event we need
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          
          if (place.formatted_address) {
            setInputValue(place.formatted_address);
            onAddressSelect(place as PlaceResult);
          }
        });

        autocompleteRef.current = autocomplete;
        setIsLoaded(true);
      }
    } catch (error) {
      console.error('Error loading Google Places API:', error);
    }
  }, [onAddressSelect]);

  useEffect(() => {
    if (isApiKeyAvailable) {
      initializeAutocomplete();
    }
  }, [initializeAutocomplete, isApiKeyAvailable]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // If user types manually and there's no autocomplete selection, 
    // still call onAddressSelect with basic data
    if (!isApiKeyAvailable) {
      onAddressSelect({
        formatted_address: newValue,
        address_components: [],
        geometry: {
          location: {
            lat: () => 0,
            lng: () => 0
          }
        }
      });
    }
  };

  return (
    <div className={className}>
      {label && (
        <Label htmlFor="address-autocomplete" className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          {label} {required && '*'}
        </Label>
      )}
      <div className="relative">
        <Input
          ref={inputRef}
          id="address-autocomplete"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={isApiKeyAvailable ? `${placeholder} (with autocomplete)` : placeholder}
          required={required}
          className="pr-10"
        />
        {isApiKeyAvailable && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="w-2 h-2 bg-green-500 rounded-full" title="Google Places enabled" />
          </div>
        )}
      </div>
      {!isApiKeyAvailable && (
        <p className="text-xs text-gray-500 mt-1">
          Manual address entry (Google Places API not configured)
        </p>
      )}
      {isApiKeyAvailable && !isLoaded && (
        <p className="text-xs text-blue-600 mt-1">
          Loading address autocomplete...
        </p>
      )}
    </div>
  );
}