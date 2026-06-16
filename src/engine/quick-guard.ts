import { execSync } from 'node:child_process';

export interface QuickScopeVerdict {
  allowed: boolean;
  changedFiles: string[];
  reasons: string[];
}

const MAX_QUICK_CHANGED_FILES = 3;

const RISKY_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\.github\//, reason: 'CI/CD configuration changed' },
  { pattern: /^package(?:-lock)?\.json$/, reason: 'package contract changed' },
  { pattern: /^pnpm-lock\.yaml$/, reason: 'dependency lockfile changed' },
  { pattern: /^src\/engine\//, reason: 'core workflow engine changed' },
  { pattern: /^src\/commands\/(agent|check|done|go|journal|review|runtime|register)\b/, reason: 'core lifecycle command changed' },
  { pattern: /^src\/utils\/(agent-output|major-change|task-files|ui-gate|workspace)\.ts$/, reason: 'core workflow utility changed' },
  { pattern: /^templates\/(AGENTS|CLAUDE|OPENCODE|SKILL)\.md$/, reason: 'agent protocol template changed' },
  { pattern: /^\.docpath\/rules\//, reason: 'global DocPath rule changed' },
];

function readChangedFiles(cwd: string): string[] {
  try {
    const output = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => file.replace(/^"|"$/g, ''));
  } catch {
    return [];
  }
}

function isDocpathTaskEvidence(file: string): boolean {
  return /^\.docpath\/(tasks|workspace|backlog)\//.test(file);
}

export function evaluateQuickScope(cwd: string): QuickScopeVerdict {
  const changedFiles = readChangedFiles(cwd).filter((file) => !isDocpathTaskEvidence(file));
  const reasons: string[] = [];

  if (changedFiles.length > MAX_QUICK_CHANGED_FILES) {
    reasons.push(`changed ${changedFiles.length} non-DocPath files (quick limit: ${MAX_QUICK_CHANGED_FILES})`);
  }

  for (const file of changedFiles) {
    const risky = RISKY_PATH_PATTERNS.find((item) => item.pattern.test(file));
    if (risky) reasons.push(`${file}: ${risky.reason}`);
  }

  return {
    allowed: reasons.length === 0,
    changedFiles,
    reasons,
  };
}

export function assertQuickScope(cwd: string): void {
  const verdict = evaluateQuickScope(cwd);
  if (verdict.allowed) return;
  throw new Error([
    'docpath quick: scope exceeds quick profile boundaries',
    ...verdict.reasons.map((reason) => `  - ${reason}`),
    'Upgrade path:',
    '  - Stop using quick for this change.',
    '  - Capture/promote a standard backlog task with spec and plan.',
    '  - Then rerun check/review/done through the standard lifecycle.',
  ].join('\n'));
}
