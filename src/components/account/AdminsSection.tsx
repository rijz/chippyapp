import React, { useState } from 'react';
import { Users, Plus, UserPlus, Shield, Trash2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { OverageConfirmationModal } from '../ui/Shared';
import { PLAN_DETAILS } from '../../types';

export const AdminsSection = () => {
    const { subscription, setSubscription } = useData();
    const [showOverageModal, setShowOverageModal] = useState(false);

    const limit = PLAN_DETAILS[subscription.plan]?.limits.admins || 1;
    const currentCount = subscription.usage.admins;
    const overageCost = PLAN_DETAILS[subscription.plan]?.overage.admin || 15;

    const handleAddAdmin = () => {
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
                admins: prev.usage.admins + 1
            }
        }));
        setShowOverageModal(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-bold text-chippy-navy">Admin Access</h2>
                    <p className="text-slate-500 text-sm">Grant team members access to the dashboard.</p>
                </div>
                <button
                    onClick={handleAddAdmin}
                    className="flex items-center gap-2 px-4 py-2 bg-chippy-navy text-white rounded-xl text-xs font-bold hover:bg-chippy-coral transition-all"
                >
                    <UserPlus className="w-4 h-4" /> Add Admin
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">User</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Role</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {Array.from({ length: currentCount }).map((_, i) => (
                            <tr key={i} className="group hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-chippy-navy text-white flex items-center justify-center text-[10px] font-black">
                                            {i === 0 ? 'M' : 'S'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-chippy-navy">{i === 0 ? 'Main User (Owner)' : `Staff Member ${i}`}</p>
                                            <p className="text-[10px] text-slate-400">{i === 0 ? 'primary@business.com' : `staff${i}@business.com`}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                        <Shield className="w-3.5 h-3.5 text-chippy-coral" />
                                        Admin
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {i > 0 && (
                                        <button className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showOverageModal && (
                <OverageConfirmationModal
                    item="Admin Seat"
                    cost={overageCost}
                    onConfirm={confirmAdd}
                    onCancel={() => setShowOverageModal(false)}
                />
            )}
        </div>
    );
};
