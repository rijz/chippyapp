
import { CalendarItem } from "../types";
import { getEnv } from "../utils/env";

/**
 * GOOGLE CALENDAR AUTHENTICATION SERVICE
 * 
 * Uses Google Identity Services (GIS) for OAuth2 and GAPI for Calendar API calls.
 */

declare var gapi: any;
declare var google: any;

const CLIENT_ID = getEnv('VITE_GOOGLE_CLIENT_ID');
const API_KEY = getEnv('VITE_GOOGLE_API_KEY');

// Scopes required: Read/Write events, Read Calendar Lists, User Email
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// --- 1. Load the Scripts Dynamically ---
export const loadGoogleScripts = () => {
    if (typeof window === 'undefined') return;
    if (document.getElementById('gapi-script')) return;

    const script1 = document.createElement('script');
    script1.src = "https://apis.google.com/js/api.js";
    script1.id = "gapi-script";
    script1.async = true;
    script1.defer = true;
    script1.onload = () => {
        gapiInited = true;
        maybeInitialize();
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = "https://accounts.google.com/gsi/client";
    script2.id = "gsi-script";
    script2.async = true;
    script2.defer = true;
    script2.onload = () => {
        gisInited = true;
        maybeInitialize();
    };
    document.body.appendChild(script2);
};

async function maybeInitialize() {
    if (gapiInited && gisInited) {
        await initializeGapiClient();
        initializeTokenClient();
    }
}

// --- 2. Initialize GAPI Client (for API calls) ---
async function initializeGapiClient() {
    if (!API_KEY) {
        console.warn("Google API Key is missing. Check your environment variables.");
        return;
    }

    return new Promise<void>((resolve) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
                });
                resolve();
            } catch (error) {
                console.error("Error initializing GAPI client", error);
                resolve();
            }
        });
    });
}

// --- 3. Initialize Token Client (for Auth) ---
function initializeTokenClient() {
    if (!CLIENT_ID) {
        console.warn("Google Client ID is missing. Check your environment variables.");
        return;
    }

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // Defined dynamically in handleAuthClick
        });
    } catch (error) {
        console.error("Error initializing Token Client", error);
    }
}

// --- 4. Trigger Sign In (Code Flow for Backend) ---
// Using redirect flow instead of popup for better reliability
export const handleAuthClick = (): Promise<{ code: string }> => {
    return new Promise((resolve, reject) => {

        // MOCK MODE
        if (!CLIENT_ID || !API_KEY) {
            console.warn("[Google Auth] Credentials missing! Using MOCK MODE. This will NOT work in production.");
            console.warn("[Google Auth] Make sure VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY are set during build.");
            setTimeout(() => {
                resolve({ code: "mock_auth_code" });
            }, 1000);
            return;
        }

        if (!google || !google.accounts || !google.accounts.oauth2) {
            console.error("[Google Auth] Google Auth not fully initialized.");
            alert("Auth system is still loading. Please wait a moment and try again.");
            reject(new Error("Auth not initialized"));
            return;
        }



        // Save state to know we're in the middle of OAuth when we return
        localStorage.setItem('oauth_pending', 'true');
        localStorage.setItem('oauth_return_path', window.location.pathname);

        const codeClient = google.accounts.oauth2.initCodeClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            ux_mode: 'redirect',
            redirect_uri: window.location.origin + '/integrations',
            state: 'calendar_connect',
        });

        // This will redirect the page - the promise won't resolve here
        // The code will be handled when the user returns
        codeClient.requestCode();

        // This reject is just to prevent the promise from hanging
        // In reality, the page will redirect before this runs
        setTimeout(() => {
            reject(new Error('Redirecting to Google...'));
        }, 5000);
    });
};

// Handle OAuth redirect callback - call this on app initialization
export const handleOAuthRedirect = (): { code: string } | null => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    // Check if we have an OAuth response in the URL
    if (error) {
        console.error('[Google Auth] OAuth error:', error);
        localStorage.removeItem('oauth_pending');
        localStorage.removeItem('oauth_return_path');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return null;
    }

    if (code && state === 'calendar_connect') {

        localStorage.removeItem('oauth_pending');
        localStorage.removeItem('oauth_return_path');
        // Clean up the URL to remove the code
        window.history.replaceState({}, document.title, window.location.pathname);
        return { code };
    }

    return null;
};

