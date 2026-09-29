import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractFunctionalRequirements, splitCompoundRequirements } from '../dist/commands/backlog.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const argList = Array.isArray(args) ? args : args.split(/\s+/);
  const res = spawnSync('node', [BIN, ...argList], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Command failed: node ${BIN} ${argList.join(' ')}\n\nstdout:\n${res.stdout}\n\nstderr:\n${res.stderr}`);
  }
  return (res.stdout || '') + (res.stderr || '');
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-enhance-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: enhance-test\n');

  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

describe('Workflow Enhancements: S1 ~ S4', () => {
  it('S1: start 命令在多步骤任务下输出执行计划全景拓扑与认领提示', () => {
    const cwd = mkRepo();
    try {
      const out = run(['start', 'feat(core): ① 模块A ② 模块B ③ 模块C', '--draft'], cwd);
      assert.match(out, /📋\s+执行计划已生成 \(共 3 步\):/);
      assert.match(out, /👉 S1:.+\(当前认领\)/);
      assert.match(out, /S2:/);
      assert.match(out, /S3:/);
      assert.match(out, /💡\s+提示: 当前步骤完成后运行 docpath step-pass 自动接力推进下一步。/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('S2: step-pass --commit 在非终步时输出延期提示', () => {
    const cwd = mkRepo();
    try {
      run(['start', 'feat(core): 模块A + 模块B', '--draft'], cwd);
      const out = run(['step-pass', '--commit', '--skip-verify'], cwd);
      assert.match(out, /ℹ️\s+检测到后续仍有 1 个未完成步骤，--commit \/ --done 将在终步收口时原子触发。/);
      assert.match(out, /✅\s+step-pass: S1 已完成/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('S3: Level >= 2 任务在 step-pass 交接时触发单步架构守卫', () => {
    const cwd = mkRepo();
    try {
      run(['start', 'feat(core): 模块A + 模块B', '--draft'], cwd);
      // 模拟创建违反架构分层的逆向引用
      mkdirSync(join(cwd, 'src', 'utils'), { recursive: true });
      mkdirSync(join(cwd, 'src', 'commands'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'commands', 'foo.ts'), 'export const cmd = 1;\n');
      writeFileSync(join(cwd, 'src', 'utils', 'bad.ts'), 'import { cmd } from "../commands/foo.js";\nexport const u = cmd;\n');

      const out = run(['step-pass', '--skip-verify', '--accept-dirty', 'test arch guard'], cwd);
      assert.match(out, /⚠️\s+\[架构守卫\] 步骤 S1 引入了架构违规/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('S4: extractFunctionalRequirements 与 splitCompoundRequirements 支持序号与分号拆分', () => {
    // 1. ① ② ③ 序号
    const items1 = splitCompoundRequirements('① 启动全景 ② commit延期提示 ③ 单步arch守卫');
    assert.deepEqual(items1, ['启动全景', 'commit延期提示', '单步arch守卫']);

    // 2. (1) (2) / （1）（2）序号
    const items2 = splitCompoundRequirements('(1) 启动全景 (2) 延期提示 (3) arch守卫');
    assert.deepEqual(items2, ['启动全景', '延期提示', 'arch守卫']);

    const items2b = splitCompoundRequirements('（1）启动全景（2）延期提示');
    assert.deepEqual(items2b, ['启动全景', '延期提示']);

    // 3. [1] [2] 序号
    const items3 = splitCompoundRequirements('[1] 启动全景 [2] 延期提示');
    assert.deepEqual(items3, ['启动全景', '延期提示']);

    // 4. 1. xxx 2. yyy 序号
    const items4 = splitCompoundRequirements('1. 启动全景 2. 延期提示 3. arch守卫');
    assert.deepEqual(items4, ['启动全景', '延期提示', 'arch守卫']);

    // 5. 中英文分号分割
    const items5a = splitCompoundRequirements('启动全景; 延期提示; arch守卫');
    assert.deepEqual(items5a, ['启动全景', '延期提示', 'arch守卫']);

    const items5b = splitCompoundRequirements('启动全景；延期提示；arch守卫');
    assert.deepEqual(items5b, ['启动全景', '延期提示', 'arch守卫']);

    // 6. extractFunctionalRequirements 端到端
    const mockBacklog = {
      id: 'R-999',
      title: 'feat: (1) 模块A (2) 模块B (3) 模块C',
      body: '## 背景\n\n- 需求描述\n\n## 验收\n\n- 通过测试',
      level: 2,
    };
    const frs = extractFunctionalRequirements(mockBacklog);
    assert.equal(frs.length, 3);
    assert.equal(frs[0].id, 'FR-1');
    assert.equal(frs[0].text, '模块A');
    assert.equal(frs[1].id, 'FR-2');
    assert.equal(frs[1].text, '模块B');
    assert.equal(frs[2].id, 'FR-3');
    assert.equal(frs[2].text, '模块C');
  });
});
