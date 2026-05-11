import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OwnerCommandAction, OwnerCommandMessage, OwnerCommandState } from '../types';
import {
  decideOwnerCommandAction,
  fetchOwnerCommandState,
  sendOwnerCommand,
} from '../services/ownerCommandService';

const QUICK_COMMANDS = [
  'What needs attention today?',
  'Show me what Chippy can say about pricing.',
  'List hot leads.',
  'Add a new Botox service.',
];

const riskClass: Record<string, string> = {
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  high: 'border-rose-200 bg-rose-50 text-rose-700',
};

const MessageBubble = ({ message }: { message: OwnerCommandMessage }) => {
  const isOwner = message.role === 'owner';
  return (
    <div className={`flex ${isOwner ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
        isOwner
          ? 'bg-slate-900 text-white rounded-tr-md'
          : 'bg-white border border-slate-200 text-slate-700 rounded-tl-md'
      }`}>
        {message.content}
      </div>
    </div>
  );
};

const ActionCard = ({
  action,
  onDecision,
  isProcessing,
}: {
  action: OwnerCommandAction;
  onDecision: (actionId: string, decision: 'approve' | 'deny') => void;
  isProcessing: boolean;
}) => {
  const isPending = action.status === 'needs_approval';
  return (
    <div className="border border-slate-200 bg-white rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-chippy-navy">{action.actionType.replace(/_/g, ' ')}</p>
          </div>
          <p className="text-xs text-slate-500 mt-1">Status: {action.status.replace(/_/g, ' ')}</p>
        </div>
        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full border ${riskClass[action.riskLevel] || riskClass.low}`}>
          {action.riskLevel}
        </span>
      </div>
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-auto">
        {action.previewMarkdown || 'No preview available.'}
      </div>
      {isPending && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDecision(action.id, 'approve')}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
          >
            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Approve
          </button>
          <button
            onClick={() => onDecision(action.id, 'deny')}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="w-3.5 h-3.5" />
            Deny
          </button>
        </div>
      )}
    </div>
  );
};

export const OwnerCommandChat = ({ compact = false }: { compact?: boolean }) => {
  const { session } = useAuth();
  const [state, setState] = useState<OwnerCommandState | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const pendingActions = useMemo(
    () => (state?.actions || []).filter(action => action.status === 'needs_approval'),
    [state?.actions]
  );

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [state?.messages?.length, pendingActions.length, isSending]);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setIsLoading(true);
      setError(null);
      try {
        setState(await fetchOwnerCommandState(session.access_token));
      } catch (err: any) {
        setError(err?.message || 'Failed to load owner command chat.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [session?.access_token]);

  const submitMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || !session?.access_token || isSending) return;
    setInput('');
    setIsSending(true);
    setError(null);
    try {
      setState(await sendOwnerCommand({
        accessToken: session.access_token,
        message: trimmed,
        threadId: state?.thread?.id,
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to send command.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDecision = async (actionId: string, decision: 'approve' | 'deny') => {
    if (!session?.access_token || processingActionId) return;
    setProcessingActionId(actionId);
    setError(null);
    try {
      setState(await decideOwnerCommandAction({
        accessToken: session.access_token,
        actionId,
        decision,
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to process action.');
    } finally {
      setProcessingActionId(null);
    }
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col ${compact ? 'h-[640px]' : 'h-[calc(100vh-190px)] min-h-[620px]'}`}>
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-chippy-coral/10 text-chippy-coral flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-chippy-navy">Owner Command Chat</h3>
            <p className="text-xs text-slate-500">Manage Chippy by asking, reviewing, and approving changes.</p>
          </div>
        </div>
        {pendingActions.length > 0 && (
          <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {pendingActions.length} approval{pendingActions.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto bg-slate-50 px-4 pt-5 pb-40">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading command history...
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {(state?.messages || []).length === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center mt-12">
                <Bot className="w-8 h-8 mx-auto text-chippy-coral mb-3" />
                <p className="text-sm font-semibold text-chippy-navy">Ask Chippy to manage the business.</p>
                <p className="text-xs text-slate-500 mt-1">Risky changes become approval cards before anything changes.</p>
              </div>
            )}
            {(state?.messages || []).map(message => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {pendingActions.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onDecision={handleDecision}
                isProcessing={processingActionId === action.id}
              />
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 shadow-[0_-18px_40px_-32px_rgba(15,23,42,0.45)]">
        <div className="max-w-3xl mx-auto space-y-3">
          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {QUICK_COMMANDS.map(command => (
              <button
                key={command}
                onClick={() => submitMessage(command)}
                disabled={isSending}
                className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 disabled:opacity-60"
              >
                {command}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-chippy-coral/40"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitMessage(input);
                }
              }}
              placeholder="Ask Chippy to update, summarize, draft, or show what needs attention..."
              className="flex-1 resize-none min-h-[40px] max-h-32 border-0 px-3 py-2 text-sm outline-none bg-transparent leading-6"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              aria-label="Send command"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
