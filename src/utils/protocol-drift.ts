/**
 * 仓库根协议文件 ↔ 模板母版 正文一致性门禁（R-462）
 *
 * 背景：block 注入区的一致性已由 syncProtocolBlocks(R-300) 治理；但 block
 * 之外的普通正文（如 R-460 的 next_hint 条款句）在 templates/protocols/ 母版
 * 与仓库根协议文件（AGENTS.md 等）之间没有同步机制，直接导致「模板加了正文、
 * 根没跟上（或反之）」的静默漂移。该门禁对每个 flavor 做正文级 diff：
 *   - 模板独有的正文行（仓根缺）→ 判定漂移，fail-loud（必须修；R-460事故类）；
 *   - 仓根独有的正文行（模板缺）→ 视为可能的有意定制，仅提示，不阻断；
 *   - 仓根若带豁免标记 `<!-- docpath:drift-exempt -->` → 整文件跳过。
 *
 * block 注入区由 R-300 治理，本门禁剔除 block 区，避免判定重叠。
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTemplate } from './install-core.js';
import { PROTOCOL_FLAVORS } from './protocol-blocks.js';

export interface RepoProtocolDriftEntry {
  file: string;
  /** 该文件是否命中「模板有而仓根缺」的判定 */
  drift: boolean;
  /** 豁免标记导致整文件跳过 */
  exempt: boolean;
  /** 模板有而仓根没有的正文行 */
  missingFromRepo: string[];
  /** 仓根有而模板没有的正文行（仅提示，不阻断） */
  extraInRepo: string[];
}

export interface RepoProtocolDriftReport {
  files: RepoProtocolDriftEntry[];
  hasDrift: boolean;
}

const BLOCK_OPEN = /^<!-- ?docpath:block [a-z0-9-]+ -->$/;
const BLOCK_CLOSE = /^<!-- \/docpath:block -->$/;
const DRIFT_EXEMPT_MARK = 'docpath:drift-exempt';

/** 归一化正文行集：替换 PROJECT_NAME 占位、剔除 block 注入区与空行。 */
export function protocolBodyLines(content: string, projectName: string | null): string[] {
  const normalized = projectName ? content.replace(/\{\{PROJECT_NAME\}\}/g, projectName) : content;
  const lines = normalized.split('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!inBlock) {
      if (BLOCK_OPEN.test(trimmed)) {
        inBlock = true;
        continue;
      }
      if (trimmed.length > 0 && trimmed !== DRIFT_EXEMPT_MARK) out.push(trimmed);
      continue;
    }
    if (BLOCK_CLOSE.test(trimmed)) inBlock = false;
  }
  return out;
}

/**
 * 检测仓库根协议文件与模板母版之间的正文漂移。
 * @param repoDir 仓库根（含 AGENTS.md 等 flavor 文件的目录）。
 * @param projectName 项目名（用于替换模板中的 {{PROJECT_NAME}} 占位）。
 */
export async function detectRepoProtocolDrift(
  repoDir: string,
  projectName: string | null,
): Promise<RepoProtocolDriftReport> {
  const files: RepoProtocolDriftEntry[] = [];
  let hasDrift = false;

  for (const flavor of PROTOCOL_FLAVORS) {
    const repoPath = join(repoDir, flavor);
    if (!existsSync(repoPath)) continue; // 该 flavor 未安装到仓库根（如单 target），跳过
    let templatePath: string;
    try {
      templatePath = await resolveTemplate('protocols', flavor);
    } catch {
      continue; // 模板母版缺失（非 DocPath 开发/包内无该 flavor），跳过，不抛错
    }
    if (!existsSync(templatePath)) continue;

    const repoContent = await readFile(repoPath, 'utf-8');
    const tplContent = await readFile(templatePath, 'utf-8');

    if (repoContent.includes(DRIFT_EXEMPT_MARK)) {
      files.push({ file: flavor, drift: false, exempt: true, missingFromRepo: [], extraInRepo: [] });
      continue;
    }

    const repoLines = new Set(protocolBodyLines(repoContent, projectName));
    const tplLines = new Set(protocolBodyLines(tplContent, projectName));

    const missing = [...tplLines].filter((l) => !repoLines.has(l));
    const extra = [...repoLines].filter((l) => !tplLines.has(l));

    const drift = missing.length > 0;
    if (drift) hasDrift = true;

    files.push({ file: flavor, drift, exempt: false, missingFromRepo: missing, extraInRepo: extra });
  }

  return { files, hasDrift };
}