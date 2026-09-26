/**
 * DocPath Architecture Drift Guard Engine
 *
 * 架构分层防腐与循环依赖体检门禁：
 * 校验分层单向流动 (types -> utils -> engine -> governance -> commands -> cli)，
 * 自动拦截逆向引用、循环依赖与跨层未授权调用。
 */

import {
  buildDependencyGraph,
  findCircularDependencies,
  type DependencyGraph,
  type DependencyCycle,
} from './dependency-graph.js';

export interface ArchitectureLayer {
  name: string;
  level: number;
  pattern: RegExp;
  description: string;
}

export interface ArchitectureViolation {
  type: 'layer_inversion' | 'circular_dependency' | 'forbidden_import';
  severity: 'error' | 'warning';
  file: string;
  target: string;
  message: string;
  rule: string;
}

export interface ArchitectureReport {
  passed: boolean;
  violations: ArchitectureViolation[];
  circular_cycles: DependencyCycle[];
  layer_stats: Record<string, number>;
  stats: {
    total_files: number;
    total_violations: number;
    errors: number;
    warnings: number;
  };
}

export const DEFAULT_ARCH_LAYERS: ArchitectureLayer[] = [
  {
    name: 'types',
    level: 0,
    pattern: /^src\/(?:types|schemas)\//,
    description: '类型与 Schema 基础定义层 (禁止依赖任何上层逻辑)',
  },
  {
    name: 'utils',
    level: 1,
    pattern: /^src\/utils\//,
    description: '纯函数工具与基础辅助层 (只允许依赖 types)',
  },
  {
    name: 'engine',
    level: 2,
    pattern: /^src\/engine\//,
    description: '核心状态机与工作流引擎层 (允许依赖 types, utils)',
  },
  {
    name: 'governance',
    level: 3,
    pattern: /^src\/governance\//,
    description: '规则仲裁与重大决策治理层 (允许依赖 types, utils, engine)',
  },
  {
    name: 'commands',
    level: 4,
    pattern: /^src\/commands\//,
    description: 'CLI 命令与交互表现层 (允许依赖 types, utils, engine, governance)',
  },
  {
    name: 'cli',
    level: 5,
    pattern: /^src\/(?:index|cli)\.[cm]?[jt]s$/,
    description: '程序入口与装配层',
  },
];

/**
 * 获取文件所属的架构层级
 */
export function getFileLayer(
  filePath: string,
  layers: ArchitectureLayer[] = DEFAULT_ARCH_LAYERS,
): ArchitectureLayer | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const layer of layers) {
    if (layer.pattern.test(normalized)) {
      return layer;
    }
  }
  return null;
}

/**
 * 执行完整的架构防腐与循环引用体检
 */
export async function checkArchitectureLayers(
  cwd: string,
  options: {
    strict?: boolean;
    layers?: ArchitectureLayer[];
    graph?: DependencyGraph;
  } = {},
): Promise<ArchitectureReport> {
  const layers = options.layers || DEFAULT_ARCH_LAYERS;
  const graph = options.graph || (await buildDependencyGraph(cwd, ['src']));

  const violations: ArchitectureViolation[] = [];
  const layerStats: Record<string, number> = {};

  for (const layer of layers) {
    layerStats[layer.name] = 0;
  }

  // 1. 分层单向依赖校验 (Layer Inversion Check)
  for (const [file, node] of graph.nodes.entries()) {
    // 仅校验 src/ 目录内的架构
    if (!file.startsWith('src/')) continue;

    const sourceLayer = getFileLayer(file, layers);
    if (sourceLayer) {
      layerStats[sourceLayer.name] = (layerStats[sourceLayer.name] || 0) + 1;
    }

    for (const importTarget of node.imports) {
      if (!importTarget.startsWith('src/')) continue;

      const targetLayer = getFileLayer(importTarget, layers);
      if (sourceLayer && targetLayer) {
        // 违规：低层模块反向引用了高层模块
        if (targetLayer.level > sourceLayer.level) {
          violations.push({
            type: 'layer_inversion',
            severity: 'error',
            file,
            target: importTarget,
            message: `分层逆向依赖: [Layer ${sourceLayer.level}: ${sourceLayer.name}] 违规引用了高层模块 [Layer ${targetLayer.level}: ${targetLayer.name}]`,
            rule: `层级单向约束: ${sourceLayer.name} ➔ ${targetLayer.name} 是非法的逆向流动`,
          });
        }
      }
    }
  }

  // 2. 循环依赖检查 (Circular Dependency Check)
  const circularCycles = findCircularDependencies(graph);
  for (const cycle of circularCycles) {
    violations.push({
      type: 'circular_dependency',
      severity: options.strict ? 'error' : 'warning',
      file: cycle.path[0],
      target: cycle.path[cycle.path.length - 1],
      message: `检测到循环依赖闭环: ${cycle.display}`,
      rule: '模块间严禁相互递归依赖，请通过提取共享接口或事件解耦',
    });
  }

  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;

  return {
    passed: errors === 0,
    violations,
    circular_cycles: circularCycles,
    layer_stats: layerStats,
    stats: {
      total_files: graph.allFiles.filter((f) => f.startsWith('src/')).length,
      total_violations: violations.length,
      errors,
      warnings,
    },
  };
}
