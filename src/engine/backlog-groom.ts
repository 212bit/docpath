/**
 * Backlog Groom 深度治理与健康度巡检引擎
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type BacklogItem, detectBacklogIdCollisions } from './backlog.js';
import { buildBacklogGraph } from './backlog-graph.js';
import { resolveDocpathDir } from '../utils/file.js';

export interface BacklogGroomIssue {
  id: string;
  severity: 'error' | 'warning';
  field: string;
  message: string;
  suggestion: string;
}

const FUZZY_AC_PATTERNS = [
  /尽快/,
  /尽量/,
  /尽量保证/,
  /性能良好/,
  /界面美观/,
  /体验优雅/,
  /差不多/,
  /高效/,
  /基本可用/,
  /稳定运行/,
];

const MULTI_CHANNEL_GROUPS = [
  {
    name: '传输协议',
    terms: ['ws', 'websocket', 'http', 'https', 'dns', 'grpc', 'tcp', 'udp', 'quic', 'sse'],
  },
  {
    name: '端平台',
    terms: ['ios', 'android', 'web', 'h5', 'desktop', 'macos', 'windows', 'linux', '小程序'],
  },
  {
    name: '数据存储',
    terms: ['mysql', 'postgres', 'postgresql', 'sqlite', 'redis', 'mongodb'],
  },
];

function hasQuantitativeIndicator(text: string): boolean {
  // Check if text contains numbers, ms, %, status codes, boolean assertions, etc.
  return /\d+|100%|<|>|==|!=|ms|s|kb|mb|gb|true|false|assert|exit code/i.test(text);
}

function detectCrossChannelTerms(line: string): string[] | null {
  const lower = line.toLowerCase();
  for (const group of MULTI_CHANNEL_GROUPS) {
    const matched = group.terms.filter((term) => {
      if (term.length <= 4) {
        const regex = new RegExp(`(?:^|[^a-z0-9])${term}(?:[^a-z0-9]|$)`, 'i');
        return regex.test(lower);
      }
      return lower.includes(term);
    });
    if (matched.length >= 2) {
      return matched;
    }
  }
  return null;
}

export function auditBacklogHygiene(items: BacklogItem[]): {
  issues: BacklogGroomIssue[];
  warnings: BacklogGroomIssue[];
} {
  const issues: BacklogGroomIssue[] = [];
  const warnings: BacklogGroomIssue[] = [];

  const itemMap = new Map<string, BacklogItem>(items.map((it) => [it.id, it]));
  const graph = buildBacklogGraph(items);

  // 1. Circular dependencies check
  if (graph.cycles.length > 0) {
    for (const cycle of graph.cycles) {
      const cyclePath = cycle.join(' -> ');
      issues.push({
        id: cycle[0],
        severity: 'error',
        field: 'links.depends_on',
        message: `检测到循环依赖闭环: ${cyclePath}`,
        suggestion: `解除 ${cycle[cycle.length - 1]} 或 ${cycle[0]} 的循环前置依赖 (docpath backlog edit <id> --depends-on "")`,
      });
    }
  }

  // 2. Individual item checks
  for (const item of items) {
    // 2.1 Broken dependencies
    if (item.links.parent) {
      const parent = itemMap.get(item.links.parent);
      if (!parent) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'links.parent',
          message: `parent 引用的父需求不存在: ${item.links.parent}`,
          suggestion: `修正父需求 ID 或移除 parent 链接 (docpath backlog edit ${item.id} --parent "")`,
        });
      } else if (parent.status === 'dropped') {
        warnings.push({
          id: item.id,
          severity: 'warning',
          field: 'links.parent',
          message: `parent 引用的父需求已被废弃: ${item.links.parent} (status=dropped)`,
          suggestion: `评估本需求是否仍需执行，或更新 parent 链接`,
        });
      }
    }

    if (item.links.depends_on && item.links.depends_on.length > 0) {
      for (const dep of item.links.depends_on) {
        const depItem = itemMap.get(dep);
        if (!depItem) {
          issues.push({
            id: item.id,
            severity: 'error',
            field: 'links.depends_on',
            message: `depends_on 引用的前置依赖不存在: ${dep}`,
            suggestion: `修正前置需求 ID 或移除无效依赖 (docpath backlog edit ${item.id} --depends-on "")`,
          });
        } else if (depItem.status === 'dropped') {
          issues.push({
            id: item.id,
            severity: 'error',
            field: 'links.depends_on',
            message: `depends_on 引用的前置依赖已被废弃: ${dep} (status=dropped)，导致本需求陷入死锁`,
            suggestion: `重新评估依赖关系并解除对已废弃条目的依赖 (docpath backlog edit ${item.id})`,
          });
        }
      }
    }

    // 2.2 Fuzzy unverifiable AC anti-patterns & Cross-channel AC gaps
    if (item.body) {
      const normalizedBody = item.body.replace(/\r\n/g, '\n');
      const lines = normalizedBody.split('\n');
      let inAcceptanceSection = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (/^##\s+(?:\d+\.\s*)?.*(?:验收|acceptance|AC)/i.test(trimmed)) {
          inAcceptanceSection = true;
          continue;
        } else if (/^##\s+/.test(trimmed)) {
          inAcceptanceSection = false;
        }

        if (inAcceptanceSection || /^[-*]\s*(?:\[AC-\d+\]|AC-\d+:|验收标准:?)/i.test(trimmed)) {
          if (!trimmed || trimmed.startsWith('#')) continue;

          // 模糊词汇检测
          const matches = FUZZY_AC_PATTERNS.filter((pattern) => pattern.test(trimmed));
          if (matches.length > 0 && !hasQuantitativeIndicator(trimmed)) {
            warnings.push({
              id: item.id,
              severity: 'warning',
              field: 'body.acceptance',
              message: `验收标准包含模糊/主观词汇 (如: ${matches.map((p) => p.source).join(', ')}) 且缺少量化指标`,
              suggestion: `使用可断言句式 (如 Given-When-Then、测试用例或具体数字) 改写 AC`,
            });
            break;
          }

          // 跨通道 AC 空洞检测
          const crossChannels = detectCrossChannelTerms(trimmed);
          if (crossChannels && crossChannels.length >= 2) {
            warnings.push({
              id: item.id,
              severity: 'warning',
              field: 'body.acceptance',
              message: `验收标准单条声明包含多通道/多协议 (${crossChannels.join('/')})，存在跨通道 AC 空洞风险`,
              suggestion: `建议将多通道/多协议拆分为独立子验收项（如分别为 ${crossChannels.map((t) => `[${t}]`).join('、')} 编写断言），避免单通道通过后遗漏其他通道`,
            });
            break;
          }
        }
      }
    }

    // 2.3 Stale Raw Items (草稿老化检测: > 30 天仍处于 raw)
    if (item.status === 'proposed' && item.readiness === 'raw' && item.created_at) {
      const createdTime = new Date(item.created_at).getTime();
      if (!Number.isNaN(createdTime)) {
        const ageDays = Math.floor((Date.now() - createdTime) / (1000 * 3600 * 24));
        if (ageDays >= 30) {
          warnings.push({
            id: item.id,
            severity: 'warning',
            field: 'readiness',
            message: `条目处于 raw 草稿状态已达 ${ageDays} 天未演进`,
            suggestion: `运行 docpath backlog shape ${item.id} 补全规范，或 docpath backlog drop ${item.id} 归档废弃`,
          });
        }
      }
    }

    // 2.4 High Complexity Epic splitting suggestion (level 3 且无子任务)
    if (item.level === 3 && item.status === 'proposed') {
      const children = graph.nodes[item.id]?.children || [];
      if (children.length === 0) {
        warnings.push({
          id: item.id,
          severity: 'warning',
          field: 'level',
          message: `复杂度为 Level 3 的高风险需求尚未进行子需求拆解`,
          suggestion: `建议拆分为多个微元化子需求并通过 --parent ${item.id} 组织关联`,
        });
      }
    }
  }

  return { issues, warnings };
}

/**
 * 自动修复 Backlog 结构性依赖悬空（如已 drop 或不存在的 parent/depends_on）
 */
