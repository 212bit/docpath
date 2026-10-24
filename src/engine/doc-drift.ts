/**
 * doc-drift.ts — 代码变更与活文档漂移智能感知引擎 (Doc Drift Guard & Sync Recommender)
 *
 * 在开发者或 Agent 修改业务代码时，实时感知文档与代码的演进同步状态：
 * 1. 自动探查已修改的源码文件与文档变更
 * 2. 精准推断源码对应的主要承载活文档
 * 3. 检测未同步文档的高危/中危漂移 (Doc Drift)
 * 4. 给出智能补齐建议与段落更新指导
 */

import { runShellSyncOrThrow } from '../utils/run-tool.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { traceDocAndCode, type DocTraceResult } from './doc-trace.js';
import { resolveDocpathDir } from '../utils/file.js';

export interface DocDriftSuggestion {
  path: string;
  title: string;
  score: number;
  suggested_action: string;
}

export interface DocDriftItem {
  code_file: string;
  risk: 'high' | 'medium' | 'low';
  reason: string;
  suggested_docs: DocDriftSuggestion[];
}

export interface DocDriftReport {
  passed: boolean;
  total_changed_code_files: number;
  total_changed_doc_files: number;
  changed_code_files: string[];
  changed_doc_files: string[];
  drifts: DocDriftItem[];
  summary: {
    high_risk_drifts: number;
    medium_risk_drifts: number;
    low_risk_drifts: number;
  };
  agent_hint: string;
}

export interface DetectDocDriftOptions {
  files?: string[];
  staged?: boolean;
  strict?: boolean;
}

/**
 * 获取 Git 当前工作区或暂存区修改的文件列表
 */
export function getChangedFilesFromGit(cwd: string, stagedOnly = false): string[] {
  try {
    const flag = stagedOnly ? '--cached' : 'HEAD';
    // If not a git repo or no commits yet, fallback to status
    const output = runShellSyncOrThrow('git status --porcelain', {
      cwd,
      timeoutMs: 30_000,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
      offline: false,
    });

    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    const files: string[] = [];

    for (const line of lines) {
      const match = line.match(/^([MADRCU?!]{1,2})\s+(.+)$/);
      if (match) {
        let filePath = match[2].trim();
        if (filePath.includes(' -> ')) {
          filePath = filePath.split(' -> ')[1].trim();
        }
        files.push(filePath);
      }
    }

    return Array.from(new Set(files));
  } catch {
    return [];
  }
}

const HIGH_RISK_CODE_PATTERNS = [
  /src\/engine\/(milestone|changelog|agent|check|done|runtime|backlog|worktree)\.ts/i,
  /src\/commands\/(agent|milestone|check|done|start|quick)\.ts/i,
  /AGENTS\.md/i,
];

const MEDIUM_RISK_CODE_PATTERNS = [
  /src\/commands\//i,
  /src\/engine\//i,
  /src\/utils\//i,
];

/**
 * 评估代码文件的文档漂移风险级别
 */
function assessRisk(filePath: string): 'high' | 'medium' | 'low' {
  if (HIGH_RISK_CODE_PATTERNS.some((p) => p.test(filePath))) {
    return 'high';
  }
  if (MEDIUM_RISK_CODE_PATTERNS.some((p) => p.test(filePath))) {
    return 'medium';
  }
  return 'low';
}

/**
 * 检测代码变更与文档漂移
 */
