import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docslint-'));
  const dp = join(cwd, '.docpath');
  const docs = join(cwd, 'docs');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(docs, { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: lint-test\ndocument_scan_paths:\n  - README.md\n  - docs\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\nStyle guidelines.\n');
  writeFileSync(join(cwd, 'README.md'), '# Lint Test\n\nProject readme.\n');
  writeFileSync(join(docs, 'README.md'), '# Docs Center\n\n- [Getting Started](./getting-started.md)\n');
  writeFileSync(join(docs, 'getting-started.md'), '# Getting Started\n\nGetting started guide.\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath docs lint command', () => {
  it('reports all green when docs and links are valid', () => {
    const cwd = mkWorkspace();
    try {
      run('docs scan', cwd);
      const out = run('docs lint', cwd);
      assert.match(out, /所有文档链接完整，格式正常，索引已同步/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects broken relative links and unindexed docs', () => {
    const cwd = mkWorkspace();
    const docs = join(cwd, 'docs');
    try {
      // Add broken link in docs/README.md
      writeFileSync(join(docs, 'README.md'), '# Docs Center\n\n- [Non Existent](./non-existent.md)\n');
      // Add unindexed new doc without scan
      writeFileSync(join(docs, 'orphan.md'), '# Orphan Doc\n\nNot yet scanned into index.\n');

      const out = run('docs lint', cwd);
      assert.match(out, /broken-link/);
      assert.match(out, /non-existent\.md/);
      assert.match(out, /unindexed/);
      assert.match(out, /orphan\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('searches indexed documents by keyword and synonym', () => {
    const cwd = mkWorkspace();
    try {
      run('docs scan', cwd);
      const out = run('docs search started', cwd);
      assert.match(out, /文档检索: "started"/);
      assert.match(out, /getting-started\.md/);

      const agentOut = run('docs search started --agent', cwd);
      assert.match(agentOut, /agent_view:\s*docs_search/);
      assert.match(agentOut, /getting-started\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects misplaced backlog analysis files and broken evidence links', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    const backlog = join(dp, 'backlog');
    mkdirSync(backlog, { recursive: true });
    try {
      run('docs scan', cwd);
      // Place loose analysis file directly in .docpath/backlog
      writeFileSync(join(backlog, 'R999-analysis.md'), '# Loose Analysis\n\nSome notes.\n');
      // Place backlog item pointing to nonexistent evidence
      writeFileSync(
        join(backlog, 'R-999-sample-feature.md'),
        `---
id: R-999
title: Sample Feature
status: proposed
priority: P2
level: 1
source: test
readiness: shaped
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/nonexistent.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: '2026-09-23'
---

Sample body
`,
      );

      const out = run('docs lint', cwd);
      assert.match(out, /backlog-misplaced/);
      assert.match(out, /R999-analysis\.md/);
      assert.match(out, /broken-evidence/);
      assert.match(out, /nonexistent\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
