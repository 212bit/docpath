/**
 * Topic synonyms baseline tests
 * 
 * 验证同义词映射功能：
 * 1. 英文 query 能命中中文文档
 * 2. 中文 query 能命中英文文档
 * 3. 同义词扩展后匹配准确率提升
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000 }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: error.stdout || '',
      err: error.stderr || '',
    };
  }
}

function setupWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'docpath-topic-test-'));
  const docpath = join(cwd, '.docpath');
  
  // 初始化基本结构
  mkdirSync(join(docpath, 'workspace'), { recursive: true });
  mkdirSync(join(docpath, 'spec'), { recursive: true });
  mkdirSync(join(docpath, 'tasks', 'current'), { recursive: true });
  
  // 写入 config
  writeFileSync(join(docpath, 'config.yaml'), `project:
  name: topic-test
  type: node
`);
  
  // 写入 state
  writeFileSync(join(docpath, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-TEST',
    task_title: 'Topic Test',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }));
  
  // 写入 current.md
  writeFileSync(join(docpath, 'workspace', 'current.md'), '# Current\n');
  
  // 写入 breadcrumb
  writeFileSync(join(docpath, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-TEST] — 2026-06-01T00:00:00.000Z',
    '',
    '- **状态**: done',
    '',
  ].join('\n'));
  
  // 写入任务文件
  writeFileSync(join(docpath, 'tasks', 'current', 'spec.md'), [
    '# T-TEST - Topic Test',
    '',
    '## 1. 背景与动机',
    '',
    '测试主题检索功能。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: 支持中英文主题检索',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: memory 和 记忆 都能命中',
    '',
  ].join('\n'));
  
  writeFileSync(join(docpath, 'tasks', 'current', 'plan.md'), [
    '## 执行计划',
    '',
    '### S1: 实现同义词映射',
    '- [x] S1: 实现同义词映射',
    '- **描述**: 添加主题同义词支持',
    '- **验收条件**: 测试通过',
    '- **依赖**: 无',
    '',
  ].join('\n'));
  
  // 写入 docs-index.json（模拟已有索引）
  writeFileSync(join(docpath, 'docs-index.json'), JSON.stringify({
    version: 1,
    generated_at: '2026-06-01T00:00:00.000Z',
    entries: [
      {
        path: 'workspace/state.json',
        type: 'runtime',
        kind: 'state',
        scope: 'workspace',
        level: '0',
        title: 'Runtime State',
        summary: '当前运行时状态',
        updated_at: '2026-06-01T00:00:00.000Z',
        size: 200,
        token_estimate: 50,
        default_read: true,
        archive: false,
        topic_tags: ['state', 'runtime', '状态'],
      },
      {
        path: 'rules/architecture.md',
        type: 'rule',
        kind: 'architecture',
        scope: 'global',
        level: '2',
        title: '架构规范',
        summary: '项目架构设计原则和记忆层说明',
        updated_at: '2026-06-01T00:00:00.000Z',
        size: 5000,
        token_estimate: 1200,
        default_read: false,
        archive: false,
        topic_tags: ['architecture', '架构', 'memory', '记忆', 'knowledge'],
      },
      {
        path: 'journal/lessons/T-EXAMPLE.md',
        type: 'lesson',
        kind: 'retrospective',
        scope: 'task',
        level: '3',
        title: '知识沉淀示例',
        summary: '关于记忆层优化的经验总结',
        updated_at: '2026-06-01T00:00:00.000Z',
        size: 3000,
        token_estimate: 800,
        default_read: false,
        archive: true,
        task_id: 'T-EXAMPLE',
        topic_tags: ['memory', '记忆', 'optimization', '优化', 'context'],
      },
    ],
  }, null, 2));
  
  return cwd;
}

// ── Tests ──

console.log('Running topic synonyms baseline tests...\n');

// Test 1: 基线 - 英文 "memory" 应该无法命中中文文档（优化前）
{
  console.log('Test 1: Baseline - English "memory" query before optimization');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic memory --level 2`, cwd);
  
  // 优化前：可能返回 0 条或很少的匹配
  const matchCount = (result.out.match(/- path:/g) || []).length;
  console.log(`  Matched documents: ${matchCount}`);
  console.log(`  Exit code: ${result.code}`);
  
  // 记录基线数据
  console.log(`  ✓ Baseline recorded: ${matchCount} matches for "memory"\n`);
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 2: 基线 - 中文 "记忆" 应该能命中相关文档
{
  console.log('Test 2: Baseline - Chinese "记忆" query');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic 记忆 --level 2`, cwd);
  
  const matchCount = (result.out.match(/- path:/g) || []).length;
  console.log(`  Matched documents: ${matchCount}`);
  console.log(`  Exit code: ${result.code}`);
  
  // 应该至少命中 1 条（rules/architecture.md 或 journal）
  assert.ok(matchCount >= 1, 'Chinese query "记忆" should match at least 1 document');
  console.log(`  ✓ Chinese query works: ${matchCount} matches\n`);
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 3: 验证 context 命令的行为
{
  console.log('Test 3: Context command with topic filter');
  const cwd = setupWorkspace();
  
  const result = run(`context --cwd ${cwd} --topic memory --max-tokens 5000`, cwd);
  
  console.log(`  Exit code: ${result.code}`);
  console.log(`  Output length: ${result.out.length} chars`);
  
  // 检查是否包含任何文档内容
  const hasContent = result.out.includes('path:') || result.out.includes('title:');
  console.log(`  Has content: ${hasContent}`);
  console.log(`  ✓ Context command executed\n`);
  
  rmSync(cwd, { recursive: true, force: true });
}

console.log('Baseline tests completed.\n');
console.log('Next step: Implement topic synonyms and verify improvement.');
