import React, { useState, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    Loader2, Mail, Lock, AlertCircle, CheckCircle2,
    MessageCircle, Calendar, Clock, Shield,
    ArrowLeft, User, Building2,
    Eye, EyeOff, ArrowRight, Quote
} from 'lucide-react';

// Password strength calculator
const getPasswordStrength = (password: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
    if (score <= 5) return { score: 3, label: 'Good', color: 'bg-blue-500' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
};

export const FreeTrialPage: React.FC = () => {
    const [fullName, setFullName] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [step, setStep] = useState<1 | 2>(1);

    const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

    const passwordsMatch = password === confirmPassword;
    const isStepOneValid = fullName.trim() && email.trim();
    const isFormValid = isStepOneValid && password.length >= 6 && passwordsMatch;

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!passwordsMatch) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName.trim(),
                        business_name: businessName.trim() || null,
                    }
                }
            });
            if (error) throw error;
            setMessage('Account created! Check your email for the confirmation link.');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBlur = (field: string) => {
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    const handleNext = () => {
        if (!isStepOneValid) {
            setTouched(prev => ({ ...prev, fullName: true, email: true }));
            return;
        }
        setStep(2);
    };

    const features = [
        { icon: MessageCircle, title: 'Human-sounding replies', desc: 'Your brand voice, every time' },
        { icon: Calendar, title: 'Instant booking', desc: 'Locks appointments to your calendar' },
        { icon: Clock, title: '24/7 coverage', desc: 'Never miss a message' },
        { icon: Shield, title: 'Privacy-first', desc: 'Secure by design, built for teams' },
    ];

    const outcomes = [
        'Capture leads while you sleep',
        'Reduce missed responses and no-shows',
        'Answer FAQs in seconds, not hours',
    ];

    const steps = [
        { title: 'Connect', desc: 'Link your phone, inbox, or website' },
        { title: 'Train', desc: 'Add FAQs, pricing, and policies' },
        { title: 'Launch', desc: 'Go live in under 30 minutes' },
    ];

    return (
        <div className="min-h-screen bg-[#0b111d] text-white relative overflow-hidden">
            <style>{`
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes floatSlow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-12px); }
                }
            `}</style>

            {/* Atmospheric background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,117,76,0.16),_transparent_55%),radial-gradient(circle_at_20%_80%,_rgba(56,189,248,0.12),_transparent_52%),linear-gradient(120deg,_#0b111d_0%,_#0c1424_55%,_#0b111d_100%)]"></div>
            <div className="absolute inset-0 bg-[linear-gradient(110deg,_rgba(255,255,255,0.04)_0%,_rgba(255,255,255,0)_35%,_rgba(255,255,255,0.04)_65%,_rgba(255,255,255,0)_100%)] opacity-40"></div>
            <div className="absolute -top-16 -right-32 h-[420px] w-[420px] rounded-full bg-chippy-coral/20 blur-[140px] animate-[floatSlow_9s_ease-in-out_infinite]"></div>
            <div className="absolute bottom-0 -left-20 h-[320px] w-[320px] rounded-full bg-sky-400/10 blur-[120px]"></div>

            <div className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-10 lg:pt-14">
                {/* Top bar */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Chippy" className="w-11 h-11 rounded-2xl shadow-lg shadow-black/20" />
                        <div>
                            <p className="text-white font-semibold text-lg tracking-tight">Chippy</p>
                            <p className="text-xs text-white/50 uppercase tracking-[0.3em]">Free Trial</p>
                        </div>
                    </div>
                    <a
                        href="https://hellochippy.com"
                        className="text-white/60 hover:text-white transition-colors flex items-center gap-2 text-sm"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to site</span>
                    </a>
                </div>

                <div className="mt-12 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] items-start">
                    {/* Left: Story */}
                    <div className="space-y-10 animate-[fadeUp_0.7s_ease-out]">
                        <div className="space-y-6 max-w-xl">
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.24em] text-white/70">
                                AI Receptionist
                                <span className="h-1.5 w-1.5 rounded-full bg-chippy-coral"></span>
                                Built for service teams
                            </p>
                            <h1 className="text-4xl md:text-5xl font-semibold leading-[1.05] tracking-tight">
                                Turn every incoming message into a booked appointment.
                            </h1>
                            <p className="text-lg text-white/70 leading-relaxed">
                                Chippy answers questions instantly, captures lead details, and schedules clients
                                even when your team is off the clock. Spend less time on inboxes and more time
                                doing the work you love.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {outcomes.map((item, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80"
                                    >
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Feature grid */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {features.map((feature, index) => (
                                <div
                                    key={index}
                                    className="rounded-2xl border border-white/10 bg-white/5 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10"
                                >
                                    <feature.icon className="w-5 h-5 text-chippy-coral mb-3" />
                                    <h3 className="text-white font-medium text-sm mb-1">{feature.title}</h3>
                                    <p className="text-white/60 text-xs">{feature.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* How it works */}
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                            <p className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4">How it works</p>
                            <div className="grid gap-4 sm:grid-cols-3">
                                {steps.map((step, index) => (
                                    <div key={index} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <p className="text-xs text-white/40 mb-2">0{index + 1}</p>
                                        <p className="text-white font-medium text-sm mb-1">{step.title}</p>
                                        <p className="text-white/60 text-xs">{step.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Testimonial */}
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                            <Quote className="w-7 h-7 text-chippy-coral/40 mb-4" />
                            <p className="text-white/80 text-base leading-relaxed mb-6">
                                "We went from missed calls to fully booked days. Chippy handled the FAQs and
                                now our front desk can focus on in-person clients. Bookings jumped 40% in the first month."
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-chippy-coral to-orange-500 flex items-center justify-center text-white font-semibold text-sm">
                                    MR
                                </div>
                                <div>
                                    <p className="text-white font-medium text-sm">Mike Rodriguez</p>
                                    <p className="text-white/50 text-xs">Owner, Rodriguez Auto Care</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Form */}
                    <div className="w-full max-w-[440px] justify-self-center animate-[fadeUp_0.8s_ease-out]">
                        <div className="rounded-[28px] bg-gradient-to-b from-white/30 to-white/5 p-[1px] shadow-2xl shadow-black/30">
                            <div className="rounded-[27px] bg-white text-slate-900 overflow-hidden">
                                {/* Header */}
                                <div className="p-8 pb-4">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-500 mb-4">
                                        14 days free
                                    </div>
                                    <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                                        Start your Chippy trial
                                    </h2>
                                    <p className="text-slate-500 text-[15px] leading-relaxed">
                                        No credit card required. Full access to booking, messaging, and lead capture.
                                    </p>
                                </div>

                                {/* Form */}
                                <div className="px-8 pb-8">
                            {error && (
                                <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-700 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {message && (
                                <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-start gap-3 text-emerald-700 text-sm">
                                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{message}</span>
                                </div>
                            )}

                            <form onSubmit={handleSignUp} className="space-y-4">
                                {step === 1 && (
                                    <>
                                        {/* Full Name */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Full name
                                            </label>
                                            <div className="relative">
                                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                                <input
                                                    type="text"
                                                    required
                                                    value={fullName}
                                                    onChange={(e) => setFullName(e.target.value)}
                                                    onBlur={() => handleBlur('fullName')}
                                                    placeholder="Jane Smith"
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px] ${touched.fullName && !fullName.trim() ? 'border-red-300' : 'border-slate-200'
                                                        }`}
                                                />
                                            </div>
                                        </div>

                                        {/* Business Name */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Business name <span className="text-slate-400 font-normal">(optional)</span>
                                            </label>
                                            <div className="relative">
                                                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={businessName}
                                                    onChange={(e) => setBusinessName(e.target.value)}
                                                    placeholder="Acme Inc."
                                                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px]"
                                                />
                                            </div>
                                        </div>

                                        {/* Email */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Work email
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                                <input
                                                    type="email"
                                                    required
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    onBlur={() => handleBlur('email')}
                                                    placeholder="jane@company.com"
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px] ${touched.email && !email.trim() ? 'border-red-300' : 'border-slate-200'
                                                        }`}
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleNext}
                                            disabled={loading || !isStepOneValid}
                                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                                        >
                                            Continue
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                        </button>
                                    </>
                                )}

                                {step === 2 && (
                                    <>
                                        {/* Password */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Password
                                            </label>
                                            <div className="relative">
                                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    required
                                                    minLength={6}
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    onBlur={() => handleBlur('password')}
                                                    placeholder="6+ characters"
                                                    className="w-full pl-11 pr-11 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                                >
                                                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                                                </button>
                                            </div>
                                            {/* Password Strength */}
                                            {password && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="flex-1 flex gap-1">
                                                        {[1, 2, 3, 4].map(level => (
                                                            <div
                                                                key={level}
                                                                className={`h-1 flex-1 rounded-full transition-colors ${level <= passwordStrength.score
                                                                    ? passwordStrength.color
                                                                    : 'bg-slate-100'
                                                                    }`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className={`text-xs font-medium ${passwordStrength.score <= 1 ? 'text-red-500' :
                                                        passwordStrength.score <= 2 ? 'text-amber-600' :
                                                            passwordStrength.score <= 3 ? 'text-blue-600' : 'text-emerald-600'
                                                        }`}>
                                                        {passwordStrength.label}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Confirm Password */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Confirm password
                                            </label>
                                            <div className="relative">
                                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                                <input
                                                    type={showConfirmPassword ? 'text' : 'password'}
                                                    required
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    onBlur={() => handleBlur('confirmPassword')}
                                                    placeholder="Re-enter password"
                                                    className={`w-full pl-11 pr-11 py-3 bg-white border rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px] ${touched.confirmPassword && confirmPassword && !passwordsMatch
                                                        ? 'border-red-300'
                                                        : touched.confirmPassword && confirmPassword && passwordsMatch
                                                            ? 'border-emerald-300'
                                                            : 'border-slate-200'
                                                        }`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                                >
                                                    {showConfirmPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                                                </button>
                                            </div>
                                            {touched.confirmPassword && confirmPassword && !passwordsMatch && (
                                                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    Passwords don't match
                                                </p>
                                            )}
                                            {touched.confirmPassword && confirmPassword && passwordsMatch && (
                                                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Passwords match
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setStep(1)}
                                                className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl transition-all hover:border-slate-300"
                                            >
                                                Back
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={loading || !isFormValid}
                                                className="flex-[2] bg-chippy-coral hover:bg-chippy-coral-hover text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-chippy-coral/20"
                                            >
                                                {loading ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <>
                                                        Create account
                                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </form>

                            <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
                                By signing up, you agree to our{' '}
                                <a href="https://hellochippy.com/terms/" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-chippy-coral transition-colors">Terms of Service</a>
                                {' '}and{' '}
                                <a href="https://hellochippy.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-chippy-coral transition-colors">Privacy Policy</a>.
                            </p>
                                </div>

                                {/* Trial includes */}
                                <div className="px-8 pb-8">
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">Trial includes</p>
                                        <div className="grid gap-2 text-sm text-slate-600">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                Full booking + messaging access
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                Setup support from the Chippy team
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                Cancel any time, no card required
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 text-center">
                                    <span className="text-sm text-slate-500">Already have an account? </span>
                                    <a
                                        href="/auth"
                                        className="text-sm text-chippy-coral font-medium hover:underline"
                                    >
                                        Sign in
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom links */}
                <div className="mt-12 flex flex-wrap items-center justify-between gap-4 text-xs text-white/40">
                    <div className="flex flex-wrap gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Auto repair</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Med spas</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Clinics</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Home services</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <a href="https://hellochippy.com/privacy/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</a>
                        <a href="https://hellochippy.com/terms/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Terms of Service</a>
                    </div>
                </div>
            </div>
        </div>
    );
};
