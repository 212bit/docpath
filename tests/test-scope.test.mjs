import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  touchesRiskyPath,
  selectTouchedTestFiles,
  testRelatesToFile,
  resolveGoTestCommand,
  resolvePythonTestCommand,
  resolveRustTestCommand,
} from '../dist/commands/check.js';

// Test touchesRiskyPath and selection logic
describe('test-scope touched selection and risky path isolation', () => {
  it('correctly identifies core risky dispatchers as requiring full regression', () => {
    assert.equal(touchesRiskyPath('src/commands/agent.ts'), true);
    assert.equal(touchesRiskyPath('src/commands/check.ts'), true);
    assert.equal(touchesRiskyPath('src/commands/done.ts'), true);
    assert.equal(touchesRiskyPath('src/commands/runtime.ts'), true);
    assert.equal(touchesRiskyPath('src/engine/transitions.ts'), true);
    assert.equal(touchesRiskyPath('package.json'), true);
  });

  it('identifies multi-language build manifests and CI files as risky', () => {
    assert.equal(touchesRiskyPath('go.mod'), true);
    assert.equal(touchesRiskyPath('go.sum'), true);
    assert.equal(touchesRiskyPath('Cargo.toml'), true);
    assert.equal(touchesRiskyPath('Cargo.lock'), true);
    assert.equal(touchesRiskyPath('pyproject.toml'), true);
    assert.equal(touchesRiskyPath('requirements.txt'), true);
    assert.equal(touchesRiskyPath('pom.xml'), true);
    assert.equal(touchesRiskyPath('build.gradle'), true);
    assert.equal(touchesRiskyPath('Makefile'), true);
    assert.equal(touchesRiskyPath('.github/workflows/ci.yml'), true);
  });

  it('honors custom risky patterns from config', () => {
    const customPatterns = ['pkg/core/**', 'api/v1/proto/**'];
    assert.equal(touchesRiskyPath('pkg/core/handler.go', customPatterns), true);
    assert.equal(touchesRiskyPath('api/v1/proto/service.proto', customPatterns), true);
    assert.equal(touchesRiskyPath('pkg/utils/strings.go', customPatterns), false);
  });

  it('permits peripheral commands to leverage touched scope without falling back to full', () => {
    assert.equal(touchesRiskyPath('src/commands/gc.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/budget.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/milestone.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/quick.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/backlog.ts'), false);
  });

  it('matches multi-language and prefix-related test files', () => {
    // Exact basename match across languages
    assert.equal(testRelatesToFile('pkg/auth/service_test.go', 'pkg/auth/service.go'), true);
    assert.equal(testRelatesToFile('tests/test_auth.py', 'src/auth.py'), true);
    assert.equal(testRelatesToFile('tests/UserAuthTest.java', 'src/UserAuth.java'), true);

    // Dynamic prefix / token matching
    assert.equal(testRelatesToFile('tests/budget.test.mjs', 'src/commands/budget-helper.ts'), true);
    assert.equal(testRelatesToFile('tests/check-runner.test.ts', 'src/commands/check-cache.ts'), true);

    // Unrelated files
    assert.equal(testRelatesToFile('tests/agent.test.mjs', 'src/commands/budget.ts'), false);
  });

  it('selects related test files for changed peripheral files', () => {
    const changed = ['src/commands/budget.ts'];
    const testFiles = ['tests/budget.test.mjs', 'tests/check.test.mjs', 'tests/agent.test.mjs', 'tests/quick.test.mjs'];
    const selected = selectTouchedTestFiles(process.cwd(), changed, testFiles);
    assert.deepEqual(selected, ['tests/budget.test.mjs']);
  });

  it('falls back to full test suite when touching custom risky path', () => {
    const customPatterns = ['src/special/**'];
    const changed = ['src/special/feature.ts'];
    const testFiles = ['tests/feature.test.mjs', 'tests/check.test.mjs'];
    const selected = selectTouchedTestFiles(process.cwd(), changed, testFiles, customPatterns);
    assert.equal(selected, null);
  });

  it('resolves Go, Python, and Rust test commands with scope awareness', () => {
    const goFull = resolveGoTestCommand(process.cwd(), { testScope: 'full' });
    assert.equal(goFull.command, 'go test ./... 2>&1');
    assert.match(goFull.name, /Go 单元测试/);

    const pyFull = resolvePythonTestCommand(process.cwd(), { testScope: 'full' });
    assert.equal(pyFull.command, 'pytest 2>&1');
    assert.match(pyFull.name, /pytest/);

    const rustFull = resolveRustTestCommand(process.cwd(), { testScope: 'full' });
    assert.equal(rustFull.command, 'cargo test 2>&1');
    assert.match(rustFull.name, /Rust 单元测试/);
  });
});