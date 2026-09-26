import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractImportSpecifiers,
  buildDependencyGraph,
  getTransitiveDependents,
  findCircularDependencies,
} from '../dist/engine/dependency-graph.js';

describe('Dependency Graph Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-dep-graph-test-'));
    await mkdir(join(tempDir, 'src', 'utils'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'engine'), { recursive: true });
    await mkdir(join(tempDir, 'tests'), { recursive: true });

    // src/utils/format.ts
    await writeFile(
      join(tempDir, 'src', 'utils', 'format.ts'),
      'export function formatStr(s: string) { return s.trim(); }',
      'utf-8',
    );

    // src/engine/core.ts -> imports format.ts
    await writeFile(
      join(tempDir, 'src', 'engine', 'core.ts'),
      "import { formatStr } from '../utils/format.js';\nexport function runCore() { return formatStr('core'); }",
      'utf-8',
    );

    // tests/core.test.mjs -> imports core.ts
    await writeFile(
      join(tempDir, 'tests', 'core.test.mjs'),
      "import { runCore } from '../src/engine/core.js';\nrunCore();",
      'utf-8',
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts import specifiers from various syntax styles', () => {
    const code = `
      import { a } from './a.js';
      import * as b from '../b';
      export { c } from './c';
      const d = await import('./dynamic.js');
      const e = require('./req.js');
    `;
    const specs = extractImportSpecifiers(code);
    assert.ok(specs.includes('./a.js'));
    assert.ok(specs.includes('../b'));
    assert.ok(specs.includes('./c'));
    assert.ok(specs.includes('./dynamic.js'));
    assert.ok(specs.includes('./req.js'));
  });

  it('builds dependency graph and links dependents', async () => {
    const graph = await buildDependencyGraph(tempDir, ['src', 'tests']);

    const formatNode = graph.nodes.get('src/utils/format.ts');
    const coreNode = graph.nodes.get('src/engine/core.ts');
    const testNode = graph.nodes.get('tests/core.test.mjs');

    assert.ok(formatNode, 'formatNode exists');
    assert.ok(coreNode, 'coreNode exists');
    assert.ok(testNode, 'testNode exists');

    assert.ok(coreNode.imports.includes('src/utils/format.ts'));
    assert.ok(formatNode.importedBy.includes('src/engine/core.ts'));
    assert.ok(testNode.imports.includes('src/engine/core.ts'));
  });

  it('computes transitive downstream dependents', async () => {
    const graph = await buildDependencyGraph(tempDir, ['src', 'tests']);

    // Changing src/utils/format.ts should transitively affect src/engine/core.ts AND tests/core.test.mjs
    const { affectedFiles, dependencyChains } = getTransitiveDependents(graph, ['src/utils/format.ts']);

    assert.ok(affectedFiles.includes('src/engine/core.ts'));
    assert.ok(affectedFiles.includes('tests/core.test.mjs'));

    const testChain = dependencyChains.get('tests/core.test.mjs');
    assert.deepEqual(testChain, ['src/utils/format.ts', 'src/engine/core.ts', 'tests/core.test.mjs']);
  });

  it('detects circular dependencies when present', async () => {
    // Create cycle: a.ts <-> b.ts
    await writeFile(
      join(tempDir, 'src', 'utils', 'a.ts'),
      "import { bFunc } from './b.js'; export function aFunc() { return bFunc(); }",
      'utf-8',
    );
    await writeFile(
      join(tempDir, 'src', 'utils', 'b.ts'),
      "import { aFunc } from './a.js'; export function bFunc() { return aFunc(); }",
      'utf-8',
    );

    const graph = await buildDependencyGraph(tempDir, ['src']);
    const cycles = findCircularDependencies(graph);

    assert.ok(cycles.length > 0, 'Must detect circular dependency');
    assert.ok(cycles[0].display.includes('a.ts'));
    assert.ok(cycles[0].display.includes('b.ts'));
  });

  it('supports multi-language dependency graphs (Python, Go, Rust)', async () => {
    // Python
    await mkdir(join(tempDir, 'app', 'services'), { recursive: true });
    await writeFile(join(tempDir, 'app', 'services', 'auth.py'), 'def check(): pass', 'utf-8');
    await writeFile(
      join(tempDir, 'app', 'services', 'user.py'),
      'from .auth import check\nimport math',
      'utf-8',
    );

    // Go
    await mkdir(join(tempDir, 'pkg', 'api'), { recursive: true });
    await writeFile(join(tempDir, 'pkg', 'api', 'handler.go'), 'package api\nimport "net/http"', 'utf-8');
    await writeFile(join(tempDir, 'pkg', 'api', 'server.go'), 'package api\nfunc Run() {}', 'utf-8');

    // Rust
    await mkdir(join(tempDir, 'src', 'db'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'db', 'mod.rs'), 'pub fn connect() {}', 'utf-8');
    await writeFile(
      join(tempDir, 'src', 'main.rs'),
      'mod db;\nuse crate::db::connect;',
      'utf-8',
    );

    const graph = await buildDependencyGraph(tempDir);

    // Python node check
    const userNode = graph.nodes.get('app/services/user.py');
    assert.ok(userNode, 'Python userNode should exist');
    assert.ok(userNode.imports.includes('app/services/auth.py'));

    // Go package internal dependency
    const handlerNode = graph.nodes.get('pkg/api/handler.go');
    assert.ok(handlerNode, 'Go handlerNode should exist');
    assert.ok(handlerNode.imports.includes('pkg/api/server.go'));

    // Rust module dependency
    const mainNode = graph.nodes.get('src/main.rs');
    assert.ok(mainNode, 'Rust mainNode should exist');
    assert.ok(mainNode.imports.includes('src/db/mod.rs'));
  });
});
