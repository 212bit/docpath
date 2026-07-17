import { execFileSync } from 'child_process';
import { readActiveStructuredSpecDocument, readActiveTaskFile } from './task-files.js';

export interface MajorDecisionSignal {
  label: string;
  detail: string;
}

export interface StructuredMajorChangeGate {
  required: boolean;
  types: string[];
  user_confirmed: string | null;
  decision_brief_markdown: string;
}

export interface MajorChangeGateStatus {
  signals: MajorDecisionSignal[];
  confirmed: boolean;
  output: string;
}

const MAJOR_DEPENDENCY_PATTERNS = [
  /^react$/,
  /^react-dom$/,
  /^vue$/,
  /^svelte$/,
  /^@angular\//,
  /^antd$/,
  /^@ant-design\//,
  /^@mui\//,
  /^@mantine\//,
  /^@radix-ui\//,
  /^tailwindcss$/,
  /^vite$/,
  /^webpack$/,
  /^rollup$/,
  /^prisma$/,
  /^typeorm$/,
  /^sequelize$/,
  /^mongoose$/,
  /^firebase$/,
  /^@aws-sdk\//,
  /^openai$/,
];

const MAJOR_CONFIG_FILE_PATTERNS = [
  /^vite\.config\./,
  /^webpack\.config\./,
  /^rollup\.config\./,
  /^tailwind\.config\./,
  /^postcss\.config\./,
  /^tsconfig\.json$/,
  /^prisma\//,
  /^migrations\//,
  /^schema\//,
  /^src\/db\//,
  /^src\/database\//,
  /^src\/api\//,
  /^src\/security\//,
  /^src\/auth\//,
];

const STRATEGIC_CHANGE_FILE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^templates\/spec\.template\.md$/, label: '任务规约模板变更' },
  { pattern: /^templates\/(?:AGENTS|CODEX|CLAUDE|OPENCODE)\.md$/, label: 'Agent 协议模板变更' },
  { pattern: /^templates\/protocols\/(?:AGENTS|CODEX|CLAUDE|OPENCODE)\.md$/, label: 'Agent 协议模板变更' },
  { pattern: /^src\/commands\/(?:check|review|next|go|agent|backlog|brainstorm|refine|plan)\.ts$/, label: '工作流/Agent 行为变更' },
  { pattern: /^src\/engine\//, label: '工作流状态机变更' },
  { pattern: /^src\/governance\//, label: '治理规则变更' },
  { pattern: /^src\/utils\/(?:agent-output|major-change|session|plan-sync|task-files)\.ts$/, label: '工作流/Agent 行为变更' },
  { pattern: /^\.docpath\/rules\//, label: '全局工作规则变更' },
];

function runGitOptional(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trimEnd();
  } catch {
    return null;
  }
}

function parseChangedPaths(statusOutput: string): string[] {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      return rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) || rawPath : rawPath;
    });
}

function extractAddedMajorDependencies(diffOutput: string): string[] {
  const added = new Set<string>();
  const dependencyLine = /^\+\s+"([^"]+)"\s*:/;
  for (const line of diffOutput.split('\n')) {
    const name = line.match(dependencyLine)?.[1];
    if (!name) continue;
    if (MAJOR_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(name))) added.add(name);
  }
  return Array.from(added).sort();
}

export function isMeaningfulUserConfirmation(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().length > 0 && !/^(待确认|无|N\/A|-)?$/i.test(value.trim());
}

