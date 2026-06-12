import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ gate = 'check_pass' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-learn-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: learn-test\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n\n## Existing\n\nKeep this rule.\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n\n## Existing\n\nKeep this boundary.\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: Done\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-LEARN',
    task_title: 'Learn loop',
    phase: 'checking',
    gate,
    current_step: 'S1',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-LEARN] — 2026-05-29T00:00:00.000Z',
    '',
    '---',
    'taskId: T-LEARN',
    'step: S1',
    'status: done',
    'timestamp: 2026-05-29T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: ✅ 推荐在 CLI 输出中保留明确下一步',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'last-check.md'), [
    '# Last Check Evidence',
    '',
    '**时间**: 2026-05-29T00:00:00.000Z',
    '**结果**: ✅ PASS',
    '**检查项**: 1',
    '',
    '- ✅ smoke',
    '',
  ].join('\n'));
  return cwd;
}

function moveLegacyRulesToRules(cwd) {
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'rules'), { recursive: true });
  writeFileSync(join(dp, 'rules', 'style.md'), readFileSync(join(dp, 'spec', 'style.md'), 'utf-8'));
  writeFileSync(join(dp, 'rules', 'architecture.md'), readFileSync(join(dp, 'spec', 'architecture.md'), 'utf-8'));
}

function count(content, needle) {
  return content.split(needle).length - 1;
}

function countRule(content, keyword) {
  const pattern = new RegExp(`- \\*\\*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:`, 'g');
  return [...content.matchAll(pattern)].length;
}

