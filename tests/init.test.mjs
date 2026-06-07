import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('init command', () => {
  it('creates rules as the global rule directory while keeping spec templates', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-'));

    execSync(`node ${BIN} init --cwd ${cwd} --level 2`, { cwd, encoding: 'utf-8', timeout: 20000 });

    assert.equal(existsSync(join(cwd, '.docpath', 'rules', 'style.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'rules', 'architecture.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'spec', 'template', 'spec.template.md')), true);

    const config = readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8');
    assert.match(config, /rules: \.docpath\/rules\//);
    assert.match(config, /spec_templates: \.docpath\/spec\/template\//);
    rmSync(cwd, { recursive: true, force: true });
  });
});
