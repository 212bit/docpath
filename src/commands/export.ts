/**
 * docpath:export — 导出工作流状态为可分享的 standalone markdown
 *
 * 包含：状态摘要 + 时间线 + spec/plan 摘要 + 面包屑统计
 * 输出为单个 markdown 文件，方便发送给队友或归档。
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd } from '../utils/workspace.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { LEVEL_NAMES, type ComplexityLevel } from '../engine/state-machine.js';

interface ExportOptions {
  cwd: string;
  /** 输出文件路径（默认 stdout） */
  output?: string;
  /** 是否包含完整 spec/plan（默认只摘要） */
  full?: boolean;
}

/** 时间线可视化 */
function renderTimeline(bc: Awaited<ReturnType<typeof readBreadcrumb>>): string {
  if (bc.entries.length === 0) return '> 暂无进度记录';

  const lines: string[] = [];
  lines.push('```');
  lines.push('进度时间线');
  lines.push('─'.repeat(60));

  for (const entry of bc.entries.slice(-15)) {
    const icon = entry.status === 'done' ? '✅' :
                 entry.status === 'in_progress' ? '🔄' :
                 entry.status === 'blocked' ? '🚫' : '⏭️';
    const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString('zh-CN') : '';
    lines.push(`${icon} ${entry.step.padEnd(10)} [${ts}] ${entry.context.slice(0, 40)}`);
  }

  lines.push('─'.repeat(60));
  lines.push(`完成: ${bc.done}/${bc.total} | 进行中: ${bc.inProgress} | 阻塞: ${bc.blocked}`);
  lines.push('```');

  return lines.join('\n');
}

/** 截取摘要 */
function excerpt(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n\n... [截断]';
}

export async function exportCommand(options: ExportOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  const sections: string[] = [];
  const now = new Date().toLocaleString('zh-CN');

  // ── Header ──
  sections.push(`# 📄 DocPath 项目导出\n\n> 导出时间: ${now}\n> 工具: DocPath v0.1.0 — 文径渐进式工作流 CLI`);

  // ── 状态摘要 ──
  const state = await readCurrentMd(cwd);
  if (state) {
    const levelName = LEVEL_NAMES[state.level as ComplexityLevel] || `L${state.level}`;
    sections.push(`## 📊 当前状态\n\n| 字段 | 值 |\n|------|----|\n| 级别 | L${state.level} — ${levelName} |\n| 状态 | ${state.state} |\n| 任务 | ${state.task_title || state.task_id || '-'} |\n| 阶段 | ${state.phase || '-'} |\n| 开始 | ${state.started_at || '-'} |\n| 更新 | ${state.updated_at || '-'}`);
  } else {
    sections.push(`## 📊 当前状态\n\n> 未初始化`);
  }

  // ── 进度时间线 ──
  const bc = await readBreadcrumb(cwd);
  sections.push(`## 📈 进度时间线\n\n${renderTimeline(bc)}`);

  // ── Spec 摘要 ──
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  if (existsSync(specPath)) {
    const spec = await readFile(specPath, 'utf-8');
    if (options.full) {
      sections.push(`## 📝 需求规约 (完整)\n\n${spec}`);
    } else {
      sections.push(`## 📝 需求规约摘要\n\n${excerpt(spec, 500)}`);
    }
  }

  // ── Plan 摘要 ──
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  if (existsSync(planPath)) {
    const plan = await readFile(planPath, 'utf-8');
    if (options.full) {
      sections.push(`## 📋 执行计划 (完整)\n\n${plan}`);
    } else {
      // 提取 checklist 摘要
      const checklist = plan.match(/- \[[ x]\] .+/g) || [];
      const done = checklist.filter(l => l.includes('[x]')).length;
      sections.push(`## 📋 执行计划摘要\n\n**步骤**: ${checklist.length} 项 | **已完成**: ${done} 项\n\n${checklist.slice(0, 10).join('\n')}${checklist.length > 10 ? '\n...' : ''}`);
    }
  }

  // ── Style 规则 ──
  const stylePath = join(docpathDir, 'workspace', 'style.md');
  if (existsSync(stylePath)) {
    const style = await readFile(stylePath, 'utf-8');
    if (style.trim()) {
      sections.push(`## 🎨 编码规范\n\n${excerpt(style, 300)}`);
    }
  }

  // ── Footer ──
  sections.push(`---\n\n*由 DocPath 导出 — 文径渐进式工作流 CLI*`);

  const output = sections.join('\n\n');

  if (options.output) {
    await writeFile(options.output, output, 'utf-8');
    console.log(`✅  已导出到 ${options.output}`);
    console.log(`📊  大小: ${output.length} 字符, ${bc.entries.length} 条进度记录`);
  } else {
    console.log(output);
  }
}
