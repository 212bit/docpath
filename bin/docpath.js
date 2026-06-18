#!/usr/bin/env node

/**
 * DocPath CLI 入口 — 加载 tsup 打包后的 dist/index.js。
 *
 * 始终走 dist（tsup 产物）；开发时通过 `pnpm dev`（tsup --watch）持续重建。
 * 若 dist 缺失（未构建的检出），给出友好提示而非裸 ERR_MODULE_NOT_FOUND。
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, '..', 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error(`❌  DocPath CLI 未构建: 找不到 ${distEntry}`);
  console.error('    请先运行 `pnpm build` 后再使用 docpath。');
  process.exit(1);
}

await import('../dist/index.js');
