/**
 * docpath backlog — promote
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  detectBacklogDuplicates,
  readBacklogItem,
  refreshBacklogIndex,
  transitionBacklog,
  writeBacklogItem,
  type BacklogItem,
} from '../../engine/backlog.js';
import { emitNextHint } from '../../engine/next-hint.js';
import { evaluateTaskRisk, riskPolicyFromConfig, riskTierName } from '../../engine/risk.js';
import { transitionWorkflow } from '../../engine/transitions.js';
import { readRiskPolicyConfig } from '../../utils/config.js';
import { resolveDocpathDir, today } from '../../utils/file.js';
import { assertCleanWorktreeForNewTask, detectDirtyWorktree } from '../../utils/git-dirty-guard.js';
import {
  archivedTaskDir,
  backupCurrentTaskAlias,
  canonicalTaskDir,
  canonicalTaskRelativePath,
  clearCurrentTaskAlias,
  writeActiveTaskFile,
} from '../../utils/task-files.js';
import { readCurrentState } from '../../utils/workspace.js';
import { resolveWorktreePaths, worktreeCommand } from '../worktree.js';
import { assertBacklogReadyForExecution } from './evidence.js';
import { renderPromotedSpec } from './promote-spec.js';
import type { BacklogCommandOptions } from './types.js';

function isPromoteBacklogEvidencePath(path: string, itemId: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
  return normalized === '.docpath/backlog/backlog.md'
    || normalized === '.docpath/backlog/.id-counter'
    || normalized.startsWith('.docpath/backlog/')
    || normalized === `.docpath/backlog/${itemId}.md`
    || (normalized.startsWith(`.docpath/backlog/${itemId}-`) && normalized.endsWith('.md'));
}

function slugifyTask(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'task';
}

function baseTaskId(title: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `T-${date}-${slugifyTask(title)}`;
}

function taskIdExists(docpathDir: string, taskId: string): boolean {
  return existsSync(canonicalTaskDir(docpathDir, taskId)) || existsSync(archivedTaskDir(docpathDir, taskId));
}

function generateUniqueTaskId(docpathDir: string, title: string): string {
  const base = baseTaskId(title);
  if (!taskIdExists(docpathDir, base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taskIdExists(docpathDir, candidate)) return candidate;
  }

  throw new Error(`docpath backlog promote: 无法为标题生成唯一 task_id: ${title}`);
}

const SPEC_TRUTH_SYNC_HINT =
  'spec.json 真源已生成；如需细化 FR/AC，请使用 `docpath write-spec --stdin`，直接手改 spec.md 不会更新 spec.json 真源。';

async function assertNotActiveInOtherWorktrees(cwd: string, backlogId: string): Promise<void> {
  const { isGitRepo } = await import('../../utils/worktree.js');
  if (!(await isGitRepo(cwd))) return;

  const { listWorktrees, getGitTopLevel } = await import('../../utils/worktree.js');
  const repoRoot = await getGitTopLevel(cwd);
  const worktrees = await listWorktrees(repoRoot);

  for (const wt of worktrees) {
    if (resolve(wt.path) === resolve(cwd)) continue;

    const stateJsonPath = join(wt.path, '.docpath', 'workspace', 'state.json');
    if (existsSync(stateJsonPath)) {
      try {
        const stateContent = await readFile(stateJsonPath, 'utf-8');
        const state = JSON.parse(stateContent) as { task_id?: string; backlog_id?: string };
        if (state.backlog_id === backlogId || (state.task_id && state.task_id.includes(backlogId))) {
          const wtName = wt.path.split(/[\\/]/).filter(Boolean).at(-1) || wt.path;
          throw new Error(
            `docpath backlog promote: backlog 条目 ${backlogId} 已经在另一个工作区 '${wtName}' 中处于活跃状态，禁止重复 promote。`
          );
        }
      } catch (err) {
        // R-344 WT-2: 活跃性阻断继续上抛；读取/解析失败不再静默吞掉——
        // 否则并发 promote 防重等于裸奔（state.json 损坏时永远验证通过）。
        if (err instanceof Error && err.message.includes('promote')) throw err;
        const wtName = wt.path.split(/[\\/]/).filter(Boolean).at(-1) || wt.path;
        throw new Error(
          `docpath backlog promote: 无法验证工作区 '${wtName}' 的任务活跃性（${err instanceof Error ? err.message : String(err)}）。` +
          `请检查该工作区 .docpath/workspace/state.json 后重试。`
        );
      }
    }
  }
}

/**
 * R-352：promote 前的重复登记探测（只报告、不拦、不改数据）。
 *
 * 检查同 id 撞号（R-321/FR-2）与同 title 在 active/archived 的副本。
 * 命中任一时输出可读提示并挂进条目 evidence.decision_brief（via writeBacklogItem），
 * 用户显式 --user-confirmed 后放行——真正 gate 留待后续迭代加硬拦。
 */
