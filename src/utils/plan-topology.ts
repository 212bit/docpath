/**
 * 计划依赖拓扑与分支可视化引擎 (Plan Dependency Topology & Visualization)
 *
 * 支持：
 * 1. 多前置/多分支依赖解析 (S1, S2 / S1、S2 / 无)
 * 2. DAG 拓扑分层、并发/并行步骤计算 (Parallel tracks)
 * 3. 循环依赖 (Cycle) 与缺失依赖检测
 * 4. 就绪态 (isReady) 与未满足依赖计算 (unmetDependencies)
 * 5. ASCII 拓扑分支图与 Mermaid 流程图生成
 */

export interface StepLike {
  id: string;
  name?: string;
  description?: string;
  acceptance?: string;
  dependencies?: string;
  status?: string;
  done?: boolean;
}

export interface PlanTopologyNode {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked';
  dependencies: string[];
  dependents: string[];
  layer: number;
  isReady: boolean;
  unmetDependencies: string[];
}

export interface PlanTopology {
  nodes: Map<string, PlanTopologyNode>;
  layers: PlanTopologyNode[][];
  roots: string[];
  leaves: string[];
  cycles: string[][];
  missingDeps: Array<{ stepId: string; missingDep: string }>;
  hasErrors: boolean;
  readySteps: string[];
  blockedSteps: string[];
  parallelTracks: string[][];
}

/**
 * 解析步骤依赖文本为规范的步骤 ID 列表
 * 支持逗号、顿号、斜杠、空格、and/和等多种分隔形式
 */
export function parseStepDependencies(depStr: string | undefined | null): string[] {
  if (!depStr) return [];
  const trimmed = depStr.trim();
  if (!trimmed || /^(无|none|None|null|-|N\/A|nil)$/i.test(trimmed)) return [];

  // 提取形如 S1, S2.1, T-1 等步骤 ID
  const matches = trimmed.match(/\b(S\d+(?:\.\d+)?|T[\w-]+)\b/g);
  if (matches && matches.length > 0) {
    return Array.from(new Set(matches));
  }

  // 后备拆分：按逗号、顿号、分号、斜杠、和、空格切分
  return trimmed
    .split(/[,，、;/\\&\s+]+|(?:\s+(?:and|和|与)\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(无|none|None|null|-|N\/A)$/i.test(s));
}

function normalizeStatus(step: StepLike): 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked' {
  if (step.done) return 'done';
  if (step.status === 'done') return 'done';
  if (step.status === 'in_progress') return 'in_progress';
  if (step.status === 'skipped') return 'skipped';
  if (step.status === 'blocked') return 'blocked';
  return 'pending';
}

/**
 * 构建并计算 Plan 的 DAG 依赖拓扑
 */
export function buildPlanTopology(steps: StepLike[]): PlanTopology {
  const nodeMap = new Map<string, PlanTopologyNode>();
  const idSet = new Set(steps.map((s) => s.id));
  const missingDeps: Array<{ stepId: string; missingDep: string }> = [];

  // 1. 初始化所有节点
  for (const step of steps) {
    const rawDeps = parseStepDependencies(step.dependencies);
    const validDeps: string[] = [];
    for (const dep of rawDeps) {
      if (idSet.has(dep)) {
        validDeps.push(dep);
      } else {
        missingDeps.push({ stepId: step.id, missingDep: dep });
      }
    }

    nodeMap.set(step.id, {
      id: step.id,
      name: step.name || step.id,
      status: normalizeStatus(step),
      dependencies: validDeps,
      dependents: [],
      layer: 0,
      isReady: false,
      unmetDependencies: [],
    });
  }

  // 2. 建立反向依赖（dependents）
  for (const node of nodeMap.values()) {
    for (const depId of node.dependencies) {
      const parent = nodeMap.get(depId);
      if (parent && !parent.dependents.includes(node.id)) {
        parent.dependents.push(node.id);
      }
    }
  }

  // 3. 计算就绪态 (isReady) 与未满足依赖 (unmetDependencies)
  const readySteps: string[] = [];
  const blockedSteps: string[] = [];
  for (const node of nodeMap.values()) {
    const unmet = node.dependencies.filter((depId) => {
      const depNode = nodeMap.get(depId);
      return !depNode || (depNode.status !== 'done' && depNode.status !== 'skipped');
    });
    node.unmetDependencies = unmet;
    node.isReady = node.status !== 'done' && node.status !== 'skipped' && unmet.length === 0;
    if (node.isReady) {
      readySteps.push(node.id);
    } else if (node.status !== 'done' && node.status !== 'skipped') {
      blockedSteps.push(node.id);
    }
  }

  // 4. 拓扑分层与环检测 (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  for (const [id, node] of nodeMap.entries()) {
    inDegree.set(id, node.dependencies.length);
  }

  let queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const layers: PlanTopologyNode[][] = [];
  let currentLayerIndex = 0;
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentLayerNodes: PlanTopologyNode[] = [];
    const nextQueue: string[] = [];

    for (const id of queue) {
      visited.add(id);
      const node = nodeMap.get(id)!;
      node.layer = currentLayerIndex;
      currentLayerNodes.push(node);

      for (const childId of node.dependents) {
        const remaining = (inDegree.get(childId) ?? 1) - 1;
        inDegree.set(childId, remaining);
        if (remaining === 0) {
          nextQueue.push(childId);
        }
      }
    }

    if (currentLayerNodes.length > 0) {
      layers.push(currentLayerNodes);
      currentLayerIndex++;
    }
    queue = nextQueue;
  }

  // 5. 环检测
  const cycles: string[][] = [];
  if (visited.size < nodeMap.size) {
    const unvisited = Array.from(nodeMap.keys()).filter((id) => !visited.has(id));
    cycles.push(unvisited);
  }

  // 6. 识别根节点与叶节点
  const roots = Array.from(nodeMap.values())
    .filter((node) => node.dependencies.length === 0)
    .map((node) => node.id);
  const leaves = Array.from(nodeMap.values())
    .filter((node) => node.dependents.length === 0)
    .map((node) => node.id);

  // 7. 识别可并发轨道 (同层包含多个节点的层即代表可并行步骤)
  const parallelTracks = layers
    .filter((layer) => layer.length > 1)
    .map((layer) => layer.map((node) => node.id));

  return {
    nodes: nodeMap,
    layers,
    roots,
    leaves,
    cycles,
    missingDeps,
    hasErrors: cycles.length > 0 || missingDeps.length > 0,
    readySteps,
    blockedSteps,
    parallelTracks,
  };
}

