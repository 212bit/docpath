import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  calculateMedian,
  calculateTokenDrift,
  detectTaskSpikes,
  calculateComplianceSummary,
  probeActiveTaskMetrics,
  generateRemediations,
  aggregateToolAttributions,
  aggregateToolInefficiencies,
  aggregateMonitorMetrics,
  aggregateTaskMetrics,
  formatTokens,
  extractStepTelemetrySlices,
  calculateDocPathValueRoi,
  collectTaskMetrics,
  detectWorkflowFrictions,
  aggregateWorkflowFrictions,
  aggregateDocPathCliOverhead,
  calculateDocPathEfficacy,
  aggregateDocPathCliFriction,
} from '../dist/utils/task-metrics.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspaceWithTasks(tasks = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-monitor-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: monitor-test\n');

  try {
    execSync('git init -b main', { cwd, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd, stdio: 'ignore' });
    writeFileSync(join(cwd, 'initial.txt'), 'init content\n');
    execSync('git add . && git commit -m "initial commit"', { cwd, stdio: 'ignore' });
  } catch {
    // 容错
  }

  const jsonlContent = tasks.map((t) => JSON.stringify(t)).join('\n') + (tasks.length > 0 ? '\n' : '');
  writeFileSync(join(dp, 'workspace', 'task-metrics.jsonl'), jsonlContent);

  for (const t of tasks) {
    const taskDir = join(dp, 'tasks', 'done', t.taskId);
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'metrics.json'), JSON.stringify(t, null, 2));
  }

  return cwd;
}

