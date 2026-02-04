import React from 'react';
import { ChatSessionRecord } from '../../types';

export const StatusBadge = ({ status }: { status: ChatSessionRecord['status'] }) => {
    const styles = {
        Opened: 'text-slate-600',
        Closed: 'text-slate-400',
        Archived: 'text-slate-500',
        Reviewed: 'text-slate-600'
    };
    const dotStyles = {
        Opened: 'bg-slate-400',
        Closed: 'bg-slate-300',
        Archived: 'bg-slate-300',
        Reviewed: 'bg-slate-400'
    };
    return (
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status]}`} />
            {status}
        </span>
    );
};
