
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface TenantConfig {
  id: string;
  companyName: string;
  companyUrl: string;
  industry: string;
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
  messages: Message[];
  summary: string;
  type: EnquiryType;
  sentiment: Sentiment;
  timestamp: Date;
  status: 'Opened' | 'Closed' | 'Archived' | 'Reviewed';
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

export interface KnowledgeBaseData {
  companyName?: string;
  website?: string;
  phoneNumber?: string;
  businessCategory: string;
  keywords: string[];
  summary: string;
  services: string[];
  businessHours: string;
  contactInfo: string;
  pricing?: string;
  policies?: string;
  sources?: string[];
  lastUpdated?: Date;
  corrections?: { query: string; correction: string }[]; 
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
  status: 'pending' | 'success' | 'processing';
  timestamp: Date;
}

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
}
