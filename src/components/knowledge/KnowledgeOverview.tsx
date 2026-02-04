
import React, { useState } from 'react';
import { Phone, Globe, Calendar, Edit2, Save, X } from 'lucide-react';
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
            {/* Identity + Summary */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 relative group">
                <div className="absolute top-5 right-5 z-20">
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={cancelEditing} className="p-2 text-slate-400 hover:bg-slate-100 rounded-md transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={saveEditing} className="p-2 bg-slate-900 text-white rounded-md transition-colors">
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="p-2 text-slate-300 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-2 space-y-3">
                        <div>
                            <h2 className="text-2xl font-bold text-chippy-navy">{tenantConfig.companyName}</h2>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="mt-1 w-full max-w-sm bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-600 focus:ring-2 focus:ring-chippy-coral outline-none"
                                    placeholder="Business category"
                                />
                            ) : (
                                <p className="text-slate-500 text-sm">{knowledgeData.businessCategory || 'Business category not set'}</p>
                            )}
                        </div>

                        {isEditing ? (
                            <textarea
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                className="w-full h-28 p-3 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-chippy-coral outline-none resize-none"
                                placeholder="Business summary..."
                            />
                        ) : (
                            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-200">
                                {knowledgeData.summary}
                            </p>
                        )}
                    </div>

                    <div className="space-y-3">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 text-xs uppercase text-slate-400 font-semibold">
                                <Globe className="w-4 h-4" /> Website
                            </div>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    className="mt-1 w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                                />
                            ) : (
                                <p className="text-sm text-slate-700 truncate mt-1">{tenantConfig.companyUrl || 'Not set'}</p>
                            )}
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 text-xs uppercase text-slate-400 font-semibold">
                                <Phone className="w-4 h-4" /> Phone
                            </div>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="mt-1 w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                                />
                            ) : (
                                <p className="text-sm text-slate-700 truncate mt-1">{knowledgeData.phoneNumber || 'Not detected'}</p>
                            )}
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 text-xs uppercase text-slate-400 font-semibold">
                                <Calendar className="w-4 h-4" /> Hours
                            </div>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={hours}
                                    onChange={(e) => setHours(e.target.value)}
                                    className="mt-1 w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                                />
                            ) : (
                                <p className="text-sm text-slate-700 truncate mt-1">{knowledgeData.businessHours || 'Not detected'}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <p className="text-2xl font-semibold text-chippy-navy">{knowledgeData.services.length}</p>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Services</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <p className="text-2xl font-semibold text-chippy-navy">{(Array.isArray(knowledgeData.pricing) ? knowledgeData.pricing.length > 0 : !!knowledgeData.pricing) ? 'Yes' : 'No'}</p>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pricing</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <p className="text-2xl font-semibold text-chippy-navy">{knowledgeData.policies ? 'Yes' : 'No'}</p>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Policies</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <p className="text-2xl font-semibold text-chippy-navy">{(knowledgeData.sources?.length || 0)}</p>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sources</p>
                </div>
            </div>
        </div>
    );
};
