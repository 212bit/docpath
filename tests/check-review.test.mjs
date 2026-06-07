import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

const runResult = (args, cwd) => {
  try {
    return {
      code: 0,
      out: execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (e) {
    return {
      code: e.status || 1,
      out: (e.stdout || '') + '\n' + (e.stderr || ''),
    };
  }
};

describe('check and review commands', () => {
  let tmpdir_path;
  before(() => {
    tmpdir_path = mkdtempSync(join(tmpdir(), 'docpath-check-'));
    mkExecWorkspace(tmpdir_path);
  });
  after(() => rmSync(tmpdir_path, { recursive: true, force: true }));

  it('check --dry-run produces output', () => {
    const out = run('check --dry-run', tmpdir_path);
    assert.ok(out.length > 0, 'dry-run should produce output');
  });

  it('check --skip-tests --skip-lint runs without errors', () => {
    const out = run('check --skip-tests --skip-lint', tmpdir_path);
    assert.ok(out.length > 0, 'should produce output');
  });

  it('check reports active task document paths and field locations for structure errors', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-structure-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'workspace'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
    mkdirSync(join(dp, 'spec'), { recursive: true });
    writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: structure-test\n  type: node\n');
    writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
    writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-STRUCT',
      task_title: 'Structure diagnostics',
      phase: 'executing',
      gate: 'none',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
    writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
    writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Broken Spec\n\n## 2. 需求清单\n');
    writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: broken step',
      '- **描述**: only description',
      '',
    ].join('\n'));

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /spec\.md 结构校验/);
    assert.match(result.out, /检查文件: .*\.docpath\/tasks\/current\/spec\.md/);
    assert.match(result.out, /缺少 `### 功能需求` 章节 \(line 3, section ## 2\. 需求清单, field ### 功能需求\)/);
    assert.match(result.out, /plan\.md 结构校验/);
    assert.match(result.out, /检查文件: .*\.docpath\/tasks\/current\/plan\.md/);
    assert.match(result.out, /以下步骤缺少 `验收条件`: S1 \(line 3, section S1, field 验收条件\)/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review --dry-run produces output', () => {
    const reviewPath = join(tmpdir_path, '.docpath', 'workspace', 'review.md');
    const decisionsPath = join(tmpdir_path, '.docpath', 'workspace', 'decisions.md');
    const breadcrumbPath = join(tmpdir_path, '.docpath', 'workspace', 'breadcrumb.md');
    const statePath = join(tmpdir_path, '.docpath', 'workspace', 'state.json');
    const beforeBreadcrumb = readFileSync(breadcrumbPath, 'utf-8');
    const beforeState = readFileSync(statePath, 'utf-8');

    const result = runResult('review --dry-run', tmpdir_path);

    assert.equal(result.code, 0);
    assert.ok(result.out.length > 0, 'dry-run should produce output');
    assert.match(result.out, /\[dry-run\]/);
    assert.equal(existsSync(reviewPath), false);
    assert.equal(existsSync(decisionsPath), false);
    assert.equal(readFileSync(breadcrumbPath, 'utf-8'), beforeBreadcrumb);
    assert.equal(readFileSync(statePath, 'utf-8'), beforeState);
  });

  it('review shows real file names for TODO findings', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-todo-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git -c user.email=test@example.com -c user.name=Test commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'todo.ts'), '// TODO handle follow-up\n');
    execSync('git add todo.ts', { cwd, encoding: 'utf-8' });

    const out = run(`review --cwd ${cwd}`, cwd);

    assert.match(out, /todo\.ts/);
    assert.match(out, /未处理的 TODO/);
    assert.doesNotMatch(out, /\[f\.file\]/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review defaults to current worktree changes instead of last commit', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-review-worktree-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
    execSync('git add baseline.ts', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'todo.ts'), '// TODO review current worktree\n');

    const out = run(`review --cwd ${cwd} --dry-run`, cwd);

    assert.match(out, /todo\.ts/);
    assert.match(out, /未处理的 TODO/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('check writes git baseline metadata into last-check evidence', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-check-git-baseline-'));
    mkExecWorkspace(cwd);
    execSync('git init', { cwd, encoding: 'utf-8' });
    execSync('git config user.email test@example.com', { cwd, encoding: 'utf-8' });
    execSync('git config user.name Test', { cwd, encoding: 'utf-8' });
    writeFileSync(join(cwd, 'README.md'), '# baseline\n');
    execSync('git add .', { cwd, encoding: 'utf-8' });
    execSync('git commit -m baseline', { cwd, encoding: 'utf-8' });
    const head = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();

    const result = runResult(`check --cwd ${cwd} --skip-tests --skip-lint --fix-drift current`, cwd);
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.equal(result.code, 0);
    assert.match(lastCheck, new RegExp(`git_ref: ${head}`));
    assert.match(lastCheck, /branch: (main|master)/);
    assert.match(lastCheck, /worktree_dirty: (true|false)/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('status warns when current executing task has pending-done sentinel', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-AGENT',
      task_title: 'Agent Lifecycle',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-AGENT
entered_at: 2026-06-01T00:00:00.000Z
phase: executing
warned: false
---
`);

    const out = run('status', tmpdir_path);

    assert.match(out, /未收尾哨兵/);
    assert.match(out, /docpath agent done/);
    assert.match(out, /task_id: T-AGENT/);
  });

  it('status does not warn when sentinel belongs to another task', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-AGENT',
      task_title: 'Agent Lifecycle',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-OTHER
entered_at: 2026-06-01T00:00:00.000Z
phase: executing
warned: false
---
`);

    const out = run('status', tmpdir_path);

    assert.doesNotMatch(out, /未收尾哨兵/);
    assert.doesNotMatch(out, /docpath agent done/);
  });

  it('status writes stale pending-done warning breadcrumb only once', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-AGENT',
      task_title: 'Agent Lifecycle',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-AGENT
entered_at: 2026-05-29T00:00:00.000Z
phase: executing
warned: false
---
`);

    run('status', tmpdir_path);
    run('status', tmpdir_path);

    const breadcrumb = readFileSync(join(tmpdir_path, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const matches = breadcrumb.match(/\[WARN\] Task T-AGENT active >24h without done/g) || [];
    assert.equal(matches.length, 1);
    const sentinel = readFileSync(join(tmpdir_path, '.docpath', 'workspace', 'pending-done.md'), 'utf-8');
    assert.match(sentinel, /warned: true/);
  });

  it('status human output exposes state, phase, gate and source truth', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 3,
      task_id: 'T-S1',
      task_title: 'Status Output',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'current.md'), '# Current\n');

    const out = run('status', tmpdir_path);

    assert.match(out, /状态:\s+executing/);
    assert.match(out, /阶段:\s+executing/);
    assert.match(out, /门禁:\s+none/);
    assert.match(out, /状态真源:\s+\.docpath\/workspace\/state\.json/);
    assert.match(out, /渲染产物:.*\.docpath\/workspace\/current\.md/);
    assert.doesNotMatch(out, /current\.md 是否存在/);
  });

  it('status --agent keeps machine output unchanged', () => {
    writeFileSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 3,
      task_id: 'T-S1',
      task_title: 'Status Output',
      phase: 'executing',
      gate: 'none',
      state: 'executing',
      current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }, null, 2));

    const out = run('status --agent', tmpdir_path);

    assert.match(out, /^state:/m);
    assert.match(out, /^phase:/m);
    assert.match(out, /^gate:/m);
    assert.doesNotMatch(out, /状态真源/);
  });

  it('status uninitialized hint points to state.json and current.md relationship', () => {
    rmSync(join(tmpdir_path, '.docpath', 'workspace', 'state.json'), { force: true });
    rmSync(join(tmpdir_path, '.docpath', 'workspace', 'current.md'), { force: true });

    const out = run('status', tmpdir_path);

    assert.match(out, /未找到可解析的工作流状态/);
    assert.match(out, /state\.json 是否存在/);
    assert.match(out, /current\.md 只是由 state\.json 重建的渲染产物/);
  });
});
