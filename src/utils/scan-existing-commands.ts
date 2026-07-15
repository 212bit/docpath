/**
 * scan-existing manifest 命令提取 (FR-3 / S4)
 *
 * 从项目主流 manifest（package.json scripts、Cargo.toml、go.mod、pom.xml、
 * build.gradle）提取 test/build/format 命令；项级 Makefile/justfile/taskfile 若存在
 * 则优先聚合其中目标。
 *
 * 降级策略（spec §4.c）：
 *   - package.json `scripts.*` 直读（最规整）
 *   - Cargo/go/Java 优先 项级 Makefile/justfile/taskfile 聚合；否则用默认约定
 *     （cargo test/build/fmt、go test/build/fmt、mvn test/gradle build）
 *   - 提取不到的不静默、不编造 → 对应槽位留空并标记 needsTodo=true
 *
 * 不重构 detect.ts 现有 type/language/framework 字段语义（NFR-2）。
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type CommandSlot = 'test' | 'build' | 'format' | 'lint';

export interface ExtractedCommand {
  /** 命令字符串；为空表示未探测到（需 TODO）。 */
  command: string;
  /** 命令来源：package.json | Cargo.toml | go.mod | pom.xml | build.gradle | Makefile | justfile | taskfile | convention | empty */
  source: string;
  /** 未探测到、需后续确认的槽位。 */
  needsTodo?: boolean;
}

export interface ProjectCommands {
  test: ExtractedCommand;
  build: ExtractedCommand;
  format: ExtractedCommand;
  lint: ExtractedCommand;
}

const pickFirst = (...cmds: Array<string | undefined>): string | undefined => {
  for (const c of cmds) if (c && c.trim()) return c.trim();
  return undefined;
};

// ─── package.json ───

interface PkgScripts {
  test?: string;
  build?: string;
  format?: string;
  fmt?: string;
  lint?: string;
  [k: string]: string | undefined;
}

async function extractFromPackageJson(cwd: string): Promise<Partial<ProjectCommands> | null> {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return null;
  try {
    const pkg = JSON.parse(await readFile(path, 'utf-8'));
    const s: PkgScripts = pkg.scripts || {};
    const out: Partial<ProjectCommands> = {};
    const t = pickFirst(s.test);
    const b = pickFirst(s.build);
    const f = pickFirst(s.format, s.fmt);
    const l = pickFirst(s.lint);
    if (t) out.test = { command: `npm run test`, source: 'package.json' };
    if (b) out.build = { command: `npm run build`, source: 'package.json' };
    if (f) out.format = { command: `npm run ${s.format ? 'format' : 'fmt'}`, source: 'package.json' };
    if (l) out.lint = { command: `npm run lint`, source: 'package.json' };
    return out;
  } catch {
    return null;
  }
}

// ─── Makefile / justfile / Taskfile 聚合 ───

async function extractFromMakeLike(cwd: string): Promise<Partial<ProjectCommands> | null> {
  const candidates: Array<{ file: string; source: string }> = [
    { file: 'Makefile', source: 'Makefile' },
    { file: 'makefile', source: 'Makefile' },
    { file: 'justfile', source: 'justfile' },
    { file: '.justfile', source: 'justfile' },
  ];
  let chosen: { file: string; source: string } | null = null;
  for (const c of candidates) {
    if (existsSync(join(cwd, c.file))) { chosen = c; break; }
  }
  // Taskfile (yml)
  if (!chosen && (existsSync(join(cwd, 'Taskfile.yml')) || existsSync(join(cwd, 'Taskfile.yaml')))) {
    chosen = { file: existsSync(join(cwd, 'Taskfile.yml')) ? 'Taskfile.yml' : 'Taskfile.yaml', source: 'taskfile' };
  }
  if (!chosen) return null;

  try {
    const raw = await readFile(join(cwd, chosen.file), 'utf-8');
    const targets = new Set<string>();
    // Makefile: 顶格 `target:` 模式（不展开变量赋值）
    for (const line of raw.split('\n')) {
      const m = line.match(/^([a-zA-Z0-9_.-]+)\s*:(?!=)/);
      if (m) targets.add(m[1]);
    }
    // justfile: 同款 `target:` 模式
    // taskfile: 粗略抓 `  name:` 缩进段，保守只认 test/build
    const has = (names: string[]): string | undefined => names.find((n) => targets.has(n));
    const out: Partial<ProjectCommands> = {};
    const t = has(['test', 'tests', 'check']);
    const b = has(['build']);
    const f = has(['fmt', 'format']);
    const l = has(['lint', 'check']);
    if (t) out.test = { command: `make ${t}`, source: chosen.source };
    if (b) out.build = { command: `make ${b}`, source: chosen.source };
    if (f) out.format = { command: `make ${f}`, source: chosen.source };
    if (l) out.lint = { command: `make ${l}`, source: chosen.source };
    return out;
  } catch {
    return null;
  }
}

