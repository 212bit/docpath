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

function count(content, needle) {
  return content.split(needle).length - 1;
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
    assert.equal(count(style, 'cli-next-action'), 1);

    assert.match(architecture, /Keep this boundary/);
    assert.match(architecture, /docpath:auto-learn:architecture/);
    assert.match(architecture, /workflow-boundary/);
    assert.match(architecture, /来源: task: T-LEARN, source: journal/);
    assert.equal(count(architecture, 'workflow-boundary'), 1);
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
});
