import React from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { OwnerCommandChat } from '../components/OwnerCommandChat';

export const CommandCenter = () => (
  <div className="w-full space-y-6 animate-in fade-in duration-500 pb-10">
    <PageHeader
      title="Command"
      subtitle="Ask Chippy to read, draft, change, and queue owner approvals."
    />
    <OwnerCommandChat />
  </div>
);
