/**
 * docpath backlog — edit
 */

import {
  cleanBacklogTitle,
  isBacklogKind,
  isBacklogStatus,
  readBacklogItem,
  refreshBacklogIndex,
  writeBacklogItem,
  type BacklogItem,
} from '../../engine/backlog.js';
import { buildEvidence, hasEvidenceOptions, readinessRank } from './evidence.js';
import { parseIdList } from './ids.js';
import {
  hasInlineBodyOptions,
  isPlaceholderBody,
  resolveBacklogBody,
} from './markdown.js';
import { normalizeLevel, normalizePriority, normalizeReadiness } from './normalize.js';
import type { BacklogCommandOptions } from './types.js';

function hasEditFields(options: BacklogCommandOptions): boolean {
  return Boolean(
    options.title?.trim()
    || options.kind
    || options.priority
    || options.level
    || options.status
    || options.bodyFile
    || hasInlineBodyOptions(options)
    || options.readiness
    || hasEvidenceOptions(options)
    || options.milestone !== undefined
    || options.parent !== undefined
    || options.dependsOn !== undefined
    || options.blocks !== undefined
  );
}

export async function backlogEdit(options: BacklogCommandOptions): Promise<void> {
  const ids = parseIdList(options.id);
  if (ids.length === 0) {
    throw new Error('docpath backlog edit requires <id>');
  }
  if (!hasEditFields(options)) {
    throw new Error('docpath backlog edit requires at least one field option');
  }

  for (const singleId of ids) {
    const item = await readBacklogItem(options.cwd, singleId, { readArchived: true });
    if (!item) {
      throw new Error(`docpath backlog edit: backlog 条目不存在: ${singleId}`);
    }

    const updated: BacklogItem = { ...item, links: { ...item.links } };
    if (options.title?.trim()) updated.title = cleanBacklogTitle(options.title.trim(), updated.id);
    if (options.kind) {
      const rawKind = options.kind.toLowerCase().trim();
      if (isBacklogKind(rawKind)) {
        updated.kind = rawKind;
      } else {
        throw new Error(`docpath backlog edit: kind 非法: ${options.kind} (允许: feature|fix|refactor|perf|debt|spike|chore)`);
      }
    }
    if (options.status) {
      const rawStatus = options.status.toLowerCase().trim();
      if (isBacklogStatus(rawStatus)) {
        updated.status = rawStatus;
      } else {
        throw new Error(`docpath backlog edit: status 非法: ${options.status} (允许: proposed|accepted|planned|active|done|dropped)`);
      }
    }
    if (options.priority) updated.priority = normalizePriority(options.priority);
    if (options.level) updated.level = normalizeLevel(options.level);
    if (options.bodyFile || hasInlineBodyOptions(options)) {
      updated.body = await resolveBacklogBody(options, item.body);
      if (readinessRank(updated.readiness) < readinessRank('shaped') && !isPlaceholderBody(updated.body)) {
        updated.readiness = 'shaped';
      }
    }
    if (options.readiness) {
      updated.readiness = normalizeReadiness(options.readiness, updated.readiness);
    }
    if (hasEvidenceOptions(options)) {
      updated.evidence = buildEvidence(options, updated.evidence);
    }
    if (options.milestone !== undefined) {
      updated.links.milestone = options.milestone ? options.milestone.trim() : null;
    }
    if (options.parent !== undefined) {
      updated.links.parent = options.parent ? options.parent.trim() : null;
    }
    if (options.dependsOn !== undefined) {
      const deps = options.dependsOn ? options.dependsOn.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : [];
      updated.links.depends_on = deps.length > 0 ? deps : undefined;
    }
    if (options.blocks !== undefined) {
      const blks = options.blocks ? options.blocks.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : [];
      updated.links.blocks = blks.length > 0 ? blks : undefined;
    }

    await writeBacklogItem(options.cwd, updated);
    console.log(`✅  backlog 条目已编辑: ${updated.id}`);
    console.log(`   title: ${updated.title}`);
    console.log(`   status: ${updated.status}`);
    console.log(`   kind: ${updated.kind || 'feature'}`);
    console.log(`   priority: ${updated.priority}`);
    console.log(`   level: ${updated.level}`);
    if (updated.links.milestone) console.log(`   milestone: ${updated.links.milestone}`);
    if (updated.links.parent) console.log(`   parent: ${updated.links.parent}`);
    if (updated.links.depends_on && updated.links.depends_on.length > 0) console.log(`   depends_on: ${updated.links.depends_on.join(', ')}`);
    if (updated.links.blocks && updated.links.blocks.length > 0) console.log(`   blocks: ${updated.links.blocks.join(', ')}`);
  }
  await refreshBacklogIndex(options.cwd);
}
