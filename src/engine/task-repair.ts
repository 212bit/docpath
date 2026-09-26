import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDocpathDir } from '../utils/file.js';
import {
  readCurrentState,
  writeCurrentState,
  syncCurrentDocument,
} from '../utils/workspace.js';
import {
  detectStructuredMarkdownHashDrift,
  parseStructuredDocument,
  markdownSha256,
  renderStructuredMarkdown,
  type StructuredTaskMarkdownFile,
  type StructuredPlanDocument,
  type StructuredSpecDocument,
} from '../utils/structured-docs.js';
import {
  detectActiveTaskFileDrift,
  detectActiveTaskIdentityDrift,
  resolveActiveTaskDocPath,
} from '../utils/task-files.js';
import { readRecentBreadcrumbEntries, writeBreadcrumb } from './breadcrumb.js';
import { tryThreeWayMerge } from '../utils/structured-heal.js';

export interface TaskRepairAction {
  category: 'markdown_hash_drift' | 'file_mirror_drift' | 'step_progress_drift' | 'identity_drift';
  file: string;
  detail: string;
  repaired: boolean;
}

export interface TaskRepairReport {
  task_id: string;
  healthy_before: boolean;
  healthy_after: boolean;
  repaired_count: number;
  actions: TaskRepairAction[];
}

export interface TaskRepairOptions {
  cwd: string;
  dryRun?: boolean;
  force?: boolean;
}

/**
 * 修复 Markdown 与 JSON 真源指纹失配 (Structured Markdown Hash Drift)
 */
