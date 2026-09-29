import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * docs graph 关联图谱定向测试夹具
 *
 * 词表设计（内容词 + 标题词按组隔离，避免跨组误命中推荐）：
 * - P1: fix-a/fix-b 高置信唯一候选对（score ~0.93）
 * - P2: fix-c(含 frontmatter owner)/fix-d 合并写入对
 * - rec-x/y/z: 三角多候选（歧义，不自动写入）
 * - linked-a --related--> linked-b + README（入链聚合 + 破除孤立）
 * - isolated/no-fm/empty-related/invalid-related: 孤立或容错样例
 */
function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docsgraph-'));
  const dp = join(cwd, '.docpath');
  const docs = join(cwd, 'docs');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(docs, { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: docs-graph-test\ndocument_scan_paths:\n  - README.md\n  - docs\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\nStyle guidelines for tests.\n');

  writeFileSync(join(docs, 'README.md'), [
    'MANUAL-DOCS-HUB-HEADER',
    '# Hub Center',
    '',
    'readme hub index words.',
    '',
    'MANUAL-DOCS-HUB-FOOTER',
    '',
  ].join('\n'));
  writeFileSync(join(docs, 'linked-a.md'), '---\nrelated:\n  - linked-b.md\n  - README.md\n---\n# Wiring One\n\nllama one.\n');
  writeFileSync(join(docs, 'linked-b.md'), '# Wiring Two\n\nllama two.\n');
  writeFileSync(join(docs, 'isolated.md'), '# Isolated Doc\n\nzeta qwe asdf.\n');
  writeFileSync(join(docs, 'no-fm.md'), '# Mango Guide\n\nmango papaya juice.\n');
  writeFileSync(join(docs, 'empty-related.md'), '---\nrelated: []\n---\n# Empty Crate\n\nkiwi lemon soda.\n');
  writeFileSync(join(docs, 'invalid-related.md'), '---\nrelated:\n  - ../outside.md\n  - ghost-doc.md\n---\n# Invalid Wire\n\nvanilla walnut weird.\n');
  writeFileSync(join(docs, 'fix-a.md'), '# Guides Alpha Engine\n\nalpha beta gamma engine.\n');
  writeFileSync(join(docs, 'fix-b.md'), '# Guides Beta Engine\n\nalpha beta gamma delta.\n');
  writeFileSync(join(docs, 'fix-c.md'), '---\nowner: yoda\n---\n# Notes Gamma Extra\n\npurple orange silver engine2.\n');
  writeFileSync(join(docs, 'fix-d.md'), '# Notes Delta Extra\n\npurple orange silver engine3.\n');
  writeFileSync(join(docs, 'rec-x.md'), '# Report Xray\n\nshared1 shared2 shared3 xx.\n');
  writeFileSync(join(docs, 'rec-y.md'), '# Report Yankee\n\nshared1 shared2 shared3 yy.\n');
  writeFileSync(join(docs, 'rec-z.md'), '# Report Zulu\n\nshared1 shared2 shared3 zz.\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000 });
}

function runResult(args, cwd) {
  try {
    return { ok: true, output: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { ok: false, output: `${err.stdout?.toString('utf-8') || ''}${err.stderr?.toString('utf-8') || ''}` };
  }
}

function readIndex(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
}

function stripBlock(text) {
  return text.replace(/<!-- docpath:block docs-index -->[\s\S]*?<!-- \/docpath:block -->\n?/g, '');
}

describe('docs graph 关联图谱', () => {
  it('docs scan 写入 version 2 索引: related 原文保留 / backlinks 聚合 / 无 frontmatter 容错', () => {
    const cwd = mkWorkspace();
    try {
      run('docs scan', cwd);
      const index = readIndex(cwd);
      assert.equal(index.version, 2);

      const linkedA = index.entries.find((e) => e.path === 'docs/linked-a.md');
      assert.ok(linkedA, 'linked-a 应被索引');
      assert.deepEqual(linkedA.related, ['linked-b.md', 'README.md'], 'related 原文保留');

      const linkedB = index.entries.find((e) => e.path === 'docs/linked-b.md');
      assert.ok(linkedB);
      assert.ok(Array.isArray(linkedB.backlinks) && linkedB.backlinks.includes('docs/linked-a.md'), 'backlinks 聚合反推');

      const readme = index.entries.find((e) => e.path === 'docs/README.md');
      assert.ok(readme);
      assert.ok(Array.isArray(readme.backlinks) && readme.backlinks.includes('docs/linked-a.md'));

      const noFm = index.entries.find((e) => e.path === 'docs/no-fm.md');
      assert.ok(noFm);
      assert.ok(!noFm.related || noFm.related.length === 0, '无 frontmatter 容错为空');
      assert.ok(!noFm.backlinks || noFm.backlinks.length === 0);

      const emptyRel = index.entries.find((e) => e.path === 'docs/empty-related.md');
      assert.ok(emptyRel);
      assert.ok(!emptyRel.related || emptyRel.related.length === 0, '空 related 容错为空');

      const invalidRel = index.entries.find((e) => e.path === 'docs/invalid-related.md');
      assert.ok(invalidRel);
      assert.deepEqual(invalidRel.related, ['../outside.md', 'ghost-doc.md'], '非法路径原文保留不抛异常');
      assert.ok(!invalidRel.backlinks || invalidRel.backlinks.length === 0, '非法路径不产生图边');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('version 1 索引向后兼容读取, docs graph 自动升级为 version 2', () => {
    const cwd = mkWorkspace();
    try {
      const v1 = {
        version: 1,
        generated_at: '2026-01-01T00:00:00.000Z',
        entries: [
          { path: 'docs/README.md', title: 'Hub Center', type: 'index', scope: 'project', level: '2', summary: 'hub', updated_at: '2026-01-01T00:00:00.000Z', size: 100, token_estimate: 30, default_read: false, archive: false },
        ],
      };
      writeFileSync(join(cwd, '.docpath', 'docs-index.json'), JSON.stringify(v1));

      // 读取端不破: v1 索引可被 docs list 正常消费
      const listed = runResult('docs list', cwd);
      assert.ok(listed.ok, `docs list 应成功: ${listed.output}`);
      assert.match(listed.output, /docs\/README\.md/);

      // graph 自动迁移升级
      const graph = runResult('docs graph', cwd);
      assert.ok(graph.ok, `docs graph 应成功: ${graph.output}`);
      assert.equal(readIndex(cwd).version, 2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docs graph 报告孤立清单 + 推荐候选带分数', () => {
    const cwd = mkWorkspace();
    try {
      run('docs scan', cwd);
      const out = run('docs graph', cwd);

      assert.match(out, /孤立文档/);
      assert.match(out, /docs\/isolated\.md/);
      assert.match(out, /docs\/no-fm\.md/);
      // linked-a 有出链、linked-b/README 有入链 → 非孤立
      assert.doesNotMatch(out, /- docs\/linked-a\.md \[孤立\]/);
      assert.doesNotMatch(out, /- docs\/linked-b\.md \[孤立\]/);
      assert.doesNotMatch(out, /- docs\/README\.md \[孤立\]/);

      // 推荐候选带分数 (P1 对: 正文+标题词高度重合 → score 1.00; 歧义三角 score ~0.75)
      assert.match(out, /docs\/fix-a\.md/);
      assert.match(out, /→ docs\/fix-b\.md \(score \d\.\d{2}\)/);
      assert.match(out, /→ docs\/rec-y\.md \(score 0\.7\d\)/);
      assert.match(out, /高置信/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docs graph --mermaid 输出合法 mermaid graph', () => {
    const cwd = mkWorkspace();
    try {
      run('docs scan', cwd);
      const out = run('docs graph --mermaid', cwd).trim();
      const lines = out.split('\n');

      assert.equal(lines[0], 'graph TD');
      const nodeRe = /^  n\d+\["[^"]*"\]$/;
      const edgeRe = /^  n\d+ --> n\d+$/;
      const nodeIds = new Map();
      for (const line of lines.slice(1)) {
        assert.ok(nodeRe.test(line) || edgeRe.test(line), `非法 mermaid 行: ${JSON.stringify(line)}`);
        const nodeMatch = line.match(/^  (n\d+)\["([^"]*)"\]$/);
        if (nodeMatch) nodeIds.set(nodeMatch[2], nodeMatch[1]);
      }

      // 14 篇 fixture 文档全部成为节点（含孤立节点）
      assert.equal(nodeIds.size, 14);
      assert.ok(nodeIds.has('docs/isolated.md'), '孤立节点也须声明');
      // linked-a --related--> linked-b 与 README 两条边
      assert.ok(out.includes(`${nodeIds.get('docs/linked-a.md')} --> ${nodeIds.get('docs/linked-b.md')}`));
      assert.ok(out.includes(`${nodeIds.get('docs/linked-a.md')} --> ${nodeIds.get('docs/README.md')}`));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docs graph --fix 写入 frontmatter + 重建 README 机器区(幂等, 块外逐字节保留) + 剩余低置信清单', () => {
    const cwd = mkWorkspace();
    const readmePath = join(cwd, 'docs', 'README.md');
    try {
      run('docs scan', cwd);
      const readmeBefore = readFileSync(readmePath, 'utf-8');
      const fixABefore = readFileSync(join(cwd, 'docs', 'fix-a.md'), 'utf-8');

      const out = run('docs graph --fix', cwd);

      // 高置信度唯一候选 → 自动写入 frontmatter related (无 frontmatter 文件前置新块, 原文保留)
      const fixA = readFileSync(join(cwd, 'docs', 'fix-a.md'), 'utf-8');
      assert.ok(fixA.startsWith('---\nrelated:'), 'fix-a 应新增 frontmatter');
      assert.match(fixA, /- fix-b\.md/);
      assert.ok(fixA.includes(fixABefore), 'fix-a 原有正文逐字节保留');

      // 已有 frontmatter 文件: 合并 related 且保留既有键
      const fixC = readFileSync(join(cwd, 'docs', 'fix-c.md'), 'utf-8');
      assert.match(fixC, /owner: yoda/);
      assert.match(fixC, /- fix-d\.md/);
      assert.ok(fixC.includes('# Notes Gamma Extra'));

      // 歧义多候选不自动写入
      const recX = readFileSync(join(cwd, 'docs', 'rec-x.md'), 'utf-8');
      assert.doesNotMatch(recX, /related:/);

      // README 机器区重建, 块外内容逐字节保留
      const readmeAfter = readFileSync(readmePath, 'utf-8');
      assert.match(readmeAfter, /<!-- docpath:block docs-index -->/);
      assert.match(readmeAfter, /<!-- \/docpath:block -->/);
      assert.match(readmeAfter, /docs\/fix-a\.md/);
      assert.match(readmeAfter, /出 \d/);
      assert.equal(stripBlock(readmeAfter), stripBlock(readmeBefore), '块外内容逐字节保留');

      // 幂等: 二次 fix 不产生任何漂移
      const block1 = readmeAfter.match(/<!-- docpath:block docs-index -->[\s\S]*?<!-- \/docpath:block -->/)[0];
      run('docs graph --fix', cwd);
      const readmeAfter2 = readFileSync(readmePath, 'utf-8');
      assert.equal(stripBlock(readmeAfter2), stripBlock(readmeBefore));
      const block2 = readmeAfter2.match(/<!-- docpath:block docs-index -->[\s\S]*?<!-- \/docpath:block -->/)[0];
      assert.equal(block1, block2, '机器区重建幂等');
      const fixA2 = readFileSync(join(cwd, 'docs', 'fix-a.md'), 'utf-8');
      assert.equal(fixA2, fixA, 'frontmatter 写入幂等, 不重复追加');

      // 剩余低置信度多候选清单供人工决策
      assert.match(out, /低置信度候选/);
      assert.match(out, /docs\/rec-y\.md/);
      assert.match(out, /docs\/rec-z\.md/);

      // fix 后索引保持 version 2 且回填新 related
      const index = readIndex(cwd);
      assert.equal(index.version, 2);
      const fixAEntry = index.entries.find((e) => e.path === 'docs/fix-a.md');
      assert.ok(Array.isArray(fixAEntry.related) && fixAEntry.related.includes('fix-b.md'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('docs lint 并入孤立文档规则', () => {
    const cwd = mkWorkspace();
    try {
      run('docs scan', cwd);
      run('docs graph --fix', cwd);
      const out = run('docs lint', cwd);

      assert.match(out, /孤立文档检测/);
      assert.match(out, /孤立文档: docs\/isolated\.md/);
      assert.match(out, /孤立文档: docs\/rec-x\.md/);
      // 有出链/入链的文档不告警; fix 后的文档不再是孤立
      assert.doesNotMatch(out, /孤立文档: docs\/linked-a\.md/);
      assert.doesNotMatch(out, /孤立文档: docs\/fix-a\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
