import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { useData } from '../contexts/DataContext';
import { ChartDataPoint } from '../types';

export const Dashboard = () => {
    const { chatSessions } = useData();

    // Compute real metrics from chat sessions
    const { totalChats, totalBookings, chartData } = useMemo(() => {
        const total = chatSessions.length;

        // Count bookings (sessions with type 'Booking' or status 'Closed' as proxy)
        const bookings = chatSessions.filter(s => s.type === 'Booking').length;

        // Generate last 7 days chart data
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const chartMap = new Map<string, ChartDataPoint>();

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const key = d.toISOString().split('T')[0];
            chartMap.set(key, {
                name: days[d.getDay()],
                chats: 0,
                bookings: 0
            });
        }

        // Populate with real session data
        chatSessions.forEach(session => {
            const sessionDate = new Date(session.timestamp);
            sessionDate.setHours(0, 0, 0, 0);
            const key = sessionDate.toISOString().split('T')[0];

            if (chartMap.has(key)) {
                const point = chartMap.get(key)!;
                point.chats += 1;
                if (session.type === 'Booking') {
                    point.bookings += 1;
                }
            }
        });

        const chartData = Array.from(chartMap.values());

        return { totalChats: total, totalBookings: bookings, chartData };
    }, [chatSessions]);

    const conversionRate = totalChats > 0 ? ((totalBookings / totalChats) * 100).toFixed(1) : '0';

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
                <h2 className="text-3xl font-bold text-chippy-navy tracking-tight">Performance</h2>
                <p className="text-slate-500">Real-time stats for your AI Front Desk.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">Total Chats</p>
                    <span className="text-4xl font-black text-chippy-navy">{totalChats}</span>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">Confirmed Bookings</p>
                    <span className="text-4xl font-black text-chippy-navy">{totalBookings}</span>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">Conversion Rate</p>
                    <span className="text-4xl font-black text-chippy-navy">{conversionRate}%</span>
                </div>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-chippy-navy"><Sparkles className="w-5 h-5 text-chippy-coral" /> Engagement Trends</h3>
                <AnalyticsChart data={chartData} />
            </div>
        </div>
    );
};
