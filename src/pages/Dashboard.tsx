import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { PageHeader } from '../components/layout/PageHeader';
import { useData } from '../contexts/DataContext';
import { ChartDataPoint, OverviewMetricsResponse } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { fetchOverviewMetrics } from '../services/overviewMetrics';
import { OwnerCommandChat } from '../components/OwnerCommandChat';

export const Dashboard = () => {
    const { dashboardData, leads, chatSessions, bookings, tenantConfig } = useData();
    const { session } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [metrics, setMetrics] = useState<OverviewMetricsResponse | null>(null);

    const isAdvancedMode = tenantConfig.experienceMode === 'advanced';

    useEffect(() => {
        let isActive = true;

        if (!isAdvancedMode) {
            setMetrics(null);
            setIsLoading(false);
            return () => {
                isActive = false;
            };
        }

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
    }, [isAdvancedMode, session?.user?.id, session?.access_token]);

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

    const todayStart = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    }, []);

    const todayEnd = useMemo(() => {
        const end = new Date(todayStart);
        end.setDate(end.getDate() + 1);
        return end;
    }, [todayStart]);

    const needsReply = useMemo(() => {
        const openedSessions = chatSessions.filter(session => session.status === 'Opened').length;
        const openLeads = leads.filter(lead => lead.status === 'New' || lead.status === 'Call Back').length;
        return openedSessions + openLeads;
    }, [chatSessions, leads]);

    const todaysBookings = useMemo(() => {
        const confirmed = bookings.filter(booking => booking.startTime >= todayStart && booking.startTime < todayEnd).length;
        if (confirmed > 0) return confirmed;
        return leads.filter(lead => lead.status === 'Booked').length;
    }, [bookings, todayStart, todayEnd, leads]);

    const callbacks = useMemo(() => leads.filter(lead => lead.status === 'Call Back').length, [leads]);

    const checklist = tenantConfig.setupChecklist;
    const coreSetupCompleted = [
        checklist?.businessInfo && checklist?.services,
        checklist?.calendar
    ].filter(Boolean).length;
    const setupIncomplete = coreSetupCompleted < 2;
    const primaryAction = needsReply > 0 ? 'customers' : (setupIncomplete ? 'setup' : 'test-booking');

    const totalChats = metrics?.chats.total ?? 0;
    const conversionRate = metrics?.outcomes.chatToBookingConversion !== undefined
        ? (metrics.outcomes.chatToBookingConversion * 100).toFixed(1)
        : '0';
    const avgResponseTime = metrics?.chats.avgResponseTimeMs
        ? `${(metrics.chats.avgResponseTimeMs / 1000).toFixed(1)}s`
        : '—';
    const topIntents = metrics?.insights.topIntents || [];
    const topTopics = metrics?.insights.topReviewTopics || [];

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PageHeader
                title="Home"
                subtitle="Run your day from one place."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Needs Reply</p>
                    <p className="text-3xl font-semibold text-chippy-navy mt-2">{needsReply}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Today's Bookings</p>
                    <p className="text-3xl font-semibold text-chippy-navy mt-2">{todaysBookings}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Callbacks</p>
                    <p className="text-3xl font-semibold text-chippy-navy mt-2">{callbacks}</p>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-chippy-navy">Next Best Actions</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Core setup: {coreSetupCompleted}/2 complete
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => navigate('/customers')}
                        className={`rounded-lg text-sm font-semibold transition-colors ${
                            primaryAction === 'customers'
                                ? 'px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800'
                                : 'text-slate-600 hover:text-slate-900 underline underline-offset-4'
                        }`}
                    >
                        Open Customers
                    </button>
                    <button
                        onClick={() => navigate('/setup')}
                        className={`rounded-lg text-sm font-semibold transition-colors ${
                            primaryAction === 'setup'
                                ? 'px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800'
                                : 'text-slate-600 hover:text-slate-900 underline underline-offset-4'
                        }`}
                    >
                        Finish Setup
                    </button>
                    <button
                        onClick={() => window.open('/book', '_blank', 'noopener,noreferrer')}
                        className={`rounded-lg text-sm font-semibold transition-colors ${
                            primaryAction === 'test-booking'
                                ? 'px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800'
                                : 'text-slate-600 hover:text-slate-900 underline underline-offset-4'
                        }`}
                    >
                        Test Booking
                    </button>
                </div>
            </div>

            <OwnerCommandChat compact />

            {isAdvancedMode && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Advanced Analytics</h3>
                    </div>

                    {isLoading ? (
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-sm text-slate-500">Loading analytics...</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white p-5 rounded-xl border border-slate-200">
                                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Total Chats</p>
                                    <p className="text-2xl font-semibold text-chippy-navy mt-2">{totalChats}</p>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-slate-200">
                                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Conversion Rate</p>
                                    <p className="text-2xl font-semibold text-chippy-navy mt-2">{conversionRate}%</p>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-slate-200">
                                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Avg Response Time</p>
                                    <p className="text-2xl font-semibold text-chippy-navy mt-2">{avgResponseTime}</p>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-sm text-slate-600 uppercase tracking-wider">Engagement Trends</h3>
                                    <span className="text-xs text-slate-400">Last 7 days</span>
                                </div>
                                <AnalyticsChart data={chartData} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-5 rounded-xl border border-slate-200">
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
                                <div className="bg-white p-5 rounded-xl border border-slate-200">
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
            )}
        </div>
    );
};
