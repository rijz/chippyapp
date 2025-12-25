
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles, Loader2, User, Mail, Phone, ArrowRight } from 'lucide-react';
import { Message, TenantConfig, WidgetConfig } from '../types';
import { createAgentSession, analyzeInteraction } from '../services/geminiService';
// Fix: Import Chat instead of deprecated ChatSession
import { Chat, GenerateContentResponse } from '@google/genai';

interface ChatWidgetProps {
  tenantConfig: TenantConfig;
  widgetConfig: WidgetConfig;
  knowledgeSummary: string;
  onInteraction?: (query: string, response: string, analysis: any) => void;
  onSessionUpdate?: (messages: Message[]) => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tenantConfig, widgetConfig, knowledgeSummary, onInteraction, onSessionUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Fix: Use Chat type instead of ChatSession
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  
  // Lead Data
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '' });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine if we should show lead form based on config
  const isPreChatMode = widgetConfig.leadCaptureMode === 'pre-chat';
  const hasLeadFields = widgetConfig.contactFields.name !== 'hidden' || 
                       widgetConfig.contactFields.email !== 'hidden' || 
                       widgetConfig.contactFields.phone !== 'hidden';

  // Initialize welcome message
  useEffect(() => {
    if (widgetConfig.welcomeMessage) {
       setMessages([{
        id: 'welcome',
        role: 'model',
        text: widgetConfig.welcomeMessage,
        timestamp: new Date()
      }]);
    }
  }, [widgetConfig.welcomeMessage]);

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
      If NOT provided in the "CUSTOMER INFO" block above, you MUST collect the following details from the user ONLY when they express interest in:
      1. Booking an appointment.
      2. Requesting a call back.
      3. Asking for information that requires a personalized follow-up.

      Fields to collect contextually:
      ${contactReqs.length > 0 ? contactReqs.map(r => `- ${r}`).join('\n') : "No specific details required."}
      
      - Be conversational. Do not ask for all details upfront unless a booking/callback is initiated.
      - If a field is REQUIRED, you cannot confirm a booking without it.
      - If a field is OPTIONAL, ask for it once, but proceed if the user declines.
      - If a field is HIDDEN, do not ask for it.

      YOUR GOAL:
      Reliably convert inquiries into confirmed appointments.
      If the user wants to book, ask for their preferred date and time.
      Keep responses concise and professional.
      Use Markdown formatting (bullet points, bold text).
      
      Do not make up services that are not in the knowledge base.
    `;
    const session = await createAgentSession(systemInstruction);
    setChatSession(session);
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowLeadForm(false);
    initChat(leadData);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, showLeadForm]);

  const handleSend = async () => {
    if (!inputText.trim() || !chatSession) return;

    const currentText = inputText;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result: GenerateContentResponse = await chatSession.sendMessage({ message: userMsg.text });
      const responseText = result.text || "I'm sorry, I'm having trouble connecting to the schedule right now.";

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);

      analyzeInteraction(currentText, responseText).then(analysis => {
        if (onInteraction) {
           onInteraction(currentText, responseText, analysis);
        }
      });

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
    <div className={`fixed bottom-6 z-50 flex flex-col ${positionClass}`}>
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
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
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
                             onChange={(e) => setLeadData({...leadData, name: e.target.value})}
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
                             onChange={(e) => setLeadData({...leadData, email: e.target.value})}
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
                             onChange={(e) => setLeadData({...leadData, phone: e.target.value})}
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
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${msg.role === 'user' ? 'text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'}`} style={msg.role === 'user' ? { backgroundColor: widgetConfig.color } : {}}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                     <div className="flex justify-start">
                       <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-sm">
                         <Loader2 className="w-4 h-4 animate-spin" style={{ color: widgetConfig.color }} />
                       </div>
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
