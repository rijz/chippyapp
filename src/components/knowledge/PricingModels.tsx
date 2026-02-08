import React, { useState } from 'react';
import { DollarSign, Edit2, Save, X, Plus, Trash2, Tag, Package, Settings, Receipt, Clock, CreditCard, Percent, Gift, Layers } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Service, ServicePricing, PricingPlan, PricingSettings, PricingModel, AddOn, Bundle } from '../../types';
import { createEmptyService, formatServicePrice } from '../../utils/serviceUtils';

const PRICING_MODELS: { value: PricingModel; label: string; description: string }[] = [
    { value: 'services', label: 'Service-Based', description: 'Spa, Salon, Clinic, Auto Shop' },
    { value: 'tiered_plans', label: 'Tiered Plans', description: 'SaaS, Software, Memberships' },
    { value: 'menu', label: 'Menu', description: 'Restaurant, Cafe, Food' },
    { value: 'packages', label: 'Packages', description: 'Gym, Classes, Training' },
    { value: 'catalog', label: 'Product Catalog', description: 'E-commerce, Retail' },
    { value: 'hourly', label: 'Hourly Rates', description: 'Consulting, Legal, Agency' },
    { value: 'quote_based', label: 'Quote-Based', description: 'Custom, Real Estate, Insurance' },
];

const DEFAULT_PRICING_SETTINGS: PricingSettings = {
    pricingModel: 'services',
    hideAllPrices: false,
    defaultCurrency: 'USD',
    defaultCtaText: 'Get a Quote',
    taxDisplay: 'none',
};

