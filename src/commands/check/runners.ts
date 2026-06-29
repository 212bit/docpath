import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { delimiter, dirname, isAbsolute, join, resolve, sep } from 'path';
import type { CheckResult, NodeCommandConfig, PackageManifest, CheckOptions } from './types.js';
import { errorOutput } from './formatters.js';

export const DEFAULT_CHECK_TIMEOUT_MS = 60000;

export function isTimeoutKill(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as { killed?: boolean; signal?: string };
  return record.killed === true || record.signal === 'SIGTERM' || record.signal === 'SIGKILL';
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
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      env: checkCommandEnv(cwd),
    });
    return { name, passed: true, output: output.slice(0, 500), category };
  } catch (err: unknown) {
    if (isTimeoutKill(err)) {
      const seconds = Math.round(timeoutMs / 1000);
      return {
        name,
        passed: false,
        output: `命令超时（>${seconds}s）被终止，并非检查失败。命令: ${cmd}\n` +
          `若该命令本身耗时较长，请提高其超时上限或拆分检查。`,
        category,
      };
    }
    return { name, passed: false, output: errorOutput(err).slice(0, 500), category };
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

export async function runCompileChecks(cwd: string, pkgPath: string, nodeCommands: NodeCommandConfig): Promise<CheckResult[]> {
  const tsconfigPath = join(cwd, 'tsconfig.json');
  const cargoPath = join(cwd, 'Cargo.toml');
  const goModPath = join(cwd, 'go.mod');

  if (existsSync(tsconfigPath)) {
    const pkg = await readPackageManifest(pkgPath);
    const scripts = pkg?.scripts || {};
    let typecheckCmd = 'npx tsc --noEmit 2>&1';
    if (scripts.typecheck) {
      typecheckCmd = `${nodeCommands.runCmd} typecheck 2>&1`;
    } else if (scripts['type-check']) {
      typecheckCmd = `${nodeCommands.runCmd} type-check 2>&1`;
    }
    return [runCheck('TypeScript 编译', typecheckCmd, cwd, 'compile')];
  }

  if (existsSync(cargoPath)) return [runCheck('Rust 编译', 'cargo check 2>&1', cwd)];
  if (existsSync(goModPath)) return [runCheck('Go 编译', 'go build ./... 2>&1', cwd)];
  return [];
}

export async function runPackageScriptChecks(cwd: string, pkgPath: string, nodeCommands: NodeCommandConfig, options: CheckOptions): Promise<CheckResult[]> {
  const pkg = await readPackageManifest(pkgPath);
  if (!pkg?.scripts) return [];

  if (options.lite) return [];

  const results: CheckResult[] = [];
  const HEAVY_CHECK_TIMEOUT_MS = 300000;
  if (pkg.scripts.build) {
    results.push(runCheck('构建', `${nodeCommands.runCmd} build 2>&1`, cwd, 'compile', HEAVY_CHECK_TIMEOUT_MS));
  }
  if (!options.skipTests && pkg.scripts.test) {
    results.push(runCheck('测试', `${nodeCommands.pkgRunner} test 2>&1`, cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
  } else if (!options.skipTests) {
    const testFramework = detectTestFramework(pkg);
    if (testFramework) {
      const testCmd = `${nodeCommands.pkgRunner} exec ${testFramework} 2>&1`;
      results.push(runCheck('测试', testCmd, cwd, 'test', HEAVY_CHECK_TIMEOUT_MS));
    }
  }
  if (!options.skipLint && pkg.scripts.lint) {
    results.push(runCheck('Lint', `${nodeCommands.runCmd} lint 2>&1`, cwd, 'lint'));
  }
  return results;
}

export async function runProjectChecks(cwd: string, options: CheckOptions): Promise<CheckResult[]> {
  const pkgPath = join(cwd, 'package.json');
  const nodeCommands = detectNodeCommandConfig(cwd);
  return [
    ...await runCompileChecks(cwd, pkgPath, nodeCommands),
    ...await runPackageScriptChecks(cwd, pkgPath, nodeCommands, options),
  ];
}
