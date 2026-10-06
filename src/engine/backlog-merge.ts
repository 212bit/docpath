/**
 * Backlog 条目智能合并引擎 (Merge Engine)
 *
 * 将多条微型/技术步骤 Backlog 智能合并为单个独立可交付的垂直特性 Backlog，
 * 自动汇总背景要点、合并与重编号 AC 验收标准、归并依赖关系、将源条目标记为 dropped 归档，
 * 并同步更新关联 Milestone 的 backlog_ids 引用。
 */

import {
  readBacklogItem,
  writeBacklogItem,
  archiveBacklogItem,
  refreshBacklogIndex,
  type BacklogItem,
  cleanBacklogTitle,
} from './backlog.js';
import { today } from '../utils/file.js';
import { readMilestoneItem, writeMilestoneItem } from './milestone.js';

export interface MergeBacklogOptions {
  cwd: string;
  sourceIds: string[];
  targetId?: string;
  title?: string;
  dryRun?: boolean;
}

export interface MergeBacklogResult {
  targetId: string;
  mergedTitle: string;
  sourceIds: string[];
  droppedIds: string[];
  acceptanceCriteriaCount: number;
  milestone?: string | null;
  dryRun: boolean;
  targetItem: BacklogItem;
  droppedItems: BacklogItem[];
}

function extractSectionLines(body: string, sectionKeywords: string[]): string[] {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let inSection = false;
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^##+\s+/.test(trimmed);
    if (isHeading) {
      const isTargetSection = sectionKeywords.some((kw) => trimmed.toLowerCase().includes(kw.toLowerCase()));
      inSection = isTargetSection;
      continue;
    }
    if (inSection) {
      if (trimmed && !trimmed.startsWith('<!--') && !trimmed.includes('待补充') && !trimmed.includes('待细化')) {
        result.push(trimmed);
      }
    }
  }
  return result;
}

function extractAcList(body: string): string[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const acs: string[] = [];
  let inAcSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##+\s+(?:\d+\.\s*)?.*(?:验收|acceptance|AC)/i.test(trimmed)) {
      inAcSection = true;
      continue;
    } else if (/^##+\s+/.test(trimmed)) {
      inAcSection = false;
    }

    if (inAcSection) {
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(?:\[?(?:AC|ac)-\d+\]?:?\s*)?(.+)$/);
      if (match) {
        const text = match[1].trim();
        if (
          text &&
          !text.startsWith('#') &&
          !text.startsWith('待补充') &&
          !text.startsWith('待细化') &&
          text.length >= 2
        ) {
          acs.push(text);
        }
      } else if (!trimmed.startsWith('#') && !trimmed.includes('待补充') && !trimmed.includes('待细化')) {
        const clean = trimmed.replace(/^[-*]\s+/, '').trim();
        if (clean.length >= 2) acs.push(clean);
      }
    }
  }
  return acs;
}

