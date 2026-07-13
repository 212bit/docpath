/**
 * docpath:learn — 从 journal/lesson candidates 提取规则 → 更新 style.md / architecture.md
 * Superpower 学习闭环：把踩过的坑变成自动检查
 */

import { readFileSafe, resolveDocpathDir} from '../utils/file.js';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolveRulePaths } from '../utils/rules.js';
import {
  classifyCandidateBlocks,
  parseCandidateBlocks,
  type CandidateAction,
  type CandidateBlock,
  type CandidateClassification,
  type LessonPattern,
  type LessonTarget,
} from '../utils/lesson-candidates.js';

interface LearnOptions {
  cwd: string;
  action?: string;
  journalPath?: string;
  skipAi?: boolean;
  fromJournal?: boolean;
  dryRun?: boolean;
}

type LearnTarget = LessonTarget;

type Pattern = LessonPattern;

const AUTO_STYLE_MARKER = '<!-- docpath:auto-learn:style -->';
const AUTO_ARCH_MARKER = '<!-- docpath:auto-learn:architecture -->';
const LESSON_META_PREFIX = '<!-- docpath:lesson-meta ';
const EMPTY_LESSON_CANDIDATES = '# Lesson Candidates\n\n';

interface ExistingRuleSummary {
  keys: Set<string>;
  count: number;
  patterns: Pattern[];
}

interface FilterResult {
  added: Pattern[];
  skipped: Pattern[];
}

interface LearnPaths {
  docpathDir: string;
  lessonCandidatesPath: string;
  stylePath: string;
  architecturePath: string;
}

interface PatternSelection {
  patterns: Pattern[];
  sourceMode: string;
  classifications: CandidateClassification[];
  shouldClearLessonCandidates: boolean;
}

interface GroomIssue {
  block: CandidateBlock;
  reasons: string[];
}

interface PatternMergePlan {
  existingStyle: string;
  existingArchitecture: string;
  styleSummary: ExistingRuleSummary;
  architectureSummary: ExistingRuleSummary;
  stylePatterns: Pattern[];
  architecturePatterns: Pattern[];
  filteredStyle: FilterResult;
  filteredArchitecture: FilterResult;
}

function createJournalPattern(
  type: Pattern['type'],
  keyword: string,
  description: string,
  source: string,
): Pattern {
  return {
    type,
    keyword,
    description: description.slice(0, 200),
    source,
    target: type === 'architecture' ? 'architecture' : 'style',
  };
}

function classifyMarkedJournalLine(line: string): Pattern['type'] | null {
  if (line.includes('⚠️')) return 'anti-pattern';
  if (line.includes('✅')) return 'best-practice';
  if (line.includes('📋')) return 'convention';
  if (line.includes('🏗️')) return 'architecture';
  return null;
}

function classifyKeywordJournalLine(line: string): Pattern['type'] | null {
  if (line.match(/反模式|anti.?pattern|不要|避免|错误/i)) return 'anti-pattern';
  if (line.match(/最佳实践|best.?practice|应该|推荐|使用/i)) return 'best-practice';
  if (line.match(/规范|convention|格式|命名/i)) return 'convention';
  if (line.match(/架构|architecture|模块|边界|接口|数据模型/i)) return 'architecture';
  return null;
}

function classifyJournalLine(line: string): Pattern['type'] | null {
  return classifyMarkedJournalLine(line) || classifyKeywordJournalLine(line);
}

function extractPatternsFromJournal(content: string, source: string): Pattern[] {
  const patterns: Pattern[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const desc = lines.slice(i, Math.min(i + 3, lines.length)).join(' ').trim();
    const keyword = extractKeyword(desc);
    if (!keyword) continue;

    const type = classifyJournalLine(line);
    if (type) patterns.push(createJournalPattern(type, keyword, desc, source));
  }

  return patterns;
}

function analyzeCandidateQuality(candidates: CandidateBlock[]): GroomIssue[] {
  return classifyCandidateBlocks(candidates)
    .filter((classification) => classification.action !== 'keep')
    .map((classification) => ({
      block: classification.block,
      reasons: classification.reasons,
    }));
}

