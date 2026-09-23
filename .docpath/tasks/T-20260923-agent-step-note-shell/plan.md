## 执行计划

### S1: 实现并验证 agent step / enter / done 的 note 支持 --stdin（从标准输入读取）与 --body-file <path>（从文件读取），绕开 shell 特殊字符处理
- [x] S1: 实现并验证 agent step / enter / done 的 note 支持 --stdin（从标准输入读取）与 --body-file <path>（从文件读取），绕开 shell 特殊字符处理
- **描述**: 完成 FR-1: agent step / enter / done 的 note 支持 --stdin（从标准输入读取）与 --body-file <path>（从文件读取），绕开 shell 特殊字符处理；FR-2: 当 --note 与 --stdin/--body-file 同时出现时，以后者为准并给出提示，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 含反引号的 note 经 --stdin 传入后，breadcrumb/plan 中完整保留原文字（不被命令替换）；AC-2: --note 与 --stdin 同现时后者优先；AC-3: 现有 --note 单行用法不受影响
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
