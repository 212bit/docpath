import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AntigravityTelemetryAdapter,
  EnvTelemetryAdapter,
  FallbackBreadcrumbAdapter,
  ComplianceAuditor,
  resolveAgentTelemetry,
} from '../dist/utils/agent-telemetry-adapter.js';
import { collectTaskMetrics, probeRealAgentTelemetry } from '../dist/utils/task-metrics.js';

describe('Agent Telemetry Adapter & Compliance Auditor (FR-1 / AC-1 & AC-2)', () => {
  describe('AntigravityTelemetryAdapter', () => {
    it('parses transcript JSONL and extracts exact token and tool metrics', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          created_at: '2026-09-30T10:00:00.000Z',
          content: 'Implement user login feature',
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:05.000Z',
          thinking: 'Planning to view files and write code',
          tool_calls: [
            {
              name: 'view_file',
              args: { AbsolutePath: '/src/index.ts', StartLine: 1, EndLine: 50 },
            },
          ],
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'VIEW_FILE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:10.000Z',
          content: 'console.log("hello");',
        }),
        JSON.stringify({
          step_index: 4,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:15.000Z',
          tool_calls: [
            {
              name: 'run_command',
              args: { CommandLine: 'node --test' },
            },
          ],
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.equal(result.toolCalls.total, 2);
      assert.equal(result.toolCalls.byName['view_file'], 1);
      assert.equal(result.toolCalls.byName['run_command'], 1);
      assert.equal(result.turnsCount, 3);
      assert.equal(result.errorCount, 0);
      assert.equal(result.heavyReadsCount, 0);
      assert.equal(result.flappingCount, 0);
      assert.ok(result.tokens.totalTokens > 0);
      assert.ok(result.tokens.inputTokens > 0);
      assert.ok(result.tokens.outputTokens > 0);
      assert.ok(Array.isArray(result.toolAttributions));
      assert.equal(result.toolAttributions.length, 2);
      const vf = result.toolAttributions.find((t) => t.name === 'view_file');
      assert.ok(vf);
      assert.equal(vf.count, 1);
      assert.ok(vf.inputTokens > 0);
      assert.ok(vf.outputTokens > 0);
      assert.equal(vf.totalTokens, vf.inputTokens + vf.outputTokens);
      assert.ok(vf.percentage > 0 && vf.percentage <= 100);
      assert.equal(vf.errorCount, 0);
    });

    it('calculates tool-level real token attribution and percentage distribution (FR-1 / AC-1)', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:00.000Z',
          tool_calls: [
            {
              name: 'replace_file_content',
              args: { TargetFile: '/src/main.ts', ReplacementContent: 'export const a = 1;\nexport const b = 2;\n' },
            },
            {
              name: 'run_command',
              args: { CommandLine: 'npm test' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'REPLACE_FILE_CONTENT',
          status: 'DONE',
          created_at: '2026-09-30T10:00:05.000Z',
          content: 'Successfully replaced content',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'DONE',
          created_at: '2026-09-30T10:00:10.000Z',
          content: 'Tests passed: 10 passed, 0 failed',
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.ok(Array.isArray(result.toolAttributions));
      assert.equal(result.toolAttributions.length, 2);

      // Verify sorting descending by totalTokens
      for (let i = 0; i < result.toolAttributions.length - 1; i++) {
        assert.ok(result.toolAttributions[i].totalTokens >= result.toolAttributions[i + 1].totalTokens);
      }

      for (const attr of result.toolAttributions) {
        assert.ok(attr.name === 'replace_file_content' || attr.name === 'run_command');
        assert.equal(attr.count, 1);
        assert.ok(attr.inputTokens > 0);
        assert.ok(attr.outputTokens > 0);
        assert.equal(attr.totalTokens, attr.inputTokens + attr.outputTokens);
        assert.ok(attr.percentage > 0 && attr.percentage <= 100);
        assert.equal(attr.errorCount, 0);
      }
    });

    it('tracks tool-level error counts in toolAttributions', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:00.000Z',
          tool_calls: [
            {
              name: 'run_command',
              args: { CommandLine: 'invalid-command' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'ERROR',
          created_at: '2026-09-30T10:00:05.000Z',
          content: 'Command failed with exit code 127',
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.equal(result.toolAttributions.length, 1);
      const rc = result.toolAttributions[0];
      assert.equal(rc.name, 'run_command');
      assert.equal(rc.errorCount, 1);
      assert.ok(rc.inputTokens > 0);
      assert.ok(rc.outputTokens > 0);
    });

    it('identifies heavy file reads in main session', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:00.000Z',
          tool_calls: [
            {
              name: 'view_file',
              args: { AbsolutePath: '/large/file1.ts', StartLine: 1, EndLine: 800 },
            },
            {
              name: 'view_file',
              args: { AbsolutePath: '/large/file2.ts' },
            },
            {
              name: 'view_file',
              args: { AbsolutePath: '/large/file3.ts', StartLine: 1, EndLine: 600 },
            },
          ],
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);
      assert.equal(result.heavyReadsCount, 3);
    });

    it('identifies flapping tool failures and repeated errors', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'ERROR',
          created_at: '2026-09-30T10:00:00.000Z',
          content: 'Command failed with exit code 1',
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'ERROR',
          created_at: '2026-09-30T10:00:05.000Z',
          content: 'Command failed with exit code 1',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'ERROR',
          created_at: '2026-09-30T10:00:10.000Z',
          content: 'Command failed with exit code 1',
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);
      assert.equal(result.errorCount, 3);
      assert.equal(result.flappingCount, 1);
    });
  });

  describe('EnvTelemetryAdapter', () => {
    it('parses DOCPATH_AGENT_* standard environment variables', async () => {
      const env = {
        DOCPATH_AGENT_INPUT_TOKENS: '5000',
        DOCPATH_AGENT_OUTPUT_TOKENS: '1200',
        DOCPATH_AGENT_TOTAL_TOKENS: '6200',
        DOCPATH_AGENT_COST_USD: '0.015',
        DOCPATH_AGENT_MODEL: 'gemini-2.5-pro',
        DOCPATH_AGENT_SOURCE: 'antigravity',
        DOCPATH_AGENT_TURNS: '8',
        DOCPATH_AGENT_TOOL_CALLS: '12',
      };

      const record = await EnvTelemetryAdapter.probe({
        cwd: '/dummy',
        taskId: 'T-101',
        env,
      });

      assert.ok(record);
      assert.equal(record.source, 'antigravity');
      assert.equal(record.tokens.inputTokens, 5000);
      assert.equal(record.tokens.outputTokens, 1200);
      assert.equal(record.tokens.totalTokens, 6200);
      assert.equal(record.tokens.costUsd, 0.015);
      assert.equal(record.model, 'gemini-2.5-pro');
      assert.equal(record.turnsCount, 8);
      assert.equal(record.toolCalls.total, 12);
      assert.equal(record.complianceScore, 100);
    });
  });

  describe('FallbackBreadcrumbAdapter', () => {
    it('falls back to breadcrumb.jsonl when no external harness log exists', async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'dp-telemetry-bc-'));
      const dp = join(cwd, '.docpath');
      mkdirSync(join(dp, 'tasks', 'T-200'), { recursive: true });

      const breadcrumbLines = [
        JSON.stringify({ timestamp: '2026-09-30T10:00:00.000Z', step: 'S1', status: 'done', taskId: 'T-200' }),
        JSON.stringify({ timestamp: '2026-09-30T10:02:00.000Z', step: 'S2', status: 'blocked', gate_verdict: 'fail' }),
      ].join('\n');

      writeFileSync(join(dp, 'tasks', 'T-200', 'breadcrumb.jsonl'), breadcrumbLines);

      try {
        const record = await FallbackBreadcrumbAdapter.probe({
          cwd,
          taskId: 'T-200',
        });

        assert.ok(record);
        assert.equal(record.source, 'breadcrumb');
        assert.equal(record.turnsCount, 2);
        assert.equal(record.errorCount, 1);
        assert.ok(record.tokens.totalTokens > 0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  describe('ComplianceAuditor Rules (CR-01 ~ CR-05)', () => {
    it('CR-01: flags Quick workflow modifying forbidden scheduler/engine files', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'quick',
        level: 1,
        diffStats: {
          filesChanged: 1,
          linesAdded: 10,
          linesDeleted: 2,
          totalDiffLines: 12,
          changedFiles: ['src/commands/agent.ts'],
        },
        turnsCount: 5,
        errorCount: 0,
        heavyReadsCount: 0,
        flappingCount: 0,
        totalTokens: 1000,
        durationMinutes: 2,
      });

      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].ruleId, 'CR-01');
      assert.equal(result.violations[0].severity, 'critical');
      assert.equal(result.complianceScore, 65);
    });

    it('CR-01: flags Quick workflow exceeding 50 diff lines limit', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'quick',
        level: 1,
        diffStats: {
          filesChanged: 2,
          linesAdded: 60,
          linesDeleted: 10,
          totalDiffLines: 70,
          changedFiles: ['src/utils/helper.ts'],
        },
        turnsCount: 5,
        errorCount: 0,
        heavyReadsCount: 0,
        flappingCount: 0,
        totalTokens: 1000,
        durationMinutes: 2,
      });

      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].ruleId, 'CR-01');
      assert.equal(result.violations[0].severity, 'high');
      assert.equal(result.complianceScore, 75);
    });

    it('CR-02: flags Tool Misuse when heavy file reads count >= 3', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'standard',
        level: 2,
        turnsCount: 10,
        errorCount: 0,
        heavyReadsCount: 3,
        flappingCount: 0,
        totalTokens: 20000,
        durationMinutes: 10,
      });

      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].ruleId, 'CR-02');
      assert.equal(result.complianceScore, 85);
    });

    it('CR-03: flags Flapping retry loops when consecutive failures occur', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'standard',
        level: 2,
        turnsCount: 10,
        errorCount: 4,
        heavyReadsCount: 0,
        flappingCount: 1,
        totalTokens: 20000,
        durationMinutes: 10,
      });

      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].ruleId, 'CR-03');
      assert.equal(result.complianceScore, 80);
    });

    it('CR-04: flags unrotated long sessions exceeding turn/token thresholds', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'standard',
        level: 2,
        turnsCount: 40,
        errorCount: 0,
        heavyReadsCount: 0,
        flappingCount: 0,
        totalTokens: 180000,
        durationMinutes: 70,
      });

      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].ruleId, 'CR-04');
      assert.equal(result.complianceScore, 85);
    });

    it('CR-05: flags missing decision brief on standard level 2 major changes', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'standard',
        level: 2,
        turnsCount: 10,
        errorCount: 0,
        heavyReadsCount: 0,
        flappingCount: 0,
        totalTokens: 20000,
        durationMinutes: 10,
        spec: {
          major_change_gate: { required: true },
          decision_brief: { problem: '待确认', chosen: '待确认' },
        },
      });

      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].ruleId, 'CR-05');
      assert.equal(result.complianceScore, 80);
    });

    it('computes 100 compliance score when completely compliant', () => {
      const result = ComplianceAuditor.evaluate({
        profile: 'standard',
        level: 2,
        turnsCount: 10,
        errorCount: 0,
        heavyReadsCount: 0,
        flappingCount: 0,
        totalTokens: 20000,
        durationMinutes: 10,
        spec: {
          major_change_gate: { required: false },
          decision_brief: { problem: 'Refactor telemetry', chosen: 'Adapter pattern' },
        },
      });

      assert.equal(result.violations.length, 0);
      assert.equal(result.complianceScore, 100);
    });
  });

  describe('Integration with TaskMetrics & collectTaskMetrics', () => {
    it('collectTaskMetrics includes compliance score and real usage', async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'dp-metrics-integ-'));
      const dp = join(cwd, '.docpath');
      mkdirSync(join(dp, 'workspace'), { recursive: true });
      mkdirSync(join(dp, 'tasks', 'T-300'), { recursive: true });

      writeFileSync(
        join(dp, 'tasks', 'T-300', 'spec.json'),
        JSON.stringify({
          task_id: 'T-300',
          title: 'Metrics Integration Task',
          backlog_id: 'R-300',
        })
      );

      writeFileSync(
        join(dp, 'tasks', 'T-300', 'plan.json'),
        JSON.stringify({
          steps: [{ id: 'S1', status: 'done' }],
        })
      );

      writeFileSync(
        join(dp, 'tasks', 'T-300', 'breadcrumb.jsonl'),
        JSON.stringify({
          timestamp: '2026-09-30T10:00:00.000Z',
          step: 'S1',
          status: 'done',
        }) + '\n'
      );

      try {
        const metrics = await collectTaskMetrics(cwd, 'T-300');
        assert.equal(metrics.taskId, 'T-300');
        assert.ok(typeof metrics.complianceScore === 'number');
        assert.ok(metrics.complianceScore >= 0 && metrics.complianceScore <= 100);
        assert.ok(Array.isArray(metrics.violations));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  describe('Tool Inefficiency & Context Waste Diagnostic Engine (FR-2 / AC-2)', () => {
    it('detects duplicate file reads when the same path is read >= 3 times in a session', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/Users/mac/project/src/index.ts', StartLine: 1, EndLine: 50 } }],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'VIEW_FILE',
          status: 'DONE',
          content: 'export const a = 1;',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/Users/mac/project/src/index.ts', StartLine: 1, EndLine: 50 } }],
        }),
        JSON.stringify({
          step_index: 4,
          source: 'MODEL',
          type: 'VIEW_FILE',
          status: 'DONE',
          content: 'export const a = 1;',
        }),
        JSON.stringify({
          step_index: 5,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/Users/mac/project/src/index.ts', StartLine: 1, EndLine: 50 } }],
        }),
        JSON.stringify({
          step_index: 6,
          source: 'MODEL',
          type: 'VIEW_FILE',
          status: 'DONE',
          content: 'export const a = 1;',
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.ok(Array.isArray(result.toolInefficiencies));
      const dup = result.toolInefficiencies.find((i) => i.type === 'duplicate_file_reads');
      assert.ok(dup, 'Should detect duplicate_file_reads inefficiency');
      assert.equal(dup.tool, 'view_file');
      assert.match(dup.description, /index\.ts/);
      assert.match(dup.description, /3 次/);
      assert.ok(dup.tokensWasted > 0);
      assert.equal(dup.evidence?.readCount, 3);
      assert.equal(dup.evidence?.path, '/Users/mac/project/src/index.ts');
    });

    it('detects oversized command outputs exceeding token threshold (>2000 tokens)', () => {
      // 2500 tokens of command output (approx 10000 chars)
      const bigOutput = 'LOG LINE OF LONG OUTPUT: ' + 'x'.repeat(12000);

      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          tool_calls: [{ name: 'run_command', args: { CommandLine: 'npm test --verbose' } }],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'DONE',
          content: bigOutput,
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.ok(Array.isArray(result.toolInefficiencies));
      const oversized = result.toolInefficiencies.find((i) => i.type === 'oversized_command_output');
      assert.ok(oversized, 'Should detect oversized_command_output inefficiency');
      assert.equal(oversized.tool, 'run_command');
      assert.match(oversized.description, /超长输出/);
      assert.ok(oversized.tokensWasted > 0);
      assert.ok(oversized.evidence?.outputTokens > 2000);
      assert.equal(oversized.evidence?.commandLine, 'npm test --verbose');
    });

    it('detects edit target miss and error retries for replace_file_content', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          tool_calls: [{ name: 'replace_file_content', args: { TargetFile: '/src/main.ts', TargetContent: 'not found string', ReplacementContent: 'replacement' } }],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'REPLACE_FILE_CONTENT',
          status: 'ERROR',
          content: 'Error: TargetContent was not found in /src/main.ts',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          tool_calls: [{ name: 'replace_file_content', args: { TargetFile: '/src/main.ts', TargetContent: 'another wrong string', ReplacementContent: 'replacement' } }],
        }),
        JSON.stringify({
          step_index: 4,
          source: 'MODEL',
          type: 'REPLACE_FILE_CONTENT',
          status: 'ERROR',
          content: 'Error: TargetContent was not found in /src/main.ts',
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.ok(Array.isArray(result.toolInefficiencies));
      const editMiss = result.toolInefficiencies.find((i) => i.type === 'edit_target_miss');
      assert.ok(editMiss, 'Should detect edit_target_miss inefficiency');
      assert.equal(editMiss.tool, 'replace_file_content');
      assert.match(editMiss.description, /2 次/);
      assert.match(editMiss.description, /main\.ts/);
      assert.ok(editMiss.tokensWasted > 0);
      assert.equal(editMiss.evidence?.errorCount, 2);
    });
  });
});
