import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-doc-enhanced-'));
  const dp = join(cwd, '.docpath');
  const docs = join(cwd, 'docs');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(docs, 'auth'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: doc-enhanced-test\ndocument_scan_paths:\n  - README.md\n  - docs\n');
  writeFileSync(join(cwd, 'README.md'), '# Main Readme\n\nProject overview.\n');
  writeFileSync(
    join(docs, 'auth', 'jwt-guide.md'),
    `---
title: JWT Authentication Guide
type: reference
scope: backend
topic_tags:
  - auth
  - jwt
  - security
---
# JWT Authentication Guide

Comprehensive JWT authentication guide for backend APIs.
`,
  );
  writeFileSync(
    join(docs, 'getting-started.md'),
    `---
title: Getting Started
type: runbook
scope: project
topic_tags:
  - guide
  - quickstart
---
# Getting Started

Step by step guide to setup the project.
`,
  );
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath doc alias and enhanced search experience', () => {
  it('supports doc alias for docs list by default', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('doc', cwd);
      assert.match(out, /DocPath 文档索引摘要/);
      assert.match(out, /jwt-guide\.md/);
      assert.match(out, /getting-started\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('smart routes non-subcommand arguments directly to search', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('doc jwt', cwd);
      assert.match(out, /文档检索: "jwt"/);
      assert.match(out, /jwt-guide\.md/);
      assert.match(out, /相关度:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports multi-dimensional filtering by type, scope, tag, and status', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('doc --tag auth', cwd);
      assert.match(out, /jwt-guide\.md/);
      assert.doesNotMatch(out, /getting-started\.md/);

      const typeFiltered = run('doc --type runbook', cwd);
      assert.match(typeFiltered, /getting-started\.md/);
      assert.doesNotMatch(typeFiltered, /jwt-guide\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports structured --agent YAML and --json output in search', () => {
    const cwd = mkWorkspace();
    try {
      const agentOut = run('doc jwt --agent', cwd);
      assert.match(agentOut, /agent_view:\s*docs_search/);
      assert.match(agentOut, /query:\s*jwt/);
      assert.match(agentOut, /path:\s*docs\/auth\/jwt-guide\.md/);
      assert.match(agentOut, /score:\s*\d+/);

      const jsonOut = run('doc jwt --json', cwd);
      const parsed = JSON.parse(jsonOut);
      assert.equal(parsed.query, 'jwt');
      assert.ok(parsed.results.length >= 1);
      assert.equal(parsed.results[0].path, 'docs/auth/jwt-guide.md');
      assert.ok(parsed.results[0].score > 0);
      assert.ok(Array.isArray(parsed.results[0].matched_reasons));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('auto heals missing index on doc search without requiring manual scan', () => {
    const cwd = mkWorkspace();
    try {
      // Ensure docs-index.json does NOT exist initially
      const indexPath = join(cwd, '.docpath', 'docs-index.json');
      if (existsSync(indexPath)) rmSync(indexPath);

      const out = run('doc "JWT Authentication"', cwd);
      assert.match(out, /文档检索: "JWT Authentication"/);
      assert.match(out, /jwt-guide\.md/);
      assert.equal(existsSync(indexPath), true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
