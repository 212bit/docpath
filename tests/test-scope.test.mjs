// test-scope 模块单元测试（R-3xx 性能任务）
// 覆盖：并发数、影响面匹配、安全回落、命令构建。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scope = await import('../src/commands/check/test-scope.ts');

test('computeTestConcurrency 返回 2~8 之间的整数', () => {
  const n = scope.computeTestConcurrency();
  assert.ok(Number.isInteger(n), `应为整数，实际 ${n}`);
  assert.ok(n >= 2 && n <= 8, `应在 [2,8]，实际 ${n}`);
});

test('touchesRiskyPath 识别核心路径', () => {
  assert.equal(scope.touchesRiskyPath('src/commands/check/runners.ts'), true);
  assert.equal(scope.touchesRiskyPath('src/engine/transitions.ts'), true);
  assert.equal(scope.touchesRiskyPath('package.json'), true);
  assert.equal(scope.touchesRiskyPath('pnpm-lock.yaml'), true);
  // 顶层命令主文件（review/go/backlog）也应回落——它们会消费所有遍历测试，无法可靠子集化
  assert.equal(scope.touchesRiskyPath('src/commands/backlog.ts'), true);
  assert.equal(scope.touchesRiskyPath('src/commands/review.ts'), true);
  assert.equal(scope.touchesRiskyPath('src/commands/go.ts'), true);
  // 叶子工具 / 文档不算核心
  assert.equal(scope.touchesRiskyPath('src/utils/session.ts'), false);
  assert.equal(scope.touchesRiskyPath('docs/README.md'), false);
});

test('testRelatesToFile 基名匹配', () => {
  assert.equal(scope.testRelatesToFile('tests/backlog.test.mjs', 'src/commands/backlog.ts'), true);
  assert.equal(scope.testRelatesToFile('tests/check-review.test.mjs', 'src/commands/check.ts'), true);
  assert.equal(scope.testRelatesToFile('tests/backlog.test.mjs', 'src/commands/review.ts'), false);
});

test('selectTouchedTestFiles 选相关测试，触及核心回落 null', () => {
  const testFiles = ['tests/backlog.test.mjs', 'tests/review.test.mjs', 'tests/next.test.mjs'];
  // 只改 backlog 相关 → 不改命令主文件时（叶子工具）能选对应测试
  const selected = scope.selectTouchedTestFiles('/x', ['src/commands/backlog.ts'], testFiles);
  assert.equal(selected, null, '命令主文件被改须回落全量（不再按基名窄选）');
  // 触及核心（check 子模块）→ null（回落全量）
  assert.equal(scope.selectTouchedTestFiles('/x', ['src/commands/check/runners.ts'], testFiles), null);
  // 命令主文件 review 被改 → 回落，杜绝 check-review 消费方漏测
  assert.equal(scope.selectTouchedTestFiles('/x', ['src/commands/review.ts'], testFiles), null);
  // 无匹配 → null
  assert.equal(scope.selectTouchedTestFiles('/x', ['docs/guide.md'], testFiles), null);
});

test('selectTouchedTestFiles 改动文件超限回落 null', () => {
  const testFiles = ['tests/backlog.test.mjs', 'tests/review.test.mjs'];
  const manyChanges = Array.from({ length: scope.TEST_SCOPE_MAX_FILES + 1 }, (_, i) => `src/commands/c${i}.ts`);
  assert.equal(scope.selectTouchedTestFiles('/x', manyChanges, testFiles), null);
});

test('selectTouchedTestFiles 收益小于阈值回落 null', () => {
  // 相关测试占比过高 → 减载无益
  const testFiles = ['tests/backlog.test.mjs', 'tests/backlog-2.test.mjs', 'tests/backlog-3.test.mjs',
    'tests/backlog-4.test.mjs', 'tests/backlog-5.test.mjs', 'tests/backlog-6.test.mjs',
    'tests/backlog-7.test.mjs', 'tests/backlog-8.test.mjs', 'tests/backlog-9.test.mjs',
    'tests/backlog-10.test.mjs', 'tests/backlog-11.test.mjs', 'tests/backlog-12.test.mjs',
    'tests/backlog-13.test.mjs', 'tests/backlog-14.test.mjs', 'tests/backlog-15.test.mjs',
    'tests/backlog-16.test.mjs', 'tests/backlog-17.test.mjs', 'tests/backlog-18.test.mjs',
    'tests/backlog-19.test.mjs', 'tests/backlog-20.test.mjs', 'tests/backlog-21.test.mjs',
    'tests/backlog-22.test.mjs', 'tests/backlog-23.test.mjs', 'tests/backlog-24.test.mjs',
    'tests/backlog-25.test.mjs', 'tests/backlog-26.test.mjs'];
  const allRelevant = scope.selectTouchedTestFiles('/x', ['src/commands/backlog.ts'], testFiles);
  // 相关==26/26 全量 >0.75 → 回落 null
  assert.equal(allRelevant, null);
});

test('buildNodeTestCommand 注入并发与隔离', () => {
  const cmd = scope.buildNodeTestCommand('/x', [], { concurrency: 4, isolation: true });
  assert.match(cmd, /node --test/);
  assert.match(cmd, /--test-concurrency=4/);
  assert.match(cmd, /--test-isolation=process/);
  assert.match(cmd, /tests\/\*\.test\.mjs/);
});

test('buildNodeTestCommand 显式文件集 + 关闭隔离', () => {
  const cmd = scope.buildNodeTestCommand('/x', ['tests/a.test.mjs', 'tests/b.test.mjs'], { concurrency: 2, isolation: false });
  assert.match(cmd, /--test-concurrency=2/);
  assert.match(cmd, /"tests\/a\.test\.mjs"/);
  assert.match(cmd, /"tests\/b\.test\.mjs"/);
  assert.doesNotMatch(cmd, /--test-isolation/);
});

test('listTestFiles 列目录下测试文件（含子目录）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp-scope-'));
  mkdirSync(join(dir, 'tests', 'sub'), { recursive: true });
  writeFileSync(join(dir, 'tests', 'alpha.test.mjs'), '');
  writeFileSync(join(dir, 'tests', 'beta.test.mjs'), '');
  writeFileSync(join(dir, 'tests', 'sub', 'gamma.test.mjs'), '');
  writeFileSync(join(dir, 'tests', 'ignore.txt'), '');
  const files = scope.listTestFiles(dir);
  assert.deepEqual(files.sort(), ['tests/alpha.test.mjs', 'tests/beta.test.mjs', 'tests/sub/gamma.test.mjs']);
});

test('resolveTestCommand full 模式直接返回全量受控命令', () => {
  const res = scope.resolveTestCommand(process.cwd(), { testScope: 'full', concurrency: 4 });
  assert.equal(res.scope, 'full');
  assert.match(res.command, /node --test/);
  assert.match(res.command, /--test-concurrency=4/);
  assert.match(res.command, /--test-isolation=process/);
});

test('resolveTestCommand touched 模式在非 git 目录或无改动时安全回落 full', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp-no-git-'));
  const res = scope.resolveTestCommand(dir, { testScope: 'touched', concurrency: 2 });
  assert.equal(res.scope, 'full');
  assert.match(res.command, /node --test/);
  assert.match(res.command, /--test-concurrency=2/);
});