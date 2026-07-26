import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mkJsonOnlyWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-render-'));
  const dp = join(cwd, '.docpath');
  const workspace = join(dp, 'workspace');
  const currentTask = join(dp, 'tasks', 'current');
  const canonicalTask = join(dp, 'tasks', 'T-RENDER');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(currentTask, { recursive: true });
  mkdirSync(canonicalTask, { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: render-test\n');

  writeJson(join(workspace, 'state.json'), {
    level: 2,
    task_id: 'T-RENDER',
    task_title: 'Render Views',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  });
  writeFileSync(join(workspace, 'breadcrumb.jsonl'), `${JSON.stringify({
    schema_version: 1,
    kind: 'breadcrumb',
    taskId: 'T-RENDER',
    step: 'S1',
    status: 'done',
    context: 'JSONL breadcrumb',
    timestamp: '2026-06-01T00:00:00.000Z',
  })}\n`);
  writeJson(join(workspace, 'last-check.json'), {
    schema_version: 1,
    kind: 'last-check',
    timestamp: '2026-06-01T00:10:00.000Z',
    passed: true,
    check_count: 1,
    checks: [{ name: 'JSON check', passed: true, output: '' }],
  });
  writeJson(join(workspace, 'review.json'), {
    schema_version: 1,
    kind: 'review',
    timestamp: '2026-06-01T00:20:00.000Z',
    files: ['src/render.ts'],
    findings: [],
    errors: 0,
    warnings: 0,
    infos: 0,
    approved: true,
  });

  const specJson = {
    schema_version: 1,
    kind: 'spec',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    task_id: 'T-RENDER',
    backlog_id: 'R-RENDER',
    title: 'T-RENDER - Render Views',
    markdown: '',
    generated_at: '2026-06-01T00:00:00.000Z',
    scope: {
      included: ['render command'],
      excluded: ['manual Markdown maintenance'],
    },
    major_change_gate: {
      required: false,
      types: [],
      user_confirmed: 'confirmed in test',
      decision_brief_markdown: '- 用户确认: confirmed in test',
    },
    ui_gate: {
      state: 'exempt',
    },
    functional_requirements: [{ id: 'FR-1', text: 'render spec from JSON', done: false }],
    non_functional_requirements: [{ id: 'NFR-1', text: 'preserve JSON truth', done: false }],
    acceptance_criteria: [{ id: 'AC-1', text: 'Markdown views regenerate', done: false }],
  };
  const planJson = {
    schema_version: 1,
    kind: 'plan',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    title: 'Render plan',
    markdown: '',
    generated_at: '2026-06-01T00:00:00.000Z',
    steps: [{
      id: 'S1',
      name: 'Render JSON views',
      description: 'Regenerate Markdown from JSON',
      acceptance: 'render --all writes views',
      dependencies: 'none',
      status: 'done',
    }],
  };
  for (const dir of [currentTask, canonicalTask]) {
    writeJson(join(dir, 'spec.json'), specJson);
    writeJson(join(dir, 'plan.json'), planJson);
  }

  return { cwd, workspace, currentTask, canonicalTask };
}

describe('render command', () => {
  it('regenerates all Markdown views from JSON and JSONL truth files', () => {
    const { cwd, workspace, currentTask, canonicalTask } = mkJsonOnlyWorkspace();

    const out = run(`render --cwd ${cwd} --all`, cwd);

    assert.match(out, /current/);
    assert.match(out, /spec/);
    assert.match(out, /plan/);
    assert.match(out, /breadcrumb/);
    assert.match(out, /check/);
    assert.match(out, /review/);
    for (const file of [
      join(workspace, 'current.md'),
      join(workspace, 'breadcrumb.md'),
      join(workspace, 'last-check.md'),
      join(workspace, 'review.md'),
      join(currentTask, 'spec.md'),
      join(currentTask, 'plan.md'),
      join(canonicalTask, 'spec.md'),
      join(canonicalTask, 'plan.md'),
    ]) {
      assert.equal(existsSync(file), true, `${file} should be rendered`);
    }
    assert.match(readFileSync(join(workspace, 'current.md'), 'utf-8'), /JSONL breadcrumb/);
    assert.match(readFileSync(join(workspace, 'last-check.md'), 'utf-8'), /JSON check/);
    assert.match(readFileSync(join(workspace, 'review.md'), 'utf-8'), /代码审查: 0 错误, 0 警告, 0 提示/);
    assert.match(readFileSync(join(currentTask, 'spec.md'), 'utf-8'), /FR-1: render spec from JSON/);
    assert.match(readFileSync(join(canonicalTask, 'plan.md'), 'utf-8'), /S1: Render JSON views/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('prints a single rendered view', () => {
    const { cwd } = mkJsonOnlyWorkspace();

    const out = run(`render --cwd ${cwd} --view check`, cwd);

    assert.match(out, /# Last Check Evidence/);
    assert.match(out, /\*\*结果\*\*: ✅ PASS/);
    assert.match(out, /JSON check/);
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('protocol shared contract blocks (R-300 方案 B)', () => {
  let renderProtocolBlocks;
  let syncProtocolBlocks;

  const load = async () => {
    if (!renderProtocolBlocks) {
      ({ renderProtocolBlocks, syncProtocolBlocks } = await import('../dist/utils/protocol-blocks.js'));
    }
  };

  it('renders injection regions idempotently and reports drift precisely', async () => {
    await load();
    const blocks = { demo: '共享契约正文\n多行内容' };
    const doc = [
      '# Flavor',
      '',
      '<!-- docpath:block demo -->',
      '旧的分叉内容',
      '<!-- /docpath:block -->',
      '',
      'flavor 专属叙述保留。',
    ].join('\n');

    const first = renderProtocolBlocks(doc, blocks);
    assert.deepEqual(first.updated, ['demo'], '分叉注入区必须被重渲染');
    assert.match(first.content, /共享契约正文\n多行内容/);
    assert.match(first.content, /flavor 专属叙述保留。/, '标记外内容逐字保留');

    const second = renderProtocolBlocks(first.content, blocks);
    assert.deepEqual(second.updated, [], '重复渲染必须零变化（幂等）');
  });

  it('fails loud on missing close marker and reports unknown block names', async () => {
    await load();
    assert.throws(
      () => renderProtocolBlocks('<!-- docpath:block broken -->\n内容无闭标记', { broken: 'x' }),
      /缺少闭标记/,
    );

    const result = renderProtocolBlocks(
      '<!-- docpath:block ghost -->\n原样保留\n<!-- /docpath:block -->',
      {},
    );
    assert.deepEqual(result.unknown, ['ghost']);
    assert.match(result.content, /原样保留/, '未知块不得改写内容');
  });

  it('repo canonical flavors carry the agreed block coverage and stay in sync', async () => {
    await load();
    const repoRoot = new URL('..', import.meta.url).pathname;
    const report = await syncProtocolBlocks(join(repoRoot, 'templates'), { write: false });
    assert.equal(report.available, true);

    const byFile = Object.fromEntries(report.files.map((f) => [f.file, f]));
    // 覆盖面契约（blocks/README）：lifecycle 3/4 + worktree 3/4，每 flavor ≥1 块
    assert.deepEqual(byFile['CLAUDE.md'].present.sort(), ['lifecycle-commands', 'worktree-isolation']);
    assert.deepEqual(byFile['CODEX.md'].present.sort(), ['lifecycle-commands', 'worktree-isolation']);
    assert.deepEqual(byFile['AGENTS.md'].present, ['lifecycle-commands']);
    assert.deepEqual(byFile['OPENCODE.md'].present, ['worktree-isolation']);
    // 仓库内注入区必须与块源同步（check 门禁同款校验）
    for (const f of report.files) {
      assert.deepEqual(f.updated, [], `${f.file} 注入区与块源不得漂移`);
      assert.deepEqual(f.unknown, [], `${f.file} 不得引用不存在的块源`);
    }
  });
});
