/**
 * docpath:write-journal — 将归档知识记录写回当前任务 spec.md
 *
 * 接受 markdown 内容（通过参数或 stdin），追加到 .docpath/tasks/current/spec.md。
 * 该命令只负责落盘知识记录，不推进工作流状态。
 */

import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { archivedTaskDir, canonicalTaskDir, readActiveTaskFile, writeActiveTaskFile } from '../utils/task-files.js';
import { readStdin } from '../utils/stdin.js';
import { appendDecision } from '../governance/decisions.js';
import { ensureRulesDir, resolveRulePaths } from '../utils/rules.js';

interface WriteJournalOptions {
  cwd: string;
  /** knowledge record 内容（Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
  /** 内容为 AI-native structured journal JSON */
  structured?: boolean;
}

type StructuredJournalType =
  | 'design-decision'
  | 'project-convention'
  | 'pattern'
  | 'anti-pattern'
  | 'common-mistake'
  | 'specification'
  | 'gotcha'
  | 'decision';

type StructuredJournalTarget =
  | 'decisions'
  | 'spec'
  | 'rules/style'
  | 'rules/architecture'
  | 'style'
  | 'architecture';

interface StructuredJournalEntry {
  type: StructuredJournalType;
  target: StructuredJournalTarget;
  summary: string;
  rationale?: string;
  content: string;
  evidence?: string[];
}

const JOURNAL_MARKER = '## Journal Record';

export async function writeJournalCommand(options: WriteJournalOptions): Promise<void> {
  const { cwd, content } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  let journalContent = content || '';
  if (!journalContent && options.stdin !== false) {
    journalContent = await readStdin();
  }

  if (!journalContent.trim()) {
    console.error('❌  未提供 journal 内容。用法：');
    console.error('   docpath write-journal --content "..."');
    console.error('   echo "..." | docpath write-journal --stdin');
    process.exit(1);
  }

  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || 'current';

  // Fail-loud guard: write-journal must run BEFORE the task is physically
  // archived. If the canonical spec is gone but the archived dir exists, the
  // task was already moved to tasks/done — writing here would re-create a
  // zombie tasks/<id>/ + current alias with only the Journal Record. Refuse
  // instead of silently resurrecting the dir.
  if (taskId !== 'current') {
    const canonicalSpec = join(canonicalTaskDir(docpathDir, taskId), 'spec.md');
    const archivedExists = existsSync(archivedTaskDir(docpathDir, taskId));
    if (!existsSync(canonicalSpec) && archivedExists) {
      console.error('❌  任务已物理归档到 tasks/done/，write-journal 必须在归档前运行。');
      console.error(`   task_id: ${taskId}`);
      console.error('   修复建议:');
      console.error('   - 若归档过早：恢复 tasks/<id>/ 后再 write-journal，再 gc --force。');
      console.error('   - 若知识记录已无意义：跳过 write-journal，直接 docpath gc --force 收尾。');
      process.exit(1);
    }
  }

  if (options.structured) {
    await writeStructuredJournal(cwd, docpathDir, taskId, journalContent);
    return;
  }

  const previous = await readActiveTaskFile(docpathDir, taskId, 'spec.md');

  // 防御性检查：如果 spec.md 看起来不像一个正常的 spec（缺少标题或章节结构），警告用户
  if (previous && !previous.includes('##') && !previous.includes('# T-')) {
    console.warn('⚠️  警告: spec.md 看起来不像一个正常的规范文档');
    console.warn('   当前内容可能已被破坏或为空');
  }

  // 如果 spec.md 已经以 Journal Record 开头，说明可能已经被覆盖
  if (previous.trim().startsWith(JOURNAL_MARKER)) {
    console.error('❌  错误: spec.md 已经以 Journal Record 开头');
    console.error('   这可能意味着原始 spec 已被覆盖');
    console.error('   请先恢复原始 spec.md 内容，再运行 write-journal');
    process.exit(1);
  }

  const contentToAppend = journalContent.trim();
  const next = previous.trimEnd()
    ? `${previous.trimEnd()}\n\n${JOURNAL_MARKER}\n\n${contentToAppend}\n`
    : `${JOURNAL_MARKER}\n\n${contentToAppend}\n`;

  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'spec.md', next);
  console.log(`✅  journal 记录已写入: ${canonicalPath}`);
  console.log('📌  知识记录已追加到当前任务 spec.md');
}

function parseStructuredPayload(content: string): StructuredJournalEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`write-journal --structured 需要合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : null;
  if (!entries) throw new Error('write-journal --structured 需要 JSON array 或 {"entries":[...]}');
  return entries.map(validateStructuredEntry);
}

function validateStructuredEntry(value: unknown, index: number): StructuredJournalEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`structured journal entry #${index + 1} 必须是 object`);
  }
  const entry = value as Partial<StructuredJournalEntry>;
  const allowedTypes: StructuredJournalType[] = ['design-decision', 'project-convention', 'pattern', 'anti-pattern', 'common-mistake', 'specification', 'gotcha', 'decision'];
  const allowedTargets: StructuredJournalTarget[] = ['decisions', 'spec', 'rules/style', 'rules/architecture', 'style', 'architecture'];
  if (!allowedTypes.includes(entry.type as StructuredJournalType)) {
    throw new Error(`structured journal entry #${index + 1} type 非法`);
  }
  if (!allowedTargets.includes(entry.target as StructuredJournalTarget)) {
    throw new Error(`structured journal entry #${index + 1} target 非法`);
  }
  if (typeof entry.summary !== 'string' || !entry.summary.trim()) {
    throw new Error(`structured journal entry #${index + 1} summary 必填`);
  }
  if (typeof entry.content !== 'string' || !entry.content.trim()) {
    throw new Error(`structured journal entry #${index + 1} content 必填`);
  }
  if (entry.rationale !== undefined && typeof entry.rationale !== 'string') {
    throw new Error(`structured journal entry #${index + 1} rationale 必须是字符串`);
  }
  if (entry.evidence !== undefined && (!Array.isArray(entry.evidence) || entry.evidence.some((item) => typeof item !== 'string'))) {
    throw new Error(`structured journal entry #${index + 1} evidence 必须是字符串数组`);
  }
  return {
    type: entry.type as StructuredJournalType,
    target: entry.target as StructuredJournalTarget,
    summary: entry.summary.trim(),
    rationale: entry.rationale?.trim(),
    content: entry.content.trim(),
    evidence: entry.evidence?.map((item) => item.trim()).filter(Boolean),
  };
}

