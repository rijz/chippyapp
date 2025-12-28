import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { TenantConfig } from '../types';
import { getAvailableSlots, TimeSlot, loadGoogleScripts } from '../services/calendarAuth';

// Simple helper to get days in month
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export const BookingPage = () => {
    // State
    const [config, setConfig] = useState<TenantConfig>({
        id: 'public',
        industry: 'General',
        companyName: 'Demo Company',
        companyUrl: '',
        isConnected: false,
        bookingPlatform: null
    });

    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
    const [step, setStep] = useState<'calendar' | 'form' | 'success'>('calendar');
    const [formData, setFormData] = useState({ name: '', email: '', notes: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // Load tenant name if available (same localStorage hack as EmbedPage)
    useEffect(() => {
        loadGoogleScripts(); // Initialize calendar API
        try {
            const stored = localStorage.getItem('tenantConfig');
            if (stored) {
                const parsed = JSON.parse(stored);
                setConfig({ ...config, ...parsed });
            }
        } catch (e) { }
    }, []);

    // Fetch available slots when date is selected
    useEffect(() => {
        if (selectedDate) {
            setIsLoadingSlots(true);
            setSlots([]);
            getAvailableSlots(selectedDate, 30, 9, 17)
                .then(availableSlots => {
                    setSlots(availableSlots);
                })
                .finally(() => setIsLoadingSlots(false));
        }
    }, [selectedDate]);

    // Calendar Navigation
    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };
    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    // Render Calendar
    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);

        const days = [];
        // Extract empty slots
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-10 w-10"></div>);
        }

        // Render days
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const isPast = date < today;
            const isSelected = selectedDate?.toDateString() === date.toDateString();

            days.push(
                <button
                    key={d}
                    disabled={isPast}
                    onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                        ${isSelected ? 'bg-chippy-coral text-white shadow-lg shadow-chippy-coral/30' :
                            isPast ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100 hover:text-chippy-navy'}
                    `}
                >
                    {d}
                </button>
            );
        }
        return days;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Simulate API call
        setTimeout(() => {
            setIsSubmitting(false);
            setStep('success');
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-chippy-cream flex items-center justify-center p-4 font-sans">
            <div className="max-w-4xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 flex flex-col md:flex-row min-h-[600px]">

                {/* Left Panel: Info */}
                <div className="w-full md:w-1/3 bg-chippy-navy p-8 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-8 opacity-80">
                            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                <CalendarIcon className="w-4 h-4" />
                            </div>
                            <span className="font-bold tracking-wide text-sm uppercase">Booking</span>
                        </div>

                        <h1 className="text-3xl font-bold mb-4">{config.companyName}</h1>
                        <div className="space-y-4 text-slate-300 text-sm">
                            <div className="flex items-center gap-3">
                                <Clock className="w-4 h-4 text-chippy-coral" />
                                <span>30 min Meeting</span>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="w-4 h-4 text-chippy-coral mt-1" />
                                <span className="leading-relaxed">Consultation regarding our services, pricing, and custom solutions.</span>
                            </div>
                        </div>
                    </div>

                    {/* Background decorations */}
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-chippy-coral rounded-full blur-[100px] opacity-20"></div>
                </div>

                {/* Right Panel: Interaction */}
                <div className="w-full md:w-2/3 p-8 lg:p-12 overflow-y-auto">

                    {/* STEP 1: CALENDAR */}
                    {step === 'calendar' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h2 className="text-xl font-bold text-chippy-navy mb-6">Select a Date & Time</h2>

                            <div className="flex flex-col xl:flex-row gap-8">
                                {/* Calendar Grid */}
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-slate-700">
                                            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                        </h3>
                                        <div className="flex gap-2">
                                            <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                                            <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <span key={d} className="text-xs font-bold text-slate-400 uppercase">{d}</span>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 place-items-center">
                                        {renderCalendar()}
                                    </div>
                                </div>

                                {/* Slots */}
                                <div className="w-full xl:w-48 border-l border-slate-100 pl-0 xl:pl-8 pt-8 xl:pt-0">
                                    <h3 className="font-bold text-slate-700 mb-4">Available Times</h3>
                                    {!selectedDate ? (
                                        <p className="text-sm text-slate-400 italic">Select a date first.</p>
                                    ) : isLoadingSlots ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-chippy-coral" />
                                        </div>
                                    ) : slots.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">No available slots for this date.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                            {slots.filter(slot => slot.available).map(slot => (
                                                <button
                                                    key={slot.time}
                                                    onClick={() => { setSelectedSlot(slot); setStep('form'); }}
                                                    className="w-full py-2 px-3 text-sm font-medium border border-chippy-coral text-chippy-coral rounded-lg hover:bg-chippy-coral hover:text-white transition-all text-center"
                                                >
                                                    {slot.time}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: FORM */}
                    {step === 'form' && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500 max-w-md mx-auto">
                            <button onClick={() => setStep('calendar')} className="text-sm text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-1 transition-colors">
                                <ChevronLeft className="w-4 h-4" /> Back to Calendar
                            </button>

                            <h2 className="text-xl font-bold text-chippy-navy mb-2">Confirm Booking</h2>
                            <p className="text-slate-500 text-sm mb-6 flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-chippy-coral" />
                                {selectedDate?.toLocaleDateString()} at {selectedSlot?.time}
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                                    <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all" placeholder="John Doe" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                                    <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all" placeholder="john@example.com" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes (Optional)</label>
                                    <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-chippy-coral transition-all resize-none h-24" placeholder="Any specific topics?" />
                                </div>

                                <button disabled={isSubmitting} className="w-full py-4 mt-2 bg-chippy-coral hover:bg-chippy-coral-hover text-white font-bold rounded-xl shadow-lg shadow-chippy-coral/20 hover:shadow-chippy-coral/30 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0">
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Booking'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* STEP 3: SUCCESS */}
                    {step === 'success' && (
                        <div className="h-full flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-chippy-navy mb-2">Booking Confirmed!</h2>
                            <p className="text-slate-500 max-w-xs mx-auto mb-8">
                                A calendar invitation has been sent to <strong>{formData.email}</strong>.
                            </p>
                            <div className="bg-slate-50 p-4 rounded-2xl text-sm border border-slate-100 w-full max-w-sm">
                                <div className="flex justify-between mb-2">
                                    <span className="text-slate-500">Date</span>
                                    <span className="font-bold text-slate-700">{selectedDate?.toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Time</span>
                                    <span className="font-bold text-slate-700">{selectedSlot?.time}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
