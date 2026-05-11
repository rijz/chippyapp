#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultAgentRuntime,
  createDefaultToolRegistry,
  ProviderRegistry,
} from '../agent-runtime/index.js';

async function withTempRuntimeDir(testFn) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chippy-agent-runtime-test-'));
  const runDir = path.join(baseDir, 'runs');
  const dbPath = path.join(runDir, 'runtime.db');
  await fs.mkdir(runDir, { recursive: true });
  try {
    return await testFn({ baseDir, runDir, dbPath });
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

function createVerboseTestProviderRegistry() {
  const registry = new ProviderRegistry();
  registry.register({
    id: 'test.verbose',
    name: 'Test Verbose',
    description: 'Deterministic provider that intentionally over-produces artifacts and risks.',
    defaultModel: 'verbose-v1',
    capabilities: {
      json: true,
      tools: false,
      autonomous: true,
    },
    create: async () => ({
      name: 'test.verbose',
      model: 'verbose-v1',
      async generate({ systemPrompt }) {
        const prompt = String(systemPrompt || '').toLowerCase();
        if (prompt.includes('supervisor')) {
          return {
            text: JSON.stringify({
              tasks: [
                {
                  title: 'Task A',
                  objective: 'Generate many artifacts and risks',
                  agentRole: 'researcher',
                  acceptanceCriteria: ['Output captured'],
                },
                {
                  title: 'Task B',
                  objective: 'Generate many artifacts and risks',
                  agentRole: 'planner',
                  acceptanceCriteria: ['Output captured'],
                },
                {
                  title: 'Task C',
                  objective: 'Generate many artifacts and risks',
                  agentRole: 'executor',
                  acceptanceCriteria: ['Output captured'],
                },
              ],
            }),
            model: 'verbose-v1',
          };
        }

        if (prompt.includes('reviewer')) {
          return {
            text: JSON.stringify({
              status: 'approved',
              score: 0.9,
              feedback: ['Outputs are acceptable.'],
              missing: [],
            }),
            model: 'verbose-v1',
          };
        }

        const deliverables = Array.from({ length: 30 }, (_, i) => `Deliverable ${i + 1}`);
        const risks = Array.from({ length: 30 }, (_, i) => `Risk ${i + 1}`);

        return {
          text: JSON.stringify({
            summary: 'Produced a verbose output payload.',
            deliverables,
            risks,
            questions: ['Question 1', 'Question 2', 'Question 3', 'Question 4'],
            nextActions: ['Action 1', 'Action 2', 'Action 3', 'Action 4', 'Action 5'],
          }),
          model: 'verbose-v1',
        };
      },
    }),
  });
  return registry;
}

async function testOutputBudgets() {
  await withTempRuntimeDir(async ({ runDir, dbPath }) => {
    const runtime = createDefaultAgentRuntime({
      providerRegistry: createVerboseTestProviderRegistry(),
      runDir,
      dbPath,
      storageBackend: 'sqlite',
      limits: {
        maxAgents: 5,
        maxSteps: 12,
        minReviewScore: 0.65,
        maxArtifacts: 7,
        maxRisks: 5,
      },
    });

    const result = await runtime.run({
      goal: 'Stress-test output budgets for deliverables and risks',
      providerId: 'test.verbose',
      context: {
        userId: 'budget-user',
        tenantId: 'budget-user',
      },
    });

    const deliverableCount = result.outputs.reduce((sum, output) => (
      sum + (Array.isArray(output?.parsed?.deliverables) ? output.parsed.deliverables.length : 0)
    ), 0);
    const riskCount = result.outputs.reduce((sum, output) => (
      sum + (Array.isArray(output?.parsed?.risks) ? output.parsed.risks.length : 0)
    ), 0);

    assert.ok(deliverableCount <= 7, `Expected deliverables <= 7, got ${deliverableCount}`);
    assert.ok(riskCount <= 5, `Expected risks <= 5, got ${riskCount}`);
    assert.ok(
      !result.verification.findings.some((finding) => finding.includes('Risk list is too large')),
      'Risk overflow finding should not appear after output budgeting.'
    );
  });
}

async function testApprovalQueueAndRunHistory() {
  await withTempRuntimeDir(async ({ runDir, dbPath }) => {
    const runtime = createDefaultAgentRuntime({
      runDir,
      dbPath,
      storageBackend: 'sqlite',
    });

    const result = await runtime.run({
      goal: 'Send follow-up email to this lead',
      providerId: 'local.heuristic',
      executeWrites: true,
      context: {
        userId: 'approval-user',
        tenantId: 'approval-user',
        leadId: 'lead-1',
        leadEmail: 'alex@example.com',
        companyName: 'Acme Services',
        fixture: {
          tenantId: 'approval-user',
          companyName: 'Acme Services',
          leads: [
            {
              id: 'lead-1',
              name: 'Alex',
              email: 'alex@example.com',
              serviceInterest: 'HVAC tune-up',
            },
          ],
        },
      },
      policy: {
        approvalMode: 'REVIEW_REQUIRED',
      },
    });

    assert.equal(result.status, 'awaiting_approval', 'Run should wait for approval when write actions are queued.');

    const actions = await runtime.runStore.listActions({
      status: 'pending_review',
      workspaceId: 'approval-user',
      limit: 20,
    });

    assert.ok(actions.length >= 1, 'Expected at least one pending approval action.');

    const runs = await runtime.runStore.listRuns({
      workspaceId: 'approval-user',
      limit: 10,
    });

    assert.ok(runs.length >= 1, 'Expected run history to include at least one run.');
    assert.equal(runs[0].id, result.id, 'Most recent run should match the executed run.');
  });
}

async function testObjectiveLifecycle() {
  await withTempRuntimeDir(async ({ runDir, dbPath }) => {
    const runtime = createDefaultAgentRuntime({
      runDir,
      dbPath,
      storageBackend: 'sqlite',
    });

    const created = await runtime.runStore.createObjective({
      workspaceId: 'objective-user',
      title: 'Daily email triage',
      goal: 'Process inbound customer emails and draft replies',
      priority: 'high',
      channel: 'app-console',
      metadata: { owner: 'ops' },
      createdBy: 'owner@example.com',
    });

    assert.ok(created?.id, 'Objective should have an id.');
    assert.equal(created.status, 'pending', 'New objective should start in pending status.');

    const listed = await runtime.runStore.listObjectives({
      workspaceId: 'objective-user',
      status: 'all',
      limit: 10,
    });
    assert.ok(listed.length >= 1, 'Objective list should include the created objective.');

    const running = await runtime.runStore.updateObjective({
      objectiveId: created.id,
      workspaceId: 'objective-user',
      patch: {
        status: 'running',
      },
    });
    assert.equal(running?.status, 'running', 'Objective status should update to running.');

    const run = await runtime.run({
      goal: created.goal,
      providerId: 'local.heuristic',
      context: {
        userId: 'objective-user',
        tenantId: 'objective-user',
      },
    });

    const completed = await runtime.runStore.updateObjective({
      objectiveId: created.id,
      workspaceId: 'objective-user',
      patch: {
        status: run.status,
        lastRunId: run.id,
        lastRunStatus: run.status,
      },
    });

    assert.equal(completed?.lastRunId, run.id, 'Objective should store last run id.');
    assert.equal(completed?.lastRunStatus, run.status, 'Objective should store last run status.');
  });
}

async function testSoulAndHeartbeat() {
  await withTempRuntimeDir(async ({ runDir, dbPath }) => {
    const runtime = createDefaultAgentRuntime({
      runDir,
      dbPath,
      storageBackend: 'sqlite',
    });

    const soul = await runtime.runStore.getSoul({ workspaceId: 'soul-user' });
    assert.ok(soul?.workspaceId, 'Soul should be created/retrieved for workspace.');

    const updatedSoul = await runtime.runStore.upsertSoul({
      workspaceId: 'soul-user',
      patch: {
        name: 'Ops Brain',
        mission: 'Keep customer operations healthy and responsive.',
        principles: ['Safety first', 'Respond fast'],
      },
      updatedBy: 'owner@example.com',
    });

    assert.equal(updatedSoul?.name, 'Ops Brain', 'Soul name should update.');
    assert.equal(updatedSoul?.mission, 'Keep customer operations healthy and responsive.', 'Soul mission should update.');
    assert.ok(Array.isArray(updatedSoul?.principles) && updatedSoul.principles.length === 2, 'Soul principles should persist.');

    const heartbeat = await runtime.runStore.recordHeartbeat({
      workspaceId: 'soul-user',
      source: 'test',
      status: 'ok',
      metrics: {
        objectivesPending: 2,
      },
      note: 'test pulse',
    });

    assert.ok(heartbeat?.id, 'Heartbeat should be recorded.');

    const summary = await runtime.runStore.getHeartbeatSummary({
      workspaceId: 'soul-user',
    });

    assert.ok(summary?.latest, 'Heartbeat summary should include latest pulse.');
    assert.equal(summary?.latest?.source, 'test', 'Heartbeat source should match last pulse.');
  });
}

async function testCapabilityTools() {
  await withTempRuntimeDir(async ({ baseDir }) => {
    const fsRoot = path.join(baseDir, 'workspace');
    await fs.mkdir(fsRoot, { recursive: true });
    await fs.writeFile(path.join(fsRoot, 'notes.txt'), 'hello capability tools\n', 'utf8');

    const registry = createDefaultToolRegistry({
      fsRoot,
      enableWebSearch: false,
      enableBrowserFetch: false,
      enableFsRead: true,
      enableFsWrite: false,
      enableShell: false,
    });

    const listed = await registry.execute('fs.list', {
      input: { path: '.', recursive: false },
      context: {},
      dryRun: true,
    });
    assert.ok(Array.isArray(listed.result.entries), 'fs.list should return entries.');
    assert.ok(
      listed.result.entries.some((item) => item.path === 'notes.txt'),
      'fs.list should include notes.txt'
    );

    const read = await registry.execute('fs.read', {
      input: { path: 'notes.txt' },
      context: {},
      dryRun: true,
    });
    assert.equal(read.result.encoding, 'utf8', 'fs.read should decode utf8 file.');
    assert.ok(
      read.result.content.includes('hello capability tools'),
      'fs.read should return file content.'
    );

    await assert.rejects(
      async () => {
        await registry.execute('fs.read', {
          input: { path: '../outside.txt' },
          context: {},
          dryRun: true,
        });
      },
      /Path escapes configured tool root/,
      'fs.read should block path traversal'
    );

    const writeBlocked = await registry.execute('fs.write', {
      input: { path: 'out.txt', content: 'blocked write' },
      context: {},
      dryRun: false,
    });
    assert.equal(writeBlocked.result.mode, 'disabled', 'fs.write should be disabled by default.');

    const shellBlocked = await registry.execute('shell.exec', {
      input: { command: 'echo', args: ['hello'] },
      context: {},
      dryRun: false,
    });
    assert.equal(shellBlocked.result.mode, 'disabled', 'shell.exec should be disabled by default.');

    const writeEnabledRegistry = createDefaultToolRegistry({
      fsRoot,
      enableFsRead: true,
      enableFsWrite: true,
      enableShell: true,
      shellAllowlist: ['echo'],
      enableWebSearch: false,
      enableBrowserFetch: false,
    });

    const wrote = await writeEnabledRegistry.execute('fs.write', {
      input: { path: 'generated/result.txt', content: 'written by test', createDirs: true },
      context: {},
      dryRun: false,
    });
    assert.equal(wrote.result.mode, 'written', 'fs.write should write when enabled.');

    const readBack = await writeEnabledRegistry.execute('fs.read', {
      input: { path: 'generated/result.txt' },
      context: {},
      dryRun: true,
    });
    assert.ok(readBack.result.content.includes('written by test'), 'fs.write output should be readable.');

    const shellRan = await writeEnabledRegistry.execute('shell.exec', {
      input: { command: 'echo', args: ['tool-ok'] },
      context: {},
      dryRun: false,
    });
    assert.equal(shellRan.result.mode, 'executed', 'shell.exec should execute when enabled.');
    assert.equal(shellRan.result.ok, true, 'shell.exec should succeed for allowlisted command.');
    assert.ok(shellRan.result.stdout.includes('tool-ok'), 'shell.exec should capture stdout.');

    const webDisabled = await writeEnabledRegistry.execute('web.search', {
      input: { query: 'hello world' },
      context: {},
      dryRun: true,
    });
    assert.equal(webDisabled.result.provider, 'disabled', 'web.search should report disabled mode in tests.');

    const browserDisabled = await writeEnabledRegistry.execute('browser.fetch_page', {
      input: { url: 'https://example.com' },
      context: {},
      dryRun: true,
    });
    assert.equal(browserDisabled.result.ok, false, 'browser.fetch_page should report disabled mode in tests.');

  });
}

async function testIterativeExecutorLoop() {
  await withTempRuntimeDir(async ({ runDir, dbPath }) => {
    const runtime = createDefaultAgentRuntime({
      runDir,
      dbPath,
      storageBackend: 'sqlite',
      limits: {
        maxAgents: 5,
        maxSteps: 10,
        minReviewScore: 0.65,
      },
    });

    const result = await runtime.run({
      goal: 'What is the capital of Canada?',
      providerId: 'local.heuristic',
      context: {
        userId: 'iterative-user',
        tenantId: 'iterative-user',
        enableIterativeExecutor: true,
        iterativeMaxSteps: 3,
      },
    });

    const iterativeCall = (result.tooling?.toolCalls || []).find((call) =>
      String(call?.reason || '').startsWith('iterative_executor_step_')
    );
    assert.ok(iterativeCall, 'Iterative loop should create at least one iterative tool call.');

    const iterativeOutput = (result.outputs || []).find((entry) => entry?.task?.id === 'iterative-executor');
    assert.ok(iterativeOutput, 'Iterative loop should append iterative-executor output.');
    assert.ok(
      String(iterativeOutput?.parsed?.summary || '').toLowerCase().includes('ottawa'),
      'Iterative output should include direct final answer for capital of Canada.'
    );

    assert.equal(
      result?.execution?.iterativeExecutor?.enabled,
      true,
      'Run execution metadata should include iterative executor state.'
    );
  });
}

async function main() {
  const tests = [
    ['output budgets', testOutputBudgets],
    ['approval queue and run history', testApprovalQueueAndRunHistory],
    ['objective lifecycle', testObjectiveLifecycle],
    ['soul and heartbeat', testSoulAndHeartbeat],
    ['capability tools', testCapabilityTools],
    ['iterative executor loop', testIterativeExecutorLoop],
  ];

  for (const [name, testFn] of tests) {
    process.stdout.write(`Running ${name}... `);
    await testFn();
    process.stdout.write('ok\n');
  }

  console.log('All agent runtime tests passed.');
}

main().catch((error) => {
  console.error('Agent runtime tests failed:', error?.stack || error?.message || error);
  process.exitCode = 1;
});
