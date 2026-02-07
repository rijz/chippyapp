
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Loader2, User, Mail, Phone, ArrowRight } from 'lucide-react';
import { Message, TenantConfig, WidgetConfig, BusinessLocation, CalendarConnection, Service, PricingPlan } from '../types';
import { formatServicePrice } from '../utils/serviceUtils';
import { createAgentSession, createBdlAgentSession, analyzeInteraction } from '../services/geminiService';
import { CALENDAR_TOOLS, executeCalendarTool, ToolContext, CallbackRequestData } from '../services/calendarTools';
import { LOCATION_TOOL, executeFindClosestLocation, getLocationSelectionPrompt } from '../services/locationTools';
import { ChatSession } from '@google/generative-ai';
import DOMPurify from 'dompurify';
import { DateTimePicker } from './DateTimePicker';
import { bdlService } from '../services/bdlService';
import { createEvent } from '../bdl/events';

// Simple Markdown renderer for chat messages with XSS protection
const FormattedMessage: React.FC<{ text: string }> = ({ text }) => {
  // Convert markdown to HTML and sanitize to prevent XSS
  const sanitizedHtml = useMemo(() => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const lines = text.split('\n');
    const output: string[] = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
      if (inUl) {
        output.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        output.push('</ol>');
        inOl = false;
      }
    };

    const applyInline = (value: string) => {
      return value
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-slate-700">$1</code>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" class="text-chippy-coral underline" target="_blank" rel="noopener noreferrer">$1</a>');
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        closeLists();
        output.push('<br />');
        continue;
      }

      if (line.startsWith('### ')) {
        closeLists();
        output.push(`<div class="font-semibold text-sm text-slate-800 mt-2">${applyInline(escapeHtml(line.slice(4)))}</div>`);
        continue;
      }
      if (line.startsWith('## ')) {
        closeLists();
        output.push(`<div class="font-bold text-base text-slate-800 mt-2">${applyInline(escapeHtml(line.slice(3)))}</div>`);
        continue;
      }
      if (line.startsWith('# ')) {
        closeLists();
        output.push(`<div class="font-bold text-lg text-slate-900 mt-2">${applyInline(escapeHtml(line.slice(2)))}</div>`);
        continue;
      }

      const ulMatch = line.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        if (!inUl) {
          closeLists();
          output.push('<ul class="list-disc ml-5 space-y-1">');
          inUl = true;
        }
        output.push(`<li>${applyInline(escapeHtml(ulMatch[1]))}</li>`);
        continue;
      }

      const olMatch = line.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (!inOl) {
          closeLists();
          output.push('<ol class="list-decimal ml-5 space-y-1">');
          inOl = true;
        }
        output.push(`<li>${applyInline(escapeHtml(olMatch[1]))}</li>`);
        continue;
      }

      closeLists();
      output.push(`<p class="leading-relaxed">${applyInline(escapeHtml(line))}</p>`);
    }

    closeLists();
    const formatted = output.join('\n');

    // Sanitize HTML to prevent XSS attacks
    return DOMPurify.sanitize(formatted, {
      ALLOWED_TAGS: ['strong', 'em', 'li', 'br', 'ul', 'ol', 'p', 'span', 'div', 'code', 'a'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel']
    });
  }, [text]);

  return (
    <span
      className="formatted-message"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

interface ChatWidgetProps {
  tenantConfig: TenantConfig;
  widgetConfig: WidgetConfig;
  knowledgeSummary: string;
  onInteraction?: (query: string, response: string, analysis: any) => void;
  onSessionUpdate?: (messages: Message[]) => void;
  onLeadCapture?: (leadData: { name: string; email: string; phone: string }) => void;
  onBookingComplete?: (customerEmail: string, customerName?: string, customerPhone?: string, service?: string, locationId?: string, locationName?: string) => void;
  onCancellation?: (customerEmail: string) => void;
  onCallbackRequest?: (data: CallbackRequestData) => void;
  onFeedback?: (data: { rating: number; sentiment?: 'positive' | 'neutral' | 'negative'; comment?: string }) => void;
  showPoweredBy?: boolean; // Show "Powered by Chippy" badge for free users
  locations?: BusinessLocation[]; // Business locations for multi-location support
  calendarConnections?: CalendarConnection[]; // Calendar connections per location
}


export const ChatWidget: React.FC<ChatWidgetProps> = ({
  tenantConfig,
  widgetConfig,
  knowledgeSummary,
  onInteraction,
  onSessionUpdate,
  onLeadCapture,
  onBookingComplete,
  onCancellation,
  onCallbackRequest,
  onFeedback,
  showPoweredBy = false,
  locations = [],
  calendarConnections = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(''); // For showing "Checking calendar..." etc.
  const [clickableSlots, setClickableSlots] = useState<string[]>([]); // Slots user can click to book
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [capturedContact, setCapturedContact] = useState<{ name?: string; email?: string; phone?: string }>({});

  const capabilities = widgetConfig.capabilities || {
    canAnswerPricing: true,
    canBookAppointments: true,
    canRequestCallback: true,
    canCollectLeads: true,
    custom: []
  };

  const knowledgeSnapshot = useMemo(() => {
    if (!knowledgeSummary) return null;
    try {
      return JSON.parse(knowledgeSummary);
    } catch {
      return null;
    }
  }, [knowledgeSummary]);
  const [feedbackEligible, setFeedbackEligible] = useState(false);

  // Rotating placeholder messages
  const placeholderMessages = [
    "Ask about availability...",
    "Book an appointment...",
    "What services do you offer?",
    "What are your hours?",
    "Tell me about pricing..."
  ];

  // UX Enhancement States
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('chatSoundEnabled') !== 'false');
  const [sessionId] = useState(() => localStorage.getItem('chatSessionId') || `session_${Date.now()}`);
  // Removed: isCalendarConnected and pendingBooking - no longer needed with backend API

  // Lead Data
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasUserMessage = useMemo(() => messages.some(m => m.role === 'user'), [messages]);
  const hasModelMessage = useMemo(() => messages.some(m => m.role === 'model'), [messages]);
  const shouldShowFeedback = feedbackEligible && conversationEnded && !feedbackSubmitted && !feedbackDismissed;
  const feedbackStorageKey = useMemo(() => `chatFeedback_${sessionId}`, [sessionId]);
  const contactStorageKey = useMemo(() => `chatContact_${sessionId}`, [sessionId]);

  const canCollectLeads = capabilities.canCollectLeads !== false;

  // Determine if we should show lead form based on config
  const isPreChatMode = widgetConfig.leadCaptureMode === 'pre-chat' && canCollectLeads;
  const hasLeadFields = canCollectLeads && (widgetConfig.contactFields.name !== 'hidden' ||
    widgetConfig.contactFields.email !== 'hidden' ||
    widgetConfig.contactFields.phone !== 'hidden');

  // Rotate placeholder messages every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(feedbackStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.rating) {
        setFeedbackRating(parsed.rating);
        setFeedbackComment(parsed.comment || '');
        setFeedbackSubmitted(true);
      }
    } catch {
      // Ignore invalid storage
    }
  }, [feedbackStorageKey]);

  useEffect(() => {
    const stored = localStorage.getItem(contactStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        setCapturedContact(parsed);
      }
    } catch {
      // Ignore invalid storage
    }
  }, [contactStorageKey]);


  // Sound notification function
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.error('Sound playback failed:', e);
    }
  };

  // Get relative time string
  const getRelativeTime = (timestamp: Date): string => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 30) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Suggested questions
  const suggestedQuestions = [
    'What services do you offer?',
    "What's your pricing?",
    'Can I book an appointment?',
    'What are your business hours?'
  ];

  const initialPromptTitle = widgetConfig.welcomeTitle || `Welcome to ${tenantConfig.companyName}.`;
  const initialPromptSubtitle = widgetConfig.welcomeSubtitle || 'How can I help?';

  // Initialize welcome message and restore persisted messages
  useEffect(() => {
    // Save session ID to localStorage
    localStorage.setItem('chatSessionId', sessionId);

    // Try to restore previous messages for this session
    const savedMessages = localStorage.getItem(`chatMessages_${sessionId}`);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        // Limit to last 50 messages
        const limitedMessages = parsed.slice(-50);
        setMessages(limitedMessages);
        return;
      } catch (e) {
        console.error('Failed to parse saved messages:', e);
      }
    }

    // If no saved messages, show welcome message
    if (widgetConfig.welcomeMessage) {
      setMessages([{
        id: 'welcome',
        role: 'model',
        text: widgetConfig.welcomeMessage,
        timestamp: new Date()
      }]);
    }
  }, [widgetConfig.welcomeMessage, sessionId]);

  // Note: Calendar connection is now handled server-side
  // The owner connects their calendar in the Integrations page
  // No need for visitor authentication

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      // Only save user and model messages, skip status messages
      const messagesToSave = messages.slice(-50); // Keep last 50
      localStorage.setItem(`chatMessages_${sessionId}`, JSON.stringify(messagesToSave));
    }
  }, [messages, sessionId]);

  // Handle initialization based on mode
  useEffect(() => {
    if (widgetConfig.leadCaptureMode === 'ai-driven' || !hasLeadFields) {
      setShowLeadForm(false);
      initChat(); // Initialize AI session immediately
    } else if (isPreChatMode) {
      setShowLeadForm(true);
    }
  }, [widgetConfig.leadCaptureMode, hasLeadFields]);

  const formatServicesForPrompt = (services: any): string => {
    if (!Array.isArray(services) || services.length === 0) return 'Not provided';

    if (typeof services[0] === 'string') {
      return services.map((s: string) => s.trim()).filter(Boolean).join(', ') || 'Not provided';
    }

    if (typeof services[0] === 'object') {
      return (services as Service[]).map((svc) => {
        const name = svc.name || 'Service';
        const price = svc.pricing ? formatServicePrice(svc.pricing) : 'Pricing not specified';
        const duration = svc.duration ? `${svc.duration} min` : '';
        const details = [price, duration].filter(Boolean).join(', ');
        const description = svc.description ? ` — ${svc.description}` : '';
        return `${name}${details ? ` (${details})` : ''}${description}`;
      }).join(' | ');
    }

    return String(services);
  };

  const formatPricingForPrompt = (pricing: any): string => {
    if (!pricing) return 'Not provided';
    if (Array.isArray(pricing)) {
      const plans = (pricing as PricingPlan[]).filter(p => p && (p.name || p.price));
      if (plans.length === 0) return 'Not provided';
      return plans.map(plan => {
        const name = plan.name || 'Plan';
        const price = plan.price || 'Price not specified';
        const features = plan.features && plan.features.length > 0
          ? ` — ${plan.features.join(', ')}`
          : '';
        return `${name}: ${price}${features}`;
      }).join(' | ');
    }
    return String(pricing);
  };

  const formatTimestampForPrompt = (value: any): string => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const isPricingIntent = (text: string): boolean => {
    const normalized = text.toLowerCase();
    return [
      'price',
      'pricing',
      'plan',
      'plans',
      'cost',
      'rate',
      'fees',
      'how much',
      'cheapest',
      'expensive',
      'compare',
      'difference',
      '$'
    ].some(token => normalized.includes(token));
  };

  const isPlanSelectionIntent = (text: string): boolean => {
    const normalized = text.toLowerCase();
    return [
      'which one',
      'which plan',
      'best',
      'recommend',
      'good for',
      'fit for',
      'suitable',
      'right plan',
      'plan for',
      'best for'
    ].some(token => normalized.includes(token));
  };

  const isGreeting = (text: string): boolean => {
    const normalized = text.toLowerCase().trim();
    return ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'].some(g => normalized === g || normalized.startsWith(`${g} `));
  };

  const extractServiceNames = (data: any): string[] => {
    const services = data?.services;
    if (!Array.isArray(services)) return [];
    if (services.length === 0) return [];
    if (typeof services[0] === 'string') {
      return (services as string[]).map(s => s.trim()).filter(Boolean);
    }
    if (typeof services[0] === 'object') {
      return (services as Service[]).map(s => s.name).filter(Boolean);
    }
    return [];
  };

  const filterServiceNames = (names: string[]): string[] => {
    return names.filter(name => {
      const wordCount = name.trim().split(/\s+/).length;
      return name.length <= 40 && wordCount <= 6;
    });
  };

  const isBusinessIntent = (text: string): boolean => {
    const normalized = text.toLowerCase();
    if (isPricingIntent(normalized) || isPlanSelectionIntent(normalized)) return true;
    if (isPlatformIntent(normalized)) return true;
    const bookingTokens = [
      'book',
      'appointment',
      'schedule',
      'availability',
      'available',
      'slot',
      'reschedule',
      'cancel',
      'callback',
      'call back',
      'call me',
      'call',
      'talk to',
      'speak to',
      'representative',
      'sales',
      'demo'
    ];
    if (bookingTokens.some(token => normalized.includes(token))) return true;
    const infoTokens = [
      'hours',
      'open',
      'close',
      'location',
      'address',
      'phone',
      'email',
      'contact',
      'pricing',
      'price',
      'plan',
      'services',
      'service',
      'use',
      'implement',
      'implementation',
      'integrate',
      'setup',
      'set up',
      'for my business',
      'for my company',
      'for my clinic',
      'for my practice',
      'for my office'
    ];
    if (infoTokens.some(token => normalized.includes(token))) return true;
    if (knowledgeSnapshot) {
      const serviceNames = filterServiceNames(extractServiceNames(knowledgeSnapshot));
      if (serviceNames.some(name => normalized.includes(name.toLowerCase()))) return true;
      const keywords = Array.isArray(knowledgeSnapshot.keywords) ? knowledgeSnapshot.keywords : [];
      if (keywords.some((kw: string) => normalized.includes(String(kw).toLowerCase()))) return true;
      if (knowledgeSnapshot.companyName && normalized.includes(String(knowledgeSnapshot.companyName).toLowerCase())) return true;
    }
    return false;
  };

  const isBookingOrCallbackIntent = (text: string): boolean => {
    const normalized = text.toLowerCase();
    const tokens = ['book', 'appointment', 'schedule', 'availability', 'available', 'slot', 'reschedule', 'cancel', 'callback', 'call back'];
    return tokens.some(token => normalized.includes(token));
  };

  const isPlatformIntent = (text: string): boolean => {
    const normalized = text.toLowerCase();
    // Only trigger on explicit "What is Chippy" or "How does Chippy work" style questions
    // Avoid triggering on follow-up questions like "for my business" or "setup"
    const explicitPlatformPatterns = [
      /what is chippy/,
      /how does chippy work/,
      /how can i use chippy/,
      /tell me about chippy/,
      /what can chippy do/,
      /how do i use chippy/,
      /how do i get started with chippy/,
      /how do i set up chippy/,
      /can chippy help/,
      /will chippy work for/,
      /does chippy support/,
      /is chippy right for/
    ];
    return explicitPlatformPatterns.some(pattern => pattern.test(normalized));
  };

  // Thin filter: only reject obvious abuse and math playground inputs
  // Everything else goes to the model for agent-native reasoning
  const shouldQuickReject = (text: string): boolean => {
    const t = text.toLowerCase().trim();
    // Math expressions (1+1, 2*3, what is 5+5, etc.)
    if (/^\d+\s*[\+\-\*\/\^%]\s*\d+/.test(t)) return true;
    if (/^what('s| is)\s+\d+\s*[\+\-\*\/]/i.test(t)) return true;
    // Obvious abuse/jailbreak attempts
    if (/ignore (your |all |previous )?instructions/i.test(t)) return true;
    if (/(jailbreak|pretend you('re| are)|act as if)/i.test(t)) return true;
    return false;
  };

  const buildBusinessRedirect = (): string => {
    const items: string[] = [];
    const serviceNames = knowledgeSnapshot ? filterServiceNames(extractServiceNames(knowledgeSnapshot)) : [];
    if (serviceNames.length > 0) {
      items.push(`services like ${serviceNames.slice(0, 2).join(', ')}`);
    }
    if (capabilities.canAnswerPricing) items.push('pricing');
    items.push('hours', 'location');
    if (capabilities.canBookAppointments) items.push('booking');
    if (capabilities.canRequestCallback) items.push('callbacks');
    const summary = items.length > 0 ? items.join(', ') : 'our services, pricing, hours, and booking';
    return `I can help with ${summary}. What would you like to know?`;
  };

  const buildPlatformResponse = (): string => {
    const steps = [
      'Add your services, pricing, and hours to the Knowledge Base',
      'Connect your calendar for live availability',
      'Customize the widget and embed it on your site',
      'Test booking + callback flows before going live'
    ];
    return `Chippy helps businesses answer questions, capture leads, and book appointments automatically.\n\nFor your business, the fastest setup is:\n- ${steps.join('\n- ')}\n\nIf you want, tell me your business type and I can recommend the best setup and next steps.`;
  };

  const extractContactFields = (text: string): { name?: string; email?: string; phone?: string } => {
    const result: { name?: string; email?: string; phone?: string } = {};
    const parts: string[] = [];
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      result.email = emailMatch[0];
      parts.push(`Email: ${emailMatch[0]}`);
    }

    const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
    let normalizedPhone = '';
    if (phoneMatch) {
      const digits = phoneMatch[0].replace(/\D/g, '');
      if (digits.length >= 10) {
        normalizedPhone = digits;
        result.phone = digits;
        parts.push(`Phone: ${digits}`);
      }
    }

    const nameMatch = text.match(/\bmy name is\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/i);
    if (nameMatch) {
      result.name = nameMatch[1];
      parts.push(`Name: ${nameMatch[1]}`);
    } else if (normalizedPhone) {
      const beforePhone = text.split(phoneMatch![0])[0] || '';
      const candidate = beforePhone.split(',')[0]?.trim();
      if (candidate && /[a-zA-Z]/.test(candidate) && candidate.length <= 60) {
        result.name = candidate;
        parts.push(`Name: ${candidate}`);
      }
    }

    return result;
  };

  const buildContactContext = (text: string): string | null => {
    const fields = extractContactFields(text);
    const parts: string[] = [];
    if (fields.email) parts.push(`Email: ${fields.email}`);
    if (fields.phone) parts.push(`Phone: ${fields.phone}`);
    if (fields.name) parts.push(`Name: ${fields.name}`);
    if (parts.length === 0) return null;
    return parts.join('\n');
  };

  const buildModelInput = (text: string): string => {
    const contactContext = buildContactContext(text);
    if (!contactContext) return text;
    return `${text}\n\nCONTACT INFO PROVIDED (do not ask again if present):\n${contactContext}`;
  };

  const mergeContact = (incoming: { name?: string; email?: string; phone?: string }) => {
    if (!incoming.name && !incoming.email && !incoming.phone) return;
    setCapturedContact(prev => {
      const next = {
        name: incoming.name || prev.name,
        email: incoming.email || prev.email,
        phone: incoming.phone || prev.phone
      };
      localStorage.setItem(contactStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const matchCustomCapability = (text: string) => {
    if (!capabilities.custom || capabilities.custom.length === 0) return null;
    const normalized = text.toLowerCase();
    return capabilities.custom.find(cap => !cap.enabled && (
      (cap.key && normalized.includes(cap.key.toLowerCase())) ||
      (cap.label && normalized.includes(cap.label.toLowerCase()))
    ));
  };

  const extractPricingPlans = (data: any): PricingPlan[] => {
    if (!data?.pricing || !Array.isArray(data.pricing)) return [];
    return (data.pricing as PricingPlan[]).filter(plan => plan && (plan.name || plan.price));
  };

  const buildPricingResponse = (data: any, text: string): string | null => {
    const plans = extractPricingPlans(data);
    if (plans.length === 0) return null;

    const normalized = text.toLowerCase();
    const budgetMatch = normalized.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
    const budget = budgetMatch ? parseFloat(budgetMatch[1]) : null;
    const cheapest = plans.reduce((min, plan) => {
      const price = extractNumericPrice(plan.price);
      if (price === null) return min;
      if (!min || price < min.value) {
        return { value: price, plan };
      }
      return min;
    }, null as null | { value: number; plan: PricingPlan });

    if (budget !== null && cheapest) {
      if (budget < cheapest.value) {
        return `Thanks for sharing your budget. Our lowest plan is ${cheapest.plan.name} at ${cheapest.plan.price}. Would you like details on that plan?`;
      }
    }

    if (normalized.includes('cheapest') && cheapest) {
      return `${cheapest.plan.name} is the cheapest at ${cheapest.plan.price}.`;
    }

    if (normalized.includes('difference') || normalized.includes('compare')) {
      const lines = plans.map(plan => {
        const features = plan.features && plan.features.length > 0 ? ` — ${plan.features.join(', ')}` : '';
        return `${plan.name}: ${plan.price}${features}`;
      });
      return `Here’s how the plans compare:\n\n${lines.join('\n')}`;
    }

    const lines = plans.map(plan => {
      const features = plan.features && plan.features.length > 0 ? ` — ${plan.features.join(', ')}` : '';
      return `${plan.name}: ${plan.price}${features}`;
    });
    return `Here are our pricing plans:\n\n${lines.join('\n')}`;
  };

  const extractNumericPrice = (price?: string): number | null => {
    if (!price) return null;
    const match = price.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
    if (!match) return null;
    return parseFloat(match[1]);
  };

  const initChat = async (userData?: typeof leadData): Promise<any> => {
    let structuredInfo = "Standard business hours apply.";
    let correctionsInfo = "";
    let topRulesInfo = "";

    const knowledgeMissing = !(knowledgeSnapshot && (
      knowledgeSnapshot.summary ||
      knowledgeSnapshot.businessCategory ||
      (knowledgeSnapshot.services && knowledgeSnapshot.services.length > 0) ||
      knowledgeSnapshot.businessHours ||
      knowledgeSnapshot.pricing ||
      knowledgeSnapshot.policies ||
      (knowledgeSnapshot.locations && knowledgeSnapshot.locations.length > 0)
    ));

    try {
      if (knowledgeSnapshot) {
        const parsed = knowledgeSnapshot;
        structuredInfo = `
          Business Category: ${parsed.businessCategory}
          Summary: ${parsed.summary}
          Services: ${formatServicesForPrompt(parsed.services)}
          Hours: ${parsed.businessHours}
          Contact: ${parsed.contactInfo}
          Pricing: ${formatPricingForPrompt(parsed.pricing)}
          Policies: ${parsed.policies}
          KB Last Updated: ${formatTimestampForPrompt(parsed.lastUpdated)}
        `;

        if (parsed.corrections && parsed.corrections.length > 0) {
          correctionsInfo = `
            CRITICAL INSTRUCTIONS (OVERRIDE PREVIOUS RULES):
            The user has previously corrected your behavior on specific queries. You MUST follow these corrections:
            ${parsed.corrections.map((c: any) => `- When asked "${c.query}", YOU MUST ANSWER: "${c.correction}"`).join('\n')}
          `;
        }

        // Parse top rules from knowledge base
        if (parsed.topRules && parsed.topRules.trim()) {
          const rules = parsed.topRules.split('\n').filter((r: string) => r.trim());
          if (rules.length > 0) {
            topRulesInfo = `
            🎯 TOP PRIORITY RULES (MUST FOLLOW):
            These are the business owner's priority instructions. Follow these rules in all interactions:
            ${rules.map((r: string, i: number) => `${i + 1}. ${r.trim()}`).join('\n')}
            `;
          }
        }
      }
    } catch (e) {
      structuredInfo = knowledgeSummary || "Standard business hours apply.";
    }

    const resolvedContact = {
      name: userData?.name || capturedContact.name,
      email: userData?.email || capturedContact.email,
      phone: userData?.phone || capturedContact.phone
    };

    const userInfoContext = (resolvedContact.name || resolvedContact.email || resolvedContact.phone) ? `
      CUSTOMER INFO:
      Name: ${resolvedContact.name || 'Not provided'}
      Email: ${resolvedContact.email || 'Not provided'}
      Phone: ${resolvedContact.phone || 'Not provided'}
      Use this information to personalize your responses. You already have these details.
    ` : "";

    const contactReqs = [];
    if (widgetConfig.contactFields.name === 'required') contactReqs.push("Full Name (REQUIRED)");
    else if (widgetConfig.contactFields.name === 'optional') contactReqs.push("Full Name (OPTIONAL)");

    if (widgetConfig.contactFields.email === 'required') contactReqs.push("Email Address (REQUIRED)");
    else if (widgetConfig.contactFields.email === 'optional') contactReqs.push("Email Address (OPTIONAL)");

    if (widgetConfig.contactFields.phone === 'required') contactReqs.push("Phone Number (REQUIRED)");
    else if (widgetConfig.contactFields.phone === 'optional') contactReqs.push("Phone Number (OPTIONAL)");

    const systemInstruction = `
      You are an intelligent booking agent for "${tenantConfig.companyName}".
      
      CURRENT DATE AND TIME:
      Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
      Current time is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.
      
      ${userInfoContext}

      KNOWLEDGE BASE:
      ${structuredInfo}

      ${knowledgeMissing ? `
      ⚠️ KNOWLEDGE BASE INCOMPLETE:
      - Do NOT list services, pricing, or plans unless the user explicitly provides them.
      - Ask one clarifying question to learn their service need.
      - Offer a callback if you cannot answer accurately.
      ` : ''}

      CAPABILITIES (DO NOT VIOLATE):
      - Pricing answers: ${capabilities.canAnswerPricing ? 'ENABLED' : 'DISABLED'}
      - Booking appointments: ${capabilities.canBookAppointments ? 'ENABLED' : 'DISABLED'}
      - Callback requests: ${capabilities.canRequestCallback ? 'ENABLED' : 'DISABLED'}
      - Lead capture: ${capabilities.canCollectLeads ? 'ENABLED' : 'DISABLED'}
      ${capabilities.custom && capabilities.custom.length > 0 ? `- Custom: ${capabilities.custom.map(c => `${c.label} (${c.enabled ? 'ENABLED' : 'DISABLED'})`).join(', ')}` : ''}

      ${correctionsInfo}
      
      ${topRulesInfo}
      
      ${getLocationSelectionPrompt(locations, calendarConnections)}
      
      📍 COMMON LOCATION QUESTIONS (IMPORTANT):
      When users ask questions like:
      - "Where are you located?"
      - "What locations do you have?"
      - "Where are you?"
      - "Do you have multiple locations?"
      - "Which locations do you service?"
      
      They are asking about THE BUSINESS LOCATIONS, NOT your location as an AI.
      
      ✅ CORRECT Response Examples:
      - "We have [number] locations: [list locations with addresses]"
      - "We're located at [address] in [city]"
      - "We serve customers at our [location names] locations"
      
      ❌ NEVER say:
      - "I do not have the functionality to share my location"
      - "I am an AI and don't have a physical location"
      - "I cannot share location data"
      
      YOU REPRESENT ${tenantConfig.companyName}. When asked about location, always share the business location information from your knowledge base.

      🔒 ROLE BOUNDARIES:
      - You are the business assistant, not the Chippy platform.
      - Do NOT list platform capabilities or generic feature lists unless the user explicitly asks about Chippy.
      - For unrelated personal questions (e.g., age), politely redirect to business help without listing capabilities.
      - If the user asks about their provided contact info (name, email, phone) and it is in CUSTOMER INFO, answer directly.
      
      CONTACT COLLECTION RULES:
      ${userInfoContext ? `✅ You ALREADY HAVE the customer's contact information (see CUSTOMER INFO section above). DO NOT ask for their name, email, or phone again.` : `Collect contact info when booking:
${contactReqs.length > 0 ? contactReqs.map(r => `- ${r}`).join('\n') : "No details required."}
      - Be conversational. Ask for contact info before confirming booking.
      - REQUIRED fields must be collected before calling book_appointment.`}

      ⚠️ CRITICAL - CALENDAR TOOL REQUIREMENTS:
      You MUST use these tools. Do NOT recite times from memory. Do NOT make up availability.
      
      MANDATORY TOOL USAGE:
      - When user asks about availability, times, or slots → ALWAYS call get_available_slots first (with location_id if multi-location)
      - When booking is confirmed → ALWAYS call book_appointment (with location_id and location_name if multi-location)
      - When canceling → ALWAYS call cancel_appointment
      - When rescheduling → ALWAYS call reschedule_appointment
      - When user wants a callback instead of booking → call request_callback
      - When user provides address for location finding → call find_closest_location
      
      NEVER list times without first calling get_available_slots. This is NON-NEGOTIABLE.

      🎯 SERVICE MATCHING (IMPORTANT):
      When a user wants to book or request a callback:
      1. First ask: "What are you looking for help with?" or "What brings you in today?"
      2. Listen to their response and match it to one of the available services in your knowledge base
      3. Confirm: "It sounds like you're interested in [matched service]. Is that correct?"
      4. Only proceed after they confirm the service
      
      If their need doesn't match any service, say: "I'm not sure that's something we offer. Our services include: [list services]. Which of these best fits what you're looking for?"
      Only apply this service-matching fallback for booking or callback requests.

      📞 CALLBACK REQUESTS:
      If a user prefers to receive a callback instead of booking directly:
      1. First, match their need to a SERVICE (see service matching above)
      2. Confirm the service with them
      3. Collect their NAME (required) and PHONE NUMBER (required)
      4. Email is optional but helpful
      5. Ask: "When would you like us to call you back?" - Try to get a SPECIFIC date and time (e.g., "Tomorrow at 2pm", "Friday morning at 10am")
      6. If they give a specific date/time, use requested_datetime. If they give a general time (e.g., "morning", "afternoon"), use preferred_time
      7. If the requested time is outside business hours, offer the next available business-hour options instead of confirming
      8. Then call request_callback with the collected information

      📅 BOOKING FLOW:
      1. First, match their need to a SERVICE
      2. Confirm the service with them
      3. For multi-location: Ask which location or if they want closest to their address
      4. Check availability using get_available_slots (with location_id)
      5. Collect contact info (name, email required; phone as configured)
      6. Book with book_appointment including service_type, location_id, and location_name

      📅 DATE VERIFICATION (CRITICAL):
      Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
      
      ACTUAL DAY-OF-WEEK REFERENCE (use this!):
      - January 3, 2026 = Saturday
      - January 4, 2026 = Sunday  
      - January 5, 2026 = Monday
      - January 6, 2026 = Tuesday
      - January 7, 2026 = Wednesday
      
      If user says something like "Monday 6th" - that's WRONG (6th is Tuesday).
      You MUST ask: "Just to confirm, January 6th is actually a Tuesday. Did you mean Monday January 5th, or Tuesday January 6th?"
      
      SLOT SELECTION:
      When get_available_slots returns, present the slots clearly. Users will see clickable buttons.
      When user picks a time, call book_appointment with that datetime.

      💵 PRICING RULES (CRITICAL):
      - Only share pricing or plan names that appear in the KNOWLEDGE BASE or BDL CONTEXT.
      - Do NOT invent plan names, tiers, or prices.
      - If pricing is missing or unclear, say you don't have it and offer to connect them or ask which plan they saw.
      - If the user says the website shows a different price, acknowledge it and defer to the website as most current.
      - If user asks about "plans", interpret this as pricing plans unless they explicitly refer to personal plans.
      - If challenged on pricing and the KB is clear, confirm politely but cite that it's based on the KB and offer to verify against the website if they saw a different price.

      Keep responses concise. Use Markdown formatting.
      Do not make up services not in the knowledge base.
    `;

    // Create tool executor with context
    const toolContext: ToolContext = {
      userId: tenantConfig.userId,
      timezone: 'America/New_York',
      companyName: tenantConfig.companyName,
      businessHours: knowledgeSnapshot?.businessHours || null,
      businessHoursByDay: knowledgeSnapshot?.businessHoursByDay || null,
      onCallbackRequest: onCallbackRequest,
      calendarConnections: calendarConnections.map(c => ({
        id: c.id,
        locationId: c.locationId,
        locationName: c.locationName,
        providerEmail: c.providerEmail,
        calendarId: c.calendarId,
        isActive: c.isActive
      })),
      locations: locations.map(loc => ({
        name: loc.name,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        zip: loc.zip
      }))
    };

    const toolExecutor = async (name: string, args: any) => {
      // Custom status messages for different tools
      const statusMessages: Record<string, string> = {
        'get_available_slots': '🔍 Finding open spots...',
        'book_appointment': '📅 Booking your appointment...',
        'cancel_appointment': '❌ Canceling appointment...',
        'reschedule_appointment': '🔄 Rescheduling...',
        'request_callback': '📞 Submitting callback request...',
        'find_closest_location': '📍 Finding closest location...',
      };
      setStatusMessage(statusMessages[name] || '🔄 Processing...');

      if (name === 'request_callback' && !capabilities.canRequestCallback) {
        setStatusMessage('');
        return { success: false, error: 'Callback requests are not enabled.' };
      }

      if (
        (name === 'get_available_slots' ||
          name === 'book_appointment' ||
          name === 'cancel_appointment' ||
          name === 'reschedule_appointment') &&
        !capabilities.canBookAppointments
      ) {
        setStatusMessage('');
        return { success: false, error: 'Booking is not enabled.' };
      }

      // Handle location tool
      if (name === 'find_closest_location') {
        const result = await executeFindClosestLocation(args, locations);
        setStatusMessage('');
        return result;
      }

      // Handle calendar tools
      const result = await executeCalendarTool(name, args, toolContext);
      setStatusMessage('');

      if (result.success) {
        try {
          if (name === 'book_appointment') {
            const startAt = args.datetime;
            const duration = args.duration_minutes || 60;
            const endAt = startAt ? new Date(new Date(startAt).getTime() + duration * 60000).toISOString() : undefined;

            await bdlService.emitEvent(createEvent({
              tenantId: tenantConfig.userId,
              type: 'booking.created',
              source: 'chat',
              payload: {
                booking_id: result.data?.eventId,
                customer: {
                  name: args.customer_name,
                  email: args.customer_email,
                  phone: args.customer_phone
                },
                service: args.service_type,
                location_id: args.location_id,
                start_at: startAt,
                end_at: endAt
              }
            }));
          }

          if (name === 'cancel_appointment') {
            await bdlService.emitEvent(createEvent({
              tenantId: tenantConfig.userId,
              type: 'booking.canceled',
              source: 'chat',
              payload: {
                booking_id: args.appointment_id,
                customer: {
                  email: args.customer_email
                },
                reason: args.reason
              }
            }));
          }

          if (name === 'reschedule_appointment') {
            await bdlService.emitEvent(createEvent({
              tenantId: tenantConfig.userId,
              type: 'booking.updated',
              source: 'chat',
              payload: {
                booking_id: args.appointment_id,
                customer: {
                  email: args.customer_email
                },
                new_start_at: args.new_datetime
              }
            }));
          }

          if (name === 'request_callback') {
            // Server handles persistence/validation for callback requests
          }
        } catch (error) {
          console.warn('[BDL] Failed to emit event', error);
        }
      }

      // Capture available slots for clickable UI
      if (name === 'get_available_slots' && result.success && result.data?.slots) {
        setClickableSlots(result.data.slots);
      }

      // Clear slots when booking is made
      if (name === 'book_appointment' && result.success) {
        setClickableSlots([]);
        setFeedbackEligible(true);
        setConversationEnded(true);
        // Create/update lead with booking status
        if (onBookingComplete && args.customer_email) {
          onBookingComplete(
            args.customer_email,
            args.customer_name,
            args.customer_phone,
            args.service_type,
            args.location_id,
            args.location_name
          );
        }
      }

      // Update lead status when appointment is cancelled
      if (name === 'cancel_appointment' && result.success) {
        if (onCancellation && args.customer_email) {
          onCancellation(args.customer_email);
        }
      }

      if (name === 'request_callback' && result.success) {
        setFeedbackEligible(true);
        setConversationEnded(true);
      }

      return result;
    };

    // Combine calendar tools and location tool
    const allTools = [
      CALENDAR_TOOLS,
      { functionDeclarations: [LOCATION_TOOL] }
    ];

    const session = await createBdlAgentSession(
      systemInstruction,
      allTools,
      toolExecutor,
      { userId: tenantConfig.userId, sessionId }
    );

    // Restore previous conversation history if it exists
    const savedMessages = localStorage.getItem(`chatMessages_${sessionId}`);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        // Filter out welcome messages and build conversation history
        const conversationHistory = parsed.filter((m: Message) =>
          m.id !== 'welcome'
        ).map((m: Message) => ({
          role: m.role,
          text: m.text
        }));

        // Restore history to session if it has the method
        if (conversationHistory.length > 0 && typeof (session as any).restoreHistory === 'function') {
          (session as any).restoreHistory(conversationHistory);
        }
      } catch (e) {
        console.error('[ChatWidget] Failed to restore chat history:', e);
      }
    }

    setChatSession(session);
    return session; // Return the new session so caller can use it immediately
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowLeadForm(false);
    // Capture the lead when form is submitted
    if (onLeadCapture && (leadData.name || leadData.email || leadData.phone)) {
      onLeadCapture(leadData);
    }
    mergeContact({ name: leadData.name, email: leadData.email, phone: leadData.phone });
    initChat(leadData);
  };

  // Handle Google Calendar authentication
  // Note: Calendar booking is now handled server-side using backend API
  // No need for visitor authentication or pending booking state

  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollToBottom();
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isOpen, showLeadForm, isLoading, clickableSlots]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.parent?.postMessage({ type: 'chippy:widget-state', open: isOpen }, '*');
  }, [isOpen]);

  const resetChatSession = () => {
    const newSessionId = `session_${Date.now()}`;
    localStorage.setItem('chatSessionId', newSessionId);
    localStorage.removeItem(`chatMessages_${sessionId}`);
    localStorage.removeItem(feedbackStorageKey);
    window.location.reload();
  };

  const submitFeedback = async () => {
    if (feedbackSubmitted || !feedbackRating) return;
    const sentiment = feedbackRating >= 4 ? 'positive' : feedbackRating <= 2 ? 'negative' : 'neutral';
    if (onFeedback) {
      onFeedback({
        rating: feedbackRating,
        sentiment,
        comment: feedbackComment.trim() ? feedbackComment.trim() : undefined
      });
    }
    localStorage.setItem(
      feedbackStorageKey,
      JSON.stringify({
        rating: feedbackRating,
        comment: feedbackComment.trim(),
        submittedAt: new Date().toISOString()
      })
    );
    setFeedbackSubmitted(true);
  };

  // Sanitize user input to prevent XSS and prompt injection
  const sanitizeInput = (text: string): string => {
    // Remove HTML tags
    let sanitized = text.replace(/<[^>]*>/g, '');
    // Remove potential script injection patterns
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    // Limit length to prevent abuse
    sanitized = sanitized.slice(0, 1000);
    // Trim whitespace
    sanitized = sanitized.trim();
    return sanitized;
  };

  const handleSend = async () => {
    const sanitizedText = sanitizeInput(inputText);
    if (!sanitizedText || !chatSession) return;

    const currentText = sanitizedText;
    mergeContact(extractContactFields(currentText));



    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    // Track which session to use for this message
    let sessionToUse = chatSession;

    try {
      if (isPlatformIntent(currentText) && !isBookingOrCallbackIntent(currentText)) {
        const responseText = buildPlatformResponse();
        const botMsgId = (Date.now() + 1).toString();
        const botMsg: Message = {
          id: botMsgId,
          role: 'model',
          text: '',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMsg]);
        setIsLoading(false);
        playNotificationSound();
        const chars = responseText.split('');
        for (let i = 0; i < chars.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          setMessages(prev => prev.map(msg =>
            msg.id === botMsgId
              ? { ...msg, text: responseText.substring(0, i + 1) }
              : msg
          ));
        }

        analyzeInteraction(currentText, responseText).then(analysis => {
          if (onInteraction) {
            onInteraction(currentText, responseText, analysis);
          }
        });

        return;
      }

      // Removed duplicate platform intent handler - already handled above

      // Thin filter: only reject obvious abuse/math - let model handle everything else
      if (shouldQuickReject(currentText)) {
        const responseText = buildBusinessRedirect();
        const botMsgId = (Date.now() + 1).toString();
        const botMsg: Message = {
          id: botMsgId,
          role: 'model',
          text: '',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMsg]);
        setIsLoading(false);
        playNotificationSound();
        const chars = responseText.split('');
        for (let i = 0; i < chars.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          setMessages(prev => prev.map(msg =>
            msg.id === botMsgId
              ? { ...msg, text: responseText.substring(0, i + 1) }
              : msg
          ));
        }

        analyzeInteraction(currentText, responseText).then(analysis => {
          if (onInteraction) {
            onInteraction(currentText, responseText, analysis);
          }
        });

        return;
      }

      const blockedCustom = matchCustomCapability(currentText);
      if (blockedCustom) {
        const responseText = `I’m not able to help with ${blockedCustom.label || 'that'} right now. Is there something else I can assist with?`;
        const botMsgId = (Date.now() + 1).toString();
        const botMsg: Message = {
          id: botMsgId,
          role: 'model',
          text: '',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMsg]);
        setIsLoading(false);
        playNotificationSound();
        const chars = responseText.split('');
        for (let i = 0; i < chars.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          setMessages(prev => prev.map(msg =>
            msg.id === botMsgId
              ? { ...msg, text: responseText.substring(0, i + 1) }
              : msg
          ));
        }

        analyzeInteraction(currentText, responseText).then(analysis => {
          if (onInteraction) {
            onInteraction(currentText, responseText, analysis);
          }
        });

        return;
      }

      if (isPricingIntent(currentText)) {
        if (!capabilities.canAnswerPricing) {
          const pricingResponse = "I’m not able to share pricing right now. Would you like me to connect you with someone?";
          const botMsgId = (Date.now() + 1).toString();
          const botMsg: Message = {
            id: botMsgId,
            role: 'model',
            text: '',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, botMsg]);
          setIsLoading(false);
          playNotificationSound();
          const chars = pricingResponse.split('');
          for (let i = 0; i < chars.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 20));
            setMessages(prev => prev.map(msg =>
              msg.id === botMsgId
                ? { ...msg, text: pricingResponse.substring(0, i + 1) }
                : msg
            ));
          }

          analyzeInteraction(currentText, pricingResponse).then(analysis => {
            if (onInteraction) {
              onInteraction(currentText, pricingResponse, analysis);
            }
          });

          return;
        }

        if (!knowledgeSnapshot) {
          // No KB available, let the model handle the request.
        } else {
          const pricingResponse = buildPricingResponse(knowledgeSnapshot, currentText);
          if (pricingResponse) {
            const botMsgId = (Date.now() + 1).toString();
            const botMsg: Message = {
              id: botMsgId,
              role: 'model',
              text: '',
              timestamp: new Date()
            };
            setMessages(prev => [...prev, botMsg]);
            setIsLoading(false);
            playNotificationSound();
            const chars = pricingResponse.split('');
            for (let i = 0; i < chars.length; i++) {
              await new Promise(resolve => setTimeout(resolve, 20));
              setMessages(prev => prev.map(msg =>
                msg.id === botMsgId
                  ? { ...msg, text: pricingResponse.substring(0, i + 1) }
                  : msg
              ));
            }

            analyzeInteraction(currentText, pricingResponse).then(analysis => {
              if (onInteraction) {
                onInteraction(currentText, pricingResponse, analysis);
              }
            });

            return;
          }
        }
      }

      if (isPlanSelectionIntent(currentText)) {
        const pricingResponse = "I can help you choose the best plan. What matters most—budget, advanced analytics, custom branding, or multiple user seats?";
        const botMsgId = (Date.now() + 1).toString();
        const botMsg: Message = {
          id: botMsgId,
          role: 'model',
          text: '',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMsg]);
        setIsLoading(false);
        playNotificationSound();
        const chars = pricingResponse.split('');
        for (let i = 0; i < chars.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          setMessages(prev => prev.map(msg =>
            msg.id === botMsgId
              ? { ...msg, text: pricingResponse.substring(0, i + 1) }
              : msg
          ));
        }

        analyzeInteraction(currentText, pricingResponse).then(analysis => {
          if (onInteraction) {
            onInteraction(currentText, pricingResponse, analysis);
          }
        });

        return;
      }

      if (!sessionToUse) {
        console.error('[ChatWidget] No session available');
        setIsLoading(false);
        return;
      }

      const result = await sessionToUse.sendMessage(buildModelInput(userMsg.text));
      const responseText = result.response.text() || "I'm sorry, I'm having trouble connecting to the schedule right now.";

      const endSignals = [
        'appointment confirmed',
        'booking confirmed',
        'callback request submitted',
        'we will call you',
        'thank you for reaching out',
        'you are all set',
        'we have you scheduled'
      ];
      if (endSignals.some(signal => responseText.toLowerCase().includes(signal))) {
        setConversationEnded(true);
      }

      // Add empty message that will be filled with typewriter effect
      const botMsgId = (Date.now() + 1).toString();
      const botMsg: Message = {
        id: botMsgId,
        role: 'model',
        text: '', // Start empty
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);

      // Typewriter effect
      setIsLoading(false); // Hide thinking indicator
      playNotificationSound(); // Play sound when response starts
      const chars = responseText.split('');
      for (let i = 0; i < chars.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 20)); // 20ms per character
        setMessages(prev => prev.map(msg =>
          msg.id === botMsgId
            ? { ...msg, text: responseText.substring(0, i + 1) }
            : msg
        ));
      }

      analyzeInteraction(currentText, responseText).then(analysis => {
        if (onInteraction) {
          onInteraction(currentText, responseText, analysis);
        }
      });

      // Note: Calendar booking is now handled via Gemini Function Calling
      // The AI calls book_appointment directly through the tool executor

    } catch (error) {
      console.error("Chat error", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I encountered an error. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      // Save session after each message exchange
      if (onSessionUpdate) {
        // Use setTimeout to get latest messages state
        setTimeout(() => {
          setMessages(currentMessages => {
            if (currentMessages.length > 0) {
              onSessionUpdate(currentMessages);
            }
            return currentMessages;
          });
        }, 100);
      }
    }
  };

  const isLeadFormValid = () => {
    if (widgetConfig.contactFields.name === 'required' && !leadData.name.trim()) return false;
    if (widgetConfig.contactFields.email === 'required' && !leadData.email.trim()) return false;
    if (widgetConfig.contactFields.phone === 'required' && !leadData.phone.trim()) return false;
    return true;
  };

  const positionClass = widgetConfig.position === 'left' ? 'left-6 items-start' : 'right-6 items-end';

  if (!isMounted) return null;

  return (
    <div className={`fixed bottom-6 z-50 flex flex-col ${positionClass} pointer-events-none`}>
      {isOpen && (
        <div className="bg-white/95 w-[calc(100vw-24px)] sm:w-[380px] h-[600px] max-h-[calc(100vh-120px)] rounded-[28px] shadow-[0_30px_80px_-30px_rgba(15,23,42,0.4)] border border-slate-200/70 flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 backdrop-blur pointer-events-auto">
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between text-white border-b border-white/20" style={{ backgroundColor: widgetConfig.color }}>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Chippy" className="w-5 h-5 rounded" />
              <div>
                <h3 className="font-semibold text-sm">{widgetConfig.title}</h3>
                <p className="text-xs text-white/80">{widgetConfig.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Close Button */}
              <button onClick={() => {
                // Save session before closing
                if (onSessionUpdate && messages.length > 0) {
                  onSessionUpdate(messages);
                }
                setIsOpen(false);
              }} className="hover:bg-white/20 p-1 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 bg-slate-50/70 flex flex-col overflow-hidden">
            {showLeadForm ? (
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-6">
                  <h4 className="font-bold text-slate-800">Hello!</h4>
                  <p className="text-sm text-slate-500 mt-1">Please introduce yourself to start the conversation.</p>
                </div>

                <form onSubmit={handleLeadSubmit} className="space-y-4 flex-1">
                  {widgetConfig.contactFields.name !== 'hidden' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Full Name {widgetConfig.contactFields.name === 'required' && '*'}</label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required={widgetConfig.contactFields.name === 'required'}
                          placeholder="John Doe"
                          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                          value={leadData.name}
                          onChange={(e) => setLeadData({ ...leadData, name: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {widgetConfig.contactFields.email !== 'hidden' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Email Address {widgetConfig.contactFields.email === 'required' && '*'}</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          required={widgetConfig.contactFields.email === 'required'}
                          placeholder="john@example.com"
                          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                          value={leadData.email}
                          onChange={(e) => setLeadData({ ...leadData, email: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {widgetConfig.contactFields.phone !== 'hidden' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Phone Number {widgetConfig.contactFields.phone === 'required' && '*'}</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="tel"
                          required={widgetConfig.contactFields.phone === 'required'}
                          placeholder="+1 (555) 000-0000"
                          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                          value={leadData.phone}
                          onChange={(e) => setLeadData({ ...leadData, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-4 mt-auto">
                    <button
                      type="submit"
                      disabled={!isLeadFormValid()}
                      className="w-full py-3 rounded-xl text-white font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                      style={{ backgroundColor: widgetConfig.color }}
                    >
                      Start Chatting <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div ref={chatScrollRef} className="flex-1 p-5 space-y-4 overflow-y-auto">
                  {!hasUserMessage && (
                    <div className="text-center py-6">
                      <h2 className="text-2xl font-semibold text-slate-900">{initialPromptTitle}</h2>
                      <p className="text-lg font-semibold mt-1" style={{ color: widgetConfig.color }}>{initialPromptSubtitle}</p>
                    </div>
                  )}

                  {messages.filter(msg => !(msg.id === 'welcome' && !hasUserMessage)).map((msg) => (
                    <div key={msg.id}>
                      <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md'}`} style={msg.role === 'user' ? { backgroundColor: widgetConfig.color } : {}}>
                          {msg.role === 'user' ? msg.text : <FormattedMessage text={msg.text} />}
                        </div>
                      </div>
                      {/* Timestamp */}
                      <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mt-1 px-2`}>
                        <span className="text-[10px] text-slate-400">{getRelativeTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  ))}


                  {/* Calendar Time Picker - Show when slots are available */}
                  {clickableSlots.length > 0 && !isLoading && (
                    <div className="animate-in slide-in-from-bottom-2 duration-300">
                      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-2">
                        <span>🗓️</span> Pick a date & time:
                      </p>
                      <DateTimePicker
                        availableSlots={clickableSlots}
                        onSlotSelect={(slot) => {
                          // Send the slot selection to the AI
                          setInputText(`I'd like to book the ${slot} slot`);
                          setClickableSlots([]); // Clear slots
                          setTimeout(() => handleSend(), 100);
                        }}
                        accentColor={widgetConfig.color || '#14b8a6'}
                      />
                    </div>
                  )}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                          <span className="text-xs text-slate-500">Assistant is typing</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Calendar connection handled server-side via owner's Integrations page */}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-slate-100 sticky bottom-0 z-10">
                  {shouldShowFeedback && (
                    <div className="mb-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Rate this chat</p>
                        <button
                          type="button"
                          onClick={() => setFeedbackDismissed(true)}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map(value => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setFeedbackRating(value)}
                            className={`w-7 h-7 rounded-full text-[11px] font-semibold border transition-colors ${feedbackRating === value ? 'text-white' : 'bg-white text-slate-600 border-slate-200'}`}
                            style={feedbackRating === value ? { backgroundColor: widgetConfig.color, borderColor: widgetConfig.color } : {}}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          value={feedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                          placeholder="Optional feedback..."
                          className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-chippy-coral"
                        />
                        <button
                          type="button"
                          onClick={submitFeedback}
                          disabled={!feedbackRating}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-50"
                          style={{ backgroundColor: widgetConfig.color }}
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={resetChatSession}
                      className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-200 transition-colors"
                    >
                      Reset chat
                    </button>
                  </div>
                  <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-slate-200 shadow-sm focus-within:border-chippy-coral transition-colors">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={placeholderMessages[placeholderIndex % placeholderMessages.length]}
                      className="bg-transparent flex-1 outline-none text-sm text-slate-700 placeholder-slate-400"
                    />
                    <button onClick={handleSend} disabled={isLoading || !inputText.trim() || !chatSession} className="hover:opacity-80 disabled:opacity-50" style={{ color: widgetConfig.color }}>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">AI-generated answers may contain errors. Always verify information.</p>
                  {showPoweredBy && (
                    <div className="text-center mt-2">
                      <a
                        href="https://hellochippy.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        ⚡ Powered by <span className="font-semibold">Chippy</span>
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-white p-4 rounded-full shadow-lg hover:scale-110 transition-all duration-300 pointer-events-auto"
        style={{ backgroundColor: widgetConfig.color }}
      >
        {isOpen ? <X className="w-6 h-6" /> : <img src="/logo.png" alt="Chippy" className="w-6 h-6 rounded" />}
      </button>
    </div>
  );
};
