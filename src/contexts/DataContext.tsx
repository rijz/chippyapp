import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
    TenantConfig,
    WidgetConfig,
    CalendarSettings,
    KnowledgeBaseData,
    ChartDataPoint,
    ChatSessionRecord,
    ReviewItem
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
    syncChatSessions
} from '../services/supabaseStorage';

// Default Configs (Copied from App.tsx)
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
    refreshData: () => Promise<void>;
}

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

    const refreshData = async () => {
        if (!session?.user?.id) return;
        const userId = session.user.id;

        const remoteKnowledge = await fetchKnowledgeBase(userId);
        if (remoteKnowledge) setKnowledgeData(remoteKnowledge);

        const settings = await fetchSettings(userId);
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
    };

    useEffect(() => {
        refreshData();
    }, [session?.user?.id]);

    // Sync Effects
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
