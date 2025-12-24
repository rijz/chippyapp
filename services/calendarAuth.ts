
import { CalendarItem } from "../types";

/**
 * GOOGLE CALENDAR AUTHENTICATION SERVICE
 * 
 * Uses Google Identity Services (GIS) for OAuth2 and GAPI for Calendar API calls.
 */

declare var gapi: any;
declare var google: any;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const API_KEY = process.env.GOOGLE_API_KEY || '';

// Scopes required: Read/Write events, Read Calendar Lists
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

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

// --- 4. Trigger Sign In ---
export const handleAuthClick = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        // If not initialized, try one more time before failing
        if (!tokenClient || !gapiInited) {
            console.error("Google Auth not fully initialized.");
            if (!CLIENT_ID || !API_KEY) {
                alert("Integration Error: Google Client ID or API Key is missing from the environment. Please configure GOOGLE_CLIENT_ID and GOOGLE_API_KEY.");
            } else {
                alert("Auth system is still loading. Please wait a moment and try again.");
            }
            reject(new Error("Auth not initialized"));
            return;
        }

        tokenClient.callback = async (resp: any) => {
            if (resp.error) {
                console.error("Auth Error:", resp);
                reject(resp);
                return;
            }

            try {
                const response = await gapi.client.calendar.calendarList.list();
                const primaryCal = response.result.items.find((c: any) => c.primary);
                const email = primaryCal ? primaryCal.id : "Authenticated User";
                resolve(email);
            } catch (error) {
                console.error("Error fetching profile", error);
                resolve("Google User"); 
            }
        };

        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

// --- 5. Fetch Real Calendars ---
export const fetchCalendars = async (): Promise<CalendarItem[]> => {
    if (!gapiInited || !gapi.client.getToken()) {
        return [];
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
