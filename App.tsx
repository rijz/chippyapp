import React, { useState, useRef, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  BookOpen, 
  MessageSquareWarning, 
  BrainCircuit,
  Loader2,
  Sparkles,
  Tag,
  Clock,
  ArrowRight,
  MessageCircle,
  X,
  LogOut,
  Inbox as InboxIcon,
  UserCircle,
  Menu,
  CheckCircle2,
  Eye,
  User,
  Mail,
  Phone,
  Zap,
  Building,
  DollarSign,
  ShieldCheck,
  History,
  Trash2,
  AlertCircle,
  Search,
  MessageSquare,
  Palette,
  ClipboardList,
  Calendar,
  Archive,
  CheckSquare,
  ArrowLeft,
  Filter,
  Upload,
  PencilLine,
  PlusCircle,
  Target,
  BarChart3,
  ThumbsDown,
  Wand2,
  ShieldAlert
} from 'lucide-react';
import { AnalyticsChart } from './components/AnalyticsChart';
import { ChatWidget } from './components/ChatWidget';
import { OnboardingWizard } from './components/OnboardingWizard';
import { AuthPage } from './components/AuthPage';
import { TenantConfig, ChartDataPoint, ReviewItem, KnowledgeBaseData, WidgetConfig, CalendarSettings, ChatSessionRecord, ContactFieldRequirement, LeadCaptureMode, Message } from './types';
import { storage } from './services/storage';
import { 
  syncKnowledgeBase, 
  fetchKnowledgeBase, 
  syncSettings, 
  fetchSettings, 
  fetchChatSessions, 
  fetchReviewItems,
  fetchAnalytics,
  syncChatSessions
} from './services/supabaseStorage';
import { loadGoogleScripts, handleAuthClick } from './services/calendarAuth';
import { supabase } from './services/supabaseClient';
import { Session } from '@supabase/supabase-js';

const generateBlankDashboardData = (): ChartDataPoint[] => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      name: days[d.getDay()],
      chats: 0,
      bookings: 0
    });
  }
  return data;
};

const INITIAL_REVIEW_ITEMS: ReviewItem[] = [];

const DEFAULT_TENANT_CONFIG: TenantConfig = {
  id: 'tenant-123',
  companyName: 'Chippy User',
  companyUrl: '',
  industry: 'Service',
  bookingPlatform: null,
  isConnected: false
};

