/**
 * docpath backlog — 正文解析、章节读写与需求拆分
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { BacklogItem } from '../../engine/backlog.js';
import type { BacklogCommandOptions } from './types.js';

export function hasInlineBodyOptions(options: BacklogCommandOptions): boolean {
  return options.background != null || options.acceptance != null;
}

export function hasBodyInput(options: BacklogCommandOptions): boolean {
  return Boolean(options.bodyFile || hasInlineBodyOptions(options));
}

function formatBacklogSection(title: string, value: string | undefined, fallback: string): string[] {
  return [
    `## ${title}`,
    '',
    value?.trim() ? value.trim() : fallback,
  ];
}

export function buildInlineBacklogBody(options: BacklogCommandOptions): string {
  return [
    ...formatBacklogSection('背景', options.background, '- 待补充'),
    '',
    ...formatBacklogSection('验收', options.acceptance, '- 待补充'),
  ].join('\n');
}

async function readBacklogBodyFile(cwd: string, bodyFile: string): Promise<string> {
  const path = isAbsolute(bodyFile) ? bodyFile : join(cwd, bodyFile);
  const content = await readFile(path, 'utf-8');
  if (!content.trim()) {
    throw new Error(`docpath backlog add: --body-file 内容为空: ${bodyFile}`);
  }
  return content.trim();
}

export function getMarkdownSection(body: string, title: string): string | null {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const sectionRegex = new RegExp(`^##\\s+(?:\\d+\\.\\s*)?.*${title}.*$`, 'm');
  const match = normalized.match(sectionRegex);
  if (!match) return null;

  const startIndex = match.index!;
  const headerLen = match[0].length;
  const contentStartIndex = startIndex + headerLen;

  const nextHeadingRegex = /^#{1,2}\s+\S/m;
  const rest = normalized.slice(contentStartIndex);
  const nextMatch = rest.match(nextHeadingRegex);

  const contentEndIndex = nextMatch
    ? contentStartIndex + nextMatch.index!
    : normalized.length;

  return normalized.slice(contentStartIndex, contentEndIndex).trim();
}

export function replaceMarkdownSection(body: string, title: string, content: string): string {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const sectionRegex = new RegExp(`^##\\s+(?:\\d+\\.\\s*)?.*${title}.*$`, 'm');
  const match = normalized.match(sectionRegex);
  if (!match) {
    return normalized + `\n\n## ${title}\n\n${content}`;
  }

  const startIndex = match.index!;
  const headerLen = match[0].length;
  const contentStartIndex = startIndex + headerLen;

  const nextHeadingRegex = /^#{1,2}\s+\S/m;
  const rest = normalized.slice(contentStartIndex);
  const nextMatch = rest.match(nextHeadingRegex);

  const contentEndIndex = nextMatch
    ? contentStartIndex + nextMatch.index!
    : normalized.length;

  const before = normalized.slice(0, contentStartIndex).trimEnd();
  const after = normalized.slice(contentEndIndex).trim();

  return `${before}\n\n${content}\n\n${after}`.trim() + '\n';
}

export function isPlaceholderValue(value: string | null | undefined): boolean {
  if (!value) return true;
  const lines = value.trim().split('\n');
  return lines.some((line) =>
    /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim())
  );
}

export async function resolveBacklogBody(options: BacklogCommandOptions, existingBody?: string): Promise<string> {
  if (options.bodyFile && hasInlineBodyOptions(options)) {
    throw new Error('docpath backlog: --body-file 不能与 --background/--acceptance 同时使用');
  }

  if (options.bodyFile) {
    return readBacklogBodyFile(options.cwd, options.bodyFile);
  }

  if (existingBody && (hasSection(existingBody, '背景') || hasSection(existingBody, '验收'))) {
    let body = existingBody;
    if (options.background != null) {
      body = replaceMarkdownSection(body, '背景', options.background);
    }
    if (options.acceptance != null) {
      body = replaceMarkdownSection(body, '验收', options.acceptance);
    }
    return body;
  }

  return buildInlineBacklogBody(options);
}

export function hasSection(body: string, title: string): boolean {
  return new RegExp(`^##\\s+(?:\\d+\\.\\s*)?.*${title}.*$`, 'm').test(body);
}

export function isPlaceholderBody(body: string): boolean {
  const bg = getMarkdownSection(body, '背景');
  const ac = getMarkdownSection(body, '验收');
  if (bg === null && ac === null) {
    const lines = body.trim().split('\n');
    return !body.trim() || lines.some((line) =>
      /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim())
    );
  }
  return isPlaceholderValue(bg) || isPlaceholderValue(ac);
}

/**
 * 从 backlog body 中按 ## 标题拆出各段内容。
 * 支持 "## 背景" / "## 验收" 等常见段落名；未匹配的正文归入 background。
 */
