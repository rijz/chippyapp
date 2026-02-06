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
    Lead,
    CalendarConnection,
    BookingRecord
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
    fetchLeads,
    fetchBookings,
    syncReviewItems
} from '../services/supabaseStorage';
import { fetchCalendarConnections, canAddCalendar } from '../services/calendarConnections';
import { compileBusinessMemory } from '../bdl/compiler';
import { bdlService } from '../services/bdlService';

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
    },
    followUp: {
        enabled: true,
        delayMinutes: 0,
        sendToCustomer: true,
        sendToOwner: false,
        customerSubject: 'Thanks for chatting with {{company_name}}',
        customerBody:
            "Hi {{customer_name}},\n\n" +
            "Here’s a quick recap of your chat:\n" +
            "{{summary}}\n\n" +
            "{{next_action}}\n\n" +
            "You can also visit {{company_url}} or reply to this email with any questions.\n\n" +
            "- {{company_name}}",
        ownerSubject: 'Follow-up needed: {{customer_name}}',
        ownerBody:
            "Customer: {{customer_name}} ({{customer_email}})\n" +
            "Priority: {{priority}}\n" +
            "Intent: {{intent}}\n\n" +
            "Summary:\n" +
            "{{summary}}\n\n" +
            "Next action:\n" +
            "{{next_action}}",
        replyToEmail: ''
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
    calendarConnections: CalendarConnection[];
    setCalendarConnections: React.Dispatch<React.SetStateAction<CalendarConnection[]>>;
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
    bookings: BookingRecord[];
    setBookings: React.Dispatch<React.SetStateAction<BookingRecord[]>>;
    subscription: Subscription;
    setSubscription: React.Dispatch<React.SetStateAction<Subscription>>;
    leads: Lead[];
    setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
    bookings: BookingRecord[];
    setBookings: React.Dispatch<React.SetStateAction<BookingRecord[]>>;
    addLead: (lead: Omit<Lead, 'id' | 'date'>) => void;
    updateLeadStatus: (email: string, status: Lead['status']) => void;
    isFeatureEnabled: (feature: string) => boolean;
    getOverageCost: () => number;
    canAddMoreCalendars: () => Promise<{ allowed: boolean; current: number; limit: number }>;
    refreshData: () => Promise<void>;
    isLoading: boolean; // True while initial data fetch is in progress
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
            },
            followUp: {
                ...DEFAULT_WIDGET_CONFIG.followUp,
                ...(saved?.followUp || {})
            }
        };
    });

    const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(() => storage.getCalendarSettings(null));
    const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([]);
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
    const [bookings, setBookings] = useState<BookingRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true); // Track initial data loading

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

        // Fetch knowledge from Supabase - only overwrite local data if Supabase has data
        // This prevents losing data that was set locally but hasn't synced yet
        const remoteKnowledge = await fetchKnowledgeBase(userId);
        if (remoteKnowledge) {
            setKnowledgeData(remoteKnowledge);
        }
        // If remoteKnowledge is null but we have local data, keep the local data

        // Fetch calendar connections
        const connections = await fetchCalendarConnections(userId);
        setCalendarConnections(connections);

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
                    contactFields: { ...prev.contactFields, ...(settings.widget_config.contactFields || {}) },
                    followUp: { ...prev.followUp, ...(settings.widget_config.followUp || {}) }
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
        if (remoteLeads && remoteLeads.length > 0) {
            setLeads(remoteLeads);
        }

        const remoteBookings = await fetchBookings(userId);
        if (remoteBookings && remoteBookings.length > 0) {
            setBookings(remoteBookings);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            await refreshData();
            setIsLoading(false);
        };
        loadData();
    }, [session?.user?.id]);

    // Sync Effects - Persist to localStorage AND Supabase
    useEffect(() => {
        if (knowledgeData) {
            // Always save to localStorage immediately for fast local access
            storage.saveKnowledgeData(knowledgeData);
        }
        if (session?.user?.id && knowledgeData) {
            const timeout = setTimeout(() => syncKnowledgeBase(knowledgeData, session.user.id), 2000);
            const bdlTimeout = setTimeout(() => {
                try {
                    const snapshot = compileBusinessMemory(knowledgeData, {
                        tenantId: session.user.id
                    });
                    bdlService.upsertBusinessMemory(snapshot);
                } catch (error) {
                    console.error('[BDL] Failed to compile business memory', error);
                }
            }, 2500);
            return () => {
                clearTimeout(timeout);
                clearTimeout(bdlTimeout);
            };
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

    // Persist review items to localStorage and sync to Supabase
    useEffect(() => {
        storage.saveReviewItems(reviewItems);
        // Sync to Supabase (debounced)
        if (session?.user?.id && reviewItems.length > 0) {
            const timeout = setTimeout(() => syncReviewItems(reviewItems, session.user.id), 2000);
            return () => clearTimeout(timeout);
        }
    }, [reviewItems, session?.user?.id]);

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
            calendars: calendarConnections.filter(c => c.isActive).length
        };
    }, [chatSessions, subscription.usage, calendarConnections]);

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

    const canAddMoreCalendars = async () => {
        if (!session?.user?.id) return { allowed: false, current: 0, limit: 0 };
        const details = PLAN_DETAILS[subscription.plan];
        if (!details) return { allowed: false, current: 0, limit: 0 };

        return canAddCalendar(session.user.id, details.limits);
    };

    return (
        <DataContext.Provider value={{
            tenantConfig, setTenantConfig,
            widgetConfig, setWidgetConfig,
            calendarSettings, setCalendarSettings,
            calendarConnections, setCalendarConnections,
            knowledgeData, setKnowledgeData,
            dashboardData, setDashboardData,
            totalChats, setTotalChats,
            totalBookings, setTotalBookings,
            chatSessions, setChatSessions,
            reviewItems, setReviewItems,
            subscription: { ...subscription, usage: currentUsage },
            setSubscription,
            leads, setLeads, addLead, updateLeadStatus,
            bookings, setBookings,
            isFeatureEnabled,
            getOverageCost,
            canAddMoreCalendars,
            refreshData,
            isLoading
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
