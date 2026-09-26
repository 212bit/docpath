import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repairActiveTask } from '../dist/engine/task-repair.js';
import { markdownSha256 } from '../dist/utils/structured-docs.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('DocPath Task Self-Healing & Repair Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-task-repair-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  function setupTask(dir, taskId = 'T-20260926-sample') {
    const docpathDir = join(dir, '.docpath');
    const currentDir = join(docpathDir, 'tasks', 'current');
    const canonicalDir = join(docpathDir, 'tasks', taskId);
    const workspaceDir = join(docpathDir, 'workspace');

    return { docpathDir, currentDir, canonicalDir, workspaceDir, taskId };
  }

  it('reconciles manual markdown edits into structured json truth', async () => {
    const { docpathDir, currentDir, canonicalDir, workspaceDir, taskId } = setupTask(tempDir);
    await mkdir(currentDir, { recursive: true });
    await mkdir(canonicalDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });

    // Initial spec
    const initialMd = `# T-20260926-sample - 初始任务标题

## 1. 需求背景
这是初始背景。

## 2. 功能需求
- [ ] **FR-1**: 初始功能需求 1

## 3. 验收标准
- [ ] **AC-1**: 初始验收 1
`;
    const initialHash = markdownSha256(initialMd);
    const initialJson = {
      schema_version: 1,
      kind: 'spec',
      source: {
        kind: 'markdown',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        content_sha256: initialHash,
      },
      task_id: taskId,
      title: 'T-20260926-sample - 初始任务标题',
      generated_at: new Date().toISOString(),
      scope: { included: [], excluded: [] },
      major_change_gate: { required: false, types: [], user_confirmed: null, decision_brief_markdown: '' },
      ui_gate: { state: 'unknown' },
      functional_requirements: [{ id: 'FR-1', text: '初始功能需求 1', done: false }],
      non_functional_requirements: [],
      acceptance_criteria: [{ id: 'AC-1', text: '初始验收 1', done: false }],
    };

    await writeFile(join(currentDir, 'spec.md'), initialMd);
    await writeFile(join(currentDir, 'spec.json'), JSON.stringify(initialJson, null, 2));
    await writeFile(join(canonicalDir, 'spec.md'), initialMd);
    await writeFile(join(canonicalDir, 'spec.json'), JSON.stringify(initialJson, null, 2));

    await writeFile(join(workspaceDir, 'state.json'), JSON.stringify({
      task_id: taskId,
      phase: 'executing',
      current_step: 'S1',
    }));

    // 人类手动在 spec.md 中补充了 FR-2
    const editedMd = `${initialMd}\n- [ ] **FR-2**: 人类手动补充的需求 2\n`;
    await writeFile(join(currentDir, 'spec.md'), editedMd);

    // 执行任务自愈
    const report = await repairActiveTask({ cwd: tempDir });
    assert.equal(report.healthy_before, false);
    assert.ok(report.repaired_count > 0);

    // 验证 spec.json 已自动同步并更新 content_sha256
    const updatedJsonStr = await readFile(join(currentDir, 'spec.json'), 'utf-8');
    const updatedJson = JSON.parse(updatedJsonStr);
    assert.equal(updatedJson.source.content_sha256, markdownSha256(editedMd));
    assert.ok(updatedJson.functional_requirements.some((fr) => fr.id === 'FR-2'));
  });

  it('heals step progress drift and missing breadcrumb completions', async () => {
    const { docpathDir, currentDir, canonicalDir, workspaceDir, taskId } = setupTask(tempDir);
    await mkdir(currentDir, { recursive: true });
    await mkdir(canonicalDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });

    const planJson = {
      schema_version: 1,
      kind: 'plan',
      source: {
        kind: 'markdown',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        content_sha256: 'hash',
      },
      title: '执行计划',
      generated_at: new Date().toISOString(),
      markdown: '# 执行计划\n\n- [x] **S1**: 步骤1\n- [ ] **S2**: 步骤2\n',
      steps: [
        { id: 'S1', name: '步骤1', description: 'desc', acceptance: 'acc', dependencies: '', status: 'done' },
        { id: 'S2', name: '步骤2', description: 'desc', acceptance: 'acc', dependencies: '', status: 'pending' },
      ],
    };

    await writeFile(join(currentDir, 'plan.json'), JSON.stringify(planJson, null, 2));
    await writeFile(join(canonicalDir, 'plan.json'), JSON.stringify(planJson, null, 2));
    await writeFile(join(workspaceDir, 'breadcrumb.jsonl'), '');
    await writeFile(join(workspaceDir, 'state.json'), JSON.stringify({
      task_id: taskId,
      phase: 'executing',
    }));

    const report = await repairActiveTask({ cwd: tempDir });
    const stepAction = report.actions.find((a) => a.category === 'step_progress_drift');
    assert.ok(stepAction, 'Should detect step progress drift');

    const breadcrumbsStr = await readFile(join(workspaceDir, 'breadcrumb.jsonl'), 'utf-8');
    assert.ok(breadcrumbsStr.includes('S1'), 'Should have compensated breadcrumb for completed S1');
  });

  it('supports CLI commands: docpath task repair, --agent, and sync --auto', async () => {
    const { docpathDir, currentDir, canonicalDir, workspaceDir, taskId } = setupTask(tempDir);
    await mkdir(currentDir, { recursive: true });
    await mkdir(canonicalDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(docpathDir, 'config.yaml'), 'project:\n  name: test\n');

    await writeFile(join(workspaceDir, 'state.json'), JSON.stringify({
      task_id: taskId,
      phase: 'executing',
    }));

    // Run docpath task repair via agent mode
    const out = execSync(`node ${BIN} task repair --agent --cwd ${tempDir}`, {
      encoding: 'utf-8',
    });
    assert.ok(out.includes('agent_view: task_repair'));
    assert.ok(out.includes(`task_id: ${taskId}`));

    // Run docpath task sync --auto
    const syncOut = execSync(`node ${BIN} task sync --auto --agent --cwd ${tempDir}`, {
      encoding: 'utf-8',
    });
    assert.ok(syncOut.includes('agent_view: task_repair'));
  });
});
