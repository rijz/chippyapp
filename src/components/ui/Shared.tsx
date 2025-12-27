import React from 'react';
import { ContactFieldRequirement, TenantConfig } from '../../types';
import { CheckCircle2, PencilLine, X, History } from 'lucide-react';

// --- KnowledgeCard ---
export const KnowledgeCard = ({
    title,
    icon,
    isEditing,
    onEdit,
    onSave,
    children
}: {
    title: string,
    icon: React.ReactNode,
    isEditing: boolean,
    onEdit: () => void,
    onSave: () => void,
    children: React.ReactNode
}) => (
    <div className={`bg-white p-8 rounded-[2rem] border-2 transition-all ${isEditing ? 'border-chippy-coral' : 'border-slate-100'}`}>
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 text-chippy-navy rounded-2xl">{icon}</div>
                <h3 className="font-black text-lg text-chippy-navy">{title}</h3>
            </div>
            <button onClick={isEditing ? onSave : onEdit} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                {isEditing ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <PencilLine className="w-5 h-5 text-slate-400" />}
            </button>
        </div>
        {children}
    </div>
);

// --- ContactFieldSelector ---
export const ContactFieldSelector = ({
    label,
    icon,
    value,
    onChange
}: {
    label: string,
    icon: React.ReactNode,
    value: ContactFieldRequirement,
    onChange: (v: ContactFieldRequirement) => void
}) => (
    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 rounded-xl text-slate-400">{icon}</div>
            <span className="text-sm font-bold text-slate-700">{label}</span>
        </div>
        <select value={value} onChange={(e) => onChange(e.target.value as any)} className="text-xs font-black border-none bg-slate-100 rounded-xl py-2 px-3 outline-none text-slate-600 cursor-pointer">
            <option value="required">Required</option><option value="optional">Optional</option><option value="hidden">Hidden</option>
        </select>
    </div>
);

import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

// --- PricingModal ---
export const PricingModal = ({ onClose, currentPlan }: { onClose: () => void, currentPlan: string }) => {
    const { session } = useAuth();
    const { subscription } = useData();
    const [loading, setLoading] = React.useState<string | null>(null);

    const plans = [
        {
            name: 'Starter',
            priceId: 'price_1SiqlIB191hifB6xO0gbG5wb',
            price: '$49',
            desc: 'Solo practitioners and single-location businesses.',
            features: [
                '100 conversations/month',
                '1 location',
                '1 admin/user access',
                'Smart appointment booking',
                '24/7 customer answers',
                'Calendar integration (1)',
                'Learns from your website',
                'Conversation history',
                'Analytics dashboard',
                'Branded chat widget',
                'Email notifications'
            ]
        },
        {
            name: 'Growth',
            priceId: 'price_1SiqlGB191hifB6xS2KHI5tl',
            price: '$99',
            popular: true,
            desc: 'Growing businesses with multiple team members.',
            features: [
                '500 conversations/month',
                '3 locations',
                '3 admin/user access',
                'Everything in Starter, PLUS:',
                '3 calendar integrations',
                'Document upload training',
                'Custom response training',
                'Lead qualification questions',
                'Advanced analytics'
            ]
        },
        {
            name: 'Advanced',
            priceId: 'price_1SiqlEB191hifB6x3Pp7OPe4',
            price: '$249',
            desc: 'Multi-location practices and established businesses.',
            features: [
                '1,500 conversations/month',
                '5+ locations',
                '5+ admin/user access',
                'Everything in Growth, PLUS:',
                '5+ calendar integrations',
                'Multi-location management',
                'Custom reports & data export'
            ]
        },
    ];

    const handleSelect = async (plan: typeof plans[0]) => {
        if (plan.name === currentPlan) return;
        setLoading(plan.name);

        try {
            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId: plan.priceId,
                    userId: session?.user?.id,
                    userEmail: session?.user?.email
                })
            });

            const { url, error } = await response.json();
            if (error) throw new Error(error);
            if (url) window.location.href = url;
        } catch (error) {
            console.error('Checkout Error:', error);
            alert('Failed to start checkout. Please try again.');
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-chippy-navy/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[3rem] w-full max-w-5xl p-10 relative animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-8 right-8 p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-black text-chippy-navy italic">Upgrade Your Brain</h2>
                    <p className="text-slate-500 mt-2">Choose the plan that fits your business scale.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map(plan => (
                        <div key={plan.name} className={`p-8 rounded-[2.5rem] border-2 transition-all flex flex-col ${plan.popular ? 'border-chippy-coral bg-chippy-coral/5 ring-4 ring-chippy-coral/10' : 'border-slate-100'}`}>
                            {plan.popular && <span className="text-[10px] font-black uppercase tracking-widest text-chippy-coral mb-2">Most Popular</span>}
                            <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                            <div className="flex items-baseline gap-1 mb-4">
                                <span className="text-3xl font-black text-chippy-navy">{plan.price}</span>
                                <span className="text-slate-400 text-sm font-bold">/mo</span>
                            </div>
                            <p className="text-slate-500 text-xs mb-6 h-8 leading-relaxed">{plan.desc}</p>

                            <div className="flex-1 space-y-3 mb-8">
                                {plan.features.map(f => (
                                    <div key={f} className="flex gap-2 text-[11px] font-bold text-slate-600">
                                        <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${f.includes('PLUS') ? 'text-chippy-coral' : 'text-emerald-500'}`} />
                                        <span>{f}</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => handleSelect(plan)}
                                disabled={loading !== null}
                                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${plan.name === currentPlan
                                    ? 'bg-slate-100 text-slate-400 cursor-default'
                                    : 'bg-chippy-navy text-white hover:bg-chippy-coral active:scale-95'
                                    }`}
                            >
                                {loading === plan.name ? 'Launching...' : plan.name === currentPlan ? 'Active' : 'Select'}
                            </button>
                        </div>
                    ))}
                </div>
                <p className="text-center text-[10px] text-slate-400 mt-8">
                    * Extra conversations $0.50 ea. Additional locations $25/mo. Additional users $15/mo.
                </p>
            </div>
        </div>
    );
};

