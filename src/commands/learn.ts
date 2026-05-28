/**
 * docpath:learn — 从 journal 提取反模式 → 更新 style.md
 * Superpower 学习闭环：把踩过的坑变成自动检查
 */

import { readFileSafe } from '../utils/file.js';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

interface LearnOptions {
  cwd: string;
  journalPath?: string;
  skipAi?: boolean;
}

interface Pattern {
  type: 'anti-pattern' | 'best-practice' | 'convention';
  keyword: string;
  description: string;
  source: string;  // from which journal entry
}

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
  }

  return patterns;
}

function extractKeyword(text: string): string | null {
  // Extract the most relevant keyword/phrase
  const match = text.match(/[\u4e00-\u9fa5a-zA-Z_]{2,20}/);
  return match ? match[0] : null;
}

function patternsToStyleSection(patterns: Pattern[]): string {
  if (patterns.length === 0) return '';

  let section = '\n## 自动学习规则\n\n';

  const antiPatterns = patterns.filter(p => p.type === 'anti-pattern');
  const bestPractices = patterns.filter(p => p.type === 'best-practice');
  const conventions = patterns.filter(p => p.type === 'convention');

  if (antiPatterns.length > 0) {
    section += '### ⚠️ 反模式\n\n';
    for (const p of antiPatterns) {
      section += `- **${p.keyword}**: ${p.description}\n`;
    }
    section += '\n';
  }

  if (bestPractices.length > 0) {
    section += '### ✅ 最佳实践\n\n';
    for (const p of bestPractices) {
      section += `- **${p.keyword}**: ${p.description}\n`;
    }
    section += '\n';
  }

  if (conventions.length > 0) {
    section += '### 📋 规范\n\n';
    for (const p of conventions) {
      section += `- **${p.keyword}**: ${p.description}\n`;
    }
    section += '\n';
  }

  return section;
}

export async function learnCommand(options: LearnOptions): Promise<void> {
  console.log('\n🧠  学习模式 — 从经验中提取规则\n');

  // Find journal entries
  const journalDir = join(options.cwd, '.docpath', 'workspace', 'journal');
  const defaultJournal = join(options.cwd, '.docpath', 'workspace', 'journal.md');

  let journalContent = '';

  if (options.journalPath) {
    journalContent = await readFileSafe(options.journalPath) || '';
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
  const patterns = extractPatternsFromJournal(journalContent, 'journal');

  if (patterns.length === 0) {
    console.log('📭  未发现可提取的规则模式。\n');
    console.log('💡  在 journal 中使用以下标记可被自动提取:');
    console.log('   ⚠️ 反模式/避免    ✅ 最佳实践/推荐    📋 规范/格式\n');
    return;
  }

  console.log(`📊  发现 ${patterns.length} 条规则:\n`);
  for (const p of patterns) {
    const icon = p.type === 'anti-pattern' ? '⚠️' : p.type === 'best-practice' ? '✅' : '📋';
    console.log(`  ${icon} [${p.type}] ${p.keyword}: ${p.description.slice(0, 80)}...`);
  }

  // Update style.md
  const stylePath = join(options.cwd, '.docpath', 'workspace', 'style.md');
  const existingStyle = await readFileSafe(stylePath) || '';

  // Remove old auto-learned section if exists
  const cleanedStyle = existingStyle.replace(/\n## 自动学习规则[\s\S]*$/, '');
  const newSection = patternsToStyleSection(patterns);

  await mkdir(join(options.cwd, '.docpath', 'workspace'), { recursive: true });
  await writeFile(stylePath, cleanedStyle + newSection, 'utf-8');

  console.log(`\n✅  已更新 style.md (+${patterns.length} 条规则)\n`);
  console.log('💡  下次 `docpath:go` 将自动应用这些规则。\n');
}
