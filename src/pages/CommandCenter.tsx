import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { OwnerCommandChat } from '../components/OwnerCommandChat';
import { BookOpen, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchCurrentPlaybook } from '../services/aiSetupService';

export const CommandCenter = () => {
  const { session } = useAuth();
  const [markdown, setMarkdown] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setIsLoading(true);
      try {
        const response = await fetchCurrentPlaybook(session.access_token);
        setMarkdown(response.playbookMarkdown || '');
      } catch {
        setMarkdown('');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [session?.access_token]);

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-10">
      <PageHeader
        title="Command"
        subtitle="Ask Chippy to read, draft, change, and queue owner approvals."
      />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <OwnerCommandChat />
        <aside className="bg-white border border-slate-200 rounded-2xl overflow-hidden h-[calc(100vh-190px)] min-h-[620px] flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-chippy-navy">CHIPPY.md</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-50">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading playbook...
              </div>
            ) : markdown ? (
              <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-700 font-mono">{markdown}</pre>
            ) : (
              <p className="text-sm text-slate-500">No playbook generated yet. Run AI Setup first.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
