/**
 * 缺失命令的 shell 文案取决于 /bin/sh 实现，不能只认 bash：
 * - bash：`pnpm: command not found`、`sh: line 1: pnpm: command not found`
 * - dash（Debian/Ubuntu 的 /bin/sh）：`/bin/sh: 1: docker: not found`
 * - busybox ash：`sh: docker: not found`
 * - cmd.exe：`is not recognized as an internal or external command`
 *
 * 禁止匹配裸 `not found`。`file not found` / `module not found` 也可能是真实失败。
 */
const POSIX_SH_MISSING_COMMAND =
  /(?:^|[\r\n])(?:\/?[\w./-]*\/)?(?:sh|dash|ash): (?:line )?(?:\d+: )?[^\r\n:]+: not found\b/i;

export function looksLikeMissingShellCommand(output: string): boolean {
  if (!output) return false;
  if (/command not found/i.test(output)) return true;
  if (/is not recognized as (an )?internal or external command/i.test(output)) return true;
  return POSIX_SH_MISSING_COMMAND.test(output);
}