// --- 5. Fetch Real Calendars ---
export const fetchCalendars = async (): Promise<CalendarItem[]> => {
    // MOCK MODE
    if (!CLIENT_ID || !API_KEY) {
        return [
            { id: 'primary', name: 'demo@chippy.ai', color: '#4285F4', selected: true },
            { id: 'personal', name: 'Personal', color: '#34A853', selected: false },
            { id: 'work', name: 'Work', color: '#EA4335', selected: true }
        ];
    }

    if (!gapiInited || !gapi.client.getToken()) {
        throw new Error('Google Calendar API is not initialized or user is not authenticated');
    }

    // Ensure the calendar API is loaded
    if (!gapi.client.calendar) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Give it a second

        // If still not loaded, try to reinitialize
        if (!gapi.client.calendar) {
            await initializeGapiClient();
        }

        // Final check
        if (!gapi.client.calendar) {
            throw new Error('Failed to load Google Calendar API');
        }
    }

    try {
        const response = await gapi.client.calendar.calendarList.list();
        return response.result.items.map((item: any) => ({
            id: item.id,
            name: item.summaryOverride || item.summary,
            color: item.backgroundColor || '#4285F4',
            selected: item.primary
        }));
    } catch (err) {
        console.error("Error fetching calendars", err);
        throw err;
    }
};

// --- 6. Sign Out / Revoke Access ---
export const handleSignOut = () => {
    // MOCK MODE: Just return
    if (!CLIENT_ID || !API_KEY) return;

    if (typeof gapi !== 'undefined' && gapi.client) {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token, () => { });
            gapi.client.setToken(null);
        }
    }
};

// --- 7. Check if User is Authenticated ---
export const isGoogleAuthenticated = (): boolean => {
    // MOCK MODE: Always return true in mock mode
    if (!CLIENT_ID || !API_KEY) {
        return true; // Mock mode doesn't require auth
    }

    if (typeof gapi === 'undefined' || !gapi.client) {
        return false;
    }

    const token = gapi.client.getToken();
    return token !== null && token !== undefined;
};

// --- 8. Check Availability (Check for Conflicts) ---
export const checkAvailability = async (startTime: Date, endTime: Date): Promise<{ available: boolean; conflicts: number }> => {
    // MOCK MODE
    if (!CLIENT_ID || !API_KEY) {
        // Randomly simulate conflict for demo if hour is 10:00 AM
        if (startTime.getHours() === 10) {
            return { available: false, conflicts: 1 };
        }
        return { available: true, conflicts: 0 };
    }

    if (!gapiInited || !gapi.client.getToken()) {
        console.warn("GAPI not initialized or not signed in.");
        return { available: true, conflicts: 0 }; // Assume available if we can't check
    }

    try {
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': startTime.toISOString(),
            'timeMax': endTime.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 10,
            'orderBy': 'startTime'
        });

        const events = response.result.items;
        return {
            available: events.length === 0,
            conflicts: events.length
        };
    } catch (err) {
        console.error("Error checking availability", err);
        return { available: true, conflicts: 0 }; // Fail safe
    }
};

// --- 9. Get Available Time Slots for a Date ---
export interface TimeSlot {
    time: string;
    datetime: Date;
    available: boolean;
}

export const getAvailableSlots = async (
    date: Date,
    durationMinutes: number = 30,
    startHour: number = 9,
    endHour: number = 17
): Promise<TimeSlot[]> => {
    const slots: TimeSlot[] = [];

    // Generate all possible slots for the day
    for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += durationMinutes) {
            const slotTime = new Date(date);
            slotTime.setHours(hour, min, 0, 0);

            // Skip if slot is in the past
            if (slotTime < new Date()) continue;

            const timeString = slotTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            slots.push({
                time: timeString,
                datetime: slotTime,
                available: true // Will be updated below
            });
        }
    }

    // MOCK MODE - return all slots as available
    if (!CLIENT_ID || !API_KEY) {
        return slots;
    }

    // If not signed in, return all slots but mark as unverified
    if (!gapiInited || !gapi.client.getToken()) {
        console.warn("GAPI not initialized or not signed in - returning demo slots");
        return slots;
    }

    // Check each slot for conflicts using freebusy query
    try {
        const dayStart = new Date(date);
        dayStart.setHours(startHour, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(endHour, 0, 0, 0);

        const response = await gapi.client.calendar.freebusy.query({
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            items: [{ id: 'primary' }]
        });

        const busyPeriods = response.result.calendars?.primary?.busy || [];

        // Mark slots that overlap with busy periods as unavailable
        return slots.map(slot => {
            const slotEnd = new Date(slot.datetime);
            slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

            const isConflict = busyPeriods.some((busy: { start: string; end: string }) => {
                const busyStart = new Date(busy.start);
                const busyEnd = new Date(busy.end);
                // Check if slot overlaps with busy period
                return slot.datetime < busyEnd && slotEnd > busyStart;
            });

            return { ...slot, available: !isConflict };
        });
    } catch (err) {
        console.error("Error fetching freebusy", err);
        // Return mock slots on error
        return slots;
    }
};
