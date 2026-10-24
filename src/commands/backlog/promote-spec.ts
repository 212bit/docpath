/**
 * docpath backlog — promote 生成的 spec 与重大变更门禁
 */

import type { BacklogEvidence, BacklogItem } from '../../engine/backlog.js';
import { detectDirtyWorktree } from '../../utils/git-dirty-guard.js';
import { hasExplicitUiDesignIntent } from '../../utils/ui-gate.js';
import {
  extractFunctionalRequirements,
  getMarkdownSection,
  isPlaceholderValue,
  parseBacklogBody,
  parseBacklogChecklist,
  parseMultilineListItems,
  stripBacklogChecklistLines,
} from './markdown.js';

/**
 * 汇总 backlog evidence 字段为可读段落。
 * 只输出有内容的证据，避免空段占位。
 */
function renderEvidenceSummary(evidence: BacklogEvidence): string {
  const parts: string[] = [];
  if (evidence.brainstorm?.trim()) {
    parts.push('### 需求澄清历史 (brainstorm)', '', evidence.brainstorm.trim(), '');
  }
  if (evidence.analysis?.trim()) {
    parts.push('### 深度分析摘要 (analysis)', '', evidence.analysis.trim(), '');
  }
  if (parts.length === 0) return '';
  return ['## 1.1 已有证据', '', ...parts].join('\n');
}

export function renderPromotedSpec(item: BacklogItem, taskId: string, cwd?: string): string {
  const parsed = parseBacklogBody(item.body);
  const evidenceSection = renderEvidenceSummary(item.evidence);
  const functionalRequirements = extractFunctionalRequirements(item);
  const backgroundSection = (parseBacklogChecklist(item.body, 'FR').length > 0
    ? stripBacklogChecklistLines(parsed.background, 'FR')
    : parsed.background) || '- 待补充';
  const functionalRequirementLines = functionalRequirements.map(
    (requirement, idx) => {
      const line = `- [${requirement.done ? 'x' : ' '}] ${requirement.id}: ${requirement.text}`;
      return idx === 0 ? `${line}\n  - 来源 backlog: ${item.id}` : line;
    }
  );

  // 验收标准：优先从 body 解析出的 acceptance，否则根据 FR 生成结构化 AC
  const acceptanceLines: string[] = [];
  if (parsed.acceptance) {
    // 将 body 中的验收内容转为 AC 条目，并去重 AC-1: 前缀，支持多行缩进合并
    const rawItems = parseMultilineListItems(parsed.acceptance)
      .filter((l) => l && !isPlaceholderValue(l));

    const isGenericOnly = rawItems.length > 0 && rawItems.every((line) =>
      /^(?:AC-\d+\s*:\s*)?(?:满足需求并通过(?:门禁|测试)|通过门禁|测试通过)$/.test(line)
    );

    if (!isGenericOnly && rawItems.length > 0) {
      rawItems.forEach((line, i) => {
        const clean = line.replace(/^(?:AC|ac)-\d+\s*:\s*/, '').trim();
        acceptanceLines.push(`- [ ] AC-${i + 1}: ${clean}`);
      });
    }
  }

  if (acceptanceLines.length === 0) {
    if (functionalRequirements.length > 1) {
      functionalRequirements.forEach((fr, idx) => {
        acceptanceLines.push(`- [ ] AC-${idx + 1}: ${fr.text} 满足功能要求并通过测试`);
      });
    } else {
      acceptanceLines.push(`- [ ] AC-1: ${item.title} 满足需求并通过门禁`);
    }
  }

  // 始终保留关联 AC
  const acStart = acceptanceLines.length + 1;
  acceptanceLines.push(`- [ ] AC-${acStart}: 生成的 spec 可直接进入 \`docpath plan\``);
  acceptanceLines.push(`- [ ] AC-${acStart + 1}: backlog 条目 ${item.id} 与任务 ${taskId} 建立双向关联`);

  // Decision Brief 预填：如果 evidence.decision_brief 有非占位内容则注入
  const decisionBriefContent = item.evidence.decision_brief?.trim();
  const hasDecisionBrief = decisionBriefContent && !isPlaceholderValue(decisionBriefContent);

  const lines: string[] = [
    `# ${taskId} - ${item.title}`,
    '',
    `> backlog_id: ${item.id}`,
    `> backlog_source: ${item.source || 'unknown'}`,
    '',
    '## 1. 背景与动机',
    '',
    backgroundSection,
  ];

  if (evidenceSection) {
    lines.push('', evidenceSection);
  }

  lines.push(
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    ...functionalRequirementLines,
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持与现有 DocPath 工作流兼容',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    `- ${item.title}`,
    '',
    '### 不包含',
    '- 待在后续规划中补充',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |',
    '',
    ...renderMajorDecisionGate(item, cwd),
  );

  // 如果 decision_brief 有预填内容，在 Decision Brief 段后追加
  if (hasDecisionBrief) {
    lines.push('', '### 已有 Decision Brief (来自 backlog evidence)', '', decisionBriefContent);
  }

  lines.push(
    '',
    '## 5. 验收标准',
    '',
    ...acceptanceLines,
    '',
    '---',
    '',
    '*此文件由 `docpath backlog promote` 生成。*',
    '',
  );

  return lines.join('\n');
}