export async function autoFixBacklogHygiene(
  cwd: string,
  items: BacklogItem[],
  writeItem: (cwd: string, item: BacklogItem) => Promise<void>,
  refreshIndex: (cwd: string) => Promise<void>,
): Promise<{ fixedCount: number; fixes: string[] }> {
  const fixes: string[] = [];
  const itemMap = new Map<string, BacklogItem>(items.map((it) => [it.id, it]));

  for (const item of items) {
    let modified = false;

    // 1. 修复悬空/已废弃 parent
    if (item.links.parent) {
      const parent = itemMap.get(item.links.parent);
      if (!parent || parent.status === 'dropped') {
        const reason = !parent ? '不存在' : '已废弃(dropped)';
        fixes.push(`[${item.id}] 清理无效 parent 链接: ${item.links.parent} (${reason})`);
        item.links.parent = null;
        modified = true;
      }
    }

    // 2. 修复悬空/已废弃 depends_on
    if (item.links.depends_on && item.links.depends_on.length > 0) {
      const originalDeps = [...item.links.depends_on];
      const validDeps = originalDeps.filter((dep) => {
        const depItem = itemMap.get(dep);
        return depItem && depItem.status !== 'dropped';
      });
      if (validDeps.length !== originalDeps.length) {
        const removed = originalDeps.filter((d) => !validDeps.includes(d));
        fixes.push(`[${item.id}] 清理无效 depends_on 依赖: ${removed.join(', ')}`);
        item.links.depends_on = validDeps.length > 0 ? validDeps : undefined;
        modified = true;
      }
    }

    // 3. 修复悬空/已废弃 blocks
    if (item.links.blocks && item.links.blocks.length > 0) {
      const originalBlocks = [...item.links.blocks];
      const validBlocks = originalBlocks.filter((blk) => {
        const blkItem = itemMap.get(blk);
        return blkItem && blkItem.status !== 'dropped';
      });
      if (validBlocks.length !== originalBlocks.length) {
        const removed = originalBlocks.filter((b) => !validBlocks.includes(b));
        fixes.push(`[${item.id}] 清理无效 blocks 链接: ${removed.join(', ')}`);
        item.links.blocks = validBlocks.length > 0 ? validBlocks : undefined;
        modified = true;
      }
    }

    if (modified) {
      await writeItem(cwd, item);
    }
  }

  // 4. 自动清理已完全归档且内容一致的活跃冗余条目（如合并或分支残留的幽灵副本）
  const collisions = await detectBacklogIdCollisions(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  for (const collision of collisions) {
    if (collision.identical) {
      const fullActivePath = join(docpathDir, collision.active_file.replace(/^\.docpath\//, ''));
      if (existsSync(fullActivePath)) {
        await rm(fullActivePath);
        fixes.push(`[${collision.id}] 清理已归档且内容一致的活跃冗余副本: ${collision.active_file}`);
      }
    }
  }

  if (fixes.length > 0) {
    await refreshIndex(cwd);
  }

  return { fixedCount: fixes.length, fixes };
}
