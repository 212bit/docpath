import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { analyzeTestImpact } from '../dist/engine/tia.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Test Impact Analysis (TIA) Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-tia-test-'));
    await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'engine'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'utils'), { recursive: true });
    await mkdir(join(tempDir, 'tests'), { recursive: true });

    // Workspace state
    await writeFile(
      join(tempDir, '.docpath', 'workspace', 'state.json'),
      JSON.stringify({ schema_version: '1.0', state: 'idle', phase: 'idle' }),
      'utf-8',
    );

    // src/utils/math.ts
    await writeFile(
      join(tempDir, 'src', 'utils', 'math.ts'),
      'export function add(a: number, b: number) { return a + b; }',
      'utf-8',
    );

    // src/engine/calculator.ts -> imports math.ts
    await writeFile(
      join(tempDir, 'src', 'engine', 'calculator.ts'),
      "import { add } from '../utils/math.js';\nexport function calcTotal(list: number[]) { return list.reduce(add, 0); }",
      'utf-8',
    );

    // src/engine/unrelated.ts
    await writeFile(
      join(tempDir, 'src', 'engine', 'unrelated.ts'),
      'export function doNothing() {}',
      'utf-8',
    );

    // tests/calculator.test.mjs -> imports calculator.ts
    await writeFile(
      join(tempDir, 'tests', 'calculator.test.mjs'),
      "import { calcTotal } from '../src/engine/calculator.js';",
      'utf-8',
    );

    // tests/unrelated.test.mjs -> imports unrelated.ts
    await writeFile(
      join(tempDir, 'tests', 'unrelated.test.mjs'),
      "import { doNothing } from '../src/engine/unrelated.js';",
      'utf-8',
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('determines impacted test files from modified source file', async () => {
    const report = await analyzeTestImpact(tempDir, {
      files: ['src/utils/math.ts'],
    });

    assert.equal(report.stats.modified_count, 1);
    assert.equal(report.stats.impacted_test_count, 1);
    assert.equal(report.impacted_tests[0], 'tests/calculator.test.mjs');
    assert.ok(report.stats.saved_test_count >= 1);
    assert.ok(report.stats.reduction_ratio >= 0.5);
  });

  it('directly includes modified test file when test itself is changed', async () => {
    const report = await analyzeTestImpact(tempDir, {
      files: ['tests/unrelated.test.mjs'],
    });

    assert.equal(report.impacted_tests.length, 1);
    assert.equal(report.impacted_tests[0], 'tests/unrelated.test.mjs');
  });

  it('supports docpath test-map CLI command with --agent', () => {
    const out = execSync(`node "${BIN}" test-map src/utils/math.ts --agent --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = parse(out);
    assert.equal(parsed.agent_view, 'test_impact_analysis');
    assert.ok(parsed.impacted_tests.includes('tests/calculator.test.mjs'));
    assert.equal(parsed.stats.impacted_test_count, 1);
  });

  it('supports multi-language TIA impact derivation (Python, Go, Rust)', async () => {
    // 1. Python files
    await writeFile(join(tempDir, 'src', 'auth.py'), 'def login(): pass', 'utf-8');
    await writeFile(
      join(tempDir, 'tests', 'test_auth.py'),
      'from src.auth import login\ndef test_login(): pass',
      'utf-8',
    );

    // 2. Go files
    await mkdir(join(tempDir, 'pkg', 'jwt'), { recursive: true });
    await writeFile(join(tempDir, 'pkg', 'jwt', 'token.go'), 'package jwt\nfunc Sign() {}', 'utf-8');
    await writeFile(join(tempDir, 'pkg', 'jwt', 'token_test.go'), 'package jwt\nimport "testing"\nfunc TestSign(t *testing.T) {}', 'utf-8');

    // 3. Rust files
    await writeFile(join(tempDir, 'src', 'codec.rs'), 'pub fn encode() {}', 'utf-8');
    await writeFile(join(tempDir, 'tests', 'codec.rs'), 'use project::codec;\n#[test]\nfn test_codec() {}', 'utf-8');

    // Test Python impact
    const pyReport = await analyzeTestImpact(tempDir, { files: ['src/auth.py'] });
    assert.ok(pyReport.impacted_tests.includes('tests/test_auth.py'));

    // Test Go impact
    const goReport = await analyzeTestImpact(tempDir, { files: ['pkg/jwt/token.go'] });
    assert.ok(goReport.impacted_tests.includes('pkg/jwt/token_test.go'));

    // Test Rust impact
    const rsReport = await analyzeTestImpact(tempDir, { files: ['src/codec.rs'] });
    assert.ok(rsReport.impacted_tests.includes('tests/codec.rs'));
  });

  it('supports docpath test-map --smart option with structured JSON output', () => {
    const out = execSync(`node "${BIN}" test-map src/utils/math.ts --smart --json --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = JSON.parse(out);
    assert.equal(parsed.stats.modified_count, 1);
    assert.ok(parsed.impacted_tests.includes('tests/calculator.test.mjs'));
  });
});
