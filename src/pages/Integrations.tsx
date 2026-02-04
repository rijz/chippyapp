import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, RefreshCw, Clock, CalendarDays, Settings, LogOut, ChevronRight, Globe, Plus, X, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PageHeader } from '../components/layout/PageHeader';
import { handleAuthClick, loadGoogleScripts, fetchCalendars, handleSignOut } from '../services/calendarAuth';
import { CalendarSettings, CalendarItem } from '../types';
import { MultiLocationCalendarManager } from '../components/MultiLocationCalendarManager';

export const Integrations = () => {
    const { tenantConfig, setTenantConfig, calendarSettings, setCalendarSettings, refreshData } = useData();
    const { session } = useAuth();
    const { showToast } = useToast();
    const userId = session?.user?.id || '';
    const [isLoading, setIsLoading] = useState(false);
    const [availableCalendars, setAvailableCalendars] = useState<CalendarItem[]>([]);

    // Embed domain state
    const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
    const [defaultDomain, setDefaultDomain] = useState<string | null>(null);
    const [newDomain, setNewDomain] = useState('');
    const [isLoadingDomains, setIsLoadingDomains] = useState(true);
    const [isSavingDomains, setIsSavingDomains] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        loadGoogleScripts();
        // Calendar list fetching removed - backend integration uses owner's primary calendar by default
    }, []);

    // Load allowed embed domains
    useEffect(() => {
        const loadEmbedDomains = async () => {
            if (!userId) return;

            try {
                const response = await fetch(`/api/embed-domains/${userId}`);
                if (response.ok) {
                    const data = await response.json();
                    setAllowedDomains(data.allowedDomains || []);
                    setDefaultDomain(data.defaultDomain);
                }
            } catch (error) {
                console.error('[Integrations] Failed to load embed domains:', error);
            } finally {
                setIsLoadingDomains(false);
            }
        };

        loadEmbedDomains();
    }, [userId]);

    const addDomain = () => {
        if (!newDomain.trim()) return;

        // Normalize domain
        let domain = newDomain.trim();
        if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
            domain = 'https://' + domain;
        }

        try {
            const url = new URL(domain);
            const origin = url.origin;

            if (!allowedDomains.includes(origin)) {
                setAllowedDomains(prev => [...prev, origin]);
                setHasChanges(true);
            }
            setNewDomain('');
        } catch (e) {
            showToast('Invalid domain format', 'error');
        }
    };

    const removeDomain = (domain: string) => {
        setAllowedDomains(prev => prev.filter(d => d !== domain));
        setHasChanges(true);
    };

    const saveDomains = async () => {
        setIsSavingDomains(true);
        try {
            const response = await fetch(`/api/embed-domains/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: allowedDomains })
            });

            if (response.ok) {
                showToast('Allowed domains saved successfully!', 'success');
                setHasChanges(false);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('[Integrations] Failed to save embed domains:', error);
            showToast('Failed to save allowed domains', 'error');
        } finally {
            setIsSavingDomains(false);
        }
    };

    const useDefaultDomain = () => {
        if (defaultDomain && !allowedDomains.includes(defaultDomain)) {
            setAllowedDomains(prev => [...prev, defaultDomain]);
            setHasChanges(true);
        }
    };

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

                    // Refresh data to show the new connection immediately
                    await refreshData();
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
        <div className="w-full space-y-8 animate-in fade-in duration-500 pb-20">
            <PageHeader
                title="Integrations"
                subtitle="Connect your calendars and embed settings."
            />

            {/* Multi-Location Calendar Manager */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-slate-200">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="w-10 h-10" />
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Google Calendar</h3>
                            <p className="text-slate-500">Manage multiple calendars for different locations.</p>
                        </div>
                    </div>
                </div>
                <div className="p-8">
                    <MultiLocationCalendarManager />
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
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-slate-200">
                            <code className="text-lg font-bold text-slate-600">&lt;/&gt;</code>
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Website Embed</h3>
                            <p className="text-slate-500">Add the AI agent to your own website with one line of code.</p>
                        </div>
                    </div>
                </div>
                <div className="p-8 text-left space-y-8">
                    {/* Embed Code */}
                    <div>
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
                                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-md text-xs font-semibold transition-all border border-white/10"
                            >
                                Copy Code
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-3">Works with any website: WordPress, Shopify, Squarespace, Wix, custom HTML, and more.</p>
                    </div>

                    {/* Allowed Domains Section */}
                    <div className="border-t border-slate-100 pt-8">
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="w-5 h-5 text-slate-500" />
                            <h4 className="font-bold text-lg text-chippy-navy">Allowed Embed Domains</h4>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            For security, specify which websites can embed your chat widget. Only these domains will be able to display your widget in an iframe.
                        </p>

                        {isLoadingDomains ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <>
                                {/* Current Domains List */}
                                <div className="space-y-2 mb-4">
                                    {allowedDomains.length === 0 ? (
                                        <div className="flex items-center gap-2 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                            <p className="text-sm text-slate-600">
                                                No domains configured. Your widget can currently be embedded on any website.
                                                {defaultDomain && (
                                                    <button
                                                        onClick={useDefaultDomain}
                                                        className="ml-2 text-slate-700 underline hover:text-slate-900 font-medium"
                                                    >
                                                        Add {defaultDomain}
                                                    </button>
                                                )}
                                            </p>
                                        </div>
                                    ) : (
                                        allowedDomains.map((domain, index) => (
                                            <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg group">
                                                <Globe className="w-4 h-4 text-slate-400" />
                                                <span className="flex-1 text-sm font-medium text-slate-700">{domain}</span>
                                                <button
                                                    onClick={() => removeDomain(domain)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded-md transition-all"
                                                >
                                                    <X className="w-4 h-4 text-slate-500" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Add New Domain */}
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        value={newDomain}
                                        onChange={(e) => setNewDomain(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                                        placeholder="https://yourwebsite.com"
                                        className="flex-1 p-3 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-chippy-coral focus:border-transparent"
                                    />
                                    <button
                                        onClick={addDomain}
                                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all flex items-center gap-2 font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add
                                    </button>
                                </div>

                                {/* Default Domain Suggestion */}
                                {defaultDomain && !allowedDomains.includes(defaultDomain) && allowedDomains.length > 0 && (
                                    <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4">
                                        <Globe className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                        <p className="text-sm text-slate-600 flex-1">
                                            Your website <strong>{defaultDomain}</strong> is not in the list.
                                        </p>
                                        <button
                                            onClick={useDefaultDomain}
                                            className="text-slate-700 hover:text-slate-900 text-sm font-medium underline"
                                        >
                                            Add it
                                        </button>
                                    </div>
                                )}

                                {/* Save Button */}
                                {hasChanges && (
                                    <button
                                        onClick={saveDomains}
                                        disabled={isSavingDomains}
                                        className="w-full py-3 bg-slate-900 hover:bg-slate-900/90 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isSavingDomains ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4" />
                                                Save Changes
                                            </>
                                        )}
                                    </button>
                                )}

                                {/* Security Note */}
                                {allowedDomains.length > 0 && (
                                    <p className="text-xs text-slate-400 mt-4 flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        Your widget is protected. Only the domains listed above can embed it.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
