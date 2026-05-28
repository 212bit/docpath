/**
 * docpath:config — 配置管理
 * 读写 .docpath/config.yaml
 * 
 * AI 通过 CLI 操作配置，完全不碰 YAML 语法
 * 
 * 用法:
 *   docpath config                          # 列出全部配置
 *   docpath config get llm.model            # 读取配置项
 *   docpath config set llm.model gpt-4o     # 设置配置项
 *   docpath config get harness.mode         # 读取 harness 模式
 *   docpath config set harness.mode balanced # 设置 harness 模式
 */

import { readFileSafe } from '../utils/file.js';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

interface ConfigOptions {
  cwd: string;
  get?: string;
  set?: string;
  value?: string;
  list?: boolean;
}

const DEFAULT_CONFIG = {
  // LLM 配置
  llm: {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKey: '',
  },
  // 模板配置
  templates: {
    path: 'templates',
  },
  // 工作流配置
  workflow: {
    defaultLevel: 'auto',
    autoCheckpoint: true,
  },
  // Harness 配置 (DocPath 2.0)
  harness: {
    // 模式: strict | balanced | exploration
    mode: 'balanced',
    // 是否启用 preflight 检查
    preflight: true,
    // 是否启用 post-flight 检查
    postflight: true,
    // 反模式检测
    antiPatterns: {
      enabled: true,
      // 检测: parallel_tools, missing_context, file_edit_cascade
      detect: ['parallel_tools', 'missing_context'],
    },
  },
  // 文档索引配置
  docs: {
    // 是否自动扫描文档
    autoScan: true,
    // 文档根目录
    root: '.',
    // 忽略的目录
    ignore: ['node_modules', '.git', 'dist', 'build'],
  },
};

/**
 * 解析简单 YAML（支持嵌套对象）
 * 
 * 用法: parseYamlSimple(content)
 * 返回: 解析后的对象
 */
function parseYamlSimple(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const stack: { obj: Record<string, any>; indent: number }[] = [{ obj: result, indent: -1 }];

  for (const line of content.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // 计算缩进
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // 弹出栈中缩进大于等于当前的对象
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentObj = stack[stack.length - 1].obj;

    // key: value 或 key: (对象)
    const kvMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value && value.trim()) {
        // 值解析：数字、布尔、字符串
        let parsedValue: any = value.trim();
        if (parsedValue === 'true') parsedValue = true;
        else if (parsedValue === 'false') parsedValue = false;
        else if (/^-?\d+(\.\d+)?$/.test(parsedValue)) parsedValue = parseFloat(parsedValue);
        currentObj[key] = parsedValue;
      } else {
        // 对象头
        currentObj[key] = {};
        stack.push({ obj: currentObj[key], indent });
      }
    }
  }
  return result;
}

/**
 * 序列化对象为简单 YAML
 * 
 * 用法: toYamlSimple(obj, indent)
 * 返回: YAML 字符串
 */
function toYamlSimple(obj: Record<string, any>, indent = 0): string {
  let result = '';
  const prefix = '  '.repeat(indent);
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result += `${prefix}${key}:\n${toYamlSimple(value, indent + 1)}`;
    } else if (Array.isArray(value)) {
      result += `${prefix}${key}:\n`;
      for (const item of value) {
        result += `${prefix}  - ${item}\n`;
      }
    } else {
      result += `${prefix}${key}: ${value}\n`;
    }
  }
  return result;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  const configDir = join(options.cwd, '.docpath');
  const configPath = join(configDir, 'config.yaml');

  // List all config
  if (options.list || (!options.get && !options.set)) {
    const raw = await readFileSafe(configPath);
    if (!raw) {
      console.log('\n⚙️  未找到配置文件。使用默认配置:\n');
      console.log(toYamlSimple(DEFAULT_CONFIG));
      console.log('运行 `docpath config set llm.model gpt-4o` 初始化配置\n');
      return;
    }
    console.log('\n⚙️  DocPath 配置\n');
    console.log(raw);
    return;
  }

  // Get specific value
  if (options.get) {
    const raw = await readFileSafe(configPath);
    if (!raw) {
      // 返回默认值
      const config = DEFAULT_CONFIG;
      const keys = options.get.split('.');
      let value: any = config;
      for (const k of keys) {
        value = value?.[k];
      }
      if (value !== undefined) {
        console.log(`\n${options.get} = ${value} (默认值)\n`);
      } else {
        console.log(`\n⚠️  未找到配置项: ${options.get}\n`);
      }
      return;
    }

    const config = parseYamlSimple(raw);
    const keys = options.get.split('.');
    let value: any = config;
    for (const k of keys) {
      value = value?.[k];
    }

    // 检查是否使用默认值
    let defaultValue: any = DEFAULT_CONFIG;
    for (const k of keys) {
      defaultValue = defaultValue?.[k];
    }

    if (value !== undefined) {
      const isDefault = value === defaultValue || JSON.stringify(value) === JSON.stringify(defaultValue);
      console.log(`\n${options.get} = ${value}${isDefault ? ' (默认值)' : ''}\n`);
    } else if (defaultValue !== undefined) {
      console.log(`\n${options.get} = ${defaultValue} (默认值)\n`);
    } else {
      console.log(`\n⚠️  未找到配置项: ${options.get}\n`);
    }
    return;
  }

  // Set value (支持两种语法)
  if (options.set) {
    let keyPath: string;
    let value: string;

    // 语法1: --set key.path=value (向后兼容)
    if (options.set.includes('=')) {
      const [key, ...valueParts] = options.set.split('=');
      keyPath = key;
      value = valueParts.join('=');
    }
    // 语法2: config set <key> <value>
    else if (options.value) {
      keyPath = options.set;
      value = options.value;
    }
    // 语法3: config set key.path value (从 index.ts 传入)
    else {
      // 尝试从参数中解析
      const parts = options.set.split(/\s+/);
      if (parts.length >= 2) {
        keyPath = parts[0];
        value = parts.slice(1).join(' ');
      } else {
        console.log('\n❌ 用法: docpath config set <key> <value>');
        console.log('   或:  docpath config set key.path=value\n');
        return;
      }
    }

    if (!keyPath || !value) {
      console.log('\n❌ 用法: docpath config set <key> <value>');
      console.log('   或:  docpath config set key.path=value\n');
      return;
    }

    // 验证配置项是否存在
    const keys = keyPath.split('.');
    let testObj: any = DEFAULT_CONFIG;
    for (const k of keys.slice(0, -1)) {
      testObj = testObj?.[k];
    }
    if (!testObj || !(keys[keys.length - 1] in testObj)) {
      console.log(`\n⚠️  警告: 配置项 ${keyPath} 不在默认配置中`);
      console.log('继续设置...\n');
    }

    // Ensure config dir exists
    await mkdir(configDir, { recursive: true });

    // Read existing or use defaults
    const raw = await readFileSafe(configPath);
    const config = raw ? parseYamlSimple(raw) : structuredClone(DEFAULT_CONFIG);

    // Set nested value
    let obj: any = config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
      obj = obj[keys[i]];
    }

    // 值类型转换
    let parsedValue: any = value;
    if (parsedValue === 'true') parsedValue = true;
    else if (parsedValue === 'false') parsedValue = false;
    else if (/^-?\d+(\.\d+)?$/.test(parsedValue)) parsedValue = parseFloat(parsedValue);

    obj[keys[keys.length - 1]] = parsedValue;

    // Write back
    await writeFile(configPath, toYamlSimple(config), 'utf-8');
    console.log(`\n✅ 已设置 ${keyPath} = ${parsedValue}\n`);
  }
}
