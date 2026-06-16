/**
 * Workspace 工具函数 — .docpath/ 状态读写
 *
 * 方案 B：state.json 为唯一状态真源，current.md 为只读渲染产物
 */

import { readFile, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';
import { resolveDocpathDir, writeFileAtomic } from './file.js';
import { readActiveTaskFile, resolveActiveTaskDocPath } from './task-files.js';
import {
  normalizeWorkflowSnapshot,
  snapshotFromState,
  type GateStatus,
  type RuntimeWorkflowState,
  type WorkflowPhase,
} from '../engine/state-machine.js';
import { normalizeWorkflowProfile, type WorkflowProfile } from '../engine/workflow-profile.js';
import { parsePlanSteps, renderPlanChecklist } from './doc-parser.js';
import { readLastCheckMarkdown } from './workspace-evidence.js';
import { readBreadcrumb, type BreadcrumbEntry } from '../engine/breadcrumb.js';

// ── state.json schema ──

interface EscalationInfo {
  /** 最近评估的推荐级别 (0-3) */
  recommended_level: number;
  /** 评估时间 */
  evaluated_at: string;
  /** 触发的规则名称 */
  triggered_rule?: string;
  /** 置信度 0.0-1.0 */
  confidence?: number;
}

export interface CurrentState {
  level: number;
  /** Proportional lifecycle profile. Missing historical values normalize to standard. */
  workflow_profile: WorkflowProfile;
  /** 兼容旧调用方的派生状态；新写入路径以 phase/gate 为准。 */
  state: RuntimeWorkflowState;
  task_id: string;
  task_title: string;
  phase: WorkflowPhase;
  gate: GateStatus;
  current_step: string;
  started_at: string;
  updated_at: string;
  /** Escalation 引擎评估结果（可选） */
  escalation?: EscalationInfo;
}

// ── 核心读写函数 ──

/**
 * 读取 .docpath/workspace/state.json（方案 B：唯一状态真源）
 * 如果 state.json 不存在但 current.md 存在，自动迁移并写入 state.json
 */
export async function readCurrentState(cwd: string): Promise<CurrentState | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const statePath = join(docpathDir, 'workspace', 'state.json');
  const currentPath = join(docpathDir, 'workspace', 'current.md');

  // 优先读 state.json
  if (existsSync(statePath)) {
    try {
      const content = await readFile(statePath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<CurrentState> & { state?: string; phase?: string; gate?: string };
      const normalized = normalizeStoredState(parsed);
      if (normalized) return normalized;
    } catch {
      // state.json 损坏，回退到 current.md 迁移
    }
  }

  // 迁移逻辑：从 current.md 读取并写入 state.json
  if (existsSync(currentPath)) {
    const legacy = await readLegacyCurrentMd(cwd);
    if (legacy) {
      await writeFile(statePath, JSON.stringify(legacy, null, 2), 'utf-8');
      return legacy;
    }
  }

  return null;
}

/**
 * 解析「当前已绑定的 task_id」。
 *
 * 真源优先级：active spec.md 首行 `# T-<date>-<slug>` > state.json 的 task_id。
 * 二者都缺失时返回空串 —— 调用方据此 fail-loud，绝不静默兜底成 unknown/runtime
 * 而在「无任务」状态下推进生命周期（参见 go/agent 漂移根因）。
 *
 * 注意：这是 agent 面向命令（go / agent step / agent done）的共享门禁；
 * 底层原语 `run` 不走此门禁，保留为无任务时的逃生通道。
 */
export async function resolveBoundTaskId(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const specPath = resolveActiveTaskDocPath(docpathDir, '', 'spec.md');
  if (existsSync(specPath)) {
    const specContent = await readFile(specPath, 'utf-8');
    const idMatch = specContent.match(/^#\s+(T-\S+)/m);
    if (idMatch) return idMatch[1].trim();
  }
  const state = await readCurrentState(cwd);
  return (state?.task_id || '').trim();
}

/**
 * 写入 state.json + 重建 current.md（方案 B：唯一写入路径）
 */
export async function writeCurrentState(cwd: string, state: CurrentState): Promise<void> {
  const normalized = normalizeStoredState(state);
  if (!normalized) {
    throw new Error(`[docpath] Invalid workflow snapshot: state=${state.state}, phase=${state.phase}, gate=${state.gate}`);
  }
  state = normalized;

  const docpathDir = await resolveDocpathDir(cwd);
  const statePath = join(docpathDir, 'workspace', 'state.json');
  const currentPath = join(docpathDir, 'workspace', 'current.md');

  // 写入 state.json（原子写入：先写 .tmp 再 rename，防止崩溃导致文件损坏）
  const stateTmpPath = statePath + '.tmp';
  const { state: _derivedState, ...persistedState } = state;
  await writeFile(stateTmpPath, JSON.stringify(persistedState, null, 2), 'utf-8');
  await rename(stateTmpPath, statePath);

  // 重建 current.md
  const activePlanPath = resolveActiveTaskDocPath(docpathDir, state.task_id || '', 'plan.md');
  const activeSpecPath = resolveActiveTaskDocPath(docpathDir, state.task_id || '', 'spec.md');
  const planContent = await readActiveTaskFile(docpathDir, state.task_id || '', 'plan.md');
  const lastCheckContent = await readLastCheckMarkdown(docpathDir);
  const breadcrumbSummary = extractLatestBreadcrumbEntrySummary((await readBreadcrumb(cwd)).entries);
  const specLink = `../${activeSpecPath.slice(docpathDir.length + 1).replace(/\\/g, '/')}`;
  const planLink = `../${activePlanPath.slice(docpathDir.length + 1).replace(/\\/g, '/')}`;

  const rendered = renderCurrentDocument(
    convertStateToFields(state),
    planContent,
    specLink,
    planLink,
    extractLastCheckSummary(lastCheckContent),
    breadcrumbSummary,
    state.escalation,
  );
  await writeFileAtomic(currentPath, rendered);
}

/**
 * 仅更新复杂度 level，不改动工作流 phase/gate。
 * 用于 escalation 自动升级等「非阶段」变更——其余状态变更一律走 transitionWorkflow()。
 */
export async function updateLevel(cwd: string, level: number): Promise<void> {
  const current = await readCurrentState(cwd);
  if (!current) {
    console.error('⚠️  current.md 不存在，请先运行 docpath:init');
    return;
  }
  await writeCurrentState(cwd, { ...current, level, updated_at: new Date().toISOString() });
}

// ── 兼容别名（保持现有调用者不变） ──

/**
 * 读取 .docpath/workspace/current.md 的状态块
 * @deprecated 请使用 readCurrentState()，此函数仅为兼容保留
 */
export async function readCurrentMd(cwd: string): Promise<CurrentState | null> {
  return readCurrentState(cwd);
}

// ── 内部辅助函数 ──

function normalizeStoredState(raw: Partial<CurrentState> & { state?: string; phase?: string; gate?: string }): CurrentState | null {
  const snapshot = normalizeWorkflowSnapshot({
    state: raw.state,
    phase: raw.phase,
    gate: raw.gate,
  });
  if (!snapshot) return null;

  return {
    level: raw.level || 0,
    workflow_profile: normalizeWorkflowProfile((raw as { workflow_profile?: unknown }).workflow_profile),
    state: snapshot.state,
    task_id: raw.task_id || '',
    task_title: raw.task_title || '',
    phase: snapshot.phase,
    gate: snapshot.gate,
    current_step: raw.current_step || '待确认下一步',
    started_at: raw.started_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
    escalation: raw.escalation,
  };
}

function extractLegacyYamlBlock(content: string): string | null {
  return content.match(/```yaml\n([\s\S]*?)```/)?.[1] ?? null;
}

function stripYamlInlineComment(value: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const prev = value[i - 1];

    if (char === '"' && !inSingle && prev !== '\\') inDouble = !inDouble;
    if (char === "'" && !inDouble && prev !== '\\') inSingle = !inSingle;
    if (char === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(prev))) {
      return value.slice(0, i).trim();
    }
  }

  return value.trim();
}