const STATUS_ICONS: Record<string, string> = {
  done: '✅',
  in_progress: '🔄',
  skipped: '⏭️',
  blocked: '🚫',
  pending: '⬜',
};

/**
 * 渲染 ASCII 拓扑分支结构（适合 CLI 终端输出与文本展示）
 */
export function renderAsciiTopology(topology: PlanTopology): string {
  if (topology.nodes.size === 0) return '（无计划步骤）';

  const lines: string[] = [];

  if (topology.cycles.length > 0) {
    lines.push('⚠️  [环状依赖警告] 以下步骤存在循环依赖: ' + topology.cycles.map((c) => c.join(' ↔ ')).join('; '));
  }
  if (topology.missingDeps.length > 0) {
    lines.push('⚠️  [缺失依赖警告] ' + topology.missingDeps.map((m) => `${m.stepId} 引用了未定义的步骤 ${m.missingDep}`).join(', '));
  }

  for (let i = 0; i < topology.layers.length; i++) {
    const layer = topology.layers[i];
    const isParallel = layer.length > 1;
    const layerTitle = `[Layer ${i + 1}]${isParallel ? ' (可并发)' : ''}`;
    lines.push(layerTitle);

    for (let j = 0; j < layer.length; j++) {
      const node = layer[j];
      const isLast = j === layer.length - 1;
      const prefix = isLast ? '  └─ ' : '  ├─ ';
      const icon = STATUS_ICONS[node.status] || '⬜';
      const depInfo = node.dependencies.length > 0 ? ` (依赖: ${node.dependencies.join(', ')})` : '';
      const readyTag = node.isReady ? ' ⚡[就绪]' : '';
      lines.push(`${prefix}${icon} ${node.id}: ${node.name}${depInfo}${readyTag}`);
    }
  }

  return lines.join('\n');
}

/**
 * 渲染 Mermaid 流程图（适合 Markdown 与文档视图）
 */
export function renderMermaidTopology(topology: PlanTopology): string {
  if (topology.nodes.size === 0) return '';

  const lines = ['```mermaid', 'flowchart TD'];

  // 1. 节点定义与样式
  for (const node of topology.nodes.values()) {
    const icon = STATUS_ICONS[node.status] || '';
    const label = `${node.id}: ${node.name} ${icon}`.replace(/"/g, "'").trim();
    lines.push(`  ${node.id}["${label}"]`);
  }

  lines.push('');

  // 2. 边定义
  let hasEdges = false;
  for (const node of topology.nodes.values()) {
    for (const depId of node.dependencies) {
      lines.push(`  ${depId} --> ${node.id}`);
      hasEdges = true;
    }
  }

  // 如果所有节点都无显式依赖，生成线性链条作为默认关系
  if (!hasEdges && topology.nodes.size > 1) {
    const nodeIds = Array.from(topology.nodes.keys());
    lines.push(`  ${nodeIds.join(' --> ')}`);
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * 渲染紧凑的线性或多分支文本依赖关系图
 * 用于替换旧版简单的 `S1 → S2 → S3`
 */
export function renderPlanDependencyGraph(topology: PlanTopology): string {
  if (topology.nodes.size === 0) return '无';

  // 检查是否为纯线性 DAG（每层且仅有 1 个节点）
  const isLinear = topology.layers.length > 0 && topology.layers.every((layer) => layer.length === 1);
  if (isLinear) {
    return topology.layers.map((layer) => layer[0].id).join(' → ');
  }

  // 多分支拓扑：生成分支路径表达式
  const edges: string[] = [];
  for (const node of topology.nodes.values()) {
    if (node.dependencies.length > 0) {
      for (const dep of node.dependencies) {
        edges.push(`${dep} → ${node.id}`);
      }
    }
  }

  if (edges.length > 0) {
    return edges.join('\n');
  }

  return Array.from(topology.nodes.keys()).join(' → ');
}
