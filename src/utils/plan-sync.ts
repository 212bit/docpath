/** plan.md 与 breadcrumb.md 的同步/漂移检测工具。 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from './file.js';
import { parsePlanTasks, readCurrentState } from './workspace.js';

export interface PlanSyncResult {
  updated: boolean;
  reason: string;
}

export interface PlanBreadcrumbDrift {
  planDoneWithoutBreadcrumb: string[];
  breadcrumbDoneWithoutPlan: string[];
}

async function planPathFor(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  return join(docpathDir, 'tasks', 'current', 'plan.md');
}

function stepPattern(step: string): RegExp {
  const escaped = step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(\\s*-\\s*\\[)([ xX])(?=\\]\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:：])`, 'm');
}

export async function markPlanStep(cwd: string, step: string, done: boolean): Promise<PlanSyncResult> {
  const planPath = await planPathFor(cwd);
  if (!existsSync(planPath)) return { updated: false, reason: 'plan.md 不存在' };

  const content = await readFile(planPath, 'utf-8');
  const pattern = stepPattern(step);
  if (!pattern.test(content)) return { updated: false, reason: `plan.md 未找到步骤 ${step}` };

  const next = content.replace(pattern, `$1${done ? 'x' : ' '}`);
  if (next === content) return { updated: false, reason: `步骤 ${step} 已是目标状态` };

  await writeFile(planPath, next, 'utf-8');
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
  const planById = new Map(planTasks.map((task) => [task.id, task]));
  const latestByStep = new Map<string, (typeof breadcrumb.entries)[number]>();

  for (const entry of breadcrumb.entries) {
    if (state?.task_id && entry.taskId && entry.taskId !== state.task_id) continue;
    latestByStep.set(entry.step, entry);
  }

  const planDoneWithoutBreadcrumb = planTasks
    .filter((task) => task.done && latestByStep.get(task.id)?.status !== 'done')
    .map((task) => task.id);

  const breadcrumbDoneWithoutPlan = Array.from(latestByStep.values())
    .filter((entry) => entry.status === 'done' && planById.get(entry.step)?.done !== true)
    .map((entry) => entry.step);

  return { planDoneWithoutBreadcrumb, breadcrumbDoneWithoutPlan };
}
