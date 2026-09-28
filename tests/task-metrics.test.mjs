import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-stats-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-100'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: stats-test\n');

  // 初始化 git 仓库
  try {
    execSync('git init -b main', { cwd, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd, stdio: 'ignore' });
    writeFileSync(join(cwd, 'initial.txt'), 'init content\n');
    execSync('git add . && git commit -m "initial commit"', { cwd, stdio: 'ignore' });
  } catch {
    // 容错
  }

  // Done Task 1
  writeFileSync(join(dp, 'tasks', 'done', 'T-100', 'spec.json'), JSON.stringify({
    task_id: 'T-100',
    title: 'Task 100 Implementation',
    backlog_id: 'R-100',
  }));
  writeFileSync(join(dp, 'tasks', 'done', 'T-100', 'plan.json'), JSON.stringify({
    steps: [
      { id: 'S1', status: 'done' },
      { id: 'S2', status: 'done' },
    ],
  }));
  writeFileSync(join(dp, 'tasks', 'done', 'T-100', 'breadcrumb.jsonl'), [
    JSON.stringify({ timestamp: '2026-09-28T10:00:00.000Z', step: 'S1', status: 'done', taskId: 'T-100' }),
    JSON.stringify({ timestamp: '2026-09-28T10:05:00.000Z', step: 'S2', status: 'done', taskId: 'T-100' }),
  ].join('\n') + '\n');

  const taskMetricObj = {
    taskId: 'T-100',
    taskTitle: 'Task 100 Implementation',
    backlogId: 'R-100',
    profile: 'standard',
    level: 2,
    startedAt: '2026-09-28T10:00:00.000Z',
    completedAt: '2026-09-28T10:05:00.000Z',
    durationMinutes: 5,
    firstTimePassRate: 100,
    totalDiffLines: 90,
    filesChanged: 3,
    linesAdded: 80,
    linesDeleted: 10,
    engineering: {
      turnCount: 2,
      retryCount: 0,
      firstTimePassRate: 100,
      cycleTimeMinutes: 5,
      filesChanged: 3,
      linesAdded: 80,
      linesDeleted: 10,
      totalDiffLines: 90,
      speedLinesPerMinute: 18,
    },
    protocol: {
      specTokens: 250,
      planTokens: 150,
      rulesTokens: 1800,
      totalInjectedTokens: 2200,
    },
    realUsage: {
      source: 'antigravity',
      inputTokens: 35000,
      outputTokens: 1200,
      totalTokens: 36200,
      costUsd: 0.045,
      toolCallsCount: 14,
    },
  };

  // Done Task 1 metrics.json
  writeFileSync(join(dp, 'tasks', 'done', 'T-100', 'metrics.json'), JSON.stringify(taskMetricObj, null, 2));

  // 追加到全局 task-metrics.jsonl
  writeFileSync(join(dp, 'workspace', 'task-metrics.jsonl'), JSON.stringify(taskMetricObj) + '\n');

  return cwd;
}

describe('Refactored Task Metrics & stats Telemetry (R-434)', () => {
  it('aggregates objective engineering metrics and real agent telemetry via stats --json', () => {
    const cwd = mkWorkspace();
    try {
      const stdout = execSync(`node "${BIN}" stats --cwd "${cwd}" --json`, {
        encoding: 'utf-8',
      });
      const data = JSON.parse(stdout);
      assert.equal(data.totalTasks, 1);
      assert.equal(data.avgDurationMinutes, 5);
      assert.equal(data.avgFirstTimePassRate, 100);
      assert.equal(data.totalLinesChanged, 90);
      assert.equal(data.avgProtocolTokensPerTask, 2200);
      assert.ok(data.realUsageSummary);
      assert.equal(data.realUsageSummary.totalRealTokens, 36200);
      assert.equal(data.recentTasks[0].taskId, 'T-100');
      assert.equal(data.recentTasks[0].engineering.turnCount, 2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs partitioned YAML telemetry via stats --agent', () => {
    const cwd = mkWorkspace();
    try {
      const stdout = execSync(`node "${BIN}" stats --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /agent_view:\s*task_efficiency_overview/);
      assert.match(stdout, /engineering_metrics:/);
      assert.match(stdout, /avg_cycle_time_minutes:\s*5/);
      assert.match(stdout, /protocol_overhead:/);
      assert.match(stdout, /avg_injected_tokens_per_task:\s*2200/);
      assert.match(stdout, /real_agent_usage:/);
      assert.match(stdout, /totalRealTokens:\s*36200/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders partitioned human-readable stats dashboard cleanly', () => {
    const cwd = mkWorkspace();
    try {
      const stdout = execSync(`node "${BIN}" stats --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /DocPath 任务效能与 Token 投入产出看板/);
      assert.match(stdout, /客观工程效能基线/);
      assert.match(stdout, /Token 与协议开销透视/);
      assert.match(stdout, /DocPath 协议注入/);
      assert.match(stdout, /真实会话消耗/);
      assert.match(stdout, /T-100/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
