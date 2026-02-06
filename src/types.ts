
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'Booked' | 'Call Back' | 'Contacted' | 'New' | 'Cancelled';
  source: 'Booking Page' | 'AI Chat';
  date: Date;
  notes: string;
  service?: string; // Selected service for the appointment/callback
  purpose?: string; // Purpose of callback (if applicable)
  preferredTime?: string; // Preferred time for callback (e.g., "morning", "afternoon")
  requestedCallbackDate?: Date; // Specific date/time requested for callback
  locationId?: string; // Location where appointment is booked
  locationName?: string; // Name of the location (for display)
  intent?: string; // AI-inferred intent
  priority?: 'Hot' | 'Warm' | 'Cold'; // AI lead priority
  nextAction?: string; // AI-recommended next action
  followUpStatus?: 'disabled' | 'scheduled' | 'sent' | 'skipped' | 'none';
  followUpScheduledAt?: Date;
  followUpSentAt?: Date;
}

export type BusinessType = 'storefront' | 'mobile' | 'online';

export interface TenantConfig {
  id: string;
  userId: string; // Owner's user ID for backend calendar API
  companyName: string;
  companyUrl: string;
  industry: string;
  businessType?: BusinessType;
  locations?: BusinessLocation[];
  bookingPlatform: 'GOOGLE_CALENDAR' | 'SQUARE_APPOINTMENTS' | 'ACUITY_SCHEDULING' | null;
  isConnected: boolean;
}

export type ContactFieldRequirement = 'required' | 'optional' | 'hidden';
export type LeadCaptureMode = 'pre-chat' | 'ai-driven';

export interface WidgetConfig {
  title: string;
  subtitle: string;
  color: string;
  welcomeMessage: string;
  position: 'right' | 'left';
  leadCaptureMode: LeadCaptureMode;
  contactFields: {
    name: ContactFieldRequirement;
    email: ContactFieldRequirement;
    phone: ContactFieldRequirement;
  };
  followUp: {
    enabled: boolean;
    delayMinutes: number;
    sendToCustomer: boolean;
    sendToOwner: boolean;
    customerSubject?: string;
    customerBody?: string;
    ownerSubject?: string;
    ownerBody?: string;
    replyToEmail?: string;
  };
}

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';
export type EnquiryType = 'Pricing' | 'Services' | 'Support' | 'Booking' | 'General';

export interface ReviewItem {
  id: string;
  query: string;
  response: string;
  confidence: number; // 0 to 1
  sentiment: Sentiment;
  topics: string[];
  status: 'PENDING' | 'CORRECTED' | 'DISMISSED';
  suggestedCorrection?: string;
  timestamp: Date;
}

export interface ChatSessionRecord {
  id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  messages: Message[];
  summary: string;
  type: EnquiryType;
  sentiment: Sentiment;
  timestamp: Date;
  status: 'Opened' | 'Closed' | 'Archived' | 'Reviewed';
  firstResponseMs?: number;
  avgResponseMs?: number;
  feedbackRating?: number;
  feedbackComment?: string;
  feedbackSentiment?: Sentiment;
  feedbackCreatedAt?: Date;
  triage?: {
    summary?: string;
    intent?: string;
    priority?: 'Hot' | 'Warm' | 'Cold';
    nextAction?: string;
  };
  followUpStatus?: 'disabled' | 'scheduled' | 'sent' | 'skipped' | 'none';
  followUpScheduledAt?: Date;
  followUpSentAt?: Date;
}

export interface OverviewMetricsResponse {
  range: {
    days: number;
    since: string;
  };
  chats: {
    total: number;
    uniqueVisitors: number;
    avgMessagesPerChat: number;
    sentiment: Record<string, number>;
    avgResponseTimeMs: number | null;
    followupRequiredRate: number;
    followupSentRate: number;
  };
  quality: {
    lowConfidenceCount: number;
    lowConfidenceRate: number;
    avgFeedbackRating: number | null;
  };
  outcomes: {
    leadsCaptured: number;
    bookingsCreated: number;
    leadsFromChat: number;
    bookingsFromChat: number;
    chatToLeadConversion: number;
    chatToBookingConversion: number;
  };
  insights: {
    topIntents: Array<{ name: string; value: number }>;
    topReviewTopics: Array<{ name: string; value: number }>;
  };
}

export interface ChartDataPoint {
  name: string;
  chats: number;
  bookings: number;
}

export interface EnquiryDataPoint {
  name: string;
  value: number;
  color: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  features: string[];
}

