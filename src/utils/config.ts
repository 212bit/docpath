/**
 * DocPath 配置加载工具
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
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
 * 读取 document_scan_paths 并合并默认值（FR-4 兜底风格，同 DEFAULT_ARTIFACT_CONFIG）。
 * 注意：docs scan（FR-5）不用本函数 —— 未声明字段时必须保持仅扫 .docpath/ 的现状，
 * 请用 readDeclaredDocumentScanPaths 获取原始声明。
 */
export async function readDocumentScanPaths(cwd: string): Promise<string[]> {
  const config = await readDocPathConfig(cwd);
  return mergeDocumentScanPaths(config.document_scan_paths);
}

/** 过滤出用户实际声明的路径列表；未声明/非数组/全空 → null。 */
function normalizeDeclaredScanPaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length > 0 ? items : null;
}

/**
 * 读取用户显式声明的 document_scan_paths（FR-5 原始语义，不合并默认值）。
 *
 * docs scan 用它决定是否扫外部路径：返回 null 表示未声明该字段，
 * 此时 docs scan 必须保持现状（仅扫 .docpath/，NFR-1 向后兼容）。
 * 优先读 init 写入的 .docpath/config.yaml，回退兼容 .docpath/config.json。
 */
export async function readDeclaredDocumentScanPaths(cwd: string): Promise<string[] | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const yamlPath = join(docpathDir, 'config.yaml');
  if (existsSync(yamlPath)) {
    try {
      const parsed = parseYaml(await readFile(yamlPath, 'utf-8')) as { document_scan_paths?: unknown } | null;
      const declared = normalizeDeclaredScanPaths(parsed?.document_scan_paths);
      if (declared) return declared;
    } catch (error) {
      console.warn(`Warning: Failed to parse ${yamlPath}:`, error);
    }
  }
  const config = await readDocPathConfig(cwd);
  return normalizeDeclaredScanPaths(config.document_scan_paths);
}
