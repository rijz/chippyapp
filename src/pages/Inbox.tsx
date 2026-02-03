import React, { useState } from 'react';
import { Filter, Search, MessageCircle, ArrowLeft, Archive, CheckCircle2, Inbox as InboxIcon, User, Clock, Tag } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { ChatSessionRecord } from '../types';
import { StatusBadge } from '../components/ui/StatusBadge';
import { syncChatSessions } from '../services/supabaseStorage';
import clsx from 'clsx';

export const Inbox = () => {
    const { chatSessions, setChatSessions, leads } = useData();
    const { session } = useAuth();
    const [selectedSession, setSelectedSession] = useState<ChatSessionRecord | null>(null);
    const [statusFilter, setStatusFilter] = useState<'All' | 'Opened' | 'Closed'>('All');
    const [searchTerm, setSearchTerm] = useState('');

    const updateSessionStatus = async (id: string, status: ChatSessionRecord['status']) => {
        const updatedSessions = chatSessions.map(s => s.id === id ? { ...s, status } : s);
        setChatSessions(updatedSessions);
        if (selectedSession?.id === id) setSelectedSession({ ...selectedSession, status });
        if (session?.user?.id) {
            await syncChatSessions(updatedSessions, session.user.id);
        }
    };

    const filteredSessions = chatSessions.filter(s => {
        const matchesStatus = statusFilter === 'All' ? true :
            statusFilter === 'Opened' ? s.status === 'Opened' :
                s.status === 'Closed' || s.status === 'Archived' || s.status === 'Reviewed';
        const matchesSearch = s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.summary.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hotLeads = leads.filter(l => l.priority === 'Hot').length;
    const needsReply = chatSessions.filter(s => s.status === 'Opened').length;
    const newChats = chatSessions.filter(s => new Date(s.timestamp) >= last24h).length;

    return (
        <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden pb-6">
            <header className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-chippy-navy tracking-tight">Today</h2>
                    <p className="text-slate-500">Focus on the items that need a response.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Hot Leads</p>
                    <p className="text-2xl font-bold text-chippy-navy mt-1">{hotLeads}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Needs Reply</p>
                    <p className="text-2xl font-bold text-chippy-navy mt-1">{needsReply}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">New Chats (24h)</p>
                    <p className="text-2xl font-bold text-chippy-navy mt-1">{newChats}</p>
                </div>
            </div>

            <div className="flex-1 rounded-2xl bg-white border border-slate-200 overflow-hidden flex min-h-0">
                {/* Sidebar */}
                <div className={clsx(
                    "w-full md:w-[360px] border-r border-slate-200 flex flex-col min-h-0 bg-white",
                    selectedSession ? 'hidden md:flex' : 'flex'
                )}>
                    {/* Search & Tabs */}
                    <div className="p-4 space-y-4 bg-white border-b border-slate-200">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search conversations..."
                                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {(['All', 'Opened', 'Closed'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setStatusFilter(tab)}
                                    className={clsx(
                                        "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                                        statusFilter === tab ? "bg-white text-chippy-navy shadow-sm" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Session List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {filteredSessions.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 flex flex-col items-center">
                                <p className="text-sm font-bold">All clear.</p>
                                <p className="text-xs">No follow-ups due right now.</p>
                            </div>
                        ) : (
                            filteredSessions.map((s) => (
                                <div key={s.id} onClick={() => setSelectedSession(s)} className={clsx(
                                    "p-4 cursor-pointer transition-all rounded-xl border",
                                    selectedSession?.id === s.id
                                        ? 'bg-white border-chippy-coral'
                                        : 'bg-white border-transparent hover:border-slate-200'
                                )}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={clsx(
                                                "w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0",
                                                selectedSession?.id === s.id ? "bg-chippy-coral text-white" : "bg-slate-100 text-slate-500"
                                            )}>
                                                {s.customerName.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-chippy-navy truncate text-sm">{s.customerName}</h4>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {new Date(s.timestamp).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusBadge status={s.status} />
                                    </div>
                                    <div className="pl-[3.25rem]">
                                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                            {s.summary}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Tag className="w-3 h-3 text-slate-300" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.type}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div className={clsx(
                    "flex-1 flex flex-col min-h-0 bg-white",
                    selectedSession ? 'flex' : 'hidden md:flex items-center justify-center'
                )}>
                    {selectedSession ? (
                        <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                            {/* Chat Header */}
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white z-10">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setSelectedSession(null)} className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div>
                                        <h3 className="font-bold text-xl text-chippy-navy flex items-center gap-2">
                                            {selectedSession.customerName}
                                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-wider">{selectedSession.type}</span>
                                        </h3>
                                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                            Started {new Date(selectedSession.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateSessionStatus(selectedSession.id, 'Reviewed')}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors text-xs font-bold"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Mark Reviewed
                                    </button>
                                    <button
                                        onClick={() => updateSessionStatus(selectedSession.id, 'Archived')}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors text-xs font-bold"
                                    >
                                        <Archive className="w-4 h-4" /> Archive
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-white">
                                <div className="max-w-3xl mx-auto space-y-8">
                                    {/* Summary Card */}
                                    <div className="flex justify-center">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-lg text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Conversation Analysis</p>
                                            <p className="text-sm text-slate-600 italic">"{selectedSession.summary}"</p>
                                        </div>
                                    </div>

                                    {(() => {
                                        // Safely get messages array - handles string, array, null, undefined
                                        let msgs = selectedSession.messages;
                                        if (!msgs) return null;
                                        if (typeof msgs === 'string') {
                                            try { msgs = JSON.parse(msgs); } catch { msgs = []; }
                                        }
                                        if (!Array.isArray(msgs)) return null;

                                        return msgs.map((m: any, i: number) => (
                                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                                <div className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'} max-w-[80%]`}>
                                                    <div className="flex items-center gap-2 mb-1 px-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                                                            {m.role === 'user' ? selectedSession.customerName : 'Agent X'}
                                                        </span>
                                                        <span className="text-[10px] text-slate-300">
                                                            {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                    <div className={clsx(
                                                        "p-4 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap",
                                                        m.role === 'user'
                                                            ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                                                            : 'bg-chippy-navy text-white rounded-tr-none shadow-md'
                                                    )}>
                                                        {m.text || ''}
                                                    </div>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center p-12 max-w-sm opacity-50">
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <MessageCircle className="w-10 h-10 text-slate-400" />
                            </div>
                            <h4 className="text-xl font-bold text-chippy-navy mb-2">Select a Conversation</h4>
                            <p className="text-slate-400 text-sm">Choose a lead from the sidebar to view the full transcript, summary, and action items.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
