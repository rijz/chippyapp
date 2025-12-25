
import React, { useState, useEffect } from 'react';
import { Tag, DollarSign, ShieldCheck, Edit2, Save, X, CheckSquare } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { KnowledgeBaseData, PricingPlan } from '../../types';

export const KnowledgeData = () => {
    const { knowledgeData, setKnowledgeData } = useData();
    const [editingSection, setEditingSection] = useState<keyof KnowledgeBaseData | null>(null);
    const [tempValue, setTempValue] = useState<any>('');

    // DEMO: Automatically upgrade pricing to structured data if it's currently a simple string
    // This ensures the user sees the new layout immediately.
    useEffect(() => {
        if (knowledgeData && typeof knowledgeData.pricing === 'string') {
            const structuredPricing: PricingPlan[] = [
                {
                    name: "Basic Plan",
                    price: "$29/mo",
                    features: ["24/7 AI Chat", "Basic Analytics", "Email Support", "1 User Seat"]
                },
                {
                    name: "Pro Plan",
                    price: "$79/mo",
                    features: ["Everything in Basic", "Advanced Analytics", "Custom Branding", "Priority Support", "5 User Seats"]
                },
                {
                    name: "Enterprise",
                    price: "Contact Us",
                    features: ["Unlimited Seats", "Dedicated Account Manager", "SSO Integration", "SLA Guarantee", "Custom AI Model Training"]
                }
            ];
            setKnowledgeData(prev => prev ? ({ ...prev, pricing: structuredPricing }) : null);
        }
    }, [knowledgeData, setKnowledgeData]);


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
        </div>
    );
};

