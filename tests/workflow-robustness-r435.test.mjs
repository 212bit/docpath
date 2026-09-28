import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { renderDraftPlan } from '../dist/commands/plan.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Workflow Robustness & Multi-FR Splitting (R-435)', () => {
  it('splits complex titles with dashes into multiple FRs on start/promote', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-robust-fr-'));
    try {
      execSync(`node "${BIN}" init --cwd "${cwd}"`, { stdio: 'ignore' });
      // start with complex title containing em-dash
      execSync(`node "${BIN}" start "HTTP C2 通信流程重构 — 参考 Sliver 实现" --draft --cwd "${cwd}"`, {
        stdio: 'ignore',
      });
      const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
      assert.match(spec, /FR-1:\s*HTTP C2 通信流程重构/);
      assert.match(spec, /FR-2:\s*参考 Sliver 实现/);

      const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
      assert.match(plan, /S1:\s*实现并验证 FR-1/);
      assert.match(plan, /S2:\s*实现并验证 FR-2/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('splits titles with compound conjunctions into multiple FRs', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-robust-fr2-'));
    try {
      execSync(`node "${BIN}" init --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" start "会话认证、nonce编码与Server头伪装" --draft --cwd "${cwd}"`, {
        stdio: 'ignore',
      });
      const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
      assert.match(spec, /FR-1:\s*会话认证/);
      assert.match(spec, /FR-2:\s*nonce编码/);
      assert.match(spec, /FR-3:\s*Server头伪装/);

      const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
      assert.match(plan, /S1:/);
      assert.match(plan, /S2:/);
      assert.match(plan, /S3:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders multi-step plan when features.length > 1', () => {
    const spec = `# T-20260928-test - Multi Feature Task
## 2. 需求清单
### 功能需求
- [ ] FR-1: 传输通道重构
- [ ] FR-2: 认证机制增强
- [ ] FR-3: 协议伪装

## 5. 验收标准
- [ ] AC-1: 通道重构完成并通过单测
- [ ] AC-2: 认证机制有效
- [ ] AC-3: 协议伪装通过全量门禁
`;
    const plan = renderDraftPlan(spec, 2, false);
    assert.match(plan, /### S1: 实现并验证 FR-1 传输通道重构/);
    assert.match(plan, /### S2: 实现并验证 FR-2 认证机制增强/);
    assert.match(plan, /### S3: 实现并验证 FR-3 协议伪装/);
    assert.match(plan, /- \[ \] S1\n- \[ \] S2\n- \[ \] S3/);
  });

  it('auto-heals manual spec.md edits during plan and go', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-robust-heal-'));
    try {
      execSync(`node "${BIN}" init --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" start "基础网络模块优化" --draft --cwd "${cwd}"`, {
        stdio: 'ignore',
      });

      // 人工手改 spec.md（追加 ADR-20260928-999 决策记录）
      const specPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.md');
      const originalSpec = readFileSync(specPath, 'utf-8');
      writeFileSync(specPath, originalSpec + '\n\n## 6. 决策记录 (ADR)\n- ADR-999: 使用非阻塞通道\n');

      // 运行 docpath go --step S1，应自动自愈而不报错或阻塞
      execSync(`node "${BIN}" go --step S1 --cwd "${cwd}"`, { stdio: 'ignore' });

      // 检查 spec.json 是否已被自愈
      const specJsonPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.json');
      assert.ok(existsSync(specJsonPath));
      const specJson = JSON.parse(readFileSync(specJsonPath, 'utf-8'));
      assert.ok(specJson.source.content_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
