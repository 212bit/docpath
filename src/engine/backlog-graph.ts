/**
 * Backlog 依赖图谱与拓扑分析 (Backlog Dependency Graph & Topology)
 *
 * 支持需求项间的依赖 (depends_on / blocks)、层级分解 (parent / children)、
 * 拓扑层级分层 (Topological Layers)、循环依赖检测 (Cycle Detection)
 * 与就绪/阻塞分析 (Ready / Blocked Status)。
 */

import type { BacklogItem, BacklogPriority, BacklogStatus } from './backlog.js';

export interface BacklogGraphNode {
  id: string;
  title: string;
  status: BacklogStatus;
  priority: BacklogPriority;
  level: number;
  parent: string | null;
  dependsOn: string[];
  blocks: string[];
  children: string[];
  layer: number;
  isBlocked: boolean;
  unresolvedDependencies: string[];
}

export interface BacklogBottleneck {
  id: string;
  title: string;
  directBlocks: number;
  totalTransitiveBlocks: number;
}

export interface BacklogGraphResult {
  nodes: Record<string, BacklogGraphNode>;
  layers: Array<{ layer: number; itemIds: string[] }>;
  cycles: string[][];
  rootItems: string[];
  readyItems: string[];
  blockedItems: string[];
  bottlenecks: BacklogBottleneck[];
  criticalPath: string[];
}

/**
 * 构建 Backlog 完整依赖图谱（包含分层、瓶颈与关键路径分析）
 */
