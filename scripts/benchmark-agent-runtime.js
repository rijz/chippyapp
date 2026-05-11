#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createDefaultAgentRuntime, getRuntimeContractVersions } from '../agent-runtime/index.js';

const cwd = process.cwd();
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-');
const runDir = path.resolve(cwd, '.runs', 'benchmarks');
const dbPath = path.resolve(runDir, `agent-runtime-benchmark-${timestamp}.db`);
const fixturePath = path.resolve(cwd, 'fixtures', 'agent-runtime', 'tenant-lead-fixture.json');

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeDurations(durationsMs) {
  const total = durationsMs.reduce((sum, value) => sum + value, 0);
  const avg = durationsMs.length > 0 ? total / durationsMs.length : 0;
  return {
    samples: durationsMs.length,
    minMs: durationsMs.length ? Math.min(...durationsMs) : 0,
    maxMs: durationsMs.length ? Math.max(...durationsMs) : 0,
    avgMs: avg,
    p50Ms: percentile(durationsMs, 50),
    p95Ms: percentile(durationsMs, 95),
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function runBench() {
  await fs.mkdir(runDir, { recursive: true });
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const benchmarkCompany = `Benchmark ${timestamp}`;

  const runtime = createDefaultAgentRuntime({
    storageBackend: 'sqlite',
    dbPath,
    runDir,
    limits: {
      maxAgents: 5,
      maxSteps: 12,
      minReviewScore: 0.65,
    },
    policy: {
      approvalMode: 'REVIEW_REQUIRED',
      fallbackMode: 'permissive',
      maxToolCallsPerRun: 12,
      maxWriteActionsPerRun: 3,
      allowedToolScopes: ['none', 'read', 'write'],
      quietHours: {
        enabled: false,
        startHour: 22,
        endHour: 7,
      },
    },
  });

  const latencyRuns = 5;
  const latencyDurations = [];
  for (let i = 0; i < latencyRuns; i += 1) {
    const start = performance.now();
    await runtime.run({
      goal: `Benchmark latency run ${i + 1}`,
      providerId: 'local.heuristic',
      context: { source: 'benchmark' },
    });
    latencyDurations.push(performance.now() - start);
  }

  const reliabilityRuns = 10;
  let reliabilitySuccess = 0;
  const reliabilityFailures = [];
  for (let i = 0; i < reliabilityRuns; i += 1) {
    try {
      const result = await runtime.run({
        goal: `Create follow-up for lead reliability ${i + 1}`,
        providerId: 'local.heuristic',
        context: {
          source: 'benchmark',
          fixture,
          companyName: benchmarkCompany,
          leadId: 'lead-001',
        },
      });
      if (result?.id && result?.recordPath) {
        reliabilitySuccess += 1;
      } else {
        reliabilityFailures.push(`run_${i + 1}: missing id or recordPath`);
      }
    } catch (error) {
      reliabilityFailures.push(`run_${i + 1}: ${error.message}`);
    }
  }

  const runA = await runtime.run({
    goal: 'Create follow-up for lead duplicate benchmark',
    providerId: 'local.heuristic',
    executeWrites: true,
    context: {
      source: 'benchmark',
      fixture,
      companyName: benchmarkCompany,
      leadId: 'lead-001',
    },
  });
  const runB = await runtime.run({
    goal: 'Create follow-up for lead duplicate benchmark',
    providerId: 'local.heuristic',
    executeWrites: true,
    context: {
      source: 'benchmark',
      fixture,
      companyName: benchmarkCompany,
      leadId: 'lead-001',
    },
  });

  const callA = runA.tooling.toolCalls.find((call) => call.name === 'followup.send_preview') || null;
  const callB = runB.tooling.toolCalls.find((call) => call.name === 'followup.send_preview') || null;
  const duplicateSuppressed = Boolean(callA?.actionId && callB?.status === 'duplicate_suppressed' && callB?.actionId === callA?.actionId);

  let approvalFlow = {
    queued: false,
    approved: false,
    executed: false,
    runPatched: false,
    actionId: callA?.actionId || null,
    error: null,
  };

  if (callA?.actionId) {
    try {
      approvalFlow.queued = true;
      const decided = await runtime.runStore.decideAction({
        actionId: callA.actionId,
        decision: 'approve',
        decidedBy: 'benchmark',
      });
      approvalFlow.approved = decided?.status === 'approved' || decided?.status === 'executed';

      if (decided?.status !== 'executed') {
        const execution = await runtime.toolRegistry.execute(decided.toolName, {
          input: decided.input || {},
          context: decided.context || {},
          dryRun: false,
        });

        await runtime.runStore.markActionExecution({
          actionId: decided.id,
          executionStatus: 'executed',
          result: execution.result,
        });

        await runtime.runStore.patchRunToolCall({
          runId: decided.runId,
          toolCallId: decided.toolCallId,
          patch: {
            status: 'completed',
            dryRun: false,
            result: execution.result,
            idempotencyKey: execution.idempotencyKey,
            attempts: 1,
            error: null,
            endedAt: nowIso(),
          },
        });
      }

      approvalFlow.executed = true;
      const patchedRun = await runtime.runStore.load(runA.id);
      const patchedCall = patchedRun?.tooling?.toolCalls?.find((call) => call.id === callA.id);
      approvalFlow.runPatched = patchedCall?.status === 'completed' && patchedCall?.dryRun === false;
    } catch (error) {
      approvalFlow.error = error.message || String(error);
    }
  } else {
    approvalFlow.error = 'No actionId found for review-required write action';
  }

  const reliabilityRate = reliabilitySuccess / reliabilityRuns;
  const report = {
    generatedAt: now.toISOString(),
    environment: {
      provider: 'local.heuristic',
      storageBackend: 'sqlite',
      dbPath,
    },
    contractVersions: getRuntimeContractVersions(),
    metrics: {
      latency: summarizeDurations(latencyDurations),
      reliability: {
        runs: reliabilityRuns,
        success: reliabilitySuccess,
        failure: reliabilityRuns - reliabilitySuccess,
        successRate: reliabilityRate,
        failures: reliabilityFailures,
      },
      duplicateSuppression: {
        passed: duplicateSuppressed,
        firstRun: {
          runId: runA.id,
          status: callA?.status || null,
          actionId: callA?.actionId || null,
        },
        secondRun: {
          runId: runB.id,
          status: callB?.status || null,
          actionId: callB?.actionId || null,
          duplicateOf: callB?.duplicateOf || null,
          policyCode: callB?.policyCode || null,
        },
      },
      approvalFlow,
    },
    passCriteria: {
      latencyP95UnderMs: 5000,
      reliabilityMinRate: 0.95,
      duplicateSuppression: true,
      approvalFlow: true,
    },
  };

  report.summary = {
    latencyPass: report.metrics.latency.p95Ms <= report.passCriteria.latencyP95UnderMs,
    reliabilityPass: report.metrics.reliability.successRate >= report.passCriteria.reliabilityMinRate,
    duplicateSuppressionPass: report.metrics.duplicateSuppression.passed === true,
    approvalFlowPass:
      report.metrics.approvalFlow.queued &&
      report.metrics.approvalFlow.approved &&
      report.metrics.approvalFlow.executed &&
      report.metrics.approvalFlow.runPatched,
  };
  report.summary.overall =
    report.summary.latencyPass &&
    report.summary.reliabilityPass &&
    report.summary.duplicateSuppressionPass &&
    report.summary.approvalFlowPass;

  const jsonPath = path.resolve(runDir, `agent-runtime-benchmark-${timestamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const markdownPath = path.resolve(cwd, 'docs', 'AGENT_RUNTIME_BENCHMARK.md');
  const md = [
    '# Agent Runtime Benchmark',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Contract Versions',
    `- provider: ${report.contractVersions.provider}`,
    `- tool: ${report.contractVersions.tool}`,
    `- storage: ${report.contractVersions.storage}`,
    `- policy: ${report.contractVersions.policy}`,
    '',
    '## Results',
    `- overall: ${report.summary.overall ? 'PASS' : 'FAIL'}`,
    `- latency p95: ${report.metrics.latency.p95Ms.toFixed(2)} ms (threshold ${report.passCriteria.latencyP95UnderMs} ms)`,
    `- reliability: ${(report.metrics.reliability.successRate * 100).toFixed(1)}% (${report.metrics.reliability.success}/${report.metrics.reliability.runs})`,
    `- duplicate suppression: ${report.metrics.duplicateSuppression.passed ? 'PASS' : 'FAIL'}`,
    `- approval flow: ${report.summary.approvalFlowPass ? 'PASS' : 'FAIL'}`,
    '',
    '## Artifacts',
    `- benchmark json: ${jsonPath}`,
    `- benchmark db: ${dbPath}`,
  ].join('\n');

  await fs.writeFile(markdownPath, `${md}\n`, 'utf8');

  console.log(JSON.stringify({
    overall: report.summary.overall,
    jsonPath,
    markdownPath,
    latencyP95Ms: report.metrics.latency.p95Ms,
    reliabilityRate: report.metrics.reliability.successRate,
    duplicateSuppression: report.metrics.duplicateSuppression.passed,
    approvalFlowPass: report.summary.approvalFlowPass,
  }, null, 2));

  if (!report.summary.overall) {
    process.exitCode = 1;
  }
}

runBench().catch((error) => {
  console.error('Benchmark error:', error.message || error);
  process.exitCode = 1;
});
