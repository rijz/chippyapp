import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Send, ShieldAlert, UserCircle2, Wrench, XCircle } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  AgentHeartbeat,
  AgentObjective,
  AgentSoul,
  AgentRuntimeAction,
  AgentRuntimeProvider,
  AgentRuntimeRunListItem,
  AgentRuntimeRunSummary,
  createAgentRuntimeObjective,
  fetchAgentRuntimeHeartbeat,
  fetchAgentRuntimeRun,
  fetchAgentRuntimeProviders,
  fetchAgentRuntimeSoul,
  listAgentRuntimeObjectives,
  listAgentRuntimeRuns,
  listAgentRuntimeActions,
  processAgentRuntimeAction,
  runAgentRuntimeObjective,
  runAgentRuntimeChat,
  tickAgentRuntimeHeartbeat,
  updateAgentRuntimeSoul,
} from '../services/agentRuntimeService';

type UiMessageRole = 'assistant' | 'user' | 'system';
type ApprovalMode = 'AUTO' | 'REVIEW_REQUIRED' | 'BLOCKED';

interface UiMessage {
  id: string;
  role: UiMessageRole;
  text: string;
  createdAt: string;
}

const QUICK_GOALS = [
  'Manage customer email and draft replies for today.',
  'Review open leads and suggest next follow-up actions.',
  'Check booking demand and summarize bottlenecks.',
];

const formatRunStatus = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const statusClassByRun: Record<string, string> = {
  completed: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  awaiting_approval: 'text-amber-700 bg-amber-50 border-amber-200',
  needs_revision: 'text-rose-700 bg-rose-50 border-rose-200',
  blocked_policy: 'text-rose-700 bg-rose-50 border-rose-200',
};

