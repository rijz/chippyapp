import React, { useState } from 'react';
import { Service, ServicePricing } from '../types';
import { formatServicePrice, hasValidPricing, generateServiceId, defaultPricing } from '../utils/serviceUtils';
import { Check, AlertCircle, Edit2, Trash2, Plus, X, DollarSign, Clock, Loader2 } from 'lucide-react';

interface ServiceEditorProps {
    services: Service[];
    onChange: (services: Service[]) => void;
    onScanPricing: (url: string) => Promise<void>;
    isScanningPricing: boolean;
    pricingScanResult?: { success: boolean; message: string } | null;
}

export const ServiceEditor: React.FC<ServiceEditorProps> = ({
    services,
    onChange,
    onScanPricing,
    isScanningPricing,
    pricingScanResult
}) => {
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [pricingUrl, setPricingUrl] = useState('');

    const handleSave = (updated: Service) => {
        const newServices = services.map(s => s.id === updated.id ? updated : s);
        onChange(newServices);
        setEditingService(null);
    };

    const handleDelete = (id: string) => {
        onChange(services.filter(s => s.id !== id));
    };

    const handleAdd = () => {
        const newService: Service = {
            id: generateServiceId(),
            name: '',
            pricing: defaultPricing()
        };
        setEditingService(newService);
    };

    const handleSaveNew = (service: Service) => {
        if (service.name.trim()) {
            onChange([...services, service]);
        }
        setEditingService(null);
    };

    const handleScanPricing = async () => {
        if (pricingUrl.trim()) {
            await onScanPricing(pricingUrl.trim());
            setPricingUrl('');
        }
    };

    const servicesWithPricing = services.filter(s => hasValidPricing(s)).length;
    const servicesNeedingPricing = services.length - servicesWithPricing;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-lg font-semibold text-slate-800">Your Services & Pricing</h3>
                <p className="text-sm text-slate-500 mt-1">
                    We found {services.length} services. {servicesNeedingPricing > 0 && (
                        <span className="text-amber-600">{servicesNeedingPricing} need pricing.</span>
                    )}
                </p>
            </div>

            {/* Service List */}
            <div className="space-y-3">
                {services.map(service => (
                    <div
                        key={service.id}
                        className={`p-4 rounded-xl border transition-all ${hasValidPricing(service)
                            ? 'bg-white border-slate-200 hover:border-chippy-coral/50'
                            : 'bg-amber-50 border-amber-200'
                            }`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {hasValidPricing(service) ? (
                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-green-600" />
                                    </div>
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                                        <AlertCircle className="w-4 h-4 text-amber-600" />
                                    </div>
                                )}
                                <div>
                                    <p className="font-medium text-slate-800">{service.name || 'Untitled Service'}</p>
                                    <p className="text-sm text-slate-500">
                                        {formatServicePrice(service.pricing)}
                                        {service.duration && <span className="ml-2">• {service.duration} min</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setEditingService(service)}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Edit"
                                >
                                    <Edit2 className="w-4 h-4 text-slate-500" />
                                </button>
                                <button
                                    onClick={() => handleDelete(service.id)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Service Button */}
            <button
                onClick={handleAdd}
                className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-chippy-coral hover:text-chippy-coral transition-colors flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" />
                Add Service
            </button>

            {/* Scan Pricing URL */}
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-sm font-medium text-blue-800 mb-2">
                    💡 Missing pricing? Paste your pricing page URL:
                </p>
                <div className="flex gap-2">
                    <input
                        type="url"
                        value={pricingUrl}
                        onChange={(e) => setPricingUrl(e.target.value)}
                        placeholder="https://yourwebsite.com/pricing"
                        className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white"
                    />
                    <button
                        onClick={handleScanPricing}
                        disabled={!pricingUrl.trim() || isScanningPricing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isScanningPricing ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                        ) : (
                            'Scan for Prices'
                        )}
                    </button>
                </div>
                {/* Scan Result Feedback */}
                {pricingScanResult && (
                    <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${pricingScanResult.success
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                        {pricingScanResult.success ? (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <span>{pricingScanResult.message}</span>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingService && (
                <ServiceEditModal
                    service={editingService}
                    isNew={!services.some(s => s.id === editingService.id)}
                    onSave={services.some(s => s.id === editingService.id) ? handleSave : handleSaveNew}
                    onCancel={() => setEditingService(null)}
                />
            )}
        </div>
    );
};

// Service Edit Modal Component
interface ServiceEditModalProps {
    service: Service;
    isNew: boolean;
    onSave: (service: Service) => void;
    onCancel: () => void;
}

const ServiceEditModal: React.FC<ServiceEditModalProps> = ({ service, isNew, onSave, onCancel }) => {
    const [form, setForm] = useState<Service>({ ...service });

    const updatePricing = (updates: Partial<ServicePricing>) => {
        setForm(prev => ({
            ...prev,
            pricing: { ...prev.pricing, ...updates }
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(form);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    {/* Header */}
                    <div className="p-4 border-b flex items-center justify-between">
                        <h3 className="text-lg font-semibold">{isNew ? 'Add Service' : 'Edit Service'}</h3>
                        <button type="button" onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-4 space-y-4">
                        {/* Name */}
                        <div>
                            <label className="text-sm font-medium text-slate-700">Service Name *</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border rounded-lg"
                                placeholder="e.g., Haircut"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="text-sm font-medium text-slate-700">Description</label>
                            <textarea
                                value={form.description || ''}
                                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border rounded-lg resize-none"
                                rows={2}
                                placeholder="Brief description..."
                            />
                        </div>

                        {/* Duration */}
                        <div>
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                <Clock className="w-4 h-4" /> Duration (minutes)
                            </label>
                            <input
                                type="number"
                                value={form.duration || ''}
                                onChange={(e) => setForm(prev => ({ ...prev, duration: e.target.value ? parseInt(e.target.value) : undefined }))}
                                className="w-full mt-1 px-3 py-2 border rounded-lg"
                                placeholder="30"
                                min={1}
                            />
                        </div>

                        {/* Pricing Type */}
                        <div>
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                <DollarSign className="w-4 h-4" /> Pricing Type
                            </label>
                            <div className="mt-2 space-y-2">
                                {[
                                    { value: 'fixed', label: 'Fixed Price' },
                                    { value: 'starting_from', label: 'Starting From' },
                                    { value: 'hourly', label: 'Hourly Rate' },
                                    { value: 'per_session', label: 'Per Session' },
                                    { value: 'per_project', label: 'Per Project' },
                                    { value: 'per_day', label: 'Per Day' },
                                    { value: 'per_week', label: 'Per Week' },
                                    { value: 'per_month', label: 'Per Month' },
                                    { value: 'subscription', label: 'Subscription' },
                                    { value: 'per_unit', label: 'Per Unit (Custom)' },
                                    { value: 'contact', label: 'Contact for Quote' },
                                    { value: 'custom', label: 'Custom Text' }
                                ].map(opt => (
                                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="pricingType"
                                            value={opt.value}
                                            checked={form.pricing.type === opt.value}
                                            onChange={() => updatePricing({ type: opt.value as ServicePricing['type'] })}
                                            className="w-4 h-4 text-chippy-coral"
                                        />
                                        <span className="text-sm">{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Price Amount */}
                        {['fixed', 'starting_from', 'hourly', 'per_session', 'per_project', 'per_day', 'per_week', 'per_month', 'subscription', 'per_unit'].includes(form.pricing.type) && (
                            <div>
                                <label className="text-sm font-medium text-slate-700">Price</label>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="text-slate-500">$</span>
                                    <input
                                        type="number"
                                        value={form.pricing.amount ?? ''}
                                        onChange={(e) => updatePricing({ amount: e.target.value ? parseFloat(e.target.value) : undefined })}
                                        className="flex-1 px-3 py-2 border rounded-lg"
                                        placeholder="0.00"
                                        min={0}
                                        step={0.01}
                                    />
                                </div>
                            </div>
                        )}

                        {['per_unit', 'subscription'].includes(form.pricing.type) && (
                            <div>
                                <label className="text-sm font-medium text-slate-700">Unit Label</label>
                                <input
                                    type="text"
                                    value={form.pricing.unitLabel || ''}
                                    onChange={(e) => updatePricing({ unitLabel: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                                    placeholder={form.pricing.type === 'subscription' ? 'month, year, quarter' : 'project, seat, unit'}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Used to display pricing as &quot;per unit&quot; or &quot;per month&quot;.
                                </p>
                            </div>
                        )}

                        {/* Custom Text */}
                        {form.pricing.type === 'custom' && (
                            <div>
                                <label className="text-sm font-medium text-slate-700">Custom Pricing Text</label>
                                <input
                                    type="text"
                                    value={form.pricing.customText || ''}
                                    onChange={(e) => updatePricing({ customText: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                                    placeholder="e.g., Varies by project"
                                />
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-chippy-coral text-white rounded-lg font-medium hover:bg-chippy-coral-hover"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
