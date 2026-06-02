import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';

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
  return { canonicalPath, currentPath };
}

export async function readActiveTaskFile(
  docpathDir: string,
  taskId: string | undefined,
  file: string,
): Promise<string> {
  const canonicalPath = taskId ? join(canonicalTaskDir(docpathDir, taskId), file) : '';
  if (canonicalPath && existsSync(canonicalPath)) {
    return readFile(canonicalPath, 'utf-8');
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

export type TaskFileAlias = 'spec.md' | 'plan.md';

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
    synced.push({ file, fromPath, toPath });
  }

  return synced;
}