export const AgentConsole = () => {
  const { session } = useAuth();
  const [providers, setProviders] = useState<AgentRuntimeProvider[]>([]);
  const [providerId, setProviderId] = useState('gemini.flash');
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('REVIEW_REQUIRED');
  const [executeWrites, setExecuteWrites] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask for a business task and I will orchestrate agents to plan and execute it.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [latestRun, setLatestRun] = useState<AgentRuntimeRunSummary | null>(null);
  const [recentRuns, setRecentRuns] = useState<AgentRuntimeRunListItem[]>([]);
  const [objectives, setObjectives] = useState<AgentObjective[]>([]);
  const [soul, setSoul] = useState<AgentSoul | null>(null);
  const [heartbeat, setHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [soulName, setSoulName] = useState('');
  const [soulMission, setSoulMission] = useState('');
  const [soulPrinciplesText, setSoulPrinciplesText] = useState('');
  const [objectiveTitle, setObjectiveTitle] = useState('');
  const [objectiveGoal, setObjectiveGoal] = useState('');
  const [objectivePriority, setObjectivePriority] = useState('normal');
  const [pendingActions, setPendingActions] = useState<AgentRuntimeAction[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingSoul, setIsSavingSoul] = useState(false);
  const [isTickingHeartbeat, setIsTickingHeartbeat] = useState(false);
  const [isCreatingObjective, setIsCreatingObjective] = useState(false);
  const [runningObjectiveId, setRunningObjectiveId] = useState<string | null>(null);
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, isRunning]);

  const appendMessage = (role: UiMessageRole, text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role,
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const refreshRuns = async (accessToken: string) => {
    const runs = await listAgentRuntimeRuns({ accessToken, limit: 15, status: 'all' });
    setRecentRuns(runs);
  };

  const refreshObjectives = async (accessToken: string) => {
    const rows = await listAgentRuntimeObjectives({ accessToken, status: 'all', limit: 25 });
    setObjectives(rows);
  };

  const refreshHeartbeat = async (accessToken: string) => {
    const value = await fetchAgentRuntimeHeartbeat({ accessToken });
    setHeartbeat(value);
  };

  const loadInitialData = async () => {
    if (!session?.access_token) return;
    setIsLoadingProviders(true);
    setError(null);
    try {
      const [providerList, queuedActions, runs, objectiveRows, soulValue, heartbeatValue] = await Promise.all([
        fetchAgentRuntimeProviders(session.access_token),
        listAgentRuntimeActions({ accessToken: session.access_token, status: 'pending_review', limit: 20 }),
        listAgentRuntimeRuns({ accessToken: session.access_token, limit: 15, status: 'all' }),
        listAgentRuntimeObjectives({ accessToken: session.access_token, status: 'all', limit: 25 }),
        fetchAgentRuntimeSoul({ accessToken: session.access_token }),
        fetchAgentRuntimeHeartbeat({ accessToken: session.access_token }),
      ]);
      setProviders(providerList);
      if (providerList.length > 0 && !providerList.some((p) => p.id === providerId)) {
        setProviderId(providerList[0].id);
      }
      setPendingActions(queuedActions);
      setRecentRuns(runs);
      setObjectives(objectiveRows);
      setSoul(soulValue);
      setSoulName(soulValue?.name || '');
      setSoulMission(soulValue?.mission || '');
      setSoulPrinciplesText(Array.isArray(soulValue?.principles) ? soulValue.principles.join('\n') : '');
      setHeartbeat(heartbeatValue);
    } catch (err: any) {
      setError(err?.message || 'Failed to load runtime providers.');
    } finally {
      setIsLoadingProviders(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const pendingCountLabel = useMemo(() => {
    if (pendingActions.length === 0) return 'No approvals pending';
    if (pendingActions.length === 1) return '1 approval pending';
    return `${pendingActions.length} approvals pending`;
  }, [pendingActions.length]);

  const handleRun = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isRunning || !session?.access_token) return;

    setError(null);
    setInputText('');
    appendMessage('user', trimmed);
    setIsRunning(true);

    try {
      const result = await runAgentRuntimeChat({
        accessToken: session.access_token,
        message: trimmed,
        providerId,
        executeWrites,
        approvalMode,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setLatestRun(result.run);
      setPendingActions(result.pendingActions || []);
      appendMessage('assistant', result.assistantMessage || 'Run finished without a summarized response.');

      if (result.pendingActions.length > 0) {
        appendMessage('system', `Run requires approval for ${result.pendingActions.length} write action(s).`);
      } else if (result.run.status === 'completed') {
        appendMessage('system', 'Run completed with no pending approvals.');
      }

      await refreshRuns(session.access_token);
      await refreshObjectives(session.access_token);
      await refreshHeartbeat(session.access_token);
    } catch (err: any) {
      const message = err?.message || 'Failed to execute agent run.';
      setError(message);
      appendMessage('system', `Execution failed: ${message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleActionDecision = async (actionId: string, decision: 'approve' | 'deny') => {
    if (!session?.access_token || processingActionId) return;
    setProcessingActionId(actionId);
    setError(null);
    try {
      const result = await processAgentRuntimeAction({
        accessToken: session.access_token,
        actionId,
        decision,
      });

      setPendingActions(result.pendingActions || []);
      if (result.run) {
        setLatestRun(result.run);
      }

      const verb = decision === 'approve' ? 'approved' : 'denied';
      appendMessage('system', `Action ${actionId} ${verb}. ${result.message}`);
      await refreshRuns(session.access_token);
      await refreshObjectives(session.access_token);
      await refreshHeartbeat(session.access_token);
    } catch (err: any) {
      const message = err?.message || 'Failed to process action.';
      setError(message);
      appendMessage('system', `Action failed: ${message}`);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleSelectRun = async (runId: string) => {
    if (!session?.access_token || !runId) return;
    setError(null);
    try {
      const run = await fetchAgentRuntimeRun({
        accessToken: session.access_token,
        runId,
      });
      setLatestRun(run);
    } catch (err: any) {
      setError(err?.message || 'Failed to load run.');
    }
  };

  const handleCreateObjective = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.access_token || isCreatingObjective) return;

    const goal = objectiveGoal.trim();
    if (!goal) return;

    setError(null);
    setIsCreatingObjective(true);
    try {
      await createAgentRuntimeObjective({
        accessToken: session.access_token,
        title: objectiveTitle.trim() || undefined,
        goal,
        priority: objectivePriority,
        channel: 'app-console',
      });
      setObjectiveTitle('');
      setObjectiveGoal('');
      setObjectivePriority('normal');
      appendMessage('system', 'Mission created and added to objective queue.');
      await refreshObjectives(session.access_token);
      await refreshHeartbeat(session.access_token);
    } catch (err: any) {
      const message = err?.message || 'Failed to create objective.';
      setError(message);
      appendMessage('system', `Objective creation failed: ${message}`);
    } finally {
      setIsCreatingObjective(false);
    }
  };

  const handleRunObjective = async (objectiveId: string) => {
    if (!session?.access_token || !objectiveId || runningObjectiveId) return;
    setError(null);
    setRunningObjectiveId(objectiveId);
    try {
      const result = await runAgentRuntimeObjective({
        accessToken: session.access_token,
        objectiveId,
        providerId,
        approvalMode,
        executeWrites,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setLatestRun(result.run);
      setPendingActions(result.pendingActions || []);
      appendMessage('assistant', result.assistantMessage || `Objective ${objectiveId} executed.`);
      await Promise.all([
        refreshRuns(session.access_token),
        refreshObjectives(session.access_token),
        refreshHeartbeat(session.access_token),
      ]);
    } catch (err: any) {
      const message = err?.message || 'Failed to run objective.';
      setError(message);
      appendMessage('system', `Objective run failed: ${message}`);
    } finally {
      setRunningObjectiveId(null);
    }
  };

  const handleSaveSoul = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.access_token || isSavingSoul) return;

    setError(null);
    setIsSavingSoul(true);
    try {
      const principles = soulPrinciplesText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20);

      const updated = await updateAgentRuntimeSoul({
        accessToken: session.access_token,
        patch: {
          name: soulName.trim() || 'Business Brain',
          mission: soulMission.trim() || 'Operate and improve business workflows safely.',
          principles,
        },
      });

      setSoul(updated);
      appendMessage('system', 'Soul updated. New runs will follow this operating identity.');
      await refreshHeartbeat(session.access_token);
    } catch (err: any) {
      const message = err?.message || 'Failed to update soul.';
      setError(message);
      appendMessage('system', `Soul update failed: ${message}`);
    } finally {
      setIsSavingSoul(false);
    }
  };

  const handleHeartbeatPulse = async () => {
    if (!session?.access_token || isTickingHeartbeat) return;
    setError(null);
    setIsTickingHeartbeat(true);
    try {
      const updated = await tickAgentRuntimeHeartbeat({
        accessToken: session.access_token,
        source: 'agent-console',
        status: 'ok',
        note: 'Manual pulse from console',
      });
      setHeartbeat(updated);
    } catch (err: any) {
      const message = err?.message || 'Failed to pulse heartbeat.';
      setError(message);
      appendMessage('system', `Heartbeat pulse failed: ${message}`);
    } finally {
      setIsTickingHeartbeat(false);
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="Agent Console"
        subtitle="In-app control surface for multi-agent execution before external channels."
      />

      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Provider</span>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={isLoadingProviders || isRunning}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.defaultModel || 'default'})
                </option>
              ))}
              {providers.length === 0 && <option value="gemini.flash">Gemini Flash (gemini-2.0-flash)</option>}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approval Mode</span>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white"
              value={approvalMode}
              onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)}
              disabled={isRunning}
            >
              <option value="REVIEW_REQUIRED">Review Required</option>
              <option value="AUTO">Auto Execute</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </label>

          <label className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 h-[42px]">
            <input
              type="checkbox"
              checked={executeWrites}
              onChange={(e) => setExecuteWrites(e.target.checked)}
              disabled={isRunning}
            />
            <span className="text-sm text-slate-700">Request live writes</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_GOALS.map((goal) => (
            <button
              key={goal}
              type="button"
              onClick={() => setInputText(goal)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {goal}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Conversation</p>
            <p className="text-xs text-slate-500">{pendingCountLabel}</p>
          </div>

          <div ref={feedRef} className="h-[460px] overflow-y-auto p-5 space-y-4 bg-slate-50">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isSystem = message.role === 'system';
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={[
                      'max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                      isUser ? 'bg-chippy-navy text-white' : '',
                      message.role === 'assistant' ? 'bg-white border border-slate-200 text-slate-800' : '',
                      isSystem ? 'bg-amber-50 border border-amber-200 text-amber-800 text-xs' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isUser ? <UserCircle2 className="w-4 h-4" /> : null}
                      {message.role === 'assistant' ? <Bot className="w-4 h-4" /> : null}
                      {isSystem ? <ShieldAlert className="w-4 h-4" /> : null}
                      <span className="font-semibold uppercase tracking-wide text-[10px]">
                        {message.role}
                      </span>
                    </div>
                    {message.text}
                  </div>
                </div>
              );
            })}

            {isRunning ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing multi-agent run...
              </div>
            ) : null}
          </div>

          <form onSubmit={handleRun} className="border-t border-slate-200 p-4 flex items-end gap-3 bg-white">
            <textarea
              className="w-full min-h-[72px] resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-chippy-coral/40"
              placeholder="Describe the business process you want agents to handle..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isRunning || !session?.access_token}
            />
            <button
              type="submit"
              disabled={isRunning || !inputText.trim() || !session?.access_token}
              className="h-10 px-4 rounded-xl bg-chippy-coral text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Run
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Heartbeat</h3>
              <button
                type="button"
                onClick={handleHeartbeatPulse}
                disabled={isTickingHeartbeat}
                className="px-2 py-1 text-[11px] rounded-md bg-slate-100 text-slate-700 disabled:opacity-50"
              >
                {isTickingHeartbeat ? 'Pulsing...' : 'Pulse'}
              </button>
            </div>
            <div className="text-xs space-y-2 text-slate-600">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="font-semibold">{heartbeat?.latest?.status || 'unknown'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Objectives Pending</span>
                <span className="font-semibold">{heartbeat?.metrics?.objectivesPending ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Approvals Pending</span>
                <span className="font-semibold">{heartbeat?.metrics?.approvalsPending ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Runs (24h)</span>
                <span className="font-semibold">{heartbeat?.metrics?.runsLast24h ?? 0}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Last pulse: {heartbeat?.latest?.createdAt ? new Date(heartbeat.latest.createdAt).toLocaleString() : 'never'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Soul</h3>
            <form onSubmit={handleSaveSoul} className="space-y-2">
              <input
                type="text"
                value={soulName}
                onChange={(e) => setSoulName(e.target.value)}
                placeholder="Identity name"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                disabled={isSavingSoul}
              />
              <textarea
                value={soulMission}
                onChange={(e) => setSoulMission(e.target.value)}
                placeholder="Mission statement"
                className="w-full min-h-[68px] resize-none border border-slate-200 rounded-lg px-3 py-2 text-sm"
                disabled={isSavingSoul}
              />
              <textarea
                value={soulPrinciplesText}
                onChange={(e) => setSoulPrinciplesText(e.target.value)}
                placeholder="Principles (one per line)"
                className="w-full min-h-[88px] resize-none border border-slate-200 rounded-lg px-3 py-2 text-xs"
                disabled={isSavingSoul}
              />
              <button
                type="submit"
                disabled={isSavingSoul}
                className="px-3 py-1.5 text-xs rounded-lg bg-chippy-navy text-white disabled:opacity-50"
              >
                {isSavingSoul ? 'Saving...' : 'Save Soul'}
              </button>
              <p className="text-[11px] text-slate-400">
                Last updated: {soul?.updatedAt ? new Date(soul.updatedAt).toLocaleString() : 'never'}
              </p>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Mission Queue</h3>
            <form onSubmit={handleCreateObjective} className="space-y-2 mb-4">
              <input
                type="text"
                placeholder="Mission title (optional)"
                value={objectiveTitle}
                onChange={(e) => setObjectiveTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                disabled={isCreatingObjective}
              />
              <textarea
                placeholder="Goal to automate (required)"
                value={objectiveGoal}
                onChange={(e) => setObjectiveGoal(e.target.value)}
                className="w-full min-h-[72px] resize-none border border-slate-200 rounded-lg px-3 py-2 text-sm"
                disabled={isCreatingObjective}
              />
              <div className="flex items-center gap-2">
                <select
                  value={objectivePriority}
                  onChange={(e) => setObjectivePriority(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                  disabled={isCreatingObjective}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button
                  type="submit"
                  disabled={isCreatingObjective || !objectiveGoal.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-chippy-navy text-white disabled:opacity-50"
                >
                  {isCreatingObjective ? 'Adding...' : 'Add Mission'}
                </button>
              </div>
            </form>

            {objectives.length === 0 ? (
              <p className="text-sm text-slate-500">No missions queued yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {objectives.map((objective) => (
                  <div key={objective.id} className="border border-slate-200 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 truncate">
                        {objective.title || 'Untitled mission'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {objective.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{objective.goal}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase">{objective.priority}</span>
                      <button
                        type="button"
                        onClick={() => handleRunObjective(objective.id)}
                        disabled={runningObjectiveId === objective.id || isRunning}
                        className="px-2 py-1 text-[11px] rounded-md bg-chippy-coral text-white disabled:opacity-50"
                      >
                        {runningObjectiveId === objective.id ? 'Running...' : 'Run'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Latest Run</h3>
            {!latestRun ? (
              <p className="text-sm text-slate-500">No runs yet. Submit a task to start.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClassByRun[latestRun.status] || 'text-slate-700 bg-slate-100 border-slate-200'}`}>
                    {formatRunStatus(latestRun.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Provider</span>
                  <span className="text-slate-700">{latestRun.provider.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Steps</span>
                  <span className="text-slate-700">{latestRun.stepsUsed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Review Score</span>
                  <span className="text-slate-700">{latestRun.review.score.toFixed(2)}</span>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Plan</p>
                  <div className="space-y-1">
                    {latestRun.plan.map((task, index) => (
                      <div key={task.id} className="text-slate-700 text-xs">
                        {index + 1}. {task.title} [{task.agentRole}]
                      </div>
                    ))}
                  </div>
                </div>
                {latestRun.verification.findings.length > 0 ? (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-slate-500 mb-1">Findings</p>
                    <div className="space-y-1">
                      {latestRun.verification.findings.map((finding) => (
                        <div key={finding} className="text-xs text-rose-700">{finding}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Recent Runs</h3>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-slate-500">No runs recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentRuns.map((run) => (
                  <button
                    type="button"
                    key={run.id}
                    onClick={() => handleSelectRun(run.id)}
                    className="w-full text-left border border-slate-200 rounded-lg p-2 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 truncate">{run.status}</span>
                      <span className="text-[11px] text-slate-500">{new Date(run.startedAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{run.goal}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Approvals</h3>
            {pendingActions.length === 0 ? (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Queue is clear.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingActions.map((action) => (
                  <div key={action.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                          <Wrench className="w-4 h-4 text-slate-500" />
                          {action.toolName}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{action.reason || 'No reason provided'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Action ID: {action.id}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleActionDecision(action.id, 'approve')}
                        disabled={processingActionId === action.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                      >
                        {processingActionId === action.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleActionDecision(action.id, 'deny')}
                        disabled={processingActionId === action.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 text-white disabled:opacity-50"
                      >
                        {processingActionId === action.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Deny'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {approvalMode === 'AUTO' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5" />
              AUTO mode can execute write tools immediately when `Request live writes` is enabled.
            </div>
          ) : null}

          {approvalMode === 'BLOCKED' ? (
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-0.5" />
              BLOCKED mode allows planning and analysis but blocks all write side-effects.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
