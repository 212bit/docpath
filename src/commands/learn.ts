/**
 * docpath:learn — 从 journal/lesson candidates 提取规则 → 更新 style.md / architecture.md
 * Superpower 学习闭环：把踩过的坑变成自动检查
 */

import { readFileSafe, resolveDocpathDir} from '../utils/file.js';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

interface LearnOptions {
  cwd: string;
  journalPath?: string;
  skipAi?: boolean;
}

interface Pattern {
  type: 'anti-pattern' | 'best-practice' | 'convention' | 'architecture';
  keyword: string;
  description: string;
  source: string;  // from which journal entry
  taskId?: string;
}

const AUTO_STYLE_MARKER = '<!-- docpath:auto-learn:style -->';
const AUTO_ARCH_MARKER = '<!-- docpath:auto-learn:architecture -->';

function extractPatternsFromJournal(content: string, source: string): Pattern[] {
  const patterns: Pattern[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for anti-pattern markers
    if (line.match(/⚠️|反模式|anti.?pattern|不要|避免|错误/i)) {
      const desc = lines.slice(i, Math.min(i + 3, lines.length)).join(' ').trim();
      const keyword = extractKeyword(desc);
      if (keyword) {
        patterns.push({
          type: 'anti-pattern',
          keyword,
          description: desc.slice(0, 200),
          source,
        });
      }
    }

    // Look for best practice markers
    if (line.match(/✅|最佳实践|best.?practice|应该|推荐|使用/i)) {
      const desc = lines.slice(i, Math.min(i + 3, lines.length)).join(' ').trim();
      const keyword = extractKeyword(desc);
      if (keyword) {
        patterns.push({
          type: 'best-practice',
          keyword,
          description: desc.slice(0, 200),
          source,
        });
      }
    }

    // Look for convention markers
    if (line.match(/📋|规范|convention|格式|命名/i)) {
      const desc = lines.slice(i, Math.min(i + 3, lines.length)).join(' ').trim();
      const keyword = extractKeyword(desc);
      if (keyword) {
        patterns.push({
          type: 'convention',
          keyword,
          description: desc.slice(0, 200),
          source,
        });
      }
    }

    if (line.match(/🏗️|架构|architecture|模块|边界|接口|数据模型/i)) {
      const desc = lines.slice(i, Math.min(i + 3, lines.length)).join(' ').trim();
      const keyword = extractKeyword(desc);
      if (keyword) {
        patterns.push({
          type: 'architecture',
          keyword,
          description: desc.slice(0, 200),
          source,
        });
      }
    }
  }

  return patterns;
}

