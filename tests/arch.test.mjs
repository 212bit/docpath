import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { checkArchitectureLayers } from '../dist/engine/arch-guard.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Architecture Drift Guard Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-arch-test-'));
    await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'types'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'utils'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'engine'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'commands'), { recursive: true });

    // Workspace state
    await writeFile(
      join(tempDir, '.docpath', 'workspace', 'state.json'),
      JSON.stringify({ schema_version: '1.0', state: 'idle', phase: 'idle' }),
      'utf-8',
    );

    // src/types/index.ts (Layer 0)
    await writeFile(
      join(tempDir, 'src', 'types', 'index.ts'),
      'export interface User { id: string; name: string; }',
      'utf-8',
    );

    // src/utils/string.ts (Layer 1) -> imports Layer 0 (valid)
    await writeFile(
      join(tempDir, 'src', 'utils', 'string.ts'),
      "import type { User } from '../types/index.js';\nexport function formatUser(u: User) { return u.name; }",
      'utf-8',
    );

    // src/engine/user-engine.ts (Layer 2) -> imports Layer 1 & 0 (valid)
    await writeFile(
      join(tempDir, 'src', 'engine', 'user-engine.ts'),
      "import { formatUser } from '../utils/string.js';\nexport function createUser() { return formatUser({ id: '1', name: 'Alice' }); }",
      'utf-8',
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('passes cleanly on valid unidirectional layer dependencies', async () => {
    const report = await checkArchitectureLayers(tempDir);
    assert.equal(report.passed, true);
    assert.equal(report.stats.errors, 0);
    assert.equal(report.violations.length, 0);
  });

  it('detects layer inversion when low-level module imports higher-level module', async () => {
    // Violate: src/utils/string.ts (Layer 1) imports src/engine/user-engine.ts (Layer 2)
    await writeFile(
      join(tempDir, 'src', 'utils', 'string.ts'),
      "import { createUser } from '../engine/user-engine.js';\nexport function bad() { return createUser(); }",
      'utf-8',
    );

    const report = await checkArchitectureLayers(tempDir);
    assert.equal(report.passed, false);
    assert.ok(report.stats.errors >= 1);

    const inversion = report.violations.find((v) => v.type === 'layer_inversion');
    assert.ok(inversion, 'Must report layer inversion violation');
    assert.ok(inversion.file.includes('src/utils/string.ts'));
    assert.ok(inversion.target.includes('src/engine/user-engine.ts'));
  });

  it('supports docpath arch CLI command with --agent', () => {
    const out = execSync(`node "${BIN}" arch --agent --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = parse(out);
    assert.equal(parsed.agent_view, 'arch_check');
    assert.equal(parsed.passed, true);
    assert.ok(typeof parsed.stats.total_files === 'number');
  });

  it('supports docpath arch layers CLI command', () => {
    const out = execSync(`node "${BIN}" arch layers --agent --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = parse(out);
    assert.equal(parsed.agent_view, 'arch_layers');
    assert.ok(Array.isArray(parsed.layers));
    assert.ok(parsed.layers.some((l) => l.name === 'types'));
    assert.ok(parsed.layers.some((l) => l.name === 'engine'));
  });
});
