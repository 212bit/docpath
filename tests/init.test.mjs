import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('init command', () => {
  it('creates rules as the global rule directory while keeping spec templates', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-'));
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');

    execSync(`node ${BIN} init --cwd ${cwd} --level 2`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });

    assert.equal(existsSync(join(cwd, '.docpath', 'rules', 'style.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'rules', 'architecture.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'spec', 'template', 'spec.template.md')), true);

    const config = readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8');
    assert.match(config, /rules: \.docpath\/rules\//);
    assert.match(config, /spec_templates: \.docpath\/spec\/template\//);
    const projects = JSON.parse(execSync(`node ${BIN} projects --json`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    }));
    assert.equal(projects.projects.length, 1);
    assert.equal(projects.projects[0].root, cwd);
    assert.equal(projects.projects[0].phase, 'idle');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('registers an existing DocPath project without overwriting workspace files', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-existing-'));
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');

    execSync(`node ${BIN} init --cwd ${cwd} --level 2`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });
    const currentPath = join(cwd, '.docpath', 'workspace', 'current.md');
    writeFileSync(currentPath, '# Current\n\n保留已有工作区内容。\n');

    const output = execSync(`node ${BIN} init --cwd ${cwd}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });

    assert.match(output, /已注册到本地项目中心/);
    assert.equal(readFileSync(currentPath, 'utf-8'), '# Current\n\n保留已有工作区内容。\n');
    const projects = JSON.parse(execSync(`node ${BIN} projects --json`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    }));
    assert.equal(projects.projects.length, 1);
    assert.equal(projects.projects[0].root, cwd);
    rmSync(cwd, { recursive: true, force: true });
  });
});
