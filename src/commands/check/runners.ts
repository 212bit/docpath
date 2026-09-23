import { execSync, execFileSync } from 'child_process';
import { existsSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { delimiter, dirname, isAbsolute, join, resolve, sep } from 'path';
import type { CheckResult, NodeCommandConfig, PackageManifest, CheckOptions } from './types.js';
import { resolveTestCommand, listTestFiles } from './test-scope.js';
import { errorOutput } from './formatters.js';

export const DEFAULT_CHECK_TIMEOUT_MS = 60000;

/** 重检查（构建/测试、Java 工具链首编译）超时上限：首跑常伴随依赖解析，60s 不够。 */
export const HEAVY_CHECK_TIMEOUT_MS = 300000;

/** runner 探针默认超时：健康环境实测 <1s，坏 shim（如 Electron 包装）会挂起，5s 足够判定。 */
export const RUNNER_PROBE_TIMEOUT_MS = 5000;

/** 测试/特殊环境可注入更短探针超时（200ms~60s）。 */
function resolveProbeTimeoutMs(): number {
  const raw = Number(process.env.DOCPATH_RUNNER_PROBE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 200 && raw <= 60000) return raw;
  return RUNNER_PROBE_TIMEOUT_MS;
}

export function isTimeoutKill(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as { killed?: boolean; signal?: string };
  return record.killed === true || record.signal === 'SIGTERM' || record.signal === 'SIGKILL';
}

/**
 * 检测子进程输出是否表明失败原因是环境问题（命令缺失、依赖未装等），而非代码问题。
 * 帮助 Agent 用最廉价的判定先排除工具链问题，避免用昂贵的 token 去诊断代码。
 */
export function looksLikeEnvironmentFailure(output: string): boolean {
  const envPatterns = [
    /command not found/i,
    /ENOENT.*node_modules/,
    /ENOENT.*\.bin/,
    /Cannot find module/i,
    /MODULE_NOT_FOUND/,
    /is not recognized as (an )?internal or external command/i,
    /no such file or directory.*node_modules/,
    /spawn.*ENOENT/,
    /sh: (line \d+: )?.+: command not found/,
    /pnpm: command not found/i,
    /npm: command not found/i,
    /yarn: command not found/i,
    /npx: command not found/i,
    /Permission denied.*node_modules/,
    /EACCES.*node_modules/,
  ];
  return envPatterns.some((pattern) => pattern.test(output));
}

/**
 * R-350: 环境豁免（check_env_exempt）专用的**收紧**判定集。
 *
 * `looksLikeEnvironmentFailure` 是"环境诊断"用的宽集，其中 `Cannot find module` /
 * `MODULE_NOT_FOUND` / `ENOENT.*node_modules` 也可能来自真实缺依赖或代码问题；若拿它
 * 直接放行整单 check，一个真实的缺依赖失败会被误判成环境问题而豁免通过。
 *
 * 这里只保留**语义上只可能是工具链不可用**的模式：命令不存在 / 无法派生进程 /
 * 二进制不可执行。其余一律不豁免（其恢复动作是 pnpm install 或修代码，不是豁免）。
 */
export function looksLikeToolchainUnavailable(output: string): boolean {
  const toolchainPatterns = [
    /command not found/i,
    /is not recognized as (an )?internal or external command/i,
    /spawn.*ENOENT/,
  ];
  return toolchainPatterns.some((pattern) => pattern.test(output));
}

export function pathEntries(value: string | undefined): string[] {
  return (value || '').split(delimiter).filter(Boolean);
}

export function runGitOptional(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function resolveMainCheckoutBin(cwd: string): string | null {
  const commonDir = runGitOptional(cwd, ['rev-parse', '--git-common-dir']);
  if (!commonDir) return null;
  const absoluteCommonDir = isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
  const candidates = new Set<string>();
  const worktreeMarker = `${sep}.git${sep}worktrees${sep}`;
  const markerIndex = absoluteCommonDir.indexOf(worktreeMarker);
  if (markerIndex >= 0) {
    candidates.add(absoluteCommonDir.slice(0, markerIndex));
  }
  candidates.add(dirname(absoluteCommonDir));
  for (const candidate of candidates) {
    const bin = join(candidate, 'node_modules', '.bin');
    if (existsSync(bin)) return bin;
  }
  return null;
}

export function checkCommandEnv(cwd: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DOCPATH_SESSION;
  const candidates = [
    join(cwd, 'node_modules', '.bin'),
    resolveMainCheckoutBin(cwd),
  ].filter((value): value is string => Boolean(value && existsSync(value)));
  const existingPath = pathEntries(env.PATH);
  const prepend = candidates.filter((entry) => !existingPath.includes(entry));
  if (prepend.length > 0) {
    env.PATH = [...prepend, ...existingPath].join(delimiter);
  }
  return env;
}

export function runCheck(
  name: string,
  cmd: string,
  cwd: string,
  category?: CheckResult['category'],
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): CheckResult {
  // R-347: 记录到 CheckResult 的命令去掉内部拼接的 stderr 重定向，给 agent 看的是它能照抄的命令。
  const command = cmd.replace(/\s+2>&1\s*$/, '');
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      env: checkCommandEnv(cwd),
    });
    return { name, passed: true, output: output.slice(0, 500), category, command };
  } catch (err: unknown) {
    if (isTimeoutKill(err)) {
      const seconds = Math.round(timeoutMs / 1000);
      return {
        name,
        passed: false,
        output: `命令超时（>${seconds}s）被终止，并非检查失败。命令: ${cmd}\n` +
          `若该命令本身耗时较长，请提高其超时上限或拆分检查。`,
        category,
        command,
      };
    }
    const rawOutput = errorOutput(err).slice(0, 500);
    const isEnvFailure = looksLikeEnvironmentFailure(rawOutput);
    // R-350: 环境诊断用宽集，环境豁免用收紧集（见 looksLikeToolchainUnavailable 注释）。
    const isExemptible = isEnvFailure && looksLikeToolchainUnavailable(rawOutput);
    return {
      name,
      passed: false,
      output: rawOutput,
      category,
      command,
      ...(isEnvFailure ? { environment_failure: true } : {}),
      ...(isExemptible ? { environment_exemptible: true } : {}),
    };
  }
}

