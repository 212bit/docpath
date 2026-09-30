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


