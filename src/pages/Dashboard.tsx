import React, { useMemo, useState, useEffect } from 'react';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { PageHeader } from '../components/layout/PageHeader';
import { useData } from '../contexts/DataContext';
import { ChartDataPoint } from '../types';

// Skeleton component for loading state
const StatSkeleton = () => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 animate-pulse">
        <div className="h-4 w-24 bg-slate-200 rounded mb-3"></div>
        <div className="h-10 w-20 bg-slate-200 rounded"></div>
    </div>
);

const ChartSkeleton = () => (
    <div className="bg-white p-8 rounded-xl border border-slate-200 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded mb-6"></div>
        <div className="h-64 bg-slate-100 rounded-xl flex items-end justify-around gap-4 p-4">
            {[...Array(7)].map((_, i) => (
                <div
                    key={i}
                    className="w-8 bg-slate-200 rounded-t"
                    style={{ height: `${Math.random() * 60 + 20}%` }}
                ></div>
            ))}
        </div>
    </div>
);

export const Dashboard = () => {
    const { chatSessions } = useData();
    const [isLoading, setIsLoading] = useState(true);

    // Simulate initial data load delay
    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 800);
        return () => clearTimeout(timer);
    }, []);

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
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PageHeader
                title="Overview"
                subtitle="A clear view of activity over the last 7 days."
            />

            {isLoading ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatSkeleton />
                        <StatSkeleton />
                        <StatSkeleton />
                    </div>
                    <ChartSkeleton />
                </>
            ) : (
                <>
                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                        <div className="flex items-center justify-between px-6 py-4">
                            <p className="text-sm text-slate-600">Total Chats</p>
                            <span className="text-lg font-semibold text-chippy-navy">{totalChats}</span>
                        </div>
                        <div className="flex items-center justify-between px-6 py-4">
                            <p className="text-sm text-slate-600">Confirmed Bookings</p>
                            <span className="text-lg font-semibold text-chippy-navy">{totalBookings}</span>
                        </div>
                        <div className="flex items-center justify-between px-6 py-4">
                            <p className="text-sm text-slate-600">Conversion Rate</p>
                            <span className="text-lg font-semibold text-chippy-navy">{conversionRate}%</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm text-slate-600 uppercase tracking-wider">Engagement Trends</h3>
                            <span className="text-xs text-slate-400">Last 7 days</span>
                        </div>
                        <AnalyticsChart data={chartData} />
                    </div>
                </>
            )}
        </div>
    );
};
