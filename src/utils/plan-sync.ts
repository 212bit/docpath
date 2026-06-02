/** plan.md 与 breadcrumb.md 的同步/漂移检测工具。 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readBreadcrumb, type BreadcrumbEntry } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';
import { parsePlanTasks, readCurrentState } from './workspace.js';
import { parsePlanSteps } from './doc-parser.js';
import { resolveActiveTaskDocPath, writeActiveTaskFile } from './task-files.js';

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
  const planPath = await planPathFor(cwd);
  if (!existsSync(planPath)) return [];

  const [planContent, breadcrumb, state] = await Promise.all([
    readFile(planPath, 'utf-8'),
    readBreadcrumb(cwd),
    readCurrentState(cwd),
  ]);

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
  if (!existsSync(planPath)) return { updated: false, reason: 'plan.md 不存在' };

  const state = await readCurrentState(cwd);
  const content = await readFile(planPath, 'utf-8');
  const steps = parsePlanSteps(content);
  const target = steps.find((item) => item.id.toLowerCase() === step.toLowerCase());
  if (!target) return { updated: false, reason: `plan.md 未找到步骤 ${step}` };

  let next = content;
  const mark = markerForStatus(status);
  if (target.lineText && target.checklistIndex >= 0) {
    next = `${content.slice(0, target.checklistIndex)}${target.lineText.replace(/^- \[[ xX~!]\]/, `- [${mark}]`)}${content.slice(target.checklistIndex + target.lineText.length)}`;
  } else if (target.sectionIndex >= 0) {
    const line = `- [${mark}] ${target.id}: ${target.name}\n`;
    const insertAt = content.indexOf('\n', target.sectionIndex);
    next = `${content.slice(0, insertAt + 1)}${line}${content.slice(insertAt + 1)}`;
  }

  if (next === content) return { updated: false, reason: `步骤 ${step} 已是目标状态` };

  const docpathDir = await resolveDocpathDir(cwd);
  await writeActiveTaskFile(docpathDir, state?.task_id || 'current', 'plan.md', next);
  return { updated: true, reason: `已同步 plan.md 步骤 ${step}` };
}

export async function detectPlanBreadcrumbDrift(cwd: string): Promise<PlanBreadcrumbDrift> {
  const planPath = await planPathFor(cwd);
  if (!existsSync(planPath)) return { planDoneWithoutBreadcrumb: [], breadcrumbDoneWithoutPlan: [] };

  const [planContent, breadcrumb, state] = await Promise.all([
    readFile(planPath, 'utf-8'),
    readBreadcrumb(cwd),
    readCurrentState(cwd),
  ]);
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
