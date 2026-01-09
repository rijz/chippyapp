/**
 * Multi-Location Calendar Manager Component
 * Allows users to connect multiple calendars and assign them to different locations
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Plus, MapPin, Edit2, Trash2, Check, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CalendarConnection, BusinessLocation, PLAN_DETAILS } from '../types';
import {
    createCalendarConnection,
    updateCalendarConnection,
    deleteCalendarConnection
} from '../services/calendarConnections';
import { handleAuthClick } from '../services/calendarAuth';
import { supabase } from '../services/supabaseClient';

export const MultiLocationCalendarManager: React.FC = () => {
    const {
        calendarConnections,
        setCalendarConnections,
        knowledgeData,
        subscription,
        canAddMoreCalendars,

        refreshData,
        calendarSettings,
        setCalendarSettings
    } = useData();
    const { session } = useAuth();
    const { showToast } = useToast();
    const userId = session?.user?.id || '';

    const [isConnecting, setIsConnecting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<CalendarConnection>>({});

    const locations = knowledgeData?.locations || [];
    const planDetails = PLAN_DETAILS[subscription.plan];

    const handleConnectNewCalendar = async () => {
        // Check plan limits
        const { allowed, current, limit } = await canAddMoreCalendars();

        if (!allowed) {
            showToast(
                `⚠️ Calendar limit reached (${current}/${limit}). Upgrade to ${subscription.plan === 'Starter' ? 'Growth' : 'Advanced'} plan to add more calendars.`,
                'warning'
            );
            return;
        }

        setIsConnecting(true);
        try {
            const { code } = await handleAuthClick();

            if (userId) {
                const response = await fetch('/api/calendar/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, userId })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Update legacy settings in DB explicitly to ensure persistence
                    const newSettings = {
                        email: result.email,
                        calendars: [],
                        bookingCalendarId: 'primary',
                        appointmentDuration: 30,
                        ...(calendarSettings || {})
                    };
                    newSettings.email = result.email;

                    await supabase
                        .from('settings')
                        .update({ calendar_settings: newSettings })
                        .eq('user_id', userId);

                    // Refresh data to fetch both the new connection and the updated settings
                    await refreshData();
                    showToast(`✅ Connected calendar: ${result.email}`, 'success');
                } else {
                    showToast('❌ Failed to connect calendar: ' + (result.error || 'Unknown error'), 'error');
                }
            }
        } catch (err: any) {
            console.error('Connection error:', err);
            showToast('❌ Connection canceled or failed', 'error');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleEditConnection = (connection: CalendarConnection) => {
        setEditingId(connection.id);
        setEditForm({ ...connection });
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editForm) return;

        const result = await updateCalendarConnection(editingId, editForm);

        if (result.success) {
            // Update local state
            setCalendarConnections(prev =>
                prev.map(c => c.id === editingId ? { ...c, ...editForm } : c)
            );
            setEditingId(null);
            setEditForm({});
            showToast('✅ Calendar updated', 'success');
        } else {
            showToast(`❌ Failed to update: ${result.error}`, 'error');
        }
    };

    const handleDeleteConnection = async (connectionId: string) => {
        if (!confirm('Are you sure you want to disconnect this calendar?')) return;

        const result = await deleteCalendarConnection(connectionId);

        if (result.success) {
            setCalendarConnections(prev => prev.filter(c => c.id !== connectionId));
            showToast('✅ Calendar disconnected', 'success');
        } else {
            showToast(`❌ Failed to disconnect: ${result.error}`, 'error');
        }
    };

    const activeCount = calendarConnections.filter(c => c.isActive).length;
    const limit = planDetails?.limits.calendars || 1;

    return (
        <div className="space-y-6">
            {/* Header with Plan Info */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-chippy-navy">Calendar Connections</h3>
                    <p className="text-sm text-slate-500">
                        {activeCount} / {limit} calendars used • {subscription.plan} plan
                    </p>
                </div>
                <button
                    onClick={handleConnectNewCalendar}
                    disabled={isConnecting || activeCount >= limit}
                    className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${activeCount >= limit
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                        }`}
                >
                    <Plus className="w-4 h-4" />
                    Add Calendar
                </button>
            </div>

            {/* Plan Limit Warning */}
            {activeCount >= limit && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-amber-900">Calendar Limit Reached</h4>
                        <p className="text-sm text-amber-700">
                            Your {subscription.plan} plan supports up to {limit} calendar{limit > 1 ? 's' : ''}.
                            {subscription.plan === 'Starter' && ' Upgrade to Growth for 3 calendars.'}
                            {subscription.plan === 'Growth' && ' Upgrade to Advanced for 5+ calendars.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Calendar Connections List */}
            <div className="space-y-4">
                {calendarConnections.length === 0 ? (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                        <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h4 className="font-bold text-slate-600 mb-2">No calendars connected</h4>
                        <p className="text-sm text-slate-500 mb-4">
                            Connect your first calendar to start accepting appointments
                        </p>
                    </div>
                ) : (
                    calendarConnections.map(connection => {
                        const isEditing = editingId === connection.id;

                        return (
                            <div
                                key={connection.id}
                                className="bg-white border border-slate-200 rounded-2xl p-6 transition-all hover:shadow-md"
                            >
                                {isEditing ? (
                                    // Edit Mode
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-2 block">
                                                    Calendar Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editForm.calendarName || ''}
                                                    onChange={e => setEditForm({ ...editForm, calendarName: e.target.value })}
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                    placeholder="e.g., Downtown Office Calendar"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-2 block">
                                                    Location
                                                </label>
                                                <select
                                                    value={editForm.locationId || ''}
                                                    onChange={e => {
                                                        const locId = e.target.value;
                                                        const loc = locations.find((_, idx) => `loc-${idx}` === locId);
                                                        setEditForm({
                                                            ...editForm,
                                                            locationId: locId || undefined,
                                                            locationName: loc?.name || undefined
                                                        });
                                                    }}
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                >
                                                    <option value="">No location assigned</option>
                                                    {locations.map((loc, idx) => (
                                                        <option key={idx} value={`loc-${idx}`}>
                                                            {loc.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-2 block">
                                                    Appointment Duration (minutes)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={editForm.appointmentDuration || 30}
                                                    onChange={e => setEditForm({ ...editForm, appointmentDuration: parseInt(e.target.value) })}
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                    min="15"
                                                    step="15"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => {
                                                    setEditingId(null);
                                                    setEditForm({});
                                                }}
                                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={handleSaveEdit}
                                                className="px-4 py-2 bg-chippy-navy text-white rounded-lg hover:bg-chippy-coral transition-colors font-bold flex items-center gap-2"
                                            >
                                                <Check className="w-4 h-4" /> Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    // View Mode
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-chippy-navy">
                                                    {connection.calendarName || connection.providerEmail}
                                                </h4>
                                                <p className="text-sm text-slate-500">{connection.providerEmail}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    {connection.locationName && (
                                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                                            <MapPin className="w-3 h-3" />
                                                            {connection.locationName}
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-slate-400">
                                                        {connection.appointmentDuration || 30} min appointments
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleEditConnection(connection)}
                                                className="p-2 text-slate-400 hover:text-chippy-navy hover:bg-slate-100 rounded-lg transition-colors"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteConnection(connection.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Help Text */}
            {locations.length === 0 && calendarConnections.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-blue-900">Add locations to your business</h4>
                        <p className="text-sm text-blue-700">
                            Visit the Knowledge Base to add business locations, then assign calendars to each location.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
