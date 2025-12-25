import React, { useState } from 'react';
import { Lock, History, Shield, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { HistoryModal } from '../ui/Shared';

export const SecuritySection = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const handleUpdatePassword = async () => {
        if (!newPassword || newPassword !== confirmPassword) {
            alert("Passwords must match and not be empty.");
            return;
        }
        setIsUpdating(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            alert("Security credentials updated successfully.");
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}

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
        </div>
    );
};
