import React, { useState, useEffect } from 'react';
import { Target, CheckCircle2, User, BrainCircuit, Sparkles, AlertCircle, MessageSquare, ThumbsUp, X, Edit2, Save, ArrowRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { ReviewItem } from '../types';

export const ReviewQueue = () => {
    const { reviewItems, setReviewItems, knowledgeData, setKnowledgeData } = useData();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [correctionText, setCorrectionText] = useState('');

    const [filter, setFilter] = useState<'pending' | 'history'>('pending');

    // Filter items based on active tab
    const filteredItems = reviewItems.filter(i => {
        if (filter === 'pending') return i.status === 'PENDING';
        return i.status !== 'PENDING';
    });

    // Select first item by default if none selected or if selection is filtered out
    useEffect(() => {
        // Only auto-select if we have items and (nothing selected OR current selection not in view)
        const currentItemInView = filteredItems.find(i => i.id === selectedId);

        if (filteredItems.length > 0 && !currentItemInView) {
            setSelectedId(filteredItems[0].id);
        } else if (filteredItems.length === 0) {
            setSelectedId(null);
        }
    }, [filter, filteredItems.length]); // Intentionally omitting selectedId to prevent loop, checking logic inside

    const selectedItem = reviewItems.find(i => i.id === selectedId);

    // Reset editing state when selection changes
    useEffect(() => {
        setIsEditing(false);
        setCorrectionText('');
    }, [selectedId]);

    const handleApprove = () => {
        if (!selectedId) return;
        updateItemStatus(selectedId, 'DISMISSED'); // "Dismissed" from queue = Approved/Done
    };

    const handleDismiss = () => {
        if (!selectedId) return;
        updateItemStatus(selectedId, 'DISMISSED');
    };

    const handleSaveCorrection = () => {
        if (!selectedId || !correctionText.trim()) return;

        // 1. Update the item
        setReviewItems(prev => prev.map(item =>
            item.id === selectedId
                ? { ...item, status: 'CORRECTED', suggestedCorrection: correctionText }
                : item
        ));

        // 2. Add to Knowledge Base corrections (Simulated Learning)
        if (knowledgeData && selectedItem) {
            const newCorrection = {
                query: selectedItem.query,
                correction: correctionText
            };
            setKnowledgeData({
                ...knowledgeData,
                corrections: [...(knowledgeData.corrections || []), newCorrection]
            });
        }

        // Move to next item logic is handled by effect or manual selection for history
        // For pending, we usually want to select the next one.
        if (filter === 'pending') {
            const currentIndex = filteredItems.findIndex(i => i.id === selectedId);
            if (currentIndex < filteredItems.length - 1) {
                setSelectedId(filteredItems[currentIndex + 1].id);
            }
        }
    };

    const updateItemStatus = (id: string, status: ReviewItem['status']) => {
        setReviewItems(prev => prev.map(item =>
            item.id === id ? { ...item, status } : item
        ));
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6 animate-in fade-in duration-500">
            {/* LEFT SIDEBAR - LIST */}
            <div className="w-full md:w-80 shrink-0 flex flex-col gap-4">
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-chippy-navy">Review Queue</h2>

                    {/* TABS */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setFilter('pending')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${filter === 'pending'
                                ? 'bg-white text-chippy-navy shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Pending <span className="ml-1 opacity-60">({reviewItems.filter(i => i.status === 'PENDING').length})</span>
                        </button>
                        <button
                            onClick={() => setFilter('history')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${filter === 'history'
                                ? 'bg-white text-chippy-navy shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            History
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {filteredItems.length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-xs text-slate-400">
                                {filter === 'pending' ? "All caught up!" : "No history yet."}
                            </p>
                        </div>
                    ) : (
                        filteredItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setSelectedId(item.id)}
                                className={`w-full text-left p-4 rounded-xl border transition-all hover:shadow-md ${selectedId === item.id
                                    ? 'bg-white border-chippy-coral ring-1 ring-chippy-coral shadow-sm'
                                    : 'bg-white border-slate-200 hover:border-chippy-navy/30'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex gap-2">
                                        {/* Status Badge for History Items */}
                                        {item.status !== 'PENDING' && (
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${item.status === 'CORRECTED' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {item.status === 'DISMISSED' ? 'Approved' : item.status}
                                            </span>
                                        )}
                                        {item.status === 'PENDING' && (
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${item.confidence > 0.8 ? 'bg-emerald-50 text-emerald-600' :
                                                item.confidence > 0.5 ? 'bg-amber-50 text-amber-600' :
                                                    'bg-red-50 text-red-600'
                                                }`}>
                                                {Math.round(item.confidence * 100)}% Conf.
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="text-xs font-bold text-chippy-navy line-clamp-2 mb-1">"{item.query}"</p>
                                <div className="flex gap-1 overflow-hidden">
                                    {item.topics.slice(0, 2).map((t, i) => (
                                        <span key={i} className="text-[9px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100 whitespace-nowrap">{t}</span>
                                    ))}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* RIGHT PANEL - DETAIL */}
            <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-[2rem] shadow-xl overflow-hidden flex flex-col">
                {selectedItem ? (
                    <>
                        {/* Header Analysis */}
                        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-6 items-center justify-between">
                            <div className="flex gap-4">
                                <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] text-slate-400 uppercase font-black">Sentiment</p>
                                    <p className={`font-bold capitalize ${selectedItem.sentiment === 'positive' ? 'text-emerald-500' :
                                        selectedItem.sentiment === 'negative' ? 'text-red-500' :
                                            'text-slate-600'
                                        }`}>{selectedItem.sentiment}</p>
                                </div>
                                <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] text-slate-400 uppercase font-black">Status</p>
                                    <p className="font-bold text-chippy-navy capitalize">{selectedItem.status === 'DISMISSED' ? 'Approved' : selectedItem.status}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                                <AlertCircle className="w-4 h-4" />
                                <span>ID: {selectedItem.id.slice(-6)}</span>
                            </div>
                        </div>

                        {/* Conversation Flow */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                            {/* User Message */}
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    <User className="w-5 h-5 text-slate-400" />
                                </div>
                                <div className="space-y-2 max-w-2xl">
                                    <p className="text-xs font-bold text-slate-400 uppercase">User</p>
                                    <div className="p-4 bg-slate-50 rounded-2xl rounded-tl-none text-chippy-navy text-sm leading-relaxed border border-slate-100 whitespace-pre-wrap">
                                        {selectedItem.query}
                                    </div>
                                </div>
                            </div>

                            {/* AI Response */}
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-chippy-coral/10 flex items-center justify-center shrink-0">
                                    <BrainCircuit className="w-5 h-5 text-chippy-coral" />
                                </div>
                                <div className="space-y-4 w-full max-w-2xl">
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs font-bold text-chippy-coral uppercase">Agent X</p>
                                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">
                                            {Math.round(selectedItem.confidence * 100)}% Confidence
                                        </span>
                                    </div>

                                    {isEditing ? (
                                        <div className="animate-in fade-in zoom-in-95 duration-200">
                                            <textarea
                                                value={correctionText || selectedItem.response}
                                                onChange={(e) => setCorrectionText(e.target.value)}
                                                className="w-full h-64 p-4 bg-white border-2 border-chippy-coral/30 rounded-2xl rounded-tl-none text-sm text-chippy-navy focus:outline-none focus:border-chippy-coral focus:ring-4 focus:ring-chippy-coral/10 transition-all font-medium resize-none shadow-sm whitespace-pre-wrap"
                                                placeholder="Type the ideal response here..."
                                                autoFocus
                                            />
                                            <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                                                <Sparkles className="w-3 h-3 text-amber-500" />
                                                Agent X will learn from this correction for future interactions.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-chippy-navy text-white rounded-2xl rounded-tl-none text-sm leading-relaxed shadow-lg whitespace-pre-wrap">
                                                {selectedItem.response}
                                            </div>
                                            {/* Show Previous Correction if exists */}
                                            {selectedItem.suggestedCorrection && (
                                                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs text-indigo-800">
                                                    <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Your Correction</p>
                                                    <div className="whitespace-pre-wrap font-medium">{selectedItem.suggestedCorrection}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Footer */}
                        {filter === 'pending' || isEditing ? (
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                                {isEditing ? (
                                    <div className="flex gap-3 w-full justify-end">
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="px-6 py-3 rounded-xl font-bold text-xs text-slate-500 hover:bg-slate-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveCorrection}
                                            className="px-8 py-3 bg-chippy-navy text-white rounded-xl font-bold text-xs hover:bg-chippy-coral transition-all flex items-center gap-2 shadow-lg"
                                        >
                                            <Save className="w-4 h-4" />
                                            Save & Train
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleDismiss}
                                            className="flex items-center gap-2 text-slate-400 hover:text-red-500 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                            Dismiss
                                        </button>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => {
                                                    setCorrectionText(selectedItem.response);
                                                    setIsEditing(true);
                                                }}
                                                className="px-6 py-3 bg-white border border-slate-200 text-chippy-navy rounded-xl font-bold text-xs hover:border-chippy-navy transition-all flex items-center gap-2 shadow-sm"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                                Correction
                                            </button>
                                            <button
                                                onClick={handleApprove}
                                                className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-lg hover:translate-y-[-1px]"
                                            >
                                                <ThumbsUp className="w-4 h-4" />
                                                Approve
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            // Read-only Footer for History
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                                <span className="text-xs text-slate-400 italic">This item has been reviewed.</span>
                                <button
                                    onClick={() => {
                                        setCorrectionText(selectedItem.suggestedCorrection || selectedItem.response);
                                        setIsEditing(true);
                                    }}
                                    className="px-4 py-2 text-chippy-navy bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50"
                                >
                                    Edit Correction
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                        <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
                        <p className="font-medium">
                            {filter === 'pending' ? "No pending reviews" : "No history selected"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

