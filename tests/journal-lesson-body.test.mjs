import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isEmptyOrPlaceholderLessonBody } from '../dist/utils/lesson-candidates.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const TASK_ID = 'T-20260531-alpha-promote';

function mkWorkspace({ breadcrumbContext = '完成 S1', breadcrumbStatus = 'done', specMd } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-journal-lesson-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', TASK_ID), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: journal-lesson-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: TASK_ID,
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
    `### ✅ S1 [${TASK_ID}] — 2026-05-31T00:00:00.000Z`,
    '',
    '---',
    `taskId: ${TASK_ID}`,
    'step: S1',
    `status: ${breadcrumbStatus}`,
    'timestamp: 2026-05-31T00:00:00.000Z',
    '---',
    '',
    '- **状态**: ' + breadcrumbStatus,
    `- **上下文**: ${breadcrumbContext}`,
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check\n\n**结果**: ✅ PASS\n');
  const spec = specMd ?? `# ${TASK_ID} - Alpha Promote\n`;
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), spec);
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: done\n');
  writeFileSync(join(dp, 'tasks', TASK_ID, 'spec.md'), spec);
  writeFileSync(join(dp, 'tasks', TASK_ID, 'plan.md'), '# Plan\n\n- [x] S1: done\n');
  writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: ${TASK_ID}
  spec: tasks/${TASK_ID}/spec.md
created_at: 2026-05-31
---

Alpha
`);
  return cwd;
}

function specWithBrief(recommended) {
  return [
    `# ${TASK_ID} - Alpha Promote`,
    '',
    '## 4.1 重大变更门禁',
    '',
    '### Decision Brief',
    '',
    `- 推荐方案: ${recommended}`,
    '',
  ].join('\n');
}

function runJournal(cwd) {
  return execSync(`node ${BIN} journal --optional-archive skip`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  });
}

function lessonsPath(cwd) {
  return join(cwd, '.docpath', 'workspace', 'lesson-candidates.md');
}

