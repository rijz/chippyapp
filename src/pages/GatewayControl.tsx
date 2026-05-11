import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Shield,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchGatewayControlHealth,
  fetchGatewayControlLogs,
  runGatewayRepairAction,
  type GatewayControlHealthResponse,
  type GatewayControlLogResponse,
  type GatewayHealthStatus,
  type GatewayRepairAction,
} from '../services/gatewayService';

interface RepairActionOption {
  action: GatewayRepairAction;
  label: string;
  description: string;
}

const REPAIR_ACTIONS: RepairActionOption[] = [
  {
    action: 'clear_stale_pid_files',
    label: 'Clear Stale PID Files',
    description: 'Removes stale gateway/worker pid files when no process is alive.',
  },
  {
    action: 'start_gateway',
    label: 'Start Daemon',
    description: 'Starts the gateway daemon for this workspace.',
  },
  {
    action: 'restart_gateway',
    label: 'Restart Daemon',
    description: 'Restarts the daemon and worker processes.',
  },
  {
    action: 'restart_gateway_relink',
    label: 'Restart + Relink',
    description: 'Restarts and forces one-time fresh QR relink.',
  },
  {
    action: 'install_service',
    label: 'Install 24/7 Service',
    description: 'Installs OS-level service supervision (launchd/systemd user).',
  },
  {
    action: 'uninstall_service',
    label: 'Remove 24/7 Service',
    description: 'Removes OS-level service supervision.',
  },
];

const STATUS_STYLE: Record<GatewayHealthStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  warn: 'bg-amber-100 text-amber-700 border border-amber-200',
  error: 'bg-red-100 text-red-700 border border-red-200',
};

const ACTION_LABEL: Record<GatewayRepairAction, string> = {
  clear_stale_pid_files: 'Clear stale PID files',
  start_gateway: 'Start daemon',
  restart_gateway: 'Restart daemon',
  restart_gateway_relink: 'Restart + relink',
  install_service: 'Install 24/7 service',
  uninstall_service: 'Remove 24/7 service',
};

