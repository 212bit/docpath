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
