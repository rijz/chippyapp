import React from 'react';
import { ChatSessionRecord } from '../../types';

export const StatusBadge = ({ status }: { status: ChatSessionRecord['status'] }) => {
    const styles = {
        Opened: 'bg-blue-100 text-blue-600',
        Closed: 'bg-slate-100 text-slate-400',
        Archived: 'bg-amber-100 text-amber-600',
        Reviewed: 'bg-emerald-100 text-emerald-600'
    };
    return <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${styles[status]}`}>{status}</span>;
};
