/**
 * docpath:context — 生成 Claude Code 可消费的上下文包
 *
 * 压缩 current.md + breadcrumb + spec + plan 为单个 prompt-ready blob。
 * 断线重连后一键恢复完整上下文，Claude Code 痛点杀手。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd } from '../utils/workspace.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { resolveDocpathDir } from '../utils/file.js';

interface ContextOptions {
  cwd: string;
  /** 输出格式：prompt（默认）| raw */
  format?: 'prompt' | 'raw';
  /** 最大 token 估算数（默认 8000） */
  maxTokens?: number;
  /** 是否包含 spec */
  withSpec?: boolean;
  /** 是否包含 plan */
  withPlan?: boolean;
  /** 输出到文件 */
  output?: string;
}

/**
 * 粗略 token 估算：中文 ~1.5 token/char, 英文 ~4 char/token
 */
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const ascii = text.length - cjk;
  return Math.ceil(cjk * 1.5 + ascii / 4);
}

/**
 * 压缩 markdown：去除多余空行、注释、重复内容
 */
function compressMarkdown(text: string, maxChars: number): string {
  let result = text
    .replace(/<!--[\s\S]*?-->/g, '')           // 去 HTML 注释
    .replace(/\n{3,}/g, '\n\n')                // 压缩空行
    .replace(/^\s*[-=]{3,}\s*$/gm, '---')      // 简化分隔线
    .trim();

  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '\n\n... [截断，使用 --max-tokens 调整]';
  }
  return result;
}

export async function contextCommand(options: ContextOptions): Promise<void> {
  const { cwd, format = 'prompt', maxTokens = 8000 } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  const maxChars = Math.floor(maxTokens * 3); // 粗略 1 token ≈ 3 chars
  const sections: string[] = [];

  // ── 1. 当前状态 ──
  const state = await readCurrentMd(cwd);
  if (state) {
    sections.push(`## 当前状态\n\`\`\`yaml\nlevel: ${state.level}\nstate: ${state.state}\ntask_id: ${state.task_id}\ntask_title: ${state.task_title}\nphase: ${state.phase}\nstarted_at: ${state.started_at}\nupdated_at: ${state.updated_at}\n\`\`\``);
  }

  // ── 2. 面包屑 ──
  const bc = await readBreadcrumb(cwd);
  if (bc.entries.length > 0) {
    const recent = bc.entries.slice(-10); // 最近 10 条
    const bcLines = recent.map(e =>
      `- [${e.status}] ${e.step} — ${e.context}`
    );
    sections.push(`## 进度追踪 (breadcrumb)\n${bcLines.join('\n')}\n\n**完成**: ${bc.done}/${bc.total}  **进行中**: ${bc.inProgress}  **阻塞**: ${bc.blocked}`);
  }

  // ── 3. Spec ──
  if (options.withSpec !== false) {
    const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
    if (existsSync(specPath)) {
      const spec = await readFile(specPath, 'utf-8');
      sections.push(`## 需求规约 (spec.md)\n${compressMarkdown(spec, Math.floor(maxChars * 0.3))}`);
    }
  }

  // ── 4. Plan ──
  if (options.withPlan !== false) {
    const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
    if (existsSync(planPath)) {
      const plan = await readFile(planPath, 'utf-8');
      sections.push(`## 执行计划 (plan.md)\n${compressMarkdown(plan, Math.floor(maxChars * 0.3))}`);
    }
  }

  // ── 5. Style 规则 ──
  const stylePath = join(docpathDir, 'workspace', 'style.md');
  if (existsSync(stylePath)) {
    const style = await readFile(stylePath, 'utf-8');
    if (style.trim()) {
      sections.push(`## 编码规范 (style.md)\n${compressMarkdown(style, Math.floor(maxChars * 0.2))}`);
    }
  }

  // ── 组装输出 ──
  const fullContext = sections.join('\n\n---\n\n');
  const tokenEst = estimateTokens(fullContext);

  if (format === 'raw') {
    console.log(fullContext);
  } else {
    console.log(`\n📦  DocPath 上下文包\n`);
    console.log(`📊  估算 token: ~${tokenEst} / ${maxTokens}`);
    console.log(`${'─'.repeat(50)}\n`);
    console.log(fullContext);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`💡  复制以上内容粘贴给 Claude Code 即可恢复完整上下文\n`);
  }

  if (options.output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(options.output, fullContext, 'utf-8');
    console.log(`✅  已保存到 ${options.output}`);
  }
}
