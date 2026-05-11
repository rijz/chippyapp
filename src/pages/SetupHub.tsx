import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, MessageCircle, CalendarDays, BookOpen, Settings, Wrench } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useData } from '../contexts/DataContext';
import { SetupChecklist } from '../types';

const OPTIONAL_ITEMS: Array<{
    key: 'widgetInstall' | 'testConversation';
    title: string;
    description: string;
    ctaLabel: string;
    ctaPath: string;
    advancedLabel?: string;
    advancedPath?: string;
}> = [
        {
            key: 'widgetInstall',
            title: 'Install widget',
            description: 'Add the chat script to your website and mark this complete.',
            ctaLabel: 'Open Embed Setup',
            ctaPath: '/integrations#embed'
        },
        {
            key: 'testConversation',
            title: 'Run a test conversation',
            description: 'Send one test chat to confirm booking and lead capture work end to end.',
            ctaLabel: 'Open Customers',
            ctaPath: '/customers',
            advancedLabel: 'Widget preview',
            advancedPath: '/widget'
        }
    ];

export const SetupHub = () => {
    const navigate = useNavigate();
    const {
        tenantConfig,
        setTenantConfig,
        knowledgeData,
        calendarConnections,
        chatSessions
    } = useData();

    const isAdvancedMode = tenantConfig.experienceMode === 'advanced';

    const hasValidTestConversation = useMemo(() => {
        return chatSessions.some(session => {
            if (!session.messages) return false;
            let messages = session.messages as unknown;
            if (typeof messages === 'string') {
                try {
                    messages = JSON.parse(messages);
                } catch {
                    return false;
                }
            }
            return Array.isArray(messages) && messages.length >= 2;
        });
    }, [chatSessions]);

    const computedChecklist = useMemo<SetupChecklist>(() => {
        const companyNameReady = !!tenantConfig.companyName && tenantConfig.companyName !== 'Chippy User';
        const websiteReady = !!tenantConfig.companyUrl || !!knowledgeData?.website;
        const contactReady = !!knowledgeData?.phoneNumber || !!knowledgeData?.contactInfo;
        const hasServices = (knowledgeData?.services?.length || 0) > 0;
        const hasPricingText = Array.isArray(knowledgeData?.pricing)
            ? knowledgeData.pricing.length > 0
            : !!knowledgeData?.pricing && String(knowledgeData.pricing).trim().length > 0;
        const hasServicePricing = !!knowledgeData?.services?.some(service => {
            if (!service.pricing?.type) return false;
            if (service.pricing.amount !== undefined) return true;
            return ['quote', 'free', 'negotiable'].includes(service.pricing.type);
        });

        return {
            businessInfo: companyNameReady && websiteReady && contactReady,
            services: hasServices && (hasServicePricing || hasPricingText),
            calendar: calendarConnections.some(connection => connection.isActive),
            widgetInstall: tenantConfig.setupChecklist?.widgetInstall === true,
            testConversation: (tenantConfig.setupChecklist?.testConversation === true) || hasValidTestConversation
        };
    }, [tenantConfig.companyName, tenantConfig.companyUrl, tenantConfig.setupChecklist, knowledgeData, calendarConnections, hasValidTestConversation]);

    useEffect(() => {
        const currentChecklist = tenantConfig.setupChecklist;
        const mergedChecklist: SetupChecklist = {
            businessInfo: computedChecklist.businessInfo,
            services: computedChecklist.services,
            calendar: computedChecklist.calendar,
            widgetInstall: (currentChecklist?.widgetInstall === true) || computedChecklist.widgetInstall,
            testConversation: (currentChecklist?.testConversation === true) || computedChecklist.testConversation
        };

        const changed =
            !currentChecklist ||
            currentChecklist.businessInfo !== mergedChecklist.businessInfo ||
            currentChecklist.services !== mergedChecklist.services ||
            currentChecklist.calendar !== mergedChecklist.calendar ||
            currentChecklist.widgetInstall !== mergedChecklist.widgetInstall ||
            currentChecklist.testConversation !== mergedChecklist.testConversation;

        if (changed) {
            setTenantConfig(prev => ({
                ...prev,
                setupChecklist: mergedChecklist
            }));
        }
    }, [computedChecklist, tenantConfig.setupChecklist, setTenantConfig]);

    const checklist = tenantConfig.setupChecklist || computedChecklist;

    const knowledgeReady = checklist.businessInfo && checklist.services;
    const appointmentsReady = checklist.calendar;
    const coreCompleted = [knowledgeReady, appointmentsReady].filter(Boolean).length;
    const coreProgressPercent = Math.round((coreCompleted / 2) * 100);

    const knowledgePrimaryAction = knowledgeReady
        ? { label: 'Edit Knowledge', path: '/knowledge?tab=overview' }
        : (knowledgeData
            ? { label: 'Finish Knowledge Setup', path: '/knowledge?tab=overview' }
            : { label: 'Start Knowledge Setup', path: '/onboarding' });

    const appointmentPrimaryAction = appointmentsReady
        ? { label: 'Manage Calendar', path: '/integrations' }
        : { label: 'Connect Calendar', path: '/integrations' };

    const markItemComplete = (key: 'widgetInstall' | 'testConversation') => {
        setTenantConfig(prev => ({
            ...prev,
            setupChecklist: {
                businessInfo: prev.setupChecklist?.businessInfo || false,
                services: prev.setupChecklist?.services || false,
                calendar: prev.setupChecklist?.calendar || false,
                widgetInstall: key === 'widgetInstall' ? true : (prev.setupChecklist?.widgetInstall || false),
                testConversation: key === 'testConversation' ? true : (prev.setupChecklist?.testConversation || false)
            }
        }));
    };

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-500 pb-20">
            <PageHeader
                title="Setup"
                subtitle="Two simple steps for SMBs: set up knowledge, then set up appointments."
            />

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-sm font-semibold text-chippy-navy">Core Setup Progress</p>
                        <p className="text-xs text-slate-500">{coreCompleted} of 2 essential tasks complete</p>
                    </div>
                    <span className="text-sm font-bold text-chippy-navy">{coreProgressPercent}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-chippy-coral transition-all duration-500" style={{ width: `${coreProgressPercent}%` }} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                                {knowledgeReady ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                ) : (
                                    <Circle className="w-5 h-5 text-slate-300" />
                                )}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-chippy-navy">1. Knowledge Base</h3>
                                <p className="text-sm text-slate-500 mt-1">Add business details, services, and pricing so the assistant answers correctly.</p>
                            </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${knowledgeReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {knowledgeReady ? 'Done' : 'Pending'}
                        </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => navigate(knowledgePrimaryAction.path)}
                            className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                        >
                            {knowledgePrimaryAction.label}
                        </button>
                        {isAdvancedMode && (
                            <button
                                onClick={() => navigate('/knowledge?tab=data')}
                                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center gap-1"
                            >
                                Advanced data <ExternalLink className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                                {appointmentsReady ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                ) : (
                                    <Circle className="w-5 h-5 text-slate-300" />
                                )}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-chippy-navy">2. Appointments</h3>
                                <p className="text-sm text-slate-500 mt-1">Connect your calendar so Chippy can check availability and book real slots.</p>
                            </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${appointmentsReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {appointmentsReady ? 'Done' : 'Pending'}
                        </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => navigate(appointmentPrimaryAction.path)}
                            className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                        >
                            {appointmentPrimaryAction.label}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-chippy-navy mb-1">Optional Next Steps</h3>
                <p className="text-xs text-slate-500 mb-4">Helpful after core setup is done.</p>

                <div className="grid grid-cols-1 gap-3">
                    {OPTIONAL_ITEMS.map(item => {
                        const isDone = checklist[item.key];
                        return (
                            <div key={item.key} className="border border-slate-200 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-chippy-navy">{item.title}</p>
                                        <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                                    </div>
                                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {isDone ? 'Done' : 'Optional'}
                                    </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        onClick={() => navigate(item.ctaPath)}
                                        className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                                    >
                                        {item.ctaLabel}
                                    </button>
                                    {isAdvancedMode && item.advancedPath && item.advancedLabel && (
                                        <button
                                            onClick={() => navigate(item.advancedPath)}
                                            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center gap-1"
                                        >
                                            {item.advancedLabel} <ExternalLink className="w-3 h-3" />
                                        </button>
                                    )}
                                    {!isDone && (
                                        <button
                                            onClick={() => markItemComplete(item.key)}
                                            className="px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors"
                                        >
                                            Mark Complete
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-chippy-navy mb-2">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => navigate('/knowledge')}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
                    >
                        <BookOpen className="w-3.5 h-3.5" /> Knowledge
                    </button>
                    <button
                        onClick={() => navigate('/integrations')}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
                    >
                        <CalendarDays className="w-3.5 h-3.5" /> Calendar
                    </button>
                    <button
                        onClick={() => navigate('/customers')}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
                    >
                        <MessageCircle className="w-3.5 h-3.5" /> Customers
                    </button>
                    <button
                        onClick={() => navigate('/widget')}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
                    >
                        <Settings className="w-3.5 h-3.5" /> Widget
                    </button>
                    {isAdvancedMode && (
                        <button
                            onClick={() => navigate('/gateway')}
                            className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
                        >
                            <Wrench className="w-3.5 h-3.5" /> Advanced Ops
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
