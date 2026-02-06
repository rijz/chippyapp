import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    autoComplete?: string;
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
    error = false,
    autoComplete = 'street-address'
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const placeAutocompleteRef = useRef<any>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [useNewApi, setUseNewApi] = useState(true);

    // Handle place selection from the new PlaceAutocompleteElement
    const handlePlaceChange = useCallback((place: any) => {
        if (!place || !place.addressComponents) {
            console.warn('No address components found');
            return;
        }

        // Extract address components from the new API format
        let streetNumber = '';
        let streetName = '';
        let city = '';
        let state = '';
        let zip = '';
        let country = '';

        for (const component of place.addressComponents) {
            const types = component.types;

            if (types.includes('street_number')) {
                streetNumber = component.longText || component.long_name || '';
            } else if (types.includes('route')) {
                streetName = component.longText || component.long_name || '';
            } else if (types.includes('locality') || types.includes('sublocality_level_1')) {
                city = component.longText || component.long_name || '';
            } else if (types.includes('administrative_area_level_1')) {
                state = component.shortText || component.short_name || '';
            } else if (types.includes('postal_code')) {
                zip = component.longText || component.long_name || '';
            } else if (types.includes('country')) {
                country = component.shortText || component.short_name || '';
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
    }, [onChange, onPlaceSelect]);

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

                // Timeout after 10 seconds
                setTimeout(() => clearInterval(checkLoaded), 10000);
                return;
            }

            const apiKey = getEnv('VITE_GOOGLE_API_KEY');
            if (!apiKey) {
                console.warn('Google API key not found for Places autocomplete');
                setIsLoading(false);
                return;
            }

            // Use the new async loading pattern
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=initGooglePlaces`;
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
            // Cleanup
            if (placeAutocompleteRef.current) {
                // Remove any event listeners if needed
            }
        };
    }, []);

    useEffect(() => {
        if (!isLoaded || !containerRef.current) return;

        try {
            // Try the new PlaceAutocompleteElement API first (recommended)
            if (window.google?.maps?.places?.PlaceAutocompleteElement) {
                // Create the new PlaceAutocompleteElement
                const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement({
                    componentRestrictions: { country: ['us', 'ca'] },
                    types: ['address'],
                });

                placeAutocomplete.setAttribute('placeholder', placeholder);
                placeAutocomplete.setAttribute('autocomplete', autoComplete);

                // Style the element to match our design
                placeAutocomplete.style.cssText = `
                    width: 100%;
                    --gmpx-color-surface: white;
                    --gmpx-color-on-surface: #1e293b;
                    --gmpx-color-primary: #FF6B5E;
                    --gmpx-font-family-base: inherit;
                    --gmpx-font-size-base: 0.875rem;
                `;

                // Listen for place selection
                placeAutocomplete.addEventListener('gmp-placeselect', async (event: any) => {
                    const place = event.place;

                    // Fetch full place details
                    await place.fetchFields({
                        fields: ['addressComponents', 'formattedAddress']
                    });

                    handlePlaceChange(place);
                });

                // Add to container
                const container = containerRef.current;
                const existingElement = container.querySelector('gmp-place-autocomplete');
                if (existingElement) {
                    existingElement.remove();
                }
                container.appendChild(placeAutocomplete);
                placeAutocompleteRef.current = placeAutocomplete;
                setUseNewApi(true);

            } else if (window.google?.maps?.places?.Autocomplete && inputRef.current) {
                // Fallback to legacy Autocomplete (still supported but deprecated for new customers)
                console.warn('Using legacy Autocomplete API - PlaceAutocompleteElement not available');
                setUseNewApi(false);

                const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
                    types: ['address'],
                    componentRestrictions: { country: ['us', 'ca'] }
                });

                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();

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

                    onPlaceSelect({
                        address: fullAddress,
                        city,
                        state,
                        zip,
                        country
                    });

                    onChange(fullAddress);
                });

                placeAutocompleteRef.current = autocomplete;
            }
        } catch (error) {
            console.error('Error initializing Places Autocomplete:', error);
            setUseNewApi(false);
        }
    }, [isLoaded, handlePlaceChange, onChange, onPlaceSelect]);

    // If using new API, render a container for the PlaceAutocompleteElement
    if (isLoaded && useNewApi) {
        return (
            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">
                    <MapPin className="w-4 h-4" />
                </div>
                <div
                    ref={containerRef}
                    className={`w-full pl-10 border rounded-lg text-sm bg-white ${error
                            ? 'border-red-300'
                            : 'border-slate-200'
                        } ${className} [&>gmp-place-autocomplete]:w-full [&>gmp-place-autocomplete]:border-none [&>gmp-place-autocomplete]:outline-none`}
                    style={{ minHeight: '42px' }}
                />
            </div>
        );
    }

    // Fallback to traditional input (for legacy API or while loading)
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
                autoComplete={autoComplete}
                className={`w-full pl-10 p-2 border rounded-lg text-sm bg-white ${error
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-slate-200 focus:ring-2 focus:ring-chippy-coral'
                    } ${className}`}
                disabled={isLoading}
            />
        </div>
    );
};
