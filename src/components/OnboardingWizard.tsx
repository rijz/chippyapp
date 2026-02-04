import React, { useState, useEffect, useRef } from 'react';
import {
   Globe,
   ArrowRight,
   Loader2,
   CheckCircle2,
   FileText,
   Upload,
   Sparkles,
   LayoutTemplate,
   Tag,
   Clock,
   ShieldCheck,
   Plus,
   Trash2,
   DollarSign,
   AlertCircle,
   ChevronDown,
   Terminal,
   BrainCircuit,
   Zap,
   Cpu,
   Search,
   Building,
   Phone,
   Link2,
   Unlock,
   MapPin,
   Store,
   Car,
   Laptop
} from 'lucide-react';
import { KnowledgeBaseData, LogEntry, TenantConfig, BusinessLocation, BusinessType, Service } from '../types';
import { analyzeCompanyContent, analyzeRawText } from '../services/geminiService';
import { uploadKnowledgeAsset } from '../services/supabaseStorage';
import { ServiceEditor } from './ServiceEditor';
import { normalizeKnowledgeData, generateServiceId, defaultPricing } from '../utils/serviceUtils';
import { AddressAutocomplete } from './AddressAutocomplete';

interface OnboardingWizardProps {
   tenantConfig: TenantConfig;
   userId?: string;
   onUpdateConfig: (config: TenantConfig) => void;
   onComplete: (data: KnowledgeBaseData) => void;
   onCancel: () => void;
}

// Define the sections for the card review system
type SectionKey = 'identity' | 'services' | 'operations' | 'pricing' | 'policies';