function backlogSearchText(item: BacklogItem): string {
  return [
    item.title,
    item.body,
    item.evidence.user_confirmed || '',
    item.evidence.decision_brief || '',
  ].join('\n');
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isProductUiImplementationTask(item: BacklogItem): boolean {
  const text = backlogSearchText(item);
  if (includesAny(text, [
    /without[\s\S]{0,160}(product\s*UI\s*design|UI\/UX\s*design|design\s*assets|design-preview)/i,
    /no[\s\S]{0,160}(product\s*UI\s*design|UI\/UX\s*design|design\s*assets|design-preview)/i,
    /不涉及[\s\S]{0,160}(产品\s*UI|UI\s*设计|设计稿|设计审批|design-preview)/i,
    /不包含[\s\S]{0,160}(产品\s*UI|UI\s*设计|设计稿|设计审批|design-preview)/i,
    /不做[\s\S]{0,160}(产品\s*UI|UI\s*设计|设计稿|设计审批|design-preview)/i,
    /豁免[\s\S]{0,80}(设计五件套|UI\/UX\s*设计证据包|UI\s*设计门禁|design gate)/i,
  ])) {
    return false;
  }
  return hasExplicitUiDesignIntent(text);
}

function inferMajorChangeTypes(item: BacklogItem, cwd?: string): Set<string> {
  const types = new Set<string>();
  if (!cwd) return types;

  try {
    const report = detectDirtyWorktree(cwd);
    if (report.isGitRepo && report.dirty) {
      for (const file of report.files) {
        const normalized = file.replace(/\\/g, '/');
        if (
          normalized.startsWith('src/engine/') ||
          normalized.startsWith('src/commands/agent.ts') ||
          normalized.startsWith('src/commands/go.ts') ||
          normalized.startsWith('src/commands/transitions.ts') ||
          normalized.startsWith('.docpath/workspace/state.json')
        ) {
          types.add('工作流 / Agent 行为');
        }
        if (
          normalized.startsWith('src/utils/git-closeout.ts') ||
          normalized.startsWith('src/utils/git-dirty-guard.ts') ||
          normalized.startsWith('src/utils/lock.ts')
        ) {
          types.add('权限 / 写操作边界');
        }
        if (
          normalized.startsWith('package.json') ||
          normalized.startsWith('tsup.config.ts') ||
          normalized.startsWith('tsconfig.json') ||
          normalized.startsWith('src/utils/config.ts')
        ) {
          types.add('技术栈 / 框架');
        }
      }
    }
  } catch {
    // ignore
  }

  return types;
}

function renderMajorDecisionGate(item: BacklogItem, cwd?: string): string[] {
  const productUi = isProductUiImplementationTask(item);
  const inferredTypes = inferMajorChangeTypes(item, cwd);
  const userConfirmed = item.evidence.user_confirmed?.trim() || '';
  const requiresMajorConfirmation = item.level >= 3 || userConfirmed.length > 0 || inferredTypes.size > 0;
  const checked = (value: boolean) => value ? 'x' : ' ';
  const typeLine = (label: string) => `- [${checked(inferredTypes.has(label))}] ${label}`;
  const decisionBriefRef = item.evidence.decision_brief?.trim() || '';
  const hasDbRef = decisionBriefRef && !isPlaceholderValue(decisionBriefRef);

  // Problem extraction: extract first line of background section without heading
  const bgSection = getMarkdownSection(item.body, '背景');
  let problem = '';
  if (bgSection && !isPlaceholderValue(bgSection)) {
    const firstLine = bgSection.trim().split('\n').find((line) => line.trim().length > 0)?.trim();
    if (firstLine) {
      problem = firstLine.replace(/^\s*(\d+\.\s*|[-*]\s*)+/, '').trim();
    }
  }
  if (!problem || isPlaceholderValue(problem)) {
    problem = item.title;
  }

  return [
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    `- [${checked(!requiresMajorConfirmation)}] 否`,
    `- [${checked(requiresMajorConfirmation)}] 是，需要用户确认`,
    '',
    '### 变更类型',
    typeLine('技术栈 / 框架'),
    typeLine('UI 框架 / 设计系统'),
    typeLine('构建工具 / 打包方式'),
    typeLine('数据库 / 存储模型'),
    typeLine('API / 数据契约'),
    typeLine('部署 / 运行方式'),
    typeLine('安全 / 权限边界'),
    typeLine('外部 SDK / 大依赖'),
    typeLine('架构 / 模块边界'),
    typeLine('UI 信息架构 / 用户主路径'),
    typeLine('工作流 / Agent 行为'),
    typeLine('权限 / 写操作边界'),
    typeLine('范围扩大'),
    typeLine('删除 / 替换已有能力'),
    typeLine('长期维护成本增加'),
    typeLine('其他'),
    '',
    '### UI 设计门禁',
    `- [${checked(!productUi)}] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）`,
    `- [${checked(productUi)}] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）`,
    '',
    '### Decision Brief',
    `- 当前问题: ${problem}`,
    `- 目标: ${item.title}`,
    `- 背景: 来自 backlog ${item.id}${hasDbRef ? `，Decision Brief 证据: ${decisionBriefRef}` : ''}`,
    '- 可选方案:',
    '  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程',
    '  - 方案 B: 补充分析，扩展本任务范围',
    '- 推荐方案: 方案 A',
    '- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险',
    '- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围',
    '- 成本: 中等，按 plan 拆分后逐步验证',
    '- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移',
    '- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed',
    `- 用户确认: ${userConfirmed || '待确认'}`,
  ];
}
