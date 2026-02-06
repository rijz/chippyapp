import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Download, Calendar, Mail, Phone, MoreHorizontal, Pencil, X, Save, Check, PhoneIncoming, LayoutList, AlertTriangle, Clock, MapPin } from 'lucide-react';
import { checkAvailability } from '../services/calendarAuth';
import { useData } from '../contexts/DataContext';
import { Lead } from '../types';
import { useSearchParams } from 'react-router-dom';
import { LeadDetailsPanel } from '../components/LeadDetailsPanel';
import { PageHeader } from '../components/layout/PageHeader';

export const Leads = () => {
    const { leads, setLeads, knowledgeData, calendarConnections, bookings } = useData();
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
    const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

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

    const normalizePhone = (value?: string) => (value || '').replace(/[^\d+]/g, '');

    const findBookingForLead = (lead: Lead) => {
        const email = (lead.email || '').toLowerCase();
        const phone = normalizePhone(lead.phone || '');
        const matches = bookings.filter(b => {
            const bookingEmail = (b.customerEmail || '').toLowerCase();
            const bookingPhone = normalizePhone(b.customerPhone || '');
            return (email && bookingEmail && bookingEmail === email) ||
                (phone && bookingPhone && bookingPhone === phone);
        });
        if (matches.length === 0) return null;
        return matches[0];
    };

    const formatAppointmentDate = (lead: Lead) => {
        const booking = findBookingForLead(lead);
        if (booking?.startTime) {
            return booking.startTime.toLocaleString();
        }
        if (lead.requestedCallbackDate) {
            return new Date(lead.requestedCallbackDate).toLocaleString();
        }
        if (lead.preferredTime) {
            return lead.preferredTime;
        }
        return '';
    };

    const exportToCSV = () => {
        const headers = ['Name', 'Email', 'Phone', 'Status', 'Source', 'Created Date', 'Appointment Date', 'Service', 'Notes'];
        const csvContent = [
            headers.join(','),
            ...leads.map(lead => [
                `"${lead.name}"`,
                `"${lead.email}"`,
                `"${lead.phone || ''}"`,
                `"${lead.status}"`,
                `"${lead.source}"`,
                `"${new Date(lead.date).toLocaleDateString()}"`,
                `"${formatAppointmentDate(lead)}"`,
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
        <div className="w-full space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <PageHeader
                title="Customers"
                subtitle="Track who needs a response and who is booked."
                actions={(
                    <button
                        onClick={exportToCSV}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                )}
            />

            {/* View Tabs */}
            <div className="bg-white border border-slate-200 rounded-xl p-2 md:w-fit">
                <div className="grid grid-cols-3 gap-2">
                <button
                    onClick={() => setCurrentView('All')}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                        ${currentView === 'All' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                    `}
                >
                    <LayoutList className="w-4 h-4" /> All Customers
                </button>
                <button
                    onClick={() => setCurrentView('Appointments')}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                        ${currentView === 'Appointments' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                    `}
                >
                    <Calendar className="w-4 h-4" /> Appointments
                </button>
                <button
                    onClick={() => setCurrentView('CallBacks')}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                        ${currentView === 'CallBacks' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                    `}
                >
                    <PhoneIncoming className="w-4 h-4" /> Callbacks
                </button>
                </div>
            </div>

            {/* Canvas/Table Area */}
            <div className="space-y-4">
                {/* Search and Filter Header */}
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
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

                    <div className="ml-auto flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1">
                        <button
                            onClick={() => setDensity('comfortable')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${density === 'comfortable' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Comfortable
                        </button>
                        <button
                            onClick={() => setDensity('compact')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${density === 'compact' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Compact
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_#e2e8f0]">
                                <tr className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                                    <th className="p-4">Customer</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Created</th>
                                    <th className="p-4">Appointment</th>
                                    <th className="p-4">Contact</th>
                                    <th className="p-4">Source</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLeads.map(lead => (
                                    <tr
                                        key={lead.id}
                                        onClick={() => setSelectedLead(lead)}
                                        className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                    >
                                        <td className={density === 'compact' ? 'p-3' : 'p-4'}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm">
                                                    {lead.name[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-chippy-navy">{lead.name}</div>
                                                    <div className="flex items-center gap-2 flex-wrap mt-1">
                                                        {lead.priority && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600 uppercase tracking-wider">
                                                                {lead.priority}
                                                            </span>
                                                        )}
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
                                                    <div className="text-xs text-slate-400 max-w-[180px] truncate mt-0.5">{lead.notes || lead.purpose}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className={density === 'compact' ? 'p-3' : 'p-4'}>
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5
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
                                        <td className={density === 'compact' ? 'p-3' : 'p-4'}>
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                {new Date(lead.date).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className={density === 'compact' ? 'p-3' : 'p-4'}>
                                            <div className="flex flex-col gap-1 text-sm text-slate-500">
                                                {(() => {
                                                    const booking = findBookingForLead(lead);
                                                    if (booking?.startTime) {
                                                        return (
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                                {booking.startTime.toLocaleString()}
                                                            </div>
                                                        );
                                                    }
                                                    if (lead.requestedCallbackDate) {
                                                        return (
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                                {new Date(lead.requestedCallbackDate).toLocaleString()}
                                                            </div>
                                                        );
                                                    }
                                                    return <div className="text-slate-400">—</div>;
                                                })()}
                                                {lead.preferredTime && (
                                                    <div className="flex items-center gap-2 text-amber-600 font-medium">
                                                        <Clock className="w-4 h-4" />
                                                        {lead.preferredTime}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className={density === 'compact' ? 'p-3' : 'p-4'}>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Mail className="w-3 h-3 text-slate-400" /> {lead.email}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Phone className="w-3 h-3 text-slate-400" /> {lead.phone}
                                                </div>
                                            </div>
                                        </td>
                                        <td className={density === 'compact' ? 'p-3' : 'p-4'}>
                                            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                                                {lead.source}
                                            </span>
                                        </td>
                                        <td className={density === 'compact' ? 'p-3 text-right' : 'p-4 text-right'}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedLead(lead);
                                                }}
                                                className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                View
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

            {/* Side Panel */}
            {selectedLead && (
                <LeadDetailsPanel
                    lead={selectedLead}
                    booking={findBookingForLead(selectedLead)}
                    onClose={() => setSelectedLead(null)}
                    onUpdate={handleUpdateLead}
                />
            )}
        </div>
    );
};
