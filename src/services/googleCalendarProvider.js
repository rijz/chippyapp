/**
 * Google Calendar Provider
 * Handles Google Calendar API operations using stored credentials
 */

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
    process.env.VITE_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173'
);

/**
 * Check availability for a time slot using owner's calendar
 * @param {string} accessToken - Owner's access token
 * @param {string} calendarId - Calendar ID (usually 'primary')
 * @param {Date} startTime - Start time to check
 * @param {Date} endTime - End time to check
 * @returns {Promise<{available: boolean, conflicts: number, busySlots: Array}>}
 */
export async function checkGoogleAvailability(accessToken, calendarId, startTime, endTime) {
    try {
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: startTime.toISOString(),
                timeMax: endTime.toISOString(),
                items: [{ id: calendarId }]
            }
        });

        const busy = response.data.calendars?.[calendarId]?.busy || [];

        return {
            available: busy.length === 0,
            conflicts: busy.length,
            busySlots: busy.map(slot => ({
                start: slot.start,
                end: slot.end
            }))
        };
    } catch (error) {
        console.error('[Google Calendar] Availability check error:', error);
        throw new Error(`Failed to check availability: ${error.message}`);
    }
}

/**
 * Create a calendar event using owner's calendar
 * @param {string} accessToken - Owner's access token
 * @param {string} calendarId - Calendar ID
 * @param {Object} eventDetails - Event details
 * @returns {Promise<{success: boolean, eventId: string, eventLink: string}>}
 */
export async function createGoogleEvent(accessToken, calendarId, eventDetails) {
    try {
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const event = {
            summary: eventDetails.summary,
            description: eventDetails.description,
            start: {
                dateTime: eventDetails.startTime.toISOString(),
                timeZone: eventDetails.timezone || 'America/New_York'
            },
            end: {
                dateTime: eventDetails.endTime.toISOString(),
                timeZone: eventDetails.timezone || 'America/New_York'
            },
            attendees: eventDetails.attendees?.map(email => ({ email })) || []
        };

        const response = await calendar.events.insert({
            calendarId: calendarId,
            requestBody: event,
            sendUpdates: 'all' // Send email notifications
        });

        return {
            success: true,
            eventId: response.data.id,
            eventLink: response.data.htmlLink
        };
    } catch (error) {
        console.error('[Google Calendar] Event creation error:', error);
        throw new Error(`Failed to create event: ${error.message}`);
    }
}

/**
 * Refresh an expired access token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<{access_token: string, expires_at: Date}>}
 */
export async function refreshGoogleToken(refreshToken) {
    try {
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();

        return {
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null
        };
    } catch (error) {
        console.error('[Google Calendar] Token refresh error:', error);
        throw new Error('Failed to refresh token. User may need to reconnect.');
    }
}

/**
 * Get available time slots for a date range
 * @param {string} accessToken - Owner's access token
 * @param {string} calendarId - Calendar ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} slotDuration - Duration in minutes (default 60)
 * @param {Object} businessHours - Business hours {start: 9, end: 17}
 * @returns {Promise<Array<{start: Date, end: Date, available: boolean}>>}
 */
export async function getGoogleAvailableSlots(
    accessToken,
    calendarId,
    startDate,
    endDate,
    slotDuration = 60,
    businessHours = { start: 9, end: 17 }
) {
    try {
        // First, get all busy periods
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: startDate.toISOString(),
                timeMax: endDate.toISOString(),
                items: [{ id: calendarId }]
            }
        });

        const busyPeriods = response.data.calendars?.[calendarId]?.busy || [];

        // Generate potential slots
        const slots = [];
        const current = new Date(startDate);

        while (current < endDate) {
            const hour = current.getHours();

            // Only include business hours
            if (hour >= businessHours.start && hour < businessHours.end) {
                const slotEnd = new Date(current.getTime() + slotDuration * 60000);

                // Check if this slot conflicts with any busy period
                const hasConflict = busyPeriods.some(busy => {
                    const busyStart = new Date(busy.start);
                    const busyEnd = new Date(busy.end);
                    return current < busyEnd && slotEnd > busyStart;
                });

                if (!hasConflict && current > new Date()) { // Only future slots
                    slots.push({
                        start: new Date(current),
                        end: new Date(slotEnd),
                        available: true
                    });
                }
            }

            // Move to next slot
            current.setMinutes(current.getMinutes() + slotDuration);
        }

        return slots;
    } catch (error) {
        console.error('[Google Calendar] Slots fetch error:', error);
        throw new Error(`Failed to fetch available slots: ${error.message}`);
    }
}
