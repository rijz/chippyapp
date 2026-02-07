/**
 * Calendar Tools for Gemini Function Calling
 * 
 * Defines tools that the AI can invoke to interact with the calendar system.
 * Uses structured parameters instead of regex-based text parsing.
 */

import { TenantConfig } from '../types';

// Tool definitions in Gemini's expected format
export const CALENDAR_TOOLS = {
    functionDeclarations: [
        {
            name: "get_available_slots",
            description: "Get available appointment time slots for a specific date range and location. Use this when the user asks about availability, open times, or when they can book. For multi-location businesses, ALWAYS specify the location_id.",
            parameters: {
                type: "object",
                properties: {
                    start_date: {
                        type: "string",
                        description: "Start date in YYYY-MM-DD format (e.g., 2026-01-05)"
                    },
                    end_date: {
                        type: "string",
                        description: "End date in YYYY-MM-DD format. Defaults to start_date if checking a single day."
                    },
                    duration_minutes: {
                        type: "number",
                        description: "Appointment duration in minutes. Default is 30."
                    },
                    location_id: {
                        type: "string",
                        description: "Location ID (e.g., 'loc-0', 'loc-1'). Required for multi-location businesses. Check available locations first."
                    }
                },
                required: ["start_date"]
            }
        },
        {
            name: "book_appointment",
            description: "Book an appointment at a specific date, time, and location. Use this when the user confirms they want to book a specific slot. For multi-location businesses, location_id is REQUIRED.",
            parameters: {
                type: "object",
                properties: {
                    datetime: {
                        type: "string",
                        description: "ISO 8601 datetime string for the appointment start (e.g., 2026-01-05T10:00:00)"
                    },
                    duration_minutes: {
                        type: "number",
                        description: "Appointment duration in minutes. Default is 60."
                    },
                    customer_name: {
                        type: "string",
                        description: "Full name of the customer"
                    },
                    customer_email: {
                        type: "string",
                        description: "Email address of the customer"
                    },
                    customer_phone: {
                        type: "string",
                        description: "Phone number of the customer (optional)"
                    },
                    service_type: {
                        type: "string",
                        description: "Type of service or appointment (optional)"
                    },
                    notes: {
                        type: "string",
                        description: "Additional notes for the appointment (optional)"
                    },
                    location_id: {
                        type: "string",
                        description: "Location ID where appointment should be booked (e.g., 'loc-0'). Required for multi-location businesses."
                    },
                    location_name: {
                        type: "string",
                        description: "Name of the location for confirmation (e.g., 'Downtown Office')"
                    }
                },
                required: ["datetime", "customer_name", "customer_email"]
            }
        },
        {
            name: "cancel_appointment",
            description: "Cancel an existing appointment. Use when the user wants to cancel their booking.",
            parameters: {
                type: "object",
                properties: {
                    appointment_id: {
                        type: "string",
                        description: "The unique ID of the appointment to cancel"
                    },
                    customer_email: {
                        type: "string",
                        description: "Email of the customer (used to verify ownership if ID unknown)"
                    },
                    reason: {
                        type: "string",
                        description: "Reason for cancellation (optional)"
                    }
                },
                required: ["customer_email"]
            }
        },
        {
            name: "reschedule_appointment",
            description: "Reschedule an existing appointment to a new date/time.",
            parameters: {
                type: "object",
                properties: {
                    appointment_id: {
                        type: "string",
                        description: "The unique ID of the appointment to reschedule"
                    },
                    customer_email: {
                        type: "string",
                        description: "Email of the customer"
                    },
                    new_datetime: {
                        type: "string",
                        description: "New ISO 8601 datetime for the appointment"
                    }
                },
                required: ["customer_email", "new_datetime"]
            }
        },
        {
            name: "request_callback",
            description: "Request a callback from the business. Use this when the user wants someone to call them back instead of booking an appointment directly. Collect phone number and name (required), email (optional), and the purpose/service they need help with.",
            parameters: {
                type: "object",
                properties: {
                    customer_name: {
                        type: "string",
                        description: "Full name of the customer (required)"
                    },
                    customer_phone: {
                        type: "string",
                        description: "Phone number to call back (required)"
                    },
                    customer_email: {
                        type: "string",
                        description: "Email address of the customer (optional but recommended)"
                    },
                    service: {
                        type: "string",
                        description: "The service they are interested in (if mentioned during chat)"
                    },
                    purpose: {
                        type: "string",
                        description: "The purpose or reason for the callback request"
                    },
                    preferred_time: {
                        type: "string",
                        description: "Preferred time description (e.g., 'morning', 'afternoon', 'evening', 'anytime')"
                    },
                    requested_datetime: {
                        type: "string",
                        description: "Specific date and time for callback in ISO 8601 format (e.g., '2026-01-09T14:00:00'). Ask the user for a specific date/time if they prefer."
                    }
                },
                required: ["customer_name", "customer_phone"]
            }
        }
    ]
};

