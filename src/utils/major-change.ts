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

export function structuredMajorGateConfirmation(gate: StructuredMajorChangeGate | undefined): boolean | null {
  if (!gate) return null;
  return gate.required && isMeaningfulUserConfirmation(gate.user_confirmed) && gate.decision_brief_markdown.trim().length > 0;
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
    '检测到重大变更，但当前 spec 未记录 Decision Brief 和用户确认。',
    ...signals.map((signal) => `- ${signal.label}: ${signal.detail}`),
    '修复方式:',
    '  1. 在 spec.md 的 `## 4.1 重大变更门禁` 填写 Decision Brief',
    '  2. 勾选 `是，需要用户确认`',
    '  3. 在 `用户确认:` 记录明确确认内容后再继续实现',
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
  const structuredConfirmed = structuredMajorGateConfirmation(structuredSpec?.major_change_gate);
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
