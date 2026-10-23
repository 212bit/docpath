/**
 * Hippo 门禁合一（P2）：step-pass 前置自审钩子。
 *
 * 设计原则（协议优先、依赖可选）：
 * 1. docpath 不依赖 hippo 的包 —— 只在项目存在 `.hippo/` 且能找到 hippo 可执行文件时激活；
 * 2. 找不到、超时、输出无法解析等基础设施问题一律 fail-open（warn），只有
 *    明确拿到 `passed === false` 且 mode 为 block 时才拒绝状态转移；
 * 3. 契约固定为 `hippo self-review --json -f <diff>`：stdout 即 JSON，退出码 1 表示未通过。
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

export type HippoGateMode = 'block' | 'warn' | 'off';

export interface HippoGateConfig {
  mode: HippoGateMode;
  timeoutMs: number;
  maxDiffBytes: number;
  command?: string;
}

export interface HippoGateViolation {
  severity: 'error' | 'warning' | 'info';
  source: string;
  reason: string;
  rule_text: string;
}

export interface HippoGateResult {
  status: 'skipped' | 'pass' | 'blocked' | 'warn';
  reason: string;
  violations: HippoGateViolation[];
}

export interface HippoGateOptions {
  cwd: string;
  mode?: HippoGateMode;
  timeoutMs?: number;
  maxDiffBytes?: number;
  command?: string;
  /** 测试注入：绕过二进制探测 */
  binary?: string;
}

const DEFAULT_CONFIG: HippoGateConfig = {
  mode: 'block',
  timeoutMs: 20_000,
  maxDiffBytes: 200_000,
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function readHippoGateConfig(cwd: string): HippoGateConfig {
  const configPath = join(cwd, '.hippo', 'review-contract.json');
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const gate = (raw.gate && typeof raw.gate === 'object' ? raw.gate : raw) as Record<string, unknown>;
    const mode = gate.mode;
    const timeoutMs = gate.timeoutMs;
    const maxDiffBytes = gate.maxDiffBytes;
    return {
      mode: mode === 'warn' || mode === 'off' || mode === 'block' ? mode : DEFAULT_CONFIG.mode,
      timeoutMs:
        typeof timeoutMs === 'number' && timeoutMs > 0 && timeoutMs <= 120_000 ? timeoutMs : DEFAULT_CONFIG.timeoutMs,
      maxDiffBytes:
        typeof maxDiffBytes === 'number' && maxDiffBytes > 0 ? maxDiffBytes : DEFAULT_CONFIG.maxDiffBytes,
      command: typeof gate.command === 'string' && gate.command.trim() ? gate.command.trim() : undefined,
    };
  } catch {
    // 配置损坏时回落默认（block），但不因配置语法错误阻断流程
    return { ...DEFAULT_CONFIG };
  }
}

export function detectHippoBinary(cwd: string): string | null {
  const fromEnv = process.env.HIPPO_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    join(cwd, 'node_modules', '.bin', 'hippo'),
    join(cwd, 'node_modules', '.bin', 'hip'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  const pathDirs = (process.env.PATH || '').split(':').filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of ['hippo', 'hip']) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * 收集未提交改动（已暂存 + 未暂存）。无改动返回 null，便于调用方直接跳过。
 */
export function collectUncommittedDiff(cwd: string, maxDiffBytes: number): string | null {
  try {
    const diff = execFileSync('git', ['diff', 'HEAD', '--unified=3'], {
      cwd,
      encoding: 'utf-8',
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = diff.trim();
    if (!trimmed) return null;
    return trimmed.length > maxDiffBytes ? trimmed.slice(0, maxDiffBytes) : trimmed;
  } catch {
    return null;
  }
}

function parseReviewPayload(stdout: string): { passed: boolean; violations: HippoGateViolation[] } | null {
  const cleaned = stdout.replace(ANSI_PATTERN, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      passed?: unknown;
      violations?: Array<Record<string, unknown>>;
    };
    if (typeof parsed.passed !== 'boolean') return null;
    const violations = Array.isArray(parsed.violations)
      ? parsed.violations.map((v): HippoGateViolation => ({
          severity:
            v.severity === 'error' || v.severity === 'warning' || v.severity === 'info'
              ? (v.severity as HippoGateViolation['severity'])
              : 'warning',
          source: String(v.source ?? 'unknown'),
          reason: String(v.reason ?? ''),
          rule_text: String(v.rule_text ?? ''),
        }))
      : [];
    return { passed: parsed.passed, violations };
  } catch {
    return null;
  }
}

/**
 * 求值 Hippo 门禁。任何基础设施异常都 fail-open 为 warn，只有明确的 error 违规才 block。
 */
export async function evaluateHippoGate(options: HippoGateOptions): Promise<HippoGateResult> {
  const { cwd } = options;
  const config = readHippoGateConfig(cwd);
  const mode = options.mode ?? config.mode;

  if (mode === 'off') {
    return { status: 'skipped', reason: '门禁已通过 review-contract.json 关闭 (mode=off)', violations: [] };
  }
  if (!existsSync(join(cwd, '.hippo'))) {
    return { status: 'skipped', reason: '项目未接入 Hippo (.hippo/ 不存在)', violations: [] };
  }

  const binary = options.binary ?? config.command ?? detectHippoBinary(cwd);
  if (!binary) {
    return { status: 'skipped', reason: '未找到 hippo 可执行文件（设置 HIPPO_BIN 或安装 hippo 后重试）', violations: [] };
  }

  const diff = collectUncommittedDiff(cwd, options.maxDiffBytes ?? config.maxDiffBytes);
  if (!diff) {
    return { status: 'skipped', reason: '当前工作区无未提交改动，无需前置自审', violations: [] };
  }

  const timeout = options.timeoutMs ?? config.timeoutMs;
  const tempFile = join(tmpdir(), `docpath-hippo-gate-${process.pid}-${Date.now()}.diff`);
  try {
    writeFileSync(tempFile, diff, 'utf-8');
    let stdout = '';
    try {
      const result = await execFileAsync(binary, ['self-review', '--json', '-f', tempFile, '--cwd', cwd], {
        cwd,
        timeout,
        maxBuffer: 8 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (error) {
      const failure = error as { stdout?: string; code?: number; killed?: boolean; signal?: string };
      if (failure.killed || failure.signal) {
        return { status: 'warn', reason: `hippo 自审超时（>${timeout}ms），已放行但请人工确认`, violations: [] };
      }
      if (typeof failure.code === 'number' && failure.code > 1) {
        return { status: 'warn', reason: `hippo 自审异常退出 (code=${failure.code})，已放行但请人工确认`, violations: [] };
      }
      stdout = failure.stdout ?? '';
    }

    const payload = parseReviewPayload(stdout);
    if (!payload) {
      return { status: 'warn', reason: 'hippo 自审输出无法解析为 JSON（版本不匹配？），已放行', violations: [] };
    }
    if (payload.passed) {
      return { status: 'pass', reason: 'Hippo 前置自审通过', violations: payload.violations };
    }

    const errors = payload.violations.filter((v) => v.severity === 'error');
    if (mode === 'warn') {
      return {
        status: 'warn',
        reason: `Hippo 自审发现 ${errors.length} 项硬性违规（warn 模式放行）`,
        violations: payload.violations,
      };
    }
    return {
      status: 'blocked',
      reason: `Hippo 自审发现 ${errors.length} 项硬性违规，已拒绝状态转移`,
      violations: payload.violations,
    };
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // 临时文件清理失败不影响判定
    }
  }
}
