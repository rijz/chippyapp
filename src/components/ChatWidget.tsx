
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles, Loader2, User, Mail, Phone, ArrowRight } from 'lucide-react';
import { Message, TenantConfig, WidgetConfig } from '../types';
import { createAgentSession, analyzeInteraction } from '../services/geminiService';
import { checkAvailability, loadGoogleScripts, handleAuthClick, isGoogleAuthenticated } from '../services/calendarAuth';
import { parseBookingConfirmation, createCalendarBooking } from '../services/bookingUtils';
import { ChatSession } from '@google/generative-ai';

// Simple Markdown renderer for chat messages
const FormattedMessage: React.FC<{ text: string }> = ({ text }) => {
  // Convert markdown to HTML
  const formatText = (input: string) => {
    return input
      // Bold: **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Bullet points: - item or * item
      .replace(/^[-*]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
      // Line breaks
      .replace(/\n/g, '<br />');
  };

  return (
    <span
      className="formatted-message"
      dangerouslySetInnerHTML={{ __html: formatText(text) }}
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
  showPoweredBy?: boolean; // Show "Powered by Chippy" badge for free users
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tenantConfig, widgetConfig, knowledgeSummary, onInteraction, onSessionUpdate, onLeadCapture, showPoweredBy = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>(''); // For showing "Checking calendar..." etc.

  // UX Enhancement States
  const [showSuggestedQuestions, setShowSuggestedQuestions] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('chatSoundEnabled') !== 'false');
  const [sessionId] = useState(() => localStorage.getItem('chatSessionId') || `session_${Date.now()}`);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<{ intent: any, leadData: any } | null>(null);

  // Lead Data
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine if we should show lead form based on config
  const isPreChatMode = widgetConfig.leadCaptureMode === 'pre-chat';
  const hasLeadFields = widgetConfig.contactFields.name !== 'hidden' ||
    widgetConfig.contactFields.email !== 'hidden' ||
    widgetConfig.contactFields.phone !== 'hidden';

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
        setShowSuggestedQuestions(limitedMessages.length <= 1); // Hide if conversation exists
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

  // Load Google Scripts and check auth status
  useEffect(() => {
    loadGoogleScripts();

    // Check auth status periodically
    const checkAuth = () => {
      setIsCalendarConnected(isGoogleAuthenticated());
    };

    checkAuth();
    const interval = setInterval(checkAuth, 2000); // Check every 2s

    return () => clearInterval(interval);
  }, []);

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

  const initChat = async (userData?: typeof leadData) => {
    let structuredInfo = "Standard business hours apply.";
    let correctionsInfo = "";

    console.log('[ChatWidget] initChat called');
    console.log('[ChatWidget] knowledgeSummary received:', knowledgeSummary ? `${knowledgeSummary.substring(0, 100)}...` : 'EMPTY');

    try {
      if (knowledgeSummary) {
        const parsed = JSON.parse(knowledgeSummary);
        console.log('[ChatWidget] Parsed knowledge:', {
          companyName: parsed.companyName,
          pricing: parsed.pricing ? 'HAS PRICING' : 'NO PRICING',
          services: parsed.services?.length || 0
        });
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
      
      ${userInfoContext}

      KNOWLEDGE BASE:
      ${structuredInfo}

      ${correctionsInfo}
      
      CONTACT COLLECTION RULES:
      ${userInfoContext ? `✅ You ALREADY HAVE the customer's contact information (see CUSTOMER INFO section above). DO NOT ask for their name, email, or phone again.` : `Collect contact info ONLY when booking:
${contactReqs.length > 0 ? contactReqs.map(r => `- ${r}`).join('\n') : "No details required."}
      - Be conversational. Ask ONLY when booking is confirmed.
      - REQUIRED fields must be collected before confirming.
      - OPTIONAL fields: ask once, proceed if user declines.`}

      YOUR GOAL:
      Convert inquiries to bookings quickly and helpfully.
      
      ${availableSlots ? `🗓️ REAL-TIME AVAILABLE SLOTS:
${availableSlots}

**CRITICAL**: When user asks about availability, immediately show these slots. These are REAL available times from the calendar.
When user picks a time from the list, confirm: "Perfect! I've booked you for [TIME]. Confirmation email coming shortly."
` : `⚠️ No slots loaded. When user asks about availability, ask their preferred date/time first.`}
      Keep responses concise and professional.
      Use Markdown formatting(bullet points, bold text).
      
      Do not make up services that are not in the knowledge base.
    `;
    const session = await createAgentSession(systemInstruction);
    setChatSession(session);
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
  const handleConnectCalendar = async () => {
    try {
      await handleAuthClick();
      setIsCalendarConnected(true);

      // If there's a pending booking, retry it now
      if (pendingBooking) {
        const { intent, leadData: bookingLeadData } = pendingBooking;
        console.log('[ChatWidget] Retrying booking after authentication...');

        const result = await createCalendarBooking(intent, bookingLeadData);
        if (result.success) {
          const confirmMsg: Message = {
            id: `confirm_${Date.now()}`,
            role: 'model',
            text: `✅ **Booking Confirmed!** Your appointment has been added to the calendar. You'll receive a confirmation email shortly.`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, confirmMsg]);
          setPendingBooking(null); // Clear pending booking
        } else {
          console.error('[ChatWidget] Booking failed after auth:', result.error);
        }
      }
    } catch (error) {
      console.error('[ChatWidget] Authentication failed:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, showLeadForm]);

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

    // Hide suggested questions after first message
    if (showSuggestedQuestions) {
      setShowSuggestedQuestions(false);
    }

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
            const { available } = await checkAvailability(slotStart, slotEnd);
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
        // Reinitialize chat with updated slots
        await initChat();
      } else {
        setStatusMessage('❌ No availability found in the next 7 days');
        await new Promise(resolve => setTimeout(resolve, 1500));
        setStatusMessage('');
      }
    }

    try {
      const result = await chatSession.sendMessage(userMsg.text);
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

      // Check if AI confirmed a booking and create actual calendar event
      const bookingIntent = parseBookingConfirmation(responseText);
      if (bookingIntent.hasIntent && bookingIntent.datetime && leadData.name && leadData.email) {
        console.log('[ChatWidget] Booking confirmed detected, creating calendar event...', bookingIntent);

        // Check if user is authenticated
        if (!isGoogleAuthenticated()) {
          console.log('[ChatWidget] User not authenticated, prompting to connect Google Calendar');
          setPendingBooking({ intent: bookingIntent, leadData });

          // Add message prompting authentication
          const authPrompt: Message = {
            id: `auth_${Date.now()}`,
            role: 'model',
            text: '⚠️ To complete your booking, please connect your Google Calendar below.',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, authPrompt]);
          return; // Stop here, wait for authentication
        }

        createCalendarBooking(bookingIntent, leadData)
          .then(result => {
            if (result.success) {
              console.log('[ChatWidget] Booking created successfully:', result.bookingId);
              // Add confirmation message to chat
              const confirmMsg: Message = {
                id: `confirm_${Date.now()}`,
                role: 'model',
                text: `✅ **Booking Confirmed!** Your appointment has been added to the calendar. You'll receive a confirmation email shortly.`,
                timestamp: new Date()
              };
              setMessages(prev => [...prev, confirmMsg]);
            } else {
              console.error('[ChatWidget] Booking creation failed:', result.error);

              // Show specific error if authentication issue
              if (result.error === 'AUTHENTICATION_REQUIRED') {
                setPendingBooking({ intent: bookingIntent, leadData });
                const authPrompt: Message = {
                  id: `auth_${Date.now()}`,
                  role: 'model',
                  text: '⚠️ To complete your booking, please connect your Google Calendar below.',
                  timestamp: new Date()
                };
                setMessages(prev => [...prev, authPrompt]);
              }
            }
          })
          .catch(err => {
            console.error('[ChatWidget] Booking error:', err);
          });
      }

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
    }
  };

  const isLeadFormValid = () => {
    if (widgetConfig.contactFields.name === 'required' && !leadData.name.trim()) return false;
    if (widgetConfig.contactFields.email === 'required' && !leadData.email.trim()) return false;
    if (widgetConfig.contactFields.phone === 'required' && !leadData.phone.trim()) return false;
    return true;
  };

  const positionClass = widgetConfig.position === 'left' ? 'left-6 items-start' : 'right-6 items-end';

  return (
    <div className={`fixed bottom - 6 z - 50 flex flex - col ${positionClass} `}>
      {isOpen && (
        <div className="bg-white w-[350px] h-[520px] rounded-2xl shadow-2xl border border-slate-200 flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="p-4 flex items-center justify-between text-white" style={{ backgroundColor: widgetConfig.color }}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-white/80" />
              <div>
                <h3 className="font-semibold text-sm">{widgetConfig.title}</h3>
                <p className="text-xs text-white/80">{widgetConfig.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Sound Toggle */}
              <button
                onClick={() => {
                  const newValue = !soundEnabled;
                  setSoundEnabled(newValue);
                  localStorage.setItem('chatSoundEnabled', String(newValue));
                }}
                className="hover:bg-white/20 p-1.5 rounded transition-colors"
                title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
              >
                {soundEnabled ? '🔔' : '🔕'}
              </button>

              {/* New Chat Button */}
              <button
                onClick={() => {
                  const newSessionId = `session_${Date.now()} `;
                  localStorage.setItem('chatSessionId', newSessionId);
                  localStorage.removeItem(`chatMessages_${sessionId} `);
                  window.location.reload(); // Reload to start fresh
                }}
                className="hover:bg-white/20 p-1.5 rounded transition-colors text-xs"
                title="Start new conversation"
              >
                🔄
              </button>

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
          <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
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
                <div className="flex-1 p-4 space-y-4">
                  {/* Suggested Questions */}
                  {showSuggestedQuestions && messages.length <= 1 && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500 font-medium">Suggested questions:</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestedQuestions.map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setInputText(question);
                              handleSend();
                            }}
                            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-full hover:border-chippy-coral hover:bg-chippy-coral/5 transition-all shadow-sm"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id}>
                      <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} `}>
                        <div className={`max - w - [85 %] rounded - 2xl p - 3 text - sm shadow - sm ${msg.role === 'user' ? 'text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'} `} style={msg.role === 'user' ? { backgroundColor: widgetConfig.color } : {}}>
                          {msg.role === 'user' ? msg.text : <FormattedMessage text={msg.text} />}
                        </div>
                      </div>
                      {/* Timestamp */}
                      <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mt - 1 px - 2`}>
                        <span className="text-[10px] text-slate-400">{getRelativeTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  ))}

                  {/* Quick Reply Buttons - Show after last bot message */}
                  {messages.length > 0 && messages[messages.length - 1].role === 'model' && !isLoading && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setInputText('Can I book an appointment?'); handleSend(); }}
                        className="px-3 py-1.5 text-xs bg-chippy-coral/10 text-chippy-coral border border-chippy-coral/30 rounded-full hover:bg-chippy-coral/20 transition-all"
                      >
                        📅 Book Now
                      </button>
                      <button
                        onClick={() => { setInputText("What's your pricing?"); handleSend(); }}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full hover:bg-blue-100 transition-all"
                      >
                        💰 Pricing
                      </button>
                      <button
                        onClick={() => { setInputText('How can I contact you?'); handleSend(); }}
                        className="px-3 py-1.5 text-xs bg-green-50 text-green-600 border border-green-200 rounded-full hover:bg-green-100 transition-all"
                      >
                        📞 Contact
                      </button>
                    </div>
                  )}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500">Chippy is thinking</span>
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Connect Google Calendar Button - Show when authentication required */}
                  {pendingBooking && !isCalendarConnected && (
                    <div className="flex justify-center my-3">
                      <button
                        onClick={handleConnectCalendar}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                        </svg>
                        Connect Google Calendar
                      </button>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-3 bg-white border-t border-slate-100">
                  <div className="flex items-center gap-2 bg-slate-50 rounded-full px-4 py-2 border border-slate-200 focus-within:border-chippy-coral transition-colors">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Type a message..."
                      className="bg-transparent flex-1 outline-none text-sm text-slate-700 placeholder-slate-400"
                    />
                    <button onClick={handleSend} disabled={isLoading || !inputText.trim() || !chatSession} className="hover:opacity-80 disabled:opacity-50" style={{ color: widgetConfig.color }}>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
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
        className="text-white p-4 rounded-full shadow-lg hover:scale-110 transition-all duration-300"
        style={{ backgroundColor: widgetConfig.color }}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
};
