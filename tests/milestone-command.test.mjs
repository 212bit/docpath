import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-milestone-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-20260918-feature-a'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-20260919-feature-b'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: milestone-test\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\n## pattern: rule 1\n- details\n');
  writeFileSync(join(dp, 'rules', 'architecture.md'), '# Architecture Rules\n\n## pattern: rule 2\n- details\n');

  // Task A
  writeFileSync(join(dp, 'tasks', 'done', 'T-20260918-feature-a', 'spec.md'), [
    '# T-20260918-feature-a - Feature A Delivery',
    '',
    '## 2. 需求清单',
    '### 功能需求',
    '- [x] FR-1: Core engine',
    '- [x] FR-2: CLI options',
    '',
    '## 5. 验收标准',
    '- [x] AC-1: Tests pass',
  ].join('\n'));
  writeFileSync(join(dp, 'tasks', 'done', 'T-20260918-feature-a', 'plan.json'), JSON.stringify({
    schema_version: 1,
    kind: 'plan',
    title: 'Plan A',
    steps: [
      { id: 'S1', name: 'Step 1', description: 'desc', acceptance: 'acc', dependencies: '无', status: 'done' },
    ],
  }, null, 2));

  // Task B
  writeFileSync(join(dp, 'tasks', 'done', 'T-20260919-feature-b', 'spec.md'), [
    '# T-20260919-feature-b - Feature B Delivery',
    '',
    '## 2. 需求清单',
    '### 功能需求',
    '- [x] FR-1: Multi branch',
    '',
    '## 5. 验收标准',
    '- [x] AC-1: Topology verified',
  ].join('\n'));

  // Decisions
  writeFileSync(join(dp, 'workspace', 'decisions.md'), [
    '# Architecture Decisions',
    '',
    '## ADR-20260918-001: R-350 环境豁免机制',
    '- category: design-decision',
    '- conclusion: 引入 check_env_exempt 门禁',
    '- created_at: 2026-09-18T00:00:00.000Z',
    '- task_id: T-20260918-feature-a',
    '',
  ].join('\n'));

  // Backlog
  writeFileSync(join(dp, 'backlog', 'R-101.md'), [
    '---',
    'id: R-101',
    'title: Complete DAG engine',
    'status: done',
    'priority: P1',
    'level: 1',
    'source: user-feedback',
    'created_at: 2026-09-18',
    '---',
    '',
    '## 背景',
    'DAG 支持',
  ].join('\n'));

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath milestone command', () => {
  it('previews milestone release note with --dry-run', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('milestone create v0.2.0 --title "Topology and Rules" --dry-run', cwd);
      assert.match(out, /Release v0\.2\.0: Topology and Rules/);
      assert.match(out, /T-20260918-feature-a/);
      assert.match(out, /T-20260919-feature-b/);
      assert.match(out, /ADR-20260918-001/);
      assert.match(out, /R-101/);
      assert.match(out, /\[dry-run\] 预览结束/);

      // Verify no files were created under dry-run
      assert.equal(existsSync(join(cwd, 'docs', 'releases', 'v0.2.0.md')), false);
      assert.equal(existsSync(join(cwd, 'CHANGELOG.md')), false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates milestone release note and updates CHANGELOG.md', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('milestone create v0.2.0 --title "Topology and Rules"', cwd);
      assert.match(out, /里程碑 v0\.2\.0 阶段性总结生成完毕/);
      assert.match(out, /docs\/releases\/v0\.2\.0\.md/);

      const releaseDoc = readFileSync(join(cwd, 'docs', 'releases', 'v0.2.0.md'), 'utf-8');
      assert.match(releaseDoc, /# Release v0\.2\.0: Topology and Rules/);
      assert.match(releaseDoc, /Feature A Delivery/);
      assert.match(releaseDoc, /Feature B Delivery/);
      assert.match(releaseDoc, /ADR-20260918-001/);
      assert.match(releaseDoc, /R-101/);

      const changelog = readFileSync(join(cwd, 'CHANGELOG.md'), 'utf-8');
      assert.match(changelog, /## \[v0\.2\.0\]/);
      assert.match(changelog, /T-20260918-feature-a/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('lists existing milestones and displays specific milestone', () => {
    const cwd = mkWorkspace();
    try {
      run('milestone create v0.1.0 --title "Initial Baseline"', cwd);
      run('milestone create v0.2.0 --title "DAG Engine"', cwd);

      const listOut = run('milestone list', cwd);
      assert.match(listOut, /v0\.1\.0/);
      assert.match(listOut, /v0\.2\.0/);

      const showOut = run('milestone show v0.2.0', cwd);
      assert.match(showOut, /# Release v0\.2\.0: DAG Engine/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --agent structured YAML output', () => {
    const cwd = mkWorkspace();
    try {
      const agentOut = run('milestone create v0.3.0 --title "Agent Output" --agent', cwd);
      assert.match(agentOut, /agent_view:\s*milestone_created/);
      assert.match(agentOut, /version:\s*v0\.3\.0/);
      assert.match(agentOut, /tasks_delivered:\s*2/);
      assert.match(agentOut, /decisions_recorded:\s*1/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
