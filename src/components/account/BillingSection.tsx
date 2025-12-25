import React, { useState } from 'react';
import { CreditCard, CheckCircle2, FileText, Zap, ArrowUpRight } from 'lucide-react';
import { PricingModal } from '../ui/Shared';

export const BillingSection = () => {
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const currentPlan = 'Growth';

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {showUpgradeModal && <PricingModal onClose={() => setShowUpgradeModal(false)} currentPlan={currentPlan} />}

            <div>
                <h2 className="text-xl font-bold text-chippy-navy">Billing & Plan</h2>
                <p className="text-slate-500 text-sm">Manage your subscription and payment methods.</p>
            </div>

            {/* Current Plan Card */}
            <div className="p-6 bg-gradient-to-br from-chippy-navy to-slate-800 rounded-2xl text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>

                <div className="relative z-10 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-white/20 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm">Active</span>
                            <span className="text-slate-300 text-xs">Renews Jan 24, 2026</span>
                        </div>
                        <h3 className="text-3xl font-bold mb-1">{currentPlan} Plan</h3>
                        <p className="text-slate-300 text-sm">$49/month</p>
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                        <Zap className="w-8 h-8 text-chippy-yellow" />
                    </div>
                </div>

                <div className="mt-8 flex gap-3">
                    <button
                        onClick={() => setShowUpgradeModal(true)}
                        className="px-4 py-2 bg-chippy-coral hover:bg-white hover:text-chippy-navy text-white text-xs font-bold rounded-lg transition-all"
                    >
                        Change Plan
                    </button>
                    <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-all">
                        Cancel Subscription
                    </button>
                </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white p-6 border border-slate-200 rounded-2xl">
                <h4 className="font-bold text-chippy-navy mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-slate-400" />
                    Payment Method
                </h4>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-8 bg-white border border-slate-200 rounded flex items-center justify-center">
                            <span className="font-bold text-xs text-slate-600 italic">VISA</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-chippy-navy">•••• •••• •••• 4242</p>
                            <p className="text-xs text-slate-500">Expires 12/28</p>
                        </div>
                    </div>
                    <button className="text-xs font-bold text-chippy-coral hover:text-chippy-navy">Update</button>
                </div>
            </div>

            {/* Invoices */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h4 className="font-bold text-chippy-navy flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-400" />
                        Invoice History
                    </h4>
                    <button className="text-xs font-bold text-slate-500 hover:text-chippy-navy flex items-center gap-1">
                        View All <ArrowUpRight className="w-3 h-3" />
                    </button>
                </div>
                <div className="divide-y divide-slate-100">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <CheckCircle2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-chippy-navy">Invoice #{2024000 + i}</p>
                                    <p className="text-xs text-slate-500">Dec {24 - i}, 2025</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-chippy-navy">$49.00</p>
                                <button className="text-[10px] font-bold text-slate-400 hover:text-chippy-coral mt-1">Download PDF</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