export function buildBacklogGraph(items: BacklogItem[]): BacklogGraphResult {
  const nodes: Record<string, BacklogGraphNode> = {};
  const itemMap = new Map<string, BacklogItem>();

  for (const item of items) {
    itemMap.set(item.id, item);
    nodes[item.id] = {
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority,
      level: item.level,
      parent: item.links.parent || null,
      dependsOn: [...(item.links.depends_on || [])],
      blocks: [...(item.links.blocks || [])],
      children: [],
      layer: 1,
      isBlocked: false,
      unresolvedDependencies: [],
    };
  }

  // 1. 双向关联补全 (blocks & parent/children)
  for (const item of items) {
    const node = nodes[item.id];
    // 处理 parent -> children
    if (node.parent && nodes[node.parent]) {
      if (!nodes[node.parent].children.includes(item.id)) {
        nodes[node.parent].children.push(item.id);
      }
    }

    // 处理 depends_on -> 被依赖项的 blocks
    for (const depId of node.dependsOn) {
      if (nodes[depId] && !nodes[depId].blocks.includes(item.id)) {
        nodes[depId].blocks.push(item.id);
      }
    }

    // 处理 blocks -> 目标项的 dependsOn
    for (const blockId of node.blocks) {
      if (nodes[blockId] && !nodes[blockId].dependsOn.includes(item.id)) {
        nodes[blockId].dependsOn.push(item.id);
      }
    }
  }

  // 2. 循环依赖检测 (DFS)
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function detectCycle(u: string) {
    visited.add(u);
    recStack.add(u);
    path.push(u);

    const node = nodes[u];
    if (node) {
      for (const v of node.dependsOn) {
        if (!visited.has(v)) {
          if (nodes[v]) detectCycle(v);
        } else if (recStack.has(v)) {
          const cycleStart = path.indexOf(v);
          if (cycleStart >= 0) {
            cycles.push([...path.slice(cycleStart), v]);
          }
        }
      }
    }

    path.pop();
    recStack.delete(u);
  }

  for (const id of Object.keys(nodes)) {
    if (!visited.has(id)) {
      detectCycle(id);
    }
  }

  // 3. 阻塞状态计算 (未完成的依赖即为阻塞源)
  const readyItems: string[] = [];
  const blockedItems: string[] = [];

  for (const node of Object.values(nodes)) {
    const unresolved: string[] = [];
    for (const depId of node.dependsOn) {
      const depNode = nodes[depId];
      if (!depNode || depNode.status !== 'done') {
        unresolved.push(depId);
      }
    }
    node.unresolvedDependencies = unresolved;
    node.isBlocked = unresolved.length > 0 && node.status !== 'done' && node.status !== 'dropped';

    if (node.status !== 'done' && node.status !== 'dropped') {
      if (node.isBlocked) {
        blockedItems.push(node.id);
      } else {
        readyItems.push(node.id);
      }
    }
  }

  // 4. 拓扑分层计算 (Topological Layers)
  const memoLayer = new Map<string, number>();
  const visiting = new Set<string>();

  function calculateLayer(id: string): number {
    if (memoLayer.has(id)) return memoLayer.get(id)!;
    if (visiting.has(id)) return 1; // 环中节点兜底

    visiting.add(id);
    const node = nodes[id];
    let maxDepLayer = 0;

    if (node && node.dependsOn.length > 0) {
      for (const depId of node.dependsOn) {
        if (nodes[depId]) {
          const depL = calculateLayer(depId);
          if (depL > maxDepLayer) maxDepLayer = depL;
        }
      }
    }

    visiting.delete(id);
    const currentLayer = maxDepLayer + 1;
    memoLayer.set(id, currentLayer);
    if (node) node.layer = currentLayer;
    return currentLayer;
  }

  for (const id of Object.keys(nodes)) {
    calculateLayer(id);
  }

  // 5. 核心瓶颈点计算 (Top Blockers)
  const bottlenecks: BacklogBottleneck[] = [];
  for (const node of Object.values(nodes)) {
    if (node.status === 'done' || node.status === 'dropped') continue;
    if (node.blocks.length === 0) continue;

    // 计算可达闭包（传递阻塞数量）
    const reachable = new Set<string>();
    const queue = [...node.blocks];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (!reachable.has(curr) && curr !== node.id) {
        reachable.add(curr);
        const currNode = nodes[curr];
        if (currNode) {
          for (const next of currNode.blocks) {
            if (!reachable.has(next)) queue.push(next);
          }
        }
      }
    }

    if (reachable.size > 0) {
      bottlenecks.push({
        id: node.id,
        title: node.title,
        directBlocks: node.blocks.length,
        totalTransitiveBlocks: reachable.size,
      });
    }
  }
  bottlenecks.sort((a, b) => b.totalTransitiveBlocks - a.totalTransitiveBlocks || b.directBlocks - a.directBlocks);

  // 6. 关键路径计算 (Critical Path: 最长依赖链)
  let longestPath: string[] = [];
  const memoPath = new Map<string, string[]>();
  const pathVisiting = new Set<string>();

  function findLongestPath(id: string): string[] {
    if (memoPath.has(id)) return memoPath.get(id)!;
    if (pathVisiting.has(id)) return [id]; // 环中节点兜底

    pathVisiting.add(id);
    const node = nodes[id];
    if (!node || node.dependsOn.length === 0) {
      pathVisiting.delete(id);
      const res = [id];
      memoPath.set(id, res);
      return res;
    }

    let maxSubPath: string[] = [];
    for (const depId of node.dependsOn) {
      if (nodes[depId] && !pathVisiting.has(depId)) {
        const sub = findLongestPath(depId);
        if (sub.length > maxSubPath.length) {
          maxSubPath = sub;
        }
      }
    }

    pathVisiting.delete(id);
    const res = [...maxSubPath, id];
    memoPath.set(id, res);
    return res;
  }

  for (const id of Object.keys(nodes)) {
    const p = findLongestPath(id);
    if (p.length > longestPath.length) {
      longestPath = p;
    }
  }

  // 聚合层级
  const layerMap = new Map<number, string[]>();
  for (const node of Object.values(nodes)) {
    const l = node.layer;
    if (!layerMap.has(l)) layerMap.set(l, []);
    layerMap.get(l)!.push(node.id);
  }

  const layers = Array.from(layerMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([layer, itemIds]) => ({ layer, itemIds: itemIds.sort() }));

  const rootItems = Object.values(nodes)
    .filter((n) => !n.parent)
    .map((n) => n.id);

  return {
    nodes,
    layers,
    cycles,
    rootItems,
    readyItems,
    blockedItems,
    bottlenecks,
    criticalPath: longestPath,
  };
}

