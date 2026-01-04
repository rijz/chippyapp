
import React, { useState } from 'react';
import { Building, MapPin, Phone, Globe, Calendar, Layers, Edit2, Save, X } from 'lucide-react';
import { useData } from '../../contexts/DataContext';

export const KnowledgeOverview = () => {
    const { knowledgeData, setKnowledgeData, tenantConfig, setTenantConfig } = useData();
    const [isEditing, setIsEditing] = useState(false);

    // Temp state for editing
    const [summary, setSummary] = useState('');
    const [category, setCategory] = useState('');
    const [website, setWebsite] = useState('');
    const [phone, setPhone] = useState('');
    const [hours, setHours] = useState('');

    if (!knowledgeData) return null;

    const startEditing = () => {
        setSummary(knowledgeData.summary || '');
        setCategory(knowledgeData.businessCategory || '');
        setWebsite(tenantConfig.companyUrl);
        setPhone(knowledgeData.phoneNumber || '');
        setHours(knowledgeData.businessHours || '');
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setIsEditing(false);
    };

    const saveEditing = () => {
        setKnowledgeData({
            ...knowledgeData,
            summary,
            businessCategory: category,
            phoneNumber: phone,
            businessHours: hours
        });
        setTenantConfig({
            ...tenantConfig,
            companyUrl: website
        });
        setIsEditing(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Identity Card */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-5">
                    <Building className="w-40 h-40 text-chippy-navy" />
                </div>

                {/* Actions */}
                <div className="absolute top-8 right-8 z-20">
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={cancelEditing} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                            <button onClick={saveEditing} className="p-2 bg-chippy-navy text-white hover:bg-chippy-coral rounded-lg transition-colors shadow-lg">
                                <Save className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="p-2 text-slate-300 hover:text-chippy-navy hover:bg-slate-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                            <Edit2 className="w-5 h-5" />
                        </button>
                    )}
                </div>

                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
                    <div className="w-24 h-24 bg-chippy-navy rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-xl shrink-0">
                        {tenantConfig.companyName.charAt(0)}
                    </div>
                    <div className="space-y-4 max-w-2xl w-full">
                        <div>
                            <h2 className="text-3xl font-bold text-chippy-navy">{tenantConfig.companyName}</h2>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="mt-1 w-full max-w-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-chippy-coral outline-none"
                                    placeholder="e.g., Hair Salon, Dental Clinic"
                                />
                            ) : (
                                <p className="text-slate-500 font-medium">{knowledgeData.businessCategory || 'Business Category Unspecified'}</p>
                            )}
                        </div>

                        {isEditing ? (
                            <textarea
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                className="w-full h-32 p-3 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-chippy-coral outline-none resize-none"
                                placeholder="Business summary..."
                            />
                        ) : (
                            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                                {knowledgeData.summary}
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                        <Globe className="w-5 h-5 text-chippy-coral shrink-0" />
                        <div className="overflow-hidden w-full">
                            <p className="text-[10px] uppercase font-black text-slate-400">Website</p>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-chippy-navy"
                                />
                            ) : (
                                <p className="text-sm font-bold text-chippy-navy truncate">{tenantConfig.companyUrl}</p>
                            )}
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                        <Phone className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div className="overflow-hidden w-full">
                            <p className="text-[10px] uppercase font-black text-slate-400">Phone</p>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-chippy-navy"
                                />
                            ) : (
                                <p className="text-sm font-bold text-chippy-navy truncate">{knowledgeData.phoneNumber || 'Not detected'}</p>
                            )}
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-blue-500 shrink-0" />
                        <div className="overflow-hidden w-full">
                            <p className="text-[10px] uppercase font-black text-slate-400">Hours</p>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={hours}
                                    onChange={(e) => setHours(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-chippy-navy"
                                />
                            ) : (
                                <p className="text-sm font-bold text-chippy-navy truncate">{knowledgeData.businessHours || 'Not detected'}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats / Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <p className="text-4xl font-black text-chippy-navy mb-1">{knowledgeData.services.length}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase">Services Identified</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <p className="text-4xl font-black text-emerald-500 mb-1">{(Array.isArray(knowledgeData.pricing) ? knowledgeData.pricing.length > 0 : !!knowledgeData.pricing) ? 'Yes' : 'No'}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase">Pricing Found</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <p className="text-4xl font-black text-amber-500 mb-1">{knowledgeData.policies ? 'Yes' : 'No'}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase">Policies Found</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <p className="text-4xl font-black text-blue-500 mb-1">{(knowledgeData.sources?.length || 0)}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase">Source Docs</p>
                </div>
            </div>
        </div>
    );
};
