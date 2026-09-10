/**
 * 注册中心并发隔离（test 并发提速配套）。
 *
 * node --test 以"每个测试文件一个进程"运行。import 本文件即把本进程的
 * DOCPATH_REGISTRY_DB 指向一个临时独享 sqlite，避免多个测试文件并发生成
 * `docpath init`（内部 registerProject 写共享 ~/.docpath/projects.sqlite）
 * 时的 SQLITE_BUSY 竞态 —— 这是高并发下 init 类用例偶发失败的根因。
 *
 * - 幂等：进程内已显式设置 DOCPATH_REGISTRY_DB 时不覆盖（init.test.mjs
 *   的逐用例隔离优先）。
 * - 注册中心自身的行为单测不应 import 本文件。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.DOCPATH_REGISTRY_DB) {
  process.env.DOCPATH_REGISTRY_DB = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
}