/**
 * 渲染 ASCII 拓扑与层级视图
 */
export function renderBacklogAsciiGraph(graph: BacklogGraphResult, rootId?: string): string {
  const lines: string[] = [];

  if (graph.cycles.length > 0) {
    lines.push('⚠️  检测到循环依赖 (Circular Dependencies):');
    for (const c of graph.cycles) {
      lines.push(`   ❌ ${c.join(' -> ')}`);
    }
    lines.push('');
  }

  if (rootId) {
    const rootNode = graph.nodes[rootId];
    if (!rootNode) {
      return `未找到条目 ${rootId}`;
    }
    lines.push(`=== 条目关系图: ${rootNode.id} — ${rootNode.title} ===`);
    lines.push(`状态: ${rootNode.status} | 优先级: ${rootNode.priority} | 拓扑层级: Layer ${rootNode.layer}`);
    if (rootNode.parent) {
      lines.push(`父级: ${rootNode.parent}`);
    }
    if (rootNode.dependsOn.length > 0) {
      lines.push(`依赖的前置项 (Depends On): ${rootNode.dependsOn.join(', ')}`);
    }
    if (rootNode.blocks.length > 0) {
      lines.push(`阻塞的后置项 (Blocks): ${rootNode.blocks.join(', ')}`);
    }
    if (rootNode.children.length > 0) {
      lines.push(`包含的子需求 (Children): ${rootNode.children.join(', ')}`);
    }
    lines.push(`执行状态: ${rootNode.isBlocked ? `🔒 [阻塞中: 依赖 ${rootNode.unresolvedDependencies.join(', ')}]` : '⚡ [就绪可推进]'}`);
    return lines.join('\n');
  }

  lines.push('=== Backlog 拓扑执行分层 (Execution Layers) ===\n');

  for (const layerInfo of graph.layers) {
    lines.push(`[Layer ${layerInfo.layer}]`);
    for (const id of layerInfo.itemIds) {
      const node = graph.nodes[id];
      if (!node) continue;
      const statusIcon = node.status === 'done' ? '✅' : node.status === 'active' ? '🔄' : '⬜';
      const badge = node.status === 'done'
        ? '[已完成]'
        : node.isBlocked
          ? `🔒 [阻塞: 依赖 ${node.unresolvedDependencies.join(', ')}]`
          : '⚡ [就绪]';
      const deps = node.dependsOn.length > 0 ? ` (依赖: ${node.dependsOn.join(', ')})` : '';
      lines.push(`  └─ ${statusIcon} ${node.id} [${node.priority}] ${node.title} ${badge}${deps}`);
    }
    lines.push('');
  }

  lines.push(`📊 统计: 总计 ${Object.keys(graph.nodes).length} 条 | 就绪: ${graph.readyItems.length} 条 | 阻塞: ${graph.blockedItems.length} 条`);
  return lines.join('\n');
}

/**
 * 渲染 Mermaid 图表代码
 */
export function renderBacklogMermaidGraph(graph: BacklogGraphResult): string {
  const lines: string[] = ['```mermaid', 'flowchart TD'];

  for (const node of Object.values(graph.nodes)) {
    const escapedTitle = node.title.replace(/"/g, "'");
    const label = `"${node.id}: ${escapedTitle} (${node.status})"`;
    lines.push(`  ${node.id.replace(/-/g, '_')}[${label}]`);
  }

  for (const node of Object.values(graph.nodes)) {
    const u = node.id.replace(/-/g, '_');
    for (const depId of node.dependsOn) {
      const v = depId.replace(/-/g, '_');
      lines.push(`  ${v} --> ${u}`);
    }
    if (node.parent && graph.nodes[node.parent]) {
      const p = node.parent.replace(/-/g, '_');
      lines.push(`  ${p} -. 包含 .-> ${u}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}