interface SectionStatus {
   identity: boolean;
   services: boolean;
   operations: boolean;
   pricing: boolean;
   policies: boolean;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
   tenantConfig,
   userId,
   onUpdateConfig,
   onComplete,
   onCancel
}) => {
   const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
   const [url, setUrl] = useState(tenantConfig.companyUrl);

   // Step 1.5: Business Type
   const [businessType, setBusinessType] = useState<BusinessType | null>(tenantConfig.businessType || null);
   const [locations, setLocations] = useState<BusinessLocation[]>(tenantConfig.locations || [{
      name: 'Main Location',
      address: '',
      city: '',
      state: '',
      zip: ''
   }]);

   // Step 2 State
   const [logs, setLogs] = useState<LogEntry[]>([]);
   const [progress, setProgress] = useState(0);
   const [scannedData, setScannedData] = useState<KnowledgeBaseData | null>(null);
   const [scanError, setScanError] = useState<string | null>(null);
   const [isScanning, setIsScanning] = useState(false);
   const lastLoggedStageRef = useRef<number>(-1);
   const logsEndRef = useRef<HTMLDivElement>(null);

   // Step 3 State
   const [expandedSection, setExpandedSection] = useState<SectionKey | null>('identity');
   const [sectionStatus, setSectionStatus] = useState<SectionStatus>({
      identity: false,
      services: false,
      operations: false,
      pricing: false,
      policies: false
   });
   const [isProcessingFile, setIsProcessingFile] = useState(false);
   const [isTraining, setIsTraining] = useState(false);
   const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
   const [isScanningPricing, setIsScanningPricing] = useState(false);
   const [pricingScanResult, setPricingScanResult] = useState<{ success: boolean; message: string } | null>(null);

   // Step 4 State
   const [trainingPhase, setTrainingPhase] = useState(0);

   // Scroll logs to bottom
   useEffect(() => {
      if (logsEndRef.current) {
         logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
   }, [logs]);

   const addLog = (message: string, status: LogEntry['status'] = 'processing') => {
      setLogs(prev => [...prev, {
         id: Date.now().toString(),
         message,
         status,
         timestamp: new Date()
      }]);
   };

   // Step 1 → Step 2: Just save URL and proceed to Business Type selection
   const handleProceedToBusinessType = () => {
      if (!url) return;
      onUpdateConfig({ ...tenantConfig, companyUrl: url });
      setStep(2);
   };

   // Step 2 → Step 3: Actually start the scan after business type is selected
   const handleStartScan = async () => {
      if (!url) return;

      setStep(3);
      setProgress(10);
      setLogs([]);
      setScannedData(null);
      setScanError(null);
      setIsScanning(true);
      lastLoggedStageRef.current = -1;

      addLog(`Initializing Gemini Agent...`, 'pending');
      addLog(`Connecting to ${url}...`, 'pending');

      // Deterministic Progress & Logs (Matches Deep Scan Strategy)
      const STAGES = [
         { p: 10, m: "Resolving DNS & Host..." },
         { p: 20, m: "Analyzing Sitemap Structure..." },
         { p: 35, m: "Scanning Homepage for Identity..." },
         { p: 55, m: "Deep Search: Services & Offerings..." },
         { p: 70, m: "Deep Search: Pricing Information..." },
         { p: 85, m: "Deep Search: Policies & Terms..." },
         { p: 92, m: "Synthesizing Knowledge Model..." },
         { p: 96, m: "Finalizing data extraction..." },
         { p: 98, m: "Validating extracted entities..." }
      ];

      let tick = 0;
      const timer = setInterval(() => {
         tick++;
         // Slow progress creep up to 98%
         setProgress(prev => Math.min(prev + (80 / 60), 98));

         // Check if we need to emit a log based on progress thresholds
         // We map ticks (approx 100ms) to stages roughly
         // Let's just use the STAGES array cyclically based on progress

         const currentProgress = 10 + (tick * 1.5); // Approx progress calculation
         const stageIndex = STAGES.findIndex(s => Math.abs(s.p - currentProgress) < 2);

         if (stageIndex !== -1 && stageIndex > lastLoggedStageRef.current) {
            addLog(STAGES[stageIndex].m, 'processing');
            lastLoggedStageRef.current = stageIndex;
         }
      }, 100);

      try {
         const data = await analyzeCompanyContent(url);
         clearInterval(timer);
         setProgress(100);
         setIsScanning(false);

         if (data) {
            setScannedData(data);

            // Dynamic Result Logs
            addLog(`✓ Found ${data.services?.length || 0} Services/Offerings`, 'success');
            if (data.pricing && data.pricing !== 'Detailed pricing information was not found.' && data.pricing !== 'No pricing information found.') {
               addLog("✓ Successfully captured Pricing Packages", 'success');
            } else {
               addLog("ℹ No detailed pricing found (you can add it manually)", 'pending');
            }
            if (data.businessHours && data.businessHours !== 'Not specified') {
               addLog("✓ Captured Business Hours", 'success');
            }

            addLog("Data Model Constructed Successfully.", 'success');
            addLog("Ready for human verification.", 'success');
         } else {
            addLog("Scan returned no data. Manual entry required.", 'error');
            setScanError("Could not extract data from website. You can continue with manual entry.");
         }
      } catch (error: any) {
         clearInterval(timer);
         setProgress(100);
         setIsScanning(false);
         const errorMessage = error?.message || 'Unknown error occurred';
         console.error('[Onboarding] Scan error:', errorMessage);

         // Show user-friendly error messages based on the error type
         let userMessage = '';
         if (errorMessage.includes('timed out') || errorMessage.includes('504')) {
            userMessage = 'The website took too long to respond. This can happen with complex websites. You can try again or continue with manual entry.';
            addLog(`⏱️ Scan timed out`, 'error');
         } else if (errorMessage.includes('Rate limit') || errorMessage.includes('429')) {
            userMessage = 'Rate limit reached. You can only scan 5 websites per hour. Please wait and try again later.';
            addLog(`⚠️ Rate limit exceeded`, 'error');
         } else if (errorMessage.includes('not extract enough')) {
            userMessage = 'Could not find enough content on the website. The site may be blocking our scanner, or it may have limited public content.';
            addLog(`ℹ️ Limited content found`, 'error');
         } else {
            userMessage = `Scan failed: ${errorMessage}. You can continue with manual entry.`;
            addLog(`❌ Error: ${errorMessage}`, 'error');
         }

         setScanError(userMessage);
      }
   };

   const handleFileUpload = async (files: FileList | null) => {
      if (!files || files.length === 0 || !scannedData) return;
      setIsProcessingFile(true);
      setUploadFeedback('Initializing upload...');

      const file = files[0];
      let uploadedUrl: string | null = null;

      // 1. Upload to Supabase if user exists
      if (userId) {
         setUploadFeedback('Uploading to Cloud Storage...');
         uploadedUrl = await uploadKnowledgeAsset(file, userId);
      }

      setUploadFeedback('Analyzing content...');

      // 2. Read locally for Gemini (Immediate analysis)
      const reader = new FileReader();
      reader.onload = async (e) => {
         const text = e.target?.result as string;
         const data = await analyzeRawText(text, file.name);

         if (data) {
            const mergedData: KnowledgeBaseData = { ...scannedData };
            let updates = [];

            const newServices = data.services.filter(s => !mergedData.services.includes(s));
            if (newServices.length > 0) {
               mergedData.services = [...mergedData.services, ...newServices];
               updates.push(`${newServices.length} services`);
            }
            if (data.pricing) {
               mergedData.pricing = mergedData.pricing ? `${mergedData.pricing}\n\n[From ${file.name}]:\n${data.pricing}` : data.pricing;
               updates.push("pricing");
            }
            if (data.policies) {
               mergedData.policies = mergedData.policies ? `${mergedData.policies}\n\n[From ${file.name}]:\n${data.policies}` : data.policies;
               updates.push("policies");
            }
            if (!mergedData.summary && data.summary) mergedData.summary = data.summary;

            // Add source URL if uploaded, otherwise filename
            const sourceLabel = uploadedUrl ? uploadedUrl : `File: ${file.name}`;
            mergedData.sources = Array.from(new Set([...(mergedData.sources || []), sourceLabel]));

            setScannedData(mergedData);
            setUploadFeedback(`Extracted: ${updates.join(', ') || 'General Context'}`);

            if (updates.includes("pricing") && !sectionStatus.pricing) setExpandedSection('pricing');
            else if (updates.includes("policies") && !sectionStatus.policies) setExpandedSection('policies');
         }
         setIsProcessingFile(false);
      };
      reader.readAsText(file);
   };

   const handleTrainAndLaunch = async () => {
      if (!scannedData) return;
      setIsTraining(true);
      setStep(5);
      setTrainingPhase(0);

      const SEQUENCE = [
         { phase: 1, delay: 1500 },
         { phase: 2, delay: 3500 },
         { phase: 3, delay: 6000 },
         { phase: 4, delay: 8500 }
      ];

      SEQUENCE.forEach(({ phase, delay }) => {
         setTimeout(() => setTrainingPhase(phase), delay);
      });
   };

   const toggleApproval = (section: SectionKey) => {
      setSectionStatus(prev => {
         const newState = { ...prev, [section]: !prev[section] };
         // When approving a section, open the next unapproved section
         if (newState[section]) {
            const sectionOrder: SectionKey[] = ['identity', 'services', 'operations', 'pricing', 'policies'];
            const currentIndex = sectionOrder.indexOf(section);
            // Find the next unapproved section
            let nextSection: SectionKey | null = null;
            for (let i = currentIndex + 1; i < sectionOrder.length; i++) {
               if (!newState[sectionOrder[i]]) {
                  nextSection = sectionOrder[i];
                  break;
               }
            }
            setExpandedSection(nextSection);
            // Scroll to next section if exists
            if (nextSection) {
               setTimeout(() => {
                  document.getElementById(`card-${nextSection}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
               }, 100);
            }
         }
         return newState;
      });
   };

   const allApproved = Object.values(sectionStatus).every(s => s === true);

   // --- HELPER RENDERS ---

   const getStatus = (threshold: number) => {
      if (scannedData) return 'complete';
      if (progress > threshold) return 'complete';
      if (progress > threshold - 20) return 'loading';
      return 'pending';
   };

   // --- MAIN LAYOUT ---
   return (
      <div className="fixed inset-0 z-[100] flex flex-col lg:flex-row bg-chippy-navy font-sans">

         {/* === LEFT PANEL (CONTEXT & NAVIGATION) === */}
         <div className="w-full lg:w-[450px] bg-chippy-navy text-white flex flex-col relative shrink-0 border-r border-chippy-navy-light transition-all duration-500 ease-in-out z-20 shadow-2xl">
            {/* Background Effects (CSS Only) */}
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-white/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col h-full p-8 lg:p-10">
               {/* 1. Brand Header */}
               <div className="flex items-center gap-3 mb-10">
                  <img src="/logo.png" alt="Chippy" className="w-10 h-10 rounded-lg" />
                  <span className="text-xl font-bold tracking-tight text-white">Chippy</span>
               </div>

               {/* 2. Dynamic Left Content */}
               <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-left-4 duration-500">

                  {/* STEP 1 LEFT */}
                  {step === 1 && (
                     <div className="space-y-6">
                        <h1 className="text-4xl font-bold text-white leading-tight">Build your AI Workforce in minutes.</h1>
                        <p className="text-slate-400 text-lg leading-relaxed">Connect your knowledge base and let Gemini scan your business model to create a fully autonomous booking agent.</p>
                        <div className="pt-6 space-y-4">
                           <div className="flex items-center gap-4 text-white/80">
                              <div className="p-2 bg-white/5 rounded-lg border border-white/10"><Zap className="w-5 h-5" /></div>
                              <div><p className="font-semibold text-white">Instant Setup</p><p className="text-xs text-slate-400">No coding required.</p></div>
                           </div>
                           <div className="flex items-center gap-4 text-white/80">
                              <div className="p-2 bg-white/5 rounded-lg border border-white/10"><ShieldCheck className="w-5 h-5" /></div>
                              <div><p className="font-semibold text-white">Verified Data</p><p className="text-xs text-slate-400">You control what the AI says.</p></div>
                           </div>
                        </div>
                     </div>
                  )}

                  {/* STEP 2 LEFT - Business Type */}
                  {step === 2 && (
                     <div className="flex flex-col items-center text-center">
                        <div className="w-40 h-40 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl relative mb-8">
                           <MapPin className="w-16 h-16 text-slate-200" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Business Setup</h3>
                        <p className="text-slate-400 mb-6 max-w-xs mx-auto">
                           Tell us where you serve your customers so Chippy can guide them to the right location.
                        </p>
                        <div className="w-full max-w-[200px] space-y-2 text-left">
                           <div className={`flex items-center gap-2 text-sm ${businessType === 'storefront' ? 'text-slate-200' : 'text-slate-500'}`}>
                              <Store className="w-4 h-4" /> Storefront / Clinic
                           </div>
                           <div className={`flex items-center gap-2 text-sm ${businessType === 'mobile' ? 'text-slate-200' : 'text-slate-500'}`}>
                              <Car className="w-4 h-4" /> Mobile / On-Site
                           </div>
                           <div className={`flex items-center gap-2 text-sm ${businessType === 'online' ? 'text-slate-200' : 'text-slate-500'}`}>
                              <Laptop className="w-4 h-4" /> Online Only
                           </div>
                        </div>
                     </div>
                  )}

                  {/* STEP 3 LEFT - Scanning */}
                  {step === 3 && (
                     <div className="flex flex-col items-center text-center">
                        <div className="w-40 h-40 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl relative mb-8">
                           {scannedData ? (
                              <CheckCircle2 className="w-20 h-20 text-slate-200 animate-in zoom-in spin-in-12" />
                           ) : (
                              <>
                                 <div className="absolute inset-0 rounded-full border-2 border-white/15 animate-ping"></div>
                                 <div className="absolute inset-0 rounded-full border border-white/25 animate-[spin_3s_linear_infinite]"></div>
                                 <Sparkles className="w-16 h-16 text-slate-200 animate-pulse" />
                              </>
                           )}
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">{scannedData ? "Model Generated" : "Scanning..."}</h3>
                        <p className="text-slate-400 mb-8 max-w-xs mx-auto">
                           {scannedData ? "Data successfully structured." : `Extracting semantic entities from ${(() => { try { return new URL(url).hostname; } catch { return url; } })()}`}
                        </p>
                        <div className="w-full max-w-[240px]">
                           <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">
                              <span>Progress</span><span>{Math.round(progress)}%</span>
                           </div>
                           <div className="bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-slate-200 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                           </div>
                        </div>
                     </div>
                  )}

                  {/* STEP 4 LEFT - Review */}
                  {step === 4 && (
                     <div className="flex flex-col h-full max-h-[600px]">
                        <div className="mb-6">
                           <div className="flex items-center gap-2 mb-2 text-slate-200">
                              <Sparkles className="w-4 h-4" />
                              <span className="text-xs font-bold uppercase tracking-widest">Review Phase</span>
                           </div>
                           <h2 className="text-2xl font-bold text-white">Knowledge Verification</h2>
                           <p className="text-slate-400 text-sm mt-2">Approve each section to proceed.</p>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2 mb-6">
                           <NavStatusItem label="Identity & Summary" isApproved={sectionStatus.identity} onClick={() => { setExpandedSection('identity'); document.getElementById('card-identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
                           <NavStatusItem label="Services" isApproved={sectionStatus.services} onClick={() => { setExpandedSection('services'); document.getElementById('card-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
                           <NavStatusItem label="Operations" isApproved={sectionStatus.operations} onClick={() => { setExpandedSection('operations'); document.getElementById('card-operations')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
                           <NavStatusItem label="Pricing" isApproved={sectionStatus.pricing} onClick={() => { setExpandedSection('pricing'); document.getElementById('card-pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
                           <NavStatusItem label="Policies" isApproved={sectionStatus.policies} onClick={() => { setExpandedSection('policies'); document.getElementById('card-policies')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
                        </div>

                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-6 backdrop-blur-sm">
                           <div className="flex items-center gap-2 mb-3">
                              <Upload className="w-4 h-4 text-slate-200" />
                              <span className="text-sm font-semibold text-white">Missing Info?</span>
                           </div>
                           <label className={`flex items-center justify-center w-full py-3 border border-dashed rounded-lg cursor-pointer transition-all gap-2 text-sm ${isProcessingFile ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'}`}>
                              {isProcessingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                              <span>{isProcessingFile ? 'Processing...' : 'Upload File'}</span>
                              <input type="file" className="hidden" accept=".txt,.md,.pdf,.csv" disabled={isProcessingFile} onChange={(e) => handleFileUpload(e.target.files)} />
                           </label>
                           {uploadFeedback && <div className="mt-2 text-[10px] text-slate-200 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {uploadFeedback}</div>}
                        </div>

                        <button onClick={handleTrainAndLaunch} disabled={!allApproved || isTraining} className="w-full py-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl shadow-[0_0_12px_rgba(15,23,42,0.08)] transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
                           {isTraining ? <><Loader2 className="w-5 h-5 animate-spin text-slate-600" /><span>Building...</span></> : <><BrainCircuit className="w-5 h-5 text-slate-700" />Train Agent</>}
                        </button>
                     </div>
                  )}

                  {/* STEP 5 LEFT - Training */}
                  {step === 5 && (
                     <div className="flex flex-col items-center text-center">
                        <div className="w-40 h-40 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl relative mb-8">
                           {trainingPhase >= 4 ? (
                              <CheckCircle2 className="w-20 h-20 text-slate-200 animate-in zoom-in spin-in-12" />
                           ) : (
                              <>
                                 <div className="absolute inset-0 rounded-full border-2 border-white/15 animate-ping"></div>
                                 <div className="absolute inset-0 rounded-full border border-white/25 animate-[spin_3s_linear_infinite]"></div>
                                 <BrainCircuit className="w-16 h-16 text-slate-200 animate-pulse" />
                              </>
                           )}
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">{trainingPhase >= 4 ? "Agent Trained" : "Training Model"}</h3>
                        <p className="text-slate-400 mb-8 max-w-xs mx-auto">
                           {trainingPhase >= 4 ? "Ready for deployment." : "Optimizing neural weights..."}
                        </p>
                        <div className="w-full max-w-[240px]">
                           <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">
                              <span>Progress</span><span>{Math.min(trainingPhase * 25, 100)}%</span>
                           </div>
                           <div className="bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className={`h-full transition-all duration-700 ease-out ${trainingPhase >= 4 ? 'bg-slate-200' : 'bg-slate-400'}`} style={{ width: `${Math.min(trainingPhase * 25, 100)}%` }}></div>
                           </div>
                        </div>
                     </div>
                  )}
               </div>

               {/* 3. Footer Step Indicator */}
               <div className="mt-8 pt-6 border-t border-slate-800/50 flex justify-between items-center text-xs text-slate-500">
                  <span>Step {step} of 5</span>
                  <div className="flex gap-1">
                     {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i <= step ? 'w-8 bg-slate-200' : 'w-2 bg-slate-700'}`} />
                     ))}
                  </div>
               </div>
            </div>
         </div>

         {/* === RIGHT PANEL (WORKSPACE) === */}
         <div className="flex-1 bg-chippy-cream relative flex flex-col overflow-hidden">
            <div className="flex-1 relative overflow-y-auto overflow-x-hidden custom-scrollbar">

               {/* STEP 1 RIGHT */}
               {step === 1 && (
                  <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                     <button onClick={onCancel} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600 flex items-center gap-2 text-sm font-medium transition-colors">Skip <ArrowRight className="w-4 h-4" /></button>
                     <div className="max-w-md w-full">
                        <div className="text-center mb-10">
                           <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center mx-auto mb-6 border border-slate-200">
                              <Globe className="w-7 h-7 text-slate-700" />
                           </div>
                           <h2 className="text-2xl font-semibold text-chippy-navy mb-2">Connect Your Business</h2>
                           <p className="text-slate-500">Enter your website URL to start the auto-discovery process.</p>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-slate-900/10 transition-all">
                           <div className="flex items-center">
                              <div className="pl-4 pr-3 text-slate-400"><Search className="w-5 h-5" /></div>
                              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourcompany.com" className="flex-1 py-3 bg-transparent outline-none text-slate-900 placeholder:text-slate-300" onKeyDown={(e) => e.key === 'Enter' && handleProceedToBusinessType()} />
                           </div>
                        </div>
                        <button onClick={handleProceedToBusinessType} disabled={!url} className="w-full mt-6 bg-slate-900 hover:bg-slate-900/90 text-white font-semibold py-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">Continue <ArrowRight className="w-5 h-5" /></button>
                     </div>
                  </div>
               )}

               {/* STEP 2: BUSINESS TYPE & LOCATION (NEW) */}
               {step === 2 && (
                  <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                     <div className="max-w-2xl w-full">
                        <div className="text-center mb-10">
                           <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center mx-auto mb-6 border border-slate-200">
                              <MapPin className="w-7 h-7 text-slate-700" />
                           </div>
                           <h2 className="text-2xl font-semibold text-chippy-navy mb-2">Where Do You Serve Customers?</h2>
                           <p className="text-slate-500">This helps Chippy guide customers to your location or service area.</p>
                        </div>

                        {/* Business Type Cards */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                           <button
                              onClick={() => setBusinessType('storefront')}
                              className={`p-6 rounded-lg border transition-all text-left ${businessType === 'storefront' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                           >
                              <Store className="w-7 h-7 mb-3 text-slate-600" />
                              <h3 className="font-semibold text-slate-900 mb-1">Storefront / Clinic</h3>
                              <p className="text-xs text-slate-500">Customers visit your location(s)</p>
                           </button>
                           <button
                              onClick={() => setBusinessType('mobile')}
                              className={`p-6 rounded-lg border transition-all text-left ${businessType === 'mobile' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                           >
                              <Car className="w-7 h-7 mb-3 text-slate-600" />
                              <h3 className="font-semibold text-slate-900 mb-1">Mobile / On-Site</h3>
                              <p className="text-xs text-slate-500">You visit the customer</p>
                           </button>
                           <button
                              onClick={() => setBusinessType('online')}
                              className={`p-6 rounded-lg border transition-all text-left ${businessType === 'online' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                           >
                              <Laptop className="w-7 h-7 mb-3 text-slate-600" />
                              <h3 className="font-semibold text-slate-900 mb-1">Online Only</h3>
                              <p className="text-xs text-slate-500">Virtual / digital services</p>
                           </button>
                        </div>

                        {/* Location Form (Only for Storefront) */}
                        {businessType === 'storefront' && (
                           <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                              <div className="flex items-center justify-between mb-2">
                                 <h4 className="font-semibold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-500" /> Your Locations</h4>
                                 {locations.length < 5 && (
                                    <button onClick={() => setLocations([...locations, { name: `Location ${locations.length + 1}`, address: '', city: '', state: '', zip: '' }])} className="text-sm text-slate-700 font-semibold flex items-center gap-1 hover:underline">
                                       <Plus className="w-4 h-4" /> Add Location
                                    </button>
                                 )}
                              </div>
                              {locations.map((loc, i) => (
                                 <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                                    <div className="flex items-center justify-between">
                                       <input
                                          type="text"
                                          value={loc.name}
                                          onChange={(e) => { const next = [...locations]; next[i].name = e.target.value; setLocations(next); }}
                                          placeholder="Location Name"
                                          className="font-semibold text-slate-900 bg-transparent border-none outline-none"
                                       />
                                       {locations.length > 1 && (
                                          <button onClick={() => setLocations(locations.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                       )}
                                    </div>
                                    <AddressAutocomplete
                                       value={loc.address}
                                       onChange={(address) => { const next = [...locations]; next[i].address = address; setLocations(next); }}
                                       onPlaceSelect={(place) => {
                                          const next = [...locations];
                                          next[i].address = place.address;
                                          next[i].city = place.city;
                                          next[i].state = place.state;
                                          next[i].zip = place.zip;
                                          setLocations(next);
                                       }}
                                       placeholder="Start typing your address..."
                                       error={!loc.address && businessType === 'storefront'}
                                    />
                                    <div className="grid grid-cols-3 gap-2">
                                       <input
                                          type="text"
                                          value={loc.city}
                                          onChange={(e) => { const next = [...locations]; next[i].city = e.target.value; setLocations(next); }}
                                          placeholder="City *"
                                          className="p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                       />
                                       <input
                                          type="text"
                                          value={loc.state}
                                          onChange={(e) => { const next = [...locations]; next[i].state = e.target.value; setLocations(next); }}
                                          placeholder="State/Province *"
                                          className="p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                       />
                                       <input
                                          type="text"
                                          value={loc.zip}
                                          onChange={(e) => { const next = [...locations]; next[i].zip = e.target.value; setLocations(next); }}
                                          placeholder="ZIP/Postal *"
                                          className="p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                       />
                                    </div>
                                 </div>
                              ))}
                              {/* Show validation message */}
                              {!locations[0]?.address && (
                                 <p className="text-sm text-red-500 flex items-center gap-1 mt-2">
                                    <AlertCircle className="w-4 h-4" /> Please enter your address to continue
                                 </p>
                              )}
                           </div>
                        )}

                        {/* Service Area (For Mobile) */}
                        {businessType === 'mobile' && (
                           <div className="bg-white rounded-xl border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
                              <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-4"><Car className="w-4 h-4 text-slate-500" /> Service Area (Optional)</h4>
                              <input
                                 type="text"
                                 value={locations[0]?.city || ''}
                                 onChange={(e) => setLocations([{ ...locations[0], city: e.target.value, name: 'Service Area' }])}
                                 placeholder="e.g., Los Angeles, Orange County, Bay Area"
                                 className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white"
                              />
                              <p className="text-xs text-slate-400 mt-2">Enter the cities or regions you serve</p>
                           </div>
                        )}

                        {/* Online - No Location Needed */}
                        {businessType === 'online' && (
                           <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center animate-in fade-in slide-in-from-bottom-2">
                              <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                              <p className="text-slate-700 font-medium">No physical location needed for online services.</p>
                           </div>
                        )}

                        {/* Show message if no business type selected */}
                        {!businessType && (
                           <p className="text-sm text-slate-500 text-center mt-4">
                              Select a business type above to continue
                           </p>
                        )}

                        <button
                           onClick={() => {
                              onUpdateConfig({ ...tenantConfig, businessType: businessType!, locations: businessType === 'storefront' ? locations : undefined });
                              handleStartScan();
                           }}
                           disabled={!businessType || (businessType === 'storefront' && !locations[0]?.address)}
                           className="w-full mt-8 bg-slate-900 hover:bg-slate-900/90 text-white font-semibold py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                           {!businessType ? 'Select a Business Type' : (businessType === 'storefront' && !locations[0]?.address) ? 'Enter Address to Continue' : 'Begin Analysis'} <ArrowRight className="w-5 h-5" />
                        </button>
                     </div>
                  </div>
               )}

               {/* STEP 3 RIGHT (was Step 2) - Discovery Scan */}
               {step === 3 && (
                  <div className="h-full flex flex-col p-12">
                     <div className="flex items-center gap-2 mb-8">
                        <Terminal className="w-5 h-5 text-slate-500" />
                        <h4 className="font-semibold text-slate-900 tracking-wide">Discovery</h4>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <StatusItem label="Identity" status={getStatus(20)} icon={<LayoutTemplate className="w-4 h-4" />} />
                        <StatusItem label="Services" status={getStatus(45)} icon={<Tag className="w-4 h-4" />} count={scannedData?.services?.length} />
                        <StatusItem label="Pricing" status={getStatus(70)} icon={<DollarSign className="w-4 h-4" />} />
                        <StatusItem label="Policies" status={getStatus(85)} icon={<ShieldCheck className="w-4 h-4" />} />
                     </div>
                     <div className="flex-1 bg-chippy-navy rounded-xl p-6 overflow-hidden flex flex-col shadow-inner min-h-[200px] font-mono text-sm relative border border-slate-800">
                        <div className="absolute top-0 left-0 right-0 h-10 bg-slate-800/50 flex items-center px-4 border-b border-white/5">
                           <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400/80"></div><div className="w-2.5 h-2.5 rounded-full bg-amber-400/80"></div><div className="w-2.5 h-2.5 rounded-full bg-green-400/80"></div></div>
                           <span className="ml-4 text-xs text-slate-500">gemini-agent-cli --verbose</span>
                        </div>
                        <div className="mt-8 flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                           {logs.map((log, i) => (
                              <div key={log.id} className={`flex gap-3 animate-in slide-in-from-left-2 fade-in duration-300 ${i === logs.length - 1 ? 'text-white' : 'text-slate-400'}`}>
                                 <span className="text-slate-500 shrink-0">➜</span><span>{log.message}</span>
                              </div>
                           ))}
                           <div ref={logsEndRef} />
                        </div>
                     </div>
                     {/* Error Message Display */}
                     {scanError && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl animate-in fade-in slide-in-from-bottom-2">
                           <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                              <div className="flex-1">
                                 <p className="text-red-800 font-medium text-sm">{scanError}</p>
                                 <button
                                    onClick={() => { setScanError(null); handleStartScan(); }}
                                    className="mt-2 text-red-600 hover:text-red-700 text-sm font-semibold underline"
                                 >
                                    Try Again
                                 </button>
                              </div>
                           </div>
                        </div>
                     )}
                     <div className="mt-8 min-h-[56px]">
                        {progress === 100 && !isScanning && (
                           <button onClick={() => {
                              if (!scannedData) {
                                 // Manual Fallback Init
                                 setScannedData({
                                    companyName: '',
                                    website: url,
                                    phoneNumber: '',
                                    services: [],
                                    sources: ['Manual Entry'],
                                    businessCategory: '',
                                    summary: '',
                                    pricing: '',
                                    policies: '',
                                    businessHours: '',
                                    contactInfo: '',
                                    keywords: []
                                 });
                              }
                              setStep(4);
                           }} className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-lg rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 animate-in slide-in-from-bottom-2 fade-in">
                              {scannedData ? "Proceed to Review" : "Continue Manually"} <ArrowRight className="w-5 h-5" />
                           </button>
                        )}
                        {isScanning && (
                           <div className="w-full h-14 flex items-center justify-center gap-3 text-slate-500">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span className="font-medium">Analyzing website...</span>
                           </div>
                        )}
                     </div>
                  </div>
               )}

               {/* STEP 4 RIGHT (was Step 3) - Human Review */}
               {step === 4 && scannedData && (
                  <div className="max-w-4xl mx-auto p-6 lg:p-12 space-y-6 pb-32 animate-in fade-in slide-in-from-right-4 duration-500">
                     <div id="card-identity">
                        <ReviewCard title="Identity & Summary" icon={<LayoutTemplate className="w-5 h-5 text-slate-500" />} isExpanded={expandedSection === 'identity'} isApproved={sectionStatus.identity} onToggle={() => setExpandedSection(expandedSection === 'identity' ? null : 'identity')} onApprove={() => toggleApproval('identity')}>
                           <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Building className="w-3 h-3" /> Company Name</label>
                                    <input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.companyName || ''} onChange={(e) => setScannedData({ ...scannedData, companyName: e.target.value })} placeholder="e.g. Acme Inc." />
                                 </div>
                                 <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Link2 className="w-3 h-3" /> Website URL</label>
                                    <input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.website || url} onChange={(e) => setScannedData({ ...scannedData, website: e.target.value })} />
                                 </div>
                              </div>
                              <div>
                                 <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Phone className="w-3 h-3" /> Phone Number</label>
                                 <input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.phoneNumber || ''} onChange={(e) => setScannedData({ ...scannedData, phoneNumber: e.target.value })} placeholder="e.g. +1 (555) 000-0000" />
                              </div>
                              <div><label className="text-xs font-bold text-slate-500 uppercase">Category</label><input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.businessCategory} onChange={(e) => setScannedData({ ...scannedData, businessCategory: e.target.value })} /></div>
                              <div><label className="text-xs font-bold text-slate-500 uppercase">Executive Summary</label><textarea rows={3} className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.summary} onChange={(e) => setScannedData({ ...scannedData, summary: e.target.value })} /></div>
                           </div>
                        </ReviewCard>
                     </div>
                     <div id="card-services">
                        <ReviewCard title="Services" icon={<Tag className="w-5 h-5 text-slate-500" />} isExpanded={expandedSection === 'services'} isApproved={sectionStatus.services} onToggle={() => setExpandedSection(expandedSection === 'services' ? null : 'services')} onApprove={() => toggleApproval('services')} badgeCount={scannedData.services.length}>
                           <ServiceEditor
                              services={scannedData.services}
                              onChange={(newServices) => setScannedData({ ...scannedData, services: newServices })}
                              onScanPricing={async (pricingUrl) => {
                                 setIsScanningPricing(true);
                                 setPricingScanResult(null);
                                 try {
                                    const response = await fetch('/api/scrape-pricing', {
                                       method: 'POST',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ url: pricingUrl, existingServices: scannedData.services })
                                    });
                                    if (response.ok) {
                                       const data = await response.json();
                                       if (data.services && data.services.length > 0) {
                                          // Merge pricing data with existing services
                                          const updatedServices = scannedData.services.map(existingSvc => {
                                             const match = data.services.find((s: any) =>
                                                s.name.toLowerCase().includes(existingSvc.name.toLowerCase()) ||
                                                existingSvc.name.toLowerCase().includes(s.name.toLowerCase())
                                             );
                                             if (match && match.pricing) {
                                                return { ...existingSvc, pricing: match.pricing, duration: match.duration || existingSvc.duration };
                                             }
                                             return existingSvc;
                                          });
                                          // Add any new services found
                                          const newServices = data.services.filter((s: any) =>
                                             !scannedData.services.some(es =>
                                                es.name.toLowerCase().includes(s.name.toLowerCase()) ||
                                                s.name.toLowerCase().includes(es.name.toLowerCase())
                                             )
                                          ).map((s: any) => ({
                                             id: generateServiceId(),
                                             name: s.name,
                                             description: s.description,
                                             pricing: s.pricing || defaultPricing(),
                                             duration: s.duration
                                          }));
                                          setScannedData({ ...scannedData, services: [...updatedServices, ...newServices] });
                                          const updatedCount = updatedServices.filter((s, i) => s !== scannedData.services[i]).length;
                                          setPricingScanResult({
                                             success: true,
                                             message: `Found pricing for ${updatedCount} existing service(s)${newServices.length > 0 ? ` and ${newServices.length} new service(s)` : ''}.`
                                          });
                                       } else {
                                          setPricingScanResult({
                                             success: false,
                                             message: 'No pricing information found on this page. Try a different URL or add prices manually.'
                                          });
                                       }
                                    } else {
                                       setPricingScanResult({
                                          success: false,
                                          message: 'Failed to scan the page. Please check the URL and try again.'
                                       });
                                    }
                                 } catch (error) {
                                    console.error('Failed to scan pricing:', error);
                                    setPricingScanResult({
                                       success: false,
                                       message: 'An error occurred while scanning. Please try again.'
                                    });
                                 } finally {
                                    setIsScanningPricing(false);
                                 }
                              }}
                              isScanningPricing={isScanningPricing}
                              pricingScanResult={pricingScanResult}
                           />
                        </ReviewCard>
                     </div>
                     <div id="card-operations">
                        <ReviewCard title="Operations" icon={<Clock className="w-5 h-5 text-slate-500" />} isExpanded={expandedSection === 'operations'} isApproved={sectionStatus.operations} onToggle={() => setExpandedSection(expandedSection === 'operations' ? null : 'operations')} onApprove={() => toggleApproval('operations')}>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><label className="text-xs font-bold text-slate-500 uppercase">Business Hours</label><input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.businessHours} onChange={(e) => setScannedData({ ...scannedData, businessHours: e.target.value })} /></div>
                              <div><label className="text-xs font-bold text-slate-500 uppercase">Contact Info</label><input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.contactInfo} onChange={(e) => setScannedData({ ...scannedData, contactInfo: e.target.value })} /></div>
                           </div>
                        </ReviewCard>
                     </div>
                     <div id="card-pricing">
                        <ReviewCard title="Pricing & Rates" icon={<DollarSign className="w-5 h-5 text-slate-500" />} isExpanded={expandedSection === 'pricing'} isApproved={sectionStatus.pricing} onToggle={() => setExpandedSection(expandedSection === 'pricing' ? null : 'pricing')} onApprove={() => toggleApproval('pricing')} isEmpty={!scannedData.pricing}>
                           <div>
                              {!scannedData.pricing && <div className="bg-slate-50 text-slate-600 p-3 rounded-lg text-sm mb-3 flex items-start gap-2 border border-slate-200"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><div><p className="font-semibold">Missing Pricing Data</p><p className="text-xs">We couldn't find pricing on the site.</p></div></div>}
                              <textarea rows={6} placeholder="e.g. \nBasic Plan: $50/mo" className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400 font-mono" value={scannedData.pricing || ''} onChange={(e) => setScannedData({ ...scannedData, pricing: e.target.value })} />
                           </div>
                        </ReviewCard>
                     </div>
                     <div id="card-policies">
                        <ReviewCard title="Policies & Cancellation" icon={<ShieldCheck className="w-5 h-5 text-slate-500" />} isExpanded={expandedSection === 'policies'} isApproved={sectionStatus.policies} onToggle={() => setExpandedSection(expandedSection === 'policies' ? null : 'policies')} onApprove={() => toggleApproval('policies')} isEmpty={!scannedData.policies}>
                           <div>
                              {!scannedData.policies && <div className="bg-slate-50 text-slate-600 p-3 rounded-lg text-sm mb-3 flex items-start gap-2 border border-slate-200"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><div><p className="font-semibold">Missing Policy Data</p><p className="text-xs">Please add cancellation terms.</p></div></div>}
                              <textarea rows={4} placeholder="e.g. 24-hour notice required." className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-slate-400" value={scannedData.policies || ''} onChange={(e) => setScannedData({ ...scannedData, policies: e.target.value })} />
                           </div>
                        </ReviewCard>
                     </div>
                  </div>
               )}

               {/* STEP 5 RIGHT (was Step 4) - Training */}
               {step === 5 && (
                  <div className="h-full flex flex-col items-center justify-center p-12 relative">
                     <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700">
                        <div className="text-center mb-10">
                           <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200"><Cpu className="w-8 h-8 text-slate-600" /></div>
                           <h2 className="text-2xl font-semibold text-slate-900">System Optimization</h2>
                           <p className="text-slate-500 text-sm mt-1">Configuring neural weights for {new URL(url).hostname}</p>
                        </div>

                        <div className="space-y-3 mb-10">
                           <TrainingItem label="Ingesting verified knowledge graph" active={trainingPhase >= 0} completed={trainingPhase > 0} />
                           <TrainingItem label="Vectorizing service catalog" active={trainingPhase >= 1} completed={trainingPhase > 1} />
                           <TrainingItem label="Calibrating response tone & safety" active={trainingPhase >= 2} completed={trainingPhase > 2} />
                           <TrainingItem label="Compiling system instructions" active={trainingPhase >= 3} completed={trainingPhase > 3} />
                           {trainingPhase >= 4 && (
                              <div className="flex items-center gap-3 p-4 rounded-xl border bg-slate-50 border-slate-200 animate-in slide-in-from-bottom-2 fade-in">
                                 <CheckCircle2 className="w-5 h-5 text-slate-700" />
                                 <span className="text-slate-800 font-semibold">Agent Successfully Built</span>
                              </div>
                           )}
                        </div>

                        {trainingPhase >= 4 && (
                           <button onClick={() => onComplete(scannedData!)} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-500">
                              <Sparkles className="w-5 h-5" /> Customize Widget <ArrowRight className="w-5 h-5" />
                           </button>
                        )}
                     </div>
                  </div>
               )}

            </div>
         </div>
      </div>
   );
};

