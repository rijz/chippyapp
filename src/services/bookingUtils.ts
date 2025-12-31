/**
 * Calendar Booking Utilities
 * 
 * Helper functions for creating calendar bookings from chat conversations
 */

import { providerRegistry, BookingDetails } from './calendarProviders';
import { isGoogleAuthenticated } from './calendarAuth';

export interface ParsedBookingIntent {
    hasIntent: boolean;
    datetime?: Date;
    duration?: number; // minutes
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
}

/**
 * Parse AI response for booking confirmation
 * Detects phrases like "I've booked you for...", "Your appointment is scheduled for..."
 */
export const parseBookingConfirmation = (aiResponse: string): ParsedBookingIntent => {
    const bookingPhrases = [
        /(?:booked you for|scheduled for|appointment (?:is )?(?:set|confirmed) for|reserved for)/i,
        /(?:confirmed|booked).*(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /(?:11\s*AM|11:00|11 o'clock)/i
    ];

    const hasIntent = bookingPhrases.some(pattern => pattern.test(aiResponse));

    if (!hasIntent) {
        return { hasIntent: false };
    }

    // Try to parse datetime from response
    // This is a simplified parser - in production, use a library like chrono-node
    const datetime = parseDateTimeFromText(aiResponse);

    return {
        hasIntent: true,
        datetime,
        duration: 60 // Default 1 hour
    };
};

/**
 * Simple datetime parser
 * TODO: Replace with proper NLP library like chrono-node for production
 */
const parseDateTimeFromText = (text: string): Date | undefined => {
    const now = new Date();

    // Check for "tomorrow"
    if (/tomorrow/i.test(text)) {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        // Extract time
        const timeMatch = text.match(/(\d{1,2})\s*(?::(\d{2}))?\s*(AM|PM)/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const isPM = timeMatch[3].toUpperCase() === 'PM';

            if (isPM && hours !== 12) hours += 12;
            if (!isPM && hours === 12) hours = 0;

            tomorrow.setHours(hours, minutes, 0, 0);
            return tomorrow;
        }
    }

    // Check for "today"
    if (/today/i.test(text)) {
        const today = new Date(now);

        const timeMatch = text.match(/(\d{1,2})\s*(?::(\d{2}))?\s*(AM|PM)/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const isPM = timeMatch[3].toUpperCase() === 'PM';

            if (isPM && hours !== 12) hours += 12;
            if (!isPM && hours === 12) hours = 0;

            today.setHours(hours, minutes, 0, 0);
            return today;
        }
    }

    return undefined;
};

/**
 * Create actual calendar booking
 */
export const createCalendarBooking = async (
    bookingIntent: ParsedBookingIntent,
    leadData: { name: string; email: string; phone?: string }
): Promise<{ success: boolean; bookingId?: string; error?: string }> => {
    if (!bookingIntent.datetime) {
        return { success: false, error: 'Could not parse booking date/time' };
    }

    // Check authentication before proceeding
    if (!isGoogleAuthenticated()) {
        return { success: false, error: 'AUTHENTICATION_REQUIRED' };
    }

    const provider = providerRegistry.getDefaultProvider();
    if (!provider) {
        return { success: false, error: 'No calendar provider available' };
    }

    const startTime = bookingIntent.datetime;
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (bookingIntent.duration || 60));

    const bookingDetails: BookingDetails = {
        customerName: bookingIntent.customerName || leadData.name,
        customerEmail: bookingIntent.customerEmail || leadData.email,
        customerPhone: bookingIntent.customerPhone || leadData.phone,
        startTime,
        endTime,
        description: 'Appointment booked via chat'
    };

    try {
        const result = await provider.createBooking(bookingDetails);
        return {
            success: result.success,
            bookingId: result.bookingId,
            error: result.error
        };
    } catch (err: any) {
        return {
            success: false,
            error: err.message || 'Failed to create booking'
        };
    }
};
