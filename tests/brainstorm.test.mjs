import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-brainstorm-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: brainstorm-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-BRAINSTORM',
    task_title: 'Brainstorm Test',
    phase: 'drafting',
    gate: 'none',
    current_step: 'drafting',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }, null, 2) + '\n');
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Existing Spec\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('brainstorm command', () => {
  it('dry-run creates a structured local draft from input without writing workflow files', () => {
    const cwd = mkWorkspace();
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const currentPath = join(cwd, '.docpath', 'workspace', 'current.md');
    const specPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.md');
    const before = {
      state: readFileSync(statePath, 'utf-8'),
      current: readFileSync(currentPath, 'utf-8'),
      spec: readFileSync(specPath, 'utf-8'),
    };

    const output = run(`brainstorm --cwd ${cwd} --input "做一个导出功能" --dry-run`, cwd);

    assert.match(output, /需求头脑风暴预览/);
    assert.match(output, /## 澄清问题/);
    assert.match(output, /## 默认假设/);
    assert.match(output, /## Spec 草稿/);
    assert.match(output, /## 1\. 背景与动机/);
    assert.match(output, /### 功能需求/);
    assert.match(output, /做一个导出功能/);
    assert.equal(readFileSync(statePath, 'utf-8'), before.state);
    assert.equal(readFileSync(currentPath, 'utf-8'), before.current);
    assert.equal(readFileSync(specPath, 'utf-8'), before.spec);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('dry-run reads requirements from a positional file', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, 'req.md'), '增加批量导入能力\n');

    const output = run(`brainstorm --cwd ${cwd} req.md --dry-run`, cwd);

    assert.match(output, /## 澄清问题/);
    assert.match(output, /增加批量导入能力/);
    assert.match(output, /## 5\. 验收标准/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('dry-run fails loudly when a requested file is missing', () => {
    const cwd = mkWorkspace();

    const result = runResult(`brainstorm --cwd ${cwd} missing.md --dry-run`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /需求文件不存在/);
    assert.doesNotMatch(result.out, /未提供需求描述/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('normal mode prompt asks for clarification questions, assumptions, and a spec draft', () => {
    const cwd = mkWorkspace();

    const output = run(`brainstorm --cwd ${cwd} --input "增加导出功能"`, cwd);

    assert.match(output, /## 澄清问题/);
    assert.match(output, /## 默认假设/);
    assert.match(output, /## Spec 草稿/);
    assert.match(output, /Spec 草稿格式要求/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
