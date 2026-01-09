/**
 * Location Selection Tools for Multi-Location Booking
 * Provides tools for location selection and distance calculation
 */

import { BusinessLocation, CalendarConnection } from '../types';

/**
 * Calculate straight-line distance between two coordinates (Haversine formula)
 * Returns distance in miles
 */
function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return parseFloat(distance.toFixed(1));
}

/**
 * Geocode an address using a geocoding service
 * Returns coordinates or null if not found
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
        // Using a free geocoding service (you can replace with Google Maps API)
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
        );

        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }

        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

/**
 * Find the closest location to a given address
 */
export async function findClosestLocation(
    userAddress: string,
    locations: BusinessLocation[]
): Promise<{
    location: BusinessLocation & { index: number };
    distance: number;
    allDistances: Array<{ location: BusinessLocation & { index: number }; distance: number }>;
} | null> {
    try {
        // Geocode user's address
        const userCoords = await geocodeAddress(userAddress);
        if (!userCoords) {
            console.warn('Could not geocode user address:', userAddress);
            return null;
        }

        // Calculate distances to all locations
        const distances = await Promise.all(
            locations.map(async (loc, index) => {
                const fullAddress = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
                const locCoords = await geocodeAddress(fullAddress);

                if (!locCoords) {
                    return { location: { ...loc, index }, distance: Infinity };
                }

                const dist = calculateDistance(
                    userCoords.lat,
                    userCoords.lng,
                    locCoords.lat,
                    locCoords.lng
                );

                return { location: { ...loc, index }, distance: dist };
            })
        );

        // Filter out failed geocodes and sort by distance
        const validDistances = distances
            .filter(d => d.distance !== Infinity)
            .sort((a, b) => a.distance - b.distance);

        if (validDistances.length === 0) {
            return null;
        }

        return {
            location: validDistances[0].location,
            distance: validDistances[0].distance,
            allDistances: validDistances
        };
    } catch (error) {
        console.error('Error finding closest location:', error);
        return null;
    }
}

/**
 * Get location selection prompt for AI based on available locations
 */
export function getLocationSelectionPrompt(
    locations: BusinessLocation[],
    calendarConnections: CalendarConnection[]
): string {
    if (locations.length === 0) {
        return '';
    }

    // Filter to only locations with active calendars (bookable)
    const bookableLocations = locations.filter((loc, idx) => {
        const locId = `loc-${idx}`;
        return calendarConnections.some(c => c.locationId === locId && c.isActive);
    });

    // For single location businesses
    if (locations.length === 1) {
        const loc = locations[0];
        const isBookable = bookableLocations.length === 1;
        return `\n\n**Location Information:**\nWe are located at: ${loc.name} - ${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}${!isBookable ? '\n⚠️ Note: Online booking not yet available at this location. Customer should call for appointments.' : ''}`;
    }

    // Show ALL locations for general location questions
    const allLocationsList = locations.map((loc, idx) => {
        const locId = `loc-${idx}`;
        const isBookable = calendarConnections.some(c => c.locationId === locId && c.isActive);
        return `${idx + 1}. **${loc.name}**${!isBookable ? ' _(call to book)_' : ''}\n   Address: ${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
    }).join('\n\n');

    // Show only BOOKABLE locations for appointment context
    const bookableLocationsList = bookableLocations.map((loc) => {
        const originalIndex = locations.indexOf(loc);
        return `${originalIndex + 1}. **${loc.name}**\n   Address: ${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
    }).join('\n\n');

    return `\n\n**Business Locations:**\n\nWe have ${locations.length} location${locations.length > 1 ? 's' : ''}:\n\n${allLocationsList}\n\n**IMPORTANT - LOCATION HANDLING**:\n\n📍 **When asked general location questions** (e.g., "where are you located?", "what locations do you have?"):\n- List ALL ${locations.length} locations above\n- This is for informational purposes\n\n📅 **When booking an appointment:**\n${bookableLocations.length === 0 ? '- Currently no locations have online booking enabled\n- Direct customer to call for appointments' : `- Only offer the ${bookableLocations.length} location${bookableLocations.length > 1 ? 's' : ''} with online booking enabled:\n\n${bookableLocationsList}\n\n- Ask which bookable location they prefer\n- If they mention an address, use find_closest_location tool to suggest the nearest BOOKABLE location\n- Once confirmed, use that location's location_id when checking availability`}\n\n**BOOKING FLOW FOR IN-PERSON APPOINTMENTS:**\n1. Customer asks to book → Ask which location they prefer from the BOOKABLE ones\n2. If they give an address → Use find_closest_location to suggest nearest bookable location\n3. They confirm location → Check availability with that location_id\n4. Show times → Book with location_id and location_name\n\n**For virtual/phone appointments:** Location selection not needed.`;
}

/**
 * Gemini tool declaration for finding closest location
 */
export const LOCATION_TOOL = {
    name: "find_closest_location",
    description: "Find the closest business location to a customer's address. Use this when the customer provides their address or zip code and wants to know which location is nearest to them.",
    parameters: {
        type: "object",
        properties: {
            customer_address: {
                type: "string",
                description: "The customer's address, zip code, or general location (e.g., '123 Main St, Springfield, IL', 'Downtown Chicago', '60601')"
            }
        },
        required: ["customer_address"]
    }
};

/**
 * Execute the find_closest_location tool
 */
export async function executeFindClosestLocation(
    args: { customer_address: string },
    locations: BusinessLocation[]
): Promise<{
    success: boolean;
    message: string;
    data?: {
        closestLocation: BusinessLocation & { index: number };
        distance: number;
        allLocations?: Array<{ location: BusinessLocation & { index: number }; distance: number }>;
    };
}> {
    const result = await findClosestLocation(args.customer_address, locations);

    if (!result) {
        return {
            success: false,
            message: "I couldn't determine which location is closest to that address. Could you choose from our locations listed above, or provide a more specific address?"
        };
    }

    const { location, distance, allDistances } = result;

    // Format all locations with distances for reference
    const locationList = allDistances.slice(0, 3).map((item, idx) => {
        const loc = item.location;
        return `${idx + 1}. ${loc.name} (${item.distance} miles away)\n   ${loc.address}, ${loc.city}, ${loc.state}`;
    }).join('\n\n');

    const message = `Based on "${args.customer_address}", the closest location to you is:\n\n**${location.name}** - About ${distance} miles away\n📍 ${location.address}, ${location.city}, ${location.state} ${location.zip}\n\n${allDistances.length > 1 ? `Other nearby locations:\n\n${locationList}\n\n` : ''}Would you like to book an appointment at ${location.name}?`;

    return {
        success: true,
        message,
        data: {
            closestLocation: location,
            distance,
            allLocations: allDistances
        }
    };
}
