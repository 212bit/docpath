import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-project-concurrency-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: project-concurrency-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    workflow_profile: 'standard',
    task_id: '',
    task_title: '',
    phase: 'idle',
    gate: 'none',
    current_step: 'ready',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

async function run(args, cwd, input) {
  const argsArray = args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''));
  if (input !== undefined) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [BIN, ...argsArray], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out: node ${BIN} ${argsArray.join(' ')}\n${stderr}`));
      }, 20000);
      child.stdout.setEncoding('utf-8');
      child.stderr.setEncoding('utf-8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed (${code}): node ${BIN} ${argsArray.join(' ')}\n${stdout}${stderr}`));
        }
      });
      child.stdin.end(input);
    });
  }
  const { stdout } = await execFileAsync('node', [BIN, ...argsArray], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    input,
  });
  return stdout.trim();
}

describe('project intake concurrency', () => {
  it('concurrent analyze updates do not lose writes', async () => {
    const cwd = mkWorkspace();
    const capture = await run('project capture --title "Concurrent Test" --content "source"', cwd);
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-concurrent-test)/)?.[1];

    // Simulate concurrent writes to different analysis sections
    const sections = ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions'];
    const writes = sections.map((section) =>
      run(`project analyze ${intakeId} --section ${section} --stdin`, cwd, `## ${section}\n\ncontent`)
    );

    await Promise.all(writes);

    // Verify all sections were written
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));
    assert.equal(state.stage, 'analyzed');
    assert.equal(state.artifacts.filter((a) => a.kind === 'analysis').length, 6);

    for (const section of sections) {
      const content = readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'analysis', `${section}.md`), 'utf-8');
      assert.equal(content, `## ${section}\n\ncontent`);
    }

    rmSync(cwd, { recursive: true, force: true });
  });

  it('concurrent brief and backlog updates are serialized', async () => {
    const cwd = mkWorkspace();
    const capture = await run('project capture --title "Serial Test" --content "source"', cwd);
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-serial-test)/)?.[1];

    // Write all analysis sections
    const sections = ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions'];
    for (const section of sections) {
      await run(`project analyze ${intakeId} --section ${section} --stdin`, cwd, `## ${section}\n`);
    }

    // Concurrent brief write (should succeed)
    const briefPromise = run(`project brief ${intakeId} --stdin`, cwd, '# Brief\n');

    // Small delay to let brief start
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Try to write backlog while brief is writing (should block until brief completes)
    const backlogPromise = run(`project backlog ${intakeId} --confirm "confirmed"`, cwd);

    await Promise.all([briefPromise, backlogPromise]);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));
    assert.equal(state.stage, 'confirmed');
    assert.equal(state.user_confirmed, 'confirmed');
    assert.ok(existsSync(join(cwd, '.docpath', 'project-intake', intakeId, 'brief.md')));
    assert.ok(existsSync(join(cwd, '.docpath', 'project-intake', intakeId, 'backlog.md')));

    rmSync(cwd, { recursive: true, force: true });
  });
});
