/**
 * Backlog Groom 深度治理与健康度巡检引擎
 */

import { type BacklogItem } from './backlog.js';
import { buildBacklogGraph } from './backlog-graph.js';

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

function hasQuantitativeIndicator(text: string): boolean {
  // Check if text contains numbers, ms, %, status codes, boolean assertions, etc.
  return /\d+|100%|<|>|==|!=|ms|s|kb|mb|gb|true|false|assert|exit code/i.test(text);
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

    // 2.2 Fuzzy unverifiable AC anti-patterns
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
