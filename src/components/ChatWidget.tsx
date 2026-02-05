
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Loader2, User, Mail, Phone, ArrowRight } from 'lucide-react';
import { Message, TenantConfig, WidgetConfig, BusinessLocation, CalendarConnection } from '../types';
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
  const [availableSlots, setAvailableSlots] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>(''); // For showing "Checking calendar..." etc.
  const [clickableSlots, setClickableSlots] = useState<string[]>([]); // Slots user can click to book
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

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
  const feedbackStorageKey = useMemo(() => `chatFeedback_${sessionId}`, [sessionId]);

  // Determine if we should show lead form based on config
  const isPreChatMode = widgetConfig.leadCaptureMode === 'pre-chat';
  const hasLeadFields = widgetConfig.contactFields.name !== 'hidden' ||
    widgetConfig.contactFields.email !== 'hidden' ||
    widgetConfig.contactFields.phone !== 'hidden';

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

  const initChat = async (userData?: typeof leadData, overrideSlots?: string): Promise<any> => {
    let structuredInfo = "Standard business hours apply.";
    let correctionsInfo = "";
    let topRulesInfo = "";

    try {
      if (knowledgeSummary) {
        const parsed = JSON.parse(knowledgeSummary);
        structuredInfo = `
          Business Category: ${parsed.businessCategory}
          Summary: ${parsed.summary}
          Services: ${parsed.services?.join(', ')}
          Hours: ${parsed.businessHours}
          Contact: ${parsed.contactInfo}
          Pricing: ${parsed.pricing}
          Policies: ${parsed.policies}
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

    const userInfoContext = userData && (userData.name || userData.email || userData.phone) ? `
      CUSTOMER INFO:
      Name: ${userData.name || 'Not provided'}
      Email: ${userData.email || 'Not provided'}
      Phone: ${userData.phone || 'Not provided'}
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

      📞 CALLBACK REQUESTS:
      If a user prefers to receive a callback instead of booking directly:
      1. First, match their need to a SERVICE (see service matching above)
      2. Confirm the service with them
      3. Collect their NAME (required) and PHONE NUMBER (required)
      4. Email is optional but helpful
      5. Ask: "When would you like us to call you back?" - Try to get a SPECIFIC date and time (e.g., "Tomorrow at 2pm", "Friday morning at 10am")
      6. If they give a specific date/time, use requested_datetime. If they give a general time (e.g., "morning", "afternoon"), use preferred_time
      7. Then call request_callback with the collected information

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

      Keep responses concise. Use Markdown formatting.
      Do not make up services not in the knowledge base.
    `;

    // Create tool executor with context
    const toolContext: ToolContext = {
      userId: tenantConfig.userId,
      timezone: 'America/New_York',
      companyName: tenantConfig.companyName,
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
            await bdlService.emitEvent(createEvent({
              tenantId: tenantConfig.userId,
              type: 'callback.requested',
              source: 'chat',
              payload: {
                request_id: `cb_${Date.now()}`,
                customer: {
                  name: args.customer_name,
                  email: args.customer_email,
                  phone: args.customer_phone
                },
                service: args.service,
                purpose: args.purpose,
                preferred_time: args.preferred_time,
                requested_datetime: args.requested_datetime
              }
            }));
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



    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    // Check if booking intent - fetch calendar availability
    const bookingKeywords = ['book', 'appointment', 'schedule', 'availab', 'time', 'when can'];
    const hasBookingIntent = bookingKeywords.some(keyword => currentText.toLowerCase().includes(keyword));

    // Track which session to use for this message
    let sessionToUse = chatSession;

    if (hasBookingIntent && !availableSlots) {
      // Show status message
      setStatusMessage('🔍 Let me check my calendar...');

      // Generate next 7 days of available time slots
      const slots: string[] = [];
      const now = new Date();

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDate = new Date(now);
        checkDate.setDate(now.getDate() + dayOffset);

        // Check business hours (9 AM - 5 PM)
        for (let hour = 9; hour < 17; hour++) {
          const slotStart = new Date(checkDate);
          slotStart.setHours(hour, 0, 0, 0);
          const slotEnd = new Date(slotStart);
          slotEnd.setHours(hour + 1, 0, 0, 0);

          try {
            // Call backend API to check owner's calendar
            const response = await fetch('/api/calendar/availability', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: tenantConfig.userId, // Owner's user ID
                startTime: slotStart.toISOString(),
                endTime: slotEnd.toISOString(),
                provider: 'google'
              })
            });
            const { available } = await response.json();

            if (available) {
              const dayName = slotStart.toLocaleDateString('en-US', { weekday: 'short' });
              const dateStr = slotStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const timeStr = slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              slots.push(`${dayName}, ${dateStr} at ${timeStr} `);

              if (slots.length >= 10) break; // Limit to 10 slots
            }
          } catch (e) {
            console.error('Error checking availability:', e);
          }
        }
        if (slots.length >= 10) break;
      }

      if (slots.length > 0) {
        setStatusMessage(`✅ Found ${slots.length} available slots!`);
        await new Promise(resolve => setTimeout(resolve, 800)); // Show success for 800ms
        setStatusMessage('');
        setAvailableSlots(slots.join('\n'));

        // Reinitialize chat with updated slots and USE the returned session
        const newSession = await initChat(undefined, slots.join('\n'));
        if (newSession) {
          sessionToUse = newSession;
        }
      } else {
        setStatusMessage('❌ No availability found in the next 7 days');
        await new Promise(resolve => setTimeout(resolve, 1500));
        setStatusMessage('');
      }
    }

    try {
      if (!sessionToUse) {
        console.error('[ChatWidget] No session available');
        setIsLoading(false);
        return;
      }

      const result = await sessionToUse.sendMessage(userMsg.text);
      const responseText = result.response.text() || "I'm sorry, I'm having trouble connecting to the schedule right now.";

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
        <div className="bg-white/95 w-[380px] max-w-[calc(100vw-24px)] h-[600px] rounded-[28px] shadow-[0_30px_80px_-30px_rgba(15,23,42,0.4)] border border-slate-200/70 flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 backdrop-blur pointer-events-auto">
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
                  {hasModelMessage && !feedbackSubmitted && (
                    <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Rate this chat</p>
                      <div className="flex items-center gap-2 mb-2">
                        {[1, 2, 3, 4, 5].map(value => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setFeedbackRating(value)}
                            className={`w-8 h-8 rounded-full text-xs font-semibold border transition-colors ${feedbackRating === value ? 'text-white' : 'bg-white text-slate-600 border-slate-200'}`}
                            style={feedbackRating === value ? { backgroundColor: widgetConfig.color, borderColor: widgetConfig.color } : {}}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Optional feedback..."
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-chippy-coral"
                        rows={2}
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          onClick={submitFeedback}
                          disabled={!feedbackRating}
                          className="text-xs font-semibold px-3 py-1 rounded-full text-white disabled:opacity-50"
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
