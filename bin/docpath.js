#!/usr/bin/env node

/**
 * DocPath CLI 入口
 * 
 * 使用 tsup 打包后，此文件指向 dist/index.js
 */

// 开发环境直接使用 ts 源文件
// 生产环境使用编译后的文件
import '../dist/index.js';
