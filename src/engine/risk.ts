/**
 * 任务风险分级评估器（R-338 包 1）
 *
 * 门禁强度与任务风险挂钩（而非与流程阶段挂钩）的风险信号层：
 * - R0–R3 四档确定性评估，输入为触碰文件列表与任务描述文本；
 * - 路径规则扩展 quick-guard 的 RISKY_PATH_PATTERNS 语义为分级规则；
 * - `.docpath/config.yaml` 的 `risk:` 块可追加/覆盖规则（风格沿用 quick: 块）；
 * - 纯函数可单测，不引入 LLM，验证不归执行者。
 */

import { minimatch } from 'minimatch';

/** 任务风险档位：R0 最低（文档级）→ R3 最高（契约/迁移/引擎核心） */
export type RiskTier = 0 | 1 | 2 | 3;

export const RISK_TIER_NAMES: Record<RiskTier, string> = {
  0: 'R0 文档级',
  1: 'R1 常规',
  2: 'R2 较高',
  3: 'R3 高危',
};

/** 缺省风险档位：未评估/旧任务 fallback，不改变既有门禁行为 */
export const DEFAULT_RISK_TIER: RiskTier = 1;

export interface RiskPolicy {
  /** 追加的 R3 高危路径 glob（如 'db/migrations/**'） */
  criticalPatterns?: string[];
  /** 追加的 R2 较高风险路径 glob */
  highPatterns?: string[];
  /** 追加的文本关键词：命中至少升到 R2 */
  highKeywords?: string[];
  /** 追加的文本关键词：命中至少升到 R3 */
  criticalKeywords?: string[];
  /** 影响面阈值：变更文件数达到该值至少升到 R2；默认 20 */
  highRiskFileCount?: number;
}

export const DEFAULT_RISK_POLICY: Required<RiskPolicy> = {
  criticalPatterns: [],
  highPatterns: [],
  highKeywords: [],
  criticalKeywords: [],
  highRiskFileCount: 20,
};

export interface RiskVerdict {
  tier: RiskTier;
  reasons: string[];
  policy: Required<RiskPolicy>;
}

