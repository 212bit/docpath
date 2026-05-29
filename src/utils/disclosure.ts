/**
 * Progressive Disclosure — 渐进式信息展示
 *
 * 根据 agent 当前阶段和角色，决定展示哪些信息：
 * - 顶层摘要（始终展示）
 * - 详细信息（按需展开）
 * - 深层调试信息（仅在 debug 模式展示）
 *
 * 借鉴 Superpowers 的 structured-reasoning 思路：
 * 将 agent 的 thinking 过程结构化，避免一次性 dump 所有信息。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';

// ── 展示层级 ──

export type DisclosureLevel = 'summary' | 'detail' | 'debug';

export interface DisclosureContext {
  /** 当前 TDD 阶段 */
  phase?: string;
  /** 当前子任务 */
  currentTask?: string;
  /** 展示层级 */
  level: DisclosureLevel;
  /** 额外标签 */
  tags?: string[];
}

// ── 信息片段 ──

export interface DisclosureItem {
  id: string;
  summary: string;
  detail?: string;
  debug?: string;
  tags?: string[];
  /** 最低可见层级 */
  minLevel: DisclosureLevel;
}

const LEVEL_ORDER: DisclosureLevel[] = ['summary', 'detail', 'debug'];

function shouldShow(item: DisclosureItem, ctx: DisclosureContext): boolean {
  const itemLevel = LEVEL_ORDER.indexOf(item.minLevel);
  const ctxLevel = LEVEL_ORDER.indexOf(ctx.level);
  return ctxLevel >= itemLevel;
}

// ── 从 workspace 收集信息 ──

export async function collectDisclosureItems(cwd: string): Promise<DisclosureItem[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const items: DisclosureItem[] = [];

  // 1. state.json — summary
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (existsSync(statePath)) {
    const state = JSON.parse(await readFile(statePath, 'utf-8'));
    items.push({
      id: 'state',
      summary: `Phase: ${state.phase || 'unknown'} | Status: ${state.status || 'unknown'}`,
      detail: JSON.stringify(state, null, 2),
      minLevel: 'summary',
    });
  }

  // 2. plan.md — summary + detail
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  if (existsSync(planPath)) {
    const plan = await readFile(planPath, 'utf-8');
    const lines = plan.split('\n');
    const headings = lines.filter(l => l.startsWith('##') || l.startsWith('###'));
    const unchecked = lines.filter(l => /^- \[ \]/.test(l));
    const checked = lines.filter(l => /^- \[x\]/i.test(l));

    items.push({
      id: 'plan',
      summary: `Plan: ${headings.length} sections, ${checked.length}/${checked.length + unchecked.length} tasks done`,
      detail: plan,
      debug: `Unchecked tasks:\n${unchecked.join('\n')}`,
      minLevel: 'summary',
    });
  }

  // 3. last-check.md — summary + detail
  const checkPath = join(docpathDir, 'workspace', 'last-check.md');
  if (existsSync(checkPath)) {
    const check = await readFile(checkPath, 'utf-8');
    const hasErrors = check.includes('❌') || check.toLowerCase().includes('fail');
    items.push({
      id: 'last-check',
      summary: hasErrors ? '⚠️  Last check has failures' : '✅ Last check passed',
      detail: check,
      tags: hasErrors ? ['needs-attention'] : [],
      minLevel: 'summary',
    });
  }

  // 4. breadcrumb — debug only
  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.json');
  if (existsSync(breadcrumbPath)) {
    const bc = JSON.parse(await readFile(breadcrumbPath, 'utf-8'));
    items.push({
      id: 'breadcrumb',
      summary: `Breadcrumb: ${bc.entries?.length || 0} entries`,
      detail: JSON.stringify(bc, null, 2),
      minLevel: 'detail',
    });
  }

  // 5. context compacted — debug only
  const contextPath = join(docpathDir, 'workspace', 'context.json');
  if (existsSync(contextPath)) {
    try {
      const ctx = JSON.parse(await readFile(contextPath, 'utf-8'));
      items.push({
        id: 'context',
        summary: `Context: ${Array.isArray(ctx) ? ctx.length : 0} messages`,
        debug: JSON.stringify(ctx, null, 2).slice(0, 2000),
        minLevel: 'debug',
      });
    } catch { /* ignore */ }
  }

  return items;
}

// ── 渲染输出 ──

export function renderDisclosure(items: DisclosureItem[], ctx: DisclosureContext): string {
  const visible = items.filter(item => shouldShow(item, ctx));
  const lines: string[] = [];

  lines.push(`📋  DocPath Disclosure [${ctx.level.toUpperCase()}]`);
  if (ctx.phase) lines.push(`   Phase: ${ctx.phase}`);
  if (ctx.currentTask) lines.push(`   Task: ${ctx.currentTask}`);
  lines.push('');

  for (const item of visible) {
    lines.push(`── ${item.id} ──`);
    lines.push(item.summary);

    if (ctx.level !== 'summary' && item.detail) {
      lines.push('');
      lines.push(item.detail);
    }

    if (ctx.level === 'debug' && item.debug) {
      lines.push('');
      lines.push('[DEBUG]');
      lines.push(item.debug);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── CLI 命令 ──

interface DisclosureOptions {
  cwd: string;
  level?: string;
}

export async function disclosureCommand(options: DisclosureOptions): Promise<void> {
  const level = (options.level || 'summary') as DisclosureLevel;
  if (!LEVEL_ORDER.includes(level)) {
    console.error(`❌  无效层级: ${level}。可选: ${LEVEL_ORDER.join(', ')}`);
    process.exit(1);
  }

  const items = await collectDisclosureItems(options.cwd);
  const docpathDir = await resolveDocpathDir(options.cwd);

  let phase: string | undefined;
  const statePath = join(docpathDir, 'workspace', 'state.json');
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(await (await import('fs/promises')).readFile(statePath, 'utf-8'));
      phase = state.phase;
    } catch { /* ignore */ }
  }

  const output = renderDisclosure(items, { level, phase });
  console.log(output);
}
