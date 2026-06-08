import { listRegisteredProjects } from '../engine/project-registry.js';

type ProjectsOptions = {
  json?: boolean;
};

export async function projectsCommand(options: ProjectsOptions = {}): Promise<void> {
  const projects = await listRegisteredProjects();
  if (options.json) {
    console.log(JSON.stringify({ projects }, null, 2));
    return;
  }

  console.log('\n📚  DocPath 注册项目\n');
  if (projects.length === 0) {
    console.log('暂无注册项目。运行 `docpath init` 初始化项目后会自动注册。\n');
    return;
  }

  for (const project of projects) {
    const tech = [project.type, project.language, project.framework].filter((item) => item && item !== '-').join(' / ') || '-';
    console.log(`- ${project.name}`);
    console.log(`  路径: ${project.root}`);
    console.log(`  技术: ${tech}`);
    console.log(`  状态: ${project.phase} / ${project.gate}`);
    if (project.task_title) console.log(`  任务: ${project.task_title}`);
    console.log(`  最近: ${project.last_seen_at}`);
  }
  console.log('');
}
