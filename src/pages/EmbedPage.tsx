import React, { useEffect, useState } from 'react';
import { ChatWidget } from '../components/ChatWidget';
import { TenantConfig, WidgetConfig, KnowledgeBaseData } from '../types';

export const EmbedPage = () => {
    const [tenantConfig, setTenantConfig] = useState<TenantConfig>({
        id: 'public-embed',
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

    // Load from LocalStorage (Simulating database fetch for MVP)
    // In production, this would fetch from Supabase by URL subdomain or query param
    useEffect(() => {
        try {
            const storedTenant = localStorage.getItem('tenantConfig');
            if (storedTenant) setTenantConfig(JSON.parse(storedTenant));

            const storedWidget = localStorage.getItem('widgetConfig');
            if (storedWidget) setWidgetConfig(JSON.parse(storedWidget));

            const storedKnowledge = localStorage.getItem('knowledgeData');
            if (storedKnowledge) setKnowledgeData(JSON.parse(storedKnowledge));
        } catch (e) {
            console.error("Failed to load embed config", e);
        }
    }, []);

    // Mock interaction handler since we don't have a backend 
    const handleInteraction = (query: string, response: string, analysis: any) => {
        console.log("Embed Interaction:", query, response);
    };

    return (
        <div className="w-full h-screen bg-transparent">
            {/* We render the widget in 'embed' mode which forces it open or full screen? 
                Actually the ChatWidget is a popup bubble. 
                For an iframe embed, we usually want it to look like the bubble 
                floating in the corner of the IFRAME, which is floating in the corner of the PARENT. 
                
                So rendering ChatWidget as usual is fine.
            */}
            <ChatWidget
                tenantConfig={tenantConfig}
                widgetConfig={widgetConfig}
                knowledgeSummary={knowledgeData ? JSON.stringify(knowledgeData) : ""}
                onInteraction={handleInteraction}
            />
        </div>
    );
};