// --- SUB-COMPONENTS ---

const NavStatusItem = ({ label, isApproved, onClick }: { label: string, isApproved: boolean, onClick: () => void }) => (
   <button onClick={onClick} className={`w-full flex items-center justify-between p-3 rounded-lg transition-all text-sm group ${isApproved ? 'bg-slate-800/40 text-slate-200 hover:bg-slate-800/60' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
      <span className="font-medium">{label}</span>
      {isApproved ? <CheckCircle2 className="w-4 h-4 text-slate-200" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-600 group-hover:border-slate-400"></div>}
   </button>
);

const StatusItem = ({ label, status, icon, count }: { label: string, status: 'pending' | 'loading' | 'complete' | 'error', icon: React.ReactNode, count?: number }) => (
   <div className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-300 ${status === 'complete' ? 'bg-slate-100 border-slate-200' : 'bg-slate-50 border-slate-100'}`}>
      <div className="flex items-center gap-3">
         <div className={`p-2 rounded-lg transition-colors ${status === 'complete' ? 'bg-slate-200 text-slate-700' : 'bg-slate-200 text-slate-400'}`}>{status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : icon}</div>
         <span className={`text-sm font-semibold ${status === 'complete' ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
      </div>
      {status === 'complete' ? <div className="flex items-center gap-2 animate-in zoom-in">{count !== undefined && <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-600">{count}</span>}<CheckCircle2 className="w-5 h-5 text-slate-700" /></div> : <div className="w-5 h-5 rounded-full border-2 border-slate-200"></div>}
   </div>
);

const TrainingItem = ({ label, active, completed }: { label: string, active: boolean, completed: boolean }) => (
   <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-500 ${completed ? 'bg-slate-50 border-slate-200 text-slate-900' : active ? 'bg-white border-slate-300 text-slate-800 shadow-sm' : 'bg-transparent border-transparent text-slate-400'}`}>
      {completed ? <CheckCircle2 className="w-5 h-5 text-slate-700" /> : active ? <Loader2 className="w-5 h-5 animate-spin text-slate-600" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-200"></div>}
      <span className={`text-sm font-medium ${completed || active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
   </div>
);

interface ReviewCardProps {
   title: string; icon: React.ReactNode; children: React.ReactNode; isExpanded: boolean; isApproved: boolean; onToggle: () => void; onApprove: () => void; badgeCount?: number; isEmpty?: boolean;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ title, icon, children, isExpanded, isApproved, onToggle, onApprove, badgeCount, isEmpty }) => {
   return (
      <div className={`bg-white rounded-xl border transition-all duration-300 shadow-sm ${isApproved ? 'border-slate-200 ring-1 ring-slate-200/60' : isEmpty ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'} ${isExpanded ? 'ring-2 ring-slate-300 border-slate-300 shadow-lg' : ''}`}>
         <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 rounded-t-xl transition-colors" onClick={onToggle}>
            <div className="flex items-center gap-4">
               <div className={`p-2.5 rounded-xl transition-colors ${isApproved ? 'bg-slate-100' : 'bg-slate-100 group-hover:bg-white'}`}>{isApproved ? <CheckCircle2 className="w-5 h-5 text-slate-700" /> : icon}</div>
               <div>
                  <h3 className={`font-semibold text-sm ${isApproved ? 'text-slate-900' : 'text-slate-900'}`}>{title}</h3>
                  {!isExpanded && !isApproved && isEmpty && <span className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5"><AlertCircle className="w-3 h-3" /> Missing Data</span>}
                  {!isExpanded && !isApproved && !isEmpty && <span className="text-xs text-slate-500 mt-0.5 block">Tap to review</span>}
                  {!isExpanded && isApproved && <span className="text-xs text-slate-600 font-medium mt-0.5 block">Verified</span>}
               </div>
            </div>
            <div className="flex items-center gap-4">
               {badgeCount !== undefined && <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold">{badgeCount}</span>}
               <div className={`p-1 rounded-full transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-slate-100' : ''}`}><ChevronDown className={`w-5 h-5 ${isExpanded ? 'text-slate-500' : 'text-slate-400'}`} /></div>
            </div>
         </div>
         {isExpanded && (
            <div className="px-5 pb-5 animate-in slide-in-from-top-2">
               <div className="pt-4 pb-6 border-t border-slate-100">{children}</div>
               <div className="flex justify-end pt-2 border-t border-slate-50">
                  {isApproved ? <button onClick={(e) => { e.stopPropagation(); onApprove(); }} className="text-sm text-slate-500 hover:text-slate-800 font-medium px-4 py-2 flex items-center gap-2"><Unlock className="w-3 h-3" /> Edit Again</button> : <button onClick={(e) => { e.stopPropagation(); onApprove(); }} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-all shadow-sm hover:shadow"><CheckCircle2 className="w-4 h-4" /> Approve & Lock</button>}
               </div>
            </div>
         )}
      </div>
   );
}
