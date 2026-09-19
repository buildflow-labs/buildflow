import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { GitManager } from '../src/main/git/git-manager.js';
import { ProcessManager } from '../src/main/processes/process-manager.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('creates a project repository even when its parent is a Git repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildflow-nested-git-')); roots.push(root);
  execFileSync('git', ['init', root]);
  const project = join(root, 'project');
  await mkdir(project);
  await writeFile(join(project, 'app.txt'), 'project content');
  const processes = new ProcessManager();
  try {
    const git = new GitManager(processes);
    await git.ensureClean(project);
    const version = await git.commit('project-id', project, 'Create app');
    expect(resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, encoding: 'utf8' }).trim()).toLowerCase()).toBe(resolve(project).toLowerCase());
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim()).toBe(version.commitHash);
    expect(() => execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, stdio: 'ignore' })).toThrow();
  } finally { await processes.dispose(); }
});

it('updates an older project exclusion list for generated build files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildflow-git-exclude-')); roots.push(root);
  await writeFile(join(root, 'app.txt'), 'healthy');
  const processes = new ProcessManager();
  try {
    const git = new GitManager(processes);
    await git.commit('project-id', root, 'Create app');
    await writeFile(join(root, '.git', 'info', 'exclude'), '# Buildflow runtime data\ndata/\n');
    await writeFile(join(root, 'tsconfig.tsbuildinfo'), 'generated');
    await expect(git.ensureClean(root)).resolves.toBeUndefined();
  } finally { await processes.dispose(); }
});
