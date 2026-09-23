import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractActionableFixSuggestions } from '../dist/commands/check/formatters.js';

describe('extractActionableFixSuggestions: 门禁失败提取定向调试与修复命令', () => {
  it('从测试失败输出中精准提取失败测试文件并生成定向运行命令', () => {
    const failures = [
      {
        name: '测试（影响面 1/87）',
        passed: false,
        category: 'test',
        output: `
# Subtest: tests/start.test.mjs
not ok 1 - start "<title>"
  ---
  duration_ms: 123.45
  failureType: 'testCodeFailure'
  error: 'AssertionError'
  ...
✖ tests/start.test.mjs (123ms)
`,
      },
    ];

    const suggestions = extractActionableFixSuggestions(failures);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].label, '单用例测试 (tests/start.test.mjs)');
    assert.equal(suggestions[0].command, 'node --test tests/start.test.mjs');
  });

  it('从 Lint 失败中提取自动修复建议', () => {
    const failures = [
      {
        name: 'Lint 检查',
        passed: false,
        category: 'lint',
        output: 'ESLint found 3 problems',
      },
    ];

    const suggestions = extractActionableFixSuggestions(failures);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].label, '自动修复 Lint 问题');
    assert.match(suggestions[0].command, /lint.*--fix/);
  });

  it('从编译/类型检查失败中提取 tsc 检查建议', () => {
    const failures = [
      {
        name: 'TypeScript 类型检查',
        passed: false,
        category: 'compile',
        output: 'error TS2322: Type "string" is not assignable to type "number"',
      },
    ];

    const suggestions = extractActionableFixSuggestions(failures);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].label, '定向运行类型检查');
    assert.equal(suggestions[0].command, 'npx tsc --noEmit');
  });
});
