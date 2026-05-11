import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, ExternalLink, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { KnowledgeBaseData } from '../types';
import { analyzeCompanyContent } from '../services/geminiService';
import { approveAiSetup, createAiSetupDraft, fetchAiSetupState } from '../services/aiSetupService';

type SetupStep = 'start' | 'review' | 'launched';

export const SetupHub = () => {
    const navigate = useNavigate();
    const { session } = useAuth();
    const { tenantConfig, setTenantConfig, knowledgeData, setKnowledgeData } = useData();
    const [businessUrl, setBusinessUrl] = useState(tenantConfig.companyUrl || knowledgeData?.website || '');
    const [phoneNumber, setPhoneNumber] = useState(knowledgeData?.phoneNumber || '');
    const [bookingLink, setBookingLink] = useState('');
    const [step, setStep] = useState<SetupStep>('start');
    const [isLoadingState, setIsLoadingState] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [isLaunching, setIsLaunching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setupId, setSetupId] = useState<string | null>(null);
    const [draft, setDraft] = useState<KnowledgeBaseData | null>(knowledgeData);
    const [playbookMarkdown, setPlaybookMarkdown] = useState('');
    const [missingFields, setMissingFields] = useState<string[]>([]);

    useEffect(() => {
        const load = async () => {
            if (!session?.access_token) return;
            setIsLoadingState(true);
            try {
                const state = await fetchAiSetupState(session.access_token);
                if (state.setup?.id) {
                    setSetupId(state.setup.id);
                    if (state.setup.status === 'launched') setStep('launched');
                }
                if (state.playbookMarkdown) {
                    setPlaybookMarkdown(state.playbookMarkdown);
                    setStep(state.setup?.status === 'launched' ? 'launched' : 'review');
                }
            } catch {
                // Setup should still be usable if state load fails.
            } finally {
                setIsLoadingState(false);
            }
        };
        load();
    }, [session?.access_token]);

    const serviceCount = draft?.services?.length || 0;
    const canLaunch = !!setupId && !!draft && serviceCount > 0 && !!session?.access_token;

    const normalizedUrl = useMemo(() => {
        const trimmed = businessUrl.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        return `https://${trimmed}`;
    }, [businessUrl]);

    const runSetup = async () => {
        if (!session?.access_token || !normalizedUrl || isScanning) return;
        setIsScanning(true);
        setError(null);
        try {
            const scanned = await analyzeCompanyContent(normalizedUrl);
            if (!scanned) throw new Error('Chippy could not scan enough business data. Try another page or add details in Advanced Knowledge.');
            const enriched = {
                ...scanned,
                website: scanned.website || normalizedUrl,
                phoneNumber: phoneNumber || scanned.phoneNumber,
            };
            const response = await createAiSetupDraft({
                accessToken: session.access_token,
                businessUrl: normalizedUrl,
                knowledgeData: enriched,
            });
            setDraft(response.draft);
            setSetupId(response.setup.id);
            setPlaybookMarkdown(response.playbookMarkdown);
            setMissingFields(response.missingFields || []);
            setStep('review');
        } catch (err: any) {
            setError(err?.message || 'Setup scan failed.');
        } finally {
            setIsScanning(false);
        }
    };

    const launchSetup = async () => {
        if (!canLaunch || !setupId || !draft || !session?.access_token || isLaunching) return;
        setIsLaunching(true);
        setError(null);
        try {
            const response = await approveAiSetup({
                accessToken: session.access_token,
                setupId,
                knowledgeData: draft,
                phoneNumber,
                bookingLink,
            });
            setKnowledgeData(response.knowledgeData);
            setTenantConfig(prev => ({
                ...prev,
                companyName: response.knowledgeData.companyName || prev.companyName,
                companyUrl: response.knowledgeData.website || normalizedUrl,
                industry: response.knowledgeData.businessCategory || 'Med Spa',
                setupChecklist: {
                    businessInfo: true,
                    services: true,
                    calendar: prev.setupChecklist?.calendar || !!bookingLink,
                    widgetInstall: prev.setupChecklist?.widgetInstall || false,
                    testConversation: prev.setupChecklist?.testConversation || false,
                }
            }));
            setPlaybookMarkdown(response.playbookMarkdown);
            setStep('launched');
        } catch (err: any) {
            setError(err?.message || 'Failed to launch Chippy.');
        } finally {
            setIsLaunching(false);
        }
    };

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-500 pb-20">
            <PageHeader
                title="AI Setup"
                subtitle="Give Chippy a website. It drafts the business playbook, asks for approval, then launches recovery."
            />

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-chippy-coral/10 text-chippy-coral flex items-center justify-center">
                            <Wand2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-chippy-navy">Launch Chippy in a few clicks</h2>
                            <p className="text-sm text-slate-500 mt-1">The approved playbook becomes the generated CHIPPY.md instruction file.</p>
                        </div>
                    </div>
                    {step === 'launched' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Launched
                        </span>
                    )}
                </div>

                {isLoadingState ? (
                    <div className="p-10 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
                        Loading setup...
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-0">
                        <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-100 space-y-5">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Business website</label>
                                <input
                                    value={businessUrl}
                                    onChange={(event) => setBusinessUrl(event.target.value)}
                                    placeholder="https://yourmedspa.com"
                                    className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-chippy-coral bg-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone number</label>
                                <input
                                    value={phoneNumber}
                                    onChange={(event) => setPhoneNumber(event.target.value)}
                                    placeholder="(555) 555-5555"
                                    className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-chippy-coral bg-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Booking link</label>
                                <input
                                    value={bookingLink}
                                    onChange={(event) => setBookingLink(event.target.value)}
                                    placeholder="Optional Calendly, booking page, or website booking URL"
                                    className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-chippy-coral bg-white"
                                />
                            </div>

                            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</div>}

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    onClick={runSetup}
                                    disabled={!normalizedUrl || isScanning}
                                    className="inline-flex items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                                >
                                    {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {isScanning ? 'Building playbook...' : 'Analyze my business'}
                                </button>
                                {step === 'review' && (
                                    <button
                                        onClick={launchSetup}
                                        disabled={!canLaunch || isLaunching}
                                        className="inline-flex items-center gap-2 px-4 py-3 bg-chippy-coral text-white rounded-xl text-sm font-semibold hover:bg-chippy-coral/90 disabled:opacity-50"
                                    >
                                        {isLaunching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                        Launch follow-up
                                    </button>
                                )}
                            </div>

                            <div className="pt-4 border-t border-slate-100 space-y-3">
                                <StatusRow done={!!draft?.companyName} label="Business profile" />
                                <StatusRow done={serviceCount > 0} label={`${serviceCount} approved service${serviceCount === 1 ? '' : 's'}`} />
                                <StatusRow done={!!playbookMarkdown} label="Generated CHIPPY.md" />
                                <StatusRow done={!!bookingLink || step === 'launched'} label={bookingLink ? 'Booking link ready' : 'Booking link optional'} />
                            </div>

                            {missingFields.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">Needs owner review</p>
                                    <p className="text-sm text-amber-900">{missingFields.join(', ')}</p>
                                </div>
                            )}

                            <button
                                onClick={() => navigate('/knowledge')}
                                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                            >
                                Advanced Knowledge <ExternalLink className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 bg-slate-50">
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen className="w-4 h-4 text-slate-500" />
                                <h3 className="text-sm font-bold text-chippy-navy">CHIPPY.md Preview</h3>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-2xl p-5 min-h-[520px] max-h-[680px] overflow-auto">
                                {playbookMarkdown ? (
                                    <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-700 font-mono">{playbookMarkdown}</pre>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-20">
                                        <Sparkles className="w-8 h-8 mb-3" />
                                        <p className="text-sm font-semibold">Your generated business instruction file will appear here.</p>
                                        <p className="text-xs mt-1">Chippy uses this as its operating brief after approval.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const StatusRow = ({ done, label }: { done: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
        {done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <span className="w-4 h-4 rounded-full border border-slate-300" />}
        <span className={done ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
    </div>
);
