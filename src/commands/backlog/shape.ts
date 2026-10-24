/**
 * docpath backlog — shape
 */

import { stringify } from 'yaml';
import {
  generateBacklogItemBody,
  isBacklogKind,
  readBacklogItem,
  refreshBacklogIndex,
  writeBacklogItem,
  type BacklogItem,
  type BacklogKind,
} from '../../engine/backlog.js';
import { buildEvidence, hasEvidenceOptions } from './evidence.js';
import { getMarkdownSection, isPlaceholderValue } from './markdown.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogShape(options: BacklogCommandOptions): Promise<void> {
  const id = options.id?.trim();
  if (!id) {
    throw new Error('docpath backlog shape requires <id>');
  }
  const item = await readBacklogItem(options.cwd, id);
  if (!item) {
    throw new Error(`docpath backlog shape: 条目不存在: ${id}`);
  }

  const rawKind = options.kind ? options.kind.toLowerCase().trim() : undefined;
  const kind: BacklogKind = rawKind && isBacklogKind(rawKind) ? (rawKind as BacklogKind) : (item.kind || 'feature');

  const existingBg = getMarkdownSection(item.body, '背景');
  const existingAc = getMarkdownSection(item.body, '验收');

  const structuredBody = generateBacklogItemBody(kind, item.title, {
    background: options.background || (existingBg && !isPlaceholderValue(existingBg) ? existingBg : undefined),
    acceptance: options.acceptance || (existingAc && !isPlaceholderValue(existingAc) ? existingAc : undefined),
    fr: options.fr,
    nonGoals: options.nonGoals,
  });

  const updated: BacklogItem = {
    ...item,
    kind,
    readiness: 'shaped',
    body: structuredBody,
    links: {
      ...item.links,
      parent: options.parent !== undefined ? (options.parent ? options.parent.trim() : null) : item.links.parent,
      depends_on: options.dependsOn !== undefined
        ? (options.dependsOn ? options.dependsOn.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined)
        : item.links.depends_on,
    },
  };

  if (hasEvidenceOptions(options)) {
    updated.evidence = buildEvidence(options, updated.evidence);
  }

  await writeBacklogItem(options.cwd, updated);
  await refreshBacklogIndex(options.cwd);

  if (options.agent) {
    console.log(stringify({
      shaped: true,
      item: {
        id: updated.id,
        title: updated.title,
        kind: updated.kind,
        readiness: updated.readiness,
        links: updated.links,
      },
    }));
    return;
  }

  console.log(`✅  已将条目 ${updated.id} 规范化为 shaped 成熟度`);
  console.log(`   title: ${updated.title}`);
  console.log(`   kind: ${updated.kind}`);
  console.log(`   readiness: shaped`);
  console.log('   正文已更新为四段式结构化模板');
}
