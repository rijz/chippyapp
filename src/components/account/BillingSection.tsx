import React, { useState } from 'react';
import { CreditCard, CheckCircle2, FileText, Zap, ArrowUpRight } from 'lucide-react';
import { PricingModal } from '../ui/Shared';

import { useData } from '../../contexts/DataContext';
import { PLAN_DETAILS } from '../../types';

export const BillingSection = () => {
    const { subscription, getOverageCost } = useData();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const planDetails = {
        'Starter': { color: 'from-slate-700 to-slate-900' },
        'Growth': { color: 'from-chippy-navy to-slate-800' },
        'Advanced': { color: 'from-chippy-coral to-rose-700' },
        'Free': { color: 'from-slate-400 to-slate-600' }
    };

    const details = planDetails[subscription.plan] || planDetails['Starter'];
    const limits = PLAN_DETAILS[subscription.plan]?.limits || { conversations: 0, locations: 0, admins: 0, calendars: 0 };
    const overageCost = getOverageCost();

    const UsageBar = ({ label, current, limit, unit = '' }: { label: string, current: number, limit: number, unit?: string }) => {
        const percentage = Math.min((current / limit) * 100, 100);
        const isOver = current > limit;

        return (
            <div className="space-y-2">
                <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                    <span className={`text-xs font-bold ${isOver ? 'text-chippy-coral' : 'text-chippy-navy'}`}>
                        {current}{unit} / {limit}{unit}
                    </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-1000 ${isOver ? 'bg-chippy-coral' : 'bg-chippy-navy'}`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
                {isOver && <p className="text-[10px] text-chippy-coral font-bold">+ ${PLAN_DETAILS[subscription.plan].overage[label.toLowerCase().slice(0, -1)] || 0} add-on active</p>}
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
            {showUpgradeModal && <PricingModal onClose={() => setShowUpgradeModal(false)} currentPlan={subscription.plan} />}

            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-bold text-chippy-navy">Billing & Plan</h2>
                    <p className="text-slate-500 text-sm">Manage your subscription and usage.</p>
                </div>
                {overageCost > 0 && (
                    <div className="bg-chippy-coral/10 border border-chippy-coral/20 px-4 py-2 rounded-xl">
                        <p className="text-[10px] font-black uppercase text-chippy-coral">Estimated Overage</p>
                        <p className="text-lg font-black text-chippy-navy">+${overageCost.toFixed(2)}</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Current Plan Card */}
                <div className={`p-6 bg-gradient-to-br ${details.color} rounded-[2rem] text-white shadow-xl relative overflow-hidden h-fit`}>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>

                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm ${subscription.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/20 text-white'}`}>
                                    {subscription.status}
                                </span>
                                {subscription.nextBillingDate && <span className="text-slate-300 text-[10px]">Renews {subscription.nextBillingDate}</span>}
                            </div>
                            <h3 className="text-3xl font-black mb-1">{subscription.plan}</h3>
                            <p className="text-slate-300 text-xs font-bold">${PLAN_DETAILS[subscription.plan]?.price || 0}/month base</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                            <Zap className="w-8 h-8 text-chippy-yellow fill-chippy-yellow" />
                        </div>
                    </div>

                    <div className="mt-8 flex gap-3 relative z-10">
                        <button
                            onClick={() => setShowUpgradeModal(true)}
                            className="px-6 py-2.5 bg-white text-chippy-navy hover:bg-chippy-coral hover:text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95"
                        >
                            {subscription.status === 'active' ? 'Change Plan' : 'Choose Plan'}
                        </button>
                    </div>
                </div>

                {/* Usage Stats Card */}
                <div className="bg-white p-8 border border-slate-200 rounded-[2rem] shadow-sm space-y-6">
                    <h4 className="font-black text-chippy-navy text-sm uppercase tracking-widest border-b border-slate-50 pb-4 flex justify-between items-center">
                        Plan Usage
                        <span className="text-[10px] text-slate-400 font-bold">This Cycle</span>
                    </h4>

                    <div className="space-y-6">
                        <UsageBar label="Conversations" current={subscription.usage.conversations} limit={limits.conversations} />
                        <UsageBar label="Locations" current={subscription.usage.locations} limit={limits.locations} />
                        <UsageBar label="Admins" current={subscription.usage.admins} limit={limits.admins} />
                        <UsageBar label="Calendars" current={subscription.usage.calendars} limit={limits.calendars} />
                    </div>
                </div>
            </div>

            {/* Invoices */}
            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h4 className="font-black text-sm uppercase tracking-widest text-chippy-navy flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-400" />
                        Invoice History
                    </h4>
                </div>
                <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-400">Your first invoice will appear here after your cycle ends.</p>
                </div>
            </div>
        </div>
    );
};
