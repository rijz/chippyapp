import React, { useState } from 'react';
import { DollarSign, Edit2, Save, X, Plus, Trash2, Tag, Package } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Service, ServicePricing, PricingPlan } from '../../types';
import { createEmptyService, formatServicePrice } from '../../utils/serviceUtils';

export const PricingModels = () => {
    const { knowledgeData, setKnowledgeData } = useData();
    const [editingSection, setEditingSection] = useState<'services' | 'plans' | null>(null);
    const [editServices, setEditServices] = useState<Service[]>([]);
    const [editPlans, setEditPlans] = useState<PricingPlan[]>([]);

    if (!knowledgeData) {
        return (
            <div className="bg-white p-16 text-center rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400">No knowledge data available</p>
            </div>
        );
    }

    const pricingTypes: { value: ServicePricing['type']; label: string }[] = [
        { value: 'fixed', label: 'Fixed Price' },
        { value: 'starting_from', label: 'Starting From' },
        { value: 'hourly', label: 'Per Hour' },
        { value: 'per_session', label: 'Per Session' },
        { value: 'per_project', label: 'Per Project' },
        { value: 'per_day', label: 'Per Day' },
        { value: 'per_week', label: 'Per Week' },
        { value: 'per_month', label: 'Per Month' },
        { value: 'subscription', label: 'Subscription' },
        { value: 'per_unit', label: 'Per Unit' },
        { value: 'custom', label: 'Custom Text' },
        { value: 'contact', label: 'Contact for Price' },
    ];

    // Service Pricing Editor
    const startEditingServices = () => {
        setEditServices(knowledgeData.services || []);
        setEditingSection('services');
    };

    const saveServices = () => {
        setKnowledgeData({ ...knowledgeData, services: editServices });
        setEditingSection(null);
    };

    const updateServicePricing = (idx: number, field: keyof ServicePricing, value: any) => {
        setEditServices(prev => prev.map((s, i) =>
            i === idx ? { ...s, pricing: { ...s.pricing, [field]: value } } : s
        ));
    };

    const updateServiceField = (idx: number, field: keyof Service, value: any) => {
        setEditServices(prev => prev.map((s, i) =>
            i === idx ? { ...s, [field]: value } : s
        ));
    };

    const addService = () => {
        setEditServices(prev => [...prev, createEmptyService()]);
    };

    const removeService = (idx: number) => {
        setEditServices(prev => prev.filter((_, i) => i !== idx));
    };

    // Pricing Plans Editor
    const plans = Array.isArray(knowledgeData.pricing) ? knowledgeData.pricing : [];

    const startEditingPlans = () => {
        setEditPlans(plans);
        setEditingSection('plans');
    };

    const savePlans = () => {
        setKnowledgeData({ ...knowledgeData, pricing: editPlans.length > 0 ? editPlans : null });
        setEditingSection(null);
    };

    const updatePlan = (idx: number, field: keyof PricingPlan, value: any) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === idx ? { ...p, [field]: value } : p
        ));
    };

    const addPlan = () => {
        setEditPlans(prev => [...prev, { name: 'New Plan', price: '$0', features: [] }]);
    };

    const removePlan = (idx: number) => {
        setEditPlans(prev => prev.filter((_, i) => i !== idx));
    };

    const addFeature = (planIdx: number) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === planIdx ? { ...p, features: [...p.features, 'New feature'] } : p
        ));
    };

    const updateFeature = (planIdx: number, featureIdx: number, value: string) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === planIdx ? {
                ...p,
                features: p.features.map((f, j) => j === featureIdx ? value : f)
            } : p
        ));
    };

    const removeFeature = (planIdx: number, featureIdx: number) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === planIdx ? {
                ...p,
                features: p.features.filter((_, j) => j !== featureIdx)
            } : p
        ));
    };

    const services = knowledgeData.services || [];
    const servicesWithPricing = services.filter(s => s.pricing?.amount || s.pricing?.type === 'contact' || s.pricing?.type === 'custom');

    return (
        <div className="space-y-6">
            {/* Service Pricing Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900">Service Pricing</h3>
                            <p className="text-xs text-slate-500">Set prices for your services</p>
                        </div>
                    </div>
                    {editingSection === 'services' ? (
                        <div className="flex gap-2">
                            <button onClick={() => setEditingSection(null)} className="p-2 text-slate-400 hover:text-slate-600">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={saveServices} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
                                <Save className="w-3 h-3" /> Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditingServices} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100 border border-slate-200">
                            <Edit2 className="w-3 h-3" /> Edit
                        </button>
                    )}
                </div>

                {editingSection === 'services' ? (
                    <div className="space-y-4">
                        {editServices.map((service, idx) => (
                            <div key={service.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <input
                                        type="text"
                                        value={service.name}
                                        onChange={(e) => updateServiceField(idx, 'name', e.target.value)}
                                        className="font-medium text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none"
                                        placeholder="Service name"
                                    />
                                    <button onClick={() => removeService(idx)} className="p-1 text-red-400 hover:text-red-600">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                                        <select
                                            value={service.pricing?.type || 'fixed'}
                                            onChange={(e) => updateServicePricing(idx, 'type', e.target.value)}
                                            className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg bg-white"
                                        >
                                            {pricingTypes.map(pt => (
                                                <option key={pt.value} value={pt.value}>{pt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {service.pricing?.type !== 'contact' && service.pricing?.type !== 'custom' && (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Amount ($)</label>
                                            <input
                                                type="number"
                                                value={service.pricing?.amount || ''}
                                                onChange={(e) => updateServicePricing(idx, 'amount', parseFloat(e.target.value) || 0)}
                                                className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    )}
                                    {service.pricing?.type === 'custom' && (
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Custom Text</label>
                                            <input
                                                type="text"
                                                value={service.pricing?.customText || ''}
                                                onChange={(e) => updateServicePricing(idx, 'customText', e.target.value)}
                                                className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                                placeholder="e.g., Varies by project"
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Duration (min)</label>
                                        <input
                                            type="number"
                                            value={service.duration || ''}
                                            onChange={(e) => updateServiceField(idx, 'duration', parseInt(e.target.value) || undefined)}
                                            className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                            placeholder="60"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                                        <input
                                            type="text"
                                            value={service.category || ''}
                                            onChange={(e) => updateServiceField(idx, 'category', e.target.value)}
                                            className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                            placeholder="e.g., Hair"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={addService} className="flex items-center gap-2 px-4 py-2 text-slate-600 text-sm font-medium border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 w-full justify-center">
                            <Plus className="w-4 h-4" /> Add Service
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {services.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No services configured yet</p>
                        ) : (
                            <div className="grid gap-2">
                                {services.map((service) => (
                                    <div key={service.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Tag className="w-4 h-4 text-slate-400" />
                                            <div>
                                                <span className="text-sm font-medium text-slate-700">{service.name}</span>
                                                {service.category && (
                                                    <span className="ml-2 text-xs text-slate-400">({service.category})</span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-sm font-semibold text-emerald-600">
                                            {formatServicePrice(service.pricing)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pricing Plans Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-50 rounded-lg">
                            <Package className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900">Pricing Plans</h3>
                            <p className="text-xs text-slate-500">Membership tiers or packages</p>
                        </div>
                    </div>
                    {editingSection === 'plans' ? (
                        <div className="flex gap-2">
                            <button onClick={() => setEditingSection(null)} className="p-2 text-slate-400 hover:text-slate-600">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={savePlans} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
                                <Save className="w-3 h-3" /> Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditingPlans} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100 border border-slate-200">
                            <Edit2 className="w-3 h-3" /> Edit
                        </button>
                    )}
                </div>

                {editingSection === 'plans' ? (
                    <div className="space-y-4">
                        {editPlans.map((plan, idx) => (
                            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            value={plan.name}
                                            onChange={(e) => updatePlan(idx, 'name', e.target.value)}
                                            className="font-medium text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none"
                                            placeholder="Plan name"
                                        />
                                        <input
                                            type="text"
                                            value={plan.price}
                                            onChange={(e) => updatePlan(idx, 'price', e.target.value)}
                                            className="font-semibold text-emerald-600 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none w-24"
                                            placeholder="$99/mo"
                                        />
                                    </div>
                                    <button onClick={() => removePlan(idx)} className="p-1 text-red-400 hover:text-red-600">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Features</label>
                                    {plan.features.map((feature, featureIdx) => (
                                        <div key={featureIdx} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={feature}
                                                onChange={(e) => updateFeature(idx, featureIdx, e.target.value)}
                                                className="flex-1 p-2 text-sm border border-slate-200 rounded-lg bg-white"
                                            />
                                            <button onClick={() => removeFeature(idx, featureIdx)} className="p-2 text-red-400 hover:text-red-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => addFeature(idx)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Add feature
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button onClick={addPlan} className="flex items-center gap-2 px-4 py-2 text-slate-600 text-sm font-medium border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 w-full justify-center">
                            <Plus className="w-4 h-4" /> Add Pricing Plan
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {plans.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No pricing plans configured yet. Add plans for memberships, packages, or subscription tiers.</p>
                        ) : (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {plans.map((plan, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-semibold text-slate-900">{plan.name}</h4>
                                            <span className="text-lg font-bold text-emerald-600">{plan.price}</span>
                                        </div>
                                        <ul className="space-y-1.5">
                                            {plan.features.map((feature, featureIdx) => (
                                                <li key={featureIdx} className="text-xs text-slate-600 flex items-start gap-2">
                                                    <span className="text-emerald-500 mt-0.5">✓</span>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pricing Summary */}
            {servicesWithPricing.length > 0 && (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
                    <h3 className="font-semibold mb-4">Pricing Summary</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="bg-white/10 rounded-xl p-4">
                            <p className="text-xs text-slate-400 uppercase mb-1">Total Services</p>
                            <p className="text-2xl font-bold">{services.length}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <p className="text-xs text-slate-400 uppercase mb-1">With Pricing</p>
                            <p className="text-2xl font-bold">{servicesWithPricing.length}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <p className="text-xs text-slate-400 uppercase mb-1">Pricing Plans</p>
                            <p className="text-2xl font-bold">{plans.length}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
