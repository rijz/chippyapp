
import React, { useState } from 'react';
import { Link, FileText, Plus, CheckCircle2, Loader2, Globe, UploadCloud } from 'lucide-react';
import { useData } from '../../contexts/DataContext';

export const KnowledgeSources = () => {
    const { knowledgeData, setKnowledgeData } = useData();
    const [isAdding, setIsAdding] = useState(false);
    const [newItemType, setNewItemType] = useState<'url' | 'text' | 'file'>('url');
    const [inputValue, setInputValue] = useState('');
    const [fileName, setFileName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAddSource = async () => {
        if (!inputValue.trim() && newItemType !== 'file') return;
        if (newItemType === 'file' && !fileName) return;

        setIsProcessing(true);
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        let newSource = '';
        if (newItemType === 'url') {
            newSource = inputValue;
        } else if (newItemType === 'text') {
            newSource = `Text Snippet: ${inputValue.slice(0, 30)}...`;
        } else {
            newSource = `File: ${fileName} `;
        }

        setKnowledgeData({
            ...knowledgeData!,
            sources: [...(knowledgeData?.sources || []), newSource]
        });

        setIsProcessing(false);
        setIsAdding(false);
        setInputValue('');
        setFileName('');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name);
            // In a real app, read the file content here
            setInputValue("Extracted content preview...");
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-chippy-navy">Data Sources</h2>
                    <p className="text-slate-500 text-sm">Manage where Agent X learns from.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-chippy-navy text-white rounded-xl text-xs font-bold hover:bg-chippy-coral transition-colors"
                >
                    <Plus className="w-4 h-4" /> Add Source
                </button>
            </div>

            {/* Add Source Form */}
            {isAdding && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 animate-in zoom-in-95 duration-200">
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={() => setNewItemType('url')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${newItemType === 'url' ? 'bg-white border-chippy-coral text-chippy-navy shadow-sm' : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Website URL
                        </button>
                        <button
                            onClick={() => setNewItemType('text')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${newItemType === 'text' ? 'bg-white border-chippy-coral text-chippy-navy shadow-sm' : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Paste Text
                        </button>
                        <button
                            onClick={() => setNewItemType('file')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${newItemType === 'file' ? 'bg-white border-chippy-coral text-chippy-navy shadow-sm' : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Upload File
                        </button>
                    </div>

                    {newItemType === 'url' ? (
                        <input
                            type="url"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="https://example.com/pricing"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm mb-4 focus:ring-2 focus:ring-chippy-coral outline-none"
                            autoFocus
                        />
                    ) : newItemType === 'text' ? (
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Paste your document content here..."
                            className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 text-sm mb-4 focus:ring-2 focus:ring-chippy-coral outline-none resize-none"
                            autoFocus
                        />
                    ) : (
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 mb-4 text-center hover:bg-slate-100 transition-colors relative">
                            <input
                                type="file"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={handleFileUpload}
                                accept=".pdf,.doc,.docx,.txt"
                            />
                            {fileName ? (
                                <div className="text-chippy-navy font-bold flex items-center justify-center gap-2">
                                    <FileText className="w-6 h-6 text-chippy-coral" />
                                    {fileName}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <UploadCloud className="w-8 h-8 text-slate-400 mx-auto" />
                                    <p className="text-sm font-bold text-slate-500">Click to upload or drag and drop</p>
                                    <p className="text-xs text-slate-400">PDF, DOCX, or TXT</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setIsAdding(false)}
                            className="px-4 py-2 text-slate-400 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAddSource}
                            disabled={isProcessing}
                            className="px-6 py-2 bg-chippy-coral text-white rounded-lg text-xs font-bold hover:bg-red-400 transition-colors flex items-center gap-2"
                        >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Process & Add'}
                        </button>
                    </div>
                </div>
            )}

            {/* Sources List */}
            <div className="grid grid-cols-1 gap-4">
                {knowledgeData?.sources?.map((source, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-slate-50 text-slate-400 rounded-lg group-hover:text-chippy-navy transition-colors">
                                {source.startsWith('http') ? <Globe className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-chippy-navy truncate max-w-md">{source}</p>
                                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Processed
                                </p>
                            </div>
                        </div>
                        <Link className="w-4 h-4 text-slate-300 group-hover:text-chippy-coral transition-colors" />
                    </div>
                )) || (
                        <div className="text-center p-8 text-slate-400 italic">No sources added yet.</div>
                    )}
            </div>
        </div>
    );
};
