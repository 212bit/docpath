import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('build scripts', () => {
  it('keeps CLI build scripts focused on the CLI bundle', () => {
    assert.match(pkg.scripts.build, /build:clean/);
    assert.match(pkg.scripts['build:clean'], /--clean/);
    assert.equal(pkg.scripts['build:dashboard'], undefined);
    assert.doesNotMatch(pkg.scripts['build:test'], /--clean/);
    assert.match(pkg.scripts.test, /build:test/);
    assert.doesNotMatch(pkg.scripts.test, /pnpm build(?:\s|$)/);
  });

  it('compiles every src module into dist (R-295: no hand-maintained entry whitelist)', () => {
    // 金丝雀：历史上不在 CLI_ENTRY 白名单内的文件，glob 全量后必须有 dist 产物。
    // 旧 footgun：测试经 ../dist 导入未列名文件时「构建成功但 ERR_MODULE_NOT_FOUND」。
    for (const canary of ['utils/plan-sync.js', 'utils/changes-report.ts'.replace('.ts', '.js'), 'commands/quick.js']) {
      assert.equal(existsSync(join(repoRoot, 'dist', canary)), true, `dist/${canary} 必须存在`);
    }
    // 全量对齐：src 下每个 .ts 都应有同路径 dist .js
    const missing = [];
    for (const entry of readdirSync(join(repoRoot, 'src'), { recursive: true })) {
      const rel = String(entry);
      if (!rel.endsWith('.ts')) continue;
      const compiled = join(repoRoot, 'dist', rel.replace(/\.ts$/, '.js'));
      if (!existsSync(compiled)) missing.push(rel);
    }
    assert.deepEqual(missing, [], 'src 全部模块必须编译进 dist');
  });

  it('protocol carriers stay single-sourced under templates/protocols (R-297)', () => {
    const flavors = ['CLAUDE.md', 'AGENTS.md', 'CODEX.md', 'OPENCODE.md'];
    for (const flavor of flavors) {
      // 防复辟：templates 根层不得再出现 flavor 协议副本（曾是 R-277 事故层）
      assert.equal(existsSync(join(repoRoot, 'templates', flavor)), false,
        `templates/${flavor} 不得复辟——唯一手写层是 templates/protocols/`);
      assert.equal(existsSync(join(repoRoot, 'templates', 'protocols', flavor)), true,
        `templates/protocols/${flavor} 必须存在（canonical 源）`);
    }
  });

  it('every utils file is classified in the domain taxonomy (R-305 反倾倒场)', () => {
    const readme = readFileSync(join(repoRoot, 'src', 'utils', 'README.md'), 'utf-8');
    const missing = [];
    for (const entry of readdirSync(join(repoRoot, 'src', 'utils'), { recursive: true })) {
      const rel = String(entry).replace(/\\/g, '/');
      if (!rel.endsWith('.ts')) continue;
      if (!readme.includes(rel)) missing.push(rel);
    }
    assert.deepEqual(missing, [], 'utils 新文件必须在 src/utils/README.md 域分类法中归类');
  });

  it('tsup config carries no hand-maintained entry whitelist', () => {
    const config = readFileSync(join(repoRoot, 'tsup.config.ts'), 'utf-8');
    assert.match(config, /entry: \['src\/\*\*\/\*\.ts'\]/);
    // 只断言代码形态（注释里对历史白名单的说明不算复辟）
    assert.doesNotMatch(config, /const CLI_ENTRY|entry: CLI_ENTRY/);
  });
});
