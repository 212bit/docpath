import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveRulePaths, type ResolvedRuleFile, RULE_FILE_LINE_BUDGET } from '../utils/rules.js';
import { readDecisionJsonl, type DecisionJsonlRecord } from '../utils/decisions.js';

export type RuleIssueSeverity = 'error' | 'warning' | 'info';

export type RuleIssueCategory =
  | 'duplicate'
  | 'near_duplicate'
  | 'semantic_conflict'
  | 'stale_reference'
  | 'budget_exceeded'
  | 'superseded_adr'
  | 'empty_rule';

export interface RuleDoctorIssue {
  id: string;
  severity: RuleIssueSeverity;
  category: RuleIssueCategory;
  target: string;
  message: string;
  details?: Record<string, unknown>;
  recommendation: string;
  fixable?: boolean;
}

export interface RuleEntity {
  id: string;
  file: string;
  fullPath: string;
  ruleName: string;
  type: string;
  title: string;
  heading: string;
  content: string;
  rationale?: string;
  trigger?: string;
  expected?: string;
  boundaries?: string;
  evidence: string[];
  relatedFiles: string[];
  lineStart: number;
  lineEnd: number;
  raw: string;
}

export interface DecisionEntity {
  id: string;
  category: string;
  taskId: string;
  createdAt: string;
  decision: string;
  context: string;
  impact: string;
  alternatives: string[];
  relatedFiles: string[];
  isSuperseded: boolean;
  supersededBy?: string;
  raw: string;
}

export interface RuleDoctorReport {
  passed: boolean;
  errors: number;
  warnings: number;
  infos: number;
  stats: {
    totalRuleFiles: number;
    totalRules: number;
    totalDecisions: number;
    totalBudgetLines: number;
  };
  issues: RuleDoctorIssue[];
}

export interface RuleDoctorOptions {
  cwd: string;
  maxBudgetLines?: number;
  similarityThreshold?: number;
  repoRoot?: string;
}

const POSITIVE_POLARITY_TERMS = [
  '必须', '务必', '要求', '强制', '允许', '支持', '应当',
  'must', 'always', 'prefer', 'enable', 'allow', 'require', 'mandatory',
];

const NEGATIVE_POLARITY_TERMS = [
  '禁止', '严禁', '不得', '勿', '避免', '禁止使用', '严禁使用', '不要',
  'never', 'avoid', 'disable', 'forbid', 'disallow', 'deprecate', 'ban',
];

/**
 * 提取中英文 Token 集合
 */
