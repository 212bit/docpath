/**
 * AI 纪律增强 — continuation.ts
 *
 * 检测 agent 是否需要继续执行：
 * - 读取 plan.md，检查是否有未完成子任务 (unchecked [ ])
 * - 读取 last-check.md，检查是否有未修复的 issue
 * - 输出建议：继续 / 完成 / 需要人工介入
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { readLastCheckMarkdown } from '../utils/workspace-evidence.js';
import { readActiveTaskFile } from '../utils/task-files.js';

// ── 结果接口 ──

export interface ContinuationDecision {
  action: 'continue' | 'done' | 'blocked' | 'needs_input';
  reason: string;
  pendingTasks: string[];
  failedChecks: string[];
  suggestion: string;
}

// ── 分析 ──

export async function analyzeContinuation(cwd: string): Promise<ContinuationDecision> {
  const docpathDir = await resolveDocpathDir(cwd);

  // 1. 解析 plan 中的未完成子任务（优先从 plan.json 机器真源获取）
  const pendingTasks: string[] = [];
  const planContent = await readActiveTaskFile(docpathDir, undefined, 'plan.md');

  if (planContent.trim()) {
    const uncheckedRegex = /^- \[ \] (.+)$/gm;
    let match;
    while ((match = uncheckedRegex.exec(planContent)) !== null) {
      pendingTasks.push(match[1].trim());
    }
  }

  // 2. 解析 JSON-first last-check 证据中的失败项
  const failedChecks: string[] = [];

  const checkContent = await readLastCheckMarkdown(docpathDir);
  if (checkContent.trim()) {
    // 匹配 ❌ 或 FAILED 或 FAIL 的行
    const failRegex = /^(.*(?:❌|FAILED?|FAIL).*)$/gmi;
    let match;
    while ((match = failRegex.exec(checkContent)) !== null) {
      failedChecks.push(match[1].trim());
    }
  }

  // 3. 决策逻辑
  if (pendingTasks.length === 0 && failedChecks.length === 0) {
    return {
      action: 'done',
      reason: '所有子任务已完成，无失败检查项。',
      pendingTasks: [],
      failedChecks: [],
      suggestion: '运行 `docpath journal` 归档当前任务。',
    };
  }

  if (failedChecks.length > 0) {
    return {
      action: 'blocked',
      reason: `${failedChecks.length} 项检查失败，需要修复后才能继续。`,
      pendingTasks,
      failedChecks,
      suggestion: `修复以下失败项后重试:\n${failedChecks.map(f => `  - ${f}`).join('\n')}`,
    };
  }

  if (pendingTasks.length > 0) {
    return {
      action: 'continue',
      reason: `还有 ${pendingTasks.length} 个子任务未完成。`,
      pendingTasks,
      failedChecks: [],
      suggestion: `继续执行下一个子任务: ${pendingTasks[0]}`,
    };
  }

  return {
    action: 'needs_input',
    reason: '无法自动判断，请人工检查。',
    pendingTasks,
    failedChecks,
    suggestion: '请检查 plan.md 和 last-check.md 的状态。',
  };
}

// ── CLI 命令 ──

export async function continuationCommand(options: { cwd: string }): Promise<void> {
  const decision = await analyzeContinuation(options.cwd);

  const icons = { continue: '🔄', done: '✅', blocked: '🚫', needs_input: '❓' };

  console.log(`\n${icons[decision.action]}  Continuation Decision: ${decision.action.toUpperCase()}\n`);
  console.log(`  原因: ${decision.reason}`);

  if (decision.pendingTasks.length > 0) {
    console.log(`\n  📋 待完成任务 (${decision.pendingTasks.length}):`);
    decision.pendingTasks.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
  }

  if (decision.failedChecks.length > 0) {
    console.log(`\n  ❌ 失败检查项 (${decision.failedChecks.length}):`);
    decision.failedChecks.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
  }

  console.log(`\n  💡  ${decision.suggestion}\n`);
}
