import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider, useData } from './contexts/DataContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppLayout } from './components/layout/AppLayout';

// Pages
import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { Leads } from './pages/Leads';
import { WidgetStudio } from './pages/WidgetStudio';
import { Integrations } from './pages/Integrations';
import { ReviewQueue } from './pages/ReviewQueue';
import { Account } from './pages/Account';
import { EmbedPage } from './pages/EmbedPage';
import { BookingPage } from './pages/BookingPage';
import { FreeTrialPage } from './pages/FreeTrialPage';

// Components
import { AuthPage } from './components/AuthPage';
import { ChatWidget } from './components/ChatWidget';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ReviewItem } from './types';
import { capitalizeName } from './utils/stringUtils';

const AppContent = () => {
  const { session, loading } = useAuth();

  // Public Routes - Bypass Auth
  const path = window.location.pathname;

  if (path.startsWith('/embed')) {
    return <EmbedPage />;
  }

  if (path.startsWith('/book')) {
    return <BookingPage />;
  }

  if (path.startsWith('/trial')) {
    return <FreeTrialPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chippy-navy text-white">
        <Loader2 className="w-8 h-8 animate-spin text-chippy-coral" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <DataProvider>
      <AuthenticatedApp />
    </DataProvider>
  );
};

const AuthenticatedApp = () => {
  const {
    tenantConfig,
    setTenantConfig,
    widgetConfig,
    knowledgeData,
    setKnowledgeData,
    setTotalChats,
    setTotalBookings,
    setReviewItems,
    setDashboardData,
    setChatSessions,
    addLead,
    updateLeadStatus,
    leads,
    subscription,
    calendarConnections,
    isLoading
  } = useData();

  const { session } = useAuth();
  const [showWizard, setShowWizard] = useState(false);

  // Use a stable session ID for the current chat
  const chatSessionIdRef = React.useRef<string>(`session_${Date.now()}`);

  // Automatically show wizard for new users once data loading is complete
  React.useEffect(() => {
    if (!isLoading && knowledgeData === null && session?.user?.id) {
      // Loading is complete and user has no knowledge data - show onboarding
      setShowWizard(true);
    }
  }, [isLoading, knowledgeData, session?.user?.id]);

  const handleChatInteraction = (query: string, response: string, analysis: any) => {
    setTotalChats(prev => prev + 1);
    const isBooking = response.toLowerCase().includes('confirmed') || response.toLowerCase().includes('booked');
    if (isBooking) setTotalBookings(prev => prev + 1);

    const newItem: ReviewItem = {
      id: Date.now().toString(),
      query,
      response,
      confidence: analysis?.confidence || 0.5,
      sentiment: analysis?.sentiment || 'neutral',
      topics: analysis?.topics || ['General'],
      status: 'PENDING',
      timestamp: new Date()
    };
    setReviewItems(prev => [newItem, ...prev]);

    setDashboardData(prev => {
      const newData = [...prev];
      if (newData.length > 0) {
        newData[newData.length - 1].chats += 1;
        if (isBooking) newData[newData.length - 1].bookings += 1;
      }
      return newData;
    });
  };

  const handleWizardComplete = (data: any) => {
    setKnowledgeData(data);
    if (data.companyName) setTenantConfig(prev => ({ ...prev, companyName: data.companyName! }));
    setShowWizard(false);
    // Navigate to Widget Studio after onboarding (using timeout to allow state to update)
    setTimeout(() => {
      window.location.href = '/widget';
    }, 100);
  }

  return (
    <BrowserRouter>
      {showWizard && !knowledgeData && session && (
        <OnboardingWizard
          tenantConfig={tenantConfig}
          userId={session.user.id}
          onUpdateConfig={setTenantConfig}
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
        />
      )}

      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/widget" element={<WidgetStudio />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>

      <ChatWidget
        tenantConfig={tenantConfig}
        widgetConfig={widgetConfig}
        knowledgeSummary={knowledgeData ? JSON.stringify(knowledgeData) : ""}
        onInteraction={handleChatInteraction}
        onLeadCapture={(leadData) => {
          addLead({
            name: capitalizeName(leadData.name),
            email: leadData.email,
            phone: leadData.phone,
            status: 'New',
            source: 'AI Chat',
            notes: 'Captured from chat widget'
          });
        }}
        showPoweredBy={subscription.status !== 'active'}
        locations={knowledgeData?.locations || []}
        calendarConnections={calendarConnections}
        onSessionUpdate={(messages) => {
          // Save chat session to Inbox using stable session ID
          const sessionRecord = {
            id: chatSessionIdRef.current,
            customerName: 'Visitor',
            messages: messages,
            summary: `Chat with ${messages.length} messages`,
            type: 'General' as const,
            sentiment: 'neutral' as const,
            timestamp: new Date(),
            status: 'Opened' as const
          };
          setChatSessions(prev => {
            // Update existing session or add new one
            const existingIndex = prev.findIndex(s => s.id === chatSessionIdRef.current);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = sessionRecord;
              return updated;
            }
            return [sessionRecord, ...prev];
          });
        }}
        onBookingComplete={(customerEmail, customerName, customerPhone, service, locationId, locationName) => {
          // Check if lead exists
          const existingLead = leads.find(l => l.email.toLowerCase() === customerEmail.toLowerCase());
          if (!existingLead) {
            // Create new lead with Booked status
            addLead({
              name: capitalizeName(customerName || 'Customer'),
              email: customerEmail,
              phone: customerPhone || '',
              status: 'Booked',
              source: 'AI Chat',
              notes: 'Booked via chat widget',
              service: service,
              locationId: locationId,
              locationName: locationName
            });
          } else {
            // Update existing lead to Booked status
            updateLeadStatus(customerEmail, 'Booked');
          }
        }}
        onCancellation={(customerEmail) => {
          updateLeadStatus(customerEmail, 'Cancelled');
        }}
        onCallbackRequest={(data) => {
          // Check if lead exists by phone or email
          const existingLead = data.customerEmail
            ? leads.find(l => l.email.toLowerCase() === data.customerEmail!.toLowerCase())
            : leads.find(l => l.phone === data.customerPhone);

          if (!existingLead) {
            // Create new lead with Call Back status
            addLead({
              name: capitalizeName(data.customerName),
              email: data.customerEmail || '',
              phone: data.customerPhone,
              status: 'Call Back',
              source: 'AI Chat',
              notes: data.purpose || 'Callback requested via chat',
              service: data.service,
              purpose: data.purpose,
              preferredTime: data.preferredTime,
              requestedCallbackDate: data.requestedDateTime ? new Date(data.requestedDateTime) : undefined
            });
          } else {
            // Update existing lead to Call Back status
            updateLeadStatus(existingLead.email, 'Call Back');
          }
        }}
      />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
