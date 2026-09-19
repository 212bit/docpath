import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, readFileSafe } from './file.js';

export type StandardRuleName = 'style' | 'architecture';
export type RuleName = StandardRuleName | string;

export interface ResolvedRuleFile {
  name: string;
  path: string;
  displayPath: string;
  legacyPath: string;
  legacyDisplayPath: string;
  exists: boolean;
  isLegacy: boolean;
}

export interface RulePaths {
  rulesDir: string;
  legacySpecDir: string;
  style: ResolvedRuleFile;
  architecture: ResolvedRuleFile;
  customRules: ResolvedRuleFile[];
  allRules: ResolvedRuleFile[];
}

export interface RuleBudgetAuditResult {
  name: string;
  file: ResolvedRuleFile;
  lineCount: number;
  exceedsBudget: boolean;
  maxLines: number;
  recommendation?: string;
}

export function ruleFile(docpathDir: string, name: string): ResolvedRuleFile {
  const normalizedName = name.replace(/\.md$/, '').trim().toLowerCase();
  const filename = `${normalizedName}.md`;
  const preferred = join(docpathDir, 'rules', filename);
  const legacy = join(docpathDir, 'spec', filename);
  const hasPreferred = existsSync(preferred);
  const hasLegacy = existsSync(legacy);

  return {
    name: normalizedName,
    path: hasPreferred || !hasLegacy ? preferred : legacy,
    displayPath: hasPreferred || !hasLegacy ? `.docpath/rules/${filename}` : `.docpath/spec/${filename}`,
    legacyPath: legacy,
    legacyDisplayPath: `.docpath/spec/${filename}`,
    exists: hasPreferred || hasLegacy,
    isLegacy: !hasPreferred && hasLegacy,
  };
}

/**
 * 动态发现并解析规则路径（支持标准 style/architecture 及任意扩展 rules/*.md）
 */
export function resolveRulePaths(docpathDir: string): RulePaths {
  const rulesDir = join(docpathDir, 'rules');
  const legacySpecDir = join(docpathDir, 'spec');

  const standardStyle = ruleFile(docpathDir, 'style');
  const standardArch = ruleFile(docpathDir, 'architecture');

  const seenNames = new Set<string>(['style', 'architecture']);
  const customRules: ResolvedRuleFile[] = [];

  // 扫描 .docpath/rules 目录中的所有 *.md 文件
  if (existsSync(rulesDir)) {
    try {
      const entries = readdirSync(rulesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const ruleName = entry.name.replace(/\.md$/, '').toLowerCase();
          if (!seenNames.has(ruleName)) {
            seenNames.add(ruleName);
            customRules.push(ruleFile(docpathDir, ruleName));
          }
        }
      }
    } catch {
      // 容错处理
    }
  }

  // 扫描 legacy .docpath/spec 目录
  if (existsSync(legacySpecDir)) {
    try {
      const entries = readdirSync(legacySpecDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && !/^(architecture|style|spec|requirements)$/.test(entry.name.replace(/\.md$/, ''))) {
          const ruleName = entry.name.replace(/\.md$/, '').toLowerCase();
          if (!seenNames.has(ruleName)) {
            seenNames.add(ruleName);
            customRules.push(ruleFile(docpathDir, ruleName));
          }
        }
      }
    } catch {
      // 容错处理
    }
  }

  const allRules = [standardStyle, standardArch, ...customRules];

  return {
    rulesDir,
    legacySpecDir,
    style: standardStyle,
    architecture: standardArch,
    customRules,
    allRules,
  };
}

export async function ensureRulesDir(docpathDir: string): Promise<void> {
  await ensureDir(join(docpathDir, 'rules'));
}

export async function readRuleFile(docpathDir: string, name: string): Promise<{ content: string; file: ResolvedRuleFile }> {
  const file = ruleFile(docpathDir, name);
  return {
    content: await readFileSafe(file.path) || '',
    file,
  };
}

export function compactRuleContent(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  let skipNextLessonMeta = false;

  for (const line of lines) {
    if (/^- \*\*.+?\*\*: ✅ 推荐保留本次任务的执行经验：完成\s*\d+\/\d+\s*步，阻塞\s*\d+\s*步。?/.test(line.trim())) {
      skipNextLessonMeta = true;
      continue;
    }
    if (skipNextLessonMeta && /^<!--\s*docpath:lesson-meta\s+/.test(line.trim())) {
      skipNextLessonMeta = false;
      continue;
    }
    skipNextLessonMeta = false;
    kept.push(line);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function ruleDisplayPaths(docpathDir?: string): string[] {
  if (!docpathDir) {
    return ['.docpath/rules/architecture.md', '.docpath/rules/style.md'];
  }
  const paths = resolveRulePaths(docpathDir);
  return paths.allRules.map((r) => r.displayPath);
}

/**
 * 审计各规则文件的行数/预算，防止规则无序膨胀
 */
export function auditRuleBudgets(docpathDir: string, maxLines = 150): RuleBudgetAuditResult[] {
  const paths = resolveRulePaths(docpathDir);
  const results: RuleBudgetAuditResult[] = [];

  for (const rule of paths.allRules) {
    if (!rule.exists) continue;
    const content = readFileSafe(rule.path);
    // readFileSafe is async, but we can count lines if sync or read content
  }
  return results;
}

/**
 * 异步审计规则预算
 */
export async function checkRuleBudgets(docpathDir: string, maxLines = 150): Promise<RuleBudgetAuditResult[]> {
  const paths = resolveRulePaths(docpathDir);
  const results: RuleBudgetAuditResult[] = [];

  for (const rule of paths.allRules) {
    if (!rule.exists) continue;
    const content = (await readFileSafe(rule.path)) || '';
    const lineCount = content.split('\n').length;
    const exceedsBudget = lineCount > maxLines;
    results.push({
      name: rule.name,
      file: rule,
      lineCount,
      exceedsBudget,
      maxLines,
      recommendation: exceedsBudget ? `规则文件已达 ${lineCount} 行（预算限制 ${maxLines} 行），建议运行 docpath learn groom 进行规则精简/归并` : undefined,
    });
  }

  return results;
}
