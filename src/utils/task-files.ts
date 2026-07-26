import { existsSync } from 'fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import {
  detectStructuredMarkdownHashDrift,
  enforceStructuredMarkers,
  readStructuredSpecDocument,
  readStructuredTaskDocument,
  readStructuredTaskMarkdown,
  readStructuredTaskMarkdownView,
  renderStructuredMarkdown,
  structuredJsonFileFor,
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



export interface StructuredHealResult {
  file: StructuredTaskMarkdownFile;
  healed: boolean;
  reason: string;
  /** 勾选态被按 json 真源回写的条目 id */
  enforced_markers: string[];
  /** markdown 侧缺失、按 json 快照恢复或以吸收方式记录的条目 id */
  missing_items: string[];
}

/**
 * R-287 方案 A：spec/plan 的 md/json 漂移自愈（desync 由自愈取代告警）。
 *
 * 三分支策略（零静默丢失）：
 * 1. json 缺失 → 以 markdown 为输入重建 json（吸收）。
 * 2. markdown 完全缺失 json 的已知结构化条目（整体掏空/陈旧视图）→ 视为损坏，
 *    从 json 的 markdown 快照恢复（快照为空则按字段全量渲染）——吸收会把破坏传播进真源。
 * 3. 常规漂移 → 已知条目勾选态按 json 真源回写（marker 强制），markdown 侧新增
 *    内容/叙述保留并经重解析吸收进 json；部分条目在 md 中被删除时保留删除并在
 *    结果中列出（missing_items），由调用方 loud 输出。
 *
 * 注意：写入走 writeActiveTaskFile（canonical+current 双写、json+sha 同步）；
 * 任务身份漂移（identity drift）会在写入层 fail-loud，自愈绝不掩盖身份问题。
 */
