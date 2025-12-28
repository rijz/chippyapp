import { ChartDataPoint, KnowledgeBaseData, ReviewItem, TenantConfig, WidgetConfig, CalendarSettings, ChatSessionRecord, Lead } from "../types";

/**
 * STORAGE SERVICE
 * 
 * Current Strategy: LocalStorage (MVP/Demo)
 * Future Strategy: API/Database (Production)
 */

// Keys for LocalStorage
const KEYS = {
  TENANT: 'tenantConfig',
  WIDGET: 'widgetConfig',
  CALENDAR: 'calendarSettings',
  KNOWLEDGE: 'knowledgeData',
  DASHBOARD: 'dashboardData',
  REVIEWS: 'reviewItems',
  CHATS: 'totalChats',
  BOOKINGS: 'totalBookings',
  SESSIONS: 'chatSessions',
  LEADS: 'leads'
};

// --- Internal Helpers ---
function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (e) {
    console.warn(`Error loading ${key}`, e);
    return fallback;
  }
}

function save(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error saving ${key}`, e);
  }
}

// --- Public API ---

export const storage = {
  // Tenant Identity
  getTenantConfig: (fallback: TenantConfig) => load(KEYS.TENANT, fallback),
  saveTenantConfig: (data: TenantConfig) => save(KEYS.TENANT, data),

  // Widget Appearance
  getWidgetConfig: (fallback: WidgetConfig) => load(KEYS.WIDGET, fallback),
  saveWidgetConfig: (data: WidgetConfig) => save(KEYS.WIDGET, data),

  // Knowledge Base (The Brain)
  getKnowledgeData: (fallback: KnowledgeBaseData | null) => load(KEYS.KNOWLEDGE, fallback),
  saveKnowledgeData: (data: KnowledgeBaseData | null) => save(KEYS.KNOWLEDGE, data),

  // Review Queue (RLHF)
  getReviewItems: (fallback: ReviewItem[]) => load(KEYS.REVIEWS, fallback),
  saveReviewItems: (data: ReviewItem[]) => save(KEYS.REVIEWS, data),

  // Chat History (Inbox)
  getChatSessions: (fallback: ChatSessionRecord[]) => load(KEYS.SESSIONS, fallback),
  saveChatSessions: (data: ChatSessionRecord[]) => save(KEYS.SESSIONS, data),

  // Calendar Integrations
  getCalendarSettings: (fallback: CalendarSettings | null) => load(KEYS.CALENDAR, fallback),
  saveCalendarSettings: (data: CalendarSettings | null) => save(KEYS.CALENDAR, data),

  // Analytics & Stats
  getDashboardData: (fallback: ChartDataPoint[]) => load(KEYS.DASHBOARD, fallback),
  saveDashboardData: (data: ChartDataPoint[]) => save(KEYS.DASHBOARD, data),

  getTotals: (fallbackChats: number, fallbackBookings: number) => ({
    chats: load(KEYS.CHATS, fallbackChats),
    bookings: load(KEYS.BOOKINGS, fallbackBookings)
  }),
  saveTotals: (chats: number, bookings: number) => {
    save(KEYS.CHATS, chats);
    save(KEYS.BOOKINGS, bookings);
  },

  // Leads
  getLeads: (fallback: Lead[]) => load(KEYS.LEADS, fallback),
  saveLeads: (data: Lead[]) => save(KEYS.LEADS, data)
};
