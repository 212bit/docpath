import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  readStructuredTaskMarkdown,
  writeStructuredTaskJson,
  type StructuredTaskMarkdownFile,
} from './structured-docs.js';

export function currentTaskDir(docpathDir: string): string {
  return join(docpathDir, 'tasks', 'current');
}

export function canonicalTaskDir(docpathDir: string, taskId: string): string {
  return join(docpathDir, 'tasks', taskId);
}

export function archivedTaskDir(docpathDir: string, taskId: string): string {
  return join(docpathDir, 'tasks', 'done', taskId);
}

export function canonicalTaskRelativePath(taskId: string, file: string): string {
  return `tasks/${taskId}/${file}`;
}

export async function ensureActiveTaskDirs(docpathDir: string, taskId: string): Promise<void> {
  await mkdir(currentTaskDir(docpathDir), { recursive: true });
  await mkdir(canonicalTaskDir(docpathDir, taskId), { recursive: true });
}

export async function writeActiveTaskFile(
  docpathDir: string,
  taskId: string,
  file: string,
  content: string,
): Promise<{ canonicalPath: string; currentPath: string }> {
  await ensureActiveTaskDirs(docpathDir, taskId);
  const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), file);
  const currentPath = join(currentTaskDir(docpathDir), file);
  await writeFile(canonicalPath, content, 'utf-8');
  await writeFile(currentPath, content, 'utf-8');
  if (isStructuredTaskMarkdownFile(file)) {
    await writeStructuredTaskJson(canonicalTaskDir(docpathDir, taskId), file, content);
    await writeStructuredTaskJson(currentTaskDir(docpathDir), file, content);
  }
  return { canonicalPath, currentPath };
}



export async function writeActiveAnalysisSection(
  docpathDir: string,
  taskId: string,
  section: AnalysisSection,
  content: string,
): Promise<{ canonicalPath: string; currentPath: string; file: TaskFileAlias }> {
  const file = analysisSectionFile(section);
  await ensureActiveTaskDirs(docpathDir, taskId);
  const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), file);
  const currentPath = join(currentTaskDir(docpathDir), file);
  await mkdir(join(canonicalTaskDir(docpathDir, taskId), 'analysis'), { recursive: true });
  await mkdir(join(currentTaskDir(docpathDir), 'analysis'), { recursive: true });
  await writeFile(canonicalPath, content, 'utf-8');
  await writeFile(currentPath, content, 'utf-8');
  return { canonicalPath, currentPath, file };
}

async function readIfExists(path: string): Promise<string> {
  if (!existsSync(path)) return '';
  const info = await stat(path);
  if (!info.isFile()) return '';
  return readFile(path, 'utf-8');
}

export async function readActiveAnalysisSummary(
  docpathDir: string,
  taskId: string | undefined,
): Promise<string> {
  const baseDirs = [
    ...(taskId ? [canonicalTaskDir(docpathDir, taskId)] : []),
    currentTaskDir(docpathDir),
  ];
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const baseDir of baseDirs) {
    const analysisDir = join(baseDir, 'analysis');
    if (existsSync(analysisDir)) {
      const entries = await readdir(analysisDir);
      const ordered = [
        ...ANALYSIS_SECTIONS.map((section) => `${section}.md`),
        ...entries.filter((entry) => !ANALYSIS_SECTIONS.some((section) => entry === `${section}.md`)).sort(),
      ];
      for (const entry of ordered) {
        if (!entry.endsWith('.md')) continue;
        const fileKey = `analysis/${entry}`;
        if (seen.has(fileKey)) continue;
        const content = await readIfExists(join(analysisDir, entry));
        if (!content.trim()) continue;
        seen.add(fileKey);
        blocks.push(`## ${fileKey}\n\n${content.trim()}`);
      }
    }

    if (!seen.has('analysis.md')) {
      const legacy = await readIfExists(join(baseDir, 'analysis.md'));
      if (legacy.trim()) {
        seen.add('analysis.md');
        blocks.push(`## analysis.md (legacy)\n\n${legacy.trim()}`);
      }
    }
  }

  return blocks.join('\n\n---\n\n');
}

export async function readActiveTaskFile(
  docpathDir: string,
  taskId: string | undefined,
  file: string,
): Promise<string> {
  const canonicalPath = taskId ? join(canonicalTaskDir(docpathDir, taskId), file) : '';
  if (taskId && isStructuredTaskMarkdownFile(file)) {
    const structured = await readStructuredTaskMarkdown(canonicalTaskDir(docpathDir, taskId), file);
    if (structured !== null) return structured;
  }
  if (canonicalPath && existsSync(canonicalPath)) {
    return readFile(canonicalPath, 'utf-8');
  }

  if (isStructuredTaskMarkdownFile(file)) {
    const structured = await readStructuredTaskMarkdown(currentTaskDir(docpathDir), file);
    if (structured !== null) return structured;
  }
  const currentPath = join(currentTaskDir(docpathDir), file);
  if (existsSync(currentPath)) {
    return readFile(currentPath, 'utf-8');
  }

  return '';
}

