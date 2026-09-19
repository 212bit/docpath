/** plan.md 与 breadcrumb.md 的同步/漂移检测工具。 */

import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { readBreadcrumb, type BreadcrumbEntry } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';
import { parsePlanTasks, readCurrentState } from './workspace.js';
import { parsePlanSteps } from './doc-parser.js';
import { readActiveTaskFile, resolveActiveTaskDocPath, writeActiveTaskFile } from './task-files.js';
import { withLock } from './lock.js';

export interface PlanSyncResult {
  updated: boolean;
  reason: string;
}

export interface PlanBreadcrumbDrift {
  planDoneWithoutBreadcrumb: string[];
  breadcrumbDoneWithoutPlan: string[];
}

export interface EffectivePlanTask {
  id: string;
  title: string;
  done: boolean;
}

export type PlanStepStatus = 'done' | 'pending' | 'skipped' | 'blocked';

function latestByStep(entries: BreadcrumbEntry[], taskId?: string): Map<string, BreadcrumbEntry> {
  const latest = new Map<string, BreadcrumbEntry>();
  for (const entry of entries) {
    if (taskId && entry.taskId && entry.taskId !== taskId) continue;
    latest.set(entry.step, entry);
  }
  return latest;
}

export async function resolveEffectivePlanTasks(cwd: string): Promise<EffectivePlanTask[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const [planContent, breadcrumb] = await Promise.all([
    readActiveTaskFile(docpathDir, state?.task_id, 'plan.md'),
    readBreadcrumb(cwd),
  ]);
  if (!planContent.trim()) return [];

  const tasks = parsePlanTasks(planContent);
  const steps = parsePlanSteps(planContent);
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const latest = latestByStep(breadcrumb.entries, state?.task_id);

  return tasks.map((task) => {
    const step = stepById.get(task.id);
    const breadcrumbDone = latest.get(task.id)?.status === 'done';
    const effectiveDone = task.done || (!!breadcrumbDone && !!step && !step.lineText);
    return {
      id: task.id,
      title: task.title,
      done: effectiveDone,
    };
  });
}

async function planPathFor(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const jsonPath = resolveActiveTaskDocPath(docpathDir, state?.task_id, 'plan.json');
  if (existsSync(jsonPath)) return jsonPath;
  return resolveActiveTaskDocPath(docpathDir, state?.task_id, 'plan.md');
}

function markerForStatus(status: PlanStepStatus): 'x' | ' ' | '~' | '!' {
  if (status === 'done') return 'x';
  if (status === 'skipped') return '~';
  if (status === 'blocked') return '!';
  return ' ';
}

export async function markPlanStep(cwd: string, step: string, status: PlanStepStatus): Promise<PlanSyncResult> {
  const planPath = await planPathFor(cwd);
  if (!existsSync(planPath)) return { updated: false, reason: 'plan.json / plan.md 不存在' };

  const state = await readCurrentState(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  const taskId = state?.task_id || 'current';
  const lockPath = join(docpathDir, 'tasks', taskId, 'plan.lock');
  await mkdir(dirname(lockPath), { recursive: true });
  return withLock(lockPath, async () => {
    const content = await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md');
    if (!content.trim()) return { updated: false, reason: 'plan.json / plan.md 不存在' };
    const steps = parsePlanSteps(content);
    const target = steps.find((item) => item.id.toLowerCase() === step.toLowerCase());
    if (!target) return { updated: false, reason: `plan 未找到步骤 ${step}` };

    let next = content;
    const mark = markerForStatus(status);
    // 全局替换 plan.md 里所有匹配该 step id 的 checklist 行 marker（R-253）。
    // plan.md 通常有两份 checklist：每个 `### S1:` section 内的行 + 底部 `## Checklist` 汇总行。
    // 此前只替换第一处（target.checklistIndex），导致 section 内更新了、底部仍是旧状态，
    // agent 被迫 apply_patch 手编 plan.md，触发 sha256 / current-canonical 漂移。
    const escapedId = target.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const checklistLineRegex = new RegExp(
      `^(\\s*- \\[)[ xX~!](\\]\\s*(?:\\*\\*)?${escapedId}(?:\\*\\*)?(?:\\s*[:：].*)?$)`,
      'gm',
    );
    const replaced = content.replace(checklistLineRegex, (_, prefix, suffix) => `${prefix}${mark}${suffix}`);

    if (replaced !== content) {
      next = replaced;
    } else if (target.sectionIndex >= 0) {
      // 无任何 checklist 行时，在 section 标题后插入一行。
      const line = `- [${mark}] ${target.id}: ${target.name}\n`;
      const insertAt = content.indexOf('\n', target.sectionIndex);
      next = `${content.slice(0, insertAt + 1)}${line}${content.slice(insertAt + 1)}`;
    }

    if (next === content) return { updated: false, reason: `步骤 ${step} 已是目标状态` };

    await writeActiveTaskFile(docpathDir, taskId, 'plan.md', next);
    return { updated: true, reason: `已同步 plan.md 步骤 ${step}` };
  });
}

export async function detectPlanBreadcrumbDrift(cwd: string): Promise<PlanBreadcrumbDrift> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = await readCurrentState(cwd);
  const [planContent, breadcrumb] = await Promise.all([
    readActiveTaskFile(docpathDir, state?.task_id, 'plan.md'),
    readBreadcrumb(cwd),
  ]);
  if (!planContent.trim()) return { planDoneWithoutBreadcrumb: [], breadcrumbDoneWithoutPlan: [] };
  const planTasks = parsePlanTasks(planContent);
  const planSteps = parsePlanSteps(planContent);
  const planById = new Map(planTasks.map((task) => [task.id, task]));
  const planStepById = new Map(planSteps.map((task) => [task.id, task]));
  const latest = latestByStep(breadcrumb.entries, state?.task_id);
  const workflowOnlySteps = new Set(['check', 'review', 'journal']);

  const planDoneWithoutBreadcrumb = planTasks
    .filter((task) => task.done && latest.get(task.id)?.status !== 'done')
    .map((task) => task.id);

  const breadcrumbDoneWithoutPlan = Array.from(latest.values())
    .filter((entry) =>
      entry.status === 'done' &&
      !workflowOnlySteps.has(entry.step) &&
      (() => {
        const task = planById.get(entry.step);
        if (!task) return true;
        if (task.done) return false;
        const step = planStepById.get(entry.step);
        return !!step?.lineText;
      })()
    )
    .map((entry) => entry.step);

  return { planDoneWithoutBreadcrumb, breadcrumbDoneWithoutPlan };
}