describe('journal to learn loop', () => {
  it('learn merges candidate lessons into style and architecture with source trace and no duplicates', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LEARN style rule',
      '',
      '- task_id: T-LEARN',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: cli-next-action',
      '',
      '### Lesson',
      '',
      '✅ 推荐在 CLI 输出中保留明确下一步，方便 Agent 恢复。',
      '',
      '---',
      '',
      '## T-LEARN architecture rule',
      '',
      '- task_id: T-LEARN',
      '- type: architecture',
      '- target: architecture',
      '- source: journal',
      '- key: workflow-boundary',
      '',
      '### Lesson',
      '',
      '🏗️ 架构边界：工作流状态只能通过 transitionWorkflow 迁移。',
      '',
      '---',
      '',
    ].join('\n'));

    execSync(`node ${BIN} learn --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });
    execSync(`node ${BIN} learn --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const style = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const architecture = readFileSync(join(dp, 'spec', 'architecture.md'), 'utf-8');

    assert.match(style, /Keep this rule/);
    assert.match(style, /docpath:auto-learn:style/);
    assert.match(style, /cli-next-action/);
    assert.match(style, /来源: task: T-LEARN, source: journal/);
    assert.equal(countRule(style, 'cli-next-action'), 1);

    assert.match(architecture, /Keep this boundary/);
    assert.match(architecture, /docpath:auto-learn:architecture/);
    assert.match(architecture, /workflow-boundary/);
    assert.match(architecture, /来源: task: T-LEARN, source: journal/);
    assert.equal(countRule(architecture, 'workflow-boundary'), 1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn prefers .docpath/rules for new projects', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    moveLegacyRulesToRules(cwd);
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LEARN rules path',
      '',
      '- task_id: T-LEARN',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: rules-first',
      '',
      '### Lesson',
      '',
      '✅ 新项目应把学习规则写入 rules 目录。',
      '',
    ].join('\n'));

    execSync(`node ${BIN} learn --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const rulesStyle = readFileSync(join(dp, 'rules', 'style.md'), 'utf-8');
    const legacyStyle = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    assert.match(rulesStyle, /rules-first/);
    assert.doesNotMatch(legacyStyle, /rules-first/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn --from-journal ignores lesson-candidates and extracts directly from journal', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## stale rule',
      '',
      '- task_id: T-OLD',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: stale-rule',
      '',
      '### Lesson',
      '',
      '✅ 这是不应该被 from-journal 模式采用的旧规则。',
      '',
    ].join('\n'));
    writeFileSync(join(dp, 'workspace', 'journal.md'), [
      '# Journal',
      '',
      '✅ 推荐使用 journal 直读模式，避免 lesson-candidates 过期。',
      '🏗️ 架构边界：学习命令应允许绕过候选缓存，直接从原始经验提取。',
      '',
    ].join('\n'));

    const output = execSync(`node ${BIN} learn --cwd ${cwd} --from-journal`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const style = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const architecture = readFileSync(join(dp, 'spec', 'architecture.md'), 'utf-8');

    assert.match(output, /发现 2 条规则/);
    assert.doesNotMatch(style, /stale-rule/);
    assert.match(style, /journal/);
    assert.match(style, /直读模式/);
    assert.match(architecture, /绕过候选缓存/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn --dry-run previews lesson-candidates but does not modify spec files', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## preview style rule',
      '',
      '- task_id: T-LEARN',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: preview-rule',
      '',
      '### Lesson',
      '',
      '✅ 推荐在预览模式下显示来源模式和规则数量。',
      '',
    ].join('\n'));

    const styleBefore = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const architectureBefore = readFileSync(join(dp, 'spec', 'architecture.md'), 'utf-8');
    const output = execSync(`node ${BIN} learn --cwd ${cwd} --dry-run`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const styleAfter = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const architectureAfter = readFileSync(join(dp, 'spec', 'architecture.md'), 'utf-8');

    assert.match(output, /\[dry-run\]/);
    assert.match(output, /来源模式: lesson-candidates/);
    assert.match(output, /style 规则: 提取 1 \/ 新增 1 \/ 跳过 0/);
    assert.match(output, /architecture 规则: 提取 0 \/ 新增 0 \/ 跳过 0/);
    assert.equal(styleAfter, styleBefore);
    assert.equal(architectureAfter, architectureBefore);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn --from-journal --dry-run can preview direct journal extraction without writing files', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## stale rule',
      '',
      '- task_id: T-OLD',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: stale-rule',
      '',
      '### Lesson',
      '',
      '✅ 旧候选规则。',
      '',
    ].join('\n'));
    writeFileSync(join(dp, 'workspace', 'journal.md'), [
      '# Journal',
      '',
      '✅ 推荐 dry-run 时也明确直读 journal 来源。',
      '',
    ].join('\n'));

    const styleBefore = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const output = execSync(`node ${BIN} learn --cwd ${cwd} --from-journal --dry-run`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const styleAfter = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');

    assert.match(output, /来源模式: journal/);
    assert.match(output, /style 规则: 提取 1 \/ 新增 1 \/ 跳过 0/);
    assert.equal(styleAfter, styleBefore);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn preserves existing auto-learn rules and skips historical duplicates', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'spec', 'style.md'), [
      '# Style',
      '',
      '## Existing',
      '',
      'Keep this rule.',
      '',
      '<!-- docpath:auto-learn:style -->',
      '## 自动学习规则',
      '',
      '### ✅ 最佳实践',
      '',
      '- **cli-next-action**: ✅ 推荐在 CLI 输出中保留明确下一步，方便 Agent 恢复。 _(来源: task: T-LEARN, source: journal)_',
      '<!-- docpath:lesson-meta best-practice:style:cli-next-action:journal:t-learn -->',
      '',
    ].join('\n'));
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## duplicate style rule',
      '',
      '- task_id: T-LEARN',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: cli-next-action',
      '',
      '### Lesson',
      '',
      '✅ 推荐在 CLI 输出中保留明确下一步，方便 Agent 恢复。',
      '',
      '---',
      '',
      '## new style rule',
      '',
      '- task_id: T-LEARN',
      '- type: convention',
      '- target: style',
      '- source: journal',
      '- key: cli-output-format',
      '',
      '### Lesson',
      '',
      '📋 规范 CLI 输出格式，保证恢复信息稳定可读。',
      '',
    ].join('\n'));

    const output = execSync(`node ${BIN} learn --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const style = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');

    assert.match(output, /\+1 条规则, 跳过 1 条重复/);
    assert.match(style, /cli-next-action/);
    assert.match(style, /cli-output-format/);
    assert.equal(countRule(style, 'cli-next-action'), 1);
    assert.equal(countRule(style, 'cli-output-format'), 1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn --dry-run reports skipped historical duplicates', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'spec', 'architecture.md'), [
      '# Architecture',
      '',
      '## Existing',
      '',
      'Keep this boundary.',
      '',
      '<!-- docpath:auto-learn:architecture -->',
      '## 自动学习架构经验',
      '',
      '- **workflow-boundary**: 🏗️ 架构边界：工作流状态只能通过 transitionWorkflow 迁移。 _(来源: task: T-LEARN, source: journal)_',
      '<!-- docpath:lesson-meta architecture:architecture:workflow-boundary:journal:t-learn -->',
      '',
    ].join('\n'));
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## duplicate architecture rule',
      '',
      '- task_id: T-LEARN',
      '- type: architecture',
      '- target: architecture',
      '- source: journal',
      '- key: workflow-boundary',
      '',
      '### Lesson',
      '',
      '🏗️ 架构边界：工作流状态只能通过 transitionWorkflow 迁移。',
      '',
    ].join('\n'));

    const output = execSync(`node ${BIN} learn --cwd ${cwd} --dry-run`, { cwd, encoding: 'utf-8', timeout: 20000 });

    assert.match(output, /architecture 规则: 提取 1 \/ 新增 0 \/ 跳过 1/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn groom --dry-run reports low-value workflow lessons without writing', () => {
    const cwd = mkWorkspace();
    const lessonsPath = join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
    writeFileSync(lessonsPath, [
      '# Lesson Candidates',
      '',
      '## T-LOW — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LOW',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: T-LOW-workflow',
      '',
      '### Lesson',
      '',
      '✅ 推荐保留本次任务的执行经验：完成 3/3 步，阻塞 0 步。',
      '',
      '---',
      '',
      '## T-KEEP — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-KEEP',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: cli-contract',
      '',
      '### Lesson',
      '',
      '✅ CLI 机器输出字段必须保持稳定，避免 agent 路由解析漂移。',
      '',
    ].join('\n'));
    const before = readFileSync(lessonsPath, 'utf-8');

    const output = execSync(`node ${BIN} learn groom --cwd ${cwd} --dry-run`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const after = readFileSync(lessonsPath, 'utf-8');

    assert.match(output, /lesson 候选: 2 条，建议清理: 1 条/);
    assert.match(output, /低信息密度的任务完成统计/);
    assert.equal(after, before);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn prune removes low-value workflow lessons and keeps concrete lessons', () => {
    const cwd = mkWorkspace();
    const lessonsPath = join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
    writeFileSync(lessonsPath, [
      '# Lesson Candidates',
      '',
      '## T-LOW — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LOW',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: T-LOW-workflow',
      '',
      '### Lesson',
      '',
      '✅ 推荐保留本次任务的执行经验：完成 3/3 步，阻塞 0 步。',
      '',
      '---',
      '',
      '## T-KEEP — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-KEEP',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: cli-contract',
      '',
      '### Lesson',
      '',
      '✅ CLI 机器输出字段必须保持稳定，避免 agent 路由解析漂移。',
      '',
    ].join('\n'));

    const output = execSync(`node ${BIN} learn prune --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const after = readFileSync(lessonsPath, 'utf-8');

    assert.match(output, /已清理/);
    assert.doesNotMatch(after, /T-LOW-workflow/);
    assert.match(after, /cli-contract/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn does not solidify low-value workflow statistics into rules by default', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    const lessonsPath = join(dp, 'workspace', 'lesson-candidates.md');
    writeFileSync(lessonsPath, [
      '# Lesson Candidates',
      '',
      '## T-LOW — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LOW',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: T-LOW-workflow',
      '',
      '### Lesson',
      '',
      '✅ 推荐保留本次任务的执行经验：完成 3/3 步，阻塞 0 步。',
      '',
      '---',
      '',
      '## T-KEEP — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-KEEP',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: cli-contract',
      '',
      '### Lesson',
      '',
      '✅ CLI 机器输出字段必须保持稳定，避免 agent 路由解析漂移。',
      '',
    ].join('\n'));

    execSync(`node ${BIN} learn --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const style = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const lessons = readFileSync(lessonsPath, 'utf-8');

    assert.doesNotMatch(style, /T-LOW-workflow/);
    assert.doesNotMatch(style, /完成 3\/3 步，阻塞 0 步/);
    assert.match(style, /cli-contract/);
    assert.equal(lessons, '# Lesson Candidates\n\n');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn does not fall back to journal extraction when all lesson candidates are low signal', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LOW — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LOW',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: T-LOW-workflow',
      '',
      '### Lesson',
      '',
      '✅ 推荐保留本次任务的执行经验：完成 3/3 步，阻塞 0 步。',
      '',
    ].join('\n'));

    const styleBefore = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');
    const output = execSync(`node ${BIN} learn --cwd ${cwd} --dry-run`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const styleAfter = readFileSync(join(dp, 'spec', 'style.md'), 'utf-8');

    assert.match(output, /候选分类: 保留 0 \/ 归档 1 \/ 跳过 0/);
    assert.match(output, /未发现可沉淀到长期 rules 的规则模式/);
    assert.doesNotMatch(output, /发现 1 条规则/);
    assert.equal(styleAfter, styleBefore);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal writes lesson candidates after successful archive', () => {
    const cwd = mkWorkspace();
    execSync(`node ${BIN} journal --cwd ${cwd} --optional-archive skip`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const lessonsPath = join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
    assert.equal(existsSync(lessonsPath), true);
    const lessons = readFileSync(lessonsPath, 'utf-8');
    assert.match(lessons, /- task_id: T-LEARN/);
    assert.match(lessons, /- source: journal/);
    assert.match(lessons, /### Evidence/);
    assert.match(lessons, /.docpath\/workspace\/breadcrumb.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal skips lesson candidate (fail-loud) when task_id is unbound', () => {
    const cwd = mkWorkspace();
    // 把 task_id 置空，模拟状态漂移/未绑定任务的归档。
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.task_id = '';
    state.task_title = '';
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    // 警告走 stderr，合并到 stdout 一并断言。
    const output = execSync(`node ${BIN} journal --cwd ${cwd} --optional-archive skip 2>&1`, { cwd, encoding: 'utf-8', timeout: 20000 });

    // 归档本身不报错，但 lesson 候选被显式跳过，且发出警告。
    assert.match(output, /跳过 lesson 候选写入/);
    const lessonsPath = join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
    if (existsSync(lessonsPath)) {
      const lessons = readFileSync(lessonsPath, 'utf-8');
      assert.doesNotMatch(lessons, /## unknown/);
      assert.doesNotMatch(lessons, /- key: unknown-workflow/);
    }
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn does not solidify an orphan (task_id: unknown) candidate into style.md', () => {
    const cwd = mkWorkspace();
    const lessonsPath = join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
    writeFileSync(lessonsPath, [
      '# Lesson Candidates',
      '',
      '## unknown — 2026-06-10T00:00:00.000Z',
      '',
      '- task_id: unknown',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: unknown-workflow',
      '',
      '### Lesson',
      '',
      '✅ 这条经验本身描述具体到足以越过低信息密度过滤，但 task_id 是孤儿，不该固化。',
      '',
      '---',
      '',
      '## T-KEEP — 2026-06-10T00:00:00.000Z',
      '',
      '- task_id: T-KEEP',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: cli-contract',
      '',
      '### Lesson',
      '',
      '✅ CLI 机器输出字段必须保持稳定，避免 agent 路由解析漂移。',
      '',
    ].join('\n'));

    execSync(`node ${BIN} learn --cwd ${cwd}`, { cwd, encoding: 'utf-8', timeout: 20000 });
    const style = readFileSync(join(cwd, '.docpath', 'spec', 'style.md'), 'utf-8');

    // 孤儿候选不应进入 style.md；正常候选应进入。
    assert.doesNotMatch(style, /unknown-workflow/);
    assert.match(style, /cli-contract/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('learn groom flags an orphan (task_id: unknown) candidate for cleanup', () => {
    const cwd = mkWorkspace();
    const lessonsPath = join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
    writeFileSync(lessonsPath, [
      '# Lesson Candidates',
      '',
      '## unknown — 2026-06-10T00:00:00.000Z',
      '',
      '- task_id: unknown',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: unknown-workflow',
      '',
      '### Lesson',
      '',
      '✅ 描述足够具体以越过其它过滤器，仅 task_id 孤儿这一项触发清理。',
      '',
    ].join('\n'));

    const output = execSync(`node ${BIN} learn groom --cwd ${cwd} --dry-run`, { cwd, encoding: 'utf-8', timeout: 20000 });
    assert.match(output, /孤儿候选/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
