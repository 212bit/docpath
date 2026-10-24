/**
 * 每个测试文件共享一份已 git init（并可选提交）的模板仓库，
 * 用例只复制模板，避免反复支付 git init / config / 相同初始提交的进程成本。
 */
import { cpSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const blanks = new Map();
const trees = new Map();

function blankRepo(email, name) {
  const key = `${email}\n${name}`;
  let dir = blanks.get(key);
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), 'dp-blank-git-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', email], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', name], { cwd: dir, stdio: 'ignore' });
    blanks.set(key, dir);
  }
  return dir;
}

/** 等价于 `git init -b main` 再写入 user.email / user.name。cwd 里已有的文件保持未跟踪。 */
export function installBlankGit(cwd, { email = 'test@example.com', name = 'Test' } = {}) {
  cpSync(join(blankRepo(email, name), '.git'), join(cwd, '.git'), { recursive: true });
}

/**
 * `prepare(dir)` 只在本进程内执行一次。每次调用返回一份独立副本。
 * @param {string} key
 * @param {(dir: string) => void} prepare
 */
export function copyPreparedRepo(key, prepare) {
  let src = trees.get(key);
  if (!src) {
    src = mkdtempSync(join(tmpdir(), `dp-prep-${key}-`));
    prepare(src);
    trees.set(key, src);
  }
  const dest = mkdtempSync(join(tmpdir(), `dp-repo-${key}-`));
  for (const entry of readdirSync(src)) {
    cpSync(join(src, entry), join(dest, entry), { recursive: true });
  }
  return dest;
}
