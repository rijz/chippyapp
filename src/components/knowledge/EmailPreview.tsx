import React from 'react';
import { Mail, User, Clock, Paperclip, MoreHorizontal, Reply, Star, Trash2 } from 'lucide-react';
import { WidgetConfig } from '../../types';

interface EmailPreviewProps {
    config: WidgetConfig;
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({ config }) => {
    const { followUp, title } = config;

    // Default values if not specified
    const subject = followUp.customerSubject || `Follow-up from ${title}`;
    const body = followUp.customerBody ||
        `Hi there,

Thanks for chatting with us! Here is a summary of our conversation.

[Chat Summary Placeholder]

If you have any other questions, feel free to reply to this email.

Best regards,
The ${title} Team`;

    return (
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200 flex flex-col h-[600px]">
            {/* Window Controls (Mock) */}
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="text-xs text-slate-500 font-medium">Message Preview</div>
                <div className="w-10"></div>
            </div>

            {/* Email Header */}
            <div className="p-6 pb-4 border-b border-slate-100">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">{subject}</h2>

                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-chippy-navy text-white flex items-center justify-center shrink-0">
                        <span className="font-bold text-sm">{title.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between">
                            <h3 className="text-sm font-semibold text-slate-900">
                                {title} <span className="text-slate-500 font-normal">&lt;{followUp.replyToEmail || 'hello@chippy.ai'}&gt;</span>
                            </h3>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {followUp.delayMinutes === 0 ? 'Immediately' : `${followUp.delayMinutes}m ago`}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                            to me
                        </div>
                    </div>
                    <div className="flex gap-2 text-slate-400">
                        <Star className="w-4 h-4 cursor-pointer hover:text-amber-400" />
                        <Reply className="w-4 h-4 cursor-pointer hover:text-slate-600" />
                        <MoreHorizontal className="w-4 h-4 cursor-pointer hover:text-slate-600" />
                    </div>
                </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 p-8 overflow-y-auto bg-white font-sans text-slate-700 leading-relaxed whitespace-pre-wrap">
                {body}

                {/* Mock Signature block if needed */}
                <div className="mt-8 pt-6 border-t border-slate-100 text-xs text-slate-400">
                    <p>Sent by Chippy IO • 123 AI Blvd, Tech City</p>
                    <p className="mt-1">Unsubscribe</p>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3">
                <button className="px-6 py-2 bg-chippy-navy text-white text-sm font-medium rounded-lg flex items-center gap-2 hover:bg-chippy-navy/90 transition-colors">
                    <Reply className="w-4 h-4" /> Reply
                </button>
                <button className="px-6 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                    Forward
                </button>
            </div>
        </div>
    );
};
