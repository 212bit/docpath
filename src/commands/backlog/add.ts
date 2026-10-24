/**
 * docpath backlog — add / capture
 */

import {
  createBacklogItem,
  isBacklogKind,
  refreshBacklogIndex,
  type BacklogKind,
} from '../../engine/backlog.js';
import { today } from '../../utils/file.js';
import { buildEvidence } from './evidence.js';
import {
  buildInlineBacklogBody,
  hasBodyInput,
  resolveBacklogBody,
} from './markdown.js';
import { normalizeLevel, normalizePriority, normalizeReadiness } from './normalize.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogAdd(options: BacklogCommandOptions): Promise<void> {
  const title = (options.title || options.id)?.trim();
  if (!title) {
    throw new Error('docpath backlog add requires --title <title> or <title>');
  }

  if (!hasBodyInput(options)) {
    throw new Error('docpath backlog add requires --background/--acceptance or --body-file; use `docpath backlog capture --title <title>` for raw ideas');
  }

  const rawKind = options.kind ? options.kind.toLowerCase().trim() : undefined;
  const kind: BacklogKind = rawKind && isBacklogKind(rawKind) ? (rawKind as BacklogKind) : 'feature';

  const body = await resolveBacklogBody(options);

  const readiness = normalizeReadiness(options.readiness, 'shaped');
  if (readiness === 'raw') {
    throw new Error('docpath backlog add: readiness=raw 请使用 `docpath backlog capture`');
  }

  const dependsOn = options.dependsOn ? options.dependsOn.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined;
  const blocks = options.blocks ? options.blocks.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined;
  const parent = options.parent?.trim() || null;
  const milestone = options.milestone?.trim() || null;

  const item = await createBacklogItem(options.cwd, {
    title,
    kind,
    status: 'proposed',
    priority: normalizePriority(options.priority),
    level: normalizeLevel(options.level),
    source: 'docpath backlog add',
    readiness,
    evidence: buildEvidence(options),
    links: {
      task: null,
      spec: null,
      milestone,
      parent,
      ...(dependsOn && dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
      ...(blocks && blocks.length > 0 ? { blocks } : {}),
    },
    created_at: today(),
    body,
  });

  console.log(`✅  已创建 backlog 条目: ${item.id}`);
  console.log(`   title: ${item.title}`);
  console.log(`   kind: ${item.kind || 'feature'}`);
  console.log(`   priority: ${item.priority}`);
  console.log(`   level: ${item.level}`);
  console.log(`   readiness: ${item.readiness}`);
  if (item.links.milestone) console.log(`   milestone: ${item.links.milestone}`);
  if (item.links.parent) console.log(`   parent: ${item.links.parent}`);
  if (item.links.depends_on && item.links.depends_on.length > 0) console.log(`   depends_on: ${item.links.depends_on.join(', ')}`);
  if (item.links.blocks && item.links.blocks.length > 0) console.log(`   blocks: ${item.links.blocks.join(', ')}`);
  await refreshBacklogIndex(options.cwd);
}

export async function backlogCapture(options: BacklogCommandOptions): Promise<void> {
  const title = (options.title || options.id)?.trim();
  if (!title) {
    throw new Error('docpath backlog capture requires --title <title> or <title>');
  }

  const rawKind = options.kind ? options.kind.toLowerCase().trim() : undefined;
  const kind: BacklogKind = rawKind && isBacklogKind(rawKind) ? (rawKind as BacklogKind) : 'feature';

  const body = hasBodyInput(options)
    ? await resolveBacklogBody(options)
    : buildInlineBacklogBody({ ...options, title });

  const dependsOn = options.dependsOn ? options.dependsOn.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined;
  const blocks = options.blocks ? options.blocks.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined;
  const parent = options.parent?.trim() || null;
  const milestone = options.milestone?.trim() || null;

  const item = await createBacklogItem(options.cwd, {
    title,
    kind,
    status: 'proposed',
    priority: normalizePriority(options.priority),
    level: normalizeLevel(options.level),
    source: 'docpath backlog capture',
    readiness: 'raw',
    evidence: buildEvidence(options),
    links: {
      task: null,
      spec: null,
      milestone,
      parent,
      ...(dependsOn && dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
      ...(blocks && blocks.length > 0 ? { blocks } : {}),
    },
    created_at: today(),
    body,
  });

  console.log(`✅  已捕获 raw backlog 条目: ${item.id}`);
  console.log(`   title: ${item.title}`);
  console.log(`   kind: ${item.kind || 'feature'}`);
  console.log(`   priority: ${item.priority}`);
  if (item.links.milestone) console.log(`   milestone: ${item.links.milestone}`);
  console.log(`   level: ${item.level}`);
  console.log('   readiness: raw');
  if (item.links.parent) console.log(`   parent: ${item.links.parent}`);
  if (item.links.depends_on && item.links.depends_on.length > 0) console.log(`   depends_on: ${item.links.depends_on.join(', ')}`);
  if (item.links.blocks && item.links.blocks.length > 0) console.log(`   blocks: ${item.links.blocks.join(', ')}`);
  console.log(`   下一步: docpath analyze --dry-run --mode deep --content "${item.title}"，再用 docpath backlog edit ${item.id} 补充 evidence`);
  if (item.level <= 1) {
    console.log(`   ⚡ 微小改动可跳过完整流程: docpath quick "${item.title}"（R-310 轻量通道）`);
  }
  await refreshBacklogIndex(options.cwd);
}