const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  title: "Chippy",
  subtitle: "AI Assistant",
  color: "#FF6B5E",
  welcomeMessage: "Hi! How can I help you today?",
  position: 'right',
  leadCaptureMode: 'ai-driven',
  contactFields: {
    name: 'required',
    email: 'required',
    phone: 'optional'
  }
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inbox' | 'knowledge' | 'integrations' | 'review' | 'widget' | 'account'>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  const [tenantConfig, setTenantConfig] = useState<TenantConfig>(() => storage.getTenantConfig(DEFAULT_TENANT_CONFIG));
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>(() => {
    const saved = storage.getWidgetConfig(DEFAULT_WIDGET_CONFIG);
    return {
      ...DEFAULT_WIDGET_CONFIG,
      ...saved,
      contactFields: {
        ...DEFAULT_WIDGET_CONFIG.contactFields,
        ...(saved?.contactFields || {})
      }
    };
  });

  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(() => storage.getCalendarSettings(null));
  const [knowledgeData, setKnowledgeData] = useState<KnowledgeBaseData | null>(() => storage.getKnowledgeData(null));
  
  const [dashboardData, setDashboardData] = useState<ChartDataPoint[]>(() => {
    const saved = storage.getDashboardData([]);
    if (saved.length > 0 && saved[0].chats === 40 && saved[0].bookings === 12) return generateBlankDashboardData();
    if (saved.length === 0) return generateBlankDashboardData();
    return saved;
  });

  const [totalChats, setTotalChats] = useState(() => {
      const saved = storage.getTotals(0, 0).chats;
      return saved === 345 ? 0 : saved;
  });
  
  const [totalBookings, setTotalBookings] = useState(() => {
      const saved = storage.getTotals(0, 0).bookings;
      return saved === 82 ? 0 : saved;
  });
  
  const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>(() => storage.getChatSessions([]));
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(() => storage.getReviewItems(INITIAL_REVIEW_ITEMS));
  const [showWizard, setShowWizard] = useState(false);
  const [currentPlan] = useState<'Starter' | 'Growth' | 'Business'>('Growth');

  const [selectedSession, setSelectedSession] = useState<ChatSessionRecord | null>(null);
  const [editingKnowledgeSection, setEditingKnowledgeSection] = useState<string | null>(null);

  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    loadGoogleScripts();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
       fetchKnowledgeBase(session.user.id).then(remoteData => {
           if (remoteData) setKnowledgeData(remoteData);
           else if (!knowledgeData) setShowWizard(true); 
       });

       fetchSettings(session.user.id).then(settings => {
           if (settings) {
               if (settings.tenant_config) setTenantConfig(settings.tenant_config);
               if (settings.widget_config) {
                 setWidgetConfig(prev => ({
                   ...prev,
                   ...settings.widget_config,
                   contactFields: { ...prev.contactFields, ...(settings.widget_config.contactFields || {}) }
                 }));
               }
               if (settings.calendar_settings) setCalendarSettings(settings.calendar_settings);
           }
       });

       fetchChatSessions(session.user.id).then(remoteSessions => {
           if (remoteSessions && remoteSessions.length > 0) setChatSessions(remoteSessions);
       });

       fetchReviewItems(session.user.id).then(remoteReviews => {
           if (remoteReviews && remoteReviews.length > 0) setReviewItems(remoteReviews);
       });

       fetchAnalytics(session.user.id).then(analytics => {
          if (analytics) {
             if (analytics.dashboard_data) setDashboardData(analytics.dashboard_data);
             if (analytics.total_chats !== undefined) setTotalChats(analytics.total_chats);
             if (analytics.total_bookings !== undefined) setTotalBookings(analytics.total_bookings);
          }
       });
    }
  }, [session?.user?.id]);

  useEffect(() => {
     if (session?.user?.id && knowledgeData) {
         const timeout = setTimeout(() => syncKnowledgeBase(knowledgeData, session.user.id), 2000);
         return () => clearTimeout(timeout);
     }
  }, [knowledgeData, session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
        const timeout = setTimeout(() => syncSettings(session.user.id, tenantConfig, widgetConfig, calendarSettings), 1500);
        return () => clearTimeout(timeout);
    }
  }, [tenantConfig, widgetConfig, calendarSettings, session?.user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = 'https://hellochippy.com';
  };

  const handleWizardComplete = (data: KnowledgeBaseData) => {
    setKnowledgeData(data);
    if (data.companyName) setTenantConfig(prev => ({ ...prev, companyName: data.companyName! }));
    setShowWizard(false);
    setActiveTab('dashboard');
  };

  const updateSessionStatus = async (id: string, status: ChatSessionRecord['status']) => {
    const updatedSessions = chatSessions.map(s => s.id === id ? { ...s, status } : s);
    setChatSessions(updatedSessions);
    if (selectedSession?.id === id) setSelectedSession({ ...selectedSession, status });
    if (session?.user?.id) {
      await syncChatSessions(updatedSessions, session.user.id);
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const email = await handleAuthClick();
      const settings: CalendarSettings = {
        email,
        calendars: [],
        bookingCalendarId: 'primary',
        appointmentDuration: 30
      };
      setCalendarSettings(settings);
      setTenantConfig(prev => ({ ...prev, isConnected: true, bookingPlatform: 'GOOGLE_CALENDAR' }));
      alert(`Successfully connected to ${email}`);
    } catch (err) {
      console.error("Calendar auth failed", err);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      alert("Passwords must match and not be empty.");
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      alert("Security credentials updated successfully.");
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const updateWidgetField = (field: keyof typeof widgetConfig.contactFields, value: ContactFieldRequirement) => {
    setWidgetConfig(prev => ({
      ...prev,
      contactFields: { ...prev.contactFields, [field]: value }
    }));
  };

  const handleChatInteraction = (query: string, response: string, analysis: any) => {
    setTotalChats(prev => prev + 1);
    const isBooking = response.toLowerCase().includes('confirmed') || response.toLowerCase().includes('booked');
    if (isBooking) setTotalBookings(prev => prev + 1);

    const newItem: ReviewItem = {
      id: Date.now().toString(),
      query,
      response,
      confidence: analysis?.confidence || 0.5,
      sentiment: analysis?.sentiment || 'neutral',
      topics: analysis?.topics || ['General'],
      status: 'PENDING',
      timestamp: new Date()
    };
    setReviewItems(prev => [newItem, ...prev]);

    setDashboardData(prev => {
        const newData = [...prev];
        if (newData.length > 0) {
            newData[newData.length - 1].chats += 1;
            if (isBooking) newData[newData.length - 1].bookings += 1;
        }
        return newData;
    });
  };

  const saveKnowledgeSection = () => {
    setEditingKnowledgeSection(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chippy-navy text-white">
        <Loader2 className="w-8 h-8 animate-spin text-chippy-coral" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onBack={() => { window.location.href = 'https://hellochippy.com'; }} />;
  }

  return (
    <div className="min-h-screen flex bg-chippy-cream text-chippy-navy font-sans overflow-hidden">
      
      {showWizard && !knowledgeData && (
        <OnboardingWizard 
          tenantConfig={tenantConfig}
          userId={session.user.id}
          onUpdateConfig={setTenantConfig}
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {showUpgradeModal && <PricingModal onClose={() => setShowUpgradeModal(false)} currentPlan={currentPlan} />}
      {showHistoryModal && <HistoryModal onClose={() => setShowHistoryModal(false)} />}

      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-chippy-navy/50 backdrop-blur-sm z-20 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <aside className={`w-64 bg-chippy-navy text-white flex flex-col fixed inset-y-0 left-0 z-30 border-r border-chippy-navy-light transform transition-transform duration-300 md:translate-x-0 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full p-8">
            <div className="flex items-center gap-3 mb-10">
                <div className="bg-chippy-coral p-2 rounded-lg shadow-lg shadow-chippy-coral/20">
                  <BrainCircuit className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight text-white">Chippy</span>
            </div>

            <nav className="flex-1 space-y-1">
            {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                { id: 'inbox', label: 'Inbox', icon: InboxIcon },
                { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
                { id: 'widget', label: 'Widget Studio', icon: MessageCircle },
                { id: 'integrations', label: 'Integrations', icon: Settings },
                { id: 'review', label: 'Review Queue', icon: MessageSquareWarning, badge: reviewItems.filter(i => i.status === 'PENDING').length },
                { id: 'account', label: 'Account', icon: UserCircle }
            ].map((item) => (
                <button
                key={item.id}
                onClick={() => { setActiveTab(item.id as any); setMobileSidebarOpen(false); setSelectedSession(null); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id ? 'bg-chippy-coral/10 text-chippy-coral' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    {item.label}
                </div>
                {item.badge ? <span className="bg-chippy-coral text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{item.badge}</span> : null}
                </button>
            ))}
            </nav>
            
            <div className="mt-auto pt-6 border-t border-slate-800/50">
               <button onClick={handleSignOut} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                  <LogOut className="w-5 h-5" />
                  <span className="text-sm font-medium">Sign Out</span>
               </button>
            </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col md:ml-64 h-full bg-chippy-gray overflow-y-auto p-6 md:p-10">
        <header className="flex justify-between items-center mb-8 md:hidden">
            <div className="flex items-center gap-2 text-white">
                <BrainCircuit className="w-6 h-6 text-chippy-coral" />
                <span className="font-bold text-lg text-chippy-navy">Chippy</span>
            </div>
            <button onClick={() => setMobileSidebarOpen(true)} className="p-2 bg-chippy-navy rounded-lg text-white"><Menu className="w-6 h-6" /></button>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
              <h2 className="text-3xl font-bold text-white tracking-tight">Performance</h2>
              <p className="text-slate-400">Real-time stats for your AI Front Desk.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-sm font-medium text-slate-500 mb-1">Total Chats</p>
                <span className="text-4xl font-black text-chippy-navy">{totalChats}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-sm font-medium text-slate-500 mb-1">Confirmed Bookings</p>
                <span className="text-4xl font-black text-chippy-navy">{totalBookings}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-sm font-medium text-slate-500 mb-1">Conversion Rate</p>
                <span className="text-4xl font-black text-chippy-navy">{totalChats > 0 ? ((totalBookings / totalChats) * 100).toFixed(1) : 0}%</span>
              </div>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-chippy-navy"><Sparkles className="w-5 h-5 text-chippy-coral" /> Engagement Trends</h3>
                <AnalyticsChart data={dashboardData} />
            </div>
          </div>
        )}

        {activeTab === 'inbox' && (
          <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Inbox</h2>
                <p className="text-slate-400">Manage customer interactions and leads.</p>
              </div>
              <div className="flex gap-2">
                 <button className="p-2 bg-white rounded-xl border border-slate-200 text-slate-400 hover:text-chippy-coral transition-colors"><Filter className="w-5 h-5" /></button>
                 <button className="p-2 bg-white rounded-xl border border-slate-200 text-slate-400 hover:text-chippy-coral transition-colors"><Search className="w-5 h-5" /></button>
              </div>
            </header>

            <div className="flex-1 bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex min-h-0">
               <div className={`w-full md:w-[350px] border-r border-slate-100 flex flex-col min-h-0 ${selectedSession ? 'hidden md:flex' : 'flex'}`}>
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Chats ({chatSessions.length})</p>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                     {chatSessions.length === 0 ? (
                        <div className="p-10 text-center text-slate-400">
                            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-10" />
                            <p className="text-sm font-medium">No messages yet.</p>
                        </div>
                     ) : (
                        chatSessions.map((s) => (
                           <div key={s.id} onClick={() => setSelectedSession(s)} className={`p-5 cursor-pointer transition-all hover:bg-slate-50 border-l-4 ${selectedSession?.id === s.id ? 'bg-chippy-coral/5 border-chippy-coral' : 'border-transparent'}`}>
                              <div className="flex justify-between items-start mb-1">
                                 <h4 className="font-bold text-chippy-navy truncate pr-2">{s.customerName}</h4>
                                 <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">{new Date(s.timestamp).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-1 italic">"{s.summary}"</p>
                              <div className="mt-3 flex items-center gap-2">
                                 <StatusBadge status={s.status} />
                                 <span className="text-[9px] px-2 py-0.5 bg-slate-50 text-slate-400 rounded-full font-black uppercase tracking-tighter">{s.type}</span>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
               </div>

               <div className={`flex-1 flex flex-col min-h-0 bg-slate-50/30 ${selectedSession ? 'flex' : 'hidden md:flex items-center justify-center'}`}>
                  {selectedSession ? (
                     <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                        <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <button onClick={() => setSelectedSession(null)} className="md:hidden p-2 hover:bg-slate-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
                              <div className="w-10 h-10 bg-chippy-coral/10 rounded-full flex items-center justify-center text-chippy-coral font-black">{selectedSession.customerName.charAt(0)}</div>
                              <div>
                                 <h3 className="font-bold text-lg text-chippy-navy">{selectedSession.customerName}</h3>
                                 <p className="text-xs text-slate-400">Started {new Date(selectedSession.timestamp).toLocaleTimeString()}</p>
                              </div>
                           </div>
                           <div className="flex items-center gap-2">
                              <button onClick={() => updateSessionStatus(selectedSession.id, 'Reviewed')} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors text-xs font-bold"><CheckCircle2 className="w-4 h-4" /> Reviewed</button>
                              <button onClick={() => updateSessionStatus(selectedSession.id, 'Archived')} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-colors text-xs font-bold"><Archive className="w-4 h-4" /> Archive</button>
                           </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50/30">
                           <div className="max-w-3xl mx-auto space-y-6">
                              {selectedSession.messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                                        m.role === 'user' ? 'bg-white border border-slate-100 text-slate-700 rounded-bl-none' : 'bg-chippy-navy text-white rounded-br-none'
                                        }`}>
                                        {m.text}
                                        </div>
                                    </div>
                              ))}
                           </div>
                        </div>

                        <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                           <div className="max-w-3xl mx-auto">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">AI Summary</p>
                              <p className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">"{selectedSession.summary}"</p>
                           </div>
                        </div>
                     </div>
                  ) : (
                     <div className="text-center p-12 max-w-sm">
                        <InboxIcon className="w-10 h-10 text-slate-300 mx-auto mb-6" />
                        <h4 className="text-xl font-bold text-chippy-navy mb-2">Lead Detail</h4>
                        <p className="text-slate-400 text-sm">Select a lead to see the full transcript.</p>
                     </div>
                  )}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <header className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Knowledge Base</h2>
                <p className="text-slate-400">Manage exactly what Agent X knows about your business.</p>
              </div>
              <button onClick={() => setShowWizard(true)} className="flex items-center gap-2 px-5 py-3 bg-white text-chippy-navy rounded-2xl font-black text-sm hover:bg-chippy-coral hover:text-white transition-all">
                <Zap className="w-4 h-4" /> Re-scan
              </button>
            </header>

            {!knowledgeData ? (
               <div className="bg-white p-20 text-center rounded-[3rem] border border-slate-200">
                  <p className="text-slate-500 mb-6 text-lg">Knowledge base is currently offline.</p>
                  <button onClick={() => setShowWizard(true)} className="bg-chippy-coral text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-chippy-coral/20">Build Knowledge</button>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <KnowledgeCard title="Identity" icon={<Building className="w-6 h-6" />} isEditing={editingKnowledgeSection === 'identity'} onEdit={() => setEditingKnowledgeSection('identity')} onSave={saveKnowledgeSection}>
                     <p className="text-sm text-slate-600 leading-relaxed">{knowledgeData.summary}</p>
                  </KnowledgeCard>

                  <KnowledgeCard title="Services" icon={<Tag className="w-6 h-6" />} isEditing={editingKnowledgeSection === 'services'} onEdit={() => setEditingKnowledgeSection('services')} onSave={saveKnowledgeSection}>
                     <div className="flex flex-wrap gap-2">
                        {knowledgeData.services.map((s, i) => <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">{s}</span>)}
                     </div>
                  </KnowledgeCard>

                  <KnowledgeCard title="Pricing" icon={<DollarSign className="w-6 h-6" />} isEditing={editingKnowledgeSection === 'pricing'} onEdit={() => setEditingKnowledgeSection('pricing')} onSave={saveKnowledgeSection}>
                     <p className="text-sm text-slate-600 whitespace-pre-wrap">{knowledgeData.pricing || 'No pricing info listed.'}</p>
                  </KnowledgeCard>

                  <KnowledgeCard title="Policies" icon={<ShieldCheck className="w-6 h-6" />} isEditing={editingKnowledgeSection === 'policies'} onEdit={() => setEditingKnowledgeSection('policies')} onSave={saveKnowledgeSection}>
                     <p className="text-sm text-slate-600 whitespace-pre-wrap">{knowledgeData.policies || 'No specific policies found.'}</p>
                  </KnowledgeCard>
               </div>
            )}
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
            <header>
              <h2 className="text-3xl font-bold text-white tracking-tight">Integrations</h2>
              <p className="text-slate-400">Connect Chippy to your primary calendar.</p>
            </header>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl flex items-center justify-between">
              <div className="flex items-center gap-8">
                <Calendar className="w-12 h-12 text-blue-600" />
                <div>
                  <h3 className="font-bold text-2xl text-chippy-navy">Google Calendar</h3>
                  <p className="text-slate-500">Sync availability and book appointments.</p>
                </div>
              </div>
              {tenantConfig.isConnected ? (
                <div className="text-right">
                  <p className="text-xs font-black text-emerald-500 uppercase flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Connected</p>
                  <p className="text-sm font-bold text-slate-700">{calendarSettings?.email}</p>
                </div>
              ) : (
                <button onClick={handleConnectCalendar} className="bg-blue-600 text-white px-10 py-4 rounded-[1.5rem] font-black shadow-lg">Connect Google</button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-10 animate-in fade-in duration-500 pb-20">
            <header className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Review Queue</h2>
                <p className="text-slate-400">Train the AI by reviewing low-confidence interactions.</p>
              </div>
              <div className="flex gap-4">
                 <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Confidence</p>
                       <p className="text-lg font-black text-chippy-navy">88%</p>
                    </div>
                    <Target className="w-5 h-5 text-emerald-500" />
                 </div>
              </div>
            </header>

            {reviewItems.length === 0 ? (
               <div className="bg-white p-32 text-center rounded-[3rem] border-2 border-dashed border-slate-200">
                  <CheckCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400">Review queue is empty.</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 gap-8">
                  {reviewItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                       <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                          <div className="flex items-center gap-6">
                             <div className="text-lg font-black text-chippy-navy">{Math.round(item.confidence * 100)}% Confidence</div>
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(item.timestamp).toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                             {item.topics.map((t, i) => <span key={i} className="px-3 py-1 bg-white border border-slate-200 text-slate-500 rounded-full text-[10px] font-black uppercase">{t}</span>)}
                          </div>
                       </div>

                       <div className="p-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
                          <div className="space-y-4">
                             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User className="w-4 h-4" /> Customer Prompt</div>
                             <div className="p-6 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm italic">"{item.query}"</div>
                          </div>
                          <div className="space-y-4">
                             <div className="text-[10px] font-black text-chippy-coral uppercase tracking-widest flex items-center gap-2"><BrainCircuit className="w-4 h-4" /> Agent Response</div>
                             <div className="p-6 bg-chippy-coral/5 border border-chippy-coral/10 rounded-[1.5rem] text-sm">{item.response}</div>
                          </div>
                       </div>

                       <div className="px-10 py-8 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                          <p className="text-xs text-slate-500 italic"><Sparkles className="inline-block w-4 h-4 text-amber-500 mr-2" /> Training this will update Agent X's neural logic.</p>
                          <div className="flex gap-4">
                             <button className="px-8 py-3.5 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black text-xs hover:text-red-500 hover:border-red-100 transition-all">Dismiss</button>
                             <button className="px-8 py-3.5 bg-chippy-navy text-white rounded-2xl font-black text-xs hover:bg-chippy-coral transition-all">Correction</button>
                             <button className="px-8 py-3.5 bg-emerald-500 text-white rounded-2xl font-black text-xs hover:bg-emerald-600 transition-all shadow-lg">Approve</button>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>
            )}
          </div>
        )}

        {activeTab === 'widget' && (
          <div className="max-w-4xl space-y-8 animate-in fade-in duration-500 pb-20">
            <header>
              <h2 className="text-3xl font-bold text-white tracking-tight">Widget Studio</h2>
              <p className="text-slate-400">Customize appearance and lead flow.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <div className="space-y-6">
                  <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-3 text-chippy-navy"><Palette className="w-5 h-5 text-chippy-coral" /> Branding</h3>
                    <div className="space-y-6">
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Title</label>
                          <input type="text" className="w-full mt-2 p-4 border border-slate-200 rounded-2xl outline-none" value={widgetConfig.title} onChange={(e) => setWidgetConfig({...widgetConfig, title: e.target.value})} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Color</label>
                          <input type="color" value={widgetConfig.color} onChange={(e) => setWidgetConfig({...widgetConfig, color: e.target.value})} className="w-12 h-12 mt-2 rounded-xl border-none cursor-pointer overflow-hidden" />
                        </div>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-3 text-chippy-navy"><Zap className="w-5 h-5 text-chippy-coral" /> Lead Capture</h3>
                    <div className="space-y-4">
                        <ContactFieldSelector label="Name" icon={<User className="w-4 h-4" />} value={widgetConfig.contactFields.name} onChange={(v) => updateWidgetField('name', v)} />
                        <ContactFieldSelector label="Email" icon={<Mail className="w-4 h-4" />} value={widgetConfig.contactFields.email} onChange={(v) => updateWidgetField('email', v)} />
                        <ContactFieldSelector label="Phone" icon={<Phone className="w-4 h-4" />} value={widgetConfig.contactFields.phone} onChange={(v) => updateWidgetField('phone', v)} />
                    </div>
                  </div>
               </div>

               <div className="bg-chippy-navy rounded-[3rem] p-12 border border-white/5 flex items-center justify-center relative min-h-[500px]">
                  <div className="w-full max-w-[280px] bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
                    <div className="p-4 text-white flex items-center justify-between" style={{ backgroundColor: widgetConfig.color }}>
                       <div className="flex items-center gap-3"><BrainCircuit className="w-6 h-6" /><p className="font-black text-xs">{widgetConfig.title}</p></div>
                       <X className="w-4 h-4" />
                    </div>
                    <div className="p-5 h-72 bg-slate-50 flex flex-col gap-4">
                       <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-bl-none text-[10px] text-slate-500 max-w-[85%]">{widgetConfig.welcomeMessage}</div>
                    </div>
                    <div className="p-3 bg-white border-t border-slate-100">
                      <div className="h-8 bg-slate-50 rounded-full border border-slate-200"></div>
                    </div>
                  </div>
                  <div className="absolute top-8 left-8 text-white/20 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Eye className="w-4 h-4" /> Real-time Preview</div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'account' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
             <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl p-10">
                <div className="flex items-center gap-8 mb-10">
                   <div className="w-20 h-20 bg-chippy-coral/10 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                      <UserCircle className="w-12 h-12 text-chippy-coral" />
                   </div>
                   <div>
                      <h2 className="text-2xl font-bold text-chippy-navy">{session?.user?.email}</h2>
                      <div className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 border border-emerald-100 inline-block">{currentPlan} Plan</div>
                   </div>
                </div>

                <div className="space-y-8">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Security</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm" placeholder="New Password" />
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm" placeholder="Confirm Password" />
                   </div>
                   <button onClick={handleUpdatePassword} disabled={isUpdatingPassword} className="px-8 py-3 bg-chippy-navy text-white rounded-2xl font-black text-xs hover:bg-chippy-coral transition-all">Update Credentials</button>
                </div>
             </div>
          </div>
        )}
      </main>

      <ChatWidget tenantConfig={tenantConfig} widgetConfig={widgetConfig} knowledgeSummary={knowledgeData ? JSON.stringify(knowledgeData) : ""} onInteraction={handleChatInteraction} />
    </div>
  );
}

const StatusBadge = ({ status }: { status: ChatSessionRecord['status'] }) => {
  const styles = {
    Opened: 'bg-blue-100 text-blue-600',
    Closed: 'bg-slate-100 text-slate-400',
    Archived: 'bg-amber-100 text-amber-600',
    Reviewed: 'bg-emerald-100 text-emerald-600'
  };
  return <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${styles[status]}`}>{status}</span>;
};

const KnowledgeCard = ({ title, icon, isEditing, onEdit, onSave, children }: { title: string, icon: React.ReactNode, isEditing: boolean, onEdit: () => void, onSave: () => void, children: React.ReactNode }) => (
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

const PricingModal = ({ onClose, currentPlan }: { onClose: () => void, currentPlan: string }) => (
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

const HistoryModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 bg-chippy-navy/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
    <div className="bg-white rounded-[3rem] w-full max-w-2xl p-14 relative animate-in zoom-in-95">
      <button onClick={onClose} className="absolute top-10 right-10 p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
      <h2 className="text-2xl font-black text-chippy-navy mb-10">Audit History</h2>
      <div className="space-y-6">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-6 items-start pb-6 border-b border-slate-50">
             <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400"><History className="w-6 h-6" /></div>
             <div><p className="text-base font-bold text-chippy-navy">System Sync #{i}</p><p className="text-xs text-slate-400 mt-1">Updated Knowledge Graph {i}h ago</p></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ContactFieldSelector = ({ label, icon, value, onChange }: { label: string, icon: React.ReactNode, value: ContactFieldRequirement, onChange: (v: ContactFieldRequirement) => void }) => (
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
