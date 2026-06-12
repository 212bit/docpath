import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mkExecWorkspace } from './helpers.mjs';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function runResult(args, cwd) {
  try {
    return {
      ok: true,
      output: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (err) {
    return {
      ok: false,
      output: `${err.stdout?.toString('utf-8') || ''}${err.stderr?.toString('utf-8') || ''}`,
    };
  }
}

describe('context health check', () => {
  it('reports missing docs-index as a non-blocking warning', () => {
    const { dir } = mkExecWorkspace();

    const result = runResult(`check --cwd ${dir} --skip-tests --skip-lint --fix-drift current`, dir);

    assert.equal(result.ok, true);
    assert.match(result.output, /上下文健康检查/);
    assert.match(result.output, /docs-index 缺失/);
    assert.match(result.output, /全部通过/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails loudly when docs-index is damaged', () => {
    const { dir } = mkExecWorkspace();
    writeFileSync(join(dir, '.docpath', 'docs-index.json'), '{ broken json');

    const result = runResult(`check --cwd ${dir} --skip-tests --skip-lint --fix-drift current`, dir);

    assert.equal(result.ok, false);
    assert.match(result.output, /docs-index 结构损坏/);
    assert.match(result.output, /docpath docs scan/);
    rmSync(dir, { recursive: true, force: true });
  });
});
