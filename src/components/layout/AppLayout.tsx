import React, { useState } from 'react';
import {
    LayoutDashboard,
    Settings,
    BookOpen,
    AlertCircle,
    BrainCircuit,
    MessageCircle,
    Inbox as InboxIcon,
    UserCircle,
    Menu,
    LogOut,
    Users,
    Activity,
    ChevronDown,
    Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
    const { signOut } = useAuth();
    const { reviewItems, tenantConfig, setTenantConfig } = useData();
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const location = useLocation();

    const isAdvancedMode = tenantConfig.experienceMode === 'advanced';

    const simpleNavItems = [
        { id: '/home', label: 'Home', icon: LayoutDashboard },
        { id: '/command', label: 'Command', icon: Sparkles },
        {
            id: '/customers',
            label: 'Customers',
            icon: Users,
            subItems: [
                { id: '/customers?view=appointments', label: 'Appointments' },
                { id: '/customers?view=callbacks', label: 'Callbacks' }
            ]
        },
        { id: '/setup', label: 'Setup', icon: Settings },
        { id: '/account', label: 'Account', icon: UserCircle }
    ];

    const advancedNavItems = [
        { id: '/inbox', label: 'Inbox', icon: InboxIcon },
        { id: '/dashboard', label: 'Analytics', icon: LayoutDashboard },
        { id: '/knowledge', label: 'Knowledge', icon: BookOpen },
        {
            id: '/widget',
            label: 'On-Site Assistant',
            icon: MessageCircle,
            subItems: [
                { id: '/widget?tab=appearance', label: 'Appearance' },
                { id: '/widget?tab=behavior', label: 'Behavior' },
                { id: '/widget?tab=notifications', label: 'Notifications' },
                { id: '/widget?tab=install', label: 'Install' }
            ]
        },
        { id: '/integrations', label: 'Integrations', icon: Settings },
        { id: '/agents', label: 'Agent Console', icon: BrainCircuit },
        { id: '/gateway', label: 'Gateway Control', icon: Activity },
        {
            id: '/review',
            label: 'Quality Check',
            icon: AlertCircle,
            badge: reviewItems.filter(i => i.status === 'PENDING').length
        }
    ];

    const isItemActive = (id: string) => {
        if (id === '/customers') {
            return location.pathname.startsWith('/customers') || location.pathname.startsWith('/leads');
        }
        if (id === '/home') {
            return location.pathname.startsWith('/home') || location.pathname.startsWith('/dashboard');
        }
        return location.pathname === id || (id !== '/' && location.pathname.startsWith(id.split('?')[0]));
    };

    const advancedRouteActive = advancedNavItems
        .filter(item => item.id !== '/dashboard')
        .some(item => isItemActive(item.id));
    const showAdvancedRouteNotice = !isAdvancedMode && advancedRouteActive;

    const renderNavItem = (item: any) => {
        const isActive = isItemActive(item.id);
        const hasSubItems = 'subItems' in item && item.subItems;
        return (
            <div key={item.id}>
                <Link
                    to={item.id.split('?')[0]}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={clsx(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        isActive ? 'bg-chippy-coral/10 text-chippy-coral' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                >
                    <div className="flex items-center gap-3">
                        <item.icon className="w-5 h-5" />
                        {item.label}
                    </div>
                    {'badge' in item && item.badge ? <span className="bg-chippy-coral text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{item.badge}</span> : null}
                </Link>
                {hasSubItems && (
                    <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                        {item.subItems.map((sub: any) => (
                            <Link
                                key={sub.id}
                                to={sub.id}
                                onClick={() => setMobileSidebarOpen(false)}
                                className={clsx(
                                    "block px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                    location.search.includes(sub.id.split('?')[1] || '')
                                        ? 'text-chippy-coral bg-chippy-coral/5'
                                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                                )}
                            >
                                {sub.label}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen flex bg-white text-chippy-navy font-sans overflow-hidden">

            {/* Mobile Overlay */}
            {mobileSidebarOpen && (
                <div
                    className="fixed inset-0 bg-chippy-navy/50 backdrop-blur-sm z-20 md:hidden"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                "w-64 bg-chippy-navy text-white flex flex-col fixed inset-y-0 left-0 z-30 border-r border-chippy-navy-light transform transition-transform duration-300 md:translate-x-0",
                mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            )}>
                <div className="flex flex-col h-full p-8">
                    <div className="flex items-center gap-3 mb-10">
                        <img src="/logo.png" alt="Chippy" className="w-10 h-10 rounded-lg shadow-lg shadow-chippy-coral/20" />
                        <span className="text-xl font-bold tracking-tight text-white">Chippy</span>
                    </div>

                    <nav className="flex-1 space-y-1">
                        {simpleNavItems.map(renderNavItem)}

                        <div className="pt-4 mt-2 border-t border-slate-800/60">
                            <button
                                onClick={() => setAdvancedOpen(prev => !prev)}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                            >
                                <span>Advanced</span>
                                <ChevronDown className={clsx("w-4 h-4 transition-transform", (advancedOpen || isAdvancedMode || advancedRouteActive) && "rotate-180")} />
                            </button>
                            {(advancedOpen || isAdvancedMode || advancedRouteActive) && (
                                <div className="mt-2 space-y-1">
                                    {advancedNavItems.map(renderNavItem)}
                                </div>
                            )}
                        </div>
                    </nav>

                    <div className="mt-auto pt-6 border-t border-slate-800/50 space-y-2">
                        <button
                            onClick={() =>
                                setTenantConfig(prev => ({
                                    ...prev,
                                    experienceMode: prev.experienceMode === 'advanced' ? 'simple' : 'advanced'
                                }))
                            }
                            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                        >
                            <span className="text-xs font-semibold uppercase tracking-wider">
                                {isAdvancedMode ? 'Advanced Mode' : 'Simple Mode'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                                {isAdvancedMode ? 'Switch to simple' : 'Switch to advanced'}
                            </span>
                        </button>
                        <button onClick={signOut} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                            <LogOut className="w-5 h-5" />
                            <span className="text-sm font-medium">Sign Out</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:ml-64 h-full bg-slate-50 overflow-y-auto px-6 md:px-10 py-8 md:py-10 relative">
                <header className="flex justify-between items-center mb-8 md:hidden shrink-0">
                    <div className="flex items-center gap-2 text-white">
                        <img src="/logo.png" alt="Chippy" className="w-8 h-8 rounded-lg" />
                        <span className="font-bold text-lg text-chippy-navy">Chippy</span>
                    </div>
                    <button onClick={() => setMobileSidebarOpen(true)} className="p-2 bg-chippy-navy rounded-lg text-white">
                        <Menu className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1">
                    <div className="w-full max-w-6xl mx-auto">
                        {showAdvancedRouteNotice && (
                            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                <p className="text-xs text-amber-800">
                                    You are viewing an advanced page while in Simple mode.
                                </p>
                                <button
                                    onClick={() =>
                                        setTenantConfig(prev => ({
                                            ...prev,
                                            experienceMode: 'advanced'
                                        }))
                                    }
                                    className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                                >
                                    Switch to Advanced
                                </button>
                            </div>
                        )}
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};
