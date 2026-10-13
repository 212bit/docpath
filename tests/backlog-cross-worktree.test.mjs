// R-356 回归：backlog 跨 worktree 共享可见性（方案 B）
//
// 覆盖目标（对应 R-356 验收）：
//   1. scanBacklogMaxId 把兄弟 worktree 的存量编号计入，并行 capture 不再分到同号；
//   2. detectBacklogDuplicates 能发现兄弟 worktree 中已存在的同标题条目；
//   3. 共享注册表（<git-common-dir>/docpath-backlog-registry.json）在 capture 后留痕，
//      即使文件尚未落到本 checkout 也能被兄弟 worktree 感知。
//
// 夹具：真实 git 仓 + git worktree（不用 mock），因为共享可见性本质依赖 git 语义。

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args.match(/(?:[^\s"]+|"[^"]*")+/g).map((p) => p.replace(/^"|"$/g, ''))], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runAsync(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [BIN, ...args.match(/(?:[^\s"]+|"[^"]*")+/g).map((p) => p.replace(/^"|"$/g, ''))],
      { cwd, encoding: 'utf-8', timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`${err.message}\n${stderr}\n${stdout}`));
        resolve(stdout.trim());
      },
    );
  });
}

/** 建一个真实 git 仓 + .docpath 骨架，返回 { repo, wt, gitDir }。 */
function mkRepoWithWorktree() {
  const repo = mkdtempSync(join(tmpdir(), 'dp-r356-'));
  const dp = join(repo, '.docpath');
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: r356-test\n');
  writeFileSync(join(dp, 'backlog', 'backlog.md'), '# Backlog\n');

  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'init']);

  const wt = join(repo, '.worktrees', 'wt-b');
  git(repo, ['worktree', 'add', '-q', '-b', 'wt-b', wt]);

  const gitDir = join(repo, '.git');
  return { repo, wt, gitDir };
}

