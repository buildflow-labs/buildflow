import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export type SpawnOptions = { executable: string; args?: string[]; cwd: string; env?: NodeJS.ProcessEnv; projectId?: string; timeoutMs?: number };
export type ProcessResult = { exitCode: number | null; signal: NodeJS.Signals | null };
export class ManagedProcess extends EventEmitter {
  readonly id = randomUUID();
  readonly completion: Promise<ProcessResult>;
  constructor(readonly child: ChildProcessWithoutNullStreams, readonly projectId?: string, timeoutMs?: number) {
    super();
    child.stdout.on('data', (data: Buffer) => this.emit('stdout', data.toString()));
    child.stderr.on('data', (data: Buffer) => this.emit('stderr', data.toString()));
    this.completion = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    if (timeoutMs) { const timer = setTimeout(() => void this.terminate(), timeoutMs); timer.unref(); this.completion.finally(() => clearTimeout(timer)).catch(() => {}); }
  }
  async terminate(graceMs = 3_000): Promise<void> {
    if (this.child.exitCode !== null || this.child.killed) return;
    this.killTree(false);
    await Promise.race([this.completion, new Promise((r) => setTimeout(r, graceMs))]);
    if (this.child.exitCode === null) this.killTree(true);
  }
  private killTree(force: boolean) {
    const pid = this.child.pid; if (!pid) return;
    if (process.platform === 'win32') { const killer = nodeSpawn('taskkill', ['/pid', String(pid), '/t', ...(force ? ['/f'] : [])], { stdio: 'ignore', windowsHide: true }); killer.unref(); return; }
    try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { this.child.kill(force ? 'SIGKILL' : 'SIGTERM'); }
  }
}

export class ProcessManager {
  private readonly processes = new Map<string, ManagedProcess>();
  spawn(options: SpawnOptions): ManagedProcess {
    const child = nodeSpawn(options.executable, options.args ?? [], { cwd: options.cwd, env: { ...process.env, ...options.env }, shell: false, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    child.stdin.end();
    const managed = new ManagedProcess(child, options.projectId, options.timeoutMs);
    this.processes.set(managed.id, managed);
    managed.completion.finally(() => this.processes.delete(managed.id)).catch(() => {});
    return managed;
  }
  async terminate(id: string) { await this.processes.get(id)?.terminate(); }
  async terminateByProject(projectId: string) { await Promise.all([...this.processes.values()].filter((p) => p.projectId === projectId).map((p) => p.terminate())); }
  async dispose() { await Promise.all([...this.processes.values()].map((p) => p.terminate())); }
}

export async function captureProcess(manager: ProcessManager, options: SpawnOptions) {
  const process = manager.spawn(options); let stdout = ''; let stderr = '';
  process.on('stdout', (data) => stdout += String(data)); process.on('stderr', (data) => stderr += String(data));
  const result = await process.completion; return { ...result, stdout, stderr };
}
