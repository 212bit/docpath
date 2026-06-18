## 执行计划

### S1: Add strict CLI contract validation
- [x] S1: Add strict CLI contract validation
- **描述**: Add shared parsers for enum and numeric CLI inputs, then apply them to review, diff, context, reveal, compact, agent handoff, and dashboard options.
- **验收条件**: Invalid scope, step, level, token, entry, and port inputs fail loudly with actionable messages before command internals receive invalid values.
- **依赖**: 无

### S2: Remove stale public options
- [x] S2: Remove stale public options
- **描述**: Remove advertised no-op flags from command registration and help text where behavior is not implemented.
- **验收条件**: review no longer advertises --no-ai and write-spec no longer advertises --section; existing valid command paths remain unchanged.
- **依赖**: S1

### S3: Add regression tests and run gates
- [x] S3: Add regression tests and run gates
- **描述**: Add focused CLI tests for invalid inputs and removed no-op flags, then run the relevant test suite and DocPath check.
- **验收条件**: Regression tests pass; docpath check passes for this task.
- **依赖**: S2
