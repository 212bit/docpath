/**
 * 测试共享 fixture。
 *
 * mkExecWorkspace 搭建一个处于 executing 阶段、结构合法的 .docpath 工作区，
 * 供 check / review / go / status 等端到端测试复用。
 *
 * 内容与 agent-lifecycle.test.mjs 内联版本保持一致（结构校验所需的
 * spec FR/AC、plan 验收条件/依赖、last-check PASS 证据齐备），
 * 但参数化 dir 并返回常用路径，便于调用方继续写入。
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * @param {string} [dir] 目标根目录；省略时自建临时目录。
 * @returns {{ dir: string, tasks: string, workspace: string }}
 *   dir=工作区根，tasks=tasks/current（任务文档真源），workspace=workspace 目录。
 *
 * 注意：只搭建 tasks/current，不预建 tasks/<task_id> canonical 目录。
 * resolveActiveTaskDocPath 在 canonical 缺失时回退到 current，调用方写入
 * tasks/current/plan.md 即为操作真源；若预建 canonical 会反向回灌覆盖调用方写入。
 */
export function mkExecWorkspace(dir) {
  const root = dir ?? mkdtempSync(join(tmpdir(), 'dp-exec-'));
  const workspace = join(root, '.docpath', 'workspace');
  const tasks = join(root, '.docpath', 'tasks', 'current');

  mkdirSync(workspace, { recursive: true });
  mkdirSync(tasks, { recursive: true });

  writeFileSync(join(workspace, 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-AGENT',
    task_title: 'Agent Lifecycle',
    phase: 'executing',
    gate: 'none',
    state: 'executing',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }));
  writeFileSync(join(workspace, 'current.md'), '# current.md\n## 当前任务\ntest');
  writeFileSync(join(workspace, 'breadcrumb.md'), [
    '# breadcrumb.md',
    '',
    '### ✅ S1 [T-AGENT] — 2026-06-01T00:00:00.000Z',
    '',
    '---',
    'taskId: T-AGENT',
    'step: S1',
    'status: done',
    'timestamp: 2026-06-01T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: 已完成',
    '',
  ].join('\n'));
  writeFileSync(join(workspace, 'last-check.md'), '# Last Check Evidence\n\n**结果**: ✅ PASS\n');

  const plan = [
    '## 执行计划',
    '',
    '### S1: Agent lifecycle',
    '- [x] S1: Agent lifecycle',
    '- **描述**: 验证 agent 生命周期',
    '- **验收条件**: agent done 能完成任务',
    '- **依赖**: 无',
    '',
  ].join('\n');
  const spec = [
    '# T-AGENT - Agent Lifecycle',
    '',
    '## 1. 背景与动机',
    '',
    '测试 agent 生命周期。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: agent done 能完成任务',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持测试隔离',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- agent done',
    '',
    '### 不包含',
    '- 真实外部检查',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 测试结构 | 极简 / 标准 | 标准 | 满足结构校验 |',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: agent done 清理 pending-done',
    '',
  ].join('\n');

  writeFileSync(join(tasks, 'plan.md'), plan);
  writeFileSync(join(tasks, 'spec.md'), spec);

  return { dir: root, tasks, workspace };
}
