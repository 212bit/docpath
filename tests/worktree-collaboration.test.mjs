import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-wt-collab-'));
  execSync('git init -b main', { cwd });
  execSync('git config user.name "Tester"', { cwd });
  execSync('git config user.email "tester@example.com"', { cwd });

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: collab-test\n');
  writeFileSync(join(cwd, 'README.md'), '# Collaboration Test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    schema_version: 1,
    phase: 'idle',
    task_id: null,
  }, null, 2));

  execSync('git add . && git commit -m "init"', { cwd });
  return cwd;
}

function run(args, cwd, env = {}) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: { ...process.env, ...env } });
}

describe('docpath worktree multi-agent collaboration & matrix', () => {
  it('displays worktree matrix across multiple active agent branches', () => {
    const cwd = mkGitRepo();
    try {
      // Create worktree for Agent A
      run('worktree create feat-a', cwd);
      const wtAPath = join(cwd, '.worktrees', 'feat-a');

      // Seed task for Agent A
      writeFileSync(join(wtAPath, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-20260919-agent-a',
      }, null, 2));

      mkdirSync(join(wtAPath, '.docpath', 'tasks', 'current'), { recursive: true });
      writeFileSync(join(wtAPath, '.docpath', 'tasks', 'current', 'spec.md'), [
        '# T-20260919-agent-a - Agent A Feature Work',
        '',
        '## 2. 需求清单',
        '- [ ] FR-1: Work',
      ].join('\n'));

      const matrixOut = run('worktree matrix', cwd);
      assert.match(matrixOut, /多 Agent 并发 Worktree 协作矩阵/);
      assert.match(matrixOut, /main \(main\)/);
      assert.match(matrixOut, /feat-a/);
      assert.match(matrixOut, /T-20260919/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --agent structured YAML for worktree matrix', () => {
    const cwd = mkGitRepo();
    try {
      run('worktree create feat-b', cwd);
      const wtBPath = join(cwd, '.worktrees', 'feat-b');

      writeFileSync(join(wtBPath, '.docpath', 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'checking',
        task_id: 'T-20260919-agent-b',
      }, null, 2));

      const agentOut = run('worktree matrix --agent', cwd, { DOCPATH_SESSION: 'codex-agent' });
      assert.match(agentOut, /agent_view: worktree_matrix/);
      assert.match(agentOut, /total_worktrees:/);
      assert.match(agentOut, /feat-b/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('broadcasts inter-agent messages across all active worktrees', () => {
    const cwd = mkGitRepo();
    try {
      run('worktree create feat-c', cwd);
      run('worktree create feat-d', cwd);

      const wtC = join(cwd, '.worktrees', 'feat-c');
      const wtD = join(cwd, '.worktrees', 'feat-d');

      const broadcastOut = run('worktree broadcast "Core API upgraded to v2"', cwd);
      assert.match(broadcastOut, /跨 Worktree 消息广播完成/);
      assert.match(broadcastOut, /Core API upgraded to v2/);

      // Verify broadcast recorded in breadcrumb.jsonl of worktrees
      const breadcrumbC = readFileSync(join(wtC, '.docpath', 'workspace', 'breadcrumb.jsonl'), 'utf-8');
      assert.match(breadcrumbC, /agent\.broadcast/);
      assert.match(breadcrumbC, /Core API upgraded to v2/);

      const breadcrumbD = readFileSync(join(wtD, '.docpath', 'workspace', 'breadcrumb.jsonl'), 'utf-8');
      assert.match(breadcrumbD, /agent\.broadcast/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