function mkWorkspaceWithActiveTask({
  taskId = 'T-20260930-active',
  taskTitle = 'Active In-Flight Task',
  profile = 'standard',
  level = 2,
  phase = 'execution',
  currentStep = 'S1',
  steps = [
    { id: 'S1', title: 'Implement probe', status: 'in_progress' },
    { id: 'S2', title: 'Add CLI tests', status: 'pending' },
  ],
  breadcrumbs = [
    { timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(), step: 'S1', status: 'active' },
  ],
  idle = false,
} = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-monitor-active-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: active-task-test\n');

  try {
    execSync('git init -b main', { cwd, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd, stdio: 'ignore' });
    writeFileSync(join(cwd, 'sample.txt'), 'line1\nline2\n');
    execSync('git add . && git commit -m "initial commit"', { cwd, stdio: 'ignore' });
  } catch {
    // ignore
  }

  if (idle) {
    writeFileSync(
      join(dp, 'workspace', 'state.json'),
      JSON.stringify({
        level: 1,
        workflow_profile: 'standard',
        task_id: '',
        phase: 'idle',
        current_step: '',
      }, null, 2)
    );
    return cwd;
  }

  // 写入 state.json
  writeFileSync(
    join(dp, 'workspace', 'state.json'),
    JSON.stringify({
      level,
      workflow_profile: profile,
      task_id: taskId,
      task_title: taskTitle,
      backlog_id: 'R-451',
      phase,
      current_step: currentStep,
      started_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, null, 2)
  );

  // 写入 spec.json
  writeFileSync(
    join(dp, 'tasks', 'current', 'spec.json'),
    JSON.stringify({
      id: taskId,
      title: taskTitle,
      backlog_id: 'R-451',
      workflow_profile: profile,
    }, null, 2)
  );

  // 写入 plan.json
  writeFileSync(
    join(dp, 'tasks', 'current', 'plan.json'),
    JSON.stringify({
      task_id: taskId,
      steps,
    }, null, 2)
  );

  // 写入 breadcrumb.jsonl
  const bcLines = breadcrumbs.map((b) => JSON.stringify(b)).join('\n') + '\n';
  writeFileSync(join(dp, 'tasks', 'current', 'breadcrumb.jsonl'), bcLines);

  return cwd;
}

describe('Token Drift, Spike Detection & Compliance Engine (R-450 / AC-3)', () => {
  it('calculates median correctly for odd and even lists', () => {
    assert.equal(calculateMedian([]), 0);
    assert.equal(calculateMedian([10]), 10);
    assert.equal(calculateMedian([10, 20, 30]), 20);
    assert.equal(calculateMedian([10, 20, 30, 40]), 25);
    assert.equal(calculateMedian([50, 10, 20]), 20);
  });

  it('computes token drift & protocol inflation rate across standard and quick profiles', () => {
    const sampleTasks = [
      {
        taskId: 'T-001',
        taskTitle: 'Standard Task 1',
        profile: 'standard',
        totalDiffLines: 100,
        completedAt: '2026-09-30T10:00:00.000Z',
        protocol: { totalInjectedTokens: 2000, specTokens: 300, planTokens: 200, rulesTokens: 1500 },
        realUsage: { totalTokens: 30000, inputTokens: 20000, outputTokens: 10000 },
      },
      {
        taskId: 'T-002',
        taskTitle: 'Standard Task 2 (Inflated)',
        profile: 'standard',
        totalDiffLines: 50,
        completedAt: '2026-09-30T10:10:00.000Z',
        protocol: { totalInjectedTokens: 2500, specTokens: 600, planTokens: 400, rulesTokens: 1500 },
        realUsage: { totalTokens: 35000, inputTokens: 25000, outputTokens: 10000 },
      },
      {
        taskId: 'T-003',
        taskTitle: 'Quick Task 1',
        profile: 'quick',
        totalDiffLines: 30,
        completedAt: '2026-09-30T10:15:00.000Z',
        protocol: { totalInjectedTokens: 800, specTokens: 100, planTokens: 100, rulesTokens: 600 },
        realUsage: { totalTokens: 6000, inputTokens: 4000, outputTokens: 2000 },
      },
    ];

    const drift = calculateTokenDrift(sampleTasks);
    assert.equal(drift.standard.taskCount, 2);
    assert.equal(drift.quick.taskCount, 1);
    assert.equal(drift.standard.baselineProtocolTokens, 2250); // median of [2000, 2500]
    assert.equal(drift.standard.baselineRealTokensMedian, 32500); // median of [30000, 35000]
    assert.ok(drift.standard.roiTokensPerLine > 0);
    assert.equal(drift.quick.baselineProtocolTokens, 800);
  });

  it('detects task token spikes (> 2.5x profile baseline median)', () => {
    const tasks = [
      {
        taskId: 'T-NORMAL-1',
        taskTitle: 'Normal Standard Task 1',
        profile: 'standard',
        completedAt: '2026-09-30T10:00:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: { totalTokens: 25000 },
      },
      {
        taskId: 'T-NORMAL-2',
        taskTitle: 'Normal Standard Task 2',
        profile: 'standard',
        completedAt: '2026-09-30T10:05:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: { totalTokens: 30000 },
      },
      {
        taskId: 'T-SPIKE',
        taskTitle: 'Spike Standard Task (>2.5x baseline)',
        profile: 'standard',
        completedAt: '2026-09-30T10:10:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: { totalTokens: 85000 }, // > 2.5 * 27500 = 68750
      },
    ];

    const drift = calculateTokenDrift(tasks);
    const spikes = detectTaskSpikes(tasks, drift);

    assert.equal(spikes.length, 1);
    assert.equal(spikes[0].taskId, 'T-SPIKE');
    assert.ok(spikes[0].spikeRatio >= 2.5);
    assert.match(spikes[0].reason, /exceeded 2.5x/);
  });

  it('aggregates compliance scores and violation distributions', () => {
    const tasks = [
      {
        taskId: 'T-01',
        complianceScore: 100,
        violations: [],
      },
      {
        taskId: 'T-02',
        complianceScore: 65,
        violations: [
          {
            ruleId: 'CR-01',
            ruleName: 'Quick Tiering Violation',
            severity: 'critical',
            description: 'Forbidden files modified',
            penalty: 35,
          },
        ],
      },
      {
        taskId: 'T-03',
        complianceScore: 85,
        violations: [
          {
            ruleId: 'CR-02',
            ruleName: 'Heavy Reads',
            severity: 'medium',
            description: 'Large file scanned',
            penalty: 15,
          },
        ],
      },
    ];

    const summary = calculateComplianceSummary(tasks);
    assert.equal(summary.avgComplianceScore, 83); // (100 + 65 + 85) / 3 = 83.33 -> 83
    assert.equal(summary.totalViolations, 2);
    assert.equal(summary.criticalViolationsCount, 1);
    assert.equal(summary.unhealthyTasksCount, 1);
    assert.equal(summary.violationsByRule['CR-01'], 1);
    assert.equal(summary.violationsByRule['CR-02'], 1);
    assert.equal(summary.violationsBySeverity.critical, 1);
    assert.equal(summary.violationsBySeverity.medium, 1);
  });
});

describe('docpath monitor Dashboard & CI Gate Command (R-450 / AC-4)', () => {
  const healthyTask = {
    taskId: 'T-HEALTHY',
    taskTitle: 'Healthy Task Implementation',
    backlogId: 'R-450',
    profile: 'standard',
    level: 2,
    startedAt: '2026-09-30T10:00:00.000Z',
    completedAt: '2026-09-30T10:10:00.000Z',
    durationMinutes: 10,
    firstTimePassRate: 100,
    complianceScore: 100,
    violations: [],
    totalDiffLines: 120,
    filesChanged: 4,
    linesAdded: 100,
    linesDeleted: 20,
    engineering: {
      turnCount: 3,
      retryCount: 0,
      firstTimePassRate: 100,
      cycleTimeMinutes: 10,
      filesChanged: 4,
      linesAdded: 100,
      linesDeleted: 20,
      totalDiffLines: 120,
      speedLinesPerMinute: 12,
    },
    protocol: {
      specTokens: 300,
      planTokens: 200,
      rulesTokens: 1800,
      totalInjectedTokens: 2300,
    },
    realUsage: {
      source: 'antigravity',
      inputTokens: 28000,
      outputTokens: 2000,
      totalTokens: 30000,
      costUsd: 0.045,
      toolCallsCount: 15,
      complianceScore: 100,
      violations: [],
    },
  };

  const unhealthyTask = {
    taskId: 'T-UNHEALTHY',
    taskTitle: 'Violating Task',
    backlogId: 'R-451',
    profile: 'quick',
    level: 1,
    startedAt: '2026-09-30T10:15:00.000Z',
    completedAt: '2026-09-30T10:25:00.000Z',
    durationMinutes: 10,
    firstTimePassRate: 80,
    complianceScore: 50,
    violations: [
      {
        ruleId: 'CR-01',
        ruleName: 'Quick Tiering Violation',
        severity: 'critical',
        description: 'Modified engine file',
        penalty: 35,
      },
      {
        ruleId: 'CR-02',
        ruleName: 'Heavy Reads',
        severity: 'medium',
        description: 'Heavy file reads in main session',
        penalty: 15,
      },
    ],
    totalDiffLines: 150,
    filesChanged: 5,
    linesAdded: 120,
    linesDeleted: 30,
    engineering: {
      turnCount: 8,
      retryCount: 2,
      firstTimePassRate: 80,
      cycleTimeMinutes: 10,
      filesChanged: 5,
      linesAdded: 120,
      linesDeleted: 30,
      totalDiffLines: 150,
      speedLinesPerMinute: 15,
    },
    protocol: {
      specTokens: 200,
      planTokens: 100,
      rulesTokens: 600,
      totalInjectedTokens: 900,
    },
    realUsage: {
      source: 'antigravity',
      inputTokens: 45000,
      outputTokens: 5000,
      totalTokens: 50000,
      costUsd: 0.08,
      toolCallsCount: 25,
      complianceScore: 50,
      violations: [
        {
          ruleId: 'CR-01',
          ruleName: 'Quick Tiering Violation',
          severity: 'critical',
          description: 'Modified engine file',
          penalty: 35,
        },
      ],
    },
  };

  it('renders human-readable monitor dashboard with health index and token telemetry', () => {
    const cwd = mkWorkspaceWithTasks([healthyTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /DocPath 智能监控大盘/);
      assert.match(stdout, /流程合规与健康度/);
      assert.match(stdout, /Token 消耗与漂移监控/);
      assert.match(stdout, /全仓健康指数:\s*🟢\s*100\s*\/\s*100/);
      assert.match(stdout, /Standard 协议体积/);
      assert.match(stdout, /T-HEALTHY/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs structured JSON telemetry with monitor --json', () => {
    const cwd = mkWorkspaceWithTasks([healthyTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdout);
      assert.equal(data.totalTasks, 1);
      assert.equal(data.healthIndex, 100);
      assert.equal(data.gatePassed, true);
      assert.equal(data.compliance.criticalViolationsCount, 0);
      assert.ok(data.drift.standard);
      assert.equal(data.recentTasks[0].taskId, 'T-HEALTHY');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs partitioned compact YAML view with monitor --agent', () => {
    const cwd = mkWorkspaceWithTasks([healthyTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /agent_view:\s*monitor_health_telemetry/);
      assert.match(stdout, /health_index:\s*100/);
      assert.match(stdout, /gate_status:\s*pass/);
      assert.match(stdout, /drift_telemetry:/);
      assert.match(stdout, /recent_tasks:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('passes CI / strict gate when health index >= threshold and 0 critical violations', () => {
    const cwd = mkWorkspaceWithTasks([healthyTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --ci --threshold 70`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /CI Gate 门禁通过/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails CI / strict gate (exit code 1) when critical violation exists or score < threshold', () => {
    const cwd = mkWorkspaceWithTasks([unhealthyTask]);
    try {
      let failed = false;
      try {
        execSync(`node "${BIN}" monitor --cwd "${cwd}" --strict --threshold 70`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      } catch (err) {
        failed = true;
        assert.equal(err.status, 1);
        const stderr = err.stderr?.toString() || '';
        assert.match(stderr, /CI Gate 门禁未通过/);
      }
      assert.ok(failed, 'monitor --strict should exit with code 1 upon critical violation');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('In-flight Active Task Telemetry Probe (FR-1 / AC-1)', () => {
  it('probeActiveTaskMetrics returns null when workspace has no active task (idle state)', async () => {
    const cwd = mkWorkspaceWithActiveTask({ idle: true });
    try {
      const active = await probeActiveTaskMetrics(cwd);
      assert.equal(active, null);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('probeActiveTaskMetrics accurately probes active task duration, step progress and telemetry', async () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-INFLIGHT-01',
      taskTitle: 'Probe Active Task Engine',
      profile: 'standard',
      level: 2,
      steps: [
        { id: 'S1', title: 'Step 1 Done', status: 'done' },
        { id: 'S2', title: 'Step 2 In Progress', status: 'in_progress' },
        { id: 'S3', title: 'Step 3 Pending', status: 'pending' },
      ],
    });
    try {
      const active = await probeActiveTaskMetrics(cwd);
      assert.ok(active !== null);
      assert.equal(active.taskId, 'T-INFLIGHT-01');
      assert.equal(active.taskTitle, 'Probe Active Task Engine');
      assert.equal(active.backlogId, 'R-451');
      assert.equal(active.profile, 'standard');
      assert.equal(active.progress.totalSteps, 3);
      assert.equal(active.progress.passedSteps, 1);
      assert.equal(active.progress.currentStep, 'S2');
      assert.equal(active.progress.currentStepTitle, 'Step 2 In Progress');
      assert.equal(active.progress.percent, 33);
      assert.ok(active.durationMinutes >= 0);
      assert.ok(typeof active.complianceScore === 'number');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor --current outputs friendly message when idle', () => {
    const cwd = mkWorkspaceWithActiveTask({ idle: true });
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /当前无进行中的活跃任务/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor --current displays detailed in-flight active telemetry for running task', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-INFLIGHT-02',
      taskTitle: 'Monitor Active Task Live UI',
      profile: 'quick',
      steps: [
        { id: 'S1', title: 'Active Step Execution', status: 'in_progress' },
      ],
    });
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /DocPath 活跃任务实时遥测/);
      assert.match(stdout, /T-INFLIGHT-02/);
      assert.match(stdout, /Monitor Active Task Live UI/);
      assert.match(stdout, /S1 \(Active Step Execution\)/);
      assert.match(stdout, /实时合规评分:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor --current --json outputs structured in-flight JSON payload', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-INFLIGHT-JSON',
      taskTitle: 'JSON Active In Flight Task',
      steps: [
        { id: 'S1', title: 'Step 1', status: 'done' },
        { id: 'S2', title: 'Step 2', status: 'in_progress' },
      ],
    });
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdout);
      assert.equal(data.active, true);
      assert.equal(data.activeTask.taskId, 'T-INFLIGHT-JSON');
      assert.equal(data.activeTask.progress.totalSteps, 2);
      assert.equal(data.activeTask.progress.passedSteps, 1);
      assert.equal(data.activeTask.progress.percent, 50);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor --current --agent outputs structured compact YAML payload', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-INFLIGHT-YAML',
      taskTitle: 'YAML Active In Flight Task',
    });
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /agent_view:\s*active_task_telemetry/);
      assert.match(stdout, /status:\s*active/);
      assert.match(stdout, /task_id:\s*T-INFLIGHT-YAML/);
      assert.match(stdout, /compliance:/);
      assert.match(stdout, /live_telemetry:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('standard docpath monitor dashboard includes in-flight active task section at top', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-INFLIGHT-DASHBOARD',
      taskTitle: 'Top Banner Task',
    });
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /活跃任务实时遥测 \(In-flight Active Task\)/);
      assert.match(stdout, /T-INFLIGHT-DASHBOARD/);
      assert.match(stdout, /DocPath 智能监控大盘/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('Actionable Remediation & Self-healing Engine (FR-2 / AC-2, AC-3, AC-4)', () => {
  it('generates REM-CR01 recommendation on CR-01 quick tiering violation', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 65,
        totalViolations: 1,
        violationsByRule: { 'CR-01': 1, 'CR-02': 0, 'CR-03': 0, 'CR-04': 0, 'CR-05': 0 },
        violationsBySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
        criticalViolationsCount: 1,
        unhealthyTasksCount: 1,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 1, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 50, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 1, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
    });

    const cr01 = recs.find((r) => r.id === 'REM-CR01');
    assert.ok(cr01);
    assert.equal(cr01.severity, 'critical');
    assert.equal(cr01.recommendedCommand, 'docpath quick upgrade');
    assert.equal(cr01.actionable, true);
    assert.match(cr01.reason, /Quick Tiering Violation/);
  });

  it('generates REM-CR02 recommendation on CR-02 heavy reads in main session', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 80,
        totalViolations: 1,
        violationsByRule: { 'CR-01': 0, 'CR-02': 2, 'CR-03': 0, 'CR-04': 0, 'CR-05': 0 },
        violationsBySeverity: { critical: 0, high: 2, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 2, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
    });

    const cr02 = recs.find((r) => r.id === 'REM-CR02');
    assert.ok(cr02);
    assert.equal(cr02.severity, 'high');
    assert.equal(cr02.recommendedCommand, 'invoke_subagent');
    assert.equal(cr02.actionable, true);
    assert.match(cr02.title, /subagents/i);
  });

  it('generates REM-CR03 recommendation on CR-03 tool flapping loops', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 75,
        totalViolations: 1,
        violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 1, 'CR-04': 0, 'CR-05': 0 },
        violationsBySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 1, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
    });

    const cr03 = recs.find((r) => r.id === 'REM-CR03');
    assert.ok(cr03);
    assert.equal(cr03.severity, 'high');
    assert.match(cr03.recommendedCommand, /node --test/);
    assert.match(cr03.reason, /Flapping Loops/);
  });

  it('generates REM-CR04 recommendation on CR-04 unrotated session', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 75,
        totalViolations: 1,
        violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 0, 'CR-04': 1, 'CR-05': 0 },
        violationsBySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 1, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
    });

    const cr04 = recs.find((r) => r.id === 'REM-CR04');
    assert.ok(cr04);
    assert.equal(cr04.severity, 'high');
    assert.match(cr04.recommendedCommand, /docpath start/);
    assert.match(cr04.title, /Rotate/i);
  });

  it('generates REM-CR05 recommendation on CR-05 missing decision brief', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 85,
        totalViolations: 1,
        violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 0, 'CR-04': 0, 'CR-05': 1 },
        violationsBySeverity: { critical: 0, high: 0, medium: 1, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 1, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
    });

    const cr05 = recs.find((r) => r.id === 'REM-CR05');
    assert.ok(cr05);
    assert.equal(cr05.severity, 'medium');
    assert.match(cr05.recommendedCommand, /docpath spec refine/);
    assert.match(cr05.reason, /Decision Brief/);
  });

  it('generates REM-PROTOCOL-INFLATION recommendation when protocol inflation rate > 10%', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 100,
        totalViolations: 0,
        violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 0, 'CR-04': 0, 'CR-05': 0 },
        violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 1, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 50, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 2, baselineProtocolTokens: 2000, recentProtocolTokens: 2500, protocolInflationRate: 25.0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 15.5,
      },
      spikes: [],
    });

    const infRec = recs.find((r) => r.id === 'REM-PROTOCOL-INFLATION');
    assert.ok(infRec);
    assert.equal(infRec.severity, 'medium');
    assert.equal(infRec.recommendedCommand, 'docpath rule dedupe');
    assert.match(infRec.reason, /exceeds 10% threshold/);
  });

  it('generates REM-TOKEN-SPIKE recommendation when task spikes are detected', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 100,
        totalViolations: 0,
        violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 0, 'CR-04': 0, 'CR-05': 0 },
        violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 2, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [
        {
          taskId: 'T-SPIKE-99',
          taskTitle: 'Massive runaway task',
          profile: 'standard',
          realTokens: 95000,
          baselineTokens: 30000,
          spikeRatio: 3.17,
          reason: 'Task real tokens exceeded 2.5x baseline',
        },
      ],
    });

    const spikeRec = recs.find((r) => r.id === 'REM-TOKEN-SPIKE');
    assert.ok(spikeRec);
    assert.equal(spikeRec.severity, 'high');
    assert.equal(spikeRec.recommendedCommand, 'docpath stats --task T-SPIKE-99');
    assert.match(spikeRec.reason, /Detected 1 task\(s\)/);
  });

  it('includes in-flight active task violations in generated remediations', () => {
    const recs = generateRemediations({
      compliance: {
        avgComplianceScore: 100,
        totalViolations: 0,
        violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 0, 'CR-04': 0, 'CR-05': 0 },
        violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 0, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 0, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
      activeTask: {
        taskId: 'T-ACTIVE-CR01',
        taskTitle: 'Active violating quick task',
        backlogId: null,
        profile: 'quick',
        level: 1,
        phase: 'execution',
        startedAt: new Date().toISOString(),
        durationMinutes: 2,
        durationSeconds: 120,
        progress: { totalSteps: 1, passedSteps: 0, blockedSteps: 0, currentStep: 'S1', percent: 0 },
        complianceScore: 65,
        violations: [
          {
            ruleId: 'CR-01',
            ruleName: 'Quick Tiering Violation',
            severity: 'critical',
            description: 'Touched core scheduler file',
            penalty: 35,
          },
        ],
        totalDiffLines: 60,
        filesChanged: 2,
        linesAdded: 50,
        linesDeleted: 10,
        realUsage: null,
      },
    });

    const cr01 = recs.find((r) => r.id === 'REM-CR01');
    assert.ok(cr01);
    assert.equal(cr01.severity, 'critical');
    assert.equal(cr01.recommendedCommand, 'docpath quick upgrade');
  });

  it('renders Actionable Recommendations section in human dashboard when violations exist', () => {
    const violatingTask = {
      taskId: 'T-VIOLATE-UI',
      taskTitle: 'Violating Task for UI check',
      profile: 'quick',
      completedAt: '2026-09-30T10:00:00.000Z',
      complianceScore: 65,
      violations: [
        {
          ruleId: 'CR-01',
          ruleName: 'Quick Tiering Violation',
          severity: 'critical',
          description: 'Scheduler edited in quick mode',
          penalty: 35,
        },
      ],
      totalDiffLines: 100,
      protocol: { totalInjectedTokens: 900 },
      realUsage: { totalTokens: 20000 },
    };

    const cwd = mkWorkspaceWithTasks([violatingTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /智能治理与自愈建议 \(Actionable Recommendations\)/);
      assert.match(stdout, /REM-CR01/);
      assert.match(stdout, /docpath quick upgrade/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('includes remediations array in monitor --json output', () => {
    const violatingTask = {
      taskId: 'T-VIOLATE-JSON',
      taskTitle: 'Violating Task for JSON check',
      profile: 'standard',
      completedAt: '2026-09-30T10:00:00.000Z',
      complianceScore: 80,
      violations: [
        {
          ruleId: 'CR-02',
          ruleName: 'Heavy Reads',
          severity: 'high',
          description: 'Large file scanned in main session',
          penalty: 20,
        },
      ],
      totalDiffLines: 100,
      protocol: { totalInjectedTokens: 2000 },
      realUsage: { totalTokens: 30000 },
    };

    const cwd = mkWorkspaceWithTasks([violatingTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdout);
      assert.ok(Array.isArray(data.remediations));
      const rem = data.remediations.find((r) => r.id === 'REM-CR02');
      assert.ok(rem);
      assert.equal(rem.severity, 'high');
      assert.equal(rem.recommendedCommand, 'invoke_subagent');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('includes remediations section in monitor --agent YAML output', () => {
    const violatingTask = {
      taskId: 'T-VIOLATE-YAML',
      taskTitle: 'Violating Task for YAML check',
      profile: 'standard',
      completedAt: '2026-09-30T10:00:00.000Z',
      complianceScore: 70,
      violations: [
        {
          ruleId: 'CR-03',
          ruleName: 'Flapping Loops',
          severity: 'high',
          description: 'Flapping test runs',
          penalty: 20,
        },
      ],
      totalDiffLines: 100,
      protocol: { totalInjectedTokens: 2000 },
      realUsage: { totalTokens: 30000 },
    };

    const cwd = mkWorkspaceWithTasks([violatingTask]);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /remediations:/);
      assert.match(stdout, /id:\s*REM-CR03/);
      assert.match(stdout, /recommended_command:\s*node --test/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  describe('Global Tool-Level Token Attribution Aggregation (FR-1 / AC-1)', () => {
    it('aggregates tool attributions across multiple tasks with accurate percentages and error counts', () => {
      const tasks = [
        {
          taskId: 'T-ATTR-1',
          taskTitle: 'Task 1',
          profile: 'standard',
          completedAt: '2026-09-30T10:00:00.000Z',
          toolAttributions: [
            {
              name: 'view_file',
              count: 5,
              inputTokens: 200,
              outputTokens: 800,
              totalTokens: 1000,
              percentage: 50.0,
              errorCount: 0,
            },
            {
              name: 'run_command',
              count: 2,
              inputTokens: 100,
              outputTokens: 400,
              totalTokens: 500,
              percentage: 25.0,
              errorCount: 1,
            },
          ],
        },
        {
          taskId: 'T-ATTR-2',
          taskTitle: 'Task 2',
          profile: 'standard',
          completedAt: '2026-09-30T10:10:00.000Z',
          realUsage: {
            totalTokens: 2500,
            inputTokens: 1500,
            outputTokens: 1000,
            source: 'antigravity',
            toolAttributions: [
              {
                name: 'view_file',
                count: 3,
                inputTokens: 100,
                outputTokens: 400,
                totalTokens: 500,
                percentage: 20.0,
                errorCount: 0,
              },
              {
                name: 'replace_file_content',
                count: 4,
                inputTokens: 500,
                outputTokens: 500,
                totalTokens: 1000,
                percentage: 40.0,
                errorCount: 0,
              },
            ],
          },
        },
      ];

      const globalAttrs = aggregateToolAttributions(tasks);

      assert.equal(globalAttrs.length, 3);
      // Total tokens across all tools: 1000 (view_file) + 500 (view_file) = 1500; 1000 (replace_file_content); 500 (run_command)
      // Grand total = 3000

      // 1. view_file: totalTokens = 1500 (50.0%)
      assert.equal(globalAttrs[0].name, 'view_file');
      assert.equal(globalAttrs[0].count, 8);
      assert.equal(globalAttrs[0].inputTokens, 300);
      assert.equal(globalAttrs[0].outputTokens, 1200);
      assert.equal(globalAttrs[0].totalTokens, 1500);
      assert.equal(globalAttrs[0].percentage, 50.0);
      assert.equal(globalAttrs[0].errorCount, 0);

      // 2. replace_file_content: totalTokens = 1000 (33.3%)
      assert.equal(globalAttrs[1].name, 'replace_file_content');
      assert.equal(globalAttrs[1].count, 4);
      assert.equal(globalAttrs[1].inputTokens, 500);
      assert.equal(globalAttrs[1].outputTokens, 500);
      assert.equal(globalAttrs[1].totalTokens, 1000);
      assert.equal(globalAttrs[1].percentage, 33.3);

      // 3. run_command: totalTokens = 500 (16.7%)
      assert.equal(globalAttrs[2].name, 'run_command');
      assert.equal(globalAttrs[2].count, 2);
      assert.equal(globalAttrs[2].errorCount, 1);
      assert.equal(globalAttrs[2].totalTokens, 500);
      assert.equal(globalAttrs[2].percentage, 16.7);
    });

    it('propagates globalToolAttributions in aggregateMonitorMetrics', async () => {
      const task = {
        taskId: 'T-GLOBAL-ATTR',
        taskTitle: 'Global Attribution Task',
        profile: 'standard',
        completedAt: '2026-09-30T10:00:00.000Z',
        totalDiffLines: 50,
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 5000,
          inputTokens: 3000,
          outputTokens: 2000,
          source: 'antigravity',
          toolAttributions: [
            {
              name: 'run_command',
              count: 3,
              inputTokens: 300,
              outputTokens: 1200,
              totalTokens: 1500,
              percentage: 30.0,
              errorCount: 0,
            },
          ],
        },
      };

      const cwd = mkWorkspaceWithTasks([task]);
      try {
        const summary = await aggregateMonitorMetrics(cwd);
        assert.ok(summary.globalToolAttributions);
        assert.equal(summary.globalToolAttributions.length, 1);
        assert.equal(summary.globalToolAttributions[0].name, 'run_command');
        assert.equal(summary.globalToolAttributions[0].totalTokens, 1500);
        assert.equal(summary.globalToolAttributions[0].percentage, 100.0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  describe('Global Tool-Level Inefficiency Aggregation & Remediations (FR-2 / AC-2, AC-3)', () => {
    it('aggregates and deduplicates tool inefficiencies across tasks and activeTask', () => {
      const tasks = [
        {
          taskId: 'T-IN-1',
          taskTitle: 'Task 1',
          profile: 'standard',
          completedAt: '2026-09-30T10:00:00.000Z',
          toolInefficiencies: [
            {
              type: 'duplicate_file_reads',
              severity: 'medium',
              tool: 'view_file',
              description: '文件 "index.ts" 被重复读取了 3 次',
              tokensWasted: 1200,
            },
            {
              type: 'oversized_command_output',
              severity: 'high',
              tool: 'run_command',
              description: 'run_command 执行产生了超长输出 (~4000 tokens)',
              tokensWasted: 3500,
            },
          ],
        },
        {
          taskId: 'T-IN-2',
          taskTitle: 'Task 2',
          profile: 'standard',
          completedAt: '2026-09-30T10:10:00.000Z',
          toolInefficiencies: [
            {
              type: 'duplicate_file_reads',
              severity: 'medium',
              tool: 'view_file',
              description: '文件 "index.ts" 被重复读取了 3 次', // duplicate finding, should be deduped
              tokensWasted: 1200,
            },
            {
              type: 'edit_target_miss',
              severity: 'high',
              tool: 'replace_file_content',
              description: 'replace_file_content 发生了 2 次目标内容不匹配',
              tokensWasted: 2500,
            },
          ],
        },
      ];

      const activeTask = {
        taskId: 'T-ACTIVE-IN',
        taskTitle: 'Active Task',
        profile: 'standard',
        level: 2,
        phase: 'execution',
        startedAt: new Date().toISOString(),
        durationMinutes: 1,
        durationSeconds: 60,
        progress: { totalSteps: 1, passedSteps: 0, blockedSteps: 0, currentStep: 'S1', percent: 0 },
        complianceScore: 100,
        violations: [],
        totalDiffLines: 10,
        filesChanged: 1,
        linesAdded: 10,
        linesDeleted: 0,
        realUsage: null,
        toolInefficiencies: [
          {
            type: 'oversized_command_output',
            severity: 'high',
            tool: 'run_command',
            description: 'run_command 产生极端输出 (~8000 tokens)',
            tokensWasted: 7500,
          },
        ],
      };

      const ineffs = aggregateToolInefficiencies(tasks, activeTask);

      assert.equal(ineffs.length, 4); // 1 active oversized + 1 task oversized + 1 edit miss + 1 dup reads (deduped)
      // High severity findings should come before medium severity findings
      assert.equal(ineffs[0].severity, 'high');
      assert.equal(ineffs[0].tokensWasted, 7500);
      assert.equal(ineffs[1].severity, 'high');
      assert.equal(ineffs[2].severity, 'high');
      assert.equal(ineffs[3].severity, 'medium');
      assert.equal(ineffs[3].type, 'duplicate_file_reads');
    });

    it('generates REM-DUP-READS, REM-OVERSIZED-OUTPUT, and REM-EDIT-MISS in generateRemediations', () => {
      const recs = generateRemediations({
        compliance: {
          avgComplianceScore: 100,
          totalViolations: 0,
          violationsByRule: { 'CR-01': 0, 'CR-02': 0, 'CR-03': 0, 'CR-04': 0, 'CR-05': 0 },
          violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
          criticalViolationsCount: 0,
          unhealthyTasksCount: 0,
        },
        drift: {
          quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
          standard: { profile: 'standard', taskCount: 1, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 0, spikeThresholdTokens: 75000 },
          overallProtocolInflationRate: 0,
        },
        spikes: [],
        toolInefficiencies: [
          {
            type: 'duplicate_file_reads',
            severity: 'medium',
            tool: 'view_file',
            description: '文件 "app.ts" 被重复读取了 4 次',
            tokensWasted: 1500,
          },
          {
            type: 'oversized_command_output',
            severity: 'high',
            tool: 'run_command',
            description: 'run_command 超长输出',
            tokensWasted: 4000,
          },
          {
            type: 'edit_target_miss',
            severity: 'high',
            tool: 'replace_file_content',
            description: 'replace_file_content 编辑失败重试',
            tokensWasted: 2000,
          },
        ],
      });

      const remDup = recs.find((r) => r.id === 'REM-DUP-READS');
      assert.ok(remDup, 'REM-DUP-READS should be generated');
      assert.equal(remDup.severity, 'medium');
      assert.equal(remDup.recommendedCommand, 'invoke_subagent');
      assert.match(remDup.reason, /repeated file read pattern/);

      const remOversized = recs.find((r) => r.id === 'REM-OVERSIZED-OUTPUT');
      assert.ok(remOversized, 'REM-OVERSIZED-OUTPUT should be generated');
      assert.equal(remOversized.severity, 'high');
      assert.match(remOversized.recommendedCommand, /node --test/);
      assert.match(remOversized.reason, /oversized command output/);

      const remEdit = recs.find((r) => r.id === 'REM-EDIT-MISS');
      assert.ok(remEdit, 'REM-EDIT-MISS should be generated');
      assert.equal(remEdit.severity, 'high');
      assert.equal(remEdit.recommendedCommand, 'docpath check');
      assert.match(remEdit.reason, /replace target miss/);
    });

    it('renders tool-level telemetry breakdown and tool inefficiencies in docpath monitor human dashboard', () => {
      const task = {
        taskId: 'T-TOOL-UI',
        taskTitle: 'Tool Breakdown UI Task',
        profile: 'standard',
        completedAt: '2026-09-30T10:00:00.000Z',
        totalDiffLines: 80,
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 12000,
          inputTokens: 8000,
          outputTokens: 4000,
          source: 'antigravity',
          toolAttributions: [
            {
              name: 'view_file',
              count: 6,
              inputTokens: 600,
              outputTokens: 2400,
              totalTokens: 3000,
              percentage: 25.0,
              errorCount: 0,
            },
            {
              name: 'run_command',
              count: 4,
              inputTokens: 400,
              outputTokens: 3600,
              totalTokens: 4000,
              percentage: 33.3,
              errorCount: 1,
            },
          ],
          toolInefficiencies: [
            {
              type: 'duplicate_file_reads',
              severity: 'medium',
              tool: 'view_file',
              description: '文件 "server.ts" 被重复读取了 4 次',
              tokensWasted: 1800,
            },
            {
              type: 'oversized_command_output',
              severity: 'high',
              tool: 'run_command',
              description: 'run_command 执行产生了超长输出 (~3500 tokens)',
              tokensWasted: 3000,
            },
          ],
        },
      };

      const cwd = mkWorkspaceWithTasks([task]);
      try {
        const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
          encoding: 'utf-8',
        });
        assert.match(stdout, /真实工具调用与消耗剖析 \(Tool-Level Telemetry Breakdown\)/);
        assert.match(stdout, /view_file/);
        assert.match(stdout, /run_command/);
        assert.match(stdout, /工具低效与上下文浪费诊断 \(Tool Inefficiencies & Waste\)/);
        assert.match(stdout, /server\.ts/);
        assert.match(stdout, /超长输出/);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('outputs tool_attributions and tool_inefficiencies in docpath monitor --agent YAML', () => {
      const task = {
        taskId: 'T-TOOL-YAML',
        taskTitle: 'Tool Breakdown YAML Task',
        profile: 'standard',
        completedAt: '2026-09-30T10:00:00.000Z',
        totalDiffLines: 50,
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 8000,
          source: 'antigravity',
          toolAttributions: [
            {
              name: 'replace_file_content',
              count: 3,
              inputTokens: 500,
              outputTokens: 500,
              totalTokens: 1000,
              percentage: 12.5,
              errorCount: 1,
            },
          ],
          toolInefficiencies: [
            {
              type: 'edit_target_miss',
              severity: 'high',
              tool: 'replace_file_content',
              description: 'replace_file_content 目标匹配失败',
              tokensWasted: 1000,
            },
          ],
        },
      };

      const cwd = mkWorkspaceWithTasks([task]);
      try {
        const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
          encoding: 'utf-8',
        });
        assert.match(stdout, /tool_attributions:/);
        assert.match(stdout, /name:\s*replace_file_content/);
        assert.match(stdout, /tool_inefficiencies:/);
        assert.match(stdout, /type:\s*edit_target_miss/);
        assert.match(stdout, /tokens_wasted:\s*1000/);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('outputs structured toolAttributions and toolInefficiencies in docpath monitor --json', () => {
      const task = {
        taskId: 'T-TOOL-JSON',
        taskTitle: 'Tool Breakdown JSON Task',
        profile: 'standard',
        completedAt: '2026-09-30T10:00:00.000Z',
        totalDiffLines: 50,
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 8000,
          source: 'antigravity',
          toolAttributions: [
            {
              name: 'view_file',
              count: 5,
              inputTokens: 200,
              outputTokens: 800,
              totalTokens: 1000,
              percentage: 12.5,
              errorCount: 0,
            },
          ],
          toolInefficiencies: [
            {
              type: 'duplicate_file_reads',
              severity: 'medium',
              tool: 'view_file',
              description: 'view_file repeated',
              tokensWasted: 800,
            },
          ],
        },
      };

      const cwd = mkWorkspaceWithTasks([task]);
      try {
        const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
          encoding: 'utf-8',
        });
        const data = JSON.parse(stdout);
        assert.ok(Array.isArray(data.globalToolAttributions));
        assert.equal(data.globalToolAttributions[0].name, 'view_file');
        assert.ok(Array.isArray(data.globalToolInefficiencies));
        assert.equal(data.globalToolInefficiencies[0].type, 'duplicate_file_reads');
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('renders tool-level breakdown and inefficiencies in docpath monitor --current for in-flight tasks', () => {
      const cwd = mkWorkspaceWithActiveTask({
        taskId: 'T-INFLIGHT-TOOL-UI',
        taskTitle: 'Active Tool Breakdown Task',
      });

      // Write mock real usage into active task state/breadcrumb
      const dp = join(cwd, '.docpath');
      const metricsJson = {
        taskId: 'T-INFLIGHT-TOOL-UI',
        taskTitle: 'Active Tool Breakdown Task',
        profile: 'standard',
        level: 2,
        realUsage: {
          source: 'antigravity',
          totalTokens: 10000,
          inputTokens: 7000,
          outputTokens: 3000,
          toolCallsCount: 8,
          toolAttributions: [
            {
              name: 'run_command',
              count: 4,
              inputTokens: 400,
              outputTokens: 2600,
              totalTokens: 3000,
              percentage: 30.0,
              errorCount: 0,
            },
          ],
          toolInefficiencies: [
            {
              type: 'oversized_command_output',
              severity: 'high',
              tool: 'run_command',
              description: 'run_command 超长输出',
              tokensWasted: 2100,
            },
          ],
        },
      };
      writeFileSync(join(dp, 'tasks', 'current', 'metrics.json'), JSON.stringify(metricsJson, null, 2));

      try {
        const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
          encoding: 'utf-8',
        });
        assert.match(stdout, /DocPath 活跃任务实时遥测/);
        assert.match(stdout, /T-INFLIGHT-TOOL-UI/);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });
});

describe('Multi-Turn Cumulative Token Metrics & Cache Hit Ratio in Monitor (FR-2 / AC-2, AC-3, AC-4)', () => {
  it('formatTokens formats zero, small numbers, thousands, and millions cleanly', () => {
    assert.equal(formatTokens(0), '0');
    assert.equal(formatTokens(500), '500');
    assert.equal(formatTokens(1000), '1,000 (~1K)');
    assert.equal(formatTokens(423000), '423,000 (~423K)');
    assert.equal(formatTokens(423450), '423,450 (~423.5K)');
    assert.equal(formatTokens(1000000), '1,000,000 (~1.0M)');
    assert.equal(formatTokens(30033457), '30,033,457 (~30.0M)');
  });

  it('aggregates totalCachedTokens and computes cacheHitRatio correctly across tasks', async () => {
    const tasks = [
      {
        taskId: 'T-CACHE-01',
        taskTitle: 'Cache Task 1',
        profile: 'standard',
        totalDiffLines: 100,
        completedAt: '2026-09-30T10:00:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 30000,
          inputTokens: 20000,
          outputTokens: 10000,
          cachedTokens: 10000,
          costUsd: 0.05,
        },
      },
      {
        taskId: 'T-CACHE-02',
        taskTitle: 'Cache Task 2',
        profile: 'standard',
        totalDiffLines: 50,
        completedAt: '2026-09-30T10:10:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 40000,
          inputTokens: 30000,
          outputTokens: 10000,
          cachedTokens: 20000,
          costUsd: 0.06,
        },
      },
    ];

    const cwd = mkWorkspaceWithTasks(tasks);
    try {
      const summary = await aggregateTaskMetrics(cwd);
      assert.ok(summary.realUsageSummary);
      assert.equal(summary.realUsageSummary.tasksWithRealUsage, 2);
      assert.equal(summary.realUsageSummary.totalRealTokens, 70000);
      assert.equal(summary.realUsageSummary.totalCachedTokens, 30000);
      // (30000 / (70000 + 30000)) * 100 = 30.0%
      assert.equal(summary.realUsageSummary.cacheHitRatio, 30.0);

      const monSummary = await aggregateMonitorMetrics(cwd);
      assert.ok(monSummary.realUsageSummary);
      assert.equal(monSummary.realUsageSummary.totalRealTokens, 70000);
      assert.equal(monSummary.realUsageSummary.totalCachedTokens, 30000);
      assert.equal(monSummary.realUsageSummary.cacheHitRatio, 30.0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders cache hit ratio and cached tokens in docpath monitor human dashboard', () => {
    const tasks = [
      {
        taskId: 'T-CACHE-DASH',
        taskTitle: 'Dashboard Cache Telemetry Task',
        profile: 'standard',
        totalDiffLines: 60,
        completedAt: '2026-09-30T10:00:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 40000,
          inputTokens: 30000,
          outputTokens: 10000,
          cachedTokens: 30000,
          costUsd: 0.05,
        },
      },
    ];

    const cwd = mkWorkspaceWithTasks(tasks);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /DocPath 智能监控大盘/);
      assert.match(stdout, /Token 消耗与漂移监控/);
      // cacheHitRatio = (30000 / (40000 + 30000)) * 100 = 42.9%
      assert.match(stdout, /缓存复用与命中率:\s*⚡\s*42\.9%\s*\(已复用缓存 30,000 \(~30K\) Tokens\)/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs totalCachedTokens and cacheHitRatio in docpath monitor --json', () => {
    const tasks = [
      {
        taskId: 'T-CACHE-JSON',
        taskTitle: 'JSON Cache Task',
        profile: 'standard',
        totalDiffLines: 40,
        completedAt: '2026-09-30T10:00:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 30000,
          inputTokens: 20000,
          outputTokens: 10000,
          cachedTokens: 10000,
        },
      },
    ];

    const cwd = mkWorkspaceWithTasks(tasks);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdout);
      assert.ok(data.realUsageSummary);
      assert.equal(data.realUsageSummary.totalCachedTokens, 10000);
      // (10000 / (30000 + 10000)) * 100 = 25.0%
      assert.equal(data.realUsageSummary.cacheHitRatio, 25.0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs cached_tokens and cache_hit_ratio in docpath monitor --agent YAML', () => {
    const tasks = [
      {
        taskId: 'T-CACHE-YAML',
        taskTitle: 'YAML Cache Task',
        profile: 'standard',
        totalDiffLines: 40,
        completedAt: '2026-09-30T10:00:00.000Z',
        protocol: { totalInjectedTokens: 2000 },
        realUsage: {
          totalTokens: 50000,
          inputTokens: 40000,
          outputTokens: 10000,
          cachedTokens: 25000,
        },
      },
    ];

    const cwd = mkWorkspaceWithTasks(tasks);
    try {
      const stdout = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /real_usage:/);
      assert.match(stdout, /cached_tokens:\s*25000/);
      // (25000 / 75000) * 100 = 33.3%
      assert.match(stdout, /cache_hit_ratio:\s*['"]?33\.3%['"]?/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('displays cachedTokens and live cache hit ratio in docpath monitor --current for in-flight tasks', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-INFLIGHT-CACHE',
      taskTitle: 'In Flight Cache Telemetry Task',
    });

    const dp = join(cwd, '.docpath');
    const metricsJson = {
      taskId: 'T-INFLIGHT-CACHE',
      taskTitle: 'In Flight Cache Telemetry Task',
      profile: 'standard',
      level: 2,
      realUsage: {
        source: 'antigravity',
        totalTokens: 30000,
        inputTokens: 20000,
        outputTokens: 10000,
        cachedTokens: 10000,
        costUsd: 0.045,
        toolCallsCount: 12,
      },
    };
    writeFileSync(join(dp, 'tasks', 'current', 'metrics.json'), JSON.stringify(metricsJson, null, 2));

    try {
      // 1. Human readable view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 活跃任务实时遥测/);
      assert.match(stdoutHuman, /缓存复用率:\s*⚡\s*\d+(\.\d+)?%\s*\(已复用缓存 .+\s*Tokens\)/);

      // 2. Agent YAML view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /cached_tokens:\s*\d+/);
      assert.match(stdoutAgent, /cache_hit_ratio:\s*['"]?\d+(\.\d+)?%['"]?/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.active, true);
      assert.ok(typeof data.activeTask.realUsage?.cachedTokens === 'number');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('Step-Level Telemetry Slices & Lifecycle Anchors in Monitor (FR-2 / AC-3, AC-4, AC-5)', () => {
  it('extractStepTelemetrySlices extracts per-step time window and telemetry from breadcrumb events', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-slices-'));
    const t0 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const t1 = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const t2 = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const t3 = new Date(Date.now() - 1 * 60 * 1000).toISOString();

    const plan = {
      task_id: 'T-STEP-01',
      steps: [
        { id: 'S1', title: 'Implement adapter logic', status: 'done' },
        { id: 'S2', title: 'Add telemetry tests', status: 'in_progress' },
      ],
    };

    const breadcrumbs = [
      { event: 'step.started', step: 'S1', timestamp: t0 },
      { event: 'step-pass', step: 'S1', status: 'done', context: 'step-pass: S1', timestamp: t1 },
      { type: 'agent.step', stepId: 'S2', status: 'in_progress', timestamp: t2 },
      { event: 'step-pass', step: 'S2', status: 'done', context: 'step-pass: S2', timestamp: t3 },
    ];

    try {
      const slices = await extractStepTelemetrySlices(cwd, 'T-STEP-01', {
        plan,
        breadcrumbs,
      });

      assert.equal(slices.length, 2);
      assert.equal(slices[0].stepId, 'S1');
      assert.equal(slices[0].stepTitle, 'Implement adapter logic');
      assert.equal(slices[0].startedAt, t0);
      assert.equal(slices[0].completedAt, t1);
      assert.ok(slices[0].durationMinutes >= 3.9);

      assert.equal(slices[1].stepId, 'S2');
      assert.equal(slices[1].stepTitle, 'Add telemetry tests');
      assert.equal(slices[1].startedAt, t2);
      assert.equal(slices[1].completedAt, t3);
      assert.ok(slices[1].durationMinutes >= 3.9);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders lifecycle anchor and step breakdown in docpath monitor --current (Human, YAML, JSON)', () => {
    const t0 = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const t1 = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const t2 = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-20260930-active-slices',
      taskTitle: 'Active Task with Step Slices',
      steps: [
        { id: 'S1', title: 'Setup probe', status: 'done' },
        { id: 'S2', title: 'Verify slices', status: 'in_progress' },
      ],
      breadcrumbs: [
        { step: 'S1', status: 'in_progress', timestamp: t0 },
        { step: 'S1', status: 'done', context: 'step-pass: S1', timestamp: t1 },
        { step: 'S2', status: 'in_progress', timestamp: t2 },
      ],
    });

    const dp = join(cwd, '.docpath');
    const state = JSON.parse(execSync(`cat "${join(dp, 'workspace', 'state.json')}"`, { encoding: 'utf-8' }));
    state.session_id = 'sess-test-uuid-9999';
    state.base_commit = 'abcdef123456';
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify(state, null, 2));

    try {
      // 1. Human view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /生命周期锚点:\s*Session:\s*sess-test-uuid-9999/);
      assert.match(stdoutHuman, /步骤级 Token 成本与耗时分解/);
      assert.match(stdoutHuman, /S1/);
      assert.match(stdoutHuman, /S2/);

      // 2. Agent YAML view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /lifecycle_anchor:/);
      assert.match(stdoutAgent, /session_id:\s*sess-test-uuid-9999/);
      assert.match(stdoutAgent, /base_commit:\s*abcdef123456/);
      assert.match(stdoutAgent, /step_slices:/);
      assert.match(stdoutAgent, /step_id:\s*S1/);
      assert.match(stdoutAgent, /step_id:\s*S2/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.active, true);
      assert.equal(data.activeTask.lifecycleAnchor.sessionId, 'sess-test-uuid-9999');
      assert.equal(data.activeTask.lifecycleAnchor.baseCommit, 'abcdef123456');
      assert.ok(Array.isArray(data.activeTask.stepSlices));
      assert.ok(data.activeTask.stepSlices.length >= 2);
      assert.equal(data.activeTask.stepSlices[0].stepId, 'S1');
      assert.equal(data.activeTask.stepSlices[1].stepId, 'S2');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders lifecycle anchor and step breakdown in global docpath monitor dashboard (Human, YAML, JSON)', () => {
    const historicalTask = {
      taskId: 'T-HIST-01',
      taskTitle: 'Historical Task with Anchors',
      profile: 'standard',
      level: 2,
      startedAt: '2026-09-30T09:00:00.000Z',
      completedAt: '2026-09-30T09:15:00.000Z',
      durationMinutes: 15,
      firstTimePassRate: 100,
      complianceScore: 100,
      violations: [],
      totalDiffLines: 80,
      filesChanged: 2,
      linesAdded: 60,
      linesDeleted: 20,
      protocol: { totalInjectedTokens: 2000 },
      realUsage: { totalTokens: 25000, inputTokens: 18000, outputTokens: 7000 },
      lifecycleAnchor: {
        sessionId: 'sess-hist-anchor-111',
        baseCommit: 'commit000111',
        headCommit: 'commit000222',
        startedAt: '2026-09-30T09:00:00.000Z',
        completedAt: '2026-09-30T09:15:00.000Z',
      },
      stepSlices: [
        {
          stepId: 'S1',
          stepTitle: 'Step 1 of Hist',
          startedAt: '2026-09-30T09:00:00.000Z',
          completedAt: '2026-09-30T09:08:00.000Z',
          durationMinutes: 8,
          totalTokens: 12000,
          inputTokens: 9000,
          outputTokens: 3000,
          toolCallsCount: 5,
        },
      ],
    };

    const cwd = mkWorkspaceWithTasks([historicalTask]);
    try {
      // 1. Human view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 智能监控大盘/);
      assert.match(stdoutHuman, /生命周期锚点/);
      assert.match(stdoutHuman, /sess-hist-anchor/);
      assert.match(stdoutHuman, /T-HIST-01/);

      // 2. Agent YAML view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /recent_tasks:/);
      assert.match(stdoutAgent, /lifecycle_anchor:/);
      assert.match(stdoutAgent, /session_id:\s*sess-hist-anchor-111/);
      assert.match(stdoutAgent, /step_slices:/);
      assert.match(stdoutAgent, /step_id:\s*S1/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.totalTasks, 1);
      assert.equal(data.recentTasks[0].lifecycleAnchor.sessionId, 'sess-hist-anchor-111');
      assert.ok(Array.isArray(data.recentTasks[0].stepSlices));
      assert.equal(data.recentTasks[0].stepSlices[0].stepId, 'S1');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('DocPath Lightweight Overhead Ratio & Value ROI Engine (FR-2 / AC-2)', () => {
  it('calculateDocPathValueRoi calculates overhead ratio, compliance, pass rate, and summary', () => {
    const roi = calculateDocPathValueRoi({
      protocolTokens: 2300,
      realModelTokens: 100000,
      complianceScore: 95,
      firstTimePassRate: 100,
    });

    assert.equal(roi.protocolTokens, 2300);
    assert.equal(roi.realModelTokens, 100000);
    assert.equal(roi.overheadRatio, 2.3);
    assert.equal(roi.complianceScore, 95);
    assert.equal(roi.firstTimePassRate, 100);
    assert.match(roi.summaryText, /以极低 Token 负担/);

    // When realModelTokens is 0
    const fallbackRoi = calculateDocPathValueRoi({
      protocolTokens: 1500,
      realModelTokens: 0,
    });
    assert.equal(fallbackRoi.overheadRatio, 100);
    assert.equal(fallbackRoi.complianceScore, 100);
    assert.equal(fallbackRoi.firstTimePassRate, 100);
  });

  it('probeActiveTaskMetrics and docpath monitor --current render DocPath Value ROI in Human, YAML, and JSON views', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-ROI-ACTIVE',
      taskTitle: 'Active Task for Value ROI Test',
      profile: 'standard',
    });

    const dp = join(cwd, '.docpath');
    const metricsJson = {
      taskId: 'T-ROI-ACTIVE',
      taskTitle: 'Active Task for Value ROI Test',
      profile: 'standard',
      level: 2,
      realUsage: {
        source: 'antigravity',
        totalTokens: 80000,
        inputTokens: 70000,
        outputTokens: 10000,
        cachedTokens: 20000,
      },
    };
    writeFileSync(join(dp, 'tasks', 'current', 'metrics.json'), JSON.stringify(metricsJson, null, 2));

    try {
      // 1. Human Dashboard view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 极轻量价值透视 \(DocPath Protocol ROI\)/);
      assert.match(stdoutHuman, /协议注入占比:\s*⚡\s*\d+(\.\d+)?%/);
      assert.match(stdoutHuman, /工程治理收益:/);
      assert.match(stdoutHuman, /合规指数/);
      assert.match(stdoutHuman, /门禁首次通过率/);
      assert.match(stdoutHuman, /效能保障结论:\s*以极低 Token 负担/);

      // 2. YAML agent view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /docpath_roi:/);
      assert.match(stdoutAgent, /overhead_ratio:\s*['"]?\d+(\.\d+)?%['"]?/);
      assert.match(stdoutAgent, /protocol_tokens:\s*\d+/);
      assert.match(stdoutAgent, /real_tokens:\s*80000/);
      assert.match(stdoutAgent, /compliance_score:\s*\d+/);
      assert.match(stdoutAgent, /first_time_pass_rate:\s*['"]?\d+(\.\d+)?%['"]?/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.active, true);
      assert.ok(data.activeTask.docpathValueRoi);
      assert.equal(data.activeTask.docpathValueRoi.realModelTokens, 80000);
      assert.ok(data.activeTask.docpathValueRoi.overheadRatio > 0);
      assert.ok(typeof data.activeTask.docpathValueRoi.complianceScore === 'number');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('aggregateMonitorMetrics and global docpath monitor render DocPath Value ROI in Human, YAML, and JSON views', () => {
    const task1 = {
      taskId: 'T-ROI-HIST-01',
      taskTitle: 'Historical ROI Task 1',
      profile: 'standard',
      level: 2,
      startedAt: '2026-09-30T10:00:00.000Z',
      completedAt: '2026-09-30T10:15:00.000Z',
      durationMinutes: 15,
      firstTimePassRate: 100,
      complianceScore: 100,
      violations: [],
      totalDiffLines: 150,
      filesChanged: 3,
      linesAdded: 130,
      linesDeleted: 20,
      protocol: { totalInjectedTokens: 2500 },
      realUsage: { totalTokens: 100000, inputTokens: 90000, outputTokens: 10000 },
    };

    const cwd = mkWorkspaceWithTasks([task1]);
    try {
      // 1. Human Dashboard view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 极轻量价值透视 \(DocPath Protocol ROI\)/);
      assert.match(stdoutHuman, /协议注入占比:\s*⚡\s*2\.5%/); // 2500 / 100000 = 2.5%
      assert.match(stdoutHuman, /工程治理收益:\s*🟢\s*100分 合规指数 \| 100% 门禁首次通过率/);
      assert.match(stdoutHuman, /效能保障结论:\s*以极低 Token 负担/);

      // 2. YAML agent view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /docpath_roi:/);
      assert.match(stdoutAgent, /overhead_ratio:\s*['"]?2\.5%['"]?/);
      assert.match(stdoutAgent, /protocol_tokens:\s*2500/);
      assert.match(stdoutAgent, /real_tokens:\s*100000/);
      assert.match(stdoutAgent, /compliance_score:\s*100/);
      assert.match(stdoutAgent, /first_time_pass_rate:\s*['"]?100%['"]?/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.totalTasks, 1);
      assert.ok(data.docpathValueRoi);
      assert.equal(data.docpathValueRoi.protocolTokens, 2500);
      assert.equal(data.docpathValueRoi.realModelTokens, 100000);
      assert.equal(data.docpathValueRoi.overheadRatio, 2.5);
      assert.equal(data.docpathValueRoi.complianceScore, 100);
      assert.equal(data.docpathValueRoi.firstTimePassRate, 100);
      assert.ok(data.recentTasks[0].docpathValueRoi);
      assert.equal(data.recentTasks[0].docpathValueRoi.overheadRatio, 2.5);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('Workflow Friction Diagnostics & Efficiency Dashboard (FR-3 / AC-3, AC-4, AC-5)', () => {
  it('detectWorkflowFrictions detects command_error, gate_block, step_rework, spec_friction, and tool_waste', () => {
    const rawContext = {
      breadcrumbs: [
        { timestamp: '2026-09-30T10:00:00.000Z', step: 'S1', status: 'error', error: 'invalid CLI argument' },
        { timestamp: '2026-09-30T10:01:00.000Z', step: 'S1', action: 'check', status: 'fail', message: 'check failed: type error' },
        { timestamp: '2026-09-30T10:02:00.000Z', step: 'S1', gate_verdict: 'fail' },
        { timestamp: '2026-09-30T10:03:00.000Z', step: 'S1', action: 'retry' },
        { timestamp: '2026-09-30T10:04:00.000Z', step: 'S1', status: 'blocked' },
      ],
      violations: [
        { ruleId: 'CR-05', ruleName: 'Missing Decision Brief', severity: 'medium', description: 'No brief', penalty: 10 },
      ],
      toolInefficiencies: [
        { type: 'duplicate_file_reads', severity: 'medium', tool: 'view_file', description: 'Read file 3 times', tokensWasted: 1200 },
      ],
    };

    const findings = detectWorkflowFrictions(rawContext);
    assert.ok(findings.length >= 4);

    const cmdErr = findings.find((f) => f.category === 'command_error');
    assert.ok(cmdErr);
    assert.equal(cmdErr.id, 'FRIC-CMD-ERR');
    assert.equal(cmdErr.count, 1);
    assert.match(cmdErr.optimizationHint, /AGENTS\.md/);

    const gateBlock = findings.find((f) => f.category === 'gate_block');
    assert.ok(gateBlock);
    assert.equal(gateBlock.id, 'FRIC-GATE-BLOCK');
    assert.equal(gateBlock.count, 2);
    assert.match(gateBlock.optimizationHint, /node --test/);

    const rework = findings.find((f) => f.category === 'step_rework');
    assert.ok(rework);
    assert.equal(rework.id, 'FRIC-STEP-REWORK');
    assert.equal(rework.count, 2);
    assert.match(rework.optimizationHint, /docpath go --step/);

    const specFriction = findings.find((f) => f.category === 'spec_friction');
    assert.ok(specFriction);
    assert.equal(specFriction.id, 'FRIC-SPEC-FRICTION');
    assert.equal(specFriction.count, 1);

    const toolWaste = findings.find((f) => f.category === 'tool_waste');
    assert.ok(toolWaste);
    assert.equal(toolWaste.id, 'FRIC-TOOL-WASTE');
    assert.equal(toolWaste.tokensWasted, 1200);
  });

  it('aggregateWorkflowFrictions sums occurrences and preserves highest severity across tasks', () => {
    const task1 = {
      taskId: 'T-F1',
      frictionFindings: [
        {
          id: 'FRIC-CMD-ERR',
          category: 'command_error',
          severity: 'low',
          title: 'Command Error',
          description: '1 error',
          count: 1,
          tokensWasted: 200,
          optimizationHint: 'Hint 1',
        },
      ],
    };
    const task2 = {
      taskId: 'T-F2',
      frictionFindings: [
        {
          id: 'FRIC-CMD-ERR',
          category: 'command_error',
          severity: 'high',
          title: 'Command Error',
          description: '2 errors',
          count: 2,
          tokensWasted: 400,
          optimizationHint: 'Hint 1',
        },
        {
          id: 'FRIC-GATE-BLOCK',
          category: 'gate_block',
          severity: 'medium',
          title: 'Gate Block',
          description: 'Gate blocked',
          count: 1,
          tokensWasted: 400,
          optimizationHint: 'Hint 2',
        },
      ],
    };

    const aggregated = aggregateWorkflowFrictions([task1, task2]);
    assert.equal(aggregated.length, 2);
    const cmd = aggregated.find((f) => f.id === 'FRIC-CMD-ERR');
    assert.ok(cmd);
    assert.equal(cmd.count, 3);
    assert.equal(cmd.tokensWasted, 600);
    assert.equal(cmd.severity, 'high');
  });

  it('generateRemediations outputs targeted REM-FRICTION actionable advice', () => {
    const remediations = generateRemediations({
      compliance: {
        avgComplianceScore: 100,
        totalViolations: 0,
        violationsByRule: {},
        violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        criticalViolationsCount: 0,
        unhealthyTasksCount: 0,
      },
      drift: {
        quick: { profile: 'quick', taskCount: 0, baselineProtocolTokens: 800, recentProtocolTokens: 800, protocolInflationRate: 0, baselineRealTokensMedian: 8000, roiTokensPerLine: 0, spikeThresholdTokens: 20000 },
        standard: { profile: 'standard', taskCount: 1, baselineProtocolTokens: 2000, recentProtocolTokens: 2000, protocolInflationRate: 0, baselineRealTokensMedian: 30000, roiTokensPerLine: 100, spikeThresholdTokens: 75000 },
        overallProtocolInflationRate: 0,
      },
      spikes: [],
      frictionFindings: [
        {
          id: 'FRIC-CMD-ERR',
          category: 'command_error',
          severity: 'high',
          title: 'Command Execution Errors',
          description: 'Errors found',
          count: 3,
          optimizationHint: 'Check CLI',
        },
        {
          id: 'FRIC-GATE-BLOCK',
          category: 'gate_block',
          severity: 'high',
          title: 'Quality Gate Blockage',
          description: 'Gate failed',
          count: 2,
          optimizationHint: 'Run single test',
        },
        {
          id: 'FRIC-STEP-REWORK',
          category: 'step_rework',
          severity: 'medium',
          title: 'Step Rework & Retries',
          description: 'Retries occurred',
          count: 2,
          optimizationHint: 'Atomic steps',
        },
        {
          id: 'FRIC-SPEC-FRICTION',
          category: 'spec_friction',
          severity: 'medium',
          title: 'Spec Ambiguity',
          description: 'No brief',
          count: 1,
          optimizationHint: 'Refine spec',
        },
      ],
    });

    assert.ok(remediations.some((r) => r.id === 'REM-FRICTION-CMD'));
    assert.ok(remediations.some((r) => r.id === 'REM-FRICTION-GATE'));
    assert.ok(remediations.some((r) => r.id === 'REM-FRICTION-REWORK'));
    assert.ok(remediations.some((r) => r.id === 'REM-FRICTION-SPEC'));
  });

  it('docpath monitor --current renders workflow friction diagnostics in Human, YAML, and JSON views', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-ACTIVE-FRICTION',
      taskTitle: 'Active Task with Frictions',
      breadcrumbs: [
        { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), step: 'S1', status: 'error', error: 'bad arg' },
        { timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(), step: 'S1', gate_verdict: 'fail' },
        { timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(), step: 'S1', action: 'retry' },
      ],
    });

    try {
      // 1. Human Dashboard view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /研发流程摩擦与阻力诊断 \(Workflow Friction & Pain Points\)/);
      assert.match(stdoutHuman, /command_error/);
      assert.match(stdoutHuman, /gate_block/);
      assert.match(stdoutHuman, /step_rework/);
      assert.match(stdoutHuman, /优化指引:/);

      // 2. YAML view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /workflow_frictions:/);
      assert.match(stdoutAgent, /category:\s*command_error/);
      assert.match(stdoutAgent, /optimization_hint:/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.active, true);
      assert.ok(Array.isArray(data.activeTask.workflowFrictions));
      assert.ok(data.activeTask.workflowFrictions.length >= 3);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor (global) renders workflow friction diagnostics in Human, YAML, and JSON views', () => {
    const task1 = {
      taskId: 'T-GLOBAL-FRICTION-01',
      taskTitle: 'Historical Friction Task',
      profile: 'standard',
      level: 2,
      startedAt: '2026-09-30T10:00:00.000Z',
      completedAt: '2026-09-30T10:15:00.000Z',
      durationMinutes: 15,
      firstTimePassRate: 80,
      complianceScore: 90,
      violations: [],
      totalDiffLines: 100,
      filesChanged: 2,
      linesAdded: 80,
      linesDeleted: 20,
      frictionFindings: [
        {
          id: 'FRIC-CMD-ERR',
          category: 'command_error',
          severity: 'high',
          title: 'CLI 命令调用异常与参数拦截 (Command Execution Errors)',
          description: '检测到 2 次命令调用失败或参数报错',
          count: 2,
          tokensWasted: 400,
          optimizationHint: '查阅 docpath --help 或 AGENTS.md 规范',
        },
      ],
    };

    const cwd = mkWorkspaceWithTasks([task1]);
    try {
      // 1. Human Dashboard view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /研发流程摩擦与阻力诊断 \(Workflow Friction & Pain Points\)/);
      assert.match(stdoutHuman, /CLI 命令调用异常与参数拦截/);
      assert.match(stdoutHuman, /优化指引:\s*查阅 docpath --help 或 AGENTS\.md 规范/);

      // 2. YAML view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /workflow_frictions:/);
      assert.match(stdoutAgent, /category:\s*command_error/);
      assert.match(stdoutAgent, /optimization_hint:\s*查阅 docpath --help 或 AGENTS\.md 规范/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.ok(Array.isArray(data.workflowFrictions));
      assert.equal(data.workflowFrictions.length, 1);
      assert.equal(data.workflowFrictions[0].id, 'FRIC-CMD-ERR');
      assert.equal(data.workflowFrictions[0].count, 2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('DocPath CLI Overhead Dashboard & Token Attribution Engine (FR-2 / AC-2, AC-3, AC-4)', () => {
  it('aggregateDocPathCliOverhead accurately aggregates total calls, errors, input/output tokens, command breakdowns, and percentage', () => {
    const task1 = {
      taskId: 'T-CLI-01',
      taskTitle: 'CLI Task 1',
      realUsage: {
        totalTokens: 50000,
        docpathCliOverhead: {
          totalCalls: 5,
          errorCalls: 0,
          totalTokens: 2500,
          inputTokens: 1000,
          outputTokens: 1500,
          percentageOfSessionTokens: 5.0,
          commands: [
            { subcommand: 'next', count: 3, errorCount: 0, inputTokens: 600, outputTokens: 900, totalTokens: 1500, avgTokens: 500 },
            { subcommand: 'step-pass', count: 2, errorCount: 0, inputTokens: 400, outputTokens: 600, totalTokens: 1000, avgTokens: 500 },
          ],
        },
      },
    };

    const task2 = {
      taskId: 'T-CLI-02',
      taskTitle: 'CLI Task 2',
      realUsage: {
        totalTokens: 50000,
        docpathCliOverhead: {
          totalCalls: 4,
          errorCalls: 1,
          totalTokens: 2000,
          inputTokens: 800,
          outputTokens: 1200,
          percentageOfSessionTokens: 4.0,
          commands: [
            { subcommand: 'next', count: 2, errorCount: 0, inputTokens: 400, outputTokens: 600, totalTokens: 1000, avgTokens: 500 },
            { subcommand: 'check', count: 2, errorCount: 1, inputTokens: 400, outputTokens: 600, totalTokens: 1000, avgTokens: 500 },
          ],
        },
      },
    };

    const aggregated = aggregateDocPathCliOverhead([task1, task2]);
    assert.equal(aggregated.totalCalls, 9);
    assert.equal(aggregated.errorCalls, 1);
    assert.equal(aggregated.inputTokens, 1800);
    assert.equal(aggregated.outputTokens, 2700);
    assert.equal(aggregated.totalTokens, 4500);
    assert.equal(aggregated.percentageOfSessionTokens, 4.5); // 4500 / 100000 * 100 = 4.5%
    assert.equal(aggregated.commands.length, 3);

    const nextCmd = aggregated.commands.find((c) => c.subcommand === 'next');
    assert.ok(nextCmd);
    assert.equal(nextCmd.count, 5);
    assert.equal(nextCmd.totalTokens, 2500);
    assert.equal(nextCmd.avgTokens, 500);

    const checkCmd = aggregated.commands.find((c) => c.subcommand === 'check');
    assert.ok(checkCmd);
    assert.equal(checkCmd.count, 2);
    assert.equal(checkCmd.errorCount, 1);
    assert.equal(checkCmd.totalTokens, 1000);
  });

  it('docpath monitor --current renders DocPath CLI Overhead panel in Human, YAML, and JSON views', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-CLI-ACTIVE',
      taskTitle: 'Active Task with CLI Overhead',
      profile: 'standard',
    });

    const dp = join(cwd, '.docpath');
    const metricsJson = {
      taskId: 'T-CLI-ACTIVE',
      taskTitle: 'Active Task with CLI Overhead',
      profile: 'standard',
      level: 2,
      realUsage: {
        source: 'antigravity',
        totalTokens: 60000,
        inputTokens: 50000,
        outputTokens: 10000,
        cachedTokens: 15000,
        docpathCliOverhead: {
          totalCalls: 6,
          errorCalls: 1,
          totalTokens: 3000,
          inputTokens: 1200,
          outputTokens: 1800,
          percentageOfSessionTokens: 5.0,
          commands: [
            { subcommand: 'next', count: 3, errorCount: 0, inputTokens: 600, outputTokens: 900, totalTokens: 1500, avgTokens: 500 },
            { subcommand: 'go', count: 2, errorCount: 0, inputTokens: 400, outputTokens: 600, totalTokens: 1000, avgTokens: 500 },
            { subcommand: 'check', count: 1, errorCount: 1, inputTokens: 200, outputTokens: 300, totalTokens: 500, avgTokens: 500 },
          ],
        },
      },
    };
    writeFileSync(join(dp, 'tasks', 'current', 'metrics.json'), JSON.stringify(metricsJson, null, 2));

    try {
      // 1. Human Dashboard view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 命令调用与 Token 消耗透视 \(DocPath CLI Overhead\)/);
      assert.match(stdoutHuman, /CLI 调用总量:\s*6 次调用/);
      assert.match(stdoutHuman, /1 次错误/);
      assert.match(stdoutHuman, /CLI 消耗 Tokens:\s*~3,000 Tokens/);
      assert.match(stdoutHuman, /next/);
      assert.match(stdoutHuman, /go/);
      assert.match(stdoutHuman, /check/);

      // 2. YAML agent view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /docpath_cli_overhead:/);
      assert.match(stdoutAgent, /total_calls:\s*6/);
      assert.match(stdoutAgent, /error_calls:\s*1/);
      assert.match(stdoutAgent, /total_tokens:\s*3000/);
      assert.match(stdoutAgent, /subcommand:\s*next/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.active, true);
      assert.ok(data.activeTask.docpathCliOverhead);
      assert.equal(data.activeTask.docpathCliOverhead.totalCalls, 6);
      assert.equal(data.activeTask.docpathCliOverhead.errorCalls, 1);
      assert.equal(data.activeTask.docpathCliOverhead.totalTokens, 3000);
      assert.equal(data.activeTask.docpathCliOverhead.commands.length, 3);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor (global) renders DocPath CLI Overhead panel in Human, YAML, and JSON views', () => {
    const task1 = {
      taskId: 'T-CLI-GLOBAL-01',
      taskTitle: 'Global Task with CLI Telemetry',
      profile: 'standard',
      level: 2,
      startedAt: '2026-09-30T10:00:00.000Z',
      completedAt: '2026-09-30T10:15:00.000Z',
      durationMinutes: 15,
      firstTimePassRate: 100,
      complianceScore: 100,
      violations: [],
      totalDiffLines: 120,
      filesChanged: 3,
      linesAdded: 100,
      linesDeleted: 20,
      protocol: { totalInjectedTokens: 2000 },
      realUsage: {
        totalTokens: 80000,
        inputTokens: 70000,
        outputTokens: 10000,
        docpathCliOverhead: {
          totalCalls: 8,
          errorCalls: 0,
          totalTokens: 4000,
          inputTokens: 1600,
          outputTokens: 2400,
          percentageOfSessionTokens: 5.0,
          commands: [
            { subcommand: 'next', count: 4, errorCount: 0, inputTokens: 800, outputTokens: 1200, totalTokens: 2000, avgTokens: 500 },
            { subcommand: 'step-pass', count: 2, errorCount: 0, inputTokens: 400, outputTokens: 600, totalTokens: 1000, avgTokens: 500 },
            { subcommand: 'done', count: 2, errorCount: 0, inputTokens: 400, outputTokens: 600, totalTokens: 1000, avgTokens: 500 },
          ],
        },
      },
    };

    const cwd = mkWorkspaceWithTasks([task1]);
    try {
      // 1. Human Dashboard view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 命令调用与 Token 消耗透视 \(DocPath CLI Overhead\)/);
      assert.match(stdoutHuman, /CLI 调用总量:\s*8 次调用/);
      assert.match(stdoutHuman, /CLI 消耗 Tokens:\s*~4,000 Tokens/);
      assert.match(stdoutHuman, /next/);
      assert.match(stdoutHuman, /step-pass/);

      // 2. YAML agent view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /docpath_cli_overhead:/);
      assert.match(stdoutAgent, /total_calls:\s*8/);
      assert.match(stdoutAgent, /total_tokens:\s*4000/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.ok(data.globalDocPathCliOverhead);
      assert.equal(data.globalDocPathCliOverhead.totalCalls, 8);
      assert.equal(data.globalDocPathCliOverhead.totalTokens, 4000);
      assert.equal(data.globalDocPathCliOverhead.commands.length, 3);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('DocPath Efficacy & Friction Evidence Dashboard (FR-2 / AC-2, AC-3, AC-4)', () => {
  it('calculateDocPathEfficacy computes context compression, prevented loops, and saved tokens', () => {
    const tasks = [
      {
        taskId: 'T-EFF-01',
        firstTimePassRate: 100,
        engineering: { retryCount: 0 },
        docpathEfficacy: {
          preventedLoopsCount: 2,
          deadlockTokensSaved: 7000,
          contextCompressionRatio: 94.5,
          subagentTokensSaved: 15000,
          gateInterceptionCount: 1,
          firstTimePassRate: 100,
          summary: 'Summary 1',
        },
      },
      {
        taskId: 'T-EFF-02',
        firstTimePassRate: 90,
        engineering: { retryCount: 1 },
        docpathEfficacy: {
          preventedLoopsCount: 1,
          deadlockTokensSaved: 3500,
          contextCompressionRatio: 91.5,
          subagentTokensSaved: 0,
          gateInterceptionCount: 0,
          firstTimePassRate: 90,
          summary: 'Summary 2',
        },
      },
    ];

    const efficacy = calculateDocPathEfficacy(tasks);
    assert.equal(efficacy.preventedLoopsCount, 3);
    assert.equal(efficacy.deadlockTokensSaved, 10500);
    assert.equal(efficacy.subagentTokensSaved, 15000);
    assert.equal(efficacy.gateInterceptionCount, 1);
    assert.equal(efficacy.contextCompressionRatio, 93.0); // (94.5 + 91.5) / 2
    assert.equal(efficacy.firstTimePassRate, 95); // (100 + 90) / 2
    assert.match(efficacy.summary, /拦截了 3 次潜在死循环/);
  });

  it('aggregateDocPathCliFriction aggregates serial chains, heavy outputs, and actionable optimizations', () => {
    const task1 = {
      taskId: 'T-FRIC-01',
      realUsage: {
        docpathCliFriction: {
          redundantCallsCount: 2,
          redundantTokensWasted: 1200,
          serialChains: [
            { chain: 'go -> next', count: 2, tokensWasted: 1200, recommendation: 'Avoid serial go -> next' },
          ],
          heavyOutputCommands: [
            { subcommand: 'review', avgOutputTokens: 1420, maxOutputTokens: 1500, count: 1, optimizationHint: 'Enable --compact' },
          ],
          actionableOptimizations: ['Avoid serial go -> next', 'Enable --compact'],
        },
      },
    };

    const task2 = {
      taskId: 'T-FRIC-02',
      realUsage: {
        docpathCliFriction: {
          redundantCallsCount: 1,
          redundantTokensWasted: 600,
          serialChains: [
            { chain: 'go -> next', count: 1, tokensWasted: 600, recommendation: 'Avoid serial go -> next' },
            { chain: 'check -> done', count: 1, tokensWasted: 500, recommendation: 'Avoid check prior to done' },
          ],
          heavyOutputCommands: [
            { subcommand: 'review', avgOutputTokens: 1300, maxOutputTokens: 1300, count: 1, optimizationHint: 'Enable --compact' },
          ],
          actionableOptimizations: ['Avoid check prior to done'],
        },
      },
    };

    const friction = aggregateDocPathCliFriction([task1, task2]);
    assert.equal(friction.redundantCallsCount, 3);
    assert.equal(friction.redundantTokensWasted, 1800);
    assert.equal(friction.serialChains.length, 2);

    const goNext = friction.serialChains.find((s) => s.chain === 'go -> next');
    assert.ok(goNext);
    assert.equal(goNext.count, 3);
    assert.equal(goNext.tokensWasted, 1800);

    const checkDone = friction.serialChains.find((s) => s.chain === 'check -> done');
    assert.ok(checkDone);
    assert.equal(checkDone.count, 1);

    assert.equal(friction.heavyOutputCommands.length, 1);
    assert.equal(friction.heavyOutputCommands[0].subcommand, 'review');
    assert.equal(friction.heavyOutputCommands[0].count, 2);
    assert.equal(friction.heavyOutputCommands[0].maxOutputTokens, 1500);

    assert.ok(friction.actionableOptimizations.length >= 3);
    assert.ok(friction.actionableOptimizations.some((o) => o.includes('redundant CLI calls')));
  });

  it('docpath monitor --current renders DocPath Efficacy and Friction Evidence panels in Human, YAML, and JSON views', () => {
    const cwd = mkWorkspaceWithActiveTask({
      taskId: 'T-EVIDENCE-ACTIVE',
      taskTitle: 'Active Task Evidence Test',
      profile: 'standard',
    });

    const dp = join(cwd, '.docpath');
    const metricsJson = {
      taskId: 'T-EVIDENCE-ACTIVE',
      taskTitle: 'Active Task Evidence Test',
      profile: 'standard',
      level: 2,
      realUsage: {
        source: 'antigravity',
        totalTokens: 80000,
        inputTokens: 65000,
        outputTokens: 15000,
        cachedTokens: 20000,
        docpathEfficacy: {
          preventedLoopsCount: 2,
          deadlockTokensSaved: 7000,
          contextCompressionRatio: 93.5,
          subagentTokensSaved: 15000,
          gateInterceptionCount: 1,
          firstTimePassRate: 100,
          summary: 'DocPath 架构通过契约门禁与轻量路由拦截了 2 次潜在死循环，节省约 7,000 Tokens，上下文压缩比达 93.5%',
        },
        docpathCliFriction: {
          redundantCallsCount: 2,
          redundantTokensWasted: 1000,
          redundantPatterns: [
            { subcommand: 'next', count: 2, tokensWasted: 1000, reason: 'Avoid calling next consecutively' },
          ],
          serialChains: [
            { chain: 'go -> next', count: 2, tokensWasted: 1000, recommendation: '建议升级为复合原子命令消除串行交互' },
          ],
          heavyOutputCommands: [
            { subcommand: 'review', avgOutputTokens: 1420, maxOutputTokens: 1500, count: 1, optimizationHint: '建议默认启用 --compact' },
          ],
          actionableOptimizations: ['💡 建议升级为原子复合命令消除串行交互', '建议默认启用 --compact'],
        },
      },
    };
    writeFileSync(join(dp, 'tasks', 'current', 'metrics.json'), JSON.stringify(metricsJson, null, 2));

    try {
      // 1. Human view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 效能与必要性实证 \(DocPath Efficacy Evidence\)/);
      assert.match(stdoutHuman, /上下文治理与压缩率:\s*⚡ ~93\.5% 上下文压缩率/);
      assert.match(stdoutHuman, /死循环与翻转拦截:\s*🛡️ 已拦截 2 次死循环，挽救 ~7,000 \(~7K\) Tokens/);
      assert.match(stdoutHuman, /子代理分治隔离收益:\s*👥 子代理分治隔离主会话 ~15,000 \(~15K\) Tokens/);
      assert.match(stdoutHuman, /质量门禁拦截兜底:\s*🎯 1 次质量门禁拦截兜底 \| 100% 门禁首次通过率/);

      assert.match(stdoutHuman, /DocPath 自身摩擦与优化实证 \(DocPath CLI Friction & Optimization\)/);
      assert.match(stdoutHuman, /重复\/空转调用:\s*⚠️ 重复\/空转调用: 2 次 \(浪费 ~1,000 \(~1K\) Tokens\)/);
      assert.match(stdoutHuman, /重复调用明细:\s*🔴 next: 2 次重复 \(浪费 ~1,000 \(~1K\) Tokens\) - Avoid calling next consecutively/);
      assert.match(stdoutHuman, /串行调用链路:\s*🟠 \[go -> next\] 发生 2 次 \(消耗 ~1,000 \(~1K\) Tokens\) \| 建议: 建议升级为复合原子命令消除串行交互/);
      assert.match(stdoutHuman, /超长输出命令:\s*🟡 \[review\] 均输出 ~1,420 \(~1\.4K\) Tokens \| 建议默认启用 --compact/);
      assert.match(stdoutHuman, /消除命令摩擦优化建议 \(Actionable Optimizations\)/);

      // 2. YAML agent view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /docpath_efficacy:/);
      assert.match(stdoutAgent, /prevented_loops_count:\s*2/);
      assert.match(stdoutAgent, /context_compression_ratio:\s*['"]?93\.5%['"]?/);
      assert.match(stdoutAgent, /subagent_tokens_saved:\s*15000/);
      assert.match(stdoutAgent, /gate_interception_count:\s*1/);
      assert.match(stdoutAgent, /first_time_pass_rate:\s*['"]?100%['"]?/);
      assert.match(stdoutAgent, /summary:/);
      assert.match(stdoutAgent, /docpath_cli_friction:/);
      assert.match(stdoutAgent, /redundant_calls_count:\s*2/);
      assert.match(stdoutAgent, /redundant_patterns:/);
      assert.match(stdoutAgent, /subcommand:\s*next/);
      assert.match(stdoutAgent, /serial_chains:/);
      assert.match(stdoutAgent, /chain:\s*go -> next/);
      assert.match(stdoutAgent, /heavy_output_commands:/);
      assert.match(stdoutAgent, /subcommand:\s*review/);
      assert.match(stdoutAgent, /actionable_optimizations:/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --current --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.equal(data.active, true);
      assert.ok(data.activeTask.docpathEfficacy);
      assert.equal(data.activeTask.docpathEfficacy.preventedLoopsCount, 2);
      assert.equal(data.activeTask.docpathEfficacy.deadlockTokensSaved, 7000);
      assert.equal(data.activeTask.docpathEfficacy.subagentTokensSaved, 15000);
      assert.equal(data.activeTask.docpathEfficacy.gateInterceptionCount, 1);
      assert.equal(data.activeTask.docpathEfficacy.contextCompressionRatio, 93.5);

      assert.ok(data.activeTask.docpathCliFriction);
      assert.equal(data.activeTask.docpathCliFriction.redundantCallsCount, 2);
      assert.equal(data.activeTask.docpathCliFriction.redundantPatterns.length, 1);
      assert.equal(data.activeTask.docpathCliFriction.redundantPatterns[0].subcommand, 'next');
      assert.equal(data.activeTask.docpathCliFriction.serialChains.length, 1);
      assert.equal(data.activeTask.docpathCliFriction.serialChains[0].chain, 'go -> next');
      assert.equal(data.activeTask.docpathCliFriction.heavyOutputCommands.length, 1);
      assert.ok(data.activeTask.docpathCliFriction.actionableOptimizations.length >= 2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docpath monitor (global) renders DocPath Efficacy and Friction Evidence panels in Human, YAML, and JSON views', () => {
    const task1 = {
      taskId: 'T-EVIDENCE-GLOBAL-01',
      taskTitle: 'Global Evidence Task',
      profile: 'standard',
      level: 2,
      startedAt: '2026-09-30T10:00:00.000Z',
      completedAt: '2026-09-30T10:15:00.000Z',
      durationMinutes: 15,
      firstTimePassRate: 100,
      complianceScore: 100,
      violations: [],
      totalDiffLines: 150,
      filesChanged: 3,
      linesAdded: 120,
      linesDeleted: 30,
      protocol: { totalInjectedTokens: 2200 },
      realUsage: {
        totalTokens: 90000,
        inputTokens: 75000,
        outputTokens: 15000,
        cachedTokens: 25000,
        docpathEfficacy: {
          preventedLoopsCount: 3,
          deadlockTokensSaved: 10500,
          contextCompressionRatio: 92.5,
          subagentTokensSaved: 30000,
          gateInterceptionCount: 2,
          firstTimePassRate: 100,
          summary: 'DocPath 架构通过契约门禁与轻量路由拦截了 3 次潜在死循环，节省约 10,500 Tokens，上下文压缩比达 92.5%',
        },
        docpathCliFriction: {
          redundantCallsCount: 3,
          redundantTokensWasted: 1500,
          redundantPatterns: [
            { subcommand: 'status', count: 3, tokensWasted: 1500, reason: 'Duplicate status check' },
          ],
          serialChains: [
            { chain: 'go -> next', count: 2, tokensWasted: 1000, recommendation: '建议升级为复合原子命令消除串行交互' },
            { chain: 'check -> done', count: 1, tokensWasted: 500, recommendation: 'docpath done 自动执行 check' },
          ],
          heavyOutputCommands: [
            { subcommand: 'review', avgOutputTokens: 1420, maxOutputTokens: 1500, count: 1, optimizationHint: '建议默认启用 --compact' },
          ],
          actionableOptimizations: ['💡 建议升级为原子复合命令消除串行交互', '建议默认启用 --compact'],
        },
      },
    };

    const cwd = mkWorkspaceWithTasks([task1]);
    try {
      // 1. Human view
      const stdoutHuman = execSync(`node "${BIN}" monitor --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutHuman, /DocPath 效能与必要性实证 \(DocPath Efficacy Evidence\)/);
      assert.match(stdoutHuman, /上下文治理与压缩率:\s*⚡ ~92\.5% 上下文压缩率/);
      assert.match(stdoutHuman, /死循环与翻转拦截:\s*🛡️ 已拦截 3 次死循环，挽救 ~10,500 \(~10\.5K\) Tokens/);
      assert.match(stdoutHuman, /子代理分治隔离收益:\s*👥 子代理分治隔离主会话 ~30,000 \(~30K\) Tokens/);
      assert.match(stdoutHuman, /质量门禁拦截兜底:\s*🎯 2 次质量门禁拦截兜底 \| 100% 门禁首次通过率/);

      assert.match(stdoutHuman, /DocPath 自身摩擦与优化实证 \(DocPath CLI Friction & Optimization\)/);
      assert.match(stdoutHuman, /重复\/空转调用:\s*⚠️ 重复\/空转调用: 3 次 \(浪费 ~1,500 \(~1\.5K\) Tokens\)/);
      assert.match(stdoutHuman, /重复调用明细:\s*🔴 status: 3 次重复 \(浪费 ~1,500 \(~1\.5K\) Tokens\) - Duplicate status check/);
      assert.match(stdoutHuman, /串行调用链路:\s*🟠 \[go -> next\] 发生 2 次 \(消耗 ~1,000 \(~1K\) Tokens\) \| 建议: 建议升级为复合原子命令消除串行交互/);
      assert.match(stdoutHuman, /串行调用链路:\s*🟠 \[check -> done\] 发生 1 次 \(消耗 ~500 Tokens\) \| 建议: docpath done 自动执行 check/);
      assert.match(stdoutHuman, /超长输出命令:\s*🟡 \[review\] 均输出 ~1,420 \(~1\.4K\) Tokens \| 建议默认启用 --compact/);
      assert.match(stdoutHuman, /消除命令摩擦优化建议 \(Actionable Optimizations\)/);

      // 2. YAML agent view
      const stdoutAgent = execSync(`node "${BIN}" monitor --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdoutAgent, /docpath_efficacy:/);
      assert.match(stdoutAgent, /prevented_loops_count:\s*3/);
      assert.match(stdoutAgent, /context_compression_ratio:\s*['"]?92\.5%['"]?/);
      assert.match(stdoutAgent, /subagent_tokens_saved:\s*30000/);
      assert.match(stdoutAgent, /gate_interception_count:\s*2/);
      assert.match(stdoutAgent, /first_time_pass_rate:\s*['"]?100%['"]?/);
      assert.match(stdoutAgent, /summary:/);
      assert.match(stdoutAgent, /docpath_cli_friction:/);
      assert.match(stdoutAgent, /redundant_calls_count:\s*3/);
      assert.match(stdoutAgent, /redundant_patterns:/);
      assert.match(stdoutAgent, /subcommand:\s*status/);
      assert.match(stdoutAgent, /serial_chains:/);
      assert.match(stdoutAgent, /chain:\s*go -> next/);
      assert.match(stdoutAgent, /chain:\s*check -> done/);
      assert.match(stdoutAgent, /heavy_output_commands:/);
      assert.match(stdoutAgent, /subcommand:\s*review/);
      assert.match(stdoutAgent, /actionable_optimizations:/);

      // 3. JSON view
      const stdoutJson = execSync(`node "${BIN}" monitor --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdoutJson);
      assert.ok(data.globalDocPathEfficacy);
      assert.equal(data.globalDocPathEfficacy.preventedLoopsCount, 3);
      assert.equal(data.globalDocPathEfficacy.deadlockTokensSaved, 10500);
      assert.equal(data.globalDocPathEfficacy.subagentTokensSaved, 30000);
      assert.equal(data.globalDocPathEfficacy.gateInterceptionCount, 2);

      assert.ok(data.globalDocPathCliFriction);
      assert.equal(data.globalDocPathCliFriction.redundantCallsCount, 3);
      assert.equal(data.globalDocPathCliFriction.redundantPatterns.length, 1);
      assert.equal(data.globalDocPathCliFriction.redundantPatterns[0].subcommand, 'status');
      assert.equal(data.globalDocPathCliFriction.serialChains.length, 2);
      assert.equal(data.globalDocPathCliFriction.heavyOutputCommands.length, 1);
      assert.ok(data.globalDocPathCliFriction.actionableOptimizations.length >= 2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});






