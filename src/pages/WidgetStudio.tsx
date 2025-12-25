import React, { useState } from 'react';
import { Palette, Zap, User, Mail, Phone, BrainCircuit, X, Eye, MessageSquare, Layout, FormInput, MessageCircle } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { ContactFieldSelector } from '../components/ui/Shared';
import { ContactFieldRequirement, LeadCaptureMode } from '../types';

export const WidgetStudio = () => {
    const { widgetConfig, setWidgetConfig } = useData();
    const [activeTab, setActiveTab] = useState<'appearance' | 'behavior'>('appearance');

    const updateContactField = (field: keyof typeof widgetConfig.contactFields, value: ContactFieldRequirement) => {
        setWidgetConfig(prev => ({
            ...prev,
            contactFields: { ...prev.contactFields, [field]: value }
        }));
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <header className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-chippy-navy tracking-tight">Widget Studio</h2>
                    <p className="text-slate-500">Customize how Agent X looks and behaves on your site.</p>
                </div>
                <div className="bg-white border border-slate-200 p-1 rounded-xl flex gap-1">
                    <button
                        onClick={() => setActiveTab('appearance')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'appearance' ? 'bg-chippy-navy text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Palette className="w-4 h-4" /> Appearance
                    </button>
                    <button
                        onClick={() => setActiveTab('behavior')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'behavior' ? 'bg-chippy-navy text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Zap className="w-4 h-4" /> Behavior
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Configuration Panel */}
                <div className="lg:col-span-5 space-y-6">
                    {activeTab === 'appearance' ? (
                        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
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

                            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
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
                    ) : (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
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

                            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                                <h3 className="font-bold text-lg text-chippy-navy mb-4">Required Fields</h3>
                                <ContactFieldSelector label="Name" icon={<User className="w-4 h-4" />} value={widgetConfig.contactFields.name} onChange={(v) => updateContactField('name', v)} />
                                <ContactFieldSelector label="Email" icon={<Mail className="w-4 h-4" />} value={widgetConfig.contactFields.email} onChange={(v) => updateContactField('email', v)} />
                                <ContactFieldSelector label="Phone" icon={<Phone className="w-4 h-4" />} value={widgetConfig.contactFields.phone} onChange={(v) => updateContactField('phone', v)} />
                            </div>

                            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                                <h3 className="font-bold text-lg text-chippy-navy">Welcome Message</h3>
                                <textarea
                                    className="w-full h-32 p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral text-sm resize-none"
                                    value={widgetConfig.welcomeMessage}
                                    onChange={(e) => setWidgetConfig({ ...widgetConfig, welcomeMessage: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Panel */}
                <div className="lg:col-span-7 sticky top-8">
                    <div className="bg-slate-900 rounded-[3rem] p-8 md:p-12 border border-slate-800 flex items-center justify-center relative min-h-[600px] overflow-hidden">
                        {/* Background Pattern */}
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

                        <div className="absolute top-8 left-8 text-white/30 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Eye className="w-4 h-4" /> Live Preview
                        </div>

                        {/* Widget Mockup */}
                        <div className={`w-full max-w-[340px] bg-white rounded-[24px] shadow-2xl overflow-hidden border border-slate-200 flex flex-col h-[600px] transition-all duration-500 ${widgetConfig.position === 'left' ? '-translate-x-8' : 'translate-x-0'}`}>
                            {/* Header */}
                            <div className="p-5 text-white flex items-center justify-between shrink-0" style={{ backgroundColor: widgetConfig.color }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                        <BrainCircuit className="w-5 h-5" />
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
                </div>
            </div>
        </div>
    );
};
