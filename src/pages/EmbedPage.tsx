import React, { useEffect, useState } from 'react';
import { ChatWidget } from '../components/ChatWidget';
import { TenantConfig, WidgetConfig, KnowledgeBaseData } from '../types';
import { Loader2 } from 'lucide-react';

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
        }
    });

    const [knowledgeData, setKnowledgeData] = useState<KnowledgeBaseData | null>(null);

    // Load config from backend API using userId from URL params
    useEffect(() => {
        const loadConfig = async () => {
            try {
                // Get userId from URL params (e.g., /embed?u=user-123)
                const params = new URLSearchParams(window.location.search);
                const userId = params.get('u');

                if (!userId) {
                    // Fallback to localStorage for backwards compatibility
                    console.log('[EmbedPage] No userId in URL, falling back to localStorage');
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

                console.log('[EmbedPage] Loading config for userId:', userId);

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
                if (data.widgetConfig) setWidgetConfig(data.widgetConfig);
                if (data.knowledgeData) setKnowledgeData(data.knowledgeData);

                setIsLoading(false);
            } catch (e) {
                console.error('[EmbedPage] Error loading config:', e);
                setError('Failed to load widget configuration.');
                setIsLoading(false);
            }
        };

        loadConfig();
    }, []);

    // Mock interaction handler
    const handleInteraction = (query: string, response: string, analysis: any) => {
        console.log("Embed Interaction:", query, response);
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
                showPoweredBy={true}
            />
        </div>
    );
};

