import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let transitionBacklog;
let listBacklogItems;
let readBacklogItem;
let writeBacklogItem;
let nextBacklogId;
let setBacklogStatus;
let refreshBacklogIndex;
let createBacklogItem;
let detectBacklogIdCollisions;
let archiveBacklogItem;
let detectBacklogDuplicates;
let cleanBacklogTitle;
let calculateTitleSimilarity;

before(async () => {
  ({
    transitionBacklog,
    listBacklogItems,
    readBacklogItem,
    writeBacklogItem,
    nextBacklogId,
    setBacklogStatus,
    refreshBacklogIndex,
    createBacklogItem,
    detectBacklogIdCollisions,
    archiveBacklogItem,
    detectBacklogDuplicates,
    cleanBacklogTitle,
    calculateTitleSimilarity,
  } = await import('../dist/engine/backlog.js'));
});

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-'));
  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: backlog-test\n');
  return cwd;
}

function sampleItem(overrides = {}) {
  return {
    id: 'R-001',
    title: 'Backlog Engine',
    status: 'proposed',
    priority: 'P1',
    level: 2,
    source: 'test',
    links: {
      task: null,
      spec: null,
    },
    created_at: '2026-05-31',
    body: '短背景\n\n## 验收\n- 能读写往返',
    ...overrides,
  };
}