export function specHasMajorDecisionConfirmation(specContent: string): boolean {
  const gateMatch = specContent.match(/##\s+4\.1\s+重大(?:决策|变更)门禁([\s\S]*?)(?=\n##\s+5\.|\n##\s+\d+\.|$)/);
  if (!gateMatch) return false;
  const gate = gateMatch[1];
  const requiresConfirmation = /^- \[[xX]\] 是，需要用户确认\s*$/m.test(gate);
  const hasUserConfirmation = /^- 用户确认:\s*\S.+$/m.test(gate) && !/^- 用户确认:\s*(待确认|无|N\/A|-)?\s*$/mi.test(gate);
  return requiresConfirmation && hasUserConfirmation;
}

export function structuredMajorGateConfirmation(
  gate: StructuredMajorChangeGate | undefined,
  decisionBrief?: any
): boolean | null {
  if (!gate) return null;
  if (!gate.required) return false;

  const hasUserConfirmed = isMeaningfulUserConfirmation(gate.user_confirmed);
  const hasDecisionBriefText = gate.decision_brief_markdown.trim().length > 0;

  let structuredValid = true;
  if (decisionBrief && typeof decisionBrief === 'object') {
    const hasProblem = typeof decisionBrief.problem === 'string' && decisionBrief.problem.trim().length > 0;
    const hasOptions = Array.isArray(decisionBrief.options) && decisionBrief.options.length > 0;
    const hasChosen = typeof decisionBrief.chosen === 'string' && decisionBrief.chosen.trim().length > 0;
    const hasRationale = typeof decisionBrief.rationale === 'string' && decisionBrief.rationale.trim().length > 0;
    structuredValid = hasProblem && hasOptions && hasChosen && hasRationale;
  }

  return hasUserConfirmed && hasDecisionBriefText && structuredValid;
}

export function collectMajorDecisionSignals(cwd: string): MajorDecisionSignal[] {
  const statusOutput = runGitOptional(cwd, ['status', '--porcelain=v1', '--untracked-files=all']) || '';
  const paths = parseChangedPaths(statusOutput);
  const signals: MajorDecisionSignal[] = [];
  const packageChanged = paths.includes('package.json') || paths.includes('pnpm-lock.yaml') || paths.includes('package-lock.json') || paths.includes('yarn.lock');
  if (packageChanged) {
    const diff = [
      runGitOptional(cwd, ['diff', '--', 'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']) || '',
      runGitOptional(cwd, ['diff', '--cached', '--', 'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']) || '',
    ].join('\n');
    const deps = extractAddedMajorDependencies(diff);
    if (deps.length > 0) signals.push({ label: '新增重大依赖', detail: deps.join(', ') });
  }
  const configPaths = paths.filter((path) => MAJOR_CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(path)));
  if (configPaths.length > 0) signals.push({ label: '重大配置/契约文件变更', detail: configPaths.slice(0, 12).join(', ') });
  const strategicGroups = new Map<string, string[]>();
  for (const path of paths) {
    for (const { pattern, label } of STRATEGIC_CHANGE_FILE_PATTERNS) {
      if (!pattern.test(path)) continue;
      const items = strategicGroups.get(label) || [];
      items.push(path);
      strategicGroups.set(label, items);
      break;
    }
  }
  for (const [label, items] of strategicGroups) {
    signals.push({ label, detail: Array.from(new Set(items)).slice(0, 12).join(', ') });
  }
  return signals;
}

export function formatMajorChangeGateFailure(signals: MajorDecisionSignal[]): string {
  return [
    '❌  检测到未提交的重大变更，但当前 spec 尚未通过重大变更门禁。',
    '',
    '🚨  触发信号的未提交文件:',
    ...signals.map((signal) => `- ${signal.label}: ${signal.detail}`),
    '',
    '💡  重大变更门禁有两种合法出路：',
    '',
    '  👉  出路一：如果本次开发确属重大变更（将变更类型、设计、或工作流）',
    '      1. 在 spec.md 的 "## 4.1 重大变更门禁" 中填写详细的 Decision Brief（问题、目标、方案、风险等）；',
    '      2. 将门禁选择勾选为：[x] 是，需要用户确认；',
    '      3. 在 "用户确认:" 填写具体的确认依据（不能为 "待确认"、"无"、"N/A" 或空）。',
    '      （这允许您带着未提交的重大资产文件通过 check/review）',
    '',
    '  👉  出路二：如果本次开发不属重大变更（例如：仅为遗留改动、本地调试，或属于其他任务的变更）',
    '      - 请先通过 git commit 提交这些信号文件，或通过 git restore 撤销无关改动；',
    '      - 只要 Git 工作区中没有这些未提交的信号文件，重大变更门禁就不会被触发（即使 spec 勾选 "否" 也能直接通过）。',
    '',
    '⚠️  注意：在存在未提交信号文件时，仅仅在 spec.md 中勾选 "否" 是无法通过门禁的。',
  ].join('\n');
}

export async function resolveMajorChangeGateStatus(
  cwd: string,
  docpathDir: string,
  taskId: string | undefined,
): Promise<MajorChangeGateStatus> {
  const signals = collectMajorDecisionSignals(cwd);
  if (signals.length === 0) {
    return { signals, confirmed: true, output: '未检测到重大变更信号' };
  }

  const structuredSpec = await readActiveStructuredSpecDocument(docpathDir, taskId);
  const structuredConfirmed = structuredMajorGateConfirmation(structuredSpec?.major_change_gate, structuredSpec?.decision_brief);
  const specContent = structuredConfirmed === null ? await readActiveTaskFile(docpathDir, taskId, 'spec.md') : '';
  const confirmed = structuredConfirmed ?? specHasMajorDecisionConfirmation(specContent);
  return {
    signals,
    confirmed,
    output: confirmed
      ? `已确认重大变更:\n${signals.map((signal) => `- ${signal.label}: ${signal.detail}`).join('\n')}`
      : formatMajorChangeGateFailure(signals),
  };
}

export async function assertMajorChangeGateReady(
  cwd: string,
  docpathDir: string,
  taskId: string | undefined,
  command: string,
): Promise<void> {
  const status = await resolveMajorChangeGateStatus(cwd, docpathDir, taskId);
  if (status.confirmed) return;
  throw new Error([
    `docpath ${command}: 重大变更门禁未完成`,
    status.output,
  ].join('\n'));
}
