import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTestIsolationFlag, buildNodeTestCommand } from '../dist/engine/test-scope.js';

describe('Node 版本感知的测试隔离 flag (R-501)', () => {
  it('Node 22 不注入 --test-isolation（该版本默认即 process 隔离）', () => {
    assert.equal(resolveTestIsolationFlag('22.22.2'), null);
    assert.equal(resolveTestIsolationFlag('22.0.0'), null);
    assert.equal(resolveTestIsolationFlag('23.5.0'), null);
  });

  it('Node 24 及以上注入 --test-isolation=process', () => {
    assert.equal(resolveTestIsolationFlag('24.0.0'), '--test-isolation=process');
    assert.equal(resolveTestIsolationFlag('26.4.0'), '--test-isolation=process');
    assert.equal(resolveTestIsolationFlag('30.1.2'), '--test-isolation=process');
  });

  it('版本号非法或缺失时 fail-safe 到不注入', () => {
    assert.equal(resolveTestIsolationFlag(''), null);
    assert.equal(resolveTestIsolationFlag('not-a-version'), null);
    assert.equal(resolveTestIsolationFlag('v'), null);
  });

  it('buildNodeTestCommand 按当前运行时版本决定是否带 flag', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0], 10);
    const command = buildNodeTestCommand(process.cwd(), []);
    if (major >= 24) {
      assert.ok(command.includes('--test-isolation=process'), command);
    } else {
      assert.ok(!command.includes('--test-isolation'), command);
      assert.ok(!command.includes('bad option'), command);
    }
    assert.ok(command.includes('--test-concurrency='), command);
    assert.ok(command.includes('tests/*.test.mjs'), command);
  });

  it('isolation: false 时无论版本都不注入', () => {
    const command = buildNodeTestCommand(process.cwd(), ['tests/x.test.mjs'], { isolation: false });
    assert.ok(!command.includes('--test-isolation'), command);
    assert.ok(command.includes('tests/x.test.mjs'), command);
  });
});
