import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Version } from '../../shared/models/project.js';
import { captureProcess, ProcessManager } from '../processes/process-manager.js';

export class GitManager {
  constructor(private processes: ProcessManager) {}
  private async git(cwd: string, args: string[]) { const r = await captureProcess(this.processes, { executable: 'git', args, cwd, timeoutMs: 60_000 }); if (r.exitCode !== 0) throw new Error(r.stderr || `git ${args[0]} failed`); return r.stdout.trim(); }
  private async hasOwnRepository(cwd: string) {
    try {
      const [root, workspace] = await Promise.all([realpath(resolve(await this.git(cwd, ['rev-parse', '--show-toplevel']))), realpath(resolve(cwd))]);
      return root.toLowerCase() === workspace.toLowerCase();
    }
    catch { return false; }
  }
  private async ignoreRuntimeData(cwd: string) {
    const gitDir = await this.git(cwd, ['rev-parse', '--absolute-git-dir']);
    const excludePath = join(gitDir, 'info', 'exclude');
    const marker = '# Buildflow runtime data';
    await mkdir(dirname(excludePath), { recursive: true });
    const existing = await readFile(excludePath, 'utf8').catch(() => '');
    const patterns = ['data/', 'storage/', 'uploads/', '*.sqlite', '*.sqlite-*', '*.db', '*.db-*', '*.tsbuildinfo', '.next/', 'node_modules/'];
    const lines = new Set(existing.split(/\r?\n/));
    const missing = patterns.filter((pattern) => !lines.has(pattern));
    if (missing.length) await appendFile(excludePath, `${existing.includes(marker) ? '' : `\n${marker}`}\n${missing.join('\n')}\n`);
  }
  async ensureClean(cwd: string) {
    if (!await this.hasOwnRepository(cwd)) return;
    await this.ignoreRuntimeData(cwd);
    const status = await this.git(cwd, ['status', '--porcelain']);
    if (status) throw new Error('Workspace has uncommitted changes');
  }
  async commit(projectId: string, cwd: string, request: string, allowEmpty = false): Promise<Version> {
    if (!await this.hasOwnRepository(cwd)) await this.git(cwd, ['init']);
    await this.ignoreRuntimeData(cwd);
    await this.git(cwd, ['add', '--all']);
    const timestamp = new Date().toISOString(); await this.git(cwd, ['-c', 'user.name=Buildflow', '-c', 'user.email=buildflow@local.invalid', 'commit', ...(allowEmpty ? ['--allow-empty'] : []), '-m', request.slice(0, 120), '-m', `User Request: ${request}\nTimestamp: ${timestamp}`]);
    const commitHash = await this.git(cwd, ['rev-parse', 'HEAD']); return { id: randomUUID(), projectId, commitHash, request, createdAt: timestamp };
  }
  async restore(cwd: string, hash: string) { if (!await this.hasOwnRepository(cwd)) throw new Error('Project repository not found'); await this.ignoreRuntimeData(cwd); await this.git(cwd, ['reset', '--hard', hash]); await this.git(cwd, ['clean', '-fd']); }
  async checkoutTree(cwd: string, hash: string) { if (!await this.hasOwnRepository(cwd)) throw new Error('Project repository not found'); await this.ignoreRuntimeData(cwd); await this.git(cwd, ['restore', `--source=${hash}`, '--staged', '--worktree', '.']); await this.git(cwd, ['clean', '-fd']); }
  async restoreCurrent(cwd: string) { if (!await this.hasOwnRepository(cwd)) throw new Error('Project repository not found'); await this.git(cwd, ['reset', '--hard', 'HEAD']); await this.git(cwd, ['clean', '-fd']); }
}