export function resolveActiveTaskDocPath(docpathDir: string, taskId: string | undefined, file: string): string {
  const canonicalPath = taskId ? join(canonicalTaskDir(docpathDir, taskId), file) : '';
  if (canonicalPath && existsSync(canonicalPath)) {
    return canonicalPath;
  }
  return join(currentTaskDir(docpathDir), file);
}

export async function clearCurrentTaskAlias(docpathDir: string): Promise<void> {
  await rm(currentTaskDir(docpathDir), { recursive: true, force: true });
}

export type TaskFileAlias = 'spec.md' | 'plan.md' | 'design-preview.md' | 'visual-acceptance.md' | 'analysis.md' | 'analysis/requirements.md' | 'analysis/product.md' | 'analysis/ui.md' | 'analysis/technical.md' | 'analysis/risks.md' | 'analysis/open-questions.md';

export const ANALYSIS_SECTIONS = ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions'] as const;
export type AnalysisSection = typeof ANALYSIS_SECTIONS[number];

export function normalizeAnalysisSection(section: string | undefined): AnalysisSection {
  const normalized = (section || 'requirements').trim().toLowerCase();
  if ((ANALYSIS_SECTIONS as readonly string[]).includes(normalized)) return normalized as AnalysisSection;
  throw new Error(`未知 analysis section: ${section}（允许: ${ANALYSIS_SECTIONS.join(', ')}）`);
}

export function analysisSectionFile(section: AnalysisSection): TaskFileAlias {
  return `analysis/${section}.md` as TaskFileAlias;
}

export interface TaskFileDrift {
  file: TaskFileAlias;
  currentPath: string;
  canonicalPath: string;
  reason: 'missing-current' | 'missing-canonical' | 'content-mismatch';
}

export async function detectActiveTaskFileDrift(
  docpathDir: string,
  taskId: string | undefined,
  files: TaskFileAlias[] = ['spec.md', 'plan.md'],
): Promise<TaskFileDrift[]> {
  if (!taskId) return [];

  const drifts: TaskFileDrift[] = [];
  for (const file of files) {
    const currentPath = join(currentTaskDir(docpathDir), file);
    const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), file);
    const hasCurrent = existsSync(currentPath);
    const hasCanonical = existsSync(canonicalPath);

    if (!hasCurrent && !hasCanonical) continue;
    if (!hasCurrent) {
      drifts.push({ file, currentPath, canonicalPath, reason: 'missing-current' });
      continue;
    }
    if (!hasCanonical) {
      drifts.push({ file, currentPath, canonicalPath, reason: 'missing-canonical' });
      continue;
    }

    const [currentContent, canonicalContent] = await Promise.all([
      readFile(currentPath, 'utf-8'),
      readFile(canonicalPath, 'utf-8'),
    ]);
    if (currentContent !== canonicalContent) {
      drifts.push({ file, currentPath, canonicalPath, reason: 'content-mismatch' });
    }
  }

  return drifts;
}

export async function syncActiveTaskFiles(
  docpathDir: string,
  taskId: string,
  from: 'canonical' | 'current',
  files: TaskFileAlias[] = ['spec.md', 'plan.md'],
): Promise<Array<{ file: TaskFileAlias; fromPath: string; toPath: string }>> {
  await ensureActiveTaskDirs(docpathDir, taskId);
  const synced: Array<{ file: TaskFileAlias; fromPath: string; toPath: string }> = [];

  for (const file of files) {
    const currentPath = join(currentTaskDir(docpathDir), file);
    const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), file);
    const fromPath = from === 'canonical' ? canonicalPath : currentPath;
    const toPath = from === 'canonical' ? currentPath : canonicalPath;
    if (!existsSync(fromPath)) {
      throw new Error(`无法同步 ${file}: 源文件不存在 ${fromPath}`);
    }
    const content = await readFile(fromPath, 'utf-8');
    await writeFile(toPath, content, 'utf-8');
    if (isStructuredTaskMarkdownFile(file)) {
      await writeStructuredTaskJson(dirname(toPath), file, content);
    }
    synced.push({ file, fromPath, toPath });
  }

  return synced;
}

function isStructuredTaskMarkdownFile(file: string): file is StructuredTaskMarkdownFile {
  return file === 'spec.md' || file === 'plan.md';
}
