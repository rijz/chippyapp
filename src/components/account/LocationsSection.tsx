import React, { useState } from 'react';
import { MapPin, Plus, Trash2, Building2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { OverageConfirmationModal } from '../ui/Shared';
import { PLAN_DETAILS } from '../../types';

export const LocationsSection = () => {
    const { subscription, setSubscription } = useData();
    const [showOverageModal, setShowOverageModal] = useState(false);

    const limit = PLAN_DETAILS[subscription.plan]?.limits.locations || 1;
    const currentCount = subscription.usage.locations;
    const overageCost = PLAN_DETAILS[subscription.plan]?.overage.location || 25;

    const handleAddLocation = () => {
        if (currentCount >= limit) {
            setShowOverageModal(true);
        } else {
            confirmAdd();
        }
    };

    const confirmAdd = () => {
        setSubscription(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                locations: prev.usage.locations + 1
            }
        }));
        setShowOverageModal(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-bold text-chippy-navy">Business Locations</h2>
                    <p className="text-slate-500 text-sm">Manage multiple branches and service areas.</p>
                </div>
                <button
                    onClick={handleAddLocation}
                    className="flex items-center gap-2 px-4 py-2 bg-chippy-navy text-white rounded-xl text-xs font-bold hover:bg-chippy-coral transition-all"
                >
                    <Plus className="w-4 h-4" /> Add Location
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: currentCount }).map((_, i) => (
                    <div key={i} className="p-6 bg-white border border-slate-200 rounded-2xl flex justify-between items-center group hover:border-chippy-coral/20 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="font-bold text-chippy-navy">{i === 0 ? 'Main Headquarters' : `Branch Office ${i}`}</p>
                                <p className="text-xs text-slate-400">Default Location</p>
                            </div>
                        </div>
                        <button className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {showOverageModal && (
                <OverageConfirmationModal
                    item="Location"
                    cost={overageCost}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowOverageModal(false)}
                />
            )}
        </div>
    );
};
