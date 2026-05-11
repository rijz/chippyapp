import React, { useEffect, useState } from 'react';
import { User, CreditCard, Lock, Bell, ChevronRight, MapPin, Users, Sparkles } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { PageHeader } from '../components/layout/PageHeader';
import { ProfileSection } from '../components/account/ProfileSection';
import { BillingSection } from '../components/account/BillingSection';
import { SecuritySection } from '../components/account/SecuritySection';
import { NotificationsSection } from '../components/account/NotificationsSection';
import { LocationsSection } from '../components/account/LocationsSection';
import { AdminsSection } from '../components/account/AdminsSection';
import { SkillsSection } from '../components/account/SkillsSection';

type Tab = 'profile' | 'billing' | 'locations' | 'admins' | 'security' | 'notifications' | 'skills';

export const Account = () => {
    const { tenantConfig } = useData();
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const isAdvancedMode = tenantConfig.experienceMode === 'advanced';

    const coreMenuItems = [
        { id: 'profile', label: 'Profile Settings', icon: User },
        { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
        { id: 'security', label: 'Security', icon: Lock }
    ];

    const advancedMenuItems = [
        { id: 'locations', label: 'Locations', icon: MapPin },
        { id: 'admins', label: 'Admin Access', icon: Users },
        { id: 'skills', label: 'Skills', icon: Sparkles },
        { id: 'notifications', label: 'Notifications', icon: Bell },
    ];

    useEffect(() => {
        if (!['profile', 'billing', 'security'].includes(activeTab)) {
            setActiveTab('profile');
        }
    }, [isAdvancedMode, activeTab]);

    return (
        <div className="w-full pb-20 animate-in fade-in duration-500">
            <PageHeader
                title="Account Settings"
                subtitle={isAdvancedMode
                    ? "Manage profile, billing, and access controls."
                    : "Manage your essential account settings."
                }
            />

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar */}
                <div className="w-full md:w-64 shrink-0 space-y-8">
                    <div className="bg-white border border-slate-200 rounded-xl p-2">
                        <nav className="space-y-1">
                            {coreMenuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id as Tab)}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive
                                            ? 'bg-slate-900 text-white'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                                            {item.label}
                                        </div>
                                        {isActive && <ChevronRight className="w-4 h-4 text-slate-300" />}
                                    </button>
                                );
                            })}

                            {isAdvancedMode && (
                                <>
                                    <div className="my-2 border-t border-slate-100" />
                                    {advancedMenuItems.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = activeTab === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => setActiveTab(item.id as Tab)}
                                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive
                                                    ? 'bg-slate-900 text-white'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                                                    {item.label}
                                                </div>
                                                {isActive && <ChevronRight className="w-4 h-4 text-slate-300" />}
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </nav>

                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-10 relative overflow-hidden">
                        {/* Tab Content */}
                        {activeTab === 'profile' && <ProfileSection />}
                        {activeTab === 'billing' && <BillingSection />}
                        {activeTab === 'locations' && <LocationsSection />}
                        {activeTab === 'admins' && <AdminsSection />}
                        {activeTab === 'skills' && <SkillsSection />}
                        {activeTab === 'security' && <SecuritySection />}
                        {activeTab === 'notifications' && <NotificationsSection />}
                    </div>
                </div>
            </div>
        </div>
    );
};
