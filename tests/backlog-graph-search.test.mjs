import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-graph-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-graph-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-GRAPH-TEST',
    task_title: 'Backlog Graph Test',
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

function findItemContent(cwd, id) {
  const backlogDir = join(cwd, '.docpath', 'backlog');
  const file = readdirSync(backlogDir).find((f) => f === `${id}.md` || f.startsWith(`${id}-`));
  if (!file) throw new Error(`File for ${id} not found in ${backlogDir}`);
  return readFileSync(join(backlogDir, file), 'utf-8');
}

describe('backlog dependency graph & full-text search', () => {
  it('supports parent, depends_on, and blocks links during backlog add & edit', () => {
    const cwd = mkWorkspace();

    // 1. Add base item
    run('backlog add --title "基础架构组件" --priority P1 --level 1 --background "基础设施" --acceptance "通过" --readiness confirmed', cwd);

    // 2. Add dependent item with parent and depends_on
    run('backlog add --title "衍生业务模块" --priority P2 --level 2 --background "业务模块" --acceptance "通过" --readiness confirmed --parent R-001 --depends-on R-001', cwd);

    // 3. Add blocker item with blocks
    run('backlog add --title "先驱前置任务" --priority P0 --level 1 --background "前置" --acceptance "通过" --readiness confirmed --blocks R-001', cwd);

    // Read item files to verify links
    const item1 = findItemContent(cwd, 'R-001');
    const item2 = findItemContent(cwd, 'R-002');
    const item3 = findItemContent(cwd, 'R-003');

    assert.match(item2, /parent: R-001/);
    assert.match(item2, /depends_on:\s+- R-001/);
    assert.match(item3, /blocks:\s+- R-001/);

    // 4. Edit item
    run('backlog edit R-001 --depends-on R-003', cwd);
    const item1Edited = findItemContent(cwd, 'R-001');
    assert.match(item1Edited, /depends_on:\s+- R-003/);
  });

  it('generates ASCII dependency graph with execution layers and blocked indicators', () => {
    const cwd = mkWorkspace();

    run('backlog add --title "数据库重构" --priority P0 --level 2 --background "底座" --acceptance "完成" --readiness confirmed', cwd);
    run('backlog add --title "用户服务迁移" --priority P1 --level 2 --background "服务" --acceptance "完成" --readiness confirmed --depends-on R-001', cwd);
    run('backlog add --title "前端页面适配" --priority P2 --level 1 --background "UI" --acceptance "完成" --readiness confirmed --depends-on R-002', cwd);

    const graphOut = run('backlog graph', cwd);
    assert.match(graphOut, /=== Backlog 拓扑执行分层/);
    assert.match(graphOut, /\[Layer 1\]/);
    assert.match(graphOut, /R-001.*\[就绪\]/);
    assert.match(graphOut, /\[Layer 2\]/);
    assert.match(graphOut, /R-002.*\[阻塞: 依赖 R-001\]/);
    assert.match(graphOut, /\[Layer 3\]/);
    assert.match(graphOut, /R-003.*\[阻塞: 依赖 R-002\]/);
  });

  it('detects circular dependencies in backlog graph', () => {
    const cwd = mkWorkspace();

    run('backlog add --title "任务A" --priority P1 --level 1 --background "A" --acceptance "A" --readiness confirmed --depends-on R-002', cwd);
    run('backlog add --title "任务B" --priority P1 --level 1 --background "B" --acceptance "B" --readiness confirmed --depends-on R-001', cwd);

    const graphOut = run('backlog graph', cwd);
    assert.match(graphOut, /⚠️  检测到循环依赖/);
    assert.match(graphOut, /R-001 -> R-002 -> R-001/);
  });

  it('outputs Mermaid graph and Agent/JSON formats', () => {
    const cwd = mkWorkspace();

    run('backlog add --title "架构设计" --priority P0 --level 1 --background "架构" --acceptance "通过" --readiness confirmed', cwd);
    run('backlog add --title "核心编码" --priority P1 --level 2 --background "编码" --acceptance "通过" --readiness confirmed --depends-on R-001', cwd);

    // Mermaid
    const mermaidOut = run('backlog graph --mermaid', cwd);
    assert.match(mermaidOut, /```mermaid/);
    assert.match(mermaidOut, /flowchart TD/);
    assert.match(mermaidOut, /R_001\["R-001: 架构设计 \(proposed\)"\]/);
    assert.match(mermaidOut, /R_001 --> R_002/);

    // JSON
    const jsonOut = run('backlog graph --json', cwd);
    const parsedJson = JSON.parse(jsonOut);
    assert.equal(parsedJson.readyItems.length, 1);
    assert.equal(parsedJson.readyItems[0], 'R-001');
    assert.equal(parsedJson.blockedItems.length, 1);
    assert.equal(parsedJson.blockedItems[0], 'R-002');

    // Agent YAML
    const agentOut = run('backlog graph --agent', cwd);
    const parsedAgent = parse(agentOut);
    assert.equal(parsedAgent.total_nodes, 2);
    assert.deepEqual(parsedAgent.ready_items, ['R-001']);
    assert.deepEqual(parsedAgent.blocked_items, ['R-002']);
  });

  it('performs full-text multi-keyword search with score ranking and filters', () => {
    const cwd = mkWorkspace();

    run('backlog add --title "优化 Python 解释器启动速度" --priority P1 --level 2 --background "解释器性能瓶颈" --acceptance "启动时间降低50%" --readiness confirmed', cwd);
    run('backlog add --title "优化 Rust 编译缓存" --priority P2 --level 1 --background "sccache 缓存机制" --acceptance "构建时间缩短" --readiness confirmed', cwd);
    run('backlog add --title "优化 Python 数据分析管道" --priority P0 --level 3 --background "Pandas 内存优化" --acceptance "内存减半" --readiness confirmed --depends-on R-001', cwd);

    // 1. Search with keyword "Python"
    const searchPython = run('backlog search Python', cwd);
    assert.match(searchPython, /Backlog 检索结果 \(共 2 条\)/);
    assert.match(searchPython, /R-001/);
    assert.match(searchPython, /R-003/);
    assert.doesNotMatch(searchPython, /R-002/);

    // 2. Search ready-only / unblocked
    const searchReady = run('backlog search Python --ready-only', cwd);
    assert.match(searchReady, /Backlog 检索结果 \(共 1 条\)/);
    assert.match(searchReady, /R-001/);
    assert.doesNotMatch(searchReady, /R-003/);

    // 3. Search with priority filter
    const searchP0 = run('backlog search --priority P0', cwd);
    assert.match(searchP0, /R-003/);
    assert.doesNotMatch(searchP0, /优化 Python 解释器启动速度/);

    // 4. Search agent and json format
    const searchAgent = run('backlog search Python --agent', cwd);
    const parsedAgent = parse(searchAgent);
    assert.equal(parsedAgent.count, 2);
    assert.equal(parsedAgent.results[0].id, 'R-001');

    const searchJson = run('backlog search Python --json', cwd);
    const parsedJson = JSON.parse(searchJson);
    assert.equal(parsedJson.count, 2);
    assert.equal(parsedJson.results[0].item.id, 'R-001');
  });
});