function unquoteYamlScalar(value: string): string {
  const trimmed = stripYamlInlineComment(value);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readLegacyYamlValue(yamlBlock: string, key: string): string {
  const match = yamlBlock.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!match) return '';
  const value = unquoteYamlScalar(match[1]);
  return value === 'null' ? '' : value;
}

function legacyStateFromYamlBlock(yamlBlock: string): CurrentState {
  const get = (key: string): string => readLegacyYamlValue(yamlBlock, key);
  const snapshot = normalizeWorkflowSnapshot({
    state: get('state'),
    phase: get('phase'),
    gate: get('gate'),
  }) || snapshotFromState('idle')!;

  return {
    level: parseInt(get('level'), 10) || 0,
    workflow_profile: normalizeWorkflowProfile(readLegacyYamlValue(yamlBlock, 'workflow_profile')),
    state: snapshot.state,
    task_id: get('task_id'),
    task_title: get('task_title'),
    phase: snapshot.phase,
    gate: snapshot.gate,
    current_step: get('current_step'),
    started_at: get('started_at'),
    updated_at: get('updated_at'),
  };
}

/**
 * 从旧版 current.md YAML 块读取状态（迁移用）
 */
async function readLegacyCurrentMd(cwd: string): Promise<CurrentState | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  try {
    const content = await readFile(currentPath, 'utf-8');
    const yamlBlock = extractLegacyYamlBlock(content);
    return yamlBlock ? legacyStateFromYamlBlock(yamlBlock) : null;
  } catch {
    return null;
  }
}

