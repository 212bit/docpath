/**
 * 漂移消解域（R-305 拆分自 task-files.ts, 零行为变更）：
 * - healStructuredMarkdownDrift: R-287 方案 A 的 md/json 漂移自愈（四象限方向裁决）
 * - tryThreeWayMerge: current/canonical 双副本内容分歧的 3-way 合并
 * 依赖方向: structured-heal → task-files（单向, 别名/写入原语归 task-files）。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  canonicalTaskDir,
  currentTaskDir,
  writeActiveTaskFile,
  type TaskFileAlias,
} from './task-files.js';
import {
  detectStructuredMarkdownHashDrift,
  enforceStructuredMarkers,
  readStructuredTaskDocument,
  renderStructuredMarkdown,
  type StructuredTaskMarkdownFile,
} from './structured-docs.js';

export interface StructuredHealResult {
  file: StructuredTaskMarkdownFile;
  healed: boolean;
  reason: string;
  /** 勾选态被按 json 真源回写的条目 id */
  enforced_markers: string[];
  /** markdown 侧缺失、按 json 快照恢复或以吸收方式记录的条目 id */
  missing_items: string[];
}

/**
 * R-287 方案 A：spec/plan 的 md/json 漂移自愈（desync 由自愈取代告警）。
 *
 * 三分支策略（零静默丢失）：
 * 1. json 缺失 → 以 markdown 为输入重建 json（吸收）。
 * 2. markdown 完全缺失 json 的已知结构化条目（整体掏空/陈旧视图）→ 视为损坏，
 *    从 json 的 markdown 快照恢复（快照为空则按字段全量渲染）——吸收会把破坏传播进真源。
 * 3. 常规漂移 → 已知条目勾选态按 json 真源回写（marker 强制），markdown 侧新增
 *    内容/叙述保留并经重解析吸收进 json；部分条目在 md 中被删除时保留删除并在
 *    结果中列出（missing_items），由调用方 loud 输出。
 *
 * 注意：写入走 writeActiveTaskFile（canonical+current 双写、json+sha 同步）；
 * 任务身份漂移（identity drift）会在写入层 fail-loud，自愈绝不掩盖身份问题。
 */
