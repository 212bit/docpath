/**
 * scan-existing architecture.md 生成 (FR-2 + FR-6 / S3)
 *
 * 组合 S2 的目录树扫描 (scanProjectTree/renderTree) 与 detect.ts 的技术栈探测
 * (detectProject)，生成非模板化的 architecture.md，用于 init --scan-existing。
 *
 * 落盘按 spec §4.b 带保留地初写语义 (FR-6)：
 *   - 目标文件不存在 或 显式 --force → 写入 scan 产物
 *   - 已存在 → 跳过，打印"已存在 architecture.md，跳过；--force 可覆盖"，不读不改既有内容
 *   - 与 learn.ts 的"读+清理+追加"语义零冲突：scan 不覆盖既有 learn/ADR 段落
 *
 * 不带 scan-existing 时 init 不调用本模块 (NFR-1)。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProjectInfo } from './detect.js';
import { detectProject } from './detect.js';
import { scanProjectTree, renderTree } from './scan-existing-tree.js';

const ARCHITECTURE_REL = '.docpath/rules/architecture.md';

export interface WriteArchResult {
  /** written: 写入新产物；skipped: 已存在未覆盖（非 force）；noop: 无内容可写。 */
  outcome: 'written' | 'skipped' | 'noop';
  path: string;
  reason?: string;
}

/**
 * 生成非模板化 architecture.md 正文（直接返回字符串，不落盘）。
 * 若既无目录树又无技术栈信息 → 返回 null（调用方据此 noop）。
 */
export async function buildScanArchitectureContent(cwd: string): Promise<string | null> {
  const [tree, info] = await Promise.all([
    scanProjectTree(cwd),
    detectProject(cwd).catch(() => null as ProjectInfo | null),
  ]);

  const hasTree = (tree.children?.length ?? 0) > 0;
  const hasInfo = !!info && (!!info.language || !!info.framework || !!info.type || !!info.name);
  if (!hasTree && !hasInfo) return null;

  const lines: string[] = [];
  lines.push('# 项目架构');
  lines.push('');
  lines.push('<!-- 此文件由 `docpath init --scan-existing` 初次生成（扫描现有项目）。',
    '后续可由 `docpath learn` 从执行经验回流演化；--scan-existing 在文件已存在时不会覆盖（--force 可强制）。 -->');
  lines.push('');

  lines.push('## 项目概述');
  if (info?.name) {
    lines.push(`- **名称**: ${info.name}`);
  }
  if (info?.language) {
    lines.push(`- **主语言**: ${info.language}`);
  }
  if (info?.type) {
    lines.push(`- **项目类型**: ${info.type}`);
  }
  if (info?.framework) {
    lines.push(`- **框架**: ${info.framework}`);
  }
  if (info?.complexity !== undefined && info.complexity !== null) {
    lines.push(`- **复杂度级别**: ${info.complexity}`);
  }
  if (info?.description) {
    lines.push(`- **描述**: ${info.description}`);
  }
  // 若 info 完全空给一行占位
  if (!info || (!info.name && !info.language && !info.type && !info.framework)) {
    lines.push('- _（未探测到可识别的项目元信息，请补充）_');
  }
  lines.push('');

  if (hasTree) {
    lines.push('## 目录结构');
    lines.push('');
    lines.push('```');
    lines.push(renderTree(tree));
    lines.push('```');
    lines.push('');
    lines.push('> 已排除 node_modules/build/dist/target/.worktrees/coverage 等噪声目录（.gitignore + 硬黑名单）。',
      '树深度与每目录项数有上限，超长部分折叠。');
    lines.push('');
  }

  if (info && (info.language || info.framework || info.type)) {
    lines.push('## 核心技术选型');
    lines.push('');
    lines.push('| 维度 | 值 |');
    lines.push('|------|----|');
    if (info.type) lines.push(`| 项目类型 | ${info.type} |`);
    if (info.language) lines.push(`| 主语言 | ${info.language} |`);
    if (info.framework) lines.push(`| 框架 | ${info.framework} |`);
    lines.push('');
  }

  lines.push('## 架构决策记录 (ADR)');
  lines.push('');
  lines.push('<!-- ADR 在此追加。docpath learn 会从执行经验回流补全；scan-existing 不预填。 -->');
  lines.push('');
  lines.push('### ADR-1: （待补）');
  lines.push('- **日期**: ');
  lines.push('- **状态**: 提案');
  lines.push('- **背景**: ');
  lines.push('- **方案**: ');
  lines.push('- **理由**: ');
  lines.push('- **后果**: ');

  return lines.join('\n');
}

/**
 * 带保留地初写 architecture.md（§4.b / FR-6）。
 * 返回 outcome 供 init 打印准确提示。
 */
export async function writeScanArchitecture(cwd: string, force: boolean): Promise<WriteArchResult> {
  const archPath = join(cwd, ARCHITECTURE_REL);

  if (!force && existsSync(archPath)) {
    return { outcome: 'skipped', path: archPath, reason: '已存在 architecture.md，跳过；--force 可覆盖' };
  }

  const content = await buildScanArchitectureContent(cwd);
  if (!content) {
    return { outcome: 'noop', path: archPath, reason: '未探测到目录结构或项目元信息，跳过 writeScanArchitecture' };
  }

  mkdirSync(dirname(archPath), { recursive: true });
  await writeFile(archPath, content + '\n', 'utf-8');
  return { outcome: 'written', path: archPath };
}

/** 供 init 在 helper 中读取既有内容（§4.b 跳过分支不调用，此处仅暴露以免外部重复实现）。 */
export async function readExistingArchitecture(cwd: string): Promise<string | null> {
  try {
    const p = join(cwd, ARCHITECTURE_REL);
    await readFile(p);
    return p;
  } catch {
    return null;
  }
}
