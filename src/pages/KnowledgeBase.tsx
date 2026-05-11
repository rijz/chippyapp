import React, { useState, useEffect } from 'react';
import { Zap, LayoutDashboard, Database, Link as LinkIcon, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { PageHeader } from '../components/layout/PageHeader';
import { KnowledgeOverview } from '../components/knowledge/KnowledgeOverview';
import { KnowledgeData } from '../components/knowledge/KnowledgeData';
import { KnowledgeSources } from '../components/knowledge/KnowledgeSources';
import { PricingModels } from '../components/knowledge/PricingModels';
import { PricingModal } from '../components/ui/Shared';
import { KnowledgeBaseData } from '../types';
import { useSearchParams, useLocation } from 'react-router-dom';

type Tab = 'overview' | 'data' | 'pricing' | 'sources';

export const KnowledgeBase = () => {
    const { session } = useAuth();
    const { knowledgeData, setKnowledgeData, tenantConfig, setTenantConfig, subscription, isFeatureEnabled } = useData();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [showWizard, setShowWizard] = useState(false);
    const [showRescanWarning, setShowRescanWarning] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [blockedAdvancedTab, setBlockedAdvancedTab] = useState<'data' | 'sources' | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const isAdvancedMode = tenantConfig.experienceMode === 'advanced';

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
        { id: 'pricing', label: 'Services & Pricing', icon: DollarSign },
        { id: 'sources', label: 'Sources', icon: LinkIcon },
    ];

    const visibleTabs = isAdvancedMode
        ? tabs
        : tabs.filter(tab => tab.id === 'overview' || tab.id === 'pricing');

    useEffect(() => {
        const tab = searchParams.get('tab') as Tab | null;
        const resolvedTab: Tab = tab && tabs.some(t => t.id === tab) ? tab : 'overview';

        if (!isAdvancedMode && (resolvedTab === 'data' || resolvedTab === 'sources')) {
            setBlockedAdvancedTab(resolvedTab);
            setActiveTab('overview');
            return;
        }

        setBlockedAdvancedTab(null);
        setActiveTab(resolvedTab);
    }, [searchParams, isAdvancedMode]);

    useEffect(() => {
        if (location.hash && (activeTab === 'data' || activeTab === 'pricing')) {
            const target = document.querySelector(location.hash);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [location.hash, activeTab]);

    if (!knowledgeData && !showWizard) {
        return (
            <div className="w-full space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                <PageHeader
                    title="Knowledge"
                    subtitle="Manage exactly what your assistant knows about your business."
                />
                <div className="bg-white p-16 text-center rounded-2xl border border-slate-200">
                    <p className="text-slate-500 mb-6 text-lg">Knowledge base is currently offline.</p>
                    <button onClick={() => setShowWizard(true)} className="bg-chippy-navy text-white px-8 py-3 rounded-xl font-bold hover:bg-chippy-navy/90 transition-colors">
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
        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {/* Header with Re-scan */}
            <PageHeader
                title="Knowledge"
                subtitle={
                    <div className="flex items-center gap-3">
                        <span>{isAdvancedMode ? 'Manage exactly what your assistant knows about your business.' : 'Keep business info and services accurate for better booking conversations.'}</span>
                        {isAdvancedMode && knowledgeData?.lastUpdated && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                <Clock className="w-3 h-3" />
                                Updated {new Date(knowledgeData.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                }
                actions={isAdvancedMode ? (
                    <button
                        onClick={() => setShowRescanWarning(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-semibold text-xs hover:bg-slate-50 transition-colors"
                    >
                        <Zap className="w-4 h-4" /> Re-scan Website
                    </button>
                ) : undefined}
            />

            {!isAdvancedMode && blockedAdvancedTab && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-600">
                        {blockedAdvancedTab === 'data' ? 'Detailed knowledge data tools are available in Advanced mode.' : 'Knowledge sources and document training are available in Advanced mode.'}
                    </p>
                    <button
                        onClick={() => {
                            setTenantConfig(prev => ({ ...prev, experienceMode: 'advanced' }));
                            setSearchParams({ tab: blockedAdvancedTab });
                            setActiveTab(blockedAdvancedTab);
                        }}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                    >
                        Switch to Advanced
                    </button>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="bg-white border border-slate-200 rounded-xl p-2 w-fit">
                <div className="flex gap-2">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        const isLocked = tab.id === 'sources' && !isSourcesEnabled;

                        return (
                            <button
                                key={tab.id}
                                disabled={isLocked && false} // Let them click to see the upgrade message
                                onClick={() => {
                                    setActiveTab(tab.id as Tab);
                                    setSearchParams({ tab: tab.id });
                                }}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all relative ${isActive
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    } ${isLocked ? 'opacity-70' : ''}`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                                {isLocked && <Zap className="w-3 h-3 text-slate-400 absolute -top-1 -right-1" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Content */}
            {activeTab === 'overview' && <KnowledgeOverview />}
            {activeTab === 'data' && <KnowledgeData />}
            {activeTab === 'pricing' && <PricingModels />}
            {activeTab === 'sources' && (
                isSourcesEnabled ? (
                    <KnowledgeSources />
                ) : (
                    <div className="bg-white p-16 text-center rounded-2xl border border-dashed border-slate-200 animate-in fade-in zoom-in-95">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Zap className="w-8 h-8 text-slate-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-chippy-navy mb-2">Upgrade to Unlock Sources</h3>
                        <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
                            Training your assistant on PDFs and guides is a Growth feature.
                            Upgrade to unlock document sources.
                        </p>
                        <button
                            onClick={() => setShowUpgradeModal(true)}
                            className="bg-chippy-navy text-white px-6 py-2.5 rounded-lg font-semibold text-xs uppercase tracking-wider hover:bg-chippy-navy/90 transition-colors"
                        >
                            View Plans
                        </button>
                    </div>
                )
            )}

            {showUpgradeModal && <PricingModal onClose={() => setShowUpgradeModal(false)} currentPlan={subscription.plan} />}

            {/* Re-scan Warning Modal */}
            {showRescanWarning && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl animate-in zoom-in-95 duration-200 border border-slate-200">
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-6 mx-auto">
                            <AlertTriangle className="w-6 h-6 text-slate-500" />
                        </div>
                        <h3 className="text-xl font-bold text-chippy-navy text-center mb-2">Re-scan Website?</h3>
                        <p className="text-slate-500 text-center mb-8 text-sm leading-relaxed">
                            Re-scanning will overwrite your existing knowledge base with fresh data from your website.
                            <span className="block mt-2 font-semibold text-slate-700">Any manual edits you made in the "Data" tab may be lost.</span>
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRescanWarning(false)}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRescan}
                                className="flex-1 py-3 bg-chippy-navy text-white rounded-lg font-semibold text-sm hover:bg-chippy-navy/90 transition-colors"
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
