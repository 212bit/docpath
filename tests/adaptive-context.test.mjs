import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { buildAdaptiveContext } from '../dist/engine/adaptive-context.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Adaptive Context Engine (buildAdaptiveContext)', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-adaptive-ctx-test-'));
    // Setup minimal docpath structure
    await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'tasks', 'current'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'rules'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'decisions'), { recursive: true });

    // Workspace state
    await writeFile(
      join(tempDir, '.docpath', 'workspace', 'state.json'),
      JSON.stringify(
        {
          schema_version: '1.0',
          task_id: 'T-2026-adapt',
          task_title: 'Test Adaptive Context Engine',
          level: 1,
          state: 'in_progress',
          phase: 'executing',
          started_at: '2026-09-26T10:00:00.000Z',
          updated_at: '2026-09-26T10:30:00.000Z',
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Breadcrumb
    const bcLines = [
      JSON.stringify({ schema_version: 1, kind: 'breadcrumb', taskId: 'T-2026-adapt', timestamp: '2026-09-26T10:01:00Z', step: 'S1', status: 'done', context: 'S1 finished' }),
      JSON.stringify({ schema_version: 1, kind: 'breadcrumb', taskId: 'T-2026-adapt', timestamp: '2026-09-26T10:05:00Z', step: 'S2', status: 'in_progress', context: 'S2 in progress' }),
    ];
    await writeFile(join(tempDir, '.docpath', 'workspace', 'breadcrumb.jsonl'), bcLines.join('\n'), 'utf-8');

    // Task spec
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'current', 'spec.json'),
      JSON.stringify(
        {
          schema_version: 1,
          kind: 'spec',
          source: {
            kind: 'markdown',
            created_at: '2026-09-26T10:00:00.000Z',
            updated_at: '2026-09-26T10:00:00.000Z',
            content_sha256: 'mocksha256',
          },
          task_id: 'T-2026-adapt',
          title: 'Test Adaptive Context Engine',
          generated_at: '2026-09-26T10:00:00.000Z',
          scope: {
            included: ['Multi-tier allocation', 'Step folding'],
            excluded: [],
          },
          major_change_gate: {
            required: false,
            types: [],
            user_confirmed: '已确认',
            decision_brief_markdown: '- 当前问题: Context overload',
          },
          ui_gate: {
            state: 'exempt',
          },
          functional_requirements: [
            { id: 'FR-1', text: 'Multi-tier allocation tokens by tier priorities', done: false },
            { id: 'FR-2', text: 'Step folding fold completed steps', done: false },
          ],
          non_functional_requirements: [
            { id: 'NFR-1', text: 'Strict token budget bound', done: false },
          ],
          acceptance_criteria: [
            { id: 'AC-1', text: 'Tier 1 never truncated', done: false },
            { id: 'AC-2', text: 'Budget respected', done: false },
          ],
          decision_brief: {
            problem: 'Large context overload',
            options: ['Option A: Adaptive multi-tier compression'],
            chosen: 'Option A',
            rationale: 'Higher prompt efficiency and zero context blowout',
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Task plan
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'current', 'plan.json'),
      JSON.stringify(
        {
          schema_version: 1,
          kind: 'plan',
          source: {
            kind: 'markdown',
            created_at: '2026-09-26T10:00:00.000Z',
            updated_at: '2026-09-26T10:00:00.000Z',
            content_sha256: 'mockplan',
          },
          title: '执行计划',
          generated_at: '2026-09-26T10:00:00.000Z',
          steps: [
            {
              id: 'S1',
              name: 'Initialize engine',
              status: 'done',
              description: 'Created engine file with interfaces and helper functions. Detailed historical notes here.',
              acceptance: 'Engine builds',
              dependencies: 'none',
              files: ['src/engine/adaptive-context.ts'],
            },
            {
              id: 'S2',
              name: 'Integrate CLI and tests',
              status: 'pending',
              description: 'Register --adaptive flag in CLI commands and create test suite.',
              acceptance: 'Tests pass',
              dependencies: 'S1',
              files: ['src/commands/context.ts', 'tests/adaptive-context.test.mjs'],
            },
            {
              id: 'S3',
              name: 'Run closeout verification',
              status: 'pending',
              description: 'Verify with docpath done --commit',
              acceptance: 'Commit succeed',
              dependencies: 'S2',
              files: [],
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Rule file
    await writeFile(
      join(tempDir, '.docpath', 'rules', 'style.md'),
      '# Style Rules\n\n## rule: single-test-execution\n触发: 迭代期间。期望: 仅运行单文件测试，严禁全量测试。\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('builds adaptive context within generous budget', async () => {
    const report = await buildAdaptiveContext({
      cwd: tempDir,
      maxTokens: 4000,
    });

    assert.equal(report.task_id, 'T-2026-adapt');
    assert.equal(report.phase, 'executing');
    assert.ok(report.total_tokens > 0);
    assert.ok(report.total_tokens <= 4000);
    assert.ok(report.tiers.length >= 2);

    // Verify Tier 1 (Spec & Contract)
    const tier1 = report.tiers.find((t) => t.tier === 1);
    assert.ok(tier1, 'Tier 1 must exist');
    assert.ok(tier1.content.includes('FR-1'));
    assert.ok(tier1.content.includes('Decision Brief') || tier1.content.includes('架构决策'));

    // Verify Tier 2 (Plan & Active Step Focus)
    const tier2 = report.tiers.find((t) => t.tier === 2);
    assert.ok(tier2, 'Tier 2 must exist');
    // Completed step S1 should be folded into compact line
    assert.ok(tier2.content.includes('✅ S1: Initialize engine'));
    // Active step S2 should be expanded with details
    assert.ok(tier2.content.includes('S2 — Integrate CLI and tests'));
    assert.ok(tier2.content.includes('Register --adaptive flag'));
  });

  it('compresses and respects strict budget limits', async () => {
    const report = await buildAdaptiveContext({
      cwd: tempDir,
      maxTokens: 500, // tight budget
    });

    assert.ok(report.total_tokens <= 600, `Expected tight tokens, got ${report.total_tokens}`);
    assert.ok(typeof report.compression_ratio === 'number');
    assert.ok(report.compression_ratio >= 0 && report.compression_ratio <= 2);
  });

  it('supports CLI --adaptive and --agent output', () => {
    const out = execSync(`node "${BIN}" context --adaptive --agent --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = parse(out);
    assert.equal(parsed.agent_view, 'adaptive_context');
    assert.equal(parsed.task_id, 'T-2026-adapt');
    assert.ok(Array.isArray(parsed.tiers));
    assert.ok(parsed.context_payload.length > 0);
  });

  it('supports CLI --adaptive human-readable output', () => {
    const out = execSync(`node "${BIN}" context --adaptive --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    assert.ok(out.includes('DocPath 自适应分层上下文包'));
    assert.ok(out.includes('Tier 1'));
    assert.ok(out.includes('Tier 2'));
    assert.ok(out.includes('任务核心契约') || out.includes('core_contract'));
  });
});