// Context passed to tool executors
export interface ToolContext {
    userId: string;
    timezone: string;
    companyName: string;
    onCallbackRequest?: (data: CallbackRequestData) => void;
    businessHours?: string | null;
    businessHoursByDay?: Record<string, string> | null;
    calendarConnections?: Array<{
        id: string;
        locationId?: string;
        locationName?: string;
        providerEmail: string;
        calendarId: string;
        isActive: boolean;
    }>;
    locations?: Array<{
        name: string;
        address: string;
        city: string;
        state: string;
        zip: string;
    }>;
}

// Callback request data structure
export interface CallbackRequestData {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    service?: string;
    purpose?: string;
    preferredTime?: string;
    requestedDateTime?: string; // ISO 8601 datetime string
}

// Tool execution results
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

/**
 * Execute a calendar tool by name with given arguments
 */
export async function executeCalendarTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolContext
): Promise<ToolResult> {
    const { userId, timezone } = context;

    switch (toolName) {
        case 'get_available_slots':
            return await getAvailableSlots(userId, args, timezone, context);

        case 'book_appointment':
            return await bookAppointment(userId, args, timezone, context.companyName, context);

        case 'cancel_appointment':
            return await cancelAppointment(userId, args);

        case 'reschedule_appointment':
            return await rescheduleAppointment(userId, args, timezone);

        case 'request_callback':
            return await requestCallback(args, context);

        default:
            return { success: false, error: `Unknown tool: ${toolName}` };
    }
}

/**
 * Get available time slots
 */
async function getAvailableSlots(
    userId: string,
    args: any,
    timezone: string,
    context?: ToolContext
): Promise<ToolResult> {
    try {
        // Parse date string as local date (avoid UTC interpretation)
        // Input format: "2026-01-03" -> should be Jan 3 in local time
        const parseLocalDate = (dateStr: string): Date => {
            const parts = dateStr.split('-');
            return new Date(
                parseInt(parts[0]),      // year
                parseInt(parts[1]) - 1,  // month (0-indexed)
                parseInt(parts[2])       // day
            );
        };

        const startDate = parseLocalDate(args.start_date);
        const endDate = args.end_date ? parseLocalDate(args.end_date) : new Date(startDate);

        // Generate time slots for the date range
        const slots: string[] = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            // Check each hour slot from 9am to 5pm
            for (let hour = 9; hour < 17; hour++) {
                const slotStart = new Date(currentDate);
                slotStart.setHours(hour, 0, 0, 0);

                // Skip slots in the past
                if (slotStart < new Date()) continue;

                const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

                // Find target calendar for location (if specified)
                let calendarInfo = {};
                if (args.location_id && context?.calendarConnections) {
                    const targetCalendar = context.calendarConnections.find(
                        c => c.locationId === args.location_id && c.isActive
                    );
                    if (targetCalendar) {
                        calendarInfo = {
                            calendarId: targetCalendar.calendarId,
                            providerEmail: targetCalendar.providerEmail
                        };
                    }
                }

                // Check availability via backend
                const response = await fetch('/api/calendar/availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        startTime: slotStart.toISOString(),
                        endTime: slotEnd.toISOString(),
                        provider: 'google',
                        locationId: args.location_id,
                        ...calendarInfo
                    })
                });

                const result = await response.json();

                if (result.available) {
                    const timeStr = slotStart.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });
                    const dayStr = slotStart.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric'
                    });
                    slots.push(`${dayStr} at ${timeStr}`);
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (slots.length === 0) {
            return {
                success: true,
                data: {
                    message: "No available slots found for the requested dates.",
                    slots: []
                }
            };
        }

        return {
            success: true,
            data: {
                message: `Found ${slots.length} available slots`,
                slots: slots.slice(0, 10) // Limit to 10 for readability
            }
        };

    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to check availability' };
    }
}