function renderGroomedCandidates(original: string, issues: GroomIssue[]): string {
  const remove = new Set(issues.map((issue) => issue.block.raw.trim()));
  const kept = parseCandidateBlocks(original).filter((candidate) => !remove.has(candidate.raw.trim()));
  const header = '# Lesson Candidates\n\n';
  if (kept.length === 0) return header;
  return header + kept.map((candidate) => `## ${candidate.raw.trim()}\n`).join('\n---\n\n');
}

function printGroomReport(candidates: CandidateBlock[], issues: GroomIssue[], dryRun: boolean): void {
  const customIssues = issues.filter((issue) => !issue.block.key.endsWith('-workflow'));
  console.log(`📊  lesson 候选: ${candidates.length} 条，建议清理: ${issues.length} 条（过滤系统统计: ${issues.length - customIssues.length} 条）`);
  for (const issue of customIssues.slice(0, 20)) {
    console.log(`  - ${issue.block.taskId || '-'} / ${issue.block.key}: ${issue.reasons.join('、')}`);
  }
  if (customIssues.length > 20) console.log(`  ... 省略 ${customIssues.length - 20} 条`);
  console.log(dryRun ? '\n📝  [dry-run] 未写入 lesson-candidates.md\n' : '\n✅  lesson-candidates.md 已清理\n');
}

async function groomLessonCandidates(options: LearnOptions): Promise<void> {
  const paths = await resolveLearnPaths(options.cwd);
  const raw = await readFileSafe(paths.lessonCandidatesPath) || '';
  if (!raw.trim()) {
    console.log('📭  未找到 lesson-candidates.md 或内容为空。\n');
    return;
  }

  const candidates = parseCandidateBlocks(raw);
  const issues = analyzeCandidateQuality(candidates);
  printGroomReport(candidates, issues, !!options.dryRun);
  if (options.dryRun || issues.length === 0) return;
  await writeFile(paths.lessonCandidatesPath, renderGroomedCandidates(raw, issues), 'utf-8');
}

function extractKeyword(text: string): string | null {
  // Extract the most relevant keyword/phrase
  const match = text.match(/[\u4e00-\u9fa5a-zA-Z_]{2,20}/);
  return match ? match[0] : null;
}

function lessonKey(pattern: Pattern): string {
  return [
    pattern.type,
    pattern.target,
    pattern.keyword,
    pattern.source,
    pattern.taskId || '',
  ]
    .join(':')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function uniquePatterns(patterns: Pattern[]): Pattern[] {
  const seen = new Set<string>();
  const result: Pattern[] = [];
  for (const pattern of patterns) {
    const key = lessonKey(pattern);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pattern);
  }
  return result;
}

function sourceSuffix(pattern: Pattern): string {
  const parts = [pattern.taskId ? `task: ${pattern.taskId}` : '', `source: ${pattern.source}`].filter(Boolean);
  return ` _(来源: ${parts.join(', ')})_`;
}

function lessonMetaComment(pattern: Pattern): string {
  return `${LESSON_META_PREFIX}${lessonKey(pattern)} -->`;
}

function renderPattern(pattern: Pattern): string {
  return `- **${pattern.keyword}**: ${pattern.description}${sourceSuffix(pattern)}\n${lessonMetaComment(pattern)}\n`;
}

function patternsToStyleSection(patterns: Pattern[]): string {
  if (patterns.length === 0) return '';

  let section = `\n${AUTO_STYLE_MARKER}\n## 自动学习规则\n\n`;

  const antiPatterns = patterns.filter(p => p.type === 'anti-pattern');
  const bestPractices = patterns.filter(p => p.type === 'best-practice');
  const conventions = patterns.filter(p => p.type === 'convention');

  if (antiPatterns.length > 0) {
    section += '### ⚠️ 反模式\n\n';
    for (const p of antiPatterns) {
      section += renderPattern(p);
    }
    section += '\n';
  }

  if (bestPractices.length > 0) {
    section += '### ✅ 最佳实践\n\n';
    for (const p of bestPractices) {
      section += renderPattern(p);
    }
    section += '\n';
  }

  if (conventions.length > 0) {
    section += '### 📋 规范\n\n';
    for (const p of conventions) {
      section += renderPattern(p);
    }
    section += '\n';
  }

  return section;
}

function patternsToArchitectureSection(patterns: Pattern[]): string {
  if (patterns.length === 0) return '';

  let section = `\n${AUTO_ARCH_MARKER}\n## 自动学习架构经验\n\n`;
  for (const p of patterns) {
    section += renderPattern(p);
  }
  section += '\n';
  return section;
}