async function warnOnDuplicateRegistration(
  cwd: string,
  item: BacklogItem,
): Promise<boolean> {
  const dups = await detectBacklogDuplicates(cwd, { id: item.id, title: item.title });
  if (dups.length === 0) return false;
  console.warn(`\n⚠️  检测到 ${dups.length} 条可能的重复登记（R-352 非破坏性提示，不会拦 promote）：`);
  for (const d of dups) {
    if (d.kind === 'same-id') {
      console.warn(
        `- [${d.id}] 同 id 撞号：active「${d.active_title}」(${d.active_file}) vs archived「${d.archived_title ?? ''}」(${d.archived_file ?? ''})${d.identical ? '（内容一致）' : '（内容不同=两种需求撞了同号，走独立迁移）'}`,
      );
    } else if (d.kind === 'similar-title') {
      const pct = Math.round((d.similarity ?? 0.8) * 100);
      const target = d.archived_file ? `${d.archived_file}「${d.archived_title ?? ''}」` : `${d.active_file}「${d.active_title}」`;
      console.warn(
        `- [${d.id}] 相似标题预警（相似度 ${pct}%）：当前「${d.active_title}」 vs ${target}——请核实是否为同质需求`,
      );
    } else if (d.archived_file) {
      console.warn(
        `- [${d.id}] 同标题已归档：当前「${d.active_title}」 vs ${d.archived_file}「${d.archived_title ?? ''}」——可能已做过，确认不是真新需求后再 promote`,
      );
    } else {
      console.warn(
        `- [${d.id}] 同标题现存：当前「${d.active_title}」 vs ${d.active_file}「${d.active_title}」——建议合并/skip 其一`,
      );
    }
  }
  if (!item.evidence.decision_brief) {
    item.evidence.decision_brief = `R-352 去重提示（${today()}）：检测到 ${dups.length} 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。`;
    await writeBacklogItem(cwd, item);
  }
  return true;
}

