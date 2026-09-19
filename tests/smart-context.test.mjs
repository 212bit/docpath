import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-smart-ctx-'));
  execSync('git init -b main', { cwd });
  execSync('git config user.name "Tester"', { cwd });
  execSync('git config user.email "tester@example.com"', { cwd });

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-AUTH-2'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(cwd, 'src', 'auth'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: smart-ctx-test\n');
  writeFileSync(join(cwd, 'README.md'), '# Smart Context Test\n');

  // Custom rules
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n- Use camelCase\n');
  writeFileSync(join(dp, 'rules', 'security.md'), '# Security Rules\n- JWT validation required\n- Always hash passwords\n');
  writeFileSync(join(dp, 'rules', 'ui.md'), '# UI Guidelines\n- Responsive components\n');

  writeFileSync(join(dp, 'docs-index.json'), JSON.stringify({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    entries: [
      {
        path: 'docs/auth-architecture.md',
        title: 'Auth Architecture',
        summary: 'OAuth2 and JWT token flow architecture overview',
        token_estimate: 150,
      },
    ],
  }, null, 2));

  writeFileSync(join(cwd, 'docs', 'auth-architecture.md'), '# Auth Architecture\nOAuth2 details...\n');

  execSync('git add . && git commit -m "init"', { cwd });
  return cwd;
}

function run(args, cwd, env = {}) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: { ...process.env, ...env } });
}

describe('docpath context --smart (smart context & rule routing)', () => {
  it('boosts security rule when modifying auth files or auth keywords in spec', () => {
    const cwd = mkGitRepo();
    try {
      const dp = join(cwd, '.docpath');
      writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-AUTH-2',
        task_title: 'Auth JWT Login',
      }, null, 2));

      writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), [
        '# T-AUTH-2 - Auth JWT Login',
        '',
        '## 2. 需求清单',
        '### 功能需求',
        '- [ ] FR-1: 校验 JWT token 和 auth 权限',
      ].join('\n'));

      // Modify auth file
      writeFileSync(join(cwd, 'src', 'auth', 'jwt.ts'), 'export const verifyToken = () => {};\n');

      const out = run('context --smart', cwd);
      assert.match(out, /DocPath 智能精准上下文包/);
      assert.match(out, /security/);
      assert.match(out, /JWT validation required/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --smart --agent YAML structured view', () => {
    const cwd = mkGitRepo();
    try {
      const dp = join(cwd, '.docpath');
      writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
        schema_version: 1,
        phase: 'executing',
        task_id: 'T-AUTH-2',
        task_title: 'Auth JWT Login',
      }, null, 2));

      const out = run('context --smart --agent', cwd);
      assert.match(out, /agent_view: smart_context/);
      assert.match(out, /matched_items:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
