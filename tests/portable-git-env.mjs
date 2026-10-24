/**
 * 让测试里的 git 不继承宿主机差异。由 `npm test` 通过
 * `node --import ./tests/portable-git-env.mjs` 在每个测试进程启动时注入，
 * 子进程里的 git 会继承这些变量。重复加载是幂等的。
 *
 * - init.defaultBranch=main：云端 `git init` 默认 master，套件与收口约定是 main
 * - commit.gpgsign=false：宿主机强制签名会让临时仓库 commit 排队甚至超时
 * - core.fsmonitor=false：全局 fsmonitor 在短命临时仓库里可能挂起
 */

const OVERRIDES = [
  ['init.defaultBranch', 'main'],
  ['commit.gpgsign', 'false'],
  ['core.fsmonitor', 'false'],
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NodeJS.ProcessEnv}
 */
export function applyPortableGitEnv(env = process.env) {
  const parsed = Number.parseInt(env.GIT_CONFIG_COUNT ?? '', 10);
  const count = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  /** @type {Array<[string, string]>} */
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const key = env[`GIT_CONFIG_KEY_${i}`];
    if (!key) continue;
    entries.push([key, env[`GIT_CONFIG_VALUE_${i}`] ?? '']);
  }
  for (const [key, value] of OVERRIDES) {
    const idx = entries.findIndex(([existing]) => existing === key);
    if (idx >= 0) entries[idx][1] = value;
    else entries.push([key, value]);
  }
  env.GIT_CONFIG_COUNT = String(entries.length);
  entries.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return env;
}

applyPortableGitEnv();