export async function healStructuredMarkdownDrift(
  docpathDir: string,
  taskId: string,
  file: StructuredTaskMarkdownFile,
): Promise<StructuredHealResult> {
  const canonicalDir = canonicalTaskDir(docpathDir, taskId);
  const currentDir = currentTaskDir(docpathDir);
  const none: StructuredHealResult = { file, healed: false, reason: 'no-drift', enforced_markers: [], missing_items: [] };

  const [canonicalDrift, currentDrift] = await Promise.all([
    detectStructuredMarkdownHashDrift(canonicalDir, file),
    detectStructuredMarkdownHashDrift(currentDir, file),
  ]);
  if (!canonicalDrift && !currentDrift) return none;

  const currentMdPath = join(currentDir, file);
  const canonicalMdPath = join(canonicalDir, file);
  const [currentDoc, canonicalDoc] = await Promise.all([
    readStructuredTaskDocument(currentDir, file),
    readStructuredTaskDocument(canonicalDir, file),
  ]);
  // 「已验证同步」= json 存在且与同目录 md 的 sha 一致。json 缺失时对应 drift 恒为
  // null，属条件空洞成立，不能当作同步证据——所有方向裁决都必须以 doc 存在为前提。
  const currentVerified = Boolean(currentDoc) && !currentDrift && existsSync(currentMdPath);
  const canonicalVerified = Boolean(canonicalDoc) && !canonicalDrift && existsSync(canonicalMdPath);

  // 规则 1：current 与 canonical 内容互异时按「双侧验证态」四象限裁决——
  //   (canonical 已验证, current 未验证)：canonical 是同步基线、current 承载新编辑 → 吸收 current（进入规则 2）；
  //   其余三种（双未验证 / 仅 current 验证 / 双验证）：canonical 侧可能承载独立编辑或
  //   独立同步态，方向不可裁决 → 交由 check 的 file-drift/3-way 合并机制处理，
  //   自愈不得抢跑覆盖（覆盖会丢失 canonical 侧编辑，或把陈旧内容传播进 json 真源）。
  if (existsSync(currentMdPath) && existsSync(canonicalMdPath)) {
    const [currentContent, canonicalContent] = await Promise.all([
      readFile(currentMdPath, 'utf-8'),
      readFile(canonicalMdPath, 'utf-8'),
    ]);
    if (currentContent !== canonicalContent && !(canonicalVerified && !currentVerified)) {
      return {
        file,
        healed: false,
        reason: 'current 与 canonical 副本内容分歧，交由 file-drift/3-way 合并机制处理',
        enforced_markers: [],
        missing_items: [],
      };
    }
  }

  // 规则 2：以 current 工作别名（最新意图载体）为 md 输入做吸收/恢复。
  const mdPath = existsSync(currentMdPath) ? currentMdPath : canonicalMdPath;
  const markdown = existsSync(mdPath) ? await readFile(mdPath, 'utf-8') : '';
  const jsonDoc = currentDoc ?? canonicalDoc;

  if (!jsonDoc) {
    await writeActiveTaskFile(docpathDir, taskId, file, markdown);
    return { file, healed: true, reason: 'json 真源缺失，已从 markdown 重建', enforced_markers: [], missing_items: [] };
  }

  const { content, enforced, missing, knownCount } = enforceStructuredMarkers(jsonDoc, markdown);

  if (knownCount > 0 && missing.length === knownCount) {
    // 整体掏空视为损坏视图：吸收会把破坏传播进 json（结构化字段与门禁信息全被默认值覆盖），
    // 故按 json 真源字段全量渲染恢复；原 md 剩余文本零丢失地保留在文末小节，由人工取舍。
    const leftover = markdown.trim();
    const restored = renderStructuredMarkdown(jsonDoc)
      + (leftover ? `\n## 自愈保留的原 Markdown 内容\n\n${leftover}\n` : '');
    await writeActiveTaskFile(docpathDir, taskId, file, restored);
    return {
      file,
      healed: true,
      reason: 'markdown 缺失全部结构化条目（陈旧/损坏视图），已按 json 真源恢复；原 markdown 内容保留在文末「自愈保留」小节',
      enforced_markers: [],
      missing_items: missing,
    };
  }

  await writeActiveTaskFile(docpathDir, taskId, file, content);
  const reasonParts = ['已收敛 md/json 漂移'];
  if (enforced.length > 0) reasonParts.push(`勾选态按 json 真源回写: ${enforced.join(', ')}`);
  if (missing.length > 0) reasonParts.push(`markdown 移除的条目已吸收进 json: ${missing.join(', ')}`);
  if (enforced.length === 0 && missing.length === 0) reasonParts.push('markdown 内容变更已吸收进 json');
  return { file, healed: true, reason: reasonParts.join('；'), enforced_markers: enforced, missing_items: missing };
}

export async function tryThreeWayMerge(
  currentPath: string,
  canonicalPath: string,
  file: TaskFileAlias,
): Promise<{ success: boolean; mergedContent: string; conflict: boolean }> {
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const currentContent = await readFile(currentPath, 'utf-8');
  const canonicalContent = await readFile(canonicalPath, 'utf-8');

  // 创建临时文件用作 git merge-file 运算
  const tempCurrent = join(tmpdir(), `dp-merge-current-${Date.now()}-${file}`);
  const tempCanonical = join(tmpdir(), `dp-merge-canonical-${Date.now()}-${file}`);
  const tempBase = join(tmpdir(), `dp-merge-base-${Date.now()}-${file}`);

  writeFileSync(tempCurrent, currentContent, 'utf-8');
  writeFileSync(tempCanonical, canonicalContent, 'utf-8');
  
  // 提取 current 和 canonical 的共同行作为 base
  const currentLines = currentContent.split('\n');
  const canonicalLines = canonicalContent.split('\n');
  const baseLines = currentLines.filter(line => canonicalLines.includes(line));
  const baseContent = baseLines.join('\n');
  writeFileSync(tempBase, baseContent, 'utf-8');

  let conflict = false;
  try {
    // git merge-file <current> <base> <canonical>
    // 如果返回 0，无冲突顺利合并；如果返回非 0 且带正值，表示有冲突但已写入冲突标记
    execFileSync('git', ['merge-file', '--quiet', tempCurrent, tempBase, tempCanonical]);
  } catch (err: any) {
    conflict = true;
  }

  const merged = await readFile(tempCurrent, 'utf-8');

  // 清理临时文件
  try {
    rmSync(tempCurrent, { force: true });
    rmSync(tempCanonical, { force: true });
    rmSync(tempBase, { force: true });
  } catch {
    // 忽略清理失败
  }

  return {
    success: true,
    mergedContent: merged,
    conflict,
  };
}