export function extractTokens(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[`*_#~[\]()]/g, ' ');
  const rawWords = normalized.match(/[\p{L}\p{N}_\-./]+/gu) || [];
  const tokens = new Set<string>();

  for (const word of rawWords) {
    if (word.length < 2) continue;
    tokens.add(word);
    // 对中文进行连续 2~4 字的 n-gram 切分
    if (/[\u4e00-\u9fa5]/.test(word)) {
      for (let len = 2; len <= Math.min(4, word.length); len++) {
        for (let i = 0; i <= word.length - len; i++) {
          tokens.add(word.slice(i, i + len));
        }
      }
    }
  }

  return tokens;
}

/**
 * 计算 Jaccard 集合相似度
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++;
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * 检查文本中的极性偏向
 */
export function detectPolarity(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase();
  const hasNeg = NEGATIVE_POLARITY_TERMS.some((term) => lower.includes(term));
  const hasPos = POSITIVE_POLARITY_TERMS.some((term) => lower.includes(term));

  if (hasNeg) return 'negative';
  if (hasPos) return 'positive';
  return 'neutral';
}

/**
 * 解析单个规则 Markdown 文件中的独立规则块
 */
export function parseRuleEntitiesFromMarkdown(fileDisplayPath: string, fullPath: string, content: string): RuleEntity[] {
  const lines = content.split('\n');
  const entities: RuleEntity[] = [];
  const ruleName = fileDisplayPath.replace(/^.*[/\\]/, '').replace(/\.md$/, '').toLowerCase();

  let currentHeading = '';
  let currentType = ruleName;
  let currentTitle = '';
  let currentLines: string[] = [];
  let currentStartLine = 1;

  function flushCurrent(endLine: number) {
    if (!currentHeading || currentLines.length === 0) return;

    const raw = currentLines.join('\n');
    const rationaleMatch = raw.match(/^- rationale:\s*(.+)$/m);
    const triggerMatch = raw.match(/触发:\s*([^。\n]+)/);
    const expectedMatch = raw.match(/期望(?:行为)?:\s*([^。\n]+)/);
    const boundaryMatch = raw.match(/边界:\s*([^。\n]+)/);

    // 提取 Evidence 中的文件引用
    const evidenceList: string[] = [];
    const relatedFiles: string[] = [];
    const evidenceBlock = raw.match(/###\s+Evidence\b([\s\S]*?)(?=\n###|\n##|$)/i);
    if (evidenceBlock) {
      const evLines = evidenceBlock[1].split('\n');
      for (const el of evLines) {
        const trimmed = el.trim().replace(/^-\s*/, '');
        if (trimmed) {
          evidenceList.push(trimmed);
          const fileCandidates = trimmed.match(/(?:src|tests|test|docs|\.docpath)\/[^\s()#<>:`'",\\]+\.(?:ts|js|mjs|json|yaml|yml|md)\b/g);
          if (fileCandidates) {
            for (const f of fileCandidates) {
              if (f.startsWith('.docpath/workspace/') || f.startsWith('.docpath/tasks/current/')) continue;
              if (!relatedFiles.includes(f)) {
                relatedFiles.push(f);
              }
            }
          }
        }
      }
    }

    const id = `${ruleName}:${currentType}:${currentTitle || `line-${currentStartLine}`}`.replace(/\s+/g, '-').toLowerCase();

    entities.push({
      id,
      file: fileDisplayPath,
      fullPath,
      ruleName,
      type: currentType,
      title: currentTitle || currentHeading,
      heading: currentHeading,
      content: raw,
      rationale: rationaleMatch ? rationaleMatch[1].trim() : undefined,
      trigger: triggerMatch ? triggerMatch[1].trim() : undefined,
      expected: expectedMatch ? expectedMatch[1].trim() : undefined,
      boundaries: boundaryMatch ? boundaryMatch[1].trim() : undefined,
      evidence: evidenceList,
      relatedFiles: Array.from(new Set(relatedFiles)),
      lineStart: currentStartLine,
      lineEnd: endLine,
      raw,
    });

    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(?:(gotcha|pattern|anti-pattern|common-mistake|style|architecture|rule):\s*)?(.+)$/i);

    if (headingMatch) {
      flushCurrent(i);
      currentHeading = line;
      currentType = (headingMatch[1] || 'rule').toLowerCase();
      currentTitle = headingMatch[2].trim();
      currentStartLine = i + 1;
      currentLines = [line];
    } else if (currentHeading) {
      currentLines.push(line);
    }
  }

  flushCurrent(lines.length);

  return entities;
}

/**
 * 扫描并解析工作区中的所有 ADR 记录
 */
