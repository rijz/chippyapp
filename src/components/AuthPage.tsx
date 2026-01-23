
import React, { useState, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { BrainCircuit, Loader2, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2, ArrowLeft, User, Eye, EyeOff } from 'lucide-react';

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
  if (score <= 4) return { score: 2, label: 'Fair', color: 'bg-yellow-500' };
  if (score <= 5) return { score: 3, label: 'Good', color: 'bg-blue-500' };
  return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
};

interface AuthPageProps {
  onBack?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = password === confirmPassword;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        // Signup validation
        if (!fullName.trim()) {
          throw new Error('Please enter your full name');
        }
        if (!passwordsMatch) {
          throw new Error('Passwords do not match');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            }
          }
        });
        if (error) throw error;
        setMessage('Check your email for the confirmation link!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset form when switching modes
  const handleModeSwitch = () => {
    setIsLogin(!isLogin);
    setError(null);
    setMessage(null);
    setFullName('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-chippy-navy flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-chippy-coral/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-500">

        {/* Back Button -> Redirects to Marketing Site */}
        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-chippy-coral hover:bg-slate-50 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="p-8 pt-12">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="Chippy" className="w-14 h-14 rounded-xl" />
          </div>

          <h2 className="text-2xl font-bold text-center text-chippy-navy mb-2">
            {isLogin ? 'Sign In' : 'Join Chippy'}
          </h2>
          <p className="text-center text-slate-500 mb-8 text-sm">
            {isLogin ? 'Access your AI front desk dashboard.' : 'Create your account to get started.'}
          </p>

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

          <form onSubmit={handleAuth} className="space-y-4">
            {/* Full Name - Only for signup */}
            {!isLogin && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    required={!isLogin}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full pl-10 pr-4 py-3 bg-chippy-gray border border-slate-200 rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-chippy-gray border border-slate-200 rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-chippy-gray border border-slate-200 rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {/* Password Strength - Only for signup */}
              {!isLogin && password && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4].map(level => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${level <= passwordStrength.score
                          ? passwordStrength.color
                          : 'bg-slate-200'
                          }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${passwordStrength.score <= 1 ? 'text-red-500' :
                    passwordStrength.score <= 2 ? 'text-yellow-600' :
                      passwordStrength.score <= 3 ? 'text-blue-600' : 'text-emerald-600'
                    }`}>
                    {passwordStrength.label}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password - Only for signup */}
            {!isLogin && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    required={!isLogin}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={`w-full pl-10 pr-4 py-3 bg-chippy-gray border rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral transition-all ${confirmPassword && !passwordsMatch ? 'border-red-300' : confirmPassword && passwordsMatch ? 'border-emerald-300' : 'border-slate-200'
                      }`}
                  />
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-500 ml-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && passwordsMatch && (
                  <p className="text-xs text-emerald-600 ml-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Passwords match
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (!isLogin && (!fullName.trim() || !passwordsMatch))}
              className="w-full bg-chippy-coral hover:bg-chippy-coral-hover text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <button
            onClick={handleModeSwitch}
            className="text-sm text-chippy-coral font-semibold"
          >
            {isLogin ? "Need an account? Sign Up" : "Have an account? Sign In"}
          </button>
        </div>
      </div>

      <div className="absolute bottom-6 w-full text-center pointer-events-none z-20">
        <div className="flex items-center justify-center gap-6 pointer-events-auto">
          <a href="https://hellochippy.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-white transition-colors">Privacy Policy</a>
          <a href="https://hellochippy.com/terms/" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-white transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  );
};
