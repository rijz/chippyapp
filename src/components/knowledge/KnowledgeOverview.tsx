
import React, { useState } from 'react';
import { Phone, Globe, Calendar, Save, X, MapPin } from 'lucide-react';
import { useData } from '../../contexts/DataContext';

export const KnowledgeOverview = () => {
    const { knowledgeData, setKnowledgeData, tenantConfig, setTenantConfig } = useData();
    const [isEditing, setIsEditing] = useState(false);

    // Temp state for editing
    const [companyName, setCompanyName] = useState('');
    const [summary, setSummary] = useState('');
    const [category, setCategory] = useState('');
    const [website, setWebsite] = useState('');
    const [phone, setPhone] = useState('');
    const [hoursByDay, setHoursByDay] = useState<Record<string, string>>({});

    if (!knowledgeData) return null;

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const startEditing = () => {
        setCompanyName(tenantConfig.companyName || '');
        setSummary(knowledgeData.summary || '');
        setCategory(knowledgeData.businessCategory || '');
        setWebsite(tenantConfig.companyUrl);
        setPhone(knowledgeData.phoneNumber || '');
        if (knowledgeData.businessHoursByDay && Object.keys(knowledgeData.businessHoursByDay).length > 0) {
            setHoursByDay({ ...knowledgeData.businessHoursByDay });
        } else if (knowledgeData.businessHours) {
            const legacyHours = knowledgeData.businessHours;
            const seeded = days.reduce((acc, day) => {
                acc[day] = legacyHours;
                return acc;
            }, {} as Record<string, string>);
            setHoursByDay(seeded);
        } else {
            setHoursByDay(days.reduce((acc, day) => {
                acc[day] = '';
                return acc;
            }, {} as Record<string, string>));
        }
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setIsEditing(false);
    };

    const saveEditing = () => {
        const normalizedHours = days.reduce((acc, day) => {
            const value = hoursByDay[day]?.trim() || '';
            acc[day] = value;
            return acc;
        }, {} as Record<string, string>);
        const hoursSummary = days
            .filter(day => normalizedHours[day])
            .map(day => `${day}: ${normalizedHours[day]}`)
            .join('; ');

        setKnowledgeData({
            ...knowledgeData,
            summary,
            businessCategory: category,
            phoneNumber: phone,
            businessHours: hoursSummary || null,
            businessHoursByDay: normalizedHours,
            lastUpdated: new Date()
        });
        setTenantConfig({
            ...tenantConfig,
            companyUrl: website,
            companyName: companyName || tenantConfig.companyName
        });
        setIsEditing(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
                <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-800">Business Profile</h3>
                                    <p className="text-xs text-slate-500">Core identity and summary</p>
                                </div>
                            </div>
                            {isEditing ? (
                                <div className="flex gap-2">
                                    <button onClick={cancelEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                        Cancel
                                    </button>
                                    <button onClick={saveEditing} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg transition-colors">
                                        Save
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={startEditing}
                                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    Edit
                                </button>
                            )}
                        </div>

                        <div>
                            {isEditing ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        className="w-full max-w-lg bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-chippy-coral outline-none"
                                        placeholder="Business name"
                                    />
                                    <input
                                        type="text"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full max-w-lg bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:ring-2 focus:ring-chippy-coral outline-none"
                                        placeholder="Business category"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <p className="text-sm text-slate-500">{knowledgeData.businessCategory || 'Business category not set'}</p>
                                </div>
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

                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                                <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">Hours</h3>
                                <p className="text-xs text-slate-500">Weekly schedule</p>
                            </div>
                        </div>
                    {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {days.map(day => {
                                const currentValue = (hoursByDay[day] || '').trim().toLowerCase();
                                const isClosed = currentValue === 'closed';
                                const isHoliday = currentValue === 'holiday';
                                const isDisabled = isClosed || isHoliday;
                                return (
                                    <div key={day} className="flex items-center gap-3">
                                        <span className="w-12 text-xs font-semibold text-slate-600">{day}</span>
                                        <input
                                            type="text"
                                            value={hoursByDay[day] || ''}
                                            onChange={(e) => setHoursByDay(prev => ({ ...prev, [day]: e.target.value }))}
                                            className={`flex-1 border rounded-lg px-3 py-2 text-xs ${isDisabled ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200'}`}
                                            placeholder="9:00 AM - 5:00 PM"
                                            disabled={isDisabled}
                                        />
                                        <label className="flex items-center gap-2 text-xs text-slate-500">
                                            <input
                                                type="checkbox"
                                                checked={isClosed}
                                                onChange={(e) => setHoursByDay(prev => ({ ...prev, [day]: e.target.checked ? 'Closed' : '' }))}
                                                className="h-4 w-4 accent-slate-900"
                                            />
                                            Closed
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-slate-500">
                                            <input
                                                type="checkbox"
                                                checked={isHoliday}
                                                onChange={(e) => setHoursByDay(prev => ({ ...prev, [day]: e.target.checked ? 'Holiday' : '' }))}
                                                className="h-4 w-4 accent-slate-900"
                                            />
                                            Holiday
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {knowledgeData.businessHoursByDay && Object.keys(knowledgeData.businessHoursByDay).length > 0 ? (
                                    days.map(day => (
                                        <div key={day} className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                            <span className="font-semibold text-slate-500">{day}</span>
                                            <span>{knowledgeData.businessHoursByDay?.[day] || 'Closed'}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-slate-600">{knowledgeData.businessHours || 'Not detected'}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                                <Globe className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">Contact</h3>
                                <p className="text-xs text-slate-500">Public business contact</p>
                            </div>
                        </div>
                        {isEditing ? (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                                    placeholder="Website"
                                />
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                                    placeholder="Phone"
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="text-sm text-slate-700 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-slate-400" />
                                    <span className="truncate">{tenantConfig.companyUrl || 'Not set'}</span>
                                </div>
                                <div className="text-sm text-slate-700 flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-slate-400" />
                                    <span className="truncate">{knowledgeData.phoneNumber || 'Not detected'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">Location</h3>
                                <p className="text-xs text-slate-500">Primary location</p>
                            </div>
                        </div>
                        <div className="text-sm text-slate-700 flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                            <span className="leading-relaxed">
                                {knowledgeData.locations?.[0]
                                    ? `${knowledgeData.locations[0].address || ''}${knowledgeData.locations[0].city ? `, ${knowledgeData.locations[0].city}` : ''}${knowledgeData.locations[0].state ? `, ${knowledgeData.locations[0].state}` : ''}${knowledgeData.locations[0].zip ? ` ${knowledgeData.locations[0].zip}` : ''}`
                                    : 'Not set'}
                            </span>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                                <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">At a glance</h3>
                                <p className="text-xs text-slate-500">Quick metrics</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg bg-white border border-slate-200 p-3">
                                <p className="text-lg font-semibold text-chippy-navy">{knowledgeData.services.length}</p>
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Services</p>
                            </div>
                            <div className="rounded-lg bg-white border border-slate-200 p-3">
                                <p className="text-lg font-semibold text-chippy-navy">{(Array.isArray(knowledgeData.pricing) ? knowledgeData.pricing.length > 0 : !!knowledgeData.pricing) ? 'Yes' : 'No'}</p>
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pricing</p>
                            </div>
                            <div className="rounded-lg bg-white border border-slate-200 p-3">
                                <p className="text-lg font-semibold text-chippy-navy">{knowledgeData.policies ? 'Yes' : 'No'}</p>
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Policies</p>
                            </div>
                            <div className="rounded-lg bg-white border border-slate-200 p-3">
                                <p className="text-lg font-semibold text-chippy-navy">{(knowledgeData.sources?.length || 0)}</p>
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sources</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
