
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
  treatmentInterest?: string;
  leadTemperature?: 'hot' | 'warm' | 'cold';
  pipelineStatus?: 'new' | 'contacted' | 'needs_approval' | 'booked' | 'lost' | 'do_not_contact';
  lastContactedAt?: Date;
  nextFollowupAt?: Date;
  followupAttempts?: number;
  estimatedValue?: number;
  recoverySource?: 'web_chat' | 'form' | 'missed_call' | 'manual_import';
  requiresApprovalReason?: string;
  metadata?: Record<string, unknown>;
}

export type BusinessType = 'storefront' | 'mobile' | 'online';
export type ExperienceMode = 'simple' | 'advanced';

export interface SetupChecklist {
  businessInfo: boolean;
  services: boolean;
  calendar: boolean;
  widgetInstall: boolean;
  testConversation: boolean;
}

export interface TenantConfig {
  id: string;
  userId: string; // Owner's user ID for backend calendar API
  companyName: string;
  companyUrl: string;
  industry: string;
  businessType?: BusinessType;
  locations?: BusinessLocation[];
  experienceMode?: ExperienceMode;
  setupChecklist?: SetupChecklist;
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
  capabilities?: {
    canAnswerPricing: boolean;
    canBookAppointments: boolean;
    canRequestCallback: boolean;
    canCollectLeads: boolean;
    custom?: Array<{
      key: string;
      label: string;
      enabled: boolean;
    }>;
  };
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

// Pricing model types
export type PricingModel = 'services' | 'tiered_plans' | 'menu' | 'packages' | 'catalog' | 'hourly' | 'quote_based';

// Feature in a pricing plan
export interface PlanFeature {
  text: string;
  included: boolean;
  tooltip?: string;
}

// Enhanced Pricing Plan (for SaaS/subscription businesses)
export interface PricingPlan {
  id: string;
  name: string;                  // "Pro"
  description?: string;          // "For growing teams"
  price: {
    monthly?: number;
    annually?: number;
    currency: string;
  };
  features: PlanFeature[];
  limits?: {
    label: string;
    value: string | number;
  }[];
  isPopular?: boolean;
  ctaText?: string;
  sortOrder?: number;
}

// Add-ons / Upsells
export interface AddOn {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  appliesTo?: string[];          // Service IDs, empty = all
  isPopular?: boolean;
}

// Service Bundles / Packages
export interface Bundle {
  id: string;
  name: string;
  description?: string;
  includedServices: {
    serviceId: string;
    quantity?: number;
  }[];
  price: number;
  originalPrice?: number;
  savings?: number;
  currency: string;
  validityDays?: number;
}

// Business-level pricing settings
export interface PricingSettings {
  pricingModel: PricingModel;
  hideAllPrices: boolean;
  defaultCurrency: string;
  defaultCtaText: string;
  taxDisplay: 'included' | 'excluded' | 'none';
  taxRate?: number;
  taxLabel?: string;
  paymentTerms?: string;
  acceptedPayments?: string[];
  minimumSpend?: number;
  cancellationPolicy?: {
    noticePeriod: number;         // Hours
    fee?: {
      amount: number;
      type: 'fixed' | 'percentage';
    };
    description?: string;
  };
  memberDiscount?: {
    percentage: number;
    label?: string;
  };
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
  type: 'fixed' | 'starting_from' | 'range' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'per_unit' | 'free' | 'quote' | 'negotiable';
  amount?: number;           // Primary price
  maxAmount?: number;        // For ranges: "$500 - $2,000"
  currency?: string;         // e.g., 'USD'
  customText?: string;       // For 'custom' type: "Varies by project"
  unitLabel?: string;        // For 'per_unit': "per sq ft", "per guest"

  // Display controls
  hidePrice?: boolean;       // Don't show price, show CTA instead
  ctaText?: string;          // "Request Quote", "Get Pricing"
  requireLeadFirst?: boolean; // Capture contact before discussing price