/**
 * Book an appointment
 */
async function bookAppointment(
    userId: string,
    args: any,
    timezone: string,
    companyName: string,
    context?: ToolContext
): Promise<ToolResult> {
    try {
        const startTime = new Date(args.datetime);
        const duration = args.duration_minutes || 60;
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

        // Find the calendar connection for this location (if specified)
        let targetCalendar = null;
        if (args.location_id && context?.calendarConnections) {
            targetCalendar = context.calendarConnections.find(
                c => c.locationId === args.location_id && c.isActive
            );

            if (!targetCalendar) {
                return {
                    success: false,
                    error: `No calendar configured for ${args.location_name || 'that location'}. Please contact support.`
                };
            }
        }

        const response = await fetch('/api/calendar/create-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                summary: `Appointment with ${args.customer_name}${args.service_type ? ` - ${args.service_type}` : ''}`,
                description: [
                    `Name: ${args.customer_name}`,
                    `Email: ${args.customer_email}`,
                    args.customer_phone ? `Phone: ${args.customer_phone}` : '',
                    args.location_name ? `Location: ${args.location_name}` : '',
                    args.notes ? `Notes: ${args.notes}` : '',
                    '',
                    `Booked via ${companyName} AI Assistant`
                ].filter(Boolean).join('\n'),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                attendees: [args.customer_email],
                timezone,
                provider: 'google',
                // Location-specific routing
                locationId: args.location_id,
                locationName: args.location_name,
                calendarId: targetCalendar?.calendarId,
                providerEmail: targetCalendar?.providerEmail,
                customerName: args.customer_name,
                customerEmail: args.customer_email,
                customerPhone: args.customer_phone,
                serviceType: args.service_type || undefined
            })
        });

        const result = await response.json();

        if (result.success) {
            const confirmTime = startTime.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: timezone
            });

            let confirmMessage = `Appointment confirmed for ${confirmTime}`;
            if (args.location_name) {
                confirmMessage += ` at ${args.location_name}`;
            }

            return {
                success: true,
                data: {
                    message: confirmMessage,
                    eventId: result.eventId,
                    eventLink: result.eventLink,
                    customerEmail: args.customer_email,
                    locationId: args.location_id,
                    locationName: args.location_name
                }
            };
        } else {
            return { success: false, error: result.error || 'Failed to create booking' };
        }

    } catch (error: any) {
        return { success: false, error: error.message || 'Booking request failed' };
    }
}

/**
 * Cancel an appointment
 */
async function cancelAppointment(
    userId: string,
    args: any
): Promise<ToolResult> {
    try {
        const response = await fetch('/api/calendar/cancel-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                eventId: args.appointment_id,
                customerEmail: args.customer_email,
                reason: args.reason,
                provider: 'google'
            })
        });

        const result = await response.json();

        if (result.success) {
            return {
                success: true,
                data: { message: 'Appointment has been cancelled successfully.' }
            };
        } else {
            return { success: false, error: result.error || 'Failed to cancel appointment' };
        }

    } catch (error: any) {
        return { success: false, error: error.message || 'Cancellation request failed' };
    }
}

/**
 * Reschedule an appointment
 */
async function rescheduleAppointment(
    userId: string,
    args: any,
    timezone: string
): Promise<ToolResult> {
    try {
        const newTime = new Date(args.new_datetime);

        const response = await fetch('/api/calendar/reschedule-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                eventId: args.appointment_id,
                customerEmail: args.customer_email,
                newStartTime: newTime.toISOString(),
                provider: 'google'
            })
        });

        const result = await response.json();

        if (result.success) {
            const confirmTime = newTime.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: timezone
            });

            return {
                success: true,
                data: { message: `Appointment rescheduled to ${confirmTime}` }
            };
        } else {
            return { success: false, error: result.error || 'Failed to reschedule' };
        }

    } catch (error: any) {
        return { success: false, error: error.message || 'Reschedule request failed' };
    }
}

/**
 * Request a callback from the business
 */
