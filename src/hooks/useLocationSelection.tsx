/**
 * Location Selection Hook for Booking Widget
 * This helps integrate location selection into the AI chat and booking flow
 */

import { useState, useEffect } from 'react';
import { BusinessLocation, CalendarConnection } from '../types';

export interface LocationOption {
    id: string;
    name: string;
    address: string;
    calendarConnection?: CalendarConnection;
    hasCalendar: boolean;
}

/**
 * Hook to manage location selection in booking flows
 * 
 * Usage in booking widget:
 * ```tsx
 * const { 
 *   locations, 
 *   selectedLocation, 
 *   setSelectedLocation,
 *   hasMultipleLocations 
 * } = useLocationSelection(knowledgeData, calendarConnections);
 * 
 * if (hasMultipleLocations) {
 *   // Show location picker in chat
 * }
 * ```
 */
export function useLocationSelection(
    knowledgeLocations: BusinessLocation[] = [],
    calendarConnections: CalendarConnection[] = []
) {
    const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
    const [locations, setLocations] = useState<LocationOption[]>([]);

    useEffect(() => {
        // Build location options with calendar availability
        const locationOptions: LocationOption[] = knowledgeLocations.map((loc, idx) => {
            const locId = `loc-${idx}`;
            const connection = calendarConnections.find(
                c => c.locationId === locId && c.isActive
            );

            return {
                id: locId,
                name: loc.name,
                address: `${loc.address}, ${loc.city}, ${loc.state}`,
                calendarConnection: connection,
                hasCalendar: !!connection
            };
        });

        // Filter to only locations with calendars (for booking)
        const bookableLocations = locationOptions.filter(l => l.hasCalendar);
        setLocations(bookableLocations);

        // Auto-select if only one location
        if (bookableLocations.length === 1) {
            setSelectedLocation(bookableLocations[0]);
        }
    }, [knowledgeLocations, calendarConnections]);

    return {
        locations,
        selectedLocation,
        setSelectedLocation,
        hasMultipleLocations: locations.length > 1,
        hasNoLocations: locations.length === 0
    };
}

/**
 * Helper to get available time slots for a specific location
 * 
 * @param locationId - The location to check availability for
 * @param date - Date to check (YYYY-MM-DD format)
 * @returns Promise with available time slots
 */
export async function getLocationAvailability(
    locationId: string,
    date: string,
    calendarConnections: CalendarConnection[]
): Promise<string[]> {
    const connection = calendarConnections.find(
        c => c.locationId === locationId && c.isActive
    );

    if (!connection) {
        console.warn('No calendar connection for location:', locationId);
        return [];
    }

    try {
        // Call your backend API to get availability for this specific calendar
        const response = await fetch('/api/calendar/availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calendarId: connection.calendarId,
                providerEmail: connection.providerEmail,
                date,
                duration: connection.appointmentDuration || 30
            })
        });

        const { slots } = await response.json();
        return slots || [];
    } catch (error) {
        console.error('Error fetching location availability:', error);
        return [];
    }
}

/**
 * Helper to book an appointment at a specific location
 * 
 * @param locationId - Location where appointment should be booked
 * @param datetime - ISO datetime string
 * @param leadData - Customer information
 * @returns Promise with booking result
 */
export async function bookAtLocation(
    locationId: string,
    datetime: string,
    leadData: {
        name: string;
        email: string;
        phone: string;
        service?: string;
        notes?: string;
    },
    calendarConnections: CalendarConnection[]
): Promise<{ success: boolean; eventId?: string; error?: string }> {
    const connection = calendarConnections.find(
        c => c.locationId === locationId && c.isActive
    );

    if (!connection) {
        return {
            success: false,
            error: 'No calendar configured for this location'
        };
    }

    try {
        const response = await fetch('/api/calendar/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calendarId: connection.calendarId,
                providerEmail: connection.providerEmail,
                datetime,
                duration: connection.appointmentDuration || 30,
                customer: leadData,
                locationId,
                locationName: connection.locationName
            })
        });

        const result = await response.json();
        return result;
    } catch (error: any) {
        console.error('Error booking appointment:', error);
        return {
            success: false,
            error: error.message || 'Booking failed'
        };
    }
}

/**
 * AI Prompt Addition for Multi-Location
 * 
 * When multiple locations exist, add this to your AI system prompt:
 */
export function getMultiLocationAIPrompt(locations: LocationOption[]): string {
    if (locations.length === 0) return '';

    if (locations.length === 1) {
        return `\nOur business is located at: ${locations[0].name} (${locations[0].address})`;
    }

    return `
We have multiple locations:
${locations.map((loc, idx) => `${idx + 1}. ${loc.name} - ${loc.address}`).join('\n')}

When a customer wants to book an appointment, ask which location is most convenient for them.
Present the locations as options and let them choose before proceeding with time selection.
`;
}

/**
 * Example: Location Picker Component for Chat Widget
 * 
 * Usage:
 * ```tsx
 * if (hasMultipleLocations && !selectedLocation) {
 *   return <LocationPicker locations={locations} onSelect={setSelectedLocation} />
 * }
 * ```
 */
export function LocationPickerMessage({
    locations,
    onSelect
}: {
    locations: LocationOption[];
    onSelect: (location: LocationOption) => void;
}) {
    return (
        <div className="flex flex-col gap-2 p-4">
            <p className="font-medium text-sm mb-2">
                Which location would you prefer?
            </p>
            {locations.map(location => (
                <button
                    key={location.id}
                    onClick={() => onSelect(location)}
                    className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                >
                    <div className="font-bold text-sm">{location.name}</div>
                    <div className="text-xs text-slate-500">{location.address}</div>
                </button>
            ))}
        </div>
    );
}
