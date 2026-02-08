import React, { useState, useRef, useEffect } from 'react';
import { Brain, Send, Loader2, Tag, Clock, DollarSign, Phone, ListChecks, MessageSquare, Sparkles } from 'lucide-react';
import { KnowledgeBaseData, Service, TenantConfig, WidgetConfig, Message } from '../../types';
import { formatServicePrice } from '../../utils/serviceUtils';
import { createBdlAgentSession } from '../../services/geminiService';

interface AIKnowledgePreviewProps {
    knowledgeData: KnowledgeBaseData;
    tenantConfig?: TenantConfig;
    widgetConfig?: WidgetConfig;
    onEdit?: () => void;
    onConfirm?: () => void;
    showActions?: boolean;
}

export const AIKnowledgePreview: React.FC<AIKnowledgePreviewProps> = ({
    knowledgeData,
    tenantConfig,
    widgetConfig,
    onEdit,
    onConfirm,
    showActions = true
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [chatSession, setChatSession] = useState<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const quickQuestions = [
        "What services do you offer?",
        "What are your hours?",
        "How much does it cost?",
        "How do I book an appointment?"
    ];

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const formatHoursByDay = (hoursByDay?: Record<string, string>) => {
        if (!hoursByDay) return null;
        return Object.entries(hoursByDay)
            .filter(([_, hours]) => hours && hours !== '')
            .map(([day, hours]) => `${day}: ${hours}`)
            .join(' | ');
    };

    const handleSendMessage = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: messageText,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Simple test response based on KB data
            let response = "";
            const lowerText = messageText.toLowerCase();

            if (lowerText.includes('service') || lowerText.includes('offer') || lowerText.includes('do you do')) {
                const services = knowledgeData.services || [];
                if (services.length > 0) {
                    response = `We offer the following services:\n${services.slice(0, 5).map(s =>
                        `• ${s.name}${s.pricing?.amount ? ` - ${formatServicePrice(s.pricing)}` : ''}`
                    ).join('\n')}${services.length > 5 ? `\n...and ${services.length - 5} more!` : ''}`;
                } else {
                    response = "Our service information is being updated. Please check back soon!";
                }
            } else if (lowerText.includes('hour') || lowerText.includes('open') || lowerText.includes('close') || lowerText.includes('when')) {
                const hours = formatHoursByDay(knowledgeData.businessHoursByDay) || knowledgeData.businessHours;
                response = hours ? `Our hours are: ${hours}` : "Please contact us for our current hours.";
            } else if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('much') || lowerText.includes('fee') || lowerText.includes('rate')) {
                const services = knowledgeData.services?.filter(s => s.pricing && s.pricing.amount) || [];
                if (services.length > 0) {
                    response = `Here are some of our prices:\n${services.slice(0, 4).map(s =>
                        `• ${s.name}: ${formatServicePrice(s.pricing)}`
                    ).join('\n')}`;
                } else if (knowledgeData.pricing) {
                    response = typeof knowledgeData.pricing === 'string'
                        ? knowledgeData.pricing
                        : "Please contact us for pricing details.";
                } else {
                    response = "Please contact us for pricing information.";
                }
            } else if (lowerText.includes('book') || lowerText.includes('appointment') || lowerText.includes('schedule') || lowerText.includes('reserve')) {
                response = "I can help you book an appointment! What service are you interested in, and when would you like to come in?";
            } else if (lowerText.includes('phone') || lowerText.includes('contact') || lowerText.includes('call') || lowerText.includes('email') || lowerText.includes('reach')) {
                const contact = knowledgeData.phoneNumber
                    ? `You can reach us at ${knowledgeData.phoneNumber}`
                    : "";
                const email = knowledgeData.contactInfo || "";
                response = contact || email || "Please check our website for contact information.";
            } else if (lowerText.includes('who') || lowerText.includes('what is') || lowerText.includes('about') || lowerText.includes('tell me')) {
                // Business identity questions
                const name = knowledgeData.companyName || "our company";
                const category = knowledgeData.businessCategory || "";
                const summary = knowledgeData.summary || "";
                if (summary) {
                    response = summary;
                } else if (category) {
                    response = `${name} is a ${category}. How can I help you today?`;
                } else {
                    response = `Welcome to ${name}! How can I assist you?`;
                }
            } else if (lowerText.includes('help') || lowerText.includes('business') || lowerText.includes('work for') || lowerText.includes('will')) {
                // General "will this help me" type questions
                const summary = knowledgeData.summary || "";
                const category = knowledgeData.businessCategory || "business needs";
                if (summary) {
                    response = `${summary}\n\nWould you like to learn more about how we can help your specific needs?`;
                } else {
                    response = `We specialize in ${category} and can definitely help! What specific needs do you have?`;
                }
            } else if (lowerText.includes('location') || lowerText.includes('where') || lowerText.includes('address')) {
                const locations = knowledgeData.locations || [];
                if (locations.length > 0) {
                    response = `We're located at:\n${locations.map(l => `• ${l.name}: ${l.address}, ${l.city}, ${l.state} ${l.zip}`).join('\n')}`;
                } else {
                    response = "Please contact us for location information.";
                }
            } else {
                // Fallback - use business summary or generic response
                if (knowledgeData.summary) {
                    response = `${knowledgeData.summary}\n\nIs there something specific you'd like to know?`;
                } else {
                    response = `Thanks for your question! I'm here to help with ${knowledgeData.companyName || "our services"}. Try asking about our services, pricing, hours, or how to book an appointment.`;
                }
            }

            // Simulate typing delay
            await new Promise(resolve => setTimeout(resolve, 500));

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: response,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMsg]);
        } catch (error) {
            console.error('Test chat error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                    <Brain className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-semibold">AI Knowledge Preview</h3>
                    <p className="text-xs text-white/70">What Chippy knows about your business</p>
                </div>
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                {/* Left: Knowledge Summary */}
                <div className="p-6 space-y-5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-3 h-3" /> Knowledge Summary
                    </h4>

                    {/* Business Info */}
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-slate-100 rounded text-slate-500">
                                <Tag className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-medium">Business</p>
                                <p className="text-sm font-semibold text-slate-800">{knowledgeData.companyName || 'Not set'}</p>
                                <p className="text-xs text-slate-500">{knowledgeData.businessCategory || 'No category'}</p>
                            </div>
                        </div>

                        {knowledgeData.phoneNumber && (
                            <div className="flex items-start gap-3">
                                <div className="p-1.5 bg-slate-100 rounded text-slate-500">
                                    <Phone className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-medium">Phone</p>
                                    <p className="text-sm text-slate-700">{knowledgeData.phoneNumber}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Services */}
                    {knowledgeData.services && knowledgeData.services.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-slate-500">
                                <DollarSign className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase">Services ({knowledgeData.services.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {knowledgeData.services.slice(0, 6).map((service, i) => (
                                    <span key={i} className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-full">
                                        {service.name}{service.pricing?.amount ? ` • ${formatServicePrice(service.pricing)}` : ''}
                                    </span>
                                ))}
                                {knowledgeData.services.length > 6 && (
                                    <span className="px-2 py-1 bg-slate-50 text-slate-400 text-xs rounded-full">
                                        +{knowledgeData.services.length - 6} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Hours */}
                    {(knowledgeData.businessHoursByDay || knowledgeData.businessHours) && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Clock className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase">Hours</span>
                            </div>
                            <p className="text-sm text-slate-700">
                                {formatHoursByDay(knowledgeData.businessHoursByDay) || knowledgeData.businessHours}
                            </p>
                        </div>
                    )}

                    {/* Top Rules */}
                    {knowledgeData.topRules && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-slate-500">
                                <ListChecks className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase">Priority Rules</span>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                                <ul className="text-xs text-amber-800 space-y-1">
                                    {knowledgeData.topRules.split('\n').filter(r => r.trim()).slice(0, 3).map((rule, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="font-bold">{i + 1}.</span>
                                            <span>{rule.trim()}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Test Chat */}
                <div className="flex flex-col bg-slate-50/50">
                    <div className="px-4 py-3 border-b border-slate-200 bg-white">
                        <div className="flex items-center gap-2 text-slate-600">
                            <MessageSquare className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase">Test Your AI</span>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 p-4 space-y-3 min-h-[200px] max-h-[300px] overflow-y-auto">
                        {messages.length === 0 && (
                            <div className="text-center py-6">
                                <p className="text-xs text-slate-400">Ask a question to test your AI assistant</p>
                            </div>
                        )}
                        {messages.length > 0 && (
                            messages.map(msg => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user'
                                        ? 'bg-slate-800 text-white'
                                        : 'bg-white border border-slate-200 text-slate-700'
                                        }`}>
                                        <p className="whitespace-pre-wrap">{msg.text}</p>
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-slate-200 bg-white space-y-3">
                        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask a test question..."
                                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400"
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                className="p-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                        {/* Quick Questions - Always visible */}
                        <div className="flex flex-wrap gap-2">
                            {quickQuestions.map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSendMessage(q)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-full hover:bg-slate-200 disabled:opacity-50 transition-colors"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            {showActions && (onEdit || onConfirm) && (
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                        >
                            Edit Knowledge
                        </button>
                    )}
                    {onConfirm && (
                        <button
                            onClick={onConfirm}
                            className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2"
                        >
                            Looks Good! <span className="text-lg">→</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
