/**
 * docpath:stats — 项目统计面板
 *
 * 从 journal.md + breadcrumb + spec/plan 提取统计信息，
 * 输出可视化面板：任务数、完成率、级别分布、耗时统计。
 */

import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { readCurrentMd } from '../utils/workspace.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { LEVEL_NAMES, type ComplexityLevel } from '../engine/state-machine.js';

interface StatsOptions {
  cwd: string;
  /** 输出格式：table(默认) | json */
  format?: 'table' | 'json';
  /** Agent 可读 YAML 输出 */
  agent?: boolean;
}

interface ProjectStats {
  /** 当前状态 */
  current: {
    level: number | null;
    state: string;
    taskTitle: string;
  };
  /** 面包屑统计 */
  breadcrumb: {
    total: number;
    done: number;
    inProgress: number;
    blocked: number;
  };
  /** Journal 统计 */
  journal: {
    entries: number;
    totalChars: number;
  };
  /** 文件统计 */
  files: {
    hasSpec: boolean;
    hasPlan: boolean;
    hasStyle: boolean;
    hasJournal: boolean;
  };
  /** 时间统计 */
  timing: {
    firstEntry: string | null;
    lastEntry: string | null;
    durationMinutes: number | null;
  };
}

/** 从 journal 文件中统计条目数 */
async function countJournalEntries(cwd: string, docpathDir: string): Promise<{ entries: number; totalChars: number }> {
  const journalDir = join(docpathDir, 'workspace', 'journal');
  const journalFile = join(docpathDir, 'workspace', 'journal.md');

  let totalChars = 0;
  let entries = 0;

  try {
    // Try directory first
    if (existsSync(journalDir)) {
      const files = await readdir(journalDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      entries = mdFiles.length;
      for (const f of mdFiles) {
        const content = await readFile(join(journalDir, f), 'utf-8');
        totalChars += content.length;
      }
    } else if (existsSync(journalFile)) {
      const content = await readFile(journalFile, 'utf-8');
      totalChars = content.length;
      // Count ### headings as entries
      entries = (content.match(/^### /gm) || []).length || 1;
    }
  } catch { /* empty */ }

  return { entries, totalChars };
}

/** 进度条 */
function progressBar(ratio: number, width: number = 20): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export async function statsCommand(options: StatsOptions): Promise<void> {
  const { cwd } = options;

  if (options.agent) {
    const { generateAgentOutput } = await import('../utils/agent-output.js');
    process.stdout.write(await generateAgentOutput(cwd));
    return;
  }

  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  // ── 收集数据 ──
  const state = await readCurrentMd(cwd);
  const bc = await readBreadcrumb(cwd);
  const journal = await countJournalEntries(cwd, docpathDir);

  const hasSpec = existsSync(join(docpathDir, 'tasks', 'current', 'spec.md'));
  const hasPlan = existsSync(join(docpathDir, 'tasks', 'current', 'plan.md'));
  const hasStyle = existsSync(join(docpathDir, 'workspace', 'style.md'));
  const hasJournal = journal.entries > 0;

  // 时间统计
  const timestamps = bc.entries
    .map(e => e.timestamp ? new Date(e.timestamp).getTime() : 0)
    .filter(t => t > 0)
    .sort();

  let durationMinutes: number | null = null;
  if (timestamps.length >= 2) {
    durationMinutes = Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60000);
  }

  const stats: ProjectStats = {
    current: {
      level: state?.level ?? null,
      state: state?.state || 'unknown',
      taskTitle: state?.task_title || '-',
    },
    breadcrumb: {
      total: bc.total,
      done: bc.done,
      inProgress: bc.inProgress,
      blocked: bc.blocked,
    },
    journal,
    files: { hasSpec, hasPlan, hasStyle, hasJournal },
    timing: {
      firstEntry: timestamps.length > 0 ? new Date(timestamps[0]).toLocaleString('zh-CN') : null,
      lastEntry: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toLocaleString('zh-CN') : null,
      durationMinutes,
    },
  };

  // ── 输出 ──
  if (options.format === 'json') {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`\n📊  DocPath 项目统计\n`);

  // 当前状态
  const levelName = state ? LEVEL_NAMES[state.level as ComplexityLevel] || `L${state.level}` : '-';
  console.log(`┌─ 当前状态 ─────────────────────────────┐`);
  console.log(`│  级别:    L${stats.current.level ?? '?'} — ${levelName.padEnd(20)}       │`);
  console.log(`│  状态:    ${stats.current.state.padEnd(28)}       │`);
  console.log(`│  任务:    ${stats.current.taskTitle.slice(0, 28).padEnd(28)}       │`);
  console.log(`└────────────────────────────────────────┘`);

  // 链接状态
  try {
    const configPath = join(docpathDir, 'config.yaml');
    if (existsSync(configPath)) {
      const configContent = await readFile(configPath, 'utf-8');
      const match = configContent.match(/^linkedTo:\s*(.+)$/m);
      if (match) {
        console.log(`\n🔗  已关联: ${match[1].trim()}`);
      }
    }
  } catch { /* no linked project */ }

  // 完成率
  const completionRate = bc.total > 0 ? bc.done / bc.total : 0;
  console.log(`\n📈  进度: ${progressBar(completionRate)} ${(completionRate * 100).toFixed(0)}%`);
  console.log(`   完成: ${bc.done}/${bc.total}  进行中: ${bc.inProgress}  阻塞: ${bc.blocked}`);

  // 文件清单
  console.log(`\n📁  文件:`);
  console.log(`   ${hasSpec ? '✅' : '❌'} spec.md    ${hasPlan ? '✅' : '❌'} plan.md`);
  console.log(`   ${hasStyle ? '✅' : '❌'} style.md   ${hasJournal ? '✅' : '❌'} journal`);

  // Journal
  console.log(`\n📖  Journal: ${journal.entries} 条记录, ${journal.totalChars} 字符`);

  // 时间
  if (stats.timing.durationMinutes !== null) {
    console.log(`\n⏱️  耗时: ${stats.timing.durationMinutes} 分钟`);
    console.log(`   首条: ${stats.timing.firstEntry}`);
    console.log(`   末条: ${stats.timing.lastEntry}`);
  }

  console.log('');
}