type CurrentStateFields = {
  level: string;
  workflow_profile: WorkflowProfile;
  state: RuntimeWorkflowState;
  task_id: string;
  task_title: string;
  phase: WorkflowPhase;
  gate: GateStatus;
  current_step: string;
  started_at: string;
  updated_at: string;
};

function extractPlanChecklist(plan: string): string[] {
  return renderPlanChecklist(parsePlanSteps(plan));
}

function workspaceLink(file: string): string {
  return `./${file}`;
}

function renderCurrentStateYaml(fields: CurrentStateFields): string {
  return `\`\`\`yaml
level: ${fields.level}
workflow_profile: ${fields.workflow_profile}
state: ${fields.state.padEnd(19)}# 当前状态
task_id: ${fields.task_id}
task_title: ${fields.task_title}
phase: ${fields.phase}
gate: ${fields.gate}
current_step: ${fields.current_step}
started_at: ${fields.started_at}
updated_at: ${fields.updated_at}
\`\`\``;
}

function renderExecutionChecklist(planContent: string): string {
  const checklist = extractPlanChecklist(planContent);
  return checklist.length > 0
    ? checklist.join('\n')
    : '- [ ] 暂无 plan.md checklist，请补充 `.docpath/tasks/current/plan.md`';
}

function renderEvidenceBlock(lastCheckSummary: string, breadcrumbSummary: string): string {
  return [
    `- Last Check: [last-check.md](${workspaceLink('last-check.md')}) — ${lastCheckSummary}`,
    `- Breadcrumb: [breadcrumb.md](${workspaceLink('breadcrumb.md')}) — ${breadcrumbSummary}`,
  ].join('\n');
}

function renderEscalationBlock(escalation?: EscalationInfo): string {
  if (!escalation) return '';
  return `## 📈 Escalation 评估

- **推荐级别**: ${escalation.recommended_level}
${escalation.triggered_rule ? `- **触发规则**: ${escalation.triggered_rule}` : ''}
${escalation.confidence !== undefined ? `- **置信度**: ${escalation.confidence.toFixed(2)}` : ''}
- **评估时间**: ${escalation.evaluated_at}

`;
}

export function parsePlanTasks(planContent: string): { id: string; title: string; done: boolean }[] {
  return parsePlanSteps(planContent).map((step) => ({
    id: step.id,
    title: step.name,
    done: step.done,
  }));
}

export async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function extractLastCheckSummary(content: string): string {
  const time = content.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim();
  const result = content.match(/^\*\*结果\*\*:\s*(.+)$/m)?.[1]?.trim();
  const count = content.match(/^\*\*检查项\*\*:\s*(.+)$/m)?.[1]?.trim();
  if (!time && !result && !count) return '暂无 last-check.md 证据';
  return [result, count ? `${count} 项` : '', time].filter(Boolean).join(' · ');
}