async function requestCallback(
    args: any,
    context: ToolContext
): Promise<ToolResult> {
    try {
        if (args.requested_datetime && context.businessHoursByDay) {
            const requestedAt = new Date(args.requested_datetime);
            const hoursForDay = getBusinessHoursForDate(requestedAt, context.businessHoursByDay);
            if (!hoursForDay) {
                return {
                    success: false,
                    error: `Requested time is outside business hours. Please ask the user to choose a time during business hours.`
                };
            }
            if (!isWithinBusinessHours(requestedAt, hoursForDay)) {
                return {
                    success: false,
                    error: `Requested time is outside business hours (${hoursForDay}). Please ask the user to choose a time within business hours.`
                };
            }
        }

        const response = await fetch('/api/callback/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: context.userId,
                customer_name: args.customer_name,
                customer_phone: args.customer_phone,
                customer_email: args.customer_email,
                service: args.service,
                purpose: args.purpose,
                preferred_time: args.preferred_time,
                requested_datetime: args.requested_datetime
            })
        });

        if (!response.ok) {
            const error = await response.json();
            return { success: false, error: error?.error || 'Callback request failed' };
        }

        await response.json();

        const callbackData: CallbackRequestData = {
            customerName: args.customer_name,
            customerPhone: args.customer_phone,
            customerEmail: args.customer_email,
            service: args.service,
            purpose: args.purpose,
            preferredTime: args.preferred_time,
            requestedDateTime: args.requested_datetime
        };

        // Call the callback handler if provided
        if (context.onCallbackRequest) {
            context.onCallbackRequest(callbackData);
        }

        // Build confirmation message
        let confirmMessage = `Callback request submitted for ${args.customer_name}. `;
        confirmMessage += `We will call you at ${args.customer_phone}`;

        if (args.requested_datetime) {
            const callbackDate = new Date(args.requested_datetime);
            confirmMessage += ` on ${callbackDate.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            })}`;
        } else if (args.preferred_time) {
            confirmMessage += ` (${args.preferred_time})`;
        }
        confirmMessage += '. ';

        if (args.service) {
            confirmMessage += `Regarding: ${args.service}. `;
        }

        confirmMessage += `Thank you for reaching out to ${context.companyName}!`;

        return {
            success: true,
            data: {
                message: confirmMessage,
                callbackData
            }
        };

    } catch (error: any) {
        return { success: false, error: error.message || 'Callback request failed' };
    }
}

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getBusinessHoursForDate(date: Date, hoursByDay: Record<string, string>): string | null {
    const key = DAY_KEYS[date.getDay()];
    const value = hoursByDay[key] || hoursByDay[key.toLowerCase()] || hoursByDay[key.toUpperCase()];
    if (!value) return null;
    if (value.toLowerCase().includes('closed')) return null;
    return value;
}

function isWithinBusinessHours(date: Date, hoursText: string): boolean {
    const range = parseHoursRange(hoursText);
    if (!range) return true; // If we can't parse, don't block.

    const minutes = date.getHours() * 60 + date.getMinutes();
    if (range.start <= range.end) {
        return minutes >= range.start && minutes <= range.end;
    }
    // Overnight ranges (e.g., 10pm-2am)
    return minutes >= range.start || minutes <= range.end;
}

function parseHoursRange(input: string): { start: number; end: number } | null {
    const normalized = input
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[–—]/g, '-')
        .replace(' to ', ' - ')
        .trim();

    const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return null;

    const startHour = parseInt(match[1], 10);
    const startMin = match[2] ? parseInt(match[2], 10) : 0;
    const startMeridiem = match[3] || '';

    const endHour = parseInt(match[4], 10);
    const endMin = match[5] ? parseInt(match[5], 10) : 0;
    const endMeridiem = match[6] || startMeridiem;

    const start = toMinutes(startHour, startMin, startMeridiem);
    const end = toMinutes(endHour, endMin, endMeridiem);

    if (start === null || end === null) return null;
    return { start, end };
}

function toMinutes(hour: number, minute: number, meridiem: string): number | null {
    if (!meridiem) {
        if (hour > 23) return null;
        return hour * 60 + minute;
    }
    const isPm = meridiem.toLowerCase() === 'pm';
    let h = hour % 12;
    if (isPm) h += 12;
    return h * 60 + minute;
}
