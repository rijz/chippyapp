/**
 * Compact Date & Time Picker for Chat Widget
 * 
 * A mobile-friendly, compact date picker with time slot selection.
 * Designed to fit within the 350px chat widget while maintaining usability.
 */

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateTimePickerProps {
    /** Available slots in format "Day, Month Date at Time" e.g. "Monday, January 27 at 10:00 AM" */
    availableSlots: string[];
    /** Callback when user selects a slot */
    onSlotSelect: (slot: string) => void;
    /** Primary color for the picker (defaults to teal) */
    accentColor?: string;
}

// Parse slot string to get date and time info
const parseSlot = (slot: string): { date: Date; time: string; dayStr: string } | null => {
    try {
        // Format: "Monday, January 27 at 10:00 AM"
        const match = slot.match(/^(\w+),\s+(\w+)\s+(\d+)\s+at\s+(.+)$/);
        if (!match) return null;

        const [, , month, day, time] = match;
        const monthIndex = new Date(`${month} 1, 2026`).getMonth();
        const year = new Date().getFullYear();

        // Create date for comparison (using year 2026 for consistency)
        const date = new Date(year >= 2026 ? year : 2026, monthIndex, parseInt(day));

        return { date, time: time.trim(), dayStr: slot };
    } catch {
        return null;
    }
};

// Group slots by date
const groupSlotsByDate = (slots: string[]): Map<string, string[]> => {
    const grouped = new Map<string, string[]>();

    slots.forEach(slot => {
        const parsed = parseSlot(slot);
        if (parsed) {
            const dateKey = parsed.date.toDateString();
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, []);
            }
            grouped.get(dateKey)!.push(parsed.time);
        }
    });

    return grouped;
};

// Get available dates from slots
const getAvailableDates = (slots: string[]): Set<string> => {
    const dates = new Set<string>();
    slots.forEach(slot => {
        const parsed = parseSlot(slot);
        if (parsed) {
            dates.add(parsed.date.toDateString());
        }
    });
    return dates;
};

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
    availableSlots,
    onSlotSelect,
    accentColor = '#14b8a6' // Teal-500
}) => {
    const [currentMonth, setCurrentMonth] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    // Group slots and get available dates
    const slotsByDate = useMemo(() => groupSlotsByDate(availableSlots), [availableSlots]);
    const availableDates = useMemo(() => getAvailableDates(availableSlots), [availableSlots]);

    // Get times for selected date
    const timesForSelectedDate = useMemo(() => {
        if (!selectedDate) return [];
        return slotsByDate.get(selectedDate.toDateString()) || [];
    }, [selectedDate, slotsByDate]);

    // Calendar helpers
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const monthName = currentMonth.toLocaleString('default', { month: 'long' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Navigate months
    const goToPrevMonth = () => {
        setCurrentMonth(new Date(year, month - 1, 1));
        setSelectedDate(null);
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(year, month + 1, 1));
        setSelectedDate(null);
    };

    // Handle date selection
    const handleDateClick = (day: number) => {
        const date = new Date(year, month, day);
        if (availableDates.has(date.toDateString())) {
            setSelectedDate(date);
        }
    };

    // Handle time selection
    const handleTimeSelect = (time: string) => {
        if (!selectedDate) return;

        // Reconstruct the slot string that the AI expects
        const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = selectedDate.toLocaleDateString('en-US', { month: 'long' });
        const day = selectedDate.getDate();
        const slot = `${dayName}, ${monthName} ${day} at ${time}`;

        onSlotSelect(slot);
    };

    // Render calendar days
    const renderCalendarDays = () => {
        const days: React.ReactNode[] = [];

        // Empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="w-8 h-8" />);
        }

        // Days of the month
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dateStr = date.toDateString();
            const isPast = date < today;
            const hasSlots = availableDates.has(dateStr);
            const isSelected = selectedDate?.toDateString() === dateStr;

            days.push(
                <button
                    key={d}
                    onClick={() => handleDateClick(d)}
                    disabled={isPast || !hasSlots}
                    className={`
            w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
            transition-all duration-200
            ${isSelected
                            ? 'text-white shadow-md scale-105'
                            : hasSlots && !isPast
                                ? 'border-2 hover:scale-105'
                                : 'text-gray-300 cursor-not-allowed'
                        }
          `}
                    style={
                        isSelected
                            ? { backgroundColor: accentColor }
                            : hasSlots && !isPast
                                ? { borderColor: accentColor, color: accentColor }
                                : {}
                    }
                >
                    {d}
                </button>
            );
        }

        return days;
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Calendar Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <button
                    onClick={goToPrevMonth}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <span className="text-sm font-semibold text-gray-700">{monthName}</span>
                <button
                    onClick={goToNextMonth}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-0.5 px-2 pt-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} className="w-8 h-6 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{day}</span>
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-0.5 px-2 py-2 place-items-center">
                {renderCalendarDays()}
            </div>

            {/* Time Slots Section */}
            <div className="border-t border-gray-100 px-3 py-2">
                {!selectedDate ? (
                    <p className="text-xs text-gray-400 text-center py-2">
                        👆 Select a date to see times
                    </p>
                ) : timesForSelectedDate.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">
                        No times available
                    </p>
                ) : (
                    <>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">
                            {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                            {timesForSelectedDate.map((time, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleTimeSelect(time)}
                                    className="py-2 px-1 text-xs font-medium rounded-lg text-white transition-all hover:opacity-90 hover:shadow-md active:scale-95"
                                    style={{ backgroundColor: accentColor }}
                                >
                                    {time}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DateTimePicker;