function extractCandidateLessons(content: string): Pattern[] {
  const patterns: Pattern[] = [];
  const blocks = content.split(/^##\s+/m).filter((block) => block.trim());

  for (const block of blocks) {
    const title = block.split('\n')[0]?.trim() || '';
    const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim();
    const typeValue = block.match(/^- type:\s*(.+)$/m)?.[1]?.trim();
    const targetValue = block.match(/^- target:\s*(.+)$/m)?.[1]?.trim();
    const source = block.match(/^- source:\s*(.+)$/m)?.[1]?.trim() || 'lesson-candidates';
    const description = block.match(/^### Lesson\s*\n([\s\S]*?)(?=\n###|\n---|$)/m)?.[1]?.trim()
      || block.match(/^### 经验\s*\n([\s\S]*?)(?=\n###|\n---|$)/m)?.[1]?.trim()
      || title;
    const keyword = block.match(/^- key:\s*(.+)$/m)?.[1]?.trim() || extractKeyword(description) || title;
    const type: Pattern['type'] = targetValue === 'architecture' || typeValue === 'architecture'
      ? 'architecture'
      : typeValue === 'anti-pattern' || typeValue === 'best-practice' || typeValue === 'convention'
        ? typeValue
        : 'best-practice';

    if (description) {
      patterns.push({
        type,
        keyword,
        description: description.slice(0, 300),
        source,
        taskId,
      });
    }
  }

  return patterns;
}

function extractKeyword(text: string): string | null {
  // Extract the most relevant keyword/phrase
  const match = text.match(/[\u4e00-\u9fa5a-zA-Z_]{2,20}/);
  return match ? match[0] : null;
}

function lessonKey(pattern: Pattern): string {
  return `${pattern.type}:${pattern.keyword}:${pattern.description}`
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

function patternsToStyleSection(patterns: Pattern[]): string {
  if (patterns.length === 0) return '';

  let section = `\n${AUTO_STYLE_MARKER}\n## 自动学习规则\n\n`;

  const antiPatterns = patterns.filter(p => p.type === 'anti-pattern');
  const bestPractices = patterns.filter(p => p.type === 'best-practice');
  const conventions = patterns.filter(p => p.type === 'convention');

  if (antiPatterns.length > 0) {
    section += '### ⚠️ 反模式\n\n';
    for (const p of antiPatterns) {
      section += `- **${p.keyword}**: ${p.description}${sourceSuffix(p)}\n`;
    }
    section += '\n';
  }

  if (bestPractices.length > 0) {
    section += '### ✅ 最佳实践\n\n';
    for (const p of bestPractices) {
      section += `- **${p.keyword}**: ${p.description}${sourceSuffix(p)}\n`;
    }
    section += '\n';
  }

  if (conventions.length > 0) {
    section += '### 📋 规范\n\n';
    for (const p of conventions) {
      section += `- **${p.keyword}**: ${p.description}${sourceSuffix(p)}\n`;
    }
    section += '\n';
  }

  return section;
}

function patternsToArchitectureSection(patterns: Pattern[]): string {
  if (patterns.length === 0) return '';

  let section = `\n${AUTO_ARCH_MARKER}\n## 自动学习架构经验\n\n`;
  for (const p of patterns) {
    section += `- **${p.keyword}**: ${p.description}${sourceSuffix(p)}\n`;
  }
  section += '\n';
  return section;
}

function stripAutoSection(content: string, marker: string): string {
  const index = content.indexOf(marker);
  return index >= 0 ? content.slice(0, index).trimEnd() + '\n' : content;
}

export async function learnCommand(options: LearnOptions): Promise<void> {
  console.log('\n🧠  学习模式 — 从经验中提取规则\n');

  // Find journal entries
  const journalDir = join(options.cwd, '.docpath', 'workspace', 'journal');
  const defaultJournal = join(options.cwd, '.docpath', 'workspace', 'journal.md');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const lessonCandidatesPath = join(docpathDir, 'workspace', 'lesson-candidates.md');

  let journalContent = '';

  if (options.journalPath) {
    journalContent = await readFileSafe(options.journalPath) || '';
  } else if (existsSync(lessonCandidatesPath)) {
    journalContent = await readFileSafe(lessonCandidatesPath) || '';
  } else {
    // Try directory first, then single file
    const fs = await import('node:fs/promises');
    try {
      const entries = await fs.readdir(journalDir);
      const mdFiles = entries.filter(f => f.endsWith('.md')).sort();
      for (const f of mdFiles) {
        const content = await readFileSafe(join(journalDir, f));
        if (content) journalContent += `\n--- ${f} ---\n${content}\n`;
      }
    } catch {
      // Fall back to single file
      journalContent = await readFileSafe(defaultJournal) || '';
    }
  }

  if (!journalContent) {
    console.log('⚠️  未找到 journal 内容。先运行 `docpath:journal` 积累经验。\n');
    return;
  }

  // Extract patterns
  const candidatePatterns = extractCandidateLessons(journalContent);
  const rawPatterns = candidatePatterns.length > 0
    ? candidatePatterns
    : extractPatternsFromJournal(journalContent, options.journalPath ? options.journalPath : 'journal');
  const patterns = uniquePatterns(rawPatterns);

  if (patterns.length === 0) {
    console.log('📭  未发现可提取的规则模式。\n');
    console.log('💡  在 journal 中使用以下标记可被自动提取:');
    console.log('   ⚠️ 反模式/避免    ✅ 最佳实践/推荐    📋 规范/格式\n');
    return;
  }

  console.log(`📊  发现 ${patterns.length} 条规则:\n`);
  for (const p of patterns) {
    const icon = p.type === 'anti-pattern' ? '⚠️' : p.type === 'best-practice' ? '✅' : p.type === 'architecture' ? '🏗️' : '📋';
    console.log(`  ${icon} [${p.type}] ${p.keyword}: ${p.description.slice(0, 80)}...`);
  }

  const stylePatterns = patterns.filter((p) => p.type !== 'architecture');
  const architecturePatterns = patterns.filter((p) => p.type === 'architecture');

  // Update style.md
  const stylePath = join(docpathDir, 'spec', 'style.md');
  const existingStyle = await readFileSafe(stylePath) || '';
  const cleanedStyle = stripAutoSection(existingStyle, AUTO_STYLE_MARKER);
  const newSection = patternsToStyleSection(stylePatterns);

  await mkdir(join(docpathDir, 'spec'), { recursive: true });
  if (newSection) await writeFile(stylePath, cleanedStyle + newSection, 'utf-8');

  const architecturePath = join(docpathDir, 'spec', 'architecture.md');
  const existingArchitecture = await readFileSafe(architecturePath) || '';
  const cleanedArchitecture = stripAutoSection(existingArchitecture, AUTO_ARCH_MARKER);
  const architectureSection = patternsToArchitectureSection(architecturePatterns);
  if (architectureSection) await writeFile(architecturePath, cleanedArchitecture + architectureSection, 'utf-8');

  console.log(`\n✅  已更新 style.md (+${stylePatterns.length} 条规则), architecture.md (+${architecturePatterns.length} 条经验)\n`);
  console.log('💡  下次 `docpath:go` 将自动应用这些规则。\n');
}
