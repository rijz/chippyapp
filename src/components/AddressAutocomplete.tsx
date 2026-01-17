import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { getEnv } from '../utils/env';

interface AddressAutocompleteProps {
    value: string;
    onChange: (address: string) => void;
    onPlaceSelect: (place: {
        address: string;
        city: string;
        state: string;
        zip: string;
        country?: string;
    }) => void;
    placeholder?: string;
    className?: string;
    error?: boolean;
}

// Declare google globally
declare global {
    interface Window {
        google: any;
        initGooglePlaces: () => void;
    }
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
    value,
    onChange,
    onPlaceSelect,
    placeholder = "Start typing your address...",
    className = "",
    error = false
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<any>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Load Google Places script if not already loaded
        const loadGooglePlacesScript = () => {
            // Check if already loaded
            if (window.google?.maps?.places) {
                setIsLoaded(true);
                setIsLoading(false);
                return;
            }

            // Check if script is already in DOM
            if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
                // Wait for it to load
                const checkLoaded = setInterval(() => {
                    if (window.google?.maps?.places) {
                        setIsLoaded(true);
                        setIsLoading(false);
                        clearInterval(checkLoaded);
                    }
                }, 100);
                return;
            }

            const apiKey = getEnv('VITE_GOOGLE_API_KEY');
            if (!apiKey) {
                console.warn('Google API key not found for Places autocomplete');
                setIsLoading(false);
                return;
            }

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGooglePlaces`;
            script.async = true;
            script.defer = true;

            window.initGooglePlaces = () => {
                setIsLoaded(true);
                setIsLoading(false);
            };

            script.onerror = () => {
                console.error('Failed to load Google Places API');
                setIsLoading(false);
            };

            document.head.appendChild(script);
        };

        loadGooglePlacesScript();

        return () => {
            // Cleanup autocomplete on unmount
            if (autocompleteRef.current) {
                window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

        try {
            // Initialize autocomplete
            autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
                types: ['address'],
                componentRestrictions: { country: ['us', 'ca'] } // US and Canada
            });

            // Add place_changed listener
            autocompleteRef.current.addListener('place_changed', () => {
                const place = autocompleteRef.current.getPlace();

                if (!place.address_components) {
                    console.warn('No address components found');
                    return;
                }

                // Extract address components
                let streetNumber = '';
                let streetName = '';
                let city = '';
                let state = '';
                let zip = '';
                let country = '';

                for (const component of place.address_components) {
                    const types = component.types;

                    if (types.includes('street_number')) {
                        streetNumber = component.long_name;
                    } else if (types.includes('route')) {
                        streetName = component.long_name;
                    } else if (types.includes('locality') || types.includes('sublocality_level_1')) {
                        city = component.long_name;
                    } else if (types.includes('administrative_area_level_1')) {
                        state = component.short_name;
                    } else if (types.includes('postal_code')) {
                        zip = component.long_name;
                    } else if (types.includes('country')) {
                        country = component.short_name;
                    }
                }

                const fullAddress = `${streetNumber} ${streetName}`.trim();

                // Update parent with parsed address
                onPlaceSelect({
                    address: fullAddress,
                    city,
                    state,
                    zip,
                    country
                });

                // Also update the input value
                onChange(fullAddress);
            });
        } catch (error) {
            console.error('Error initializing Places Autocomplete:', error);
        }
    }, [isLoaded, onChange, onPlaceSelect]);

    return (
        <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <MapPin className="w-4 h-4" />
                )}
            </div>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full pl-10 p-2 border rounded-lg text-sm bg-white ${error
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-slate-200 focus:ring-2 focus:ring-chippy-coral'
                    } ${className}`}
                disabled={isLoading}
            />
        </div>
    );
};
