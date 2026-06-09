import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

let rolesModule;
let contextIndexModule;

before(async () => {
  rolesModule = await import('../dist/utils/roles.js');
  contextIndexModule = await import('../dist/utils/context-index.js');
});

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-roles-'));
  const dp = join(cwd, '.docpath');
  const workspace = join(dp, 'workspace');
  const task = join(dp, 'tasks', 'current');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(task, { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: roles-test\n');
  writeFileSync(join(workspace, 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-ROLES',
    task_title: 'Role context',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(workspace, 'current.md'), '# Current\n');
  writeFileSync(join(workspace, 'last-check.md'), '# Last Check Evidence\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(workspace, 'review.md'), '# Code Review Report\n\n**状态**: ✅ PASS\n');
  writeFileSync(join(workspace, 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(task, 'spec.md'), [
    '# T-ROLES - Role context',
    '',
    '## 目标',
    '生成 role context。',
    '',
    '## 范围',
    '- roles',
    '',
    '## 验收',
    '- role context 可输出',
    '',
  ].join('\n'));
  writeFileSync(join(task, 'plan.md'), [
    '## 执行计划',
    '',
    '### S1: roles',
    '- [x] S1: roles',
    '- **描述**: roles',
    '- **验收条件**: roles',
    '- **依赖**: 无',
    '',
  ].join('\n'));
  return cwd;
}

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('role profiles', () => {
  it('lists built-in roles and fails loud on unknown roles', () => {
    const roles = rolesModule.listRoleProfiles();
    assert.equal(roles.length, 9);
    assert.equal(rolesModule.resolveRoleProfile('software-architect').team, 'software');
    assert.throws(() => rolesModule.resolveRoleProfile('unknown-role'), /Unknown role/);
  });

  it('renders role context with gates, context index, and deliverables references', async () => {
    const cwd = mkWorkspace();
    await contextIndexModule.writeHybridContextIndex(cwd);
    run('deliverables render --template architecture-brief --output deliverables/engineering/architecture-brief.md', cwd);

    const output = run('roles context --role software-architect', cwd);
    assert.equal(output.code, 0);
    assert.match(output.out, /# Role Context — software-architect/);
    assert.match(output.out, /\.docpath\/tasks\/current\/context-index\.json/);
    assert.match(output.out, /\.docpath\/tasks\/current\/deliverables\.json/);
    assert.match(output.out, /deliverable: architecture-brief/);
    assert.match(output.out, /不绕过 spec -> plan -> go -> check -> review -> journal/);

    const unknown = run('roles context --role no-such-role', cwd);
    assert.equal(unknown.code, 1);
    assert.match(unknown.out, /Unknown role/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