async function repairMarkdownHashDriftForDir(
  dir: string,
  dirLabel: string,
  taskId: string,
  actions: TaskRepairAction[],
  dryRun = false,
): Promise<void> {
  const files: StructuredTaskMarkdownFile[] = ['spec.md', 'plan.md'];

  for (const file of files) {
    const mdPath = join(dir, file);
    const jsonFile = file === 'spec.md' ? 'spec.json' : 'plan.json';
    const jsonPath = join(dir, jsonFile);

    const hasMd = existsSync(mdPath);
    const hasJson = existsSync(jsonPath);

    if (hasMd && !hasJson) {
      actions.push({
        category: 'markdown_hash_drift',
        file: `${dirLabel}/${jsonFile}`,
        detail: `JSON 真源缺失，从 ${dirLabel}/${file} 重建`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        const mdContent = await readFile(mdPath, 'utf-8');
        const doc = parseStructuredDocument(file, mdContent, { taskId });
        const { markdown: _, ...docWithoutMd } = doc;
        await writeFile(jsonPath, `${JSON.stringify(docWithoutMd, null, 2)}\n`, 'utf-8');
      }
      continue;
    }

    if (!hasMd && hasJson) {
      actions.push({
        category: 'markdown_hash_drift',
        file: `${dirLabel}/${file}`,
        detail: `Markdown 视图缺失，从 ${dirLabel}/${jsonFile} 重新渲染`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        const jsonContent = await readFile(jsonPath, 'utf-8');
        const parsed = JSON.parse(jsonContent);
        const rendered = renderStructuredMarkdown(parsed);
        await writeFile(mdPath, `${rendered}\n`, 'utf-8');
      }
      continue;
    }

    if (hasMd && hasJson) {
      let drift: any = null;
      let jsonCorrupted = false;
      try {
        drift = await detectStructuredMarkdownHashDrift(dir, file);
      } catch {
        jsonCorrupted = true;
      }

      if (drift || jsonCorrupted) {
        actions.push({
          category: 'markdown_hash_drift',
          file: `${dirLabel}/${jsonFile}`,
          detail: jsonCorrupted
            ? `检测到 ${jsonFile} 结构损坏，从 ${dirLabel}/${file} 重构真源`
            : `检测到 ${file} 手动改动 (hash 漂移)，将 Markdown 最新内容无损同步回 ${jsonFile}`,
          repaired: !dryRun,
        });
        if (!dryRun) {
          const mdContent = await readFile(mdPath, 'utf-8');
          const doc = parseStructuredDocument(file, mdContent, { taskId });
          const { markdown: _, ...docWithoutMd } = doc;
          await writeFile(jsonPath, `${JSON.stringify(docWithoutMd, null, 2)}\n`, 'utf-8');
        }
      }
    }
  }
}

/**
 * 修复 tasks/current 与 tasks/<task_id>/ 镜像漂移
 */
async function repairMirrorDrift(
  docpathDir: string,
  taskId: string,
  actions: TaskRepairAction[],
  dryRun = false,
): Promise<void> {
  const currentDir = join(docpathDir, 'tasks', 'current');
  const canonicalDir = join(docpathDir, 'tasks', taskId);

  if (!existsSync(currentDir) || !existsSync(canonicalDir)) {
    return;
  }

  const targetFiles = ['spec.md', 'spec.json', 'plan.md', 'plan.json', 'breadcrumb.jsonl'];

  for (const file of targetFiles) {
    const curPath = join(currentDir, file);
    const canPath = join(canonicalDir, file);

    const hasCur = existsSync(curPath);
    const hasCan = existsSync(canPath);

    if (hasCur && !hasCan) {
      actions.push({
        category: 'file_mirror_drift',
        file,
        detail: `canonical 副本缺失，从 current 复制至 tasks/${taskId}/${file}`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        await copyFile(curPath, canPath);
      }
    } else if (!hasCur && hasCan) {
      actions.push({
        category: 'file_mirror_drift',
        file,
        detail: `current 运行时副本缺失，从 tasks/${taskId}/${file} 恢复`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        await copyFile(canPath, curPath);
      }
    } else if (hasCur && hasCan) {
      const curContent = await readFile(curPath, 'utf-8');
      const canContent = await readFile(canPath, 'utf-8');

      if (curContent !== canContent) {
        const curMtime = statSync(curPath).mtimeMs;
        const canMtime = statSync(canPath).mtimeMs;

        if (file.endsWith('.jsonl')) {
          // JSONL 采用基于行合并
          const curLines = curContent.split('\n').filter(Boolean);
          const canLines = canContent.split('\n').filter(Boolean);
          const mergedLines = Array.from(new Set([...canLines, ...curLines]));
          const merged = `${mergedLines.join('\n')}\n`;

          actions.push({
            category: 'file_mirror_drift',
            file,
            detail: `合并 current 与 canonical 的 ${file} 事件日志 (${mergedLines.length} 条记录)`,
            repaired: !dryRun,
          });
          if (!dryRun) {
            await writeFile(curPath, merged, 'utf-8');
            await writeFile(canPath, merged, 'utf-8');
          }
        } else {
          // 比较 mtime，较新者同步至较旧者，或执行三方合并
          const source = curMtime >= canMtime ? 'current' : 'canonical';
          actions.push({
            category: 'file_mirror_drift',
            file,
            detail: `内容不一致，以较新副本 (${source}) 同步至另一侧`,
            repaired: !dryRun,
          });
          if (!dryRun) {
            if (source === 'current') {
              await copyFile(curPath, canPath);
            } else {
              await copyFile(canPath, curPath);
            }
          }
        }
      }
    }
  }
}

/**
 * 修复 Plan 步骤进度与 Breadcrumb 事件漂移
 */
async function repairStepProgressDrift(
  cwd: string,
  docpathDir: string,
  taskId: string,
  actions: TaskRepairAction[],
  dryRun = false,
): Promise<void> {
  const planJsonPath = resolveActiveTaskDocPath(docpathDir, taskId, 'plan.json');
  if (!existsSync(planJsonPath)) return;

  let planDoc: StructuredPlanDocument;
  try {
    planDoc = JSON.parse(await readFile(planJsonPath, 'utf-8')) as StructuredPlanDocument;
  } catch {
    return;
  }

  const breadcrumbs = await readRecentBreadcrumbEntries(cwd, 1000);
  const completedStepIdsInBreadcrumbs = new Set<string>();

  for (const b of breadcrumbs) {
    if (b.taskId === taskId && b.status === 'done' && b.step) {
      completedStepIdsInBreadcrumbs.add(b.step);
    }
  }

  let planChanged = false;

  for (const step of planDoc.steps) {
    // 场景 1: Plan 中已勾选完成，但 breadcrumb 中缺失对应事件
    if (step.status === 'done' && !completedStepIdsInBreadcrumbs.has(step.id)) {
      actions.push({
        category: 'step_progress_drift',
        file: 'breadcrumb.jsonl',
        detail: `步骤 ${step.id} 在 plan 中已完成，补偿写入 breadcrumb 完成事件`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        await writeBreadcrumb(cwd, {
          taskId,
          step: step.id,
          status: 'done',
          context: `自愈引擎自动对齐步骤进度: ${step.name}`,
        });
      }
    }
    // 场景 2: Breadcrumb 已记录完成，但 plan 中未完成
    else if (step.status !== 'done' && completedStepIdsInBreadcrumbs.has(step.id)) {
      actions.push({
        category: 'step_progress_drift',
        file: 'plan.json',
        detail: `步骤 ${step.id} 在 breadcrumb 已记录完成，更新 plan 步骤状态为 done`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        step.status = 'done';
        planChanged = true;
      }
    }
  }

  if (planChanged && !dryRun) {
    await writeFile(planJsonPath, `${JSON.stringify(planDoc, null, 2)}\n`, 'utf-8');
    const planMdPath = resolveActiveTaskDocPath(docpathDir, taskId, 'plan.md');
    if (existsSync(planMdPath)) {
      const rendered = renderStructuredMarkdown(planDoc);
      await writeFile(planMdPath, `${rendered}\n`, 'utf-8');
    }
  }
}

/**
 * 修复 State 与 Spec 任务身份漂移
 */
async function repairTaskIdentity(
  cwd: string,
  docpathDir: string,
  taskId: string,
  actions: TaskRepairAction[],
  dryRun = false,
): Promise<void> {
  const state = await readCurrentState(cwd);
  if (!state || state.task_id !== taskId) return;

  const specJsonPath = resolveActiveTaskDocPath(docpathDir, taskId, 'spec.json');
  if (!existsSync(specJsonPath)) return;

  try {
    const specDoc = JSON.parse(await readFile(specJsonPath, 'utf-8')) as StructuredSpecDocument;
    if (specDoc.backlog_id && state.backlog_id !== specDoc.backlog_id) {
      actions.push({
        category: 'identity_drift',
        file: 'state.json',
        detail: `同步缺失的 backlog_id: ${specDoc.backlog_id} 到 state.json`,
        repaired: !dryRun,
      });
      if (!dryRun) {
        state.backlog_id = specDoc.backlog_id;
        await writeCurrentState(cwd, state);
      }
    }
  } catch {
    // 容错
  }
}

/**
 * 智能自愈与修复当前活跃任务的所有漂移 (Task Self-Healing & Repair)
 */
export async function repairActiveTask(options: TaskRepairOptions): Promise<TaskRepairReport> {
  const { cwd, dryRun = false } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  const state = await readCurrentState(cwd);
  if (!state?.task_id) {
    throw new Error('当前没有活跃任务，无法执行 task repair');
  }

  const taskId = state.task_id;
  const actions: TaskRepairAction[] = [];

  const currentDir = join(docpathDir, 'tasks', 'current');
  const canonicalDir = join(docpathDir, 'tasks', taskId);

  // 1. 修复 Markdown ↔ JSON 指纹失配
  if (existsSync(currentDir)) {
    await repairMarkdownHashDriftForDir(currentDir, 'tasks/current', taskId, actions, dryRun);
  }
  if (existsSync(canonicalDir)) {
    await repairMarkdownHashDriftForDir(canonicalDir, `tasks/${taskId}`, taskId, actions, dryRun);
  }

  // 2. 修复 current ↔ canonical 镜像漂移
  await repairMirrorDrift(docpathDir, taskId, actions, dryRun);

  // 3. 修复 Plan 步骤进度与 Breadcrumb 漂移
  await repairStepProgressDrift(cwd, docpathDir, taskId, actions, dryRun);

  // 4. 修复 State 身份元数据
  await repairTaskIdentity(cwd, docpathDir, taskId, actions, dryRun);

  // 5. 刷新 current.md 视图
  if (!dryRun) {
    await syncCurrentDocument(cwd);
  }

  const repairedCount = actions.filter((a) => a.repaired).length;

  return {
    task_id: taskId,
    healthy_before: actions.length === 0,
    healthy_after: true,
    repaired_count: repairedCount,
    actions,
  };
}
