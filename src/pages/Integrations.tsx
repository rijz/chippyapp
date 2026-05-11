import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Globe, Plus, X, Shield, AlertCircle, Loader2, MessageCircle, Play, Square, RotateCcw, QrCode, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { PageHeader } from '../components/layout/PageHeader';
import { MultiLocationCalendarManager } from '../components/MultiLocationCalendarManager';
import {
    approveWhatsAppLinkedPairing,
    denyWhatsAppLinkedPairing,
    fetchWhatsAppLinkedSummary,
    type WhatsAppDmPolicy,
    type WhatsAppLinkedSummary,
    updateWhatsAppLinkedPolicy
} from '../services/whatsappLinkedService';
import {
    fetchGatewayServiceStatus,
    fetchGatewayStatus,
    installGatewayService,
    restartGateway,
    startGateway,
    stopGateway,
    type GatewayServiceStatus,
    type GatewaySummary,
    uninstallGatewayService
} from '../services/gatewayService';

export const Integrations = () => {
    const { session } = useAuth();
    const { tenantConfig, setTenantConfig } = useData();
    const { showToast } = useToast();
    const userId = session?.user?.id || '';
    const accessToken = session?.access_token || '';
    const isAdvancedMode = tenantConfig.experienceMode === 'advanced';

    // Embed domain state
    const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
    const [defaultDomain, setDefaultDomain] = useState<string | null>(null);
    const [newDomain, setNewDomain] = useState('');
    const [isLoadingDomains, setIsLoadingDomains] = useState(true);
    const [isSavingDomains, setIsSavingDomains] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // WhatsApp linked device state (OpenClaw-style pairing + policy)
    const [whatsAppSummary, setWhatsAppSummary] = useState<WhatsAppLinkedSummary | null>(null);
    const [whatsAppDmPolicy, setWhatsAppDmPolicy] = useState<WhatsAppDmPolicy>('pairing');
    const [whatsAppAllowFromText, setWhatsAppAllowFromText] = useState('');
    const [isLoadingWhatsApp, setIsLoadingWhatsApp] = useState(false);
    const [isRefreshingWhatsApp, setIsRefreshingWhatsApp] = useState(false);
    const [isSavingWhatsAppPolicy, setIsSavingWhatsAppPolicy] = useState(false);
    const [isMutatingPairing, setIsMutatingPairing] = useState<string | null>(null);
    const [hasWhatsAppPolicyChanges, setHasWhatsAppPolicyChanges] = useState(false);

    // Gateway daemon state (always-on OpenClaw-style lifecycle)
    const [gatewaySummary, setGatewaySummary] = useState<GatewaySummary | null>(null);
    const [isLoadingGateway, setIsLoadingGateway] = useState(false);
    const [isRefreshingGateway, setIsRefreshingGateway] = useState(false);
    const [isStartingGateway, setIsStartingGateway] = useState(false);
    const [isStoppingGateway, setIsStoppingGateway] = useState(false);
    const [isRestartingGateway, setIsRestartingGateway] = useState(false);
    const [gatewayServiceStatus, setGatewayServiceStatus] = useState<GatewayServiceStatus | null>(null);
    const [isLoadingGatewayService, setIsLoadingGatewayService] = useState(false);
    const [isInstallingGatewayService, setIsInstallingGatewayService] = useState(false);
    const [isUninstallingGatewayService, setIsUninstallingGatewayService] = useState(false);

    // Load allowed embed domains
    useEffect(() => {
        const loadEmbedDomains = async () => {
            if (!userId) {
                setIsLoadingDomains(false);
                return;
            }

            try {
                const response = await fetch(`/api/embed-domains/${userId}`);
                if (response.ok) {
                    const data = await response.json();
                    setAllowedDomains(data.allowedDomains || []);
                    setDefaultDomain(data.defaultDomain);
                }
            } catch (error) {
                console.error('[Integrations] Failed to load embed domains:', error);
            } finally {
                setIsLoadingDomains(false);
            }
        };

        loadEmbedDomains();
    }, [userId]);

    const applyWhatsAppSummary = (summary: WhatsAppLinkedSummary) => {
        setWhatsAppSummary(summary);
        setWhatsAppDmPolicy(summary.policy.dmPolicy);
        setWhatsAppAllowFromText(summary.policy.allowFrom.join('\n'));
        setHasWhatsAppPolicyChanges(false);
    };

    const refreshWhatsAppSummary = async (silent = false) => {
        if (!accessToken) return;
        if (!silent) setIsLoadingWhatsApp(true);
        if (silent) setIsRefreshingWhatsApp(true);
        try {
            const summary = await fetchWhatsAppLinkedSummary(accessToken);
            applyWhatsAppSummary(summary);
        } catch (error) {
            console.error('[Integrations] Failed to load WhatsApp linked summary:', error);
            if (!silent) showToast('Failed to load WhatsApp settings', 'error');
        } finally {
            setIsLoadingWhatsApp(false);
            setIsRefreshingWhatsApp(false);
        }
    };

    const refreshGatewaySummary = async (silent = false) => {
        if (!accessToken) return;
        if (!silent) setIsLoadingGateway(true);
        if (silent) setIsRefreshingGateway(true);
        try {
            const summary = await fetchGatewayStatus(accessToken);
            setGatewaySummary(summary);
        } catch (error) {
            console.error('[Integrations] Failed to load gateway summary:', error);
            if (!silent) showToast('Failed to load gateway status', 'error');
        } finally {
            setIsLoadingGateway(false);
            setIsRefreshingGateway(false);
        }
    };

    const refreshGatewayService = async (silent = false) => {
        if (!accessToken) return;
        if (!silent) setIsLoadingGatewayService(true);
        try {
            const status = await fetchGatewayServiceStatus(accessToken);
            setGatewayServiceStatus(status.service);
        } catch (error) {
            console.error('[Integrations] Failed to load gateway service status:', error);
            if (!silent) showToast('Failed to load gateway service status', 'error');
        } finally {
            setIsLoadingGatewayService(false);
        }
    };

    useEffect(() => {
        if (!isAdvancedMode || !accessToken) {
            setWhatsAppSummary(null);
            setHasWhatsAppPolicyChanges(false);
            setGatewaySummary(null);
            setGatewayServiceStatus(null);
            return;
        }
        refreshWhatsAppSummary();
        refreshGatewaySummary();
        refreshGatewayService();
    }, [accessToken, isAdvancedMode]);

    useEffect(() => {
        if (!isAdvancedMode) return;
        const gatewayRunning = gatewaySummary?.gateway?.running === true;
        const whatsappRunning = whatsAppSummary?.gateway?.running === true;
        if (!accessToken || (!gatewayRunning && !whatsappRunning)) return;
        const timer = window.setInterval(() => {
            refreshWhatsAppSummary(true);
            refreshGatewaySummary(true);
        }, 10000);
        return () => window.clearInterval(timer);
    }, [isAdvancedMode, accessToken, gatewaySummary?.gateway?.running, whatsAppSummary?.gateway?.running]);

    const parsedWhatsAppAllowFrom = useMemo(
        () =>
            Array.from(
                new Set(
                    whatsAppAllowFromText
                        .split(/[\n,]/)
                        .map(item => item.trim())
                        .filter(Boolean)
                )
            ),
        [whatsAppAllowFromText]
    );

    const saveWhatsAppPolicy = async () => {
        if (!accessToken) {
            showToast('Please sign in to configure WhatsApp', 'warning');
            return;
        }
        setIsSavingWhatsAppPolicy(true);
        try {
            const summary = await updateWhatsAppLinkedPolicy({
                accessToken,
                dmPolicy: whatsAppDmPolicy,
                allowFrom: parsedWhatsAppAllowFrom,
            });
            applyWhatsAppSummary(summary);
            showToast('WhatsApp policy saved', 'success');
        } catch (error) {
            console.error('[Integrations] Failed to save WhatsApp policy:', error);
            showToast((error as Error).message || 'Failed to save WhatsApp policy', 'error');
        } finally {
            setIsSavingWhatsAppPolicy(false);
        }
    };

    const startWhatsAppGateway = async (options?: { resetAuth?: boolean }) => {
        if (!accessToken) {
            showToast('Please sign in to start WhatsApp gateway', 'warning');
            return;
        }

        const resetAuth = options?.resetAuth === true;
        if (resetAuth) {
            setIsRestartingGateway(true);
        } else {
            setIsStartingGateway(true);
        }

        try {
            const workspaceIds = userId ? [userId] : [];
            const lifecycle = resetAuth
                ? (gatewaySummary?.gateway?.running
                    ? await restartGateway({
                        accessToken,
                        workspaceIds,
                        relink: true,
                    })
                    : await startGateway({
                        accessToken,
                        workspaceIds,
                        relink: true,
                    }))
                : await startGateway({
                    accessToken,
                    workspaceIds,
                    relink: false,
                });

            setGatewaySummary(lifecycle.summary);
            await refreshWhatsAppSummary(true);
            showToast(resetAuth ? 'Gateway restarted with fresh relink QR' : 'Gateway started', 'success');
        } catch (error) {
            console.error('[Integrations] Failed to start/restart gateway:', error);
            showToast((error as Error).message || 'Failed to start gateway', 'error');
        } finally {
            setIsStartingGateway(false);
            setIsRestartingGateway(false);
        }
    };

    const stopWhatsAppGateway = async () => {
        if (!accessToken) {
            showToast('Please sign in to stop WhatsApp gateway', 'warning');
            return;
        }

        setIsStoppingGateway(true);
        try {
            const lifecycle = await stopGateway(accessToken);
            setGatewaySummary(lifecycle.summary);
            await refreshWhatsAppSummary(true);
            showToast('Gateway stopped', 'success');
        } catch (error) {
            console.error('[Integrations] Failed to stop gateway:', error);
            showToast((error as Error).message || 'Failed to stop gateway', 'error');
        } finally {
            setIsStoppingGateway(false);
        }
    };

    const refreshAllGatewayAndWhatsApp = async () => {
        if (!accessToken) return;
        await Promise.all([
            refreshGatewaySummary(true),
            refreshWhatsAppSummary(true),
            refreshGatewayService(true),
        ]);
    };

    const installGatewayAsService = async () => {
        if (!accessToken) return;
        setIsInstallingGatewayService(true);
        try {
            const result = await installGatewayService(accessToken);
            setGatewayServiceStatus(result.service);
            await refreshGatewaySummary(true);
            showToast('Gateway service installed and started', 'success');
        } catch (error) {
            console.error('[Integrations] Failed to install gateway service:', error);
            showToast((error as Error).message || 'Failed to install gateway service', 'error');
        } finally {
            setIsInstallingGatewayService(false);
        }
    };

    const uninstallGatewayAsService = async () => {
        if (!accessToken) return;
        setIsUninstallingGatewayService(true);
        try {
            const result = await uninstallGatewayService(accessToken);
            setGatewayServiceStatus(result.service);
            await refreshGatewaySummary(true);
            showToast('Gateway service removed', 'success');
        } catch (error) {
            console.error('[Integrations] Failed to uninstall gateway service:', error);
            showToast((error as Error).message || 'Failed to uninstall gateway service', 'error');
        } finally {
            setIsUninstallingGatewayService(false);
        }
    };

    const isGatewayMutating = isStartingGateway || isStoppingGateway || isRestartingGateway;
    const isGatewayServiceMutating = isInstallingGatewayService || isUninstallingGatewayService;
    const isGatewayServiceActive = gatewayServiceStatus?.active === true;
    const isWorkerManagedByGateway = whatsAppSummary?.gateway.managedByGateway === true;
    const workerRestartAt = whatsAppSummary?.gateway.nextRestartAt || null;
    const workerRestartCount = Number(whatsAppSummary?.gateway.restartCount || 0);
    const workerStatusLabel = whatsAppSummary?.gateway.running
        ? 'running'
        : (workerRestartAt ? `restarting at ${new Date(workerRestartAt).toLocaleTimeString()}` : 'stopped');

    const approvePairingRequest = async (code: string) => {
        if (!accessToken) return;
        setIsMutatingPairing(code);
        try {
            const summary = await approveWhatsAppLinkedPairing({
                accessToken,
                code,
            });
            applyWhatsAppSummary(summary);
            showToast(`Approved pairing ${code}`, 'success');
        } catch (error) {
            console.error('[Integrations] Failed to approve pairing:', error);
            showToast((error as Error).message || 'Failed to approve pairing', 'error');
        } finally {
            setIsMutatingPairing(null);
        }
    };

    const denyPairingRequest = async (code: string) => {
        if (!accessToken) return;
        setIsMutatingPairing(code);
        try {
            const summary = await denyWhatsAppLinkedPairing({
                accessToken,
                code,
            });
            applyWhatsAppSummary(summary);
            showToast(`Denied pairing ${code}`, 'success');
        } catch (error) {
            console.error('[Integrations] Failed to deny pairing:', error);
            showToast((error as Error).message || 'Failed to deny pairing', 'error');
        } finally {
            setIsMutatingPairing(null);
        }
    };

    const addDomain = () => {
        if (!newDomain.trim()) return;

        // Normalize domain
        let domain = newDomain.trim();
        if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
            domain = 'https://' + domain;
        }

        try {
            const url = new URL(domain);
            const origin = url.origin;

            if (!allowedDomains.includes(origin)) {
                setAllowedDomains(prev => [...prev, origin]);
                setHasChanges(true);
            }
            setNewDomain('');
        } catch (e) {
            showToast('Invalid domain format', 'error');
        }
    };

    const removeDomain = (domain: string) => {
        setAllowedDomains(prev => prev.filter(d => d !== domain));
        setHasChanges(true);
    };

    const saveDomains = async () => {
        if (!userId) {
            showToast('Please sign in to save domains', 'warning');
            return;
        }
        setIsSavingDomains(true);
        try {
            const response = await fetch(`/api/embed-domains/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: allowedDomains })
            });

            if (response.ok) {
                showToast('Allowed domains saved successfully!', 'success');
                setHasChanges(false);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('[Integrations] Failed to save embed domains:', error);
            showToast('Failed to save allowed domains', 'error');
        } finally {
            setIsSavingDomains(false);
        }
    };

    const useDefaultDomain = () => {
        if (defaultDomain && !allowedDomains.includes(defaultDomain)) {
            setAllowedDomains(prev => [...prev, defaultDomain]);
            setHasChanges(true);
        }
    };

    const markWidgetInstallComplete = () => {
        setTenantConfig(prev => ({
            ...prev,
            setupChecklist: {
                ...(prev.setupChecklist || {
                    businessInfo: false,
                    services: false,
                    calendar: false,
                    widgetInstall: false,
                    testConversation: false
                }),
                widgetInstall: true
            }
        }));
    };

    const copyEmbedCode = () => {
        navigator.clipboard.writeText(`<script src="https://app.hellochippy.com/widget.js" data-chippy-id="${userId}"></script>`);
        markWidgetInstallComplete();
        showToast("Copied to clipboard!", 'success');
    };

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-500 pb-20">
            <PageHeader
                title="Integrations"
                subtitle="Connect your calendars and embed settings."
            />

            {/* Multi-Location Calendar Manager */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-slate-200">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="w-10 h-10" />
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Google Calendar</h3>
                            <p className="text-slate-500">Manage multiple calendars for different locations.</p>
                        </div>
                    </div>
                </div>
                <div className="p-8">
                    <MultiLocationCalendarManager />
                </div>
            </div>

            {/* BOOKING PAGE LINK SECTION - Hidden for V1 (booking page uses mock data)
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="p-10 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100">
                            <CalendarDays className="w-8 h-8 text-chippy-coral" />
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Booking Page</h3>
                            <p className="text-slate-500">Share your availability with a simple link.</p>
                        </div>
                    </div>
                </div>
                <div className="p-10 text-left">
                    <p className="text-sm text-slate-500 mb-4">Send this link to clients to let them book appointments directly.</p>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 group">
                            <input
                                className="w-full p-4 bg-slate-50 text-slate-600 font-medium rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-chippy-coral"
                                readOnly
                                value={`https://app.hellochippy.com/book`}
                            />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText("https://app.hellochippy.com/book");
                                    showToast("Copied to clipboard!", 'success');
                                }}
                                className="absolute top-1/2 -translate-y-1/2 right-2 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border border-slate-200 shadow-sm"
                            >
                                Copy
                            </button>
                        </div>
                        <a
                            href="/book"
                            target="_blank"
                            className="px-6 py-4 bg-chippy-navy text-white font-bold rounded-xl hover:bg-chippy-navy/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-chippy-navy/20"
                        >
                            View Page <ChevronRight className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </div>
            */}

            {isAdvancedMode && (
                <>
            {/* WHATSAPP LINKED DEVICE SECTION */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-slate-200">
                            <MessageCircle className="w-7 h-7 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">WhatsApp (Linked Device)</h3>
                            <p className="text-slate-500">OpenClaw-style QR linking, policy control, and pairing approvals.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={refreshAllGatewayAndWhatsApp}
                            disabled={!accessToken || isRefreshingGateway || isRefreshingWhatsApp || isLoadingGateway || isLoadingWhatsApp || isLoadingGatewayService}
                            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
                        >
                            {(isRefreshingGateway || isRefreshingWhatsApp) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            Refresh
                        </button>
                        <button
                            onClick={installGatewayAsService}
                            disabled={!accessToken || isGatewayServiceMutating || gatewayServiceStatus?.supported === false}
                            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isInstallingGatewayService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                            Install 24/7
                        </button>
                        <button
                            onClick={uninstallGatewayAsService}
                            disabled={!accessToken || isGatewayServiceMutating || !gatewayServiceStatus?.installed}
                            className="px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isUninstallingGatewayService ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                            Remove Service
                        </button>
                        <button
                            onClick={() => startWhatsAppGateway()}
                            disabled={!accessToken || isGatewayMutating || isGatewayServiceActive}
                            className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isStartingGateway ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Start Daemon
                        </button>
                        <button
                            onClick={() => startWhatsAppGateway({ resetAuth: true })}
                            disabled={!accessToken || isGatewayMutating || isGatewayServiceActive}
                            className="px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isRestartingGateway ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            Restart + Relink
                        </button>
                        <button
                            onClick={stopWhatsAppGateway}
                            disabled={!accessToken || isGatewayMutating || isGatewayServiceActive}
                            className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isStoppingGateway ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                            Stop Daemon
                        </button>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    {!accessToken ? (
                        <div className="flex items-start gap-2 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-slate-600 font-medium">Sign in to configure WhatsApp</p>
                                <p className="text-xs text-slate-500">WhatsApp linked-device setup is available for authenticated workspaces.</p>
                            </div>
                        </div>
                    ) : ((isLoadingWhatsApp && !whatsAppSummary) || (isLoadingGateway && !gatewaySummary)) ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="border border-slate-200 rounded-xl p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-chippy-navy">Daemon Status</h4>
                                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${gatewaySummary?.gateway.running ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                                            {gatewaySummary?.gateway.running ? 'Running' : 'Stopped'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600">Daemon PID: {gatewaySummary?.gateway.pid || 'n/a'}</p>
                                    <p className="text-sm text-slate-600">
                                        Service:
                                        {' '}
                                        {!gatewayServiceStatus
                                            ? 'n/a'
                                            : (gatewayServiceStatus.supported
                                                ? `${gatewayServiceStatus.installed ? 'installed' : 'not installed'} / ${gatewayServiceStatus.active ? 'active' : 'inactive'}`
                                                : 'unsupported on this platform')}
                                    </p>
                                    <p className="text-sm text-slate-600">Service Manager: {gatewayServiceStatus?.manager || 'n/a'}</p>
                                    {isGatewayServiceActive ? (
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                                            24/7 service is active. Use "Remove Service" before manual daemon start/stop/relink.
                                        </p>
                                    ) : null}
                                    <p className="text-sm text-slate-600">Worker: {workerStatusLabel}</p>
                                    <p className="text-sm text-slate-600">Worker PID: {whatsAppSummary?.gateway.pid || 'n/a'}</p>
                                    <p className="text-sm text-slate-600">Worker Control: {isWorkerManagedByGateway ? `daemon (${whatsAppSummary?.gateway.gatewayPid || 'n/a'})` : 'direct process'}</p>
                                    <p className="text-sm text-slate-600">Worker Restarts: {workerRestartCount}</p>
                                    <p className="text-sm text-slate-600">
                                        Scheduler:
                                        {' '}
                                        {gatewaySummary?.state?.scheduler
                                            ? `${gatewaySummary.state.scheduler.tickSeconds}s tick / ${gatewaySummary.state.scheduler.heartbeatMinutes}m heartbeat`
                                            : 'n/a'}
                                    </p>
                                    <p className="text-sm text-slate-600">Auth Session: {whatsAppSummary?.gateway.hasAuthSession ? 'present' : 'not linked yet'}</p>
                                    <p className="text-sm text-slate-600">Pairing Code: {whatsAppSummary?.gateway.pairingCode || 'n/a'}</p>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <QrCode className="w-4 h-4 text-slate-600" />
                                        <h4 className="font-bold text-chippy-navy">Pairing QR</h4>
                                    </div>
                                    {whatsAppSummary?.gateway.qrImageDataUrl ? (
                                        <img
                                            src={whatsAppSummary.gateway.qrImageDataUrl}
                                            alt="WhatsApp QR"
                                            className="w-56 h-56 object-contain border border-slate-200 rounded-lg bg-white"
                                        />
                                    ) : (
                                        <p className="text-sm text-slate-500">Start QR pairing to generate a scannable code.</p>
                                    )}
                                    <p className="text-xs text-slate-400">
                                        {'WhatsApp -> Linked Devices -> Link a device, then scan this QR.'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                                    <h4 className="font-bold text-chippy-navy">Access Policy</h4>
                                    <label className="text-sm text-slate-600 block">DM Policy</label>
                                    <select
                                        value={whatsAppDmPolicy}
                                        onChange={(e) => {
                                            setWhatsAppDmPolicy(e.target.value as WhatsAppDmPolicy);
                                            setHasWhatsAppPolicyChanges(true);
                                        }}
                                        className="w-full p-3 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="pairing">pairing (default)</option>
                                        <option value="allowlist">allowlist</option>
                                    </select>
                                    <label className="text-sm text-slate-600 block">Allow From (one number per line)</label>
                                    <textarea
                                        value={whatsAppAllowFromText}
                                        onChange={(e) => {
                                            setWhatsAppAllowFromText(e.target.value);
                                            setHasWhatsAppPolicyChanges(true);
                                        }}
                                        rows={6}
                                        placeholder="+14168370477"
                                        className="w-full p-3 border border-slate-200 rounded-lg text-sm font-mono"
                                    />
                                    <button
                                        onClick={saveWhatsAppPolicy}
                                        disabled={!hasWhatsAppPolicyChanges || isSavingWhatsAppPolicy}
                                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSavingWhatsAppPolicy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        Save Policy
                                    </button>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <KeyRound className="w-4 h-4 text-slate-600" />
                                        <h4 className="font-bold text-chippy-navy">Pairing Requests</h4>
                                    </div>
                                    {whatsAppSummary?.pendingPairings?.length ? (
                                        <div className="space-y-2">
                                            {whatsAppSummary.pendingPairings.map((request) => (
                                                <div key={request.code} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                                                    <p className="text-sm font-semibold text-slate-700">{request.code}</p>
                                                    <p className="text-xs text-slate-500">{request.phone}</p>
                                                    <p className="text-xs text-slate-400">expires {new Date(request.expiresAt).toLocaleString()}</p>
                                                    <div className="flex gap-2 mt-2">
                                                        <button
                                                            onClick={() => approvePairingRequest(request.code)}
                                                            disabled={isMutatingPairing === request.code}
                                                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => denyPairingRequest(request.code)}
                                                            disabled={isMutatingPairing === request.code}
                                                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
                                                        >
                                                            Deny
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500">No pending pairing requests.</p>
                                    )}
                                </div>
                            </div>

                            {whatsAppSummary?.gateway.logTail ? (
                                <div className="border border-slate-200 rounded-xl p-5">
                                    <h4 className="font-bold text-chippy-navy mb-3">Gateway Log (tail)</h4>
                                    <pre className="text-xs bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap">
                                        {whatsAppSummary.gateway.logTail}
                                    </pre>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
                </>
            )}

            {/* WEBSITE EMBED SECTION */}
            <div id="embed" className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-slate-200">
                            <code className="text-lg font-bold text-slate-600">&lt;/&gt;</code>
                        </div>
                        <div>
                            <h3 className="font-bold text-2xl text-chippy-navy">Website Embed</h3>
                            <p className="text-slate-500">Add the AI agent to your own website with one line of code.</p>
                        </div>
                    </div>
                </div>
                <div className="p-8 text-left space-y-8">
                    {/* Embed Code */}
                    <div>
                        <p className="text-sm text-slate-500 mb-4">Copy and paste this code anywhere in your website's HTML (before <code>&lt;/body&gt;</code> is recommended).</p>
                        <div className="relative group">
                            <div className="w-full p-4 bg-slate-900 text-slate-300 font-mono text-sm rounded-xl border border-slate-700 overflow-x-auto">
                                <span className="text-purple-400">&lt;script</span>
                                <span className="text-sky-400"> src</span>=<span className="text-emerald-400">"https://app.hellochippy.com/widget.js"</span>
                                <span className="text-sky-400"> data-chippy-id</span>=<span className="text-emerald-400">"{userId}"</span>
                                <span className="text-purple-400">&gt;&lt;/script&gt;</span>
                            </div>
                            <button
                                onClick={copyEmbedCode}
                                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-md text-xs font-semibold transition-all border border-white/10"
                            >
                                Copy Code
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-3">Works with any website: WordPress, Shopify, Squarespace, Wix, custom HTML, and more.</p>
                    </div>

                    {/* Allowed Domains Section */}
                    <div className="border-t border-slate-100 pt-8">
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="w-5 h-5 text-slate-500" />
                            <h4 className="font-bold text-lg text-chippy-navy">Allowed Embed Domains</h4>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            For security, specify which websites can embed your chat widget. Only these domains will be able to display your widget in an iframe.
                        </p>

                        {isLoadingDomains ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        ) : !userId ? (
                            <div className="flex items-start gap-2 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm text-slate-600 font-medium">Sign in to manage domains</p>
                                    <p className="text-xs text-slate-500">
                                        You need to be signed in to add or save allowed embed domains.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Current Domains List */}
                                <div className="space-y-2 mb-4">
                                    {allowedDomains.length === 0 ? (
                                        <div className="flex items-center gap-2 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                            <p className="text-sm text-slate-600">
                                                No domains configured. Your widget can currently be embedded on any website.
                                                {defaultDomain && (
                                                    <button
                                                        onClick={useDefaultDomain}
                                                        className="ml-2 text-slate-700 underline hover:text-slate-900 font-medium"
                                                    >
                                                        Add {defaultDomain}
                                                    </button>
                                                )}
                                            </p>
                                        </div>
                                    ) : (
                                        allowedDomains.map((domain, index) => (
                                            <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg group">
                                                <Globe className="w-4 h-4 text-slate-400" />
                                                <span className="flex-1 text-sm font-medium text-slate-700">{domain}</span>
                                                <button
                                                    onClick={() => removeDomain(domain)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded-md transition-all"
                                                >
                                                    <X className="w-4 h-4 text-slate-500" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Add New Domain */}
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        value={newDomain}
                                        onChange={(e) => setNewDomain(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                                        placeholder="https://yourwebsite.com"
                                        className="flex-1 p-3 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-chippy-coral focus:border-transparent"
                                    />
                                    <button
                                        onClick={addDomain}
                                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all flex items-center gap-2 font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add
                                    </button>
                                </div>

                                {/* Default Domain Suggestion */}
                                {defaultDomain && !allowedDomains.includes(defaultDomain) && allowedDomains.length > 0 && (
                                    <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4">
                                        <Globe className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                        <p className="text-sm text-slate-600 flex-1">
                                            Your website <strong>{defaultDomain}</strong> is not in the list.
                                        </p>
                                        <button
                                            onClick={useDefaultDomain}
                                            className="text-slate-700 hover:text-slate-900 text-sm font-medium underline"
                                        >
                                            Add it
                                        </button>
                                    </div>
                                )}

                                {/* Save Button */}
                                {hasChanges && (
                                    <button
                                        onClick={saveDomains}
                                        disabled={isSavingDomains}
                                        className="w-full py-3 bg-slate-900 hover:bg-slate-900/90 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isSavingDomains ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4" />
                                                Save Changes
                                            </>
                                        )}
                                    </button>
                                )}

                                {/* Security Note */}
                                {allowedDomains.length > 0 && (
                                    <p className="text-xs text-slate-400 mt-4 flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        Your widget is protected. Only the domains listed above can embed it.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
