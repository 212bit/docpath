## 执行计划

### S1: Align UI gate contract
- [x] S1: Align UI gate contract
- **描述**: Align the explicit UI design gate contract across code comments, CLI messages, spec template, design README, and installed skill templates. Keep generic UI/frontend text advisory-only and make opt-in wording explicit.
- **验收条件**: User-facing guidance no longer says generic keywords trigger UI design flow; advisory text says explicit opt-in is required before design evidence matters; references to design five-piece are replaced with UI/UX design evidence package.
- **依赖**: 无

### S2: Enforce stack evidence in check
- [x] S2: Enforce stack evidence in check
- **描述**: Reuse the existing missingFrameworkDecision gate in check for explicit required UI tasks so closeout catches missing or weak frontend-stack.md even when go is bypassed or historical evidence is incomplete.
- **验收条件**: check fails required UI tasks missing frontend-stack.md and reports actionable remediation without changing exempt/advisory behavior.
- **依赖**: S1

### S3: Add visual acceptance template assets
- [x] S3: Add visual acceptance template assets
- **描述**: Add templates/design/visual-acceptance.md and update design README, write-design command docs, installed command copies, and design skill templates to treat acceptance as a first-class artifact.
- **验收条件**: visual-acceptance.md template exists in source templates and installed assets reference the same evidence package sequence.
- **依赖**: S1

### S4: Tests and verification
- [x] S4: Tests and verification
- **描述**: Update focused tests for UI gate wording, check frontend-stack enforcement, write-design acceptance support, and install/template coverage; run build and impacted test suites before full check.
- **验收条件**: build:test, focused node tests, pnpm test, docpath check, and docpath review pass.
- **依赖**: S2, S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [ ] S4

## 依赖关系图
S1 → S2 → S3 → S4
