import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface MergeDriverOptions {
  ancestor: string; // %O
  current: string;  // %A
  other: string;    // %B
  path: string;     // %P
  cwd: string;
}

interface ConflictBlock {
  isConflict: boolean;
  ours: string[];
  theirs: string[];
  originalLines: string[];
}

/**
 * 智能三路合并逻辑
 */
export async function mergeDriverCommand(options: MergeDriverOptions): Promise<void> {
  const { ancestor, current, other, path } = options;

  try {
    const ancestorContent = existsSync(ancestor) ? await readFile(ancestor, 'utf-8') : '';
    const currentContent = existsSync(current) ? await readFile(current, 'utf-8') : '';
    const otherContent = existsSync(other) ? await readFile(other, 'utf-8') : '';

    // 1. 如果是 backlog 索引，使用专门的表格合并逻辑
    if (path.replace(/\\/g, '/').endsWith('backlog/backlog.md')) {
      const mergedContent = mergeBacklogIndex(ancestorContent, currentContent, otherContent);
      await writeFile(current, mergedContent, 'utf-8');
      process.exit(0);
    }

    // 2. 对于其他文件，先调用 git merge-file 尝试普通行合并
    let mergeSuccess = false;
    try {
      // git merge-file 会直接修改 current (%A) 文件
      await execFileAsync('git', ['merge-file', '-q', current, ancestor, other]);
      mergeSuccess = true;
    } catch {
      // 存在冲突，git merge-file 会以非 0 状态退出，且已在 current 中插入了冲突标记
      mergeSuccess = false;
    }

    if (mergeSuccess) {
      process.exit(0);
    }

    // 3. 存在冲突，读取已被 git 标记的 current 文件，尝试对列表和表格冲突块进行智能合并
    const conflictedContent = await readFile(current, 'utf-8');
    const lines = conflictedContent.split('\n');
    const blocks = parseConflictBlocks(lines);

    let allResolved = true;
    const resolvedLines: string[] = [];

    for (const block of blocks) {
      if (!block.isConflict) {
        resolvedLines.push(...block.originalLines);
        continue;
      }

      const merged = tryResolveConflictBlock(block);
      if (merged !== null) {
        resolvedLines.push(...merged);
      } else {
        allResolved = false;
        resolvedLines.push(...block.originalLines); // 保留冲突标记
      }
    }

    await writeFile(current, resolvedLines.join('\n'), 'utf-8');

    if (allResolved) {
      console.log(`✅  自动解决冲突: ${path}`);
      process.exit(0);
    } else {
      console.warn(`⚠️  存在无法自动合并的冲突，请手动解决: ${path}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌  合并驱动器执行异常: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * 合并 backlog.md 索引表格
 */
function mergeBacklogIndex(ancestorContent: string, currentContent: string, otherContent: string): string {
  const parseRows = (content: string) => {
    const rows: Record<string, string[]> = {};
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('|') && !line.includes('|----|')) {
        const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => !(arr.length && _ === '' && (i === 0 || i === arr.length - 1)));
        const id = cells[0];
        if (id && /^R-\d+$/i.test(id)) {
          rows[id] = cells;
        }
      }
    }
    return rows;
  };

  const ancestorRows = parseRows(ancestorContent);
  const currentRows = parseRows(currentContent);
  const otherRows = parseRows(otherContent);

  const statusRank = (status: string): number => {
    const ranks: Record<string, number> = {
      done: 5,
      active: 4,
      planned: 3,
      accepted: 2,
      proposed: 1,
      dropped: 0,
    };
    return ranks[status.toLowerCase()] ?? -1;
  };

  const allIds = Array.from(new Set([
    ...Object.keys(currentRows),
    ...Object.keys(otherRows),
  ]));

  const mergedRows: string[][] = [];
  for (const id of allIds) {
    const ours = currentRows[id];
    const theirs = otherRows[id];
    if (ours && !theirs) {
      mergedRows.push(ours);
    } else if (!ours && theirs) {
      mergedRows.push(theirs);
    } else if (ours && theirs) {
      const ourStatus = ours[2] || '';
      const theirStatus = theirs[2] || '';
      const ourRank = statusRank(ourStatus);
      const theirRank = statusRank(theirStatus);

      if (ourRank > theirRank) {
        mergedRows.push(ours);
      } else if (theirRank > ourRank) {
        mergedRows.push(theirs);
      } else {
        const ourTask = ours[5] || '';
        const theirTask = theirs[5] || '';
        if (ourTask && !theirTask) {
          mergedRows.push(ours);
        } else if (!ourTask && theirTask) {
          mergedRows.push(theirs);
        } else {
          mergedRows.push(ours);
        }
      }
    }
  }

  const priorityRank = (p: string) => Number(p.replace(/^P/i, '')) || 2;
  mergedRows.sort((a, b) => {
    const pA = priorityRank(a[3]);
    const pB = priorityRank(b[3]);
    if (pA !== pB) return pA - pB;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });

  const lines = currentContent.split('\n');
  const tableStartIndex = lines.findIndex((l) => l.trim().startsWith('|') && l.includes('id') && l.includes('title'));

  if (tableStartIndex < 0) {
    return generateIndexFromRows(mergedRows);
  }

  const header = lines.slice(0, tableStartIndex + 2);
  let tableEndIndex = tableStartIndex + 2;
  while (tableEndIndex < lines.length && lines[tableEndIndex].trim().startsWith('|')) {
    tableEndIndex++;
  }
  const footer = lines.slice(tableEndIndex);

  const tableBody = mergedRows.map((row) => `| ${row.join(' | ')} |`);

  return [
    ...header,
    ...tableBody,
    ...footer,
  ].join('\n');
}

function generateIndexFromRows(rows: string[][]): string {
  const lines = [
    '# DocPath Backlog Index',
    '',
    '> 自动生成，供 agent / 人类稳定读取。',
    '',
    `> 扫描时间: ${new Date().toISOString()}`,
    '',
    '## 条目列表',
    '',
    '| id | title | status | priority | level | task |',
    '|----|-------|--------|----------|-------|------|',
  ];
  for (const r of rows) {
    lines.push(`| ${r.join(' | ')} |`);
  }
  lines.push(
    '',
    '## 用途说明',
    '',
    '- `id`: backlog 条目标识（R-###）',
    '- `status`: proposed|accepted|planned|active|done|dropped',
    '- `priority`: P0 最高，P3 最低',
    '- `task`: 已 promote 后关联 the task id；未关联为空',
    '- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中',
    '',
  );
  return lines.join('\n');
}

/**
 * 解析 Git 冲突块
 */
function parseConflictBlocks(lines: string[]): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  let inConflict = false;
  let ours: string[] = [];
  let theirs: string[] = [];
  let originalLines: string[] = [];
  let currentSection: 'ours' | 'theirs' | null = null;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      currentSection = 'ours';
      originalLines = [line];
      ours = [];
      theirs = [];
    } else if (line.startsWith('=======')) {
      currentSection = 'theirs';
      originalLines.push(line);
    } else if (line.startsWith('>>>>>>>')) {
      originalLines.push(line);
      blocks.push({
        isConflict: true,
        ours,
        theirs,
        originalLines,
      });
      inConflict = false;
      currentSection = null;
    } else {
      if (inConflict) {
        originalLines.push(line);
        if (currentSection === 'ours') {
          ours.push(line);
        } else {
          theirs.push(line);
        }
      } else {
        blocks.push({
          isConflict: false,
          ours: [line],
          theirs: [line],
          originalLines: [line],
        });
      }
    }
  }

  return blocks;
}

/**
 * 尝试对单个冲突块进行智能合并（只处理纯列表或纯表格冲突）
 */
function tryResolveConflictBlock(block: ConflictBlock): string[] | null {
  const ours = block.ours.filter((l) => l.trim().length > 0);
  const theirs = block.theirs.filter((l) => l.trim().length > 0);

  if (ours.length === 0 && theirs.length === 0) {
    return [];
  }

  // 1. 尝试表格合并
  const isOursTable = ours.every((l) => l.trim().startsWith('|'));
  const isTheirsTable = theirs.every((l) => l.trim().startsWith('|'));
  if (isOursTable && isTheirsTable) {
    const merged = mergeTableRows(block.ours, block.theirs);
    if (merged !== null) return merged;
  }

  // 2. 尝试列表合并
  const isListMarker = (l: string) => /^\s*([-*+]|\d+\.)\s+/.test(l);
  const isOursList = ours.every(isListMarker);
  const isTheirsList = theirs.every(isListMarker);
  if (isOursList && isTheirsList) {
    return mergeListItems(block.ours, block.theirs);
  }

  return null;
}

/**
 * 合并表格冲突行
 */
function mergeTableRows(ours: string[], theirs: string[]): string[] | null {
  const parseTableLine = (l: string) => {
    return l.split('|').map((c) => c.trim()).filter((_, i, arr) => !(arr.length && _ === '' && (i === 0 || i === arr.length - 1)));
  };

  const normalizeRow = (cells: string[]) => cells.join('|').toLowerCase().replace(/\s+/g, '');

  const seen = new Set<string>();
  const merged: string[] = [];

  const addRows = (rows: string[]) => {
    for (const row of rows) {
      if (!row.trim()) continue;
      if (row.includes('----')) continue; // 跳过表头分割线
      const cells = parseTableLine(row);
      const key = normalizeRow(cells);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(`| ${cells.join(' | ')} |`);
      }
    }
  };

  addRows(ours);
  addRows(theirs);

  return merged;
}

/**
 * 合并列表冲突项
 */
function mergeListItems(ours: string[], theirs: string[]): string[] {
  const normalizeItem = (l: string) => l.trim().replace(/^\s*([-*+]|\d+\.)\s+/, '').trim().toLowerCase().replace(/\s+/g, '');

  const seen = new Set<string>();
  const merged: string[] = [];

  const addItems = (items: string[]) => {
    for (const item of items) {
      if (!item.trim()) continue;
      const key = normalizeItem(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  };

  addItems(ours);
  addItems(theirs);

  return merged;
}
