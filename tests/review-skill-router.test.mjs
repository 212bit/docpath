import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
  });
  return {
    code: result.status ?? 1,
    out: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function mkReviewWorkspace(name = 'dp-review-skill-') {
  const cwd = mkdtempSync(join(tmpdir(), name));
  mkExecWorkspace(cwd);
  const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf-8'));
  state.phase = 'checking';
  state.gate = 'check_pass';
  state.current_step = '质量检查通过，下一步: docpath review';
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  execSync('git init', { cwd, encoding: 'utf-8' });
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'feature.ts'), 'export const feature = true;\n');
  return cwd;
}

function installTypeScriptSkill(cwd) {
  const dir = join(cwd, '.docpath', 'review-skills', 'typescript');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), [
    '# TypeScript Review Skill',
    '',
    '## Scope',
    '',
    '## Review Checklist',
    '',
    '## Evidence Contract',
    '',
  ].join('\n'));
}

function installJavaScriptSkill(cwd) {
  const dir = join(cwd, '.docpath', 'review-skills', 'javascript');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), [
    '# JavaScript Review Skill',
    '',
    '## Scope',
    '',
    '## Review Checklist',
    '',
    '## Evidence Contract',
    '',
  ].join('\n'));
}

describe('Review Skill Router', () => {
  it('review --dry-run emits a Review Skill Router contract for TypeScript files', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const result = run(['review', '--cwd', cwd, '--dry-run'], cwd);

    assert.equal(result.code, 0);
    assert.match(result.out, /review_skill_gate: required/);
    assert.match(result.out, /skill: docpath-review-typescript/);
    assert.match(result.out, /language: typescript/);
    assert.match(result.out, /files: src\/feature\.ts/);
    assert.match(result.out, /diff_fingerprint: sha256:/);
    assert.match(result.out, /write_command: docpath write-review-skill --skill docpath-review-typescript --language typescript --scope all --stdin/);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'review.json')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('standard review fails loud when the required DocPath-owned skill source is missing', () => {
    const cwd = mkReviewWorkspace();

    const result = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /review_skill_gate: fail/);
    assert.match(result.out, /missing skill source: \.docpath\/review-skills\/typescript\/SKILL\.md/);
    assert.equal(reviewJson.approved, false);
    assert.equal(reviewJson.skill_review_gate.status, 'fail');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('standard review fails loud when required skill evidence is missing', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const result = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /missing_evidence: docpath-review-typescript/);
    assert.equal(reviewJson.approved, false);
    assert.equal(reviewJson.skill_review_gate.status, 'fail');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review --approve cannot bypass a required Review Skill Gate', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const result = run(['review', '--cwd', cwd, '--approve'], cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /--approve cannot bypass Review Skill Gate/);
    assert.match(result.out, /--skip-skill-review <skill> --reason <reason>/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-review-skill writes valid evidence and lets review pass', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const payload = JSON.stringify({
      status: 'pass',
      files: ['src/feature.ts'],
      findings: [],
      summary: 'Reviewed all TypeScript files.',
    });
    const writeResult = run([
      'write-review-skill',
      '--cwd', cwd,
      '--skill', 'docpath-review-typescript',
      '--language', 'typescript',
      '--scope', 'all',
      '--content', payload,
    ], cwd);
    const reviewResult = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(writeResult.code, 0);
    assert.match(writeResult.out, /review skill evidence written: docpath-review-typescript \(pass\)/);
    assert.equal(reviewResult.code, 0);
    assert.match(reviewResult.out, /review_skill_gate: pass/);
    assert.equal(reviewJson.approved, true);
    assert.equal(reviewJson.skill_review_gate.status, 'pass');
    assert.equal(reviewJson.skill_reviews[0].diff_fingerprint.startsWith('sha256:'), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-review-skill rejects pass evidence containing error findings', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const payload = JSON.stringify({
      status: 'pass',
      files: ['src/feature.ts'],
      findings: [{ file: 'src/feature.ts', severity: 'error', message: 'blocking defect' }],
    });
    const result = run([
      'write-review-skill',
      '--cwd', cwd,
      '--skill', 'docpath-review-typescript',
      '--language', 'typescript',
      '--scope', 'all',
      '--content', payload,
    ], cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /pass skill review evidence cannot contain severity:error findings/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-review-skill rejects file sets that do not cover the current requirement exactly', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const payload = JSON.stringify({
      status: 'pass',
      files: ['src/other.ts'],
      findings: [],
    });
    const result = run([
      'write-review-skill',
      '--cwd', cwd,
      '--skill', 'docpath-review-typescript',
      '--language', 'typescript',
      '--scope', 'all',
      '--content', payload,
    ], cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /files must exactly match current router requirement/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review fails when skill evidence fingerprint is stale', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const payload = JSON.stringify({
      status: 'pass',
      files: ['src/feature.ts'],
      findings: [],
    });
    assert.equal(run([
      'write-review-skill',
      '--cwd', cwd,
      '--skill', 'docpath-review-typescript',
      '--language', 'typescript',
      '--scope', 'all',
      '--content', payload,
    ], cwd).code, 0);
    writeFileSync(join(cwd, 'src', 'feature.ts'), 'export const feature = false;\n');

    const result = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /diff fingerprint mismatch/);
    assert.equal(reviewJson.approved, false);
    assert.equal(reviewJson.skill_review_gate.status, 'fail');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review treats file set mismatch as recoverable evidence warning, not a blocking code failure', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);
    writeFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), JSON.stringify({
      schema_version: 1,
      kind: 'review',
      timestamp: new Date().toISOString(),
      scope: 'all',
      files: ['src/feature.ts'],
      findings: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      approved: false,
      skill_reviews: [{
        skill: 'docpath-review-typescript',
        language: 'typescript',
        role: 'language',
        frameworks: [],
        scope: 'all',
        files: ['src/other.ts'],
        diff_fingerprint: 'sha256:stale',
        status: 'pass',
        findings: [],
        generated_at: new Date().toISOString(),
      }],
      skill_review_skips: [],
    }, null, 2));

    const result = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /review_skill_gate: pass/);
    assert.match(result.out, /evidence_warnings:/);
    assert.match(result.out, /docpath-review-typescript: file set mismatch/);
    assert.match(result.out, /fix: docpath write-review-skill --skill docpath-review-typescript --language typescript --scope all --stdin/);
    assert.equal(reviewJson.approved, true);
    assert.equal(reviewJson.skill_review_gate.status, 'pass');
    assert.deepEqual(reviewJson.skill_review_gate.evidence_warnings, [{
      skill: 'docpath-review-typescript',
      reason: 'file set mismatch',
      fix_command: 'docpath write-review-skill --skill docpath-review-typescript --language typescript --scope all --stdin',
    }]);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review fails when skill evidence status is fail', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const payload = JSON.stringify({
      status: 'fail',
      files: ['src/feature.ts'],
      findings: [{ file: 'src/feature.ts', severity: 'error', message: 'blocking defect' }],
    });
    assert.equal(run([
      'write-review-skill',
      '--cwd', cwd,
      '--skill', 'docpath-review-typescript',
      '--language', 'typescript',
      '--scope', 'all',
      '--content', payload,
    ], cwd).code, 0);

    const result = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /skill review status is fail/);
    assert.equal(reviewJson.approved, false);
    assert.equal(reviewJson.skill_review_gate.status, 'fail');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('skill-level skip lets the review pass with pass_with_skips evidence', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);

    const result = run([
      'review',
      '--cwd', cwd,
      '--skip-skill-review', 'docpath-review-typescript',
      '--reason', 'temporary migration exception',
    ], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /review_skill_gate: pass_with_skips/);
    assert.equal(reviewJson.approved, true);
    assert.equal(reviewJson.skill_review_gate.status, 'pass_with_skips');
    assert.equal(reviewJson.skill_review_skips[0].reason, 'temporary migration exception');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('repeated --skip-skill-review flags are normalized instead of crashing', () => {
    const cwd = mkReviewWorkspace();
    installTypeScriptSkill(cwd);
    installJavaScriptSkill(cwd);
    writeFileSync(join(cwd, 'src', 'widget.js'), 'export const widget = true;\n');

    const result = run([
      'review',
      '--cwd', cwd,
      '--skip-skill-review', 'docpath-review-typescript',
      '--skip-skill-review', 'docpath-review-javascript',
      '--reason', 'temporary migration exception',
    ], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.doesNotMatch(result.out, /item\.split is not a function/);
    assert.match(result.out, /review_skill_gate: pass_with_skips/);
    assert.equal(reviewJson.approved, true);
    assert.deepEqual(
      reviewJson.skill_review_skips.map((item) => item.skill).sort(),
      ['docpath-review-javascript', 'docpath-review-typescript'],
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('config can disable the review skill gate and reports disabled output', () => {
    const cwd = mkReviewWorkspace();
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({
      review_skill_gate: { enabled: false },
    }, null, 2));

    const result = run(['review', '--cwd', cwd], cwd);
    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));

    assert.equal(result.code, 0);
    assert.match(result.out, /review_skill_gate: disabled/);
    assert.equal(reviewJson.approved, true);
    assert.equal(reviewJson.skill_review_gate.status, 'disabled');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('default review skill templates contain Scope, Review Checklist, and Evidence Contract sections', () => {
    for (const language of ['typescript', 'javascript']) {
      const content = readFileSync(join('templates', 'review-skills', language, 'SKILL.md'), 'utf-8');
      assert.match(content, /^## Scope$/m);
      assert.match(content, /^## Review Checklist$/m);
      assert.match(content, /^## Evidence Contract$/m);
    }
  });
});
