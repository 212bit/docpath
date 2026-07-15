/**
 * DocPath 配置加载工具
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';
import { DEFAULT_ARTIFACT_CONFIG, mergeArtifactConfig, mergeDocumentScanPaths, type ArtifactConfig, type DocPathConfig } from '../types/config.js';

/**
 * 读取 DocPath 配置文件
 *
 * 优先级：项目 .docpath/config.json > 全局 ~/.docpath/config.json > 默认值
 */
export async function readDocPathConfig(cwd: string): Promise<DocPathConfig> {
  const docpathDir = await resolveDocpathDir(cwd);
  const projectConfigPath = join(docpathDir, 'config.json');

  let config: DocPathConfig = {};

  // 读取项目配置
  if (existsSync(projectConfigPath)) {
    try {
      const content = await readFile(projectConfigPath, 'utf-8');
      config = JSON.parse(content) as DocPathConfig;
    } catch (error) {
      console.warn(`Warning: Failed to parse ${projectConfigPath}:`, error);
    }
  }

  return config;
}

/**
 * 读取 Artifact 配置（合并默认值）
 */
export async function readArtifactConfig(cwd: string): Promise<ArtifactConfig> {
  const config = await readDocPathConfig(cwd);
  return mergeArtifactConfig(config.artifacts);
}

/**
 * 读取 document_scan_paths（合并默认值，向后兼容）。
 * 用于 docs scan（FR-5）决定扫哪些根路径。
 */
export async function readDocumentScanPaths(cwd: string): Promise<string[]> {
  const config = await readDocPathConfig(cwd);
  return mergeDocumentScanPaths(config.document_scan_paths);
}
