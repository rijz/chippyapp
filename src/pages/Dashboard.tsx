import React, { useMemo, useState, useEffect } from 'react';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { PageHeader } from '../components/layout/PageHeader';
import { useData } from '../contexts/DataContext';
import { ChartDataPoint, OverviewMetricsResponse } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { fetchOverviewMetrics } from '../services/overviewMetrics';

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
    const { dashboardData } = useData();
    const { session } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [metrics, setMetrics] = useState<OverviewMetricsResponse | null>(null);

    // Load overview metrics
    useEffect(() => {
        let isActive = true;
        const load = async () => {
            if (!session?.user?.id || !session?.access_token) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            const response = await fetchOverviewMetrics(session.user.id, session.access_token, 7);
            if (isActive) {
                setMetrics(response);
                setIsLoading(false);
            }
        };
        load();
        return () => {
            isActive = false;
        };
    }, [session?.user?.id, session?.access_token]);

    const chartData = useMemo<ChartDataPoint[]>(() => {
        if (dashboardData.length > 0) return dashboardData;
        return [
            { name: 'Mon', chats: 0, bookings: 0 },
            { name: 'Tue', chats: 0, bookings: 0 },
            { name: 'Wed', chats: 0, bookings: 0 },
            { name: 'Thu', chats: 0, bookings: 0 },
            { name: 'Fri', chats: 0, bookings: 0 },
            { name: 'Sat', chats: 0, bookings: 0 },
            { name: 'Sun', chats: 0, bookings: 0 }
        ];
    }, [dashboardData]);

    const totalChats = metrics?.chats.total ?? 0;
    const uniqueVisitors = metrics?.chats.uniqueVisitors ?? 0;
    const totalBookings = metrics?.outcomes.bookingsCreated ?? 0;
    const leadsCaptured = metrics?.outcomes.leadsCaptured ?? 0;
    const conversionRate = metrics?.outcomes.chatToBookingConversion !== undefined
        ? (metrics.outcomes.chatToBookingConversion * 100).toFixed(1)
        : '0';
    const avgResponseTime = metrics?.chats.avgResponseTimeMs
        ? `${(metrics.chats.avgResponseTimeMs / 1000).toFixed(1)}s`
        : '—';
    const avgRating = metrics?.quality.avgFeedbackRating !== null && metrics?.quality.avgFeedbackRating !== undefined
        ? metrics.quality.avgFeedbackRating.toFixed(1)
        : '—';
    const topIntents = metrics?.insights.topIntents || [];
    const topTopics = metrics?.insights.topReviewTopics || [];

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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Total Chats</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{totalChats}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Unique Visitors</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{uniqueVisitors}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Bookings</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{totalBookings}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Leads Captured</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{leadsCaptured}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Conversion Rate</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{conversionRate}%</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Avg Response Time</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{avgResponseTime}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Avg Rating</p>
                            <p className="text-2xl font-semibold text-chippy-navy mt-2">{avgRating}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm text-slate-600 uppercase tracking-wider">Engagement Trends</h3>
                            <span className="text-xs text-slate-400">Last 7 days</span>
                        </div>
                        <AnalyticsChart data={chartData} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">Top Intents</h3>
                            {topIntents.length === 0 ? (
                                <p className="text-sm text-slate-400">No intent data yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {topIntents.map(item => (
                                        <div key={item.name} className="flex items-center justify-between text-sm">
                                            <span className="text-slate-600">{item.name}</span>
                                            <span className="font-semibold text-chippy-navy">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">Top Review Topics</h3>
                            {topTopics.length === 0 ? (
                                <p className="text-sm text-slate-400">No review topics yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {topTopics.map(item => (
                                        <div key={item.name} className="flex items-center justify-between text-sm">
                                            <span className="text-slate-600">{item.name}</span>
                                            <span className="font-semibold text-chippy-navy">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
