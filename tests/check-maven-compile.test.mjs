import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let runners;

before(async () => {
  runners = await import('../dist/commands/check/runners.js');
});

// Java 项目此前 results 为空数组 → check 空洞通过（exit 0）。本套件锁定 Maven 分支的
// 结构契约：识别 pom.xml、产出 compile 类检查项；空项目仍为零检查项。
describe('runCompileChecks Maven 分支', () => {
  it('detects pom.xml and returns a Maven compile check entry', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-mvn-'));
    try {
      // 最小非法 POM：POM 校验先于插件解析，mvn 快速失败，用例只断言结构不断言编译结果
      writeFileSync(join(cwd, 'pom.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<project></project>\n');
      const results = await runners.runCompileChecks(cwd, join(cwd, 'package.json'), runners.detectNodeCommandConfig(cwd));
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'Java 编译 (Maven)');
      assert.equal(results[0].category, 'compile');
      assert.match(results[0].command || '', /^mvn/);
      assert.equal(results[0].passed, false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps projects without any known manifest at zero compile checks', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-nomvn-'));
    try {
      const results = await runners.runCompileChecks(cwd, join(cwd, 'package.json'), runners.detectNodeCommandConfig(cwd));
      assert.equal(results.length, 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
