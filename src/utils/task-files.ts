import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  detectStructuredMarkdownHashDrift,
  formatStructuredMarkdownHashDrift,
  readStructuredSpecDocument,
  readStructuredTaskMarkdown,
  taskIdFromMarkdown,
  writeStructuredTaskJson,
  type StructuredSpecDocument,
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
  assertActiveTaskFileWriteAllowed(docpathDir, taskId, file, content);
  if (file !== 'spec.md') {
    const identityDrifts = await detectActiveTaskIdentityDrift(docpathDir, taskId);
    if (identityDrifts.length > 0) throw new Error(formatTaskIdentityDrift(identityDrifts));
  }
  await ensureActiveTaskDirs(docpathDir, taskId);
  const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), file);
  const currentPath = join(currentTaskDir(docpathDir), file);
  await writeFile(canonicalPath, content, 'utf-8');
  await writeFile(currentPath, content, 'utf-8');
  if (isStructuredTaskMarkdownFile(file)) {
    await writeStructuredTaskJson(canonicalTaskDir(docpathDir, taskId), file, content, { taskId });
    await writeStructuredTaskJson(currentTaskDir(docpathDir), file, content, { taskId });
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

export async function readActiveStructuredSpecDocument(
  docpathDir: string,
  taskId: string | undefined,
): Promise<StructuredSpecDocument | null> {
  if (taskId) {
    const canonical = await readStructuredSpecDocument(canonicalTaskDir(docpathDir, taskId));
    if (canonical !== null) return canonical;
  }
  return readStructuredSpecDocument(currentTaskDir(docpathDir));
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
  reason: 'missing-current' | 'missing-canonical' | 'content-mismatch' | 'structured-json-mismatch';
  detail?: string;
}

export interface TaskIdentityDrift {
  file: 'spec.md';
  location: 'current' | 'canonical';
  path: string;
  expectedTaskId: string;
  declaredTaskId: string;
}

function shouldValidateExpectedTaskId(taskId: string | undefined): taskId is string {
  return !!taskId && taskId !== 'current' && /^T-[A-Za-z0-9._-]+$/.test(taskId);
}

function assertActiveTaskFileWriteAllowed(
  docpathDir: string,
  taskId: string,
  file: string,
  content: string,
): void {
  if (!shouldValidateExpectedTaskId(taskId) || file !== 'spec.md') return;
  const declaredTaskId = taskIdFromMarkdown(content);
  if (!declaredTaskId || declaredTaskId === taskId) return;
  const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), file);
  throw new Error([
    '[docpath] task identity mismatch: refused to write spec.md',
    `state.task_id: ${taskId}`,
    `spec heading task_id: ${declaredTaskId}`,
    `target: ${canonicalPath}`,
    '修复建议:',
    '  - 如果这是新任务，先通过 backlog promote / write-spec 绑定新的 task_id，不要复用旧任务目录。',
    '  - 如果 state.task_id 过期，先恢复或重置当前任务状态，再写入 spec。',
    '  - 如果只是标题写错，把 H1 改为当前 task_id 后重试。',
  ].join('\n'));
}

export function formatTaskIdentityDrift(drifts: TaskIdentityDrift[]): string {
  return [
    'TASK IDENTITY DRIFT DETECTED:',
    ...drifts.flatMap((drift) => [
      `  [${drift.location}/${drift.file}] declared task id does not match workflow state`,
      `    state.task_id: ${drift.expectedTaskId}`,
      `    declared_task_id: ${drift.declaredTaskId}`,
      `    path: ${drift.path}`,
    ]),
    '修复建议:',
    '  - 若这是新需求，不要在旧 task_id 下写入；先 capture/promote 新 backlog 或重置当前任务。',
    '  - 若这是旧任务被误覆盖，从 git/归档恢复 canonical task 文件，再运行 docpath tasks sync --from canonical。',
    '  - 修复前不要运行 docpath agent step；step 同名不能证明是同一个计划语义。',
  ].join('\n');
}

export async function detectActiveTaskIdentityDrift(
  docpathDir: string,
  taskId: string | undefined,
): Promise<TaskIdentityDrift[]> {
  if (!shouldValidateExpectedTaskId(taskId)) return [];

  const candidates: Array<{ location: 'current' | 'canonical'; path: string }> = [
    { location: 'current', path: join(currentTaskDir(docpathDir), 'spec.md') },
    { location: 'canonical', path: join(canonicalTaskDir(docpathDir, taskId), 'spec.md') },
  ];
  const drifts: TaskIdentityDrift[] = [];

  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    const content = await readFile(candidate.path, 'utf-8');
    const declaredTaskId = taskIdFromMarkdown(content);
    if (!declaredTaskId || declaredTaskId === taskId) continue;
    drifts.push({
      file: 'spec.md',
      location: candidate.location,
      path: candidate.path,
      expectedTaskId: taskId,
      declaredTaskId,
    });
  }

  return drifts;
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

    if (isStructuredTaskMarkdownFile(file)) {
      const structuredDrifts = await Promise.all([
        detectStructuredMarkdownHashDrift(currentTaskDir(docpathDir), file),
        detectStructuredMarkdownHashDrift(canonicalTaskDir(docpathDir, taskId), file),
      ]);
      for (const structuredDrift of structuredDrifts) {
        if (!structuredDrift) continue;
        drifts.push({
          file,
          currentPath,
          canonicalPath,
          reason: 'structured-json-mismatch',
          detail: formatStructuredMarkdownHashDrift(structuredDrift),
        });
      }
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
    assertActiveTaskFileWriteAllowed(docpathDir, taskId, file, content);
    await writeFile(toPath, content, 'utf-8');
    if (isStructuredTaskMarkdownFile(file)) {
      await writeStructuredTaskJson(dirname(fromPath), file, content, { taskId });
      await writeStructuredTaskJson(dirname(toPath), file, content, { taskId });
    }
    synced.push({ file, fromPath, toPath });
  }

  return synced;
}

function isStructuredTaskMarkdownFile(file: string): file is StructuredTaskMarkdownFile {
  return file === 'spec.md' || file === 'plan.md';
}
