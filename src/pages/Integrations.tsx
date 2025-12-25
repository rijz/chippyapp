import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, RefreshCw, Clock, CalendarDays, Settings, LogOut } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { handleAuthClick, loadGoogleScripts, fetchCalendars, handleSignOut } from '../services/calendarAuth';
import { CalendarSettings, CalendarItem } from '../types';

export const Integrations = () => {
    const { tenantConfig, setTenantConfig, calendarSettings, setCalendarSettings } = useData();
    const [isLoading, setIsLoading] = useState(false);
    const [availableCalendars, setAvailableCalendars] = useState<CalendarItem[]>([]);

    useEffect(() => {
        loadGoogleScripts();
        if (tenantConfig.isConnected) {
            refreshCalendars();
        }
    }, [tenantConfig.isConnected]);

    const refreshCalendars = async () => {
        setIsLoading(true);
        try {
            const cals = await fetchCalendars();
            setAvailableCalendars(cals);

            // If we have calendars but no settings yet, init them
            if (calendarSettings && calendarSettings.calendars.length === 0 && cals.length > 0) {
                setCalendarSettings({
                    ...calendarSettings,
                    calendars: cals.map(c => ({ ...c, selected: c.selected })),
                    bookingCalendarId: cals.find(c => c.selected)?.id || cals[0].id
                });
            }
        } catch (e) {
            console.error("Failed to load calendars", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnectCalendar = async () => {
        setIsLoading(true);
        try {
            const email = await handleAuthClick();
            // Initial fetch
            const cals = await fetchCalendars();

            const settings: CalendarSettings = {
                email,
                calendars: cals,
                bookingCalendarId: cals.find(c => c.selected)?.id || cals[0]?.id || 'primary',
                appointmentDuration: 30
            };
            setCalendarSettings(settings);
            setTenantConfig(prev => ({ ...prev, isConnected: true, bookingPlatform: 'GOOGLE_CALENDAR' }));
            setAvailableCalendars(cals);
        } catch (err) {
            console.error("Calendar auth failed", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = () => {
        if (confirm("Are you sure you want to disconnect Google Calendar?")) {
            handleSignOut();
            setTenantConfig(prev => ({ ...prev, isConnected: false, bookingPlatform: null }));
            // We keep the settings in memory/db usually, but here we can keep them or clear them.
            // Let's clear the active connection flag primarily.
        }
    };

    const toggleCalendarSelection = (calId: string) => {
        const updated = calendarSettings.calendars.map(c =>
            c.id === calId ? { ...c, selected: !c.selected } : c
        );
        setCalendarSettings({ ...calendarSettings, calendars: updated });
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <header>
                <h2 className="text-3xl font-bold text-chippy-navy tracking-tight">Integrations</h2>
                <p className="text-slate-500">Connect Chippy to your primary calendar.</p>
            </header>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="w-10 h-10" />
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Google Calendar</h3>
                            <p className="text-slate-500">Sync availability and book appointments automatically.</p>
                        </div>
                    </div>
                    {tenantConfig.isConnected ? (
                        <div className="flex items-center gap-4">
                            <button onClick={refreshCalendars} className="p-2 text-slate-400 hover:text-chippy-navy transition-colors" title="Refresh Calendars">
                                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                            </button>
                            <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold flex items-center gap-2 border border-emerald-100">
                                <CheckCircle2 className="w-4 h-4" /> Connected as {calendarSettings?.email}
                            </div>
                            <button onClick={handleDisconnect} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Disconnect">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleConnectCalendar}
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                        >
                            {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
                            Connect Google
                        </button>
                    )}
                </div>

                {tenantConfig.isConnected && calendarSettings && (
                    <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-12 text-left">
                        {/* Conflict Checking Section */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 mb-4">
                                <CalendarDays className="w-5 h-5 text-chippy-coral" />
                                <h4 className="font-bold text-lg text-chippy-navy">Check for Conflicts</h4>
                            </div>
                            <p className="text-sm text-slate-500">Select which calendars simply block time (e.g. Holidays, Personal).</p>

                            <div className="space-y-3">
                                {calendarSettings.calendars.map(cal => (
                                    <label key={cal.id} className="flex items-center p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={cal.selected}
                                            onChange={() => toggleCalendarSelection(cal.id)}
                                            className="w-5 h-5 rounded-md border-slate-300 text-chippy-navy focus:ring-chippy-coral mr-4"
                                        />
                                        <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: cal.color }}></div>
                                        <span className="font-medium text-slate-700 group-hover:text-chippy-navy transition-colors">{cal.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Booking Settings Section */}
                        <div className="space-y-8">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <Settings className="w-5 h-5 text-chippy-coral" />
                                    <h4 className="font-bold text-lg text-chippy-navy">Booking Configuration</h4>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Add New Appointments To</label>
                                        <select
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral font-medium text-chippy-navy"
                                            value={calendarSettings.bookingCalendarId}
                                            onChange={(e) => setCalendarSettings({ ...calendarSettings, bookingCalendarId: e.target.value })}
                                        >
                                            {calendarSettings.calendars.map(cal => (
                                                <option key={cal.id} value={cal.id}>{cal.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Default Duration</label>
                                        <div className="flex items-center gap-4">
                                            <div className="relative flex-1">
                                                <Clock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                                <select
                                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral font-medium text-chippy-navy appearance-none"
                                                    value={calendarSettings.appointmentDuration}
                                                    onChange={(e) => setCalendarSettings({ ...calendarSettings, appointmentDuration: parseInt(e.target.value) })}
                                                >
                                                    <option value={15}>15 Minutes</option>
                                                    <option value={30}>30 Minutes</option>
                                                    <option value={45}>45 Minutes</option>
                                                    <option value={60}>1 Hour</option>
                                                    <option value={90}>1.5 Hours</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
