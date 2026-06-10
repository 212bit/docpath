import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ phase = 'drafting', gate = 'none' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-write-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: write-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-WRITE',
    task_title: 'Write Commands',
    phase,
    gate,
    current_step: 'drafting',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Current Spec\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function runWithInput(args, cwd, input) {
  return execSync(`node ${BIN} ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    input,
  });
}

function runResult(args, cwd) {
  try {
    return {
      code: 0,
      out: run(args, cwd),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

function runResultWithInput(args, cwd, input) {
  try {
    return {
      code: 0,
      out: runWithInput(args, cwd, input),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('write commands', () => {
  it('write-spec rejects malformed spec content and keeps file unchanged', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const specPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.md');
    writeFileSync(specPath, '# Existing Spec\n');

    const result = runResultWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, '# 缺少结构\n\n只有一行正文\n');

    assert.equal(result.code, 1);
    assert.match(result.out, /spec\.md 结构校验失败/);
    assert.match(result.out, /实际目标: .*\.docpath\/tasks\/T-WRITE\/spec\.md/);
    assert.match(result.out, /current 视图: .*\.docpath\/tasks\/current\/spec\.md/);
    assert.match(result.out, /缺少 `### 功能需求` 章节/);
    assert.match(result.out, /section ## 2\. 需求清单/);
    assert.match(result.out, /缺少至少一条 `FR-\*` 功能需求/);
    assert.match(result.out, /field FR-\*/);
    assert.equal(readFileSync(specPath, 'utf-8'), '# Existing Spec\n');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-spec accepts valid structured spec content', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const spec = [
      '# T-WRITE - 合法 Spec',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 需要结构化校验',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- 写命令校验',
      '',
      '### 不包含',
      '- 模板重写',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 校验 | 非空 / 结构 | 结构 | fail loud |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 非法输入会失败',
      '',
    ].join('\n');

    const output = runWithInput(`write-spec --cwd ${cwd} --stdin`, cwd, spec);
    assert.match(output, /spec\.md 已写入/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8'), /FR-1/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.md'), 'utf-8'), /FR-1/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-plan writes plan.md and advances to go route', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const content = [
      '## 执行计划',
      '',
      '### S1: implement write-plan',
      '- **描述**: 实现 write-plan',
      '- **验收条件**: plan.md 成功写入',
      '- **依赖**: 无',
      '',
    ].join('\n');
    const output = runWithInput(`write-plan --cwd ${cwd} --stdin`, cwd, content);

    assert.match(output, /plan\.md 已写入/);
    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(plan, /S1: implement write-plan/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'plan.md'), 'utf-8'), /S1: implement write-plan/);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'planning');

    const next = run(`next --cwd ${cwd} --agent`, cwd);
    assert.match(next, /recommended_command: docpath go/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-plan rejects steps missing required fields and keeps file unchanged', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const planPath = join(cwd, '.docpath', 'tasks', 'current', 'plan.md');
    writeFileSync(planPath, '## 执行计划\n\n### S0: keep\n- **描述**: old\n- **验收条件**: old\n- **依赖**: 无\n');

    const invalidPlan = [
      '## 执行计划',
      '',
      '### S1: broken plan',
      '- **描述**: 只有描述',
      '',
    ].join('\n');
    const result = runResultWithInput(`write-plan --cwd ${cwd} --stdin`, cwd, invalidPlan);

    assert.equal(result.code, 1);
    assert.match(result.out, /plan\.md 结构校验失败/);
    assert.match(result.out, /实际目标: .*\.docpath\/tasks\/T-WRITE\/plan\.md/);
    assert.match(result.out, /current 视图: .*\.docpath\/tasks\/current\/plan\.md/);
    assert.match(result.out, /以下步骤缺少 `验收条件`: S1 \(line 3, section S1, field 验收条件\)/);
    assert.match(result.out, /以下步骤缺少 `依赖`: S1 \(line 3, section S1, field 依赖\)/);
    assert.match(readFileSync(planPath, 'utf-8'), /### S0: keep/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan syncs canonical plan into tasks/current so go can continue immediately', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });

    const spec = [
      '# T-WRITE - 合法 Spec',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 需要计划同步',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- plan 到 go 主路径',
      '',
      '### 不包含',
      '- 新命令',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 同步策略 | current / canonical | current | 保证 go 可直接读取 |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: plan 后 go 可继续',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);

    const plan = [
      '## 执行计划',
      '',
      '### S1: continue after plan',
      '- **描述**: plan 后直接 go',
      '- **验收条件**: go 能读取 current plan',
      '- **依赖**: 无',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'plan.md'), plan);

    const output = run(`plan --cwd ${cwd}`, cwd);
    assert.match(output, /建议命令: docpath go --step S1/);

    const currentPlan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(currentPlan, /continue after plan/);

    const goOutput = run(`go --cwd ${cwd} --step S1 --dry-run`, cwd);
    assert.match(goOutput, /子任务: S1/);
    assert.doesNotMatch(goOutput, /未找到 plan\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('plan generates a draft plan when no plan.md exists yet', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const canonicalDir = join(cwd, '.docpath', 'tasks', 'T-WRITE');
    mkdirSync(canonicalDir, { recursive: true });

    const spec = [
      '# T-WRITE - 自动计划',
      '',
      '## 1. 背景与动机',
      '',
      '补充背景',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: 自动生成计划草案',
      '',
      '### 非功能需求',
      '- [ ] NFR-1: 保持兼容',
      '',
      '## 3. 范围界定',
      '',
      '### 包含',
      '- docpath plan 自动写入 plan.md',
      '',
      '### 不包含',
      '- LLM 调用',
      '',
      '## 4. 关键决策',
      '',
      '| # | 决策 | 选项 | 结论 | 理由 |',
      '|---|------|------|------|------|',
      '| 1 | 计划生成 | 草案 / 空状态 | 草案 | 减少断点 |',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: plan 后 go 可直接执行',
      '',
    ].join('\n');
    writeFileSync(join(canonicalDir, 'spec.md'), spec);
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), spec);

    const output = run(`plan --cwd ${cwd}`, cwd);

    assert.match(output, /plan\.md 已写入/);
    assert.match(output, /建议命令: docpath go --step S1/);
    const currentPlan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(currentPlan, /S1: 梳理 自动生成计划草案/);
    assert.match(currentPlan, /S2: 实现 自动生成计划草案/);
    assert.match(readFileSync(join(canonicalDir, 'plan.md'), 'utf-8'), /S3: 验证门禁并归档/);

    const goOutput = run(`go --cwd ${cwd} --step S1 --dry-run`, cwd);
    assert.match(goOutput, /子任务: S1/);
    assert.doesNotMatch(goOutput, /未找到 plan\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-journal appends journal record into spec.md', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    const output = run(`write-journal --cwd ${cwd} --content "### 📝 任务摘要\\n完成断头引用修复"`, cwd);

    assert.match(output, /journal 记录已写入/);
    const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
    assert.match(spec, /## Journal Record/);
    assert.match(spec, /完成断头引用修复/);
    assert.match(readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'spec.md'), 'utf-8'), /## Journal Record/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-analysis writes section files to canonical and current analysis dirs', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const analysis = [
      '# UI Analysis',
      '',
      '- 页面/组件清单: 筛选栏、表格、详情抽屉',
      '- 状态: 空态、错误态、加载态',
      '',
    ].join('\n');

    const output = run(`write-analysis --cwd ${cwd} --section ui --content ${JSON.stringify(analysis)}`, cwd);
    assert.match(output, /analysis\/ui\.md 已写入/);

    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'analysis', 'ui.md'), 'utf-8');
    const current = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis', 'ui.md'), 'utf-8');
    assert.match(canonical, /详情抽屉/);
    assert.equal(current, canonical);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-analysis keeps legacy analysis.md compatibility when no section is provided', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    const analysis = '# Predev Analysis\n\n## UI/UX 分析\n- 表格、详情抽屉\n';

    const output = run(`write-analysis --cwd ${cwd} --content ${JSON.stringify(analysis)}`, cwd);
    assert.match(output, /analysis\.md 已写入/);

    const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', 'analysis.md'), 'utf-8');
    const current = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis.md'), 'utf-8');
    assert.match(canonical, /UI\/UX 分析/);
    assert.equal(current, canonical);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('write-design writes brief, handoff, approval, preview and acceptance artifacts', () => {
    const cwd = mkWorkspace({ phase: 'executing', gate: 'none' });
    const artifacts = [
      ['brief', 'ui-brief.md', '# UI Prompt Brief\n\n## Product Context\n'],
      ['handoff', 'external-design-handoff.md', '# External Design Handoff\n\n## Tool Inputs\n'],
      ['approval', 'design-approval.md', '---\napproval:\n  state: approved\n---\n# Design Approval\n'],
      ['preview', 'design-preview.md', '# Design Preview\n\n布局 状态 响应式 snapshot HTML '.repeat(20)],
      ['acceptance', 'visual-acceptance.md', '# Visual Acceptance\n\n验收 必须 不得 snapshot HTML 截图 review 对比 可读 导航 '.repeat(10)],
    ];

    for (const [kind, file, content] of artifacts) {
      const output = runWithInput(`write-design --cwd ${cwd} --kind ${kind} --stdin`, cwd, content);
      assert.match(output, new RegExp(`${file} 已写入`));
      const canonical = readFileSync(join(cwd, '.docpath', 'tasks', 'T-WRITE', file), 'utf-8');
      const current = readFileSync(join(cwd, '.docpath', 'tasks', 'current', file), 'utf-8');
      assert.match(canonical, new RegExp(content.trim().split('\n')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(current, canonical);
    }

    rmSync(cwd, { recursive: true, force: true });
  });

});
