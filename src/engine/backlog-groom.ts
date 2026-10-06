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

    // 2.5 纯单技术步骤微型 Backlog 异味检测 (Single Technical Step Smell)
    if (item.status !== 'done' && item.status !== 'dropped' && item.level <= 2) {
      const isTechStep = /(?:^|\s)(?:配套\s*)?(?:mapper\s*接口|mybatis\s*(?:xml|映射)|建表\s*(?:sql|脚本)?|sofa\s*(?:provider|xml)\s*注册|spring\s*xml\s*配置)(?:\s|$)/i.test(item.title);
      if (isTechStep) {
        warnings.push({
          id: item.id,
          severity: 'warning',
          field: 'granularity.technical_step',
          message: `条目标题 '${item.title}' 疑似纯技术步骤而非独立可验证的业务交付物`,
          suggestion: `建议遵循垂直业务切片原则，将技术步骤沉降为相关 Task 的 Step，或运行 docpath backlog merge 合并到父业务特性`,
        });
      }
    }
  }

  // 3. 里程碑维度碎片化聚类分析 (Milestone Granularity & Horizontal Layer Smells)
  const milestoneGroups = new Map<string, BacklogItem[]>();
  for (const item of items) {
    if (item.status === 'done' || item.status === 'dropped') continue;
    const ms = item.links.milestone?.trim().toUpperCase();
    if (ms) {
      if (!milestoneGroups.has(ms)) milestoneGroups.set(ms, []);
      milestoneGroups.get(ms)!.push(item);
    }
  }

  const TECH_LAYER_RULES = [
    { name: '数据持久与建表', pattern: /(?:建表|数据表|表结构|ddl|sql建表)/i },
    { name: 'Mapper与XML映射', pattern: /(?:mapper|mybatis|dao|xml映射|配套mapper)/i },
    { name: 'DTO与服务契约', pattern: /(?:dto|vo|facade\s*(?:svc\s*)?契约|接口契约|svc\s*契约)/i },
    { name: '中间件与配置注册', pattern: /(?:sofa|spring|xml注册|配置注册|bean配置)/i },
  ];

  for (const [msId, msItems] of milestoneGroups.entries()) {
    // 3.1 水平技术分层聚类检测 (例如同时出现建表、Mapper、DTO、SOFA)
    const matchedItems: { layer: string; item: BacklogItem }[] = [];
    for (const item of msItems) {
      for (const rule of TECH_LAYER_RULES) {
        if (rule.pattern.test(item.title)) {
          matchedItems.push({ layer: rule.name, item });
          break;
        }
      }
    }

    if (matchedItems.length >= 2) {
      const uniqueIds = Array.from(new Set(matchedItems.map((m) => m.item.id)));
      const titles = matchedItems.map((m) => `[${m.layer}] ${m.item.id}:${m.item.title}`);
      warnings.push({
        id: msId,
        severity: 'warning',
        field: 'granularity.layer_fragmentation',
        message: `检测到里程碑 [${msId}] 下存在水平技术分层的微型 Backlog 聚类 (${uniqueIds.join(', ')})`,
        suggestion: `建议遵循垂直业务切片 (Vertical Slice)，运行 docpath backlog merge ${uniqueIds.join(' ')} --target ${uniqueIds[0]} 合并为端到端交付特性`,
      });
    }

    // 3.2 里程碑条目过多膨胀检测 (> 8 条活跃)
    if (msItems.length > 8) {
      warnings.push({
        id: msId,
        severity: 'warning',
        field: 'milestone.backlog_bloat',
        message: `里程碑 [${msId}] 下关联了 ${msItems.length} 个活跃 Backlog (推荐 3~6 个)`,
        suggestion: `检查是否存在过度碎片化，建议使用 docpath backlog merge 合并相近的子流程或技术步骤`,
      });
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
