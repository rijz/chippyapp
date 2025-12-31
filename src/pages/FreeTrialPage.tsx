import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    BrainCircuit, Loader2, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2,
    Sparkles, Calendar, MessageCircle, Clock, Zap, Shield, ArrowLeft
} from 'lucide-react';

export const FreeTrialPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });
            if (error) throw error;
            setMessage('🎉 Account created! Check your email for the confirmation link.');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const benefits = [
        { icon: MessageCircle, text: '24/7 AI that answers like you would' },
        { icon: Calendar, text: 'Auto-schedule meetings on your calendar' },
        { icon: Clock, text: 'Save 10+ hours per week on inquiries' },
        { icon: Shield, text: 'No credit card required' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-chippy-navy via-slate-900 to-chippy-navy flex relative overflow-hidden">
            {/* Animated Background Effects */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-chippy-coral/20 rounded-full blur-[150px] pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            {/* Back to Marketing */}
            <a
                href="https://hellochippy.com"
                className="absolute top-6 left-6 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all flex items-center gap-2 z-20"
            >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Back to Chippy</span>
            </a>

            {/* Left Side - Value Proposition */}
            <div className="hidden lg:flex flex-1 flex-col justify-center px-16 xl:px-24 relative z-10">
                <div className="max-w-xl">
                    <div className="flex items-center gap-2 mb-8">
                        <div className="bg-white/5 p-2.5 rounded-xl">
                            <BrainCircuit className="w-9 h-9 text-chippy-coral" />
                        </div>
                        <span className="text-white font-bold text-2xl">Chippy</span>
                    </div>

                    <h1 className="text-4xl xl:text-5xl font-black text-white mb-6 leading-tight">
                        Your 24/7 AI Assistant That
                        <span className="text-chippy-coral"> Understands </span>
                        Your Business
                    </h1>

                    <p className="text-xl text-slate-300 mb-10 leading-relaxed">
                        Stop losing leads to slow responses. Chippy handles inquiries and books meetings
                        directly on your calendar—even while you sleep.
                    </p>

                    <div className="space-y-4">
                        {benefits.map((benefit, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 hover:bg-white/10 transition-all"
                            >
                                <div className="bg-chippy-coral/20 p-2 rounded-lg">
                                    <benefit.icon className="w-5 h-5 text-chippy-coral" />
                                </div>
                                <span className="text-white font-medium">{benefit.text}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 flex items-center gap-4 text-slate-400 text-sm">
                        <div className="flex -space-x-2">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-xs text-white font-bold">
                                    {String.fromCharCode(65 + i)}
                                </div>
                            ))}
                        </div>
                        <span>Trusted by 100+ local businesses</span>
                    </div>
                </div>
            </div>

            {/* Right Side - Sign Up Form */}
            <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative z-10">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">

                        {/* Header */}
                        <div className="p-8 pb-0">
                            {/* Mobile Logo */}
                            <div className="flex lg:hidden justify-center items-center gap-2 mb-6">
                                <div className="bg-chippy-coral/10 p-2.5 rounded-xl">
                                    <BrainCircuit className="w-7 h-7 text-chippy-coral" />
                                </div>
                                <span className="text-chippy-navy font-bold text-xl">Chippy</span>
                            </div>

                            <div className="text-center">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-bold mb-4">
                                    <Sparkles className="w-4 h-4" />
                                    14-Day Free Trial
                                </div>
                                <h2 className="text-2xl font-black text-chippy-navy mb-2">
                                    Start Your Free Trial
                                </h2>
                                <p className="text-slate-500 text-sm">
                                    Set up your AI assistant in under 5 minutes
                                </p>
                            </div>
                        </div>

                        {/* Form */}
                        <div className="p-8">
                            {error && (
                                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {message && (
                                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-emerald-700 text-sm">
                                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                                    <span>{message}</span>
                                </div>
                            )}

                            <form onSubmit={handleSignUp} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@business.com"
                                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral focus:border-chippy-coral transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Create Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                        <input
                                            type="password"
                                            required
                                            minLength={6}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="At least 6 characters"
                                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral focus:border-chippy-coral transition-all"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-chippy-coral to-orange-500 hover:from-chippy-coral-hover hover:to-orange-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-chippy-coral/30 hover:shadow-xl hover:shadow-chippy-coral/40 hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <Zap className="w-5 h-5" />
                                            Start Free Trial
                                        </>
                                    )}
                                </button>
                            </form>

                            <p className="text-xs text-slate-400 text-center mt-6">
                                By signing up, you agree to our Terms and Privacy Policy.
                                <br />No credit card required.
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center space-y-4">
                            <div>
                                <span className="text-sm text-slate-500">Already have an account? </span>
                                <a
                                    href="/auth"
                                    className="text-sm text-chippy-coral font-semibold hover:underline"
                                >
                                    Sign In
                                </a>
                            </div>

                            <div className="flex items-center justify-center gap-1.5 opacity-20 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                                <BrainCircuit className="w-4 h-4 text-slate-300" />
                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Chippy AI</span>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Benefits */}
                    <div className="lg:hidden mt-8 grid grid-cols-2 gap-3">
                        {benefits.slice(0, 4).map((benefit, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20"
                            >
                                <benefit.icon className="w-4 h-4 text-chippy-coral" />
                                <span className="text-white text-xs font-medium">{benefit.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
