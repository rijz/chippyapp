
import React, { useState } from 'react';
import { Tag, DollarSign, ShieldCheck, Edit2, Save, X, CheckSquare, Plus, MapPin, Trash2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { KnowledgeBaseData, PricingPlan, BusinessLocation } from '../../types';

export const KnowledgeData = () => {
    const { knowledgeData, setKnowledgeData } = useData();
    const [editingSection, setEditingSection] = useState<keyof KnowledgeBaseData | null>(null);
    const [tempValue, setTempValue] = useState<any>('');


    if (!knowledgeData) return null;

    const startEditing = (section: keyof KnowledgeBaseData, value: any) => {
        setEditingSection(section);
        // Deep copy for arrays/objects to avoid reference issues
        setTempValue(JSON.parse(JSON.stringify(value)));
    };

    const cancelEditing = () => {
        setEditingSection(null);
        setTempValue('');
    };

    const saveEditing = () => {
        if (!editingSection) return;

        // Convert back to array for services if it's not pricing
        let finalValue: any = tempValue;
        if (editingSection === 'services' && typeof tempValue === 'string') {
            finalValue = tempValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }

        setKnowledgeData({
            ...knowledgeData,
            [editingSection]: finalValue
        });

        setEditingSection(null);
    };

    const handlePricingChange = (index: number, field: keyof PricingPlan, val: string) => {
        const newPricing = [...(tempValue as PricingPlan[])];
        if (field === 'features') {
            // Handle features parsing (comma or newline separated)
            newPricing[index].features = val.split(',').map(f => f.trim()).filter(f => f.length > 0);
        } else {
            // @ts-ignore
            newPricing[index][field] = val;
        }
        setTempValue(newPricing);
    };

    const RenderSection = ({ title, icon, field, content }: { title: string, icon: any, field: keyof KnowledgeBaseData, content: any }) => {
        const isEditing = editingSection === field;

        // Custom Renderer for Pricing Plans
        if (field === 'pricing' && Array.isArray(content) && typeof content[0] === 'object') {
            return (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-all hover:bg-slate-50/50">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg text-chippy-navy">{icon}</div>
                            <h3 className="font-bold text-chippy-navy">{title}</h3>
                        </div>
                        {isEditing ? (
                            <div className="flex gap-2">
                                <button onClick={cancelEditing} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                                <button onClick={saveEditing} className="p-2 bg-chippy-navy text-white hover:bg-chippy-coral rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <button onClick={() => startEditing(field, content)} className="p-2 text-slate-400 hover:text-chippy-navy hover:bg-slate-100 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(tempValue as PricingPlan[]).map((plan, idx) => (
                                <div key={idx} className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                                    <input
                                        type="text"
                                        value={plan.name}
                                        onChange={(e) => handlePricingChange(idx, 'name', e.target.value)}
                                        className="w-full p-2 text-sm font-bold border border-slate-300 rounded-lg"
                                        placeholder="Plan Name"
                                    />
                                    <input
                                        type="text"
                                        value={plan.price}
                                        onChange={(e) => handlePricingChange(idx, 'price', e.target.value)}
                                        className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                                        placeholder="Price"
                                    />
                                    <textarea
                                        value={plan.features.join(', ')}
                                        onChange={(e) => handlePricingChange(idx, 'features', e.target.value)}
                                        className="w-full p-2 text-xs border border-slate-300 rounded-lg h-20"
                                        placeholder="Features (comma separated)"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {(content as PricingPlan[]).map((plan, idx) => (
                                <div key={idx} className="border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow bg-white">
                                    <h4 className="font-bold text-chippy-navy text-lg">{plan.name}</h4>
                                    <p className="text-chippy-coral font-black text-xl mb-4">{plan.price}</p>
                                    <ul className="space-y-2">
                                        {plan.features.map((feature, fIdx) => (
                                            <li key={fIdx} className="flex items-start gap-2 text-xs text-slate-600 font-medium">
                                                <CheckSquare className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-all hover:bg-slate-50/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-chippy-navy">
                            {icon}
                        </div>
                        <h3 className="font-bold text-chippy-navy">{title}</h3>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={cancelEditing} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={saveEditing} className="p-2 bg-chippy-navy text-white hover:bg-chippy-coral rounded-lg transition-colors">
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => startEditing(field, content)} className="p-2 text-slate-400 hover:text-chippy-navy hover:bg-slate-100 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="pl-[3.25rem]">
                    {isEditing ? (
                        <textarea
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="w-full h-32 p-3 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-chippy-coral outline-none resize-none"
                            placeholder={Array.isArray(content) ? "Comma separated values..." : "Enter text..."}
                        />
                    ) : (
                        <div className={`text-sm text-slate-600 leading-relaxed whitespace-pre-wrap`}>
                            {Array.isArray(content) ? (
                                <div className="flex flex-wrap gap-2">
                                    {content.map((item: string, i: number) => (
                                        <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-500">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                content || <span className="text-slate-400 italic">No information available.</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <RenderSection
                title="Services & Offerings"
                icon={<Tag className="w-5 h-5" />}
                field="services"
                content={knowledgeData.services}
            />

            {/* Keywords Section */}
            <KeywordsSection />

            <RenderSection
                title="Pricing Information"
                icon={<DollarSign className="w-5 h-5" />}
                field="pricing"
                content={knowledgeData.pricing}
            />
            <RenderSection
                title="Business Policies"
                icon={<ShieldCheck className="w-5 h-5" />}
                field="policies"
                content={knowledgeData.policies}
            />
            <RenderSection
                title="Contact Info"
                icon={<Tag className="w-5 h-5" />}
                field="contactInfo"
                content={knowledgeData.contactInfo}
            />

            {/* Locations Section */}
            <LocationsSection />
        </div>
    );

    // Keywords Section Component
    function KeywordsSection() {
        const [isEditing, setIsEditing] = useState(false);
        const [keywords, setKeywords] = useState<string[]>([]);
        const [newKeyword, setNewKeyword] = useState('');

        const startEditing = () => {
            setKeywords([...(knowledgeData?.keywords || [])]);
            setIsEditing(true);
        };

        const saveKeywords = () => {
            setKnowledgeData({ ...knowledgeData!, keywords });
            setIsEditing(false);
        };

        const addKeyword = () => {
            if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
                setKeywords([...keywords, newKeyword.trim()]);
                setNewKeyword('');
            }
        };

        const removeKeyword = (idx: number) => {
            setKeywords(keywords.filter((_, i) => i !== idx));
        };

        return (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-all hover:bg-slate-50/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-chippy-navy">
                            <Tag className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-chippy-navy">Keywords</h3>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={saveKeywords} className="p-2 bg-chippy-navy text-white hover:bg-chippy-coral rounded-lg transition-colors">
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="p-2 text-slate-400 hover:text-chippy-navy hover:bg-slate-100 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="pl-[3.25rem]">
                    {isEditing ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {keywords.map((kw, idx) => (
                                    <span key={idx} className="px-3 py-1.5 bg-chippy-navy/10 text-chippy-navy rounded-full text-xs font-semibold flex items-center gap-2">
                                        {kw}
                                        <button onClick={() => removeKeyword(idx)} className="hover:text-red-500 transition-colors">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newKeyword}
                                    onChange={(e) => setNewKeyword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                                    placeholder="Add a keyword..."
                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-chippy-coral outline-none"
                                />
                                <button onClick={addKeyword} className="px-4 py-2 bg-chippy-coral text-white rounded-lg text-sm font-bold hover:bg-red-400 transition-colors flex items-center gap-1">
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {(knowledgeData?.keywords || []).length > 0 ? (
                                knowledgeData?.keywords.map((kw, idx) => (
                                    <span key={idx} className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-600">
                                        {kw}
                                    </span>
                                ))
                            ) : (
                                <span className="text-slate-400 italic text-sm">No keywords added yet.</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Locations Section Component
    function LocationsSection() {
        const [isEditing, setIsEditing] = useState(false);
        const [locations, setLocations] = useState<BusinessLocation[]>([]);

        const startEditing = () => {
            setLocations([...(knowledgeData?.locations || [])]);
            setIsEditing(true);
        };

        const saveLocations = () => {
            setKnowledgeData({ ...knowledgeData!, locations });
            setIsEditing(false);
        };

        const updateLocation = (idx: number, field: keyof BusinessLocation, value: string) => {
            const updated = [...locations];
            updated[idx] = { ...updated[idx], [field]: value };
            setLocations(updated);
        };

        const addLocation = () => {
            setLocations([...locations, { name: 'New Location', address: '', city: '', state: '', zip: '' }]);
        };

        const removeLocation = (idx: number) => {
            setLocations(locations.filter((_, i) => i !== idx));
        };

        const displayLocations = knowledgeData?.locations || [];

        return (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-all hover:bg-slate-50/50">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-chippy-navy">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-chippy-navy">Business Locations</h3>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={saveLocations} className="p-2 bg-chippy-navy text-white hover:bg-chippy-coral rounded-lg transition-colors">
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="p-2 text-slate-400 hover:text-chippy-navy hover:bg-slate-100 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {isEditing ? (
                    <div className="space-y-4">
                        {locations.map((loc, idx) => (
                            <div key={idx} className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                                <div className="flex justify-between items-center">
                                    <input
                                        type="text"
                                        value={loc.name}
                                        onChange={(e) => updateLocation(idx, 'name', e.target.value)}
                                        className="font-bold text-chippy-navy bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                                        placeholder="Location Name"
                                    />
                                    <button onClick={() => removeLocation(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input type="text" value={loc.address} onChange={(e) => updateLocation(idx, 'address', e.target.value)} placeholder="Street Address" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                                    <input type="text" value={loc.city} onChange={(e) => updateLocation(idx, 'city', e.target.value)} placeholder="City" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                                    <input type="text" value={loc.state} onChange={(e) => updateLocation(idx, 'state', e.target.value)} placeholder="State" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                                    <input type="text" value={loc.zip} onChange={(e) => updateLocation(idx, 'zip', e.target.value)} placeholder="ZIP" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                                    <input type="text" value={loc.phone || ''} onChange={(e) => updateLocation(idx, 'phone', e.target.value)} placeholder="Phone (optional)" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                                    <input type="text" value={loc.hours || ''} onChange={(e) => updateLocation(idx, 'hours', e.target.value)} placeholder="Hours (optional)" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                                </div>
                            </div>
                        ))}
                        <button onClick={addLocation} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-chippy-coral hover:text-chippy-coral transition-colors font-bold text-sm flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" /> Add Location
                        </button>
                    </div>
                ) : (
                    displayLocations.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {displayLocations.map((loc, idx) => (
                                <div key={idx} className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                                    <h4 className="font-bold text-chippy-navy mb-2 flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-chippy-coral" />
                                        {loc.name}
                                    </h4>
                                    <p className="text-sm text-slate-600">{loc.address}</p>
                                    <p className="text-sm text-slate-600">{loc.city}, {loc.state} {loc.zip}</p>
                                    {loc.phone && <p className="text-sm text-slate-500 mt-2">📞 {loc.phone}</p>}
                                    {loc.hours && <p className="text-sm text-slate-500">🕐 {loc.hours}</p>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-400 italic text-sm pl-[3.25rem]">No locations found. Add your business locations to help customers find you.</p>
                    )
                )}
            </div>
        );
    }
};

