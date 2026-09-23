// R-363 回归：收尾路线推荐按实际 changed files 做 scope 判定
//
// 覆盖目标：
//   1. 改动命中 quick-guard RISKY_PATH_PATTERNS（如 src/engine/**）时，
//      step-pass / go 的收口路线**不得**推荐 quick-done（它在 done 阶段必拒）；
//   2. 改动落在 quick 允许范围内（叶子文件）时，quick-done 仍作为推荐项；
//   3. 所有 plan 步骤完成后，next 视图不再返回执行期的 agent enter 提示。
//
// 夹具：真实 git 仓（scope 判定依赖 git status，mock 无意义）。

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function run(args, cwd, { allowFail = false } = {}) {
  try {
    return execFileSync('node', [BIN, ...args.split(/\s+/)], {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowFail) return `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw error;
  }
}

/** 建一个真实 git 仓 + 一个 steps 已全部完成的 active 任务。 */
function mkRepo({ taskId = 'T-R363', plan }) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-r363-'));
  const dp = join(cwd, '.docpath');
  const taskDir = join(dp, 'tasks', taskId);
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: r363-test\n');

  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: taskId,
    task_title: 'R363 closeout route',
    phase: 'executing',
    gate: 'none',
    current_step: '',
    workflow_profile: 'standard',
    started_at: '2026-09-23T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');

  writeFileSync(join(taskDir, 'plan.md'), plan);
  writeFileSync(join(taskDir, 'spec.md'), `# ${taskId}\n\n## 3. 范围界定\n\n### 包含\n- test\n\n### 不包含\n- none\n`);

  mkdirSync(join(cwd, 'src', 'engine'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'engine', 'placeholder.ts'), 'export const x = 1;\n');
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

const ALL_DONE_PLAN = [
  '# Plan',
  '',
  '- [x] S1: 实现',
  '',
].join('\n');

describe('R-363: 收尾路线按 scope 判定', () => {
  it('核心路径改动时收口路线不含 quick-done', () => {
    const cwd = mkRepo({ plan: ALL_DONE_PLAN });
    // 改核心路径（命中 RISKY_PATH_PATTERNS: ^src/engine/）
    writeFileSync(join(cwd, 'src', 'engine', 'placeholder.ts'), 'export const x = 2;\n');

    // 用 step-pass --step S1 显式收尾，触发收口路线渲染
    const out = run('step-pass --step S1', cwd, { allowFail: true });

    assert.match(out, /推荐收尾路线/, `应输出收口路线，实际:\n${out}`);
    assert.doesNotMatch(
      out,
      /quick-done.*推荐/,
      `核心路径改动不应把 quick-done 标为推荐，实际:\n${out}`,
    );
    assert.match(out, /docpath done/, `应主推 docpath done 收口，实际:\n${out}`);
  });

  it('叶子改动时 quick-done 仍作为推荐项', () => {
    const cwd = mkRepo({ plan: ALL_DONE_PLAN });
    // 改一个非守卫路径的叶子文件
    mkdirSync(join(cwd, 'src', 'features'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'features', 'leaf.ts'), 'export const y = 1;\n');
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-qm', 'add leaf']);
    writeFileSync(join(cwd, 'src', 'features', 'leaf.ts'), 'export const y = 2;\n');

    const out = run('step-pass --step S1', cwd, { allowFail: true });

    assert.match(out, /推荐收尾路线/, `应输出收口路线，实际:\n${out}`);
    assert.match(out, /quick-done/, `叶子改动应保留 quick-done 推荐，实际:\n${out}`);
  });

  it('所有 plan 步骤完成后 next 视图不再给执行期 agent enter 提示', () => {
    const cwd = mkRepo({ plan: ALL_DONE_PLAN });

    const out = run('next --agent', cwd, { allowFail: true });

    assert.doesNotMatch(
      out,
      /recommended_command:\s*"?docpath agent enter/,
      `plan 全完成时不应推荐 agent enter，实际:\n${out}`,
    );
    assert.doesNotMatch(
      out,
      /开始或恢复任务执行/,
      `plan 全完成时不应给执行期提示，实际:\n${out}`,
    );
  });
});

// R-365（第一批）：收口口径对齐——残余三连推荐文案清理
//
// 原则：docpath done 内部即 check -> review -> journal，因此对外推荐应是一步到位的
// 复合命令，check / review 降级为「中途自测 / 单独排查」的原子工具。
describe('R-365: 收口口径对齐（残余三连文案）', () => {
  it('核心路径改动的收口路线推荐 docpath done 并给出排查备选', () => {
    const cwd = mkRepo({ plan: ALL_DONE_PLAN });
    writeFileSync(join(cwd, 'src', 'engine', 'placeholder.ts'), 'export const x = 2;\n');

    const out = run('step-pass --step S1', cwd, { allowFail: true });

    assert.match(out, /推荐收尾路线/, `应输出收口路线，实际:\n${out}`);
    assert.match(
      out,
      /`docpath done`/,
      `应主推 docpath done（一步到位收口），实际:\n${out}`,
    );
    assert.doesNotMatch(
      out,
      /`docpath check` -> `docpath review`/,
      `不应再输出三连序列，实际:\n${out}`,
    );
  });

  it('check 通过后的引导指向 docpath done', () => {
    const cwd = mkRepo({ plan: ALL_DONE_PLAN });

    const out = run('check', cwd, { allowFail: true });

    if (/下一步:/.test(out)) {
      assert.match(out, /docpath done/, `check 通过后应引导 docpath done，实际:\n${out}`);
      assert.doesNotMatch(
        out,
        /下一步: `docpath review`/,
        `不应再把单独 review 作为下一步，实际:\n${out}`,
      );
    }
  });

  it('源码中不再残留三连推荐文案', () => {
    const repoRoot = new URL('..', import.meta.url).pathname;
    const targets = [
      'src/commands/worktree/query.ts',
      'src/commands/check.ts',
      'src/commands/check/evidence.ts',
      'src/commands/task.ts',
      'src/utils/closeout-route.ts',
    ];
    for (const rel of targets) {
      const content = readFileSync(join(repoRoot, rel), 'utf-8');
      assert.doesNotMatch(
        content,
        /check\s*(→|->)\s*review\s*(→|->)\s*(agent\s+)?done/,
        `${rel} 不应残留三连推荐文案`,
      );
    }
  });
});
