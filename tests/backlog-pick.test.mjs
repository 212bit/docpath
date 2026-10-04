import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-pick-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-pick-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-PICK-TEST',
    task_title: 'Backlog Pick Test',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  return cwd;
}

function run(args, cwd) {
  const parsedArgs = typeof args === 'string'
    ? args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''))
    : args;
  return execFileSync('node', [BIN, ...parsedArgs], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  }).trim();
}

describe('backlog dashboard and pick/next intelligent routing', () => {
  it('renders rich dashboard when backlog is invoked with zero arguments', () => {
    const cwd = mkWorkspace();

    // 1. Add some items
    run('backlog add --title "基础核心引擎" --priority P0 --level 2 --background "核心引擎" --acceptance "通过" --readiness confirmed', cwd);
    run('backlog add --title "上层应用服务" --priority P1 --level 1 --background "上层服务" --acceptance "通过" --readiness confirmed --depends-on R-001', cwd);

    // 2. Call zero args backlog
    const output = run(['backlog'], cwd);
    assert.match(output, /Backlog 需求全景看板/);
    assert.match(output, /活跃进行中: 2/);
    assert.match(output, /P0: 1/);
    assert.match(output, /智能选单推荐/);
    assert.match(output, /R-001/);
    assert.match(output, /docpath start R-001/);
  });

  it('calculates impact factor and ranks ready items accurately via backlog pick', () => {
    const cwd = mkWorkspace();

    // Item 1: standalone P1
    run('backlog add --title "独立小功能" --priority P1 --level 1 --background "独立" --acceptance "通过" --readiness confirmed', cwd); // R-001
    // Item 2: Hub P1 that blocks R-003 and R-004
    run('backlog add --title "核心底座枢纽" --priority P1 --level 2 --background "核心底座" --acceptance "通过" --readiness confirmed', cwd); // R-002
    run('backlog add --title "下游服务 A" --priority P2 --level 1 --background "下游A" --acceptance "通过" --readiness confirmed --depends-on R-002', cwd); // R-003
    run('backlog add --title "下游服务 B" --priority P2 --level 1 --background "下游B" --acceptance "通过" --readiness confirmed --depends-on R-002', cwd); // R-004

    // R-002 should rank higher than R-001 because it unblocks 2 downstream items and is head of critical path
    const textOutput = run('backlog pick', cwd);
    assert.match(textOutput, /关键依赖链/);
    assert.match(textOutput, /\[1\] 🟠 \[P1\] R-002: 核心底座枢纽/);

    // Test JSON output
    const jsonOutput = run('backlog pick --json', cwd);
    const parsed = JSON.parse(jsonOutput);
    assert.equal(parsed.readyCount, 2);
    assert.equal(parsed.rankedReadyItems[0].id, 'R-002');
    assert.ok(parsed.rankedReadyItems[0].score > parsed.rankedReadyItems[1].score);
    assert.equal(parsed.rankedReadyItems[0].directUnblockCount, 2);
    assert.equal(parsed.rankedReadyItems[1].id, 'R-001');

    // Test Agent YAML output
    const yamlOutput = run('backlog pick --agent', cwd);
    const agentParsed = parse(yamlOutput);
    assert.equal(agentParsed.agent_view, 'backlog_pick');
    assert.equal(agentParsed.ready_count, 2);
    assert.equal(agentParsed.recommendations[0].id, 'R-002');
    assert.match(agentParsed.recommended_command, /docpath start R-002/);
  });

  it('filters ready items by milestone via backlog pick --milestone', () => {
    const cwd = mkWorkspace();

    // 1. Add items, some bound to M-001, some to M-002
    run('backlog add --title "Milestone 1 基础模块" --priority P1 --level 1 --background "M1基础" --acceptance "通过" --readiness confirmed --milestone M-001', cwd); // R-001
    run('backlog add --title "Milestone 2 独立模块" --priority P0 --level 1 --background "M2独立" --acceptance "通过" --readiness confirmed --milestone M-002', cwd); // R-002
    run('backlog add --title "Milestone 1 进阶模块" --priority P2 --level 1 --background "M1进阶" --acceptance "通过" --readiness confirmed --milestone M-001 --depends-on R-001', cwd); // R-003

    // 2. Pick within M-001
    const textOutput = run('backlog pick --milestone M-001', cwd);
    assert.match(textOutput, /\[里程碑: M-001\]/);
    assert.match(textOutput, /R-001: Milestone 1 基础模块/);
    assert.doesNotMatch(textOutput, /R-002/);

    // 3. Pick within M-001 with --agent
    const yamlOutput = run('backlog pick --milestone M-001 --agent', cwd);
    const agentParsed = parse(yamlOutput);
    assert.equal(agentParsed.agent_view, 'backlog_pick');
    assert.equal(agentParsed.milestone, 'M-001');
    assert.equal(agentParsed.ready_count, 1);
    assert.equal(agentParsed.recommendations[0].id, 'R-001');
    assert.match(agentParsed.recommended_command, /docpath start R-001/);

    // 4. Pick within M-002
    const m2Output = run('backlog pick --milestone M-002 --json', cwd);
    const m2Parsed = JSON.parse(m2Output);
    assert.equal(m2Parsed.milestone, 'M-002');
    assert.equal(m2Parsed.readyCount, 1);
    assert.equal(m2Parsed.rankedReadyItems[0].id, 'R-002');
  });
});
