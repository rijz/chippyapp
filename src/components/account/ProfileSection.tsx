import React, { useState } from 'react';
import { User, Camera, Mail, UserCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export const ProfileSection = () => {
    const { session } = useAuth();
    const { showToast } = useToast();
    const [displayName, setDisplayName] = useState(session?.user?.user_metadata?.full_name || 'Chippy User');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));
        setIsSaving(false);
        // In a real app, update Supabase user metadata here
        showToast("Profile updated!", 'success');
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div>
                <h2 className="text-xl font-bold text-chippy-navy">Profile Settings</h2>
                <p className="text-slate-500 text-sm">Manage your public profile and personal details.</p>
            </div>

            <div className="flex items-start gap-8">
                <div className="relative group cursor-pointer">
                    <div className="w-24 h-24 rounded-full bg-chippy-coral/10 flex items-center justify-center border-4 border-white shadow-lg overflow-hidden">
                        <UserCircle className="w-16 h-16 text-chippy-coral" />
                    </div>
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-6 h-6 text-white" />
                    </div>
                </div>

                <div className="flex-1 space-y-6 max-w-md">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Display Name</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-chippy-coral outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                        <div className="relative opacity-75">
                            <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                value={session?.user?.email || ''}
                                disabled
                                className="w-full pl-10 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 pl-1">Email cannot be changed securely without re-verification.</p>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-chippy-navy text-white rounded-xl text-sm font-bold hover:bg-chippy-coral transition-all disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};