export function detectNodeCommandConfig(cwd: string): NodeCommandConfig {
  const hasPnpmLock = existsSync(join(cwd, 'pnpm-lock.yaml'));
  const hasYarnLock = existsSync(join(cwd, 'yarn.lock'));
  return {
    pkgRunner: hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'npm',
    runCmd: hasPnpmLock ? 'pnpm run' : hasYarnLock ? 'yarn' : 'npm run',
  };
}

export async function readPackageManifest(pkgPath: string): Promise<PackageManifest | null> {
  if (!existsSync(pkgPath)) return null;
  try {
    const { readFile } = await import('fs/promises');
    return JSON.parse(await readFile(pkgPath, 'utf-8')) as PackageManifest;
  } catch {
    return null;
  }
}

export function detectTestFramework(pkg: PackageManifest): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vitest) return 'vitest run';
  if (deps.jest || deps['@jest/core']) return 'jest';
  if (deps.mocha) return 'mocha';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// runner 挂起免疫（R-3xx）：探针 + 脚本内联直连
//
// 背景：部分环境（如 DSH 沙箱）把 PATH 里的 pnpm 换成 Electron 包装 shim，
// `pnpm run/exec` 派生脚本子进程时挂起，check 每条命令烧满超时（最坏 60+300+300s）。
// 策略：
//   1. package.json 脚本优先递归内联展开（`pnpm run X` → 脚本体），用 shell 直连执行，
//      健康与异常环境行为一致且更快。
//   2. 仅当脚本含无法内联的 runner 调用（workspace flags / 未知引用）时才走 runner，
//      且先做一次性探针（临时目录 + `run` 真实脚本）；探针挂起 → 跳过该检查并标记
//      environment_failure，给出可操作提示，而不是空耗超时。
// ─────────────────────────────────────────────────────────────────────────────

export interface RunnerProbeResult {
  /** false = 该 runner 不做探针（如 yarn CLI 形态差异大），默认视为可用 */
  probed: boolean;
  usable: boolean;
  detail?: string;
}

const runnerProbeCache = new Map<string, RunnerProbeResult>();

export function resetRunnerProbeCacheForTest(): void {
  runnerProbeCache.clear();
}