export async function loadWorkspaceDecisions(docpathDir: string): Promise<DecisionEntity[]> {
  const workspaceDir = join(docpathDir, 'workspace');
  const jsonlRecords = await readDecisionJsonl(workspaceDir);
  const decisions: DecisionEntity[] = [];

  if (jsonlRecords && jsonlRecords.length > 0) {
    for (const r of jsonlRecords) {
      const isSuperseded = /superseded|已废弃|已由|deprecated/i.test(r.impact || '') ||
        /superseded|已废弃/i.test(r.decision || '');
      decisions.push({
        id: r.id,
        category: r.category,
        taskId: r.taskId,
        createdAt: r.createdAt,
        decision: r.decision,
        context: r.context,
        impact: r.impact,
        alternatives: r.alternatives || [],
        relatedFiles: r.relatedFiles || [],
        isSuperseded,
        raw: JSON.stringify(r),
      });
    }
    return decisions;
  }

  const decisionsMdPath = join(docpathDir, 'decisions.md');
  if (existsSync(decisionsMdPath)) {
    try {
      const content = await readFile(decisionsMdPath, 'utf-8');
      const adrBlocks = content.split(/(?=^##\s+ADR-)/m);
      for (const block of adrBlocks) {
        const idMatch = block.match(/^##\s+(ADR-\d{8}-\d{3})\b(?:\s*—\s*(.+))?/m);
        if (!idMatch) continue;
        const id = idMatch[1];
        const category = idMatch[2] || 'general';
        const decisionMatch = block.match(/### 决策([\s\S]*?)(?=(?:^###|\n\n##|$))/m);
        const decision = decisionMatch ? decisionMatch[1].trim() : '';
        const contextMatch = block.match(/### 背景([\s\S]*?)(?=(?:^###|\n\n##|$))/m);
        const context = contextMatch ? contextMatch[1].trim() : '';
        const impactMatch = block.match(/### 影响([\s\S]*?)(?=(?:^###|\n\n##|$))/m);
        const impact = impactMatch ? impactMatch[1].trim() : '';
        const isSuperseded = /superseded|已废弃|已由|deprecated/i.test(impact) || /superseded|已废弃/i.test(decision);

        decisions.push({
          id,
          category,
          taskId: block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim() || '',
          createdAt: block.match(/^- created_at:\s*(.+)$/m)?.[1]?.trim() || '',
          decision,
          context,
          impact,
          alternatives: [],
          relatedFiles: [],
          isSuperseded,
          raw: block,
        });
      }
    } catch {
      // 容错读取
    }
  }

  return decisions;
}

/**
 * 诊断规则与 ADR 健康度
 */
export async function diagnoseRulesAndDecisions(options: RuleDoctorOptions): Promise<RuleDoctorReport> {
  const {
    cwd,
    maxBudgetLines = RULE_FILE_LINE_BUDGET,
    similarityThreshold = 0.70,
  } = options;

  const repoRoot = options.repoRoot || cwd;
  const docpathDir = join(cwd, '.docpath');
  const rulePaths = resolveRulePaths(docpathDir);

  const issues: RuleDoctorIssue[] = [];
  const rules: RuleEntity[] = [];

  let totalBudgetLines = 0;
  let totalRuleFiles = 0;

  // 1. 解析规则文件并审计行数预算
  for (const rFile of rulePaths.allRules) {
    if (!rFile.exists) continue;
    totalRuleFiles++;

    let content = '';
    try {
      content = await readFile(rFile.path, 'utf-8');
    } catch {
      continue;
    }

    const lineCount = content.split('\n').length;
    totalBudgetLines += lineCount;

    if (lineCount > maxBudgetLines) {
      issues.push({
        id: `budget:${rFile.name}`,
        severity: 'warning',
        category: 'budget_exceeded',
        target: rFile.displayPath,
        message: `规则文件 ${rFile.displayPath} 共 ${lineCount} 行，超出推荐预算上限 (${maxBudgetLines} 行)`,
        details: { lineCount, maxBudgetLines },
        recommendation: `运行 docpath rule groom 或手动归并精简冗余条目以控制上下文膨胀`,
      });
    }

    const parsedRules = parseRuleEntitiesFromMarkdown(rFile.displayPath, rFile.path, content);
    rules.push(...parsedRules);
  }

  // 2. 加载 ADR
  const decisions = await loadWorkspaceDecisions(docpathDir);

  // 3. 检查孤立引用与失效文件路径 (Stale References)
  for (const rule of rules) {
    for (const relPath of rule.relatedFiles) {
      const full = resolve(repoRoot, relPath);
      if (!existsSync(full)) {
        issues.push({
          id: `stale-ref:${rule.id}:${relPath}`,
          severity: 'warning',
          category: 'stale_reference',
          target: `${rule.file}#${rule.title}`,
          message: `规则引用了不存在的文件路径: ${relPath}`,
          details: { ruleId: rule.id, file: rule.file, brokenPath: relPath },
          recommendation: `更新或删除规则 Evidence 中的失效路径引用`,
          fixable: true,
        });
      }
    }

    // 检查空规则块
    if (!rule.content.trim() || (!rule.rationale && rule.content.split('\n').length < 3)) {
      issues.push({
        id: `empty-rule:${rule.id}`,
        severity: 'warning',
        category: 'empty_rule',
        target: `${rule.file}#${rule.title}`,
        message: `规则条目内容不完整或缺少 rationale 解释`,
        details: { ruleId: rule.id },
        recommendation: `为规则补充 rationale 与 Evidence，或予以清理`,
        fixable: true,
      });
    }
  }

  // 4. 去重与高度相似检测 (Deduplication & Near-duplicate Check)
  const ruleTokenMap = new Map<string, Set<string>>();
  for (const rule of rules) {
    ruleTokenMap.set(rule.id, extractTokens(`${rule.title} ${rule.rationale || ''} ${rule.content}`));
  }

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const rA = rules[i];
      const rB = rules[j];

      const tokensA = ruleTokenMap.get(rA.id) || new Set();
      const tokensB = ruleTokenMap.get(rB.id) || new Set();

      const sim = calculateJaccardSimilarity(tokensA, tokensB);

      // 完全相同标题/高度相似内容
      const isExactTitle = rA.title.trim() === rB.title.trim();
      const isExactDuplicate = (isExactTitle && rA.file === rB.file) || sim >= 0.92;

      if (isExactDuplicate) {
        issues.push({
          id: `duplicate:${rA.id}:${rB.id}`,
          severity: 'error',
          category: 'duplicate',
          target: `${rA.file} ↔ ${rB.file}`,
          message: `发现重复规则条目: "${rA.title}" (相似度 ${(sim * 100).toFixed(0)}%)`,
          details: {
            ruleA: { id: rA.id, file: rA.file, line: rA.lineStart },
            ruleB: { id: rB.id, file: rB.file, line: rB.lineStart },
            similarity: sim,
          },
          recommendation: `运行 docpath rule dedupe 自动清理重复条目`,
          fixable: true,
        });
      } else if (sim >= similarityThreshold) {
        issues.push({
          id: `near-duplicate:${rA.id}:${rB.id}`,
          severity: 'warning',
          category: 'near_duplicate',
          target: `${rA.file} ↔ ${rB.file}`,
          message: `发现高相似度规则条目: "${rA.title}" 与 "${rB.title}" (相似度 ${(sim * 100).toFixed(0)}%)`,
          details: {
            ruleA: { id: rA.id, file: rA.file, title: rA.title },
            ruleB: { id: rB.id, file: rB.file, title: rB.title },
            similarity: sim,
          },
          recommendation: `建议合并同质化规则，避免规则库膨胀与认知混淆`,
        });
      }

      // 5. 语义冲突检测 (Semantic Conflict Detection)
      const titleTokensA = extractTokens(rA.title);
      const titleTokensB = extractTokens(rB.title);
      const titleSim = calculateJaccardSimilarity(titleTokensA, titleTokensB);

      if (sim >= 0.30 || titleSim >= 0.35) {
        const polA = detectPolarity(rA.content);
        const polB = detectPolarity(rB.content);
        if ((polA === 'positive' && polB === 'negative') || (polA === 'negative' && polB === 'positive')) {
          issues.push({
            id: `conflict:${rA.id}:${rB.id}`,
            severity: 'error',
            category: 'semantic_conflict',
            target: `${rA.file} ↔ ${rB.file}`,
            message: `发现疑似规则冲突: "${rA.title}" 与 "${rB.title}" 存在相反指令倾向 (Positive vs Negative)`,
            details: {
              ruleA: { file: rA.file, title: rA.title, polarity: polA },
              ruleB: { file: rB.file, title: rB.title, polarity: polB },
              titleSimilarity: titleSim,
              contentSimilarity: sim,
            },
            recommendation: `检查两条规则是否矛盾，明确优先级或标记废弃旧规则`,
          });
        }
      }
    }
  }

  // 6. ADR 冲突与覆盖审计
  for (let i = 0; i < decisions.length; i++) {
    for (let j = i + 1; j < decisions.length; j++) {
      const adrA = decisions[i];
      const adrB = decisions[j];

      if (adrA.category && adrA.category === adrB.category) {
        const tokensA = extractTokens(adrA.decision);
        const tokensB = extractTokens(adrB.decision);
        const sim = calculateJaccardSimilarity(tokensA, tokensB);

        const polA = detectPolarity(adrA.decision);
        const polB = detectPolarity(adrB.decision);

        if (sim >= 0.40 && ((polA === 'positive' && polB === 'negative') || (polA === 'negative' && polB === 'positive'))) {
          if (!adrA.isSuperseded && !adrB.isSuperseded) {
            issues.push({
              id: `adr-conflict:${adrA.id}:${adrB.id}`,
              severity: 'warning',
              category: 'superseded_adr',
              target: `${adrA.id} ↔ ${adrB.id}`,
              message: `同类别 ADR 存在相反决策倾向且未标记废弃/覆盖: [${adrA.id}] 与 [${adrB.id}]`,
              details: { adrA: adrA.id, adrB: adrB.id, category: adrA.category },
              recommendation: `在较早的 ADR 影响/决策中注明被 ${adrB.id} 替代 (superseded_by)`,
            });
          }
        }
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;

  return {
    passed: errors === 0,
    errors,
    warnings,
    infos,
    stats: {
      totalRuleFiles,
      totalRules: rules.length,
      totalDecisions: decisions.length,
      totalBudgetLines,
    },
    issues,
  };
}

/**
 * 自动修复规则文件中的完全重复项与失效引用
 */
export async function fixRuleIssues(docpathDir: string, options?: { repoRoot?: string }): Promise<{ fixedDuplicates: number; cleanedStaleRefs: number }> {
  const repoRoot = options?.repoRoot || resolve(docpathDir, '..');
  const rulePaths = resolveRulePaths(docpathDir);

  let fixedDuplicates = 0;
  let cleanedStaleRefs = 0;

  for (const rFile of rulePaths.allRules) {
    if (!rFile.exists) continue;

    let content = '';
    try {
      content = await readFile(rFile.path, 'utf-8');
    } catch {
      continue;
    }

    const rules = parseRuleEntitiesFromMarkdown(rFile.displayPath, rFile.path, content);
    if (rules.length === 0) continue;

    const seenSignatures = new Set<string>();
    const keepRules: RuleEntity[] = [];

    for (const rule of rules) {
      const sig = `${rule.type}:${rule.title.trim().toLowerCase()}`;
      if (seenSignatures.has(sig)) {
        fixedDuplicates++;
        continue;
      }
      seenSignatures.add(sig);

      // 清理失效的 Evidence 引用行
      const lines = rule.raw.split('\n');
      const filteredLines: string[] = [];
      let insideEvidence = false;

      for (const line of lines) {
        if (/^###\s+Evidence/.test(line)) {
          insideEvidence = true;
          filteredLines.push(line);
          continue;
        }

        if (insideEvidence && /^##\s+/.test(line)) {
          insideEvidence = false;
        }

        if (insideEvidence) {
          const matchPath = line.match(/(?:src|tests|test|docs|\.docpath)\/[^\s()#<>:`'",\\]+\.(?:ts|js|mjs|json|yaml|yml|md)\b/);
          if (matchPath) {
            const rel = matchPath[0];
            if (rel.startsWith('.docpath/workspace/') || rel.startsWith('.docpath/tasks/current/')) {
              // 运行时路径保留，不误当失效引用清理
            } else if (!existsSync(resolve(repoRoot, rel))) {
              cleanedStaleRefs++;
              continue; // 跳过此失效引用行
            }
          }
        }

        filteredLines.push(line);
      }

      keepRules.push({
        ...rule,
        raw: filteredLines.join('\n'),
      });
    }

    // 重新拼接文件内容
    const headerLines: string[] = [];
    const origLines = content.split('\n');
    for (const line of origLines) {
      if (/^##\s+/.test(line)) break;
      headerLines.push(line);
    }

    const header = headerLines.join('\n').trimEnd();
    const body = keepRules.map((r) => r.raw.trimEnd()).join('\n\n');
    const newContent = `${header ? `${header}\n\n` : ''}${body}\n`;

    await writeFile(rFile.path, newContent, 'utf-8');
  }

  return { fixedDuplicates, cleanedStaleRefs };
}
