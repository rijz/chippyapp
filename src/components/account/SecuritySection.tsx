import React, { useState } from 'react';
import { Lock, History, Shield, CheckCircle2, AlertTriangle, Trash2, X } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { HistoryModal } from '../ui/Shared';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { deleteKnowledgeBase } from '../../services/supabaseStorage';

export const SecuritySection = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const { setKnowledgeData } = useData();
    const { showToast } = useToast();
    const { session } = useAuth();

    const handleUpdatePassword = async () => {
        if (!newPassword || newPassword !== confirmPassword) {
            showToast("Passwords must match and not be empty.", 'warning');
            return;
        }
        setIsUpdating(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            showToast("Password updated successfully!", 'success');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleResetKnowledgeBase = async () => {
        // Clear knowledge data from context (will also clear localStorage via sync effect)
        setKnowledgeData(null);
        // Clear from localStorage
        localStorage.removeItem('knowledgeData');
        // Delete from Supabase
        if (session?.user?.id) {
            await deleteKnowledgeBase(session.user.id);
        }
        setShowResetConfirm(false);
        showToast('Knowledge Base has been reset. Complete onboarding to scan a new website.', 'success');
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}

            {/* Reset Knowledge Base Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-chippy-navy/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-chippy-navy">Reset Knowledge Base?</h3>
                                <p className="text-sm text-slate-500">This action cannot be undone.</p>
                            </div>
                        </div>

                        <p className="text-sm text-slate-600 mb-6">
                            This will permanently delete all scanned website data, pricing information, services, and business hours.
                            You'll need to complete the onboarding wizard again to scan a new website.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResetKnowledgeBase}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <h2 className="text-xl font-bold text-chippy-navy">Security</h2>
                <p className="text-slate-500 text-sm">Update your password and view login activity.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Shield className="w-32 h-32 text-chippy-navy" />
                </div>

                <div className="space-y-6 relative z-10">
                    <h4 className="font-bold text-chippy-navy flex items-center gap-2">
                        <Lock className="w-5 h-5 text-slate-400" />
                        Change Password
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                                placeholder="Min. 8 characters"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-chippy-coral transition-all"
                                placeholder="Re-enter password"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleUpdatePassword}
                            disabled={isUpdating}
                            className="px-6 py-2.5 bg-chippy-navy text-white rounded-xl text-sm font-bold hover:bg-chippy-coral transition-all disabled:opacity-50"
                        >
                            {isUpdating ? 'Updating...' : 'Update Password'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-chippy-navy flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-400" />
                        Audit Log
                    </h4>
                    <p className="text-sm text-slate-500 mt-1">View recent login activity and security events.</p>
                </div>
                <button
                    onClick={() => setShowHistory(true)}
                    className="px-4 py-2 bg-white border border-slate-200 shadow-sm text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-chippy-navy transition-all"
                >
                    View History
                </button>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50/50 border border-red-200 rounded-2xl p-6">
                <h4 className="font-bold text-red-700 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5" />
                    Danger Zone
                </h4>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-slate-700">Reset Knowledge Base</p>
                        <p className="text-sm text-slate-500 mt-0.5">Delete all scanned website data and start fresh.</p>
                    </div>
                    <button
                        onClick={() => setShowResetConfirm(true)}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:border-red-300 transition-all"
                    >
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
};

