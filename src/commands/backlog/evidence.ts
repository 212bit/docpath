/**
 * docpath backlog — 证据字段与可执行成熟度门禁
 */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { BacklogEvidence, BacklogItem, BacklogReadiness } from '../../engine/backlog.js';
import type { BacklogCommandOptions } from './types.js';
import { getMarkdownSection, isPlaceholderBody, isPlaceholderValue } from './markdown.js';

export function hasEvidenceOptions(options: BacklogCommandOptions): boolean {
  return Boolean(
    options.evidenceBrainstorm?.trim()
    || options.evidenceAnalysis?.trim()
    || options.evidenceSpec?.trim()
    || options.evidenceDecision?.trim()
    || options.userConfirmed?.trim()
  );
}

export function buildEvidence(options: BacklogCommandOptions, existing?: BacklogEvidence): BacklogEvidence {
  return {
    brainstorm: options.evidenceBrainstorm?.trim() || existing?.brainstorm || null,
    analysis: options.evidenceAnalysis?.trim() || existing?.analysis || null,
    spec: options.evidenceSpec?.trim() || existing?.spec || null,
    decision_brief: options.evidenceDecision?.trim() || existing?.decision_brief || null,
    user_confirmed: options.userConfirmed?.trim() || existing?.user_confirmed || null,
  };
}

export function readinessRank(readiness: BacklogReadiness): number {
  return ['raw', 'shaped', 'analyzed', 'confirmed'].indexOf(readiness);
}

/**
 * FR-5：evidence 引用是否「像文件路径」。凡含路径分隔符（`/` 或 `\`）即视为文件路径引用，
 * 必须能解析到真实文件；纯文本标注（如 "spec decision"/"R-260 plan exercise"，无分隔符）
 * 不做存在性校验，避免误拒自由文本 evidence。
 */
function evidencePathLike(ref: string): boolean {
  return /[/\\]/.test(ref);
}

/**
 * 收集引用了真实文件但文件不存在的 evidence 字段（FR-5，AC-1#4）。
 * 解析基准：相对路径按 cwd 解析（evidence 惯例为 `.docpath/...` 或 `analysis/...` 相对条目目录）；
 * 绝对路径直接判。user_confirmed 恒为自由文本，不参与文件校验。
 */
function danglingEvidenceRefs(item: BacklogItem, cwd: string): Array<{ field: string; ref: string }> {
  const candidates: Array<[string, string | null]> = [
    ['analysis', item.evidence.analysis],
    ['spec', item.evidence.spec],
    ['decision_brief', item.evidence.decision_brief],
    ['brainstorm', item.evidence.brainstorm],
  ];
  const dangling: Array<{ field: string; ref: string }> = [];
  for (const [field, ref] of candidates) {
    if (!ref || !evidencePathLike(ref)) continue;
    const resolved = isAbsolute(ref) ? ref : resolve(cwd, ref);
    if (!existsSync(resolved)) dangling.push({ field, ref });
  }
  return dangling;
}

function missingReadinessEvidence(item: BacklogItem, cwd: string, checkFiles = false): string[] {
  const issues: string[] = [];
  const bg = getMarkdownSection(item.body, '背景');
  const ac = getMarkdownSection(item.body, '验收');
  if (bg !== null || ac !== null) {
    if (isPlaceholderValue(bg)) {
      issues.push('`## 背景` 章节正文为空或包含占位内容');
    }
    if (isPlaceholderValue(ac)) {
      issues.push('`## 验收` 章节正文为空或包含占位内容');
    }
  } else {
    if (isPlaceholderBody(item.body)) {
      issues.push('正文仍为空或包含占位内容');
    }
  }
  if (item.level >= 2 && readinessRank(item.readiness) < readinessRank('analyzed')) {
    issues.push(`level ${item.level} 条目 readiness=${item.readiness}，至少需要 analyzed`);
  }
  if (item.level >= 2 && !item.evidence.analysis && !item.evidence.spec && item.readiness !== 'confirmed') {
    issues.push('缺少 evidence.analysis 或 evidence.spec');
  }
  if (item.level >= 3 && readinessRank(item.readiness) < readinessRank('confirmed')) {
    issues.push(`level ${item.level} 条目 readiness=${item.readiness}，至少需要 confirmed`);
  }
  if (item.level >= 3 && !item.evidence.decision_brief) {
    issues.push('缺少 evidence.decision_brief');
  }
  if (item.level >= 3 && !item.evidence.user_confirmed) {
    issues.push('缺少 evidence.user_confirmed');
  }
  if (checkFiles) {
    // FR-5：promote 门禁额外校验「路径型 evidence 引用必须解析到真实文件」
    for (const { field, ref } of danglingEvidenceRefs(item, cwd)) {
      issues.push(`evidence.${field} 引用文件不存在: ${ref}`);
    }
  }
  return issues;
}

export function assertBacklogReadyForExecution(item: BacklogItem, action: 'accept' | 'plan' | 'promote', skipCheck = false, cwd = process.cwd()): void {
  if (skipCheck) return;
  // FR-5：文件存在性校验仅在 promote 门禁启用（accept/plan 看成熟度，不看引用文件真实存在）
  const issues = missingReadinessEvidence(item, cwd, action === 'promote');
  if (issues.length === 0) return;
  throw new Error([
    `docpath backlog ${action}: backlog 条目 ${item.id} 尚未达到可执行成熟度`,
    ...issues.map((issue) => `- ${issue}`),
    `修复建议(首选): docpath backlog edit ${item.id} --body-file <path> --readiness analyzed --evidence-analysis <path>`,
    `  （capture 生成的占位正文只有 --body-file 全量重写才能通过成熟度检查；`,
    `    --background/--acceptance 不替换占位段, 仅适用于正文已成型的增补）`,
    item.level >= 3
      ? `level 3 还需: --readiness confirmed --evidence-decision <ref> --user-confirmed <text>`
      : '',
  ].filter(Boolean).join('\n'));
}