function extractLatestBreadcrumbEntrySummary(entries: BreadcrumbEntry[]): string {
  const latest = entries.at(-1);
  if (!latest) return '暂无 breadcrumb.md 记录';
  return [
    latest.step,
    latest.status ? `状态: ${latest.status}` : '',
    latest.context,
  ].filter(Boolean).join(' · ');
}

function convertStateToFields(state: CurrentState): CurrentStateFields {
  return {
    level: String(state.level),
    workflow_profile: normalizeWorkflowProfile(state.workflow_profile),
    state: state.state,
    task_id: state.task_id,
    task_title: state.task_title,
    phase: state.phase,
    gate: state.gate,
    current_step: state.current_step,
    started_at: state.started_at,
    updated_at: state.updated_at,
  };
}

// collectCurrentStateFields() 已随 updateCurrentState() 一并移除 (D-P0.2 / G2)。
// 旧的「读多源文件 + 合并 extraFields + 推断 state」逻辑不再需要：
// transitionWorkflow() 直接给出 phase/gate，writeCurrentState() 负责落盘与重建 current.md。


function renderCurrentDocument(
  fields: CurrentStateFields,
  planContent: string,
  taskSpecLink: string,
  taskPlanLink: string,
  lastCheckSummary: string,
  breadcrumbSummary: string,
  escalation?: EscalationInfo,
): string {
  return `# 📍 当前工作流状态

${renderCurrentStateYaml(fields)}

> 📖 规约: [spec.md](${taskSpecLink})
> 📋 计划: [plan.md](${taskPlanLink})

## ✅ 执行检查清单

${renderExecutionChecklist(planContent)}

## 🧾 最近验证证据

${renderEvidenceBlock(lastCheckSummary, breadcrumbSummary)}

${renderEscalationBlock(escalation)}## 🔄 同步说明

本文件由 DocPath CLI 根据 \`.docpath/workspace/state.json\` 自动重建。
状态变化请通过 \`docpath go/check/journal\` 等命令推进，避免手工修改后与任务文档漂移。
`;
}

// updateCurrentState() 已移除 (D-P0.2 / G2)：
// 工作流状态写入的唯一入口是 transitionWorkflow()（phase/gate 事件）与 updateLevel()（仅 level），
// 二者都落到 writeCurrentState()。命令层不再直接拼装状态字段，杜绝 phase/state 漂移。

/**
 * 重建 current.md 正文但保持当前状态字段；用于修复/同步已有工作区
 */
export async function syncCurrentDocument(cwd: string): Promise<void> {
  const current = await readCurrentState(cwd);
  if (!current) {
    console.error('⚠️  state.json 和 current.md 均不存在，请先运行 docpath:init');
    return;
  }
  
  // 直接重建 current.md
  const docpathDir = await resolveDocpathDir(cwd);
  const activePlanPath = resolveActiveTaskDocPath(docpathDir, current.task_id || '', 'plan.md');
  const activeSpecPath = resolveActiveTaskDocPath(docpathDir, current.task_id || '', 'spec.md');
  const planContent = await readActiveTaskFile(docpathDir, current.task_id || '', 'plan.md');
  const lastCheckContent = await readLastCheckMarkdown(docpathDir);
  const breadcrumbSummary = extractLatestBreadcrumbEntrySummary((await readBreadcrumb(cwd)).entries);
  const specLink = `../${activeSpecPath.slice(docpathDir.length + 1).replace(/\\/g, '/')}`;
  const planLink = `../${activePlanPath.slice(docpathDir.length + 1).replace(/\\/g, '/')}`;

  const rendered = renderCurrentDocument(
    convertStateToFields(current),
    planContent,
    specLink,
    planLink,
    extractLastCheckSummary(lastCheckContent),
    breadcrumbSummary,
    current.escalation,
  );
  
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  await writeFileAtomic(currentPath, rendered);
}

/**
 * 交互询问
 */
export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 读取 workspace 元数据 (.docpath/workspace.json)
 */
export async function readWorkspaceMeta(cwd: string): Promise<Record<string, unknown> | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const metaPath = join(docpathDir, 'workspace.json');
  try {
    const content = await readFile(metaPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