/** 检查 runner 是否能正常执行 run 脚本（派生子进程）。结果按 runner 名缓存。 */
export async function probeRunnerUsable(cwd: string, nodeCommands: NodeCommandConfig): Promise<RunnerProbeResult> {
  const key = nodeCommands.pkgRunner;
  const cached = runnerProbeCache.get(key);
  if (cached) return cached;
  const result = await probeRunnerUsableUncached(cwd, nodeCommands.pkgRunner);
  runnerProbeCache.set(key, result);
  return result;
}

async function probeRunnerUsableUncached(cwd: string, pkgRunner: string): Promise<RunnerProbeResult> {
  // yarn 的 CLI 形态（v1/berry）差异大，不做临时目录探针；由实际命令自然失败兜底。
  if (pkgRunner !== 'pnpm' && pkgRunner !== 'npm') {
    return { probed: false, usable: true };
  }
  const dirFlag = pkgRunner === 'pnpm' ? '-C' : '--prefix';
  const timeoutMs = resolveProbeTimeoutMs();
  let probeDir: string | null = null;
  try {
    probeDir = await mkdtemp(join(tmpdir(), 'docpath-runner-probe-'));
    writeFileSync(join(probeDir, 'package.json'), JSON.stringify({
      name: 'docpath-runner-probe',
      private: true,
      scripts: { __dp_probe: 'node --version' },
    }));
    execSync(`${pkgRunner} ${dirFlag} ${JSON.stringify(probeDir)} run __dp_probe 2>&1`, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
      env: checkCommandEnv(cwd),
    });
    return { probed: true, usable: true };
  } catch (err: unknown) {
    if (isTimeoutKill(err)) {
      return {
        probed: true,
        usable: false,
        detail: `探针命令挂起 ${timeoutMs}ms 被强制终止（${pkgRunner} run 无法派生脚本子进程）`,
      };
    }
    // 非挂起失败（runner 缺失、参数不支持等）：runner 无法正常执行 run 脚本，
    // 探针判定不可用 → 无法内联的脚本将快速给出 environment_failure 诊断而非空耗超时。
    return { probed: true, usable: false, detail: `探针命令执行失败（${pkgRunner} run 无法在临时目录执行脚本）` };
  } finally {
    if (probeDir) rmSync(probeDir, { recursive: true, force: true });
  }
}

function runnerUnavailableResult(
  name: string,
  scriptName: string,
  nodeCommands: NodeCommandConfig,
  probe: RunnerProbeResult,
  category?: CheckResult['category'],
): CheckResult {
  return {
    name,
    passed: false,
    category,
    environment_failure: true,
    // R-350: 探针类环境失败是**自验证**的（临时目录真跑过探针），可进入环境豁免集。
    environment_exemptible: true,
    output: [
      `包管理器 "${nodeCommands.pkgRunner}" 探针失败（${probe.detail || '未知原因'}）。`,
      `脚本 "${scriptName}" 含无法安全内联展开的 runner 调用，已跳过本次检查（否则将空耗超时时长）。`,
      `修复建议：\`which -a ${nodeCommands.pkgRunner}\` 检查是否被环境 shim 包装；将真实 runner 提前至 PATH，或安装官方 runner 后重试。`,
    ].join('\n'),
  };
}

interface SplitPart { text: string; sep: string }

/**
 * 顶层切分 shell 串（&& / || / ; / |），遇到引号、$()、反引号、() 一律返回 null——
 * 含这些结构的脚本保守起见不内联，直接走 runner。
 */
function splitTopLevel(script: string): SplitPart[] | null {
  const parts: SplitPart[] = [];
  let start = 0;
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === '\'' || c === '"' || c === '`' || c === '(' || c === '$') return null;
    if (c === '&' && script[i + 1] === '&') {
      parts.push({ text: script.slice(start, i), sep: ' && ' });
      i++;
      start = i + 1;
      continue;
    }
    if (c === '|' && script[i + 1] === '|') {
      parts.push({ text: script.slice(start, i), sep: ' || ' });
      i++;
      start = i + 1;
      continue;
    }
    if (c === ';' || c === '|') {
      parts.push({ text: script.slice(start, i), sep: c });
      start = i + 1;
      continue;
    }
  }
  parts.push({ text: script.slice(start), sep: '' });
  return parts;
}

const RUNNER_NAME = '(?:pnpm|npm|yarn|bun)';
const RUN_SCRIPT_RE = new RegExp(`^(${RUNNER_NAME})\\s+(?:run\\s+)?([A-Za-z0-9@:._/-]+)(\\s+[\\s\\S]+)?$`);
const RUNNER_PREFIX_RE = new RegExp(`^${RUNNER_NAME}(\\s|$)`);
const MAX_EXPAND_DEPTH = 8;

