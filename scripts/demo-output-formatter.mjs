#!/usr/bin/env node
/**
 * 输出格式化演示
 *
 * 测试各种格式化函数的效果
 */

import {
  shouldUseColor,
  colorizeStatus,
  highlightCommand,
  success,
  error,
  warning,
  info,
  progressBar,
  createTable,
  createCheckTable,
  separator,
  heading,
  subheading
} from '../dist/utils/output-formatter.js';

console.log(heading('DocPath 输出格式化演示'));

console.log(subheading('环境检测'));
console.log(`TTY: ${process.stdout.isTTY}`);
console.log(`NO_COLOR: ${process.env.NO_COLOR || '未设置'}`);
console.log(`启用颜色: ${shouldUseColor()}`);

console.log(subheading('状态颜色'));
console.log(`idle: ${colorizeStatus('idle')}`);
console.log(`executing: ${colorizeStatus('executing')}`);
console.log(`blocked: ${colorizeStatus('blocked')}`);
console.log(`completed: ${colorizeStatus('completed')}`);

console.log(subheading('消息类型'));
console.log(success('操作成功'));
console.log(error('操作失败'));
console.log(warning('需要注意'));
console.log(info('提示信息'));

console.log(subheading('命令高亮'));
console.log(`推荐命令: ${highlightCommand('docpath next --agent')}`);
console.log(`下一步: ${highlightCommand('docpath check')}`);

console.log(subheading('进度条'));
console.log(`0/10:   ${progressBar(0, 10)}`);
console.log(`3/10:   ${progressBar(3, 10)}`);
console.log(`5/10:   ${progressBar(5, 10)}`);
console.log(`7/10:   ${progressBar(7, 10)}`);
console.log(`10/10:  ${progressBar(10, 10)}`);

console.log(subheading('简单表格'));
const tableData = [
  ['S1', '梳理需求', '已完成'],
  ['S2', '实现错误系统', '已完成'],
  ['S3', '优化输出', '进行中'],
  ['S4', '入门向导', '待开始']
];
console.log(createTable(['步骤', '名称', '状态'], tableData));

console.log(subheading('检查结果表格'));
const checkResults = [
  { name: '类型检查', status: 'pass' },
  { name: '单元测试', status: 'fail', message: '3个测试失败' },
  { name: '代码风格', status: 'pass' },
  { name: '安全审计', status: 'warn', message: '发现1个低危漏洞' }
];
console.log(createCheckTable(checkResults));

console.log(separator());
console.log(success('演示完成！'));
