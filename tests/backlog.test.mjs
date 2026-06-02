import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.throws(() => transitionBacklog('proposed', 'done'), /Illegal backlog transition/);
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

  it('refreshes backlog.md index after writes and sorts by priority then id', async () => {
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
    await assert.rejects(() => setBacklogStatus(cwd, 'R-001', 'done'), /Illegal backlog transition/);
    rmSync(cwd, { recursive: true, force: true });
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
});
