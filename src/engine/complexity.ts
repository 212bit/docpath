/**
 * DocPath 复杂度评估器
 * 
 * 根据用户输入的任务描述，自动判定合适的复杂度级别 (Level 0/1/2/3)。
 * 策略基于关键词匹配 + 启发式规则，不依赖 LLM 调用（Phase 1 轻量实现）。
 * 
 * Phase 2 升级为基于 LLM 的动态评估 + 中途熔断升级。
 */

import type { ComplexityLevel } from './state-machine.js';
import { LEVEL_NAMES } from './state-machine.js';

// ─── 启发式信号 ─────────────────────────────────────────

interface ComplexitySignal {
  level: ComplexityLevel;
  keywords: string[];
  description: string;
  /** 权重，匹配到多条时取最高权重 */
  weight: number;
}

const SIGNALS: ComplexitySignal[] = [
  // ── Level 0 信号: 简单操作 ──
  {
    level: 0,
    keywords: ['查', '看', '读', '找', '运行', '执行', '打开', '关闭', '重启', '启动', '停止'],
    description: '读/查/运行类简单操作',
    weight: 10,
  },
  {
    level: 0,
    keywords: ['改一个', '改一下', '改一处', '换个', '加一行', '删一行'],
    description: '单处简单修改',
    weight: 10,
  },

  // ── Level 1 信号: 轻量任务 ──
  {
    level: 1,
    keywords: ['写个', '加个', '加一个', '实现一个', '创建', '删除', '更新', '重构'],
    description: '单模块新增/修改',
    weight: 20,
  },
  {
    level: 1,
    keywords: ['bug', '问题', '修复', '修一下', '报错'],
    description: 'Bug 修复（通常单文件）',
    weight: 20,
  },
  {
    level: 1,
    keywords: ['单元测试', '测试', '加测试', '补测试'],
    description: '编写测试',
    weight: 20,
  },

  // ── Level 2 信号: 标准任务 ──
  {
    level: 2,
    keywords: ['设计', '架构', '方案', '重新设计', '重构', '迁移'],
    description: '需要设计决策',
    weight: 30,
  },
  {
    level: 2,
    keywords: ['集成', '对接', '接入', '整合', 'API', '接口'],
    description: '跨模块/外部系统集成',
    weight: 30,
  },
  {
    level: 2,
    keywords: ['新功能', '新模块', '特性', 'feature', '功能'],
    description: '新增功能（多文件改动）',
    weight: 30,
  },
  {
    level: 2,
    keywords: ['调研', '研究', '对比', '选型', '评估'],
    description: '需要前期调研',
    weight: 30,
  },

  // ── Level 3 信号: 复杂任务 ──
  {
    level: 3,
    keywords: ['跨模块', '跨服务', '分布式', '微服务', '多模块'],
    description: '跨模块跨服务协作',
    weight: 40,
  },
  {
    level: 3,
    keywords: ['多人', '团队', '协作', '派发', '分配'],
    description: '多人协作',
    weight: 40,
  },
  {
    level: 3,
    keywords: ['架构升级', '大重构', '重写', '平台级'],
    description: '大规模架构变更',
    weight: 40,
  },
];

// ─── 评估器 ─────────────────────────────────────────────

export interface ComplexityVerdict {
  level: ComplexityLevel;
  reason: string;
  signals: { keyword: string; level: ComplexityLevel; weight: number }[];
}

/**
 * 根据任务描述评估复杂度级别。
 * 
 * Phase 1: 关键词匹配 + 启发式规则
 * Phase 2: 升级为 LLM 调用 + 中途熔断机制
 */
export function evaluateComplexity(description: string): ComplexityVerdict {
  const lower = description.toLowerCase();
  const matchedSignals: ComplexityVerdict['signals'] = [];

  for (const signal of SIGNALS) {
    for (const keyword of signal.keywords) {
      if (lower.includes(keyword)) {
        matchedSignals.push({ keyword, level: signal.level, weight: signal.weight });
        break; // 一个 signal 只匹配一次
      }
    }
  }

  // 选择最高权重的匹配信号
  if (matchedSignals.length === 0) {
    // 无匹配时的默认策略
    // 如果描述很短 (< 10 chars)，可能是简单指令
    if (description.length < 10) {
      return { level: 0, reason: '短描述，默认 Level 0 即时响应', signals: [] };
    }
    // 中等长度，默认 Level 1
    return { level: 1, reason: '无明确信号，默认 Level 1 轻量任务', signals: [] };
  }

  // 按权重降序排列
  matchedSignals.sort((a, b) => b.weight - a.weight);
  const topSignal = matchedSignals[0];

  // 多条高权重信号叠加时升级
  const highWeightSignals = matchedSignals.filter((s) => s.weight >= 30);
  let level = topSignal.level;

  if (highWeightSignals.length >= 2 && level < 2) {
    level = 2;
  }
  if (highWeightSignals.length >= 3 && level < 3) {
    level = 3;
  }

  // 特殊规则: 如果描述了文件数量
  const fileCountMatch = lower.match(/(\d+)\s*个?\s*文件/);
  if (fileCountMatch) {
    const count = parseInt(fileCountMatch[1], 10);
    if (count > 5 && level < 3) level = 3;
    else if (count > 3 && level < 2) level = 2;
  }

  const signalNames = matchedSignals.map((s) => s.keyword).join(', ');
  return {
    level: level as ComplexityLevel,
    reason: `匹配关键词 [${signalNames}] → Level ${level} (${LEVEL_NAMES[level as ComplexityLevel]})`,
    signals: matchedSignals,
  };
}

/**
 * 执行中途熔断检查 — 判断是否需要升级复杂度级别。
 * 被 Claude Code 在 Level 1 执行过程中调用。
 */
export function checkEscalation(
  currentLevel: ComplexityLevel,
  filesChanged: number,
  hasDesignDecision: boolean,
  hasExternalDependency: boolean,
): { shouldEscalate: boolean; suggestedLevel: ComplexityLevel; reason: string } {
  const reasons: string[] = [];

  if (filesChanged > 5 && currentLevel < 3) {
    reasons.push(`涉及 ${filesChanged} 个文件，超过 Level ${currentLevel} 预期`);
  } else if (filesChanged > 3 && currentLevel < 2) {
    reasons.push(`涉及 ${filesChanged} 个文件，超过 Level ${currentLevel} 预期`);
  }

  if (hasDesignDecision && currentLevel < 2) {
    reasons.push('涉及架构设计决策');
  }

  if (hasExternalDependency && currentLevel < 2) {
    reasons.push('涉及外部依赖/API 集成');
  }

  if (reasons.length === 0) {
    return { shouldEscalate: false, suggestedLevel: currentLevel, reason: '' };
  }

  const suggestedLevel = Math.min(
    Math.max(
      currentLevel + 1,
      filesChanged > 5 ? 3 : 2,
      (hasDesignDecision || hasExternalDependency) ? 2 : currentLevel + 1,
    ),
    3,
  ) as ComplexityLevel;

  return {
    shouldEscalate: true,
    suggestedLevel,
    reason: reasons.join('; '),
  };
}