export interface ScriptExpansion {
  /** 展开后的 shell 命令；仅 inlineable=true 时可信 */
  command: string | null;
  /** false = 含无法内联的 runner 调用，需走 runner（先探针） */
  inlineable: boolean;
}

/**
 * 递归内联 package.json 脚本中的 runner 调用：
 *   `pnpm run build:clean` → `tsup --clean`
 *   `pnpm run build:test && node --test ...` → `tsup && node --test ...`
 * 未知 runner 引用 / 循环引用 / 嵌套过深 / 含引号子 shell → 保守判定不可内联。
 */
export function expandPackageScript(
  script: string,
  scripts: Record<string, string> = {},
  seen: Set<string> = new Set(),
  depth = 0,
): ScriptExpansion {
  if (depth > MAX_EXPAND_DEPTH) return { command: null, inlineable: false };
  const parts = splitTopLevel(script);
  if (!parts) return { command: null, inlineable: false };

  let inlineable = true;
  const rebuilt: string[] = [];
  for (const part of parts) {
    const seg = part.text.trim();
    let replacement: string | null = null;
    const m = seg.match(RUN_SCRIPT_RE);
    if (m) {
      const name = m[2];
      const target = scripts[name];
      if (typeof target === 'string' && !seen.has(name) && name !== '__dp_probe') {
        const nested = expandPackageScript(target, scripts, new Set([...seen, name]), depth + 1);
        if (nested.inlineable && nested.command !== null) {
          replacement = m[3] ? `${nested.command} ${m[3].trim()}` : nested.command;
        }
      }
    }
    if (replacement === null) {
      rebuilt.push(part.text);
      // 段落本身就是 runner 命令（含 flags/未知脚本名等）→ 无法内联
      if (RUNNER_PREFIX_RE.test(seg)) inlineable = false;
    } else {
      rebuilt.push(replacement);
    }
  }
  let out = '';
  parts.forEach((p, i) => {
    out += rebuilt[i] + p.sep;
  });
  return { command: out, inlineable };
}

export interface ResolvedScriptCommand {
  /** 可直接执行的 shell 命令；null = runner 探针判定挂起，禁止执行（避免空耗超时） */
  cmd: string | null;
  runnerBroken: RunnerProbeResult | null;
}

/**
 * 解析 package.json 脚本为可执行命令：
 *   1. 优先内联展开（两个环境行为一致）；
 *   2. 无法内联时走 `${runCmd} <name>`，但先用探针确认 runner 可用，
 *      runner 挂起时返回 cmd=null + runnerBroken。
 */
export async function resolveRunnerScriptCommand(
  name: string,
  scripts: Record<string, string>,
  nodeCommands: NodeCommandConfig,
  cwd: string,
): Promise<ResolvedScriptCommand> {
  const body = scripts[name];
  const expansion = typeof body === 'string'
    ? expandPackageScript(body, scripts)
    : { command: null, inlineable: false };
  if (expansion.inlineable && expansion.command !== null) {
    return { cmd: expansion.command, runnerBroken: null };
  }
  const probe = await probeRunnerUsable(cwd, nodeCommands);
  if (probe.probed && !probe.usable) {
    return { cmd: null, runnerBroken: probe };
  }
  return { cmd: `${nodeCommands.runCmd} ${name}`, runnerBroken: null };
}

export async function runCompileChecks(cwd: string, pkgPath: string, nodeCommands: NodeCommandConfig): Promise<CheckResult[]> {
  const tsconfigPath = join(cwd, 'tsconfig.json');
  const cargoPath = join(cwd, 'Cargo.toml');
  const goModPath = join(cwd, 'go.mod');

  if (existsSync(tsconfigPath)) {
    const pkg = await readPackageManifest(pkgPath);
    const scripts = pkg?.scripts || {};
    let typecheckCmd = 'npx tsc --noEmit 2>&1';
    if (scripts.typecheck) {
      const resolved = await resolveRunnerScriptCommand('typecheck', scripts, nodeCommands, cwd);
      if (resolved.cmd === null) {
        return [runnerUnavailableResult('TypeScript 编译', 'typecheck', nodeCommands, resolved.runnerBroken!, 'compile')];
      }
      typecheckCmd = `${resolved.cmd} 2>&1`;
    }
    return [runCheck('TypeScript 编译', typecheckCmd, cwd, 'compile')];
  }

  if (existsSync(cargoPath)) return [runCheck('Rust 编译', 'cargo check 2>&1', cwd)];
  if (existsSync(goModPath)) return [runCheck('Go 编译', 'go build ./... 2>&1', cwd)];
  // Java/Maven 项目此前零编译检查（results 空数组 → check 空洞通过 exit 0）：
  // 接入 mvn compile；mvn 缺失时按 environment_failure 诊断，不再静默通过。
  if (existsSync(join(cwd, 'pom.xml'))) {
    return [runCheck('Java 编译 (Maven)', 'mvn -q compile 2>&1', cwd, 'compile', HEAVY_CHECK_TIMEOUT_MS)];
  }
  return [];
}

