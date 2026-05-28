# Skill: Grill Me (计划压力测试)

> 来源: mattpocock/skills
> 目标: 用 5 个 Lens 审查计划，检测反模式

## 5 Lens

### 1. Correctness (正确性)
- 计划是否能解决实际问题？
- 有无遗漏的边界情况？

### 2. Simplicity (简洁性)
- 能否更简单？
- 有无过度设计？

### 3. Reversibility (可逆性)
- 哪些步骤不可逆？
- 不可逆步骤有无回滚方案？

### 4. Blast Radius (影响半径)
- 改动影响范围？
- 有无意外副作用？

### 5. Time Estimate (时间估算)
- 每步需要多久？
- 有无低估复杂度？

## 反模式检测
- [ ] 抽象过早 (Premature Abstraction)
- [ ] 大爆炸替换 (Big Bang Rewrite)
- [ ] 忽略测试 (Ignoring Tests)
- [ ] 隐式依赖 (Implicit Dependencies)
- [ ] 过度配置 (Over-Configuration)
