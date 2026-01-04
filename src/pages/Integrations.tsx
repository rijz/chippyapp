import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, RefreshCw, Clock, CalendarDays, Settings, LogOut, ChevronRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { handleAuthClick, loadGoogleScripts, fetchCalendars, handleSignOut } from '../services/calendarAuth';
import { CalendarSettings, CalendarItem } from '../types';

export const Integrations = () => {
    const { tenantConfig, setTenantConfig, calendarSettings, setCalendarSettings } = useData();
    const { session } = useAuth();
    const { showToast } = useToast();
    const userId = session?.user?.id || '';
    const [isLoading, setIsLoading] = useState(false);
    const [availableCalendars, setAvailableCalendars] = useState<CalendarItem[]>([]);

    useEffect(() => {
        loadGoogleScripts();
        // Calendar list fetching removed - backend integration uses owner's primary calendar by default
    }, []);

    const handleConnectCalendar = async () => {
        setIsLoading(true);
        try {
            // Get Auth Code (Code Flow)
            const { code } = await handleAuthClick();

            if (userId) {
                // Exchange code for tokens via backend
                const response = await fetch('/api/calendar/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, userId })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Update local state
                    const settings: CalendarSettings = {
                        email: result.email,
                        calendars: [],
                        bookingCalendarId: 'primary',
                        appointmentDuration: 30
                    };
                    setCalendarSettings(settings);
                    setTenantConfig(prev => ({ ...prev, isConnected: true, bookingPlatform: 'GOOGLE_CALENDAR' }));

                    showToast(`✅ Connected to Google Calendar of ${result.email}`, 'success');
                } else {
                    console.error('Backend connection failed:', result.error);
                    showToast('❌ Failed to connect calendar: ' + (result.error || 'Unknown error'), 'error');
                }
            } else {
                showToast('⚠️ Please sign in to save connection', 'warning');
            }
        } catch (err: any) {
            console.error('Connection error:', err);
            showToast('❌ Connection canceled or failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };


    const handleDisconnect = async () => {
        if (confirm("Are you sure you want to disconnect Google Calendar?")) {
            try {
                // Delete from database if userId exists
                if (userId) {
                    const { supabase } = await import('../services/supabaseClient');
                    const { error } = await supabase
                        .from('calendar_connections')
                        .delete()
                        .eq('user_id', userId)
                        .eq('provider', 'google');

                    if (error) {
                        console.error('Failed to delete calendar connection:', error);
                        showToast('⚠️ Failed to disconnect calendar from database', 'error');
                        return;
                    }
                }

                // Update local state
                setTenantConfig(prev => ({ ...prev, isConnected: false, bookingPlatform: null }));
                setCalendarSettings(null);
                showToast('✅ Calendar disconnected successfully', 'success');
            } catch (err) {
                console.error('Disconnect error:', err);
                showToast('❌ Failed to disconnect calendar', 'error');
            }
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
            </div>

            {/* BOOKING PAGE LINK SECTION - Hidden for V1 (booking page uses mock data)
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100">
                            <CalendarDays className="w-8 h-8 text-chippy-coral" />
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Booking Page</h3>
                            <p className="text-slate-500">Share your availability with a simple link.</p>
                        </div>
                    </div>
                </div>
                <div className="p-10 text-left">
                    <p className="text-sm text-slate-500 mb-4">Send this link to clients to let them book appointments directly.</p>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 group">
                            <input
                                className="w-full p-4 bg-slate-50 text-slate-600 font-medium rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-chippy-coral"
                                readOnly
                                value={`https://app.hellochippy.com/book`}
                            />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText("https://app.hellochippy.com/book");
                                    showToast("Copied to clipboard!", 'success');
                                }}
                                className="absolute top-1/2 -translate-y-1/2 right-2 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border border-slate-200 shadow-sm"
                            >
                                Copy
                            </button>
                        </div>
                        <a
                            href="/book"
                            target="_blank"
                            className="px-6 py-4 bg-chippy-navy text-white font-bold rounded-xl hover:bg-chippy-navy/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-chippy-navy/20"
                        >
                            View Page <ChevronRight className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </div>
            */}

            {/* WEBSITE EMBED SECTION */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100">
                            <code className="text-xl font-bold text-chippy-coral">&lt;/&gt;</code>
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Website Embed</h3>
                            <p className="text-slate-500">Add the AI agent to your own website with one line of code.</p>
                        </div>
                    </div>
                </div>
                <div className="p-10 text-left">
                    <p className="text-sm text-slate-500 mb-4">Copy and paste this code anywhere in your website's HTML (before <code>&lt;/body&gt;</code> is recommended).</p>
                    <div className="relative group">
                        <div className="w-full p-4 bg-slate-900 text-slate-300 font-mono text-sm rounded-xl border border-slate-700 overflow-x-auto">
                            <span className="text-purple-400">&lt;script</span>
                            <span className="text-sky-400"> src</span>=<span className="text-emerald-400">"https://app.hellochippy.com/widget.js"</span>
                            <span className="text-sky-400"> data-chippy-id</span>=<span className="text-emerald-400">"{userId}"</span>
                            <span className="text-purple-400">&gt;&lt;/script&gt;</span>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(`<script src="https://app.hellochippy.com/widget.js" data-chippy-id="${userId}"></script>`);
                                showToast("Copied to clipboard!", 'success');
                            }}
                            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all border border-white/10"
                        >
                            Copy Code
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-3">Works with any website: WordPress, Shopify, Squarespace, Wix, custom HTML, and more.</p>
                </div>
            </div>
        </div>
    );
};