function isLowSignalStructuredEntry(entry: StructuredJournalEntry): boolean {
  const text = `${entry.summary} ${entry.rationale || ''} ${entry.content}`.replace(/\s+/g, ' ').trim();
  if (text.length < 40) return true;
  return [
    /完成\s*\d+\s*\/\s*\d+\s*步/u,
    /质量检查通过/u,
    /代码审查/u,
    /所有步骤已归档/u,
    /^done$/i,
  ].some((pattern) => pattern.test(text));
}

function renderStructuredEntry(entry: StructuredJournalEntry): string {
  const evidence = entry.evidence && entry.evidence.length > 0
    ? ['', 'Evidence:', ...entry.evidence.map((item) => `- ${item}`)]
    : [];
  return [
    `### ${entry.type}: ${entry.summary}`,
    '',
    `Target: ${entry.target}`,
    entry.rationale ? `Rationale: ${entry.rationale}` : '',
    '',
    entry.content,
    ...evidence,
  ].filter((line) => line !== '').join('\n');
}

function normalizeRuleTarget(target: StructuredJournalTarget): 'style' | 'architecture' | null {
  if (target === 'style' || target === 'rules/style') return 'style';
  if (target === 'architecture' || target === 'rules/architecture') return 'architecture';
  return null;
}

async function appendRuleEntry(docpathDir: string, entry: StructuredJournalEntry): Promise<string> {
  await ensureRulesDir(docpathDir);
  const ruleTarget = normalizeRuleTarget(entry.target);
  if (!ruleTarget) throw new Error(`target ${entry.target} 不是 rules 目标`);
  const paths = resolveRulePaths(docpathDir);
  const file = paths[ruleTarget];
  await mkdir(join(docpathDir, 'rules'), { recursive: true });
  const previous = existsSync(file.path) ? await readFile(file.path, 'utf-8') : `# ${ruleTarget === 'style' ? 'Style' : 'Architecture'} Rules\n`;
  const block = [
    '',
    `## ${entry.type}: ${entry.summary}`,
    '',
    entry.rationale ? `- rationale: ${entry.rationale}` : '',
    '',
    entry.content,
    '',
    ...(entry.evidence?.length ? ['### Evidence', '', ...entry.evidence.map((item) => `- ${item}`), ''] : []),
  ].filter((line) => line !== '').join('\n');
  await writeFile(file.path, `${previous.trimEnd()}\n\n${block.trimEnd()}\n`, 'utf-8');
  return file.displayPath;
}

async function appendStructuredSpecEntries(
  docpathDir: string,
  taskId: string,
  entries: StructuredJournalEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const previous = await readActiveTaskFile(docpathDir, taskId, 'spec.md');
  const content = [
    previous.trimEnd(),
    '',
    JOURNAL_MARKER,
    '',
    '### AI-native structured entries',
    '',
    ...entries.flatMap((entry) => [renderStructuredEntry(entry), '']),
  ].join('\n');
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', `${content.trimEnd()}\n`);
}

async function writeStructuredJournal(
  cwd: string,
  docpathDir: string,
  taskId: string,
  content: string,
): Promise<void> {
  const entries = parseStructuredPayload(content);
  const highSignal = entries.filter((entry) => !isLowSignalStructuredEntry(entry));
  const skipped = entries.length - highSignal.length;
  if (highSignal.length === 0) {
    console.error('❌  structured journal 全部为低信号条目，未写入。请提供触发条件、期望行为和边界。');
    process.exit(1);
  }

  const specEntries: StructuredJournalEntry[] = [];
  const written: string[] = [];
  for (const entry of highSignal) {
    const ruleTarget = normalizeRuleTarget(entry.target);
    if (entry.target === 'decisions' || entry.type === 'design-decision' || entry.type === 'decision') {
      await appendDecision(cwd, entry.type, entry.summary, entry.rationale || entry.content, {
        taskId,
        context: entry.rationale || entry.content,
        impact: entry.content,
        alternatives: ['不沉淀该经验', '仅追加到任务 spec 的 Journal Record'],
        relatedFiles: entry.evidence && entry.evidence.length > 0 ? entry.evidence : ['.docpath/workspace/breadcrumb.md'],
      });
      written.push('.docpath/workspace/decisions.md');
      continue;
    }
    if (ruleTarget) {
      written.push(await appendRuleEntry(docpathDir, entry));
      continue;
    }
    specEntries.push(entry);
  }

  await appendStructuredSpecEntries(docpathDir, taskId, specEntries);
  if (specEntries.length > 0) written.push(`.docpath/tasks/${taskId}/spec.md`);

  console.log(`✅  structured journal 已写入 ${highSignal.length} 条`);
  if (skipped > 0) console.log(`🧹  已跳过 ${skipped} 条低信号 structured journal entry`);
  for (const path of Array.from(new Set(written))) console.log(`- ${path}`);
}