  // Deposit
  deposit?: {
    amount: number;
    type: 'fixed' | 'percentage';
    refundable?: boolean;
  };

  // Promotions
  promo?: {
    price: number;
    label?: string;           // "Summer Sale"
    endDate?: string;         // ISO date
  };

  // Variable pricing notes
  variableFactors?: string;   // "Price varies by size and complexity"
}

// Structured service with linked pricing
export interface Service {
  id: string;
  name: string;
  description?: string;
  pricing: ServicePricing;
  duration?: number;        // Duration in minutes (for booking)
  category?: string;        // Service category (e.g., "Hair", "Nails")
  addOns?: AddOn[];         // Add-ons available for this service
  isActive?: boolean;       // Show in AI responses
  sortOrder?: number;       // Display order
}

export interface KnowledgeBaseData {
  companyName: string | null;
  website: string | null;
  phoneNumber: string | null;
  businessCategory: string | null;
  keywords: string[];
  summary: string | null;
  services: Service[];        // Structured services with pricing
  legacyServices?: string[];  // OLD: For migration - string array format
  businessHours: string | null;
  businessHoursByDay?: Record<string, string>;
  contactInfo: string | null;
  pricing?: string | PricingPlan[] | null;  // Legacy text or tiered plans
  policies: string | null;
  locations?: BusinessLocation[];
  sources?: string[];
  lastUpdated?: Date;
  isMock?: boolean;
  corrections?: { query: string; correction: string }[];
  topRules?: string;

  // New pricing model fields
  pricingSettings?: PricingSettings;
  addOns?: AddOn[];
  bundles?: Bundle[];
}

export interface KnowledgeConflict {
  field: keyof KnowledgeBaseData;
  currentValue: any;
  newValue: any;
  reason: string;
  ignored?: boolean;
}

export type AiSetupStatus = 'drafting' | 'needs_review' | 'approved' | 'launched' | 'failed';
export type PlaybookStatus = 'draft' | 'active' | 'archived';
export type OwnerCommandRole = 'owner' | 'assistant' | 'system' | 'tool';
export type OwnerCommandActionStatus = 'draft' | 'needs_approval' | 'approved' | 'executed' | 'denied' | 'failed';
export type OwnerCommandRiskLevel = 'low' | 'medium' | 'high';

export interface AiSetupSession {
  id: string;
  tenantId: string;
  status: AiSetupStatus;
  businessUrl?: string | null;
  detectedVertical?: string | null;
  confidence?: number | null;
  draftJson: Record<string, unknown>;
  missingFieldsJson: unknown[];
  approvedAt?: string | null;
  launchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessPlaybook {
  id: string;
  tenantId: string;
  vertical: string;
  status: PlaybookStatus;
  servicesJson: Service[];
  pricingRulesJson: Record<string, unknown>;
  bookingRulesJson: Record<string, unknown>;
  followupRulesJson: Record<string, unknown>;
  approvedClaimsJson: string[];
  blockedClaimsJson: string[];
  escalationRulesJson: string[];
  playbookMarkdown: string;
  sourceSetupSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerCommandThread {
  id: string;
  tenantId: string;
  title: string;
  status: 'open' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface OwnerCommandMessage {
  id: string;
  threadId: string;
  tenantId: string;
  role: OwnerCommandRole;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OwnerCommandAction {
  id: string;
  tenantId: string;
  threadId?: string | null;
  messageId?: string | null;
  actionType: string;
  status: OwnerCommandActionStatus;
  targetTable?: string | null;
  targetId?: string | null;
  patchJson: Record<string, unknown>;
  previewMarkdown: string;
  riskLevel: OwnerCommandRiskLevel;
  executedAt?: string | null;
  createdAt: string;
}

export interface OwnerCommandState {
  thread: OwnerCommandThread | null;
  messages: OwnerCommandMessage[];
  actions: OwnerCommandAction[];
  playbook: BusinessPlaybook | null;
  playbookMarkdown: string;
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
