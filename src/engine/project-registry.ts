/**
 * 本地项目注册中心。
 *
 * 第一版使用 Node 内置 SQLite，保存 DocPath 初始化过的项目摘要。
 */

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState, readOptionalFile } from '../utils/workspace.js';

type SqliteModule = typeof import('node:sqlite');

export type RegisteredProject = {
  root: string;
  docpath_dir: string;
  name: string;
  description: string;
  type: string;
  language: string;
  framework: string;
  task_id: string;
  task_title: string;
  phase: string;
  gate: string;
  registered_at: string;
  last_seen_at: string;
};

type ProjectRegistryDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

type EmitWarning = typeof process.emitWarning;

export function resolveProjectRegistryDbPath(): string {
  return process.env.DOCPATH_REGISTRY_DB || join(homedir(), '.docpath', 'projects.sqlite');
}

async function loadSqliteModule(): Promise<SqliteModule> {
  const runtimeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<SqliteModule>;
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const message = warning instanceof Error ? warning.message : warning;
    const type = typeof args[0] === 'string' ? args[0] : undefined;
    if (type === 'ExperimentalWarning' && String(message).includes('SQLite is an experimental feature')) return;
    return (originalEmitWarning as (...items: unknown[]) => void)(warning, ...args);
  }) as EmitWarning;
  try {
    return await runtimeImport('node:sqlite');
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function openProjectRegistry(dbPath = resolveProjectRegistryDbPath(), create = true): Promise<ProjectRegistryDb | null> {
  if (!create && !existsSync(dbPath)) return null;
  if (create) await mkdir(dirname(dbPath), { recursive: true });
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      root TEXT PRIMARY KEY,
      docpath_dir TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      language TEXT NOT NULL,
      framework TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      phase TEXT NOT NULL,
      gate TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_last_seen ON projects(last_seen_at DESC);
  `);
  return db;
}

function readProjectField(config: unknown, key: string): string {
  if (!config || typeof config !== 'object') return '';
  const project = (config as { project?: unknown }).project;
  if (!project || typeof project !== 'object') return '';
  const value = (project as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

async function readProjectConfig(docpathDir: string): Promise<unknown> {
  try {
    return parseYaml(await readOptionalFile(join(docpathDir, 'config.yaml')));
  } catch {
    return null;
  }
}

function normalizeRegisteredProject(row: Record<string, unknown>): RegisteredProject {
  return {
    root: String(row.root || ''),
    docpath_dir: String(row.docpath_dir || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    type: String(row.type || ''),
    language: String(row.language || ''),
    framework: String(row.framework || ''),
    task_id: String(row.task_id || ''),
    task_title: String(row.task_title || ''),
    phase: String(row.phase || ''),
    gate: String(row.gate || ''),
    registered_at: String(row.registered_at || ''),
    last_seen_at: String(row.last_seen_at || ''),
  };
}

export async function registerProject(cwd: string): Promise<RegisteredProject> {
  const project = await buildRegisteredProject(cwd);
  await upsertRegisteredProject(project);
  return project;
}

async function buildRegisteredProject(cwd: string): Promise<RegisteredProject> {
  const docpathDir = await resolveDocpathDir(cwd);
  const config = await readProjectConfig(docpathDir);
  const state = await readCurrentState(cwd);
  const now = new Date().toISOString();
  return {
    root: cwd,
    docpath_dir: docpathDir,
    name: readProjectField(config, 'name') || cwd.split(/[\\/]/).filter(Boolean).at(-1) || 'docpath project',
    description: readProjectField(config, 'description'),
    type: readProjectField(config, 'type') || '-',
    language: readProjectField(config, 'language') || '-',
    framework: readProjectField(config, 'framework') || '-',
    task_id: state?.task_id || '',
    task_title: state?.task_title || '',
    phase: state?.phase || 'idle',
    gate: state?.gate || 'none',
    registered_at: now,
    last_seen_at: now,
  };
}

async function upsertRegisteredProject(project: RegisteredProject): Promise<void> {
  const db = await openProjectRegistry();
  if (!db) throw new Error('project registry unavailable');
  try {
    db.prepare(`
      INSERT INTO projects (
        root, docpath_dir, name, description, type, language, framework,
        task_id, task_title, phase, gate, registered_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(root) DO UPDATE SET
        docpath_dir = excluded.docpath_dir,
        name = excluded.name,
        description = excluded.description,
        type = excluded.type,
        language = excluded.language,
        framework = excluded.framework,
        task_id = excluded.task_id,
        task_title = excluded.task_title,
        phase = excluded.phase,
        gate = excluded.gate,
        last_seen_at = excluded.last_seen_at
    `).run(
      project.root,
      project.docpath_dir,
      project.name,
      project.description,
      project.type,
      project.language,
      project.framework,
      project.task_id,
      project.task_title,
      project.phase,
      project.gate,
      project.registered_at,
      project.last_seen_at,
    );
  } finally {
    db.close();
  }
}

export async function listRegisteredProjects(): Promise<RegisteredProject[]> {
  const db = await openProjectRegistry(resolveProjectRegistryDbPath(), false);
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM projects ORDER BY last_seen_at DESC, name ASC')
      .all()
      .map((row) => normalizeRegisteredProject(row as Record<string, unknown>));
  } finally {
    db.close();
  }
}
