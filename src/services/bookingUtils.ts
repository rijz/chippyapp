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
    let targetDate = new Date(now);
    let dateFound = false;

    // 1. Check for specific dates like "January 5" or "Jan 5"
    const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?/i);
    if (dateMatch) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthStr = dateMatch[0].split(' ')[0].substring(0, 3).toLowerCase();
        const monthIndex = months.indexOf(monthStr);
        const day = parseInt(dateMatch[1]);

        targetDate.setMonth(monthIndex);
        targetDate.setDate(day);

        // Handle year wrap-around (e.g. booking in Dec for Jan)
        if (targetDate < now && (now.getMonth() > monthIndex + 6)) {
            targetDate.setFullYear(now.getFullYear() + 1);
        }
        dateFound = true;
    }

    // 2. Check for relative days "Monday", "Tuesday", etc. IF specific date wasn't found
    if (!dateFound) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayMatch = text.match(/(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);

        if (dayMatch) {
            const targetDay = days.indexOf(dayMatch[1].toLowerCase());
            const currentDay = now.getDay();
            let daysToAdd = targetDay - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7; // Move to next instance
            // If "next Monday" usually means the one after the coming one, but mostly users mean "coming Monday".
            // Let's stick to "coming Monday".

            targetDate.setDate(now.getDate() + daysToAdd);
            dateFound = true;
        } else if (/tomorrow/i.test(text)) {
            targetDate.setDate(now.getDate() + 1);
            dateFound = true;
        } else if (/today/i.test(text)) {
            dateFound = true; // already set to now
        }
    }

    if (!dateFound) return undefined;

    // 3. Extract time (e.g. 10:00 AM, 5 PM)
    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)/i);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const isPM = timeMatch[3].toUpperCase() === 'PM';

        if (isPM && hours !== 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;

        targetDate.setHours(hours, minutes, 0, 0);
        return targetDate;
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