// --- HistoryModal ---
export const HistoryModal = ({ onClose }: { onClose: () => void }) => (
    <div className="fixed inset-0 bg-chippy-navy/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-[3rem] w-full max-w-2xl p-14 relative animate-in zoom-in-95">
            <button onClick={onClose} className="absolute top-10 right-10 p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            <h2 className="text-2xl font-black text-chippy-navy mb-10">Audit History</h2>
            <div className="space-y-6">
                {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-6 items-start pb-6 border-b border-slate-50">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400"><History className="w-6 h-6" /></div>
                        <div><p className="text-base font-bold text-chippy-navy">System Sync #{i}</p><p className="text-xs text-slate-400 mt-1">Updated Knowledge Graph {i}h ago</p></div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);
// --- OverageConfirmationModal ---
export const OverageConfirmationModal = ({
    item,
    cost,
    onConfirm,
    onCancel
}: {
    item: string,
    cost: number,
    onConfirm: () => void,
    onCancel: () => void
}) => (
    <div className="fixed inset-0 bg-chippy-navy/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
        <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 relative animate-in zoom-in-95 shadow-2xl">
            <div className="w-16 h-16 bg-chippy-yellow/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <History className="w-8 h-8 text-chippy-yellow" />
            </div>

            <h2 className="text-xl font-black text-center text-chippy-navy mb-4">Plan Limit Reached</h2>
            <p className="text-sm text-slate-500 text-center mb-8">
                Adding this **{item}** exceeds your current plan limit.
                This will add <span className="text-chippy-coral font-bold">${cost}/mo</span> to your next bill as a recurring add-on.
            </p>

            <div className="space-y-3">
                <button
                    onClick={onConfirm}
                    className="w-full py-4 bg-chippy-navy text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-chippy-coral transition-all"
                >
                    Confirm & Proceed
                </button>
                <button
                    onClick={onCancel}
                    className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
);
