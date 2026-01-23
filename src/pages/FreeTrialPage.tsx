import React, { useState, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    BrainCircuit, Loader2, Mail, Lock, AlertCircle, CheckCircle2,
    Calendar, MessageCircle, Clock, Shield, ArrowLeft,
    User, Building2, Eye, EyeOff, ArrowRight, Quote
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

    const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

    const passwordsMatch = password === confirmPassword;
    const isFormValid = fullName.trim() && email.trim() && password.length >= 6 && passwordsMatch;

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

    const features = [
        { icon: MessageCircle, title: 'Smart Responses', desc: 'AI that sounds like you' },
        { icon: Calendar, title: 'Auto Scheduling', desc: 'Books directly to your calendar' },
        { icon: Clock, title: 'Always On', desc: 'Never miss a lead, 24/7' },
        { icon: Shield, title: 'Secure', desc: 'Enterprise-grade security' },
    ];

    return (
        <div className="min-h-screen bg-chippy-navy flex relative overflow-hidden">
            {/* Subtle background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-chippy-navy via-slate-900 to-chippy-navy"></div>
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-chippy-coral/5 rounded-full blur-[200px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[180px] pointer-events-none"></div>

            {/* Back Navigation */}
            <a
                href="https://hellochippy.com"
                className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors flex items-center gap-2 z-20 text-sm"
            >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
            </a>

            {/* Left Side - Brand & Social Proof */}
            <div className="hidden lg:flex flex-1 flex-col justify-between p-12 xl:p-16 relative z-10">
                <div>
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-16">
                        <img src="/logo.png" alt="Chippy" className="w-11 h-11 rounded-xl" />
                        <span className="text-white font-semibold text-xl tracking-tight">Chippy</span>
                    </div>

                    {/* Main Content */}
                    <div className="max-w-lg">
                        <h1 className="text-4xl xl:text-5xl font-bold text-white mb-6 leading-[1.15] tracking-tight">
                            The AI receptionist that never sleeps
                        </h1>
                        <p className="text-lg text-slate-400 leading-relaxed mb-12">
                            Handle customer inquiries, book appointments, and capture leads automatically —
                            even when you're away from your desk.
                        </p>

                        {/* Feature Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {features.map((feature, index) => (
                                <div
                                    key={index}
                                    className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-300"
                                >
                                    <feature.icon className="w-5 h-5 text-chippy-coral mb-3" />
                                    <h3 className="text-white font-medium text-sm mb-1">{feature.title}</h3>
                                    <p className="text-slate-500 text-xs">{feature.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Testimonial */}
                <div className="max-w-lg mt-12">
                    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        <Quote className="w-8 h-8 text-chippy-coral/30 mb-4" />
                        <p className="text-slate-300 text-base leading-relaxed mb-6">
                            "Chippy has been a game-changer for our auto shop. We used to miss calls
                            all the time — now every inquiry gets handled immediately. Our bookings
                            are up 40% since we started."
                        </p>
                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-chippy-coral to-orange-500 flex items-center justify-center text-white font-semibold text-sm">
                                MR
                            </div>
                            <div>
                                <p className="text-white font-medium text-sm">Mike Rodriguez</p>
                                <p className="text-slate-500 text-xs">Owner, Rodriguez Auto Care</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Sign Up Form */}
            <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative z-10">
                <div className="w-full max-w-[420px]">
                    {/* Mobile Logo */}
                    <div className="flex lg:hidden items-center gap-3 mb-8">
                        <img src="/logo.png" alt="Chippy" className="w-10 h-10 rounded-lg" />
                        <span className="text-white font-semibold text-lg">Chippy</span>
                    </div>

                    <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 overflow-hidden">
                        {/* Header */}
                        <div className="p-8 pb-0">
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                                    Start your free trial
                                </h2>
                                <p className="text-slate-500 text-[15px]">
                                    14 days free · No credit card required
                                </p>
                            </div>
                        </div>

                        {/* Form */}
                        <div className="p-8 pt-4">
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
                                            className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px] ${touched.fullName && !fullName.trim() ? 'border-red-300' : 'border-slate-200'
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
                                            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px]"
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
                                            className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px] ${touched.email && !email.trim() ? 'border-red-300' : 'border-slate-200'
                                                }`}
                                        />
                                    </div>
                                </div>

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
                                            className="w-full pl-11 pr-11 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px]"
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
                                            className={`w-full pl-11 pr-11 py-3 bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-chippy-coral/20 focus:border-chippy-coral transition-all text-[15px] ${touched.confirmPassword && confirmPassword && !passwordsMatch
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

                                <button
                                    type="submit"
                                    disabled={loading || !isFormValid}
                                    className="w-full bg-chippy-coral hover:bg-chippy-coral-hover text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed group"
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
                            </form>

                            <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
                                By signing up, you agree to our{' '}
                                <a href="https://hellochippy.com/terms/" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-chippy-coral transition-colors">Terms of Service</a>
                                {' '}and{' '}
                                <a href="https://hellochippy.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-chippy-coral transition-colors">Privacy Policy</a>.
                            </p>
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

                    {/* Mobile Features */}
                    <div className="lg:hidden mt-8 grid grid-cols-2 gap-3">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.08]"
                            >
                                <feature.icon className="w-4 h-4 text-chippy-coral mb-2" />
                                <p className="text-white text-xs font-medium">{feature.title}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer Links */}
            <div className="absolute bottom-6 w-full text-center pointer-events-none z-20">
                <div className="flex items-center justify-center gap-6 pointer-events-auto">
                    <a href="https://hellochippy.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-white transition-colors">Privacy Policy</a>
                    <a href="https://hellochippy.com/terms/" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-white transition-colors">Terms of Service</a>
                </div>
            </div>
        </div>
    );
};
