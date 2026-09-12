import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const GETTING_STARTED = new URL('../docs/getting-started.md', import.meta.url).pathname;

function registryDbPath() {
  return join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
}

function run(args, cwd, registryDb = registryDbPath()) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, {
        cwd,
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
      }),
      registryDb,
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
      registryDb,
    };
  }
}

describe('init command', () => {
  it('creates rules as the global rule directory while keeping spec templates', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-'));
    const registryDb = registryDbPath();

    execSync(`node ${BIN} init --cwd ${cwd} --level 2`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });

    assert.equal(existsSync(join(cwd, '.docpath', 'rules', 'style.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'rules', 'architecture.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'spec', 'template', 'spec.template.md')), true);

    // R-336: paths 段已从 config 移除（零消费方），规则/模板落盘即为契约
    const config = readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8');
    assert.doesNotMatch(config, /paths:/);
    assert.equal(existsSync(join(cwd, '.docpath', 'rules')), true);
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
    const registryDb = registryDbPath();

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

  it('repairs missing runtime files for an existing DocPath project without force', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-repair-runtime-'));
    const registryDb = registryDbPath();
    mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: existing-project\n');
    writeFileSync(join(cwd, '.docpath', 'rules', 'style.md'), '# Existing Style\n');

    const output = execSync(`node ${BIN} init --cwd ${cwd}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });

    assert.match(output, /已补齐缺失 runtime/);
    assert.match(output, /已注册到本地项目中心/);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'state.json')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'current.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md')), true);
    assert.equal(readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8'), 'project:\n  name: existing-project\n');
    assert.equal(readFileSync(join(cwd, '.docpath', 'rules', 'style.md'), 'utf-8'), '# Existing Style\n');
    const next = execSync(`node ${BIN} next --cwd ${cwd} --agent`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });
    assert.match(next, /agent_view: next/);
    assert.doesNotMatch(next, /state: unknown/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps existing project runtime repair successful when registry registration fails', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-registry-warning-'));
    const registryDb = join(cwd, 'registry-as-directory');
    mkdirSync(registryDb, { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: registry-warning\n');

    const output = execSync(`node ${BIN} init --cwd ${cwd} 2>&1`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });

    assert.match(output, /已补齐缺失 runtime/);
    assert.match(output, /本地项目中心注册失败，已跳过/);
    assert.match(output, /registry-as-directory/);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'state.json')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'current.md')), true);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md')), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('respects level 0 for non-interactive init', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-level-zero-'));
    const registryDb = registryDbPath();

    const output = execSync(`node ${BIN} init --cwd ${cwd} --level 0`, {
      cwd,
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, DOCPATH_REGISTRY_DB: registryDb },
    });

    assert.match(output, /Level 0 \(手动\)/);
    const config = readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8');
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    // R-336: default_level 不再写入 config（零消费方），level 真源在 state.json
    assert.doesNotMatch(config, /default_level/);
    assert.equal(state.level, 0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails loudly for interactive init without a TTY and does not create .docpath', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-nontty-'));

    const result = run(`init --cwd ${cwd} --interactive`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /docpath init --interactive 需要在 TTY/);
    assert.match(result.out, /docpath init --level 2/);
    assert.equal(existsSync(join(cwd, '.docpath')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('validates init level before writing files', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-bad-level-'));

    const result = run(`init --cwd ${cwd} --level 9`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /--level 参数非法: 9/);
    assert.match(result.out, /允许: 0\|1\|2\|3/);
    assert.equal(existsSync(join(cwd, '.docpath')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('explains how to fix a link target without .docpath', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-init-link-source-'));
    const target = mkdtempSync(join(tmpdir(), 'dp-init-link-target-'));

    const result = run(`init --cwd ${cwd} --link ${target}`, cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /目标项目未找到 \.docpath\/ 目录/);
    assert.match(result.out, new RegExp(`docpath init --cwd ${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.equal(existsSync(join(cwd, '.docpath')), false);
    rmSync(cwd, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  it('documents the getting started command path', () => {
    const doc = readFileSync(GETTING_STARTED, 'utf-8');

    for (const command of [
      'docpath init --interactive',
      'docpath init --level 2',
      'docpath next --agent',
      'docpath backlog capture',
      'docpath backlog add',
      'docpath backlog accept R-001',
      'docpath backlog promote R-001',
      'docpath plan',
      'docpath go --step S1',
      'docpath check',
      'docpath review',
      'docpath journal',
      'docpath agent done',
    ]) {
      assert.match(doc, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(doc, /status --agent` 只在显式查看状态、诊断漂移或状态变更后确认时使用/);
    assert.match(doc, /`next --agent` 是只读的 advisory router/);
    assert.match(doc, /不是授权、锁或所有命令的必需前置/);
  });
});