function stripAutoSection(content: string, marker: string): string {
  const index = content.indexOf(marker);
  return index >= 0 ? content.slice(0, index).trimEnd() + '\n' : content;
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function inferTypeFromHeading(heading: string, target: LearnTarget): Pattern['type'] {
  if (/反模式/.test(heading)) return 'anti-pattern';
  if (/最佳实践/.test(heading)) return 'best-practice';
  if (/规范/.test(heading)) return 'convention';
  return target === 'architecture' ? 'architecture' : 'best-practice';
}

function existingRuleSummaryFromContent(content: string, marker: string, target: LearnTarget): ExistingRuleSummary {
  const index = content.indexOf(marker);
  if (index < 0) return { keys: new Set(), count: 0, patterns: [] };

  const autoSection = content.slice(index).split('\n');
  const keys = new Set<string>();
  const patterns: Pattern[] = [];
  let currentHeading = '';
  let count = 0;

  for (let i = 0; i < autoSection.length; i++) {
    const line = autoSection[i].trim();
    if (!line) continue;
    if (line.startsWith('### ')) {
      currentHeading = line;
      continue;
    }
    const meta = line.match(/^<!--\s+docpath:lesson-meta\s+(.+?)\s+-->$/);
    if (meta) {
      keys.add(normalizeKeyPart(meta[1]));
      continue;
    }
    const bullet = line.match(/^- \*\*(.+?)\*\*:.*?(?:_\(来源:\s*(.+?)\)_)?$/);
    if (!bullet) continue;

    count += 1;
    const keyword = normalizeKeyPart(bullet[1]);
    const sourceBlock = bullet[2] || '';
    const rawSource = sourceBlock.match(/source:\s*([^,)]+)/)?.[1]?.trim() || 'journal';
    const rawTaskId = sourceBlock.match(/task:\s*([^,)]+)/)?.[1]?.trim() || '';
    const type = inferTypeFromHeading(currentHeading, target);
    const pattern: Pattern = {
      type,
      target,
      keyword,
      description: line.replace(/^- \*\*.+?\*\*:\s*/, '').replace(/\s*_\(.+\)_\s*$/, '').trim(),
      source: rawSource,
      taskId: rawTaskId || undefined,
    };
    keys.add(normalizeKeyPart(lessonKey(pattern)));
    patterns.push(pattern);
  }

  return { keys, count: Math.max(count, keys.size), patterns: uniquePatterns(patterns) };
}

function filterExistingPatterns(patterns: Pattern[], existingKeys: Set<string>): FilterResult {
  const seen = new Set(existingKeys);
  const added: Pattern[] = [];
  const skipped: Pattern[] = [];

  for (const pattern of patterns) {
    const key = normalizeKeyPart(lessonKey(pattern));
    if (seen.has(key)) {
      skipped.push(pattern);
      continue;
    }
    seen.add(key);
    added.push(pattern);
  }

  return { added, skipped };
}

async function resolveLearnPaths(cwd: string): Promise<LearnPaths> {
  const docpathDir = await resolveDocpathDir(cwd);
  const rules = resolveRulePaths(docpathDir);
  return {
    docpathDir,
    lessonCandidatesPath: join(docpathDir, 'workspace', 'lesson-candidates.md'),
    stylePath: rules.style.path,
    architecturePath: rules.architecture.path,
  };
}

async function readJournalContent(options: LearnOptions, paths: LearnPaths): Promise<string> {
  if (options.journalPath) {
    return await readFileSafe(options.journalPath) || '';
  }
  if (!options.fromJournal && existsSync(paths.lessonCandidatesPath)) {
    return await readFileSafe(paths.lessonCandidatesPath) || '';
  }

  const journalDir = join(options.cwd, '.docpath', 'workspace', 'journal');
  const defaultJournal = join(options.cwd, '.docpath', 'workspace', 'journal.md');
  const fs = await import('node:fs/promises');
  try {
    const entries = await fs.readdir(journalDir);
    const mdFiles = entries.filter(f => f.endsWith('.md')).sort();
    let journalContent = '';
    for (const f of mdFiles) {
      const content = await readFileSafe(join(journalDir, f));
      if (content) journalContent += `\n--- ${f} ---\n${content}\n`;
    }
    return journalContent;
  } catch {
    return await readFileSafe(defaultJournal) || '';
  }
}

