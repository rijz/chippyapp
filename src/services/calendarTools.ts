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
            description: "Get available appointment time slots for a specific date range. Use this when the user asks about availability, open times, or when they can book.",
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
                    }
                },
                required: ["start_date"]
            }
        },
        {
            name: "book_appointment",
            description: "Book an appointment at a specific date and time. Use this when the user confirms they want to book a specific slot.",
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
        }
    ]
};

// Context passed to tool executors
export interface ToolContext {
    userId: string;
    timezone: string;
    companyName: string;
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
            return await getAvailableSlots(userId, args, timezone);

        case 'book_appointment':
            return await bookAppointment(userId, args, timezone, context.companyName);

        case 'cancel_appointment':
            return await cancelAppointment(userId, args);

        case 'reschedule_appointment':
            return await rescheduleAppointment(userId, args, timezone);

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
    timezone: string
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

                // Check availability via backend
                const response = await fetch('/api/calendar/availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        startTime: slotStart.toISOString(),
                        endTime: slotEnd.toISOString(),
                        provider: 'google'
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
    companyName: string
): Promise<ToolResult> {
    try {
        const startTime = new Date(args.datetime);
        const duration = args.duration_minutes || 60;
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

        const response = await fetch('/api/calendar/create-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                summary: `Appointment with ${args.customer_name}${args.service_type ? ` - ${args.service_type}` : ''}`,
                description: [
                    `Customer: ${args.customer_name}`,
                    `Email: ${args.customer_email}`,
                    args.customer_phone ? `Phone: ${args.customer_phone}` : '',
                    args.notes ? `Notes: ${args.notes}` : '',
                    '',
                    `Booked via ${companyName} AI Assistant`
                ].filter(Boolean).join('\n'),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                attendees: [args.customer_email],
                timezone,
                provider: 'google'
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

            return {
                success: true,
                data: {
                    message: `Appointment confirmed for ${confirmTime}`,
                    eventId: result.eventId,
                    eventLink: result.eventLink,
                    customerEmail: args.customer_email
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
