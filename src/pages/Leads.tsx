import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Download, Calendar, Mail, Phone, MoreHorizontal, Pencil, X, Save, Check, PhoneIncoming, LayoutList, AlertTriangle } from 'lucide-react';
import { checkAvailability } from '../services/calendarAuth';
import { useData } from '../contexts/DataContext';
import { Lead } from '../types';

export const Leads = () => {
    const { leads, setLeads } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentView, setCurrentView] = useState<'All' | 'Appointments' | 'CallBacks'>('All');
    const [editingLead, setEditingLead] = useState<Lead | null>(null);
    const [conflict, setConflict] = useState<boolean>(false);

    // Check availability when date changes
    useEffect(() => {
        const check = async () => {
            if (editingLead && editingLead.status !== 'Cancelled' && editingLead.date) {
                const start = new Date(editingLead.date);
                const end = new Date(start.getTime() + 30 * 60000); // 30 min duration
                const result = await checkAvailability(start, end);
                // If mocking or real check fails
                setConflict(!result.available);
            } else {
                setConflict(false);
            }
        };
        const timer = setTimeout(check, 500); // Debounce
        return () => clearTimeout(timer);
    }, [editingLead?.date, editingLead?.status]);

    const filteredLeads = leads.filter(lead => {
        const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || lead.email.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesView = true;
        if (currentView === 'Appointments') matchesView = lead.status === 'Booked';
        if (currentView === 'CallBacks') matchesView = lead.status === 'Call Back';

        return matchesSearch && matchesView;
    });

    const handleSaveLead = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLead) return;

        setLeads(prev => prev.map(l => l.id === editingLead.id ? editingLead : l));
        setEditingLead(null);
    };

    const exportToCSV = () => {
        const headers = ['Name', 'Email', 'Phone', 'Status', 'Source', 'Date', 'Notes'];
        const csvContent = [
            headers.join(','),
            ...leads.map(lead => [
                `"${lead.name}"`,
                `"${lead.email}"`,
                `"${lead.phone || ''}"`,
                `"${lead.status}"`,
                `"${lead.source}"`,
                `"${new Date(lead.date).toLocaleDateString()}"`,
                `"${(lead.notes || '').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-chippy-navy tracking-tight">Leads & Appointments</h1>
                    <p className="text-slate-500">Manage your potential clients and upcoming bookings.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={exportToCSV}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>
            </div>

            {/* View Tabs */}
            <div className="grid grid-cols-3 gap-2 bg-slate-100/50 p-2 rounded-2xl md:w-fit">
                <button
                    onClick={() => setCurrentView('All')}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                        ${currentView === 'All' ? 'bg-white text-chippy-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                    `}
                >
                    <LayoutList className="w-4 h-4" /> All Leads
                </button>
                <button
                    onClick={() => setCurrentView('Appointments')}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                        ${currentView === 'Appointments' ? 'bg-white text-chippy-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                    `}
                >
                    <Calendar className="w-4 h-4" /> Appointments
                </button>
                <button
                    onClick={() => setCurrentView('CallBacks')}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                        ${currentView === 'CallBacks' ? 'bg-white text-chippy-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                    `}
                >
                    <PhoneIncoming className="w-4 h-4" /> Call Backs
                </button>
            </div>

            {/* Canvas/Table Area */}
            <div className="space-y-4">
                {/* Search Header for Table */}
                <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            className="w-full pl-10 pr-4 py-2 bg-white/50 border border-slate-200/50 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                    <th className="p-6">Name</th>
                                    <th className="p-6">Contact</th>
                                    <th className="p-6">Status</th>
                                    <th className="p-6">Source</th>
                                    <th className="p-6">Date</th>
                                    <th className="p-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLeads.map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-lg">
                                                    {lead.name[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-chippy-navy">{lead.name}</div>
                                                    <div className="text-xs text-slate-400 max-w-[150px] truncate">{lead.notes}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Mail className="w-3 h-3 text-slate-400" /> {lead.email}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Phone className="w-3 h-3 text-slate-400" /> {lead.phone}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5
                                                ${lead.status === 'Booked' ? 'bg-emerald-100 text-emerald-700' :
                                                    lead.status === 'Call Back' ? 'bg-amber-100 text-amber-700' :
                                                        lead.status === 'New' ? 'bg-blue-100 text-blue-700' :
                                                            lead.status === 'Cancelled' ? 'bg-slate-100 text-slate-500 line-through' :
                                                                'bg-slate-100 text-slate-600'}
                                            `}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${lead.status === 'Booked' ? 'bg-emerald-500' : lead.status === 'Call Back' ? 'bg-amber-500' : lead.status === 'New' ? 'bg-blue-500' : lead.status === 'Cancelled' ? 'bg-slate-400' : 'bg-slate-400'}`}></div>
                                                {lead.status}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <span className="text-sm font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                                                {lead.source}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                {new Date(lead.date).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button
                                                onClick={() => setEditingLead(lead)}
                                                className="p-2 text-slate-400 hover:text-chippy-coral hover:bg-chippy-coral/10 rounded-lg transition-all group-hover:opacity-100 md:opacity-0 opacity-100"
                                                title="Edit Lead"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredLeads.length === 0 && (
                        <div className="p-12 text-center text-slate-500">
                            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <p>No leads found for this view.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editingLead && (
                <div className="fixed inset-0 bg-chippy-navy/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-chippy-navy">Edit Lead</h3>
                                <p className="text-xs text-slate-400">ID: {editingLead.id}</p>
                            </div>
                            <button onClick={() => setEditingLead(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveLead} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingLead.name}
                                        onChange={e => setEditingLead({ ...editingLead, name: e.target.value })}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                                    <select
                                        value={editingLead.status}
                                        onChange={e => setEditingLead({ ...editingLead, status: e.target.value as any })}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral appearance-none"
                                    >
                                        <option value="New">New</option>
                                        <option value="Contacted">Contacted</option>
                                        <option value="Call Back">Call Back</option>
                                        <option value="Booked">Booked</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={editingLead.email}
                                        onChange={e => setEditingLead({ ...editingLead, email: e.target.value })}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={editingLead.phone}
                                        onChange={e => setEditingLead({ ...editingLead, phone: e.target.value })}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Appointment Date</label>
                                <input
                                    type="datetime-local"
                                    value={new Date(editingLead.date.getTime() - (editingLead.date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)}
                                    onChange={e => setEditingLead({ ...editingLead, date: new Date(e.target.value) })}
                                    className={`w-full p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 transition-all ${conflict ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-slate-200 focus:ring-chippy-coral'}`}
                                />
                                {conflict && (
                                    <div className="flex items-center gap-2 mt-2 text-amber-600 text-xs font-bold animate-pulse">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>Conflict detected in calendar!</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
                                <textarea
                                    value={editingLead.notes}
                                    onChange={e => setEditingLead({ ...editingLead, notes: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral resize-none h-24"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setEditingLead(null)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 py-3 bg-chippy-coral text-white font-bold rounded-xl shadow-lg shadow-chippy-coral/20 hover:bg-chippy-coral-hover transition-all flex items-center justify-center gap-2">
                                    <Save className="w-4 h-4" /> Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