function sourceModeForLearn(options: LearnOptions, paths: LearnPaths): string {
  return options.journalPath
    ? `指定文件: ${options.journalPath}`
    : options.fromJournal
      ? 'journal'
      : existsSync(paths.lessonCandidatesPath)
        ? 'lesson-candidates'
        : 'journal';
}

function shouldReadLessonCandidates(options: LearnOptions, paths: LearnPaths): boolean {
  return !options.journalPath && !options.fromJournal && existsSync(paths.lessonCandidatesPath);
}

function selectPatterns(journalContent: string, options: LearnOptions, paths: LearnPaths): PatternSelection {
  if (shouldReadLessonCandidates(options, paths)) {
    const candidates = parseCandidateBlocks(journalContent);
    const classifications = classifyCandidateBlocks(candidates);
    return {
      patterns: uniquePatterns(
        classifications
          .filter((classification) => classification.action === 'keep' && classification.pattern)
          .map((classification) => classification.pattern as Pattern)
      ),
      sourceMode: sourceModeForLearn(options, paths),
      classifications,
      shouldClearLessonCandidates: candidates.length > 0,
    };
  }

  const rawPatterns = extractPatternsFromJournal(journalContent, options.journalPath ? options.journalPath : 'journal');
  return {
    patterns: uniquePatterns(rawPatterns),
    sourceMode: sourceModeForLearn(options, paths),
    classifications: [],
    shouldClearLessonCandidates: false,
  };
}

function printPatterns(patterns: Pattern[]): void {
  console.log(`📊  发现 ${patterns.length} 条规则:\n`);
  for (const p of patterns) {
    const icon = p.type === 'anti-pattern' ? '⚠️' : p.type === 'best-practice' ? '✅' : p.type === 'architecture' ? '🏗️' : '📋';
    console.log(`  ${icon} [${p.type}] ${p.keyword}: ${p.description.slice(0, 80)}...`);
  }
}

function countClassifications(classifications: CandidateClassification[], action: CandidateAction): number {
  return classifications.filter((classification) => classification.action === action).length;
}

function printCandidateClassifications(classifications: CandidateClassification[]): void {
  if (classifications.length === 0) return;

  const customClassifications = classifications.filter((c) => !c.block.key.endsWith('-workflow'));

  console.log(`📎  候选分类: 保留 ${countClassifications(classifications, 'keep')} / 归档 ${countClassifications(classifications, 'archive')} / 跳过 ${countClassifications(classifications, 'skip')}\n`);
  for (const classification of customClassifications.slice(0, 20)) {
    const label = classification.action === 'keep' ? '保留' : classification.action === 'archive' ? '归档' : '跳过';
    console.log(`  - [${label}] ${classification.block.taskId || '-'} / ${classification.block.key}: ${classification.reasons.join('、')}`);
  }
  if (customClassifications.length > 20) console.log(`  ... 省略 ${customClassifications.length - 20} 条候选`);
  console.log('');
}

async function buildPatternMergePlan(paths: LearnPaths, patterns: Pattern[]): Promise<PatternMergePlan> {
  const existingStyle = await readFileSafe(paths.stylePath) || '';
  const existingArchitecture = await readFileSafe(paths.architecturePath) || '';
  const styleSummary = existingRuleSummaryFromContent(existingStyle, AUTO_STYLE_MARKER, 'style');
  const architectureSummary = existingRuleSummaryFromContent(existingArchitecture, AUTO_ARCH_MARKER, 'architecture');
  const stylePatterns = patterns.filter((p) => p.target === 'style');
  const architecturePatterns = patterns.filter((p) => p.target === 'architecture');
  return {
    existingStyle,
    existingArchitecture,
    styleSummary,
    architectureSummary,
    stylePatterns,
    architecturePatterns,
    filteredStyle: filterExistingPatterns(stylePatterns, styleSummary.keys),
    filteredArchitecture: filterExistingPatterns(architecturePatterns, architectureSummary.keys),
  };
}

