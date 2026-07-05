/**
 * docpath:learn — 从 journal/lesson candidates 提取规则 → 更新 style.md / architecture.md
 * Superpower 学习闭环：把踩过的坑变成自动检查
 */

import { readFileSafe, resolveDocpathDir} from '../utils/file.js';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolveRulePaths } from '../utils/rules.js';

interface LearnOptions {
  cwd: string;
  action?: string;
  journalPath?: string;
  skipAi?: boolean;
  fromJournal?: boolean;
  dryRun?: boolean;
}

type LearnTarget = 'style' | 'architecture';
type CandidateAction = 'keep' | 'archive' | 'skip';

interface Pattern {
  type: 'anti-pattern' | 'best-practice' | 'convention' | 'architecture';
  keyword: string;
  description: string;
  source: string;  // from which journal entry
  taskId?: string;
  target: LearnTarget;
}

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

interface CandidateBlock {
  raw: string;
  title: string;
  taskId?: string;
  type?: string;
  target?: string;
  source: string;
  key: string;
  description: string;
}

interface GroomIssue {
  block: CandidateBlock;
  reasons: string[];
}

interface CandidateClassification {
  block: CandidateBlock;
  action: CandidateAction;
  reasons: string[];
  pattern?: Pattern;
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

function parseCandidateBlocks(content: string): CandidateBlock[] {
  const candidates: CandidateBlock[] = [];
  const blocks = content.split(/^##\s+/m).filter((block) => block.trim());

  for (const block of blocks) {
    const hasCandidateShape = /^- (task_id|type|target|source|key):/m.test(block)
      || /^### (Lesson|经验)\s*$/m.test(block);
    if (!hasCandidateShape) continue;

    const title = block.split('\n')[0]?.trim() || '';
    const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim();
    const typeValue = block.match(/^- type:\s*(.+)$/m)?.[1]?.trim();
    const targetValue = block.match(/^- target:\s*(.+)$/m)?.[1]?.trim();
    const source = block.match(/^- source:\s*(.+)$/m)?.[1]?.trim() || 'lesson-candidates';
    const description = block.match(/^### Lesson\s*\n([\s\S]*?)(?=\n###|\n---|$)/m)?.[1]?.trim()
      || block.match(/^### 经验\s*\n([\s\S]*?)(?=\n###|\n---|$)/m)?.[1]?.trim()
      || title;
    const keyword = block.match(/^- key:\s*(.+)$/m)?.[1]?.trim() || extractKeyword(description) || title;

    candidates.push({
      raw: block.trimEnd(),
      title,
      taskId,
      type: typeValue,
      target: targetValue,
      source,
      key: keyword,
      description,
    });
  }

  return candidates;
}

function isOrphanCandidate(candidate: CandidateBlock): boolean {
  // task_id 缺失/为 'unknown' 的候选是状态漂移的产物（见 docpath-go-taskid-gate），
  // 不应被固化进全局 style.md / architecture.md。生产端已加 fail-loud guard，
  // 此处为纵深防御，拦截历史遗留的孤儿块。
  const taskId = (candidate.taskId || '').trim().toLowerCase();
  return !taskId || taskId === 'unknown';
}

function isLowValueWorkflowLesson(candidate: CandidateBlock): boolean {
  const description = candidate.description.replace(/\s+/g, ' ').trim();
  return /推荐保留本次任务的执行经验/u.test(description)
    || /完成\s*\d+\s*\/\s*\d+\s*步/u.test(description)
    || /阻塞\s*\d+\s*步/u.test(description);
}

function isVagueLesson(candidate: CandidateBlock): boolean {
  const description = candidate.description.replace(/[✅⚠️📋🏗️]/g, '').trim();
  if (description.length < 18) return true;
  return /^(待补充|暂无|无|none|n\/a)$/i.test(description);
}

function isSeedBoilerplateLesson(candidate: CandidateBlock): boolean {
  const text = [candidate.title, candidate.key, candidate.description]
    .join(' ')
    .replace(/[✅⚠️📋🏗️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [
    /方案\s*A\s*[/／]\s*方案\s*A/iu,
    /方案\s*A\s*[:：]?\s*方案\s*A/iu,
    /backlog promote seed spec/i,
    /spec\.json\s*渲染/i,
    /JSON\s*\/\s*Markdown/i,
    /保留 backlog 作为来源/u,
    /便于后续 plan\/go 接续/u,
  ].some((pattern) => pattern.test(text));
}

function candidateToPattern(candidate: CandidateBlock): Pattern | undefined {
  const typeValue = candidate.type;
  const targetValue = candidate.target;
  const type: Pattern['type'] = targetValue === 'architecture' || typeValue === 'architecture'
    ? 'architecture'
    : typeValue === 'anti-pattern' || typeValue === 'best-practice' || typeValue === 'convention'
      ? typeValue
      : 'best-practice';

  if (!candidate.description) return undefined;

  return {
    type,
    keyword: candidate.key,
    description: candidate.description.slice(0, 300),
    source: candidate.source,
    taskId: candidate.taskId,
    target: targetValue === 'architecture' || type === 'architecture' ? 'architecture' : 'style',
  };
}

function lessonQualityReasons(candidate: CandidateBlock): string[] {
  const normalized = candidate.description
    .replace(/[✅⚠️📋🏗️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const reasons: string[] = [];

  const hasTrigger = /当|在|若|如果|遇到|默认|执行|运行|新增|修改|处理|模式|场景|入口|CLI|Agent|任务|工作流|候选|输出|命令|文件|状态|规则|lesson|journal|learn|check|next|go|plan/i.test(normalized);
  const hasExpectedBehavior = /必须|应|应该|需要|推荐|保持|避免|不要|不应|只能|清理|写入|输出|使用|保留|跳过|归档|过滤|显示/i.test(normalized);
  const hasBoundary = /避免|不要|不应|不得|只能|只|边界|除非|否则|兼容|稳定|漂移|恢复|不依赖|不新增|防止|跳过|归档|过滤|清理|模式|目录/i.test(normalized);

  if (!hasTrigger) reasons.push('缺少触发条件');
  if (!hasExpectedBehavior) reasons.push('缺少期望行为');
  if (!hasBoundary) reasons.push('缺少边界');
  return reasons;
}

function classifyCandidate(candidate: CandidateBlock, seen: Set<string>): CandidateClassification {
  const reasons: string[] = [];
  const key = `${candidate.type || 'best-practice'}:${candidate.target || 'style'}:${candidate.key}:${candidate.source}:${candidate.taskId || ''}`.toLowerCase();
  const duplicate = seen.has(key);
  seen.add(key);

  if (duplicate) reasons.push('重复候选');
  if (isOrphanCandidate(candidate)) reasons.push('task_id 缺失/unknown 的孤儿候选（状态漂移产物）');
  if (isLowValueWorkflowLesson(candidate)) reasons.push('低信息密度的任务完成统计');
  if (isVagueLesson(candidate)) reasons.push('经验描述过短或占位');
  if (isSeedBoilerplateLesson(candidate)) reasons.push('seed spec 或占位方案噪音');
  if (!candidate.key || candidate.key === candidate.title) reasons.push('缺少稳定 key');

  if (duplicate || isOrphanCandidate(candidate) || isVagueLesson(candidate) || isSeedBoilerplateLesson(candidate) || !candidate.key || candidate.key === candidate.title) {
    return { block: candidate, action: 'skip', reasons };
  }

  if (isLowValueWorkflowLesson(candidate)) {
    return { block: candidate, action: 'archive', reasons };
  }

  const qualityReasons = lessonQualityReasons(candidate);
  if (qualityReasons.length > 0) {
    return {
      block: candidate,
      action: 'archive',
      reasons: qualityReasons,
    };
  }

  return {
    block: candidate,
    action: 'keep',
    reasons: ['具备触发条件、期望行为和边界'],
    pattern: candidateToPattern(candidate),
  };
}

function classifyCandidateBlocks(candidates: CandidateBlock[]): CandidateClassification[] {
  const seen = new Set<string>();
  return candidates.map((candidate) => classifyCandidate(candidate, seen));
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
