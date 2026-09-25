/**
 * Backlog 批量导入与导出引擎
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  type BacklogItem,
  type BacklogKind,
  type BacklogPriority,
  type BacklogStatus,
  createBacklogItem,
  isBacklogKind,
  isBacklogPriority,
  isBacklogStatus,
  listBacklogItems,
  readBacklogItem,
  refreshBacklogIndex,
  writeBacklogItem,
  generateBacklogItemBody,
  cleanBacklogTitle,
} from './backlog.js';
import { buildBacklogGraph } from './backlog-graph.js';

export interface BacklogExportOptions {
  format?: 'json' | 'yaml' | 'markdown';
  status?: string;
  priority?: string;
  kind?: string;
  readyOnly?: boolean;
  outputPath?: string;
}

export interface BacklogExportResult {
  content: string;
  count: number;
  outputPath?: string;
}

export interface BacklogImportOptions {
  filePath: string;
  dryRun?: boolean;
  overwrite?: boolean;
}

export interface BacklogImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  items: Array<{ id: string; title: string; action: 'created' | 'updated' | 'skipped' | 'error'; error?: string }>;
}

export async function exportBacklogItems(
  cwd: string,
  options: BacklogExportOptions = {},
): Promise<BacklogExportResult> {
  const items = await listBacklogItems(cwd);
  const graph = buildBacklogGraph(items);

  const filtered = items.filter((item) => {
    if (options.status && item.status !== options.status) return false;
    if (options.priority && item.priority !== options.priority.toUpperCase()) return false;
    if (options.kind && item.kind !== options.kind.toLowerCase()) return false;
    if (options.readyOnly && graph.blockedItems.includes(item.id)) return false;
    return true;
  });

  const format = options.format || 'yaml';
  let content = '';

  if (format === 'json') {
    content = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        total: filtered.length,
        items: filtered,
      },
      null,
      2,
    );
  } else if (format === 'markdown') {
    const sections: string[] = [
      '# DocPath Backlog Export',
      '',
      `> 导出时间: ${new Date().toISOString()}`,
      `> 总计条目: ${filtered.length}`,
      '',
    ];

    for (const item of filtered) {
      sections.push(
        `## [${item.id}] ${item.title}`,
        '',
        `- **类型**: ${item.kind || 'feature'}`,
        `- **状态**: ${item.status}`,
        `- **优先级**: ${item.priority}`,
        `- **复杂度**: ${item.level}`,
        item.links.parent ? `- **父需求**: ${item.links.parent}` : '',
        item.links.depends_on?.length ? `- **依赖项**: ${item.links.depends_on.join(', ')}` : '',
        item.links.blocks?.length ? `- **阻塞项**: ${item.links.blocks.join(', ')}` : '',
        '',
        item.body.trim(),
        '',
        '---',
        '',
      );
    }
    content = sections.filter((line) => line !== '').join('\n');
  } else {
    // YAML
    content = stringifyYaml({
      exported_at: new Date().toISOString(),
      total: filtered.length,
      items: filtered,
    });
  }

  if (options.outputPath) {
    const absPath = isAbsolute(options.outputPath) ? options.outputPath : resolve(cwd, options.outputPath);
    await writeFile(absPath, content, 'utf-8');
    return { content, count: filtered.length, outputPath: absPath };
  }

  return { content, count: filtered.length };
}

interface RawImportItem {
  id?: string;
  title: string;
  kind?: string;
  status?: string;
  priority?: string;
  level?: number;
  source?: string;
  background?: string;
  acceptance?: string;
  fr?: string;
  non_goals?: string;
  body?: string;
  links?: {
    parent?: string;
    depends_on?: string[];
    blocks?: string[];
  };
}

function parseImportContent(content: string): RawImportItem[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // 1. Try JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as RawImportItem[];
      if (parsed && Array.isArray(parsed.items)) return parsed.items as RawImportItem[];
    } catch {
      // not json, continue
    }
  }

  // 2. Try YAML
  try {
    const parsedYaml = parseYaml(trimmed);
    if (Array.isArray(parsedYaml)) return parsedYaml as RawImportItem[];
    if (parsedYaml && Array.isArray(parsedYaml.items)) return parsedYaml.items as RawImportItem[];
  } catch {
    // not standard yaml array
  }

  // 3. Fallback: Parse markdown list/headings
  const items: RawImportItem[] = [];
  const itemBlocks = trimmed.split(/\n(?=##\s+\[?R-\d+|##\s+)/);
  for (const block of itemBlocks) {
    const headingMatch = block.match(/^##\s+(?:\[([A-Za-z0-9_-]+)\]\s+)?([^\n]+)/m);
    if (headingMatch) {
      const id = headingMatch[1];
      const title = headingMatch[2].trim();
      const body = block.replace(/^##\s+[^\n]+\n/, '').trim();
      items.push({ id, title, body });
    }
  }

  return items;
}

export async function importBacklogItems(
  cwd: string,
  options: BacklogImportOptions,
): Promise<BacklogImportResult> {
  const absPath = isAbsolute(options.filePath) ? options.filePath : resolve(cwd, options.filePath);
  if (!existsSync(absPath)) {
    throw new Error(`docpath backlog import: 文件不存在: ${options.filePath}`);
  }

  const content = await readFile(absPath, 'utf-8');
  const rawItems = parseImportContent(content);

  if (rawItems.length === 0) {
    throw new Error(`docpath backlog import: 未能在文件中解析出任何有效 Backlog 条目: ${options.filePath}`);
  }

  const result: BacklogImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    items: [],
  };

  const existingItems = await listBacklogItems(cwd);
  const existingMap = new Map<string, BacklogItem>(existingItems.map((item) => [item.id, item]));
  const existingTitles = new Set(existingItems.map((item) => cleanBacklogTitle(item.title).toLowerCase()));

  for (const raw of rawItems) {
    if (!raw.title || !raw.title.trim()) {
      result.errors.push('条目缺少必填 title');
      result.items.push({ id: raw.id || 'unknown', title: '（空标题）', action: 'error', error: '缺少 title' });
      continue;
    }

    const title = cleanBacklogTitle(raw.title);
    const kind: BacklogKind = raw.kind && isBacklogKind(raw.kind) ? (raw.kind.toLowerCase() as BacklogKind) : 'feature';
    const priority: BacklogPriority = raw.priority && isBacklogPriority(raw.priority.toUpperCase()) ? (raw.priority.toUpperCase() as BacklogPriority) : 'P2';
    const level = typeof raw.level === 'number' && raw.level >= 0 && raw.level <= 3 ? raw.level : 2;
    const status: BacklogStatus = raw.status && isBacklogStatus(raw.status.toLowerCase()) ? (raw.status.toLowerCase() as BacklogStatus) : 'proposed';

    const body = raw.body && raw.body.trim()
      ? raw.body.trim()
      : generateBacklogItemBody(kind, title, {
          background: raw.background,
          acceptance: raw.acceptance,
          fr: raw.fr,
          nonGoals: raw.non_goals,
        });

    // Check if ID exists and overwrite is enabled
    if (raw.id && existingMap.has(raw.id)) {
      if (options.overwrite) {
        if (!options.dryRun) {
          const existing = existingMap.get(raw.id)!;
          const updatedItem: BacklogItem = {
            ...existing,
            title,
            kind,
            priority,
            level,
            body,
            links: {
              ...existing.links,
              parent: raw.links?.parent ?? existing.links.parent,
              depends_on: raw.links?.depends_on ?? existing.links.depends_on,
              blocks: raw.links?.blocks ?? existing.links.blocks,
            },
          };
          await writeBacklogItem(cwd, updatedItem);
        }
        result.updated += 1;
        result.items.push({ id: raw.id, title, action: 'updated' });
      } else {
        result.skipped += 1;
        result.items.push({ id: raw.id, title, action: 'skipped', error: '已存在同名 ID (未启用 --overwrite)' });
      }
      continue;
    }

    // Check same title duplicate
    if (existingTitles.has(title.toLowerCase()) && !options.overwrite) {
      result.skipped += 1;
      result.items.push({ id: raw.id || 'pending', title, action: 'skipped', error: '已存在相同标题需求' });
      continue;
    }

    if (!options.dryRun) {
      const created = await createBacklogItem(cwd, {
        title,
        kind,
        priority,
        level,
        status,
        source: raw.source || 'import',
        readiness: 'shaped',
        evidence: {
          brainstorm: null,
          analysis: null,
          spec: null,
          decision_brief: null,
          user_confirmed: null,
        },
        links: {
          task: null,
          spec: null,
          parent: raw.links?.parent || null,
          depends_on: raw.links?.depends_on,
          blocks: raw.links?.blocks,
        },
        created_at: new Date().toISOString().slice(0, 10),
        body,
      });
      existingTitles.add(title.toLowerCase());
      result.imported += 1;
      result.items.push({ id: created.id, title: created.title, action: 'created' });
    } else {
      result.imported += 1;
      result.items.push({ id: raw.id || 'preview', title, action: 'created' });
    }
  }

  if (!options.dryRun && result.imported + result.updated > 0) {
    await refreshBacklogIndex(cwd);
  }

  return result;
}