export async function runPackageScriptChecks(cwd: string, pkgPath: string, nodeCommands: NodeCommandConfig, options: CheckOptions): Promise<CheckResult[]> {
  const pkg = await readPackageManifest(pkgPath);
  if (!pkg?.scripts) return [];

  if (options.lite) return [];

  const results: CheckResult[] = [];
  const scripts = pkg.scripts;

  const resolveOrSkip = async (
    checkName: string,
    scriptName: string,
    category: CheckResult['category'],
    timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
  ): Promise<CheckResult | null> => {
    const resolved = await resolveRunnerScriptCommand(scriptName, scripts, nodeCommands, cwd);
    if (resolved.cmd === null) {
      return runnerUnavailableResult(checkName, scriptName, nodeCommands, resolved.runnerBroken!, category);
    }
    return runCheck(checkName, `${resolved.cmd} 2>&1`, cwd, category, timeoutMs);
  };

  if (scripts.build) {
    const build = await resolveOrSkip('构建', 'build', 'compile', HEAVY_CHECK_TIMEOUT_MS);
    if (build) results.push(build);
  }
  if (!options.skipTests && scripts.test) {
    if (options.testScope !== undefined) {
      // R-3xx（性能任务）：受控测试执行——注入受控并发 + 进程隔离；--test-scope=touched
      // 时按 git 改动影响面减载（触及核心路径自动回落全量，宁慢不放水）。
      const scope = resolveTestCommand(cwd, { testScope: options.testScope });
      const allTestCount = listTestFiles(cwd).length;
      const name = scope.scope === 'touched'
        ? `测试（影响面 ${scope.matchedFiles.length}/${allTestCount}）`
        : '测试（受控并发）';
      results.push(runCheck(name, scope.command, cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    } else {
      const test = await resolveOrSkip('测试', 'test', 'test', HEAVY_CHECK_TIMEOUT_MS);
      if (test) results.push(test);
    }
  } else if (!options.skipTests) {
    const testFramework = detectTestFramework(pkg);
    if (testFramework) {
      // 优先直接使用 node_modules/.bin 下的测试二进制（PATH 已前置），避免 runner exec 挂起
      const binName = testFramework.split(/\s+/)[0];
      const localBin = join(cwd, 'node_modules', '.bin', binName);
      const testCmd = existsSync(localBin) ? testFramework : `${nodeCommands.pkgRunner} exec ${testFramework}`;
      results.push(runCheck('测试', `${testCmd} 2>&1`, cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    }
  }
  if (!options.skipLint && scripts.lint) {
    const lint = await resolveOrSkip('Lint', 'lint', 'lint');
    if (lint) results.push(lint);
  }
  return results;
}

import { readCheckConfig } from '../../utils/config.js';
import type { CheckCommandItem } from '../../types/config.js';

export function detectMakefileCheck(cwd: string): { tool: string; targets: Set<string> } | null {
  const candidates = [
    { file: 'Makefile', tool: 'make' },
    { file: 'makefile', tool: 'make' },
    { file: 'justfile', tool: 'just' },
  ];
  for (const c of candidates) {
    const p = join(cwd, c.file);
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const targets = new Set<string>();
        for (const line of raw.split('\n')) {
          const m = line.match(/^([a-zA-Z0-9_.-]+)\s*:(?!=)/);
          if (m) targets.add(m[1]);
        }
        return { tool: c.tool, targets };
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export async function runCustomCheckConfig(cwd: string, options: CheckOptions): Promise<CheckResult[] | null> {
  const checkConfig = await readCheckConfig(cwd);
  if (!checkConfig) return null;

  const items: CheckCommandItem[] = [];
  if (typeof checkConfig.command === 'string' && checkConfig.command.trim()) {
    items.push({ command: checkConfig.command.trim(), name: `自定义门禁 (${checkConfig.command.trim()})`, category: 'compile' });
  }
  if (Array.isArray(checkConfig.commands)) {
    for (const entry of checkConfig.commands) {
      if (typeof entry === 'string' && entry.trim()) {
        items.push({ command: entry.trim(), name: `自定义门禁 (${entry.trim()})`, category: 'compile' });
      } else if (entry && typeof entry === 'object' && typeof entry.command === 'string' && entry.command.trim()) {
        items.push({
          command: entry.command.trim(),
          name: entry.name || `自定义门禁 (${entry.command.trim()})`,
          category: entry.category || 'compile',
          timeout_ms: entry.timeout_ms,
        });
      }
    }
  }

  if (items.length === 0) return null;

  const results: CheckResult[] = [];
  for (const item of items) {
    const category = item.category || 'compile';
    if (options.lite && category !== 'compile') continue;
    if (options.skipTests && category === 'test') continue;
    if (options.skipLint && category === 'lint') continue;

    const timeout = item.timeout_ms || (category === 'test' || category === 'compile' ? HEAVY_CHECK_TIMEOUT_MS : DEFAULT_CHECK_TIMEOUT_MS);
    results.push(runCheck(item.name || item.command, `${item.command} 2>&1`, cwd, category, timeout));
  }
  return results;
}

export function runNativeLanguageChecks(cwd: string, options: CheckOptions): CheckResult[] {
  if (options.lite) return [];
  const results: CheckResult[] = [];

  const cargoPath = join(cwd, 'Cargo.toml');
  const goModPath = join(cwd, 'go.mod');
  const pomPath = join(cwd, 'pom.xml');

  if (existsSync(cargoPath)) {
    if (!options.skipLint) {
      results.push(runCheck('Rust 代码检查 (Clippy)', 'cargo clippy 2>&1', cwd, 'lint', HEAVY_CHECK_TIMEOUT_MS));
    }
    if (!options.skipTests) {
      results.push(runCheck('Rust 单元测试', 'cargo test 2>&1', cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    }
  } else if (existsSync(goModPath)) {
    if (!options.skipLint) {
      results.push(runCheck('Go 代码检查 (go vet)', 'go vet ./... 2>&1', cwd, 'lint', DEFAULT_CHECK_TIMEOUT_MS));
    }
    if (!options.skipTests) {
      results.push(runCheck('Go 单元测试', 'go test ./... 2>&1', cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    }
  } else if (existsSync(pomPath)) {
    if (!options.skipTests) {
      results.push(runCheck('Java 单元测试 (Maven)', 'mvn -q test 2>&1', cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    }
  }

  return results;
}

export async function runProjectChecks(cwd: string, options: CheckOptions): Promise<CheckResult[]> {
  // 1. 优先使用用户在 .docpath/config.yaml 中显式配置的 check 门禁
  const customResults = await runCustomCheckConfig(cwd, options);
  if (customResults !== null && customResults.length > 0) {
    return customResults;
  }

  const pkgPath = join(cwd, 'package.json');
  const nodeCommands = detectNodeCommandConfig(cwd);
  const makefileCheck = detectMakefileCheck(cwd);

  // 2. 若存在 Makefile/justfile 且包含 check 目标，优先执行 make check 作为聚合质量门禁
  if (makefileCheck && makefileCheck.targets.has('check') && !options.lite) {
    const makeResults: CheckResult[] = [
      runCheck(`${makefileCheck.tool} 质量门禁 (${makefileCheck.tool} check)`, `${makefileCheck.tool} check 2>&1`, cwd, 'compile', HEAVY_CHECK_TIMEOUT_MS),
    ];
    if (existsSync(pkgPath)) {
      makeResults.push(...await runPackageScriptChecks(cwd, pkgPath, nodeCommands, options));
    }
    return makeResults;
  }

  return [
    ...await runCompileChecks(cwd, pkgPath, nodeCommands),
    ...await runPackageScriptChecks(cwd, pkgPath, nodeCommands, options),
    ...runNativeLanguageChecks(cwd, options),
  ];
}

