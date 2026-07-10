import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolveDocpathDir, exists, writeFileSafe } from './file.js';
import {
  type LifecycleConfig,
  type LifecycleProfileId,
  type LifecycleStage,
  BUILTIN_LIFECYCLE_PROFILES
} from '../engine/lifecycle-profile.js';

export interface LifecycleRegistryEntry {
  status: 'draft' | 'done' | 'reviewed';
  updated_at: string;
  confirmed_by?: string;
}

export interface LifecycleRegistry {
  version: 1;
  stages: Record<string, LifecycleRegistryEntry>;
}

export async function readLifecycleConfig(cwd: string): Promise<LifecycleConfig | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const configPath = join(docpathDir, 'lifecycle.yaml');
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object') {
      // Support both root key lifecycle or direct flat config
      const config = (parsed.lifecycle || parsed) as LifecycleConfig;
      if (config.profile && Array.isArray(config.stages)) {
        return config;
      }
    }
  } catch (error) {
    console.warn(`Warning: Failed to parse ${configPath}:`, error);
  }
  return null;
}

export async function writeLifecycleConfig(cwd: string, config: LifecycleConfig): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const configPath = join(docpathDir, 'lifecycle.yaml');
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, stringifyYaml(config), 'utf-8');
}

export async function initLifecycle(cwd: string, profileId: LifecycleProfileId): Promise<LifecycleConfig> {
  if (profileId === 'custom') {
    throw new Error('Cannot initialize with custom profile directly. Please initialize lightweight/standard/regulated first, then modify lifecycle.yaml.');
  }

  const stages = BUILTIN_LIFECYCLE_PROFILES[profileId];
  if (!stages) {
    throw new Error(`Unknown lifecycle profile: ${profileId}`);
  }

  const now = new Date().toISOString();
  const config: LifecycleConfig = {
    profile: profileId,
    created_at: now,
    updated_at: now,
    stages: stages.map(stage => ({ ...stage }))
  };

  await writeLifecycleConfig(cwd, config);

  // Initialize lifecycle registry
  const registry = { version: 1, stages: {} };
  await writeLifecycleRegistry(cwd, registry as any);

  return config;
}

export async function readLifecycleRegistry(cwd: string): Promise<LifecycleRegistry> {
  const docpathDir = await resolveDocpathDir(cwd);
  const registryPath = join(docpathDir, 'lifecycle-registry.json');
  if (!existsSync(registryPath)) {
    return {
      version: 1,
      stages: {}
    };
  }
  try {
    const content = await readFile(registryPath, 'utf-8');
    const parsed = JSON.parse(content) as LifecycleRegistry;
    if (parsed && parsed.version === 1 && parsed.stages) {
      return parsed;
    }
  } catch (error) {
    console.warn(`Warning: Failed to parse ${registryPath}:`, error);
  }
  return {
    version: 1,
    stages: {}
  };
}

export async function writeLifecycleRegistry(cwd: string, registry: LifecycleRegistry): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const registryPath = join(docpathDir, 'lifecycle-registry.json');
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

export async function getStageStatus(
  cwd: string,
  stage: LifecycleStage,
  registry: LifecycleRegistry
): Promise<'missing' | 'draft' | 'done' | 'reviewed'> {
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceRoot = dirname(docpathDir);
  const artifactPath = isAbsolute(stage.artifact) ? stage.artifact : join(workspaceRoot, stage.artifact);

  if (!existsSync(artifactPath)) {
    return 'missing';
  }

  // File exists, check required sections
  try {
    const content = await readFile(artifactPath, 'utf-8');
    if (stage.required_sections && stage.required_sections.length > 0) {
      const missing = stage.required_sections.filter(section => {
        // Match ## Section Name
        const regex = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
        return !regex.test(content);
      });
      if (missing.length > 0) {
        return 'draft';
      }
    }
  } catch {
    return 'draft';
  }

  // Check registry status
  const regEntry = registry.stages[stage.id];
  if (regEntry) {
    return regEntry.status;
  }

  return 'done';
}

export function generateStageContract(stage: LifecycleStage, config: LifecycleConfig): Record<string, any> {
  return {
    task: 'lifecycle-deliverable-generation',
    stage: stage.id,
    title: stage.title,
    intent: stage.intent || `生成并整理阶段成果交付物: ${stage.title}`,
    profile: config.profile,
    sources: stage.sources || [],
    required_sections: stage.required_sections || [],
    output_path: stage.artifact,
    rules: [
      `该交付物为项目生命周期的正式基线文档之一。`,
      `必须严格依据 sources 中列出的真源内容进行整理、归约和提炼，禁止凭空臆造。`,
      `必须包含所有 required_sections 列表中的二级标题 (##)，且内容结构清晰。`
    ]
  };
}

export async function writeStageContent(
  cwd: string,
  stageId: string,
  content: string
): Promise<LifecycleStage> {
  const config = await readLifecycleConfig(cwd);
  if (!config) {
    throw new Error('Lifecycle not initialized. Please run `docpath deliverables init` first.');
  }

  const stage = config.stages.find(s => s.id === stageId || s.id.replace(/_/g, '-') === stageId);
  if (!stage) {
    throw new Error(`Stage "${stageId}" not found in current lifecycle.`);
  }

  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceRoot = dirname(docpathDir);
  const artifactPath = isAbsolute(stage.artifact) ? stage.artifact : join(workspaceRoot, stage.artifact);

  await writeFileSafe(artifactPath, content);

  // Update registry status to 'done'
  const registry = await readLifecycleRegistry(cwd);
  const now = new Date().toISOString();
  registry.stages[stage.id] = {
    status: 'done',
    updated_at: now
  };
  await writeLifecycleRegistry(cwd, registry);

  return stage;
}

export interface LifecycleIssue {
  stage_id: string;
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

export async function validateLifecycleDeliverables(cwd: string): Promise<LifecycleIssue[]> {
  const config = await readLifecycleConfig(cwd);
  if (!config) return [];

  const registry = await readLifecycleRegistry(cwd);
  const issues: LifecycleIssue[] = [];

  for (const stage of config.stages) {
    const status = await getStageStatus(cwd, stage, registry);
    if (stage.required && status === 'missing') {
      issues.push({
        stage_id: stage.id,
        path: stage.artifact,
        severity: 'error',
        message: `缺失交付物文档。应在 ${stage.artifact} 中创建。`
      });
    } else if (status === 'draft') {
      issues.push({
        stage_id: stage.id,
        path: stage.artifact,
        severity: 'error',
        message: `交付物文档结构不完整或存在待补充内容`
      });
    }

    if (config.profile === 'regulated' && (!stage.sources || stage.sources.length === 0)) {
      issues.push({
        stage_id: stage.id,
        path: stage.artifact,
        severity: 'warning',
        message: `此阶段尚未在 lifecycle.yaml 中声明关联的 sources`
      });
    }
  }

  return issues;
}

export function renderStageDefaultTemplate(stage: LifecycleStage): string {
  const sections = stage.required_sections || [];
  return [
    `# ${stage.title}`,
    '',
    `> stage: ${stage.id}`,
    `> description: ${stage.description || ''}`,
    '',
    ...sections.flatMap(section => [
      `## ${section}`,
      '',
      '- 待补充',
      '',
    ])
  ].join('\n');
}