// ─── Cargo / go / Java 默认约定 ───

async function extractFromCargo(cwd: string): Promise<Partial<ProjectCommands> | null> {
  if (!existsSync(join(cwd, 'Cargo.toml'))) return null;
  return {
    test: { command: 'cargo test', source: 'Cargo.toml' },
    build: { command: 'cargo build', source: 'Cargo.toml' },
    format: { command: 'cargo fmt', source: 'Cargo.toml' },
  };
}

async function extractFromGo(cwd: string): Promise<Partial<ProjectCommands> | null> {
  if (!existsSync(join(cwd, 'go.mod'))) return null;
  return {
    test: { command: 'go test ./...', source: 'go.mod' },
    build: { command: 'go build ./...', source: 'go.mod' },
    format: { command: 'gofmt -w .', source: 'go.mod' },
  };
}

async function extractFromJava(cwd: string): Promise<Partial<ProjectCommands> | null> {
  const isMaven = existsSync(join(cwd, 'pom.xml'));
  const isGradle = existsSync(join(cwd, 'build.gradle')) || existsSync(join(cwd, 'build.gradle.kts'));
  if (!isMaven && !isGradle) return null;
  const tool = isMaven ? 'mvn' : 'gradle';
  return {
    test: { command: `${tool} test`, source: isMaven ? 'pom.xml' : 'build.gradle' },
    build: { command: `${tool} build${isMaven ? '' : ''}`, source: isMaven ? 'pom.xml' : 'build.gradle' },
  };
}

// ─── 主提取：Makefile 优先，否则 manifest，否则默认约定 ───

/**
 * 优先级：Makefile/justfile/taskfile → package.json → Cargo → go → Java。
 * 逐槽位取首个非空来源；提取不到的槽位留空 + needsTodo。
 */
export async function extractProjectCommands(cwd: string): Promise<ProjectCommands> {
  // §4.c 优先级：项级 Makefile/justfile/taskfile 优先聚合 → package.json → Cargo → go → Java。
  const sources = [
    extractFromMakeLike(cwd),
    extractFromPackageJson(cwd),
    extractFromCargo(cwd),
    extractFromGo(cwd),
    extractFromJava(cwd),
  ];
  const results = await Promise.all(sources);

  const pick = (slot: CommandSlot): ExtractedCommand => {
    for (const r of results) {
      if (!r) continue;
      const cmd = (r as Partial<ProjectCommands>)[slot] as ExtractedCommand | undefined;
      if (cmd && cmd.command) return { command: cmd.command, source: cmd.source };
    }
    return { command: '', source: 'empty', needsTodo: true };
  };

  return {
    test: pick('test'),
    build: pick('build'),
    format: pick('format'),
    lint: pick('lint'),
  };
}

/** 是否存在任何已识别的 manifest（决定 S4 是否产出有意义的命令集）。 */
export function hasAnyManifest(cwd: string): boolean {
  const files = ['package.json', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Makefile', 'makefile', 'justfile', 'Taskfile.yml', 'Taskfile.yaml'];
  return files.some((f) => existsSync(join(cwd, f)));
}

/** 渲染为 CLAUDE.md/config 友好的简单行表。 */
export function renderCommandsTable(cmds: ProjectCommands): string {
  const rows: Array<[string, ExtractedCommand]> = [
    ['test', cmds.test],
    ['build', cmds.build],
    ['format', cmds.format],
    ['lint', cmds.lint],
  ];
  return rows
    .map(([slot, c]) => `- \`${slot}\`: ${c.needsTodo ? `TODO: 未探测到 ${slot} 命令，请确认` : c.command}`)
    .join('\n');
}
