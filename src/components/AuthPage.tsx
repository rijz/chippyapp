
import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { BrainCircuit, Loader2, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

interface AuthPageProps {
  onBack?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        const { error } = await supabase.auth.signUp({
          email,
          password,
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
            <div className="bg-chippy-coral/10 p-3 rounded-xl border border-chippy-coral/20">
              <BrainCircuit className="w-8 h-8 text-chippy-coral" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-chippy-navy mb-2">
            {isLogin ? 'Sign In' : 'Join Chippy'}
          </h2>
          <p className="text-center text-slate-500 mb-8 text-sm">
            Access your AI front desk dashboard.
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
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-chippy-gray border border-slate-200 rounded-xl text-chippy-navy outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-chippy-coral hover:bg-chippy-coral-hover text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-6"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-chippy-coral font-semibold"
          >
            {isLogin ? "Need an account? Sign Up" : "Have an account? Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
};
