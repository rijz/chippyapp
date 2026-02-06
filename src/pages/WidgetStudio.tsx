import React, { useState, useEffect } from 'react';
import { Palette, Zap, User, Mail, Phone, BrainCircuit, X, Eye, MessageSquare, Layout, FormInput, MessageCircle } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PageHeader } from '../components/layout/PageHeader';
import { useSearchParams } from 'react-router-dom';
import { ContactFieldSelector } from '../components/ui/Shared';
import { ContactFieldRequirement, LeadCaptureMode } from '../types';

export const WidgetStudio = () => {
    const { widgetConfig, setWidgetConfig, tenantConfig } = useData();
    const { session } = useAuth();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'appearance' | 'behavior' | 'followup'>('appearance');
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [previewRecipient, setPreviewRecipient] = useState<'customer' | 'owner'>('customer');
    const [testEmail, setTestEmail] = useState('');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'appearance' || tab === 'behavior' || tab === 'followup') {
            setActiveTab(tab);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!testEmail && session?.user?.email) {
            setTestEmail(session.user.email);
        }
    }, [session?.user?.email, testEmail]);

    const sendTestEmail = async (mode: 'customer' | 'owner') => {
        if (!session?.access_token || !session?.user?.id || !session?.user?.email) {
            showToast('You must be logged in to send a test email.', 'error');
            return;
        }

        if (!testEmail.trim()) {
            showToast('Enter an email address to send the test.', 'error');
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
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    userId: session.user.id,
                    toEmail: testEmail.trim(),
                    mode,
                    subject,
                    body,
                    templateVars
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to send test email');
            }

            showToast('Test email sent to your inbox.', 'success');
        } catch (e: any) {
            showToast(e.message || 'Failed to send test email', 'error');
        } finally {
            setIsSendingTest(false);
        }
    };

    const updateContactField = (field: keyof typeof widgetConfig.contactFields, value: ContactFieldRequirement) => {
        setWidgetConfig(prev => ({
            ...prev,
            contactFields: { ...prev.contactFields, [field]: value }
        }));
    };

    const previewSubject = (previewRecipient === 'customer'
        ? (widgetConfig.followUp.customerSubject || '')
        : (widgetConfig.followUp.ownerSubject || '')
    );

    const previewBody = (previewRecipient === 'customer'
        ? (widgetConfig.followUp.customerBody || '')
        : (widgetConfig.followUp.ownerBody || '')
    );

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-500 pb-20">
            <PageHeader
                title={activeTab === 'followup' ? 'Email Follow-ups' : 'Chat Widget'}
                subtitle={activeTab === 'followup'
                    ? 'Control the email follow-up experience.'
                    : 'Customize how the chat widget looks and behaves on your site.'}
                actions={activeTab === 'followup' ? undefined : (
                    <div className="bg-white border border-slate-200 p-1 rounded-lg flex gap-1">
                        <button
                            onClick={() => {
                                setActiveTab('appearance');
                                setSearchParams({ tab: 'appearance' });
                            }}
                            className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'appearance' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Palette className="w-4 h-4" /> Appearance
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('behavior');
                                setSearchParams({ tab: 'behavior' });
                            }}
                            className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'behavior' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Zap className="w-4 h-4" /> Behavior
                        </button>
                    </div>
                )}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Configuration Panel */}
                <div className="lg:col-span-5 space-y-6">
                    {activeTab === 'appearance' ? (
                        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
                                <h3 className="font-bold text-lg text-chippy-navy">Brand Identity</h3>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Widget Title</label>
                                    <input
                                        type="text"
                                        className="w-full mt-2 p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral font-bold text-chippy-navy"
                                        value={widgetConfig.title}
                                        onChange={(e) => setWidgetConfig({ ...widgetConfig, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Subtitle</label>
                                    <input
                                        type="text"
                                        className="w-full mt-2 p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                        value={widgetConfig.subtitle || ''}
                                        onChange={(e) => setWidgetConfig({ ...widgetConfig, subtitle: e.target.value })}
                                        placeholder="e.g. AI Assistant"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Color</label>
                                    <div className="flex gap-4 mt-2">
                                        <input
                                            type="color"
                                            value={widgetConfig.color}
                                            onChange={(e) => setWidgetConfig({ ...widgetConfig, color: e.target.value })}
                                            className="w-12 h-12 rounded-xl border-none cursor-pointer overflow-hidden p-0"
                                        />
                                        <div className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono flex items-center text-slate-500">
                                            {widgetConfig.color}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
                                <h3 className="font-bold text-lg text-chippy-navy">Positioning</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setWidgetConfig({ ...widgetConfig, position: 'left' })}
                                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${widgetConfig.position === 'left' ? 'border-chippy-navy bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <Layout className="w-6 h-6 rotate-180" />
                                        <span className="text-xs font-bold">Bottom Left</span>
                                    </button>
                                    <button
                                        onClick={() => setWidgetConfig({ ...widgetConfig, position: 'right' })}
                                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${widgetConfig.position === 'right' ? 'border-chippy-navy bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <Layout className="w-6 h-6" />
                                        <span className="text-xs font-bold">Bottom Right</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'behavior' ? (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
                                <h3 className="font-bold text-lg text-chippy-navy">Lead Capture Strategy</h3>
                                <p className="text-sm text-slate-500">Decide when to collect visitor information.</p>

                                <div className="grid grid-cols-1 gap-4">
                                    <button
                                        onClick={() => setWidgetConfig({ ...widgetConfig, leadCaptureMode: 'pre-chat' })}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${widgetConfig.leadCaptureMode === 'pre-chat' ? 'border-chippy-navy bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`p-2 rounded-lg ${widgetConfig.leadCaptureMode === 'pre-chat' ? 'bg-chippy-navy text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <FormInput className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-chippy-navy">Pre-Chat Form</span>
                                        </div>
                                        <p className="text-xs text-slate-500 pl-[3.25rem]">Require details before the conversation starts. Best for high-intent leads.</p>
                                    </button>

                                    <button
                                        onClick={() => setWidgetConfig({ ...widgetConfig, leadCaptureMode: 'ai-driven' })}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${widgetConfig.leadCaptureMode === 'ai-driven' ? 'border-chippy-navy bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`p-2 rounded-lg ${widgetConfig.leadCaptureMode === 'ai-driven' ? 'bg-chippy-navy text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <MessageCircle className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-chippy-navy">Conversational (AI)</span>
                                        </div>
                                        <p className="text-xs text-slate-500 pl-[3.25rem]">Agent X collects info naturally when a user wants to book or connect.</p>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
                                <h3 className="font-bold text-lg text-chippy-navy">Follow-Up Emails</h3>
                                <p className="text-sm text-slate-500">Send a short, helpful recap after a chat ends.</p>

                                <div className="space-y-4">
                                    <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Settings</p>

                                    <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">Enable follow-ups</p>
                                            <p className="text-xs text-slate-500">Only sends when no booking is made.</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={widgetConfig.followUp.enabled}
                                            onChange={(e) => setWidgetConfig({
                                                ...widgetConfig,
                                                followUp: { ...widgetConfig.followUp, enabled: e.target.checked }
                                            })}
                                            className="h-5 w-5"
                                        />
                                    </label>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Timing</label>
                                            <select
                                                value={widgetConfig.followUp.delayMinutes}
                                                onChange={(e) => setWidgetConfig({
                                                    ...widgetConfig,
                                                    followUp: { ...widgetConfig.followUp, delayMinutes: Number(e.target.value) }
                                                })}
                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                disabled={!widgetConfig.followUp.enabled}
                                            >
                                                <option value={0}>Send immediately</option>
                                                <option value={30}>Send after 30 minutes</option>
                                                <option value={120}>Send after 2 hours</option>
                                                <option value={1440}>Send next morning</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reply-To Email</label>
                                            <input
                                                type="email"
                                                value={widgetConfig.followUp.replyToEmail || ''}
                                                onChange={(e) => setWidgetConfig({
                                                    ...widgetConfig,
                                                    followUp: { ...widgetConfig.followUp, replyToEmail: e.target.value }
                                                })}
                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                placeholder="owner@business.com"
                                                disabled={!widgetConfig.followUp.enabled}
                                            />
                                            <p className="text-xs text-slate-500">Replies from customers will go to this address.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recipients</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={widgetConfig.followUp.sendToCustomer}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, sendToCustomer: e.target.checked }
                                                    })}
                                                    className="h-4 w-4"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                                <span>Customer</span>
                                            </label>
                                            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={widgetConfig.followUp.sendToOwner}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, sendToOwner: e.target.checked }
                                                    })}
                                                    className="h-4 w-4"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                                <span>Owner</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Templates</p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Subject</label>
                                                <input
                                                    type="text"
                                                    value={widgetConfig.followUp.customerSubject || ''}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, customerSubject: e.target.value }
                                                    })}
                                                    className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Body</label>
                                                <textarea
                                                    value={widgetConfig.followUp.customerBody || ''}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, customerBody: e.target.value }
                                                    })}
                                                    className="w-full h-36 p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm resize-none"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preview (Customer)</label>
                                                <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                                                    {(widgetConfig.followUp.customerBody || '')
                                                        .replace(/{{customer_name}}/g, 'Alex')
                                                        .replace(/{{customer_email}}/g, 'alex@example.com')
                                                        .replace(/{{company_name}}/g, 'Acme Co.')
                                                        .replace(/{{company_url}}/g, 'https://example.com')
                                                        .replace(/{{summary}}/g, 'Asked about pricing and next available appointment.')
                                                        .replace(/{{next_action}}/g, 'Suggested: book a consultation this week.')
                                                        .replace(/{{priority}}/g, 'Warm')
                                                        .replace(/{{intent}}/g, 'Pricing + booking')}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Owner Subject</label>
                                                <input
                                                    type="text"
                                                    value={widgetConfig.followUp.ownerSubject || ''}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, ownerSubject: e.target.value }
                                                    })}
                                                    className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Owner Body</label>
                                                <textarea
                                                    value={widgetConfig.followUp.ownerBody || ''}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, ownerBody: e.target.value }
                                                    })}
                                                    className="w-full h-36 p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm resize-none"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preview (Owner)</label>
                                                <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                                                    {(widgetConfig.followUp.ownerBody || '')
                                                        .replace(/{{customer_name}}/g, 'Alex')
                                                        .replace(/{{customer_email}}/g, 'alex@example.com')
                                                        .replace(/{{company_name}}/g, 'Acme Co.')
                                                        .replace(/{{company_url}}/g, 'https://example.com')
                                                        .replace(/{{summary}}/g, 'Asked about pricing and next available appointment.')
                                                        .replace(/{{next_action}}/g, 'Suggested: book a consultation this week.')
                                                        .replace(/{{priority}}/g, 'Warm')
                                                        .replace(/{{intent}}/g, 'Pricing + booking')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preview Tokens</label>
                                        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                                            Use tokens: {'{{customer_name}}'}, {'{{customer_email}}'}, {'{{company_name}}'}, {'{{company_url}}'}, {'{{summary}}'}, {'{{next_action}}'}, {'{{priority}}'}, {'{{intent}}'}
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Send Test To</label>
                                        <input
                                            type="email"
                                            value={testEmail}
                                            onChange={(e) => setTestEmail(e.target.value)}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                            placeholder="name@company.com"
                                        />
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={() => sendTestEmail('customer')}
                                            disabled={isSendingTest || !widgetConfig.followUp.enabled}
                                            className="flex-1 py-2 bg-slate-900 text-white font-semibold rounded-md hover:bg-slate-900/90 transition-colors disabled:opacity-50"
                                        >
                                            {isSendingTest ? 'Sending...' : 'Send Test (Customer)'}
                                        </button>
                                        <button
                                            onClick={() => sendTestEmail('owner')}
                                            disabled={isSendingTest || !widgetConfig.followUp.enabled}
                                            className="flex-1 py-2 bg-slate-100 text-slate-700 font-semibold rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50"
                                        >
                                            {isSendingTest ? 'Sending...' : 'Send Test (Owner)'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
                                <h3 className="font-bold text-lg text-chippy-navy mb-4">Required Fields</h3>
                                <ContactFieldSelector label="Name" icon={<User className="w-4 h-4" />} value={widgetConfig.contactFields.name} onChange={(v) => updateContactField('name', v)} />
                                <ContactFieldSelector label="Email" icon={<Mail className="w-4 h-4" />} value={widgetConfig.contactFields.email} onChange={(v) => updateContactField('email', v)} />
                                <ContactFieldSelector label="Phone" icon={<Phone className="w-4 h-4" />} value={widgetConfig.contactFields.phone} onChange={(v) => updateContactField('phone', v)} />
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
                                <h3 className="font-bold text-lg text-chippy-navy">Welcome Message</h3>
                                <textarea
                                    className="w-full h-32 p-4 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm resize-none"
                                    value={widgetConfig.welcomeMessage}
                                    onChange={(e) => setWidgetConfig({ ...widgetConfig, welcomeMessage: e.target.value })}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-chippy-navy">Follow-up emails</h3>
                                        <p className="text-sm text-slate-500">Send a short recap after a chat ends without a booking.</p>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={widgetConfig.followUp.enabled}
                                            onChange={(e) => setWidgetConfig({
                                                ...widgetConfig,
                                                followUp: { ...widgetConfig.followUp, enabled: e.target.checked }
                                            })}
                                            className="h-5 w-5 accent-slate-900"
                                        />
                                        Enabled
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-600">Send timing</label>
                                        <select
                                            value={widgetConfig.followUp.delayMinutes}
                                            onChange={(e) => setWidgetConfig({
                                                ...widgetConfig,
                                                followUp: { ...widgetConfig.followUp, delayMinutes: Number(e.target.value) }
                                            })}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                            disabled={!widgetConfig.followUp.enabled}
                                        >
                                            <option value={0}>Immediately</option>
                                            <option value={30}>After 30 minutes</option>
                                            <option value={120}>After 2 hours</option>
                                            <option value={1440}>Next morning</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-600">Reply-to address</label>
                                        <input
                                            type="email"
                                            value={widgetConfig.followUp.replyToEmail || ''}
                                            onChange={(e) => setWidgetConfig({
                                                ...widgetConfig,
                                                followUp: { ...widgetConfig.followUp, replyToEmail: e.target.value }
                                            })}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                            placeholder="owner@business.com"
                                            disabled={!widgetConfig.followUp.enabled}
                                        />
                                        <p className="text-xs text-slate-500">Customer replies go here.</p>
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-xs font-semibold text-slate-600">Send to</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={widgetConfig.followUp.sendToCustomer}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, sendToCustomer: e.target.checked }
                                                    })}
                                                    className="h-4 w-4"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                                Customer
                                            </label>
                                            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={widgetConfig.followUp.sendToOwner}
                                                    onChange={(e) => setWidgetConfig({
                                                        ...widgetConfig,
                                                        followUp: { ...widgetConfig.followUp, sendToOwner: e.target.checked }
                                                    })}
                                                    className="h-4 w-4"
                                                    disabled={!widgetConfig.followUp.enabled}
                                                />
                                                Owner
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-chippy-navy">Templates</h3>
                                        <p className="text-sm text-slate-500">Customize the message sent after each chat.</p>
                                    </div>
                                    <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                                        <button
                                            onClick={() => setPreviewRecipient('customer')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${previewRecipient === 'customer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                                        >
                                            Customer
                                        </button>
                                        <button
                                            onClick={() => setPreviewRecipient('owner')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${previewRecipient === 'owner' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                                        >
                                            Owner
                                        </button>
                                    </div>
                                </div>

                                {previewRecipient === 'customer' ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-600">Subject line</label>
                                            <input
                                                type="text"
                                                value={widgetConfig.followUp.customerSubject || ''}
                                                onChange={(e) => setWidgetConfig({
                                                    ...widgetConfig,
                                                    followUp: { ...widgetConfig.followUp, customerSubject: e.target.value }
                                                })}
                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                disabled={!widgetConfig.followUp.enabled}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-600">Email body</label>
                                            <textarea
                                                value={widgetConfig.followUp.customerBody || ''}
                                                onChange={(e) => setWidgetConfig({
                                                    ...widgetConfig,
                                                    followUp: { ...widgetConfig.followUp, customerBody: e.target.value }
                                                })}
                                                className="w-full h-48 p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm resize-none"
                                                disabled={!widgetConfig.followUp.enabled}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-600">Subject line</label>
                                            <input
                                                type="text"
                                                value={widgetConfig.followUp.ownerSubject || ''}
                                                onChange={(e) => setWidgetConfig({
                                                    ...widgetConfig,
                                                    followUp: { ...widgetConfig.followUp, ownerSubject: e.target.value }
                                                })}
                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                                                disabled={!widgetConfig.followUp.enabled}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-600">Email body</label>
                                            <textarea
                                                value={widgetConfig.followUp.ownerBody || ''}
                                                onChange={(e) => setWidgetConfig({
                                                    ...widgetConfig,
                                                    followUp: { ...widgetConfig.followUp, ownerBody: e.target.value }
                                                })}
                                                className="w-full h-48 p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm resize-none"
                                                disabled={!widgetConfig.followUp.enabled}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <p className="text-xs font-semibold text-slate-600">Tokens</p>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        {['{{customer_name}}', '{{customer_email}}', '{{company_name}}', '{{company_url}}', '{{summary}}', '{{next_action}}', '{{priority}}', '{{intent}}'].map(token => (
                                            <span key={token} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-full text-slate-600 font-mono">
                                                {token}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => sendTestEmail('customer')}
                                        disabled={isSendingTest || !widgetConfig.followUp.enabled}
                                        className="flex-1 py-2 bg-slate-900 text-white font-semibold rounded-md hover:bg-slate-900/90 transition-colors disabled:opacity-50"
                                    >
                                        {isSendingTest ? 'Sending...' : 'Send test (customer)'}
                                    </button>
                                    <button
                                        onClick={() => sendTestEmail('owner')}
                                        disabled={isSendingTest || !widgetConfig.followUp.enabled}
                                        className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
                                    >
                                        {isSendingTest ? 'Sending...' : 'Send test (owner)'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Panel */}
                <div className="lg:col-span-7 sticky top-8">
                    {activeTab === 'followup' ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-10">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-chippy-navy">Preview</h3>
                                    <p className="text-sm text-slate-500">Sample email sent after a chat.</p>
                                </div>
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                    {previewRecipient === 'customer' ? 'Customer' : 'Owner'}
                                </span>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 text-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500">From</p>
                                            <p className="text-sm text-slate-700">{tenantConfig.companyName || 'Your Business'} &lt;notifications@hellochippy.com&gt;</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500">To</p>
                                            <p className="text-sm text-slate-700">alex@example.com</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="px-6 py-4 border-b border-slate-200">
                                    <p className="text-xs text-slate-500">Subject</p>
                                    <p className="text-sm text-slate-800 mt-1">
                                        {previewSubject
                                            .replace(/{{customer_name}}/g, 'Alex')
                                            .replace(/{{customer_email}}/g, 'alex@example.com')
                                            .replace(/{{company_name}}/g, tenantConfig.companyName || 'Your Business')
                                            .replace(/{{company_url}}/g, tenantConfig.companyUrl || 'https://example.com')
                                            .replace(/{{summary}}/g, 'Asked about pricing and next available appointment.')
                                            .replace(/{{next_action}}/g, 'Suggested: book a consultation this week.')
                                            .replace(/{{priority}}/g, 'Warm')
                                            .replace(/{{intent}}/g, 'Pricing + booking')}
                                    </p>
                                </div>
                                <div className="px-6 py-6 text-sm text-slate-700 whitespace-pre-wrap">
                                    {previewBody
                                        .replace(/{{customer_name}}/g, 'Alex')
                                        .replace(/{{customer_email}}/g, 'alex@example.com')
                                        .replace(/{{company_name}}/g, tenantConfig.companyName || 'Your Business')
                                        .replace(/{{company_url}}/g, tenantConfig.companyUrl || 'https://example.com')
                                        .replace(/{{summary}}/g, 'Asked about pricing and next available appointment.')
                                        .replace(/{{next_action}}/g, 'Suggested: book a consultation this week.')
                                        .replace(/{{priority}}/g, 'Warm')
                                        .replace(/{{intent}}/g, 'Pricing + booking')}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-900 rounded-2xl p-8 md:p-10 border border-slate-800 flex items-center justify-center relative min-h-[600px] overflow-hidden">
                            {/* Background Pattern */}
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

                            <div className="absolute top-8 left-8 text-white/30 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <Eye className="w-4 h-4" /> Live Preview
                            </div>

                            {/* Widget Mockup */}
                            <div className={`w-full max-w-[340px] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col h-[600px] transition-all duration-500 ${widgetConfig.position === 'left' ? '-translate-x-8' : 'translate-x-0'}`}>
                            {/* Header */}
                            <div className="p-5 text-white flex items-center justify-between shrink-0" style={{ backgroundColor: widgetConfig.color }}>
                                <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                            <img src="/logo.png" alt="Chippy" className="w-5 h-5 rounded" />
                                        </div>
                                    <div>
                                        <p className="font-black text-sm">{widgetConfig.title}</p>
                                        <p className="text-[10px] opacity-80 font-medium">{widgetConfig.subtitle || 'AI Assistant'}</p>
                                    </div>
                                </div>
                                <X className="w-5 h-5 opacity-70 cursor-pointer hover:opacity-100" />
                            </div>

                            {/* Chat Area */}
                            <div className="flex-1 bg-slate-50 p-4 overflow-hidden relative">
                                {widgetConfig.leadCaptureMode === 'pre-chat' ? (
                                    <div className="absolute inset-x-4 top-4 bottom-4 bg-white rounded-2xl shadow-lg border border-slate-100 z-10 flex flex-col p-6 animate-in zoom-in-95 duration-300">
                                        <div className="text-center mb-6">
                                            <h4 className="font-bold text-chippy-navy text-lg mb-1">Welcome! 👋</h4>
                                            <p className="text-xs text-slate-500">Please fill in your details to start chatting.</p>
                                        </div>
                                        <div className="space-y-3 flex-1">
                                            {widgetConfig.contactFields.name !== 'hidden' && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Name {widgetConfig.contactFields.name === 'required' && '*'}</label>
                                                    <input type="text" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" placeholder="John Doe" disabled />
                                                </div>
                                            )}
                                            {widgetConfig.contactFields.email !== 'hidden' && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Email {widgetConfig.contactFields.email === 'required' && '*'}</label>
                                                    <input type="email" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" placeholder="john@example.com" disabled />
                                                </div>
                                            )}
                                            {widgetConfig.contactFields.phone !== 'hidden' && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Phone {widgetConfig.contactFields.phone === 'required' && '*'}</label>
                                                    <input type="tel" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" placeholder="+1 (555) 000-0000" disabled />
                                                </div>
                                            )}
                                        </div>
                                        <button className="w-full py-3 rounded-xl font-bold text-white text-sm mt-4" style={{ backgroundColor: widgetConfig.color }}>
                                            Start Chatting
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-end gap-2">
                                            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: widgetConfig.color }}>
                                                AI
                                            </div>
                                            <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-bl-none text-sm text-slate-600 shadow-sm max-w-[85%]">
                                                {widgetConfig.welcomeMessage}
                                            </div>
                                        </div>

                                        {/* Mock User Message if Conversational */}
                                        <div className="opacity-50 flex items-end justify-end gap-2">
                                            <div className="bg-slate-200 p-3 rounded-2xl rounded-br-none text-sm text-slate-600 max-w-[85%]">
                                                I'd like to book an appointment.
                                            </div>
                                        </div>
                                        <div className="opacity-50 flex items-end gap-2">
                                            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: widgetConfig.color }}>
                                                AI
                                            </div>
                                            <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-bl-none text-sm text-slate-600 shadow-sm max-w-[85%]">
                                                Great! I can help with that. What is your phone number?
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer / Input */}
                            <div className="p-3 bg-white border-t border-slate-100 shrink-0">
                                <div className="h-10 bg-slate-50 rounded-full border border-slate-200 flex items-center px-4 text-xs text-slate-400">
                                    Type a message...
                                </div>
                                <div className="text-[9px] text-center text-slate-300 mt-2 font-medium">Powered by Agent X</div>
                            </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
