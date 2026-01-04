import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
    TenantConfig,
    WidgetConfig,
    CalendarSettings,
    KnowledgeBaseData,
    ChartDataPoint,
    ChatSessionRecord,
    ReviewItem,
    Subscription,
    PLAN_DETAILS,
    Lead
} from '../types';
import { storage } from '../services/storage';
import {
    fetchKnowledgeBase,
    fetchSettings,
    fetchChatSessions,
    fetchReviewItems,
    fetchAnalytics,
    syncKnowledgeBase,
    syncSettings,
    syncChatSessions,
    syncLeads,
    fetchLeads
} from '../services/supabaseStorage';

// Default Configs (Copied from App.tsx)
const DEFAULT_TENANT_CONFIG: TenantConfig = {
    id: 'tenant-123',
    userId: '', // Will be set from session
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

interface DataContextType {
    tenantConfig: TenantConfig;
    setTenantConfig: React.Dispatch<React.SetStateAction<TenantConfig>>;
    widgetConfig: WidgetConfig;
    setWidgetConfig: React.Dispatch<React.SetStateAction<WidgetConfig>>;
    calendarSettings: CalendarSettings | null;
    setCalendarSettings: React.Dispatch<React.SetStateAction<CalendarSettings | null>>;
    knowledgeData: KnowledgeBaseData | null;
    setKnowledgeData: React.Dispatch<React.SetStateAction<KnowledgeBaseData | null>>;
    dashboardData: ChartDataPoint[];
    setDashboardData: React.Dispatch<React.SetStateAction<ChartDataPoint[]>>;
    totalChats: number;
    setTotalChats: React.Dispatch<React.SetStateAction<number>>;
    totalBookings: number;
    setTotalBookings: React.Dispatch<React.SetStateAction<number>>;
    chatSessions: ChatSessionRecord[];
    setChatSessions: React.Dispatch<React.SetStateAction<ChatSessionRecord[]>>;
    reviewItems: ReviewItem[];
    setReviewItems: React.Dispatch<React.SetStateAction<ReviewItem[]>>;
    subscription: Subscription;
    setSubscription: React.Dispatch<React.SetStateAction<Subscription>>;
    leads: Lead[];
    setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
    addLead: (lead: Omit<Lead, 'id' | 'date'>) => void;
    updateLeadStatus: (email: string, status: Lead['status']) => void;
    isFeatureEnabled: (feature: string) => boolean;
    getOverageCost: () => number;
    refreshData: () => Promise<void>;
}

const DEFAULT_SUBSCRIPTION: Subscription = {
    plan: 'Starter',
    status: 'inactive',
    usage: {
        conversations: 0,
        locations: 1,
        admins: 1,
        calendars: 0
    }
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { session } = useAuth();

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
        if (saved.length === 0) return generateBlankDashboardData();
        // Reset checks if needed, but keeping simple for now
        return saved;
    });

    const [totalChats, setTotalChats] = useState(() => storage.getTotals(0, 0).chats);
    const [totalBookings, setTotalBookings] = useState(() => storage.getTotals(0, 0).bookings);

    const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>(() => storage.getChatSessions([]));
    const [reviewItems, setReviewItems] = useState<ReviewItem[]>(() => storage.getReviewItems([]));
    const [subscription, setSubscription] = useState<Subscription>(DEFAULT_SUBSCRIPTION);
    const [leads, setLeads] = useState<Lead[]>(() => storage.getLeads([]));

    // Helper to add a new lead
    const addLead = (leadData: Omit<Lead, 'id' | 'date'>) => {
        const newLead: Lead = {
            ...leadData,
            id: Date.now().toString(),
            date: new Date()
        };
        setLeads(prev => [newLead, ...prev]);
    };

    // Update lead status by email (for when bookings are made)
    const updateLeadStatus = (email: string, status: Lead['status']) => {
        setLeads(prev => prev.map(lead =>
            lead.email.toLowerCase() === email.toLowerCase()
                ? { ...lead, status }
                : lead
        ));
    };

    const refreshData = async () => {
        if (!session?.user?.id) return;
        const userId = session.user.id;

        // Always update knowledge data from Supabase (even if null - means it was reset)
        const remoteKnowledge = await fetchKnowledgeBase(userId);
        setKnowledgeData(remoteKnowledge);

        const settings = await fetchSettings(userId);
        if (settings) {
            if (settings.tenant_config) {
                setTenantConfig({
                    ...settings.tenant_config,
                    userId // Always ensure userId is set from session
                });
            } else {
                // If no tenant_config in settings, ensure userId is set
                setTenantConfig(prev => ({ ...prev, userId }));
            }
            if (settings.widget_config) {
                setWidgetConfig(prev => ({
                    ...prev,
                    ...settings.widget_config,
                    contactFields: { ...prev.contactFields, ...(settings.widget_config.contactFields || {}) }
                }));
            }
            if (settings.calendar_settings) setCalendarSettings(settings.calendar_settings);
            if (settings.subscription) {
                setSubscription(prev => ({
                    ...prev,
                    ...settings.subscription,
                    usage: {
                        ...prev.usage,
                        ...(settings.subscription.usage || {})
                    }
                }));
            }
        } else {
            // No settings found, ensure userId is set
            setTenantConfig(prev => ({ ...prev, userId }));
        }

        const remoteSessions = await fetchChatSessions(userId);
        if (remoteSessions && remoteSessions.length > 0) setChatSessions(remoteSessions);

        const remoteReviews = await fetchReviewItems(userId);
        if (remoteReviews && remoteReviews.length > 0) setReviewItems(remoteReviews);

        const analytics = await fetchAnalytics(userId);
        if (analytics) {
            if (analytics.dashboard_data) setDashboardData(analytics.dashboard_data);
            if (analytics.total_chats !== undefined) setTotalChats(analytics.total_chats);
            if (analytics.total_bookings !== undefined) setTotalBookings(analytics.total_bookings);
        }

        // Fetch leads from Supabase
        const remoteLeads = await fetchLeads(userId);
        if (remoteLeads && remoteLeads.length > 0) setLeads(remoteLeads);
    };

    useEffect(() => {
        refreshData();
    }, [session?.user?.id]);

    // Sync Effects - Persist to localStorage AND Supabase
    useEffect(() => {
        if (knowledgeData) {
            // Always save to localStorage immediately for fast local access
            storage.saveKnowledgeData(knowledgeData);
            console.log('[DataContext] Knowledge data saved to localStorage:', knowledgeData.companyName);
        }
        if (session?.user?.id && knowledgeData) {
            const timeout = setTimeout(() => syncKnowledgeBase(knowledgeData, session.user.id), 2000);
            return () => clearTimeout(timeout);
        }
    }, [knowledgeData, session?.user?.id]);

    // Persist leads to localStorage and sync to Supabase
    useEffect(() => {
        storage.saveLeads(leads);
        // Sync to Supabase (debounced)
        if (session?.user?.id && leads.length > 0) {
            const timeout = setTimeout(() => syncLeads(leads, session.user.id), 1500);
            return () => clearTimeout(timeout);
        }
    }, [leads, session?.user?.id]);

    useEffect(() => {
        if (session?.user?.id) {
            const timeout = setTimeout(() => syncSettings(session.user.id, tenantConfig, widgetConfig, calendarSettings), 1500);
            return () => clearTimeout(timeout);
        }
    }, [tenantConfig, widgetConfig, calendarSettings, session?.user?.id]);

    // Computed Usage
    const currentUsage = useMemo(() => {
        return {
            conversations: chatSessions.length,
            locations: subscription.usage?.locations || 1,
            admins: subscription.usage?.admins || 1,
            calendars: calendarSettings?.calendars.filter(c => c.selected).length || 0
        };
    }, [chatSessions, subscription.usage, calendarSettings]);

    const isFeatureEnabled = (feature: string) => {
        const details = PLAN_DETAILS[subscription.plan];
        if (!details) return false;
        return details.features.includes(feature) || details.features.some(f => f.startsWith('Everything in'));
    };

    const getOverageCost = () => {
        const details = PLAN_DETAILS[subscription.plan];
        if (!details) return 0;

        let total = 0;
        const u = currentUsage;
        const l = details.limits;
        const o = details.overage;

        if (u.conversations > l.conversations) total += (u.conversations - l.conversations) * o.conversation;
        if (u.locations > l.locations) total += (u.locations - l.locations) * o.location;
        if (u.admins > l.admins) total += (u.admins - l.admins) * o.admin;
        if (u.calendars > l.calendars) total += (u.calendars - l.calendars) * o.calendar;

        return total;
    };

    return (
        <DataContext.Provider value={{
            tenantConfig, setTenantConfig,
            widgetConfig, setWidgetConfig,
            calendarSettings, setCalendarSettings,
            knowledgeData, setKnowledgeData,
            dashboardData, setDashboardData,
            totalChats, setTotalChats,
            totalBookings, setTotalBookings,
            chatSessions, setChatSessions,
            reviewItems, setReviewItems,
            subscription: { ...subscription, usage: currentUsage },
            setSubscription,
            leads, setLeads, addLead, updateLeadStatus,
            isFeatureEnabled,
            getOverageCost,
            refreshData
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
