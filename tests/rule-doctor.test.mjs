import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseRuleEntitiesFromMarkdown,
  extractTokens,
  calculateJaccardSimilarity,
  detectPolarity,
  diagnoseRulesAndDecisions,
  fixRuleIssues,
} from '../dist/engine/rule-doctor.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('DocPath Rule & ADR Doctor Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-rule-doctor-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('correctly tokenizes and detects polarity', () => {
    const pos = detectPolarity('在迭代期间必须使用单文件定向测试');
    const neg = detectPolarity('在迭代期间严禁运行全量测试套件');
    const neutral = detectPolarity('这是一个普通描述规则');

    assert.equal(pos, 'positive');
    assert.equal(neg, 'negative');
    assert.equal(neutral, 'neutral');

    const tokensA = extractTokens('必须使用 docpath start 进行拉起');
    const tokensB = extractTokens('必须使用 docpath start 启动任务');
    const sim = calculateJaccardSimilarity(tokensA, tokensB);

    assert.ok(sim >= 0.35, `Expected high similarity, got ${sim}`);
  });

  it('parses structured rule entities from markdown', () => {
    const markdown = `# Style Rules

## gotcha: 手改 spec.md 后用 write-spec 重置问题
- rationale: write-spec 落盘触发 task.created 转移
触发: executing 阶段编辑 spec.md。期望行为: 用 write-spec 重同步后立即恢复。边界: 仅限漂移恢复。
### Evidence
- src/commands/agent.ts
- tests/next.test.mjs

## common-mistake: 严禁在迭代期执行全量测试
- rationale: 全量测试耗时且制造上下文冗余
触发: 开发调试。期望: 仅运行单单测文件。
### Evidence
- src/engine/step-verify.ts
`;

    const entities = parseRuleEntitiesFromMarkdown('.docpath/rules/style.md', '/tmp/style.md', markdown);
    assert.equal(entities.length, 2);

    assert.equal(entities[0].type, 'gotcha');
    assert.equal(entities[0].title, '手改 spec.md 后用 write-spec 重置问题');
    assert.equal(entities[0].rationale, 'write-spec 落盘触发 task.created 转移');
    assert.deepEqual(entities[0].relatedFiles, ['src/commands/agent.ts', 'tests/next.test.mjs']);

    assert.equal(entities[1].type, 'common-mistake');
    assert.equal(entities[1].title, '严禁在迭代期执行全量测试');
    assert.deepEqual(entities[1].relatedFiles, ['src/engine/step-verify.ts']);
  });

  it('diagnoses duplicates, semantic conflicts, and stale references', async () => {
    const docpathDir = join(tempDir, '.docpath');
    const rulesDir = join(docpathDir, 'rules');
    const workspaceDir = join(docpathDir, 'workspace');
    const srcDir = join(tempDir, 'src');

    await mkdir(rulesDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    await writeFile(join(srcDir, 'real-file.ts'), 'export const x = 1;\n');

    const styleContent = `# Style Rules

## pattern: 规范的缓存键计算
- rationale: 缓存键应使用完整路径与 mtime 计算
### Evidence
- src/real-file.ts

## pattern: 规范的缓存键计算
- rationale: 缓存键应使用完整路径与 mtime 计算
### Evidence
- src/real-file.ts

## gotcha: 调度器修改必须使用 docpath start 启动
- rationale: 调度器变更属于核心生命周期，必须经过标准流程
### Evidence
- src/real-file.ts

## gotcha: 调度器修改禁止使用 docpath start 启动
- rationale: 调度器可以直接使用快速通道修改
### Evidence
- src/deleted-old-file.ts
`;

    await writeFile(join(rulesDir, 'style.md'), styleContent);

    const report = await diagnoseRulesAndDecisions({
      cwd: tempDir,
      repoRoot: tempDir,
      maxBudgetLines: 10,
    });

    assert.equal(report.passed, false);
    assert.ok(report.errors > 0);

    const dupIssue = report.issues.find((i) => i.category === 'duplicate');
    assert.ok(dupIssue, 'Should detect duplicate rule');

    const conflictIssue = report.issues.find((i) => i.category === 'semantic_conflict');
    assert.ok(conflictIssue, 'Should detect semantic conflict');

    const staleIssue = report.issues.find((i) => i.category === 'stale_reference');
    assert.ok(staleIssue, 'Should detect stale reference for deleted-old-file.ts');

    const budgetIssue = report.issues.find((i) => i.category === 'budget_exceeded');
    assert.ok(budgetIssue, 'Should detect budget exceeded');
  });

  it('automatically deduplicates rules and cleans stale references', async () => {
    const docpathDir = join(tempDir, '.docpath');
    const rulesDir = join(docpathDir, 'rules');
    const srcDir = join(tempDir, 'src');

    await mkdir(rulesDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'existing.ts'), 'export const a = 1;');

    const rawContent = `# Rules

## gotcha: 规则A
- rationale: 说明A
### Evidence
- src/existing.ts
- src/non-existent.ts

## gotcha: 规则A
- rationale: 说明A
### Evidence
- src/existing.ts

## gotcha: 规则B
- rationale: 说明B
### Evidence
- src/existing.ts
`;

    await writeFile(join(rulesDir, 'style.md'), rawContent);

    const fixResult = await fixRuleIssues(docpathDir, { repoRoot: tempDir });
    assert.equal(fixResult.fixedDuplicates, 1);
    assert.equal(fixResult.cleanedStaleRefs, 1);

    const updatedContent = await readFile(join(rulesDir, 'style.md'), 'utf-8');
    const occurrences = (updatedContent.match(/## gotcha: 规则A/g) || []).length;
    assert.equal(occurrences, 1, 'Duplicate block should be removed');
    assert.ok(!updatedContent.includes('src/non-existent.ts'), 'Stale reference should be removed');
  });

  it('supports CLI commands: docpath rule doctor, --agent, and docpath doctor --rules', async () => {
    const docpathDir = join(tempDir, '.docpath');
    const rulesDir = join(docpathDir, 'rules');
    const workspaceDir = join(docpathDir, 'workspace');

    await mkdir(rulesDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(rulesDir, 'style.md'), '# Style Rules\n\n## pattern: 示例规则\n- rationale: 测试说明\n');
    await writeFile(join(docpathDir, 'config.yaml'), 'project:\n  name: test\n');

    // Run rule doctor via CLI agent mode
    const agentOut = execSync(`node ${BIN} rule doctor --agent --cwd ${tempDir}`, {
      encoding: 'utf-8',
    });
    assert.ok(agentOut.includes('agent_view: rule_doctor'));
    assert.ok(agentOut.includes('passed: true'));

    // Run doctor --rules in JSON mode
    execSync('git init -b main', { cwd: tempDir });
    const doctorOut = execSync(`node ${BIN} doctor --rules --json --cwd ${tempDir}`, {
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(doctorOut);
    assert.ok(parsed.rules);
    assert.equal(parsed.rules.passed, true);
  });

  it('diagnoses stale backlog assertions and split config truth, and self-heals stale markers', async () => {
    const docpathDir = join(tempDir, '.docpath');
    const rulesDir = join(docpathDir, 'rules');
    const backlogDir = join(docpathDir, 'backlog');
    const srcDir = join(tempDir, 'src');

    await mkdir(rulesDir, { recursive: true });
    await mkdir(backlogDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    await writeFile(join(srcDir, 'worktree-guard.ts'), 'export const guard = true;');

    // 1. 创建已完成的 backlog R-299
    const backlogContent = `---
id: R-299
title: "已完成的历史需求"
status: done
priority: P1
level: 1
source: manual
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
---

# 需求正文
`;
    await writeFile(join(backlogDir, 'R-299.md'), backlogContent);

    // 2. 创建规则引用 R-299 并标记为待修
    const ruleContent = `# Architecture Rules

## pattern: 隔离判定契约
- rationale: 避免重复实现
### Evidence
- src/worktree-guard.ts 判定逻辑 (R-299 待修)
`;
    await writeFile(join(rulesDir, 'architecture.md'), ruleContent);

    // 3. 同时放置 config.yaml 与 config.json 制造双真源分裂
    await writeFile(join(docpathDir, 'config.yaml'), 'project:\n  name: test\n');
    await writeFile(join(docpathDir, 'config.json'), '{"project": {"name": "test"}}');

    const report = await diagnoseRulesAndDecisions({
      cwd: tempDir,
      repoRoot: tempDir,
    });

    const staleIssue = report.issues.find((i) => i.category === 'stale_backlog_assertion');
    assert.ok(staleIssue, 'Should detect stale backlog assertion for R-299');
    assert.equal(staleIssue.details?.backlogId, 'R-299');
    assert.equal(staleIssue.details?.backlogStatus, 'done');

    const splitConfigIssue = report.issues.find((i) => i.category === 'split_config_truth');
    assert.ok(splitConfigIssue, 'Should detect split config truth when both yaml and json exist');

    // 4. 测试 fixRuleIssues 自动自愈陈旧需求标记
    const fixResult = await fixRuleIssues(docpathDir, { repoRoot: tempDir });
    assert.equal(fixResult.healedBacklogAssertions, 1);

    const healedContent = await readFile(join(rulesDir, 'architecture.md'), 'utf-8');
    assert.ok(healedContent.includes('(R-299 已闭环修复)'), 'Should heal stale marker to 已闭环修复');
    assert.ok(!healedContent.includes('R-299 待修'), 'Old stale marker should be gone');
  });
});