export const GatewayControl = () => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const accessToken = session?.access_token || '';

  const [health, setHealth] = useState<GatewayControlHealthResponse | null>(null);
  const [gatewayLog, setGatewayLog] = useState<GatewayControlLogResponse | null>(null);
  const [workerLog, setWorkerLog] = useState<GatewayControlLogResponse | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [runningRepairAction, setRunningRepairAction] = useState<GatewayRepairAction | null>(null);
  const [lastRepairSummary, setLastRepairSummary] = useState<string>('');

  const recommendedActions = useMemo(() => {
    const values = new Set<GatewayRepairAction>();
    for (const item of health?.checks || []) {
      if (item.recommendedAction) values.add(item.recommendedAction);
    }
    return Array.from(values);
  }, [health?.checks]);

  const refreshHealth = async (silent = false) => {
    if (!accessToken) return;
    if (!silent) setIsLoadingHealth(true);
    try {
      const result = await fetchGatewayControlHealth(accessToken);
      setHealth(result);
    } catch (error) {
      console.error('[GatewayControl] failed to load health:', error);
      if (!silent) {
        showToast((error as Error).message || 'Failed to load gateway health', 'error');
      }
    } finally {
      setIsLoadingHealth(false);
    }
  };

  const refreshLogs = async (silent = false) => {
    if (!accessToken) return;
    if (!silent) setIsRefreshingLogs(true);
    try {
      const [gateway, worker] = await Promise.all([
        fetchGatewayControlLogs({
          accessToken,
          target: 'gateway',
          maxChars: 6000,
        }),
        fetchGatewayControlLogs({
          accessToken,
          target: 'worker',
          maxChars: 6000,
        }),
      ]);
      setGatewayLog(gateway);
      setWorkerLog(worker);
    } catch (error) {
      console.error('[GatewayControl] failed to load logs:', error);
      if (!silent) {
        showToast((error as Error).message || 'Failed to load logs', 'error');
      }
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  const refreshAll = async (silent = false) => {
    await Promise.all([
      refreshHealth(silent),
      refreshLogs(silent),
    ]);
  };

  const runRepair = async (action: GatewayRepairAction) => {
    if (!accessToken || runningRepairAction) return;
    setRunningRepairAction(action);
    try {
      const response = await runGatewayRepairAction({
        accessToken,
        action,
      });
      setHealth(response.health);
      await refreshLogs(true);
      setLastRepairSummary(`${ACTION_LABEL[action]} completed at ${new Date().toLocaleTimeString()}`);
      showToast(`${ACTION_LABEL[action]} completed`, 'success');
    } catch (error) {
      console.error('[GatewayControl] repair action failed:', error);
      showToast((error as Error).message || 'Repair action failed', 'error');
    } finally {
      setRunningRepairAction(null);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setHealth(null);
      setGatewayLog(null);
      setWorkerLog(null);
      return;
    }
    refreshAll();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    if (!health?.gateway?.gateway?.running && !health?.service?.active) return;
    const timer = window.setInterval(() => {
      refreshAll(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [accessToken, health?.gateway?.gateway?.running, health?.service?.active]);

  const daemonRunning = health?.gateway?.gateway?.running === true;
  const workerRunning = health?.whatsapp?.gateway?.running === true;
  const pendingPairings = health?.whatsapp?.pendingPairings?.length || 0;

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="Gateway Control"
        subtitle="Operational controls, health checks, logs, and repairs for your always-on agent gateway."
      />

      {!accessToken ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-slate-500 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Sign in required</p>
            <p className="text-sm text-slate-500">You need an authenticated workspace to use gateway controls.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-chippy-navy" />
              <p className="text-sm text-slate-600">
                Last refresh: {health?.generatedAt ? new Date(health.generatedAt).toLocaleString() : 'n/a'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refreshHealth()}
                disabled={isLoadingHealth || isRefreshingLogs || Boolean(runningRepairAction)}
                className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoadingHealth ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                Refresh Health
              </button>
              <button
                onClick={() => refreshLogs()}
                disabled={isLoadingHealth || isRefreshingLogs || Boolean(runningRepairAction)}
                className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
              >
                {isRefreshingLogs ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                Refresh Logs
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Service</p>
              <p className="mt-2 text-base font-semibold text-slate-800">
                {health?.service?.supported
                  ? `${health.service.installed ? 'Installed' : 'Not Installed'} / ${health.service.active ? 'Active' : 'Inactive'}`
                  : 'Unsupported'}
              </p>
              <p className="text-xs text-slate-500 mt-1">{health?.service?.manager || 'n/a'}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Gateway</p>
              <p className="mt-2 text-base font-semibold text-slate-800">
                {daemonRunning ? 'Running' : 'Stopped'}
              </p>
              <p className="text-xs text-slate-500 mt-1">PID: {health?.gateway?.gateway?.pid || 'n/a'}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Worker</p>
              <p className="mt-2 text-base font-semibold text-slate-800">
                {workerRunning ? 'Running' : 'Stopped'}
              </p>
              <p className="text-xs text-slate-500 mt-1">PID: {health?.whatsapp?.gateway?.pid || 'n/a'}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Pairings</p>
              <p className="mt-2 text-base font-semibold text-slate-800">{pendingPairings}</p>
              <p className="text-xs text-slate-500 mt-1">
                Auth: {health?.whatsapp?.gateway?.hasAuthSession ? 'session ready' : 'not linked'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-chippy-navy" />
              <h3 className="text-lg font-bold text-chippy-navy">Health Checks</h3>
            </div>
            {isLoadingHealth && !health ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {(health?.checks || []).map((check) => (
                  <div key={check.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{check.title}</p>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_STYLE[check.status]}`}>
                        {check.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{check.detail}</p>
                    {check.recommendedAction ? (
                      <button
                        onClick={() => runRepair(check.recommendedAction as GatewayRepairAction)}
                        disabled={Boolean(runningRepairAction)}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        Run: {ACTION_LABEL[check.recommendedAction as GatewayRepairAction]}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-chippy-navy" />
              <h3 className="text-lg font-bold text-chippy-navy">Repair Actions</h3>
            </div>
            {recommendedActions.length > 0 ? (
              <p className="text-sm text-slate-600">
                Recommended now: {recommendedActions.map((item) => ACTION_LABEL[item]).join(', ')}
              </p>
            ) : (
              <p className="text-sm text-slate-600">No urgent repairs suggested right now.</p>
            )}
            {lastRepairSummary ? <p className="text-xs text-slate-500">{lastRepairSummary}</p> : null}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {REPAIR_ACTIONS.map((item) => (
                <button
                  key={item.action}
                  onClick={() => runRepair(item.action)}
                  disabled={Boolean(runningRepairAction)}
                  className="text-left p-4 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    {runningRepairAction === item.action ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-lg font-bold text-chippy-navy mb-3">Gateway Log</h3>
              <p className="text-xs text-slate-500 mb-2">{gatewayLog?.logPath || 'n/a'}</p>
              <pre className="text-xs bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-[360px] whitespace-pre-wrap">
                {gatewayLog?.logTail || 'No gateway log output yet.'}
              </pre>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-lg font-bold text-chippy-navy mb-3">Worker Log</h3>
              <p className="text-xs text-slate-500 mb-2">{workerLog?.logPath || 'n/a'}</p>
              <pre className="text-xs bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-[360px] whitespace-pre-wrap">
                {workerLog?.logTail || 'No worker log output yet.'}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

