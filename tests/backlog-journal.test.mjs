import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ breadcrumbContext = '✅ 采用统一状态机边界，禁止命令直接写状态。' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-journal-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260531-alpha-promote'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-journal-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-20260531-alpha-promote',
    task_title: 'Alpha Promote',
    phase: 'reviewing',
    gate: 'review_pass',
    current_step: 'journal',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-20260531-alpha-promote] — 2026-05-31T00:00:00.000Z',
    '',
    '---',
    'taskId: T-20260531-alpha-promote',
    'step: S1',
    'status: done',
    'timestamp: 2026-05-31T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    `- **上下文**: ${breadcrumbContext}`,
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# T-20260531-alpha-promote - Alpha Promote\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: done\n');
  writeFileSync(join(dp, 'tasks', 'T-20260531-alpha-promote', 'spec.md'), '# T-20260531-alpha-promote - Alpha Promote\n');
  writeFileSync(join(dp, 'tasks', 'T-20260531-alpha-promote', 'plan.md'), '# Plan\n\n- [x] S1: done\n');
  writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: T-20260531-alpha-promote
  spec: tasks/T-20260531-alpha-promote/spec.md
created_at: 2026-05-31
---

Alpha
`);
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 }).trim();
}

function runWithInput(args, cwd, input) {
  return execSync(`node ${BIN} ${args}`, { cwd, input, encoding: 'utf-8', timeout: 20000 }).trim();
}

function decisionBlock(id, createdAt) {
  return [
    `## ${id} — architecture`,
    '',
    '- task_id: T-OLD',
    `- created_at: ${createdAt}`,
    '- category: architecture',
    '',
    '### 背景',
    '',
    '旧决策背景。',
    '',
    '### 决策',
    '',
    '旧决策。',
    '',
    '### 影响',
    '',
    '旧影响。',
    '',
    '### 替代方案',
    '',
    '- 旧方案',
    '',
    '### 相关文件',
    '',
    '- .docpath/workspace/decisions.md',
    '',
    '---',
    '',
  ].join('\n');
}

