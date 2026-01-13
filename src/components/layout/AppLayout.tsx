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
    Users
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
    const { signOut } = useAuth();
    const { reviewItems } = useData();
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const location = useLocation();

    const navItems = [
        { id: '/', label: 'Dashboard', icon: LayoutDashboard },
        { id: '/inbox', label: 'Inbox', icon: InboxIcon },
        {
            id: '/leads',
            label: 'Leads',
            icon: Users,
            subItems: [
                { id: '/leads?view=appointments', label: 'Appointments' },
                { id: '/leads?view=callbacks', label: 'Call Backs' }
            ]
        },
        { id: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
        { id: '/widget', label: 'Widget Studio', icon: MessageCircle },
        { id: '/integrations', label: 'Integrations', icon: Settings },
        {
            id: '/review',
            label: 'Review Queue',
            icon: AlertCircle,
            badge: reviewItems.filter(i => i.status === 'PENDING').length
        },
        { id: '/account', label: 'Account', icon: UserCircle }
    ];

    return (
        <div className="min-h-screen flex bg-chippy-cream text-chippy-navy font-sans overflow-hidden">

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
                        {navItems.map((item) => {
                            const isActive = location.pathname === item.id || (item.id !== '/' && location.pathname.startsWith(item.id.split('?')[0]));
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
                                    {/* Sub-items - always visible */}
                                    {hasSubItems && (
                                        <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                                            {item.subItems.map(sub => (
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
                        })}
                    </nav>

                    <div className="mt-auto pt-6 border-t border-slate-800/50">
                        <button onClick={signOut} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                            <LogOut className="w-5 h-5" />
                            <span className="text-sm font-medium">Sign Out</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:ml-64 h-full bg-chippy-gray overflow-y-auto p-6 md:p-10 relative">
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
                    {children}
                </div>
            </main>
        </div>
    );
};
