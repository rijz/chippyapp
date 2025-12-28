import React, { useState } from 'react';
import { User, CreditCard, Lock, Bell, LogOut, ChevronRight, MapPin, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ProfileSection } from '../components/account/ProfileSection';
import { BillingSection } from '../components/account/BillingSection';
import { SecuritySection } from '../components/account/SecuritySection';
import { NotificationsSection } from '../components/account/NotificationsSection';
import { LocationsSection } from '../components/account/LocationsSection';
import { AdminsSection } from '../components/account/AdminsSection';

type Tab = 'profile' | 'billing' | 'locations' | 'admins' | 'security' | 'notifications';

export const Account = () => {
    const { signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('profile');

    const menuItems = [
        { id: 'profile', label: 'Profile Settings', icon: User },
        { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
        { id: 'locations', label: 'Locations', icon: MapPin },
        { id: 'admins', label: 'Admin Access', icon: Users },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'notifications', label: 'Notifications', icon: Bell },
    ];

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in duration-500">
            <h1 className="text-3xl font-bold text-chippy-navy mb-8">Account Settings</h1>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar */}
                <div className="w-full md:w-64 shrink-0 space-y-8">
                    <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
                        <nav className="space-y-1">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id as Tab)}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${isActive
                                            ? 'bg-chippy-navy text-white shadow-md'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-chippy-navy'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-chippy-coral' : 'text-slate-400'}`} />
                                            {item.label}
                                        </div>
                                        {isActive && <ChevronRight className="w-4 h-4 text-slate-500" />}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 md:p-10 shadow-sm relative overflow-hidden">
                        {/* Tab Content */}
                        {activeTab === 'profile' && <ProfileSection />}
                        {activeTab === 'billing' && <BillingSection />}
                        {activeTab === 'locations' && <LocationsSection />}
                        {activeTab === 'admins' && <AdminsSection />}
                        {activeTab === 'security' && <SecuritySection />}
                        {activeTab === 'notifications' && <NotificationsSection />}
                    </div>
                </div>
            </div>
        </div>
    );
};
