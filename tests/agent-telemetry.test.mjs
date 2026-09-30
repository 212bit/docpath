import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AntigravityTelemetryAdapter,
  EnvTelemetryAdapter,
  FallbackBreadcrumbAdapter,
  ZCodeTelemetryAdapter,
  ComplianceAuditor,
  resolveAgentTelemetry,
  detectCurrentSessionId,
  captureGitCommit,
  extractDocpathSubcommand,
} from '../dist/utils/agent-telemetry-adapter.js';
import {
  collectTaskMetrics,
  probeRealAgentTelemetry,
  probeActiveTaskMetrics,
  extractStepTelemetrySlices,
} from '../dist/utils/task-metrics.js';

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

    it('extracts docpath subcommands with extractDocpathSubcommand across CLI formats (FR-1 / AC-1)', () => {
      assert.equal(extractDocpathSubcommand('docpath next --agent'), 'next');
      assert.equal(extractDocpathSubcommand('node bin/docpath.js check'), 'check');
      assert.equal(extractDocpathSubcommand('node ./bin/docpath.mjs step-pass --commit'), 'step-pass');
      assert.equal(extractDocpathSubcommand('pnpm docpath go --step S1'), 'go');
      assert.equal(extractDocpathSubcommand('npx docpath start "new task" --draft'), 'start');
      assert.equal(extractDocpathSubcommand('docpath quick "fix typo"'), 'quick');
      assert.equal(extractDocpathSubcommand('docpath monitor --agent'), 'monitor');
      assert.equal(extractDocpathSubcommand('docpath done --commit'), 'done');
      assert.equal(extractDocpathSubcommand('docpath backlog list'), 'backlog');
      assert.equal(extractDocpathSubcommand('git status'), null);
      assert.equal(extractDocpathSubcommand('npm test'), null);
      assert.equal(extractDocpathSubcommand(''), null);
    });

    it('extracts DocPathCliOverhead telemetry, command frequency, error rate and token attribution (FR-1 / AC-1)', () => {
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
              args: { CommandLine: 'docpath next --agent' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'DONE',
          created_at: '2026-09-30T10:00:05.000Z',
          content: '{"next_action": "go", "step": "S1"}',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:10.000Z',
          tool_calls: [
            {
              name: 'run_command',
              args: { CommandLine: 'docpath go --step S1' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 4,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'DONE',
          created_at: '2026-09-30T10:00:15.000Z',
          content: 'Step S1 started',
        }),
        JSON.stringify({
          step_index: 5,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:20.000Z',
          tool_calls: [
            {
              name: 'run_command',
              args: { CommandLine: 'docpath next --agent' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 6,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'DONE',
          created_at: '2026-09-30T10:00:25.000Z',
          content: '{"next_action": "step-pass", "step": "S1"}',
        }),
        JSON.stringify({
          step_index: 7,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:30.000Z',
          tool_calls: [
            {
              name: 'run_command',
              args: { CommandLine: 'docpath step-pass --commit' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 8,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'ERROR',
          created_at: '2026-09-30T10:00:35.000Z',
          content: 'Error: quality gate check failed',
        }),
        JSON.stringify({
          step_index: 9,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-09-30T10:00:40.000Z',
          tool_calls: [
            {
              name: 'run_command',
              args: { CommandLine: 'docpath done --commit' },
            },
          ],
        }),
        JSON.stringify({
          step_index: 10,
          source: 'MODEL',
          type: 'RUN_COMMAND',
          status: 'DONE',
          created_at: '2026-09-30T10:00:45.000Z',
          content: 'Task completed successfully',
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.ok(result.docpathCliOverhead, 'docpathCliOverhead should be present');
      const overhead = result.docpathCliOverhead;

      assert.equal(overhead.totalCalls, 5);
      assert.equal(overhead.errorCalls, 1);
      assert.ok(overhead.totalTokens > 0);
      assert.ok(overhead.inputTokens > 0);
      assert.ok(overhead.outputTokens > 0);
      assert.equal(overhead.totalTokens, overhead.inputTokens + overhead.outputTokens);
      assert.ok(overhead.percentageOfSessionTokens > 0 && overhead.percentageOfSessionTokens <= 100);

      // Verify commands breakdown
      assert.equal(overhead.commands.length, 4); // 'next' (2 calls), 'go', 'step-pass', 'done'

      // Top command should be 'next' with count 2
      const topCmd = overhead.commands[0];
      assert.equal(topCmd.subcommand, 'next');
      assert.equal(topCmd.count, 2);
      assert.equal(topCmd.errorCount, 0);
      assert.ok(topCmd.inputTokens > 0);
      assert.ok(topCmd.outputTokens > 0);
      assert.equal(topCmd.totalTokens, topCmd.inputTokens + topCmd.outputTokens);
      assert.equal(topCmd.avgTokens, Math.round(topCmd.totalTokens / 2));

      // Check step-pass has errorCount = 1
      const stepPassCmd = overhead.commands.find((c) => c.subcommand === 'step-pass');
      assert.ok(stepPassCmd);
      assert.equal(stepPassCmd.count, 1);
      assert.equal(stepPassCmd.errorCount, 1);
      assert.equal(stepPassCmd.avgTokens, stepPassCmd.totalTokens);

      // Check go and done
      const goCmd = overhead.commands.find((c) => c.subcommand === 'go');
      assert.ok(goCmd);
      assert.equal(goCmd.count, 1);
      assert.equal(goCmd.errorCount, 0);

      const doneCmd = overhead.commands.find((c) => c.subcommand === 'done');
      assert.ok(doneCmd);
      assert.equal(doneCmd.count, 1);
      assert.equal(doneCmd.errorCount, 0);
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

  describe('ZCodeTelemetryAdapter & SQLite Telemetry Direct Connection (FR-1 / AC-1)', () => {
    it('parses SQLite database model_usage, turn_usage, and tool_usage tables', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dp-zcode-fixture-'));
      const dbPath = join(tempDir, 'db.sqlite');

      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath);

      db.exec(`
        CREATE TABLE model_usage (
          id text primary key,
          session_id text,
          model_id text,
          started_at integer,
          completed_at integer,
          input_tokens integer default 0,
          output_tokens integer default 0,
          reasoning_tokens integer default 0,
          cache_read_input_tokens integer default 0,
          computed_total_tokens integer default 0,
          tool_call_count integer default 0,
          status text default 'completed'
        );
        CREATE TABLE turn_usage (
          session_id text,
          turn_id text,
          started_at integer,
          tool_call_count integer default 0,
          tool_error_count integer default 0
        );
        CREATE TABLE tool_usage (
          id text primary key,
          session_id text,
          tool_name text,
          status text,
          started_at integer,
          exit_code integer,
          output_bytes integer default 0,
          duration_ms integer default 0
        );
      `);

      const tStart = 1790750000000;
      const tEnd = 1790750050000;

      db.exec(`
        INSERT INTO model_usage (id, session_id, model_id, started_at, completed_at, input_tokens, output_tokens, reasoning_tokens, cache_read_input_tokens, computed_total_tokens, tool_call_count)
        VALUES ('m1', 'sess_test_1', 'GLM-5.3-Flash', ${tStart}, ${tEnd}, 50000, 2500, 0, 42000, 52500, 4);

        INSERT INTO turn_usage (session_id, turn_id, started_at, tool_call_count, tool_error_count)
        VALUES ('sess_test_1', 'turn_1', ${tStart}, 4, 1);

        INSERT INTO tool_usage (id, session_id, tool_name, status, started_at, exit_code, output_bytes, duration_ms)
        VALUES
          ('t1', 'sess_test_1', 'Bash', 'completed', ${tStart + 1000}, 0, 1024, 150),
          ('t2', 'sess_test_1', 'Bash', 'completed', ${tStart + 2000}, 0, 2048, 200),
          ('t3', 'sess_test_1', 'Edit', 'error', ${tStart + 3000}, 1, 512, 80),
          ('t4', 'sess_test_1', 'Read', 'completed', ${tStart + 4000}, 0, 4096, 50);
      `);

      db.close();

      try {
        const record = await ZCodeTelemetryAdapter.probeSqlite({
          dbPath,
          startTime: tStart,
          endTime: tEnd,
          sessionId: 'sess_test_1',
        });

        assert.ok(record, 'Should return a valid SessionTelemetryRecord');
        assert.equal(record.source, 'zcode');
        assert.equal(record.model, 'GLM-5.3-Flash');
        assert.equal(record.tokens.inputTokens, 50000);
        assert.equal(record.tokens.outputTokens, 2500);
        assert.equal(record.tokens.cachedTokens, 42000);
        assert.equal(record.tokens.totalTokens, 52500);
        assert.ok(record.tokens.costUsd && record.tokens.costUsd > 0);
        assert.equal(record.turnsCount, 1);
        assert.equal(record.errorCount, 1);
        assert.equal(record.toolCalls.total, 4);
        assert.equal(record.toolCalls.byName['Bash'], 2);
        assert.equal(record.toolCalls.byName['Edit'], 1);
        assert.equal(record.toolCalls.byName['Read'], 1);

        assert.ok(Array.isArray(record.toolAttributions));
        assert.equal(record.toolAttributions.length, 3);
        const bashAttr = record.toolAttributions.find((t) => t.name === 'Bash');
        assert.ok(bashAttr);
        assert.equal(bashAttr.count, 2);
        assert.equal(bashAttr.errorCount, 0);
        assert.ok(bashAttr.percentage > 0);

        const editAttr = record.toolAttributions.find((t) => t.name === 'Edit');
        assert.ok(editAttr);
        assert.equal(editAttr.count, 1);
        assert.equal(editAttr.errorCount, 1);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('falls back to rollout JSONL when SQLite DB is not available or empty', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dp-zcode-rollout-'));
      const rolloutFile = join(tempDir, 'model-io-sess_fallback_1.jsonl');

      const mockIo = [
        JSON.stringify({
          type: 'model_io',
          sessionId: 'sess_fallback_1',
          startedAt: '2026-09-30T10:00:00.000Z',
          model: 'GLM-5.3',
          response: {
            usage: {
              prompt_tokens: 15000,
              completion_tokens: 800,
              total_tokens: 15800,
              prompt_tokens_details: { cached_tokens: 12000 },
            },
            toolCalls: [{ name: 'Bash' }, { name: 'Read' }],
          },
        }),
      ].join('\n');

      writeFileSync(rolloutFile, mockIo);

      try {
        const record = await ZCodeTelemetryAdapter.probeRolloutJsonl({
          rolloutDir: tempDir,
          sessionId: 'sess_fallback_1',
        });

        assert.ok(record, 'Should parse rollout JSONL fallback');
        assert.equal(record.source, 'zcode');
        assert.equal(record.model, 'GLM-5.3');
        assert.equal(record.tokens.inputTokens, 15000);
        assert.equal(record.tokens.outputTokens, 800);
        assert.equal(record.tokens.cachedTokens, 12000);
        assert.equal(record.tokens.totalTokens, 15800);
        assert.equal(record.toolCalls.total, 2);
        assert.equal(record.toolCalls.byName['Bash'], 1);
        assert.equal(record.toolCalls.byName['Read'], 1);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('resolveAgentTelemetry auto-selects ZCode when ZCode database is present within task time window', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dp-zcode-resolve-'));
      const dbPath = join(tempDir, 'db.sqlite');

      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath);

      db.exec(`
        CREATE TABLE model_usage (
          id text primary key,
          session_id text,
          model_id text,
          started_at integer,
          completed_at integer,
          input_tokens integer default 0,
          output_tokens integer default 0,
          reasoning_tokens integer default 0,
          cache_read_input_tokens integer default 0,
          computed_total_tokens integer default 0,
          tool_call_count integer default 0
        );
        CREATE TABLE turn_usage (
          session_id text,
          turn_id text,
          started_at integer,
          tool_call_count integer default 0,
          tool_error_count integer default 0
        );
      `);

      const tStart = 1790750000000;
      const tEnd = 1790750030000;

      db.exec(`
        INSERT INTO model_usage (id, session_id, model_id, started_at, completed_at, input_tokens, output_tokens, cache_read_input_tokens, computed_total_tokens, tool_call_count)
        VALUES ('m1', 'sess_task_auto', 'GLM-5.3-Flash', ${tStart}, ${tEnd}, 30000, 1200, 25000, 31200, 2);

        INSERT INTO turn_usage (session_id, turn_id, started_at, tool_call_count, tool_error_count)
        VALUES ('sess_task_auto', 'turn_1', ${tStart}, 2, 0);
      `);

      db.close();

      try {
        const record = await resolveAgentTelemetry({
          cwd: tempDir,
          taskId: 'T-ZCODE-AUTO',
          startedAt: new Date(tStart).toISOString(),
          completedAt: new Date(tEnd).toISOString(),
          zcodeDbPath: dbPath,
          state: { session_id: 'sess_task_auto' },
        });

        assert.ok(record);
        assert.equal(record.source, 'zcode');
        assert.equal(record.model, 'GLM-5.3-Flash');
        assert.equal(record.tokens.totalTokens, 31200);
        assert.equal(record.tokens.cachedTokens, 25000);
        assert.ok(record.complianceScore >= 0 && record.complianceScore <= 100);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('probes SQLite database with precise sessionId and turnId bounds (FR-1 / AC-1 & AC-2)', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dp-zcode-bounds-'));
      const dbPath = join(tempDir, 'db.sqlite');

      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath);

      db.exec(`
        CREATE TABLE model_usage (
          id text primary key,
          session_id text,
          model_id text,
          started_at integer,
          completed_at integer,
          input_tokens integer default 0,
          output_tokens integer default 0,
          reasoning_tokens integer default 0,
          cache_read_input_tokens integer default 0,
          computed_total_tokens integer default 0,
          tool_call_count integer default 0,
          status text default 'completed'
        );
        CREATE TABLE turn_usage (
          session_id text,
          turn_id text,
          started_at integer,
          tool_call_count integer default 0,
          tool_error_count integer default 0
        );
        CREATE TABLE tool_usage (
          id text primary key,
          session_id text,
          tool_name text,
          status text,
          started_at integer,
          exit_code integer,
          output_bytes integer default 0,
          duration_ms integer default 0
        );
      `);

      const t1 = 1790800000000;
      const t2 = 1790800010000;
      const t3 = 1790800020000;

      db.exec(`
        INSERT INTO model_usage (id, session_id, model_id, started_at, completed_at, input_tokens, output_tokens, cache_read_input_tokens, computed_total_tokens, tool_call_count)
        VALUES
          ('m1', 'sess_bound_A', 'GLM-5.3-Flash', ${t1}, ${t1 + 1000}, 10000, 500, 8000, 10500, 1),
          ('m2', 'sess_bound_A', 'GLM-5.3-Flash', ${t2}, ${t2 + 1000}, 20000, 1000, 15000, 21000, 2),
          ('m3', 'sess_bound_B', 'GLM-5.3-Flash', ${t3}, ${t3 + 1000}, 50000, 2000, 40000, 52000, 3);

        INSERT INTO turn_usage (session_id, turn_id, started_at, tool_call_count, tool_error_count)
        VALUES
          ('sess_bound_A', 'turn_1', ${t1}, 1, 0),
          ('sess_bound_A', 'turn_2', ${t2}, 2, 0),
          ('sess_bound_B', 'turn_1', ${t3}, 3, 0);
      `);

      db.close();

      try {
        // Query specifically sess_bound_A with turn_2 bounds
        const record = await ZCodeTelemetryAdapter.probeSqlite({
          dbPath,
          sessionId: 'sess_bound_A',
          startTurnId: 'turn_2',
          endTurnId: 'turn_2',
        });

        assert.ok(record);
        assert.equal(record.source, 'zcode');
        assert.equal(record.sessionId, 'sess_bound_A');
        assert.equal(record.turnsCount, 1);
        assert.equal(record.tokens.inputTokens, 20000);
        assert.equal(record.tokens.outputTokens, 1000);
        assert.equal(record.tokens.cachedTokens, 15000);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Triple Anchor Lifecycle Boundary Engine (FR-1 / AC-1 & AC-2)', () => {
    it('detects session ID from environment variables in priority order', async () => {
      const origEnv = { ...process.env };
      try {
        process.env.DOCPATH_SESSION = 'sess_from_docpath_env';
        process.env.SESSION_ID = 'sess_from_session_id';
        let detected = await detectCurrentSessionId();
        assert.equal(detected, 'sess_from_docpath_env');

        delete process.env.DOCPATH_SESSION;
        detected = await detectCurrentSessionId();
        assert.equal(detected, 'sess_from_session_id');

        delete process.env.SESSION_ID;
        process.env.GEMINI_CONVERSATION_ID = 'sess_gemini_123';
        detected = await detectCurrentSessionId();
        assert.equal(detected, 'sess_gemini_123');

        delete process.env.GEMINI_CONVERSATION_ID;
        process.env.ZCODE_SESSION_ID = 'sess_zcode_456';
        detected = await detectCurrentSessionId();
        assert.equal(detected, 'sess_zcode_456');
      } finally {
        process.env = origEnv;
      }
    });

    it('captures Git commit hash using captureGitCommit', () => {
      const commit = captureGitCommit(process.cwd());
      assert.ok(typeof commit === 'string' && commit.length >= 7, 'Should capture valid git commit hash');
    });

    it('filters Antigravity transcript by sessionId and turnId/step_index range', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          session_id: 'conv_1',
          type: 'USER_INPUT',
          content: 'First turn in conv 1',
        }),
        JSON.stringify({
          step_index: 2,
          session_id: 'conv_1',
          type: 'PLANNER_RESPONSE',
          thinking: 'Planning 1',
        }),
        JSON.stringify({
          step_index: 3,
          session_id: 'conv_2',
          type: 'USER_INPUT',
          content: 'First turn in conv 2',
        }),
        JSON.stringify({
          step_index: 4,
          session_id: 'conv_2',
          type: 'PLANNER_RESPONSE',
          thinking: 'Planning 2',
        }),
      ].join('\n');

      // Filter by session conv_1
      const conv1Result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent, {
        sessionId: 'conv_1',
      });
      assert.equal(conv1Result.turnsCount, 2);
      assert.equal(conv1Result.sessionId, 'conv_1');

      // Filter by step_index range 3 to 4
      const conv2StepResult = AntigravityTelemetryAdapter.parseTranscript(transcriptContent, {
        startTurnId: 3,
        endTurnId: 4,
      });
      assert.equal(conv2StepResult.turnsCount, 2);
      assert.equal(conv2StepResult.sessionId, 'conv_2');
    });

    it('propagates lifecycleAnchor in collectTaskMetrics and probeActiveTaskMetrics', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dp-anchor-test-'));
      const docpathDir = join(tempDir, '.docpath');
      mkdirSync(join(docpathDir, 'workspace'), { recursive: true });
      mkdirSync(join(docpathDir, 'tasks', 'current'), { recursive: true });

      const stateJson = {
        level: 2,
        workflow_profile: 'standard',
        state: 'executing',
        phase: 'executing',
        gate: 'none',
        task_id: 'T-ANCHOR-TEST',
        task_title: 'Test Anchor Task',
        current_step: 'S1',
        started_at: '2026-09-30T10:00:00.000Z',
        updated_at: '2026-09-30T10:05:00.000Z',
        base_commit: 'abc1234',
        session_id: 'sess_anchor_999',
      };
      writeFileSync(join(docpathDir, 'workspace', 'state.json'), JSON.stringify(stateJson, null, 2));

      try {
        const active = await probeActiveTaskMetrics(tempDir);
        assert.ok(active);
        assert.ok(active.lifecycleAnchor);
        assert.equal(active.lifecycleAnchor.baseCommit, 'abc1234');
        assert.equal(active.lifecycleAnchor.sessionId, 'sess_anchor_999');
        assert.equal(active.lifecycleAnchor.startedAt, '2026-09-30T10:00:00.000Z');

        const collected = await collectTaskMetrics(tempDir, 'T-ANCHOR-TEST', new Date('2026-09-30T10:10:00.000Z'));
        assert.ok(collected);
        assert.ok(collected.lifecycleAnchor);
        assert.equal(collected.lifecycleAnchor.baseCommit, 'abc1234');
        assert.equal(collected.lifecycleAnchor.sessionId, 'sess_anchor_999');
        assert.equal(collected.lifecycleAnchor.startedAt, '2026-09-30T10:00:00.000Z');
        assert.equal(collected.lifecycleAnchor.completedAt, '2026-09-30T10:10:00.000Z');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Real Cumulative Token Aggregation & Multi-turn Step Slices (FR-1 / AC-1)', () => {
    it('aggregates multi-turn explicit model usage in Antigravity transcript', () => {
      const transcriptContent = [
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          usage: {
            prompt_tokens: 12000,
            completion_tokens: 450,
            total_tokens: 12450,
            prompt_tokens_details: { cached_tokens: 8000 },
          },
          tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/src/a.ts' } }],
        }),
        JSON.stringify({
          step_index: 2,
          source: 'MODEL',
          type: 'VIEW_FILE',
          content: 'file contents',
        }),
        JSON.stringify({
          step_index: 3,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          usage: {
            input_tokens: 18000,
            output_tokens: 950,
            total_tokens: 18950,
            cached_tokens: 14000,
          },
          tool_calls: [{ name: 'replace_file_content', args: { TargetFile: '/src/a.ts' } }],
        }),
      ].join('\n');

      const result = AntigravityTelemetryAdapter.parseTranscript(transcriptContent);

      assert.equal(result.tokens.inputTokens, 30000);
      assert.equal(result.tokens.outputTokens, 1400);
      assert.equal(result.tokens.cachedTokens, 22000);
      assert.equal(result.tokens.totalTokens, 31400);
      assert.ok(result.tokens.costUsd && result.tokens.costUsd > 0);
    });

    it('extracts multi-turn step slices with accurate cumulative tokens and cost per step window', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'dp-step-slices-'));
      const docpathDir = join(tempDir, '.docpath');
      mkdirSync(join(docpathDir, 'workspace'), { recursive: true });
      mkdirSync(join(docpathDir, 'tasks', 'T-SLICE-TEST'), { recursive: true });

      const dbPath = join(tempDir, 'db.sqlite');
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath);

      db.exec(`
        CREATE TABLE model_usage (
          id text primary key,
          session_id text,
          model_id text,
          started_at integer,
          completed_at integer,
          input_tokens integer default 0,
          output_tokens integer default 0,
          reasoning_tokens integer default 0,
          cache_read_input_tokens integer default 0,
          computed_total_tokens integer default 0,
          tool_call_count integer default 0,
          status text default 'completed'
        );
        CREATE TABLE turn_usage (
          session_id text,
          turn_id text,
          started_at integer,
          tool_call_count integer default 0,
          tool_error_count integer default 0
        );
        CREATE TABLE tool_usage (
          id text primary key,
          session_id text,
          tool_name text,
          status text,
          started_at integer,
          exit_code integer,
          output_bytes integer default 0,
          duration_ms integer default 0
        );
      `);

      const tS1Start = 1790900000000;
      const tS1End = 1790900010000;
      const tS2Start = 1790900011000;
      const tS2End = 1790900020000;

      db.exec(`
        INSERT INTO model_usage (id, session_id, model_id, started_at, completed_at, input_tokens, output_tokens, cache_read_input_tokens, computed_total_tokens, tool_call_count)
        VALUES
          ('m1', 'sess_slice_1', 'GLM-5.3', ${tS1Start}, ${tS1End}, 10000, 500, 8000, 10500, 1),
          ('m2', 'sess_slice_1', 'GLM-5.3', ${tS2Start}, ${tS2End}, 25000, 1200, 20000, 26200, 2);

        INSERT INTO turn_usage (session_id, turn_id, started_at, tool_call_count, tool_error_count)
        VALUES
          ('sess_slice_1', 'turn_1', ${tS1Start}, 1, 0),
          ('sess_slice_1', 'turn_2', ${tS2Start}, 2, 0);

        INSERT INTO tool_usage (id, session_id, tool_name, status, started_at, exit_code, output_bytes, duration_ms)
        VALUES
          ('t1', 'sess_slice_1', 'Read', 'completed', ${tS1Start + 1000}, 0, 512, 50),
          ('t2', 'sess_slice_1', 'Edit', 'completed', ${tS2Start + 1000}, 0, 1024, 100),
          ('t3', 'sess_slice_1', 'Bash', 'completed', ${tS2Start + 2000}, 0, 2048, 150);
      `);
      db.close();

      const planJson = {
        steps: [
          { id: 'S1', title: 'Step 1: Setup', status: 'done' },
          { id: 'S2', title: 'Step 2: Implementation', status: 'done' },
        ],
      };

      const breadcrumbLines = [
        JSON.stringify({
          timestamp: new Date(tS1Start).toISOString(),
          step: 'S1',
          status: 'started',
          turnId: 'turn_1',
        }),
        JSON.stringify({
          timestamp: new Date(tS1End).toISOString(),
          step: 'S1',
          status: 'done',
          turnId: 'turn_1',
        }),
        JSON.stringify({
          timestamp: new Date(tS2Start).toISOString(),
          step: 'S2',
          status: 'started',
          turnId: 'turn_2',
        }),
        JSON.stringify({
          timestamp: new Date(tS2End).toISOString(),
          step: 'S2',
          status: 'done',
          turnId: 'turn_2',
        }),
      ].join('\n');

      writeFileSync(join(docpathDir, 'tasks', 'T-SLICE-TEST', 'plan.json'), JSON.stringify(planJson, null, 2));
      writeFileSync(join(docpathDir, 'tasks', 'T-SLICE-TEST', 'breadcrumb.jsonl'), breadcrumbLines);

      try {
        const slices = await extractStepTelemetrySlices(tempDir, 'T-SLICE-TEST', {
          plan: planJson,
          sessionId: 'sess_slice_1',
          zcodeDbPath: dbPath,
        });

        assert.equal(slices.length, 2);

        // Step S1 Slice verification
        const s1 = slices[0];
        assert.equal(s1.stepId, 'S1');
        assert.equal(s1.stepTitle, 'Step 1: Setup');
        assert.equal(s1.inputTokens, 10000);
        assert.equal(s1.outputTokens, 500);
        assert.equal(s1.cachedTokens, 8000);
        assert.equal(s1.totalTokens, 10500);
        assert.ok(s1.costUsd && s1.costUsd > 0);
        assert.equal(s1.toolCallsCount, 1);

        // Step S2 Slice verification
        const s2 = slices[1];
        assert.equal(s2.stepId, 'S2');
        assert.equal(s2.stepTitle, 'Step 2: Implementation');
        assert.equal(s2.inputTokens, 25000);
        assert.equal(s2.outputTokens, 1200);
        assert.equal(s2.cachedTokens, 20000);
        assert.equal(s2.totalTokens, 26200);
        assert.ok(s2.costUsd && s2.costUsd > 0);
        assert.equal(s2.toolCallsCount, 2);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
