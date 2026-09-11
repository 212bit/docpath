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
   * 工作流配置（R-334 起真正被读取；init 写入的历史字段如 auto_brainstorm 保持声明性兼容）。
   * agent_flow: Agent 辅助开发模式——门禁降级为证据化软门禁（STRATEGIC 路径信号→advisory，
   * 完成度改认领 done 即绿），plan level≤2 默认单步压缩，go 提供 --accept-dirty 恢复旗标。
   * 默认缺省 false（用户项目不受影响）。
   */
  workflow?: {
    agent_flow?: boolean;
    auto_brainstorm?: boolean;
    auto_subagent?: boolean;
    enforce_tdd?: boolean;
    enforce_review?: boolean;
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

  /**
   * scan-existing 从项目 manifest 提取的命令（FR-3）。
   * 每条可空（未探测到 → 该字段缺省，配合 CLAUDE.md 的 TODO 提示）。
   */
  project_commands?: {
    test?: string;
    build?: string;
    format?: string;
    lint?: string;
  };
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
