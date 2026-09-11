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
 * 读取 DocPath 配置 —— 唯一出口（R-294 合一）。
 *
 * 真源与优先级：config.yaml（init 写入的项目配置）优先，config.json（历史/
 * 特性配置如 artifacts、review_skill_gate）按顶层字段回退填充；冲突 yaml 胜
 * （rules 既定惯例：消费方优先 yaml、需要兼容时回退 json）。
 * 此前 readDocPathConfig 只读 json，init 写入 yaml 的字段经它永远不可见
 * （S5 事故类）；各消费方按字段自选真源的分裂就此收敛。
 */
export async function readDocPathConfig(cwd: string): Promise<DocPathConfig> {
  const docpathDir = await resolveDocpathDir(cwd);

  let jsonConfig: DocPathConfig = {};
  const projectConfigPath = join(docpathDir, 'config.json');
  if (existsSync(projectConfigPath)) {
    try {
      jsonConfig = JSON.parse(await readFile(projectConfigPath, 'utf-8')) as DocPathConfig;
    } catch (error) {
      console.warn(`Warning: Failed to parse ${projectConfigPath}:`, error);
    }
  }

  let yamlConfig: DocPathConfig = {};
  const yamlPath = join(docpathDir, 'config.yaml');
  if (existsSync(yamlPath)) {
    try {
      yamlConfig = (parseYaml(await readFile(yamlPath, 'utf-8')) as DocPathConfig | null) ?? {};
    } catch (error) {
      console.warn(`Warning: Failed to parse ${yamlPath}:`, error);
    }
  }

  // 顶层字段浅合并：yaml 胜，json 回退填充。
  return { ...jsonConfig, ...yamlConfig };
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

/**
 * R-334: 读取 agent_flow 开关（缺省 false，用户项目不受影响）。
 */
export async function readAgentFlow(cwd: string): Promise<boolean> {
  const config = await readDocPathConfig(cwd);
  return config.workflow?.agent_flow === true;
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
 * R-294：字段级 yaml 特判退役，统一走 readDocPathConfig（yaml 优先 + json 回退）。
 */
export async function readDeclaredDocumentScanPaths(cwd: string): Promise<string[] | null> {
  const config = await readDocPathConfig(cwd);
  return normalizeDeclaredScanPaths(config.document_scan_paths);
}