describe('backlog journal integration', () => {
  it('journal auto-completes linked backlog item', () => {
    const cwd = mkWorkspace();
    const out = run('journal --optional-archive skip', cwd);
    assert.match(out, /物理任务目录归档已延后/);
    assert.match(out, /AI-native journal prompt contract/);
    assert.match(out, /design-decision, project-convention, pattern, anti-pattern, common-mistake, specification, gotcha/);
    assert.match(out, /docpath write-journal --structured --stdin/);
    assert.match(out, /canonical evidence 保留在 \.docpath\/tasks\/T-20260531-alpha-promote\//);
    assert.match(out, /backlog 已自动回填完成: R-001/);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command:/);
    // After journal marks item as done, refreshBacklogIndex auto-archives it
    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: done/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal backfills placeholder backlog body and evidence from linked spec', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    const spec = [
      '# T-20260531-alpha-promote - Alpha Promote',
      '',
      '## 1. 背景与动机',
      '',
      '成熟后的背景说明。',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: Alpha',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 完成验收',
      '',
    ].join('\n');
    writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), spec);
    writeFileSync(join(dp, 'tasks', 'T-20260531-alpha-promote', 'spec.md'), spec);
    writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: T-20260531-alpha-promote
  spec: tasks/T-20260531-alpha-promote/spec.md
created_at: 2026-05-31
---

## 背景

- 待补充

## 验收

- 待补充
`);

    run('journal --optional-archive skip', cwd);

    // After journal marks item as done, refreshBacklogIndex auto-archives it
    const item = readFileSync(join(dp, 'backlog', 'archived', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: done/);
    assert.match(item, /readiness: analyzed/);
    assert.match(item, /spec: tasks\/T-20260531-alpha-promote\/spec\.md/);
    assert.match(item, /成熟后的背景说明/);
    assert.doesNotMatch(item, /- 待补充/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal also completes legacy dogfood backlog items linked to current', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: current
  spec: tasks/current/spec.md
created_at: 2026-05-31
---

Alpha
`);

    const out = run('journal --optional-archive skip', cwd);

    assert.match(out, /所有步骤已归档/);
    // After journal marks item as done, refreshBacklogIndex auto-archives it
    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: done/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal extracts architecture decisions into decisions.md', () => {
    const cwd = mkWorkspace();
    const out = run('journal --optional-archive skip', cwd);

    assert.match(out, /决策日志已更新/);
    assert.match(out, /提取 1 条架构决策/);
    const decisions = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions.md'), 'utf-8');
    assert.doesNotMatch(decisions, /journal\.archive/);
    assert.match(decisions, /## ADR-\d{8}-001 — architecture/);
    assert.match(decisions, /采用统一状态机边界，禁止命令直接写状态/);
    assert.match(decisions, /从 journal 关键决策自动提取/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal skips decisions.md for ordinary archive context', () => {
    const cwd = mkWorkspace({ breadcrumbContext: '质量检查通过 (14 项)' });
    const out = run('journal --optional-archive skip', cwd);

    assert.match(out, /未发现可复用 ADR，跳过 decisions\.md 写入/);
    assert.doesNotMatch(out, /决策日志已更新/);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'decisions.md')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal does not extract seed spec key-decision rows as ADRs', () => {
    const cwd = mkWorkspace({ breadcrumbContext: '质量检查通过 (14 项)' });
    const seedSpec = [
      '# T-20260531-alpha-promote - Alpha Promote',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |',
      '| 2 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: test',
      '',
    ].join('\n');
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), seedSpec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'T-20260531-alpha-promote', 'spec.md'), seedSpec);

    const out = run('journal --optional-archive skip', cwd);

    assert.match(out, /未发现可复用 ADR，跳过 decisions\.md 写入/);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'decisions.md')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal runs decisions gc after writing archive decisions', () => {
    const cwd = mkWorkspace();
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');
    writeFileSync(decisionsPath, [
      '# 决策日志 — DocPath ADR',
      '',
      '> test decisions',
      '',
      '---',
      '',
      decisionBlock('ADR-20260401-001', '2026-04-01T00:00:00.000Z'),
    ].join('\n'));

    const out = run('journal --optional-archive skip', cwd);

    assert.match(out, /decisions\.md 已老化/);
    const current = readFileSync(decisionsPath, 'utf-8');
    const archive = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions-2026-04.md'), 'utf-8');
    assert.doesNotMatch(current, /ADR-20260401-001/);
    assert.doesNotMatch(current, /journal\.archive/);
    assert.match(current, /architecture/);
    assert.match(archive, /ADR-20260401-001/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('standalone journal does not physically archive by default (gc owns it)', () => {
    const cwd = mkWorkspace();
    const taskDir = join(cwd, '.docpath', 'tasks', 'T-20260531-alpha-promote');
    const out = run('journal', cwd); // no --optional-archive

    assert.match(out, /物理任务目录归档已延后/);
    assert.match(out, /docpath gc --force/);
    // task dir stays in place; nothing moved to tasks/done
    assert.equal(existsSync(taskDir), true, 'canonical task dir must remain');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-alpha-promote')), false, 'must not archive by default');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal --dry-run reports the default skip archive policy without physical archive wording', () => {
    const cwd = mkWorkspace();
    const taskDir = join(cwd, '.docpath', 'tasks', 'T-20260531-alpha-promote');
    const out = run('journal --dry-run', cwd);

    assert.match(out, /archive policy: skip/);
    assert.match(out, /默认，不实际归档/);
    assert.match(out, /canonical evidence 将保留/);
    assert.doesNotMatch(out, /将归档:/);
    assert.equal(existsSync(taskDir), true, 'canonical task dir must remain');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-alpha-promote')), false, 'dry-run must not archive');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal --dry-run --optional-archive always previews the physical archive path', () => {
    const cwd = mkWorkspace();
    const taskDir = join(cwd, '.docpath', 'tasks', 'T-20260531-alpha-promote');
    const out = run('journal --dry-run --optional-archive always', cwd);

    assert.match(out, /archive policy: always/);
    assert.match(out, /将归档: .*T-20260531-alpha-promote.*tasks\/done\/T-20260531-alpha-promote/);
    assert.equal(existsSync(taskDir), true, 'canonical task dir must remain during dry-run');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-alpha-promote')), false, 'dry-run must not archive');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('--optional-archive=always still physically archives', () => {
    const cwd = mkWorkspace();
    const taskDir = join(cwd, '.docpath', 'tasks', 'T-20260531-alpha-promote');
    run('journal --optional-archive always', cwd);
    assert.equal(existsSync(taskDir), false, 'canonical task dir must be moved');
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'done', 'T-20260531-alpha-promote')), true, 'archived dir must exist');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-journal fails loud on an already-archived task (no zombie dir)', () => {
    const cwd = mkWorkspace();
    const taskId = 'T-20260531-alpha-promote';
    // Physically archive first
    run('journal --optional-archive always', cwd);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', taskId)), false);

    // write-journal must refuse; state.json still references the task
    let threw = false;
    try {
      execSync(`node ${BIN} write-journal --content "knowledge"`, { cwd, encoding: 'utf-8', timeout: 20000 });
    } catch (e) {
      threw = true;
      assert.match(e.stdout + e.stderr, /已物理归档|write-journal 必须在归档前/);
    }
    assert.equal(threw, true, 'write-journal must fail on archived task');
    // no zombie canonical dir or current alias re-created
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', taskId, 'spec.md')), false, 'must not re-create zombie canonical spec');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-journal --structured routes semantic entries to decisions and rules while filtering low signal', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    const payload = {
      entries: [
        {
          type: 'design-decision',
          target: 'decisions',
          summary: 'Use AI-native journal prompt contract as semantic classification boundary',
          rationale: 'Journal should expose a prompt contract and let the current agent classify reusable lessons instead of relying on keyword regex alone.',
          content: 'This keeps DocPath deterministic while allowing semantic classification before structured writeback.',
          evidence: ['src/commands/journal.ts', 'src/commands/write-journal.ts'],
        },
        {
          type: 'anti-pattern',
          target: 'rules/style',
          summary: 'Do not persist task completion statistics as long-term lessons',
          rationale: 'Counts such as completed steps and ordinary check/review pass messages do not reduce future error probability.',
          content: 'When reviewing journal candidates, skip completion counts and generic gate pass messages unless they include a reusable trigger, behavior, and boundary.',
          evidence: ['.docpath/workspace/lesson-candidates.md'],
        },
        {
          type: 'pattern',
          target: 'rules/architecture',
          summary: 'Route semantic journal writeback through artifact sinks',
          rationale: 'Prompt emitters should not write durable state directly; structured sinks own validation and filesystem writes.',
          content: 'When adding AI-assisted workflow behavior, expose a prompt contract first and persist selected results through a deterministic write command.',
          evidence: ['src/commands/register/quality.ts'],
        },
        {
          type: 'pattern',
          target: 'rules/style',
          summary: 'done',
          content: '完成 3/3 步',
        },
      ],
    };

    const out = runWithInput('write-journal --structured --stdin', cwd, JSON.stringify(payload));

    assert.match(out, /structured journal 已写入 3 条/);
    assert.match(out, /已跳过 1 条低信号/);
    const decisions = readFileSync(join(dp, 'workspace', 'decisions.md'), 'utf-8');
    assert.match(decisions, /AI-native journal prompt contract/);
    const style = readFileSync(join(dp, 'rules', 'style.md'), 'utf-8');
    assert.match(style, /Do not persist task completion statistics/);
    assert.doesNotMatch(style, /完成 3\/3 步/);
    const architecture = readFileSync(join(dp, 'rules', 'architecture.md'), 'utf-8');
    assert.match(architecture, /Route semantic journal writeback through artifact sinks/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal extracts ADR from spec decision_brief + key-decisions table', () => {
    const cwd = mkWorkspace({ breadcrumbContext: '完成 S1' });
    const dp = join(cwd, '.docpath');
    const taskId = 'T-20260531-alpha-promote';
    // spec with a key-decisions table + decision_brief section; no keyword breadcrumb
    const specMd = [
      `# ${taskId} - Alpha Promote`,
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 采用事件溯源 | 状态机 / 事件溯源 | 事件溯源 | 审计可追溯 |',
      '',
      '## 4.1 重大变更门禁',
      '',
      '### Decision Brief',
      '',
      '- 推荐方案: 事件溯源统一状态边界',
      '',
    ].join('\n');
    writeFileSync(join(dp, 'tasks', taskId, 'spec.md'), specMd);
    writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), specMd);

    const out = run('journal --optional-archive skip', cwd);
    assert.match(out, /决策日志已更新/);
    const decisions = readFileSync(join(dp, 'workspace', 'decisions.md'), 'utf-8');
    assert.match(decisions, /事件溯源统一状态边界/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('lesson candidate includes decision brief + blocked steps when present', () => {
    const cwd = mkWorkspace({ breadcrumbContext: '完成 S1' });
    const dp = join(cwd, '.docpath');
    const taskId = 'T-20260531-alpha-promote';
    // breadcrumb with a blocked entry
    const breadcrumb = [
      '# Breadcrumb',
      '',
      '### ⚠️ S2 [T-20260531-alpha-promote] — 2026-05-31T00:00:00.000Z',
      '',
      '---',
      'taskId: T-20260531-alpha-promote',
      'step: S2',
      'status: blocked',
      'timestamp: 2026-05-31T00:00:00.000Z',
      '---',
      '',
      '- **状态**: blocked',
      '- **上下文**: 遇到 X 阻塞',
      '',
    ].join('\n');
    writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), breadcrumb);
    const specMd = [
      `# ${taskId} - Alpha Promote`,
      '',
      '## 4.1 重大变更门禁',
      '',
      '### Decision Brief',
      '',
      '- 推荐方案: 事件溯源统一状态边界',
      '',
    ].join('\n');
    writeFileSync(join(dp, 'tasks', taskId, 'spec.md'), specMd);
    writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), specMd);

    run('journal --optional-archive skip', cwd);
    const lessons = readFileSync(join(dp, 'workspace', 'lesson-candidates.md'), 'utf-8');
    assert.match(lessons, /推荐方案/);
    assert.match(lessons, /事件溯源统一状态边界/);
    assert.match(lessons, /阻塞步骤/);
    assert.match(lessons, /遇到 X 阻塞/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal removes wip-note.md when the task completes (R-274 AC-1)', () => {
    const cwd = mkWorkspace();
    const notePath = join(cwd, '.docpath', 'workspace', 'wip-note.md');
    writeFileSync(notePath, '# WIP Note\n\n> task_id: T-20260531-alpha-promote\n> step: S2\n\n- Status: unverified.\n');

    const out = run('journal --optional-archive skip', cwd);
    assert.match(out, /backlog 已自动回填完成/);
    assert.equal(existsSync(notePath), false, 'wip-note.md must be deleted after journal completes the task');

    // 幂等: 无 note 再跑 journal 不炸 (completed 后二次 journal 会被 FSM 拦, 只验证文件层不残留)
    assert.equal(existsSync(notePath), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal trims the global breadcrumb window (R-302: 接线既有 truncate 机制)', () => {
    const cwd = mkWorkspace();
    const jsonlPath = join(cwd, '.docpath', 'workspace', 'breadcrumb.jsonl');
    const seeded = Array.from({ length: 260 }, (_, i) => JSON.stringify({
      schema_version: 1,
      kind: 'breadcrumb',
      taskId: 'T-JOURNAL',
      step: `S${i}`,
      status: 'done',
      timestamp: '2026-07-01T00:00:00.000Z',
      context: `entry ${i}`,
    })).join('\n');
    writeFileSync(jsonlPath, `${seeded}\n`);

    const out = run('journal --optional-archive skip', cwd);

    assert.match(out, /全局 breadcrumb 已裁剪/);
    const remaining = readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean).length;
    assert.ok(remaining <= 200, `全局窗口必须 ≤200（实际 ${remaining}）`);
    rmSync(cwd, { recursive: true, force: true });
  });
});