export interface BusinessLocation {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  hours?: string;
}

// Service pricing configuration
export interface ServicePricing {
  type: 'fixed' | 'starting_from' | 'hourly' | 'custom' | 'contact';
  amount?: number;        // e.g., 50 (in cents or dollars based on currency)
  currency?: string;      // e.g., 'USD'
  customText?: string;    // For 'custom' type: "Varies by project"
}

// Structured service with linked pricing
export interface Service {
  id: string;
  name: string;
  description?: string;
  pricing: ServicePricing;
  duration?: number;      // Duration in minutes (for booking)
  category?: string;      // Service category (e.g., "Hair", "Nails")
}

export interface KnowledgeBaseData {
  companyName: string | null;
  website: string | null;
  phoneNumber: string | null;
  businessCategory: string | null;
  keywords: string[];
  summary: string | null;
  services: Service[];        // NEW: Structured services with pricing
  legacyServices?: string[];  // OLD: For migration - string array format
  businessHours: string | null;
  businessHoursByDay?: Record<string, string>;
  contactInfo: string | null;
  pricing?: string | null;    // DEPRECATED: Legacy pricing text (kept for migration)
  policies: string | null;
  locations?: BusinessLocation[];
  sources?: string[];
  lastUpdated?: Date;
  isMock?: boolean;
  corrections?: { query: string; correction: string }[];
  topRules?: string; // Priority instructions for the AI (one rule per line)
}

export interface KnowledgeConflict {
  field: keyof KnowledgeBaseData;
  currentValue: any;
  newValue: any;
  reason: string;
  ignored?: boolean;
}

export interface LogEntry {
  id: string;
  message: string;
  status: 'pending' | 'success' | 'processing' | 'error';
  timestamp: Date;
}

export interface CalendarConnection {
  id: string;
  provider: 'google' | 'calendly' | 'outlook';
  providerEmail: string;
  calendarId: string;
  locationId?: string; // Link to BusinessLocation
  locationName?: string; // Cached location name for display
  calendarName?: string; // Custom name (e.g., "Downtown Office Calendar")
  isActive: boolean;
  connectedAt: Date;
  lastUsedAt?: Date;
  appointmentDuration?: number; // Minutes
  metadata?: {
    workingHours?: string;
    bufferTime?: number;
    [key: string]: any;
  };
}

// Legacy support - keeping for backward compatibility
export interface CalendarItem {
  id: string;
  name: string;
  color: string;
  selected: boolean;
}

export interface CalendarSettings {
  email: string;
  calendars: CalendarItem[];
  bookingCalendarId: string;
  appointmentDuration: number;
  connections?: CalendarConnection[]; // New multi-location connections
}

export interface BookingRecord {
  id: string;
  userId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceType?: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  status?: 'confirmed' | 'cancelled' | 'completed';
  provider?: string;
  locationId?: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface Subscription {
  plan: 'Starter' | 'Growth' | 'Advanced' | 'Free';
  status: 'active' | 'inactive' | 'past_due' | 'canceled';
  nextBillingDate?: string;
  usage: {
    conversations: number;
    locations: number;
    admins: number;
    calendars: number;
  };
}

export const PLAN_DETAILS = {
  Starter: {
    price: 49,
    limits: { conversations: 100, locations: 1, admins: 1, calendars: 1 },
    features: [
      'Smart appointment booking',
      '24/7 customer answers',
      '1 Calendar integration',
      'Learns from your website',
      'Conversation history',
      'Analytics dashboard',
      'Branded chat widget',
      'Email notifications'
    ],
    overage: { conversation: 0.5, location: 25, admin: 15, calendar: 20 }
  },
  Growth: {
    price: 99,
    limits: { conversations: 500, locations: 3, admins: 3, calendars: 3 },
    features: [
      'Everything in Starter',
      '3 Calendar integrations',
      'Document upload training',
      'Custom response training',
      'Lead qualification questions',
      'Advanced analytics'
    ],
    overage: { conversation: 0.5, location: 25, admin: 15, calendar: 20 }
  },
  Advanced: {
    price: 249,
    limits: { conversations: 1500, locations: 5, admins: 5, calendars: 5 },
    features: [
      'Everything in Growth',
      '5+ Calendar integrations',
      'Multi-location dashboard',
      'Custom reports & data export'
    ],
    overage: { conversation: 0.5, location: 0, admin: 0, calendar: 0 } // Advanced might have different overage or no caps on seats
  }
};
