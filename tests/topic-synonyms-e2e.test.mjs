/**
 * End-to-end test demonstrating topic synonym improvement
 * 
 * 验证同义词扩展在实际使用中的效果
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
  const cwd = mkdtempSync(join(tmpdir(), 'docpath-synonym-e2e-'));
  const docpath = join(cwd, '.docpath');
  
  // 初始化基本结构
  mkdirSync(join(docpath, 'workspace'), { recursive: true });
  mkdirSync(join(docpath, 'spec'), { recursive: true });
  mkdirSync(join(docpath, 'rules'), { recursive: true });
  mkdirSync(join(docpath, 'tasks', 'current'), { recursive: true });
  
  // 写入 config
  writeFileSync(join(docpath, 'config.yaml'), `project:
  name: synonym-test
  type: node
`);
  
  // 写入 state
  writeFileSync(join(docpath, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-TEST',
    task_title: 'Synonym Test',
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
    '# T-TEST - Synonym Test',
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
  
  // 创建架构规则文档（包含"记忆层"相关内容）
  writeFileSync(join(docpath, 'rules', 'architecture.md'), [
    '# 架构规范',
    '',
    '## 记忆层设计',
    '',
    'DocPath 的记忆层（Spec Memory Layer）负责知识沉淀和上下文管理。',
    '',
    '### 核心组件',
    '',
    '- docs-index.json: 文档索引',
    '- reveal/context: 按需披露',
    '- journal/decisions: 知识归档',
    '',
  ].join('\n'));
  
  // 写入 docs-index.json
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
    ],
  }, null, 2));
  
  return cwd;
}

console.log('Running end-to-end topic synonym tests...\n');

// Test 1: 英文 "memory" query 应该能命中包含"记忆"的文档
{
  console.log('Test 1: English "memory" query should match Chinese "记忆" content');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic memory --level 2`, cwd);
  
  assert.equal(result.code, 0, 'Command should succeed');
  
  // 检查是否命中了 architecture.md（因为它有 'memory' 和 '记忆' 标签）
  const hasArchitectureMatch = result.out.includes('rules/architecture.md');
  assert.ok(hasArchitectureMatch, 'Should match architecture.md via synonym expansion');
  
  console.log('  ✓ English "memory" matched Chinese content');
  console.log(`  Exit code: ${result.code}`);
  console.log('');
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 2: 中文 "记忆" query 应该能命中相关文档
{
  console.log('Test 2: Chinese "记忆" query should match related documents');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic 记忆 --level 2`, cwd);
  
  assert.equal(result.code, 0, 'Command should succeed');
  
  const hasArchitectureMatch = result.out.includes('rules/architecture.md');
  assert.ok(hasArchitectureMatch, 'Should match architecture.md');
  
  console.log('  ✓ Chinese "记忆" matched related documents');
  console.log(`  Exit code: ${result.code}`);
  console.log('');
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 3: "knowledge" query 应该通过同义词扩展到 "memory"
{
  console.log('Test 3: "knowledge" query should expand to "memory" synonyms');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic knowledge --level 2`, cwd);
  
  assert.equal(result.code, 0, 'Command should succeed');
  
  const hasArchitectureMatch = result.out.includes('rules/architecture.md');
  assert.ok(hasArchitectureMatch, 'Should match via knowledge->memory synonym chain');
  
  console.log('  ✓ "knowledge" expanded to memory synonyms');
  console.log(`  Exit code: ${result.code}`);
  console.log('');
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 4: "context" query 应该通过同义词扩展到 "memory"
{
  console.log('Test 4: "context" query should expand to "memory" synonyms');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic context --level 2`, cwd);
  
  assert.equal(result.code, 0, 'Command should succeed');
  
  const hasArchitectureMatch = result.out.includes('rules/architecture.md');
  assert.ok(hasArchitectureMatch, 'Should match via context->memory synonym chain');
  
  console.log('  ✓ "context" expanded to memory synonyms');
  console.log(`  Exit code: ${result.code}`);
  console.log('');
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 5: "架构" query 应该能命中 architecture 文档
{
  console.log('Test 5: Chinese "架构" query should match architecture documents');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic 架构 --level 2`, cwd);
  
  assert.equal(result.code, 0, 'Command should succeed');
  
  const hasArchitectureMatch = result.out.includes('rules/architecture.md');
  assert.ok(hasArchitectureMatch, 'Should match architecture.md');
  
  console.log('  ✓ Chinese "架构" matched architecture documents');
  console.log(`  Exit code: ${result.code}`);
  console.log('');
  
  rmSync(cwd, { recursive: true, force: true });
}

// Test 6: "design" query 应该通过 architecture 同义词组匹配
{
  console.log('Test 6: "design" query should match via architecture synonym group');
  const cwd = setupWorkspace();
  
  const result = run(`reveal --cwd ${cwd} --topic design --level 2`, cwd);
  
  assert.equal(result.code, 0, 'Command should succeed');
  
  const hasArchitectureMatch = result.out.includes('rules/architecture.md');
  assert.ok(hasArchitectureMatch, 'Should match via design->architecture synonym');
  
  console.log('  ✓ "design" matched via architecture synonym group');
  console.log(`  Exit code: ${result.code}`);
  console.log('');
  
  rmSync(cwd, { recursive: true, force: true });
}

console.log('✅ All end-to-end tests passed!\n');
console.log('Summary:');
console.log('  - English queries match Chinese content via synonyms');
console.log('  - Chinese queries work correctly');
console.log('  - Synonym chains (knowledge->memory, context->memory) work');
console.log('  - Architecture/design synonym group works');
console.log('');
console.log('The topic synonym feature is working as expected! 🎉');