function printDryRunSummary(sourceMode: string, plan: PatternMergePlan): void {
  console.log('\n📝  [dry-run] 预览模式，不写入 style.md / architecture.md');
  console.log(`   - 来源模式: ${sourceMode}`);
  console.log(`   - style 规则: 提取 ${plan.stylePatterns.length} / 新增 ${plan.filteredStyle.added.length} / 跳过 ${plan.filteredStyle.skipped.length}`);
  console.log(`   - architecture 规则: 提取 ${plan.architecturePatterns.length} / 新增 ${plan.filteredArchitecture.added.length} / 跳过 ${plan.filteredArchitecture.skipped.length}\n`);
}

async function writeMergedPatterns(paths: LearnPaths, plan: PatternMergePlan): Promise<void> {
  const cleanedStyle = stripAutoSection(plan.existingStyle, AUTO_STYLE_MARKER);
  const mergedStylePatterns = uniquePatterns([...plan.styleSummary.patterns, ...plan.filteredStyle.added]);
  const newSection = patternsToStyleSection(mergedStylePatterns);

  await mkdir(join(paths.docpathDir, 'rules'), { recursive: true });
  if (newSection) await writeFile(paths.stylePath, cleanedStyle + newSection, 'utf-8');

  const cleanedArchitecture = stripAutoSection(plan.existingArchitecture, AUTO_ARCH_MARKER);
  const mergedArchitecturePatterns = uniquePatterns([...plan.architectureSummary.patterns, ...plan.filteredArchitecture.added]);
  const architectureSection = patternsToArchitectureSection(mergedArchitecturePatterns);
  if (architectureSection) await writeFile(paths.architecturePath, cleanedArchitecture + architectureSection, 'utf-8');
}

async function clearLessonCandidates(paths: LearnPaths): Promise<void> {
  await writeFile(paths.lessonCandidatesPath, EMPTY_LESSON_CANDIDATES, 'utf-8');
}

export async function learnCommand(options: LearnOptions): Promise<void> {
  if (options.action === 'groom' || options.action === 'prune') {
    await groomLessonCandidates(options);
    return;
  }
  if (options.action) {
    throw new Error(`docpath learn: unsupported action ${options.action}（允许: groom|prune）`);
  }

  console.log('\n🧠  学习模式 — 从经验中提取规则\n');

  const paths = await resolveLearnPaths(options.cwd);
  const journalContent = await readJournalContent(options, paths);

  if (!journalContent) {
    console.log('⚠️  未找到 journal 内容。先运行 `docpath:journal` 积累经验。\n');
    return;
  }

  const { patterns, sourceMode, classifications, shouldClearLessonCandidates } = selectPatterns(journalContent, options, paths);
  printCandidateClassifications(classifications);

  if (patterns.length === 0) {
    console.log('📭  未发现可沉淀到长期 rules 的规则模式。\n');
    if (options.dryRun) {
      console.log('📝  [dry-run] 预览模式，不写入 style.md / architecture.md / lesson-candidates.md');
      console.log(`   - 来源模式: ${sourceMode}`);
      console.log(`   - 候选处理: 保留 ${countClassifications(classifications, 'keep')} / 归档 ${countClassifications(classifications, 'archive')} / 跳过 ${countClassifications(classifications, 'skip')}\n`);
      return;
    }
    if (shouldClearLessonCandidates) {
      await clearLessonCandidates(paths);
      console.log('🧹  lesson-candidates.md 已清理\n');
      return;
    }
    console.log('💡  在 journal 中使用以下标记可被自动提取:');
    console.log('   ⚠️ 反模式/避免    ✅ 最佳实践/推荐    📋 规范/格式\n');
    return;
  }

  printPatterns(patterns);
  const plan = await buildPatternMergePlan(paths, patterns);

  if (options.dryRun) {
    printDryRunSummary(sourceMode, plan);
    return;
  }

  await writeMergedPatterns(paths, plan);
  if (shouldClearLessonCandidates) {
    await clearLessonCandidates(paths);
    console.log('🧹  lesson-candidates.md 已清理');
  }

  console.log(`\n✅  已更新 style.md (+${plan.filteredStyle.added.length} 条规则, 跳过 ${plan.filteredStyle.skipped.length} 条重复), architecture.md (+${plan.filteredArchitecture.added.length} 条经验, 跳过 ${plan.filteredArchitecture.skipped.length} 条重复)\n`);
  console.log('💡  下次 `docpath:go` 将自动应用这些规则。\n');
}