export async function detectDocDrift(
  cwd: string,
  options: DetectDocDriftOptions = {},
): Promise<DocDriftReport> {
  let changedFiles = options.files && options.files.length > 0
    ? options.files
    : getChangedFilesFromGit(cwd, options.staged);

  const changedCodeFiles: string[] = [];
  const changedDocFiles: string[] = [];

  for (const f of changedFiles) {
    const norm = f.replace(/\\/g, '/');
    if (
      norm.endsWith('.md') ||
      norm.startsWith('.docpath/rules/') ||
      norm.startsWith('docs/')
    ) {
      changedDocFiles.push(norm);
    } else if (
      (norm.endsWith('.ts') || norm.endsWith('.js') || norm.endsWith('.mjs')) &&
      !norm.startsWith('tests/') &&
      !norm.endsWith('.test.ts') &&
      !norm.endsWith('.test.mjs')
    ) {
      changedCodeFiles.push(norm);
    }
  }

  const changedDocSet = new Set(changedDocFiles.map((d) => d.toLowerCase()));
  const drifts: DocDriftItem[] = [];

  for (const codeFile of changedCodeFiles) {
    const traceRes: DocTraceResult = await traceDocAndCode(cwd, codeFile);
    const topMatches = traceRes.living_docs.slice(0, 3);

    // 检查顶级相关文档是否在已修改文档集中
    const isCovered = topMatches.some((d) => changedDocSet.has(d.path.toLowerCase()));

    if (!isCovered && topMatches.length > 0) {
      const risk = assessRisk(codeFile);
      const suggestions: DocDriftSuggestion[] = topMatches.map((d) => ({
        path: d.path,
        title: d.title,
        score: d.score,
        suggested_action: `同步更新 ${d.path}，记录 ${codeFile} 的新特性或架构变更`,
      }));

      drifts.push({
        code_file: codeFile,
        risk,
        reason: `修改了代码 ${codeFile}，但关联的核心活文档未在此次变更中维护`,
        suggested_docs: suggestions,
      });
    }
  }

  const highCount = drifts.filter((d) => d.risk === 'high').length;
  const mediumCount = drifts.filter((d) => d.risk === 'medium').length;
  const lowCount = drifts.filter((d) => d.risk === 'low').length;

  const passed = options.strict ? drifts.length === 0 : highCount === 0;

  const agentHint = drifts.length > 0
    ? `检测到 ${drifts.length} 处代码与文档同步漂移。请优先维护推荐的对应活文档，或运行 \`docpath docs sync\` 刷新索引。`
    : '文档与代码变更同步状态良好，无漂移风险。';

  return {
    passed,
    total_changed_code_files: changedCodeFiles.length,
    total_changed_doc_files: changedDocFiles.length,
    changed_code_files: changedCodeFiles,
    changed_doc_files: changedDocFiles,
    drifts,
    summary: {
      high_risk_drifts: highCount,
      medium_risk_drifts: mediumCount,
      low_risk_drifts: lowCount,
    },
    agent_hint: agentHint,
  };
}

/**
 * 渲染终端友好漂移检测报告
 */
export function renderDocDriftReport(report: DocDriftReport): string {
  const lines: string[] = [
    `🌊  DocPath 代码变更与活文档漂移检测 (Doc Drift Guard):`,
    `${'─'.repeat(70)}`,
    `📊  代码变动: ${report.total_changed_code_files} 个文件 | 文档变动: ${report.total_changed_doc_files} 篇 | 漂移告警: ${report.drifts.length} 处`,
    '',
  ];

  if (report.drifts.length === 0) {
    lines.push('✅  【健康】所有修改的代码文件均有对应的活文档同步维护，或无高危漂移！\n');
    return lines.join('\n');
  }

  lines.push('⚠️  发现以下代码与文档未同步漂移项:');
  for (const drift of report.drifts) {
    const riskBadge = drift.risk === 'high' ? '🔴 [高危]' : drift.risk === 'medium' ? '🟡 [中危]' : '⚪ [低危]';
    lines.push(`\n  ${riskBadge} 源码文件: \`${drift.code_file}\``);
    lines.push(`     原因: ${drift.reason}`);
    lines.push('     💡 推荐同步维护的活文档:');
    for (const s of drift.suggested_docs) {
      lines.push(`        - 📄 \`${s.path}\` (${s.title}): ${s.suggested_action}`);
    }
  }

  lines.push(`\n💡  Agent 提示: ${report.agent_hint}\n`);
  return lines.join('\n');
}
