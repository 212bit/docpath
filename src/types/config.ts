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
