import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-project-cmd-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: project-command-test\n');
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

function run(args, cwd, input) {
  return execFileSync('node', [BIN, ...args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''))], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    input,
  }).trim();
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('project intake commands', () => {
  it('project capture creates intake state and copies content source', () => {
    const cwd = mkWorkspace();

    const out = run('project capture --title "New CRM" --content "API docs and product notes" --source-type requirements', cwd);

    assert.match(out, /project intake 已创建: P-\d{8}-new-crm/);
    assert.match(out, /recommended_command: docpath project analyze P-\d{8}-new-crm --dry-run/);
    const intakeDir = join(cwd, '.docpath', 'project-intake');
    const statePath = join(intakeDir, out.match(/project intake 已创建: (P-\d{8}-new-crm)/)?.[1], 'intake.json');
    assert.equal(existsSync(statePath), true);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(state.stage, 'captured');
    assert.equal(state.sources.length, 1);
    assert.equal(state.sources[0].type, 'requirements');
    assert.match(state.sources[0].content_path, /\.docpath\/project-intake\/P-\d{8}-new-crm\/sources\/source-001\.md/);
    assert.equal(readFileSync(join(cwd, state.sources[0].content_path), 'utf-8'), 'API docs and product notes');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project capture records source references without copying content', () => {
    const cwd = mkWorkspace();

    const out = run('project capture --title "Partner API" --source-ref "docs/api.pdf" --source-type pdf', cwd);
    const intakeId = out.match(/project intake 已创建: (P-\d{8}-partner-api)/)?.[1];
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));

    assert.equal(state.sources[0].original_path, 'docs/api.pdf');
    assert.equal(state.sources[0].content_path, undefined);
    assert.equal(state.sources[0].type, 'pdf');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project capture fails without source material and validates source type', () => {
    const cwd = mkWorkspace();

    const missing = runResult('project capture --title "No Source"', cwd);
    const invalidType = runResult('project capture --title "Bad Type" --content "x" --source-type binary', cwd);

    assert.notEqual(missing.code, 0);
    assert.match(missing.out, /requires --content, --file, --stdin, or --source-ref/);
    assert.notEqual(invalidType.code, 0);
    assert.match(invalidType.out, /--source-type 参数非法/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project analyze emits dry-run payload and persists analysis sections', () => {
    const cwd = mkWorkspace();
    const capture = run('project capture --title "New Platform" --content "meeting notes" --source-type meeting-notes', cwd);
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-new-platform)/)?.[1];

    const dryRun = JSON.parse(run(`project analyze ${intakeId} --dry-run`, cwd));
    assert.equal(dryRun.task, 'project-intake-analysis');
    assert.equal(dryRun.intake_id, intakeId);
    assert.deepEqual(Object.keys(dryRun.sections), ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions']);
    assert.deepEqual(dryRun.workflow, [
      'raw-material capture',
      'domain analysis',
      'gap index',
      'stakeholder questions',
      'decision cards',
      'requirements approval',
      'backlog guidance',
    ]);
    assert.match(dryRun.sections['open-questions'].join('\n'), /gap index/);
    assert.match(dryRun.required_outputs.join('\n'), /stakeholder question list/);
    assert.match(dryRun.rules.join('\n'), /blocking, can-mock, or later/);

    const out = run(`project analyze ${intakeId} --section requirements --stdin`, cwd, '## Requirements\n\n- goal\n');
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));

    assert.match(out, /project analysis 已写入/);
    assert.equal(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'analysis', 'requirements.md'), 'utf-8'), '## Requirements\n\n- goal\n');
    assert.equal(state.stage, 'captured');
    assert.equal(state.artifacts[0].kind, 'analysis');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project brief requires complete analysis and then writes brief evidence', () => {
    const cwd = mkWorkspace();
    const capture = run('project capture --title "Briefable Project" --content "source"', cwd);
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-briefable-project)/)?.[1];

    const blocked = runResult(`project brief ${intakeId} --stdin`, cwd);
    assert.notEqual(blocked.code, 0);
    assert.match(blocked.out, /missing analysis sections/);

    for (const section of ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions']) {
      run(`project analyze ${intakeId} --section ${section} --stdin`, cwd, `## ${section}\n`);
    }

    const dryRun = JSON.parse(run(`project brief ${intakeId} --dry-run`, cwd));
    assert.equal(dryRun.task, 'project-intake-brief');
    assert.equal(dryRun.recommended_write, `docpath project brief ${intakeId} --stdin`);
    assert.match(dryRun.required_content.join('\n'), /approval gate/);

    const out = run(`project brief ${intakeId} --stdin`, cwd, '# Project Brief\n');
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));

    assert.match(out, /project brief 已写入/);
    assert.match(out, new RegExp(`recommended_command: docpath project backlog ${intakeId} --dry-run`));
    assert.equal(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'brief.md'), 'utf-8'), '# Project Brief\n');
    assert.equal(state.stage, 'briefed');
    assert.ok(state.artifacts.some((artifact) => artifact.kind === 'brief'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project backlog blocks unconfirmed decomposition and writes confirmed guidance', () => {
    const cwd = mkWorkspace();
    const capture = run('project capture --title "Backlog Ready" --content "source"', cwd);
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-backlog-ready)/)?.[1];
    for (const section of ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions']) {
      run(`project analyze ${intakeId} --section ${section} --stdin`, cwd, `## ${section}\n`);
    }
    run(`project brief ${intakeId} --stdin`, cwd, '# Project Brief\n');

    const dryRun = JSON.parse(run(`project backlog ${intakeId} --dry-run`, cwd));
    assert.equal(dryRun.task, 'project-intake-backlog-decomposition');
    assert.match(dryRun.intent, /After explicit approval/);
    assert.match(dryRun.guardrails.join('\n'), /does not auto-create executable backlog items/);
    assert.match(dryRun.recommended_command_template, new RegExp(`project-intake/${intakeId}/brief\\.md`));

    const blocked = runResult(`project backlog ${intakeId}`, cwd);
    assert.notEqual(blocked.code, 0);
    assert.match(blocked.out, /requires --confirm <text>/);

    const out = run(`project backlog ${intakeId} --confirm "用户确认拆分 backlog"`, cwd);
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));
    const guidance = readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'backlog.md'), 'utf-8');

    assert.match(out, /project backlog guidance 已写入/);
    assert.equal(state.stage, 'confirmed');
    assert.equal(state.user_confirmed, '用户确认拆分 backlog');
    assert.match(guidance, /docpath backlog add/);
    assert.match(guidance, /Requirements-shaping guardrails/);
    assert.match(guidance, /Do not create executable backlog from unapproved intake materials/);
    assert.match(guidance, new RegExp(`project-intake/${intakeId}/brief\\.md`));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project status reports agent-readable next actions by intake stage', () => {
    const cwd = mkWorkspace();
    const capture = run('project capture --title "Routed Intake" --content "source"', cwd);
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-routed-intake)/)?.[1];

    const captured = run(`project status ${intakeId} --agent`, cwd);
    assert.match(captured, /agent_view: project_status/);
    assert.match(captured, /recommended_command: "docpath project analyze .* --dry-run"/);

    for (const section of ['requirements', 'product', 'ui', 'technical', 'risks', 'open-questions']) {
      run(`project analyze ${intakeId} --section ${section} --stdin`, cwd, `## ${section}\n`);
    }
    run(`project brief ${intakeId} --stdin`, cwd, '# Project Brief\n');

    const briefed = run(`project status ${intakeId} --agent`, cwd);
    assert.match(briefed, /recommended_command: "docpath project backlog .* --dry-run"/);

    run(`project backlog ${intakeId} --confirm "confirmed"`, cwd);
    const confirmed = run(`project status ${intakeId} --agent`, cwd);
    assert.match(confirmed, /recommended_command: "docpath backlog add --title/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
