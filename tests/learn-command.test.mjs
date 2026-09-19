import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-learn-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: learn-test\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\n- Baseline style rule.\n');
  writeFileSync(join(dp, 'rules', 'architecture.md'), '# Architecture Rules\n\n- Baseline architecture rule.\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath learn command', () => {
  it('handles empty lesson candidates gracefully', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('learn --dry-run', cwd);
      assert.match(out, /暂无可学习的 Lesson 候选/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('prunes low-value lesson candidates', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    try {
      writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
        '# Lesson Candidates',
        '',
        '## T-20260901-test — 2026-09-01T00:00:00.000Z',
        '- task_id: T-20260901-test',
        '- type: best-practice',
        '- target: style',
        '- key: test-short',
        '',
        '### Lesson',
        '待补充',
        '',
        '---',
      ].join('\n'));

      const out = run('learn prune', cwd);
      assert.match(out, /已清理 1 个低价值候选/);

      const content = readFileSync(join(dp, 'workspace', 'lesson-candidates.md'), 'utf-8');
      assert.doesNotMatch(content, /test-short/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('promotes high-value lesson candidate to rules/style.md', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    try {
      writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
        '# Lesson Candidates',
        '',
        '## T-20260918-rule-test — 2026-09-18T00:00:00.000Z',
        '- task_id: T-20260918-rule-test',
        '- type: best-practice',
        '- target: style',
        '- source: journal',
        '- key: T-20260918-rule-test-workflow',
        '',
        '### Lesson',
        '',
        '### 推荐方案',
        '当修改核心模块时，必须同步更新 docs/ 活文档以保持契约一致，避免出现悬空断链。',
        '',
        '---',
      ].join('\n'));

      const preview = run('learn --dry-run', cwd);
      assert.match(preview, /可晋升规则: 1 个/);
      assert.match(preview, /\[晋升候选\]/);

      const out = run('learn', cwd);
      assert.match(out, /固化完成！共晋升 1 条规则/);

      const styleRules = readFileSync(join(dp, 'rules', 'style.md'), 'utf-8');
      assert.match(styleRules, /T-20260918-rule-test-workflow/);
      assert.match(styleRules, /当修改核心模块时，必须同步更新 docs/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --agent structured yaml output for preview and promotion', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    try {
      writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
        '# Lesson Candidates',
        '',
        '## T-20260919-agent-test — 2026-09-19T00:00:00.000Z',
        '- task_id: T-20260919-agent-test',
        '- type: best-practice',
        '- target: architecture',
        '- source: journal',
        '- key: T-20260919-agent-test-arch',
        '',
        '### Lesson',
        '',
        '### 推荐方案',
        '在实现模块间通信时，必须优先使用事件总线，保持模块间松耦合与边界清晰。',
        '',
        '---',
      ].join('\n'));

      const agentPreview = run('learn --dry-run --agent', cwd);
      assert.match(agentPreview, /agent_view:\s*learn/);
      assert.match(agentPreview, /promotable_count:\s*1/);
      assert.match(agentPreview, /target:\s*architecture/);

      const agentPromote = run('learn --agent', cwd);
      assert.match(agentPromote, /action:\s*promoted/);
      assert.match(agentPromote, /architecture_rules_promoted:\s*1/);

      const archRules = readFileSync(join(dp, 'rules', 'architecture.md'), 'utf-8');
      assert.match(archRules, /T-20260919-agent-test-arch/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('promotes candidate to custom dynamic rule category (e.g. testing.md)', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    try {
      writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
        '# Lesson Candidates',
        '',
        '## T-20260919-custom-test — 2026-09-19T00:00:00.000Z',
        '- task_id: T-20260919-custom-test',
        '- type: pattern',
        '- target: testing',
        '- source: journal',
        '- key: T-20260919-custom-test-isolated',
        '',
        '### Lesson',
        '',
        '### 推荐方案',
        '编写单元测试时必须使用隔离临时目录，并在 finally 块中确保清理。',
        '',
        '---',
      ].join('\n'));

      const out = run('learn', cwd);
      assert.match(out, /固化完成！共晋升 1 条规则/);
      assert.match(out, /testing: 1/);

      const testingRulePath = join(dp, 'rules', 'testing.md');
      assert.equal(existsSync(testingRulePath), true);
      const testingContent = readFileSync(testingRulePath, 'utf-8');
      assert.match(testingContent, /# Testing Rules/);
      assert.match(testingContent, /T-20260919-custom-test-isolated/);
      assert.match(testingContent, /编写单元测试时必须使用隔离临时目录/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
