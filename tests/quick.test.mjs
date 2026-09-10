import './registry-isolation.mjs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-quick-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: quick-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: '',
    task_title: '',
    phase: 'completed',
    gate: 'review_pass',
    current_step: 'ready',
    started_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runWithInput(args, cwd, input) {
  return execSync(`node ${BIN} ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function nextAgent(cwd, opts = {}) {
  const verbose = opts.verbose ? ' --verbose' : '';
  return parse(run(`next --cwd ${cwd} --agent${verbose}`, cwd));
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function initGitRepo(cwd) {
  git(cwd, 'init');
  git(cwd, 'config user.email test@example.com');
  git(cwd, 'config user.name Test');
  git(cwd, 'add .');
  git(cwd, 'commit -m initial');
}

describe('docpath quick', () => {
  it('quick profile downgrades check to lite when change stays inside quick scope (B1)', () => {
    const cwd = mkWorkspace();
    execSync('git init -q', { cwd, stdio: 'ignore' });
    execSync('git config user.email t@example.com', { cwd, stdio: 'ignore' });
    execSync('git config user.name test', { cwd, stdio: 'ignore' });
    execSync('git add -A && git commit -qm base', { cwd, stdio: 'ignore' });
    run(`quick "Fix typo in docs" --cwd ${cwd}`, cwd);
    // 改动落在非核心路径且数量在 quick 上限内
    mkdirSync(join(cwd, 'docs'), { recursive: true });
    writeFileSync(join(cwd, 'docs', 'note.md'), 'hello\n');

    const out = run(`check --cwd ${cwd}`, cwd);

    assert.match(out, /quick 降档/, 'quick 且未触核心路径时应降档');
    assert.doesNotMatch(out, /测试检查/, '降档后不得跑测试检查');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('quick profile falls back to full check when change touches a core path (B1 fail-safe)', () => {
    const cwd = mkWorkspace();
    execSync('git init -q', { cwd, stdio: 'ignore' });
    execSync('git config user.email t@example.com', { cwd, stdio: 'ignore' });
    execSync('git config user.name test', { cwd, stdio: 'ignore' });
    execSync('git add -A && git commit -qm base', { cwd, stdio: 'ignore' });
    run(`quick "Fix typo in docs" --cwd ${cwd}`, cwd);
    // 触碰核心工作流引擎路径 —— 必须回落全量, 不降档
    mkdirSync(join(cwd, 'src', 'engine'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'engine', 'core.ts'), 'export const a = 1;\n');

    const res = runResult(`check --cwd ${cwd} --skip-tests`, cwd);

    assert.doesNotMatch(res.out, /quick 降档/, '触碰核心路径时不得降档');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates an active quick task and routes next directly to done', () => {
    const cwd = mkWorkspace();

    const out = run(`quick "Fix typo in docs" --cwd ${cwd}`, cwd);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    const taskId = state.task_id;
    const next = nextAgent(cwd);

    assert.match(out, /quick task 已创建/);
    assert.match(taskId, /^T-\d{8}-quick-fix-typo-in-docs/);
    assert.equal(state.workflow_profile, 'quick');
    assert.equal(state.level, 1);
    assert.equal(state.phase, 'executing');
    assert.equal(next.workflow_profile, 'quick');
    assert.equal(next.recommended_command, 'docpath done');
    assert.match(next.next_action, /quick/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', taskId, 'quick.md'), 'utf-8'), /workflow_profile: quick/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'quick.md'), 'utf-8'), /check: required/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports effective standard profile for a quick task raised to level 2', () => {
    const cwd = mkWorkspace();
    run(`quick "Investigate workflow behavior" --cwd ${cwd}`, cwd);
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    writeFileSync(statePath, JSON.stringify({ ...state, level: 2 }, null, 2));

    const next = nextAgent(cwd);

    assert.equal(next.workflow_profile, 'standard');
    assert.equal(next.stored_workflow_profile, 'quick');
    assert.match(next.workflow_profile_upgrade_reasons.join('\n'), /任务复杂度级别为 L2/);
    // gate_policy 常规省略，verbose 才展开
    const verboseNext = nextAgent(cwd, { verbose: true });
    assert.equal(verboseNext.gate_policy.requires_review, true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports effective standard profile when quick spec requires major change gate', () => {
    const cwd = mkWorkspace();
    run(`quick "Change agent workflow" --cwd ${cwd}`, cwd);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    const specPath = join(cwd, '.docpath', 'tasks', state.task_id, 'spec.md');
    let specContent = readFileSync(specPath, 'utf-8');
    specContent = specContent.replace('- [ ] 是，需要用户确认', '- [x] 是，需要用户确认');
    specContent = specContent.replace('- [x] 否', '- [ ] 否');
    specContent = specContent.replace('- [ ] 工作流 / Agent 行为', '- [x] 工作流 / Agent 行为');
    runWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, specContent);

    const status = parse(run(`status --cwd ${cwd} --agent`, cwd));

    assert.equal(status.workflow_profile, 'standard');
    assert.equal(status.stored_workflow_profile, 'quick');
    assert.match(status.workflow_profile_upgrade_reasons.join('\n'), /工作流 \/ Agent 行为/);
    // gate_policy 常规省略，verbose 才展开
    const verboseStatus = parse(run(`status --cwd ${cwd} --agent --verbose`, cwd));
    assert.equal(verboseStatus.gate_policy.requires_spec, true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('done completes a quick task without requiring full review', () => {
    const cwd = mkWorkspace();
    run(`quick "Fix typo" --cwd ${cwd}`, cwd);

    const out = run(`done --cwd ${cwd}`, cwd);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    const decisions = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions.md'), 'utf-8');
    const lastCheck = readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), 'utf-8');

    assert.match(out, /review skipped by quick profile|quick profile policy/);
    assert.equal(state.phase, 'completed');
    assert.equal(state.gate, 'review_skipped');
    assert.equal(state.workflow_profile, 'quick');
    assert.doesNotMatch(out, /gate: review_pass/);
    assert.match(decisions, /quick profile: full review skipped/);
    assert.match(lastCheck, /PASS/);
    const next = nextAgent(cwd);
    assert.equal(next.gate, 'review_skipped');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('blocks quick closeout when the change scope is too large', () => {
    const cwd = mkWorkspace();
    run(`quick "Tiny patch" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    for (const file of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
      writeFileSync(join(cwd, file), 'changed\n');
    }

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.notEqual(result.code, 0);
    assert.match(result.out, /scope exceeds quick profile boundaries/);
    assert.match(result.out, /Upgrade path/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('allows document-only quick changes beyond the normal file-count limit', () => {
    const cwd = mkWorkspace();
    run(`quick "Docs polish" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    mkdirSync(join(cwd, 'docs'), { recursive: true });
    for (const file of ['README.md', 'CHANGELOG.md', 'docs/a.md', 'docs/b.md']) {
      writeFileSync(join(cwd, file), '# docs\n');
    }

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.equal(result.code, 0);
    assert.match(result.out, /quick profile policy/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('ignores DocPath-owned runtime files when enforcing quick scope limits', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), [
      'project:',
      '  name: quick-test',
      'quick:',
      '  max_changed_files: 1',
      '  allow_document_only: false',
      '',
    ].join('\n'));
    run(`quick "Runtime churn" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    writeFileSync(join(cwd, '.docpath', '.install-meta.json'), '{"installed":true}\n');
    writeFileSync(join(cwd, '.docpath', 'docs-index.json'), '{"docs":[]}\n');
    writeFileSync(join(cwd, '.docpath', 'workspace.json'), '{"runtime":true}\n');
    writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), '{"runtime":true}\n');

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /quick profile policy/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('allows configured quick scope patterns', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), [
      'project:',
      '  name: quick-test',
      'quick:',
      '  allow_patterns:',
      '    - src/engine/*.ts',
      '',
    ].join('\n'));
    run(`quick "Allowed engine fixture" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    mkdirSync(join(cwd, 'src', 'engine'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'engine', 'fixture.ts'), 'export const fixture = true;\n');

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.equal(result.code, 0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('still rejects risky quick source changes by default', () => {
    const cwd = mkWorkspace();
    run(`quick "Risky command patch" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    mkdirSync(join(cwd, 'src', 'commands'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'commands', 'agent.ts'), 'export const risky = true;\n');

    const result = runResult(`done --cwd ${cwd}`, cwd);

    assert.notEqual(result.code, 0);
    assert.match(result.out, /core lifecycle command changed/);
    assert.match(result.out, /Policy: max_changed_files=/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('automatically upgrades quick profile to standard during docpath check if quick scope is exceeded', () => {
    const cwd = mkWorkspace();
    run(`quick "Test scope upgrade" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);
    
    // Create changes that exceed quick scope (e.g. modify 4 files)
    for (const file of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
      writeFileSync(join(cwd, file), 'changed\n');
    }

    // Run check, which should trigger the upgrade
    const result = runResult(`check --cwd ${cwd}`, cwd);

    // It should log the upgrade warning and block because standard spec/plan is missing
    assert.match(result.out, /检测到高等级属性、需求规格或超限变更，已自动将工作流 Profile 从 "quick" 升级为 "standard"/);
    assert.match(result.out, /代码变更超出 quick 限制/);
    assert.notEqual(result.code, 0);

    // Verify state.json was mutated
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.workflow_profile, 'standard');
    assert.equal(state.level, 2);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('automatically upgrades quick profile to standard during docpath check if spec requires major change gate', () => {
    const cwd = mkWorkspace();
    run(`quick "Test spec upgrade" --cwd ${cwd}`, cwd);
    initGitRepo(cwd);

    // Modify spec.md to require major change gate
    const stateBefore = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    const specPath = join(cwd, '.docpath', 'tasks', stateBefore.task_id, 'spec.md');
    let specContent = readFileSync(specPath, 'utf-8');
    specContent = specContent.replace('- [ ] 是，需要用户确认', '- [x] 是，需要用户确认');
    specContent = specContent.replace('- [x] 否', '- [ ] 否');
    runWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, specContent);

    // Run check, which should trigger the upgrade
    const result = runResult(`check --cwd ${cwd}`, cwd);

    assert.match(result.out, /检测到高等级属性、需求规格或超限变更，已自动将工作流 Profile 从 "quick" 升级为 "standard"/);
    assert.match(result.out, /任务需求规格（spec.md）要求重大变更确认门禁/);
    assert.notEqual(result.code, 0);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.workflow_profile, 'standard');
    assert.equal(state.level, 2);

    rmSync(cwd, { recursive: true, force: true });
  });
});
