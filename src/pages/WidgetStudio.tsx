import React, { useState, useEffect } from 'react';
import {
    Palette, Zap, Bell, Code, Layout, FormInput, MessageCircle,
    Plus, Trash2, Check, Copy, ExternalLink, Shield,
    User, Mail, Phone
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PageHeader } from '../components/layout/PageHeader';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ContactFieldSelector } from '../components/ui/Shared';
import { ContactFieldRequirement } from '../types';
import { EmailPreview } from '../components/knowledge/EmailPreview';
import clsx from 'clsx';
import { ChatWidget } from '../components/ChatWidget';

export const WidgetStudio = () => {
    const { widgetConfig, setWidgetConfig, tenantConfig, calendarConnections } = useData();
    const { session } = useAuth();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Tabs: appearance, behavior, notifications, install
    const [activeTab, setActiveTab] = useState<'appearance' | 'behavior' | 'notifications' | 'install'>('appearance');

    // Email Test State
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testEmail, setTestEmail] = useState('');

    // Custom Capabilities State
    const [newCapabilityLabel, setNewCapabilityLabel] = useState('');

    // Install Code State
    const [isCopied, setIsCopied] = useState(false);

    // Derived State
    const hasActiveCalendar = calendarConnections.some(c => c.isActive);
    const userId = session?.user?.id || '';

    // Initialize tabs from URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'appearance' || tab === 'behavior' || tab === 'install') {
            setActiveTab(tab);
        } else if (tab === 'followup' || tab === 'notifications') {
            setActiveTab('notifications');
        }
    }, [searchParams]);

    // Handle scroll to hash
    useEffect(() => {
        if (!location.hash) return;
        const target = document.querySelector(location.hash);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [activeTab, location.hash]);

    // Initialize test email
    useEffect(() => {
        if (!testEmail && session?.user?.email) {
            setTestEmail(session.user.email);
        }
    }, [session?.user?.email, testEmail]);

    // Switch Tab Helper
    const switchTab = (tab: typeof activeTab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    // --- Capabilities Logic ---
    const capabilities = widgetConfig.capabilities || {
        canAnswerPricing: true,
        canBookAppointments: true,
        canRequestCallback: true,
        canCollectLeads: true,
        custom: []
    };

    const updateCapability = (key: keyof typeof capabilities, value: boolean) => {
        setWidgetConfig(prev => ({
            ...prev,
            capabilities: { ...capabilities, [key]: value }
        }));
    };

    const updateCustomCapability = (index: number, enabled: boolean) => {
        const nextCustom = [...(capabilities.custom || [])];
        if (!nextCustom[index]) return;
        nextCustom[index] = { ...nextCustom[index], enabled };
        setWidgetConfig(prev => ({
            ...prev,
            capabilities: { ...capabilities, custom: nextCustom }
        }));
    };

    const removeCustomCapability = (index: number) => {
        const nextCustom = [...(capabilities.custom || [])].filter((_, idx) => idx !== index);
        setWidgetConfig(prev => ({
            ...prev,
            capabilities: { ...capabilities, custom: nextCustom }
        }));
    };

    const addCustomCapability = () => {
        const label = newCapabilityLabel.trim();
        if (!label) return;
        const baseKey = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!baseKey) return;

        // Prevent duplicates
        const existingKeys = new Set((capabilities.custom || []).map(c => c.key));
        if (existingKeys.has(baseKey)) {
            showToast('Capability already exists', 'error');
            return;
        }

        const nextCustom = [...(capabilities.custom || []), { key: baseKey, label, enabled: true }];
        setWidgetConfig(prev => ({
            ...prev,
            capabilities: { ...capabilities, custom: nextCustom }
        }));
        setNewCapabilityLabel('');
    };

    // --- Actions ---
    const sendTestEmail = async (mode: 'customer' | 'owner') => {
        if (!userId || !testEmail.trim()) {
            showToast('Please sign in and enter an email address.', 'error');
            return;
        }

        setIsSendingTest(true);
        try {
            const templateVars = {
                customer_name: 'Alex',
                customer_email: 'alex@example.com',
                company_name: tenantConfig.companyName || 'Your Business',
                company_url: tenantConfig.companyUrl || 'https://example.com',
                summary: 'Asked about pricing and next available appointment.',
                next_action: 'Suggested: book a consultation this week.',
                priority: 'Warm',
                intent: 'Pricing + booking'
            };

            // Use current config values
            const subject = mode === 'customer'
                ? (widgetConfig.followUp.customerSubject || '')
                : (widgetConfig.followUp.ownerSubject || '');
            const body = mode === 'customer'
                ? (widgetConfig.followUp.customerBody || '')
                : (widgetConfig.followUp.ownerBody || '');

            const response = await fetch('/api/followup/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    userId,
                    toEmail: testEmail.trim(),
                    mode,
                    subject,
                    body,
                    templateVars
                })
            });

            if (!response.ok) throw new Error('Failed to send');
            showToast('Test email sent!', 'success');
        } catch (e) {
            showToast('Failed to send test email', 'error');
        } finally {
            setIsSendingTest(false);
        }
    };

    const copyEmbedCode = () => {
        const code = `<script src="https://app.hellochippy.com/widget.js" data-chippy-id="${userId}"></script>`;
        navigator.clipboard.writeText(code);
        setIsCopied(true);
        showToast('Code copied to clipboard', 'success');
        setTimeout(() => setIsCopied(false), 2000);
    };

    const updateContactField = (field: keyof typeof widgetConfig.contactFields, value: ContactFieldRequirement) => {
        setWidgetConfig(prev => ({
            ...prev,
            contactFields: { ...prev.contactFields, [field]: value }
        }));
    };

    // Define tabs configuration
    const tabs = [
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'behavior', label: 'Behavior', icon: Zap },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'install', label: 'Install', icon: Code },
    ];

    // --- Render ---
    return (
        <div className="h-[calc(100vh-theme(spacing.20))] flex flex-col md:flex-row bg-slate-50 overflow-hidden">
            {/* Left Panel: Settings (Scrollable) */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 md:border-r border-slate-200">
                {/* Header & Tabs */}
                <div className="px-8 pt-8 pb-6 shrink-0 z-10 bg-slate-50 space-y-6">
                    <PageHeader
                        title="Widget Studio"
                        subtitle="Customize your on-site assistant."
                    />

                    {/* Navigation Tabs - Knowledge Style */}
                    <div className="bg-white border border-slate-200 rounded-xl p-2 w-fit shadow-sm">
                        <div className="flex gap-2">
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => switchTab(tab.id as any)}
                                        className={clsx(
                                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                                            isActive
                                                ? "bg-slate-900 text-white shadow-sm"
                                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
                                        )}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        <span className="hidden xl:inline">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Content Scroll Area */}
                <div className="flex-1 overflow-y-auto px-8 pb-20 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm max-w-3xl">
                        {/* APPEARANCE TAB */}
                        {activeTab === 'appearance' && (
                            <div className="space-y-8">
                                {/* Brand Settings */}
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Brand Identity</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Widget Title</label>
                                            <input
                                                type="text"
                                                value={widgetConfig.title}
                                                onChange={(e) => setWidgetConfig({ ...widgetConfig, title: e.target.value })}
                                                className="w-full mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-chippy-navy focus:ring-2 focus:ring-chippy-coral outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Subtitle</label>
                                            <input
                                                type="text"
                                                value={widgetConfig.subtitle || ''}
                                                onChange={(e) => setWidgetConfig({ ...widgetConfig, subtitle: e.target.value })}
                                                placeholder="e.g. AI Assistant"
                                                className="w-full mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-chippy-coral outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Primary Color</label>
                                        <div className="flex flex-wrap gap-3 mt-3">
                                            {['#0F172A', '#FF6B6B', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'].map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => setWidgetConfig({ ...widgetConfig, color })}
                                                    className={clsx(
                                                        "w-10 h-10 rounded-full border-2 transition-all",
                                                        widgetConfig.color === color ? "border-slate-900 scale-110 shadow-md" : "border-transparent hover:scale-105"
                                                    )}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                            <div className="relative ml-2">
                                                <input
                                                    type="color"
                                                    value={widgetConfig.color}
                                                    onChange={(e) => setWidgetConfig({ ...widgetConfig, color: e.target.value })}
                                                    className="w-10 h-10 -m-1 rounded-full overflow-hidden cursor-pointer opacity-0 absolute inset-0"
                                                />
                                                <div className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:bg-slate-50 pointer-events-none">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Position Settings */}
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Positioning</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            onClick={() => setWidgetConfig({ ...widgetConfig, position: 'left' })}
                                            className={clsx(
                                                "p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all",
                                                widgetConfig.position === 'left'
                                                    ? "border-chippy-navy bg-slate-50 ring-1 ring-chippy-navy/50"
                                                    : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                                            )}
                                        >
                                            <div className="w-full h-20 bg-white border border-slate-200 rounded-lg relative overflow-hidden">
                                                <div className="absolute bottom-2 left-2 w-8 h-8 bg-chippy-navy rounded-full shadow-sm" />
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">Bottom Left</span>
                                        </button>
                                        <button
                                            onClick={() => setWidgetConfig({ ...widgetConfig, position: 'right' })}
                                            className={clsx(
                                                "p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all",
                                                widgetConfig.position === 'right'
                                                    ? "border-chippy-navy bg-slate-50 ring-1 ring-chippy-navy/50"
                                                    : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                                            )}
                                        >
                                            <div className="w-full h-20 bg-white border border-slate-200 rounded-lg relative overflow-hidden">
                                                <div className="absolute bottom-2 right-2 w-8 h-8 bg-chippy-navy rounded-full shadow-sm" />
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">Bottom Right</span>
                                        </button>
                                    </div>
                                </section>

                                {/* Welcome Message */}
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Welcome Message</h3>
                                    <textarea
                                        value={widgetConfig.welcomeMessage}
                                        onChange={(e) => setWidgetConfig({ ...widgetConfig, welcomeMessage: e.target.value })}
                                        className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-chippy-coral outline-none resize-none text-slate-700"
                                        placeholder="Hi there! How can I help you today?"
                                    />
                                </section>
                            </div>
                        )}

                        {/* BEHAVIOR TAB */}
                        {activeTab === 'behavior' && (
                            <div className="space-y-8">
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Lead Capture Mode</h3>
                                    <div className="space-y-4">
                                        {/* Pre-Chat Form Option */}
                                        <div
                                            className={clsx(
                                                "relative p-5 rounded-xl border-2 cursor-pointer transition-all",
                                                widgetConfig.leadCaptureMode === 'pre-chat'
                                                    ? "border-chippy-navy bg-slate-50"
                                                    : "border-slate-100 hover:border-slate-300"
                                            )}
                                            onClick={() => setWidgetConfig({ ...widgetConfig, leadCaptureMode: 'pre-chat' })}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={clsx("p-3 rounded-xl", widgetConfig.leadCaptureMode === 'pre-chat' ? "bg-chippy-navy text-white" : "bg-slate-100 text-slate-500")}>
                                                    <FormInput className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-chippy-navy">Pre-Chat Form</h4>
                                                    <p className="text-sm text-slate-500 mt-1">Visitors must enter details before starting a chat.</p>
                                                </div>
                                                {widgetConfig.leadCaptureMode === 'pre-chat' && <div className="w-5 h-5 bg-chippy-navy rounded-full flex items-center justify-center text-white"><Check className="w-3 h-3" /></div>}
                                            </div>

                                            {/* Field Config (Only show if active) */}
                                            {widgetConfig.leadCaptureMode === 'pre-chat' && (
                                                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 pl-16">
                                                    <ContactFieldSelector label="Name" icon={<User className="w-4 h-4" />} value={widgetConfig.contactFields.name} onChange={(v) => updateContactField('name', v)} />
                                                    <ContactFieldSelector label="Email" icon={<Mail className="w-4 h-4" />} value={widgetConfig.contactFields.email} onChange={(v) => updateContactField('email', v)} />
                                                    <ContactFieldSelector label="Phone" icon={<Phone className="w-4 h-4" />} value={widgetConfig.contactFields.phone} onChange={(v) => updateContactField('phone', v)} />
                                                </div>
                                            )}
                                        </div>

                                        {/* AI Driven Option */}
                                        <div
                                            className={clsx(
                                                "relative p-5 rounded-xl border-2 cursor-pointer transition-all",
                                                widgetConfig.leadCaptureMode === 'ai-driven'
                                                    ? "border-chippy-navy bg-slate-50"
                                                    : "border-slate-100 hover:border-slate-300"
                                            )}
                                            onClick={() => setWidgetConfig({ ...widgetConfig, leadCaptureMode: 'ai-driven' })}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={clsx("p-3 rounded-xl", widgetConfig.leadCaptureMode === 'ai-driven' ? "bg-chippy-navy text-white" : "bg-slate-100 text-slate-500")}>
                                                    <MessageCircle className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-chippy-navy">Conversational AI</h4>
                                                    <p className="text-sm text-slate-500 mt-1">Agent X collects information naturally during the conversation.</p>
                                                </div>
                                                {widgetConfig.leadCaptureMode === 'ai-driven' && <div className="w-5 h-5 bg-chippy-navy rounded-full flex items-center justify-center text-white"><Check className="w-3 h-3" /></div>}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Capabilities</h3>
                                    {/* List capabilities with toggles */}
                                    {[
                                        { key: 'canAnswerPricing', label: 'Answer Pricing Questions', sub: 'Uses your configured services & plans.', link: '/knowledge?tab=pricing', linkText: 'Manage Pricing' },
                                        { key: 'canBookAppointments', label: 'Book Appointments', sub: hasActiveCalendar ? 'Connected to calendar.' : 'Requires calendar connection.', link: '/integrations', linkText: 'Manage Calendars' },
                                        { key: 'canRequestCallback', label: 'Request Callbacks', sub: 'Allow users to request a phone call.' },
                                        { key: 'canCollectLeads', label: 'Collect Leads', sub: 'Capture visitor contact info.' },
                                    ].map((cap: any) => (
                                        <div key={cap.key} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                            <div>
                                                <h4 className="font-bold text-slate-800">{cap.label}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{cap.sub}</p>
                                                {cap.link && (
                                                    <button onClick={() => navigate(cap.link)} className="text-xs font-semibold text-chippy-coral mt-2 flex items-center gap-1 hover:underline">
                                                        {cap.linkText} <ExternalLink className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={(capabilities as any)[cap.key]}
                                                onChange={(e) => updateCapability(cap.key, e.target.checked)}
                                                className="w-5 h-5 accent-chippy-navy cursor-pointer"
                                            />
                                        </div>
                                    ))}

                                    {/* Custom Capabilities */}
                                    {capabilities.custom?.map((cap, idx) => (
                                        <div key={cap.key} className="flex items-center gap-2">
                                            <div className="flex-1 flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                                                <div>
                                                    <p className="font-bold text-slate-800">{cap.label}</p>
                                                    <p className="text-xs text-slate-500">{cap.key}</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={cap.enabled}
                                                    onChange={(e) => updateCustomCapability(idx, e.target.checked)}
                                                    className="w-5 h-5 accent-chippy-navy cursor-pointer"
                                                />
                                            </div>
                                            <button onClick={() => removeCustomCapability(idx)} className="p-4 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 bg-white">
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}

                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newCapabilityLabel}
                                            onChange={(e) => setNewCapabilityLabel(e.target.value)}
                                            placeholder="Add custom capability..."
                                            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                        />
                                        <button onClick={addCustomCapability} className="px-4 bg-slate-900 text-white rounded-xl font-bold text-sm">Add</button>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* NOTIFICATIONS TAB (Formerly Email Follow-ups) */}
                        {activeTab === 'notifications' && (
                            <div className="space-y-8">
                                <div className="flex items-center justify-between bg-slate-900 text-white p-6 rounded-2xl shadow-lg shadow-slate-200">
                                    <div>
                                        <h3 className="text-lg font-bold">Email Follow-ups</h3>
                                        <p className="text-slate-300 text-sm">Send automatic recaps after chats.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={clsx("text-sm font-bold", widgetConfig.followUp.enabled ? "text-emerald-400" : "text-slate-400")}>
                                            {widgetConfig.followUp.enabled ? 'On' : 'Off'}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={widgetConfig.followUp.enabled}
                                            onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, enabled: e.target.checked } })}
                                            className="w-6 h-6 accent-emerald-500 cursor-pointer"
                                        />
                                    </div>
                                </div>

                                <section className={clsx("space-y-6 transition-opacity", !widgetConfig.followUp.enabled && "opacity-50 pointer-events-none")}>
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Settings</h3>

                                    <div className="grid grid-cols-1 gap-6">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sender Info</label>
                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <input
                                                    type="email"
                                                    value={widgetConfig.followUp.replyToEmail || ''}
                                                    onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, replyToEmail: e.target.value } })}
                                                    placeholder="Reply-to Email (e.g. you@company.com)"
                                                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                />
                                                <select
                                                    value={widgetConfig.followUp.delayMinutes}
                                                    onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, delayMinutes: Number(e.target.value) } })}
                                                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                >
                                                    <option value={0}>Send Immediately</option>
                                                    <option value={30}>Wait 30 Minutes</option>
                                                    <option value={120}>Wait 2 Hours</option>
                                                    <option value={1440}>Send Next Morning</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Recipients</label>
                                            <div className="flex gap-4 mt-2">
                                                <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetConfig.followUp.sendToCustomer}
                                                        onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, sendToCustomer: e.target.checked } })}
                                                        className="w-4 h-4 accent-chippy-navy"
                                                    />
                                                    Customer
                                                </label>
                                                <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetConfig.followUp.sendToOwner}
                                                        onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, sendToOwner: e.target.checked } })}
                                                        className="w-4 h-4 accent-chippy-navy"
                                                    />
                                                    Owner (Me)
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className={clsx("space-y-6 transition-opacity", !widgetConfig.followUp.enabled && "opacity-50 pointer-events-none")}>
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Content Template</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Subject Line</label>
                                            <input
                                                type="text"
                                                value={widgetConfig.followUp.customerSubject || ''}
                                                onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, customerSubject: e.target.value } })}
                                                placeholder={`Follow-up from ${widgetConfig.title}`}
                                                className="w-full mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Body Message</label>
                                            <textarea
                                                value={widgetConfig.followUp.customerBody || ''}
                                                onChange={(e) => setWidgetConfig({ ...widgetConfig, followUp: { ...widgetConfig.followUp, customerBody: e.target.value } })}
                                                className="w-full h-48 mt-2 p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm leading-relaxed"
                                                placeholder="Write your message here... Use {{summary}} to include the chat summary."
                                            />
                                            <p className="text-xs text-slate-400 mt-2">Available tokens: {'{{customer_name}}, {{summary}}, {{company_name}}'}</p>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-100 flex gap-4">
                                        <input
                                            type="email"
                                            value={testEmail}
                                            onChange={(e) => setTestEmail(e.target.value)}
                                            placeholder="test@email.com"
                                            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                                        />
                                        <button
                                            onClick={() => sendTestEmail('customer')}
                                            disabled={isSendingTest}
                                            className="px-6 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
                                        >
                                            {isSendingTest ? 'Sending...' : 'Send Test'}
                                        </button>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* INSTALL TAB */}
                        {activeTab === 'install' && (
                            <div className="space-y-8">
                                <section className="space-y-6">
                                    <h3 className="text-lg font-bold text-chippy-navy border-b border-slate-100 pb-2">Installation</h3>
                                    <p className="text-slate-600">Copy this code and paste it into your website's HTML, preferably before the closing <code>&lt;/body&gt;</code> tag.</p>

                                    <div className="relative group">
                                        <div className="bg-slate-900 rounded-xl p-6 overflow-x-auto shadow-xl">
                                            <pre className="text-slate-300 font-mono text-sm">
                                                <span className="text-purple-400">&lt;script</span> <span className="text-sky-400">src</span>=<span className="text-emerald-400">"https://app.hellochippy.com/widget.js"</span> <span className="text-sky-400">data-chippy-id</span>=<span className="text-emerald-400">"{userId}"</span><span className="text-purple-400">&gt;&lt;/script&gt;</span>
                                            </pre>
                                        </div>
                                        <button
                                            onClick={copyEmbedCode}
                                            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 backdrop-blur-sm"
                                        >
                                            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            {isCopied ? 'Copied' : 'Copy Code'}
                                        </button>
                                    </div>

                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
                                        <Shield className="w-5 h-5 text-amber-500 shrink-0" />
                                        <div>
                                            <h4 className="font-bold text-amber-800 text-sm">Domain Verification</h4>
                                            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                                                Ensure your website's domain is added to the allowed list, otherwise the widget may be blocked by security settings.
                                            </p>
                                            <button
                                                onClick={() => navigate('/integrations')}
                                                className="text-amber-800 underline font-bold text-xs mt-2 hover:text-amber-900"
                                            >
                                                Manage Allowed Domains &rarr;
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Panel: Live Preview (Sticky) */}
            <div className="hidden lg:flex w-[550px] bg-slate-50 border-l border-slate-200 flex-col items-center justify-center p-8 relative">
                <div className="absolute top-8 left-0 right-0 text-center">
                    <span className="bg-white border border-slate-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {activeTab === 'notifications' ? 'Email Preview' : 'Interactive Preview'}
                    </span>
                </div>

                <div className="w-full max-w-[420px] h-[750px] relative mt-8 transition-all duration-500">
                    {activeTab === 'notifications' ? (
                        <div className="scale-[0.85] origin-top h-full">
                            <EmailPreview config={widgetConfig} />
                        </div>
                    ) : (
                        <div className="h-full relative overflow-hidden bg-white border border-slate-200 rounded-xl shadow-inner bg-[url('/grid-pattern.svg')]">
                            {/* Placeholder Website Content */}
                            <div className="absolute inset-x-8 top-12 bottom-32 p-8 text-center text-slate-300 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl">
                                <div className="w-16 h-16 bg-slate-50 rounded-full mb-4" />
                                <div className="w-3/4 h-4 bg-slate-50 rounded mb-3" />
                                <div className="w-1/2 h-4 bg-slate-50 rounded" />
                            </div>

                            {/* Render the actual Chat Widget Component */}
                            <div className="absolute inset-0 pointer-events-none">
                                <ChatWidget
                                    tenantConfig={tenantConfig}
                                    widgetConfig={widgetConfig}
                                    knowledgeSummary=""
                                    forceOpen={true}
                                    previewMode={true}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