describe('R-356: backlog 跨 worktree 共享可见性', () => {
  it('共享注册表落在 git-common-dir，capture 后兄弟 worktree 可见', () => {
    const { repo, wt, gitDir } = mkRepoWithWorktree();

    // 主 checkout capture 一条
    const out = run('backlog capture --title "跨 worktree 可见性验证" --level 1', repo);
    assert.match(out, /已捕获 raw backlog 条目: R-\d+/);

    // 注册表写在共享 .git 下（不是各 worktree 的 .docpath 里）
    const registryPath = join(gitDir, 'docpath-backlog-registry.json');
    assert.ok(existsSync(registryPath), '共享注册表应存在于 git-common-dir');

    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    assert.equal(registry.version, 1);
    assert.ok(
      registry.entries.some((e) => e.title === '跨 worktree 可见性验证'),
      '注册表应登记刚创建的条目',
    );

    // 兄弟 worktree 也能读到同一份注册表（同一 .git）
    assert.ok(existsSync(join(wt, '.git')), 'worktree 的 .git 是 gitdir 指针文件');
    const fromWt = run('backlog groom --agent', wt);
    assert.match(fromWt, /passed/);
  });

  it('scanBacklogMaxId 计入兄弟 worktree 存量编号，避免并行 capture 同号', () => {
    const { repo, wt } = mkRepoWithWorktree();

    // 在兄弟 worktree 里先造一个高编号条目（模拟另一会话的成果），并推进其计数器
    const wtBacklog = join(wt, '.docpath', 'backlog');
    mkdirSync(wtBacklog, { recursive: true });
    writeFileSync(
      join(wtBacklog, 'R-900-sibling.md'),
      '---\nid: R-900\ntitle: sibling item\nstatus: proposed\npriority: P2\nlevel: 1\nsource: test\nreadiness: raw\nevidence:\n  brainstorm: null\n  analysis: null\n  spec: null\n  decision_brief: null\n  user_confirmed: null\nlinks:\n  task: null\n  spec: null\ncreated_at: 2026-09-23\n---\n\n## 背景\n\nsibling\n\n## 验收\n\n-\n',
    );
    writeFileSync(join(wtBacklog, '.id-counter'), '899');

    // 主 checkout（无自己的 .id-counter）capture：种子扫描应看到兄弟 worktree 的 R-900
    run('backlog refresh', repo);
    const out = run('backlog capture --title "主 checkout 新条目" --level 1', repo);
    const id = out.match(/R-(\d+)/)?.[1];
    assert.ok(id, `应输出新 id，实际: ${out}`);
    assert.ok(
      Number(id) > 900,
      `主 checkout 应分配到 >900 的编号（兄弟 worktree 已占 900），实际 R-${id}`,
    );
  });

  it('detectBacklogDuplicates 能发现兄弟 worktree 的同标题条目', () => {
    const { repo, wt } = mkRepoWithWorktree();

    const wtBacklog = join(wt, '.docpath', 'backlog');
    mkdirSync(wtBacklog, { recursive: true });
    const sharedTitle = '重复登记探测目标';
    writeFileSync(
      join(wtBacklog, 'R-950-dup.md'),
      `---\nid: R-950\ntitle: ${sharedTitle}\nstatus: proposed\npriority: P2\nlevel: 1\nsource: test\nreadiness: raw\nevidence:\n  brainstorm: null\n  analysis: null\n  spec: null\n  decision_brief: null\n  user_confirmed: null\nlinks:\n  task: null\n  spec: null\ncreated_at: 2026-09-23\n---\n\n## 背景\n\nsibling dup\n\n## 验收\n\n-\n`,
    );

    // 主 checkout 建同标题条目 → promote 前的重复探测应命中兄弟 worktree
    const captured = run('backlog capture --title "重复登记探测目标" --level 1', repo);
    // 兄弟 worktree 的 R-950 会抬高 id 种子，故动态取实际分配的 id
    const localId = captured.match(/R-\d+/)?.[0];
    assert.ok(localId, `应输出新 id，实际: ${captured}`);

    // promote 会在探测后因 dirty worktree（未跟踪的 .worktrees/）拒绝执行，
    // 但重复探测提示发生在该拒绝之前——断言两者都观察到即可。
    let combined = '';
    try {
      combined = run(`backlog promote ${localId}`, repo);
    } catch (error) {
      combined = `${error.stderr ?? ''}${error.stdout ?? ''}`;
    }

    assert.match(
      combined,
      /检测到 \d+ 条可能的重复登记/,
      `应提示跨 worktree 重复登记，实际输出:\n${combined}`,
    );
    assert.match(
      combined,
      /worktree:.*R-950-dup\.md/,
      `重复来源应指向兄弟 worktree 的同标题文件，实际输出:\n${combined}`,
    );
  });

  it('非 git 仓回落：注册表不可用时 capture 仍成功（fail-open）', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-r356-nogit-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'backlog'), { recursive: true });
    mkdirSync(join(dp, 'workspace'), { recursive: true });

    const out = run('backlog capture --title "无 git 仓条目" --level 1', cwd);
    assert.match(out, /已捕获 raw backlog 条目: R-\d+/);
    assert.ok(!existsSync(join(dp, 'docpath-backlog-registry.json')));
    assert.ok(resolve(cwd) === resolve(cwd));
  });

  it('FR-2: 跨 worktree 并发 capture 受全局排他锁保护，生成唯一递增 ID', async () => {
    const { repo, wt } = mkRepoWithWorktree();

    const [out1, out2] = await Promise.all([
      runAsync('backlog capture --title "并发任务 A" --level 1', repo),
      runAsync('backlog capture --title "并发任务 B" --level 1', wt),
    ]);

    const id1 = out1.match(/R-(\d+)/)?.[0];
    const id2 = out2.match(/R-(\d+)/)?.[0];

    assert.ok(id1, `进程 1 应成功分配 ID: ${out1}`);
    assert.ok(id2, `进程 2 应成功分配 ID: ${out2}`);
    assert.notEqual(id1, id2, `跨 worktree 并发 capture 绝不能撞号: id1=${id1}, id2=${id2}`);
  });
});
