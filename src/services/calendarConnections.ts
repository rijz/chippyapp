/**
 * Calendar Connections Service
 * Manages multi-location calendar connections with plan limits enforcement
 */

import { supabase } from './supabaseClient';
import { CalendarConnection } from '../types';

/**
 * Fetch all calendar connections for a user
 */
export async function fetchCalendarConnections(userId: string): Promise<CalendarConnection[]> {
    try {
        const { data, error } = await supabase
            .from('calendar_connections')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error) {
            console.error('Error fetching calendar connections:', error);
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            provider: row.provider,
            providerEmail: row.provider_email,
            calendarId: row.calendar_id,
            locationId: row.location_id,
            locationName: row.location_name,
            calendarName: row.calendar_name,
            isActive: row.is_active,
            connectedAt: new Date(row.connected_at),
            lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
            appointmentDuration: row.metadata?.appointmentDuration || 30,
            metadata: row.metadata || {}
        }));
    } catch (err) {
        console.error('Failed to fetch calendar connections:', err);
        return [];
    }
}

/**
 * Create a new calendar connection
 */
export async function createCalendarConnection(
    userId: string,
    connection: Omit<CalendarConnection, 'id' | 'connectedAt' | 'lastUsedAt'>
): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { data, error } = await supabase
            .from('calendar_connections')
            .insert({
                user_id: userId,
                provider: connection.provider,
                provider_email: connection.providerEmail,
                calendar_id: connection.calendarId,
                location_id: connection.locationId,
                location_name: connection.locationName,
                calendar_name: connection.calendarName,
                is_active: connection.isActive,
                metadata: {
                    appointmentDuration: connection.appointmentDuration,
                    ...connection.metadata
                }
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating calendar connection:', error);
            return { success: false, error: error.message };
        }

        return { success: true, id: data.id };
    } catch (err: any) {
        console.error('Failed to create calendar connection:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Update a calendar connection
 */
export async function updateCalendarConnection(
    connectionId: string,
    updates: Partial<Omit<CalendarConnection, 'id' | 'connectedAt'>>
): Promise<{ success: boolean; error?: string }> {
    try {
        const updateData: any = {};

        if (updates.locationId !== undefined) updateData.location_id = updates.locationId;
        if (updates.locationName !== undefined) updateData.location_name = updates.locationName;
        if (updates.calendarName !== undefined) updateData.calendar_name = updates.calendarName;
        if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
        if (updates.appointmentDuration !== undefined || updates.metadata !== undefined) {
            updateData.metadata = {
                appointmentDuration: updates.appointmentDuration,
                ...updates.metadata
            };
        }

        const { error } = await supabase
            .from('calendar_connections')
            .update(updateData)
            .eq('id', connectionId);

        if (error) {
            console.error('Error updating calendar connection:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err: any) {
        console.error('Failed to update calendar connection:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Delete a calendar connection
 */
export async function deleteCalendarConnection(
    connectionId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('calendar_connections')
            .delete()
            .eq('id', connectionId);

        if (error) {
            console.error('Error deleting calendar connection:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err: any) {
        console.error('Failed to delete calendar connection:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get active calendar count for a user
 */
export async function getActiveCalendarCount(userId: string): Promise<number> {
    try {
        const { count, error } = await supabase
            .from('calendar_connections')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) {
            console.error('Error counting calendars:', error);
            return 0;
        }

        return count || 0;
    } catch (err) {
        console.error('Failed to count calendars:', err);
        return 0;
    }
}

/**
 * Check if user can add more calendars based on their plan
 */
export async function canAddCalendar(
    userId: string,
    planLimits: { calendars: number }
): Promise<{ allowed: boolean; current: number; limit: number }> {
    const current = await getActiveCalendarCount(userId);
    const allowed = current < planLimits.calendars;

    return {
        allowed,
        current,
        limit: planLimits.calendars
    };
}
