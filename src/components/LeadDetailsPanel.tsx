import React from 'react';
import { X, Mail, Phone, Calendar, Clock, Tag, FileText, User } from 'lucide-react';
import { Lead, BookingRecord } from '../types';

interface LeadDetailsPanelProps {
    lead: Lead;
    booking?: BookingRecord | null;
    onClose: () => void;
    onUpdate: (updatedLead: Lead) => void;
}

export const LeadDetailsPanel: React.FC<LeadDetailsPanelProps> = ({ lead, booking, onClose, onUpdate }) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editedLead, setEditedLead] = React.useState<Lead>(lead);

    const handleSave = () => {
        onUpdate(editedLead);
        setIsEditing(false);
    };

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-chippy-navy">{lead.name}</h2>
                    <span className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
            ${lead.status === 'Booked' ? 'bg-emerald-100 text-emerald-700' :
                            lead.status === 'Call Back' ? 'bg-amber-100 text-amber-700' :
                                lead.status === 'New' ? 'bg-blue-100 text-blue-700' :
                                    lead.status === 'Cancelled' ? 'bg-slate-100 text-slate-500' :
                                        'bg-slate-100 text-slate-600'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${lead.status === 'Booked' ? 'bg-emerald-500' :
                            lead.status === 'Call Back' ? 'bg-amber-500' :
                                lead.status === 'New' ? 'bg-blue-500' :
                                    'bg-slate-400'
                            }`} />
                        {lead.status}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
                {/* Contact Information */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Contact</h3>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                            <Mail className="w-4 h-4 text-slate-400" />
                            <a href={`mailto:${lead.email}`} className="text-chippy-navy hover:text-chippy-coral">
                                {lead.email}
                            </a>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <a href={`tel:${lead.phone}`} className="text-chippy-navy hover:text-chippy-coral">
                                {lead.phone}
                            </a>
                        </div>
                    </div>
                </div>

                {/* Service */}
                {lead.service && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Service</h3>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">
                            <Tag className="w-4 h-4" />
                            {lead.service}
                        </span>
                    </div>
                )}

                {/* Purpose (for callbacks) */}
                {lead.purpose && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Purpose</h3>
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{lead.purpose}</p>
                    </div>
                )}

                {/* AI Triage */}
                {(lead.priority || lead.intent || lead.nextAction) && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">AI Triage</h3>
                        <div className="space-y-2 text-sm bg-slate-50 p-3 rounded-lg">
                            {lead.priority && (
                                <div>
                                    <span className="font-bold text-slate-600">Priority:</span>{' '}
                                    <span className={`font-bold ${lead.priority === 'Hot' ? 'text-rose-600' : lead.priority === 'Warm' ? 'text-amber-600' : 'text-slate-600'}`}>
                                        {lead.priority}
                                    </span>
                                </div>
                            )}
                            {lead.intent && (
                                <div>
                                    <span className="font-bold text-slate-600">Intent:</span>{' '}
                                    <span className="text-slate-700">{lead.intent}</span>
                                </div>
                            )}
                            {lead.nextAction && (
                                <div>
                                    <span className="font-bold text-slate-600">Next Action:</span>{' '}
                                    <span className="text-slate-700">{lead.nextAction}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Requested Callback Date/Time */}
                {(booking?.startTime || lead.requestedCallbackDate) && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                            {booking?.startTime ? 'Appointment' : 'Requested Callback Time'}
                        </h3>
                        <div className={`${booking?.startTime ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'} border p-3 rounded-lg`}>
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <Calendar className="w-5 h-5" />
                                {booking?.startTime
                                    ? booking.startTime.toLocaleString('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true
                                    })
                                    : new Date(lead.requestedCallbackDate as Date).toLocaleString('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true
                                    })}
                            </div>
                            {booking?.serviceType && (
                                <div className="mt-2 text-xs font-medium text-emerald-700">
                                    Service: {booking.serviceType}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Preferred Time (for callbacks) */}
                {lead.preferredTime && !lead.requestedCallbackDate && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Preferred Time</h3>
                        <div className="flex items-center gap-2 text-amber-600 font-medium text-sm">
                            <Clock className="w-4 h-4" />
                            {lead.preferredTime}
                        </div>
                    </div>
                )}

                {/* Notes */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Notes</h3>
                    {isEditing ? (
                        <textarea
                            value={editedLead.notes}
                            onChange={(e) => setEditedLead({ ...editedLead, notes: e.target.value })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral resize-none h-24 text-sm"
                        />
                    ) : (
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">
                            {lead.notes || 'No notes'}
                        </p>
                    )}
                </div>

                {/* Metadata */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Details</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-3 text-slate-600">
                            <User className="w-4 h-4 text-slate-400" />
                            <span>Source: <span className="font-medium">{lead.source}</span></span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>Created: <span className="font-medium">{new Date(lead.date).toLocaleString()}</span></span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-4 border-t border-slate-200">
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button
                                onClick={handleSave}
                                className="flex-1 py-2 bg-chippy-coral text-white font-bold rounded-lg hover:bg-chippy-coral-hover transition-colors"
                            >
                                Save Changes
                            </button>
                            <button
                                onClick={() => {
                                    setEditedLead(lead);
                                    setIsEditing(false);
                                }}
                                className="flex-1 py-2 border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="w-full py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Edit Notes
                        </button>
                    )}

                    {/* Change Status */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Change Status</label>
                        <select
                            value={editedLead.status}
                            onChange={(e) => {
                                const newStatus = e.target.value as Lead['status'];
                                setEditedLead({ ...editedLead, status: newStatus });
                                onUpdate({ ...editedLead, status: newStatus });
                            }}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-chippy-coral text-sm"
                        >
                            <option value="New">New</option>
                            <option value="Contacted">Contacted</option>
                            <option value="Call Back">Call Back</option>
                            <option value="Booked">Booked</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};
