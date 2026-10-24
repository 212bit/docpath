import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCandidateBlocks, parseCandidateBlocks } from '../dist/utils/lesson-candidates.js';

const BLOCKED_ONLY = '仅有阻塞步骤记录，无可复用经验';

function classifyLesson(body, taskId = 'T-20261024-lesson') {
  const content = [
    '# Lesson Candidates',
    '',
    `## ${taskId} — 2026-10-24T00:00:00.000Z`,
    `- task_id: ${taskId}`,
    '- type: best-practice',
    '- target: style',
    '- source: journal',
    `- key: ${taskId}-workflow`,
    '',
    '### Lesson',
    '',
    body,
    '',
    '### Evidence',
    '',
    '- .docpath/workspace/breadcrumb.md',
    '',
    '---',
    '',
  ].join('\n');
  const [result] = classifyCandidateBlocks(parseCandidateBlocks(content));
  assert.ok(result, 'candidate was parsed');
  return result;
}

describe('classifyCandidateBlocks reusable lesson text', () => {
  it('archives a placeholder recommendation whose only signal is a blocked check step', () => {
    const result = classifyLesson([
      '### 推荐方案',
      '',
      '待补充',
      '',
      '### 架构决策摘要',
      '',
      '- 待补充: 待补充',
      '',
      '### 阻塞步骤（踩坑点）',
      '',
      '- check: 质量检查失败: 任务身份一致性检查',
    ].join('\n'), 'T-20261024-placeholder-check');

    assert.equal(result.action, 'archive');
    assert.deepEqual(result.reasons, [BLOCKED_ONLY]);
    assert.equal(result.pattern, undefined);
  });

  it('archives a bare option and tautological ADR when the blocked step mentions 漂移', () => {
    const result = classifyLesson([
      '### 推荐方案',
      '',
      '方案 B',
      '',
      '### 架构决策摘要',
      '',
      '- 方案 B: 方案 B',
      '',
      '### 阻塞步骤（踩坑点）',
      '',
      '- check: 质量检查失败: Plan/Breadcrumb 漂移检查',
    ].join('\n'), 'T-20261024-option-drift');

    assert.equal(result.action, 'archive');
    assert.deepEqual(result.reasons, [BLOCKED_ONLY]);
  });

  it('archives bare option labels and review lines that would otherwise supply quality keywords', () => {
    for (const label of ['方案B', 'Option A', '暂无', 'none', 'N/A', 'TBD']) {
      const result = classifyLesson([
        '### 推荐方案',
        '',
        label,
        '',
        '### 架构决策摘要',
        '',
        `- ${label}: ${label}`,
        '',
        '### 阻塞步骤（踩坑点）',
        '',
        '- review: 代码审查: 2 错误, 1 警告, 0 提示',
        '- check: 质量检查失败: Plan/Breadcrumb 漂移检查',
      ].join('\n'), `T-20261024-${label.replace(/[^\w\u4e00-\u9fa5-]+/g, '')}`);

      assert.equal(result.action, 'archive', label);
      assert.deepEqual(result.reasons, [BLOCKED_ONLY], label);
    }
  });

  it('archives a tautological ADR that is not a known placeholder token', () => {
    const result = classifyLesson([
      '### 推荐方案',
      '',
      '无',
      '',
      '### 架构决策摘要',
      '',
      '- 下载配置: 下载配置',
      '',
      '### 阻塞步骤（踩坑点）',
      '',
      '- check: 质量检查失败: Plan/Breadcrumb 漂移检查',
    ].join('\n'), 'T-20261024-tautology');

    assert.equal(result.action, 'archive');
    assert.deepEqual(result.reasons, [BLOCKED_ONLY]);
  });

  it('keeps a concrete lesson about rebuilding an embedded stager downloader', () => {
    const lesson = '当重建 stage0 stager 的下载配置时，整个 downloader 被加密嵌入 stager，重建时必须原样保留字节，避免改写加载边界。';
    const result = classifyLesson([
      '### 推荐方案',
      '',
      lesson,
    ].join('\n'), 'T-20261024-stager');

    assert.equal(result.action, 'keep');
    assert.deepEqual(result.reasons, ['具备触发条件、期望行为和边界']);
    assert.equal(result.pattern?.description.includes('downloader 被加密嵌入 stager'), true);
  });

  it('keeps a recommendation that itself has trigger, behavior, and boundary even with blocked steps', () => {
    const recommendation = '当修改核心模块时，必须同步更新 docs/ 活文档以保持契约一致，避免出现悬空断链。';
    const result = classifyLesson([
      '### 推荐方案',
      '',
      recommendation,
      '',
      '### 架构决策摘要',
      '',
      '- 待补充: 待补充',
      '',
      '### 阻塞步骤（踩坑点）',
      '',
      '- check: 质量检查失败: 任务身份一致性检查',
      '- review: 代码审查: 2 错误, 0 警告, 0 提示',
    ].join('\n'), 'T-20261024-real-with-blocked');

    assert.equal(result.action, 'keep');
    assert.deepEqual(result.reasons, ['具备触发条件、期望行为和边界']);
    assert.match(result.pattern?.description || '', /必须同步更新 docs/);
  });
});
