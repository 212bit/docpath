/**
 * DocPath 配置类型定义
 */

/**
 * Artifact 生成策略配置
 */
export interface ArtifactConfig {
  /** 是否默认生成 Markdown 渲染视图（从 JSON 派生） */
  generate_md_views: boolean;

  /** 是否支持按需渲染（通过 docpath render 命令） */
  generate_on_demand: boolean;

  /** decisions.md 是否按月自动归档 */
  archive_decisions_monthly: boolean;

  /** decisions.md 保留窗口（天数，超过此窗口的决策会被归档） */
  decisions_retention_days: number;

  /** 需要保留的 workspace 视图文件列表 */
  keep_workspace_views: string[];
}

/**
 * DocPath 配置根对象
 */
export interface DocPathConfig {
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
  generate_on_demand: true,
  archive_decisions_monthly: true,
  decisions_retention_days: 30,
  keep_workspace_views: ['current.md', 'last-check.md', 'review.md'],
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