export function parseBacklogBody(body: string): { background: string; acceptance: string; requirements: string } {
  const trimmed = body.trim();
  if (!trimmed) return { background: '', acceptance: '', requirements: '' };

  const sectionPattern = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const matches: Array<{ heading: string; start: number; end: number }> = [];

  while ((match = sectionPattern.exec(trimmed)) !== null) {
    matches.push({ heading: match[1].trim(), start: match.index, end: match.index + match[0].length });
  }

  if (matches.length === 0) {
    return { background: trimmed, acceptance: '', requirements: '' };
  }

  // 第一个 ## 之前的内容作为前言（归入 background）
  const preamble = trimmed.slice(0, matches[0].start).trim();
  const backgroundParts: string[] = [];
  const acceptanceParts: string[] = [];
  const requirementsParts: string[] = [];

  if (preamble) backgroundParts.push(preamble);

  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].end;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].start : trimmed.length;
    const content = trimmed.slice(contentStart, contentEnd).trim();
    const heading = matches[i].heading;

    if (/验收|acceptance|done\s*条件/i.test(heading)) {
      acceptanceParts.push(content);
    } else if (/功能需求|需求要点|需求清单|functional\s*requirements?|fr\s*清单/i.test(heading)) {
      requirementsParts.push(content);
    } else {
      backgroundParts.push(content);
    }
  }

  return {
    background: backgroundParts.join('\n\n'),
    acceptance: acceptanceParts.join('\n'),
    requirements: requirementsParts.join('\n\n'),
  };
}

interface BacklogChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export function parseBacklogChecklist(body: string, prefix: 'FR'): BacklogChecklistItem[] {
  const items: BacklogChecklistItem[] = [];
  let inFence = false;

  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(new RegExp(`^\\s*[-*]\\s+\\[([ xX])\\]\\s+(${prefix}-\\d+)\\s*:\\s*(.+?)\\s*$`));
    if (!match) continue;
    items.push({
      id: match[2],
      text: match[3].trim(),
      done: match[1].toLowerCase() === 'x',
    });
  }

  return items;
}

export function stripBacklogChecklistLines(body: string, prefix: 'FR'): string {
  const lines: string[] = [];
  let inFence = false;
  const pattern = new RegExp(`^\\s*[-*]\\s+\\[[ xX]\\]\\s+${prefix}-\\d+\\s*:\\s*.+?\\s*$`);

  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      lines.push(line);
      continue;
    }
    if (!inFence && pattern.test(line)) continue;
    lines.push(line);
  }

  return lines.join('\n').trim();
}