export async function healStructuredMarkdownDrift(
  docpathDir: string,
  taskId: string,
  file: StructuredTaskMarkdownFile,
): Promise<StructuredHealResult> {
  const canonicalDir = canonicalTaskDir(docpathDir, taskId);
  const currentDir = currentTaskDir(docpathDir);
  const none: StructuredHealResult = { file, healed: false, reason: 'no-drift', enforced_markers: [], missing_items: [] };

  const [canonicalDrift, currentDrift] = await Promise.all([
    detectStructuredMarkdownHashDrift(canonicalDir, file),
    detectStructuredMarkdownHashDrift(currentDir, file),
  ]);
  if (!canonicalDrift && !currentDrift) return none;

  const currentMdPath = join(currentDir, file);
  const canonicalMdPath = join(canonicalDir, file);
  const [currentDoc, canonicalDoc] = await Promise.all([
    readStructuredTaskDocument(currentDir, file),
    readStructuredTaskDocument(canonicalDir, file),
  ]);
  // 「已验证同步」= json 存在且与同目录 md 的 sha 一致。json 缺失时对应 drift 恒为
  // null，属条件空洞成立，不能当作同步证据——所有方向裁决都必须以 doc 存在为前提。
  const currentVerified = Boolean(currentDoc) && !currentDrift && existsSync(currentMdPath);
  const canonicalVerified = Boolean(canonicalDoc) && !canonicalDrift && existsSync(canonicalMdPath);

  // 规则 1：current 与 canonical 内容互异时按「双侧验证态」四象限裁决——
  //   (canonical 已验证, current 未验证)：canonical 是同步基线、current 承载新编辑 → 吸收 current（进入规则 2）；
  //   其余三种（双未验证 / 仅 current 验证 / 双验证）：canonical 侧可能承载独立编辑或
  //   独立同步态，方向不可裁决 → 交由 check 的 file-drift/3-way 合并机制处理，
  //   自愈不得抢跑覆盖（覆盖会丢失 canonical 侧编辑，或把陈旧内容传播进 json 真源）。
  if (existsSync(currentMdPath) && existsSync(canonicalMdPath)) {
    const [currentContent, canonicalContent] = await Promise.all([
      readFile(currentMdPath, 'utf-8'),
      readFile(canonicalMdPath, 'utf-8'),
    ]);
    if (currentContent !== canonicalContent && !(canonicalVerified && !currentVerified)) {
      return {
        file,
        healed: false,
        reason: 'current 与 canonical 副本内容分歧，交由 file-drift/3-way 合并机制处理',
        enforced_markers: [],
        missing_items: [],
      };
    }
  }

  // 规则 2：以 current 工作别名（最新意图载体）为 md 输入做吸收/恢复。
  const mdPath = existsSync(currentMdPath) ? currentMdPath : canonicalMdPath;
  const markdown = existsSync(mdPath) ? await readFile(mdPath, 'utf-8') : '';
  const jsonDoc = currentDoc ?? canonicalDoc;

  if (!jsonDoc) {
    await writeActiveTaskFile(docpathDir, taskId, file, markdown);
    return { file, healed: true, reason: 'json 真源缺失，已从 markdown 重建', enforced_markers: [], missing_items: [] };
  }

  const { content, enforced, missing, knownCount } = enforceStructuredMarkers(jsonDoc, markdown);

  if (knownCount > 0 && missing.length === knownCount) {
    // 整体掏空视为损坏视图：吸收会把破坏传播进 json（结构化字段与门禁信息全被默认值覆盖），
    // 故按 json 真源字段全量渲染恢复；原 md 剩余文本零丢失地保留在文末小节，由人工取舍。
    const leftover = markdown.trim();
    const restored = renderStructuredMarkdown(jsonDoc)
      + (leftover ? `\n## 自愈保留的原 Markdown 内容\n\n${leftover}\n` : '');
    await writeActiveTaskFile(docpathDir, taskId, file, restored);
    return {
      file,
      healed: true,
      reason: 'markdown 缺失全部结构化条目（陈旧/损坏视图），已按 json 真源恢复；原 markdown 内容保留在文末「自愈保留」小节',
      enforced_markers: [],
      missing_items: missing,
    };
  }

  await writeActiveTaskFile(docpathDir, taskId, file, content);
  const reasonParts = ['已收敛 md/json 漂移'];
  if (enforced.length > 0) reasonParts.push(`勾选态按 json 真源回写: ${enforced.join(', ')}`);
  if (missing.length > 0) reasonParts.push(`markdown 移除的条目已吸收进 json: ${missing.join(', ')}`);
  if (enforced.length === 0 && missing.length === 0) reasonParts.push('markdown 内容变更已吸收进 json');
  return { file, healed: true, reason: reasonParts.join('；'), enforced_markers: enforced, missing_items: missing };
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

export interface CurrentTaskAliasBackup {
  backupDir: string;
  files: string[];
}

function promoteBackupDir(docpathDir: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(docpathDir, 'tasks', 'promote-backups', stamp);
}

export async function backupCurrentTaskAlias(docpathDir: string): Promise<CurrentTaskAliasBackup | null> {
  const dir = currentTaskDir(docpathDir);
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^(spec|plan)\.(md|json)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) return null;

  const backupDir = promoteBackupDir(docpathDir);
  await mkdir(backupDir, { recursive: true });
  for (const file of files) {
    await copyFile(join(dir, file), join(backupDir, basename(file)));
  }
  return { backupDir, files };
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
  reason: 'phantom-task' | 'missing-current' | 'missing-canonical' | 'content-mismatch';
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
    '  - 若这是新需求，不要在旧 task_id 下写入；先 capture/promote 新 backlog，或运行 docpath task abort / docpath task reset 清理当前任务。',
    '  - 若 current 视图是正确内容，运行 docpath tasks sync --from current。',
    '  - 若 canonical task 是正确内容，从 git/归档恢复 canonical task 文件，再运行 docpath tasks sync --from canonical。',
    '  - 如果 .docpath/workspace/sessions/default.json 仍指向旧 task_id，先用同一 session 继续，或完成/中止旧任务后再开启新任务。',
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

    if (!hasCurrent && !hasCanonical) {
      // 既无 current 别名、又无 canonical 目录 = 幽灵任务:state.task_id 指向
      // 当前 checkout 上不存在的任务(典型成因:任务在别的分支完成并归档,
      // 但本地 gitignored 的 state.json 仍停在该任务)。这是状态-现实分叉,
      // 必须 fail-loud,而非被当作"无可比对 = 一致"静默跳过。
      drifts.push({ file, currentPath, canonicalPath, reason: 'phantom-task' });
      continue;
    }
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

    const structuredFile = isStructuredTaskMarkdownFile(file) ? file : null;
    const structuredContent = structuredFile
      ? await readStructuredTaskMarkdownView(dirname(fromPath), structuredFile)
      : null;
    const content = structuredContent ?? await readFile(fromPath, 'utf-8');
    assertActiveTaskFileWriteAllowed(docpathDir, taskId, file, content);
    if (structuredContent !== null) {
      await writeFile(fromPath, content, 'utf-8');
    }
    await writeFile(toPath, content, 'utf-8');
    if (structuredFile) {
      const jsonFile = structuredJsonFileFor(structuredFile);
      const sourceJsonPath = jsonFile ? join(dirname(fromPath), jsonFile) : '';
      const targetJsonPath = jsonFile ? join(dirname(toPath), jsonFile) : '';
      if (sourceJsonPath && targetJsonPath && existsSync(sourceJsonPath)) {
        await copyFile(sourceJsonPath, targetJsonPath);
      }
      // When no source JSON exists, skip generating one from the markdown to avoid
      // transforming broken or non-canonical markdown into a new truth source.
    }
    synced.push({ file, fromPath, toPath });
  }

  return synced;
}

