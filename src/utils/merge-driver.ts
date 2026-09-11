export class MergeDriverConflict extends Error {
  readonly conflicts: string[];

  constructor(message: string, conflicts: string[] = []) {
    super(message);
    this.name = 'MergeDriverConflict';
    this.conflicts = conflicts;
  }
}

export interface MergeDriverInput {
  ancestor: string;
  current: string;
  other: string;
  path?: string;
}

export interface MergeDriverResult {
  content: string;
  strategy: 'backlog-index' | 'markdown-insertions' | 'docs-index';
}

interface ParsedBacklogRows {
  rows: Map<string, string>;
  order: string[];
  firstRow: number;
  lastRow: number;
}

const BACKLOG_ROW_RE = /^\|\s*(R-\d+)\s*\|/;

export function normalizeMergePath(filePath = ''): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isBacklogIndexPath(filePath = ''): boolean {
  const normalized = normalizeMergePath(filePath);
  return normalized === '.docpath/backlog/backlog.md'
    || normalized.endsWith('/.docpath/backlog/backlog.md');
}

/** R-335 FR-2: 机器生成的文档索引（docs.md / docs-index.json）——合并时任取一侧即可，
 *  下一次 docs scan 会整体重生成；人工解冲突毫无意义。 */
export function isDocsIndexPath(filePath = ''): boolean {
  const normalized = normalizeMergePath(filePath);
  return normalized === '.docpath/docs.md'
    || normalized === '.docpath/docs-index.json'
    || normalized.endsWith('/.docpath/docs.md')
    || normalized.endsWith('/.docpath/docs-index.json');
}

export function isSupportedDocpathMergePath(filePath = ''): boolean {
  const normalized = normalizeMergePath(filePath);
  return normalized.startsWith('.docpath/backlog/')
    || normalized.includes('/.docpath/backlog/')
    || normalized.startsWith('.docpath/rules/')
    || normalized.includes('/.docpath/rules/')
    || isDocsIndexPath(normalized);
}

export function resolveDocpathMerge(input: MergeDriverInput): MergeDriverResult {
  // R-335 FR-2: docs 索引优先于 backlog-index 形状嗅探 —— 索引表行可能包含
  // backlog 行片段，但语义是"生成物"，正确策略是 take-current 而非行级合并。
  if (isDocsIndexPath(input.path)) {
    return {
      content: input.current,
      strategy: 'docs-index',
    };
  }

  if (isBacklogIndexPath(input.path) || looksLikeBacklogIndex(input.ancestor, input.current, input.other)) {
    return {
      content: mergeBacklogIndex(input.ancestor, input.current, input.other),
      strategy: 'backlog-index',
    };
  }

  return {
    content: mergeInsertionOnlyMarkdown(input.ancestor, input.current, input.other),
    strategy: 'markdown-insertions',
  };
}

function splitLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n');
  if (normalized.length === 0) return [];
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function joinLines(lines: string[], reference: string): string {
  const body = lines.join('\n');
  return reference.endsWith('\n') || body.length > 0 ? `${body}\n` : body;
}

function looksLikeBacklogIndex(...contents: string[]): boolean {
  return contents.some((content) => splitLines(content).some((line) => BACKLOG_ROW_RE.test(line)));
}

function parseBacklogRows(content: string): ParsedBacklogRows {
  const lines = splitLines(content);
  const rows = new Map<string, string>();
  const order: string[] = [];
  let firstRow = -1;
  let lastRow = -1;

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(BACKLOG_ROW_RE);
    if (!match) continue;
    const id = match[1];
    if (!rows.has(id)) order.push(id);
    rows.set(id, lines[index]);
    if (firstRow === -1) firstRow = index;
    lastRow = index;
  }

  return { rows, order, firstRow, lastRow };
}

function mergeBacklogIndex(ancestor: string, current: string, other: string): string {
  const base = parseBacklogRows(ancestor);
  const ours = parseBacklogRows(current);
  const theirs = parseBacklogRows(other);
  const ids = orderedUnion(base.order, ours.order, theirs.order);
  const conflicts: string[] = [];
  const mergedRows: string[] = [];

  for (const id of ids) {
    const merged = pickMergedBacklogRow(
      id,
      base.rows.get(id),
      ours.rows.get(id),
      theirs.rows.get(id),
    );
    if (merged.conflict) {
      conflicts.push(id);
      continue;
    }
    if (merged.row) mergedRows.push(merged.row);
  }

  if (conflicts.length > 0) {
    throw new MergeDriverConflict(
      `Conflicting backlog rows: ${conflicts.join(', ')}`,
      conflicts,
    );
  }

  const template = ours.firstRow !== -1 ? current : theirs.firstRow !== -1 ? other : ancestor;
  const parsedTemplate = parseBacklogRows(template);
  if (parsedTemplate.firstRow === -1) return joinLines(mergedRows, current || other || ancestor);

  const lines = splitLines(template);
  const nextLines = [
    ...lines.slice(0, parsedTemplate.firstRow),
    ...mergedRows,
    ...lines.slice(parsedTemplate.lastRow + 1),
  ];
  return joinLines(nextLines, template);
}

function orderedUnion(...orders: string[][]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const order of orders) {
    for (const id of order) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function pickMergedBacklogRow(
  id: string,
  base: string | undefined,
  ours: string | undefined,
  theirs: string | undefined,
): { row?: string; conflict?: true } {
  if (ours === theirs) return ours ? { row: ours } : {};
  if (base === undefined) {
    if (ours === undefined) return theirs ? { row: theirs } : {};
    if (theirs === undefined) return { row: ours };
    return { conflict: true };
  }
  if (ours === base) return theirs ? { row: theirs } : {};
  if (theirs === base) return ours ? { row: ours } : {};
  if (ours === undefined && theirs === undefined) return {};
  void id;
  return { conflict: true };
}

function mergeInsertionOnlyMarkdown(ancestor: string, current: string, other: string): string {
  if (current === other) return current;
  if (current === ancestor) return other;
  if (other === ancestor) return current;

  const baseLines = splitLines(ancestor);
  const ours = collectInsertionBuckets(baseLines, splitLines(current));
  const theirs = collectInsertionBuckets(baseLines, splitLines(other));
  if (!ours || !theirs) {
    throw new MergeDriverConflict('Conflicting markdown edits outside insertion-only regions');
  }

  const merged: string[] = [];
  for (let index = 0; index <= baseLines.length; index++) {
    merged.push(...mergeInsertionBucket(ours[index], theirs[index]));
    if (index < baseLines.length) merged.push(baseLines[index]);
  }

  return joinLines(merged, current || other || ancestor);
}

function collectInsertionBuckets(baseLines: string[], sideLines: string[]): string[][] | null {
  const buckets = Array.from({ length: baseLines.length + 1 }, () => [] as string[]);
  let sideIndex = 0;

  for (let baseIndex = 0; baseIndex < baseLines.length; baseIndex++) {
    while (sideIndex < sideLines.length && sideLines[sideIndex] !== baseLines[baseIndex]) {
      buckets[baseIndex].push(sideLines[sideIndex]);
      sideIndex++;
    }
    if (sideIndex >= sideLines.length) return null;
    sideIndex++;
  }

  buckets[baseLines.length].push(...sideLines.slice(sideIndex));
  return buckets;
}

function mergeInsertionBucket(ours: string[], theirs: string[]): string[] {
  if (arraysEqual(ours, theirs)) return ours;
  const merged = [...ours];
  for (const line of theirs) {
    if (!merged.includes(line)) merged.push(line);
  }
  return merged;
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
