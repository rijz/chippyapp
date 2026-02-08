import React from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
    return (
        <header className="flex items-center justify-between gap-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-chippy-navy tracking-tight">{title}</h1>
                {subtitle ? <div className="text-sm text-slate-500 mt-1">{subtitle}</div> : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
    );
};
