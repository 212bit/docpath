import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-doctor-ack-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: doctor-ack-test\n');

  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf-8', timeout: 60000 }).trim();
}

// 场景：live.md 引用已废弃的 old.md（产生 deprecated-reference，链接目标 ./old.md）
function seedDeprecatedRef(cwd) {
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'docs', 'live.md'), '# Live\n\n参考 [旧指南](./old.md)。\n', 'utf-8');
  writeFileSync(
    join(cwd, 'docs', 'old.md'),
    '---\nstatus: deprecated\n---\n# Old Guide\n\n已废弃，仅供追溯。\n',
    'utf-8',
  );
  run(['docs', 'scan'], cwd);
}

function writeAck(cwd, yamlBody) {
  const text = Array.isArray(yamlBody) ? yamlBody.join('\n') : yamlBody;
  writeFileSync(join(cwd, '.docpath', 'docs-doctor-ack.yaml'), text, 'utf-8');
}

describe('docs doctor 警告豁免机制 (docs-doctor-ack.yaml)', () => {
  it('rule+file+target 精确匹配的豁免抑制警告，且逐条输出理由保持透明', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);

    // 未豁免时警告存在
    let out = run(['docs', 'doctor'], cwd);
    assert.match(out, /引用了已废弃\/归档文档/);

    writeAck(
      cwd,
      [
        'acknowledgements:',
        '  - rule: deprecated-reference',
        '    file: docs/live.md',
        '    target: ./old.md',
        '    reason: 本节职责即说明旧设计已失效，引用归档稿是有意行为',
        '    since: "2026-10-07"',
        '',
      ].join('\n'),
    );

    out = run(['docs', 'doctor'], cwd);
    assert.match(out, /🤐  已豁免 1 条警告/);
    assert.match(out, /\[deprecated-reference\] docs\/live\.md → \.\/old\.md: 本节职责即说明旧设计已失效/);
    // stats 口径同步：警告被抑制后不再计入废弃引用
    assert.match(out, /✅ 无过期引用/);
  });

  it('target 不匹配的豁免不抑制警告', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);
    writeAck(
      cwd,
      [
        'acknowledgements:',
        '  - rule: deprecated-reference',
        '    file: docs/live.md',
        '    target: ./other.md',
        '    reason: 与本警告无关的豁免',
        '',
      ].join('\n'),
    );

    const out = run(['docs', 'doctor'], cwd);
    assert.match(out, /引用了已废弃\/归档文档/);
    assert.doesNotMatch(out, /已豁免 1 条警告/);
  });

  it('缺 reason 的豁免条目被报为清单问题，且不抑制警告', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);
    writeAck(
      cwd,
      ['acknowledgements:', '  - rule: deprecated-reference', '    file: docs/live.md', ''],
    );

    const out = run(['docs', 'doctor'], cwd);
    assert.match(out, /豁免清单问题/);
    assert.match(out, /缺 reason/);
    assert.match(out, /引用了已废弃\/归档文档/);
  });

  it('仅 rule（不带 file/target）的豁免覆盖该规则全部实例', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);
    writeFileSync(join(cwd, 'docs', 'live2.md'), '# Live 2\n\n另见 [旧指南](./old.md)。\n', 'utf-8');
    run(['docs', 'scan'], cwd);
    writeAck(
      cwd,
      ['acknowledgements:', '  - rule: deprecated-reference', '    reason: 本仓库演示场景，全部有意保留', ''],
      cwd,
    );

    const out = run(['docs', 'doctor'], cwd);
    assert.match(out, /🤐  已豁免 2 条警告/);
  });

  it('agent 视图输出 suppressed_count 与 ack_problems', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);
    writeAck(
      cwd,
      ['acknowledgements:', '  - rule: deprecated-reference', '    reason: 有意引用', ''],
      cwd,
    );

    const out = run(['docs', 'doctor', '--agent'], cwd);
    assert.match(out, /suppressed_count: 1/);
    assert.match(out, /ack_problems: \[\]/);
  });
});

describe('docs doctor 机器区块过期检测 (stale-graph-block)', () => {
  it('docs/README.md 的 docs-index 机器区块落后于图状态时告警，graph --fix 后恢复', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);

    // 手写一个内容与当前图状态不符的过期区块
    writeFileSync(
      join(cwd, 'docs', 'README.md'),
      [
        '# Docs Index',
        '',
        '<!-- docpath:block docs-index -->',
        '<!-- 由 `docpath docs graph --fix` 自动生成；块外内容手工维护，请勿编辑本机器区 -->',
        '',
        '## 文档关联图谱 (docs graph)',
        '',
        '> 全部 999 篇文档，按目录分类；出/入为 docs graph 关联计数。孤立 = 无出链且无入链。',
        '',
        '<!-- /docpath:block -->',
        '',
      ].join('\n'),
      'utf-8',
    );

    let out = run(['docs', 'doctor'], cwd);
    assert.match(out, /机器区块落后于当前文档图状态/);
    assert.match(out, /docpath docs graph --fix/);

    // 重生成后告警消除
    run(['docs', 'graph', '--fix'], cwd);
    out = run(['docs', 'doctor'], cwd);
    assert.doesNotMatch(out, /机器区块落后于当前文档图状态/);
  });

  it('未启用机器区块的仓库不告警', () => {
    const cwd = mkRepo();
    seedDeprecatedRef(cwd);
    const out = run(['docs', 'doctor'], cwd);
    assert.doesNotMatch(out, /机器区块落后/);
  });
});

describe('docs doctor 孤立口径同源可见性 (S1)', () => {
  it('无孤立时也输出计数行，注明与 docs graph 同源', () => {
    const cwd = mkRepo();
    // 图的边来自 frontmatter related（非正文链接）：互链的两篇文档互不孤立
    mkdirSync(join(cwd, 'docs'), { recursive: true });
    writeFileSync(join(cwd, 'docs', 'a.md'), '---\nrelated:\n  - b.md\n---\n# A\n\n关联 B。\n', 'utf-8');
    writeFileSync(join(cwd, 'docs', 'b.md'), '---\nrelated:\n  - a.md\n---\n# B\n\n关联 A。\n', 'utf-8');
    run(['docs', 'scan'], cwd);

    const out = run(['docs', 'doctor'], cwd);
    assert.match(out, /孤立文档检测: 0 篇（规则与 docs graph 同源/);
  });
});