export async function mergeBacklogItems(options: MergeBacklogOptions): Promise<MergeBacklogResult> {
  const { cwd, dryRun = false } = options;
  const rawSourceIds = options.sourceIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  const uniqueSourceIds = Array.from(new Set(rawSourceIds));

  if (uniqueSourceIds.length < 2) {
    throw new Error('docpath backlog merge requires at least 2 distinct backlog IDs to merge');
  }

  const targetId = options.targetId?.trim().toUpperCase() || uniqueSourceIds[0];
  if (!uniqueSourceIds.includes(targetId)) {
    uniqueSourceIds.unshift(targetId);
  }

  const droppedIds = uniqueSourceIds.filter((id) => id !== targetId);

  // 1. Read target item and all source items
  const targetItem = await readBacklogItem(cwd, targetId, { readArchived: true });
  if (!targetItem) {
    throw new Error(`docpath backlog merge: 目标条目不存在: ${targetId}`);
  }

  const droppedItems: BacklogItem[] = [];
  for (const id of droppedIds) {
    const item = await readBacklogItem(cwd, id, { readArchived: true });
    if (!item) {
      throw new Error(`docpath backlog merge: 待合并源条目不存在: ${id}`);
    }
    if (item.status === 'done') {
      throw new Error(`docpath backlog merge: 条目 ${id} 已经是 done 完成终态，禁止合并已完成的需求`);
    }
    droppedItems.push(item);
  }

  // 2. Synthesize new Title
  const mergedTitle = options.title?.trim()
    ? cleanBacklogTitle(options.title.trim(), targetId)
    : targetItem.title;

  // 3. Synthesize Background
  const bgLines: string[] = [];
  const targetBg = extractSectionLines(targetItem.body, ['背景', 'background', '目标', 'objective']);
  if (targetBg.length > 0) {
    bgLines.push(...targetBg);
  } else {
    bgLines.push(`- 目标特性: ${mergedTitle}`);
  }

  for (const it of droppedItems) {
    const itBg = extractSectionLines(it.body, ['背景', 'background', '目标', 'objective']);
    if (itBg.length > 0) {
      bgLines.push(`- 来自 [${it.id}] ${it.title}:`);
      for (const line of itBg) {
        bgLines.push(`  ${line.replace(/^[-*]\s+/, '')}`);
      }
    } else {
      bgLines.push(`- 合并子项 [${it.id}]: ${it.title}`);
    }
  }

  // 4. Synthesize Acceptance Criteria
  const rawAcs: string[] = [];
  const targetAcs = extractAcList(targetItem.body);
  rawAcs.push(...targetAcs);

  for (const it of droppedItems) {
    const itAcs = extractAcList(it.body);
    if (itAcs.length > 0) {
      rawAcs.push(...itAcs);
    } else {
      rawAcs.push(`${it.title} 完成并符合设计规范`);
    }
  }

  // Dedup ACs while preserving order
  const seenAc = new Set<string>();
  const uniqueAcs: string[] = [];
  for (const ac of rawAcs) {
    const clean = ac.replace(/^[-*]\s+(?:\[[ xX]\]\s+)?(?:\[?(?:AC|ac)-\d+\]?:?\s*)?/, '').trim();
    if (!clean || seenAc.has(clean) || clean.includes('待细化')) continue;
    seenAc.add(clean);
    uniqueAcs.push(clean);
  }

  if (uniqueAcs.length === 0) {
    uniqueAcs.push(`${mergedTitle} 功能实现完成并通过测试验证`);
  }

  // 5. Synthesize Non-Goals & Boundaries
  const nonGoalLines: string[] = [];
  const targetNg = extractSectionLines(targetItem.body, ['边界', '约束', 'non-goals', 'boundary']);
  if (targetNg.length > 0) {
    nonGoalLines.push(...targetNg);
  }
  for (const it of droppedItems) {
    const itNg = extractSectionLines(it.body, ['边界', '约束', 'non-goals', 'boundary']);
    for (const ng of itNg) {
      if (!nonGoalLines.includes(ng)) nonGoalLines.push(ng);
    }
  }
  if (nonGoalLines.length === 0) {
    nonGoalLines.push('- 遵循里程碑整体架构与设计规范');
  }

  // 6. Build new markdown body
  const bodySections = [
    '## 1. 需求背景与目标',
    bgLines.join('\n\n'),
    '',
    '## 2. 严格验收标准',
    uniqueAcs.map((ac, idx) => `- [ ] [AC-${idx + 1}] ${ac}`).join('\n'),
    '',
    '## 3. 边界与约束',
    nonGoalLines.join('\n'),
    '',
  ];
  const newBody = bodySections.join('\n');

  // 7. Synthesize Links
  const allMergedSet = new Set(uniqueSourceIds);
  const milestone = targetItem.links.milestone || droppedItems.find((it) => it.links.milestone)?.links.milestone || null;
  const parent = targetItem.links.parent || droppedItems.find((it) => it.links.parent)?.links.parent || null;

  const rawDependsOn = [
    ...(targetItem.links.depends_on || []),
    ...droppedItems.flatMap((it) => it.links.depends_on || []),
  ];
  const mergedDependsOn = Array.from(new Set(rawDependsOn.filter((d) => !allMergedSet.has(d.toUpperCase()))));

  const rawBlocks = [
    ...(targetItem.links.blocks || []),
    ...droppedItems.flatMap((it) => it.links.blocks || []),
  ];
  const mergedBlocks = Array.from(new Set(rawBlocks.filter((b) => !allMergedSet.has(b.toUpperCase()))));

  const updatedTargetItem: BacklogItem = {
    ...targetItem,
    title: mergedTitle,
    body: newBody,
    readiness: 'shaped',
    links: {
      ...targetItem.links,
      milestone,
      parent,
      depends_on: mergedDependsOn.length > 0 ? mergedDependsOn : undefined,
      blocks: mergedBlocks.length > 0 ? mergedBlocks : undefined,
    },
    evidence: {
      ...targetItem.evidence,
      decision_brief: [
        targetItem.evidence.decision_brief,
        `合并需求来源: ${droppedIds.join(', ')} (于 ${today()} 由 docpath backlog merge 合并)`,
      ].filter(Boolean).join('\n'),
    },
  };

  const updatedDroppedItems: BacklogItem[] = droppedItems.map((item) => ({
    ...item,
    status: 'dropped',
    body: `${item.body.trim()}\n\n> ⚠️ 此需求已于 ${today()} 合并至 [${targetId}](file://.docpath/backlog/${targetId}.md)。`,
    evidence: {
      ...item.evidence,
      decision_brief: `已合并至 ${targetId} (由 docpath backlog merge 触发)`,
    },
  }));

  if (dryRun) {
    return {
      targetId,
      mergedTitle,
      sourceIds: uniqueSourceIds,
      droppedIds,
      acceptanceCriteriaCount: uniqueAcs.length,
      milestone,
      dryRun: true,
      targetItem: updatedTargetItem,
      droppedItems: updatedDroppedItems,
    };
  }

  // 8. Write updated target item
  await writeBacklogItem(cwd, updatedTargetItem);

  // 9. Write and archive dropped items
  for (const item of updatedDroppedItems) {
    await writeBacklogItem(cwd, item);
    await archiveBacklogItem(cwd, item.id);
  }

  // 10. Update Milestone if present
  if (milestone) {
    try {
      const msItem = await readMilestoneItem(cwd, milestone);
      if (msItem) {
        msItem.backlog_ids = msItem.backlog_ids.filter((id) => !droppedIds.includes(id.toUpperCase()));
        if (!msItem.backlog_ids.includes(targetId)) {
          msItem.backlog_ids.push(targetId);
        }
        await writeMilestoneItem(cwd, msItem);
      }
    } catch {
      // ignore if milestone file not parseable
    }
  }

  await refreshBacklogIndex(cwd);

  return {
    targetId,
    mergedTitle,
    sourceIds: uniqueSourceIds,
    droppedIds,
    acceptanceCriteriaCount: uniqueAcs.length,
    milestone,
    dryRun: false,
    targetItem: updatedTargetItem,
    droppedItems: updatedDroppedItems,
  };
}
