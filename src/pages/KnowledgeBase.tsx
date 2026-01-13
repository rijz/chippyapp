import React, { useState } from 'react';
import { Zap, LayoutDashboard, Database, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { KnowledgeOverview } from '../components/knowledge/KnowledgeOverview';
import { KnowledgeData } from '../components/knowledge/KnowledgeData';
import { KnowledgeSources } from '../components/knowledge/KnowledgeSources';
import { PricingModal } from '../components/ui/Shared';
import { KnowledgeBaseData } from '../types';

type Tab = 'overview' | 'data' | 'sources';

export const KnowledgeBase = () => {
    const { session } = useAuth();
    const { knowledgeData, setKnowledgeData, tenantConfig, setTenantConfig, subscription, isFeatureEnabled } = useData();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [showWizard, setShowWizard] = useState(false);
    const [showRescanWarning, setShowRescanWarning] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const handleWizardComplete = (data: KnowledgeBaseData) => {
        setKnowledgeData(data);
        if (data.companyName) setTenantConfig(prev => ({ ...prev, companyName: data.companyName! }));
        setShowWizard(false);
        // Navigate to Widget Studio after onboarding
        setTimeout(() => {
            window.location.href = '/widget';
        }, 100);
    };

    const confirmRescan = () => {
        setShowRescanWarning(false);
        setShowWizard(true);
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'data', label: 'Knowledge Data', icon: Database },
        { id: 'sources', label: 'Sources', icon: LinkIcon },
    ];

    if (!knowledgeData && !showWizard) {
        return (
            <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                <header>
                    <h2 className="text-3xl font-bold text-chippy-navy tracking-tight">Knowledge Base</h2>
                    <p className="text-slate-500">Manage exactly what Agent X knows about your business.</p>
                </header>
                <div className="bg-white p-20 text-center rounded-[3rem] border border-slate-200">
                    <p className="text-slate-500 mb-6 text-lg">Knowledge base is currently offline.</p>
                    <button onClick={() => setShowWizard(true)} className="bg-chippy-coral text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-chippy-coral/20 hover:bg-red-400 transition-all">
                        Build Knowledge
                    </button>
                </div>
                {/* Wizard Overlay for Initial Build */}
                {showWizard && session?.user?.id && (
                    <OnboardingWizard
                        tenantConfig={tenantConfig}
                        userId={session.user.id}
                        onUpdateConfig={setTenantConfig}
                        onComplete={handleWizardComplete}
                        onCancel={() => setShowWizard(false)}
                    />
                )}
            </div>
        );
    }

    const isSourcesEnabled = isFeatureEnabled('Document upload training');

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {/* Header with Re-scan */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-chippy-navy tracking-tight">Knowledge Base</h2>
                    <p className="text-slate-500">Manage exactly what Agent X knows about your business.</p>
                </div>
                <button
                    onClick={() => setShowRescanWarning(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-chippy-navy rounded-2xl font-bold text-xs hover:bg-slate-50 hover:text-chippy-coral transition-all shadow-sm"
                >
                    <Zap className="w-4 h-4" /> Re-scan Website
                </button>
            </header>

            {/* Navigation Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-2xl w-fit border border-slate-200">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    const isLocked = tab.id === 'sources' && !isSourcesEnabled;

                    return (
                        <button
                            key={tab.id}
                            disabled={isLocked && false} // Let them click to see the upgrade message
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all relative ${isActive
                                ? 'bg-white text-chippy-navy shadow-sm'
                                : 'text-slate-500 hover:text-chippy-navy hover:bg-white/50'
                                } ${isLocked ? 'opacity-70' : ''}`}
                        >
                            <Icon className={`w-4 h-4 ${isActive ? 'text-chippy-coral' : ''}`} />
                            {tab.label}
                            {isLocked && <Zap className="w-3 h-3 text-chippy-yellow fill-chippy-yellow absolute -top-1 -right-1" />}
                        </button>
                    );
                })}
            </div>

            {/* Main Content */}
            {activeTab === 'overview' && <KnowledgeOverview />}
            {activeTab === 'data' && <KnowledgeData />}
            {activeTab === 'sources' && (
                isSourcesEnabled ? (
                    <KnowledgeSources />
                ) : (
                    <div className="bg-white p-20 text-center rounded-[3rem] border-2 border-dashed border-slate-100 animate-in fade-in zoom-in-95">
                        <div className="w-20 h-20 bg-chippy-coral/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <Zap className="w-10 h-10 text-chippy-coral fill-chippy-coral" />
                        </div>
                        <h3 className="text-2xl font-black text-chippy-navy mb-2">Upgrade to Unlock Sources</h3>
                        <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
                            Training your AI on PDFs, FAQs, and service guides is a **Growth** feature.
                            Upgrade now to give your assistant deeper knowledge.
                        </p>
                        <button
                            onClick={() => setShowUpgradeModal(true)}
                            className="bg-chippy-navy text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-chippy-coral transition-all"
                        >
                            View Plans
                        </button>
                    </div>
                )
            )}

            {showUpgradeModal && <PricingModal onClose={() => setShowUpgradeModal(false)} currentPlan={subscription.plan} />}

            {/* Re-scan Warning Modal */}
            {showRescanWarning && (
                <div className="fixed inset-0 bg-chippy-navy/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 border-4 border-amber-100">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                            <AlertTriangle className="w-8 h-8 text-amber-500" />
                        </div>
                        <h3 className="text-xl font-bold text-chippy-navy text-center mb-2">Warning: Re-scan Website?</h3>
                        <p className="text-slate-500 text-center mb-8 text-sm leading-relaxed">
                            Re-scanning will overwrite your existing knowledge base with fresh data from your website.
                            <span className="block mt-2 font-bold text-red-500">Any manual edits you made in the "Data" tab may be lost.</span>
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRescanWarning(false)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRescan}
                                className="flex-1 py-3 bg-chippy-navy text-white rounded-xl font-bold text-sm hover:bg-chippy-coral transition-colors shadow-lg"
                            >
                                Continue & Scan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Wizard Overlay (Re-used) */}
            {showWizard && session?.user?.id && (
                <OnboardingWizard
                    tenantConfig={tenantConfig}
                    userId={session.user.id}
                    onUpdateConfig={setTenantConfig}
                    onComplete={handleWizardComplete}
                    onCancel={() => setShowWizard(false)}
                />
            )}
        </div>
    );
};
