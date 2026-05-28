/**
 * docpath:reveal — 渐进式上下文披露
 *
 * 按 level 0-3 逐步披露项目上下文，让 AI agent 只消费需要的信息。
 *
 * Level 0 — Micro:   项目名 + 当前任务 + 下一步（~100 tokens）
 * Level 1 — Brief:   + 阶段概览 + 阻塞项 + spec 摘要（~500 tokens）
 * Level 2 — Standard: + 架构 + 决策 + 依赖 + style 规则（~2000 tokens）
 * Level 3 — Full:    + 全量文档 + journal + harness + 完整历史（~8000 tokens）
 *
 * 设计理念：
 *   AI 不需要一次性读完所有文档。渐进式披露让 agent 按需获取上下文，
 *   从"最小可行上下文"开始，遇到阻塞时再升级 level。
 */

import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd } from '../utils/workspace.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';

interface RevealOptions {
  cwd: string;
  /** 披露级别 0-3（默认 1） */
  level?: number;
  /** 输出格式：text（默认）| raw */
  format?: 'text' | 'raw';
  /** 输出到文件 */
  output?: string;
}

// ── 辅助函数 ──

function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const ascii = text.length - cjk;
  return Math.ceil(cjk * 1.5 + ascii / 4);
}

function header(emoji: string, title: string): string {
  return `${emoji}  ${title}\n${'─'.repeat(title.length * 2 + 4)}`;
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

/** 从 markdown 中提取前 N 行（跳过标题行后的摘要） */
function firstNLines(text: string, n: number): string {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.slice(0, n).join('\n');
}

/** 从 spec.md 提取摘要（去掉元数据块，取前 10 行正文） */
function specSummary(text: string): string {
  // 跳过开头的 metadata yaml block
  const afterMeta = text.replace(/^---[\s\S]*?---\s*\n?/, '');
  // 跳过第一个 # 标题
  const afterTitle = afterMeta.replace(/^#\s+.+\n?/, '');
  return firstNLines(afterTitle.trim(), 10);
}

/** 从 plan.md 提取进度摘要 */
function planSummary(text: string): string {
  const lines = text.split('\n');
  const taskLines = lines.filter(l => /^- \[[ x]\]/.test(l));
  if (taskLines.length === 0) return '';

  const done = taskLines.filter(l => l.includes('[x]')).length;
  const total = taskLines.length;
  const nextTask = taskLines.find(l => l.includes('[ ]'));

  let summary = `进度: ${done}/${total} 完成`;
  if (nextTask) {
    summary += `\n下一步: ${nextTask.replace(/^- \[[ ]\]\s*/, '')}`;
  }
  return summary;
}

// ── 核心命令 ──

export async function revealCommand(options: RevealOptions): Promise<void> {
  const { cwd, level = 1, format = 'text', output } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  if (level < 0 || level > 3) {
    console.error('❌  level 范围: 0-3');
    process.exit(1);
  }

  const sections: string[] = [];
  const budgets: Record<number, number> = {
    0: 100,
    1: 500,
    2: 2000,
    3: 8000,
  };
  const budget = budgets[level] ?? budgets[1];

  // ══════════════════════════════════════════
  // Level 0 — Micro: 项目 + 任务 + 下一步
  // ══════════════════════════════════════════
  const current = await readCurrentMd(cwd);
  if (current) {
    const projectName = cwd.split('/').pop() || 'unknown';
    sections.push(
      header('📍', '当前状态') + '\n' +
      `项目: ${projectName}\n` +
      `状态: ${current.state} | 阶段: ${current.phase || 'null'}${current.current_step ? ` | 子任务: ${current.current_step}` : ''}\n` +
      `任务: ${current.task_id} — ${current.task_title}\n` +
      `级别: Level ${current.level}`
    );

    // Level 0: 只显示最后一条 breadcrumb
    if (level === 0) {
      const bc = await readBreadcrumb(cwd);
      if (bc.entries.length > 0) {
        const last = bc.entries[bc.entries.length - 1];
        sections.push(`\n上一步: [${last.status}] ${last.step} — ${last.context}`);
      }
    }
  }

  // ══════════════════════════════════════════
  // Level 1 — Brief: + 阶段 + 阻塞 + 摘要
  // ══════════════════════════════════════════
  if (level >= 1) {
    // Breadcrumb 最近 5 条
    const bc = await readBreadcrumb(cwd);
    if (bc.entries.length > 0) {
      const recent = bc.entries.slice(-5);
      const bcLines = recent.map(e => {
        const emoji = e.status === 'done' ? '✅' : e.status === 'in_progress' ? '🔄' : '🚫';
        return `  ${emoji} ${e.step}: ${e.context}`;
      });
      sections.push(
        header('📋', '最近进度') + '\n' +
        bcLines.join('\n') + '\n' +
        `  完成: ${bc.done}/${bc.total} | 进行中: ${bc.inProgress} | 阻塞: ${bc.blocked}`
      );
    }

    // Spec 摘要
    const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
    if (existsSync(specPath)) {
      const spec = await safeRead(specPath);
      if (spec) {
        sections.push(
          header('📐', '需求摘要 (spec)') + '\n' +
          specSummary(spec)
        );
      }
    }

    // Plan 进度
    const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
    if (existsSync(planPath)) {
      const plan = await safeRead(planPath);
      if (plan) {
        sections.push(
          header('🗺️', '执行计划 (plan)') + '\n' +
          planSummary(plan)
        );
      }
    }
  }

  // ══════════════════════════════════════════
  // Level 2 — Standard: + 架构 + style + 文档索引
  // ══════════════════════════════════════════
  if (level >= 2) {
    // Style 规则
    const stylePath = join(docpathDir, 'workspace', 'style.md');
    if (existsSync(stylePath)) {
      const style = await safeRead(stylePath);
      if (style.trim()) {
        sections.push(
          header('📏', '编码规范 (style)') + '\n' +
          style.trim()
        );
      }
    }

    // Architecture（如果存在）
    const archPath = join(cwd, 'spec', 'architecture.md');
    if (existsSync(archPath)) {
      const arch = await safeRead(archPath);
      if (arch.trim()) {
        sections.push(
          header('🏗️', '架构 (architecture)') + '\n' +
          firstNLines(arch, 30)
        );
      }
    }

    // 文档索引 (docs.md)
    const docsPath = join(docpathDir, 'docs.md');
    if (existsSync(docsPath)) {
      const docs = await safeRead(docsPath);
      if (docs.trim()) {
        sections.push(
          header('📚', '文档索引 (docs.md)') + '\n' +
          docs.trim()
        );
      }
    }
  }

  // ══════════════════════════════════════════
  // Level 3 — Full: + journal + harness + 完整历史
  // ══════════════════════════════════════════
  if (level >= 3) {
    // Harness 规则
    const harnessPath = join(docpathDir, 'workspace', 'harness.md');
    if (existsSync(harnessPath)) {
      const harness = await safeRead(harnessPath);
      if (harness.trim()) {
        sections.push(
          header('🛡️', '工作流护栏 (harness)') + '\n' +
          harness.trim()
        );
      }
    }

    // Journal 经验
    const journalDir = join(docpathDir, 'workspace', 'journal');
    if (existsSync(journalDir)) {
      try {
        const files = await readdir(journalDir);
        const mdFiles = files.filter(f => f.endsWith('.md')).sort();
        if (mdFiles.length > 0) {
          const journalEntries: string[] = [];
          for (const f of mdFiles.slice(-5)) { // 最近 5 篇
            const content = await safeRead(join(journalDir, f));
            if (content.trim()) {
              journalEntries.push(`### ${f}\n${firstNLines(content, 15)}`);
            }
          }
          if (journalEntries.length > 0) {
            sections.push(
              header('📓', '经验库 (journal)') + '\n' +
              journalEntries.join('\n\n')
            );
          }
        }
      } catch { /* ignore */ }
    }

    // 完整 breadcrumb 历史
    const bc = await readBreadcrumb(cwd);
    if (bc.entries.length > 5) {
      const allLines = bc.entries.map(e => {
        const emoji = e.status === 'done' ? '✅' : e.status === 'in_progress' ? '🔄' : '🚫';
        return `  ${emoji} ${e.step}: ${e.context}`;
      });
      sections.push(
        header('📜', '完整执行历史') + '\n' +
        allLines.join('\n')
      );
    }

    // 完整 spec + plan
    const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
    if (existsSync(specPath)) {
      const spec = await safeRead(specPath);
      if (spec.trim()) {
        sections.push(
          header('📄', '完整需求规约 (spec)') + '\n' +
          spec.trim()
        );
      }
    }

    const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
    if (existsSync(planPath)) {
      const plan = await safeRead(planPath);
      if (plan.trim()) {
        sections.push(
          header('🗺️', '完整执行计划 (plan)') + '\n' +
          plan.trim()
        );
      }
    }
  }

  // ── 组装输出 ──
  const fullContext = sections.join('\n\n');
  const tokenEst = estimateTokens(fullContext);

  if (format === 'raw') {
    console.log(fullContext);
  } else {
    const levelNames = ['Micro', 'Brief', 'Standard', 'Full'];
    console.log(`\n🔍  DocPath Reveal — Level ${level} (${levelNames[level]})\n`);
    console.log(`📊  估算 token: ~${tokenEst} / ${budget}`);
    console.log(`${'─'.repeat(50)}\n`);
    console.log(fullContext);
    console.log(`\n${'─'.repeat(50)}`);
    if (level < 3) {
      console.log(`💡  使用 --level ${level + 1} 获取更多上下文\n`);
    } else {
      console.log(`💡  已是最高级别，包含全部上下文\n`);
    }
  }

  if (output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(output, fullContext, 'utf-8');
    console.log(`✅  已保存到 ${output}`);
  }
}