describe('isEmptyOrPlaceholderLessonBody', () => {
  it('treats an empty lesson body as skippable', () => {
    assert.equal(isEmptyOrPlaceholderLessonBody(''), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('\n\n'), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 推荐方案\n\n### 架构决策摘要\n'), true);
  });

  it('treats a whitespace-only lesson body as skippable', () => {
    assert.equal(isEmptyOrPlaceholderLessonBody('   \n\t\n  '), true);
    assert.equal(isEmptyOrPlaceholderLessonBody(`### 推荐方案\n\n${'\u00a0\u00a0'}\n`), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 推荐方案\n\n   \t  \n'), true);
    // A blank 推荐方案 is trimmed away, and the ADR fallback is only the task
    // title plus an empty field shell. That body is still whitespace-only.
    assert.equal(
      isEmptyOrPlaceholderLessonBody('### 架构决策摘要\n\n- Alpha Promote: - 推荐方案:\n'),
      true,
    );
  });

  it('treats placeholder-only lesson text as skippable', () => {
    for (const token of ['待补充', '暂无', '无', 'none', 'N/A', 'TBD', 'TODO']) {
      assert.equal(isEmptyOrPlaceholderLessonBody(`### 推荐方案\n\n${token}\n`), true, token);
    }
    assert.equal(isEmptyOrPlaceholderLessonBody('### 架构决策摘要\n\n- 待补充: 待补充\n'), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 架构决策摘要\n\n- 下载配置: 下载配置\n'), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 架构决策摘要\n\n- 方案B: 方案 B\n'), true);
  });

  it('treats a bare option label as skippable', () => {
    for (const label of ['方案 A', '方案A', '方案 B', '方案  B', 'Option A', 'option a', 'OptionA']) {
      assert.equal(isEmptyOrPlaceholderLessonBody(`### 推荐方案\n\n${label}\n`), true, label);
      assert.equal(isEmptyOrPlaceholderLessonBody(`  ${label}  `), true, label);
    }
    assert.equal(isEmptyOrPlaceholderLessonBody(`方案${'\u3000'}A`), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 推荐方案\n\n方案 A\n\n### 架构决策摘要\n\n- 方案 A: 方案 A\n'), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 推荐方案\n\n方案 B\n\n### 架构决策摘要\n\n- 方案 B: 方案 B\n'), true);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 推荐方案\n\nOption A\n\n### 架构决策摘要\n\n- Option A: Option A\n'), true);
  });

  it('keeps a described option and any ADR or blocked-step text', () => {
    assert.equal(
      isEmptyOrPlaceholderLessonBody('### 推荐方案\n\n方案 A：引入基于 Git diff 的 Guard\n'),
      false,
    );
    assert.equal(
      isEmptyOrPlaceholderLessonBody('采用方案 A 作为默认，并在 diff 上加 Guard'),
      false,
    );
    const withAdr = [
      '### 推荐方案',
      '',
      '方案 A',
      '',
      '### 架构决策摘要',
      '',
      '- Guard: 引入基于 Git diff 的检查',
    ].join('\n');
    assert.equal(isEmptyOrPlaceholderLessonBody(withAdr), false);
    const withBlocked = [
      '### 推荐方案',
      '',
      '方案 A',
      '',
      '### 阻塞步骤（踩坑点）',
      '',
      '- S1: 遇到 X 阻塞',
    ].join('\n');
    assert.equal(isEmptyOrPlaceholderLessonBody(withBlocked), false);
  });

  it('keeps a lesson body that contains substantive text', () => {
    const body = [
      '',
      '### 推荐方案',
      '',
      '事件溯源统一状态边界',
      '',
      '### 阻塞步骤（踩坑点）',
      '',
      '- S2: 遇到 X 阻塞',
    ].join('\n');
    assert.equal(isEmptyOrPlaceholderLessonBody(body), false);
    assert.equal(isEmptyOrPlaceholderLessonBody('### 推荐方案\n\n待补充\n\n必须同步更新活文档，避免契约漂移。\n'), false);
  });
});

describe('journal lesson candidate generation', () => {
  it('skips writing when the lesson body would be empty', () => {
    const cwd = mkWorkspace();
    const path = lessonsPath(cwd);
    writeFileSync(path, '# Lesson Candidates\n\n## keep me\n');
    try {
      const out = runJournal(cwd);
      assert.match(out, /无 ADR\/brief\/blocked 内容，跳过 lesson 候选写入/);
      assert.doesNotMatch(out, /Lesson 候选已更新/);
      assert.equal(readFileSync(path, 'utf-8'), '# Lesson Candidates\n\n## keep me\n');
      assert.doesNotMatch(readFileSync(path, 'utf-8'), /### Lesson/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips writing when the lesson body is whitespace-only', () => {
    const cwd = mkWorkspace({ specMd: specWithBrief('\u00a0\u00a0') });
    const path = lessonsPath(cwd);
    const seeded = '# Lesson Candidates\n\n## keep me\n';
    writeFileSync(path, seeded);
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 正文为空或仅为占位，跳过 lesson 候选写入/);
      assert.doesNotMatch(out, /Lesson 候选已更新/);
      assert.equal(readFileSync(path, 'utf-8'), seeded);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips writing when the lesson body is only placeholder text', () => {
    const cwd = mkWorkspace({ specMd: specWithBrief('待补充') });
    const path = lessonsPath(cwd);
    const seeded = '# Lesson Candidates\n\n## keep me\n';
    writeFileSync(path, seeded);
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 正文为空或仅为占位，跳过 lesson 候选写入/);
      assert.doesNotMatch(out, /Lesson 候选已更新/);
      assert.equal(readFileSync(path, 'utf-8'), seeded);
      assert.match(out, /决策日志已更新/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips writing when the only recommendation is bare 方案 A', () => {
    const cwd = mkWorkspace({ specMd: specWithBrief('方案 A') });
    const path = lessonsPath(cwd);
    const seeded = '# Lesson Candidates\n\n## keep me\n';
    writeFileSync(path, seeded);
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 正文为空或仅为占位，跳过 lesson 候选写入/);
      assert.doesNotMatch(out, /Lesson 候选已更新/);
      assert.equal(readFileSync(path, 'utf-8'), seeded);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips writing when the only recommendation is 方案A', () => {
    const cwd = mkWorkspace({ specMd: specWithBrief('方案A') });
    const path = lessonsPath(cwd);
    const seeded = '# Lesson Candidates\n\n## keep me\n';
    writeFileSync(path, seeded);
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 正文为空或仅为占位，跳过 lesson 候选写入/);
      assert.doesNotMatch(out, /Lesson 候选已更新/);
      assert.equal(readFileSync(path, 'utf-8'), seeded);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips writing when the only recommendation is 方案 B or Option A', () => {
    for (const label of ['方案 B', 'Option A']) {
      const cwd = mkWorkspace({ specMd: specWithBrief(label) });
      const path = lessonsPath(cwd);
      const seeded = '# Lesson Candidates\n\n## keep me\n';
      writeFileSync(path, seeded);
      try {
        const out = runJournal(cwd);
        assert.match(out, /Lesson 正文为空或仅为占位，跳过 lesson 候选写入/, label);
        assert.doesNotMatch(out, /Lesson 候选已更新/);
        assert.equal(readFileSync(path, 'utf-8'), seeded);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  });

  it('writes a candidate when 方案 A includes a real description', () => {
    const recommended = '方案 A：引入基于 Git diff 的 Guard';
    const cwd = mkWorkspace({ specMd: specWithBrief(recommended) });
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 候选已更新/);
      assert.equal(existsSync(lessonsPath(cwd)), true);
      const lessons = readFileSync(lessonsPath(cwd), 'utf-8');
      assert.match(lessons, new RegExp(`- key: ${TASK_ID}-workflow`));
      assert.match(lessons, /### Lesson/);
      assert.match(lessons, /推荐方案/);
      assert.match(lessons, /方案 A：引入基于 Git diff 的 Guard/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('writes a candidate when bare 方案 A is accompanied by blocked steps', () => {
    const cwd = mkWorkspace({
      specMd: specWithBrief('方案 A'),
      breadcrumbContext: '遇到 X 阻塞',
      breadcrumbStatus: 'blocked',
    });
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 候选已更新/);
      assert.equal(existsSync(lessonsPath(cwd)), true);
      const lessons = readFileSync(lessonsPath(cwd), 'utf-8');
      assert.match(lessons, /### Lesson/);
      assert.match(lessons, /推荐方案/);
      assert.match(lessons, /方案 A/);
      assert.match(lessons, /阻塞步骤/);
      assert.match(lessons, /遇到 X 阻塞/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('still writes a candidate when the lesson body has substantive text', () => {
    const cwd = mkWorkspace({
      specMd: specWithBrief('事件溯源统一状态边界'),
      breadcrumbContext: '遇到 X 阻塞',
      breadcrumbStatus: 'blocked',
    });
    try {
      const out = runJournal(cwd);
      assert.match(out, /Lesson 候选已更新/);
      assert.equal(existsSync(lessonsPath(cwd)), true);
      const lessons = readFileSync(lessonsPath(cwd), 'utf-8');
      assert.match(lessons, new RegExp(`- key: ${TASK_ID}-workflow`));
      assert.match(lessons, /### Lesson/);
      assert.match(lessons, /推荐方案/);
      assert.match(lessons, /事件溯源统一状态边界/);
      assert.match(lessons, /阻塞步骤/);
      assert.match(lessons, /遇到 X 阻塞/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
