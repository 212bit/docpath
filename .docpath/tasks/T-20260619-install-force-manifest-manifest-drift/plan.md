## 执行计划

### S1: 明确实现方案与本地扫描逻辑
- **描述**: 确认 `src/commands/install.ts` 中的 `writeInstallMetadata` 的具体修改点：引入/实现 sha256 的计算，读取目标安装目录 `targetDir` 下的每一个资产文件的真实文件内容并计算哈希。
- **验收条件**: 修改方案确定，定位到核心逻辑。
- **依赖**: 无

### S2: 修复 `writeInstallMetadata` 逻辑
- **描述**: 在 `src/commands/install.ts` 中，修改 `writeInstallMetadata` 使得它遍历期望安装的文件，如果磁盘上已存在该文件，则读取该文件计算其实际的 sha256，而不是统一使用 expectedAssets 计算得到的模板 hash。
- **验收条件**: 在非 force 模式且存在文件变更差异时，执行 `docpath install` 生成的 `.install-meta.json` 里的哈希与磁盘上现有文件的哈希完全一致。
- **依赖**: S1

### S3: 增加针对 manifest drift 修复的单元测试
- **描述**: 在 `tests/install.test.mjs`（或相关的测试文件）中，编写针对非 force 模式下发生 skip 却依然写入的 bug 的测试：模拟文件存在 drift、非 force 安装、验证下一次运行 check 不会失败。
- **验收条件**: 运行 `pnpm test` 全部通过，新测试完美绿灯。
- **依赖**: S2

### S4: 进行真实集成验证与门禁检查
- **描述**: 执行 `docpath check` 以进行代码质量检验，并在工作流引擎下执行收口。
- **验收条件**: 所有质量门禁全量通过，无 install-manifest-drift 报错。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
