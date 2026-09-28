import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
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

  // Done Task 1 metrics.json
  writeFileSync(join(dp, 'tasks', 'done', 'T-100', 'metrics.json'), JSON.stringify({
    taskId: 'T-100',
    taskTitle: 'Task 100 Implementation',
    backlogId: 'R-100',
    profile: 'standard',
    level: 2,
    startedAt: '2026-09-28T10:00:00.000Z',
    completedAt: '2026-09-28T10:05:00.000Z',
    durationSeconds: 300,
    durationMinutes: 5,
    totalSteps: 2,
    passedSteps: 2,
    blockedSteps: 0,
    firstTimePassRate: 100,
    filesChanged: 3,
    linesAdded: 80,
    linesDeleted: 10,
    totalDiffLines: 90,
    estimatedContextTokens: 6600,
    tokensPerDiffLine: 73,
  }, null, 2));

  // 追加到全局 task-metrics.jsonl
  writeFileSync(join(dp, 'workspace', 'task-metrics.jsonl'), JSON.stringify({
    taskId: 'T-100',
    taskTitle: 'Task 100 Implementation',
    backlogId: 'R-100',
    profile: 'standard',
    level: 2,
    startedAt: '2026-09-28T10:00:00.000Z',
    completedAt: '2026-09-28T10:05:00.000Z',
    durationSeconds: 300,
    durationMinutes: 5,
    totalSteps: 2,
    passedSteps: 2,
    blockedSteps: 0,
    firstTimePassRate: 100,
    filesChanged: 3,
    linesAdded: 80,
    linesDeleted: 10,
    totalDiffLines: 90,
    estimatedContextTokens: 6600,
    tokensPerDiffLine: 73,
  }) + '\n');

  return cwd;
}

describe('Task Metrics & stats Command (R-433)', () => {
  it('collects and aggregates historical task metrics via stats --json', () => {
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
      assert.equal(data.recentTasks[0].taskId, 'T-100');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs compact YAML telemetry via stats --agent', () => {
    const cwd = mkWorkspace();
    try {
      const stdout = execSync(`node "${BIN}" stats --cwd "${cwd}" --agent`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /agent_view:\s*task_efficiency_overview/);
      assert.match(stdout, /total_tasks:\s*1/);
      assert.match(stdout, /avg_cycle_time_minutes:\s*5/);
      assert.match(stdout, /avg_first_time_pass_rate:\s*100%/);
      assert.match(stdout, /task_id:\s*T-100/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders human-readable stats dashboard cleanly', () => {
    const cwd = mkWorkspace();
    try {
      const stdout = execSync(`node "${BIN}" stats --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      assert.match(stdout, /DocPath 任务效能与 Token 投入产出看板/);
      assert.match(stdout, /累计交付任务:\s*1/);
      assert.match(stdout, /平均交付耗时:\s*5 分钟 \/ 任务/);
      assert.match(stdout, /T-100/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