export function splitCompoundRequirements(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. ① ② ③ 序号
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(trimmed)) {
    const parts = trimmed.split(/\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length > 1) return parts;
  }

  // 2. (1) (2) / （1）（2）序号
  if (/[(（]\d+[)）]/.test(trimmed)) {
    const parts = trimmed.split(/\s*[(（]\d+[)）]\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length > 1) return parts;
  }

  // 3. [1] [2] 序号
  if (/\[\d+\]/.test(trimmed)) {
    const parts = trimmed.split(/\s*\[\d+\]\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length > 1) return parts;
  }

  // 4. 1. xxx 2. yyy 或 1、xxx 2、yyy 序号
  if (/(?:^|\s+)\d+[\.、]\s+/.test(trimmed) || /(?:^|\s+)1[\.、]\s*.+?\s+2[\.、]\s*/.test(trimmed)) {
    const parts = trimmed.split(/(?:^|\s+)\d+[\.、]\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length > 1) return parts;
  }

  // 5. 中英文分号分割: xxx; yyy; zzz 或 xxx；yyy；zzz
  if (/[;；]/.test(trimmed)) {
    const parts = trimmed.split(/\s*[;；]\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length > 1) return parts;
  }

  // 6. 破折号/连字符拆分: "主需求 — 补充/子需求"
  const dashParts = trimmed.split(/\s*(?:——|—|--|\s+-\s+)\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
  if (dashParts.length > 1) return dashParts;

  // 7. 复合连接词拆分: '+'、'&'、'、'、','、'，'、'and'、'与'、'及'、'以及'
  const plusParts = trimmed.split(/\s*(?:[+&、,，]|\s+and\s+|与|及|以及)\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
  if (plusParts.length > 1) return plusParts;

  return [trimmed];
}

export function extractFunctionalRequirements(item: BacklogItem): BacklogChecklistItem[] {
  // 1. 优先从 body 中解析显式的 FR-* 列表
  const explicit = parseBacklogChecklist(item.body, 'FR');
  if (explicit.length > 0) return explicit;

  // 2. 从 body 中的专门功能需求 / 需求要点段落解析列表项（背景段落不参与列表泛化，防止调研散文误转 FR）
  const parsed = parseBacklogBody(item.body);
  if (parsed.requirements) {
    const bulletLines: string[] = [];
    for (const line of parsed.requirements.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || isPlaceholderValue(trimmed)) continue;
      const match = trimmed.match(/^[-*+]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
      if (match) {
        const text = match[1].trim();
        if (text && !isPlaceholderValue(text) && text.length >= 2) {
          bulletLines.push(text);
        }
      }
    }
    if (bulletLines.length > 0) {
      return bulletLines.map((text, idx) => ({
        id: `FR-${idx + 1}`,
        text: text.replace(/^(?:FR|fr)-\d+\s*:\s*/, '').trim(),
        done: false,
      }));
    }
  }

  // 3. 从标题中智能提取复合子需求
  const title = item.title.trim();

  // 3a. 冒号拆分: "标题前缀: 子需求"
  const colonMatch = title.match(/^([^:：]+)[:：]\s*(.+)$/);
  if (colonMatch) {
    const rawItems = splitCompoundRequirements(colonMatch[2]);
    if (rawItems.length > 1) {
      return rawItems.map((text, idx) => ({
        id: `FR-${idx + 1}`,
        text: text.replace(/^(?:FR|fr)-\d+\s*:\s*/, '').trim(),
        done: false,
      }));
    }
  }

  // 3b. 整体标题拆分
  const titleItems = splitCompoundRequirements(title);
  if (titleItems.length > 1) {
    return titleItems.map((text, idx) => ({
      id: `FR-${idx + 1}`,
      text: text.replace(/^(?:FR|fr)-\d+\s*:\s*/, '').trim(),
      done: false,
    }));
  }

  // 4. 兜底回退为单条需求
  return [
    {
      id: 'FR-1',
      text: item.title,
      done: false,
    },
  ];
}

export function parseMultilineListItems(text: string): string[] {
  const items: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    const listMatch = line.match(/^\s*(?:[-*+]|\d+\.)(?:\s+\[[ xX]\])?\s+(.+)$/);
    if (listMatch) {
      if (current.trim()) {
        items.push(current.trim());
      }
      current = listMatch[1].trim();
    } else if (current) {
      const trimmed = line.trim();
      if (trimmed) {
        current += ' ' + trimmed;
      }
    } else {
      const trimmed = line.trim();
      if (trimmed) {
        current = trimmed;
      }
    }
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}
