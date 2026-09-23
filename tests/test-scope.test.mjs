import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  touchesRiskyPath,
  selectTouchedTestFiles,
} from '../dist/commands/check.js';

// Test touchesRiskyPath and selection logic
describe('test-scope touched selection and risky path isolation', () => {
  it('correctly identifies core risky dispatchers as requiring full regression', async () => {
    const { touchesRiskyPath } = await import('../dist/commands/check.js');
    assert.equal(touchesRiskyPath('src/commands/agent.ts'), true);
    assert.equal(touchesRiskyPath('src/commands/check.ts'), true);
    assert.equal(touchesRiskyPath('src/commands/done.ts'), true);
    assert.equal(touchesRiskyPath('src/commands/runtime.ts'), true);
    assert.equal(touchesRiskyPath('src/engine/transitions.ts'), true);
    assert.equal(touchesRiskyPath('package.json'), true);
  });

  it('permits peripheral commands to leverage touched scope without falling back to full', async () => {
    const { touchesRiskyPath } = await import('../dist/commands/check.js');
    assert.equal(touchesRiskyPath('src/commands/gc.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/budget.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/milestone.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/quick.ts'), false);
    assert.equal(touchesRiskyPath('src/commands/backlog.ts'), false);
  });

  it('selects related test files for changed peripheral files', async () => {
    const { selectTouchedTestFiles } = await import('../dist/commands/check.js');
    const changed = ['src/commands/budget.ts'];
    const testFiles = ['tests/budget.test.mjs', 'tests/check.test.mjs', 'tests/agent.test.mjs', 'tests/quick.test.mjs'];
    const selected = selectTouchedTestFiles(process.cwd(), changed, testFiles);
    assert.deepEqual(selected, ['tests/budget.test.mjs']);
  });
});