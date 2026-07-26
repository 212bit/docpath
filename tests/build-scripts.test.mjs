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

  it('tsup config carries no hand-maintained entry whitelist', () => {
    const config = readFileSync(join(repoRoot, 'tsup.config.ts'), 'utf-8');
    assert.match(config, /entry: \['src\/\*\*\/\*\.ts'\]/);
    // 只断言代码形态（注释里对历史白名单的说明不算复辟）
    assert.doesNotMatch(config, /const CLI_ENTRY|entry: CLI_ENTRY/);
  });
});
