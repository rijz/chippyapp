/**
 * Calendar Provider Abstraction Layer
 * 
 * Supports multiple calendar providers (Google Calendar, Calendly, Cal.com, etc.)
 * with a unified interface.
 */

// Type declaration for gapi (Google API client)
declare const gapi: any;

export interface BookingDetails {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    startTime: Date;
    endTime: Date;
    description?: string;
    timezone?: string;
}

export interface BookingResult {
    success: boolean;
    bookingId: string;
    confirmationUrl?: string;
    provider: string;
    error?: string;
}

export interface CalendarProvider {
    name: 'google' | 'calendly' | 'cal.com';

    /**
     * Check if a time slot is available
     */
    checkAvailability(startTime: Date, endTime: Date): Promise<{ available: boolean; conflicts: number }>;

    /**
     * Create a booking/calendar event
     */
    createBooking(details: BookingDetails): Promise<BookingResult>;

    /**
     * Cancel a booking
     */
    cancelBooking(bookingId: string): Promise<{ success: boolean }>;
}

/**
 * Google Calendar Provider Implementation
 */
export class GoogleCalendarProvider implements CalendarProvider {
    name: 'google' = 'google';
    private calendarId: string;

    constructor(calendarId: string = 'primary') {
        this.calendarId = calendarId;
    }

    async checkAvailability(startTime: Date, endTime: Date): Promise<{ available: boolean; conflicts: number }> {
        // This should use the existing checkAvailability from calendarAuth.ts
        // For now, we'll assume it's available if we're calling this
        try {
            const response = await gapi.client.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: startTime.toISOString(),
                timeMax: endTime.toISOString(),
                showDeleted: false,
                singleEvents: true,
                maxResults: 10,
                orderBy: 'startTime'
            });

            const events = response.result.items || [];
            return {
                available: events.length === 0,
                conflicts: events.length
            };
        } catch (err) {
            console.error('Error checking availability:', err);
            return { available: true, conflicts: 0 }; // Fail safe
        }
    }

    async createBooking(details: BookingDetails): Promise<BookingResult> {
        // Check if user is authenticated with Google
        if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.getToken()) {
            return {
                success: false,
                bookingId: '',
                provider: 'google',
                error: 'AUTHENTICATION_REQUIRED'
            };
        }

        try {
            const event = {
                summary: `Appointment with ${details.customerName}`,
                description: details.description || `Booking for ${details.customerName}\nEmail: ${details.customerEmail}${details.customerPhone ? `\nPhone: ${details.customerPhone}` : ''}`,
                start: {
                    dateTime: details.startTime.toISOString(),
                    timeZone: details.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: details.endTime.toISOString(),
                    timeZone: details.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                attendees: [
                    { email: details.customerEmail }
                ],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 1 day before
                        { method: 'popup', minutes: 30 },
                    ],
                },
                sendUpdates: 'all', // Send email invitation
            };

            const response = await gapi.client.calendar.events.insert({
                calendarId: this.calendarId,
                resource: event,
                sendUpdates: 'all'
            });

            const eventId = response.result.id;
            const confirmationUrl = response.result.htmlLink;

            return {
                success: true,
                bookingId: eventId!,
                confirmationUrl,
                provider: 'google'
            };
        } catch (err: any) {
            console.error('Error creating booking:', err);
            return {
                success: false,
                bookingId: '',
                provider: 'google',
                error: err.message || 'Failed to create booking'
            };
        }
    }

    async cancelBooking(bookingId: string): Promise<{ success: boolean }> {
        try {
            await gapi.client.calendar.events.delete({
                calendarId: this.calendarId,
                eventId: bookingId,
                sendUpdates: 'all'
            });

            return { success: true };
        } catch (err) {
            console.error('Error canceling booking:', err);
            return { success: false };
        }
    }
}

/**
 * Provider Registry
 * Manages available calendar providers
 */
export class CalendarProviderRegistry {
    private providers: Map<string, CalendarProvider> = new Map();

    registerProvider(provider: CalendarProvider) {
        this.providers.set(provider.name, provider);
    }

    getProvider(name: string): CalendarProvider | undefined {
        return this.providers.get(name);
    }

    getDefaultProvider(): CalendarProvider | undefined {
        // Return Google Calendar as default for now
        return this.providers.get('google');
    }
}

// Global registry instance
export const providerRegistry = new CalendarProviderRegistry();

// Register Google Calendar provider by default
if (typeof window !== 'undefined' && (window as any).gapi) {
    providerRegistry.registerProvider(new GoogleCalendarProvider());
}
