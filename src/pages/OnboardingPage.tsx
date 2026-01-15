import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Dedicated Onboarding Page
 * This provides a full-page onboarding experience for new users.
 * Redirects to Widget Studio when complete.
 */
export const OnboardingPage: React.FC = () => {
    const {
        tenantConfig,
        setTenantConfig,
        knowledgeData,
        setKnowledgeData,
        isLoading
    } = useData();
    const { session } = useAuth();
    const navigate = useNavigate();

    // If user already has knowledge data, redirect them
    React.useEffect(() => {
        if (!isLoading && knowledgeData !== null) {
            navigate('/widget', { replace: true });
        }
    }, [isLoading, knowledgeData, navigate]);

    const handleComplete = (data: any) => {
        setKnowledgeData(data);
        if (data.companyName) {
            setTenantConfig(prev => ({ ...prev, companyName: data.companyName! }));
        }
        // Navigate to Widget Studio
        navigate('/widget', { replace: true });
    };

    const handleCancel = () => {
        // If they cancel, go to dashboard
        navigate('/', { replace: true });
    };

    // Show loader while checking if user needs onboarding
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-chippy-navy via-slate-900 to-chippy-navy flex flex-col items-center justify-center">
                <div className="text-center animate-in fade-in duration-500">
                    <div className="w-16 h-16 bg-gradient-to-br from-chippy-coral to-orange-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-chippy-coral/20">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">Setting up Chippy</h1>
                    <p className="text-slate-400 mb-8">Just a moment...</p>
                    <Loader2 className="w-6 h-6 animate-spin text-chippy-coral mx-auto" />
                </div>
            </div>
        );
    }

    // If no session, shouldn't be here
    if (!session) {
        return null;
    }

    return (
        <OnboardingWizard
            tenantConfig={tenantConfig}
            userId={session.user.id}
            onUpdateConfig={setTenantConfig}
            onComplete={handleComplete}
            onCancel={handleCancel}
        />
    );
};
