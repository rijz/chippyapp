import React, { useEffect, useState, useRef } from 'react';
import { ChatWidget } from '../components/ChatWidget';
import { TenantConfig, WidgetConfig, KnowledgeBaseData, CalendarConnection, Message } from '../types';
import { Loader2 } from 'lucide-react';
import { CallbackRequestData } from '../services/calendarTools';

// Helper to capitalize names
const capitalizeName = (name: string): string => {
    if (!name) return name;
    return name.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
};

export const EmbedPage = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [tenantConfig, setTenantConfig] = useState<TenantConfig>({
        id: 'public-embed',
        userId: '', // Will be set from URL params
        industry: 'General',
        companyName: 'Support Agent',
        companyUrl: '',
        isConnected: false,
        bookingPlatform: null
    });

    const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({
        title: 'Support Agent',
        subtitle: 'Powered by Chippy',
        color: '#FF6B5E',
        welcomeMessage: 'Hi! How can I help you today?',
        position: 'right',
        leadCaptureMode: 'ai-driven',
        contactFields: {
            name: 'required',
            email: 'required',
            phone: 'optional'
        },
        followUp: {
            enabled: true,
            delayMinutes: 0,
            sendToCustomer: true,
            sendToOwner: false,
            customerSubject: 'Thanks for chatting with {{company_name}}',
            customerBody:
                "Hi {{customer_name}},\n\n" +
                "Here’s a quick recap of your chat:\n" +
                "{{summary}}\n\n" +
                "{{next_action}}\n\n" +
                "You can also visit {{company_url}} or reply to this email with any questions.\n\n" +
                "- {{company_name}}",
            ownerSubject: 'Follow-up needed: {{customer_name}}',
            ownerBody:
                "Customer: {{customer_name}} ({{customer_email}})\n" +
                "Priority: {{priority}}\n" +
                "Intent: {{intent}}\n\n" +
                "Summary:\n" +
                "{{summary}}\n\n" +
                "Next action:\n" +
                "{{next_action}}",
            replyToEmail: ''
        }
    });

    const [knowledgeData, setKnowledgeData] = useState<KnowledgeBaseData | null>(null);
    const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([]);

    // Stable session ID for this embed instance
    const sessionIdRef = useRef<string>(`embed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    // Track customer name when captured (updates to actual name when lead is captured)
    const customerNameRef = useRef<string>('Visitor');
    const customerEmailRef = useRef<string>('');
    const customerPhoneRef = useRef<string>('');

    // Set transparent background for embed mode
    useEffect(() => {
        document.body.classList.add('embed-mode');
        return () => {
            document.body.classList.remove('embed-mode');
        };
    }, []);

    // Load config from backend API using userId from URL params
    useEffect(() => {
        const loadConfig = async () => {
            try {
                // Get userId from URL params (e.g., /embed?u=user-123)
                const params = new URLSearchParams(window.location.search);
                const userId = params.get('u');

                if (!userId) {
                    // Fallback to localStorage for backwards compatibility
                    try {
                        const storedTenant = localStorage.getItem('tenantConfig');
                        if (storedTenant) setTenantConfig(JSON.parse(storedTenant));

                        const storedWidget = localStorage.getItem('widgetConfig');
                        if (storedWidget) setWidgetConfig(JSON.parse(storedWidget));

                        const storedKnowledge = localStorage.getItem('knowledgeData');
                        if (storedKnowledge) setKnowledgeData(JSON.parse(storedKnowledge));
                    } catch (e) {
                        console.error("Failed to load from localStorage", e);
                    }
                    setIsLoading(false);
                    return;
                }

                // Fetch from backend API (bypasses RLS)
                const response = await fetch(`/api/widget-config/${userId}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        setError('Widget not found. Please check your embed code.');
                    } else {
                        setError('Failed to load widget configuration.');
                    }
                    setIsLoading(false);
                    return;
                }

                const data = await response.json();

                if (data.tenantConfig) setTenantConfig(data.tenantConfig);
                if (data.widgetConfig) {
                    setWidgetConfig(prev => ({
                        ...prev,
                        ...data.widgetConfig,
                        contactFields: {
                            ...prev.contactFields,
                            ...(data.widgetConfig.contactFields || {})
                        },
                        followUp: {
                            ...prev.followUp,
                            ...(data.widgetConfig.followUp || {})
                        }
                    }));
                }
                if (data.knowledgeData) setKnowledgeData(data.knowledgeData);
                if (data.calendarConnections) setCalendarConnections(data.calendarConnections);

                setIsLoading(false);
            } catch (e) {
                console.error('[EmbedPage] Error loading config:', e);
                setError('Failed to load widget configuration.');
                setIsLoading(false);
            }
        };

        loadConfig();
    }, []);

    // Interaction handler - saves to analytics and review queue
    const handleInteraction = async (query: string, response: string, analysis: any) => {
        if (!tenantConfig.userId) return;

        try {
            await fetch('/api/widget/interaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    query,
                    response,
                    analysis,
                    sessionId: sessionIdRef.current
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to save interaction:', e);
        }
    };

    const handleFeedback = async (data: { rating: number; sentiment?: 'positive' | 'neutral' | 'negative'; comment?: string }) => {
        if (!tenantConfig.userId) return;

        try {
            await fetch('/api/widget/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    sessionId: sessionIdRef.current,
                    rating: data.rating,
                    sentiment: data.sentiment,
                    comment: data.comment
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to save feedback:', e);
        }
    };

    // Lead capture handler
    const handleLeadCapture = async (leadData: { name: string; email: string; phone: string }) => {
        if (!tenantConfig.userId) return;

        // Store customer name for session tracking
        if (leadData.name) {
            customerNameRef.current = capitalizeName(leadData.name);
        }
        if (leadData.email) {
            customerEmailRef.current = leadData.email;
        }
        if (leadData.phone) {
            customerPhoneRef.current = leadData.phone;
        }

        try {
            await fetch('/api/widget/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    lead: {
                        name: capitalizeName(leadData.name),
                        email: leadData.email,
                        phone: leadData.phone,
                        status: 'New',
                        source: 'AI Chat',
                        notes: 'Captured from embed widget'
                    }
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to save lead:', e);
        }
    };

    // Session update handler
    const handleSessionUpdate = async (messages: Message[]) => {
        if (!tenantConfig.userId) return;

        try {
            await fetch('/api/widget/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    session: {
                        id: sessionIdRef.current,
                        customerName: customerNameRef.current,
                        customerEmail: customerEmailRef.current,
                        customerPhone: customerPhoneRef.current,
                        messages: messages,
                        summary: `Chat with ${messages.length} messages`,
                        type: 'General',
                        sentiment: 'neutral',
                        timestamp: new Date().toISOString(),
                        status: 'Opened'
                    }
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to save session:', e);
        }
    };

    // Booking complete handler
    const handleBookingComplete = async (
        customerEmail: string,
        customerName?: string,
        customerPhone?: string,
        service?: string,
        locationId?: string,
        locationName?: string
    ) => {
        if (!tenantConfig.userId) return;

        // Store customer name for session tracking
        if (customerName) {
            customerNameRef.current = capitalizeName(customerName);
        }
        if (customerEmail) {
            customerEmailRef.current = customerEmail;
        }
        if (customerPhone) {
            customerPhoneRef.current = customerPhone;
        }

        try {
            await fetch('/api/widget/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    lead: {
                        name: capitalizeName(customerName || 'Customer'),
                        email: customerEmail,
                        phone: customerPhone || '',
                        status: 'Booked',
                        source: 'AI Chat',
                        notes: `Booked via embed widget`,
                        locationId: locationId,
                        locationName: locationName,
                        service: service
                    }
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to save booking lead:', e);
        }
    };

    // Cancellation handler
    const handleCancellation = async (customerEmail: string) => {
        if (!tenantConfig.userId) return;

        try {
            await fetch('/api/widget/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    lead: {
                        email: customerEmail,
                        name: '',
                        status: 'Cancelled',
                        notes: 'Cancelled via embed widget'
                    }
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to update cancelled lead:', e);
        }
    };

    // Callback request handler
    const handleCallbackRequest = async (data: CallbackRequestData) => {
        if (!tenantConfig.userId) return;

        // Store customer name for session tracking
        if (data.customerName) {
            customerNameRef.current = capitalizeName(data.customerName);
        }
        if (data.customerEmail) {
            customerEmailRef.current = data.customerEmail;
        }
        if (data.customerPhone) {
            customerPhoneRef.current = data.customerPhone;
        }

        try {
            await fetch('/api/widget/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tenantConfig.userId,
                    lead: {
                        name: capitalizeName(data.customerName),
                        email: data.customerEmail || '',
                        phone: data.customerPhone,
                        status: 'Call Back',
                        source: 'AI Chat',
                        notes: `Callback requested${data.service ? ` for ${data.service}` : ''}${data.preferredTime ? ` - Preferred: ${data.preferredTime}` : ''}`
                    }
                })
            });
        } catch (e) {
            console.error('[EmbedPage] Failed to save callback lead:', e);
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="w-full h-screen bg-transparent flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="w-full h-screen bg-transparent flex items-center justify-center">
                <p className="text-red-500 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="w-full h-screen bg-transparent">
            <ChatWidget
                tenantConfig={tenantConfig}
                widgetConfig={widgetConfig}
                knowledgeSummary={knowledgeData ? JSON.stringify(knowledgeData) : ""}
                onInteraction={handleInteraction}
                onFeedback={handleFeedback}
                onLeadCapture={handleLeadCapture}
                onSessionUpdate={handleSessionUpdate}
                onBookingComplete={handleBookingComplete}
                onCancellation={handleCancellation}
                onCallbackRequest={handleCallbackRequest}
                showPoweredBy={true}
                locations={knowledgeData?.locations || []}
                calendarConnections={calendarConnections}
            />
        </div>
    );
};
