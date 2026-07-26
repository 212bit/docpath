import { defineConfig } from 'tsup';

/**
 * DocPath CLI 构建配置。
 *
 * entry 为 glob 全量（R-295）：此前的手工 CLI_ENTRY 白名单要求「测试经 ../dist
 * 导入的每个 src 文件必须列名，否则构建成功但测试 ERR_MODULE_NOT_FOUND」——
 * 白名单与测试导入面的耦合随全量编译一并消亡。esm splitting 保持共享 chunk
 * 单例语义。clean / watch 仍由命令行 flag 控制：
 *   - build:clean → tsup --clean
 *   - build:test  → tsup
 *   - dev         → tsup --watch
 */
export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  outDir: 'dist',
});