/** 内置 R3 路径规则：契约/迁移/CI/引擎核心/协议模板（扩展 quick-guard 语义） */
const CRITICAL_PATH_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\.github\//, reason: 'CI/CD 配置变更' },
  { pattern: /(^|\/)migrations?\//i, reason: '迁移脚本变更' },
  { pattern: /\.(sql|proto|graphql|gql)$/i, reason: 'schema/契约文件变更' },
  { pattern: /openapi|swagger/i, reason: 'API 契约变更' },
  { pattern: /^src\/engine\//, reason: '核心工作流引擎变更' },
  { pattern: /^templates\/(AGENTS|CLAUDE|OPENCODE|SKILL)\.md$/, reason: 'Agent 协议模板变更' },
  { pattern: /^\.docpath\/rules\//, reason: '全局规则变更' },
];

/** 内置 R2 路径规则：生命周期命令/核心工具/依赖与构建契约 */
const HIGH_PATH_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^package(?:-lock)?\.json$/, reason: '包契约变更' },
  { pattern: /^pnpm-lock\.yaml$/, reason: '依赖锁文件变更' },
  { pattern: /^src\/commands\//, reason: '生命周期命令变更' },
  { pattern: /^src\/utils\//, reason: '核心工具层变更' },
  { pattern: /^(tsup|webpack|rollup|vite)\.config\./, reason: '构建配置变更' },
  { pattern: /^\.docpath\/protocols?\//, reason: '协议资产变更' },
];

/** 内置文本信号：命中至少升到对应档位 */
const CRITICAL_TEXT_KEYWORDS = ['迁移', 'migration', '权限', 'permission', '安全边界', '破坏性'];
const HIGH_TEXT_KEYWORDS = ['契约', 'contract', 'api', 'schema', '接口', 'ci/cd', '工作流', '门禁'];

function textHasKeyword(text: string, keywords: string[]): string | null {
  const lowered = text.toLowerCase();
  const hit = keywords.find((keyword) => lowered.includes(keyword.toLowerCase()));
  return hit ?? null;
}

function tierFromPath(file: string, policy: Required<RiskPolicy>): { tier: RiskTier; reason: string } | null {
  for (const glob of policy.criticalPatterns) {
    if (minimatch(file, glob, { dot: true })) return { tier: 3, reason: `${file}: 命中高危路径规则 ${glob}` };
  }
  for (const rule of CRITICAL_PATH_RULES) {
    if (rule.pattern.test(file)) return { tier: 3, reason: `${file}: ${rule.reason}` };
  }
  for (const glob of policy.highPatterns) {
    if (minimatch(file, glob, { dot: true })) return { tier: 2, reason: `${file}: 命中较高风险路径规则 ${glob}` };
  }
  for (const rule of HIGH_PATH_RULES) {
    if (rule.pattern.test(file)) return { tier: 2, reason: `${file}: ${rule.reason}` };
  }
  return null;
}

/**
 * config.yaml `risk:` 块（snake_case）→ 内部 RiskPolicy（camelCase）。
 * 类型于 src/types/config.ts RiskPolicyConfig 声明，此处做运行期宽容解析。
 */
export function riskPolicyFromConfig(value?: {
  critical_patterns?: unknown;
  high_patterns?: unknown;
  high_keywords?: unknown;
  critical_keywords?: unknown;
  high_risk_file_count?: unknown;
} | null): RiskPolicy {
  if (!value) return {};
  return {
    criticalPatterns: Array.isArray(value.critical_patterns) ? value.critical_patterns as string[] : undefined,
    highPatterns: Array.isArray(value.high_patterns) ? value.high_patterns as string[] : undefined,
    highKeywords: Array.isArray(value.high_keywords) ? value.high_keywords as string[] : undefined,
    criticalKeywords: Array.isArray(value.critical_keywords) ? value.critical_keywords as string[] : undefined,
    highRiskFileCount: typeof value.high_risk_file_count === 'number' ? value.high_risk_file_count : undefined,
  };
}

/** 归一化用户/缺省策略；非法输入静默回退到内置默认 */
export function normalizeRiskPolicy(value?: RiskPolicy | null): Required<RiskPolicy> {  const policy = { ...DEFAULT_RISK_POLICY };
  if (!value) return policy;
  if (Array.isArray(value.criticalPatterns)) {
    policy.criticalPatterns = value.criticalPatterns.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (Array.isArray(value.highPatterns)) {
    policy.highPatterns = value.highPatterns.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (Array.isArray(value.highKeywords)) {
    policy.highKeywords = value.highKeywords.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (Array.isArray(value.criticalKeywords)) {
    policy.criticalKeywords = value.criticalKeywords.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value.highRiskFileCount === 'number' && Number.isFinite(value.highRiskFileCount) && value.highRiskFileCount > 0) {
    policy.highRiskFileCount = Math.floor(value.highRiskFileCount);
  }
  return policy;
}

export interface RiskEvaluationInput {
  /** 触碰文件（相对路径）；创建期可缺省 */
  files?: string[];
  /** 任务描述/标题等文本信号源；可缺省 */
  text?: string;
  /** 显式传入策略（已读 config）；未传时用内置默认 */
  policy?: RiskPolicy | null;
}

/**
 * 确定性风险评估：各信号独立给出候选档位，取最大值。
 * 无任何信号的缺省结果为 R1（常规），保证与既有行为兼容。
 */
export function evaluateTaskRisk(input: RiskEvaluationInput): RiskVerdict {
  const policy = normalizeRiskPolicy(input.policy);
  const reasons: string[] = [];
  let tier: RiskTier = DEFAULT_RISK_TIER;

  const escalate = (candidate: RiskTier, reason: string): void => {
    if (candidate > tier) {
      tier = candidate;
      reasons.push(reason);
    }
  };

  for (const file of input.files || []) {
    const hit = tierFromPath(file, policy);
    if (hit) escalate(hit.tier, hit.reason);
  }

  const text = (input.text || '').trim();
  if (text) {
    const criticalHit = textHasKeyword(text, [...CRITICAL_TEXT_KEYWORDS, ...policy.criticalKeywords]);
    if (criticalHit) escalate(3, `文本信号命中高危关键词: ${criticalHit}`);
    const highHit = textHasKeyword(text, [...HIGH_TEXT_KEYWORDS, ...policy.highKeywords]);
    if (highHit) escalate(2, `文本信号命中较高风险关键词: ${highHit}`);
  }

  const fileCount = (input.files || []).length;
  if (fileCount >= policy.highRiskFileCount) {
    escalate(2, `变更文件数 ${fileCount} 达到影响面阈值 ${policy.highRiskFileCount}`);
  }

  return { tier, reasons, policy };
}

export function maxRiskTier(a: RiskTier, b: RiskTier): RiskTier {
  return (a > b ? a : b) as RiskTier;
}

/** 风险只升不降：以已记录档位为下限取 max */
export function atLeastRiskTier(recorded: number | null | undefined, evaluated: RiskTier): RiskTier {
  const base = (typeof recorded === 'number' && recorded >= 0 && recorded <= 3 ? recorded : DEFAULT_RISK_TIER) as RiskTier;
  return maxRiskTier(base, evaluated);
}

/** 风险档位显示名；未知值回退 R1 */
export function riskTierName(tier: RiskTier | null | undefined): string {
  const normalized = typeof tier === 'number' && tier >= 0 && tier <= 3 ? (tier as RiskTier) : DEFAULT_RISK_TIER;
  return RISK_TIER_NAMES[normalized];
}

/** 风险档位归一化：非法/缺省值回退 DEFAULT_RISK_TIER（R1） */
export function normalizeRiskTier(value: unknown): RiskTier {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3
    ? (value as RiskTier)
    : DEFAULT_RISK_TIER;
}

export interface RiskReassessment {
  /** 复评基线：已记录档位；未评估任务回退 R1 */
  baseline: RiskTier;
  /** 复评后的档位（max(基线, 本次评估)） */
  tier: RiskTier;
  /** 本次是否发生升级（评估档位严格高于基线） */
  escalated: boolean;
  reasons: string[];
}

/**
 * check 期风险复评（只升不降）的纯函数部分：
 * 以已记录档位为下限，取「实际 diff 文件 + 任务标题文本」评估结果的最大值。
 * escalated 仅在评估档位严格高于基线且有具体理由时为 true（避免基线补录噪音）。
 */
export function reassessRiskTier(
  recorded: number | null | undefined,
  input: { files?: string[]; text?: string; policy?: RiskPolicy | null } = {},
): RiskReassessment {
  const verdict = evaluateTaskRisk(input);
  const baseline = normalizeRiskTier(recorded);
  const tier = atLeastRiskTier(recorded, verdict.tier);
  const escalated = verdict.tier > baseline && verdict.reasons.length > 0;
  return { baseline, tier, escalated, reasons: verdict.reasons };
}