describe('backlog engine', () => {
  it('accepts legal transitions and rejects illegal ones', () => {
    assert.equal(transitionBacklog('proposed', 'accepted'), 'accepted');
    assert.equal(transitionBacklog('accepted', 'planned'), 'planned');
    assert.equal(transitionBacklog('active', 'done'), 'done');
    assert.equal(transitionBacklog('planned', 'planned'), 'planned');
    // R-346: 矩阵放行旁路终态；任务证据校验统一在 setBacklogStatus 层，保持矩阵纯净
    assert.equal(transitionBacklog('proposed', 'done'), 'done');
    assert.equal(transitionBacklog('accepted', 'done'), 'done');
    assert.equal(transitionBacklog('planned', 'done'), 'done');
    assert.throws(() => transitionBacklog('done', 'active'), /Illegal backlog transition/);
  });

  it('returns empty list when backlog directory is missing', async () => {
    const cwd = mkWorkspace();
    const items = await listBacklogItems(cwd);
    assert.deepEqual(items, []);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes and reads backlog item roundtrip while preserving existing slug file', async () => {
    const cwd = mkWorkspace();
    const item = sampleItem();

    await writeBacklogItem(cwd, item);
    const firstPath = join(cwd, '.docpath', 'backlog', 'R-001-backlog-engine.md');
    const firstContent = readFileSync(firstPath, 'utf-8');
    assert.match(firstContent, /title: Backlog Engine/);

    await writeBacklogItem(cwd, sampleItem({ title: 'Changed Title', status: 'accepted' }));
    const loaded = await readBacklogItem(cwd, 'R-001');

    assert.ok(loaded);
    assert.equal(loaded.title, 'Changed Title');
    assert.equal(loaded.status, 'accepted');
    assert.equal(readFileSync(firstPath, 'utf-8').includes('Changed Title'), true);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('allocates next backlog id monotonically from existing files', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-002-alpha.md'), `---
id: R-002
title: Alpha
status: proposed
priority: P2
level: 1
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha body
`);
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-007-beta.md'), `---
id: R-007
title: Beta
status: accepted
priority: P0
level: 3
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Beta body
`);

    assert.equal(await nextBacklogId(cwd), 'R-008');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('allocates next backlog id monotonically from archived files', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-005-archived.md'), `---
id: R-005
title: Archived
status: done
priority: P2
level: 1
source: test
links:
  task: T-20260617-archived
  spec: .docpath/tasks/T-20260617-archived/spec.md
created_at: 2026-05-31
---

Archived body
`);

    assert.equal(await nextBacklogId(cwd), 'R-006');

    const item = await createBacklogItem(cwd, sampleItem({ title: 'After archive' }));
    assert.equal(item.id, 'R-006');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates backlog items with atomic id reservation', async () => {
    const cwd = mkWorkspace();
    const first = await createBacklogItem(cwd, sampleItem({ title: 'First atomic' }));
    const second = await createBacklogItem(cwd, sampleItem({ id: 'R-999', title: 'Second atomic' }));

    assert.equal(first.id, 'R-001');
    assert.equal(second.id, 'R-002');
    const items = await listBacklogItems(cwd);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => item.id), ['R-001', 'R-002']);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('decouples plain writes from index rebuild; index updates only on explicit refresh (FR-1)', async () => {
    const cwd = mkWorkspace();

    await writeBacklogItem(cwd, sampleItem({
      id: 'R-003',
      title: 'Third',
      priority: 'P2',
      links: { task: 'T-003', spec: null },
    }));
    await writeBacklogItem(cwd, sampleItem({
      id: 'R-001',
      title: 'First',
      priority: 'P0',
      status: 'accepted',
    }));
    await writeBacklogItem(cwd, sampleItem({
      id: 'R-002',
      title: 'Second',
      priority: 'P0',
      status: 'planned',
    }));

    // FR-1：普通写入不再隐式触发索引重建/归档——写后条目文件在，但 backlog.md 尚未生成
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'R-001-first.md')));
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'R-002-second.md')));
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'R-003-third.md')));
    assert.ok(!existsSync(join(cwd, '.docpath', 'backlog', 'backlog.md')), 'plain write 不应隐式生成索引');

    // 显式 refresh 后才落索引，且按 priority 再 id 排序
    await refreshBacklogIndex(cwd);
    const indexPath = join(cwd, '.docpath', 'backlog', 'backlog.md');
    const index = readFileSync(indexPath, 'utf-8');

    assert.match(index, /\| id \| title \| status \| priority \| level \| task \|/);
    const first = index.indexOf('| R-001 | First | accepted | P0 | 2 |  |');
    const second = index.indexOf('| R-002 | Second | planned | P0 | 2 |  |');
    const third = index.indexOf('| R-003 | Third | proposed | P2 | 2 | T-003 |');
    assert.ok(first !== -1 && second !== -1 && third !== -1, 'all rows should be present');
    assert.ok(first < second && second < third, 'rows should be sorted by priority then id');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('setBacklogStatus persists valid transitions and rejects missing items', async () => {
    const cwd = mkWorkspace();
    await writeBacklogItem(cwd, sampleItem({ status: 'accepted' }));

    const updated = await setBacklogStatus(cwd, 'R-001', 'planned');
    assert.equal(updated.status, 'planned');
    assert.equal((await readBacklogItem(cwd, 'R-001'))?.status, 'planned');
    await assert.rejects(() => setBacklogStatus(cwd, 'R-404', 'planned'), /backlog 条目不存在/);
    await assert.rejects(() => setBacklogStatus(cwd, 'R-001', 'done'), /需要任务证据/);
    rmSync(cwd, { recursive: true, force: true });
  });

  // R-346: quick 等旁路闭环的条目——done 必须携带真实任务证据，矩阵只负责放行、证据统一校验。
  describe('backlog bypass closeout with task evidence (R-346)', () => {
    function mkTaskEvidence(cwd, taskId) {
      mkdirSync(join(cwd, '.docpath', 'tasks', taskId), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'tasks', taskId, 'breadcrumb.jsonl'), '{"event":"run end"}\n');
    }

    it('closes accepted item with --task evidence and persists the link', async () => {
      const cwd = mkWorkspace();
      await writeBacklogItem(cwd, sampleItem({ status: 'accepted' }));
      mkTaskEvidence(cwd, 'T-900-quick');
      const item = await setBacklogStatus(cwd, 'R-001', 'done', { linkTask: 'T-900-quick' });
      assert.equal(item.status, 'done');
      assert.equal(item.links.task, 'T-900-quick');
      // done 条目被 refreshBacklogIndex 自动归档——回读验证落盘与链接持久化
      const archivedDir = join(cwd, '.docpath', 'backlog', 'archived');
      const archived = readdirSync(archivedDir).filter((f) => f.startsWith('R-001'));
      assert.equal(archived.length, 1, 'done 条目应归档且仅一份');
      const content = readFileSync(join(archivedDir, archived[0]), 'utf-8');
      assert.match(content, /status: done/);
      assert.match(content, /task: T-900-quick/);
      rmSync(cwd, { recursive: true, force: true });
    });

    it('rejects forged evidence: missing task dir or malformed task id', async () => {
      const cwd = mkWorkspace();
      await writeBacklogItem(cwd, sampleItem({ status: 'accepted' }));
      await assert.rejects(() => setBacklogStatus(cwd, 'R-001', 'done', { linkTask: 'T-404' }), /任务证据不存在/);
      await assert.rejects(() => setBacklogStatus(cwd, 'R-001', 'done', { linkTask: '../evil' }), /任务证据不存在/);
      rmSync(cwd, { recursive: true, force: true });
    });

    it('refuses silent overwrite of an existing different link', async () => {
      const cwd = mkWorkspace();
      await writeBacklogItem(cwd, sampleItem({ status: 'accepted', links: { task: 'T-800', spec: null } }));
      mkTaskEvidence(cwd, 'T-900-quick');
      await assert.rejects(() => setBacklogStatus(cwd, 'R-001', 'done', { linkTask: 'T-900-quick' }), /冲突/);
      rmSync(cwd, { recursive: true, force: true });
    });
  });

  it('fails loud on invalid frontmatter schema', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-bad.md'), `---
id: invalid
title:
status: queued
priority: P9
level: 8
source: test
links:
  task: null
  spec: null
created_at: today
---

bad
`);

    await assert.rejects(() => readBacklogItem(cwd, 'R-001'), /id 非法|title|status 非法|priority 非法|level 非法|created_at 非法/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('can refresh backlog index explicitly when directory exists but has no items', async () => {
    const cwd = mkWorkspace();
    await refreshBacklogIndex(cwd);

    const indexPath = join(cwd, '.docpath', 'backlog', 'backlog.md');
    const index = readFileSync(indexPath, 'utf-8');
    assert.match(index, /# DocPath Backlog Index/);
    assert.doesNotMatch(index, /\| R-\d+/);
    rmSync(cwd, { recursive: true, force: true });
  });

  // ── R-321/FR-1: 新条目文件名带 CJK 容错 slug ──

  it('creates new items with a CJK-tolerant slug filename', async () => {
    const cwd = mkWorkspace();
    const item = await createBacklogItem(cwd, sampleItem({ title: '状态哈希去重 next --agent' }));
    assert.equal(item.id, 'R-001');
    const files = readdirSync(join(cwd, '.docpath', 'backlog')).filter((f) => f.startsWith('R-001-'));
    assert.equal(files.length, 1);
    // 中文语义保留，ascii 小写，空白/连字符折叠
    assert.equal(files[0].normalize('NFC'), 'R-001-状态哈希去重-next-agent.md'.normalize('NFC'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('preserves pure-Chinese titles, truncates to 32 code points, and strips illegal chars', async () => {
    const cwd = mkWorkspace();
    const longTitle = '纯中文标题/需求: 一个非常非常非常非常非常非常非常非常非常非常长的标题用于验证截断';
    await createBacklogItem(cwd, sampleItem({ title: longTitle }));
    const files = readdirSync(join(cwd, '.docpath', 'backlog')).filter((f) => f.startsWith('R-001-'));
    assert.equal(files.length, 1);
    const slug = files[0].replace(/^R-001-/, '').replace(/\.md$/, '');
    assert.ok(!slug.includes('item'), '纯中文标题不应退化为 item');
    assert.ok(slug.includes('纯中文标题'), '中文语义应保留');
    assert.ok(Array.from(slug).length <= 32, `slug 应 <=32 码点, 实际 ${Array.from(slug).length}`);
    assert.ok(!/[\/\\:*?"<>|]/.test(slug), 'slug 不应含文件系统非法字符');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('still resolves legacy bare R-###.md filenames by id (FR-3 backward compat)', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-009.md'), `---
id: R-009
title: Legacy Bare
status: proposed
priority: P2
level: 1
source: test
links:
  task: null
  spec: null
created_at: 2026-07-13
---

legacy body
`);
    const loaded = await readBacklogItem(cwd, 'R-009');
    assert.ok(loaded);
    assert.equal(loaded.title, 'Legacy Bare');
    assert.equal(await nextBacklogId(cwd), 'R-010');
    rmSync(cwd, { recursive: true, force: true });
  });

  // ── R-321/FR-2: 非破坏性 id 撞号检测 ──

  it('detects active/archived same-id collisions non-destructively', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-005.md'), `---
id: R-005
title: Active Item
status: done
priority: P2
level: 1
source: test
links:
  task: T-active
  spec: tasks/T-active/spec.md
created_at: 2026-07-13
---

active body
`);
    writeFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-005.md'), `---
id: R-005
title: Archived Item
status: done
priority: P1
level: 2
source: test
links:
  task: T-archived
  spec: tasks/T-archived/spec.md
created_at: 2026-07-12
---

archived body
`);

    const collisions = await detectBacklogIdCollisions(cwd);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].id, 'R-005');
    assert.equal(collisions[0].active_title, 'Active Item');
    assert.equal(collisions[0].archived_title, 'Archived Item');
    assert.equal(collisions[0].identical, false);
    // 非破坏性：两侧文件均保留
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'R-005.md')));
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-005.md')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns no collisions when ids are unique across active and archived', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-a.md'), `---
id: R-001
title: A
status: proposed
priority: P2
level: 1
source: test
links:
  task: null
  spec: null
created_at: 2026-07-13
---

a
`);
    writeFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-002-b.md'), `---
id: R-002
title: B
status: done
priority: P2
level: 1
source: test
links:
  task: T-b
  spec: tasks/T-b/spec.md
created_at: 2026-07-12
---

b
`);
    assert.deepEqual(await detectBacklogIdCollisions(cwd), []);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('auto-archives dropped items alongside done at the status boundary (R-352 / FR-1)', async () => {
    const cwd = mkWorkspace();
    // FR-1：写路径解耦后，归档发生在状态转移边界（setBacklogStatus 内显式 refresh），
    // 而非普通 writeBacklogItem 隐式触发——drop 用 setBacklogStatus 走「即归档」语义。
    await writeBacklogItem(cwd, sampleItem({ id: 'R-010', title: 'Drop me', status: 'proposed' }));
    await setBacklogStatus(cwd, 'R-010', 'dropped');
    await writeBacklogItem(cwd, sampleItem({ id: 'R-011', title: 'Keep me', status: 'proposed' }));
    await refreshBacklogIndex(cwd);
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-010-drop-me.md')));
    assert.ok(!existsSync(join(cwd, '.docpath', 'backlog', 'R-010-drop-me.md')));
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'R-011-keep-me.md')));
    const index = readFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), 'utf-8');
    assert.ok(!index.includes('R-010'));
    assert.ok(index.includes('R-011'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('archives a terminal item explicitly and stays idempotent (R-352)', async () => {
    const cwd = mkWorkspace();
    const created = await createBacklogItem(cwd, sampleItem({ title: 'Archive me' }));
    // 注意：createBacklogItem 写 proposed 后如 refresh，active 里有文件；drop 写终态后
    // writeBacklogItem 内部 refresh 即把 dropped 归档（R-352），显式 archive 走幂等静默收尾。
    await setBacklogStatus(cwd, created.id, 'dropped');
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', 'archived', `${created.id}-archive-me.md`)));
    const repeat = await archiveBacklogItem(cwd, created.id);
    assert.equal(repeat.moved, false);
    assert.ok(repeat.file === null || repeat.file.includes(`${created.id}`));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects archiving non-terminal items (R-352)', async () => {
    const cwd = mkWorkspace();
    await writeBacklogItem(cwd, sampleItem({ id: 'R-030', title: 'Active one', status: 'active' }));
    await assert.rejects(() => archiveBacklogItem(cwd, 'R-030'), /只接受终态条目/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('detects same-title duplicates across active and archived (R-352)', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
    await writeBacklogItem(cwd, sampleItem({ id: 'R-040', title: 'Same Thing Twice', status: 'proposed' }));
    writeFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-009-same-thing-twice.md'), `---
id: R-009
title: Same Thing Twice
status: done
priority: P2
level: 1
source: test
links:
  task: T-old
  spec: tasks/T-old/spec.md
created_at: 2026-07-12
---

old body
`);
    const dups = await detectBacklogDuplicates(cwd, { id: 'R-040', title: 'Same Thing Twice' });
    assert.ok(dups.some((d) => d.kind === 'same-title' && d.archived_file?.includes('R-009')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('cleans redundant prefix noise from backlog titles and filenames (R-368, R-422)', async () => {
    assert.equal(cleanBacklogTitle('P0: Fix critical auth bug'), 'Fix critical auth bug');
    assert.equal(cleanBacklogTitle('[P1] Enhance search latency'), 'Enhance search latency');
    assert.equal(cleanBacklogTitle('R-356 - Root cause snapshot issue', 'R-356'), 'Root cause snapshot issue');
    assert.equal(cleanBacklogTitle('[dropped] Old concept'), 'Old concept');
    assert.equal(cleanBacklogTitle('[P0] [R-100] Complex title', 'R-100'), 'Complex title');

    // R-422: 外部引用的 R-### 不会被误杀
    assert.equal(cleanBacklogTitle('R-093 验收未兑现修复', 'R-102'), 'R-093 验收未兑现修复');
    assert.equal(cleanBacklogTitle('R-093: WS/DNS 传输支持', 'R-102'), 'R-093: WS/DNS 传输支持');
    assert.equal(cleanBacklogTitle('R-093 的验收标准修复'), 'R-093 的验收标准修复');

    const cwd = mkWorkspace();
    const created = await createBacklogItem(cwd, sampleItem({ title: 'P0: Auto Clean Title' }));
    assert.equal(created.title, 'Auto Clean Title');
    assert.ok(existsSync(join(cwd, '.docpath', 'backlog', `${created.id}-auto-clean-title.md`)));

    const createdRef = await createBacklogItem(cwd, sampleItem({ title: 'R-093 跨通道 AC 空洞修复' }));
    assert.equal(createdRef.title, 'R-093 跨通道 AC 空洞修复');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('recovers from counter rollback and allocates monotonically above existing max id (R-375)', async () => {
    const cwd = mkWorkspace();
    // Simulate existing archived item with higher id R-050
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-050-high-id.md'), `---
id: R-050
title: High ID Archived
status: done
priority: P2
level: 1
source: test
links:
  task: null
  spec: null
created_at: 2026-09-24
---

high id
`);

    // Simulate .id-counter artificially rewound/rolled back to 10
    writeFileSync(join(cwd, '.docpath', 'backlog', '.id-counter'), '10', 'utf-8');

    // nextBacklogId should self-heal and return R-051
    const nextId = await nextBacklogId(cwd);
    assert.equal(nextId, 'R-051');

    // .id-counter should have been repaired to 50
    const counterVal = readFileSync(join(cwd, '.docpath', 'backlog', '.id-counter'), 'utf-8').trim();
    assert.equal(counterVal, '50');

    // createBacklogItem should assign R-051 and update counter to 51
    const created = await createBacklogItem(cwd, sampleItem({ title: 'After Rollback Recovery' }));
    assert.equal(created.id, 'R-051');
    const updatedCounter = readFileSync(join(cwd, '.docpath', 'backlog', '.id-counter'), 'utf-8').trim();
    assert.equal(updatedCounter, '51');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('allows backlog add with positional title and background/acceptance', async () => {
    const cwd = mkWorkspace();
    const { backlogCommand } = await import('../dist/commands/backlog.js');
    await backlogCommand({
      cwd,
      action: 'add',
      id: 'Positional Backlog Item',
      background: 'Positional background info',
      acceptance: 'Positional acceptance criteria',
    });

    const items = await listBacklogItems(cwd);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Positional Backlog Item');
    assert.equal(items[0].readiness, 'shaped');
    assert.ok(items[0].body.includes('Positional background info'));

    rmSync(cwd, { recursive: true, force: true });
  });

  it('allows backlog capture with positional title', async () => {
    const cwd = mkWorkspace();
    const { backlogCommand } = await import('../dist/commands/backlog.js');
    await backlogCommand({
      cwd,
      action: 'capture',
      id: 'Positional Raw Capture',
    });

    const items = await listBacklogItems(cwd);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Positional Raw Capture');
    assert.equal(items[0].readiness, 'raw');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('detects similar titles with fuzzy similarity score', async () => {
    assert.ok(calculateTitleSimilarity('修复用户登录鉴权漏洞', '修复用户登录鉴权缺陷') >= 0.75);
    assert.ok(calculateTitleSimilarity('Support WebSocket Transport', 'Support WebSocket and HTTP Transport') >= 0.65);

    const cwd = mkWorkspace();
    await createBacklogItem(cwd, sampleItem({ title: '修复用户登录鉴权漏洞' }));
    const dups = await detectBacklogDuplicates(cwd, { id: 'R-099', title: '修复用户登录鉴权缺陷' });
    assert.ok(dups.some((d) => d.kind === 'similar-title' && (d.similarity ?? 0) >= 0.75));

    rmSync(cwd, { recursive: true, force: true });
  });

  it('detects cross-channel AC hole risks in auditBacklogHygiene', async () => {
    const { auditBacklogHygiene } = await import('../dist/engine/backlog-groom.js');

    const itemWithHole = sampleItem({
      id: 'R-093',
      title: '全传输通道支持',
      body: `## 需求背景\n多协议通信\n\n## 验收标准\n- [AC-1] 全传输（ws/http/dns）正常连通并收发数据`,
    });

    const report = auditBacklogHygiene([itemWithHole]);
    assert.ok(report.warnings.some((w) => w.message.includes('跨通道 AC 空洞风险') && w.message.includes('ws/http/dns')));
  });

  it('auto-fixes broken and dropped dependency links with autoFixBacklogHygiene', async () => {
    const { autoFixBacklogHygiene, auditBacklogHygiene } = await import('../dist/engine/backlog-groom.js');
    const cwd = mkWorkspace();

    const item1 = await createBacklogItem(cwd, sampleItem({ title: 'Root Feature' }));
    const item2 = await createBacklogItem(cwd, sampleItem({
      title: 'Child Feature with Broken Parent',
      links: { parent: 'R-999', depends_on: ['R-888', item1.id] },
    }));

    // Before fix: groom should find issues
    const allBefore = await listBacklogItems(cwd);
    const beforeAudit = auditBacklogHygiene(allBefore);
    assert.ok(beforeAudit.issues.length > 0);

    // Run auto-fix
    const fixResult = await autoFixBacklogHygiene(cwd, allBefore, writeBacklogItem, refreshBacklogIndex);
    assert.ok(fixResult.fixedCount >= 2);

    // After fix: parent R-999 and dep R-888 should be cleaned, item1.id retained
    const item2After = await readBacklogItem(cwd, item2.id);
    assert.equal(item2After.links.parent, null);
    assert.deepEqual(item2After.links.depends_on, [item1.id]);

    const afterAudit = auditBacklogHygiene(await listBacklogItems(cwd));
    assert.equal(afterAudit.issues.length, 0);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('supports backlog show / get / view command with agent and json output', async () => {
    const cwd = mkWorkspace();
    const { backlogCommand } = await import('../dist/commands/backlog.js');

    const created = await createBacklogItem(cwd, sampleItem({
      title: 'Show Command Test Item',
      priority: 'P1',
      level: 2,
      body: '## 背景\n测试详情查看',
    }));

    // Test text mode output
    let logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await backlogCommand({ cwd, action: 'show', id: created.id });
      assert.ok(logs.some((l) => l.includes('Show Command Test Item')));
      assert.ok(logs.some((l) => l.includes('P1')));

      logs = [];
      await backlogCommand({ cwd, action: 'get', id: created.id, json: true });
      const parsedJson = JSON.parse(logs.join('\n'));
      assert.equal(parsedJson.id, created.id);
      assert.equal(parsedJson.title, 'Show Command Test Item');

      logs = [];
      await backlogCommand({ cwd, action: 'view', id: created.id, agent: true });
      assert.ok(logs.some((l) => l.includes('title: Show Command Test Item')));
    } finally {
      console.log = origLog;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('searches full lifecycle across active and archived items', async () => {
    const cwd = mkWorkspace();
    const { searchBacklogItems } = await import('../dist/engine/backlog-search.js');

    const active = await createBacklogItem(cwd, sampleItem({ title: 'Active Authentication Service' }));
    const toArchive = await createBacklogItem(cwd, sampleItem({ title: 'Archived Legacy Auth Service' }));
    await setBacklogStatus(cwd, toArchive.id, 'dropped');

    // Default search: only active
    const activeOnly = await searchBacklogItems(cwd, { query: 'Auth' });
    assert.equal(activeOnly.length, 1);
    assert.equal(activeOnly[0].item.id, active.id);

    // Full lifecycle search: active + archived
    const full = await searchBacklogItems(cwd, { query: 'Auth', includeArchived: true });
    assert.equal(full.length, 2);
    assert.ok(full.some((r) => r.item.id === toArchive.id && r.isArchived === true));

    rmSync(cwd, { recursive: true, force: true });
  });

  it('computes topological bottlenecks and critical path in buildBacklogGraph', async () => {
    const { buildBacklogGraph } = await import('../dist/engine/backlog-graph.js');

    const itemA = sampleItem({ id: 'R-001', title: 'Foundation DB' });
    const itemB = sampleItem({ id: 'R-002', title: 'Auth API', links: { depends_on: ['R-001'] } });
    const itemC = sampleItem({ id: 'R-003', title: 'User Profile API', links: { depends_on: ['R-001'] } });
    const itemD = sampleItem({ id: 'R-004', title: 'Frontend App', links: { depends_on: ['R-002'] } });

    const graph = buildBacklogGraph([itemA, itemB, itemC, itemD]);

    // R-001 blocks R-002 and R-003 directly, and R-004 transitively -> Top Bottleneck
    assert.ok(graph.bottlenecks.length > 0);
    assert.equal(graph.bottlenecks[0].id, 'R-001');
    assert.equal(graph.bottlenecks[0].directBlocks, 2);
    assert.equal(graph.bottlenecks[0].totalTransitiveBlocks, 3);

    // Critical Path: R-001 -> R-002 -> R-004 (length 3)
    assert.equal(graph.criticalPath.length, 3);
    assert.deepEqual(graph.criticalPath, ['R-001', 'R-002', 'R-004']);
  });

  it('computes backlog stats and runs backlog stats command', async () => {
    const cwd = mkWorkspace();
    const { computeBacklogStats } = await import('../dist/engine/backlog-stats.js');
    const { backlogCommand } = await import('../dist/commands/backlog.js');

    const it1 = await createBacklogItem(cwd, sampleItem({ title: 'Task 1', priority: 'P0' }));
    const it2 = await createBacklogItem(cwd, sampleItem({ title: 'Task 2', priority: 'P1' }));
    await setBacklogStatus(cwd, it2.id, 'dropped');

    const stats = await computeBacklogStats(cwd);
    assert.equal(stats.summary.total, 2);
    assert.equal(stats.summary.active, 1);
    assert.equal(stats.summary.archived, 1);
    assert.equal(stats.priority.P0, 1);
    assert.equal(stats.priority.P1, 1);

    // Test stats CLI output
    let logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await backlogCommand({ cwd, action: 'stats' });
      assert.ok(logs.some((l) => l.includes('Backlog 需求池全景统计')));
      assert.ok(logs.some((l) => l.includes('状态漏斗')));
    } finally {
      console.log = origLog;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports batch status transitions on multiple IDs', async () => {
    const cwd = mkWorkspace();
    const { backlogCommand } = await import('../dist/commands/backlog.js');

    const it1 = await createBacklogItem(cwd, sampleItem({ title: 'Batch Item 1' }));
    const it2 = await createBacklogItem(cwd, sampleItem({ title: 'Batch Item 2' }));

    await backlogCommand({ cwd, action: 'drop', id: `${it1.id}, ${it2.id}` });

    const item1After = await readBacklogItem(cwd, it1.id, { readArchived: true });
    const item2After = await readBacklogItem(cwd, it2.id, { readArchived: true });
    assert.equal(item1After.status, 'dropped');
    assert.equal(item2After.status, 'dropped');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('supports editing status via docpath backlog edit --status', async () => {
    const cwd = mkWorkspace();
    const { backlogCommand } = await import('../dist/commands/backlog.js');

    const it1 = await createBacklogItem(cwd, sampleItem({ title: 'Edit Status Test', priority: 'P2' }));
    assert.equal(it1.status, 'proposed');

    // Edit status to planned
    await backlogCommand({ cwd, action: 'edit', id: it1.id, status: 'planned', priority: 'P0' });
    const it1Updated = await readBacklogItem(cwd, it1.id);
    assert.equal(it1Updated.status, 'planned');
    assert.equal(it1Updated.priority, 'P0');

    // Invalid status should throw
    await assert.rejects(
      async () => backlogCommand({ cwd, action: 'edit', id: it1.id, status: 'invalid_status' }),
      /status 非法/
    );

    rmSync(cwd, { recursive: true, force: true });
  });

  it('safely unlinks identical active copy when already archived in refreshBacklogIndex and autoFixBacklogHygiene', async () => {
    const cwd = mkWorkspace();
    const { autoFixBacklogHygiene } = await import('../dist/engine/backlog-groom.js');

    // Create item
    const item = await createBacklogItem(cwd, sampleItem({ title: 'Duplicate Archival Clean' }));
    const activeFile = join(cwd, '.docpath', 'backlog', `${item.id}-duplicate-archival-clean.md`);
    const archivedDir = join(cwd, '.docpath', 'backlog', 'archived');
    mkdirSync(archivedDir, { recursive: true });
    const archivedFile = join(archivedDir, `${item.id}-duplicate-archival-clean.md`);

    // Simulate an identical file in archived
    const content = readFileSync(activeFile, 'utf-8');
    writeFileSync(archivedFile, content, 'utf-8');

    // Both files exist
    assert.equal(existsSync(activeFile), true);
    assert.equal(existsSync(archivedFile), true);

    // autoFixBacklogHygiene cleans up identical active copy
    const result = await autoFixBacklogHygiene(cwd, [item], writeBacklogItem, refreshBacklogIndex);
    assert.ok(result.fixedCount >= 1);
    assert.equal(existsSync(activeFile), false);
    assert.equal(existsSync(archivedFile), true);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('detects stale backlog.md and auto-refreshes in checkContextIndexHealth', async () => {
    const cwd = mkWorkspace();
    const { isBacklogIndexStale, checkContextIndexHealth } = await import('../dist/commands/check/validators.js');

    const docpathDir = join(cwd, '.docpath');
    const bdir = join(docpathDir, 'backlog');
    mkdirSync(bdir, { recursive: true });

    // Missing backlog.md is stale
    assert.equal(await isBacklogIndexStale(docpathDir), true);

    // Create item and refresh index
    await createBacklogItem(cwd, sampleItem({ title: 'Stale Check Test' }));
    await refreshBacklogIndex(cwd);
    assert.equal(existsSync(join(bdir, 'backlog.md')), true);

    // After refresh, it's not stale
    assert.equal(await isBacklogIndexStale(docpathDir), false);

    // Modify an item in backlog to have future mtime
    const itemFile = join(bdir, 'R-001-stale-check-test.md');
    const futureTime = new Date(Date.now() + 5000);
    const { utimesSync } = await import('node:fs');
    utimesSync(itemFile, futureTime, futureTime);

    // Now it is stale
    assert.equal(await isBacklogIndexStale(docpathDir), true);

    // Running checkContextIndexHealth auto-heals and refreshes backlog.md
    writeFileSync(join(docpathDir, 'docs-index.json'), JSON.stringify({ entries: [] }), 'utf-8');
    const checkResults = await checkContextIndexHealth(docpathDir, undefined);
    assert.ok(checkResults.some((r) => r.name.includes('backlog.md 索引已自动刷新')));

    rmSync(cwd, { recursive: true, force: true });
  });
});