function isStructuredTaskMarkdownFile(file: string): file is StructuredTaskMarkdownFile {
  return file === 'spec.md' || file === 'plan.md';
}

export async function tryThreeWayMerge(
  currentPath: string,
  canonicalPath: string,
  file: TaskFileAlias,
): Promise<{ success: boolean; mergedContent: string; conflict: boolean }> {
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const currentContent = await readFile(currentPath, 'utf-8');
  const canonicalContent = await readFile(canonicalPath, 'utf-8');

  // 创建临时文件用作 git merge-file 运算
  const tempCurrent = join(tmpdir(), `dp-merge-current-${Date.now()}-${file}`);
  const tempCanonical = join(tmpdir(), `dp-merge-canonical-${Date.now()}-${file}`);
  const tempBase = join(tmpdir(), `dp-merge-base-${Date.now()}-${file}`);

  writeFileSync(tempCurrent, currentContent, 'utf-8');
  writeFileSync(tempCanonical, canonicalContent, 'utf-8');
  
  // 提取 current 和 canonical 的共同行作为 base
  const currentLines = currentContent.split('\n');
  const canonicalLines = canonicalContent.split('\n');
  const baseLines = currentLines.filter(line => canonicalLines.includes(line));
  const baseContent = baseLines.join('\n');
  writeFileSync(tempBase, baseContent, 'utf-8');

  let conflict = false;
  try {
    // git merge-file <current> <base> <canonical>
    // 如果返回 0，无冲突顺利合并；如果返回非 0 且带正值，表示有冲突但已写入冲突标记
    execFileSync('git', ['merge-file', '--quiet', tempCurrent, tempBase, tempCanonical]);
  } catch (err: any) {
    conflict = true;
  }

  const merged = await readFile(tempCurrent, 'utf-8');

  // 清理临时文件
  try {
    rmSync(tempCurrent, { force: true });
    rmSync(tempCanonical, { force: true });
    rmSync(tempBase, { force: true });
  } catch {
    // 忽略清理失败
  }

  return {
    success: true,
    mergedContent: merged,
    conflict,
  };
}