export async function backlogPromote(options: BacklogCommandOptions): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error('docpath backlog promote requires <id>');
  }

  const current = await readCurrentState(options.cwd);
  const activeTaskExists = current && current.phase !== 'idle' && current.phase !== 'completed';

  const item = await readBacklogItem(options.cwd, options.id.trim());
  if (!item) {
    throw new Error(`docpath backlog promote: backlog 条目不存在: ${options.id}`);
  }

  if (item.links.task) {
    throw new Error(`docpath backlog promote: backlog 条目 ${item.id} 已关联任务 ${item.links.task}`);
  }

  await assertNotActiveInOtherWorktrees(options.cwd, item.id);

  // R-352：promote 前重复登记探测——只报告不拦（含同 id 撞号 R-321/FR-2 与同标题）
  await warnOnDuplicateRegistration(options.cwd, item);

  const dirtyReport = detectDirtyWorktree(options.cwd);
  const isDirty = dirtyReport.isGitRepo && dirtyReport.files.some(f => !isPromoteBacklogEvidencePath(f, item.id));

  let inWorktree = false;
  let worktreePath = options.cwd;

  const isInteractive = process.stdout.isTTY && !options.nonInteractive;

  if (!options.adopt && activeTaskExists && isInteractive) {
    const safeWtName = `wt-${item.id.toLowerCase()}`;
    const paths = await resolveWorktreePaths(options.cwd, safeWtName);
    worktreePath = paths.worktreePath;
    inWorktree = true;

    console.warn(`\n⚠️  检测到当前已有活跃任务进行中，自动启动隔离开发区 (Git Worktree)...`);
    
    await worktreeCommand({
      action: 'create',
      name: safeWtName,
      cwd: options.cwd,
    });

    options.cwd = worktreePath;
  } else {
    if (activeTaskExists && !options.adopt) {
      throw new Error(`docpath backlog promote: 当前已有活跃任务（phase=${current.phase}），请先 done，或用 docpath task abort/reset 显式清理当前任务`);
    }
    if (!options.adopt) {
      assertCleanWorktreeForNewTask(options.cwd, 'docpath backlog promote', {
        allowDirtyPath: (path) => isPromoteBacklogEvidencePath(path, item.id),
      });
    } else {
      console.log(`📦  已启用 --adopt 模式：就地认领当前工作区变更并启动任务`);
    }
  }

  assertBacklogReadyForExecution(item, 'promote', options.draft, options.cwd);

  const docpathDir = await resolveDocpathDir(options.cwd);
  const nextStatus = transitionBacklog(item.status, 'active');
  const taskId = generateUniqueTaskId(docpathDir, item.title);

  const aliasBackup = await backupCurrentTaskAlias(docpathDir);
  await clearCurrentTaskAlias(docpathDir);

  const specContent = renderPromotedSpec(item, taskId, options.cwd);
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  item.status = nextStatus;
  item.links.task = taskId;
  item.links.spec = canonicalTaskRelativePath(taskId, 'spec.md');
  await writeBacklogItem(options.cwd, item);
  await refreshBacklogIndex(options.cwd);
  // R-338: 创建期风险评估（文本信号：标题 + backlog 正文），落盘 state.risk_tier
  const riskPolicy = riskPolicyFromConfig(await readRiskPolicyConfig(options.cwd));
  const riskVerdict = evaluateTaskRisk({ text: `${item.title}\n${item.body}`, policy: riskPolicy });

  await transitionWorkflow(options.cwd, 'task.created', {
    taskId,
    taskTitle: item.title,
    backlogId: item.id,
    level: item.level,
    workflowProfile: 'standard',
    riskTier: riskVerdict.tier,
    currentStep: `backlog promote ${item.id} 完成，下一步: docpath plan`,
  });

  console.log(`✅  已 promote backlog 条目: ${item.id}`);
  console.log(`   task_id: ${taskId}`);
  console.log(`   risk: ${riskTierName(riskVerdict.tier)}${riskVerdict.reasons.length > 0 ? `（${riskVerdict.reasons.join('；')}）` : ''}`);
  console.log(`   spec: .docpath/${canonicalTaskRelativePath(taskId, 'spec.md')}`);
  console.log(`   spec_seed: 已预填 backlog 背景/FR/AC/evidence —— 请在 seed 上增量修订，write-spec 全量重写仅用于推倒重来`);
  console.log(`   truth_sync: ${SPEC_TRUTH_SYNC_HINT}`);
  if (item.level <= 1) {
    console.log('   ⚡ level-1 提示: 可直接 docpath go --step S1（免 plan 直达单步计划, R-306）；下次微小改动可用 docpath quick（R-310）');
  }
  if (aliasBackup) {
    console.log(`   previous_current_backup: ${aliasBackup.backupDir}`);
    console.log(`   backup_files: ${aliasBackup.files.join(', ')}`);
  }

  if (inWorktree) {
    const parentRoot = dirtyReport.repoRoot || options.cwd;
    const relWorktreePath = relative(parentRoot, worktreePath);
    console.log(`\n🌳  自动隔离工作区已就绪！请立刻切换目录以执行后续命令：`);
    console.log(`    cd ${relWorktreePath}`);
    console.log(`    docpath next --agent\n`);
  } else {
    await emitNextHint(options.cwd);
  }
}
