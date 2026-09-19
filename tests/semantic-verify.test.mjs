import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-verify-test-'));
  execSync('git init -b main', { cwd });
  execSync('git config user.name "Tester"', { cwd });
  execSync('git config user.email "tester@example.com"', { cwd });

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-VERIFY-1'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(cwd, 'src'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: verify-test\n');
  writeFileSync(join(cwd, 'README.md'), '# Verify Test\n');
  writeFileSync(join(cwd, 'src', 'index.ts'), 'export const app = 1;\n');

  execSync('git add . && git commit -m "init"', { cwd });
  return cwd;
}

function run(args, cwd, env = {}) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: { ...process.env, ...env } });
}

describe('docpath verify (semantic & scope verification)', () => {
  it('detects Scope.excluded violations when modified files match excluded patterns', () => {
    const cwd = mkGitRepo();
    try {
      const dp = join(cwd, '.docpath');
      writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-VERIFY-1',
        task_title: 'Auth Enhancement',
      }, null, 2));

      // Spec with Scope.excluded
      const specContent = [
        '# T-VERIFY-1 - Auth Enhancement',
        '',
        '## 2. 需求清单',
        '### 功能需求',
        '- [ ] FR-1: 实现新认证逻辑',
        '',
        '## 3. 范围界定',
        '### 包含',
        '- src/auth.ts',
        '',
        '### 不包含',
        '- database/schema.sql',
        '- config/production.json',
        '',
        '## 5. 验收标准',
        '- [ ] AC-1: 认证通过',
      ].join('\n');

      writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), specContent);
      writeFileSync(join(dp, 'tasks', 'T-VERIFY-1', 'spec.md'), specContent);

      // Plan
      const planContent = [
        '# T-VERIFY-1 - Plan',
        '',
        '## 步骤',
        '### S1: 开发认证',
        '- 描述: 实现 FR-1 需求',
        '- 验收条件: AC-1',
        '- 依赖: 无',
        '- 状态: in_progress',
      ].join('\n');
      writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), planContent);
      writeFileSync(join(dp, 'tasks', 'T-VERIFY-1', 'plan.md'), planContent);

      // Modify a file in excluded list
      mkdirSync(join(cwd, 'database'), { recursive: true });
      writeFileSync(join(cwd, 'database', 'schema.sql'), '-- modified excluded db\n');

      assert.throws(() => {
        run('verify', cwd);
      }, (err) => {
        assert.match(err.stdout, /越界违规/);
        assert.match(err.stdout, /database\/schema\.sql/);
        return true;
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('passes semantic verify and tracks FR/AC when within scope', () => {
    const cwd = mkGitRepo();
    try {
      const dp = join(cwd, '.docpath');
      writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-VERIFY-1',
        task_title: 'Auth Feature',
      }, null, 2));

      const specContent = [
        '# T-VERIFY-1 - Auth Feature',
        '',
        '## 2. 需求清单',
        '### 功能需求',
        '- [ ] FR-1: 基础认证',
        '',
        '## 3. 范围界定',
        '### 包含',
        '- src/auth.ts',
        '',
        '### 不包含',
        '- database/schema.sql',
        '',
        '## 5. 验收标准',
        '- [ ] AC-1: 检查 token',
      ].join('\n');

      writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), specContent);
      writeFileSync(join(dp, 'tasks', 'T-VERIFY-1', 'spec.md'), specContent);

      const planContent = [
        '# T-VERIFY-1 - Plan',
        '',
        '## 步骤',
        '### S1: 基础认证模块',
        '- 描述: 实现 FR-1',
        '- 验收条件: AC-1',
        '- 依赖: 无',
        '- 状态: in_progress',
      ].join('\n');
      writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), planContent);
      writeFileSync(join(dp, 'tasks', 'T-VERIFY-1', 'plan.md'), planContent);

      // Legitimate change in scope
      writeFileSync(join(cwd, 'src', 'auth.ts'), 'export const auth = true;\n');

      const out = run('verify', cwd);
      assert.match(out, /PASSED/);
      assert.match(out, /范围合规/);
      assert.match(out, /FR-1/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --agent structured YAML output for verify', () => {
    const cwd = mkGitRepo();
    try {
      const dp = join(cwd, '.docpath');
      writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-VERIFY-1',
        task_title: 'Auth Feature',
      }, null, 2));

      const out = run('verify --agent', cwd);
      assert.match(out, /agent_view: verify/);
      assert.match(out, /passed: true/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
