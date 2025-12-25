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

// --- PricingModal ---
export const PricingModal = ({ onClose, currentPlan }: { onClose: () => void, currentPlan: string }) => (
    <div className="fixed inset-0 bg-chippy-navy/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-[3rem] w-full max-w-4xl p-14 relative animate-in zoom-in-95">
            <button onClick={onClose} className="absolute top-10 right-10 p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            <h2 className="text-3xl font-black text-chippy-navy mb-10 italic">Upgrade Your Brain</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {['Starter', 'Growth', 'Business'].map(plan => (
                    <div key={plan} className={`p-10 rounded-[2.5rem] border-2 transition-all ${plan === currentPlan ? 'border-chippy-coral bg-chippy-coral/5' : 'border-slate-100'}`}>
                        <h3 className="text-2xl font-black mb-4">{plan}</h3>
                        <p className="text-slate-500 text-sm mb-8">Access advanced reasoning and search tools.</p>
                        <button className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest ${plan === currentPlan ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-chippy-navy text-white hover:bg-chippy-coral'}`}>
                            {plan === currentPlan ? 'Active' : 'Select'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

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
