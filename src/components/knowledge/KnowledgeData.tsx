
import React, { useState } from 'react';
import { Tag, DollarSign, ShieldCheck, Edit2, Save, X, CheckSquare, Plus, MapPin, Trash2, Clock, ListChecks } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { KnowledgeBaseData, PricingPlan, BusinessLocation, Service } from '../../types';
import { createEmptyService, formatServicePrice } from '../../utils/serviceUtils';

export const KnowledgeData = () => {
    const { knowledgeData, setKnowledgeData } = useData();
    const [editingSection, setEditingSection] = useState<keyof KnowledgeBaseData | null>(null);
    const [tempValue, setTempValue] = useState<any>('');

    if (!knowledgeData) {
        return (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 animate-in fade-in">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Tag className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">No Knowledge Data Yet</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                    Complete the onboarding wizard to populate your knowledge base with services, pricing, and policies.
                </p>
            </div>
        );
    }


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
            [editingSection]: finalValue,
            lastUpdated: new Date()
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
                <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-md text-slate-700">{icon}</div>
                            <h3 className="font-semibold text-slate-800">{title}</h3>
                        </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={cancelEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                            <button onClick={saveEditing} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg transition-colors">Save</button>
                        </div>
                    ) : (
                        <button onClick={() => startEditing(field, content)} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Edit</button>
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
                                <div key={idx} className="border border-slate-200 rounded-lg p-5 bg-white">
                                    <h4 className="font-semibold text-slate-800 text-base">{plan.name}</h4>
                                    <p className="text-slate-700 font-semibold text-lg mb-4">{plan.price}</p>
                                    <ul className="space-y-2">
                                        {plan.features.map((feature, fIdx) => (
                                            <li key={fIdx} className="flex items-start gap-2 text-xs text-slate-600 font-medium">
                                                <CheckSquare className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
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

        // Custom Renderer for Services (objects with id, name, pricing, description)
        if (field === 'services' && Array.isArray(content) && content.length > 0 && typeof content[0] === 'object' && 'pricing' in content[0]) {
            const [isEditing, setIsEditing] = useState(false);
            const [services, setServices] = useState<Service[]>([]);
            const [newService, setNewService] = useState('');

            const startEditing = () => {
                setServices([...(content as Service[])]);
                setIsEditing(true);
            };

            const saveServices = () => {
                setKnowledgeData({ ...knowledgeData!, services, lastUpdated: new Date() });
                setIsEditing(false);
            };

            const addService = () => {
                const trimmed = newService.trim();
                if (!trimmed) return;
                const exists = services.some((svc) => svc.name.toLowerCase() === trimmed.toLowerCase());
                if (exists) return;
                const newSvc = createEmptyService();
                newSvc.name = trimmed;
                setServices([...services, newSvc]);
                setNewService('');
            };

            const removeService = (idx: number) => {
                setServices(services.filter((_, i) => i !== idx));
            };

            return (
            <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-md text-slate-700">{icon}</div>
                        <div>
                            <h3 className="font-semibold text-slate-800">{title}</h3>
                            <span className="text-xs text-slate-500">{content.length} services</span>
                        </div>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                Cancel
                            </button>
                            <button onClick={saveServices} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg transition-colors">
                                Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                            Edit
                        </button>
                    )}
                </div>
                {isEditing ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {services.map((svc, idx) => (
                                <span key={svc.id || idx} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold flex items-center gap-2">
                                    {svc.name || 'Untitled'}
                                    <button onClick={() => removeService(idx)} className="hover:text-red-500 transition-colors">
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newService}
                                onChange={(e) => setNewService(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addService()}
                                placeholder="Add a service..."
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-chippy-coral outline-none"
                            />
                            <button onClick={addService} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                                <Plus className="w-4 h-4" /> Add
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">
                            This edits service names. Pricing and details stay unchanged for existing services.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {(content as Service[]).map((service) => (
                                <div key={service.id} className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                                    <h4 className="font-semibold text-slate-800 text-sm mb-1">{service.name}</h4>
                                    {service.description && (
                                        <p className="text-xs text-slate-500 mb-2 line-clamp-2">{service.description}</p>
                                    )}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-700">{formatServicePrice(service.pricing)}</span>
                                        {service.duration && (
                                            <span className="text-slate-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {service.duration} min
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
            );
        }

        // Custom Renderer for Services (string list) with keyword-like edit
        if (field === 'services' && Array.isArray(content)) {
            const services = content as string[];
            const [newService, setNewService] = useState('');
            const isEditing = editingSection === field;

            const addService = () => {
                if (!newService.trim()) return;
                if (Array.isArray(tempValue)) {
                    setTempValue([...tempValue, newService.trim()]);
                } else {
                    setTempValue([newService.trim()]);
                }
                setNewService('');
            };

            const removeService = (idx: number) => {
                if (!Array.isArray(tempValue)) return;
                setTempValue(tempValue.filter((_: string, i: number) => i !== idx));
            };

            return (
                <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                                {icon}
                            </div>
                            <h3 className="font-semibold text-slate-800">{title}</h3>
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
                            <button onClick={() => startEditing(field, content)} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                Edit
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {(Array.isArray(tempValue) ? tempValue : services).map((svc: string, idx: number) => (
                                    <span key={idx} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold flex items-center gap-2">
                                        {svc}
                                        <button onClick={() => removeService(idx)} className="hover:text-red-500 transition-colors">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newService}
                                    onChange={(e) => setNewService(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addService()}
                                    placeholder="Add a service..."
                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-chippy-coral outline-none"
                                />
                                <button onClick={addService} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {(services || []).length > 0 ? (
                                services.map((svc, idx) => (
                                    <span key={idx} className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-600">
                                        {svc}
                                    </span>
                                ))
                            ) : (
                                <span className="text-slate-400 italic text-sm">No services added yet.</span>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                            {icon}
                        </div>
                        <h3 className="font-semibold text-slate-800">{title}</h3>
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
                        <button onClick={() => startEditing(field, content)} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                            Edit
                        </button>
                    )}
                </div>

                <div className="pl-[3.25rem]">
                    {isEditing ? (
                            <textarea
                                value={tempValue}
                                onChange={(e) => setTempValue(e.target.value)}
                                className="w-full h-32 p-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-chippy-coral outline-none resize-none"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="lg:col-span-2 space-y-6">
                <TopRulesSection />

                <RenderSection
                    title="Services & Offerings"
                    icon={<Tag className="w-5 h-5" />}
                    field="services"
                    content={knowledgeData.services}
                />

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
            </div>

            <div className="space-y-6">
                <RenderSection
                    title="Contact Info"
                    icon={<Tag className="w-5 h-5" />}
                    field="contactInfo"
                    content={knowledgeData.contactInfo}
                />

                <LocationsSection />
            </div>
        </div>
    );

    // Top Rules Section Component - Priority instructions for the AI
    function TopRulesSection() {
        const [isEditing, setIsEditing] = useState(false);
        const [topRules, setTopRules] = useState('');

        const startEditing = () => {
            setTopRules(knowledgeData?.topRules || '');
            setIsEditing(true);
        };

        const saveTopRules = () => {
            setKnowledgeData({ ...knowledgeData!, topRules, lastUpdated: new Date() });
            setIsEditing(false);
        };

        const rulesArray = (knowledgeData?.topRules || '').split('\n').filter(r => r.trim());

        return (
            <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all hover:bg-slate-50/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                            <ListChecks className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800">Top Rules</h3>
                            <p className="text-xs text-slate-500">Priority instructions your AI will always follow</p>
                        </div>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                Cancel
                            </button>
                            <button onClick={saveTopRules} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg transition-colors">
                                Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                            Edit
                        </button>
                    )}
                </div>

                <div className="pl-[3.25rem]">
                    {isEditing ? (
                        <div className="space-y-2">
                            <textarea
                                value={topRules}
                                onChange={(e) => setTopRules(e.target.value)}
                                className="w-full h-40 p-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-chippy-coral outline-none resize-none font-mono"
                                placeholder="Enter one rule per line, e.g.:
Always greet customers warmly
Never discuss competitor pricing
Prioritize booking appointments over general chat
Always confirm the service before booking"
                            />
                            <p className="text-xs text-slate-400">Enter one rule per line (max 10 recommended).</p>
                        </div>
                    ) : rulesArray.length > 0 ? (
                        <ul className="space-y-2">
                            {rulesArray.map((rule, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                                    <span className="w-5 h-5 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                                        {idx + 1}
                                    </span>
                                    <span>{rule}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-400 italic text-sm">
                            No rules set yet. Add priority instructions to customize how your AI responds.
                        </p>
                    )}
                </div>
            </div>
        );
    }

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
            setKnowledgeData({ ...knowledgeData!, keywords, lastUpdated: new Date() });
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
            <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all hover:bg-slate-50/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                            <Tag className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-slate-800">Keywords</h3>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                Cancel
                            </button>
                            <button onClick={saveKeywords} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg transition-colors">
                                Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                            Edit
                        </button>
                    )}
                </div>

                <div className="pl-[3.25rem]">
                    {isEditing ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {keywords.map((kw, idx) => (
                                    <span key={idx} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold flex items-center gap-2">
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
                                <button onClick={addKeyword} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
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
            setKnowledgeData({ ...knowledgeData!, locations, lastUpdated: new Date() });
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
            <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-slate-800">Business Locations</h3>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                Cancel
                            </button>
                            <button onClick={saveLocations} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg transition-colors">
                                Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                            Edit
                        </button>
                    )}
                </div>

                {isEditing ? (
                    <div className="space-y-4">
                        {locations.map((loc, idx) => (
                            <div key={idx} className="p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
                                <div className="flex justify-between items-center">
                                    <input
                                        type="text"
                                        value={loc.name}
                                        onChange={(e) => updateLocation(idx, 'name', e.target.value)}
                                        className="font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
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
                        <button onClick={addLocation} className="w-full py-3 border border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors font-semibold text-sm flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" /> Add Location
                        </button>
                    </div>
                ) : (
                    displayLocations.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4">
                            {displayLocations.map((loc, idx) => (
                                <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                    <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-slate-500" />
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
