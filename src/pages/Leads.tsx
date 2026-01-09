import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Download, Calendar, Mail, Phone, MoreHorizontal, Pencil, X, Save, Check, PhoneIncoming, LayoutList, AlertTriangle, Clock, MapPin } from 'lucide-react';
import { checkAvailability } from '../services/calendarAuth';
import { useData } from '../contexts/DataContext';
import { Lead } from '../types';
import { useSearchParams } from 'react-router-dom';
import { LeadDetailsPanel } from '../components/LeadDetailsPanel';

export const Leads = () => {
    const { leads, setLeads, knowledgeData, calendarConnections } = useData();
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

    // Read view from URL query params
    const viewParam = searchParams.get('view');
    const getInitialView = (): 'All' | 'Appointments' | 'CallBacks' => {
        if (viewParam === 'appointments') return 'Appointments';
        if (viewParam === 'callbacks') return 'CallBacks';
        return 'All';
    };
    const [currentView, setCurrentView] = useState<'All' | 'Appointments' | 'CallBacks'>(getInitialView());

    // Update view when URL params change
    useEffect(() => {
        setCurrentView(getInitialView());
    }, [viewParam]);

    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    // Get unique locations from knowledge base and calendar connections
    const locations = knowledgeData?.locations || [];
    const activeCalendarLocations = calendarConnections
        .filter(c => c.isActive && c.locationId)
        .map(c => ({ id: c.locationId!, name: c.locationName || 'Unnamed Location' }));

    const filteredLeads = leads.filter(lead => {
        const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || lead.email.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesView = true;
        if (currentView === 'Appointments') matchesView = lead.status === 'Booked';
        if (currentView === 'CallBacks') matchesView = lead.status === 'Call Back';

        let matchesLocation = true;
        if (selectedLocationId !== 'all') {
            matchesLocation = lead.locationId === selectedLocationId;
        }

        return matchesSearch && matchesView && matchesLocation;
    });

    const handleUpdateLead = (updatedLead: Lead) => {
        setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    };

    const exportToCSV = () => {
        const headers = ['Name', 'Email', 'Phone', 'Status', 'Source', 'Date', 'Service', 'Notes'];
        const csvContent = [
            headers.join(','),
            ...leads.map(lead => [
                `"${lead.name}"`,
                `"${lead.email}"`,
                `"${lead.phone || ''}"`,
                `"${lead.status}"`,
                `"${lead.source}"`,
                `"${new Date(lead.date).toLocaleDateString()}"`,
                `"${lead.service || ''}"`,
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
                {/* Search and Filter Header */}
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

                    {/* Location Filter Dropdown */}
                    {locations.length > 0 && (
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                            <select
                                value={selectedLocationId}
                                onChange={(e) => setSelectedLocationId(e.target.value)}
                                className="pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all appearance-none cursor-pointer font-medium text-sm min-w-[200px]"
                            >
                                <option value="all">All Locations</option>
                                {locations.map((loc, idx) => (
                                    <option key={idx} value={`loc-${idx}`}>
                                        {loc.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLeads.map(lead => (
                                    <tr
                                        key={lead.id}
                                        onClick={() => setSelectedLead(lead)}
                                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                                    >
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-lg">
                                                    {lead.name[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-chippy-navy">{lead.name}</div>
                                                    <div className="flex items-center gap-2 flex-wrap mt-1">
                                                        {lead.service && (
                                                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                                                {lead.service}
                                                            </span>
                                                        )}
                                                        {lead.locationName && (
                                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                                                <MapPin className="w-3 h-3" />
                                                                {lead.locationName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-400 max-w-[150px] truncate mt-0.5">{lead.notes || lead.purpose}</div>
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
                                            <div className="flex flex-col gap-1 text-sm text-slate-500">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    {new Date(lead.date).toLocaleDateString()}
                                                </div>
                                                {lead.preferredTime && (
                                                    <div className="flex items-center gap-2 text-amber-600 font-medium">
                                                        <Clock className="w-4 h-4" />
                                                        {lead.preferredTime}
                                                    </div>
                                                )}
                                            </div>
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

            {/* Side Panel */}
            {selectedLead && (
                <LeadDetailsPanel
                    lead={selectedLead}
                    onClose={() => setSelectedLead(null)}
                    onUpdate={handleUpdateLead}
                />
            )}
        </div>
    );
};
