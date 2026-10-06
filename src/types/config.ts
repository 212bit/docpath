/**
 * DocPath 配置类型定义
 */

/**
 * Artifact 生成策略配置
 *
 * 迁移注释 (R-275, 2026-07-16): 曾有 generate_on_demand、archive_decisions_monthly、
 * decisions_retention_days、keep_workspace_views 四个字段, 定义后从未被任何代码读取
 * (render 恒可用; decisions 老化由 gcDecisions 固定按月归档、默认 14 天; workspace
 * 清理走 workspace-cleanup.ts 硬编码四区域), 已删除。用户 config.json 中残留这些
 * 字段无任何行为影响, 可安全移除。
 */
export interface ArtifactConfig {
  /** 是否默认生成 Markdown 渲染视图（从 JSON 派生） */
  generate_md_views: boolean;
}

/**
 * DocPath 配置根对象
 */
export interface DocPathConfig {
  /**
   * 工作流配置。R-336 FR-3: 历史声明性字段 auto_brainstorm/auto_subagent/
   * enforce_tdd/enforce_review 因 grep 实证零消费方已删除（R-275 模式），
   * 用户 config 残留无行为影响。当前唯一被读取的字段是 agent_flow。
   */
  workflow?: {
    /** Agent 辅助开发模式——门禁降级为证据化软门禁（R-334） */
    agent_flow?: boolean;
  };

  /** Artifact 生成策略 */
  artifacts?: ArtifactConfig;

  /** Review Skill Router 配置 */
  review_skill_gate?: {
    /** 是否启用语言级 review skill gate；默认启用 */
    enabled?: boolean;
  };

  /**
   * docpath docs scan 扫描外部文档路径的根列表（FR-4 / FR-5）。
   * 默认 [".docpath/", "README.md", "docs/"]；缺省时兜底默认值（向后兼容）。
   * docs scan 逐路径扫描合并索引，noise 按 §4.d（.gitignore + 硬黑名单）排除。
   */
  document_scan_paths?: string[];

  /** 任务风险分级规则覆盖（R-338）：追加/调整 engine/risk.ts 的确定性评估信号 */
  risk?: RiskPolicyConfig;

  /** 自定义 check 门禁命令配置 */
  check?: CheckConfig;

  /** worktree 行为配置（R-345）：合并冲突自动消解的可重建路径扩展 */
  worktree?: {
    /** 追加的可自动消解冲突路径（在内置 docs-index.json/backlog.md 之外） */
    auto_resolve_paths?: string[];
  };

  /** Git 提交与署名配置 */
  git?: {
    /** 是否启用自动 Co-Authored-By 署名（支持布尔值开关或自定义署名字符串） */
    co_author?: boolean | string;
  };

  /** Agent 运行时与协议适配配置 */
  agent?: {
    /** 覆盖当前 Agent 名称 */
    name?: string;
    /** 覆盖 Co-Author 签名 */
    co_author?: boolean | string;
  };

  // R-336 FR-3: project_commands 已删除（grep 零消费方，init 不再写入）
}

/**
 * 自定义 check 检查项配置
 */
export interface CheckCommandItem {
  /** 检查项名称（展示用） */
  name?: string;
  /** 可执行命令 */
  command: string;
  /** 类别：compile | lint | test */
  category?: 'compile' | 'lint' | 'test';
  /** 超时时间（毫秒） */
  timeout_ms?: number;
}

/**
 * 自定义 check 门禁配置
 */
export interface CheckConfig {
  /** 单条自定义 check 命令（如 "make check"） */
  command?: string;
  /** 多条自定义 check 命令列表 */
  commands?: Array<string | CheckCommandItem>;
  /** 触发全量测试/回归的高危核心路径模式（glob 列表） */
  risky_patterns?: string[];
  /** 参与代码范围指纹（scope digest）计算的源码与配置目录/文件列表 */
  code_scope_paths?: string[];
}

/**
 * 任务风险分级规则配置（R-338）
 */
export interface RiskPolicyConfig {
  /** 追加的 R3 高危路径 glob */
  critical_patterns?: string[];
  /** 追加的 R2 较高风险路径 glob */
  high_patterns?: string[];
  /** 追加的文本关键词：命中至少升到 R2 */
  high_keywords?: string[];
  /** 追加的文本关键词：命中至少升到 R3 */
  critical_keywords?: string[];
  /** 影响面阈值：变更文件数达到该值至少升到 R2；默认 20 */
  high_risk_file_count?: number;
}

/**
 * Artifact 配置默认值
 */
export const DEFAULT_ARTIFACT_CONFIG: ArtifactConfig = {
  generate_md_views: false,
};

/**
 * 合并用户配置与默认配置
 */
export function mergeArtifactConfig(userConfig?: Partial<ArtifactConfig>): ArtifactConfig {
  return {
    ...DEFAULT_ARTIFACT_CONFIG,
    ...userConfig,
  };
}

/**
 * document_scan_paths 默认值（FR-4 / FR-5）。
 * 仅扫这三项；外部 docs/ 等目录交给用户显式追加。
 */
export const DEFAULT_DOCUMENT_SCAN_PATHS: string[] = ['.docpath/', 'README.md', 'docs/'];

/**
 * 合并 document_scan_paths 与默认值：用户未声明/为空 → 走默认（向后兼容）。
 */
export function mergeDocumentScanPaths(userConfig?: string[]): string[] {
  if (!userConfig || !Array.isArray(userConfig) || userConfig.length === 0) {
    return [...DEFAULT_DOCUMENT_SCAN_PATHS];
  }
  return [...userConfig];
}