// Generate unique IDs
const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// AddOns Section Component
const AddOnsSection = ({ addOns, services, onSave }: { addOns: AddOn[]; services: Service[]; onSave: (addOns: AddOn[]) => void }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editAddOns, setEditAddOns] = useState<AddOn[]>([]);

    const startEditing = () => {
        setEditAddOns(addOns);
        setIsEditing(true);
    };

    const saveChanges = () => {
        onSave(editAddOns);
        setIsEditing(false);
    };

    const addNewAddOn = () => {
        setEditAddOns([...editAddOns, {
            id: generateId('addon'),
            name: '',
            price: 0,
            currency: 'USD'
        }]);
    };

    const updateAddOn = (idx: number, field: keyof AddOn, value: any) => {
        setEditAddOns(prev => prev.map((a, i) =>
            i === idx ? { ...a, [field]: value } : a
        ));
    };

    const removeAddOn = (idx: number) => {
        setEditAddOns(prev => prev.filter((_, i) => i !== idx));
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 rounded-lg">
                        <Gift className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Add-ons & Upsells</h3>
                        <p className="text-xs text-slate-500">Extra services customers can add</p>
                    </div>
                </div>
                {isEditing ? (
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                        <button onClick={saveChanges} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
                            <Save className="w-3 h-3" /> Save
                        </button>
                    </div>
                ) : (
                    <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100 border border-slate-200">
                        <Edit2 className="w-3 h-3" /> Edit
                    </button>
                )}
            </div>

            {isEditing ? (
                <div className="space-y-3">
                    {editAddOns.map((addon, idx) => (
                        <div key={addon.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="flex items-start justify-between mb-3">
                                <input
                                    type="text"
                                    value={addon.name}
                                    onChange={(e) => updateAddOn(idx, 'name', e.target.value)}
                                    className="font-medium text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none flex-1"
                                    placeholder="Add-on name"
                                />
                                <button onClick={() => removeAddOn(idx)} className="p-1 text-red-400 hover:text-red-600 ml-2">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Price ($)</label>
                                    <input
                                        type="number"
                                        value={addon.price || ''}
                                        onChange={(e) => updateAddOn(idx, 'price', parseFloat(e.target.value) || 0)}
                                        className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                                    <input
                                        type="text"
                                        value={addon.description || ''}
                                        onChange={(e) => updateAddOn(idx, 'description', e.target.value)}
                                        className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="Optional description"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                        <input
                                            type="checkbox"
                                            checked={addon.isPopular || false}
                                            onChange={(e) => updateAddOn(idx, 'isPopular', e.target.checked)}
                                            className="rounded border-slate-300"
                                        />
                                        Popular
                                    </label>
                                </div>
                            </div>
                        </div>
                    ))}
                    <button onClick={addNewAddOn} className="flex items-center gap-2 px-4 py-2 text-slate-600 text-sm font-medium border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 w-full justify-center">
                        <Plus className="w-4 h-4" /> Add Add-on
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {addOns.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No add-ons configured. Click Edit to add upsell options.</p>
                    ) : (
                        addOns.map(addon => (
                            <div key={addon.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Gift className="w-4 h-4 text-amber-500" />
                                    <div>
                                        <span className="text-sm font-medium text-slate-700">{addon.name}</span>
                                        {addon.isPopular && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">POPULAR</span>}
                                    </div>
                                </div>
                                <span className="text-sm font-semibold text-emerald-600">+${addon.price}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// Bundles Section Component
const BundlesSection = ({ bundles, services, onSave }: { bundles: Bundle[]; services: Service[]; onSave: (bundles: Bundle[]) => void }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editBundles, setEditBundles] = useState<Bundle[]>([]);

    const startEditing = () => {
        setEditBundles(bundles);
        setIsEditing(true);
    };

    const saveChanges = () => {
        onSave(editBundles);
        setIsEditing(false);
    };

    const addNewBundle = () => {
        setEditBundles([...editBundles, {
            id: generateId('bundle'),
            name: '',
            includedServices: [],
            price: 0,
            currency: 'USD'
        }]);
    };

    const updateBundle = (idx: number, field: keyof Bundle, value: any) => {
        setEditBundles(prev => prev.map((b, i) =>
            i === idx ? { ...b, [field]: value } : b
        ));
    };

    const removeBundle = (idx: number) => {
        setEditBundles(prev => prev.filter((_, i) => i !== idx));
    };

    const toggleServiceInBundle = (bundleIdx: number, serviceId: string) => {
        setEditBundles(prev => prev.map((bundle, i) => {
            if (i !== bundleIdx) return bundle;
            const included = bundle.includedServices.some(s => s.serviceId === serviceId);
            return {
                ...bundle,
                includedServices: included
                    ? bundle.includedServices.filter(s => s.serviceId !== serviceId)
                    : [...bundle.includedServices, { serviceId }]
            };
        }));
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <Layers className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Service Bundles</h3>
                        <p className="text-xs text-slate-500">Package deals with multiple services</p>
                    </div>
                </div>
                {isEditing ? (
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                        <button onClick={saveChanges} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
                            <Save className="w-3 h-3" /> Save
                        </button>
                    </div>
                ) : (
                    <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100 border border-slate-200">
                        <Edit2 className="w-3 h-3" /> Edit
                    </button>
                )}
            </div>

            {isEditing ? (
                <div className="space-y-4">
                    {editBundles.map((bundle, idx) => (
                        <div key={bundle.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="flex items-start justify-between mb-3">
                                <input
                                    type="text"
                                    value={bundle.name}
                                    onChange={(e) => updateBundle(idx, 'name', e.target.value)}
                                    className="font-medium text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none flex-1"
                                    placeholder="Bundle name (e.g., 'Spa Day Package')"
                                />
                                <button onClick={() => removeBundle(idx)} className="p-1 text-red-400 hover:text-red-600 ml-2">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Bundle Price ($)</label>
                                    <input
                                        type="number"
                                        value={bundle.price || ''}
                                        onChange={(e) => updateBundle(idx, 'price', parseFloat(e.target.value) || 0)}
                                        className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Original Price ($)</label>
                                    <input
                                        type="number"
                                        value={bundle.originalPrice || ''}
                                        onChange={(e) => updateBundle(idx, 'originalPrice', parseFloat(e.target.value) || 0)}
                                        className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Savings ($)</label>
                                    <input
                                        type="number"
                                        value={bundle.savings || ''}
                                        onChange={(e) => updateBundle(idx, 'savings', parseFloat(e.target.value) || 0)}
                                        className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Valid (days)</label>
                                    <input
                                        type="number"
                                        value={bundle.validityDays || ''}
                                        onChange={(e) => updateBundle(idx, 'validityDays', parseInt(e.target.value) || undefined)}
                                        className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="30"
                                    />
                                </div>
                            </div>
                            {services.length > 0 && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Include Services</label>
                                    <div className="flex flex-wrap gap-2">
                                        {services.map(service => (
                                            <button
                                                key={service.id}
                                                onClick={() => toggleServiceInBundle(idx, service.id)}
                                                className={`px-2 py-1 text-xs rounded-lg border transition-colors ${bundle.includedServices.some(s => s.serviceId === service.id)
                                                    ? 'bg-violet-100 border-violet-300 text-violet-700'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                                    }`}
                                            >
                                                {service.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <button onClick={addNewBundle} className="flex items-center gap-2 px-4 py-2 text-slate-600 text-sm font-medium border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 w-full justify-center">
                        <Plus className="w-4 h-4" /> Add Bundle
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {bundles.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No bundles configured. Click Edit to create package deals.</p>
                    ) : (
                        bundles.map(bundle => (
                            <div key={bundle.id} className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h4 className="font-semibold text-slate-900">{bundle.name}</h4>
                                        <p className="text-xs text-slate-500">{bundle.includedServices.length} services included</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-emerald-600">${bundle.price}</p>
                                        {bundle.originalPrice && (
                                            <p className="text-xs text-slate-400 line-through">${bundle.originalPrice}</p>
                                        )}
                                        {bundle.savings && (
                                            <p className="text-xs text-emerald-600 font-medium">Save ${bundle.savings}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {bundle.includedServices.map(s => {
                                        const service = services.find(svc => svc.id === s.serviceId);
                                        return service ? (
                                            <span key={s.serviceId} className="text-[10px] bg-white border border-violet-200 px-2 py-0.5 rounded text-violet-700">
                                                {service.name}
                                            </span>
                                        ) : null;
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export const PricingModels = () => {
    const { knowledgeData, setKnowledgeData } = useData();
    const [editingSection, setEditingSection] = useState<'services' | 'plans' | 'settings' | null>(null);
    const [editServices, setEditServices] = useState<Service[]>([]);
    const [editPlans, setEditPlans] = useState<PricingPlan[]>([]);
    const [editSettings, setEditSettings] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS);

    if (!knowledgeData) {
        return (
            <div className="bg-white p-16 text-center rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400">No knowledge data available</p>
            </div>
        );
    }

    const pricingSettings = knowledgeData.pricingSettings || DEFAULT_PRICING_SETTINGS;

    const pricingTypes: { value: ServicePricing['type']; label: string }[] = [
        { value: 'fixed', label: 'Fixed Price' },
        { value: 'starting_from', label: 'Starting From' },
        { value: 'range', label: 'Price Range' },
        { value: 'hourly', label: 'Per Hour' },
        { value: 'daily', label: 'Per Day' },
        { value: 'weekly', label: 'Per Week' },
        { value: 'monthly', label: 'Per Month' },
        { value: 'per_unit', label: 'Per Unit' },
        { value: 'free', label: 'Free' },
        { value: 'quote', label: 'Quote Required' },
        { value: 'negotiable', label: 'Negotiable' },
    ];

    // Settings Editor
    const startEditingSettings = () => {
        setEditSettings(pricingSettings);
        setEditingSection('settings');
    };

    const saveSettings = () => {
        setKnowledgeData({
            ...knowledgeData,
            pricingSettings: editSettings,
            lastUpdated: new Date()
        });
        setEditingSection(null);
    };

    // Service Pricing Editor
    const startEditingServices = () => {
        setEditServices(knowledgeData.services || []);
        setEditingSection('services');
    };

    const saveServices = () => {
        setKnowledgeData({
            ...knowledgeData,
            services: editServices,
            lastUpdated: new Date()
        });
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

    // Pricing Plans Editor (for legacy support)
    const plans = Array.isArray(knowledgeData.pricing) ? knowledgeData.pricing : [];

    const startEditingPlans = () => {
        setEditPlans(plans);
        setEditingSection('plans');
    };

    const savePlans = () => {
        setKnowledgeData({
            ...knowledgeData,
            pricing: editPlans.length > 0 ? editPlans : null,
            lastUpdated: new Date()
        });
        setEditingSection(null);
    };

    const addPlan = () => {
        setEditPlans(prev => [...prev, {
            id: generateId('plan'),
            name: 'New Plan',
            price: { monthly: 0, currency: 'USD' },
            features: [
                { text: 'Feature 1', included: true },
                { text: 'Feature 2', included: true },
            ]
        }]);
    };

    const removePlan = (idx: number) => {
        setEditPlans(prev => prev.filter((_, i) => i !== idx));
    };

    const updatePlan = (idx: number, field: keyof PricingPlan, value: any) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === idx ? { ...p, [field]: value } : p
        ));
    };

    const updatePlanPrice = (idx: number, amount: number) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === idx ? {
                ...p,
                price: typeof p.price === 'object'
                    ? { ...p.price, monthly: amount }
                    : { monthly: amount, currency: 'USD' }
            } : p
        ));
    };

    const updatePlanFeature = (planIdx: number, featureIdx: number, text: string) => {
        setEditPlans(prev => prev.map((p, pIdx) => {
            if (pIdx !== planIdx) return p;
            const newFeatures = [...p.features];
            const oldFeature = newFeatures[featureIdx];
            // Handle both string and object features
            if (typeof oldFeature === 'string') {
                newFeatures[featureIdx] = { text, included: true };
            } else {
                newFeatures[featureIdx] = { ...oldFeature, text };
            }
            return { ...p, features: newFeatures };
        }));
    };

    const addPlanFeature = (planIdx: number) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === planIdx ? {
                ...p,
                features: [...p.features, { text: '', included: true }]
            } : p
        ));
    };

    const removePlanFeature = (planIdx: number, featureIdx: number) => {
        setEditPlans(prev => prev.map((p, i) =>
            i === planIdx ? {
                ...p,
                features: p.features.filter((_, fIdx) => fIdx !== featureIdx)
            } : p
        ));
    };

    const services = knowledgeData.services || [];
    const addOns = knowledgeData.addOns || [];
    const bundles = knowledgeData.bundles || [];
    const servicesWithPricing = services.filter(s => s.pricing?.amount || s.pricing?.type === 'quote' || s.pricing?.type === 'free');

    return (
        <div className="space-y-6">
            {/* Pricing Summary */}
            {servicesWithPricing.length > 0 && (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
                    <h3 className="font-semibold mb-4">Pricing Summary</h3>
                    <div className="grid md:grid-cols-4 gap-4">
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
                        <div className="bg-white/10 rounded-xl p-4">
                            <p className="text-xs text-slate-400 uppercase mb-1">Add-ons</p>
                            <p className="text-2xl font-bold">{addOns.length}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Pricing Settings Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Settings className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900">Pricing Settings</h3>
                            <p className="text-xs text-slate-500">Configure how pricing is displayed</p>
                        </div>
                    </div>
                    {editingSection === 'settings' ? (
                        <div className="flex gap-2">
                            <button onClick={() => setEditingSection(null)} className="p-2 text-slate-400 hover:text-slate-600">
                                <X className="w-4 h-4" />
                            </button>
                            <button onClick={saveSettings} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
                                <Save className="w-3 h-3" /> Save
                            </button>
                        </div>
                    ) : (
                        <button onClick={startEditingSettings} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100 border border-slate-200">
                            <Edit2 className="w-3 h-3" /> Edit
                        </button>
                    )}
                </div>

                {editingSection === 'settings' ? (
                    <div className="space-y-6">
                        {/* Pricing Model Selector */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Pricing Model</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {PRICING_MODELS.map(model => (
                                    <button
                                        key={model.value}
                                        onClick={() => setEditSettings({ ...editSettings, pricingModel: model.value })}
                                        className={`p-3 rounded-xl border text-left transition-all ${editSettings.pricingModel === model.value
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        <p className={`text-sm font-medium ${editSettings.pricingModel === model.value ? 'text-blue-700' : 'text-slate-700'}`}>
                                            {model.label}
                                        </p>
                                        <p className="text-[10px] text-slate-400">{model.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Tax Display */}
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Receipt className="w-4 h-4 text-slate-500" />
                                    <label className="text-xs font-bold text-slate-500 uppercase">Tax Display</label>
                                </div>
                                <select
                                    value={editSettings.taxDisplay}
                                    onChange={(e) => setEditSettings({ ...editSettings, taxDisplay: e.target.value as 'included' | 'excluded' | 'none' })}
                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white mb-2"
                                >
                                    <option value="none">Don't show tax info</option>
                                    <option value="included">Prices include tax</option>
                                    <option value="excluded">Prices exclude tax</option>
                                </select>
                                {editSettings.taxDisplay !== 'none' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            value={editSettings.taxRate || ''}
                                            onChange={(e) => setEditSettings({ ...editSettings, taxRate: parseFloat(e.target.value) || undefined })}
                                            className="p-2 text-sm border border-slate-200 rounded-lg"
                                            placeholder="Tax rate %"
                                        />
                                        <input
                                            type="text"
                                            value={editSettings.taxLabel || ''}
                                            onChange={(e) => setEditSettings({ ...editSettings, taxLabel: e.target.value })}
                                            className="p-2 text-sm border border-slate-200 rounded-lg"
                                            placeholder="e.g., HST, VAT"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Cancellation Policy */}
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Clock className="w-4 h-4 text-slate-500" />
                                    <label className="text-xs font-bold text-slate-500 uppercase">Cancellation Policy</label>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input
                                        type="number"
                                        value={editSettings.cancellationPolicy?.noticePeriod || ''}
                                        onChange={(e) => setEditSettings({
                                            ...editSettings,
                                            cancellationPolicy: {
                                                ...editSettings.cancellationPolicy,
                                                noticePeriod: parseInt(e.target.value) || 0
                                            }
                                        })}
                                        className="p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="Notice (hours)"
                                    />
                                    <input
                                        type="number"
                                        value={editSettings.cancellationPolicy?.fee?.amount || ''}
                                        onChange={(e) => setEditSettings({
                                            ...editSettings,
                                            cancellationPolicy: {
                                                ...editSettings.cancellationPolicy,
                                                noticePeriod: editSettings.cancellationPolicy?.noticePeriod || 24,
                                                fee: {
                                                    amount: parseFloat(e.target.value) || 0,
                                                    type: editSettings.cancellationPolicy?.fee?.type || 'fixed'
                                                }
                                            }
                                        })}
                                        className="p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="Fee ($)"
                                    />
                                </div>
                                <textarea
                                    value={editSettings.cancellationPolicy?.description || ''}
                                    onChange={(e) => setEditSettings({
                                        ...editSettings,
                                        cancellationPolicy: {
                                            ...editSettings.cancellationPolicy,
                                            noticePeriod: editSettings.cancellationPolicy?.noticePeriod || 24,
                                            description: e.target.value
                                        }
                                    })}
                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg"
                                    rows={2}
                                    placeholder="e.g., Full refund with 48hr notice"
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Payment Terms */}
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <CreditCard className="w-4 h-4 text-slate-500" />
                                    <label className="text-xs font-bold text-slate-500 uppercase">Payment Terms</label>
                                </div>
                                <input
                                    type="text"
                                    value={editSettings.paymentTerms || ''}
                                    onChange={(e) => setEditSettings({ ...editSettings, paymentTerms: e.target.value })}
                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg mb-2"
                                    placeholder="e.g., 50% upfront, 50% on completion"
                                />
                                <input
                                    type="number"
                                    value={editSettings.minimumSpend || ''}
                                    onChange={(e) => setEditSettings({ ...editSettings, minimumSpend: parseFloat(e.target.value) || undefined })}
                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg"
                                    placeholder="Minimum spend ($)"
                                />
                            </div>

                            {/* Member Discount */}
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Percent className="w-4 h-4 text-slate-500" />
                                    <label className="text-xs font-bold text-slate-500 uppercase">Member Discount</label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        value={editSettings.memberDiscount?.percentage || ''}
                                        onChange={(e) => setEditSettings({
                                            ...editSettings,
                                            memberDiscount: {
                                                ...editSettings.memberDiscount,
                                                percentage: parseFloat(e.target.value) || 0
                                            }
                                        })}
                                        className="p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="Discount %"
                                    />
                                    <input
                                        type="text"
                                        value={editSettings.memberDiscount?.label || ''}
                                        onChange={(e) => setEditSettings({
                                            ...editSettings,
                                            memberDiscount: {
                                                ...editSettings.memberDiscount,
                                                percentage: editSettings.memberDiscount?.percentage || 0,
                                                label: e.target.value
                                            }
                                        })}
                                        className="p-2 text-sm border border-slate-200 rounded-lg"
                                        placeholder="e.g., VIP Members"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Hide All Prices Toggle */}
                        <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
                            <div>
                                <p className="text-sm font-medium text-amber-900">Hide All Prices</p>
                                <p className="text-xs text-amber-600">Request callback for all pricing inquiries</p>
                            </div>
                            <button
                                onClick={() => setEditSettings({ ...editSettings, hideAllPrices: !editSettings.hideAllPrices })}
                                className={`relative w-12 h-6 rounded-full transition-colors ${editSettings.hideAllPrices ? 'bg-amber-500' : 'bg-slate-300'}`}
                            >
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${editSettings.hideAllPrices ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Model</p>
                            <p className="text-sm font-medium text-slate-700 capitalize">{pricingSettings.pricingModel.replace('_', ' ')}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Tax</p>
                            <p className="text-sm font-medium text-slate-700">
                                {pricingSettings.taxDisplay === 'none' ? 'Not shown' :
                                    pricingSettings.taxDisplay === 'included' ? `Included${pricingSettings.taxRate ? ` (${pricingSettings.taxRate}%)` : ''}` :
                                        `Excluded${pricingSettings.taxRate ? ` (${pricingSettings.taxRate}%)` : ''}`}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Cancellation</p>
                            <p className="text-sm font-medium text-slate-700">
                                {pricingSettings.cancellationPolicy?.noticePeriod
                                    ? `${pricingSettings.cancellationPolicy.noticePeriod}hr notice`
                                    : 'Not set'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Member Discount</p>
                            <p className="text-sm font-medium text-slate-700">
                                {pricingSettings.memberDiscount?.percentage
                                    ? `${pricingSettings.memberDiscount.percentage}% off`
                                    : 'None'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

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
                                    {service.pricing?.type !== 'quote' && service.pricing?.type !== 'free' && (
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
                                    {service.pricing?.type === 'range' && (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Max ($)</label>
                                            <input
                                                type="number"
                                                value={service.pricing?.maxAmount || ''}
                                                onChange={(e) => updateServicePricing(idx, 'maxAmount', parseFloat(e.target.value) || 0)}
                                                className="w-full mt-1 p-2 text-sm border border-slate-200 rounded-lg"
                                                placeholder="0.00"
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
                                {/* Hide Price Toggle */}
                                <div className="mt-3 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id={`hidePrice-${idx}`}
                                        checked={service.pricing?.hidePrice || false}
                                        onChange={(e) => updateServicePricing(idx, 'hidePrice', e.target.checked)}
                                        className="rounded border-slate-300"
                                    />
                                    <label htmlFor={`hidePrice-${idx}`} className="text-xs text-slate-500">
                                        Hide price (show "Request Quote" instead)
                                    </label>
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
                                        <span className={`text-sm font-semibold ${service.pricing?.hidePrice ? 'text-amber-600' : 'text-emerald-600'}`}>
                                            {service.pricing?.hidePrice ? 'Request Quote' : formatServicePrice(service.pricing)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pricing Plans Section (for tiered_plans model) */}
            {(pricingSettings.pricingModel === 'tiered_plans' || plans.length > 0) && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-50 rounded-lg">
                                <Package className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900">Pricing Plans</h3>
                                <p className="text-xs text-slate-500">Subscription tiers or packages</p>
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
                                <div key={plan.id || idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <input
                                            type="text"
                                            value={plan.name}
                                            onChange={(e) => updatePlan(idx, 'name', e.target.value)}
                                            className="font-medium text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none flex-1 mr-4"
                                            placeholder="Plan Name (e.g. Pro)"
                                        />
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                                <input
                                                    type="number"
                                                    value={typeof plan.price === 'object' ? (plan.price.monthly || 0) : plan.price}
                                                    onChange={(e) => updatePlanPrice(idx, parseFloat(e.target.value) || 0)}
                                                    className="w-24 pl-6 pr-2 py-1 text-sm border border-slate-200 rounded-lg text-right"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <span className="text-xs text-slate-500">/mo</span>
                                            <button onClick={() => removePlan(idx)} className="p-1 text-red-400 hover:text-red-600 ml-2">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pl-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Features</label>
                                        {plan.features.map((feature, fIdx) => (
                                            <div key={fIdx} className="flex items-center gap-2">
                                                <span className="text-emerald-500">✓</span>
                                                <input
                                                    type="text"
                                                    value={typeof feature === 'string' ? feature : feature.text}
                                                    onChange={(e) => updatePlanFeature(idx, fIdx, e.target.value)}
                                                    className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 outline-none"
                                                    placeholder="Feature description"
                                                />
                                                <button onClick={() => removePlanFeature(idx, fIdx)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 transition-opacity">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        <button onClick={() => addPlanFeature(idx)} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 mt-1">
                                            <Plus className="w-3 h-3" /> Add Feature
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
                                <p className="text-sm text-slate-400 italic">No pricing plans configured yet. Add plans for memberships or subscription tiers.</p>
                            ) : (
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {plans.map((plan, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-semibold text-slate-900">{plan.name}</h4>
                                                <span className="text-lg font-bold text-emerald-600">
                                                    {typeof plan.price === 'object'
                                                        ? `$${plan.price.monthly || plan.price.annually}/mo`
                                                        : plan.price}
                                                </span>
                                            </div>
                                            <ul className="space-y-1.5">
                                                {plan.features.map((feature, featureIdx) => (
                                                    <li key={featureIdx} className="text-xs text-slate-600 flex items-start gap-2">
                                                        <span className="text-emerald-500 mt-0.5">✓</span>
                                                        {typeof feature === 'string' ? feature : feature.text}
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
            )}



            {/* Add-ons Section */}
            <AddOnsSection
                addOns={addOns}
                services={services}
                onSave={(newAddOns) => setKnowledgeData({
                    ...knowledgeData,
                    addOns: newAddOns,
                    lastUpdated: new Date()
                })}
            />

            {/* Bundles Section */}
            <BundlesSection
                bundles={bundles}
                services={services}
                onSave={(newBundles) => setKnowledgeData({
                    ...knowledgeData,
                    bundles: newBundles,
                    lastUpdated: new Date()
                })}
            />
        </div>
    );
};
