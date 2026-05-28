/**
 * 项目类型推断工具
 * 
 * 扫描项目根目录，检测：
 * - 项目类型 (node/python/rust/go/java/unknown)
 * - 框架 (react/vue/express/nest/spring-boot 等)
 * - 语言 (TypeScript/JavaScript/Python/Rust 等)
 * - 复杂度估算 (0-3)
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';

export interface ProjectInfo {
  name: string;
  type: string;           // node, python, rust, go, java, csharp, unknown
  framework?: string;     // react, vue, express, nest, spring-boot, etc.
  language: string;       // TypeScript, JavaScript, Python, Rust, Go, Java, etc.
  complexity: number;     // 0-3 based on project size
  description?: string;
  detectedAt: string;     // ISO timestamp
}

// ─── 核心检测函数 ───

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    name: '',
    type: 'unknown',
    language: 'Unknown',
    complexity: 0,
    detectedAt: new Date().toISOString(),
  };

  // 1. 检测项目类型（按优先级）
  if (existsSync(join(cwd, 'package.json'))) {
    await detectNodeProject(cwd, info);
  } else if (existsSync(join(cwd, 'Cargo.toml'))) {
    await detectRustProject(cwd, info);
  } else if (existsSync(join(cwd, 'go.mod'))) {
    await detectGoProject(cwd, info);
  } else if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'setup.py'))) {
    await detectPythonProject(cwd, info);
  } else if (existsSync(join(cwd, 'pom.xml'))) {
    await detectJavaProject(cwd, info, 'maven');
  } else if (existsSync(join(cwd, 'build.gradle')) || existsSync(join(cwd, 'build.gradle.kts'))) {
    await detectJavaProject(cwd, info, 'gradle');
  } else if (existsSync(join(cwd, '*.csproj')) || existsSync(join(cwd, '*.sln'))) {
    info.type = 'csharp';
    info.language = 'C#';
  }

  // 2. 如果没检测到类型，尝试从文件扩展名推断
  if (info.type === 'unknown') {
    info.language = detectLanguageFromFiles(cwd);
    if (info.language !== 'Unknown') {
      info.type = info.language.toLowerCase().replace('#', 'sharp');
    }
  }

  // 3. 估算复杂度
  info.complexity = estimateComplexity(cwd, info.type);

  // 4. 如果没有名字，用目录名
  if (!info.name) {
    info.name = cwd.split('/').pop() || 'unknown-project';
  }

  return info;
}

// ─── Node.js / TypeScript 项目 ───

async function detectNodeProject(cwd: string, info: ProjectInfo): Promise<void> {
  info.type = 'node';
  info.language = 'JavaScript';

  try {
    const pkgRaw = await readFile(join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);

    // 基本信息
    info.name = pkg.name || '';
    info.description = pkg.description;

    // 检测语言
    if (existsSync(join(cwd, 'tsconfig.json')) || hasDependency(pkg, 'typescript')) {
      info.language = 'TypeScript';
    }

    // 检测框架
    info.framework = detectFramework(pkg);

  } catch {
    // package.json 读取失败，继续
  }
}

function detectFramework(pkg: any): string | undefined {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // React 生态
  if (deps['react']) {
    if (deps['next']) return 'next';
    if (deps['gatsby']) return 'gatsby';
    return 'react';
  }

  // Vue 生态
  if (deps['vue']) {
    if (deps['nuxt']) return 'nuxt';
    if (deps['@vue/cli-service']) return 'vue-cli';
    return 'vue';
  }

  // 后端框架
  if (deps['express'] || deps['fastify'] || deps['koa']) {
    return deps['express'] ? 'express' : deps['fastify'] ? 'fastify' : 'koa';
  }
  if (deps['@nestjs/core']) return 'nest';

  // 全栈
  if (deps['svelte']) return deps['@sveltejs/kit'] ? 'sveltekit' : 'svelte';

  // 构建工具
  if (deps['vite']) return 'vite';
  if (deps['webpack']) return 'webpack';

  return undefined;
}

function hasDependency(pkg: any, name: string): boolean {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

// ─── Rust 项目 ───

async function detectRustProject(cwd: string, info: ProjectInfo): Promise<void> {
  info.type = 'rust';
  info.language = 'Rust';

  try {
    const cargoRaw = await readFile(join(cwd, 'Cargo.toml'), 'utf-8');
    // 简单解析 [package] 段
    const nameMatch = cargoRaw.match(/\[package\]\s*\n\s*name\s*=\s*"([^"]+)"/);
    if (nameMatch) info.name = nameMatch[1];

    const descMatch = cargoRaw.match(/description\s*=\s*"([^"]+)"/);
    if (descMatch) info.description = descMatch[1];

    // 检测框架
    if (cargoRaw.includes('actix-web')) info.framework = 'actix';
    else if (cargoRaw.includes('axum')) info.framework = 'axum';
    else if (cargoRaw.includes('rocket')) info.framework = 'rocket';
    else if (cargoRaw.includes('tauri')) info.framework = 'tauri';
  } catch {
    // Cargo.toml 读取失败
  }
}

// ─── Go 项目 ───

async function detectGoProject(cwd: string, info: ProjectInfo): Promise<void> {
  info.type = 'go';
  info.language = 'Go';

  try {
    const goModRaw = await readFile(join(cwd, 'go.mod'), 'utf-8');
    const moduleMatch = goModRaw.match(/^module\s+(.+)$/m);
    if (moduleMatch) {
      const parts = moduleMatch[1].split('/');
      info.name = parts[parts.length - 1] || '';
    }

    // 检测框架
    if (goModRaw.includes('gin-gonic/gin')) info.framework = 'gin';
    else if (goModRaw.includes('labstack/echo')) info.framework = 'echo';
    else if (goModRaw.includes('gofiber/fiber')) info.framework = 'fiber';
  } catch {
    // go.mod 读取失败
  }
}

// ─── Python 项目 ───

async function detectPythonProject(cwd: string, info: ProjectInfo): Promise<void> {
  info.type = 'python';
  info.language = 'Python';

  // 尝试 pyproject.toml
  if (existsSync(join(cwd, 'pyproject.toml'))) {
    try {
      const raw = await readFile(join(cwd, 'pyproject.toml'), 'utf-8');
      const nameMatch = raw.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) info.name = nameMatch[1];

      // 检测框架
      if (raw.includes('django')) info.framework = 'django';
      else if (raw.includes('fastapi')) info.framework = 'fastapi';
      else if (raw.includes('flask')) info.framework = 'flask';
    } catch {}
  }

  // 检测框架（从文件结构）
  if (!info.framework) {
    if (existsSync(join(cwd, 'manage.py'))) info.framework = 'django';
    else if (existsSync(join(cwd, 'app.py')) || existsSync(join(cwd, 'main.py'))) {
      // 检查是否有 FastAPI/Django/Flask 的 import
      info.framework = detectPythonFramework(cwd);
    }
  }
}

function detectPythonFramework(cwd: string): string | undefined {
  // 简单检查 requirements.txt
  const reqPath = join(cwd, 'requirements.txt');
  if (existsSync(reqPath)) {
    try {
      const content = require('fs').readFileSync(reqPath, 'utf-8').toLowerCase();
      if (content.includes('django')) return 'django';
      if (content.includes('fastapi')) return 'fastapi';
      if (content.includes('flask')) return 'flask';
    } catch {}
  }
  return undefined;
}

// ─── Java 项目 ───

async function detectJavaProject(cwd: string, info: ProjectInfo, buildTool: string): Promise<void> {
  info.type = 'java';
  info.language = 'Java';

  try {
    if (buildTool === 'maven') {
      const pomRaw = await readFile(join(cwd, 'pom.xml'), 'utf-8');
      const nameMatch = pomRaw.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (nameMatch) info.name = nameMatch[1];

      // 检测框架
      if (pomRaw.includes('spring-boot')) info.framework = 'spring-boot';
      else if (pomRaw.includes('quarkus')) info.framework = 'quarkus';
      else if (pomRaw.includes('micronaut')) info.framework = 'micronaut';
    } else {
      const gradleRaw = await readFile(join(cwd, buildTool === 'gradle' ? 'build.gradle' : 'build.gradle.kts'), 'utf-8');
      const nameMatch = gradleRaw.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/);
      if (nameMatch) info.name = nameMatch[1];

      if (gradleRaw.includes('spring-boot')) info.framework = 'spring-boot';
    }
  } catch {}
}

// ─── 语言检测（fallback） ───

function detectLanguageFromFiles(cwd: string): string {
  try {
    const files = readdirSync(cwd);
    const extensions = new Map<string, number>();

    for (const file of files.slice(0, 100)) { // 只检查前 100 个文件
      const ext = file.split('.').pop()?.toLowerCase();
      if (ext) {
        extensions.set(ext, (extensions.get(ext) || 0) + 1);
      }
    }

    // 按扩展名推断语言
    if (extensions.has('ts') || extensions.has('tsx')) return 'TypeScript';
    if (extensions.has('js') || extensions.has('jsx')) return 'JavaScript';
    if (extensions.has('py')) return 'Python';
    if (extensions.has('rs')) return 'Rust';
    if (extensions.has('go')) return 'Go';
    if (extensions.has('java')) return 'Java';
    if (extensions.has('cs')) return 'C#';
    if (extensions.has('rb')) return 'Ruby';
    if (extensions.has('php')) return 'PHP';
    if (extensions.has('swift')) return 'Swift';
    if (extensions.has('kt')) return 'Kotlin';
  } catch {}

  return 'Unknown';
}

// ─── 复杂度估算 ───

function estimateComplexity(cwd: string, projectType: string): number {
  let score = 0;

  try {
    // 1. 统计源文件数量
    const sourceExts: Record<string, string[]> = {
      node: ['ts', 'tsx', 'js', 'jsx'],
      python: ['py'],
      rust: ['rs'],
      go: ['go'],
      java: ['java'],
      csharp: ['cs'],
    };

    const exts = sourceExts[projectType] || [];
    const fileCount = countSourceFiles(cwd, exts);

    if (fileCount > 100) score += 2;
    else if (fileCount > 30) score += 1;

    // 2. 检查是否有 monorepo 结构
    if (existsSync(join(cwd, 'packages')) || existsSync(join(cwd, 'apps'))) {
      score += 1;
    }

    // 3. 检查是否有 CI/CD
    if (existsSync(join(cwd, '.github', 'workflows')) || existsSync(join(cwd, '.gitlab-ci.yml'))) {
      score += 0.5;
    }

    // 4. 检查是否有 Docker
    if (existsSync(join(cwd, 'Dockerfile')) || existsSync(join(cwd, 'docker-compose.yml'))) {
      score += 0.5;
    }

    // 5. 检查测试目录
    if (existsSync(join(cwd, 'test')) || existsSync(join(cwd, 'tests')) || existsSync(join(cwd, '__tests__'))) {
      score += 0.5;
    }

  } catch {}

  // 映射到 0-3
  if (score >= 3) return 3;
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  return 0;
}

function countSourceFiles(dir: string, extensions: string[]): number {
  let count = 0;
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.venv', 'vendor']);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (skipDirs.has(entry.name)) continue;

      if (entry.isDirectory()) {
        count += countSourceFiles(join(dir, entry.name), extensions);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (ext && extensions.includes(ext)) {
          count++;
        }
      }
    }
  } catch {}

  return count;
}

// ─── 格式化输出 ───

export function formatProjectInfo(info: ProjectInfo): string {
  const lines: string[] = [];

  lines.push(`  📦 项目: ${info.name || '(未命名)'}`);
  lines.push(`  🔧 类型: ${info.type}`);
  lines.push(`  💻 语言: ${info.language}`);
  if (info.framework) {
    lines.push(`  🚀 框架: ${info.framework}`);
  }
  lines.push(`  📊 复杂度: Level ${info.complexity}`);
  if (info.description) {
    lines.push(`  📝 描述: ${info.description}`);
  }

  return lines.join('\n');
}
