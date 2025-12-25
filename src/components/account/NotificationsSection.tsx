import React, { useState } from 'react';
import { Bell, Mail, MessageSquare } from 'lucide-react';

const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
        onClick={onChange}
        className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${enabled ? 'bg-chippy-coral' : 'bg-slate-300'}`}
    >
        <span className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${enabled ? 'translate-x-[20px]' : 'translate-x-0'}`} />
    </button>
);

export const NotificationsSection = () => {
    // Mock state - in real app would sync with TenantConfig
    const [settings, setSettings] = useState({
        marketingEmails: true,
        securityAlerts: true,
        newLeads: true,
        dailyDigest: false,
    });

    const toggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div>
                <h2 className="text-xl font-bold text-chippy-navy">Notifications</h2>
                <p className="text-slate-500 text-sm">Choose what you want to be notified about.</p>
            </div>

            <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-6 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Mail className="w-4 h-4 text-chippy-coral" />
                            <h4 className="font-bold text-chippy-navy">Marketing Emails</h4>
                        </div>
                        <p className="text-sm text-slate-500">Receive news, updates, and product tips from Chippy.</p>
                    </div>
                    <Toggle enabled={settings.marketingEmails} onChange={() => toggle('marketingEmails')} />
                </div>

                <div className="p-6 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldIcon className="w-4 h-4 text-emerald-500" />
                            <h4 className="font-bold text-chippy-navy">Security Alerts</h4>
                        </div>
                        <p className="text-sm text-slate-500">Get notified about important security events.</p>
                    </div>
                    <Toggle enabled={settings.securityAlerts} onChange={() => toggle('securityAlerts')} />
                </div>

                <div className="p-6 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-4 h-4 text-blue-500" />
                            <h4 className="font-bold text-chippy-navy">New Lead Alerts</h4>
                        </div>
                        <p className="text-sm text-slate-500">Instant notification when a new lead is captured.</p>
                    </div>
                    <Toggle enabled={settings.newLeads} onChange={() => toggle('newLeads')} />
                </div>

                <div className="p-6 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Bell className="w-4 h-4 text-amber-500" />
                            <h4 className="font-bold text-chippy-navy">Daily Digest</h4>
                        </div>
                        <p className="text-sm text-slate-500">A daily summary of your agent's performance.</p>
                    </div>
                    <Toggle enabled={settings.dailyDigest} onChange={() => toggle('dailyDigest')} />
                </div>
            </div>
        </div>
    );
};

// Helper for icon
const ShieldIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);
